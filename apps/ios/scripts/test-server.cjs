'use strict';
// Disposable integration server: never opens the repository's runtime database.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { serve } = require('@hono/node-server');
const createApp = require('../../api/src/app.js');
const { query } = require('../../../packages/db/src/client.ts');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sytime-ios-test-'));
const repo = path.resolve(__dirname, '../../..');
fs.symlinkSync(path.join(repo, 'data'), path.join(root, 'data'));
fs.symlinkSync(path.join(repo, 'packages'), path.join(root, 'packages'));
fs.copyFileSync(path.join(repo, 'data.json'), path.join(root, 'data.json'));
process.env.MENU_SYNC_ENABLED = 'false';
const { app, db, menuService } = createApp(root);
app.notFound((c) => c.json({ error: 'not found' }, 404));
async function api(url, method, body, token) {
  const response = await app.request('http://localhost' + url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (response.status >= 400) throw new Error(JSON.stringify({ status: response.status, data }));
  return data;
}
(async () => {
  require('../../api/src/domain/menu/store').bootstrap(
    db,
    JSON.parse(fs.readFileSync(path.join(repo, 'data/menu-bootstrap.json'), 'utf8')),
  );
  const fixtureDay = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  query(db, 'UPDATE menu_records SET date=? WHERE date=(SELECT min(date) FROM menu_records)').run(
    fixtureDay,
  );
  const accounts = {};
  for (const [username, role] of [
    ['ios_student', 'student'],
    ['ios_admin', 'operator'],
    ['ios_user', 'user'],
  ]) {
    const id = Number(query(db, 'INSERT INTO users(username,nickname,password_hash,role) VALUES(?,?,?,?)').run(username, username, require('bcrypt').hashSync('CampusTest2026', 4), role).lastInsertRowid);
    query(db, 'UPDATE users SET display_id=? WHERE id=?').run(String(id), id);
    accounts[username] = await api('/api/login', 'POST', { username, password: 'CampusTest2026' });
  }
  const recommendation = await api(
    '/api/shops',
    'POST',
    {
      name: '原生联调面馆',
      address: '十梓街 123 号',
      type: '面馆',
      lat: 31.3004,
      lng: 120.6226,
      campus_distance_m: 420,
      campus_walk_min: 6,
      metro_station: '乐桥',
      metro_exit: '3号口',
      metro_distance_m: 480,
      metro_walk_min: 7,
    },
    accounts.ios_student.token,
  );
  await api(
    '/api/admin/reviews/' + recommendation.id + '/decision',
    'POST',
    { decision: 'approve', reason: '' },
    accounts.ios_admin.token,
  );
  const folder = await api(
    '/api/admin/wiki/folders',
    'POST',
    { name: '校园生活', position: 0 },
    accounts.ios_admin.token,
  );
  const wiki = await api(
    '/api/wiki/entries',
    'POST',
    {
      title: '原生校园指南',
      folder_id: folder.id,
      markdown:
        '# 欢迎来到校园\n\n这是原生联调百科。\n\n## 使用方法\n\n- 搜索校园地点\n- 查阅每日食谱',
      aliases: ['nativeguide'],
      sources: [],
      images: [],
      summary: '创建指南',
    },
    accounts.ios_student.token,
  );
  await api(
    '/api/admin/reviews/' + wiki.id + '/decision',
    'POST',
    { decision: 'approve' },
    accounts.ios_admin.token,
  );
  const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 4387 }, () =>
    process.stdout.write('Disposable iOS fixture ready on 127.0.0.1:4387\n'),
  );
  async function close() {
    await menuService.close();
    server.close(() => {
      db.$client.close();
      fs.rmSync(root, { recursive: true, force: true });
      process.exit(0);
    });
  }
  process.on('SIGTERM', close);
  process.on('SIGINT', close);
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
