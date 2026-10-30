const { withUpload } = require('../upload');
const { query } = require('../../../../packages/db/src/client.ts');

const { equippedTitleMap, titlesByUserMap } = require('../domain/titles/store');

module.exports = function mountAccountsAdminRoutes(app, services) {
  const { requirePermission, db, userPermissionList, PERMISSIONS, ROLE_WEIGHTS, banUpload } =
    services;
  app.get('/api/admin/users', requirePermission('user_manage'), function (c) {
    const rows = query(
      db,
      'SELECT id, display_id, username, nickname, role, status FROM users ORDER BY id ASC',
    ).all();
    const titles = titlesByUserMap(
      db,
      rows.map(function (u) {
        return u.id;
      }),
    );
    const equipped = equippedTitleMap(
      db,
      rows.map(function (u) {
        return u.id;
      }),
    );
    const users = rows.map(function (u) {
      return Object.assign({}, u, {
        permissions: userPermissionList(u.id),
        titles: titles.get(u.id) || [],
        title: equipped.get(u.id) || null,
      });
    });
    c.res = c.json({ users: users });
  });
  app.get('/api/admin/users/:id', requirePermission('user_manage'), function (c) {
    const id = parseInt(c.req.param().id, 10);
    if (isNaN(id)) {
      c.res = c.json({ error: 'user not found' }, 404);
      return;
    }
    const u = query(
      db,
      'SELECT id, display_id, username, nickname, role, status FROM users WHERE id = ?',
    ).get(id);
    if (!u) {
      c.res = c.json({ error: 'user not found' }, 404);
      return;
    }
    c.res = c.json({
      user: Object.assign({}, u, {
        permissions: userPermissionList(id),
        titles: titlesByUserMap(db, [id]).get(id) || [],
        title: equippedTitleMap(db, [id]).get(id) || null,
      }),
    });
  });
  app.get('/api/admin/permissions', requirePermission('user_manage'), function (c) {
    const list = Object.keys(PERMISSIONS).map(function (key) {
      return { key: key, label: PERMISSIONS[key] };
    });
    c.res = c.json({ permissions: list });
  });
  app.put('/api/admin/users/role', requirePermission('user_manage'), function (c) {
    const body = c.get('body') || {};
    const userId = parseInt(body.userId, 10);
    const newRole = body.newRole;
    if (isNaN(userId) || !newRole || ROLE_WEIGHTS[newRole] === undefined || newRole === 'guest') {
      c.res = c.json({ error: 'userId and a valid newRole are required' }, 400);
      return;
    }
    const selfWeight = ROLE_WEIGHTS[c.get('user').role] || 0;
    if (userId === c.get('user').id) {
      c.res = c.json({ error: 'cannot change your own role' }, 403);
      return;
    }
    const target = query(db, 'SELECT id, role FROM users WHERE id = ?').get(userId);
    if (!target) {
      c.res = c.json({ error: 'user not found' }, 404);
      return;
    }
    const targetWeight = ROLE_WEIGHTS[target.role] || 0;
    if (targetWeight >= selfWeight) {
      c.res = c.json({ error: 'cannot modify a user with equal or higher role' }, 403);
      return;
    }
    const newWeight = ROLE_WEIGHTS[newRole];
    if (newWeight < ROLE_WEIGHTS.user || newWeight > selfWeight - 1) {
      c.res = c.json({ error: 'new role out of allowed range' }, 403);
      return;
    }
    query(db, 'UPDATE users SET role = ? WHERE id = ?').run(newRole, userId);
    c.res = c.json({ ok: true, id: userId, role: newRole });
  });
  app.put('/api/admin/users/ban', requirePermission('user_manage'), async function (c) {
    return withUpload(c, banUpload, 'ban_image', function (err) {
      if (err) {
        c.res = c.json({ error: err.message }, 400);
        return;
      }
      const body = c.get('body') || {};
      const userId = parseInt(body.userId, 10);
      if (isNaN(userId)) {
        c.res = c.json({ error: 'userId is required' }, 400);
        return;
      }
      const selfWeight = ROLE_WEIGHTS[c.get('user').role] || 0;
      if (userId === c.get('user').id) {
        c.res = c.json({ error: 'cannot ban yourself' }, 403);
        return;
      }
      const target = query(db, 'SELECT id, role FROM users WHERE id = ?').get(userId);
      if (!target) {
        c.res = c.json({ error: 'user not found' }, 404);
        return;
      }
      if ((ROLE_WEIGHTS[target.role] || 0) >= selfWeight) {
        c.res = c.json({ error: 'cannot ban a user with equal or higher role' }, 403);
        return;
      }
      const banReason =
        body.ban_reason === undefined || body.ban_reason === null ? '' : String(body.ban_reason);
      let allowAppeal = 1;
      if (body.allow_appeal !== undefined) {
        allowAppeal =
          body.allow_appeal === '0' || body.allow_appeal === 0 || body.allow_appeal === false
            ? 0
            : 1;
      }
      const banImage = c.get('file')
        ? '/uploads/bans/' + c.get('file').filename
        : body.ban_image
          ? String(body.ban_image)
          : '';
      query(
        db,
        "UPDATE users SET status = 'banned', ban_reason = ?, ban_image = ?, allow_appeal = ? WHERE id = ?",
      ).run(banReason, banImage, allowAppeal, userId);
      c.res = c.json({
        ok: true,
        id: userId,
        status: 'banned',
        ban_reason: banReason,
        ban_image: banImage,
        allow_appeal: allowAppeal,
      });
    });
  });
  app.put('/api/admin/users/unban', requirePermission('user_manage'), function (c) {
    const userId = parseInt((c.get('body') || {}).userId, 10);
    if (isNaN(userId)) {
      c.res = c.json({ error: 'userId is required' }, 400);
      return;
    }
    const target = query(db, 'SELECT id FROM users WHERE id = ?').get(userId);
    if (!target) {
      c.res = c.json({ error: 'user not found' }, 404);
      return;
    }
    query(
      db,
      "UPDATE users SET status = 'active', ban_reason = '', ban_image = '', allow_appeal = 1 WHERE id = ?",
    ).run(userId);
    c.res = c.json({ ok: true, id: userId, status: 'active' });
  });
  app.put('/api/admin/users/permissions', requirePermission('user_manage'), function (c) {
    const body = c.get('body') || {};
    const userId = parseInt(body.userId, 10);
    if (isNaN(userId)) {
      c.res = c.json({ error: 'userId is required' }, 400);
      return;
    }
    const selfWeight = ROLE_WEIGHTS[c.get('user').role] || 0;
    const target = query(db, 'SELECT id, role FROM users WHERE id = ?').get(userId);
    if (!target) {
      c.res = c.json({ error: 'user not found' }, 404);
      return;
    }
    if (userId === c.get('user').id || (ROLE_WEIGHTS[target.role] || 0) >= selfWeight) {
      c.res = c.json({ error: 'cannot modify this user' }, 403);
      return;
    }
    let perms = body.permissions;
    if (!Array.isArray(perms)) perms = [];
    perms = perms.filter(function (p) {
      return Object.prototype.hasOwnProperty.call(PERMISSIONS, p);
    });
    query(db, 'DELETE FROM user_permissions WHERE user_id = ?').run(userId);
    const stmt = query(
      db,
      'INSERT OR IGNORE INTO user_permissions (user_id, permission) VALUES (?, ?)',
    );
    perms.forEach(function (p) {
      stmt.run(userId, p);
    });
    c.res = c.json({ ok: true, permissions: userPermissionList(userId) });
  });
};
