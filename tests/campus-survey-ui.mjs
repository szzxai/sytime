// Independent survey acceptance: native MapLibre geometry, interaction and complete legacy removal.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import clipping from 'polygon-clipping';
import {
  overviewData,
  overviewHeight,
  overviewRoadSurface,
} from '../apps/web/src/maps/campus/overview.ts';
import { makeStyle } from '../apps/web/src/maps/campus/style.ts';
import { campusPlaces } from '../apps/web/src/maps/campus/catalog.ts';
import { zhideProfile, ziyangFacades } from '../apps/web/src/maps/campus/detail-north.ts';
import { scienceSeating } from '../apps/web/src/maps/campus/detail-science.ts';
import { libraryJunction } from '../apps/web/src/maps/campus/scan-model.ts';
import {
  campusData,
  centers,
  coordinate,
  footprints,
  surfaces,
} from '../apps/web/src/maps/campus/survey.ts';
const root = path.resolve(import.meta.dirname, '..'),
  output = path.join(root, 'output/playwright/campus-survey');
fs.mkdirSync(output, { recursive: true });
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-survey-'));
for (const f of ['server.js', 'data.json']) fs.copyFileSync(path.join(root, f), path.join(temp, f));
for (const d of ['apps', 'packages', 'data'])
  fs.cpSync(path.join(root, d), path.join(temp, d), { recursive: true });
