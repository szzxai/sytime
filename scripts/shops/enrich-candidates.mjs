/*
 * Enrich AMap restaurant candidates with a campus walking route and nearest
 * walking-distance subway exit. All requests use AMAP_SERVICE_KEY server-side.
 * Default mode writes a reviewed enrichment snapshot only. Pass --import to
 * insert rows that satisfy the app's address, route, tag and geofence rules.
 * Run: node scripts/shops/enrich-candidates.mjs [--import]
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";

const require = createRequire(import.meta.url);
const store = require("../../lib/shops/store.js");
const root = process.cwd();
const env = fs.readFileSync(path.join(root, ".env"), "utf8");
const serviceKey = env.split(/\r?\n/).map((line) => line.replace(/^\uFEFF/, "")).find((line) => line.startsWith("AMAP_SERVICE_KEY="))?.slice("AMAP_SERVICE_KEY=".length).trim();
if (!serviceKey) throw new Error("AMAP_SERVICE_KEY is not configured");

const inputFile = path.join(root, "output", "shops-amap-candidates.json");
const input = JSON.parse(fs.readFileSync(inputFile, "utf8"));
const outputDir = path.join(root, "output");
fs.mkdirSync(outputDir, { recursive: true });
const cacheConfig = store.loadConfig(root);
const cacheTag = { ids: input.pois.map((poi) => poi.id), campus: cacheConfig.anchors.campus.point, center: { lat: cacheConfig.center.lat, lng: cacheConfig.center.lng }, polygon: cacheConfig.area.polygon };
function cacheSignature(tag) {
  return JSON.stringify({
    ids: tag.ids,
    campus: tag.campus && { lat: tag.campus.lat, lng: tag.campus.lng },
    center: tag.center && { lat: tag.center.lat, lng: tag.center.lng },
    polygon: tag.polygon
  });
}
function readCache(file) {
  try {
    const cache = JSON.parse(fs.readFileSync(path.join(outputDir, file), "utf8"));
    const oldTag = typeof cache.tag === "string" ? JSON.parse(cache.tag) : cache.tag;
    return cacheSignature(oldTag) === cacheSignature(cacheTag) ? cache.data : null;
  } catch { return null; }
}
function writeCache(file, data) {
  fs.writeFileSync(path.join(outputDir, file), JSON.stringify({ tag: cacheTag, data: data }, null, 2) + "\n", "utf8");
}
const config = store.loadConfig(root);
const campus = config.anchors.campus.point;
if (!campus) throw new Error("Campus coordinate is missing from data/shops-config.json");
const center = config.center;
const batchSize = 50;
const concurrency = process.argv.includes("--slow") ? 1 : 4;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function jsonRequest(endpoint, params, label) {
  const url = new URL(endpoint);
  Object.entries({ ...params, key: serviceKey }).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (data.status === "1") return data;
      const info = String(data.info || "AMap error");
      if (/QPS|LIMIT|NETWORK/.test(info) && attempt < 2) {
        await pause(1000 * (attempt + 1));
        continue;
      }
      throw new Error(info);
    } catch (error) {
      if (attempt === 2) throw new Error(`${label}: ${error.message}`);
      await pause(500 * (attempt + 1));
    }
  }
  throw new Error(`${label}: failed`);
}

async function pool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      try { results[index] = await fn(items[index], index); }
      catch (error) { results[index] = { _error: error.message }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function parsePoint(location) {
  const pair = String(location || "").split(",").map(Number);
  return pair.length === 2 && pair.every(Number.isFinite) ? { lng: pair[0], lat: pair[1] } : null;
}

function addressOK(value) {
  const address = String(value || "").trim();
  return address.length <= store.LIMITS.address && /(路|街|巷|道|弄|坊|河沿)/.test(address) && /\d+\s*号/.test(address);
}
function explicitlyClosed(poi) {
  return /暂停营业|已停业|已关闭|歇业|已关门|已迁址/.test(String(poi.name || "") + " " + String(poi.amap_type || ""));
}
function safeDianpingUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && !url.username && !url.password && !url.port && (host === "dianping.com" || host.endsWith(".dianping.com")) ? url.toString() : "";
  } catch { return ""; }
}

function classify(poi) {
  const name = String(poi.name || "");
  const category = String(poi.type || "");
  const text = name + " " + category;
  if (/甜点|甜品|蛋糕|糕饼|面包|烘焙|冰淇淋|冰激凌|糖水/.test(text)) return "甜点";
  if (/咖啡|奶茶|茶饮|饮品|冷饮|茶馆|茶社|果汁|酒吧|酒馆/.test(text)) return "饮品";
  if (/面馆|拉面|面条|米线|米粉|粉面|馄饨|云吞|汤面|牛肉面|炸酱面/.test(text)) return "面馆";
  if (/快餐|汉堡|炸鸡|便当|简餐|盖饭|外卖|西式快餐/.test(text)) return "快餐";
  if (/小吃|熟食|卤味|卤菜|生煎|烧麦|包子|锅贴|串串|臭豆腐|煎饼|早点|烧饼|鸭血粉丝/.test(text)) return "小吃";
  if (/快餐|便利店/.test(category) && !/便利店/.test(name)) return "快餐";
  if (/糕饼|面包|甜品/.test(category)) return "甜点";
  if (/咖啡|饮品|冷饮/.test(category)) return "饮品";
  return "正餐";
}

function durationMinutes(seconds) {
  const n = Number(seconds);
  return Number.isFinite(n) && n > 0 ? Math.max(1, Math.round(n / 60)) : null;
}

function haversine(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const x = dLng * Math.cos(((a.lat + b.lat) / 2) * rad);
  return 6371000 * Math.sqrt(x * x + dLat * dLat);
}

/* 1. Query all subway entrance POIs within 2 km of the corrected coverage polygon. */
let exitTotal;
let exits;
const exitCache = readCache("shops-amap-exits-cache.json");
if (exitCache) {
  exitTotal = exitCache.total;
  exits = exitCache.exits;
} else {
  const exitRows = [];
  exitTotal = 0;
  for (let page = 1; page <= 100; page += 1) {
    const result = await jsonRequest("https://restapi.amap.com/v3/place/around", {
      location: `${center.lng},${center.lat}`,
      keywords: "地铁出入口",
      types: "150500",
      radius: 15000,
      offset: 25,
      page,
      extensions: "all"
    }, `metro exits page ${page}`);
    exitTotal = Number(result.count) || exitTotal;
    exitRows.push(...(result.pois || []));
    if (page * 25 >= exitTotal) break;
    await pause(180);
  }
  exits = [...new Map(exitRows.filter((p) => p.id && parsePoint(p.location)).map((p) => [String(p.id), {
    id: String(p.id),
    name: String(p.name || "").trim(),
    location: parsePoint(p.location)
  }])).values()];
  writeCache("shops-amap-exits-cache.json", { total: exitTotal, exits: exits });
}
if (!exits.length) throw new Error("No subway exits returned by AMap around the polygon");

