"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { MenuError, VERSION, sha256 } = require("./schema");
const { validateTime, TIMEZONE } = require("./schedule");
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
function validateEndpoint(value) {
  let url;
  try { url = new URL(value); } catch { throw new MenuError("请输入有效的 HTTPS API Base URL"); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new MenuError("API 地址必须使用 HTTPS，且不能包含凭据、查询参数或片段");
  return url.href.replace(/\/+$/, "").replace(/\/chat\/completions$/, "");
}
function fingerprint(config) {
  return sha256(JSON.stringify([config.provider, config.base_url, config.model, config.key_hash, VERSION]));
}
class MenuConfig {
  constructor(db, privateDir, clock = Date.now) {
    this.db = db; this.privateDir = privateDir; this.clock = clock;
    this.keyPath = path.join(privateDir, "menu-master.key");
  }
  raw() {
    const row = this.db.prepare("SELECT value FROM settings WHERE key='menu_ai_config'").get();
    if (!row) return { revision: 0, provider: "openrouter", base_url: OPENROUTER_BASE, model: "", daily_time: "08:00", enabled: false, schedule_effective_at: 0, updated_at: null, key_hash: "", secret: null, validated_fingerprint: null, last_test: null };
    try { return JSON.parse(row.value); } catch { throw new MenuError("菜单设置已损坏，请恢复数据库备份", 503); }
  }
  key(create = false) {
    if (!fs.existsSync(this.keyPath)) {
      if (!create) throw new MenuError("API Key 的加密主密钥不可用，请重新保存 API Key", 503, "menu_key_unavailable");
      fs.mkdirSync(this.privateDir, { recursive: true, mode: 0o700 });
      try { fs.writeFileSync(this.keyPath, crypto.randomBytes(32), { flag: "wx", mode: 0o600 }); } catch (error) { if (error.code !== "EEXIST") throw error; }
    }
    const key = fs.readFileSync(this.keyPath);
    if (key.length !== 32) throw new MenuError("菜单加密主密钥格式无效，请恢复备份", 503, "menu_key_unavailable");
    return key;
  }
  encrypt(value) {
    const nonce = crypto.randomBytes(12), cipher = crypto.createCipheriv("aes-256-gcm", this.key(true), nonce);
    cipher.setAAD(Buffer.from("szzx-info/menu-api-key/v1"));
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return { nonce: nonce.toString("hex"), ciphertext: encrypted.toString("hex"), tag: cipher.getAuthTag().toString("hex") };
  }
  decrypt(config) {
    if (!config.secret) return "";
    try {
      const decipher = crypto.createDecipheriv("aes-256-gcm", this.key(), Buffer.from(config.secret.nonce, "hex"));
      decipher.setAAD(Buffer.from("szzx-info/menu-api-key/v1"));
      decipher.setAuthTag(Buffer.from(config.secret.tag, "hex"));
      return Buffer.concat([decipher.update(Buffer.from(config.secret.ciphertext, "hex")), decipher.final()]).toString("utf8");
    } catch { throw new MenuError("API Key 无法解密，请恢复主密钥或重新保存 API Key", 503, "menu_key_unavailable"); }
  }
  snapshot() {
    const config = this.raw(), api_key = this.decrypt(config);
    if (!api_key || !config.model) throw new MenuError("请先保存提供商、API Key 和视觉模型");
    return { ...config, api_key };
  }
  public() {
    const config = this.raw();
    let key = "", key_unavailable = false;
    try { key = this.decrypt(config); } catch { key_unavailable = true; }
    const tested = !!key && config.validated_fingerprint === fingerprint(config);
    return {
      revision: config.revision, provider: config.provider, base_url: config.base_url, model: config.model,
      daily_time: config.daily_time, timezone: TIMEZONE, enabled: !!config.enabled && tested,
      has_api_key: !!config.secret, masked_api_key: key ? "••••••••" + (key.length > 4 ? key.slice(-4) : "") : "",
      key_unavailable, model_tested: tested, updated_at: config.updated_at, last_test: config.last_test,
      schedule_effective_at: config.schedule_effective_at
    };
  }
  persist(config) {
    this.db.prepare("INSERT INTO settings (key,value) VALUES ('menu_ai_config',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(config));
  }
  save(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new MenuError("菜单设置格式无效");
    const old = this.raw(), now = this.clock(), config = { ...old };
    if (Object.hasOwn(input, "revision") && input.revision !== old.revision) throw new MenuError("设置已被更新，请重新加载后保存", 409);
    if (Object.hasOwn(input, "provider")) config.provider = input.provider;
    if (!["openrouter", "compatible"].includes(config.provider)) throw new MenuError("不支持的模型提供商");
    config.base_url = config.provider === "openrouter" ? OPENROUTER_BASE : validateEndpoint(input.base_url ?? config.base_url);
    if (Object.hasOwn(input, "model")) {
      if (typeof input.model !== "string" || input.model.trim().length > 200) throw new MenuError("模型 ID 格式无效");
      config.model = input.model.trim();
    }
    if (Object.hasOwn(input, "daily_time")) config.daily_time = validateTime(input.daily_time);
    if (Object.hasOwn(input, "timezone") && input.timezone !== TIMEZONE) throw new MenuError("同步时区固定为北京时间");
    if (Object.hasOwn(input, "enabled") && typeof input.enabled !== "boolean") throw new MenuError("自动同步开关格式无效");
    if (Object.hasOwn(input, "clear_api_key") && typeof input.clear_api_key !== "boolean") throw new MenuError("删除 API Key 开关格式无效");
    if (Object.hasOwn(input, "api_key") && typeof input.api_key !== "string") throw new MenuError("API Key 格式无效");
    const replacement = (input.api_key || "").trim();
    if (/[\r\n\u0000]/.test(replacement)) throw new MenuError("API Key 不能包含换行或空字符");
    if (replacement.length > 2048) throw new MenuError("API Key 过长");
    const endpointChanged = config.provider !== old.provider || config.base_url !== old.base_url;
    if (endpointChanged && old.secret && !replacement && !input.clear_api_key) throw new MenuError("切换提供商或地址时请重新填写 API Key");
    if (input.clear_api_key && replacement) throw new MenuError("不能同时删除和替换 API Key");
    if (replacement) { config.secret = this.encrypt(replacement); config.key_hash = sha256(replacement); }
    if (input.clear_api_key) { config.secret = null; config.key_hash = ""; }
    const aiChanged = fingerprint(config) !== fingerprint(old);
    if (aiChanged) { config.validated_fingerprint = null; config.last_test = null; }
    config.enabled = input.enabled ?? old.enabled;
    if (input.clear_api_key) config.enabled = false;
    // Editing AI settings saves a disabled draft; schedule-only changes retain validation.
    if (aiChanged) config.enabled = false;
    if (config.enabled && (!config.secret || !config.model || config.validated_fingerprint !== fingerprint(config))) throw new MenuError("请先保存并通过图片识别与 JSON 测试，再开启自动同步");
    if (config.enabled) this.decrypt(config);
    if ((!old.enabled && config.enabled) || old.daily_time !== config.daily_time) config.schedule_effective_at = now;
    config.revision = old.revision + 1; config.updated_at = now;
    this.persist(config);
    return this.public();
  }
  recordTest(expected, result) {
    const config = this.raw();
    if (fingerprint(config) !== expected) throw new MenuError("模型设置在测试期间发生变化，请重新测试", 409);
    config.last_test = { ok: result.ok, message: result.message, tested_at: this.clock() };
    config.validated_fingerprint = result.ok ? expected : null;
    if (!result.ok) config.enabled = false;
    this.persist(config);
    return this.public();
  }
}
module.exports = { MenuConfig, fingerprint, OPENROUTER_BASE, validateEndpoint };
