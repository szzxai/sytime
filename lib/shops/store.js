"use strict";
/* 三元坊必吃榜 · 店铺数据层（#6）
   - 建表、配置读取、校验、查询与创建
   - 距离/步行时间由上传者用高德地图步行路线查询后录入，均为步行距离
   - 店铺坐标采用 GCJ-02；只依赖 node:sqlite，无第三方包 */
const fs = require("node:fs");
const path = require("node:path");

// 预设类型；上传时也可使用「其他/自定义」
const SHOP_TYPES = ["面馆", "小吃", "饮品", "快餐", "甜点", "正餐"];

// 排序：白名单，键 -> SQL（tie-break 名称与 id，保证结果稳定）
const CAMPUS_ORDER = "campus_distance_m ASC, campus_walk_min ASC, name COLLATE NOCASE ASC, id ASC";
const SORTS = {
  campus: CAMPUS_ORDER,
  // Legacy query values remain aliases during migration.
  north: CAMPUS_ORDER,
  east: CAMPUS_ORDER,
  metro: "metro_distance_m ASC, metro_walk_min ASC, name COLLATE NOCASE ASC, id ASC",
  likes: "(SELECT COUNT(*) FROM shop_likes WHERE shop_id = shops.id) DESC, campus_distance_m ASC, name COLLATE NOCASE ASC, id ASC",
  reviews: "(SELECT COUNT(*) FROM shop_reviews WHERE shop_id = shops.id) DESC, campus_distance_m ASC, name COLLATE NOCASE ASC, id ASC",
  rating: "(SELECT AVG(rating) FROM shop_reviews WHERE shop_id = shops.id) DESC, (SELECT COUNT(*) FROM shop_reviews WHERE shop_id = shops.id) DESC, campus_distance_m ASC, name COLLATE NOCASE ASC, id ASC",
  new: "created_at DESC, id DESC"
};
const DEFAULT_SORT = "campus";

// 覆盖范围文字（司前街、十梓街、凤凰街、新市路围合区域）
const AREA_TEXT = "苏州市姑苏区行政区全域（含行政区边界沿街）";

const LIMITS = {
  name: 30,
  address: 60,
  location_note: 40,
  dianping_url: 500,
  type: 8,
  metro_station: 30,
  metro_exit: 20,
  distance_m: [1, 20000],
  walk_min: [1, 240]
};