/* 2. Normalize POIs and reverse-geocode only addresses that miss XX路/街 XX号. */
let candidates = input.pois.map((poi) => ({
  source_id: poi.id,
  name: String(poi.name || "").trim(),
  address: String(poi.address || "").trim(),
  location: parsePoint(poi.location),
  amap_type: String(poi.type || ""),
  business_area: String(poi.business_area || "").trim(),
  dianping_url: safeDianpingUrl(poi.website),
  type: classify(poi)
})).filter((poi) => poi.location && poi.name);
const addressCache = readCache("shops-amap-address-cache.json") || {};
const needsReverse = candidates.filter((poi) => !addressOK(poi.address) && !addressCache[poi.source_id]);
const reverse = await pool(needsReverse, concurrency, async (poi) => {
  const result = await jsonRequest("https://restapi.amap.com/v3/geocode/regeo", {
    location: `${poi.location.lng},${poi.location.lat}`,
    extensions: "all",
    radius: 100,
    roadlevel: 1
  }, `reverse geocode ${poi.name}`);
  const regeo = result.regeocode || {};
  const component = regeo.addressComponent || {};
  const streetNumber = component.streetNumber || {};
  const street = Array.isArray(streetNumber.street) ? streetNumber.street[0] : streetNumber.street;
  const number = Array.isArray(streetNumber.number) ? streetNumber.number[0] : streetNumber.number;
  const options = [regeo.formatted_address, street && number ? `${street}${number}` : ""]
    .map((value) => String(value || "").trim())
    .filter(addressOK);
  const value = { address: options[0] || "", formatted_address: String(regeo.formatted_address || "") };
  addressCache[poi.source_id] = value;
  writeCache("shops-amap-address-cache.json", addressCache);
  return value;
});
needsReverse.forEach((poi, index) => { addressCache[poi.source_id] = reverse[index]; });
writeCache("shops-amap-address-cache.json", addressCache);
for (const poi of candidates) {
  if (addressOK(poi.address)) continue;
  const found = addressCache[poi.source_id];
  if (found && addressOK(found.address)) poi.address = found.address;
  else poi.address_lookup_error = found && found._error ? found._error : "no street number from reverse geocode";
}

