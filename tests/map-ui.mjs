// Illustrated campus map: isolated server, real interaction, responsive layout and accessibility.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const root = path.resolve(import.meta.dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'szzx-map-ui-'));
const output = path.join(root, 'output/playwright/map');
fs.mkdirSync(output, { recursive: true });
for (const file of ['server.js', 'data.json', 'menu-json-rules.md']) fs.copyFileSync(path.join(root, file), path.join(temp, file));
for (const dir of ['lib', 'data']) fs.cpSync(path.join(root, dir), path.join(temp, dir), { recursive: true });
fs.symlinkSync(path.join(root, 'public'), path.join(temp, 'public'), 'junction');
const base = 'http://127.0.0.1:4348';
const server = spawn(process.execPath, [path.join(temp, 'server.js')], { cwd: temp, env: { ...process.env, NODE_PATH: path.join(root, 'node_modules'), PORT: '4348', JWT_SECRET: 'map-ui-test' }, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '', checks = 0, browser;
const errors = [];
server.stdout.on('data', x => log += x);
server.stderr.on('data', x => log += x);
function check(name, value) { assert.ok(value, name); checks++; }
const axe = fs.readFileSync(path.join(root, 'node_modules/axe-core/axe.min.js'), 'utf8');
async function audit(page, name) {
  await page.evaluate(axe);
  const result = await page.evaluate(async () => (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] } })).violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })));
  check(name + ': axe', result.length === 0 || (errors.push({ name, axe: result }), false));
  check(name + ': no horizontal overflow', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  check(name + ': one visible heading', await page.locator('h1:visible').count() === 1);
}
try {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base + '/api/settings/banner')).ok) break; } catch { /* Wait for isolated server. */ }
    if (server.exitCode !== null) throw new Error(log);
    await new Promise(r => setTimeout(r, 100));
  }
  browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined });
  for (const [width, height, theme] of [[1440, 1000, 'light'], [390, 844, 'light'], [360, 740, 'dark'], [1280, 900, 'dark'], [844, 390, 'light']]) {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', hasTouch: width < 700 });
    await context.addInitScript(theme => localStorage.setItem('theme', theme), theme);
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    const oldMapRequests = [];
    page.on('request', request => { if (request.url().includes('/api/map-data') || request.url().includes('/map-floor.js')) oldMapRequests.push(request.url()); });
    await page.goto(base + '/map.html', { waitUntil: 'networkidle' });
    await page.waitForSelector('body[data-guide-ready="true"]');
    check('all reference locations included', await page.locator('[data-map-place]').count() === 28);
    check('view switcher and floor map removed', await page.locator('#floorView, #guideViewBtn, #floorViewBtn, .campus-view-switch').count() === 0);
    const courtBounds = await page.locator('[data-map-place="basketball"] > use').boundingBox();
    const trackBounds = await page.locator('[data-map-place="track"] > use').boundingBox();
    check('basketball fills a large vertical area', courtBounds.height > trackBounds.height * 0.8 && courtBounds.width > trackBounds.width * 0.65);
    check('map has usable height', (await page.locator('#guideMap').boundingBox()).height > 200);
    await page.screenshot({ path: path.join(output, `${width}-${theme}.png`) });
    await audit(page, `${width}/${theme}/overview`);
    await page.locator('#placeSearch').fill('校史馆');
    check('alias search finds museum', await page.locator('.campus-place-row').count() === 1);
    check('search highlights corresponding place', await page.locator('[data-map-place]:not(.is-muted)').count() === 1);
    await page.locator('.campus-place-row').click();
    check('detail shown', await page.locator('#detailName').textContent() === '尊经阁');
    check('focus moved to detail', await page.locator('#detailName').evaluate(el => document.activeElement === el));
    check('detail stays in viewport', await page.locator('#placeDetail').evaluate(el => { const b = el.getBoundingClientRect(); return b.left >= 0 && b.right <= innerWidth && b.top >= 0 && b.bottom <= innerHeight; }));
    await page.screenshot({ path: path.join(output, `${width}-${theme}-detail.png`) });
    await audit(page, `${width}/${theme}/detail`);
    await page.keyboard.press('Escape');
    check('Escape closes detail', await page.locator('#placeDetail').isHidden());
    await page.locator('#placeSearch').fill('不存在的校园地点');
    check('empty search state', await page.locator('#placesEmpty').isVisible());
    await page.locator('#resetSearch').click();
    check('reset search restores places', await page.locator('.campus-place-row').count() === 28);
    await page.locator('[data-category="sport"]').click();
    check('sports category', await page.locator('.campus-place-row').count() === 3);
    await page.locator('[data-category="all"]').click();
    if (width < 700) await page.locator('#placesToggle').click();
    await page.locator('#guideReset').click();
    const transform = () => page.locator('.leaflet-map-pane').first().getAttribute('style');
    await page.locator('#guideMap').focus();
    const beforePan = await transform();
    await page.keyboard.press('ArrowRight');
    check('keyboard pans map', await transform() !== beforePan);
    const beforeZoom = await page.locator('.campus-art').getAttribute('style');
    await page.locator('#guideZoomIn').click();
    await page.waitForTimeout(300);
    check('zoom changes artwork bounds', await page.locator('.campus-art').getAttribute('style') !== beforeZoom);
    await page.locator('#guideReset').click();
    if (width === 390) {
      const art = page.locator('.campus-art');
      const beforePinch = (await art.boundingBox()).width;
      const box = await page.locator('#guideMap').boundingBox();
      const cdp = await context.newCDPSession(page);
      const y = box.y + box.height * 0.42;
      const touches = spread => [{ x: 190 - spread, y, id: 0 }, { x: 190 + spread, y, id: 1 }];
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touches(30) });
      for (const spread of [40, 50, 65, 80]) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touches(spread) });
        await page.waitForTimeout(30);
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(300);
      check('two-finger pinch zooms', (await art.boundingBox()).width > beforePinch * 1.3);
      await cdp.detach();
      await page.locator('#guideReset').click();
    }
    if (width === 1440) {
      const art = page.locator('.campus-art');
      const box = await page.locator('#guideMap').boundingBox();
      const cursor = { x: box.x + box.width * 0.6, y: box.y + box.height * 0.4 };
      await page.mouse.move(cursor.x, cursor.y);
      const beforeWheel = await art.boundingBox();
      await page.mouse.wheel(48, 72);
      await page.waitForTimeout(100);
      const afterWheel = await art.boundingBox();
      check('trackpad two-finger scroll pans both axes', Math.abs(afterWheel.x - beforeWheel.x + 48) < 2 && Math.abs(afterWheel.y - beforeWheel.y + 72) < 2);
      check('ordinary scroll preserves zoom', Math.abs(afterWheel.width - beforeWheel.width) < 0.5);
      await page.locator('#guideReset').click();
      const cdp = await context.newCDPSession(page);
      const beforePinch = await art.boundingBox();
      const ratio = { x: (cursor.x - beforePinch.x) / beforePinch.width, y: (cursor.y - beforePinch.y) / beforePinch.height };
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', ...cursor, deltaX: 0, deltaY: -12, modifiers: 2 });
      await page.waitForTimeout(80);
      const afterPinch = await art.boundingBox();
      const scale = afterPinch.width / beforePinch.width;
      check('Mac trackpad pinch applies a continuous small zoom', scale > 1.01 && scale < 1.08);
      check('pinch stays anchored beneath the cursor', Math.abs(afterPinch.x + ratio.x * afterPinch.width - cursor.x) < 2 && Math.abs(afterPinch.y + ratio.y * afterPinch.height - cursor.y) < 2);
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', ...cursor, deltaX: 0, deltaY: 12, modifiers: 2 });
      await page.waitForTimeout(80);
      check('reversing pinch restores scale without a jump', Math.abs((await art.boundingBox()).width - beforePinch.width) < 1);
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', ...cursor, deltaX: 0, deltaY: -24, modifiers: 4 });
      await page.waitForTimeout(80);
      check('Command-wheel also zooms', (await art.boundingBox()).width > beforePinch.width * 1.05);
      await cdp.detach();
      await page.locator('#guideReset').click();
      const beforeSafari = await art.boundingBox();
      await page.locator('#guideMap').evaluate((el, point) => {
        function gesture(type, scale) {
          const event = new Event(type, { bubbles: true, cancelable: true });
          Object.defineProperties(event, { scale: { value: scale }, clientX: { value: point.x }, clientY: { value: point.y } });
          el.dispatchEvent(event);
        }
        gesture('gesturestart', 1);
        gesture('gesturechange', 1.25);
        el.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: -100, bubbles: true, cancelable: true }));
        gesture('gestureend', 1.25);
      }, cursor);
      await page.waitForTimeout(80);
      check('Safari gesture scale applies once despite duplicate wheel events', Math.abs((await art.boundingBox()).width / beforeSafari.width - 1.25) < 0.01);
      await page.locator('#guideReset').click();
      const beforeDrag = await transform();
      await page.mouse.move(box.x + 180, box.y + 300);
      await page.mouse.down();
      await page.mouse.move(box.x + 280, box.y + 350, { steps: 8 });
      await page.mouse.up();
      check('drag pans map', await transform() !== beforeDrag);
      check('drag does not select a place', await page.locator('#placeDetail').isHidden());
      await page.locator('#guideReset').click();
      await page.locator('[data-map-place="zunjing"]').click();
      check('illustration click opens location', await page.locator('#detailName').textContent() === '尊经阁');
      await page.locator('#closeDetail').click();
      await page.locator('#guideReset').click();
    }
    await page.locator('[data-map-place="panshui"]').focus();
    await page.keyboard.press('Enter');
    check('keyboard opens southern landmark', await page.locator('#detailName').textContent() === '泮水居');
    await page.locator('#closeDetail').click();
    check('legacy floor data is never requested', oldMapRequests.length === 0);
    // Resize while at overview must keep the complete map fitted.
    await page.locator('#guideReset').click();
    await page.setViewportSize({ width: width < 700 ? 700 : 600, height });
    await page.waitForTimeout(150);
    check('resize has no overflow', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await context.close();
  }
  // A failed artwork request offers a retry without relying on the API or floor data.
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.route('**/img/map/campus.svg', route => route.fulfill({ status: 503, body: '' }));
  await page.goto(base + '/map.html', { waitUntil: 'networkidle' });
  check('artwork failure is recoverable', await page.locator('#guideStatus button').isVisible());
  await page.unroute('**/img/map/campus.svg');
  await page.locator('#guideStatus button').click();
  await page.waitForSelector('body[data-guide-ready="true"]');
  check('retry succeeds', await page.locator('#guideStatus').isHidden());
  await context.close();
  check('no browser errors', errors.length === 0);
} catch (error) {
  errors.push({ fatal: error.stack, log: log.slice(-800) });
} finally {
  if (browser) await browser.close();
  server.kill();
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ checks, errors }, null, 2));
}
if (errors.length) { console.error(JSON.stringify(errors, null, 2)); process.exit(1); }
console.log(`map-ui: ${checks} checks passed`);
