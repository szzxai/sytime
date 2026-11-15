'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const { fixture, PASSWORD } = require('./helpers/accounts-fixture.cjs');
const { query } = require('../packages/db/src/client.ts');
const issuer = 'https://identity.example/o';
const digest = (value) => crypto.createHash('sha256').update(value).digest('base64url');
const cookie = (response, name) =>
  response.headers
    .getSetCookie()
    .find((value) => value.startsWith(name + '='))
    ?.split(';')[0];

test('OIDC server flow, identity mapping, bans, appeals and native ticket protection', async (t) => {
  const saved = { ...process.env };
  Object.assign(process.env, {
    APP_ORIGIN: 'https://time.example',
    OIDC_ISSUER: issuer,
    OIDC_CLIENT_ID: 'sytime',
    OIDC_CLIENT_SECRET: 'server-only-secret',
  });
  t.after(() => {
    for (const key of ['APP_ORIGIN', 'OIDC_ISSUER', 'OIDC_CLIENT_ID', 'OIDC_CLIENT_SECRET'])
      saved[key] === undefined ? delete process.env[key] : (process.env[key] = saved[key]);
  });
  const f = await fixture(t);
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key', use: 'sig', alg: 'RS256' };
  const codes = new Map();
  const attempts = [];
  let tokenClaims = {},
    subject = 'student-001',
    realName = '张三',
    signWithOtherKey = false,
    userInfoName = null;
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    url = String(url);
    if (url === issuer + '/.well-known/openid-configuration')
      return Response.json({
        issuer,
        authorization_endpoint: issuer + '/authorize/',
        token_endpoint: issuer + '/token/',
        jwks_uri: issuer + '/jwks',
        end_session_endpoint: issuer + '/logout/',
        userinfo_endpoint: issuer + '/userinfo/',
      });
    if (url === issuer + '/jwks') return Response.json({ keys: [jwk] });
    if (url === issuer + '/userinfo/') return Response.json({ sub: subject, name: userInfoName });
    assert.equal(url, issuer + '/token/');
    assert.equal(options.redirect, 'error');
    const form = new URLSearchParams(options.body);
    assert.equal(form.get('client_secret'), 'server-only-secret');
    assert.equal(form.get('redirect_uri'), 'https://time.example/api/sso/callback');
    const code = codes.get(form.get('code'));
    assert.ok(code, 'authorization code is valid and consumed only once');
    codes.delete(form.get('code'));
    assert.equal(digest(form.get('code_verifier')), code.challenge);
    attempts.push(form);
    const claims = {
      iss: issuer,
      aud: 'sytime',
      sub: subject,
      name: realName,
      nonce: code.nonce,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 300,
      ...tokenClaims,
    };
    const idToken = jwt.sign(
      claims,
      signWithOtherKey
        ? crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey
        : privateKey,
      { algorithm: 'RS256', keyid: 'test-key', noTimestamp: tokenClaims.iat === null },
    );
    return Response.json({ id_token: idToken, access_token: 'opaque-token' });
  });
  async function start(queryString = '', headers = {}) {
    const response = await f.app.request('https://time.example/api/sso/start' + queryString, {
      headers,
    });
    const url = new URL(response.headers.get('location'), 'https://time.example');
    assert.equal(url.origin, 'https://identity.example');
    assert.equal(url.searchParams.get('scope'), 'openid profile');
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(url.searchParams.has('client_secret'), false);
    const state = url.searchParams.get('state');
    codes.set(state, {
      nonce: url.searchParams.get('nonce'),
      challenge: url.searchParams.get('code_challenge'),
    });
    return { state, browser: cookie(response, 'sytime_oidc') };
  }
  async function callback(flow, overrides = {}, browser = flow.browser) {
    const params = new URLSearchParams({
      state: flow.state,
      code: flow.state,
      iss: issuer,
      ...overrides,
    });
    return f.app.request('https://time.example/api/sso/callback?' + params, {
      headers: browser ? { Cookie: browser } : {},
    });
  }
  async function authenticated(response) {
    return f.app.request('https://time.example/api/user/profile', {
      headers: { Cookie: cookie(response, 'sytime_session') || '' },
    });
  }
  // Expose raw Hono requests while retaining the existing API fixture helpers.
  const operator = await f.account('sso_operator', 'operator');
  await t.test(
    'first login gets student role and real name; session cookie is HttpOnly; stable sub survives renaming',
    async () => {
      const flow = await start('?next=' + encodeURIComponent('/wiki.html?id=4'));
      const response = await callback(flow);
      assert.equal(response.status, 302);
      assert.equal(
        new URL(response.headers.get('location'), 'https://time.example').searchParams.get('next'),
        '/wiki.html?id=4',
      );
      const profile = await authenticated(response);
      assert.equal(profile.status, 200);
      const user = (await profile.json()).user;
      assert.equal(user.role, 'student');
      assert.equal(user.nickname, '张三');
      assert.equal(user.auth_source, 'sso');
      assert.match(response.headers.get('set-cookie'), /HttpOnly/);
      const account = query(f.db, 'SELECT * FROM users WHERE id=?').get(user.id);
      assert.equal(account.password_hash, null);
      assert.equal(account.sso_subject, subject);
      realName = '李四';
      const next = await callback(await start());
      const renamed = (await (await authenticated(next)).json()).user;
      assert.equal(renamed.id, user.id);
      assert.equal(renamed.nickname, '李四');
      assert.equal(
        (
          await f.api('/api/user/nickname', {
            method: 'PUT',
            headers: { Cookie: cookie(next, 'sytime_session') },
            body: { nickname: '假名' },
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await f.api('/api/user/password', {
            method: 'PUT',
            headers: { Cookie: cookie(next, 'sytime_session') },
            body: { oldPassword: PASSWORD, newPassword: 'ValidPassword123' },
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await f.api('/api/user/sessions/revoke', {
            method: 'POST',
            headers: { Cookie: cookie(next, 'sytime_session') },
            body: { password: PASSWORD },
          })
        ).status,
        403,
      );
      const logout = await f.api('/api/logout', {
        method: 'POST',
        headers: { Cookie: cookie(next, 'sytime_session') },
      });
      assert.equal(new URL(logout.data.logout_url).origin, 'https://identity.example');
      assert.equal((await authenticated(next)).status, 401);
    },
  );
  await t.test(
    'same name never merges with a local account; local passwords and roles remain valid',
    async () => {
      const local = await f.account('local_student', 'student');
      query(f.db, 'UPDATE users SET nickname=? WHERE id=?').run(realName, local.id);
      const response = await callback(await start());
      const student = (await (await authenticated(response)).json()).user;
      assert.notEqual(student.id, local.id);
      assert.equal(
        (
          await f.api('/api/login', {
            method: 'POST',
            body: { username: local.username, password: PASSWORD },
          })
        ).status,
        200,
      );
      const logout = await f.api('/api/logout', { method: 'POST', token: local.token });
      assert.equal(logout.data.logout_url, '');
    },
  );
  await t.test(
    'state, browser binding and replay are validated before token exchange',
    async () => {
      const flow = await start();
      const before = attempts.length;
      assert.match(
        (await callback(flow, { state: 'unknown' })).headers.get('location'),
        /sso=error/,
      );
      assert.match(
        (await callback(flow, {}, 'sytime_oidc=wrong')).headers.get('location'),
        /sso=error/,
      );
      assert.match((await callback(flow, {}, '')).headers.get('location'), /sso=error/);
      assert.equal(attempts.length, before);
      assert.match((await callback(flow)).headers.get('location'), /sso=success/);
      assert.match((await callback(flow)).headers.get('location'), /sso=error/);
      assert.equal(attempts.length, before + 1);
    },
  );
  await t.test(
    'invalid issuer, nonce, audience, times and signature fail without sessions',
    async () => {
      for (const claims of [
        { nonce: 'wrong' },
        { iss: 'https://evil.example' },
        { aud: 'evil' },
        { exp: 1 },
        { exp: undefined },
        { iat: Math.floor(Date.now() / 1000) + 300 },
        { sub: '' },
        { name: '' },
        { aud: ['sytime', 'other'], azp: 'other' },
      ]) {
        tokenClaims = claims;
        const response = await callback(await start());
        assert.match(response.headers.get('location'), /sso=error/, JSON.stringify(claims));
        assert.equal(cookie(response, 'sytime_session'), undefined);
      }
      tokenClaims = {};
      signWithOtherKey = true;
      assert.match((await callback(await start())).headers.get('location'), /sso=error/);
      signWithOtherKey = false;
      const flow = await start();
      const before = attempts.length;
      assert.match(
        (await callback(flow, { iss: 'https://evil.example' })).headers.get('location'),
        /sso=error/,
      );
      assert.equal(attempts.length, before);
    },
  );
  await t.test('UserInfo supplies name when profile is absent from the ID token', async () => {
    tokenClaims = { name: undefined };
    userInfoName = '真实姓名';
    const response = await callback(await start());
    assert.equal((await (await authenticated(response)).json()).user.nickname, '真实姓名');
    tokenClaims = {};
    userInfoName = null;
  });
  await t.test(
    'ban revokes sessions, repeated SSO remains banned, verified identity can only appeal',
    async () => {
      const response = await callback(await start());
      const user = (await (await authenticated(response)).json()).user;
      assert.equal(
        (
          await f.api('/api/admin/users/ban', {
            method: 'PUT',
            token: operator.token,
            body: { userId: user.id, ban_reason: '本站限制' },
          })
        ).status,
        200,
      );
      assert.equal((await authenticated(response)).status, 401);
      const banned = await callback(await start());
      assert.equal(banned.headers.get('location'), '/login.html?sso=banned');
      const proof = cookie(banned, 'sytime_appeal');
      const info = await f.api('/api/sso/ban', { headers: { Cookie: proof } });
      assert.equal(info.data.ban_reason, '本站限制');
      assert.equal((await f.api('/api/user/profile', { headers: { Cookie: proof } })).status, 401);
      const appeal = await f.api('/api/user/appeal', {
        method: 'POST',
        headers: { Cookie: proof },
        body: { appeal_reason: '请求复核' },
      });
      assert.equal(appeal.status, 202);
      assert.equal(
        (
          await f.api('/api/user/appeal', {
            method: 'POST',
            body: { username: user.username, password: 'anything', appeal_reason: '请求复核' },
          })
        ).status,
        403,
      );
      assert.equal((await f.decide(operator, appeal.data.id)).status, 200);
      assert.equal((await authenticated(await callback(await start()))).status, 200);
    },
  );
  await t.test(
    'native ticket is short lived, single use and bound to the app verifier',
    async () => {
      const verifier = crypto.randomBytes(32).toString('base64url');
      const response = await callback(await start('?native_challenge=' + digest(verifier)));
      const url = new URL(response.headers.get('location'));
      assert.equal(url.protocol, 'sytime:');
      assert.equal(url.host, 'auth');
      const ticket = url.searchParams.get('ticket');
      const exchange = (v = verifier) =>
        f.api('/api/sso/native/exchange', { method: 'POST', body: { ticket, verifier: v } });
      assert.equal((await exchange('a'.repeat(43))).status, 401);
      const result = await exchange();
      assert.equal(result.status, 200);
      assert.equal(result.data.user.role, 'student');
      assert.equal((await exchange()).status, 401);
      const next = await callback(await start('?native_challenge=' + digest(verifier)));
      const expired = new URL(next.headers.get('location')).searchParams.get('ticket');
      query(f.db, 'UPDATE oidc_flows SET expires_at=1 WHERE id=?').run(digest(expired));
      assert.equal(
        (
          await f.api('/api/sso/native/exchange', {
            method: 'POST',
            body: { ticket: expired, verifier },
          })
        ).status,
        401,
      );
      const revokeResponse = await callback(await start('?native_challenge=' + digest(verifier)));
      const revokeTicket = new URL(revokeResponse.headers.get('location')).searchParams.get(
        'ticket',
      );
      const body = { ticket: revokeTicket, verifier, intent: 'revoke' };
      assert.equal(
        (await f.api('/api/sso/native/exchange', { method: 'POST', token: operator.token, body }))
          .status,
        403,
      );
      assert.equal(
        (
          await f.api('/api/sso/native/exchange', {
            method: 'POST',
            token: result.data.token,
            body,
          })
        ).status,
        200,
      );
      assert.equal((await f.api('/api/user/profile', { token: result.data.token })).status, 401);
      await f.api('/api/admin/users/ban', {
        method: 'PUT',
        token: operator.token,
        body: { userId: result.data.user.id, ban_reason: '原生端封禁验证' },
      });
      const bannedResponse = await callback(await start('?native_challenge=' + digest(verifier)));
      const bannedTicket = new URL(bannedResponse.headers.get('location')).searchParams.get(
        'ticket',
      );
      const bannedResult = await f.api('/api/sso/native/exchange', {
        method: 'POST',
        body: { ticket: bannedTicket, verifier },
      });
      assert.equal(bannedResult.status, 403);
      assert.equal(bannedResult.data.error, 'banned');
      assert.ok(bannedResult.data.appeal_token);
      assert.equal(
        (await f.api('/api/user/profile', { token: bannedResult.data.appeal_token })).status,
        401,
      );
      await f.api('/api/admin/users/unban', {
        method: 'PUT',
        token: operator.token,
        body: { userId: result.data.user.id },
      });
    },
  );
  await t.test(
    'SSO reauthentication revokes every local session and redirects stay on this site',
    async () => {
      const response = await callback(await start('?next=' + encodeURIComponent('//evil.example')));
      const next = new URL(
        response.headers.get('location'),
        'https://time.example',
      ).searchParams.get('next');
      assert.equal(next, '/index.html');
      const flow = await start('?purpose=revoke', { Cookie: cookie(response, 'sytime_session') });
      const result = await callback(flow);
      assert.equal(result.headers.get('location'), '/login.html?sso=revoked');
      assert.equal((await authenticated(response)).status, 401);
    },
  );
  await t.test(
    'registration and all student certification endpoints have been removed',
    async () => {
      for (const [route, method] of [
        ['/api/register', 'POST'],
        ['/api/student/apply', 'POST'],
        ['/api/student/binding', 'GET'],
        ['/api/student/unbind', 'POST'],
        ['/api/admin/users/1/unbind', 'POST'],
      ])
        assert.equal(
          (
            await f.api(route, {
              method,
              token: operator.token,
              ...(method === 'POST' ? { body: {} } : {}),
            })
          ).status,
          404,
        );
      assert.equal(
        query(
          f.db,
          "SELECT name FROM sqlite_master WHERE name IN ('student_bindings','student_applications')",
        ).all().length,
        0,
      );
    },
  );
});

test('SSO is optional configuration while existing local users can still log in', async (t) => {
  const saved = process.env.OIDC_CLIENT_ID;
  delete process.env.OIDC_CLIENT_ID;
  t.after(() => {
    if (saved !== undefined) process.env.OIDC_CLIENT_ID = saved;
  });
  const f = await fixture(t);
  const local = await f.account('retained_account', 'student');
  assert.equal((await f.api('/api/user/profile', { token: local.token })).status, 200);
  const result = await f.app.request('http://localhost/api/sso/start');
  assert.match(result.headers.get('location'), /sso=error/);
  assert.match(decodeURIComponent(result.headers.get('location')), /暂未配置/);
  const native = await f.app.request(
    'http://localhost/api/sso/start?native_challenge=' + 'a'.repeat(43),
  );
  assert.match(native.headers.get('location'), /^sytime:\/\/auth\?error=/);
});

test('account migration deletes old identity data and preserves accounts and other requests', async (t) => {
  const f = await fixture(t);
  const user = await f.account('preserved_student', 'student');
  // Reconstruct the old certification schema as it existed on deployed installations.
  const schema = query(f.db, "SELECT sql FROM sqlite_master WHERE name='moderation_requests'").get()
    .sql;
  const indexes = query(
    f.db,
    "SELECT sql FROM sqlite_master WHERE tbl_name='moderation_requests' AND type='index' AND sql IS NOT NULL",
  ).all();
  f.db.$client.exec(
    schema
      .replace('moderation_requests', 'moderation_legacy')
      .replace("'display_id'", "'student','display_id'"),
  );
  f.db.$client.exec(
    'INSERT INTO moderation_legacy SELECT * FROM moderation_requests; DROP TABLE moderation_requests; ALTER TABLE moderation_legacy RENAME TO moderation_requests;',
  );
  for (const index of indexes) f.db.$client.exec(index.sql);
  f.db.$client.exec(
    'CREATE TABLE student_bindings(student_id TEXT,user_id INTEGER); CREATE TABLE student_applications(student_id TEXT);',
  );
  query(f.db, 'INSERT INTO student_bindings VALUES(?,?)').run('PRIVATE001', user.id);
  const obsolete = query(
    f.db,
    "INSERT INTO moderation_requests(user_id,kind,subject_key,payload) VALUES(?,'student','student',?)",
  ).run(user.id, JSON.stringify({ student_id: 'PRIVATE001' })).lastInsertRowid;
  query(
    f.db,
    "INSERT INTO messages(user_id,type,title,body,target_kind,target_id) VALUES(?,'system','学生认证已提交','','moderation_pending',?)",
  ).run(user.id, obsolete);
  const keep = await f.api('/api/user/signature', {
    method: 'PUT',
    token: user.token,
    body: { signature: '保留签名申请' },
  });
  const before = query(f.db, 'SELECT * FROM users WHERE id=?').get(user.id);
  const migrate = require('../apps/api/src/domain/accounts/migrate');
  migrate(f.db);
  migrate(f.db);
  assert.deepEqual(query(f.db, 'SELECT * FROM users WHERE id=?').get(user.id), before);
  assert.equal(
    query(f.db, "SELECT count(*) n FROM moderation_requests WHERE kind='student'").get().n,
    0,
  );
  assert.equal(
    query(f.db, 'SELECT status FROM moderation_requests WHERE id=?').get(keep.data.id).status,
    'pending',
  );
  assert.equal(query(f.db, 'SELECT count(*) n FROM messages WHERE target_id=?').get(obsolete).n, 0);
  assert.equal(
    query(
      f.db,
      "SELECT name FROM sqlite_master WHERE name IN ('student_bindings','student_applications')",
    ).all().length,
    0,
  );
  assert.equal((await f.api('/api/user/profile', { token: user.token })).status, 200);
  assert.deepEqual(f.db.$client.pragma('foreign_key_check'), []);
});
