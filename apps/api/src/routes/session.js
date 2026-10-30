const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const { query } = require('../../../../packages/db/src/client.ts');

module.exports = function mountSessionRoutes(app, services) {
  const {
    db,
    JWT_SECRET,
    JWT_EXPIRES_IN,
    recordLogin,
    checkRole,
    userPermissionList,
    requirePermission,
  } = services;
  app.post('/api/register', function (c) {
    const body = c.get('body') || {};
    const username = body.username;
    const nickname = body.nickname;
    const password = body.password;
    if (!username || !nickname || !password) {
      c.res = c.json({ error: 'username, nickname and password are required' }, 400);
      return;
    }
    const exists = query(db, 'SELECT id FROM users WHERE username = ?').get(username);
    if (exists) {
      c.res = c.json({ error: 'username already exists' }, 409);
      return;
    }
    const count = query(db, 'SELECT COUNT(*) AS n FROM users').get().n;
    const role = Number(count) === 0 ? 'developer' : 'user';
    const passwordHash = bcrypt.hashSync(password, 10);
    const info = query(
      db,
      "INSERT INTO users (username, nickname, password_hash, role, avatar_url, recipe_default_view) VALUES (?, ?, ?, ?, '', 'daily')",
    ).run(username, nickname, passwordHash, role);
    const newId = Number(info.lastInsertRowid);
    const displayId = String(newId);
    query(db, 'UPDATE users SET display_id = ? WHERE id = ?').run(displayId, newId);
    c.res = c.json(
      {
        id: newId,
        display_id: displayId,
        username: username,
        nickname: nickname,
        role: role,
      },
      201,
    );
  });
  app.post('/api/login', function (c) {
    const body = c.get('body') || {};
    const username = body.username;
    const password = body.password;
    if (!username || !password) {
      c.res = c.json({ error: 'username and password are required' }, 400);
      return;
    }
    const user = query(db, 'SELECT * FROM users WHERE username = ?').get(username);
    if (!user || !user.password_hash || !bcrypt.compareSync(password, user.password_hash)) {
      c.res = c.json({ error: 'invalid username or password' }, 401);
      return;
    }
    if (user.status === 'banned') {
      c.res = c.json(
        {
          error: 'banned',
          ban_reason: user.ban_reason || '',
          allow_appeal: Number(user.allow_appeal) === 1 ? 1 : 0,
        },
        403,
      );
      return;
    }
    const token = jwt.sign({ id: user.id, role: user.role, username: user.username }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    });
    const grantedTitles = recordLogin(user.id);
    c.res = c.json({
      token: token,
      user: { id: user.id, username: user.username, nickname: user.nickname, role: user.role },
      granted_titles: grantedTitles,
    });
  });
  app.get('/api/me', checkRole(), function (c) {
    const perms =
      c.get('user') && c.get('user').id !== null && c.get('user').id !== undefined
        ? userPermissionList(c.get('user').id)
        : [];
    c.res = c.json({ user: Object.assign({}, c.get('user'), { permissions: perms }) });
  });
  app.get('/api/admin/ping', checkRole('super_admin'), function (c) {
    c.res = c.json({ ok: true, user: c.get('user') });
  });
  app.post('/api/user/appeal', function (c) {
    const body = c.get('body') || {};
    const username = body.username;
    const appealReason = body.appeal_reason;
    const appealImage = body.appeal_image ? String(body.appeal_image) : '';
    if (!username || !appealReason) {
      c.res = c.json({ error: 'username and appeal_reason are required' }, 400);
      return;
    }
    const user = query(db, 'SELECT id, status FROM users WHERE username = ?').get(username);
    if (!user) {
      c.res = c.json({ error: 'user not found' }, 404);
      return;
    }
    if (user.status !== 'banned') {
      c.res = c.json({ error: 'user is not banned' }, 400);
      return;
    }
    const now = Math.floor(Date.now() / 1000);
    const lastAppeal = query(
      db,
      'SELECT created_at FROM ban_appeals WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 1',
    ).get(user.id);
    if (lastAppeal && now - Number(lastAppeal.created_at) < 600) {
      c.res = c.json(
        {
          error: 'rate_limited',
          message: '10 分钟内只能提交一次，请稍后再试',
          retry_after: 600 - (now - Number(lastAppeal.created_at)),
        },
        429,
      );
      return;
    }
    query(db, 'DELETE FROM ban_appeals WHERE user_id = ?').run(user.id);
    const info = query(
      db,
      "INSERT INTO ban_appeals (user_id, appeal_reason, appeal_image, status) VALUES (?, ?, ?, 'pending')",
    ).run(user.id, String(appealReason), appealImage);
    c.res = c.json({ id: Number(info.lastInsertRowid), status: 'pending' }, 201);
  });
  app.get('/api/admin/ban-appeals', requirePermission('ban_appeal_review'), function (c) {
    const rows = query(
      db,
      "SELECT a.*, u.username, u.display_id FROM ban_appeals a LEFT JOIN users u ON u.id = a.user_id WHERE a.status = 'pending' ORDER BY a.created_at DESC, a.id DESC",
    ).all();
    c.res = c.json({ appeals: rows });
  });
  app.put('/api/admin/ban-appeals/review', requirePermission('ban_appeal_review'), function (c) {
    const body = c.get('body') || {};
    const appealId = parseInt(body.appealId, 10);
    const action = body.action;
    if (isNaN(appealId) || (action !== 'approve' && action !== 'reject')) {
      c.res = c.json({ error: 'appealId and action (approve/reject) are required' }, 400);
      return;
    }
    const appeal = query(db, 'SELECT * FROM ban_appeals WHERE id = ?').get(appealId);
    if (!appeal) {
      c.res = c.json({ error: 'appeal not found' }, 404);
      return;
    }
    if (action === 'approve') {
      query(db, "UPDATE ban_appeals SET status = 'approved' WHERE id = ?").run(appealId);
      query(
        db,
        "UPDATE users SET status = 'active', ban_reason = '', ban_image = '', allow_appeal = 1 WHERE id = ?",
      ).run(appeal.user_id);
      c.res = c.json({ ok: true, status: 'approved' });
      return;
    }
    query(db, "UPDATE ban_appeals SET status = 'rejected' WHERE id = ?").run(appealId);
    c.res = c.json({ ok: true, status: 'rejected' });
  });
};
