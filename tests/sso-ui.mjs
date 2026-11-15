import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { chromium } from 'playwright';
import jwt from 'jsonwebtoken';
const require = createRequire(import.meta.url);
const { fixture } = require('./helpers/accounts-fixture.cjs');
const { query } = require('../packages/db/src/client.ts');
const repo = path.resolve(import.meta.dirname, '..');
const listen = async (app) => {
  const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 });
  await new Promise((resolve) =>
    server.listening ? resolve() : server.once('listening', resolve),
  );
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
};

test('SSO browser login, real-name profile, bans, appeals and account safety', async (t) => {
  const saved = { ...process.env };
  t.after(() => {
    for (const key of ['APP_ORIGIN', 'OIDC_ISSUER', 'OIDC_CLIENT_ID', 'OIDC_CLIENT_SECRET'])
      saved[key] === undefined ? delete process.env[key] : (process.env[key] = saved[key]);
  });
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const codes = new Map();
  const idp = new Hono();
  let idpOrigin;
  idp.get('/o/.well-known/openid-configuration', (c) =>
    c.json({
      issuer: idpOrigin + '/o',
      authorization_endpoint: idpOrigin + '/authorize',
      token_endpoint: idpOrigin + '/token',
      jwks_uri: idpOrigin + '/jwks',
      end_session_endpoint: idpOrigin + '/logout',
    }),
  );
  idp.get('/jwks', (c) =>
    c.json({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'browser' }] }),
  );
  idp.get('/authorize', (c) => {
    const code = crypto.randomUUID();
    codes.set(code, { nonce: c.req.query('nonce'), challenge: c.req.query('code_challenge') });
    const callback = new URL(c.req.query('redirect_uri'));
    callback.search = new URLSearchParams({
      code,
      state: c.req.query('state'),
      iss: idpOrigin + '/o',
    }).toString();
    return c.redirect(callback.href);
  });
  idp.post('/token', async (c) => {
    const form = await c.req.parseBody();
    const flow = codes.get(form.code);
    codes.delete(form.code);
    assert.ok(flow);
    assert.equal(
      crypto.createHash('sha256').update(form.code_verifier).digest('base64url'),
      flow.challenge,
    );
    return c.json({
      id_token: jwt.sign(
        { sub: 'browser-student', name: '真实姓名同学', nonce: flow.nonce },
        privateKey,
        {
          algorithm: 'RS256',
          keyid: 'browser',
          issuer: idpOrigin + '/o',
          audience: 'browser-client',
          expiresIn: 300,
        },
      ),
    });
  });
  idp.get('/logout', (c) => c.redirect(c.req.query('post_logout_redirect_uri')));
  const provider = await listen(idp);
  idpOrigin = provider.origin;
  t.after(() => new Promise((resolve) => provider.server.close(resolve)));
  const f = await fixture(t);
  const webRoot = path.join(repo, 'apps/web/dist');
  f.app.get('*', serveStatic({ root: webRoot }));
  f.app.get('*', (c) => c.html(fs.readFileSync(path.join(webRoot, 'index.html'), 'utf8')));
  const site = await listen(f.app);
  t.after(() => new Promise((resolve) => site.server.close(resolve)));
  Object.assign(process.env, {
    APP_ORIGIN: site.origin,
    OIDC_ISSUER: idpOrigin + '/o',
    OIDC_CLIENT_ID: 'browser-client',
    OIDC_CLIENT_SECRET: 'browser-server-secret',
  });
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const operator = await f.account('browser_operator', 'operator');
  for (const width of [390, 1280]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(site.origin + '/login.html?next=' + encodeURIComponent('/profile.html'));
    await page.getByRole('link', { name: '通过社盟账号登录', exact: true }).waitFor();
    assert.equal(await page.locator('#loginForm,input[name=username],input[name=password]').count(), 0);
    assert.equal(
      await page.locator('a[href*="register.html"],a[href*="student_verify.html"]').count(),
      0,
    );
    await page.getByRole('link', { name: '使用账号密码登录', exact: true }).click();
    await page.waitForURL('**/login-password.html?*');
    assert.equal(new URL(page.url()).searchParams.get('next'), '/profile.html');
    await page.getByRole('heading', { name: '账号密码登录', exact: true }).waitFor();
    assert.equal(await page.locator('#username').isVisible(), true);
    assert.equal(await page.getByRole('link', { name: '通过社盟账号登录', exact: true }).count(), 0);
    await page.reload();
    await page.locator('#password').waitFor();
    await page.getByRole('link', { name: '返回选择登录方式', exact: true }).click();
    await page.waitForURL('**/login.html?*');
    await page.getByRole('heading', { name: '欢迎回来', exact: true }).waitFor();
    assert.equal(new URL(page.url()).searchParams.get('next'), '/profile.html');
    assert.equal(await page.locator('#loginForm,input[name=username],input[name=password]').count(), 0);
    await page.getByRole('link', { name: '通过社盟账号登录', exact: true }).click();
    await page.waitForURL('**/profile.html');
    await page.locator('#heroNickname').getByText('真实姓名同学').waitFor();
    assert.notEqual(
      await page.locator('#heroNickname').getAttribute('contenteditable'),
      'plaintext-only',
    );
    assert.equal(await page.evaluate(() => localStorage.getItem('token')), 'session');
    assert.ok((await ctx.cookies()).some((c) => c.name === 'sytime_session' && c.httpOnly));
    await page.goto(site.origin + '/settings.html');
    await page.getByRole('heading', { name: '社盟账号安全' }).waitFor();
    assert.equal(await page.locator('#passwordForm').count(), 0);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
      false,
    );
    if (width === 390) {
      const student = query(f.db, 'SELECT * FROM users WHERE sso_subject=?').get('browser-student');
      assert.equal(
        (
          await f.api('/api/admin/users/ban', {
            method: 'PUT',
            token: operator.token,
            body: { userId: student.id, ban_reason: '本站封禁测试' },
          })
        ).status,
        200,
      );
      await page.goto(site.origin + '/login.html');
      await page.getByRole('link', { name: '通过社盟账号登录', exact: true }).click();
      await page.getByText('账号已被封禁', { exact: true }).waitFor();
      assert.equal(await page.locator('#loginForm,input[name=username],input[name=password]').count(), 0);
      assert.equal(await page.locator('#appealBox').isVisible(), true);
      await page.locator('#appealReason').fill('请求复核本站封禁');
      await page.locator('#appealSubmit').click();
      await page.getByText('申诉已提交，请等待管理员审核', { exact: true }).waitFor();
      assert.equal(await page.getByText('最近申诉：待审核', { exact: true }).isVisible(), true);
      const appeal = query(
        f.db,
        "SELECT id FROM moderation_requests WHERE user_id=? AND kind='appeal'",
      ).get(student.id);
      assert.equal((await f.decide(operator, appeal.id)).status, 200);
    }
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});
