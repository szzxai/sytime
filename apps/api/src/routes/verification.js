const { query } = require('../../../../packages/db/src/client.ts');

module.exports = function mountVerificationRoutes(app, services) {
  const { requireLogin, db, ROLE_WEIGHTS, requirePermission } = services;
  app.post('/api/student/apply', requireLogin, function (c) {
    const body = c.get('body') || {};
    const studentId = body.student_id;
    const className = body.class_name;
    const realName = body.real_name;
    const inviteCode = body.invite_code ? String(body.invite_code) : '';
    const extraInfo = body.extra_info ? String(body.extra_info) : null;
    if (!studentId || !className || !realName) {
      c.res = c.json({ error: 'student_id, class_name and real_name are required' }, 400);
      return;
    }
    let approved = false;
    if (inviteCode) {
      const invite = query(db, 'SELECT * FROM invite_codes WHERE code = ?').get(inviteCode);
      if (invite && (invite.max_uses <= 0 || invite.used_count < invite.max_uses)) {
        query(db, 'UPDATE invite_codes SET used_count = used_count + 1 WHERE id = ?').run(
          invite.id,
        );
        approved = true;
      }
    }
    if (!approved && inviteCode) {
      const row = query(db, "SELECT value FROM settings WHERE key = 'student_invite_code'").get();
      const expected = row && row.value ? row.value : '';
      if (expected && inviteCode === expected) approved = true;
    }
    if (approved) {
      const info = query(db, 'SELECT role FROM users WHERE id = ?').get(c.get('user').id);
      const currentWeight = ROLE_WEIGHTS[info ? info.role : 'user'] || 0;
      if (currentWeight < ROLE_WEIGHTS.student) {
        query(db, "UPDATE users SET role = 'student' WHERE id = ?").run(c.get('user').id);
      }
      c.res = c.json({ status: 'approved', role: 'student' });
      return;
    }
    const now = Math.floor(Date.now() / 1000);
    const lastApplication = query(
      db,
      'SELECT created_at FROM student_applications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 1',
    ).get(c.get('user').id);
    if (lastApplication && now - Number(lastApplication.created_at) < 600) {
      c.res = c.json(
        {
          error: 'rate_limited',
          message: '10 分钟内只能提交一次，请稍后再试',
          retry_after: 600 - (now - Number(lastApplication.created_at)),
        },
        429,
      );
      return;
    }
    query(db, 'DELETE FROM student_applications WHERE user_id = ?').run(c.get('user').id);
    query(
      db,
      "INSERT INTO student_applications (user_id, student_id, class_name, real_name, extra_info, status) VALUES (?, ?, ?, ?, ?, 'pending')",
    ).run(c.get('user').id, studentId, className, realName, extraInfo);
    c.res = c.json({ status: 'pending' });
  });
  app.get('/api/admin/settings/invite-code', requirePermission('invite_manage'), function (c) {
    const row = query(db, "SELECT value FROM settings WHERE key = 'student_invite_code'").get();
    c.res = c.json({ invite_code: row && row.value ? row.value : '' });
  });
  app.put('/api/admin/settings/invite-code', requirePermission('invite_manage'), function (c) {
    const body = c.get('body') || {};
    let value = null;
    if (body.invite_code !== undefined) value = body.invite_code;
    else if (body.value !== undefined) value = body.value;
    if (value === null) {
      c.res = c.json({ error: 'invite_code is required' }, 400);
      return;
    }
    value = String(value);
    query(
      db,
      "INSERT INTO settings (key, value) VALUES ('student_invite_code', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).run(value);
    c.res = c.json({ invite_code: value });
  });
  app.get('/api/admin/invite-codes', requirePermission('invite_manage'), function (c) {
    const rows = query(db, 'SELECT * FROM invite_codes ORDER BY created_at DESC, id DESC').all();
    c.res = c.json({ invite_codes: rows });
  });
  app.post('/api/admin/invite-codes', requirePermission('invite_manage'), function (c) {
    const body = c.get('body') || {};
    const code = body.code === undefined || body.code === null ? '' : String(body.code).trim();
    let maxUses = parseInt(body.max_uses, 10);
    if (isNaN(maxUses) || maxUses < 0) maxUses = 0;
    if (!code) {
      c.res = c.json({ error: 'code is required' }, 400);
      return;
    }
    const exists = query(db, 'SELECT id FROM invite_codes WHERE code = ?').get(code);
    if (exists) {
      c.res = c.json({ error: 'code already exists' }, 409);
      return;
    }
    const info = query(db, 'INSERT INTO invite_codes (code, max_uses) VALUES (?, ?)').run(
      code,
      maxUses,
    );
    const row = query(db, 'SELECT * FROM invite_codes WHERE id = ?').get(
      Number(info.lastInsertRowid),
    );
    c.res = c.json({ invite_code: row }, 201);
  });
  app.delete('/api/admin/invite-codes/:id', requirePermission('invite_manage'), function (c) {
    const id = parseInt(c.req.param().id, 10);
    if (isNaN(id)) {
      c.res = c.json({ error: 'invalid id' }, 400);
      return;
    }
    const info = query(db, 'DELETE FROM invite_codes WHERE id = ?').run(id);
    c.res = c.json({ deleted: info.changes });
  });
  app.get('/api/admin/student-applications', requirePermission('student_review'), function (c) {
    const rows = query(
      db,
      "SELECT a.*, u.username FROM student_applications a LEFT JOIN users u ON u.id = a.user_id WHERE a.status = 'pending' ORDER BY a.created_at DESC, a.id DESC",
    ).all();
    c.res = c.json({ applications: rows });
  });
  app.put(
    '/api/admin/student-applications/approve',
    requirePermission('student_review'),
    function (c) {
      const id = parseInt((c.get('body') || {}).id, 10);
      if (isNaN(id)) {
        c.res = c.json({ error: 'id is required' }, 400);
        return;
      }
      const application = query(db, 'SELECT * FROM student_applications WHERE id = ?').get(id);
      if (!application) {
        c.res = c.json({ error: 'application not found' }, 404);
        return;
      }
      query(db, "UPDATE student_applications SET status = 'approved' WHERE id = ?").run(id);
      const user = query(db, 'SELECT role FROM users WHERE id = ?').get(application.user_id);
      if (user && (ROLE_WEIGHTS[user.role] || 0) < ROLE_WEIGHTS.student) {
        query(db, "UPDATE users SET role = 'student' WHERE id = ?").run(application.user_id);
      }
      c.res = c.json({ ok: true });
    },
  );
  app.put(
    '/api/admin/student-applications/reject',
    requirePermission('student_review'),
    function (c) {
      const body = c.get('body') || {};
      const id = parseInt(body.id, 10);
      if (isNaN(id)) {
        c.res = c.json({ error: 'id is required' }, 400);
        return;
      }
      const application = query(db, 'SELECT * FROM student_applications WHERE id = ?').get(id);
      if (!application) {
        c.res = c.json({ error: 'application not found' }, 404);
        return;
      }
      const reason = body.reason === undefined || body.reason === null ? '' : String(body.reason);
      query(
        db,
        "UPDATE student_applications SET status = 'rejected', reject_reason = ? WHERE id = ?",
      ).run(reason, id);
      c.res = c.json({ ok: true });
    },
  );
};
