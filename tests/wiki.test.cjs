const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture, PASSWORD } = require('./helpers/accounts-fixture.cjs');
const { query } = require('../packages/db/src/client.ts');
const sharp = require('sharp');

async function setup(t) {
  const f = await fixture(t);
  const author = await f.account('wiki_author', 'student');
  const other = await f.account('wiki_other', 'student');
  const admin = await f.account('wiki_admin', 'admin');
  const user = await f.account('wiki_user');
  const call = async (path, token, body, method = 'POST') => {
    if (
      path.match(/^\/api\/wiki\/entries\/\d+\/submissions$/) &&
      body &&
      body.base_revision_id === undefined
    ) {
      const current = await f.api(path.replace('/submissions', ''));
      body = { ...body, base_revision_id: current.data.entry?.current_revision_id };
    }
    return f.api(path, { method, token, body });
  };
  const top = await call('/api/admin/wiki/folders', admin.token, { name: '校园文化' });
  assert.equal(top.status, 200, JSON.stringify(top.data));
  const sub = await call('/api/admin/wiki/folders', admin.token, {
    name: '校园指南',
    parent_id: top.data.id,
  });
  const payload = {
    title: '图书馆指南',
    aliases: ['藏书楼'],
    markdown: '## 借书\n校园阅读指南。',
    folder_id: sub.data.id,
    sources: ['https://example.org/library'],
  };
  const submit = (value = payload, token = author.token) => call('/api/wiki/entries', token, value);
  async function published() {
    const r = await submit();
    assert.equal(r.status, 202, JSON.stringify(r.data));
    const decision = await f.decide(admin, r.data.id);
    assert.equal(decision.status, 200, JSON.stringify(decision.data));
    return decision.data.published_id;
  }
  return {
    ...f,
    author,
    other,
    admin,
    user,
    call,
    top: top.data.id,
    sub: sub.data.id,
    payload,
    submit,
    published,
  };
}
test('Wiki permissions, private review, public search and folder structure', async (t) => {
  const f = await setup(t);
  assert.equal((await f.submit(f.payload, null)).status, 401);
  assert.equal((await f.submit(f.payload, f.user.token)).status, 403);
  assert.equal(
    (await f.call('/api/admin/wiki/folders', f.author.token, { name: '无权' })).status,
    403,
  );
  assert.equal(
    (await f.call('/api/admin/wiki/folders', f.admin.token, { name: '三级', parent_id: f.sub }))
      .status,
    422,
  );
  const r = await f.submit();
  assert.equal(r.status, 202);
  assert.equal((await f.api('/api/wiki')).data.entries.length, 0);
  assert.equal(
    (await f.api(`/api/admin/reviews/${r.data.id}`, { token: f.user.token })).status,
    403,
  );
  assert.equal((await f.submit()).status, 409);
  assert.equal(
    (await f.call(`/api/admin/wiki/folders/${f.sub}`, f.admin.token, undefined, 'DELETE')).status,
    409,
  );
  const detail = await f.api(`/api/admin/reviews/${r.data.id}`, { token: f.admin.token });
  assert.equal(detail.data.request.payload.before_markdown, '');
  const approve = await f.decide(f.admin, r.data.id);
  const id = approve.data.published_id;
  assert.equal(approve.status, 200);
  for (const term of ['图书馆', '藏书楼', '借书', '校园阅读', 'tushuguan', 'tsg', 'túshūguǎn']) {
    const search = await f.api('/api/wiki?q=' + encodeURIComponent(term));
    if (term !== 'túshūguǎn') assert.equal(search.data.entries.length, 1, term);
  }
  const read = await f.api('/api/wiki/entries/' + id);
  assert.equal(read.data.entry.title, f.payload.title);
  assert.equal(
    read.data.entry.contributors[0].nickname,
    query(f.db, 'SELECT nickname FROM users WHERE id=?').get(f.author.id).nickname,
  );
  assert.equal(read.data.entry.path.length, 2);
  assert.equal((await f.api('/api/wiki/random')).data.id, id);
  assert.equal((await f.api('/api/wiki/entries/bad')).status, 404);
  assert.equal((await f.api('/api/wiki/entries/99999')).status, 404);
  const history = await f.api(`/api/wiki/entries/${id}/history`);
  assert.equal(history.data.revisions.length, 1);
  assert.equal(
    (await f.api(`/api/wiki/entries/${id}/revisions/${history.data.revisions[0].id}`)).data.revision
      .markdown,
    f.payload.markdown,
  );
  assert.equal((await f.submit({ ...f.payload, title: '藏书楼' })).status, 409);
  assert.equal((await f.decide(f.admin, r.data.id)).status, 409);
});
test('Wiki edit locks, withdraw, manual locks and version conflict', async (t) => {
  const f = await setup(t);
  const id = await f.published();
  const edit = (token = f.author.token) =>
    f.call(`/api/wiki/entries/${id}/submissions`, token, {
      ...f.payload,
      markdown: '## 新的正文\n待审',
      summary: '补充指南',
    });
  assert.equal(
    (await f.call(`/api/wiki/entries/${id}/submissions`, f.author.token, f.payload)).status,
    422,
  );
  const first = await edit();
  assert.equal(first.status, 202);
  assert.equal((await edit(f.other.token)).status, 409);
  assert.equal((await edit()).status, 409);
  let current = (await f.api(`/api/wiki/entries/${id}`)).data.entry;
  assert.equal(current.markdown, f.payload.markdown);
  assert.equal(current.auto_locked, true);
  await f.call(`/api/user/submissions/${first.data.id}/withdraw`, f.author.token);
  assert.equal((await f.api(`/api/wiki/entries/${id}`)).data.entry.auto_locked, false);
  const second = await edit();
  assert.equal(second.status, 202);
  await f.call(
    `/api/admin/wiki/entries/${id}`,
    f.admin.token,
    { manual_locked: true, lock_reason: '核实资料' },
    'PUT',
  );
  assert.equal((await f.decide(f.admin, second.data.id)).status, 409);
  assert.equal((await f.decide(f.admin, second.data.id, 'reject', '资料不足')).status, 200);
  current = (await f.api(`/api/wiki/entries/${id}`)).data.entry;
  assert.equal(current.manual_locked, 1);
  assert.equal(current.auto_locked, false);
  assert.equal((await edit()).status, 409);
  await f.call(`/api/admin/wiki/entries/${id}`, f.admin.token, { manual_locked: false }, 'PUT');
  const third = await edit();
  assert.equal((await f.decide(f.admin, third.data.id)).status, 200);
  current = (await f.api(`/api/wiki/entries/${id}`)).data.entry;
  assert.equal(current.markdown, '## 新的正文\n待审');
  assert.equal(current.auto_locked, false);
  assert.equal((await f.api(`/api/wiki/entries/${id}/history`)).data.revisions.length, 2);
});
test('Wiki rollback, hidden history, deletion and atomic notifications', async (t) => {
  const f = await setup(t);
  const id = await f.published();
  const first = (await f.api(`/api/wiki/entries/${id}`)).data.entry.current_revision_id;
  const edit = await f.call(`/api/wiki/entries/${id}/submissions`, f.other.token, {
    ...f.payload,
    summary: '补充',
    markdown: '更新正文',
  });
  await f.decide(f.admin, edit.data.id);
  assert.equal(
    (await f.call(`/api/admin/wiki/entries/${id}/rollback`, f.admin.token, { revision_id: first }))
      .status,
    200,
  );
  assert.equal((await f.api(`/api/wiki/entries/${id}`)).data.entry.markdown, f.payload.markdown);
  assert.equal(
    (await f.call(`/api/admin/wiki/entries/${id}/revisions/${first}/hide`, f.admin.token)).status,
    200,
  );
  assert.equal((await f.api(`/api/wiki/entries/${id}/revisions/${first}`)).status, 404);
  assert.equal((await f.api(`/api/wiki/entries/${id}/history`)).data.revisions.length, 2);
  const pending = await f.call(`/api/wiki/entries/${id}/submissions`, f.author.token, {
    ...f.payload,
    summary: '待审核',
  });
  assert.equal(
    (await f.call(`/api/admin/wiki/entries/${id}/rollback`, f.admin.token, { revision_id: first }))
      .status,
    409,
  );
  assert.equal(
    (await f.call(`/api/admin/wiki/entries/${id}`, f.admin.token, undefined, 'DELETE')).status,
    200,
  );
  assert.equal((await f.api(`/api/wiki/entries/${id}`)).status, 404);
  assert.equal((await f.api('/api/wiki')).data.entries.length, 0);
  const request = query(f.db, 'SELECT status FROM moderation_requests WHERE id=?').get(
    pending.data.id,
  );
  assert.equal(request.status, 'rejected');
  assert.ok(
    query(f.db, "SELECT id FROM messages WHERE user_id=? AND title='Wiki 修改申请已失效'").get(
      f.author.id,
    ),
  );
  assert.ok(query(f.db, "SELECT id FROM account_audit WHERE action='wiki.entry.deleted'").get());
});
test('Wiki withdrawal releases pending edit; daily quota and self-review', async (t) => {
  const f = await setup(t);
  const id = await f.published();
  const pending = await f.call(`/api/wiki/entries/${id}/submissions`, f.author.token, {
    ...f.payload,
    summary: '修改',
  });
  const unbind = await f.call(
    `/api/user/submissions/${pending.data.id}/withdraw`,
    f.author.token,
    {},
  );
  assert.equal(unbind.status, 200);
  assert.equal((await f.api(`/api/wiki/entries/${id}`)).data.entry.auto_locked, false);
  assert.equal(
    query(f.db, 'SELECT status FROM moderation_requests WHERE id=?').get(pending.data.id).status,
    'withdrawn',
  );
  assert.equal((await f.api(`/api/wiki/entries/${id}/history`)).data.revisions.length, 1);
  const self = await f.submit({ ...f.payload, title: '管理员自建', aliases: [] }, f.admin.token);
  assert.equal((await f.decide(f.admin, self.data.id)).status, 403);
  for (let i = 0; i < 10; i++)
    assert.equal(
      (await f.submit({ ...f.payload, title: '每日配额' + i, aliases: [] }, f.other.token)).status,
      202,
    );
  assert.equal(
    (await f.submit({ ...f.payload, title: '超限', aliases: [] }, f.other.token)).status,
    429,
  );
});
test('Wiki image validation, pending privacy and publication rollback', async (t) => {
  const f = await setup(t);
  const buffer = await sharp({
    create: { width: 4, height: 4, channels: 3, background: '#55aa33' },
  })
    .webp()
    .toBuffer();
  const data = new FormData();
  data.set('image', new Blob([buffer], { type: 'image/webp' }), 'wiki.webp');
  const upload = await f.call('/api/wiki/images', f.author.token, data);
  assert.equal(upload.status, 201, JSON.stringify(upload.data));
  const uploads = [upload.data];
  for (let i = 1; i < 9; i++) {
    const next = await f.call('/api/wiki/images', f.author.token, data);
    assert.equal(next.status, 201);
    uploads.push(next.data);
  }
  assert.equal(new Set(uploads.map((image) => image.id)).size, 9);
  const imageRequest = (token) => f.api(upload.data.url, { token });
  assert.equal((await imageRequest()).status, 404);
  const payload = {
    ...f.payload,
    images: uploads.map((image) => image.id),
    markdown: uploads.map((image) => `![图片](${image.url})`).join('\n'),
  };
  assert.equal((await f.submit(payload, f.other.token)).status, 422);
  const pending = await f.submit(payload);
  assert.equal(pending.status, 202);
  // A trigger simulates a failure after publication: no revision, status, or notification survives.
  f.db.$client.exec(
    "CREATE TRIGGER wiki_test_failure BEFORE INSERT ON account_audit WHEN NEW.action='submission.approved' BEGIN SELECT RAISE(ABORT,'failure'); END;",
  );
  assert.equal((await f.decide(f.admin, pending.data.id)).status, 500);
  assert.equal(query(f.db, 'SELECT count(*) n FROM wiki_revisions').get().n, 0);
  assert.equal(
    query(f.db, 'SELECT status FROM moderation_requests WHERE id=?').get(pending.data.id).status,
    'pending',
  );
  assert.equal((await imageRequest()).status, 404);
  f.db.$client.exec('DROP TRIGGER wiki_test_failure');
  assert.equal((await f.decide(f.admin, pending.data.id)).status, 200);
  for (const image of uploads)
    assert.equal((await f.app.request('http://localhost' + image.url)).status, 200);
  const bad = new FormData();
  bad.set('image', new Blob(['broken'], { type: 'image/webp' }), 'broken.webp');
  assert.equal((await f.call('/api/wiki/images', f.author.token, bad)).status, 422);
});

