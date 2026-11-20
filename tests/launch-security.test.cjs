const test = require('node:test');
const assert = require('node:assert/strict');
const { createClientIpResolver } = require('../apps/api/src/client-ip');
const { fixture } = require('./helpers/accounts-fixture.cjs');

const context = (peer, forwarded) => ({
  env: { incoming: { socket: { remoteAddress: peer } } },
  req: { header: () => forwarded },
});

test('forwarded IPs require trusted peers and stop at the first untrusted hop', () => {
  const resolve = createClientIpResolver('192.0.2.10, 10.0.0.0/24, 2001:db8::/64');
  assert.equal(resolve(context('203.0.113.1', '198.51.100.1')), '203.0.113.1');
  assert.equal(resolve(context('::ffff:192.0.2.10', '198.51.100.1')), '198.51.100.1');
  assert.equal(resolve(context('10.0.0.2', '198.51.100.1, 192.0.2.10')), '198.51.100.1');
  assert.equal(resolve(context('192.0.2.10', '198.51.100.1, 203.0.113.2')), '203.0.113.2');
  assert.equal(resolve(context('2001:db8::1', '2001:db8:1::2')), '2001:db8:1::2');
  for (const value of ['garbage', '198.51.100.1,', Array(34).fill('10.0.0.1').join(',')])
    assert.equal(resolve(context('192.0.2.10', value)), '192.0.2.10');
  assert.equal(createClientIpResolver()(context('192.0.2.10', '198.51.100.1')), '192.0.2.10');
  for (const invalid of ['example.com', '10.0.0.1/33', '::1/129', '10.0.0.1/', '::1/64/1'])
    assert.throws(() => createClientIpResolver(invalid));
});

test('one proxied client cannot consume another client login or native SSO quota', async (t) => {
  const previous = process.env.TRUSTED_PROXIES;
  process.env.TRUSTED_PROXIES = '192.0.2.10';
  t.after(() =>
    previous === undefined
      ? delete process.env.TRUSTED_PROXIES
      : (process.env.TRUSTED_PROXIES = previous),
  );
  const f = await fixture(t);
  const request = (route, ip, peer = '192.0.2.10') =>
    f.app.request(
      'http://localhost' + route,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
        body: '{}',
      },
      { incoming: { socket: { remoteAddress: peer } } },
    );
  for (const [route, status] of [
    ['/api/login', 422],
    ['/api/sso/native/exchange', 401],
  ]) {
    for (let i = 0; i < 30; i++)
      assert.equal((await request(route, '198.51.100.1')).status, status);
    const limited = await request(route, '198.51.100.1');
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers.get('Retry-After')) > 0);
    assert.equal((await request(route, '198.51.100.2')).status, status);
    for (let i = 0; i < 30; i++)
      assert.equal((await request(route, '198.51.100.' + (i + 3), '203.0.113.1')).status, status);
    assert.equal((await request(route, '198.51.100.200', '203.0.113.1')).status, 429);
  }
});

test('security headers cover HTML and errors, with HSTS only in HTTPS production', async (t) => {
  const saved = { NODE_ENV: process.env.NODE_ENV, APP_ORIGIN: process.env.APP_ORIGIN };
  t.after(() => {
    for (const [key, value] of Object.entries(saved))
      value === undefined ? delete process.env[key] : (process.env[key] = value);
  });
  process.env.NODE_ENV = 'production';
  process.env.APP_ORIGIN = 'https://time.szzxclubunion.cn';
  const f = await fixture(t);
  f.app.get('/test-page', (c) => c.html('<h1>Test</h1>'));
  for (const route of ['/test-page', '/api/missing', '/api/user/profile']) {
    const r = await f.app.request('http://localhost' + route);
    assert.equal(r.headers.get('X-Frame-Options'), 'DENY');
    assert.equal(r.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.match(r.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/);
    assert.equal(r.headers.get('Referrer-Policy'), 'strict-origin-when-cross-origin');
    assert.equal(r.headers.get('Strict-Transport-Security'), 'max-age=31536000');
  }
  process.env.NODE_ENV = 'development';
  assert.equal(
    (await f.app.request('http://localhost/test-page')).headers.get('Strict-Transport-Security'),
    null,
  );
});
