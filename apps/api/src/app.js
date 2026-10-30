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
  const { cors } = require('hono/cors');
  app.use('*', cors());
  app.use('*', async (c, next) => {
    const multipart = (c.req.header('content-type') || '').startsWith('multipart/form-data');
    return bodyLimit({
      maxSize: multipart ? 64 * 1024 * 1024 : 8 * 1024 * 1024,
      onError: (c) =>
        c.json(
          {
            error: c.req.path.startsWith('/api/admin/menu-sync')
              ? '菜单请求超过大小限制'
              : 'request too large',
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
              error: c.req.path.startsWith('/api/admin/menu-sync')
                ? '菜单设置 JSON 格式无效'
                : 'invalid JSON',
            },
            400,
          );
        }
      }
      return next();
    });
  });

  const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
  const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
  const DB_PATH = path.join(root, 'data.db');
  const db = createDatabase(DB_PATH);
  require('../../../packages/db/src/migrate').migrateDatabase(db, root);
  require('./database')(db);
  const UPLOAD_DIR = path.join(root, 'uploads');
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR);
  }
  const ROLE_WEIGHTS = { developer: 6, super_admin: 5, admin: 4, student: 3, user: 2, guest: 1 };
  const TICKET_VISIBILITIES = ['admin', 'super_admin', 'developer'];
  const BANS_DIR = path.join(UPLOAD_DIR, 'bans');
  if (!fs.existsSync(BANS_DIR)) {
    fs.mkdirSync(BANS_DIR);
  }
  const banUpload = { directory: BANS_DIR, maxBytes: 5 * 1024 * 1024 };
  const { createAuth } = require('./auth');
  const { checkRole, requireLogin } = createAuth(db, JWT_SECRET);
  const PERMISSIONS = {
    banner_edit: '编辑横幅',
    announcement_publish: '发布更新公告',
    student_review: '学生认证审核',
    invite_manage: '邀请码管理',
    map_popup_edit: '地图弹窗编辑',
    user_manage: '用户管理',
    ban_appeal_review: '申诉处理',
    ticket_manage: '工单管理',
    shop_create: '添加店铺',
    title_manage: '头衔管理',
  };
  // 添加店铺的最低角色：默认 student，可用环境变量 SHOP_CREATE_MIN_ROLE 调整
  const SHOP_CREATE_ROLES = ['user', 'student', 'admin', 'super_admin', 'developer'];
  const SHOP_CREATE_MIN_ROLE =
    SHOP_CREATE_ROLES.indexOf(process.env.SHOP_CREATE_MIN_ROLE || '') !== -1
      ? process.env.SHOP_CREATE_MIN_ROLE
      : 'student';
  const PERMISSION_REQUIRES = {
    banner_edit: 'super_admin',
    announcement_publish: 'super_admin',
    student_review: 'super_admin',
    invite_manage: 'super_admin',
    user_manage: 'super_admin',
    ban_appeal_review: 'super_admin',
    map_popup_edit: 'admin',
    ticket_manage: 'admin',
    shop_create: SHOP_CREATE_MIN_ROLE,
    title_manage: 'super_admin',
  };
  function userPermissionList(userId) {
    return query(db, 'SELECT permission FROM user_permissions WHERE user_id = ?')
      .all(userId)
      .map(function (row) {
        return row.permission;
      });
  }
  function hasPermission(c, perm) {
    if (!c.get('user') || c.get('user').id === null || c.get('user').id === undefined) return false;
    // 角色或封禁状态可能在 JWT 签发后发生变化；权限写操作以数据库当前状态为准。
    const account = query(db, 'SELECT role, status FROM users WHERE id = ?').get(c.get('user').id);
    if (!account || account.status !== 'active') return false;
    const needed = ROLE_WEIGHTS[PERMISSION_REQUIRES[perm]] || 0;
    if ((ROLE_WEIGHTS[account.role] || 0) >= needed) return true;
    const row = query(
      db,
      'SELECT id FROM user_permissions WHERE user_id = ? AND permission = ?',
    ).get(c.get('user').id, perm);
    return !!row;
  }
  function isVerifiedStudent(c) {
    if (!c.get('user') || c.get('user').id === null || c.get('user').id === undefined) return false;
    const account = query(db, 'SELECT role, status FROM users WHERE id = ?').get(c.get('user').id);
    if (!account || account.status !== 'active') return false;
    // 学生及以上角色（student / admin / super_admin / developer）均可点赞和评价。
    return (ROLE_WEIGHTS[account.role] || 0) >= ROLE_WEIGHTS.student;
  }
  // 后台针对具体账号的写操作一律遵守：不能操作自己，也不能操作权重不低于自己的人。
  // 与 PUT /api/admin/users/role、/ban、/permissions 的判定保持一致；返回值区分不存在与无权限。
  function checkTarget(actorId, targetId) {
    const target = query(db, 'SELECT role FROM users WHERE id = ?').get(targetId);
    if (!target) return 'missing';
    const actor = query(db, 'SELECT role, status FROM users WHERE id = ?').get(actorId);
    if (!actor || actor.status !== 'active') return 'forbidden';
    if (Number(actorId) === Number(targetId)) return 'forbidden';
    return (ROLE_WEIGHTS[target.role] || 0) < (ROLE_WEIGHTS[actor.role] || 0) ? 'ok' : 'forbidden';
  }
  function requirePermission(perm) {
    return async (c, next) => {
      return checkRole()(c, async () => {
        if (c.get('user').id == null) return c.json({ error: 'login required' }, 401);
        if (!hasPermission(c, perm)) return c.json({ error: 'forbidden' }, 403);
        return next();
      });
    };
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
  const menuService = new MenuService(db, root);
  dishStore.migrate(db);
  mountDishRoutes(app, db, attachAuthors);
  mountMenuRoutes(app, db, menuService, checkRole());
  mountShopRoutes(app, db, {
    root: root,
    authenticate: checkRole(),
    requirePermission: requirePermission,
    hasPermission: hasPermission,
    isVerifiedStudent: isVerifiedStudent,
    createMinRole: SHOP_CREATE_MIN_ROLE,
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
  require('./routes/session')(app, {
    db,
    JWT_SECRET,
    JWT_EXPIRES_IN,
    recordLogin,
    checkRole,
    userPermissionList,
    requirePermission,
  });
  require('./routes/announcements')(app, { requirePermission, db });
  require('./routes/verification')(app, { requireLogin, db, ROLE_WEIGHTS, requirePermission });
  require('./routes/accounts-admin')(app, {
    requirePermission,
    db,
    userPermissionList,
    PERMISSIONS,
    ROLE_WEIGHTS,
    banUpload,
  });
  require('./routes/tickets')(app, {
    requireLogin,
    TICKET_VISIBILITIES,
    db,
    requirePermission,
    ROLE_WEIGHTS,
    hasPermission,
  });
  require('./routes/profile')(app, { requireLogin, db, userPermissionList, UPLOAD_DIR });
  require('./routes/recipes')(app, {
    db,
    requireLogin,
    UPLOAD_DIR,
    requirePermission,
    ROLE_WEIGHTS,
  });
  require('./routes/map')(app, { root, requirePermission });
  require('./routes/messages')(app, { requireLogin, db, requirePermission });
  return { app, db, menuService };
};
