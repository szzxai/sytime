'use strict';
// Adapted from szzxvc/szzx1000 parsers/listing.py, article.py and upstream guards
// (AGPL-3.0-or-later). This module fetches the school directly; no API service.
const fs = require('node:fs');
const path = require('node:path');
const cheerio = require('cheerio');
const { setTimeout: delay } = require('node:timers/promises');
const { MenuError, sha256, normalizeName, validDate } = require('./schema');
const ORIGIN = 'https://www.szzx1000.cn';
const USER_AGENT = 'szzx-info-menu/1.0';
const LIMIT = 2 * 1024 * 1024;
function checkSchoolUrl(value) {
  let url;
  try {
    url = new URL(value, ORIGIN);
  } catch {
    throw new MenuError('学校菜单地址无效');
  }
  let decoded;
  try {
    decoded = decodeURIComponent(url.pathname).replace(/\\/g, '/');
  } catch {
    throw new MenuError('学校菜单地址编码无效');
  }
  if (
    url.origin !== ORIGIN ||
    url.username ||
    url.password ||
    ![
      '/robots.txt',
      '/e/action/ListInfo/',
      '/e/action/ListInfo/index.php',
      '/e/action/ShowInfo.php',
    ].includes(decoded)
  )
    throw new MenuError('菜单地址不在学校来源允许范围内');
  if (decoded !== '/robots.txt') {
    if (url.searchParams.get('classid') !== '36') throw new MenuError('仅允许学校每周食谱栏目');
    const number = url.searchParams.get(decoded.includes('ShowInfo') ? 'id' : 'page');
    if (
      number !== null &&
      (!/^\d+$/.test(number) || Number(number) < (decoded.includes('ShowInfo') ? 1 : 0))
    )
      throw new MenuError('学校菜单编号或页码无效');
  }
  return url;
}
function parseRobots(text, userAgent = USER_AGENT) {
  const groups = [];
  let agents = [],
    rules = [],
    crawlDelay = 0;
  function flush() {
    if (agents.length) groups.push({ agents, rules, crawlDelay });
    agents = [];
    rules = [];
    crawlDelay = 0;
  }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split('#')[0].trim(),
      index = line.indexOf(':');
    if (index < 0) continue;
    const key = line.slice(0, index).trim().toLowerCase(),
      value = line.slice(index + 1).trim();
    if (key === 'user-agent') {
      if (rules.length || crawlDelay) flush();
      agents.push(value.toLowerCase());
    }
    if (['allow', 'disallow'].includes(key) && value) {
      if (!agents.length) agents = ['*'];
      rules.push({ pattern: value, allow: key === 'allow' });
    }
    if (key === 'crawl-delay' && Number.isFinite(Number(value)))
      crawlDelay = Math.max(0, Number(value));
  }
  flush();
  let best = 0;
  for (const group of groups)
    for (const agent of group.agents)
      if (agent !== '*' && agent && userAgent.toLowerCase().startsWith(agent))
        best = Math.max(best, agent.length);
  const selected = groups.filter((group) =>
    group.agents.some((agent) =>
      best
        ? agent !== '*' && agent.length === best && userAgent.toLowerCase().startsWith(agent)
        : agent === '*',
    ),
  );
  return {
    rules: selected.flatMap((x) => x.rules),
    crawl_delay_ms: Math.min(60000, Math.max(200, ...selected.map((x) => x.crawlDelay * 1000))),
  };
}
function robotsAllows(snapshot, url) {
  const target = url.pathname + url.search;
  let winner = null;
  for (const rule of snapshot.rules) {
    const end = rule.pattern.endsWith('$'),
      core = end ? rule.pattern.slice(0, -1) : rule.pattern;
    const pattern = core
      .split('*')
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*');
    if (
      new RegExp('^' + pattern + (end ? '$' : '')).test(target) &&
      (!winner ||
        rule.pattern.length > winner.pattern.length ||
        (rule.pattern.length === winner.pattern.length && rule.allow))
    )
      winner = rule;
  }
  return !winner || winner.allow;
}
function parseList(html) {
  const $ = cheerio.load(html),
    items = [],
    seen = new Set();
  const links = $('ul.listsbox').length ? $('ul.listsbox li a[href]') : $('li a[href]');
  let linkedFiles = 0;
  links.each((_index, element) => {
    const anchor = $(element),
      href = anchor.attr('href');
    let url;
    try {
      url = new URL(href, ORIGIN);
    } catch {
      return;
    }
    if (url.pathname.startsWith('/d/')) {
      linkedFiles++;
      return;
    }
    if (
      url.origin !== ORIGIN ||
      url.pathname !== '/e/action/ShowInfo.php' ||
      url.searchParams.get('classid') !== '36'
    )
      return;
    const id = Number(url.searchParams.get('id'));
    if (!Number.isSafeInteger(id) || id < 1 || seen.has(id)) return;
    const title = normalizeName(
      anchor.attr('title') || anchor.find('h2,h3').first().text() || anchor.text(),
    );
    if (!title) return;
    seen.add(id);
    items.push({ article_id: id, title, url: url.href });
  });
  if (
    !items.length &&
    !$('ul.listsbox,.pages').length &&
    !/系统提示|信息不存在|此文章不存在/.test($('title').text())
  )
    throw new MenuError('学校菜单列表结构已变化，未推进同步进度');
  const pages = $('.pages a[href]')
    .map((_i, el) => {
      try {
        const url = checkSchoolUrl($(el).attr('href'));
        return { url: url.href, page: Number(url.searchParams.get('page') || 0) };
      } catch {
        return null;
      }
    })
    .get()
    .filter(Boolean);
  return { items, has_next: items.length + linkedFiles >= 15, pages };
}
function findDate(value) {
  const match = value.match(/(\d{4})[-年/.](\d{1,2})[-月/.](\d{1,2})/);
  if (!match) return null;
  const date = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  return validDate(date) ? date : null;
}
function parseArticle(html, articleId) {
  const $ = cheerio.load(html),
    body = $('#newstext,.newstext').first();
  if (!body.length) throw new MenuError('学校食谱正文不存在或结构已变化');
  const title = normalizeName(
    $('.titlebox h1').first().text() ||
      $('.newsContent h1').first().text() ||
      $('h1').first().text() ||
      $('title')
        .text()
        .replace(/[_|—].*(苏州中学|苏中).*$/, ''),
  );
  if (!title) throw new MenuError('无法读取学校菜单标题');
  const images = [],
    seen = new Set();
  body.find('img').each((_index, element) => {
    for (const key of ['src', 'data-original', 'data-src']) {
      const value = $(element).attr(key) || '';
      const match = value.match(/^data:image\/(png|jpe?g|webp|gif);base64,([A-Za-z0-9+/=\s]+)$/i);
      if (!match) continue;
      const raw = match[2].replace(/\s/g, '');
      if (raw.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(raw))
        throw new MenuError('菜单图片 Base64 无效');
      const data = Buffer.from(raw, 'base64'),
        hash = sha256(data);
      if (!data.length || data.length > 10 * 1024 * 1024)
        throw new MenuError('菜单图片为空或超过 10 MB');
      if (!seen.has(hash)) {
        seen.add(hash);
        images.push({ data, hash });
      }
    }
  });
  let publishedDate = null;
  $('.titlebox span').each((_index, element) => {
    publishedDate ||= findDate($(element).text());
  });
  const contentHash = sha256(
    title + '\n' + (publishedDate || '') + '\n' + images.map((image) => image.hash).join('\n'),
  );
  return {
    article_id: articleId,
    title,
    url: `${ORIGIN}/e/action/ShowInfo.php?classid=36&id=${articleId}`,
    published_date: publishedDate,
    content_hash: contentHash,
    images,
  };
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify(value), { mode: 0o600 });
  fs.renameSync(temporary, file);
}
class SchoolSource {
  constructor({ fetchImpl = fetch, cacheDir, signal } = {}) {
    this.fetch = fetchImpl;
    this.cacheDir = cacheDir;
    this.signal = signal;
    this.lastRequest = 0;
    this.robots = null;
    this.failures = 0;
  }
  async raw(url, limit = LIMIT) {
    url = checkSchoolUrl(url);
    await delay(
      Math.max(0, (this.robots?.crawl_delay_ms || 200) - (Date.now() - this.lastRequest)),
      undefined,
      { signal: this.signal },
    );
    this.lastRequest = Date.now();
    const response = await this.fetch(url.href, {
      headers: { 'User-Agent': USER_AGENT },
      redirect: 'manual',
      signal: AbortSignal.any([...(this.signal ? [this.signal] : []), AbortSignal.timeout(6000)]),
    });
    if (response.status >= 300 && response.status < 400)
      throw new MenuError('学校来源发生重定向，已停止获取');
    if (Number(response.headers.get('content-length')) > limit)
      throw new MenuError('学校菜单响应超过大小限制');
    const chunks = [];
    let length = 0;
    if (response.body)
      for await (const chunk of response.body) {
        length += chunk.length;
        if (length > limit) throw new MenuError('学校菜单响应超过大小限制');
        chunks.push(chunk);
      }
    const bytes = Buffer.concat(chunks);
    const type = response.headers.get('content-type') || '';
    let charset =
      /charset=([^;\s]+)/i.exec(type)?.[1] ||
      /charset=["']?([\w-]+)/i.exec(bytes.subarray(0, 4096).toString('ascii'))?.[1] ||
      'utf-8';
    if (/^gb/i.test(charset)) charset = 'gb18030';
    let text;
    try {
      text = new TextDecoder(charset).decode(bytes);
    } catch {
      throw new MenuError('学校菜单文字编码不支持');
    }
    return { response, text, type };
  }
  async ensureRobots() {
    if (this.robots) return;
    const file = this.cacheDir && path.join(this.cacheDir, 'robots.json');
    let cached;
    try {
      cached = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      /* no snapshot */
    }
    if (cached?.rules && Date.now() - cached.fetched_at < 3600000) {
      this.robots = cached;
      return;
    }
    try {
      const { response, text } = await this.raw(ORIGIN + '/robots.txt', 512 * 1024);
      if (response.status >= 500 || response.status === 429) throw new Error('robots unavailable');
      this.robots = {
        ...(response.ok ? parseRobots(text) : { rules: [], crawl_delay_ms: 200 }),
        fetched_at: Date.now(),
      };
      if (file) writeJson(file, this.robots);
    } catch (error) {
      if (this.signal?.aborted) throw error;
      if (cached?.rules && Date.now() - cached.fetched_at < 86400000) {
        this.robots = cached;
        return;
      }
      throw new MenuError('无法确认学校 robots 规则，本次未获取菜单');
    }
  }
  async html(url) {
    await this.ensureRobots();
    url = checkSchoolUrl(url);
    if (!robotsAllows(this.robots, url))
      throw new MenuError('学校 robots 规则不允许获取该菜单地址');
    if (this.failures >= 5) throw new MenuError('学校来源连续失败，本轮获取已停止');
    const deadline = Date.now() + 20000;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const { response, text, type } = await this.raw(url.href);
        if (!response.ok) throw new MenuError(`学校菜单请求失败（HTTP ${response.status}）`);
        if (type && !/^(text\/html|application\/xhtml\+xml)/i.test(type))
          throw new MenuError('学校菜单响应不是 HTML 正文');
        this.failures = 0;
        return text;
      } catch (error) {
        if (this.signal?.aborted) throw error;
        if (
          attempt === 2 ||
          Date.now() + 7000 >= deadline ||
          (error instanceof MenuError && /大小|重定向|不是 HTML/.test(error.message))
        ) {
          this.failures++;
          throw error instanceof MenuError ? error : new MenuError('学校菜单请求超时或网络不可用');
        }
        await delay(500 * 2 ** attempt, undefined, { signal: this.signal });
      }
    }
  }
  async discover(anchor) {
    const refs = [];
    let complete = false;
    let url = `${ORIGIN}/e/action/ListInfo/?classid=36`;
    for (let page = 0; page < 12; page++) {
      const result = parseList(await this.html(url));
      refs.push(...result.items);
      // A fresh install starts with the latest article, not years of historic menus.
      if (!anchor && result.items.length) {
        const latest = result.items[0];
        return { recent: [latest], fresh: [latest], anchor: latest.article_id };
      }
      if (result.items.some((item) => item.article_id === Number(anchor)) || !result.has_next) {
        complete = true;
        break;
      }
      url =
        result.pages.find((item) => item.page === page + 1)?.url ||
        `${ORIGIN}/e/action/ListInfo/index.php?classid=36&page=${page + 1}`;
    }
    const unique = [...new Map(refs.map((ref) => [ref.article_id, ref])).values()];
    const anchorIndex = unique.findIndex((ref) => ref.article_id === Number(anchor));
    return {
      recent: unique.slice(0, 10),
      fresh: anchorIndex < 0 ? unique : unique.slice(0, anchorIndex),
      anchor: complete && unique.length ? unique[0].article_id : null,
    };
  }
  async article(id) {
    return parseArticle(await this.html(`${ORIGIN}/e/action/ShowInfo.php?classid=36&id=${id}`), id);
  }
}
module.exports = {
  ORIGIN,
  USER_AGENT,
  LIMIT,
  checkSchoolUrl,
  parseRobots,
  robotsAllows,
  parseList,
  parseArticle,
  findDate,
  writeJson,
  SchoolSource,
};
