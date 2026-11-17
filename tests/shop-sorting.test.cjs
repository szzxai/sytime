'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { query } = require('../packages/db/src/client.ts');
const initialize = require('../apps/api/src/database.js');
const store = require('../apps/api/src/domain/shops/store.js');
const {
  normalizeShopSorting,
  defaultShopOrder,
  shopSortHasOrder,
} = require('../packages/shared/src/shopSort.ts');
const { shopFilters } = require('../apps/web/src/lib/navigation.ts');
const { fixture, SHOP } = require('./helpers/accounts-fixture.cjs');

test('排序规范化与链接、账号偏好的优先级', () => {
  for (const sort of ['campus', 'walk', 'likes', 'reviews', 'rating']) {
    assert.equal(shopSortHasOrder(sort), true);
    for (const order of ['asc', 'desc'])
      assert.deepEqual(normalizeShopSorting(sort, order), { sort, order });
  }
  for (const sort of ['az', 'metro', 'new']) {
    assert.equal(shopSortHasOrder(sort), false);
    for (const order of ['asc', 'desc'])
      assert.equal(normalizeShopSorting(sort, order).order, defaultShopOrder(sort));
  }
  for (const value of ['unknown', '__proto__', '', null, 42])
    assert.deepEqual(normalizeShopSorting(value, 'desc'), { sort: 'campus', order: 'asc' });
  for (const sort of ['north', 'east'])
    assert.deepEqual(normalizeShopSorting(sort), { sort: 'campus', order: 'asc' });
  assert.deepEqual(normalizeShopSorting('rating', 'invalid'), { sort: 'rating', order: 'desc' });
  const user = { shop_default_sort: 'walk', shop_default_order: 'desc', shop_default_type: '面馆' };
  assert.deepEqual(shopFilters({}, user), { type: '面馆', sort: 'walk', order: 'desc' });
  assert.deepEqual(shopFilters({ sort: 'likes' }, user), {
    type: '面馆',
    sort: 'likes',
    order: 'desc',
  });
  assert.deepEqual(shopFilters({ sort: 'walk' }, user), {
    type: '面馆',
    sort: 'walk',
    order: 'asc',
  });
  assert.deepEqual(shopFilters({ order: 'asc', type: '' }, user), {
    type: '',
    sort: 'walk',
    order: 'asc',
  });
  assert.deepEqual(shopFilters({ order: 'desc' }, null), {
    type: '',
    sort: 'campus',
    order: 'desc',
  });
  assert.equal(shopFilters({ sort: 'bad', order: 'desc' }, user).order, 'asc');
  assert.equal(shopFilters({ sort: 'rating', order: 'bad' }, user).order, 'desc');
  assert.equal(shopFilters({ sort: 'az', order: 'desc' }, user).order, 'asc');
  assert.equal(shopFilters({}, { shop_default_sort: 'rating' }).order, 'desc');
});

