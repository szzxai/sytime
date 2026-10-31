'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const bcrypt = require('bcrypt');
const sharp = require('sharp');
const createApp = require('../../apps/api/src/app');
const { query } = require('../../packages/db/src/client.ts');
const PASSWORD = 'CampusTest2026';
const SHOP = {
  name: '审核面馆',
  address: '十梓街 123 号',
  type: '面馆',
  lat: 31.3004,
  lng: 120.6226,
  campus_distance_m: 420,
  campus_walk_min: 6,
  metro_station: '乐桥',
  metro_exit: '3 号口',
  metro_distance_m: 480,
  metro_walk_min: 7,
};
async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'accounts-v2-'));
  const repo = path.resolve(__dirname, '../..');
  fs.symlinkSync(path.join(repo, 'packages'), path.join(root, 'packages'));
  fs.symlinkSync(path.join(repo, 'data'), path.join(root, 'data'));
  fs.copyFileSync(path.join(repo, 'data.json'), path.join(root, 'data.json'));
  const { app, db, menuService } = createApp(root);
  app.notFound((c) => c.json({ error: 'not found' }, 404));
  t.after(async () => {
    await menuService.close();
    db.$client.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  async function api(url, { method = 'GET', body, token, headers = {} } = {}) {
    const h = { ...headers, ...(token ? { Authorization: 'Bearer ' + token } : {}) };
    if (body !== undefined && !(body instanceof FormData)) h['Content-Type'] = 'application/json';
    const response = await app.request('http://localhost' + url, {
      method,
      headers: h,
      body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, data: await response.json(), headers: response.headers };
  }
  async function login(username) {
    const r = await api('/api/login', { method: 'POST', body: { username, password: PASSWORD } });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    return r.data.token;
  }
  async function account(username, role = 'user') {
    const r = await api('/api/register', {
      method: 'POST',
      body: { username, nickname: username, password: PASSWORD },
    });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    if (role !== 'user') query(db, 'UPDATE users SET role=? WHERE id=?').run(role, r.data.id);
    return { id: r.data.id, username, token: await login(username) };
  }
  async function decide(actor, id, decision = 'approve', reason = '') {
    return api(`/api/admin/reviews/${id}/decision`, {
      method: 'POST',
      token: actor.token,
      body: { decision, reason },
    });
  }
  return { root, api, db, account, login, decide };
}
module.exports = { fixture, PASSWORD, SHOP };
