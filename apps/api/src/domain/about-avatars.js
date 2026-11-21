const { lookup } = require('node:dns');
const http = require('node:http');
const https = require('node:https');
const { BlockList, isIP } = require('node:net');
const sharp = require('sharp');
const { query } = require('../../../../packages/db/src/client.ts');
const {
  aboutAvatarInterval,
  aboutAvatarSource,
  aboutTeams,
} = require('../../../../packages/shared/src/about.ts');

const hourMs = 60 * 60 * 1000;
const maxImageBytes = 1024 * 1024;
const intervalKey = 'about_avatar_interval_hours';
const formats = new Set(['jpeg', 'png', 'webp', 'gif', 'heif']);
const githubOrigins = new Set(['https://github.com', 'https://avatars.githubusercontent.com']);
const proxyAddresses = new BlockList();
proxyAddresses.addSubnet('198.18.0.0', 15, 'ipv4');
const nonPublic = new BlockList();
for (const [address, bits] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 3],
])
  nonPublic.addSubnet(address, bits, 'ipv4');
nonPublic.addSubnet('2001::', 23, 'ipv6');
nonPublic.addSubnet('2002::', 16, 'ipv6');
const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');

function isPublicAddress(address, family) {
  if (family === 4) return !nonPublic.check(address, 'ipv4');
  return family === 6 && globalV6.check(address, 'ipv6') && !nonPublic.check(address, 'ipv6');
}

function publicLookup(hostname, options, callback, trustedOrigin) {
  lookup(hostname, { all: true, family: options.family }, (error, records) => {
    if (error) return callback(error);
    const addresses = records.filter(
      ({ address, family }) =>
        isPublicAddress(address, family) ||
        (trustedOrigin && family === 4 && proxyAddresses.check(address, 'ipv4')),
    );
    if (!addresses.length) return callback(new Error('头像来源须指向公网地址'));
    if (options.all) return callback(null, addresses);
    callback(null, addresses[0].address, addresses[0].family);
  });
}

function requestImage(url, signal) {
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const family = isIP(hostname);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    (family && !isPublicAddress(hostname, family))
  )
    throw new Error('头像来源须为公网 HTTP 或 HTTPS 地址');
  const client = url.protocol === 'https:' ? https : http;
  const trustedOrigin = githubOrigins.has(url.origin);
  return new Promise((resolve, reject) => {
    client
      .get(
        url,
        {
          lookup: (name, options, callback) => publicLookup(name, options, callback, trustedOrigin),
          signal,
          agent: false,
        },
        resolve,
      )
      .once('error', reject);
  });
}

async function downloadAvatar(source, request = requestImage) {
  let url = new URL(source);
  const signal = AbortSignal.timeout(8000);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const response = await request(url, signal);
    if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
      response.destroy();
      url = new URL(response.headers.location, url);
      continue;
    }
    if (response.statusCode !== 200) {
      response.destroy();
      throw new Error(`头像下载失败（HTTP ${response.statusCode}）`);
    }
    let size = 0;
    const chunks = [];
    for await (const chunk of response) {
      size += chunk.byteLength;
      if (size > maxImageBytes) throw new Error('头像文件超过大小限制');
      chunks.push(chunk);
    }
    const image = sharp(Buffer.concat(chunks, size), { limitInputPixels: 4_000_000 });
    if (!formats.has((await image.metadata()).format)) throw new Error('头像图片格式不支持');
    return image.rotate().resize(96, 96).png().toBuffer();
  }
  throw new Error('头像来源重定向次数过多');
}

function validInterval(hours) {
  return (
    Number.isInteger(hours) && hours >= aboutAvatarInterval.min && hours <= aboutAvatarInterval.max
  );
}

class AboutAvatarService {
  constructor(db, { teams = aboutTeams, request } = {}) {
    this.db = db;
    this.request = request;
    this.sources = new Map();
    for (const { members } of teams) {
      for (const member of members) {
        const source = aboutAvatarSource(member);
        if (source?.kind === 'remote') this.sources.set(member.name, source.url);
      }
    }
    this.timer = null;
    this.refreshing = null;
  }

  intervalHours() {
    const row = query(this.db, 'SELECT value FROM settings WHERE key = ?').get(intervalKey);
    const hours = Number(row?.value);
    return validInterval(hours) ? hours : aboutAvatarInterval.default;
  }

  setIntervalHours(hours) {
    query(
      this.db,
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    ).run(intervalKey, String(hours));
    if (this.timer) this.tick();
  }

  avatar(member) {
    const source = this.sources.get(member);
    if (!source) return undefined;
    return query(this.db, 'SELECT image FROM about_team_avatars WHERE source = ?').get(source)
      ?.image;
  }

  async refreshIfDue() {
    if (this.refreshing) return this.refreshing;
    const now = Date.now();
    const cutoff = now - this.intervalHours() * hourMs;
    const claim = query(
      this.db,
      `INSERT INTO about_team_avatars (source, attempted_at) VALUES (?, ?)
       ON CONFLICT(source) DO UPDATE SET attempted_at = excluded.attempted_at
       WHERE about_team_avatars.attempted_at <= ?`,
    );
    const due = [...new Set(this.sources.values())].filter(
      (source) => claim.run(source, now, cutoff).changes > 0,
    );
    if (!due.length) return;
    this.refreshing = Promise.all(
      due.map(async (source) => {
        try {
          const image = await downloadAvatar(source, this.request);
          query(this.db, 'UPDATE about_team_avatars SET image = ? WHERE source = ?').run(
            image,
            source,
          );
        } catch (error) {
          console.warn(`[about avatars] ${new URL(source).hostname}: ${error.message}`);
        }
      }),
    ).finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  tick() {
    this.refreshIfDue().catch((error) => console.error('[about avatars]', error.message));
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), 60_000).unref();
    this.tick();
  }

  async close() {
    clearInterval(this.timer);
    this.timer = null;
    await this.refreshing;
  }
}

function mountAboutAvatarRoutes(app, avatars, requirePermission) {
  app.get('/api/about/avatars/:member', (c) => {
    const image = avatars.avatar(c.req.param('member'));
    return image ? c.body(image, 200, { 'Content-Type': 'image/png' }) : c.notFound();
  });
  const settingsPath = '/api/admin/settings/about-avatars';
  const canEdit = requirePermission('about_avatar_edit');
  app.get(settingsPath, canEdit, (c) => c.json({ intervalHours: avatars.intervalHours() }));
  app.put(settingsPath, canEdit, (c) => {
    const hours = c.get('body')?.intervalHours;
    if (!validInterval(hours))
      return c.json(
        {
          error: `同步间隔须为 ${aboutAvatarInterval.min} 至 ${aboutAvatarInterval.max} 的整数小时`,
        },
        400,
      );
    avatars.setIntervalHours(hours);
    return c.json({ intervalHours: hours });
  });
}

module.exports = { AboutAvatarService, mountAboutAvatarRoutes };