test('Wiki migration preserves legacy requests and remains idempotent', async (t) => {
  const f = await setup(t);
  const legacy = await f.call('/api/user/nickname', f.user.token, { nickname: '旧申请' }, 'PUT');
  assert.equal(legacy.status, 202);
  const original = query(f.db, 'SELECT * FROM moderation_requests WHERE id=?').get(legacy.data.id);
  const indexes = query(
    f.db,
    "SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='moderation_requests' AND sql IS NOT NULL AND name<>'wiki_pending_edit'",
  ).all();
  const schema = query(f.db, "SELECT sql FROM sqlite_master WHERE name='moderation_requests'").get()
    .sql;
  f.db.$client.exec(
    schema
      .replace('moderation_requests', 'moderation_legacy')
      .replace(", 'wiki_create', 'wiki_edit'", '')
      .replace(",'wiki_create','wiki_edit'", ''),
  );
  f.db.$client.exec(
    'INSERT INTO moderation_legacy SELECT * FROM moderation_requests; DROP TABLE moderation_requests; ALTER TABLE moderation_legacy RENAME TO moderation_requests;',
  );
  for (const index of indexes) f.db.$client.exec(index.sql);
  const migrate = require('../apps/api/src/domain/wiki/store').migrate;
  migrate(f.db);
  migrate(f.db);
  assert.deepEqual(
    query(f.db, 'SELECT * FROM moderation_requests WHERE id=?').get(legacy.data.id),
    original,
  );
  assert.equal((await f.submit()).status, 202);
  assert.equal((await f.decide(f.admin, legacy.data.id)).status, 200);
});

