import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import appFixture from './app-fixture.cjs';
import database from './database.cjs';
import shops from '../../apps/api/src/domain/shops/store.js';
export const PASSWORD = 'CampusTest2026';
export async function browserFixture(prefix) {
  const site = await appFixture.startApp(prefix);
  const browser = await chromium.launch();
  const errors = [];
  async function account(username, role = 'user') {
    const registration = await site.api('/api/register', {
      method: 'POST',
      body: { username, nickname: '测试' + username.slice(-5), password: PASSWORD },
    });
    assert.equal(registration.status, 201, JSON.stringify(registration.data));
    const db = new database.DatabaseSync(path.join(site.directory, 'data.db'));
    try {
      db.prepare('UPDATE users SET role=?,nickname=? WHERE id=?').run(
        role,
        '测试' + username.slice(-5),
        registration.data.id,
      );
    } finally {
      db.close();
    }
    const login = await site.api('/api/login', {
      method: 'POST',
      body: { username, password: PASSWORD },
    });
    assert.equal(login.status, 200);
    return { ...login.data, username };
  }
  function seedShop(user, name = '校园测试面馆') {
    const db = new database.DatabaseSync(path.join(site.directory, 'data.db'));
    try {
      return shops.create(
        db,
        {
          name,
          address: '十梓街 123 号',
          type: '面馆',
          lat: 31.3004,
          lng: 120.6226,
          campus_distance_m: 420,
          campus_walk_min: 6,
          metro_station: '乐桥',
          metro_exit: '3 号口',
          metro_distance_m: 480,
          metro_walk_min: 7,
        },
        typeof user === 'number' ? { id: user, username: '测试学生' } : user,
        shops.loadConfig(site.directory),
      );
    } finally {
      db.close();
    }
  }
  async function context(login, { width = 1280, theme = 'light', cookie = false } = {}) {
    const ctx = await browser.newContext({
      viewport: { width, height: 900 },
      reducedMotion: 'reduce',
      colorScheme: theme,
    });
    await ctx.addInitScript(
      ({ theme, login, cookie }) => {
        localStorage.setItem('theme', theme);
        if (login) {
          localStorage.setItem('token', cookie ? 'session' : login.token);
          localStorage.setItem('user', JSON.stringify(login.user));
        }
      },
      { theme, login, cookie },
    );
    if (cookie && login)
      await ctx.addCookies([
        {
          name: 'sytime_session',
          value: login.token,
          url: site.base,
          httpOnly: true,
          sameSite: 'Strict',
        },
      ]);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    return { ctx, page };
  }
  const axe = fs.readFileSync(path.join(site.root, 'node_modules/axe-core/axe.min.js'), 'utf8');
  let checks = 0;
  function check(value, message) {
    assert.ok(value, message);
    checks++;
  }
  async function audit(page, label) {
    await page.evaluate(axe);
    const violations = await page.evaluate(async () =>
      (
        await window.axe.run(document, {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
        })
      ).violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
      })),
    );
    assert.deepEqual(violations, [], label + ' accessibility');
    checks++;
    check(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      label + ' no horizontal overflow',
    );
  }
  async function close() {
    await browser.close();
    await site.stop();
    assert.deepEqual(errors, []);
  }
  return {
    site,
    browser,
    errors,
    account,
    seedShop,
    context,
    audit,
    check,
    close,
    get checks() {
      return checks;
    },
  };
}
