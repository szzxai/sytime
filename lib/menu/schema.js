"use strict";
const crypto = require("node:crypto");
const Ajv = require("ajv");
const { pinyin, customPinyin } = require("pinyin-pro");

const TIMES = ["morning", "noon", "evening", "night"];
const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const VERSION = "vision-catalog-v2";
// Food names are phrases, not surnames. Keep these overrides versioned.
customPinyin({ 重庆: "chóng qìng", 重阳: "chóng yáng", 长寿: "cháng shòu", 臊子: "sào zi" });
class MenuError extends Error {
  constructor(message, status = 422, code = "menu_error") {
    super(message); this.status = status; this.code = code;
  }
}
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const normalizeName = value => String(value || "").normalize("NFC").trim().replace(/\s+/gu, " ");
const nameKey = value => normalizeName(value).toLowerCase();
function nameFields(name) {
  name = normalizeName(name);
  const words = pinyin(name, { toneType: "none", type: "array", v: true, surname: "off", nonZh: "consecutive" });
  const full = words.join("").toLowerCase();
  const initials = words.map(x => x[0] || "").join("").toLowerCase();
  const first = (full[0] || "").toUpperCase();
  return { name, name_key: nameKey(name), initial: /^[A-Z]$/.test(first) ? first : "#", pinyin: full, pinyin_initials: initials, sort_key: words.join(" ").toLowerCase() };
}
const nullableText = maxLength => ({ type: ["string", "null"], maxLength });
const RECORD_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    date: { type: ["string", "null"], pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    weekday: { type: ["string", "null"], enum: [...WEEKDAYS, null] },
    time: { type: "array", items: { type: "string", enum: TIMES }, uniqueItems: true, maxItems: 4 },
    place: nullableText(100), group: nullableText(100), name: { type: "string", minLength: 1, maxLength: 200 },
    price: { type: ["number", "null"], minimum: 0 }, spicy: { type: ["boolean", "null"] }
  },
  required: ["date", "weekday", "time", "place", "group", "name", "price", "spicy"]
};
const ajv = new Ajv({ allErrors: true, strict: true });
const checkRecord = ajv.compile(RECORD_SCHEMA);
function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function validateRecords(records, { historical = false } = {}) {
  if (!Array.isArray(records) || !records.length || records.length > 20000) throw new MenuError("菜单必须包含有效的完整菜品数组");
  const result = [], seen = new Set();
  for (const [index, original] of records.entries()) {
    const row = "第 " + (index + 1) + " 条：";
    if (!original || typeof original !== "object" || Array.isArray(original)) throw new MenuError(row + "菜单记录格式无效");
    const record = { ...original };
    if (historical && !Object.hasOwn(record, "spicy")) record.spicy = null;
    if (!checkRecord(record)) {
      const error = checkRecord.errors[0];
      const field = error.params.missingProperty || error.params.additionalProperty || error.instancePath.slice(1).split("/")[0] || "记录";
      throw new MenuError(row + field + " 字段或类型不符合八字段格式（" + error.keyword + "）");
    }
    record.name = normalizeName(record.name);
    if (!record.name || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(record.name)) throw new MenuError(row + "菜品名称无效");
    if (record.date !== null) {
      if (!validDate(record.date)) throw new MenuError(row + "菜单供应日期无效");
      const weekday = WEEKDAYS[new Date(record.date + "T00:00:00Z").getUTCDay()];
      if (record.weekday !== null && record.weekday !== weekday) throw new MenuError(row + "菜单供应日期与星期矛盾");
      record.weekday = weekday;
    } else if (record.weekday !== null) {
      // A printed weekday without a readable date is legitimate; retain it.
    }
    if (record.price !== null && !Number.isFinite(record.price)) throw new MenuError("菜单价格无效");
    record.time = TIMES.filter(time => record.time.includes(time));
    record.place = record.place === null ? null : normalizeName(record.place) || null;
    record.group = record.group === null ? null : normalizeName(record.group) || null;
    const ordered = Object.fromEntries(RECORD_SCHEMA.required.map(key => [key, record[key]]));
    const hash = sha256(JSON.stringify(ordered));
    if (!seen.has(hash)) { seen.add(hash); result.push(ordered); }
  }
  return result;
}
function cleanError(error, secrets = []) {
  let message = error instanceof MenuError ? error.message : "菜单任务执行失败，请查看诊断并重试";
  for (const secret of secrets) if (secret) message = message.split(secret).join("[已隐藏]");
  return message.replace(/Bearer\s+\S+/gi, "Bearer [已隐藏]").replace(/sk-[\w-]+/g, "[已隐藏]").slice(0, 800);
}
module.exports = { MenuError, VERSION, TIMES, WEEKDAYS, RECORD_SCHEMA, normalizeName, nameKey, nameFields, sha256, validDate, validateRecords, cleanError };
