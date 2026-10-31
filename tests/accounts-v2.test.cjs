'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const { query } = require('../packages/db/src/client.ts');
const { fixture, PASSWORD, SHOP } = require('./helpers/accounts-fixture.cjs');
test('账号与审核：注册、角色、认证竞争、解绑、私密审核、通知与会话撤销', async (t) => {
  const f = await fixture(t);
  const { api, db, account, decide } = f;
  await t.test('首个注册账号也是普通用户；弱密码与非法用户名拒绝', async () => {
    assert.equal(
      (
        await api('/api/register', {
          method: 'POST',
          body: { username: 'first', nickname: '首个用户', password: 'weak' },
        })
      ).status,
      422,
    );
    const first = await account('first');
    assert.equal(query(db, 'SELECT role FROM users WHERE id=?').get(first.id).role, 'user');
    for (const route of [
      '/api/admin/overview',
      '/api/admin/users',
      '/api/admin/reviews',
      '/api/admin/audit',
    ])
      assert.equal((await api(route, { token: first.token })).status, 403);
    assert.equal(
      (await api('/api/recipes', { method: 'POST', token: first.token, body: {} })).status,
      403,
    );
    assert.equal(
      (await api('/api/shops', { method: 'POST', token: first.token, body: SHOP })).status,
      403,
    );
  });
  const operator = await account('operator_fixture', 'operator');
  const admin = await account('admin_fixture', 'admin');
  const alice = await account('alice');
  const bob = await account('bob');
  await t.test('管理员不能管理同级、运营者或自己；不能任意授予学生、管理员', async () => {
    for (const user of [admin, operator])
      assert.equal(
        (
          await api('/api/admin/users/ban', {
            method: 'PUT',
            token: admin.token,
            body: { userId: user.id, ban_reason: 'test' },
          })
        ).status,
        403,
      );
    assert.equal(
      (
        await api('/api/admin/users/role', {
          method: 'PUT',
          token: admin.token,
          body: { userId: alice.id, newRole: 'admin' },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await api('/api/admin/users/role', {
          method: 'PUT',
          token: admin.token,
          body: { userId: alice.id, newRole: 'student' },
        })
      ).status,
      409,
    );
    for (const route of [
      '/api/admin/invite-codes',
      '/api/admin/permissions',
      '/api/admin/menu-sync/settings',
      '/api/admin/menu-sync/imports',
    ])
      assert.equal((await api(route, { token: operator.token })).status, 404);
    assert.equal(
      (
        await api('/api/admin/map-popup', {
          method: 'PUT',
          token: operator.token,
          body: { name: 'x' },
        })
      ).status,
      404,
    );
  });
  await t.test('待审认证不占用学号，首个批准原子绑定并自动拒绝其他申请', async () => {
    const apply = (actor) =>
      api('/api/student/apply', {
        method: 'POST',
        token: actor.token,
        body: { student_id: 'ＳＺ２０２６０１', class_name: '高一1班', real_name: '测试同学' },
      });
    const a = await apply(alice),
      b = await apply(bob);
    assert.equal(a.status, 202);
    assert.equal(b.status, 202);
    assert.equal(query(db, 'SELECT count(*) n FROM student_bindings').get().n, 0);
    const results = await Promise.all([decide(admin, a.data.id), decide(operator, b.data.id)]);
    assert.deepEqual(
      results.map((r) => r.status),
      [200, 409],
    );
    assert.equal(
      query(db, 'SELECT student_id FROM student_bindings WHERE user_id=?').get(alice.id).student_id,
      'SZ202601',
    );
    assert.equal(
      query(db, 'SELECT status FROM moderation_requests WHERE id=?').get(b.data.id).status,
      'rejected',
    );
    assert.equal((await api('/api/user/profile', { token: alice.token })).status, 401);
    alice.token = await f.login('alice');
    assert.ok(
      query(db, "SELECT id FROM messages WHERE user_id=? AND title='学生认证未通过'").get(bob.id),
    );
    assert.equal((await decide(admin, a.data.id)).status, 409);
  });
  await t.test('展示 ID、头像在通过前不改变公开资料；拒绝必须说明原因；禁止自审', async () => {
    const before = (await api(`/api/users/${alice.id}/profile`)).data.user;
    const request = await api('/api/user/display_id', {
      method: 'PUT',
      token: alice.token,
      body: { display_id: 'campus_alice' },
    });
    assert.equal(request.status, 202);
    assert.equal(
      (await api(`/api/users/${alice.id}/profile`)).data.user.display_id,
      before.display_id,
    );
    assert.equal((await decide(admin, request.data.id, 'reject')).status, 422);
    assert.equal((await decide(admin, request.data.id)).status, 200);
    assert.equal(
      (await api(`/api/users/${alice.id}/profile`)).data.user.display_id,
      'campus_alice',
    );
    const self = await api('/api/user/display_id', {
      method: 'PUT',
      token: admin.token,
      body: { display_id: 'my_admin' },
    });
    assert.equal((await decide(admin, self.data.id)).status, 403);
    const buffer = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#f00' } })
      .png()
      .toBuffer();
    const form = new FormData();
    form.set('avatar', new Blob([buffer], { type: 'image/png' }), 'avatar.png');
    const avatar = await api('/api/user/avatar', {
      method: 'POST',
      token: alice.token,
      body: form,
    });
    assert.equal(avatar.status, 202);
    assert.equal((await api(`/api/users/${alice.id}/profile`)).data.user.avatar_url, '');
    const details = await api(`/api/admin/reviews/${avatar.data.id}`, { token: admin.token });
    assert.match(details.data.request.payload.image_data, /^data:image\/png;base64,/);
    assert.equal(
      (await api(`/api/admin/reviews/${avatar.data.id}`, { token: bob.token })).status,
      403,
    );
    assert.equal((await decide(admin, avatar.data.id)).status, 200);
    const url = (await api(`/api/users/${alice.id}/profile`)).data.user.avatar_url;
    assert.match(url, /^\/uploads\/approved\//);
    assert.ok(fs.existsSync(path.join(f.root, url)));
    assert.equal(
      JSON.parse(
        query(db, 'SELECT payload FROM moderation_requests WHERE id=?').get(avatar.data.id).payload,
      ).image_data,
      undefined,
    );
  });
  await t.test(
    '菜品、店铺、评价先审后发，店铺每日 10 个含撤回/拒绝；修改保留已批准版本',
    async () => {
      const { publishSource } = require('../apps/api/src/domain/menu/store');
      const { sha256 } = require('../apps/api/src/domain/menu/schema');
      publishSource(
        db,
        { article_id: 11427, title: '测试菜单', content_hash: sha256('account-fixture') },
        [
          {
            date: '2026-10-31',
            weekday: null,
            time: ['noon'],
            place: '希文楼',
            group: '面档',
            name: '审核面条',
            price: 12,
            spicy: null,
          },
        ],
      );
      const dish = query(db, 'SELECT id FROM dishes LIMIT 1').get();
      const review = await api('/api/recipes', {
        method: 'POST',
        token: alice.token,
        body: { dish_id: dish.id, rating: 5, comment: '待审评论' },
      });
      assert.equal(review.status, 202);
      assert.equal((await api('/api/recipes')).data.recipes.length, 0);
      assert.equal((await decide(admin, review.data.id)).status, 200);
      assert.equal((await api('/api/recipes')).data.recipes.length, 1);
      const shop = await api('/api/shops', { method: 'POST', token: alice.token, body: SHOP });
      assert.equal(shop.status, 202, JSON.stringify(shop.data));
      assert.equal((await api('/api/shops')).data.shops.length, 0);
      const result = await decide(admin, shop.data.id);
      assert.equal(result.status, 200, JSON.stringify(result.data));
      const shopId = result.data.published_id;
      const r = await api(`/api/shops/${shopId}/reviews`, {
        method: 'POST',
        token: alice.token,
        body: { rating: 5, content: '初版', guests: '2', total_price: '30' },
      });
      assert.equal(r.status, 202);
      assert.equal((await api(`/api/shops/${shopId}/reviews`)).data.total, 0);
      await decide(admin, r.data.id);
      assert.equal((await api(`/api/shops/${shopId}/reviews`)).data.reviews[0].content, '初版');
      const updated = await api(`/api/shops/${shopId}/reviews`, {
        method: 'POST',
        token: alice.token,
        body: { rating: 4, content: '更新版' },
      });
      assert.equal(updated.status, 202);
      assert.equal((await api(`/api/shops/${shopId}/reviews`)).data.reviews[0].content, '初版');
      await decide(admin, updated.data.id, 'reject', '内容不准确');
      assert.equal((await api(`/api/shops/${shopId}/reviews`)).data.reviews[0].content, '初版');
      for (let i = 1; i < 10; i++) {
        const r = await api('/api/shops', {
          method: 'POST',
          token: alice.token,
          body: { ...SHOP, name: '推荐店铺' + i },
        });
        assert.equal(r.status, 202, JSON.stringify(r.data));
        if (i === 1)
          await api(`/api/user/submissions/${r.data.id}/withdraw`, {
            method: 'POST',
            token: alice.token,
          });
      }
      assert.equal(
        (
          await api('/api/shops', {
            method: 'POST',
            token: alice.token,
            body: { ...SHOP, name: '超额店铺' },
          })
        ).status,
        429,
      );
    },
  );
  await t.test('删除评价同时撤回待审更新，避免已删内容重新发布', async () => {
    const shopId = query(db, 'SELECT id FROM shops LIMIT 1').get().id;
    const pending = await api(`/api/shops/${shopId}/reviews`, {
      method: 'POST',
      token: alice.token,
      body: { rating: 5, content: '删除前的修改' },
    });
    assert.equal(pending.status, 202);
    assert.equal(
      (await api(`/api/shops/${shopId}/reviews/me`, { method: 'DELETE', token: alice.token }))
        .status,
      200,
    );
    assert.equal((await decide(admin, pending.data.id)).status, 409);
    assert.equal((await api(`/api/shops/${shopId}/reviews`)).data.total, 0);
  });
  await t.test('解绑验证密码、释放身份、降级、撤回待审内容且保留历史与通知', async () => {
    assert.equal(
      (
        await api('/api/student/unbind', {
          method: 'POST',
          token: alice.token,
          body: { password: 'wrong' },
        })
      ).status,
      403,
    );
    const result = await api('/api/student/unbind', {
      method: 'POST',
      token: alice.token,
      body: { password: PASSWORD },
    });
    assert.equal(result.status, 200);
    assert.equal(query(db, 'SELECT count(*) n FROM student_bindings').get().n, 0);
    assert.equal(query(db, 'SELECT role FROM users WHERE id=?').get(alice.id).role, 'user');
    assert.equal(
      query(
        db,
        "SELECT count(*) n FROM moderation_requests WHERE user_id=? AND kind='shop' AND status='pending'",
      ).get(alice.id).n,
      0,
    );
    assert.equal((await api('/api/user/profile', { token: alice.token })).status, 401);
    alice.token = await f.login('alice');
    assert.ok((await api('/api/user/submissions', { token: alice.token })).data.total > 10);
  });
  await t.test('封禁、禁申诉后端校验、密码验证、解封等级限制和一次性审核', async () => {
    assert.equal(
      (
        await api('/api/admin/users/ban', {
          method: 'PUT',
          token: admin.token,
          body: { userId: bob.id, ban_reason: '测试限制', allow_appeal: false },
        })
      ).status,
      200,
    );
    assert.equal((await api('/api/user/profile', { token: bob.token })).status, 401);
    assert.equal(
      (
        await api('/api/user/appeal', {
          method: 'POST',
          body: { username: 'bob', password: PASSWORD, appeal_reason: '申请' },
        })
      ).status,
      403,
    );
    await api('/api/admin/users/ban', {
      method: 'PUT',
      token: admin.token,
      body: { userId: bob.id, ban_reason: '允许申诉', allow_appeal: true },
    });
    assert.equal(
      (
        await api('/api/user/appeal', {
          method: 'POST',
          body: { username: 'bob', password: 'wrong', appeal_reason: '申请' },
        })
      ).status,
      403,
    );
    const appeal = await api('/api/user/appeal', {
      method: 'POST',
      body: { username: 'bob', password: PASSWORD, appeal_reason: '申请解封' },
    });
    assert.equal(appeal.status, 202);
    assert.equal((await decide(admin, appeal.data.id)).status, 200);
    assert.equal((await decide(admin, appeal.data.id)).status, 409);
    bob.token = await f.login('bob');
    assert.equal(
      (
        await api('/api/admin/users/unban', {
          method: 'PUT',
          token: admin.token,
          body: { userId: operator.id },
        })
      ).status,
      403,
    );
  });
  await t.test('工单可见性、回复通知、改密退出所有设备与 CSRF 检查', async () => {
    const r = await api('/api/tickets', {
      method: 'POST',
      token: bob.token,
      body: { title: '测试反馈', content: '反馈内容', visibility: 'operator' },
    });
    assert.equal(r.status, 201);
    assert.equal((await api('/api/admin/tickets', { token: admin.token })).data.tickets.length, 0);
    assert.equal(
      (
        await api('/api/admin/tickets/reply', {
          method: 'PUT',
          token: admin.token,
          body: { id: r.data.ticket.id, reply: '回复' },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await api('/api/admin/tickets/reply', {
          method: 'PUT',
          token: operator.token,
          body: { id: r.data.ticket.id, reply: '已处理' },
        })
      ).status,
      200,
    );
    assert.ok(
      query(db, "SELECT id FROM messages WHERE user_id=? AND title='工单收到回复'").get(bob.id),
    );
    const second = await f.login('bob');
    const changed = await api('/api/user/password', {
      method: 'PUT',
      token: bob.token,
      body: { oldPassword: PASSWORD, newPassword: 'NewPassword2026' },
    });
    assert.equal(changed.status, 200);
    assert.equal((await api('/api/user/profile', { token: second })).status, 401);
    assert.equal(
      (
        await api('/api/register', {
          method: 'POST',
          headers: { Origin: 'https://evil.example' },
          body: {},
        })
      ).status,
      403,
    );
    assert.equal(db.$client.pragma('integrity_check', { simple: true }), 'ok');
    assert.deepEqual(db.$client.pragma('foreign_key_check'), []);
  });
});

test('登录仅核对凭据，兼容既有弱密码而不重新检查强度', async (t) => {
  const f = await fixture(t);
  const user = await f.account('legacy_login');
  query(f.db, 'UPDATE users SET password_hash=? WHERE id=?').run(
    require('bcrypt').hashSync('old123', 12),
    user.id,
  );
  const result = await f.api('/api/login', {
    method: 'POST',
    body: { username: 'legacy_login', password: 'old123' },
  });
  assert.equal(result.status, 200);
  assert.equal(
    (
      await f.api('/api/user/password', {
        method: 'PUT',
        token: result.data.token,
        body: { oldPassword: 'old123', newPassword: 'weak123' },
      })
    ).status,
    422,
  );
});

test('审核通知定位评论，处理后的待办全员已读，拒绝详情仅本人可看', async (t) => {
  const f = await fixture(t);
  const { api, db, account, decide } = f;
  const admin = await account('notify_admin', 'admin');
  const otherStaff = await account('notify_operator', 'operator');
  const student = await account('notify_student', 'student');
  const stranger = await account('notify_stranger');
  query(
    db,
    "INSERT INTO dishes(name,name_key,initial,pinyin,pinyin_initials,sort_key,created_at) VALUES('测试饭','测试饭','C','ceshifan','csf','ceshifan',unixepoch())",
  ).run();
  const dishId = query(db, 'SELECT id FROM dishes').get().id;
  const submit = await api('/api/recipes', {
    method: 'POST',
    token: student.token,
    body: { dish_id: dishId, rating: 5, comment: '需要精确定位的评价' },
  });
  assert.equal(submit.status, 202, JSON.stringify(submit.data));
  const pending = (await api('/api/messages', { token: otherStaff.token })).data.messages.find(
    (m) => m.title === '有新的菜品评价待审核',
  );
  assert.equal(pending.read, false);
  assert.equal(pending.target.url, `/admin.html?request=${submit.data.id}#reviews`);
  const approved = await decide(admin, submit.data.id);
  assert.equal(approved.status, 200);
  const reviewId = approved.data.published_id;
  for (const actor of [admin, otherStaff, student]) {
    const messages = (await api('/api/messages', { token: actor.token })).data.messages;
    assert.ok(
      messages
        .filter(
          (m) =>
            m.target?.url.includes('request=' + submit.data.id) || m.title === '菜品评价已提交',
        )
        .every((m) => m.read),
    );
  }
  const result = (await api('/api/messages', { token: student.token })).data.messages.find(
    (m) => m.title === '菜品评价已通过',
  );
  assert.equal(result.read, false, 'new result remains unread until opened');
  assert.equal(result.target.url, `/dish.html?id=${dishId}&review=${reviewId}#review-${reviewId}`);
  // Push the review past the first page and ensure focus lookup keeps strict resource scoping.
  const seedReview = query(
    db,
    "INSERT INTO recipes(dish_id,user_id,username,name,rating,comment,is_weekly,created_at) VALUES(?,?,?,'测试饭',4,'较新评价',0,unixepoch()+1)",
  );
  for (let i = 0; i < 25; i++) seedReview.run(dishId, student.id, student.username);
  const reviews = (await api(`/api/dishes/${dishId}/reviews?review=${reviewId}`)).data;
  assert.equal(
    reviews.reviews.some((r) => r.id === reviewId),
    false,
  );
  assert.equal(reviews.focus_review.id, reviewId);
  assert.equal((await api(`/api/dishes/${dishId}/reviews?review=999999`)).data.focus_review, null);
  const second = await api('/api/recipes', {
    method: 'POST',
    token: student.token,
    body: { dish_id: dishId, rating: 1, comment: '拒绝后仅作者可见的原评论' },
  });
  await decide(admin, second.data.id, 'reject', '内容需补充');
  const rejected = (await api('/api/messages', { token: student.token })).data.messages.find(
    (m) => m.title === '菜品评价未通过',
  );
  assert.equal(rejected.target.url, `/profile.html?submission=${second.data.id}#home`);
  const detail = (await api(`/api/user/submissions?id=${second.data.id}`, { token: student.token }))
    .data;
  assert.equal(detail.total, 1);
  assert.equal(detail.requests[0].summary, '拒绝后仅作者可见的原评论');
  assert.equal(
    (await api(`/api/user/submissions?id=${second.data.id}`, { token: stranger.token })).data.total,
    0,
  );
  const withdrawn = await api('/api/user/signature', {
    method: 'PUT',
    token: student.token,
    body: { signature: '撤回通知测试' },
  });
  await api(`/api/user/submissions/${withdrawn.data.id}/withdraw`, {
    method: 'POST',
    token: student.token,
  });
  assert.equal(
    query(
      db,
      "SELECT count(*) n FROM messages WHERE target_kind='moderation_pending' AND target_id=? AND read_at IS NULL",
    ).get(withdrawn.data.id).n,
    0,
  );
  const ticket = await api('/api/tickets', {
    method: 'POST',
    token: student.token,
    body: { title: '工单通知', content: '请求帮助', visibility: 'admin' },
  });
  await api('/api/admin/tickets/reply', {
    method: 'PUT',
    token: admin.token,
    body: { id: ticket.data.ticket.id, reply: '已完成' },
  });
  assert.equal(
    query(
      db,
      "SELECT count(*) n FROM messages WHERE target_kind='ticket_pending' AND target_id=? AND read_at IS NULL",
    ).get(ticket.data.ticket.id).n,
    0,
  );
  const reply = (await api('/api/messages', { token: student.token })).data.messages.find(
    (m) => m.title === '工单收到回复',
  );
  assert.equal(reply.read, false);
  assert.equal(reply.target.url, '/settings.html#tickets');
  // Upgrade the previous unlinked notification format without treating a result as read.
  const legacyTime = Math.floor(Date.now() / 1000) - 120;
  query(db, 'UPDATE moderation_requests SET created_at=?,reviewed_at=? WHERE id=?').run(
    legacyTime,
    legacyTime + 1,
    submit.data.id,
  );
  query(
    db,
    "UPDATE messages SET target_kind='',target_id=NULL,read_at=NULL,created_at=? WHERE target_kind='moderation_pending' AND target_id=?",
  ).run(legacyTime, submit.data.id);
  query(
    db,
    "UPDATE messages SET target_kind='',target_id=NULL,read_at=NULL,created_at=? WHERE id=?",
  ).run(legacyTime + 1, result.id);
  query(db, "DELETE FROM account_migrations WHERE key='notification-targets-v2'").run();
  query(
    db,
    "INSERT OR IGNORE INTO account_migrations VALUES('notification-targets-v1',unixepoch())",
  ).run();
  require('../apps/api/src/domain/accounts/migrate')(db);
  require('../apps/api/src/domain/accounts/migrate')(db);
  const upgraded = (await api('/api/messages', { token: student.token })).data.messages;
  assert.equal(
    upgraded.find((m) => m.title === '菜品评价已提交' && m.created_at === legacyTime).read,
    true,
  );
  assert.equal(upgraded.find((m) => m.id === result.id).read, false);
  assert.equal(upgraded.find((m) => m.id === result.id).target.url, result.target.url);
  assert.ok(query(db, 'SELECT read_at FROM messages WHERE id=?').get(pending.id).read_at === null);
  await api('/api/messages/unread-count', { token: otherStaff.token });
  assert.ok(query(db, 'SELECT read_at FROM messages WHERE id=?').get(pending.id).read_at !== null);
});
