// Reuse the authoritative campus artwork and place descriptions; no WebView at runtime.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { campusPlaces, campusSources } from '../../web/src/maps/places.ts';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const output = path.join(root, 'apps/ios/Sytime/Resources');
const mapOnly = process.argv.includes('--map-only');
await fs.writeFile(
  path.join(output, 'CampusPlaces.json'),
  JSON.stringify({ places: campusPlaces, sources: campusSources }, null, 2) + '\n',
);
if (!mapOnly) {
  await fs.copyFile(
    path.join(root, 'apps/web/public/img/fan-zhongyan-user.png'),
    path.join(output, 'FanZhongyan.png'),
  );
}
const svg = await fs.readFile(path.join(root, 'apps/web/src/maps/campus.svg'), 'utf8');
const css = await fs.readFile(path.join(root, 'apps/web/public/css/map.css'), 'utf8');
const layers = { 'atlas-landscape-places': '', 'atlas-buildings': '', 'atlas-labels': '' };
for (const p of campusPlaces) {
  const h = p.height || p.size * 0.75;
  const layer =
    p.category === 'nature' || ['track', 'basketball', 'panchi'].includes(p.id)
      ? 'atlas-landscape-places'
      : 'atlas-buildings';
  layers[layer] +=
    `<g data-native-place="${p.id}" transform="translate(${p.x} ${p.y})"><use href="#art-${p.icon}" x="${-p.size / 2}" y="${-h / 2}" width="${p.size}" height="${h}" preserveAspectRatio="none"/></g>`;
  layers['atlas-labels'] +=
    `<g transform="translate(${p.x} ${p.y})"><text class="campus-map-label" x="${p.labelX || 0}" y="${p.labelY ?? h / 2 + 18}" style="font-size:${p.labelSize || 23}px" text-anchor="middle">${p.name}</text></g>`;
}
let renderedSvg = svg;
for (const [id, content] of Object.entries(layers)) {
  const slot = new RegExp(`<g id="${id}"\\s*/>`);
  if (!slot.test(renderedSvg)) throw new Error(`Campus SVG is missing ${id}.`);
  renderedSvg = renderedSvg.replace(slot, `<g id="${id}">${content}</g>`);
}
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1000, height: 1540 },
    deviceScaleFactor: 2,
  });
  for (const theme of ['light', 'dark']) {
    await page.setContent(
      `<html data-theme="${theme}"><head><style>${css}html,body{--font-sans:system-ui,-apple-system,sans-serif;margin:0;width:1000px;height:1540px;overflow:hidden}svg.campus-art{display:block;width:1000px;height:1540px}</style></head><body data-page="map">${renderedSvg}</body></html>`,
    );
    if ((await page.locator('[data-native-place]').count()) !== campusPlaces.length) {
      throw new Error('Campus export is missing landmark artwork.');
    }
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
