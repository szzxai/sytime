/* eslint-disable no-control-regex -- Validate redirect paths. */
const crypto = require('node:crypto');
const { URLSearchParams } = require('node:url');
const jwt = require('jsonwebtoken');
const { getCookie, setCookie, deleteCookie } = require('hono/cookie');
const { query } = require('../../../../../packages/db/src/client.ts');
const { action, error, text, now, revoke, audit, limited } = require('./security');
const random = () => crypto.randomBytes(32).toString('base64url');
const hash = (value) => crypto.createHash('sha256').update(value).digest('base64url');
const safeNext = (value, fallback = '/index.html') =>
  typeof value === 'string' && /^\/(?!\/)/.test(value) && !/[\\\x00-\x20]/.test(value)
    ? value
    : fallback;
module.exports = function mountSSO(app, { db, requireLogin, issueSession, sessionUser }) {
  function config() {
    const origin = process.env.APP_ORIGIN;
    const clientId = process.env.OIDC_CLIENT_ID;
    const secret = process.env.OIDC_CLIENT_SECRET;
    if (!origin || !clientId || !secret) throw error(503, '社盟登录暂未配置，请稍后重试');
    const issuer = process.env.OIDC_ISSUER || 'https://szzxclubunion.cn/o';
    for (const value of [origin, issuer]) {
      const url = new URL(value);
      if (
        url.protocol !== 'https:' &&
        !(
          process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(url.hostname)
        )
      )
        throw error(503, '社盟登录地址配置有误');
      if (url.username || url.password || url.search || url.hash)
        throw error(503, '社盟登录地址配置有误');
    }
    return {
      issuer,
      clientId,
      secret,
      callback: new URL('/api/sso/callback', origin).href,
      logout: new URL('/login.html', origin).href,
    };
  }
  let metadata;
  let metadataAt = 0;
  async function fetchJSON(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw error(502, '社盟身份服务暂不可用，请重新登录');
    return response.json();
  }
  async function discover(cfg) {
    if (!metadata || metadata.issuer !== cfg.issuer || Date.now() - metadataAt > 3600000) {
      const value = await fetchJSON(cfg.issuer + '/.well-known/openid-configuration');
      if (value.issuer !== cfg.issuer) throw error(502, '社盟身份服务配置校验失败');
      for (const name of [
        'authorization_endpoint',
        'token_endpoint',
        'jwks_uri',
        'end_session_endpoint',
      ]) {
        const url = new URL(value[name]);
        if (url.origin !== new URL(cfg.issuer).origin || url.username || url.password)
          throw error(502, '社盟身份服务端点校验失败');
      }
      metadata = value;
      metadataAt = Date.now();
    }
    return metadata;
  }
  const cookieOptions = (c) => ({
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' || new URL(c.req.url).protocol === 'https:',
    sameSite: 'Lax',
    path: '/api',
    maxAge: 600,
  });
  const clean = () => query(db, 'DELETE FROM oidc_flows WHERE expires_at<=?').run(now());
  app.get('/api/sso/start', async (c) => {
    try {
      limited(db, 'sso:' + (c.env?.incoming?.socket?.remoteAddress || 'local'), 30);
      const cfg = config();
      const provider = await discover(cfg);
      const state = random(),
        browser = random(),
        nonce = random(),
        verifier = random();
      const purpose = c.req.query('purpose') === 'revoke' ? 'revoke' : 'login';
      let owner = null;
      if (purpose === 'revoke') {
        await requireLogin(c, async () => {
          owner = c.get('user')?.id;
        });
        if (!owner) throw error(401, '请先登录');
      }
      const nativeChallenge = c.req.query('native_challenge') || '';
      if (nativeChallenge && (!/^[A-Za-z0-9_-]{43}$/.test(nativeChallenge) || purpose !== 'login'))
        throw error(422, '客户端登录请求无效');
      clean();
      query(db, 'INSERT INTO oidc_flows(id,payload,expires_at) VALUES(?,?,?)').run(
        hash(state),
        JSON.stringify({
          browser: hash(browser),
          nonce,
          verifier,
          next: safeNext(c.req.query('next'), ''),
          purpose,
          owner,
          nativeChallenge,
        }),
        now() + 600,
      );
      setCookie(c, 'sytime_oidc', browser, cookieOptions(c));
      const url = new URL(provider.authorization_endpoint);
      url.search = new URLSearchParams({
        response_type: 'code',
        client_id: cfg.clientId,
        redirect_uri: cfg.callback,
        scope: 'openid profile',
        state,
        nonce,
        code_challenge: hash(verifier),
        code_challenge_method: 'S256',
        ...(purpose === 'revoke' ? { prompt: 'login' } : {}),
      }).toString();
      return c.redirect(url.href);
    } catch (e) {
      const message = e.status ? e.message : '社盟服务暂不可用，请稍后重试';
      return c.redirect(
        c.req.query('native_challenge')
          ? 'sytime://auth?error=' + encodeURIComponent(message)
          : '/login.html?sso=error&message=' + encodeURIComponent(message),
      );
    }
  });
  function storeGrant(c, purpose, payload, lifetime = 600) {
    const id = random();
    clean();
    query(db, 'INSERT INTO oidc_flows(id,payload,expires_at) VALUES(?,?,?)').run(
      hash(id),
      JSON.stringify({ purpose, ...payload }),
      now() + lifetime,
    );
    if (purpose === 'appeal') setCookie(c, 'sytime_appeal', id, cookieOptions(c));
    return id;
  }
  function readGrant(id, purpose) {
    if (typeof id !== 'string' || !id) return null;
    const row = query(db, 'SELECT * FROM oidc_flows WHERE id=? AND expires_at>?').get(
      hash(id),
      now(),
    );
    if (!row) return null;
    const value = JSON.parse(row.payload);
    return value.purpose === purpose ? value : null;
  }
  function banInfo(user) {
    return {
      error: 'banned',
      ban_reason: user.ban_reason,
      ban_image: user.ban_image,
      allow_appeal: user.allow_appeal,
      last_appeal:
        query(
          db,
          "SELECT status,reason,reviewed_at FROM moderation_requests WHERE user_id=? AND kind='appeal' ORDER BY id DESC LIMIT 1",
        ).get(user.id) || null,
    };
  }
  app.get('/api/sso/callback', async (c) => {
    let nativeChallenge = '';
    try {
      const state = c.req.query('state') || '';
      const row = query(db, 'SELECT * FROM oidc_flows WHERE id=? AND expires_at>?').get(
        hash(state),
        now(),
      );
      const browser = getCookie(c, 'sytime_oidc');
      if (!row || !browser) throw error(400, '登录请求已过期，请重新登录');
      const flow = JSON.parse(row.payload);
      if (!flow.browser || flow.browser !== hash(browser))
        throw error(400, '登录请求校验失败，请重新登录');
      query(db, 'DELETE FROM oidc_flows WHERE id=?').run(row.id);
      deleteCookie(c, 'sytime_oidc', { path: '/api' });
      nativeChallenge = flow.nativeChallenge;
      const cfg = config();
      if (c.req.query('iss') && c.req.query('iss') !== cfg.issuer)
        throw error(400, '社盟身份签发方校验失败');
      if (c.req.query('error')) throw error(400, '社盟授权已取消或失败，请重新登录');
      const code = c.req.query('code');
      if (!code) throw error(400, '社盟授权码缺失，请重新登录');
      const provider = await discover(cfg);
      const tokens = await fetchJSON(provider.token_endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: cfg.callback,
          client_id: cfg.clientId,
          client_secret: cfg.secret,
          code_verifier: flow.verifier,
        }).toString(),
      });
      const header = jwt.decode(tokens.id_token, { complete: true })?.header;
      if (header?.alg !== 'RS256') throw error(400, '社盟身份签名校验失败');
      const jwks = await fetchJSON(provider.jwks_uri);
      const keys = jwks.keys?.filter(
        (key) =>
          key.kty === 'RSA' &&
          (!key.use || key.use === 'sig') &&
          (!key.alg || key.alg === 'RS256') &&
          (!header.kid || key.kid === header.kid),
      );
      if (keys?.length !== 1) throw error(400, '社盟身份公钥校验失败');
      const claims = jwt.verify(
        tokens.id_token,
        crypto.createPublicKey({ key: keys[0], format: 'jwk' }),
        {
          algorithms: ['RS256'],
          issuer: cfg.issuer,
          audience: cfg.clientId,
          clockTolerance: 60,
        },
      );
      if (
        !Number.isFinite(claims.exp) ||
        !Number.isFinite(claims.iat) ||
        claims.iat > now() + 60 ||
        claims.nonce !== flow.nonce ||
        (Array.isArray(claims.aud) && claims.aud.length > 1 && claims.azp !== cfg.clientId) ||
        (claims.azp && claims.azp !== cfg.clientId)
      )
        throw error(400, '社盟身份信息校验失败');
      const sub = text(claims.sub, '社盟身份', 255);
      if (sub !== claims.sub) throw error(400, '社盟身份标识无效');
      let nameValue = claims.name;
      if (!nameValue && tokens.access_token && provider.userinfo_endpoint) {
        const endpoint = new URL(provider.userinfo_endpoint);
        if (endpoint.origin !== new URL(cfg.issuer).origin)
          throw error(502, '社盟用户信息端点校验失败');
        const info = await fetchJSON(endpoint.href, {
          headers: { Authorization: 'Bearer ' + tokens.access_token },
        });
        if (info.sub !== sub) throw error(400, '社盟用户信息身份校验失败');
        nameValue = info.name;
      }
      const name = text(nameValue, '真实姓名', 100);
      const user = db.$client.transaction(() => {
        let account = query(db, 'SELECT * FROM users WHERE sso_issuer=? AND sso_subject=?').get(
          cfg.issuer,
          sub,
        );
        if (flow.purpose === 'revoke') {
          if (!account || account.id !== flow.owner || account.status !== 'active')
            throw error(403, '请使用当前账号的社盟身份确认操作');
          revoke(db, account.id);
          deleteCookie(c, 'sytime_session', { path: '/' });
          return account;
        }
        if (!account) {
          const id = Number(
            query(
              db,
              "INSERT INTO users(username,nickname,sso_issuer,sso_subject,role,recipe_default_view) VALUES(?,?,?,?,'student','daily')",
            ).run('sso_' + crypto.randomBytes(12).toString('hex'), name, cfg.issuer, sub)
              .lastInsertRowid,
          );
          query(db, 'UPDATE users SET display_id=? WHERE id=?').run(String(id), id);
          account = query(db, 'SELECT * FROM users WHERE id=?').get(id);
          audit(db, id, id, 'account.sso_created');
        }
        if (account.role !== 'student') revoke(db, account.id);
        query(db, "UPDATE users SET nickname=?,role='student' WHERE id=?").run(name, account.id);
        return {
          ...account,
          nickname: name,
          role: 'student',
          session_version: query(db, 'SELECT session_version FROM users WHERE id=?').get(account.id)
            .session_version,
        };
      })();
      if (nativeChallenge) {
        const ticket = storeGrant(c, 'native', { userId: user.id, nativeChallenge }, 60);
        return c.redirect('sytime://auth?ticket=' + encodeURIComponent(ticket));
      }
      if (user.status === 'banned') {
        deleteCookie(c, 'sytime_session', { path: '/' });
        storeGrant(c, 'appeal', { userId: user.id });
        return c.redirect('/login.html?sso=banned');
      }
      if (flow.purpose === 'revoke') return c.redirect('/login.html?sso=revoked');
      issueSession(c, user);
      const next = safeNext(flow.next, '/' + user.default_page);
      return c.redirect('/login.html?sso=success&next=' + encodeURIComponent(next));
    } catch (e) {
      const message = e.status ? e.message : '社盟登录失败，请重新登录';
      if (nativeChallenge) return c.redirect('sytime://auth?error=' + encodeURIComponent(message));
      return c.redirect('/login.html?sso=error&message=' + encodeURIComponent(message));
    }
  });
  app.post(
    '/api/sso/native/exchange',
    action(async (c) => {
      limited(db, 'sso-native:' + (c.env?.incoming?.socket?.remoteAddress || 'local'), 30);
      const { ticket, verifier } = c.get('body') || {};
      const grant = readGrant(ticket, 'native');
      if (
        !grant ||
        typeof verifier !== 'string' ||
        !/^[A-Za-z0-9_-]{43,128}$/.test(verifier) ||
        hash(verifier) !== grant.nativeChallenge
      )
        throw error(401, '客户端登录凭证无效或已过期');
      const user = query(db, 'SELECT * FROM users WHERE id=?').get(grant.userId);
      if (!user || !user.sso_subject) throw error(401, '账号已失效');
      const revoking = c.get('body')?.intent === 'revoke';
      if (revoking) {
        let owner;
        await requireLogin(c, async () => {
          owner = c.get('user')?.id;
        });
        if (!owner || owner !== user.id) throw error(403, '请使用当前账号的社盟身份确认操作');
      }
      query(db, 'DELETE FROM oidc_flows WHERE id=?').run(hash(ticket));
      if (user.status === 'banned') {
        const appealToken = storeGrant(c, 'appeal', { userId: user.id });
        return c.json({ ...banInfo(user), appeal_token: appealToken }, 403);
      }
      if (revoking) {
        revoke(db, user.id);
        deleteCookie(c, 'sytime_session', { path: '/' });
        return c.json({ ok: true, reauthenticate: true });
      }
      return c.json({ token: issueSession(c, user), user: sessionUser(user) });
    }),
  );
  function appealOwner(c) {
    const grant = readGrant(c.get('body')?.appeal_token || getCookie(c, 'sytime_appeal'), 'appeal');
    return grant ? query(db, 'SELECT * FROM users WHERE id=?').get(grant.userId) : null;
  }
  app.get(
    '/api/sso/ban',
    action((c) => {
      const user = appealOwner(c);
      if (!user || user.status !== 'banned') throw error(401, '请重新通过社盟验证身份');
      return c.json(banInfo(user));
    }),
  );
  return {
    appealOwner,
    logoutUrl() {
      try {
        const cfg = config();
        const url = new URL(metadata?.end_session_endpoint || cfg.issuer + '/logout/');
        url.search = new URLSearchParams({ post_logout_redirect_uri: cfg.logout }).toString();
        return url.href;
      } catch {
        return '';
      }
    },
  };
};
