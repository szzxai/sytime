const { Hono } = require('hono');
const path = require('path');
const fs = require('fs');

const { createDatabase, query } = require('../../../packages/db/src/client.ts');
const { MenuService } = require('./domain/menu/service');
const { mountMenuRoutes } = require('./domain/menu/routes');
const dishStore = require('./domain/dishes/store');
const { mountDishRoutes } = require('./domain/dishes/routes');

const { mountShopRoutes } = require('./domain/shops/routes');
const { equippedTitleMap } = require('./domain/titles/store');
const { mountTitleRoutes } = require('./domain/titles/routes');
const { evaluateAutoTitles } = require('./domain/titles/rules');

const { mountCollectionRoutes } = require('./domain/collections/routes');
const { localDay, shiftDay } = require('./domain/menu/schedule');
module.exports = function createApp(root) {
  const app = new Hono();
  const { bodyLimit } = require('hono/body-limit');
  app.use('/api/*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    c.header('X-Content-Type-Options', 'nosniff');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
      const origin = c.req.header('Origin');
      const allowed = new URL(process.env.APP_ORIGIN || c.req.url).origin;
      if (
        c.req.header('Sec-Fetch-Site') === 'cross-site' ||
        (origin &&
          origin !== allowed &&
          !(
            process.env.NODE_ENV !== 'production' &&
            /^http:\/\/(localhost|127\.0\.0\.1):[0-9]+$/.test(origin)
          ))
      )
        return c.json({ error: '请求来源不受信任' }, 403);
    }
    return next();
  });
  app.use('*', async (c, next) => {
    const multipart = (c.req.header('content-type') || '').startsWith('multipart/form-data');
    return bodyLimit({
      maxSize: multipart ? 64 * 1024 * 1024 : 8 * 1024 * 1024,
      onError: (c) =>
        c.json(
          {
            error: 'request too large',
          },
          413,
        ),
    })(c, async () => {
      if ((c.req.header('content-type') || '').includes('application/json')) {
        try {
          c.set('body', await c.req.json());
        } catch {
          return c.json(
            {
              error: 'invalid JSON',
            },
            400,
          );
        }
      }
      return next();
    });
  });

  const privateDir = path.join(root, '.private');
  fs.mkdirSync(privateDir, { recursive: true, mode: 0o700 });
  const secretPath = path.join(privateDir, 'session-secret');
  if (!process.env.JWT_SECRET && !fs.existsSync(secretPath))
    fs.writeFileSync(secretPath, require('node:crypto').randomBytes(48).toString('hex'), {
      mode: 0o600,
      flag: 'wx',
    });
  const JWT_SECRET = process.env.JWT_SECRET || fs.readFileSync(secretPath, 'utf8');
  const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
  const DB_PATH = path.join(root, 'data.db');
  const db = createDatabase(DB_PATH);
  require('../../../packages/db/src/migrate').migrateDatabase(db, root);
  require('./database')(db);
  require('./domain/accounts/migrate')(db);
  const UPLOAD_DIR = path.join(root, 'uploads');
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR);
  }
  const { roleWeights: ROLE_WEIGHTS } = require('../../../packages/shared/src/index.ts');
  const { createAuth } = require('./auth');
  const { checkRole, requireLogin } = createAuth(db, JWT_SECRET);
  const permissions = new Set([
    'banner_edit',
    'announcement_publish',
    'student_review',
    'user_manage',
    'ban_appeal_review',
    'ticket_manage',
    'title_manage',
  ]);
  function requirePermission(perm) {
    return async (c, next) =>
      checkRole('admin')(c, async () => {
        if (!permissions.has(perm)) return c.json({ error: 'forbidden' }, 403);
        return next();
      });
  }
  function isVerifiedStudent(c) {
    return (ROLE_WEIGHTS[c.get('user')?.role] || 0) >= ROLE_WEIGHTS.student;
  }
  function checkTarget(actorId, targetId) {
    try {
      const actor = query(db, 'SELECT id,role,status FROM users WHERE id=?').get(actorId);
      if (actor?.status !== 'active') return 'forbidden';
      require('./domain/accounts/security').target(db, actor, targetId);
      return 'ok';
    } catch (e) {
      return e.status === 404 ? 'missing' : 'forbidden';
    }
  }
  // 连续登录按北京时间自然日累计，用于「夜读星」自动头衔；登录成功后顺带发放已达成的自动头衔。
  function recordLogin(userId) {
    const today = localDay(Date.now());
    const row = query(db, 'SELECT last_login_date, login_streak FROM users WHERE id = ?').get(
      userId,
    );
    if (row) {
      const last = row.last_login_date || '';
      const previous = row.login_streak || 0;
      const streak =
        last === today ? Math.max(previous, 1) : last === shiftDay(today, -1) ? previous + 1 : 1;
      query(db, 'UPDATE users SET last_login_date = ?, login_streak = ? WHERE id = ?').run(
        today,
        streak,
        userId,
      );
    }
    // 逐日登录历史供「闲者爱上网」按周末统计；同一自然日只记一条
    query(db, 'INSERT OR IGNORE INTO user_login_days (user_id, day) VALUES (?, ?)').run(
      userId,
      today,
    );
    return evaluateAutoTitles(db, userId);
  }
  // 为菜品评价补充作者资料、权限标签与佩戴头衔。
  function attachAuthors(rows, key) {
    const column = key || 'user_id';
    const ids = [];
    rows.forEach(function (row) {
      const id = row[column];
      if (id !== null && id !== undefined && ids.indexOf(id) === -1) ids.push(id);
    });
    if (!ids.length) return rows;
    const placeholders = ids
      .map(function () {
        return '?';
      })
      .join(',');
    const accounts = new Map();
    query(
      db,
      'SELECT id, nickname, avatar_url, role, show_role FROM users WHERE id IN (' +
        placeholders +
        ')',
    )
      .all(...ids)
      .forEach(function (account) {
        accounts.set(account.id, account);
      });
    const titles = equippedTitleMap(db, ids);
    rows.forEach(function (row) {
      const account = accounts.get(row[column]);
      row.nickname = account ? account.nickname || '' : '';
      row.avatar_url = account ? account.avatar_url || '' : '';
      row.role = account ? account.role : '';
      row.show_role =
        account && account.show_role !== null && account.show_role !== undefined
          ? account.show_role
          : 1;
      row.user_title = titles.get(row[column]) || null;
    });
    return rows;
  }
  app.use('/api/admin/*', async (c, next) => {
    await next();
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(c.req.method) &&
      c.res.status < 400 &&
      c.get('user')?.id &&
      !c.req.path.includes('/reviews/') &&
      !c.req.path.includes('/users/') &&
      !c.req.path.includes('/tickets/')
    )
      require('./domain/accounts/security').audit(
        db,
        c.get('user').id,
        null,
        'management.changed',
        { method: c.req.method, path: c.req.path },
      );
  });
  const menuService = new MenuService(db, root);
  dishStore.migrate(db);
  mountDishRoutes(app, db, attachAuthors);
  mountMenuRoutes(app, db);
  const { moderation } = require('./domain/accounts/routes')(app, {
    db,
    root,
    JWT_SECRET,
    JWT_EXPIRES_IN,
    checkRole,
    requireLogin,
    recordLogin,
  });
  mountShopRoutes(app, db, {
    root: root,
    authenticate: checkRole(),
    requirePermission: () => checkRole('student'),
    moderation,
    hasPermission: (c, perm) => perm === 'shop_create' && isVerifiedStudent(c),
    isVerifiedStudent: isVerifiedStudent,
    createMinRole: 'student',
    mapKey: process.env.AMAP_JS_KEY || '',
    mapSecurityCode: process.env.AMAP_SECURITY_CODE || '',
    mapServiceKey: process.env.AMAP_SERVICE_KEY || '',
    // 新增店铺后立刻评估「累计推荐」自动头衔
    onCreated: function (userId) {
      evaluateAutoTitles(db, userId);
    },
  });
  // 头衔系统（#10）
  mountTitleRoutes(app, db, {
    authenticate: checkRole(),
    requirePermission: requirePermission,
    checkTarget: checkTarget,
  });
  // 收藏夹（#23）
  mountCollectionRoutes(app, db, {
    requireLogin: requireLogin,
    authenticate: checkRole(),
  });
  require('./routes/announcements')(app, { requirePermission, db });
  require('./routes/tickets')(app, { requireLogin, checkRole, db });
  require('./routes/profile')(app, { requireLogin, db, UPLOAD_DIR });
  require('./routes/recipes')(app, {
    db,
    requireLogin,
    UPLOAD_DIR,
    requirePermission,
    ROLE_WEIGHTS,
  });
  require('./routes/map')(app, { root });
  require('./routes/messages')(app, { requireLogin, db, requirePermission });
  app.notFound((c) => c.json({ error: 'not found' }, 404));
  return { app, db, menuService };
};
