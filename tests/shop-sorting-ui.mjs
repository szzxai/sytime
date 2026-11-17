import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { browserFixture } from './helpers/browser-v2.mjs';
import database from './helpers/database.cjs';
import store from '../apps/api/src/domain/shops/store.js';

const f = await browserFixture('sytime-shop-sorting-ui-');
const { base, api } = f.site;
const artifactDirectory = path.join(f.site.root, 'output/playwright/shop-sorting');
fs.mkdirSync(artifactDirectory, { recursive: true });

async function expectedRows(sort, order, extras = {}) {
  const params = new URLSearchParams({ sort, order, ...extras });
  return (await api('/api/shops?' + params)).data.shops;
}
async function rowsMatch(page, expected) {
  const ids = expected.map((s) => String(s.id));
  await page.waitForFunction(
    (ids) =>
      JSON.stringify(
        [...document.querySelectorAll('#shopGrid .card__link')].map((a) =>
          new URL(a.href).searchParams.get('id'),
        ),
      ) === JSON.stringify(ids),
    ids,
  );
  f.check(true, 'visible rows match the complete sorted result');
}
async function sort(page, method, order) {
  await page.locator('#sortSelect').selectOption(method);
  await page.locator('#sortOrderSelect').selectOption(order);
  await page.waitForURL(
    (url) => url.searchParams.get('sort') === method && url.searchParams.get('order') === order,
  );
}

