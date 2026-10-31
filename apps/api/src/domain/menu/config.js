/* Menu synchronization is configured by the process environment, never by HTTP. */
const { MenuError, VERSION, sha256 } = require('./schema');
const { validateTime, TIMEZONE } = require('./schedule');
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com';
function validateEndpoint(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new MenuError('菜单服务地址无效');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
    throw new MenuError('菜单服务地址必须为不含凭据的 HTTPS 地址');
  return url.href.replace(/\/+$/, '').replace(/\/chat\/completions$/, '');
}
function fingerprint(config) {
  return sha256(
    JSON.stringify([config.provider, config.base_url, config.model, config.key_hash, VERSION]),
  );
}
class MenuConfig {
  constructor(_db, _privateDir, clock = Date.now) {
    this.clock = clock;
    this.effectiveAt = clock();
  }
  raw() {
    const provider = process.env.MENU_PROVIDER || 'gemini';
    if (!['gemini', 'openrouter', 'compatible'].includes(provider))
      throw new MenuError('MENU_PROVIDER 无效');
    const key = this.decrypt();
    const config = {
      revision: 0,
      provider,
      base_url:
        provider === 'gemini'
          ? GEMINI_BASE
          : provider === 'openrouter'
            ? OPENROUTER_BASE
            : validateEndpoint(process.env.MENU_BASE_URL || ''),
      model:
        process.env.MENU_MODEL ||
        process.env.MENU_GEMINI_MODEL ||
        (provider === 'gemini' ? 'gemini-flash-lite-latest' : ''),
      daily_time: validateTime(process.env.MENU_SYNC_TIME || '08:00'),
      schedule_mode: process.env.MENU_SYNC_MODE || 'weekend',
      enabled: !!key && process.env.MENU_SYNC_ENABLED !== 'false',
      schedule_effective_at: this.effectiveAt,
      updated_at: null,
      key_hash: key ? sha256(key) : '',
      last_test: null,
    };
    if (!['daily', 'weekend'].includes(config.schedule_mode))
      throw new MenuError('MENU_SYNC_MODE 无效');
    config.validated_fingerprint = key ? fingerprint(config) : null;
    return config;
  }
  decrypt() {
    return (process.env.MENU_API_KEY || process.env.GEMINI_API_KEY || '').trim();
  }
  snapshot() {
    const config = this.raw();
    const api_key = this.decrypt();
    if (!api_key || !config.model) throw new MenuError('请在服务器环境变量中配置菜单模型与 Key');
    return { ...config, api_key };
  }
  public() {
    const config = this.raw();
    return {
      ...config,
      timezone: TIMEZONE,
      has_api_key: !!config.key_hash,
      key_unavailable: false,
      model_tested: !!config.key_hash,
      masked_api_key: config.key_hash ? '已通过环境变量配置' : '',
    };
  }
  save() {
    throw new MenuError('菜单配置仅通过服务器环境变量维护', 403);
  }
  recordTest() {
    return this.public();
  }
}
module.exports = { MenuConfig, fingerprint, OPENROUTER_BASE, validateEndpoint };
