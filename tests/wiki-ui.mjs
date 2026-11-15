import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
const require = createRequire(import.meta.url);
const createApp = require('../apps/api/src/app.js');
const { query } = require('../packages/db/src/client.ts');
const repo = path.resolve(import.meta.dirname, '..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-ui-'));
for (const name of ['packages', 'data'])
  fs.symlinkSync(path.join(repo, name), path.join(root, name));
fs.copyFileSync(path.join(repo, 'data.json'), path.join(root, 'data.json'));
const { app, db, menuService } = createApp(root);
app.get('*', serveStatic({ root: path.join(repo, 'apps/web/dist') }));
app.get('*', (c) => c.html(fs.readFileSync(path.join(repo, 'apps/web/dist/index.html'), 'utf8')));
const server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' });
await new Promise((resolve) => (server.listening ? resolve() : server.once('listening', resolve)));
const base = `http://127.0.0.1:${server.address().port}`;
const output = path.join(repo, 'output/playwright/wiki');
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch();
const errors = [];
const axe = fs.readFileSync(path.join(repo, 'node_modules/axe-core/axe.min.js'), 'utf8');
let checks = 0;
function check(value, name) {
  assert.ok(value, name);
  checks++;
}
async function api(url, token, body, method = 'POST') {
  const res = await app.request(base + url, {
    method,
    headers: {
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  assert.ok(res.ok, `${method} ${url}: ${JSON.stringify(data)}`);
  return data;
}
async function account(name, role) {
  require('./helpers/seed-account.cjs')(db, name, role);
  return api('/api/login', null, { username: name, nickname: name, password: 'CampusTest2026' });
}
async function context(login, width = 1440, theme = 'light') {
  const ctx = await browser.newContext({
    viewport: { width, height: 950 },
    reducedMotion: 'reduce',
    colorScheme: theme,
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  await ctx.addInitScript(
    ({ login, theme }) => {
      localStorage.setItem('theme', theme);
      if (login) {
        localStorage.setItem('token', 'session');
        localStorage.setItem('user', JSON.stringify(login.user));
      }
    },
    { login, theme },
  );
  if (login)
    await ctx.addCookies([
      { name: 'sytime_session', value: login.token, url: base, httpOnly: true, sameSite: 'Strict' },
    ]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  return { ctx, page };
}
async function audit(page, name) {
  await page.evaluate(axe);
  const problems = await page.evaluate(async () =>
    (
      await window.axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
      })
    ).violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
    })),
  );
  assert.deepEqual(problems, [], name);
  check(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    name + ' no overflow',
  );
}
try {
  const student = await account('wiki_student', 'student');
  const admin = await account('wiki_staff', 'admin');
  const top = await api('/api/admin/wiki/folders', admin.token, { name: '校园生活' });
  const folder = await api('/api/admin/wiki/folders', admin.token, {
    name: '图书馆',
    parent_id: top.id,
  });
  const memories = await api('/api/admin/wiki/folders', admin.token, {
    name: '校园往事',
    position: 1,
  });
  const emptyFolder = await api('/api/admin/wiki/folders', admin.token, { name: '空目录' });
  const markdown = `## 借阅指南\n\n这里是校园的阅读空间，**带好学生卡**，请保持安静。\n\n> 阅读让我们相遇。\n\n| 楼层 | 服务 |\n| --- | --- |\n| 一楼 | 借还书 |\n| 二楼 | 自习 |\n\n- [x] 携带学生卡\n- [ ] 归还图书\n\n\`\`\`js\nconst library = '校园';\n\`\`\`\n\n!!! note "借阅提示"\n    请按时归还图书。\n\n??? tip "一个校园故事"\n    这是被折叠的校园故事。\n\n## 开放时间\n\n${'周一到周五，欢迎来阅读。\n\n'.repeat(25)}\n## 参考资料\n\n[外部资料](https://example.com) · [站内 Wiki](/wiki.html)\n`;
  const payload = {
    title: '图书馆指南',
    aliases: ['藏书楼'],
    markdown,
    sources: ['https://example.com/original'],
    folder_id: folder.id,
  };
  const pending = await api('/api/wiki/entries', student.token, payload);
  const published = await api(`/api/admin/reviews/${pending.id}/decision`, admin.token, {
    decision: 'approve',
  });
  const id = published.published_id;
  const bareRequest = await api('/api/wiki/entries', student.token, {
    title: '校园随笔',
    markdown: '这是一段没有小标题的正文。',
    folder_id: memories.id,
  });
  const bare = await api(`/api/admin/reviews/${bareRequest.id}/decision`, admin.token, {
    decision: 'approve',
  });
  for (const width of [1440, 1024, 390, 1600, 2000])
    for (const theme of ['light', 'dark']) {
      const { ctx, page } = await context(null, width, theme);
      await page.goto(base + '/wiki.html');
      await page.getByLabel('搜索校园百科').waitFor();
      check(
        (await page.locator('.wiki-content form').count()) === 1 &&
          (await page.locator('.wiki-content h1, .wiki-content h2, .wiki-list').count()) === 0,
        'homepage contains only search',
      );
      if (width >= 1220) {
        const parent = page.getByRole('button', { name: '校园生活', exact: true });
        const child = page.getByRole('button', { name: '图书馆', exact: true });
        await parent.click();
        await child.click();
        check(
          (await parent.getAttribute('aria-expanded')) === 'true' &&
            (await child.getAttribute('aria-expanded')) === 'true',
          'folder text expands correct child without collapsing parent',
        );
        check(new URL(page.url()).search === '', 'expansion does not navigate');
        await child.click();
        check(
          (await parent.getAttribute('aria-expanded')) === 'true' &&
            (await child.getAttribute('aria-expanded')) === 'false',
          'folder toggles independently',
        );
      }
      check(
        (await page.locator('a[href="/wiki-edit.html"]').count()) === 0,
        'guest has no create control',
      );
      if (width === 390) {
        await page.getByRole('button', { name: '百科目录', exact: true }).click();
        const parent = page.getByRole('button', { name: '校园生活', exact: true });
        const child = page.getByRole('button', { name: '图书馆', exact: true });
        await parent.click();
        await child.click();
        check(
          (await parent.getAttribute('aria-expanded')) === 'true' &&
            (await child.getAttribute('aria-expanded')) === 'true',
          'mobile folder expands without closing ancestor',
        );
        await page.locator('.wiki-tree a').filter({ hasText: '图书馆指南' }).click();
        await page.getByRole('heading', { name: '图书馆指南', exact: true }).waitFor();
        check(
          await page.locator('#wiki-directory').isHidden(),
          'mobile tree article closes drawer',
        );
        await page.goto(base + '/wiki.html');
        await page.getByLabel('搜索校园百科').waitFor();
      }
      if (width > 992)
        check(
          (await page.locator('.site-nav a[aria-current="page"]').innerText()) === 'Wiki',
          'desktop active Wiki',
        );
      await page.getByLabel('搜索校园百科').fill('tsg');
      await page.getByRole('button', { name: '搜索', exact: true }).click();
      await page.getByRole('heading', { name: '“tsg”的搜索结果' }).waitFor();
      await page.locator('.wiki-list a').first().click();
      await page.getByRole('heading', { name: '图书馆指南', exact: true }).waitFor();
      await page.locator('.wiki-note').waitFor();
      check(
        (await page.locator('.wiki-note').innerText()).includes('请按时归还图书'),
        'MkDocs admonition',
      );
      check(
        (await page.locator('.wiki-fold summary').innerText()) === '一个校园故事',
        'collapsible block',
      );
      check((await page.locator('.wiki-markdown table tbody tr').count()) === 2, 'GFM table');
      await page.getByRole('button', { name: '复制代码' }).click();
      check(
        (await page.evaluate(() => navigator.clipboard.readText())).includes('const library'),
        'code copied',
      );
      const geometry = await page.locator('.wiki-content').evaluate((node) => {
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node.querySelector('.wiki-markdown'));
        return { x: rect.x, width: rect.width, lineHeight: style.lineHeight };
      });
      const unit = width >= 2000 ? 24 : width >= 1600 ? 22 : 20;
      const grid = Math.min(width, 61 * unit);
      const left = width >= 1220 ? 12.1 * unit : 0;
      const right = width >= 960 ? 12.1 * unit : 0;
      const gutter = width >= 1220 ? 1.2 * unit : 0.8 * unit;
      const expected = [(width - grid) / 2 + left + gutter, grid - left - right - gutter * 2];
      check(
        Math.abs(geometry.x - expected[0]) < 1 && Math.abs(geometry.width - expected[1]) < 1,
        `Material article geometry ${width}`,
      );
      check(
        Math.abs(parseFloat(geometry.lineHeight) - unit * 1.28) < 0.01,
        'Material reading line height',
      );
      check(
        await page.getByRole('status').filter({ hasText: '已复制到剪贴板' }).isVisible(),
        'Material copy feedback',
      );
      await audit(page, `article ${width} ${theme}`);
      await page.screenshot({
        path: path.join(output, `article-${width}-${theme}.png`),
        fullPage: true,
      });
      if (width < 993) {
        await page.getByRole('button', { name: '百科目录', exact: true }).click();
        check(await page.locator('#wiki-directory').isVisible(), 'mobile directory opens');
        await page.locator('.wiki-tree a.md-nav__link[aria-current="page"]').click();
        check(
          (await page.locator('#wiki-directory').isVisible()) === false,
          'mobile directory closes after selection',
        );
        await page.getByRole('button', { name: '本页大纲', exact: true }).click();
        await page.locator('#wiki-outline a').filter({ hasText: '开放时间' }).click();
        check((await page.locator('#wiki-outline').isVisible()) === false, 'mobile outline closes');
      } else
        check((await page.locator('#wiki-outline a').count()) === 3, 'desktop outline generated');
      await page.getByRole('link', { name: '修订历史', exact: true }).click();
      await page.locator('.wiki-history li a').first().click();
      await page.getByRole('heading', { name: /历史公开快照/ }).waitFor();
      await page.locator('.wiki-diff').waitFor();
      await page.goto(base + '/wiki.html?id=not-an-id');
      await page.getByText('词条不存在或已被删除', { exact: true }).waitFor();
      await page.goto(base + `/wiki.html?id=${bare.published_id}`);
      await page.getByRole('heading', { name: '校园随笔', exact: true }).waitFor();
      check(await page.locator('#wiki-outline').isHidden(), 'no headings hides outline');
      check(
        await page.getByRole('button', { name: '本页大纲', exact: true }).isHidden(),
        'no headings hides outline trigger',
      );
      const bareWidth = await page
        .locator('.wiki-content')
        .evaluate((el) => el.getBoundingClientRect().width);
      check(
        Math.abs(bareWidth - (grid - left - gutter - 0.8 * unit)) < 1,
        'article uses absent outline space',
      );
      check(
        await page.locator('.site-footer__identity').isVisible(),
        'full shared footer restored',
      );
      const footerStyle = () =>
        page.locator('.site-footer').evaluate((el) => {
          const c = getComputedStyle(el);
          return [c.backgroundColor, c.color, c.padding, c.fontFamily, c.fontSize, c.lineHeight];
        });
      const wikiFooter = await footerStyle();
      await page.goto(base + '/about.html');
      await page.getByRole('heading', { level: 1 }).waitFor();
      check(
        JSON.stringify(await footerStyle()) === JSON.stringify(wikiFooter),
        'Wiki footer matches shared site footer',
      );
      await page.goto(base + `/wiki.html?folder=${emptyFolder.id}`);
      await page.getByRole('heading', { name: '空目录', exact: true }).first().waitFor();
      check(
        await page.getByText('这个文件夹还没有公开词条。', { exact: true }).isVisible(),
        'plain empty folder state',
      );
      check(
        (await page.locator('label[aria-label="展开或收起空目录"]').count()) === 0,
        'empty folders have no disclosure',
      );
      await ctx.close();
    }
  {
    const { ctx, page } = await context(student);
    await page.goto(base + '/wiki-edit.html');
    const body = page.getByLabel('Markdown 正文', { exact: true });
    await body.waitFor();
    check(
      (await body.inputValue()).includes('## 正文') &&
        (await body.inputValue()).includes('## 参考资料'),
      'new entry has editable body and references template',
    );
    check(
      (await page.getByLabel('参考来源', { exact: false }).count()) === 0 &&
        (await page.locator('.wiki-upload-list').count()) === 0,
      'no standalone reference or image section',
    );
    await body.fill('完全自由的正文');
    await page.getByText('草稿已自动保存在当前设备', { exact: true }).waitFor();
    page.once('dialog', (dialog) => dialog.accept());
    await page.reload();
    check((await body.inputValue()) === '完全自由的正文', 'template never replaces saved draft');
    await ctx.close();
  }
  for (const width of [390, 1440]) {
    const { ctx, page } = await context(student, width, 'dark');
    await page.goto(base + `/wiki-edit.html?id=${id}`);
    await page.getByLabel('Markdown 正文', { exact: true }).waitFor();
    check(
      (await page.locator('.wiki-markdown-editor').getAttribute('data-color-mode')) === 'dark',
      'editor follows dark theme',
    );
    await audit(page, `dark editor ${width}`);
    await page.locator('button[data-name="preview"]').click();
    check(await page.locator('.w-md-editor-preview .wiki-note').isVisible(), 'dark editor preview');
    await audit(page, `dark editor preview ${width}`);
    await page.screenshot({ path: path.join(output, `editor-${width}-dark.png`), fullPage: true });
    await ctx.close();
  }
  const { ctx: studentCtx, page: editor } = await context(student);
  await editor.goto(base + `/wiki-edit.html?id=${id}`);
  const input = editor.getByLabel('Markdown 正文', { exact: true });
  check(
    (await input.inputValue()).includes('## 参考资料\n\n- <https://example.com/original>'),
    'legacy references are editable in body',
  );
  await input.fill('前文\n\n后文');
  await input.evaluate((node) => node.setSelectionRange(4, 4));
  const choosing = editor.waitForEvent('filechooser');
  await editor.getByRole('button', { name: '上传图片', exact: true }).click();
  await (await choosing).setFiles(path.join(repo, 'tests/fixtures/review-shot.png'));
  await editor.waitForFunction(() =>
    document
      .querySelector('#wiki-markdown-input')
      .value.includes('![review-shot.png](/api/wiki/images/'),
  );
  check(
    (await input.inputValue()).startsWith('前文\n\n![review-shot.png](') &&
      (await input.inputValue()).endsWith('后文'),
    'toolbar upload inserts at selection',
  );
  const imageBytes = [...fs.readFileSync(path.join(repo, 'tests/fixtures/review-shot.png'))];
  async function transfer(count, type = 'image/png', name = '拖入图片.png') {
    return editor.evaluateHandle(
      ({ bytes, count, type, name }) => {
        const data = new DataTransfer();
        for (let i = 0; i < count; i++)
          data.items.add(new File([new Uint8Array(bytes)], name, { type }));
        return data;
      },
      { bytes: imageBytes, count, type, name },
    );
  }
  await input.evaluate((node) => node.setSelectionRange(node.value.length, node.value.length));
  const dropped = await transfer(8);
  await editor.locator('.wiki-markdown-editor').dispatchEvent('drop', { dataTransfer: dropped });
  await editor.waitForFunction(
    () =>
      (
        document
          .querySelector('#wiki-markdown-input')
          .value.match(/!\[[^\]]*\]\(\/api\/wiki\/images\//g) || []
      ).length === 9,
  );
  check(
    (await input.inputValue()).includes('![拖入图片.png]('),
    'multiple dropped images inserted inline, beyond eight images',
  );
  const pasted = await transfer(1, 'image/png', '粘贴图片.png');
  await input.evaluate(
    (node, data) =>
      node.dispatchEvent(
        new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }),
      ),
    pasted,
  );
  await editor.waitForFunction(() =>
    document
      .querySelector('#wiki-markdown-input')
      .value.includes('![粘贴图片.png](/api/wiki/images/'),
  );
  check(true, 'clipboard images upload inline');
  const withImages = await input.inputValue();
  const imageMarkdown = withImages
    .match(/!\[(?!粘贴图片)[^\]]*\]\(\/api\/wiki\/images\/[^)]+\)/g)
    .join('\n');
  const imageUrl = imageMarkdown.match(/\(([^)]+)\)/)[1];
  const deletedImageUrl = withImages.match(/!\[粘贴图片.png\]\(([^)]+)\)/)[1];
  await input.evaluate((node) => node.setSelectionRange(0, 2));
  const invalid = await transfer(1, 'image/gif', '无效图片.gif');
  await input.evaluate(
    (node, data) =>
      node.dispatchEvent(
        new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }),
      ),
    invalid,
  );
  await editor.getByRole('alert').filter({ hasText: 'JPG、PNG 或 WebP' }).waitFor();
  check(
    !(await input.inputValue()).includes('wiki-upload:'),
    'failed upload removes temporary marker',
  );
  check((await input.inputValue()) === withImages, 'invalid upload preserves selected text');
  await editor.route('**/api/wiki/images', (route) => route.abort());
  const failed = await transfer(1, 'image/png', '网络失败.png');
  await input.evaluate(
    (node, data) =>
      node.dispatchEvent(
        new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }),
      ),
    failed,
  );
  await editor.getByRole('alert').filter({ hasText: '网络连接失败' }).waitFor();
  check(
    (await input.inputValue()) === withImages,
    'network failure restores selection and preserves body',
  );
  await editor.unroute('**/api/wiki/images');
  await input.fill('工具栏测试');
  await input.selectText();
  await editor.locator('button[data-name="bold"]').click();
  check((await input.inputValue()).includes('**工具栏测试**'), 'library toolbar formats selection');
  await input.fill(
    markdown +
      '\n新增的草稿内容。\n' +
      imageMarkdown +
      '\n\n## 参考资料\n\n[参考链接](https://example.com/edited)',
  );
  await editor.getByLabel('本次编辑摘要（必填）').fill('补充开放时间说明');
  check((await fetch(base + imageUrl)).status === 404, 'pending image stays private to guests');
  check(
    (await editor.request.get(base + imageUrl)).status() === 200,
    'author can preview a pending image',
  );
  await audit(editor, 'Wiki editor');
  await editor.screenshot({ path: path.join(output, 'editor.png'), fullPage: true });
  await editor.setViewportSize({ width: 390, height: 950 });
  await editor.locator('button[data-name="edit"]').click();
  await audit(editor, 'mobile Wiki editor');
  await editor.screenshot({ path: path.join(output, 'editor-mobile.png'), fullPage: true });
  await editor.locator('button[data-name="preview"]').click();
  check(
    await editor.locator('.w-md-editor-preview .wiki-note').isVisible(),
    'library preview renders Wiki extensions',
  );
  await editor.locator('button[data-name="edit"]').click();
  await editor.setViewportSize({ width: 1440, height: 950 });
  await editor.getByText('草稿已自动保存在当前设备', { exact: true }).waitFor();
  editor.once('dialog', (d) => d.accept());
  await editor.reload();
  check((await input.inputValue()).includes('新增的草稿内容'), 'draft survives reload');
  await editor.route('**/api/wiki/entries/*/submissions', (route) => route.abort());
  await editor.getByRole('button', { name: '提交审核', exact: true }).click();
  await editor.getByRole('alert').filter({ hasText: '网络连接失败' }).waitFor();
  check((await input.inputValue()).includes('新增的草稿内容'), 'failed network preserves input');
  await editor.unroute('**/api/wiki/entries/*/submissions');
  await editor.getByRole('button', { name: '提交审核', exact: true }).click();
  await editor.getByText('词条修改已提交审核', { exact: true }).waitFor();
  check(
    !(await editor.evaluate(() =>
      Object.keys(localStorage).some((k) => k.startsWith('wiki-draft:')),
    )),
    'submitted draft cleaned',
  );
  await studentCtx.close();
  const { ctx: adminCtx, page: adminPage } = await context(admin);
  await adminPage.goto(base + '/admin.html#reviews');
  await adminPage.getByRole('button', { name: '查看详情' }).first().click();
  await adminPage.getByRole('region', { name: 'Markdown 文本差异' }).waitFor();
  check(
    (await adminPage.locator('.wiki-diff-add').innerText()).includes('新增的草稿内容'),
    'review shows textual diff',
  );
  await adminPage.getByRole('button', { name: '审核通过', exact: true }).click();
  await adminPage.getByRole('button', { name: '确认通过', exact: true }).click();
  await adminPage
    .getByRole('heading', { name: '审核申请', exact: true })
    .waitFor({ state: 'hidden' });
  check((await fetch(base + imageUrl)).status === 200, 'approved image becomes public');
  check(
    (await fetch(base + deletedImageUrl)).status === 404,
    'image removed from Markdown stays private',
  );
  const updated = await (await fetch(base + `/api/wiki/entries/${id}`)).json();
  check(updated.entry.images.length === 9, 'only inline images retained in published entry');
  check(
    updated.entry.sources.length === 0 &&
      updated.entry.markdown.includes('[参考链接](https://example.com/edited)'),
    'references stored as freely edited Markdown',
  );
  await adminPage.getByRole('button', { name: 'Wiki 管理', exact: true }).click();
  await adminPage.getByLabel('选择词条').selectOption(String(id));
  await adminPage.getByRole('link', { name: '阅读「图书馆指南」' }).waitFor();
  await adminPage.getByLabel('手动锁定词条').check();
  await adminPage.getByLabel('锁定说明（手动锁定时必填）').fill('核对图书馆开放时间');
  await adminPage.getByRole('button', { name: '保存词条设置' }).click();
  await adminPage.getByText('Wiki 管理操作已完成', { exact: true }).waitFor();
  await audit(adminPage, 'Wiki admin');
  await adminPage.screenshot({ path: path.join(output, 'admin.png'), fullPage: true });
  await adminCtx.close();
  assert.deepEqual(errors, []);
  console.log(`Wiki browser checks passed: ${checks}; screenshots: ${output}`);
} finally {
  await browser.close();
  await menuService.close();
  await new Promise((resolve) => server.close(resolve));
  db.$client.close();
  fs.rmSync(root, { recursive: true, force: true });
}
