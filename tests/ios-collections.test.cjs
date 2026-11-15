'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./helpers/accounts-fixture.cjs');

test('iOS 收藏夹重命名：所有权、输入校验与隐私保持', async (t) => {
  const { api, account } = await fixture(t);
  const owner = await account('ios_owner');
  const stranger = await account('ios_other');
  const created = await api('/api/collections', {
    method: 'POST',
    token: owner.token,
    body: { section: 'shops', name: '原名称', is_public: 0 },
  });
  assert.equal(created.status, 201);
  const id = created.data.collection.id;
  const rename = (token, name) =>
    api(`/api/collections/${id}`, { method: 'PUT', token, body: { name } });
  assert.equal((await rename(undefined, '越权')).status, 401);
  assert.equal((await rename(stranger.token, '越权')).status, 403);
  for (const invalid of ['', '   ', 'a'.repeat(101), 123, null]) {
    assert.equal((await rename(owner.token, invalid)).status, 400);
  }
  const result = await rename(owner.token, '  放学后去吃  ');
  assert.equal(result.status, 200);
  assert.equal(result.data.collection.name, '放学后去吃');
  assert.equal(result.data.collection.is_public, false);
  const list = await api('/api/collections?section=shops', { token: owner.token });
  assert.equal(list.data.collections.find((c) => c.id === id).name, '放学后去吃');
  assert.equal((await api(`/api/collections/${id}/items`, { token: stranger.token })).status, 403);
  assert.equal(
    (
      await api('/api/collections/999999', {
        method: 'PUT',
        token: owner.token,
        body: { name: 'missing' },
      })
    ).status,
    404,
  );
});
