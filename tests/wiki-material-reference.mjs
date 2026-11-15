/** Opt-in comparison with an actual upstream Material page and local examples.
 * Run: node tests/wiki-material-reference.mjs [Wiki origin] [Material page URL]
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';
const base = process.argv[2] || 'http://localhost:5173';
const reference =
  process.argv[3] || 'http://localhost:8000/jottings/legacy/the-top-3-myths-busted-about-llm/';
const out = path.resolve('output/playwright/wiki-material');
await fs.mkdir(out, { recursive: true });
const directory = await (await fetch(base + '/api/wiki')).json();
const example = directory.entries.find((e) => e.title === '排版示例：校园阅读指南');
assert.ok(example, 'Run node --import tsx tools/wiki-examples.mjs first');
const props = [
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'font-feature-settings',
  'letter-spacing',
  'line-height',
  'word-spacing',
  'text-decoration',
  'text-transform',
  'color',
  'background-color',
  'padding-top',
  'padding-bottom',
  'padding-left',
  'padding-right',
  'margin-top',
  'margin-bottom',
  'margin-left',
  'margin-right',
  'border-top-width',
  'border-bottom-width',
  'border-left-width',
  'border-right-width',
  'border-radius',
  'display',
  'list-style-type',
  'vertical-align',
  'transition-duration',
  'transition-timing-function',
  'width',
  'height',
  'box-shadow',
  'opacity',
];
const palette = await (
  await fetch(
    'https://raw.githubusercontent.com/squidfunk/mkdocs-material/9.8.1/material/templates/assets/stylesheets/palette.fb2fffe2.min.css',
  )
).text();
const browser = await chromium.launch();
const report = [];
try {
  for (const theme of ['light', 'dark'])
    for (const viewport of [390, 768, 1024, 1440, 1600, 2000]) {
      const context = await browser.newContext({
        viewport: { width: viewport, height: 1000 },
        colorScheme: theme,
      });
      const actual = await context.newPage();
      await actual.addInitScript((theme) => localStorage.setItem('theme', theme), theme);
      await actual.goto(base + `/wiki.html?id=${example.id}`);
      await actual.locator('.wiki-markdown').waitFor();
      const html = await actual.locator('.wiki-markdown').innerHTML();
      const navHtml = await actual.locator('.wiki-tree').evaluate((el) => el.outerHTML);
      const width = await actual
        .locator('.wiki-content')
        .evaluate((el) => el.getBoundingClientRect().width);
      const expected = await context.newPage();
      await expected.goto(reference);
      if (theme === 'dark') {
        await expected.addStyleTag({ content: palette });
        await expected.evaluate(() => {
          document.body.dataset.mdColorScheme = 'slate';
          document.body.dataset.mdColorPrimary = 'indigo';
        });
      }
      for (const [page, wiki] of [
        [actual, true],
        [expected, false],
      ]) {
        await page.evaluate(
          ({ html, width, wiki }) => {
            document.body.innerHTML = `<div class="${wiki ? 'wiki-material wiki-shell' : ''}" data-md-color-primary="indigo"><div class="wiki-markdown md-typeset ${wiki ? '' : 'md-content__inner'}" style="width:${width}px;margin:0;padding:0">${html}</div></div>`;
            document.body.style.cssText = 'margin:0';
            const style = document.createElement('style');
            style.textContent =
              '.wiki-markdown::before{display:none!important}.wiki-markdown{position:relative}';
            document.head.append(style);
          },
          { html, width, wiki },
        );
        await page.evaluate(() => document.fonts.ready);
        await page.mouse.move(viewport - 1, 0);
      }
      const styles = (page) =>
        page.locator('.wiki-markdown').evaluate(
          (root, props) =>
            [...root.querySelectorAll('*')].map((el, i) => {
              const computed = getComputedStyle(el);
              const rect = el.getBoundingClientRect();
              const origin = root.getBoundingClientRect();
              return {
                i,
                tag: el.classList.contains('wiki-folder-toggle') ? 'FOLDER' : el.tagName,
                x: rect.x - origin.x,
                y: rect.y - origin.y,
                styles: Object.fromEntries(props.map((p) => [p, computed.getPropertyValue(p)])),
              };
            }),
          props,
        );
      const a = await styles(actual),
        e = await styles(expected);
      assert.deepEqual(a, e, `Upstream computed styles and geometry at ${viewport}px`);
      // Verify the upstream hover colors and transition timings, including
      // heading permalinks, links, code actions and admonition summaries.
      for (const selector of ['h2', '.md-code__button', 'a[href^="https:"]', 'summary']) {
        await actual
          .locator('.wiki-markdown ' + selector)
          .first()
          .hover();
        await expected
          .locator('.wiki-markdown ' + selector)
          .first()
          .hover();
        await actual.waitForTimeout(300);
        assert.deepEqual(
          await styles(actual),
          await styles(expected),
          `Upstream hover ${selector} ${viewport}px`,
        );
      }
      await actual.mouse.move(viewport - 1, 0);
      await expected.mouse.move(viewport - 1, 0);
      await actual.waitForTimeout(300);
      const aFile = path.join(out, `actual-${viewport}-${theme}.png`),
        eFile = path.join(out, `reference-${viewport}-${theme}.png`);
      await actual.locator('.wiki-markdown').screenshot({ path: aFile });
      await expected.locator('.wiki-markdown').screenshot({ path: eFile });
      const ar = await sharp(aFile).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const er = await sharp(eFile).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      assert.deepEqual(ar.info, er.info, 'Same raster dimensions');
      let different = 0,
        maxDelta = 0;
      for (let i = 0; i < ar.data.length; i++) {
        const delta = Math.abs(ar.data[i] - er.data[i]);
        maxDelta = Math.max(delta, maxDelta);
        if (delta > 2) different++;
      }
      // A two-level channel tolerance permits Chromium's alpha compositing
      // rounding, while retaining exact layout and glyph shape comparisons.
      assert.equal(different, 0, `Pixel differences beyond compositing rounding at ${viewport}px`);
      report.push({
        theme,
        viewport,
        elements: a.length,
        styleProperties: props.length,
        maxChannelDelta: maxDelta,
        differentChannels: different,
      });
      for (const [page, wiki] of [
        [actual, true],
        [expected, false],
      ]) {
        await page.evaluate(
          ({ navHtml, wiki }) => {
            document.body.innerHTML = `<div class="${wiki ? 'wiki-material wiki-shell' : ''}" data-md-color-primary="indigo"><aside class="md-sidebar md-sidebar--primary wiki-sidebar is-open" style="left:0;top:0;height:1000px;visibility:visible;transform:none"><div class="md-sidebar__scrollwrap" style="max-height:none"><div class="md-sidebar__inner">${navHtml}</div></div></aside></div>`;
          },
          { navHtml, wiki },
        );
        if (!wiki)
          await page.locator('.wiki-folder-toggle').evaluateAll((buttons) => {
            for (const button of buttons) {
              const label = document.createElement('label');
              label.className = button.className;
              label.htmlFor = button.closest('li').querySelector('input').id;
              label.innerHTML = button.innerHTML;
              button.replaceWith(label);
            }
          });
        await page.mouse.move(viewport - 1, 0);
      }
      const navStyles = (page) =>
        page.locator('.wiki-tree').evaluate(
          (root, props) =>
            [root, ...root.querySelectorAll('*')].map((el, i) => {
              const c = getComputedStyle(el);
              const rect = el.getBoundingClientRect();
              const origin = root.getBoundingClientRect();
              const icon = getComputedStyle(el, '::after');
              return {
                i,
                tag: el.classList.contains('wiki-folder-toggle') ? 'FOLDER' : el.tagName,
                x: rect.x - origin.x,
                y: rect.y - origin.y,
                styles: Object.fromEntries(props.map((p) => [p, c.getPropertyValue(p)])),
                icon: [icon.transform, icon.transitionDuration, icon.transitionTimingFunction],
              };
            }),
          props,
        );
      assert.deepEqual(
        await navStyles(actual),
        await navStyles(expected),
        `Upstream navigation ${viewport}px`,
      );
      await actual.locator('.md-nav__link--active').hover();
      await expected.locator('.md-nav__link--active').hover();
      await actual.waitForTimeout(300);
      assert.deepEqual(
        await navStyles(actual),
        await navStyles(expected),
        `Upstream navigation hover ${viewport}px`,
      );
      for (const page of [actual, expected])
        await page
          .locator('.md-nav__toggle')
          .first()
          .evaluate((input) => input.click());
      await actual.waitForTimeout(300);
      assert.deepEqual(
        await navStyles(actual),
        await navStyles(expected),
        `Upstream navigation toggle ${viewport}px ${theme}`,
      );
      await context.close();
    }
  await fs.writeFile(path.join(out, 'comparison.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