fs.symlinkSync(path.join(root, 'apps/web/dist'), path.join(temp, 'public'), 'junction');
const server = spawn(process.execPath, [path.join(temp, 'server.js')], {
  cwd: temp,
  env: {
    ...process.env,
    NODE_PATH: path.join(root, 'node_modules'),
    PORT: '4348',
    JWT_SECRET: 'survey-ui-test',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '',
  checks = 0,
  browser;
const errors = [];
server.stdout.on('data', (b) => (log += b));
server.stderr.on('data', (b) => (log += b));
function check(name, value) {
  assert.ok(value, name);
  checks++;
}
const axe = fs.readFileSync(path.join(root, 'node_modules/axe-core/axe.min.js'), 'utf8');
try {
  for (const f of [
    'apps/web/src/maps/campus.svg',
    'apps/web/src/maps/places.ts',
    'apps/web/src/maps/campus.js',
    'apps/web/src/maps/campus.ts',
    'apps/web/src/maps/campus-model.ts',
    'tools/build-campus-art.py',
    'apps/web/public/css/map.css',
  ])
    check('retired implementation deleted: ' + f, !fs.existsSync(path.join(root, f)));
  check(
    'all directory entries independently located',
    campusPlaces.every((p) => centers.has(p.id)),
  );
  check(
    'all new features finite and closed',
    campusData.features.every(
      (f) =>
        f.geometry.type !== 'Polygon' ||
        f.geometry.coordinates.every(
          (r) =>
            r.length >= 4 &&
            r[0][0] === r.at(-1)[0] &&
            r[0][1] === r.at(-1)[1] &&
            r.every((p) => p.every(Number.isFinite)),
        ),
    ),
  );
  check(
    'catalog contains no legacy layout data',
    campusPlaces.every((p) => !('x' in p) && !('size' in p) && !('icon' in p)),
  );
  const blocks = overviewData.features.filter((f) => f.properties.kind === 'building');
  const roads = overviewRoadSurface.features.map((f) => f.geometry.coordinates);
  check(
    'overview includes every surveyed building group',
    campusData.features
      .filter((f) => f.properties.kind === 'building')
      .every((f) => blocks.some((block) => block.properties.place === f.properties.place)),
  );
  check(
    'overview building edges are true east-west or north-south',
    blocks.every(({ geometry }) =>
      geometry.coordinates.every((r) =>
        r.slice(1).every(([x, y], i) => x === r[i][0] || y === r[i][1]),
      ),
    ),
  );
  check(
    'overview building footprints stay off paved streets and paths',
    blocks.every(({ geometry }) => !clipping.intersection(geometry.coordinates, roads).length),
  );
  check(
    'overview has uniformly colored 6 m extrusions and no trees',
    blocks.every(
      ({ properties }) =>
        properties.height === overviewHeight && /^#[0-9a-f]{6}$/.test(properties.color),
    ) &&
      !overviewData.features.some((f) => f.properties.kind === 'tree') &&
      makeStyle().layers.find((layer) => layer.id === 'overview-blocks').paint[
        'fill-extrusion-height'
      ] === overviewHeight,
  );
  const overlaps = blocks.some((block, i) =>
    blocks
      .slice(i + 1)
      .some(
        (other) =>
          clipping.intersection(block.geometry.coordinates, other.geometry.coordinates).length,
      ),
  );
  check('overview building footprints have no overlapping blocks', !overlaps);
  const pond = overviewData.features.find(
    ({ properties }) => properties.place === 'chunyu' && properties.kind === 'water',
  );
  check(
    'Chunyu covers the annotated north parcel and stays clear of paths',
    pond.geometry.coordinates[0].some((p) => p[1] >= coordinate([-87, 15.2])[1]) &&
      !clipping.intersection(pond.geometry.coordinates, roads).length,
  );
  const junction = coordinate(libraryJunction);
  const connecting = campusData.features.filter(
    ({ properties, geometry }) =>
      properties.kind === 'path' &&
      geometry.coordinates.some(([x, y]) => x === junction[0] && y === junction[1]),
  );
  check(
    'three road features share one four-way junction',
    connecting.length === 3 &&
      connecting.filter((f) =>
        f.geometry.coordinates
          .slice(1, -1)
          .some(([x, y]) => x === junction[0] && y === junction[1]),
      ).length === 1,
  );
  check('laboratory courtyard is separate wings', footprints.get('laboratory').length === 4);
  check('science open court is separate wings', footprints.get('science').length === 3);
  check(
    'scan positions are registered near the LCC geographic anchor',
    campusPlaces.every((p) => {
      const [longitude, latitude] = centers.get(p.id);
      return longitude > 120.616 && longitude < 120.621 && latitude > 31.295 && latitude < 31.301;
    }),
  );
  check(
    'scan and aerial geometry carry their respective sources',
    ['scan', 'aerial'].every((basis) =>
      campusData.features.some(
        (f) => f.properties.kind === 'building' && f.properties.basis === basis,
      ),
    ),
  );
  check(
    'red hall roofs have genuine elevation changes above the eave',
    surfaces.some(
      ({ points, place }) =>
        place === 'west-red' && points.some((p) => p[2] > 9) && points.some((p) => p[2] < 8.5),
    ),
  );
  const gate = surfaces.filter(({ place }) => place === 'zhide');
  const { start, end, arches } = zhideProfile;
  const angle = Math.atan2(end[1] - start[1], end[0] - start[0]);
  function masonryAt(u, z) {
    // Intersect at a horizontal cut, projecting triangles into gate-elevation coordinates.
    return gate.some(({ points }) => {
      const [a, b, c] = points.map(([x, y, h]) => [
        (x - start[0]) * Math.cos(angle) + (y - start[1]) * Math.sin(angle),
        h,
      ]);
      const signs = [
        [a, b],
        [b, c],
        [c, a],
      ].map(([v, w]) => (w[0] - v[0]) * (z - v[1]) - (w[1] - v[1]) * (u - v[0]));
      return (
        signs.some((x) => Math.abs(x) > 1e-8) &&
        (signs.every((x) => x > 1e-8) || signs.every((x) => x < -1e-8))
      );
    });
  }
  check(
    'three Zhide archways preserve open space under their crowns',
    arches.every(
      ({ center, spring, rise }) =>
        !masonryAt(center + 0.06, spring + rise - 0.2) &&
        masonryAt(center + 0.06, spring + rise + 0.28),
    ),
  );
  check(
    'four masonry piers between and outside the arches',
    [0.4, 3.3, 6.9, 9.9].every((u) => masonryAt(u, 1.32)),
  );
  for (const { place, slabs, guards } of ziyangFacades) {
    const rails = surfaces.filter(
      (surface) => surface.place === place && surface.color === '#7d827c',
    );
    check(
      place + ' has three independent measured gallery rails',
      slabs.every((z, i) =>
        rails.some(({ points }) => points.every((p) => p[2] === z + guards[i])),
      ),
    );
  }
  check(
    'science seats retain three independently measured groups',
    scienceSeating.length === 3 &&
      scienceSeating.every(({ seats }) => seats.length === 3) &&
      surfaces.filter(({ place, color }) => place === 'science' && color === '#eceadf').length ===
        9 * 36,
  );
  check(
    'Daoshan has a surveyed slope and a summit surface',
    surfaces.some(
      ({ points, place }) =>
        place === 'daoshan' && points.some((p) => p[2] > 6) && points.some((p) => p[2] < 5),
    ),
  );
  check(
    'the southern ponds and bridge have separate plans',
    campusData.features.filter(
      (f) => f.properties.place === 'panchi' && f.properties.kind === 'water',
    ).length === 2 &&
      campusData.features.some(
        (f) => f.properties.place === 'panchi' && f.properties.kind === 'bridge-deck',
      ),
  );
  check(
    'the clean mesh contains only finite vertices',
    surfaces.every(({ points }) => points.every((point) => point.every(Number.isFinite))),
  );
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch('http://127.0.0.1:4348/api/settings/banner')).ok) break;
    } catch {
      // The isolated API server can still be starting.
    }
    if (server.exitCode !== null) throw new Error(log);
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch();
  for (const [width, height, theme] of [
    [1440, 1000, 'light'],
    [390, 844, 'light'],
    [360, 740, 'dark'],
    [844, 390, 'light'],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      reducedMotion: 'reduce',
      hasTouch: width < 700,
    });
    await context.addInitScript((t) => localStorage.setItem('theme', t), theme);
    const page = await context.newPage(),
      requests = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (r) => requests.push(r.url()));
    await page.goto('http://127.0.0.1:4348/map.html');
    await page.waitForSelector('body[data-campus-ready="true"]');
    check(
      'new MapLibre source is active',
      (await page.locator('.survey-viewport').getAttribute('data-engine')) === 'maplibre-survey',
    );
    check(
      'old main view is completely absent',
      (await page
        .locator(
          '#guideMap,#guideControls,#placeDetail,.campus-art,.campus-scene-labels,.campus-view-mode',
        )
        .count()) === 0,
    );
    check(
      'same-origin independent worker loaded',
      requests.some((u) => u.includes('maplibre-gl-worker')),
    );
    check(
      'no old image asset requested',
      !requests.some((u) => /campus-.*\.svg|leaflet\.js|\/api\/map-data/.test(u)),
    );
    check(
      'raw scan assets stay out of the runtime',
      !requests.some((u) => /\.(lcc|lci|lcp)(?:[?#]|$)|\/(data|index|environment)\.bin/.test(u)),
    );
    check(
      'full sidebar directory retained',
      (await page.locator('.campus-place-row').count()) === campusPlaces.length,
    );
    const mode = () => page.locator('.survey-viewport').getAttribute('data-mode');
    check(
      'default opens simplified 2.5D with the YourTJ Siping camera',
      (await mode()) === '2.5d' &&
        (await page.locator('.survey-viewport').getAttribute('data-pitch')) === '32.00' &&
        (await page.locator('.survey-viewport').getAttribute('data-bearing')) === '-22.00',
    );
    check(
      'three view choices',
      (await page.getByRole('group', { name: '地图显示模式' }).getByRole('button').count()) === 3,
    );
    if (width === 1440 || width === 390)
      await page.screenshot({ path: path.join(output, `overview-${width}.png`) });
    const zoom = () => page.locator('.survey-viewport').getAttribute('data-zoom');
    const original = Number(await zoom());
    await page.getByRole('button', { name: '放大地图', exact: true }).click();
    await page.waitForFunction(
      (z) => Number(document.querySelector('.survey-viewport').dataset.zoom) > z,
      original,
    );
    check('native zoom control', Number(await zoom()) > original);
    if (width === 1440) {
      const result = await page.locator('canvas.maplibregl-canvas').evaluate((canvas) => {
        const { x, y, width, height } = canvas.getBoundingClientRect();
        const viewport = canvas.closest('.survey-viewport');
        const snapshots = [];
        const gesture = (type, rotation, scale) => {
          const event = new Event(type, { bubbles: true, cancelable: true });
          Object.assign(event, {
            rotation,
            scale,
            clientX: x + width / 2,
            clientY: y + height / 2,
          });
          canvas.dispatchEvent(event);
          return event.defaultPrevented;
        };
        const startZoom = Number(viewport.dataset.zoom);
        const startBearing = Number(viewport.dataset.bearing);
        const claimed = gesture('gesturestart', 0, 1);
        for (const angle of [82, 179, 274, 355, 382, 400]) {
          gesture('gesturechange', angle, 1.25);
          snapshots.push(Number(viewport.dataset.bearing));
        }
        gesture('gestureend', 400, 1.25);
        return {
          claimed,
          snapshots,
          startBearing,
          startZoom,
          endZoom: Number(viewport.dataset.zoom),
        };
      });
      check(
        'macOS GestureEvent pinch and rotation keep working past a full turn',
        result.claimed &&
          result.snapshots.every(
            (bearing, i) =>
              Math.abs(
                ((((bearing - result.startBearing + [82, 179, 274, 355, 382, 400][i]) % 360) +
                  540) %
                  360) -
                  180,
              ) < 0.02,
          ) &&
          Math.abs(result.endZoom - result.startZoom - Math.log2(1.25)) < 0.01,
      );
    }
    if (width === 390) {
      const cdp = await context.newCDPSession(page);
      const r = await page.locator('canvas.maplibregl-canvas').boundingBox();
      const x = r.x + r.width * 0.45;
      const y = r.y + r.height * 0.45;
      const beforeZoom = Number(await zoom());
      const beforeBearing = Number(
        await page.locator('.survey-viewport').getAttribute('data-bearing'),
      );
      for (const [type, angle, radius] of [
        ['touchStart', 0, 31],
        ['touchMove', 0.2, 38],
        ['touchMove', 0.4, 44],
        ['touchMove', 0.65, 53],
        ['touchMove', 0.92, 58],
        ['touchMove', 1.15, 61],
        ['touchEnd', 0, 0],
      ]) {
        await cdp.send('Input.dispatchTouchEvent', {
          type,
          touchPoints:
            type === 'touchEnd'
              ? []
              : [-1, 1].map((sign, id) => ({
                  x: x + sign * radius * Math.cos(angle),
                  y: y + sign * radius * Math.sin(angle),
                  id,
                })),
        });
        await page.evaluate(() => new Promise(requestAnimationFrame));
      }
      await page.waitForFunction(
        ({ zoom, bearing }) => {
          const current = document.querySelector('.survey-viewport').dataset;
          return Number(current.zoom) > zoom && Math.abs(Number(current.bearing) - bearing) > 8;
        },
        { zoom: beforeZoom, bearing: beforeBearing },
        { timeout: 5000 },
      );
      check('touch twist and pinch change bearing and zoom together', true);
      await cdp.detach();
    }
    await page.getByRole('button', { name: '校园全景', exact: true }).click();
    await page.getByRole('button', { name: '旋转视角', exact: true }).click();
    await page.waitForFunction(
      () => Number(document.querySelector('.survey-viewport').dataset.bearing) > 0,
    );
    check('new orbit control works', true);
    await page.getByRole('button', { name: '朝北查看', exact: true }).click();
    await page.waitForFunction(
      () => Math.abs(Number(document.querySelector('.survey-viewport').dataset.bearing)) < 0.1,
    );
    check('north camera control', true);
    await page.getByRole('button', { name: '校园全景', exact: true }).click();
    await page.locator('#placeSearch').fill('量子');
    check(
      'renamed building searchable',
      (await page.locator('.campus-place-row').count()) === 1 &&
        (await page.locator('.campus-place-row').textContent()).includes('政道楼'),
    );
    await page.keyboard.press('Enter');
    await page.waitForSelector('.survey-inspector');
    check(
      'new inspector opens',
      (await page.locator('#survey-place-name').textContent()) === '政道楼',
    );
    check(
      'new native camera fits the location',
      Number(await zoom()) > original && Number(await zoom()) <= 18.8,
    );
    const cameraBefore = await page.locator('.survey-viewport').evaluate((el) => ({
      center: el.dataset.center,
      zoom: el.dataset.zoom,
      bearing: el.dataset.bearing,
    }));
    await page.getByRole('button', { name: '2D', exact: true }).click();
    await page.waitForFunction(
      () => document.querySelector('.survey-viewport').dataset.pitch === '0.00',
    );
    check(
      '2D mode selected',
      (await page.getByRole('button', { name: '2D', exact: true }).getAttribute('aria-pressed')) ===
        'true',
    );
    check(
      'dimension switch preserves camera center zoom bearing',
      await page
        .locator('.survey-viewport')
        .evaluate(
          (el, b) =>
            el.dataset.center === b.center &&
            el.dataset.zoom === b.zoom &&
            el.dataset.bearing === b.bearing,
          cameraBefore,
        ),
    );
    check(
      'dimension switch preserves selected detail',
      (await page.locator('#survey-place-name').textContent()) === '政道楼',
    );
    await page.getByRole('button', { name: '定位此处' }).click();
    check(
      '2D focus stays flat',
      (await page.locator('.survey-viewport').getAttribute('data-pitch')) === '0.00',
    );
    await page.getByRole('button', { name: '旋转视角', exact: true }).click();
    check(
      '2D rotation stays flat',
      (await page.locator('.survey-viewport').getAttribute('data-pitch')) === '0.00',
    );
    if (width === 1440) await page.screenshot({ path: path.join(output, 'desktop-2d.png') });
    await page.getByRole('button', { name: '2.5D', exact: true }).click();
    await page.waitForFunction(
      () => document.querySelector('.survey-viewport').dataset.pitch === '32.00',
    );
    check(
      '2.5D restores tilt',
      (await page
        .getByRole('button', { name: '2.5D', exact: true })
        .getAttribute('aria-pressed')) === 'true',
    );

    check(
      'simplified blocks omit experimental height notes',
      !(await page.locator('.survey-facts').textContent()).includes('檐高'),
    );
    if (width === 1440) {
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(output, 'overview-focus.png') });
    }
    await page.getByRole('button', { name: '实验性', exact: true }).click();
    check(
      'experimental mode restores the selected model and detail',
      (await mode()) === 'experimental' &&
        (await page.locator('#survey-place-name').textContent()) === '政道楼',
    );
    check(
      'estimated massing is disclosed',
      await page
        .locator('.survey-facts')
        .textContent()
        .then((s) => s.includes('檐高约')),
    );
    await page.keyboard.press('Escape');
    check('new inspector closes', (await page.locator('.survey-inspector').count()) === 0);
    await page.locator('#placeSearch').fill('');
    if (width < 700) await page.locator('#placesToggle').click();
    await page.getByRole('button', { name: '校园全景', exact: true }).click();
    if (width > 700) await page.locator('[data-place="science"]').click();
    else {
      await page.locator('#placeSearch').fill('科学楼');
      await page.keyboard.press('Enter');
    }
    await page.waitForFunction(
      () => document.getElementById('survey-place-name')?.textContent === '科学楼',
    );
    check(
      'directory uses new focus action',
      (await page.locator('#survey-place-name').textContent()) === '科学楼',
    );
    check(
      'inspector fits scene',
      await page.locator('.survey-inspector').evaluate((e) => {
        const r = e.getBoundingClientRect(),
          s = document.querySelector('.survey-scene').getBoundingClientRect();
        return r.top >= s.top - 1 && r.bottom <= s.bottom + 1 && r.right <= s.right + 1;
      }),
    );
    check(
      'new projected building remains visible',
      await page.locator('canvas.maplibregl-canvas').isVisible(),
    );
    await page.evaluate(axe);
    const violations = await page.evaluate(async () =>
      (
        await axe.run(document, {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
        })
      ).violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
    );
    check(
      'accessible interface ' + width,
      violations.length === 0 || (errors.push({ width, violations }), false),
    );
    if (width === 1440 || width === 360)
      await page.screenshot({ path: path.join(output, `${width}-${theme}-detail.png`) });
    await page.getByRole('button', { name: '关闭地点详情' }).click();
    await page.getByRole('button', { name: '校园全景', exact: true }).click();
    await page.locator('#placeSearch').fill('不存在的地点');
    check('empty search state', await page.locator('#placesEmpty').isVisible());
    await page.locator('#resetSearch').click();
    if (width < 700) await page.locator('#placesToggle').click();
    if (width === 1440) {
      const canvas = page.locator('.maplibregl-canvas'),
        r = await canvas.boundingBox();
      await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
      const z = Number(await zoom());
      await page.mouse.wheel(0, -160);
      await page.waitForFunction(
        (z) => Number(document.querySelector('.survey-viewport').dataset.zoom) > z,
        z,
      );
      check('ordinary wheel now zooms natively', true);
      await page.getByRole('button', { name: '校园全景', exact: true }).click();
      await page.waitForTimeout(150);
      await page.screenshot({ path: path.join(output, 'desktop.png') });
      // Tap the actual roof by focusing, then picking the geometrical location at its rendered center.
      await page.locator('[data-place="science"]').click();
      await page.getByRole('button', { name: '关闭地点详情' }).click();
      const screen = await page.locator('.survey-viewport').evaluate((el) => {
        // Camera center after focus is shifted for the new inspector.
        const r = el.getBoundingClientRect();
        return { x: r.x + (r.width - 305) / 2, y: r.y + r.height / 2 };
      });
      await page.mouse.click(screen.x, screen.y);
      await page.waitForTimeout(80);
      check(
        'native feature click opens a location',
        (await page.locator('.survey-inspector').count()) === 1,
      );
      await page.getByRole('button', { name: '关闭地点详情' }).click();
      for (const [place, fact, steps] of [
        ['zhide', '四座灰砖墩', 2],
        ['east-ziyang', '四层', 0],
        ['west-ziyang', '四层', 0],
        ['east-red', '镂空栏板', 0],
        ['north-gate', '拱形通道', 1],
      ]) {
        await page.getByRole('button', { name: '校园全景', exact: true }).click();
        await page.locator(`[data-place="${place}"]`).click();
        check(
          place + ' shows survey readings',
          (await page.locator('.survey-inspector').textContent()).includes(fact),
        );
        for (let step = 0; step < steps; step++) {
          await page.getByRole('button', { name: '放大地图', exact: true }).click();
        }
        await page.screenshot({ path: path.join(output, `${place}.png`) });
        await page.getByRole('button', { name: '关闭地点详情' }).click();
      }
      await page
        .locator('.maplibregl-canvas')
        .evaluate((c) => c.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
      await page.getByRole('button', { name: '重新加载' }).waitFor();
      check('WebGL loss recovers through new loader', true);
      await page.getByRole('button', { name: '重新加载' }).click();
      await page.waitForSelector('body[data-campus-ready="true"]');
      check(
        'retry creates one native canvas',
        (await page.locator('.maplibregl-canvas').count()) === 1,
      );
    }
    await page.setViewportSize({ width: width < 700 ? 700 : 600, height });
    await page.waitForTimeout(100);
    check(
      'resize no overflow',
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    );
    await page.goto('http://127.0.0.1:4348/');
    check('native map unmounts', (await page.locator('.maplibregl-canvas').count()) === 0);
    await context.close();
  }
  check('no browser runtime errors', errors.length === 0);
} catch (e) {
  errors.push({ fatal: e.stack, log: log.slice(-1500) });
} finally {
  if (browser) await browser.close();
  server.kill();
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ checks, errors }, null, 2));
  fs.rmSync(temp, { recursive: true, force: true });
}
if (errors.length) {
  console.error(JSON.stringify(errors, null, 2));
  process.exit(1);
}
console.log(`campus-survey-ui: ${checks} checks passed`);
