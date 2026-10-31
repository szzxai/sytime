const { query } = require('../../../../../packages/db/src/client.ts');
function settleNotifications(db, kind, id) {
  query(
    db,
    'UPDATE messages SET read_at=unixepoch() WHERE target_kind=? AND target_id=? AND read_at IS NULL',
  ).run(kind, id);
}
function syncHandledNotifications(db, userId) {
  // Also handles withdrawals and legacy notifications after a restart.
  query(
    db,
    `UPDATE messages SET read_at=unixepoch() WHERE user_id=? AND read_at IS NULL AND (
    (target_kind='moderation_pending' AND NOT EXISTS (
      SELECT 1 FROM moderation_requests r WHERE r.id=messages.target_id AND r.status='pending')) OR
    (target_kind='ticket_pending' AND NOT EXISTS (
      SELECT 1 FROM tickets t WHERE t.id=messages.target_id AND t.status='pending'))
  )`,
  ).run(userId);
}
function submissionTarget(db, request) {
  const payload =
    typeof request.payload === 'string' ? JSON.parse(request.payload) : request.payload;
  if (request.status === 'approved') {
    if (
      request.kind === 'dish_review' &&
      request.published_id &&
      query(db, 'SELECT id FROM recipes WHERE id=? AND dish_id=? AND is_weekly=0').get(
        request.published_id,
        payload.dish_id,
      )
    )
      return `/dish.html?id=${payload.dish_id}&review=${request.published_id}#review-${request.published_id}`;
    if (request.kind === 'shop_review') {
      const row = query(db, 'SELECT id FROM shop_reviews WHERE shop_id=? AND user_id=?').get(
        payload.shop_id,
        request.user_id,
      );
      if (row) return `/shop.html?id=${payload.shop_id}&review=${row.id}#review-${row.id}`;
    }
    if (
      request.kind === 'shop' &&
      query(db, 'SELECT id FROM shops WHERE id=?').get(request.published_id)
    )
      return `/shop.html?id=${request.published_id}`;
  }
  // Rejected, withdrawn or removed comments remain private and readable by their author.
  return `/profile.html?submission=${request.id}#home`;
}
function messageTarget(db, message, viewer) {
  if (!message.target_id) return null;
  if (['moderation_pending', 'moderation_result'].includes(message.target_kind)) {
    const request = query(db, 'SELECT * FROM moderation_requests WHERE id=?').get(
      message.target_id,
    );
    if (!request) return null;
    if (request.user_id === viewer.id) return { url: submissionTarget(db, request) };
    if (['admin', 'operator'].includes(viewer.role)) {
      const owner = query(db, 'SELECT role FROM users WHERE id=?').get(request.user_id);
      if (
        request.kind === 'appeal' &&
        (!owner ||
          owner.role === 'operator' ||
          (owner.role === 'admin' && viewer.role !== 'operator'))
      )
        return null;
      return { url: `/admin.html?request=${request.id}#reviews` };
    }
  }
  if (['ticket_pending', 'ticket_result'].includes(message.target_kind)) {
    const ticket = query(db, 'SELECT user_id,visibility FROM tickets WHERE id=?').get(
      message.target_id,
    );
    if (!ticket) return null;
    if (ticket.user_id === viewer.id) return { url: '/settings.html#tickets' };
    if (viewer.role === 'operator' || (viewer.role === 'admin' && ticket.visibility === 'admin'))
      return { url: '/admin.html#tickets' };
  }
  return null;
}
module.exports = { settleNotifications, syncHandledNotifications, submissionTarget, messageTarget };