/* 3. Batch the AMap walking matrix for campus-to-POI distances. */
const campusCache = readCache("shops-amap-campus-matrix-cache.json") || {};
const campusBatchSize = 50;
const campusBatches = [];
for (let start = 0; start < candidates.length; start += campusBatchSize) {
  const batch = candidates.slice(start, start + campusBatchSize).filter((poi) => !campusCache[poi.source_id]);
  if (batch.length) campusBatches.push(batch);
}
await pool(campusBatches, concurrency, async (batch) => {
  const result = await jsonRequest("https://restapi.amap.com/v3/distance", {
    origins: batch.map((poi) => `${poi.location.lng},${poi.location.lat}`).join("|"),
    destination: `${campus.lng},${campus.lat}`,
    type: 3
  }, "campus walking matrix");
  const rows = Array.isArray(result.results) ? result.results : [];
  batch.forEach((poi, index) => {
    const row = rows[index];
    const distance = row && Number(row.distance);
    const minutes = row && durationMinutes(row.duration);
    if (Number.isFinite(distance) && minutes) campusCache[poi.source_id] = { campus_distance_m: Math.round(distance), campus_walk_min: minutes };
  });
  writeCache("shops-amap-campus-matrix-cache.json", campusCache);
  return rows.length;
});
candidates.forEach((poi) => Object.assign(poi, campusCache[poi.source_id] || { campus_route_error: "no campus walking matrix" }));

/* 4. Pick each shop's three nearest exit candidates by straight-line distance,
      then use AMap's walking matrix to choose the true closest among them. */
const nearByPoi = new Map();
for (const poi of candidates) {
  nearByPoi.set(poi.source_id, exits.map((exit) => ({ exit, straight_m: haversine(poi.location, exit.location) }))
    .sort((a, b) => a.straight_m - b.straight_m).slice(0, 3));
}
const exitIds = [...new Set([...nearByPoi.values()].flat().map((item) => item.exit.id))];
const exitById = new Map(exits.map((e) => [e.id, e]));
const matrixByExit = new Map();
const matrixCache = readCache("shops-amap-matrix-cache.json") || {};
const routeJobs = [];
for (const exitId of exitIds) {
  const exit = exitById.get(exitId);
  // Only route each shop to the three exits selected by straight-line proximity.
  // Querying every exit against every shop creates a large amount of unused API traffic.
  const eligible = candidates.filter((poi) => (nearByPoi.get(poi.source_id) || []).some((item) => item.exit.id === exitId));
  for (let start = 0; start < eligible.length; start += batchSize) {
    const slice = eligible.slice(start, start + batchSize);
    routeJobs.push({ exit, slice, start, cacheKey: `${exit.id}:${start}` });
  }
}
const matrices = await pool(routeJobs, concurrency, async ({ exit, slice, cacheKey }) => {
  if (matrixCache[cacheKey]) return matrixCache[cacheKey];
  const origins = slice.map((poi) => `${poi.location.lng},${poi.location.lat}`).join("|");
  const result = await jsonRequest("https://restapi.amap.com/v3/distance", {
    origins,
    destination: `${exit.location.lng},${exit.location.lat}`,
    type: 3
  }, `metro walking matrix ${exit.name}`);
  const rows = result.results || [];
  const matrix = slice.map((poi, index) => {
    const row = rows[index] || {};
    const meters = Number(row.distance);
    const minutes = durationMinutes(row.duration);
    return Number.isFinite(meters) && minutes ? {
      source_id: poi.source_id,
      exit_id: exit.id,
      metro_distance_m: Math.round(meters),
      metro_walk_min: minutes
    } : null;
  });
  matrixCache[cacheKey] = matrix;
  writeCache("shops-amap-matrix-cache.json", matrixCache);
  return matrix;
});
let matrixFailures = 0;
for (let i = 0; i < routeJobs.length; i += 1) {
  const { exit } = routeJobs[i];
  if (!Array.isArray(matrices[i])) { matrixFailures += 1; continue; }
  for (const row of matrices[i].filter(Boolean)) {
    const current = matrixByExit.get(row.source_id) || [];
    current.push({ ...row, exit });
    matrixByExit.set(row.source_id, current);
  }
}

