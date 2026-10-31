import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import databaseHelper from './helpers/database.cjs';
import menuStore from '../apps/api/src/domain/menu/store.js';
const { DatabaseSync } = databaseHelper;

const root = path.resolve(import.meta.dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'szzx-ui-test-'));
const output = path.join(root, 'output/playwright');
fs.mkdirSync(output, { recursive: true });
fs.copyFileSync(path.join(root, 'server.js'), path.join(temp, 'server.js'));
fs.copyFileSync(path.join(root, 'data.json'), path.join(temp, 'data.json'));
fs.copyFileSync(path.join(root, 'menu-json-rules.md'), path.join(temp, 'menu-json-rules.md'));
fs.cpSync(path.join(root, 'apps'), path.join(temp, 'apps'), {
  recursive: true,
  filter: (source) =>
    !source.includes('node_modules') && !source.includes('/src') && !source.includes('/public'),
});
fs.cpSync(path.join(root, 'packages'), path.join(temp, 'packages'), { recursive: true });
fs.cpSync(path.join(root, 'data'), path.join(temp, 'data'), { recursive: true });
// The isolated app uses temporary SQLite/uploads and the current static files.
fs.symlinkSync(path.join(root, 'apps/web/dist'), path.join(temp, 'public'), 'junction');
const port = 4319;
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [path.join(temp, 'server.js')], {
  cwd: temp,
  env: {
    ...process.env,
    NODE_PATH: path.join(root, 'node_modules'),
    PORT: String(port),
    JWT_SECRET: 'ui-test-only-secret',
  },
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
server.stdout.on('data', (x) => {
  log += x;
});
server.stderr.on('data', (x) => {
  log += x;
});
let browser,
  checks = 0;
const issues = [];
function check(name, condition) {
  assert.ok(condition, name);
  checks++;
}
async function api(url, { token, method = 'GET', body } = {}) {
  const response = await fetch(base + url, {
    method,
    headers: {
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  return { status: response.status, data };
}
async function account(username, role = 'user') {
  await api('/api/register', {
    method: 'POST',
    body: { username, nickname: username, password: 'CampusTest2026' },
  });
  const roleDb = new DatabaseSync(path.join(temp, 'data.db'));
  roleDb.prepare('UPDATE users SET role=? WHERE username=?').run(role, username);
  roleDb.close();
  return (
    await api('/api/login', {
      method: 'POST',
      body: { username, password: 'CampusTest2026' },
    })
  ).data;
}
const axe = fs.readFileSync(path.join(root, 'node_modules/axe-core/axe.min.js'), 'utf8');
async function context(login, width = 1280, theme = 'light') {
  const ctx = await browser.newContext({
    viewport: { width, height: 850 },
    reducedMotion: 'reduce',
  });
  await ctx.addInitScript(
    ({ login, theme }) => {
      if (!localStorage.getItem('theme')) localStorage.setItem('theme', theme);
      if (login) {
        localStorage.setItem('token', login.token);
        localStorage.setItem('user', JSON.stringify(login.user));
      }
    },
    { login, theme },
  );
  return ctx;
}
async function pageFor(login, url, width = 1280, theme = 'light') {
  const ctx = await context(login, width, theme),
    page = await ctx.newPage();
  page.on('pageerror', (error) => issues.push(`${url}: ${error.message}`));
  await page.goto(base + url, { waitUntil: 'networkidle' });
  return { ctx, page };
}
async function audit(page, name) {
  await page.evaluate(axe);
  const result = await page.evaluate(async () =>
    (
      await axe.run(document, {
        runOnly: {
          type: 'tag',
          values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'],
        },
      })
    ).violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.map((n) => n.target),
    })),
  );
  if (result.length) issues.push({ name, axe: result });
  const layout = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    width: innerWidth,
    headers: [...document.querySelectorAll('h1')].filter((el) => !!el.getClientRects().length)
      .length,
  }));
  if (layout.scroll > layout.width + 1) issues.push({ name, overflow: layout });
  if (layout.headers !== 1) issues.push({ name, heading: layout });
  checks += 3;
}
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + '/api/settings/banner')).ok) break;
    } catch {
      /* Wait for isolated server. */
    }
    if (server.exitCode !== null) throw new Error(log);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const admin = await account('site-operator', 'operator'),
    ordinary = await account('campus-user'),
    banned = await account('banned-user');
  await api('/api/admin/announcements', {
    token: admin.token,
    method: 'POST',
    body: { title: '网站 UI 更新', content: '第一段公告。\n第二段公告。' },
  });
  await api('/api/admin/settings/banner', {
    token: admin.token,
    method: 'PUT',
    body: { value: '校园信息网新界面测试横幅。' },
  });
  await api('/api/student/apply', {
    token: ordinary.token,
    method: 'POST',
    body: {
      student_id: '2026001',
      class_name: '高一（1）班',
      real_name: '测试同学',
    },
  });
  await api('/api/tickets', {
    token: ordinary.token,
    method: 'POST',
    body: {
      title: '界面建议',
      content: '希望查看布局反馈。',
      visibility: 'admin',
    },
  });
  await api('/api/admin/users/ban', {
    token: admin.token,
    method: 'PUT',
    body: {
      userId: banned.user.id,
      ban_reason: '测试封禁说明',
      allow_appeal: 1,
    },
  });
  await api('/api/user/appeal', {
    method: 'POST',
    body: { username: 'banned-user', password: 'CampusTest2026', appeal_reason: '测试申诉说明' },
  });
  const db = new DatabaseSync(path.join(temp, 'data.db'));
  menuStore.bootstrap(db, JSON.parse(fs.readFileSync(path.join(root, 'data/menu-bootstrap.json'))));
  db.prepare(
    'INSERT INTO recipes (user_id, username, name, rating, comment) VALUES (?, ?, ?, ?, ?)',
  ).run(ordinary.user.id, 'campus-user', '红烧牛肉', 4, '味道不错，欢迎来评价。');
  const menuJobId = '11111111-1111-4111-8111-111111111111';
  db.prepare(
    "INSERT INTO menu_sync_jobs(id,trigger,status,phase,created_at,finished_at,config_revision,provider,model,total,processed,failed,error) VALUES(?,'manual','failed','done',?,?,0,'openrouter','fixture',1,1,1,'菜单复核发现遗漏')",
  ).run(menuJobId, Date.now(), Date.now());
  db.prepare(
    "INSERT INTO menu_job_items(job_id,source_id,article_id,title,status,phase,error) VALUES(?,'szzx1000:36:11392',11392,'测试菜单','failed','audit','底部漏行')",
  ).run(menuJobId);
  const menuArtifactDir = path.join(temp, '.private', 'menu-jobs', menuJobId, '11392');
  fs.mkdirSync(menuArtifactDir, { recursive: true });
  fs.writeFileSync(path.join(menuArtifactDir, 'source.json'), JSON.stringify({ image_count: 1 }));
  const importRecord = {
    date: '2026-10-01',
    weekday: '周四',
    time: ['noon'],
    place: null,
    group: null,
    name: '红烧牛肉面',
    price: 17,
    spicy: false,
  };
  fs.writeFileSync(
    path.join(menuArtifactDir, 'diagnostic.json'),
    JSON.stringify({ complete: false, error: '底部漏行', partial_records: [importRecord] }),
  );
  fs.writeFileSync(
    path.join(menuArtifactDir, 'image-0.png'),
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6h0AAAAASUVORK5CYII=',
      'base64',
    ),
  );
  db.close();
  browser = await chromium.launch({
    channel: process.platform === 'win32' ? 'msedge' : undefined,
    headless: true,
  });
  const files = [
    'index',
    'about',
    'settings',
    'inbox',
    'login',
    'register',
    'student_verify',
    'announcements',
    'recipe',
    'dish',
    'profile',
    'admin',
    'map',
    '404',
  ];
  if (!process.env.UI_FOCUS)
    for (const width of [360, 1280]) {
      for (const theme of ['light', 'dark']) {
        for (const file of files) {
          const login = ['profile', 'admin', 'student_verify', 'settings', 'inbox'].includes(file)
            ? admin
            : null;
          const url = `/${file}.html${file === 'dish' ? '?id=1' : ''}`;
          const { ctx, page } = await pageFor(login, url, width, theme);
          await audit(page, `${file}/${width}/${theme}`);
          if (file === 'recipe') {
            await page.getByRole('heading', { name: '今天我吃了…' }).waitFor();
            check(
              'daily menu controls are accessible',
              await page.getByLabel('选择日期').isVisible(),
            );
            await page.screenshot({ path: path.join(output, `menu-${width}-${theme}.png`) });
          }

          if (theme === 'light' && ['index', 'admin', 'map', 'profile'].includes(file))
            await page.screenshot({
              path: path.join(output, `${file}-${width}.png`),
              fullPage: file !== 'map',
            });
          await ctx.close();
        }
        console.log(`Page layouts audited: ${width}px / ${theme}`);
      }
    }
  if (!['admin', 'profile'].includes(process.env.UI_FOCUS)) {
    // The new landing page and workspace shell must remain usable beyond the
    // two legacy layout sizes, including keyboard navigation and theme changes.
    if (process.env.UI_FOCUS !== 'motion')
      for (const width of [360, 768, 1440]) {
        const landing = await pageFor(null, '/index.html', width);
        check(
          'Chinese homepage title',
          (await landing.page.locator('h1').innerText()) === '苏州中学最大的\n校园信息平台',
        );
        check(
          'shared navigation uses logo only',
          await landing.page
            .locator('.site-header .brand')
            .evaluate(
              (el) =>
                el.textContent.trim() === '' &&
                el.getAttribute('aria-label') === '拾光酥糕 首页' &&
                el.querySelector('img')?.complete &&
                el.querySelector('img')?.naturalWidth > 0,
            ),
        );
        check(
          'header logo has comfortable top and left spacing',
          await landing.page.locator('.site-header .brand').evaluate((el) => {
            const icon = el.getBoundingClientRect(),
              header = document.getElementById('siteHeader').getBoundingClientRect();
            return (
              icon.width === 32 && icon.left - header.left >= 28 && icon.top - header.top >= 12
            );
          }),
        );
        check(
          'lime mark is the favicon',
          (await landing.page.locator('link[rel="icon"]').getAttribute('href')) ===
            '/img/brand-lime.svg?v=20261019',
        );
        if (width <= 992) await landing.page.locator('.site-header__menu').click();
        check(
          'short Chinese primary navigation',
          width > 992
            ? (await landing.page.locator('.site-nav__link').allTextContents()).join('|') ===
                '地图|菜谱|必吃榜|更新公告'
            : (await landing.page.locator('#navDrawer .drawer-link').allTextContents())
                .slice(0, 5)
                .join('|') === '首页|地图|菜谱|必吃榜|更新公告',
        );
        if (width <= 992) await landing.page.keyboard.press('Escape');
        check(
          'local Noto Sans SC is applied',
          await landing.page.evaluate(async () => {
            await document.fonts.load('16px "NotoSansSC"', '苏州中学地图');
            await document.fonts.load('600 32px "NotoSansSC"', '校园信息平台');
            const chineseFace = [...document.fonts].find(
              (face) => face.family.replaceAll('"', '') === 'NotoSansSC',
            );
            return (
              document.fonts.check('16px "NotoSansSC"', '苏州中学地图') &&
              chineseFace?.weight === '100 900'
            );
          }),
        );
        check(
          'all shared logos use lime artwork',
          await landing.page
            .locator('.brand__mark')
            .evaluateAll(
              (imgs) =>
                imgs.length >= 2 &&
                imgs.every(
                  (img) =>
                    img.getAttribute('src') === '/img/brand-lime.svg?v=20261019' &&
                    img.complete &&
                    img.naturalWidth > 0,
                ),
            ),
        );
        check(
          'complete independent operation notice',
          (await landing.page.locator('.site-footer__identity > p').innerText()) ===
            '本站系学生自主运营的校园资讯聚合平台，与江苏省苏州中学官方无隶属关系。“苏州中学”名称、校徽及相关标识的知识产权均归原权利主体所有。所载信息仅供参考，不代表校方立场，权威资讯及具体事宜请以学校官方发布渠道为准。如有疑问或勘误，请致信 baimoqilin@gmail.com，我们将于核实后及时妥善处理。',
        );
        check(
          'footer correction email link',
          (await landing.page
            .locator('.site-footer__identity a[href="mailto:baimoqilin@gmail.com"]')
            .count()) === 1,
        );
        check(
          'requested fixed footer credit',
          await landing.page
            .locator('.site-footer__bottom')
            .innerText()
            .then((text) => text.includes('© 2026 苏州中学软件开发社人工智能部')),
        );
        check(
          'original campus illustration loaded',
          await landing.page
            .locator('.landing-hero__statue')
            .evaluate((img) => img.complete && img.naturalWidth > 0),
        );
        check(
          'user-supplied statue illustration',
          (await landing.page.locator('.landing-hero__statue').getAttribute('src')) ===
            '/img/fan-zhongyan-user.png',
        );
        check(
          'both development teams credited',
          (await landing.page.locator('.landing-team').allTextContents()).join('|') ===
            '软开人工智能部|苏州中学软件开发社',
        );
        check(
          'both team marks loaded',
          await landing.page
            .locator('.landing-team img')
            .evaluateAll(
              (imgs) =>
                imgs.length === 2 && imgs.every((img) => img.complete && img.naturalWidth > 0),
            ),
        );
        // Even the full illustration box stays clear of the heading.
        check(
          'hero title has its own horizontal space',
          await landing.page.evaluate(() => {
            const title = document.querySelector('.landing-hero h1');
            const range = document.createRange();
            range.selectNodeContents(title);
            const textRight = Math.max(...Array.from(range.getClientRects(), (r) => r.right));
            const art = document.querySelector('.landing-hero__statue').getBoundingClientRect();
            return textRight < art.left;
          }),
        );
        const summary = landing.page.locator('.landing-accordion summary').first();
        await summary.focus();
        await summary.press('Enter');
        check(
          'home contribution accordion opens from keyboard',
          await landing.page
            .locator('.landing-accordion details')
            .first()
            .evaluate((el) => el.open),
        );
        check(
          'open accordion provides real destination',
          (await landing.page
            .locator('.landing-accordion details')
            .first()
            .getByRole('link', { name: '去三元坊必吃榜' })
            .getAttribute('href')) === '/shops.html',
        );
        await audit(landing.page, `landing/${width}/expanded`);
        await summary.press('Enter');
        check(
          'home contribution accordion closes from keyboard',
          !(await landing.page
            .locator('.landing-accordion details')
            .first()
            .evaluate((el) => el.open)),
        );
        await landing.page.locator('[data-theme-choice="dark"]').click();
        check(
          'dark theme activates',
          (await landing.page.locator('html').getAttribute('data-theme')) === 'dark',
        );
        check(
          'hero green shifts darker in dark mode',
          await landing.page.evaluate(
            () =>
              getComputedStyle(document.documentElement)
                .getPropertyValue('--hero-green')
                .trim()
                .toLowerCase() === '#14532d',
          ),
        );
        await audit(landing.page, `landing/${width}/dark`);
        await landing.page.reload({ waitUntil: 'networkidle' });
        check(
          'theme survives reload',
          (await landing.page.locator('html').getAttribute('data-theme')) === 'dark',
        );
        await landing.page.locator('[data-theme-toggle]').click();
        check(
          'header restores light theme',
          (await landing.page.locator('html').getAttribute('data-theme')) === 'light',
        );
        await landing.page.waitForFunction(
          () => !document.documentElement.classList.contains('theme-transitioning'),
        );
        await landing.page.emulateMedia({ reducedMotion: 'no-preference' });
        check(
          'page slide uses a smooth 420ms duration',
          await landing.page.evaluate(
            () =>
              getComputedStyle(document.documentElement, '::view-transition-new(root)')
                .animationDuration === '0.42s',
          ),
        );
        await landing.page.emulateMedia({ reducedMotion: 'reduce' });
        if (width === 1440) {
          await landing.page.emulateMedia({ reducedMotion: 'no-preference' });
          await landing.page.evaluate(() => {
            document.startViewTransition = undefined;
          });
          await landing.page.locator('[data-theme-toggle]').click();
          check(
            'theme color fallback animates without View Transition support',
            await landing.page.evaluate(
              () =>
                document.documentElement.classList.contains('theme-transitioning') &&
                getComputedStyle(
                  document.querySelector('.site-header'),
                ).transitionDuration.includes('0.28s'),
            ),
          );
          await landing.page.waitForFunction(
            () => !document.documentElement.classList.contains('theme-transitioning'),
          );
        }
        await landing.page.locator('[data-theme-choice="auto"]').click();
        await landing.page.emulateMedia({ colorScheme: 'dark' });
        await landing.page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
        check(
          'system preference followed',
          (await landing.page
            .locator('[data-theme-choice="auto"]')
            .getAttribute('aria-pressed')) === 'true',
        );
        await landing.page.emulateMedia({ colorScheme: 'light' });
        await landing.page.waitForFunction(
          () => document.documentElement.dataset.theme === 'light',
        );
        await audit(landing.page, `landing/${width}/light`);
        await landing.page.screenshot({
          path: path.join(output, `fuxue-home-${width}.png`),
          fullPage: true,
        });
        if (width === 360) {
          await landing.page.getByRole('button', { name: '打开菜单' }).click();
          check(
            'mobile drawer retains registration',
            await landing.page
              .locator('#navDrawer')
              .getByRole('link', { name: '注册', exact: true })
              .isVisible(),
          );
          await landing.page.keyboard.press('Escape');
          check(
            'drawer returns focus to opener',
            await landing.page
              .getByRole('button', { name: '打开菜单' })
              .evaluate((el) => el === document.activeElement),
          );
        }
        await landing.page.getByRole('link', { name: '了解更多', exact: true }).click();
        await landing.page.waitForURL('**/about.html');
        await landing.page.getByRole('heading', { level: 1, name: '关于 拾光酥糕' }).waitFor();
        await landing.page.locator('.about-page__art').evaluate((img) => img.decode());
        check(
          'about page is reachable without a redirect loop',
          landing.page.url().endsWith('/about.html') &&
            (await landing.page
              .getByRole('heading', { level: 1, name: '关于 拾光酥糕' })
              .isVisible()),
        );
        check(
          'about page reuses the supplied statue',
          await landing.page
            .locator('.about-page__art')
            .evaluate(
              (img) =>
                img.getAttribute('src') === '/img/fan-zhongyan-user.png' &&
                img.complete &&
                img.naturalWidth > 0,
            ),
        );
        await landing.ctx.close();
        for (const route of ['recipe', 'shops']) {
          const workspace = await pageFor(null, `/${route}.html`, width);
          check(
            `${route} workspace adapts at ${width}`,
            await workspace.page.evaluate((route) => {
              if (route === 'recipe') {
                const grid = document.querySelector('.daily-columns');
                return (
                  !!grid &&
                  getComputedStyle(grid).gridTemplateColumns.split(' ').length ===
                    (innerWidth <= 600 ? 1 : 2)
                );
              }
              const side = document.querySelector('.workspace__sidebar').getBoundingClientRect();
              const content = document.querySelector('.workspace__content').getBoundingClientRect();
              return innerWidth < 768
                ? content.top >= side.bottom - 1
                : content.left >= side.right - 1;
            }, route),
          );
          if (width !== 360) await audit(workspace.page, `${route}/${width}/workspace`);
          await workspace.page.screenshot({
            path: path.join(output, `fuxue-${route}-${width}.png`),
            fullPage: false,
          });
          await workspace.ctx.close();
        }
      }
    // Hero sizing must react to async banners, dismissal, wrapping and resizing.
    const fitted = await context(null, 1440);
    const fittingPage = await fitted.newPage();
    let releaseBanner;
    const bannerReady = new Promise((resolve) => {
      releaseBanner = resolve;
    });
    let bannerText = '首屏尺寸验证公告';
    await fittingPage.route('**/api/settings/banner', async (route) => {
      await bannerReady;
      await route.fulfill({ json: { banner: bannerText, version: 'hero-fit' } });
    });
    await fittingPage.goto(base + '/index.html', { waitUntil: 'domcontentloaded' });
    const fitsViewport = () =>
      fittingPage.evaluate(
        () =>
          Math.abs(
            document.querySelector('.landing-hero').getBoundingClientRect().bottom +
              scrollY -
              innerHeight,
          ) < 1,
      );
    await fittingPage.waitForFunction(
      () =>
        document.querySelector('.landing-hero') &&
        document.documentElement.style.getPropertyValue('--landing-top'),
    );
    check('hero fills desktop without a banner', await fitsViewport());
    releaseBanner();
    await fittingPage.getByRole('button', { name: '关闭横幅' }).waitFor();
    for (const [width, height] of [
      [1024, 600],
      [1280, 720],
      [1440, 1000],
      [1920, 1080],
      [2560, 1440],
    ]) {
      await fittingPage.setViewportSize({ width, height });
      await fittingPage.waitForFunction(
        () =>
          Math.abs(
            document.querySelector('.landing-hero').getBoundingClientRect().bottom - innerHeight,
          ) < 1,
      );
      check(`hero reaches viewport bottom at ${width}x${height}`, await fitsViewport());
      check(
        `wide team logos remain separated at ${width}`,
        await fittingPage.locator('.landing-team').evaluateAll((es) => {
          const [a, b] = es.map((e) => e.getBoundingClientRect());
          return Math.abs(a.y - b.y) > 1 || b.left - a.right >= 63;
        }),
      );
    }
    await fittingPage.getByRole('button', { name: '关闭横幅' }).click();
    await fittingPage.waitForFunction(
      () =>
        Math.abs(
          document.querySelector('.landing-hero').getBoundingClientRect().bottom - innerHeight,
        ) < 1,
    );
    check('hero refills after banner dismissal', await fitsViewport());
    bannerText = '用于验证多行公告出现时首屏仍然与窗口底部对齐。'.repeat(12);
    await fittingPage.evaluate(() => localStorage.removeItem('bannerDismissed:guest'));
    await fittingPage.setViewportSize({ width: 1024, height: 700 });
    await fittingPage.reload({ waitUntil: 'networkidle' });
    check(
      'wrapped banner is included in hero height',
      (await fittingPage.locator('#siteBanner').evaluate((el) => el.offsetHeight > 32)) &&
        (await fitsViewport()),
    );
    await fittingPage.getByRole('button', { name: '关闭横幅' }).click();
    await fittingPage.setViewportSize({ width: 1440, height: 1000 });
    await fittingPage.evaluate(() => scrollTo(0, 0));
    await fittingPage.waitForFunction(
      () => document.querySelector('.landing-hero').getBoundingClientRect().bottom === innerHeight,
    );
    const sharp = (await import('sharp')).default;
    const column = await fittingPage.screenshot({ clip: { x: 1, y: 55, width: 1, height: 945 } });
    const pixels = await sharp(column).removeAlpha().raw().toBuffer();
    let maxStep = 0;
    for (let i = 3; i < pixels.length; i++)
      maxStep = Math.max(maxStep, Math.abs(pixels[i] - pixels[i - 3]));
    check(
      'header and gradient join continuously without color bands',
      pixels[0] === 255 && pixels[1] === 255 && pixels[2] === 255 && maxStep <= 3,
    );
    check(
      'home header has no divider',
      await fittingPage
        .locator('.site-header')
        .evaluate((el) => getComputedStyle(el).borderBottomWidth === '0px'),
    );
    for (const width of [992, 993]) {
      await fittingPage.setViewportSize({ width, height: 850 });
      check(
        `navigation breakpoint at ${width}`,
        (await fittingPage.locator('.site-nav').isVisible()) === width > 992,
      );
    }
    await fittingPage.setViewportSize({ width: 1440, height: 1000 });
    await fittingPage.emulateMedia({ reducedMotion: 'no-preference' });
    const navLink = fittingPage.locator('.site-nav__link').first();
    await navLink.hover();
    await fittingPage.waitForFunction(
      () => getComputedStyle(document.querySelector('.site-nav__link'), '::after').opacity === '1',
    );
    check(
      'navigation hover fades in over 100ms',
      await navLink.evaluate((el) => getComputedStyle(el, '::after').transitionDuration === '0.1s'),
    );
    await fittingPage.mouse.move(0, 150);
    await fittingPage.waitForFunction(
      () => getComputedStyle(document.querySelector('.site-nav__link'), '::after').opacity === '0',
    );
    check(
      'navigation hover fades out',
      await navLink.evaluate((el) => getComputedStyle(el, '::after').opacity === '0'),
    );
    const motion = await fittingPage.evaluate(async () => {
      const items = [...document.querySelectorAll('.landing-accordion details')];
      const first = items[0],
        content = first.querySelector('summary').nextElementSibling;
      first.querySelector('summary').click();
      await new Promise(requestAnimationFrame);
      const opening = content.getAnimations()[0];
      opening.pause();
      opening.currentTime = 100;
      const mid = content.getBoundingClientRect().height;
      const timing = opening.effect.getTiming();
      opening.finish();
      await new Promise(requestAnimationFrame);
      const full = content.getBoundingClientRect().height;
      items[1].querySelector('summary').click();
      const closing = content.getAnimations()[0];
      closing.pause();
      closing.currentTime = 100;
      const closingMid = content.getBoundingClientRect().height;
      closing.finish();
      await new Promise(requestAnimationFrame);
      const closed = !first.open && content.inert;
      // Reversing repeatedly should finish in the user's last requested state.
      first.querySelector('summary').click();
      first.querySelector('summary').click();
      first.querySelector('summary').click();
      content.getAnimations()[0].finish();
      await new Promise(requestAnimationFrame);
      return {
        opening: mid > 0 && mid < full,
        closing: closingMid > 0 && closingMid < full,
        timing: timing.duration === 200 && timing.easing === 'ease-out',
        closed,
        lastState: first.open && !content.inert && !first.hasAttribute('data-closing'),
      };
    });
    check('accordion animates expansion through an intermediate height', motion.opening);
    check('accordion animates collapse through an intermediate height', motion.closing);
    check('accordion matches 200ms ease-out reference timing', motion.timing);
    check('opening another item closes the previous item and removes its tab stops', motion.closed);
    check('rapid accordion reversal preserves final intent', motion.lastState);
    await fittingPage.emulateMedia({ reducedMotion: 'reduce' });
    await fittingPage.locator('.landing-accordion summary').first().click();
    check(
      'reduced motion closes immediately',
      await fittingPage
        .locator('.landing-accordion details')
        .first()
        .evaluate((el) => !el.open && el.getAnimations({ subtree: true }).length === 0),
    );
    await fittingPage.evaluate(() => {
      document.startViewTransition = () => {
        window.__unexpectedThemeTransition = true;
      };
    });
    await fittingPage.locator('[data-theme-toggle]').click();
    check(
      'reduced motion skips theme transition',
      await fittingPage.evaluate(
        () =>
          !window.__unexpectedThemeTransition &&
          !document.documentElement.classList.contains('theme-transitioning'),
      ),
    );
    await fitted.close();
    // Same-document navigation keeps the shared shell mounted and uses View Transitions.
    const sliding = await pageFor(null, '/index.html', 1440);
    await sliding.page.emulateMedia({ reducedMotion: 'no-preference' });
    await sliding.page.evaluate(() => {
      window.__originalHeader = document.getElementById('siteHeader');
      window.__originalDocument = document;
      window.__headerFrames = [];
      const original = document.startViewTransition.bind(document);
      document.startViewTransition = (...args) => {
        const transition = original(...args);
        transition.ready.then(() => {
          window.__pageSlide = {
            present: true,
            direction: document.documentElement.dataset.pageDirection,
            oldName: getComputedStyle(document.documentElement, '::view-transition-old(root)')
              .animationName,
            newName: getComputedStyle(document.documentElement, '::view-transition-new(root)')
              .animationName,
            headerName: getComputedStyle(
              document.documentElement,
              '::view-transition-old(stationary-header)',
            ).animationName,
          };
        });
        return transition;
      };
    });
    await sliding.page.locator('.site-nav__link').first().click();
    await sliding.page.waitForURL('**/map.html');
    await sliding.page.waitForFunction(() => window.__pageSlide?.direction === 'forward');
    check(
      'primary navigation preserves the document and header while sliding forward',
      await sliding.page.evaluate(
        () =>
          window.__originalDocument === document &&
          window.__originalHeader === document.getElementById('siteHeader') &&
          window.__pageSlide.oldName === 'page-slide-out-left' &&
          window.__pageSlide.newName === 'page-slide-in-right' &&
          window.__pageSlide.headerName === 'none',
      ),
    );
    await sliding.page.waitForFunction(() => document.body.dataset.guideReady === 'true');
    await sliding.page.locator('.site-header .brand').click();
    await sliding.page.waitForURL('**/index.html');
    await sliding.page.waitForFunction(() => window.__pageSlide?.direction === 'back');
    check(
      'return navigation slides in reverse',
      await sliding.page.evaluate(
        () =>
          window.__pageSlide.oldName === 'page-slide-out-right' &&
          window.__pageSlide.newName === 'page-slide-in-left',
      ),
    );
    const bannerHeight = await sliding.page
      .locator('#siteBanner')
      .evaluate((el) => el.offsetHeight);
    await sliding.page.route('**/api/settings/banner', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 250));
      await route.continue();
    });
    await sliding.page.evaluate(() => {
      window.__headerFrames = [];
      let frame = 0;
      const record = () => {
        window.__headerFrames.push(
          document.getElementById('siteHeader').getBoundingClientRect().top,
        );
        if (++frame < 18) requestAnimationFrame(record);
      };
      requestAnimationFrame(record);
    });
    await sliding.page.locator('.site-nav__link').first().click();
    await sliding.page.waitForURL('**/map.html');
    await sliding.page.waitForFunction(() => window.__headerFrames.length === 18);
    check(
      'shared header stays fixed while the destination loads',
      await sliding.page.evaluate(
        (expected) => expected > 0 && window.__headerFrames.every((top) => top === expected),
        bannerHeight,
      ),
    );
    await sliding.ctx.close();
  }
  // Dedicated account/admin tests cover review decisions, private assets and hierarchy.
  const ticket = await pageFor(ordinary, '/settings.html#tickets', 360);
  await ticket.page.locator('#ticketTitle').fill('通过新 UI 提交');
  await ticket.page.locator('#ticketContent').fill('工单正文');
  await ticket.page.locator('#ticketSubmit').click();
  await ticket.page.waitForFunction(
    () => document.querySelectorAll('#myTicketList article').length === 2,
  );
  check('private ticket submission', true);
  await audit(ticket.page, 'settings tickets');
  await ticket.ctx.close();
  const settings = await pageFor(ordinary, '/settings.html#site', 360);
  await settings.page.locator('#recipeDefaultView').selectOption('weekly');
  await settings.page.locator('#siteSubmit').click();
  await settings.page.waitForFunction(() => localStorage.getItem('recipeDefaultView') === 'weekly');
  check(
    'site preference persisted',
    (await api('/api/user/profile', { token: ordinary.token })).data.user.recipe_default_view ===
      'weekly',
  );
  for (const panel of ['security', 'site', 'tickets']) {
    await settings.page.locator(`[data-panel="${panel}"]`).click();
    await settings.page.waitForTimeout(100);
    await audit(settings.page, 'settings ' + panel);
  }
  await settings.ctx.close();
  const registration = await pageFor(null, '/register.html?next=%2Fshops.html', 360);
  for (const [id, value] of [
    ['username', 'ui-registration'],
    ['nickname', '注册昵称'],
    ['password', 'CampusTest2026'],
    ['confirm', 'CampusTest2026'],
  ])
    await registration.page.locator('#' + id).fill(value);
  await registration.page.locator('#submitBtn').click();
  await registration.page.waitForURL('**/shops.html');
  check(
    'registration logs in and respects return URL',
    (await registration.page.evaluate(() => localStorage.getItem('token'))) === 'session',
  );
  await registration.ctx.close();
  const catalog = (await api('/api/admin/titles', { token: admin.token })).data.titles;
  check(
    'automatic and manual title catalog',
    catalog.length === 7 &&
      catalog.some((t) => t.source === 'auto') &&
      catalog.some((t) => t.source === 'grant'),
  );
  const founder = catalog.find((t) => t.name === '创站元老');
  assert.equal(
    (
      await api(`/api/admin/users/${ordinary.user.id}/titles`, {
        token: admin.token,
        method: 'POST',
        body: { title_id: founder.id },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await api('/api/user/title', {
        token: ordinary.token,
        method: 'PUT',
        body: { title_id: founder.id },
      })
    ).status,
    200,
  );
  for (const width of [360, 1280]) {
    const titles = await pageFor(ordinary, '/profile.html#titles', width);
    await titles.page.locator('#view-titles:not([hidden])').waitFor();
    check(
      'worn title preview',
      (await titles.page.locator('#titlePreview').innerText()).includes('创站元老'),
    );
    check('unchanged title disabled', await titles.page.locator('#wearSubmit').isDisabled());
    await audit(titles.page, 'profile titles ' + width);
    await titles.ctx.close();
  }
  const clearTitle = await pageFor(ordinary, '/profile.html#titles', 1280);
  await clearTitle.page.locator('#titleChoices label').first().click();
  await clearTitle.page.locator('#wearSubmit').click();
  await clearTitle.page.waitForFunction(() => document.getElementById('wearSubmit').disabled);
  check(
    'clearing worn title persists',
    (await api('/api/user/profile', { token: ordinary.token })).data.user.title === null,
  );
  await clearTitle.ctx.close();
  const titleAdmin = await pageFor(admin, '/admin.html#titles', 1280);
  await titleAdmin.page.locator('#titleList tbody tr').first().waitFor();
  check(
    'modern dashboard includes title catalog',
    (await titleAdmin.page.locator('#titleList tbody tr').count()) === 7,
  );
  await audit(titleAdmin.page, 'admin title catalog');
  await titleAdmin.ctx.close();
  const missing = await fetch(base + '/missing/deep/path');
  check('styled missing page', missing.status === 404 && /assets/.test(await missing.text()));
  check('unknown API remains JSON404', (await api('/api/missing')).status === 404);
  fs.writeFileSync(path.join(output, 'audit.json'), JSON.stringify({ checks, issues }, null, 2));
  assert.deepEqual(issues, []);
  console.log(
    `${checks} site smoke checks passed across themes, widths, keyboard, settings and titles.`,
  );
} finally {
  fs.writeFileSync(path.join(output, 'audit.json'), JSON.stringify({ checks, issues }, null, 2));
  await browser?.close();
  server.kill();
  if (server.exitCode === null) await new Promise((resolve) => server.once('exit', resolve));
  if (
    path.dirname(fs.realpathSync(temp)).toLowerCase() !== fs.realpathSync(os.tmpdir()).toLowerCase()
  )
    throw new Error('Unexpected test path');
  fs.rmSync(temp, { recursive: true, force: true });
}