test('公开列表的十种排序、固定旧选项、无评分、稳定同值与完整结果', async (t) => {
  const f = await fixture(t);
  const people = [];
  for (let i = 0; i < 4; i++) people.push(await f.account('sorting_person_' + i, 'student'));
  const specs = [
    { key: 'A', distance: 100, walk: 9, likes: 0, ratings: [] },
    { key: 'B', distance: 200, walk: 7, likes: 1, ratings: [5] },
    { key: 'C', distance: 300, walk: 4, likes: 2, ratings: [1, 5] },
    { key: 'D', distance: 200, walk: 7, likes: 1, ratings: [3] },
    { key: 'E', distance: 400, walk: 2, likes: 0, ratings: [4, 4, 4] },
  ];
  const ids = {};
  const config = store.loadConfig(f.root);
  const seed = (spec) => {
    const shop = store.create(
      f.db,
      {
        ...SHOP,
        name: '排序' + spec.key,
        campus_distance_m: spec.distance,
        campus_walk_min: spec.walk,
      },
      people[0],
      config,
    );
    for (let i = 0; i < spec.likes; i++)
      query(f.db, 'INSERT INTO shop_likes(shop_id,user_id) VALUES(?,?)').run(shop.id, people[i].id);
    spec.ratings.forEach((rating, i) =>
      query(f.db, 'INSERT INTO shop_reviews(shop_id,user_id,rating) VALUES(?,?,?)').run(
        shop.id,
        people[i].id,
        rating,
      ),
    );
    ids[spec.key] = shop.id;
    return shop;
  };
  for (const spec of specs) seed(spec);
  const expected = {
    campus: { asc: 'ABDCE', desc: 'ECBDA' },
    walk: { asc: 'ECBDA', desc: 'ABDCE' },
    likes: { asc: 'AEBDC', desc: 'CBDAE' },
    reviews: { asc: 'ABDCE', desc: 'ECBDA' },
    rating: { asc: 'CDEBA', desc: 'BECDA' },
  };
  for (const [sort, orders] of Object.entries(expected)) {
    for (const [order, keys] of Object.entries(orders)) {
      const response = await f.api(`/api/shops?sort=${sort}&order=${order}`);
      assert.equal(response.status, 200);
      assert.equal(response.data.total, 5);
      assert.equal(response.data.sort, sort);
      assert.equal(response.data.order, order);
      assert.deepEqual(
        response.data.shops.map((s) => s.id),
        [...keys].map((key) => ids[key]),
        `${sort} ${order}`,
      );
      assert.deepEqual(
        (await f.api(`/api/shops?sort=${sort}&order=${order}`)).data.shops.map((s) => s.id),
        response.data.shops.map((s) => s.id),
      );
    }
  }
  const zero = (await f.api('/api/shops?sort=likes&order=asc&likes_max=0')).data;
  assert.deepEqual(
    zero.shops.map((s) => s.id),
    [ids.A, ids.E],
  );
  assert.equal(
    (await f.api('/api/shops?sort=rating&order=asc')).data.shops.at(-1).rating_avg,
    null,
  );
  for (const sort of ['az', 'metro', 'new']) {
    const asc = (await f.api(`/api/shops?sort=${sort}&order=asc`)).data;
    const desc = (await f.api(`/api/shops?sort=${sort}&order=desc`)).data;
    assert.equal(asc.sort, sort);
    assert.deepEqual(
      asc.shops.map((s) => s.id),
      desc.shops.map((s) => s.id),
    );
  }
  const invalid = (await f.api('/api/shops?sort=unknown&order=desc')).data;
  assert.equal(invalid.sort, 'campus');
  assert.equal(invalid.order, 'asc');
  assert.equal(
    (await f.api('/api/shops?sort=campus&order=desc%3BDROP%20TABLE%20shops')).data.order,
    'asc',
  );
  for (const sort of ['north', 'east'])
    assert.equal((await f.api(`/api/shops?sort=${sort}`)).data.sort, 'campus');
  const high = seed({ key: 'F精度', distance: 500, walk: 12, likes: 0, ratings: [4, 4, 5] });
  const low = seed({ key: 'G精度', distance: 600, walk: 15, likes: 0, ratings: [4, 4, 4, 5] });
  assert.deepEqual(
    (
      await f.api('/api/shops?q=' + encodeURIComponent('精度') + '&sort=rating&order=desc')
    ).data.shops.map((s) => s.id),
    [high.id, low.id],
  );
  for (let i = 24; i >= 0; i--)
    seed({ key: '分页' + i, distance: 100 + i * 10, walk: i + 1, likes: 0, ratings: [] });
  const all = (
    await f.api('/api/shops?q=' + encodeURIComponent('分页') + '&sort=walk&order=desc&page=2')
  ).data;
  assert.equal(all.total, 25);
  assert.equal(all.shops.length, 25);
  assert.deepEqual(
    all.shops.map((s) => s.campus_walk_min),
    Array.from({ length: 25 }, (_, i) => 25 - i),
  );
  const azNames = ['中文馆', '阿婆馆', 'Blue Cup'];
  for (const name of azNames) store.create(f.db, { ...SHOP, name }, people[0], config);
  const az = (await f.api('/api/shops?sort=az')).data.shops;
  const collator = new Intl.Collator('zh-Hans-CN-u-co-pinyin', {
    numeric: true,
    sensitivity: 'base',
  });
  assert.deepEqual(
    az.map((s) => s.name),
    [...az].sort((a, b) => collator.compare(a.name, b.name) || a.id - b.id).map((s) => s.name),
  );
});

