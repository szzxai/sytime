const { settleNotifications, submissionTarget } = require('./notifications');
const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { setCookie, deleteCookie } = require('hono/cookie');
const { query } = require('../../../../../packages/db/src/client.ts');
const { withUpload } = require('../../upload');
const { createModeration, image, studentId, labels } = require('./moderation');
const {
  action,
  error,
  text,
  password,
  notify,
  audit,
  revoke,
  limited,
  target,
  verifyPassword,
  now,
} = require('./security');
const dishes = require('../dishes/store');
const dummyHash = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 12);
module.exports = function mountAccounts(app, services) {
  const { db, root, JWT_SECRET, JWT_EXPIRES_IN, checkRole, requireLogin, recordLogin } = services;
  const staff = checkRole('admin');
  const moderation = createModeration(db, root);
  const body = (c) => c.get('body') || {};
  const current = (c) => c.get('user');
  const secure = (c) =>
    new URL(c.req.url).protocol === 'https:' || process.env.NODE_ENV === 'production';
  const consume = (c, operation, max = 10) =>
    limited(db, operation + ':' + (c.env?.incoming?.socket?.remoteAddress || 'local'), max);
  const sessionUser = (user) => ({
    id: user.id,
    display_id: user.display_id,
    username: user.username,
    nickname: user.nickname,
    role: user.role,
  });
  app.post(
    '/api/register',
    action((c) => {
      consume(c, 'register', 10);
      const value = body(c);
      const username = text(value.username, '用户名', 32).toLowerCase();
      if (!/^[a-z][a-z0-9_-]{2,31}$/.test(username))
        throw error(422, '用户名须为 3–32 位英文字母、数字、下划线或连字符，并以字母开头');
      const nickname = text(value.nickname, '昵称', 20);
      const hash = bcrypt.hashSync(password(value.password), 12);
      return db.$client.transaction(() => {
        if (query(db, 'SELECT id FROM users WHERE username=? COLLATE NOCASE').get(username))
          throw error(409, '用户名已被使用');
        const id = Number(
          query(
            db,
            "INSERT INTO users(username,nickname,password_hash,role,recipe_default_view) VALUES (?,'新用户',?,'user','daily')",
          ).run(username, hash).lastInsertRowid,
        );
        query(db, 'UPDATE users SET display_id=?,nickname=? WHERE id=?').run(
          String(id),
          '用户' + id,
          id,
        );
        moderation.submit({ id }, 'nickname', { value: nickname });
        audit(db, id, id, 'account.registered');
        return c.json({ id, username, role: 'user' }, 201);
      })();
    }),
  );
  app.post(
    '/api/login',
    action((c) => {
      consume(c, 'login', 30);
      const value = body(c);
      const username = text(value.username, '用户名', 32).toLowerCase();
      limited(db, 'login-account:' + username, 10);
      const user = query(db, 'SELECT * FROM users WHERE username=? COLLATE NOCASE').get(username);
      const candidate =
        typeof value.password === 'string' && Buffer.byteLength(value.password) <= 72
          ? value.password
          : '';
      const correct = bcrypt.compareSync(candidate, user?.password_hash || dummyHash);
      if (!user || !correct) throw error(401, '用户名或密码不正确');
      if (user.status === 'banned')
        return c.json(
          {
            error: 'banned',
            ban_reason: user.ban_reason,
            ban_image: user.ban_image,
            allow_appeal: user.allow_appeal,
            last_appeal:
              query(
                db,
                "SELECT status,reason,reviewed_at FROM moderation_requests WHERE user_id=? AND kind='appeal' ORDER BY id DESC LIMIT 1",
              ).get(user.id) || null,
          },
          403,
        );
      if (!['user', 'student', 'admin', 'operator'].includes(user.role))
        throw error(403, '账号角色无效，请联系运营者');
      const sid = crypto.randomBytes(32).toString('hex');
      const token = jwt.sign({ id: user.id, sid }, JWT_SECRET, {
        algorithm: 'HS256',
        issuer: 'sytime',
        audience: 'sytime-web',
        expiresIn: JWT_EXPIRES_IN,
      });
      const expires = jwt.decode(token).exp;
      db.$client.transaction(() => {
        query(db, 'DELETE FROM account_sessions WHERE expires_at<=?').run(now());
        query(
          db,
          'INSERT INTO account_sessions(id,user_id,version,expires_at) VALUES(?,?,?,?)',
        ).run(sid, user.id, user.session_version, expires);
        audit(db, user.id, user.id, 'session.created');
        recordLogin(user.id);
      })();
      setCookie(c, 'sytime_session', token, {
        httpOnly: true,
        secure: secure(c),
        sameSite: 'Strict',
        path: '/',
        maxAge: expires - now(),
      });
      return c.json({ token, user: sessionUser(user) });
    }),
  );
  app.post(
    '/api/logout',
    requireLogin,
    action((c) => {
      query(db, 'DELETE FROM account_sessions WHERE id=?').run(current(c).session_id);
      deleteCookie(c, 'sytime_session', { path: '/' });
      return c.json({ ok: true });
    }),
  );
  app.post(
    '/api/user/sessions/revoke',
    requireLogin,
    action((c) => {
      verifyPassword(db, current(c).id, body(c).password);
      revoke(db, current(c).id);
      deleteCookie(c, 'sytime_session', { path: '/' });
      return c.json({ ok: true });
    }),
  );
  app.get('/api/me', checkRole(), (c) => c.json({ user: current(c) }));
  app.put(
    '/api/user/password',
    requireLogin,
    action((c) => {
      limited(db, 'password:' + current(c).id, 10);
      const value = body(c);
      verifyPassword(db, current(c).id, value.oldPassword || value.old_password);
      const hash = bcrypt.hashSync(password(value.newPassword || value.new_password), 12);
      db.$client.transaction(() => {
        query(db, 'UPDATE users SET password_hash=? WHERE id=?').run(hash, current(c).id);
        revoke(db, current(c).id);
        audit(db, current(c).id, current(c).id, 'password.changed');
        notify(db, current(c).id, '密码已修改', '所有设备的登录已失效，请使用新密码重新登录。');
      })();
      deleteCookie(c, 'sytime_session', { path: '/' });
      return c.json({ ok: true, reauthenticate: true });
    }),
  );
  app.get('/api/student/binding', requireLogin, (c) =>
    c.json({
      binding:
        query(
          db,
          'SELECT student_id,real_name,class_name,bound_at FROM student_bindings WHERE user_id=?',
        ).get(current(c).id) || null,
    }),
  );
  app.post(
    '/api/student/apply',
    requireLogin,
    action((c) => {
      const value = body(c);
      const id = studentId(value.student_id);
      if (query(db, 'SELECT user_id FROM student_bindings WHERE user_id=?').get(current(c).id))
        throw error(409, '本账号已绑定学生身份，请先解绑');
      const payload = {
        student_id: id,
        class_name: text(value.class_name, '班级', 40),
        real_name: text(value.real_name, '真实姓名', 40),
        extra_info: text(value.extra_info, '补充信息', 500, true),
      };
      // Pending submissions intentionally do not reserve a student identity.
      return c.json(moderation.submit(current(c), 'student', payload), 202);
    }),
  );
  app.post(
    '/api/student/unbind',
    requireLogin,
    action((c) => {
      limited(db, 'unbind:' + current(c).id, 5);
      verifyPassword(db, current(c).id, body(c).password);
      db.$client.transaction(() => moderation.unbind(current(c).id, current(c).id))();
      deleteCookie(c, 'sytime_session', { path: '/' });
      return c.json({ ok: true, reauthenticate: true });
    }),
  );
  for (const field of ['display_id', 'nickname', 'signature'])
    app.put(
      '/api/user/' + field,
      requireLogin,
      action((c) => {
        const value = text(
          body(c)[field],
          field === 'display_id' ? '展示 ID' : field === 'nickname' ? '昵称' : '个性签名',
          field === 'display_id' ? 24 : field === 'nickname' ? 20 : 200,
          field === 'signature',
        );
        if (field === 'display_id' && !/^[a-zA-Z0-9_]{3,24}$/.test(value))
          throw error(422, '展示 ID 须为 3–24 位字母、数字或下划线');
        if (
          field === 'display_id' &&
          query(db, 'SELECT id FROM users WHERE display_id=? AND id<>?').get(value, current(c).id)
        )
          throw error(409, '展示 ID 已被使用');
        return c.json(moderation.submit(current(c), field, { value }), 202);
      }),
    );
  const uploadPolicy = { memory: true, maxBytes: 2 * 1024 * 1024, maxFields: 12 };
  app.post(
    '/api/user/avatar',
    requireLogin,
    action((c) =>
      withUpload(c, uploadPolicy, 'avatar', async (err) => {
        if (err) throw error(422, err.message);
        if (!c.get('file')) throw error(422, '请选择头像图片');
        c.res = c.json(
          moderation.submit(current(c), 'avatar', { image_data: await image(c.get('file')) }),
          202,
        );
      }),
    ),
  );
  app.post(
    '/api/recipes',
    checkRole('student'),
    action((c) =>
      withUpload(c, uploadPolicy, 'image', async (err) => {
        if (err) throw error(422, err.message);
        const value = body(c);
        const dish = dishes.findDish(db, value.dish_id);
        if (!dish) throw error(422, '请从下拉列表选择已有菜品');
        const rating = Number(value.rating);
        if (!Number.isInteger(rating) || rating < 1 || rating > 5)
          throw error(422, '评分必须是 1 到 5 的整数');
        c.res = c.json(
          moderation.submit(
            current(c),
            'dish_review',
            {
              dish_id: dish.id,
              name: dish.name,
              rating,
              comment: text(value.comment, '评论', 500, true),
              image_data: await image(c.get('file')),
            },
            String(dish.id),
          ),
          202,
        );
      }),
    ),
  );
  app.post(
    '/api/user/appeal',
    action((c) => {
      consume(c, 'appeal', 15);
      const value = body(c);
      const username = text(value.username, '用户名', 32).toLowerCase();
      const owner = query(db, 'SELECT * FROM users WHERE username=? COLLATE NOCASE').get(username);
      const correct = bcrypt.compareSync(
        typeof value.password === 'string' && Buffer.byteLength(value.password) <= 72
          ? value.password
          : '',
        owner?.password_hash || dummyHash,
      );
      if (!owner || !correct) throw error(403, '账号或密码不正确');
      if (owner.status !== 'banned' || !owner.allow_appeal)
        throw error(403, '此账号不允许在线申诉，请联系运营者');
      const imageData = null;
      if (value.appeal_image) {
        if (
          typeof value.appeal_image !== 'string' ||
          !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(value.appeal_image) ||
          value.appeal_image.length > 2_800_000
        )
          throw error(422, '申诉图片无效');
        const buffer = Buffer.from(value.appeal_image.split(',')[1], 'base64');
        return image({
          buffer,
          size: buffer.length,
          mimetype: value.appeal_image.startsWith('data:image/png') ? 'image/png' : 'image/jpeg',
        }).then((result) =>
          c.json(
            moderation.submit(owner, 'appeal', {
              appeal_reason: text(value.appeal_reason, '申诉理由', 500),
              image_data: result,
            }),
            202,
          ),
        );
      }
      return c.json(
        moderation.submit(owner, 'appeal', {
          appeal_reason: text(value.appeal_reason, '申诉理由', 500),
          image_data: imageData,
        }),
        202,
      );
    }),
  );
  function page(c) {
    return {
      limit: Math.min(50, Math.max(1, Math.trunc(Number(c.req.query('limit'))) || 20)),
      offset: Math.max(0, Math.trunc(Number(c.req.query('offset')) || 0)),
    };
  }
  app.get(
    '/api/user/submissions',
    requireLogin,
    action((c) => {
      const { limit, offset } = page(c);
      const requestedId = Number(c.req.query('id')) || null;
      return c.json({
        requests: query(
          db,
          'SELECT id,kind,status,reason,reviewer_id,created_at,reviewed_at,published_id,payload FROM moderation_requests WHERE user_id=? AND (? IS NULL OR id=?) ORDER BY id DESC LIMIT ? OFFSET ?',
        )
          .all(current(c).id, requestedId, requestedId, limit, offset)
          .map(({ payload, ...row }) => {
            const value = JSON.parse(payload);
            return {
              ...row,
              target_url: submissionTarget(db, { ...row, user_id: current(c).id, payload: value }),
              summary:
                value.value ||
                value.content ||
                value.comment ||
                value.name ||
                value.appeal_reason ||
                (row.kind === 'student' ? '学号 ' + value.student_id : '头像变更'),
            };
          }),
        total: query(
          db,
          'SELECT count(*) n FROM moderation_requests WHERE user_id=? AND (? IS NULL OR id=?)',
        ).get(current(c).id, requestedId, requestedId).n,
      });
    }),
  );
  app.post(
    '/api/user/submissions/:id/withdraw',
    requireLogin,
    action((c) =>
      db.$client.transaction(() => {
        const request = query(db, 'SELECT * FROM moderation_requests WHERE id=? AND user_id=?').get(
          c.req.param('id'),
          current(c).id,
        );
        if (!request) throw error(404, '申请不存在');
        if (request.status !== 'pending') throw error(409, '申请已处理');
        const payload = JSON.parse(request.payload);
        delete payload.image_data;
        query(
          db,
          "UPDATE moderation_requests SET status='withdrawn',reviewed_at=unixepoch(),payload=? WHERE id=?",
        ).run(JSON.stringify(payload), request.id);
        audit(db, current(c).id, current(c).id, 'submission.withdrawn', { id: request.id });
        settleNotifications(db, 'moderation_pending', request.id);
        notify(db, current(c).id, '申请已撤回', labels[request.kind] + '申请已取消。', {
          kind: 'moderation_result',
          id: request.id,
        });
        return c.json({ ok: true });
      })(),
    ),
  );
  app.get(
    '/api/admin/reviews',
    staff,
    action((c) => {
      const { limit, offset } = page(c);
      const status = c.req.query('status') || 'pending';
      const kind = c.req.query('kind');
      if (!['pending', 'approved', 'rejected', 'withdrawn'].includes(status))
        throw error(422, '审核状态无效');
      const params = [status];
      let where = 'r.status=?';
      if (kind) {
        if (!labels[kind]) throw error(422, '审核类型无效');
        where += ' AND r.kind=?';
        params.push(kind);
      }
      const requests = query(
        db,
        `SELECT r.id,r.user_id,r.kind,r.status,r.reason,r.created_at,r.reviewed_at,r.reviewer_id,r.published_id,u.username,u.nickname FROM moderation_requests r JOIN users u ON u.id=r.user_id WHERE ${where} ORDER BY r.id DESC LIMIT ? OFFSET ?`,
      ).all(...params, limit, offset);
      return c.json({
        requests,
        total: query(db, `SELECT count(*) n FROM moderation_requests r WHERE ${where}`).get(
          ...params,
        ).n,
      });
    }),
  );
  app.get(
    '/api/admin/reviews/:id',
    staff,
    action((c) => {
      const request = query(
        db,
        'SELECT r.*,u.username,u.nickname FROM moderation_requests r JOIN users u ON u.id=r.user_id WHERE r.id=?',
      ).get(c.req.param('id'));
      if (!request) throw error(404, '申请不存在');
      return c.json({ request: { ...request, payload: JSON.parse(request.payload) } });
    }),
  );
  app.post(
    '/api/admin/reviews/:id/decision',
    staff,
    action((c) =>
      c.json(
        moderation.review(current(c), Number(c.req.param('id')), body(c).decision, body(c).reason),
      ),
    ),
  );
  app.get(
    '/api/admin/overview',
    staff,
    action((c) =>
      c.json({
        counts: query(
          db,
          "SELECT kind,count(*) count FROM moderation_requests WHERE status='pending' GROUP BY kind",
        ).all(),
        users: query(db, 'SELECT count(*) n FROM users').get().n,
        pending: query(
          db,
          "SELECT count(*) n FROM moderation_requests WHERE status='pending'",
        ).get().n,
        tickets: query(
          db,
          "SELECT count(*) n FROM tickets WHERE status='pending' AND (visibility='admin' OR ?='operator')",
        ).get(current(c).role).n,
        reviewed_today: query(
          db,
          "SELECT count(*) n FROM moderation_requests WHERE reviewed_at>=unixepoch('now','+8 hours','start of day','-8 hours') AND status IN ('approved','rejected')",
        ).get().n,
      }),
    ),
  );
  app.get(
    '/api/admin/audit',
    staff,
    action((c) => {
      const { limit, offset } = page(c);
      return c.json({
        events: query(
          db,
          'SELECT a.*,u.username actor_name,t.username target_name FROM account_audit a LEFT JOIN users u ON u.id=a.actor_id LEFT JOIN users t ON t.id=a.target_id ORDER BY a.id DESC LIMIT ? OFFSET ?',
        ).all(limit, offset),
        total: query(db, 'SELECT count(*) n FROM account_audit').get().n,
      });
    }),
  );
  app.get(
    '/api/admin/users',
    staff,
    action((c) => {
      const { limit, offset } = page(c);
      const search = '%' + text(c.req.query('search') || '', '搜索', 50, true) + '%';
      return c.json({
        users: query(
          db,
          'SELECT u.id,u.display_id,u.username,u.nickname,u.role,u.status,u.allow_appeal,u.ban_reason,b.student_id FROM users u LEFT JOIN student_bindings b ON b.user_id=u.id WHERE u.username LIKE ? OR u.display_id LIKE ? OR u.nickname LIKE ? ORDER BY u.id DESC LIMIT ? OFFSET ?',
        ).all(search, search, search, limit, offset),
        total: query(
          db,
          'SELECT count(*) n FROM users WHERE username LIKE ? OR display_id LIKE ? OR nickname LIKE ?',
        ).get(search, search, search).n,
      });
    }),
  );
  app.get(
    '/api/admin/users/:id',
    staff,
    action((c) => {
      const user = query(
        db,
        'SELECT id,display_id,username,nickname,role,status FROM users WHERE id=?',
      ).get(Number(c.req.param('id')));
      if (!user) throw error(404, '用户不存在');
      return c.json({
        user: {
          ...user,
          titles: require('../titles/store').titlesByUserMap(db, [user.id]).get(user.id) || [],
        },
      });
    }),
  );
  app.put(
    '/api/admin/users/role',
    staff,
    action((c) =>
      db.$client.transaction(() => {
        const value = body(c);
        const user = target(db, current(c), Number(value.userId));
        const role = value.newRole;
        if (
          !['user', 'student', 'admin'].includes(role) ||
          (role === 'admin' && current(c).role !== 'operator')
        )
          throw error(403, '仅运营者可任命管理员');
        if (
          role === 'student' &&
          !query(db, 'SELECT user_id FROM student_bindings WHERE user_id=?').get(user.id)
        )
          throw error(409, '请先通过学生认证，不能直接授予学生身份');
        if (
          role === 'user' &&
          query(db, 'SELECT user_id FROM student_bindings WHERE user_id=?').get(user.id)
        )
          moderation.unbind(user.id, current(c).id);
        query(db, 'UPDATE users SET role=? WHERE id=?').run(role, user.id);
        revoke(db, user.id);
        audit(db, current(c).id, user.id, 'role.changed', { from: user.role, to: role });
        notify(db, user.id, '账号角色已变更', `当前角色为 ${role}，请重新登录。`);
        return c.json({ ok: true });
      })(),
    ),
  );
  for (const operation of ['ban', 'unban'])
    app.put(
      '/api/admin/users/' + operation,
      staff,
      action((c) =>
        db.$client.transaction(() => {
          const value = body(c);
          const user = target(db, current(c), Number(value.userId));
          const reason =
            operation === 'ban'
              ? text(value.ban_reason, '封禁原因', 500)
              : text(value.reason || '管理员解封', '处理说明', 500);
          const allow = value.allow_appeal === false || value.allow_appeal === 0 ? 0 : 1;
          query(
            db,
            "UPDATE users SET status=?,ban_reason=?,ban_image='',allow_appeal=? WHERE id=?",
          ).run(
            operation === 'ban' ? 'banned' : 'active',
            operation === 'ban' ? reason : '',
            operation === 'ban' ? allow : 1,
            user.id,
          );
          revoke(db, user.id);
          audit(db, current(c).id, user.id, 'account.' + operation, {
            reason,
            allow_appeal: allow,
          });
          notify(db, user.id, operation === 'ban' ? '账号已被封禁' : '账号已解封', reason);
          return c.json({ ok: true });
        })(),
      ),
    );
  app.post(
    '/api/admin/users/:id/unbind',
    staff,
    action((c) =>
      db.$client.transaction(() => {
        const user = target(db, current(c), Number(c.req.param('id')));
        moderation.unbind(user.id, current(c).id);
        return c.json({ ok: true });
      })(),
    ),
  );
  return { moderation };
};