for (const poi of candidates) {
  const allowed = new Set((nearByPoi.get(poi.source_id) || []).map((item) => item.exit.id));
  const routes = (matrixByExit.get(poi.source_id) || [])
    .filter((route) => allowed.has(route.exit_id))
    .sort((a, b) => a.metro_distance_m - b.metro_distance_m || a.metro_walk_min - b.metro_walk_min);
  const best = routes[0];
  if (best) {
    poi.metro_station = best.exit.name.split("地铁站")[0] + "地铁站";
    poi.metro_exit = best.exit.name.includes("地铁站") ? best.exit.name.split("地铁站").slice(1).join("地铁站") : best.exit.name;
    poi.metro_distance_m = best.metro_distance_m;
    poi.metro_walk_min = best.metro_walk_min;
    poi.metro_exit_poi_id = best.exit_id;
  } else {
    poi.metro_route_error = "no walking matrix route to candidate exits";
  }
  poi.location_note = String(poi.business_area || "").slice(0, store.LIMITS.location_note);
}

const enriched = {
  provider: "AMap Web Service",
  query_count: input.api_count,
  unique_candidates: candidates.length,
  campus_origin_gcj02: campus,
  nearby_exit_pois: exits,
  metro_exit_candidate_count: exitTotal,
  candidate_exit_union_count: exitIds.length,
  matrix_failures: matrixFailures,
  enriched_at: new Date().toISOString(),
  shops: candidates
};
const outputFile = path.join(outputDir, "shops-amap-enriched.json");
fs.writeFileSync(outputFile, JSON.stringify(enriched, null, 2) + "\n", "utf8");

const ready = candidates.filter((p) => !explicitlyClosed(p) && addressOK(p.address) && p.name.length <= store.LIMITS.name && p.type.length <= store.LIMITS.type && p.campus_distance_m && p.campus_walk_min && p.metro_station && p.metro_exit && p.metro_distance_m && p.metro_walk_min && !p.campus_route_error && !p.metro_route_error);
const reasonCounts = {};
for (const poi of candidates) {
  const reasons = [];
  if (explicitlyClosed(poi)) reasons.push("explicitly-closed");
  if (!addressOK(poi.address)) reasons.push("address");
  if (poi.name.length > store.LIMITS.name) reasons.push("name-too-long");
  if (!poi.campus_distance_m || !poi.campus_walk_min) reasons.push("campus-route");
  if (!poi.metro_station || !poi.metro_exit || !poi.metro_distance_m || !poi.metro_walk_min) reasons.push("metro-route");
  for (const reason of reasons) reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
}
console.log(JSON.stringify({
  source_pois: candidates.length,
  exits_returned: exitTotal,
  unique_exit_candidates: exits.length,
  exits_used_for_route_comparison: exitIds.length,
  ready_for_import: ready.length,
  unresolved: candidates.length - ready.length,
  unresolved_reasons: reasonCounts,
  output: "output/shops-amap-enriched.json"
}, null, 2));

if (process.argv.includes("--import")) {
  const db = new DatabaseSync(path.join(root, "data.db"));
  const imported = [];
  const skipped = [];
  let removedPreviousAmap = 0;
  try {
    db.exec("BEGIN IMMEDIATE");
    if (process.argv.includes("--replace-amap")) {
      removedPreviousAmap = Number(db.prepare("DELETE FROM shops WHERE created_by_name = ?").run("高德地图 POI").changes) || 0;
    }
    for (const poi of ready) {
      const existing = db.prepare("SELECT id FROM shops WHERE name = ?").get(poi.name);
      if (existing) { skipped.push({ name: poi.name, reason: "name already exists", existing_id: existing.id }); continue; }
      try {
        const shop = store.create(db, {
          name: poi.name,
          address: poi.address,
          location_note: poi.location_note,
          type: poi.type,
          lat: poi.location.lat,
          lng: poi.location.lng,
          campus_distance_m: poi.campus_distance_m,
          campus_walk_min: poi.campus_walk_min,
          metro_station: poi.metro_station,
          metro_exit: poi.metro_exit,
          metro_distance_m: poi.metro_distance_m,
          metro_walk_min: poi.metro_walk_min
        }, { id: null, username: "高德地图 POI" }, config);
        imported.push({ id: shop.id, name: shop.name, address: shop.address, type: shop.type });
      } catch (error) {
        skipped.push({ name: poi.name, reason: error.message || "validation error" });
      }
    }
    db.exec("COMMIT");
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch { /* ignored */ }
    throw error;
  } finally {
    db.close();
  }
  const report = { imported: imported.length, skipped: skipped.length, imported_shops: imported, skipped_shops: skipped };
  fs.writeFileSync(path.join(outputDir, "shops-amap-import-report.json"), JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(JSON.stringify({ import_complete: true, removed_previous_amap: removedPreviousAmap, imported: imported.length, skipped: skipped.length, report: "output/shops-amap-import-report.json" }, null, 2));
}