test('默认方式和方向按账号保存、跨会话读取并兼容旧偏好及数据库', async (t) => {
  const f = await fixture(t);
  const user = await f.account('sorting_preferences');
  const stranger = await f.account('sorting_stranger');
  const settings = (body, token = user.token) =>
    f.api('/api/user/settings', { method: 'PUT', token, body });
  const profile = (token = user.token) => f.api('/api/user/profile', { token });
  for (const sort of ['campus', 'walk', 'likes', 'reviews', 'rating']) {
    for (const order of ['asc', 'desc']) {
      const saved = await settings({ shop_default_sort: sort, shop_default_order: order });
      assert.equal(saved.status, 200);
      assert.equal(saved.data.shop_default_sort, sort);
      assert.equal(saved.data.shop_default_order, order);
      const read = (await profile()).data.user;
      assert.equal(read.shop_default_sort, sort);
      assert.equal(read.shop_default_order, order);
    }
  }
  const secondSession = await f.login(user.username);
  assert.equal((await profile(secondSession)).data.user.shop_default_order, 'desc');
  assert.equal((await profile(stranger.token)).data.user.shop_default_sort, 'campus');
  await f.api('/api/shops?sort=walk&order=asc', { token: user.token });
  assert.equal((await profile()).data.user.shop_default_sort, 'rating');
  await settings({ shop_layout: 'split' });
  assert.equal((await profile()).data.user.shop_default_order, 'desc');
  for (const sort of ['az', 'metro', 'new']) {
    assert.equal(
      (await settings({ shop_default_sort: sort, shop_default_order: 'desc' })).data
        .shop_default_order,
      defaultShopOrder(sort),
    );
  }
  for (const sort of ['unknown', null, '__proto__']) {
    const saved = await settings({ shop_default_sort: sort, shop_default_order: 'desc' });
    assert.equal(saved.data.shop_default_sort, 'campus');
    assert.equal(saved.data.shop_default_order, 'asc');
  }
  assert.equal((await settings({ shop_default_sort: 'likes' })).data.shop_default_order, 'desc');
  assert.equal(
    (await settings({ shop_default_sort: 'walk', shop_default_order: 'bad' })).data
      .shop_default_order,
    'asc',
  );
  assert.equal((await settings({ shop_default_order: 'desc' })).data.shop_default_order, 'desc');
  const failed = await settings({
    shop_default_sort: 'rating',
    shop_default_order: 'asc',
    collection_default_public: 42,
  });
  assert.equal(failed.status, 400);
  assert.equal((await profile()).data.user.shop_default_sort, 'walk');
  query(f.db, "UPDATE users SET shop_default_sort='rating' WHERE id=?").run(user.id);
  f.db.$client.exec('ALTER TABLE users DROP COLUMN shop_default_order');
  initialize(f.db);
  initialize(f.db);
  const legacy = (await profile()).data.user;
  assert.equal(legacy.shop_default_sort, 'rating');
  assert.equal(legacy.shop_default_order, '');
  assert.equal(
    normalizeShopSorting(legacy.shop_default_sort, legacy.shop_default_order).order,
    'desc',
  );
  assert.equal(
    (await settings({ shop_default_sort: 'walk', shop_default_order: 'desc' })).data
      .shop_default_order,
    'desc',
  );
});
