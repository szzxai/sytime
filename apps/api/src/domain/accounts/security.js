/* eslint-disable no-control-regex -- Reject control characters in user text. */
const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const { query } = require('../../../../../packages/db/src/client.ts');
const { validPassword, roleWeights } = require('../../../../../packages/shared/src/index.ts');
const now = () => Math.floor(Date.now() / 1000);
function error(status, message) {
  return Object.assign(new Error(message), { status });
}
function text(value, label, max = 500, optional = false) {
  if (typeof value !== 'string') {
    if (optional && value == null) return '';
    throw error(422, `请填写${label}`);
  }
  const result = value.normalize('NFKC').trim();
  if (
    (!optional && !result) ||
    result.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(result)
  )
    throw error(422, `${label}格式或长度不符合要求`);
  return result;
}
function password(value) {
  if (!validPassword(value) || Buffer.byteLength(value, 'utf8') > 72)
    throw error(422, '密码须为 8–72 字节，包含大写字母、小写字母和数字，且首尾没有空白');
  return value;
}
function notify(db, userId, title, body, target = {}) {
  query(
    db,
    "INSERT INTO messages(user_id,type,title,body,target_kind,target_id) VALUES (?,'system',?,?,?,?)",
  ).run(userId, title, body, target.kind || '', target.id || null);
}
function notifyStaff(db, title, body, target = {}) {
  for (const row of query(
    db,
    "SELECT id FROM users WHERE role IN ('admin','operator') AND status='active'",
  ).all())
    notify(db, row.id, title, body, target);
}
function audit(db, actor, target, action, detail = {}) {
  query(db, 'INSERT INTO account_audit(actor_id,target_id,action,detail) VALUES (?,?,?,?)').run(
    actor,
    target,
    action,
    JSON.stringify(detail),
  );
}
function revoke(db, userId) {
  query(db, 'UPDATE users SET session_version=session_version+1 WHERE id=?').run(userId);
  query(db, 'DELETE FROM account_sessions WHERE user_id=?').run(userId);
}
function limited(db, key, count = 10, seconds = 600) {
  const hashed = crypto.createHash('sha256').update(key).digest('hex');
  return db.$client.transaction(() => {
    query(db, 'DELETE FROM auth_limits WHERE reset_at<=?').run(now());
    const row = query(db, 'SELECT * FROM auth_limits WHERE key=?').get(hashed);
    if (row && row.count >= count)
      throw Object.assign(error(429, '操作过于频繁，请稍后再试'), {
        retry_after: row.reset_at - now(),
      });
    query(
      db,
      'INSERT INTO auth_limits(key,count,reset_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1',
    ).run(hashed, now() + seconds);
  })();
}
function target(db, actor, id) {
  const user = query(db, 'SELECT * FROM users WHERE id=?').get(id);
  if (!user) throw error(404, '用户不存在');
  if (
    actor.id === user.id ||
    !['admin', 'operator'].includes(actor.role) ||
    user.role === 'operator' ||
    (user.role === 'admin' && actor.role !== 'operator')
  )
    throw error(403, '无权管理此账号');
  return user;
}
function verifyPassword(db, id, value) {
  const account = query(db, 'SELECT password_hash FROM users WHERE id=?').get(id);
  if (
    typeof value !== 'string' ||
    !account?.password_hash ||
    !bcrypt.compareSync(value, account.password_hash)
  )
    throw error(403, '密码不正确');
}
const action = (handler) => async (c) => {
  try {
    return await handler(c);
  } catch (e) {
    if (!e.status) console.error('[accounts]', e.message);
    if (e.retry_after) c.header('Retry-After', String(e.retry_after));
    return c.json(
      {
        error: e.status ? e.message : '操作失败，请稍后重试',
        message: e.status ? e.message : '操作失败，请稍后重试',
        ...(e.retry_after ? { retry_after: e.retry_after } : {}),
      },
      e.status || 500,
    );
  }
};
module.exports = {
  now,
  error,
  text,
  password,
  notify,
  notifyStaff,
  audit,
  revoke,
  limited,
  target,
  verifyPassword,
  action,
  roleWeights,
};