test('Wiki concurrent edits, stale drafts, invalid folders and banned authors', async (t) => {
  const f = await setup(t);
  const id = await f.published();
  const entry = (await f.api(`/api/wiki/entries/${id}`)).data.entry;
  assert.equal(
    (
      await f.call(`/api/wiki/entries/${id}/submissions`, f.author.token, {
        ...f.payload,
        summary: '过期',
        base_revision_id: entry.current_revision_id + 50,
      })
    ).status,
    409,
  );
  const submissions = await Promise.all(
    [f.author, f.other].map((u) =>
      f.call(`/api/wiki/entries/${id}/submissions`, u.token, { ...f.payload, summary: '并发编辑' }),
    ),
  );
  assert.deepEqual(submissions.map((r) => r.status).sort(), [202, 409]);
  const request = query(
    f.db,
    "SELECT * FROM moderation_requests WHERE kind='wiki_edit' AND status='pending'",
  ).get();
  query(f.db, "UPDATE users SET status='banned' WHERE id=?").run(request.user_id);
  assert.equal((await f.decide(f.admin, request.id)).status, 409);
  assert.equal((await f.decide(f.admin, request.id, 'reject', '账号状态已变化')).status, 200);
  assert.equal((await f.api(`/api/wiki/entries/${id}`)).data.entry.auto_locked, false);
  assert.equal(
    (
      await f.call(
        `/api/admin/wiki/folders/${f.top}`,
        f.admin.token,
        { name: '循环', parent_id: f.sub },
        'PUT',
      )
    ).status,
    422,
  );
  const empty = await f.call('/api/admin/wiki/folders', f.admin.token, { name: '可删除' });
  assert.equal(
    (await f.call(`/api/admin/wiki/folders/${empty.data.id}`, f.admin.token, undefined, 'DELETE'))
      .status,
    200,
  );
  assert.equal(
    (await f.api('/api/wiki')).data.folders.some((folder) => folder.id === empty.data.id),
    false,
  );
});