try {
  const account = await f.account('sorting_browser', 'student');
  const reviewers = [account];
  for (let i = 1; i < 3; i++) reviewers.push(await f.account('sorting_reviewer_' + i, 'student'));
  const db = new database.DatabaseSync(path.join(f.site.directory, 'data.db'));
  try {
    for (let i = 24; i >= 0; i--) {
      const shop = store.create(
        db,
        {
          name: '排序店' + String(i).padStart(2, '0'),
          address: '十梓街 ' + (i + 1) + ' 号',
          type: '面馆',
          lat: 31.3004,
          lng: 120.6226,
          campus_distance_m: 100 + i * 50,
          campus_walk_min: 1 + ((i * 7) % 25),
          metro_station: '乐桥',
          metro_exit: '1号口',
          metro_distance_m: 50 + i * 10,
          metro_walk_min: 1 + i,
        },
        account.user,
        store.loadConfig(f.site.directory),
      );
      for (let j = 0; j < i % 4; j++) {
        db.prepare('INSERT INTO shop_likes(shop_id,user_id) VALUES(?,?)').run(
          shop.id,
          reviewers[j].user.id,
        );
        db.prepare('INSERT INTO shop_reviews(shop_id,user_id,rating) VALUES(?,?,?)').run(
          shop.id,
          reviewers[j].user.id,
          1 + (i % 5),
        );
      }
    }
  } finally {
    db.close();
  }

  const guest = await f.context(null);
  const page = guest.page;
  await page.goto(base + '/shops.html?type=' + encodeURIComponent('面馆'), {
    waitUntil: 'networkidle',
  });
  await rowsMatch(page, (await expectedRows('campus', 'asc')).slice(0, 20));
  for (const method of ['campus', 'walk', 'likes', 'reviews', 'rating']) {
    for (const order of ['asc', 'desc']) {
      await sort(page, method, order);
      await rowsMatch(page, (await expectedRows(method, order)).slice(0, 20));
      f.check(
        new URL(page.url()).searchParams.get('type') === '面馆',
        'sorting preserves type filter',
      );
    }
  }
  await sort(page, 'walk', 'asc');
  await page.locator('#pager').getByRole('button', { name: '下一页', exact: true }).click();
  await rowsMatch(page, (await expectedRows('walk', 'asc')).slice(20));
  await page.locator('#sortOrderSelect').selectOption('desc');
  await rowsMatch(page, (await expectedRows('walk', 'desc')).slice(0, 20));
  f.check(!new URL(page.url()).searchParams.has('page'), 'direction changes reset pagination');
  await page.locator('#shopSearch').fill('排序店');
  await page.locator('#distanceMax').fill('650');
  await sort(page, 'walk', 'asc');
  await rowsMatch(page, await expectedRows('walk', 'asc', { q: '排序店', distance_max_m: '650' }));
  f.check(new URL(page.url()).searchParams.get('q') === '排序店', 'sorting preserves keyword');
  f.check(
    new URL(page.url()).searchParams.get('distance_max_m') === '650',
    'sorting preserves numeric ranges',
  );
  await page.reload({ waitUntil: 'networkidle' });
  f.check((await page.locator('#sortSelect').inputValue()) === 'walk', 'reload restores method');
  f.check(
    (await page.locator('#sortOrderSelect').inputValue()) === 'asc',
    'reload restores direction',
  );
  await page.locator('#sortOrderSelect').selectOption('desc');
  await rowsMatch(page, await expectedRows('walk', 'desc', { q: '排序店', distance_max_m: '650' }));
  await page.goBack();
  await rowsMatch(page, await expectedRows('walk', 'asc', { q: '排序店', distance_max_m: '650' }));
  f.check(
    (await page.locator('#sortOrderSelect').inputValue()) === 'asc',
    'back restores previous sort direction',
  );
  await page.goForward();
  await rowsMatch(page, await expectedRows('walk', 'desc', { q: '排序店', distance_max_m: '650' }));
  await page.locator('#shopGrid .card__link').first().click();
  await page.locator('.back-link').click();
  await rowsMatch(page, await expectedRows('walk', 'desc', { q: '排序店', distance_max_m: '650' }));
  f.check(
    (await page.locator('#sortOrderSelect').inputValue()) === 'desc',
    'detail return restores sort',
  );
  for (const method of ['az', 'metro', 'new']) {
    await page.locator('#sortSelect').selectOption(method);
    await page.waitForFunction(() => !document.querySelector('#sortOrderSelect'));
    await rowsMatch(
      page,
      await expectedRows(method, 'desc', { q: '排序店', distance_max_m: '650' }),
    );
  }
  await page.locator('#clearShopFilters').click();
  await rowsMatch(page, (await expectedRows('campus', 'asc')).slice(0, 20));
  f.check((await page.locator('#shopSearch').inputValue()) === '', 'clear resets filters');
  f.check((await page.locator('#sortOrderSelect').inputValue()) === 'asc', 'clear resets sort');

  let failSort = true;
  await page.route('**/api/shops?**', (route) => {
    const url = new URL(route.request().url());
    if (failSort && url.searchParams.get('sort') === 'walk')
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: '测试排序失败' }),
      });
    return route.continue();
  });
  await page.goto(base + '/shops.html?sort=walk&order=asc', { waitUntil: 'networkidle' });
  await page.getByText('测试排序失败', { exact: true }).waitFor();
  f.check(
    !(await page.getByText('没有找到相关店铺', { exact: true }).count()),
    'request error is not an empty state',
  );
  f.check(
    (await page.locator('#sortOrderSelect').inputValue()) === 'asc',
    'error retains direction',
  );
  failSort = false;
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await rowsMatch(page, (await expectedRows('walk', 'asc')).slice(0, 20));
  await page.unroute('**/api/shops?**');

  await page.route('**/api/shops?**', async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('sort') === 'likes' && url.searchParams.get('order') === 'asc')
      await new Promise((resolve) => setTimeout(resolve, 600));
    await route.continue().catch(() => {});
  });
  await page.locator('#sortSelect').selectOption('likes');
  await page.locator('#sortOrderSelect').selectOption('asc');
  await page.locator('#sortOrderSelect').selectOption('desc');
  await rowsMatch(page, (await expectedRows('likes', 'desc')).slice(0, 20));
  await page.waitForTimeout(750);
  await rowsMatch(page, (await expectedRows('likes', 'desc')).slice(0, 20));
  f.check(
    (await page.locator('#sortSelect').inputValue()) === 'likes',
    'rapid changes keep the latest method',
  );
  await page.unroute('**/api/shops?**');

  const owner = await f.context(account);
  await owner.page.goto(base + '/settings.html#site', { waitUntil: 'networkidle' });
  await owner.page.locator('#shopDefaultSort').selectOption('walk');
  f.check(
    (await owner.page.locator('#shopDefaultOrder').inputValue()) === 'asc',
    'settings use method default',
  );
  await owner.page.locator('#shopDefaultOrder').selectOption('desc');
  const saved = owner.page.waitForResponse(
    (r) => r.url().endsWith('/api/user/settings') && r.request().method() === 'PUT',
  );
  await owner.page.locator('#siteSubmit').click();
  const savedResponse = await saved;
  assert.equal(savedResponse.status(), 200);
  assert.deepEqual(
    {
      sort: (await savedResponse.json()).shop_default_sort,
      order: (await savedResponse.json()).shop_default_order,
    },
    { sort: 'walk', order: 'desc' },
    'settings response must contain both submitted sort fields: ' +
      savedResponse.request().postData(),
  );
  await owner.page.getByText('网站设置已保存到账号', { exact: true }).waitFor();
  const persisted = (await api('/api/user/profile', { token: account.token })).data.user;
  f.check(
    persisted.shop_default_sort === 'walk' && persisted.shop_default_order === 'desc',
    'both preference fields persist',
  );
  await owner.page.goto(base + '/shops.html', { waitUntil: 'networkidle' });
  await rowsMatch(owner.page, (await expectedRows('walk', 'desc')).slice(0, 20));
  f.check(
    (await owner.page.locator('#sortSelect').inputValue()) === 'walk',
    'fresh profile overrides stale stored login defaults',
  );
  await sort(owner.page, 'likes', 'asc');
  f.check(
    (await api('/api/user/profile', { token: account.token })).data.user.shop_default_sort ===
      'walk',
    'temporary list sorting does not overwrite defaults',
  );
  await owner.page.goto(base + '/shops.html?sort=rating', { waitUntil: 'networkidle' });
  f.check(
    (await owner.page.locator('#sortOrderSelect').inputValue()) === 'desc',
    'old link keeps the method default rather than saved direction',
  );
  await owner.page.goto(base + '/settings.html#site', { waitUntil: 'networkidle' });
  await owner.page.locator('#shopDefaultSort').selectOption('az');
  f.check(
    !(await owner.page.locator('#shopDefaultOrder').isVisible()),
    'fixed sort hides direction in settings',
  );
  await owner.page.locator('#shopDefaultSort').selectOption('rating');
  await owner.page.locator('#shopDefaultOrder').selectOption('asc');
  await owner.page.route('**/api/user/settings', (route) =>
    route.request().method() === 'PUT'
      ? route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ message: '测试保存失败' }),
        })
      : route.continue(),
  );
  await owner.page.locator('#siteSubmit').click();
  await owner.page.getByText('测试保存失败', { exact: true }).waitFor();
  f.check(
    (await owner.page.locator('#shopDefaultSort').inputValue()) === 'rating',
    'failed save preserves draft method',
  );
  f.check(
    (await owner.page.locator('#shopDefaultOrder').inputValue()) === 'asc',
    'failed save preserves draft direction',
  );
  f.check(
    (await api('/api/user/profile', { token: account.token })).data.user.shop_default_order ===
      'desc',
    'failed save leaves persisted preference unchanged',
  );
  await owner.page.unroute('**/api/user/settings');

  for (const [width, theme] of [
    [320, 'light'],
    [390, 'dark'],
    [768, 'light'],
    [1280, 'light'],
    [1280, 'dark'],
  ]) {
    const visual = await f.context(account, { width, theme });
    await visual.page.goto(base + '/shops.html?sort=walk&order=desc', { waitUntil: 'networkidle' });
    await rowsMatch(visual.page, (await expectedRows('walk', 'desc')).slice(0, 20));
    await f.audit(visual.page, `shop sorting ${width} ${theme}`);
    f.check(
      await visual.page
        .locator('#sortSelect')
        .evaluate((select) => select.classList.contains('select')),
      'sorting reuses existing select style',
    );
    await visual.page.screenshot({
      path: path.join(artifactDirectory, `list-${width}-${theme}.png`),
      fullPage: true,
    });
    await visual.page.goto(base + '/settings.html#site', { waitUntil: 'networkidle' });
    await f.audit(visual.page, `shop default sorting ${width} ${theme}`);
    if (width === 390 || width === 1280)
      await visual.page.screenshot({
        path: path.join(artifactDirectory, `settings-${width}-${theme}.png`),
        fullPage: true,
      });
    await visual.ctx.close();
  }
  await guest.ctx.close();
  await owner.ctx.close();
  console.log(
    `${f.checks} sorting/browser/accessibility checks passed; screenshots: ${artifactDirectory}`,
  );
} finally {
  await f.close();
}
