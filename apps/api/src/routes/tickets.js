const { query } = require('../../../../packages/db/src/client.ts');

module.exports = function mountTicketsRoutes(app, services) {
  const { requireLogin, TICKET_VISIBILITIES, db, requirePermission, ROLE_WEIGHTS, hasPermission } =
    services;
  app.post('/api/tickets', requireLogin, function (c) {
    const body = c.get('body') || {};
    const title = body.title === undefined || body.title === null ? '' : String(body.title).trim();
    const content =
      body.content === undefined || body.content === null ? '' : String(body.content).trim();
    let visibility = body.visibility;
    if (TICKET_VISIBILITIES.indexOf(visibility) === -1) visibility = 'admin';
    if (!title || !content) {
      c.res = c.json({ error: 'title and content are required' }, 400);
      return;
    }
    const info = query(
      db,
      "INSERT INTO tickets (user_id, username, title, content, visibility, status) VALUES (?, ?, ?, ?, ?, 'pending')",
    ).run(c.get('user').id, c.get('user').username || '', title, content, visibility);
    c.res = c.json({ ticket: { id: Number(info.lastInsertRowid), status: 'pending' } }, 201);
  });
  app.get('/api/tickets/mine', requireLogin, function (c) {
    const rows = query(
      db,
      'SELECT id, title, content, visibility, status, reply_content, reply_image, reply_by, replied_at, created_at FROM tickets WHERE user_id = ? ORDER BY created_at DESC, id DESC',
    ).all(c.get('user').id);
    c.res = c.json({ tickets: rows });
  });
  app.get('/api/admin/tickets', requirePermission('ticket_manage'), function (c) {
    const reviewerWeight = ROLE_WEIGHTS[c.get('user').role] || 0;
    const allowed = TICKET_VISIBILITIES.filter(function (v) {
      return (ROLE_WEIGHTS[v] || 0) <= reviewerWeight;
    });
    const rows = query(
      db,
      "SELECT * FROM tickets ORDER BY (status = 'pending') DESC, created_at DESC, id DESC",
    ).all();
    const visible = rows.filter(function (t) {
      return allowed.indexOf(t.visibility) !== -1;
    });
    c.res = c.json({ tickets: visible });
  });
  app.put('/api/admin/tickets/reply', requirePermission('ticket_manage'), function (c) {
    const body = c.get('body') || {};
    const id = parseInt(body.id, 10);
    const reply = body.reply === undefined || body.reply === null ? '' : String(body.reply).trim();
    const replyImage = body.reply_image ? String(body.reply_image) : '';
    if (isNaN(id) || !reply) {
      c.res = c.json({ error: 'id and reply are required' }, 400);
      return;
    }
    const ticket = query(db, 'SELECT * FROM tickets WHERE id = ?').get(id);
    if (!ticket) {
      c.res = c.json({ error: 'ticket not found' }, 404);
      return;
    }
    const reviewerWeight = ROLE_WEIGHTS[c.get('user').role] || 0;
    if ((ROLE_WEIGHTS[ticket.visibility] || 0) > reviewerWeight) {
      c.res = c.json({ error: 'forbidden' }, 403);
      return;
    }
    query(
      db,
      "UPDATE tickets SET status = 'resolved', reply_content = ?, reply_image = ?, reply_by = ?, replied_at = ? WHERE id = ?",
    ).run(reply, replyImage, c.get('user').username || '', Math.floor(Date.now() / 1000), id);
    c.res = c.json({ ok: true, id: id, status: 'resolved' });
  });
  app.get('/api/admin/pending-counts', requireLogin, function (c) {
    const counts = { student_review: 0, ban_appeal_review: 0, ticket_manage: 0 };
    if (hasPermission(c, 'student_review')) {
      counts.student_review = Number(
        query(db, "SELECT COUNT(*) AS n FROM student_applications WHERE status = 'pending'").get()
          .n,
      );
    }
    if (hasPermission(c, 'ban_appeal_review')) {
      counts.ban_appeal_review = Number(
        query(db, "SELECT COUNT(*) AS n FROM ban_appeals WHERE status = 'pending'").get().n,
      );
    }
    if (hasPermission(c, 'ticket_manage')) {
      const reviewerWeight = ROLE_WEIGHTS[c.get('user').role] || 0;
      const allowed = TICKET_VISIBILITIES.filter(function (v) {
        return (ROLE_WEIGHTS[v] || 0) <= reviewerWeight;
      });
      const rows = query(db, "SELECT visibility FROM tickets WHERE status = 'pending'").all();
      counts.ticket_manage = rows.filter(function (t) {
        return allowed.indexOf(t.visibility) !== -1;
      }).length;
    }
    c.res = c.json({ counts: counts });
  });
};
