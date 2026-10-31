const { query } = require('../../../../packages/db/src/client.ts');
const { syncHandledNotifications, messageTarget } = require('../domain/accounts/notifications');

module.exports = function mountMessagesRoutes(app, services) {
  const { requireLogin, db, requirePermission } = services;
  app.get('/api/messages/unread-count', requireLogin, function (c) {
    syncHandledNotifications(db, c.get('user').id);
    const row = query(
      db,
      'SELECT COUNT(*) AS n FROM messages WHERE user_id = ? AND read_at IS NULL',
    ).get(c.get('user').id);
    c.res = c.json({ count: Number(row.n) });
  });
  app.put('/api/messages/read-all', requireLogin, function (c) {
    const info = query(
      db,
      'UPDATE messages SET read_at = ? WHERE user_id = ? AND read_at IS NULL',
    ).run(Math.floor(Date.now() / 1000), c.get('user').id);
    c.res = c.json({ ok: true, changed: info.changes });
  });
  app.put('/api/messages/:id/read', requireLogin, function (c) {
    const id = parseInt(c.req.param().id, 10);
    if (isNaN(id)) {
      c.res = c.json({ error: 'invalid message id' }, 400);
      return;
    }
    const info = query(
      db,
      'UPDATE messages SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL',
    ).run(Math.floor(Date.now() / 1000), id, c.get('user').id);
    c.res = c.json({ ok: true, changed: info.changes });
  });
  app.get('/api/messages', requireLogin, function (c) {
    syncHandledNotifications(db, c.get('user').id);
    const pageSize = Math.min(50, Math.max(1, parseInt(c.req.query().page_size, 10) || 20));
    const type = c.req.query().type;
    const unreadOnly = c.req.query().unread === '1' || c.req.query().unread === 'true';
    const before = parseInt(c.req.query().before, 10);
    const clauses = ['m.user_id = ?'];
    const params = [c.get('user').id];
    const typeList = type === 'system' ? [type] : null;
    if (typeList) {
      clauses.push(
        'm.type IN (' +
          typeList
            .map(function () {
              return '?';
            })
            .join(',') +
          ')',
      );
      typeList.forEach(function (t) {
        params.push(t);
      });
    }
    if (unreadOnly) clauses.push('m.read_at IS NULL');
    if (!isNaN(before)) {
      clauses.push('m.id < ?');
      params.push(before);
    }
    const sql =
      'SELECT m.* FROM messages m WHERE ' +
      clauses.join(' AND ') +
      ' ORDER BY m.created_at DESC, m.id DESC LIMIT ?';
    params.push(pageSize + 1);
    const rows = query(db, sql).all(...params);
    const hasMore = rows.length > pageSize;
    const messages = rows.slice(0, pageSize).map(function (m) {
      let actors;
      try {
        actors = JSON.parse(m.actors) || [];
      } catch (e) {
        actors = [];
      }
      return {
        id: m.id,
        type: m.type,
        actors: actors,
        count: m.count,
        target: messageTarget(db, m, c.get('user')),
        title: m.title || null,
        body: m.body || null,
        important: !!m.important,
        read: m.read_at !== null && m.read_at !== undefined,
        created_at: m.created_at,
      };
    });
    const counts = { all: 0, system: 0 };
    query(
      db,
      'SELECT type, COUNT(*) AS n FROM messages WHERE user_id = ? AND read_at IS NULL GROUP BY type',
    )
      .all(c.get('user').id)
      .forEach(function (c) {
        if (counts[c.type] !== undefined) counts[c.type] = Number(c.n);
        counts.all += Number(c.n);
      });
    c.res = c.json({ messages: messages, has_more: hasMore, counts: counts });
  });
  app.post('/api/admin/notifications', requirePermission('announcement_publish'), function (c) {
    const body = c.get('body') || {};
    const title = body.title === undefined || body.title === null ? '' : String(body.title).trim();
    const text = body.body === undefined || body.body === null ? '' : String(body.body).trim();
    const important = body.important ? 1 : 0;
    if (!title || !text) {
      c.res = c.json({ error: 'title and body are required' }, 400);
      return;
    }
    const recipients = query(db, 'SELECT id FROM users').all();
    const stmt = query(
      db,
      "INSERT INTO messages (user_id, type, title, body, important) VALUES (?, 'system', ?, ?, ?)",
    );
    recipients.forEach(function (u) {
      stmt.run(u.id, title, text, important);
    });
    c.res = c.json({ ok: true, recipients: recipients.length }, 201);
  });
};
