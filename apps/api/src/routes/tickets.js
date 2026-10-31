const { query } = require('../../../../packages/db/src/client.ts');
const { action, error, text, notify, audit, limited } = require('../domain/accounts/security');
const { settleNotifications } = require('../domain/accounts/notifications');
module.exports = function mountTickets(app, { db, requireLogin, checkRole }) {
  app.post(
    '/api/tickets',
    requireLogin,
    action((c) => {
      const value = c.get('body') || {};
      limited(db, 'tickets:' + c.get('user').id, 5);
      const visibility = value.visibility || 'admin';
      if (!['admin', 'operator'].includes(visibility)) throw error(422, '可见范围无效');
      return db.$client.transaction(() => {
        const id = Number(
          query(
            db,
            "INSERT INTO tickets(user_id,username,title,content,visibility,status) VALUES(?,?,?,?,?,'pending')",
          ).run(
            c.get('user').id,
            c.get('user').username,
            text(value.title, '标题', 100),
            text(value.content, '内容', 2000),
            visibility,
          ).lastInsertRowid,
        );
        notify(db, c.get('user').id, '工单已提交', `工单 #${id} 已受理，请等待回复。`, {
          kind: 'ticket_pending',
          id,
        });
        for (const user of query(
          db,
          "SELECT id FROM users WHERE status='active' AND (role='operator' OR (role='admin' AND ?='admin'))",
        ).all(visibility))
          notify(db, user.id, '有新的工单待处理', `工单 #${id}，请前往后台查看。`, {
            kind: 'ticket_pending',
            id,
          });
        audit(db, c.get('user').id, c.get('user').id, 'ticket.created', { id });
        return c.json({ ticket: { id, status: 'pending' } }, 201);
      })();
    }),
  );
  app.get('/api/tickets/mine', requireLogin, (c) =>
    c.json({
      tickets: query(db, 'SELECT * FROM tickets WHERE user_id=? ORDER BY id DESC LIMIT 100').all(
        c.get('user').id,
      ),
    }),
  );
  app.get('/api/admin/tickets', checkRole('admin'), (c) =>
    c.json({
      tickets: query(
        db,
        "SELECT * FROM tickets WHERE visibility='admin' OR ?='operator' ORDER BY (status='pending') DESC,id DESC LIMIT 100",
      ).all(c.get('user').role),
    }),
  );
  app.put(
    '/api/admin/tickets/reply',
    checkRole('admin'),
    action((c) =>
      db.$client.transaction(() => {
        const value = c.get('body') || {};
        const ticket = query(db, 'SELECT * FROM tickets WHERE id=?').get(Number(value.id));
        if (!ticket) throw error(404, '工单不存在');
        if (ticket.visibility === 'operator' && c.get('user').role !== 'operator')
          throw error(403, '此工单仅运营者可见');
        if (ticket.status !== 'pending') throw error(409, '此工单已回复');
        if (ticket.user_id === c.get('user').id) throw error(403, '不能处理自己提交的工单');
        const reply = text(value.reply, '回复', 2000);
        query(
          db,
          "UPDATE tickets SET status='resolved',reply_content=?,reply_image='',reply_by=?,replied_at=unixepoch() WHERE id=?",
        ).run(reply, c.get('user').username, ticket.id);
        audit(db, c.get('user').id, ticket.user_id, 'ticket.replied', { id: ticket.id });
        settleNotifications(db, 'ticket_pending', ticket.id);
        notify(db, ticket.user_id, '工单收到回复', `「${ticket.title}」：${reply}`, {
          kind: 'ticket_result',
          id: ticket.id,
        });
        return c.json({ ok: true });
      })(),
    ),
  );
};