class ShopError extends Error {
  constructor(status, error, extra) {
    super(error);
    this.status = status;
    this.error = error;
    Object.assign(this, extra || {});
  }
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS shops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      address TEXT NOT NULL,
      location_note TEXT NOT NULL DEFAULT '',
      dianping_url TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      north_gate_distance_m INTEGER NOT NULL,
      north_gate_walk_min INTEGER NOT NULL,
      east_gate_distance_m INTEGER NOT NULL,
      east_gate_walk_min INTEGER NOT NULL,
      campus_distance_m INTEGER NOT NULL DEFAULT 0,
      campus_walk_min INTEGER NOT NULL DEFAULT 0,
      metro_station TEXT NOT NULL DEFAULT '',
      metro_exit TEXT NOT NULL DEFAULT '',
      metro_distance_m INTEGER NOT NULL,
      metro_walk_min INTEGER NOT NULL,
      created_by INTEGER,
      created_by_name TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_shops_name ON shops(name);
    CREATE INDEX IF NOT EXISTS idx_shops_north ON shops(north_gate_distance_m);
    CREATE INDEX IF NOT EXISTS idx_shops_east ON shops(east_gate_distance_m);
    CREATE INDEX IF NOT EXISTS idx_shops_metro ON shops(metro_distance_m);
  `);
  // Migrate databases created before the single-campus-distance model.
  const columns = db.prepare("PRAGMA table_info(shops)").all().map(function (column) { return column.name; });
  if (columns.indexOf("campus_distance_m") === -1) db.exec("ALTER TABLE shops ADD COLUMN campus_distance_m INTEGER NOT NULL DEFAULT 0");
  if (columns.indexOf("campus_walk_min") === -1) db.exec("ALTER TABLE shops ADD COLUMN campus_walk_min INTEGER NOT NULL DEFAULT 0");
  if (columns.indexOf("dianping_url") === -1) db.exec("ALTER TABLE shops ADD COLUMN dianping_url TEXT NOT NULL DEFAULT ''");
  db.exec("CREATE INDEX IF NOT EXISTS idx_shops_campus ON shops(campus_distance_m)");
  db.exec(`
    CREATE TABLE IF NOT EXISTS shop_likes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      UNIQUE(shop_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_shop_likes_shop ON shop_likes(shop_id);
    CREATE TABLE IF NOT EXISTS shop_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
      content TEXT NOT NULL DEFAULT '',
      guests INTEGER,
      total_price REAL,
      image_url TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      UNIQUE(shop_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_shop_reviews_shop ON shop_reviews(shop_id);
  `);
  // 迁移旧库：评价图片与人均消费字段
  const reviewColumns = db.prepare("PRAGMA table_info(shop_reviews)").all().map(function (column) { return column.name; });
  if (reviewColumns.indexOf("guests") === -1) db.exec("ALTER TABLE shop_reviews ADD COLUMN guests INTEGER");
  if (reviewColumns.indexOf("total_price") === -1) db.exec("ALTER TABLE shop_reviews ADD COLUMN total_price REAL");
  if (reviewColumns.indexOf("image_url") === -1) db.exec("ALTER TABLE shop_reviews ADD COLUMN image_url TEXT NOT NULL DEFAULT ''");
}

// 评价人数：1–99 的整数，选填
function reviewGuests(value) {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 99) return undefined;
  return n;
}

// 评价总价（元）：0–100000，最多两位小数，选填
function reviewTotalPrice(value) {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(value);
  if (!isFinite(n) || n < 0 || n > 100000) return undefined;
  return Math.round(n * 100) / 100;
}

// 人均价：人数与总价都填时自动计算（两位小数），否则 null
function perPerson(guests, totalPrice) {
  if (!Number.isInteger(guests) || guests < 1 || typeof totalPrice !== "number" || !isFinite(totalPrice) || totalPrice < 0) return null;
  return Math.round((totalPrice / guests) * 100) / 100;
}

/* ---------- 配置：data/shops-config.json（每次读取，改完刷新即生效） ---------- */
const DEFAULT_CONFIG = {
  center: { lat: 31.295509, lng: 120.62238, zoom: 15 },
  anchors: {
    campus: { name: "江苏省苏州中学本部", lat: 31.295509, lng: 120.62238 }
  },
  area: { name: "初始覆盖范围", polygon: [] }
};

function num(value) {
  return typeof value === "number" && isFinite(value) ? value : null;
}

function point(value) {
  const p = value || {};
  const lat = num(p.lat);
  const lng = num(p.lng);
  return lat === null || lng === null ? null : { lat: lat, lng: lng };
}

/* Standard WGS84 -> GCJ-02 conversion for the user-provided OSM boundary vertices. */
function transformLat(x, y) {
  let ret = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3;
  ret += ((20 * Math.sin(y * Math.PI) + 40 * Math.sin((y / 3) * Math.PI)) * 2) / 3;
  ret += ((160 * Math.sin((y / 12) * Math.PI) + 320 * Math.sin((y * Math.PI) / 30)) * 2) / 3;
  return ret;
}
function transformLng(x, y) {
  let ret = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3;
  ret += ((20 * Math.sin(x * Math.PI) + 40 * Math.sin((x / 3) * Math.PI)) * 2) / 3;
  ret += ((150 * Math.sin((x / 12) * Math.PI) + 300 * Math.sin((x / 30) * Math.PI)) * 2) / 3;
  return ret;
}
function wgs84ToGcj02(lat, lng) {
  if (lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271) return { lat: lat, lng: lng };
  const a = 6378245.0;
  const ee = 0.00669342162296594323;
  let dLat = transformLat(lng - 105, lat - 35);
  let dLng = transformLng(lng - 105, lat - 35);
  const radLat = (lat / 180) * Math.PI;
  let magic = Math.sin(radLat);
  magic = 1 - ee * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180) / (((a * (1 - ee)) / (magic * sqrtMagic)) * Math.PI);
  dLng = (dLng * 180) / ((a / sqrtMagic) * Math.cos(radLat) * Math.PI);
  return { lat: lat + dLat, lng: lng + dLng };
}

function loadConfig(root) {
  const file = path.join(root, "data", "shops-config.json");
  let raw = {};
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8")) || {};
  } catch (err) {
    raw = {};
  }
  const center = point(raw.center);
  const zoom = num(raw.center && raw.center.zoom);
  const anchors = {};
  Object.keys(DEFAULT_CONFIG.anchors).forEach(function (key) {
    const source = (raw.anchors && raw.anchors[key]) || {};
    anchors[key] = {
      key: key,
      name: String(source.name || DEFAULT_CONFIG.anchors[key].name).slice(0, 30),
      point: point(source)
    };
  });
  const sourceSystem = String((raw.area && raw.area.coordinate_system) || "GCJ-02").toUpperCase();
  const polygon = Array.isArray(raw.area && raw.area.polygon)
    ? raw.area.polygon.map(function (pair) {
        if (!Array.isArray(pair) || pair.length < 2) return null;
        const lat = Number(pair[0]);
        const lng = Number(pair[1]);
        if (!isFinite(lat) || !isFinite(lng)) return null;
        const converted = sourceSystem === "WGS84" || sourceSystem === "WGS-84" ? wgs84ToGcj02(lat, lng) : { lat: lat, lng: lng };
        return [converted.lat, converted.lng];
      }).filter(Boolean)
    : [];
  return {
    center: center ? { lat: center.lat, lng: center.lng, zoom: zoom || DEFAULT_CONFIG.center.zoom } : null,
    anchors: anchors,
    area: {
      name: String((raw.area && raw.area.name) || DEFAULT_CONFIG.area.name).slice(0, 40),
      polygon: polygon,
      coordinate_system: "GCJ-02",
      source_coordinate_system: sourceSystem,
      text: String((raw.area && raw.area.text) || AREA_TEXT).slice(0, 200)
    },
    file: file,
    present: fs.existsSync(file)
  };
}

/* ---------- 校验 ---------- */
// 地址至少包含「XX路/XX街 + 门牌号 + 号」（覆盖范围内的十梓街、凤凰街等以「街」结尾）
const ROAD_RE = /(路|街|巷|道|弄|坊|河沿)/;
const NUM_END_RE = /\d+\s*号/;

function text(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function int(value) {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(value);
  if (!isFinite(n) || Math.floor(n) !== n) return null;
  return n;
}
function boundNumber(value, max) {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(value);
  if (!isFinite(n) || n < 0 || n > max) return null;
  return n;
}

function insidePolygon(lat, lng, polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) return true;
  // Ray-casting on GCJ-02 longitude/latitude; a point on the polygon edge counts as inside.
  let inside = false;
  const x = lng;
  const y = lat;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const yi = Number(polygon[i][0]);
    const xi = Number(polygon[i][1]);
    const yj = Number(polygon[j][0]);
    const xj = Number(polygon[j][1]);
    if (![yi, xi, yj, xj].every(Number.isFinite)) continue;
    const cross = (x - xi) * (yj - yi) - (y - yi) * (xj - xi);
    const onSegment = Math.abs(cross) < 1e-10 && x >= Math.min(xi, xj) - 1e-10 && x <= Math.max(xi, xj) + 1e-10 && y >= Math.min(yi, yj) - 1e-10 && y <= Math.max(yi, yj) + 1e-10;
    if (onSegment) return true;
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function validate(body, polygon) {
  const fields = {};
  const input = body || {};

  const name = text(input.name);
  if (!name) fields.name = "请输入店铺名称";
  else if (name.length > LIMITS.name) fields.name = "店铺名称不能超过 " + LIMITS.name + " 字";

  const address = text(input.address);
  if (!address) fields.address = "请输入店铺地址";
  else if (address.length > LIMITS.address) fields.address = "店铺地址不能超过 " + LIMITS.address + " 字";
  else if (!ROAD_RE.test(address) || !NUM_END_RE.test(address)) fields.address = "地址格式应包含道路/巷坊名与门牌号（如十梓街 123 号、滚绣坊 51 号）";

  const location_note = text(input.location_note);
  if (location_note.length > LIMITS.location_note) fields.location_note = "补充描述不能超过 " + LIMITS.location_note + " 字";

  let dianping_url = text(input.dianping_url);
  if (dianping_url.length > LIMITS.dianping_url) {
    fields.dianping_url = "大众点评链接不能超过 " + LIMITS.dianping_url + " 字";
  } else if (dianping_url) {
    try {
      const parsed = new URL(dianping_url);
      const host = parsed.hostname.toLowerCase();
      if (parsed.protocol !== "https:" || !(host === "dianping.com" || host.endsWith(".dianping.com")) || parsed.username || parsed.password || parsed.port) {
        fields.dianping_url = "请输入 https://*.dianping.com/ 下的有效链接";
      } else dianping_url = parsed.toString();
    } catch (err) {
      fields.dianping_url = "请输入有效的大众点评链接";
    }
  }

  const type = text(input.type);
  if (!type) fields.type = "请选择店铺类型";
  else if (type.length > LIMITS.type) fields.type = "店铺类型不能超过 " + LIMITS.type + " 字";

  const lat = Number(input.lat);
  const lng = Number(input.lng);
  if (!isFinite(lat) || lat < 3 || lat > 54 || !isFinite(lng) || lng < 73 || lng > 136) {
    fields.lat = "请填写有效的 GCJ-02 坐标（纬度 3–54、经度 73–136）";
  } else if (!insidePolygon(lat, lng, polygon)) {
    fields.lat = "店铺位置不在苏州市姑苏区行政范围内";
  }

  const distances = [
    ["campus_distance_m", "苏州中学本部", "distance_m"],
    ["metro_distance_m", "地铁站出口", "distance_m"]
  ];
  distances.forEach(function (item) {
    const value = int(input[item[0]]);
    if (value === null || value < LIMITS.distance_m[0] || value > LIMITS.distance_m[1]) {
      fields[item[0]] = "请输入距离" + item[1] + "的步行距离（1–20000 米）";
    }
  });
  const walks = [
    ["campus_walk_min", "苏州中学本部"],
    ["metro_walk_min", "地铁站出口"]
  ];
  walks.forEach(function (item) {
    const value = int(input[item[0]]);
    if (value === null || value < LIMITS.walk_min[0] || value > LIMITS.walk_min[1]) {
      fields[item[0]] = "请输入到" + item[1] + "的预计步行时间（1–240 分钟）";
    }
  });

  const metro_station = text(input.metro_station);
  if (!metro_station) fields.metro_station = "请输入最近的地铁站";
  else if (metro_station.length > LIMITS.metro_station) fields.metro_station = "地铁站名称不能超过 " + LIMITS.metro_station + " 字";

  const metro_exit = text(input.metro_exit);
  if (!metro_exit) fields.metro_exit = "请输入最近的出口（例如 3 号口）";
  else if (metro_exit.length > LIMITS.metro_exit) fields.metro_exit = "出口名称不能超过 " + LIMITS.metro_exit + " 字";

  if (Object.keys(fields).length) {
    const error = new ShopError(422, "店铺信息有误，请检查后重试");
    error.fields = fields;
    throw error;
  }

  return {
    name: name,
    address: address,
    location_note: location_note,
    dianping_url: dianping_url,
    type: type,
    lat: Number(lat.toFixed(6)),
    lng: Number(lng.toFixed(6)),
    campus_distance_m: int(input.campus_distance_m),
    campus_walk_min: int(input.campus_walk_min),
    // Keep old NOT NULL columns populated during the transition for existing DB files.
    north_gate_distance_m: int(input.campus_distance_m),
    north_gate_walk_min: int(input.campus_walk_min),
    east_gate_distance_m: int(input.campus_distance_m),
    east_gate_walk_min: int(input.campus_walk_min),
    metro_station: metro_station,
    metro_exit: metro_exit,
    metro_distance_m: int(input.metro_distance_m),
    metro_walk_min: int(input.metro_walk_min)
  };
}

/* ---------- 查询 ---------- */
function publicShop(row) {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    location_note: row.location_note || "",
    dianping_url: row.dianping_url || "",
    type: row.type,
    lat: row.lat,
    lng: row.lng,
    campus_distance_m: row.campus_distance_m || row.north_gate_distance_m || 0,
    campus_walk_min: row.campus_walk_min || row.north_gate_walk_min || 0,
    metro_station: row.metro_station,
    metro_exit: row.metro_exit,
    metro_distance_m: row.metro_distance_m,
    metro_walk_min: row.metro_walk_min,
    likes_count: Number(row.likes_count || 0),
    reviews_count: Number(row.reviews_count || 0),
    ratings_count: Number(row.ratings_count || 0),
    rating_avg: row.rating_avg === null || row.rating_avg === undefined ? null : Number(row.rating_avg),
    user_liked: !!row.user_liked,
    user_rating: row.user_rating === undefined ? null : row.user_rating,
    user_review_content: row.user_review_content || "",
    distance_m: row.campus_distance_m || row.north_gate_distance_m || 0,
    walk_min: row.campus_walk_min || row.north_gate_walk_min || 0,
    created_at: row.created_at,
    created_by: row.created_by_name || ""
  };
}

function normalizeType(value) {
  return text(value);
}

function normalizeSort(value) {
  const key = text(value);
  if (key === "north" || key === "east") return "campus";
  return SORTS[key] ? key : DEFAULT_SORT;
}

function list(db, options) {
  const opt = options || {};
  const type = text(opt.type);
  const q = text(opt.q).slice(0, 80);
  const sort = normalizeSort(opt.sort);
  const clauses = [];
  const params = [];
  if (type && type !== "全部") {
    clauses.push("type = ?");
    params.push(type);
  }
  if (q) {
    clauses.push("(name LIKE ? OR address LIKE ? OR location_note LIKE ? OR type LIKE ? OR metro_station LIKE ? OR metro_exit LIKE ?)");
    const like = "%" + q + "%";
    params.push(like, like, like, like, like, like);
  }
  const bounds = [
    ["campus_distance_m", "distance_min_m", "distance_max_m", 50000, false],
    ["campus_walk_min", "walk_min", "walk_max", 240, false],
    ["(SELECT COUNT(*) FROM shop_likes WHERE shop_id = shops.id)", "likes_min", "likes_max", 1000000, false],
    ["(SELECT COUNT(*) FROM shop_reviews WHERE shop_id = shops.id)", "reviews_min", "reviews_max", 1000000, false],
    ["(SELECT AVG(rating) FROM shop_reviews WHERE shop_id = shops.id)", "rating_min", "rating_max", 5, true]
  ];
  bounds.forEach(function (item) {
    const parse = item[4] ? boundNumber : int;
    const minimum = parse(opt[item[1]], item[3]);
    const maximum = parse(opt[item[2]], item[3]);
    if (minimum !== null && minimum >= 0 && minimum <= item[3]) {
      clauses.push(item[0] + " >= ?");
      params.push(minimum);
    }
    if (maximum !== null && maximum >= 0 && maximum <= item[3]) {
      clauses.push(item[0] + " <= ?");
      params.push(maximum);
    }
  });
  const rows = db
    .prepare(
      "SELECT * FROM shops" +
        (clauses.length ? " WHERE " + clauses.join(" AND ") : "") +
        " ORDER BY " + SORTS[sort]
    )
    .all(...params);
  return {
    shops: rows.map(publicShop),
    total: rows.length,
    sort: sort,
    type: type,
    filters: {
      q: q,
      distance_min_m: opt.distance_min_m,
      distance_max_m: opt.distance_max_m,
      walk_min: opt.walk_min,
      walk_max: opt.walk_max,
      likes_min: opt.likes_min,
      likes_max: opt.likes_max,
      reviews_min: opt.reviews_min,
      reviews_max: opt.reviews_max,
      rating_min: opt.rating_min,
      rating_max: opt.rating_max
    }
  };
}

function count(db) {
  return Number(db.prepare("SELECT COUNT(*) AS n FROM shops").get().n);
}

function get(db, id) {
  const row = db.prepare("SELECT * FROM shops WHERE id = ?").get(id);
  return row ? publicShop(row) : null;
}

function create(db, body, user, config) {
  const values = validate(body, config && config.area && config.area.polygon);
  const existing = db.prepare("SELECT id FROM shops WHERE name = ?").get(values.name);
  if (existing) {
    throw new ShopError(409, "已有同名店铺", { message: "已有同名店铺", existing_id: existing.id });
  }
  let info;
  try {
    info = db
      .prepare(
        `INSERT INTO shops (name, address, location_note, dianping_url, type, lat, lng,
          north_gate_distance_m, north_gate_walk_min, east_gate_distance_m, east_gate_walk_min,
          campus_distance_m, campus_walk_min, metro_station, metro_exit, metro_distance_m, metro_walk_min, created_by, created_by_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        values.name, values.address, values.location_note, values.dianping_url, values.type, values.lat, values.lng,
        values.north_gate_distance_m, values.north_gate_walk_min,
        values.east_gate_distance_m, values.east_gate_walk_min,
        values.campus_distance_m, values.campus_walk_min,
        values.metro_station, values.metro_exit, values.metro_distance_m, values.metro_walk_min,
        user ? user.id : null, user ? user.username || "" : ""
      );
  } catch (err) {
    // 并发下唯一索引兜底
    if (err && (err.errcode === 2067 || /UNIQUE constraint failed/.test(String(err.message)))) {
      const row = db.prepare("SELECT id FROM shops WHERE name = ?").get(values.name);
      throw new ShopError(409, "已有同名店铺", { message: "已有同名店铺", existing_id: row ? row.id : undefined });
    }
    throw err;
  }
  return get(db, Number(info.lastInsertRowid));
}

function types(db) {
  // 预设类型 + 库中已出现的自定义类型
  const used = db.prepare("SELECT DISTINCT type FROM shops ORDER BY type").all().map(function (r) { return r.type; });
  const all = SHOP_TYPES.slice();
  used.forEach(function (t) {
    if (all.indexOf(t) === -1) all.push(t);
  });
  return { presets: SHOP_TYPES.slice(), all: all };
}

module.exports = {
  SHOP_TYPES,
  SORTS,
  DEFAULT_SORT,
  AREA_TEXT,
  LIMITS,
  ShopError,
  reviewGuests,
  reviewTotalPrice,
  perPerson,
  migrate,
  loadConfig,
  wgs84ToGcj02,
  normalizeType,
  normalizeSort,
  validate,
  insidePolygon,
  list,
  count,
  get,
  create,
  types
};
