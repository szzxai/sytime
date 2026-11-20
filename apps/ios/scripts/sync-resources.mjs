// Export a native static plan from the independent campus survey; no WebView at runtime.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { campusPlaces, campusSources } from '../../web/src/maps/campus/catalog.ts';
import { campusBounds, centers } from '../../web/src/maps/campus/survey.ts';
import {
  overviewData,
  overviewBoundary,
  overviewRoadSurface,
} from '../../web/src/maps/campus/overview.ts';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const output = path.join(root, 'apps/ios/Sytime/Resources');
const mapOnly = process.argv.includes('--map-only');
const [west, south] = campusBounds[0],
  [east, north] = campusBounds[1];
const longitudeScale = Math.cos((((north + south) / 2) * Math.PI) / 180);
const scale = Math.min(840 / ((east - west) * longitudeScale), 1460 / (north - south));
const project = ([x, y]) => [
  500 + (x - (east + west) / 2) * longitudeScale * scale,
  770 + ((north + south) / 2 - y) * scale,
];
const nativePlaces = campusPlaces.map((p) => {
  const points = overviewBoundary(p.id)
    .flatMap((f) => (f.geometry.type === 'Polygon' ? f.geometry.coordinates.flat() : []))
    .map(project);
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const size = xs.length ? Math.max(...xs) - Math.min(...xs) : 40;
  const height = ys.length ? Math.max(...ys) - Math.min(...ys) : 30;
  const [x, y] = xs.length
    ? [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]
    : project(centers.get(p.id));
  return { ...p, icon: p.category, x, y, size: Math.max(size, 24), height: Math.max(height, 20) };
});
await fs.writeFile(
  path.join(output, 'CampusPlaces.json'),
  JSON.stringify({ places: nativePlaces, sources: campusSources }, null, 2) + '\n',
);
if (!mapOnly) {
  await fs.copyFile(
    path.join(root, 'apps/web/public/img/fan-zhongyan-user.png'),
    path.join(output, 'FanZhongyan.png'),
  );
}
const colors = {
  campus: '#e4e9d4',
  context: '#e3dfd6',
  green: '#c1d7ac',
  garden: '#c1d7ac',
  water: '#a3d2d8',
  court: '#d8a185',
  track: '#bb675b',
  field: '#84b078',
  'field-stripe': '#91b980',
  building: '#ede3cc',
  infield: '#84b078',
  street: '#d5d6c7',
  path: '#fffdf4',
};
const rank = [
  'context',
  'campus',
  'street',
  'green',
  'garden',
  'water',
  'court',
  'track',
  'infield',
  'field',
  'field-stripe',
  'path',
  'marking',
  'building',
];
let renderedSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1540"><rect width="1000" height="1540" fill="#f0eee5"/>';
for (const f of [...overviewData.features, ...overviewRoadSurface.features].sort(
  (a, b) => rank.indexOf(a.properties.kind) - rank.indexOf(b.properties.kind),
)) {
  const { kind, color } = f.properties,
    g = f.geometry;
  if (g.type === 'Polygon' && colors[kind]) {
    const rings = g.coordinates.map(
      (ring) =>
        'M' +
        ring
          .map(project)
          .map((p) => p.join(','))
          .join('L') +
        'Z',
    );
    renderedSvg += `<path d="${rings.join(' ')}" fill-rule="evenodd" fill="${color || colors[kind]}"/>`;
  }
  if (g.type === 'LineString' && kind === 'marking')
    renderedSvg += `<polyline points="${g.coordinates
      .map(project)
      .map((p) => p.join(','))
      .join(' ')}" fill="none" stroke="#fffbed" stroke-width="1"/>`;
}
for (const p of nativePlaces)
  renderedSvg += `<text x="${p.x}" y="${p.y}" text-anchor="middle" font-family="system-ui" font-size="13" fill="#465348" stroke="#fffdf4" stroke-width="3" paint-order="stroke">${p.name}</text>`;
renderedSvg += '</svg>';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1000, height: 1540 },
    deviceScaleFactor: 2,
  });
  for (const theme of ['light', 'dark']) {
    await page.setContent(
      `<html data-theme="${theme}"><head><style>html,body{margin:0;width:1000px;height:1540px;overflow:hidden}svg{display:block;width:1000px;height:1540px}</style></head><body>${renderedSvg}</body></html>`,
    );
    await page.screenshot({ path: path.join(output, `Campus-${theme}.png`) });
  }
  if (!mapOnly) {
    const icon = (
      await fs.readFile(path.join(root, 'apps/web/public/img/favicon.svg'), 'utf8')
    ).replace('rx="8"', 'rx="0"');
    await page.setViewportSize({ width: 1024, height: 1024 });
    await page.setContent(
      `<html><style>html,body{margin:0;background:#218653}svg{width:1024px;height:1024px;display:block}</style>${icon}</html>`,
    );
    await page.screenshot({
      path: path.join(output, 'Assets.xcassets/AppIcon.appiconset/AppIcon.png'),
      scale: 'css',
    });
  }
} finally {
  await browser.close();
}
