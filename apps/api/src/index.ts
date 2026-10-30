import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import createApp from './app.js';
const root = path.resolve(process.env.APP_ROOT || process.cwd());
const { app, db, menuService } = createApp(root);
const webRoot = path.join(root, 'apps/web/dist');
app.all('/api', (c) => c.json({ error: 'not found' }, 404));
app.all('/api/*', (c) => c.json({ error: 'not found' }, 404));
app.get(
  '/uploads/*',
  serveStatic({
    root: path.join(root, 'uploads'),
    rewriteRequestPath: (p) => p.replace(/^\/uploads/, ''),
  }),
);
app.get('*', serveStatic({ root: webRoot }));
const pages = new Set([
  '/',
  ...[
    'index',
    'about',
    'map',
    'recipe',
    'dish',
    'shops',
    'shop',
    'shop-new',
    'announcements',
    'inbox',
    'profile',
    'settings',
    'user',
    'admin',
    'login',
    'register',
    'student_verify',
    '404',
  ].map((x) => `/${x}.html`),
]);
app.get('*', async (c) => {
  if (
    c.req.path.startsWith('/uploads/') ||
    c.req.path.split('/').some((part) => part.startsWith('.'))
  )
    return c.notFound();
  const html = await fs.readFile(path.join(webRoot, 'index.html'), 'utf8');
  return c.html(html, pages.has(c.req.path) ? 200 : 404);
});
app.onError((error, c) => {
  console.error('[api]', error.message);
  return c.json(
    {
      error: c.req.path.startsWith('/api/admin/menu-sync')
        ? '菜单请求执行失败，请重试'
        : 'server error',
    },
    500,
  );
});
const server = serve({ fetch: app.fetch, port: Number(process.env.PORT || 3000) }, () => {
  console.log(`Campus map running at http://localhost:${process.env.PORT || 3000}`);
  menuService.start();
});
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  await menuService.close();
  server.close(() => {
    db.$client.close();
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
