// Illustrated campus map: isolated server, real interaction, responsive layout and accessibility.
import { campusPlaces as CampusPlaces } from '../apps/web/src/maps/places.ts';
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
for (const dir of ['apps', 'packages', 'data']) fs.cpSync(path.join(root, dir), path.join(temp, dir), { recursive: true });
fs.symlinkSync(path.join(root, 'apps/web/dist'), path.join(temp, 'public'), 'junction');
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
    check('all reference locations included', await page.locator('[data-map-place]').count() === 31);
    check('all landmarks have substantive introductions', CampusPlaces.every(p => p.summary && p.description.length >= 65 && !p.description.includes(p.area)));
    check('view switcher and floor map removed', await page.locator('#floorView, #guideViewBtn, #floorViewBtn, .campus-view-switch').count() === 0);
    const courtBounds = await page.locator('[data-map-place="basketball"] > use').boundingBox();
    const trackBounds = await page.locator('[data-map-place="track"] > use').boundingBox();
    check('reference sports proportions: large courts and dominant southern track', courtBounds.height > trackBounds.height * 0.45 && trackBounds.height > courtBounds.height * 1.8 && trackBounds.width > courtBounds.width * 2);
    check('six grouped courts and a separate southern court', await page.locator('#art-courts-plan [data-court="grouped"]').count() === 6 && await page.locator('#art-courts-plan [data-court="separate"]').count() === 1);
    check('reference terrain subdivisions exist', await page.locator('#atlas-unnamed-plot, #atlas-woodland, #atlas-bamboo, #atlas-paths').count() === 4);
    check('reference spatial relationships are preserved', (() => {
      const p = Object.fromEntries(CampusPlaces.map(p => [p.id, p]));
      return p.weichang.y < p.laboratory.y && p.laboratory.y < p.zhengdao.y && p.zhengdao.y < p.basketball.y
        && p['west-red'].y < p['west-lawn'].y && p['east-red'].y < p['east-lawn'].y
        && p.chunyu.y < p.daoshan.y && p.daoshan.y < p.bixia.y
        && p.zunjing.x > p.daoshan.x && p.zunjing.y > p.daoshan.y && p['stele-gallery'].x > p.zunjing.x
        && p.library.y < p.laixiu.y && p.laixiu.y < p.gym.y && p.gym.y < p.caiqin.y
        && p.temple.y < p.daomeng.y && p.daomeng.y < p.panchi.y && p.panchi.y < p.panshui.y
        && p.sanyuan.height > p.sanyuan.size * 3;
    })());
    check('no unknown label invented for pink plot', await page.locator('#atlas-unnamed-plot text, [data-map-place="unnamed"]').count() === 0);
    check('all places reference existing vector artwork', await page.evaluate(places => places.every(p => document.getElementById('art-' + p.icon)), CampusPlaces));
    check('map has usable height', (await page.locator('#guideMap').boundingBox()).height > 200);
    await page.screenshot({ path: path.join(output, `${width}-${theme}.png`) });
    await audit(page, `${width}/${theme}/overview`);
    const basketballLabel = page.locator('[data-map-place="basketball"] text');
    check('basketball label stays clear of the track footprint', await basketballLabel.evaluate(el => {
      const label = el.getBoundingClientRect();
      const track = document.querySelector('[data-map-place="track"] > rect').getBoundingClientRect();
      return label.bottom < track.top;
    }));
    const labelBox = await basketballLabel.boundingBox();
    await page.mouse.click(labelBox.x + labelBox.width / 2, labelBox.y + labelBox.height - 2);
    check('bottom of basketball label selects basketball instead of track', await page.locator('#detailName').textContent() === '篮球场');
    await page.locator('#closeDetail').click();
    await page.locator('#guideReset').click();
    await page.locator('#placeSearch').fill('墨子馆');
    check('former name finds renamed Zhengdao building', await page.locator('.campus-place-row').count() === 1 && (await page.locator('.campus-place-row').textContent()).includes('政道楼'));
    await page.locator('.campus-place-row').click();
    check('Zhengdao description includes confirmed identity and dedication', await page.locator('#detailName').textContent() === '政道楼' && await page.locator('#detailDescription').evaluate(el => ['文正之道', '李政道', '诺贝尔物理学奖', '北京大学中学物理实验教学中心'].every(text => el.textContent.includes(text))));
    await page.locator('#closeDetail').click();
    await page.locator('#placeSearch').fill('');
    if (width < 700) await page.locator('#placesToggle').click();
    await page.locator('#guideReset').click();
    await page.locator('#placeSearch').fill('校史馆');
    check('alias search finds museum', await page.locator('.campus-place-row').count() === 1);
    check('search highlights corresponding place', await page.locator('[data-map-place]:not(.is-muted)').count() === 1);
    await page.locator('.campus-place-row').click();
    check('detail shown', await page.locator('#detailName').textContent() === '尊经阁');
    check('detail provides historical information and references', (await page.locator('#detailDescription').textContent()).includes('校史馆') && await page.locator('#detailSources a').count() > 0);
    check('detail no longer repeats a location row', await page.locator('#detailLocation').count() === 0);
    check('focus moved to detail', await page.locator('#detailName').evaluate(el => document.activeElement === el));
    check('detail stays in viewport', await page.locator('#placeDetail').evaluate(el => { const b = el.getBoundingClientRect(); return b.left >= 0 && b.right <= innerWidth && b.top >= 0 && b.bottom <= innerHeight; }));
    await page.screenshot({ path: path.join(output, `${width}-${theme}-detail.png`) });
    await audit(page, `${width}/${theme}/detail`);
    await page.keyboard.press('Escape');
    check('Escape closes detail', await page.locator('#placeDetail').isHidden());
    await page.locator('#placeSearch').fill('不存在的校园地点');
    check('empty search state', await page.locator('#placesEmpty').isVisible());
    await page.locator('#resetSearch').click();
    check('reset search restores places', await page.locator('.campus-place-row').count() === 31);
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
      const order = await page.locator('[data-map-place]').evaluateAll(nodes => nodes.map(n => n.dataset.mapPlace));
      const beforeSelection = await art.boundingBox();
      await page.locator('[data-map-place="east-red"]').click();
      const afterSelection = await art.boundingBox();
      check('visible building selection preserves scale and position', Math.abs(afterSelection.width - beforeSelection.width) < 1 && Math.abs(afterSelection.x - beforeSelection.x) < 1 && Math.abs(afterSelection.y - beforeSelection.y) < 1);
      check('building paint order is unchanged by selection', JSON.stringify(await page.locator('[data-map-place]').evaluateAll(nodes => nodes.map(n => n.dataset.mapPlace))) === JSON.stringify(order));
      check('selected highlight cannot cover any building', await page.locator('[data-map-highlight="east-red"]').evaluate(el => !!(el.parentElement.compareDocumentPosition(document.querySelector('#atlas-places')) & Node.DOCUMENT_POSITION_FOLLOWING) && !el.closest('#atlas-places')));
      await page.screenshot({ path: path.join(output, 'east-red-selection.png') });
      await page.locator('#closeDetail').click();
      const beforeEdge = await art.boundingBox();
      await page.locator('[data-map-place="panshui"]').click();
      const afterEdge = await art.boundingBox();
      check('edge selection avoids zooming into blank surroundings', Math.abs(afterEdge.width - beforeEdge.width) < 1 && Math.hypot(afterEdge.x - beforeEdge.x, afterEdge.y - beforeEdge.y) < 100);
      await page.screenshot({ path: path.join(output, 'panshui-selection.png') });
      await page.locator('#closeDetail').click();
      await page.locator('#guideReset').click();
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
      for (const [id, name] of [['zhengdao', '政道楼'], ['stele-gallery', '府学碑廊'], ['panchi', '泮池与泮桥']]) {
        await page.locator('[data-map-place="' + id + '"]').click();
        check('new reference landmark opens its own detail: ' + id, await page.locator('#detailName').textContent() === name);
        await page.locator('#closeDetail').click();
        await page.locator('#guideReset').click();
      }
    }
    await page.locator('[data-map-place="panshui"]').focus();
    await page.keyboard.press('Enter');
    check('keyboard opens southern landmark', await page.locator('#detailName').textContent() === '泮水居');
    check('edge landmark is visible outside detail card', await page.locator('[data-map-place="panshui"] > use').evaluate(el => {
      const b = el.getBoundingClientRect(), d = document.querySelector('#placeDetail').getBoundingClientRect(), m = document.querySelector('#guideMap').getBoundingClientRect();
      const x = (b.left + b.right) / 2, y = (b.top + b.bottom) / 2;
      return x >= m.left && x <= m.right && y >= m.top && y <= m.bottom && !(x >= d.left && x <= d.right && y >= d.top && y <= d.bottom);
    }));
    check('long detail content remains inside the map', await page.locator('#placeDetail').evaluate(el => { const b = el.getBoundingClientRect(), m = document.querySelector('#guideMap').getBoundingClientRect(); return b.top >= m.top && b.bottom <= m.bottom; }));
    await page.locator('#closeDetail').click();
    if (width === 360) {
      await page.locator('#placeSearch').fill('面档');
      await page.locator('.campus-place-row').click();
      check('switching from a southern place to a long introduction reveals the new landmark', await page.locator('[data-map-place="xiwen"] > use').evaluate(el => {
        const b = el.getBoundingClientRect(), d = document.querySelector('#placeDetail').getBoundingClientRect(), m = document.querySelector('#guideMap').getBoundingClientRect();
        const x = (b.left + b.right) / 2, y = (b.top + b.bottom) / 2;
        return x >= m.left && x <= m.right && y >= m.top && y <= m.bottom && !(x >= d.left && x <= d.right && y >= d.top && y <= d.bottom);
      }));
      const content = page.locator('#detailContent');
      check('long mobile introduction scrolls inside its card', await content.evaluate(el => el.scrollHeight > el.clientHeight));
      await content.focus();
      await page.keyboard.press('End');
      await page.waitForTimeout(100);
      check('keyboard can reach references in a long introduction', await content.evaluate(el => el.scrollTop > 0));
      await page.screenshot({ path: path.join(output, '360-dark-long-detail.png') });
      await page.keyboard.press('Escape');
      await page.locator('#placeSearch').fill('');
      await page.locator('#placesToggle').click();
    }
    check('legacy floor data is never requested', oldMapRequests.length === 0);
    // Resize while at overview must keep the complete map fitted.
    await page.locator('#guideReset').click();
    await page.setViewportSize({ width: width < 700 ? 700 : 600, height });
    await page.waitForTimeout(150);
    check('resize has no overflow', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await context.close();
  }
  // Real motion: an offscreen directory selection glides only far enough into view.
  const motionContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'no-preference' });
  const motion = await motionContext.newPage();
  await motion.goto(base + '/map.html', { waitUntil: 'networkidle' });
  await motion.waitForSelector('body[data-guide-ready="true"]');
  await motion.locator('#guideMap').focus();
  for (let i = 0; i < 6; i++) await motion.keyboard.press('ArrowDown');
  const motionArt = motion.locator('.campus-art');
  const motionStart = await motionArt.boundingBox();
  // Open an offscreen landmark from the directory without Playwright auto-scrolling the map.
  await motion.locator('[data-place="north-gate"]').click();
  await motion.waitForTimeout(90);
  const motionMid = await motionArt.boundingBox();
  await motion.waitForTimeout(500);
  const motionEnd = await motionArt.boundingBox();
  check('selection pans through intermediate frames smoothly', Math.abs(motionEnd.y - motionStart.y) > 100 && Math.abs(motionMid.y - motionStart.y) > 1 && Math.abs(motionMid.y - motionEnd.y) > 1);
  check('animated selection preserves user zoom', Math.abs(motionEnd.width - motionStart.width) < 1);
  await motion.locator('#closeDetail').click();
  await motion.locator('#placeSearch').fill('面档');
  check('usage search finds the noodle dining venue', await motion.locator('.campus-place-row').count() === 1 && (await motion.locator('.campus-place-row').textContent()).includes('希文楼'));
  await motionContext.close();
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
