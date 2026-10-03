/*
 * Collect restaurant POIs for all of Suzhou Gusu District from AMap.
 * Reads AMAP_SERVICE_KEY from .env on the server side; never logs or stores it.
 * Retrieves the official district boundary, saves it to shops-config.json,
 * queries small polygon tiles to avoid URL/result caps, then exact-filters by
 * the same district polygon used by the app geofence.
 * Run: node scripts/shops/collect-pois.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";

const require = createRequire(import.meta.url);
const store = require("../../lib/shops/store.js");
const root = process.cwd();
const configFile = path.join(root, "data", "shops-config.json");
const outputDir = path.join(root, "output");
const outputFile = path.join(outputDir, "shops-amap-candidates.json");
const tileCacheFile = path.join(outputDir, "shops-gusu-tile-cache.json");
const stepDeg = 0.03;
const splitAt = 520;
const maxSplitDepth = 5;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function envValue(name) {
  const line = fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/).find((value) => value.startsWith(name + "="));
  return line ? line.slice(name.length + 1).trim() : "";
}
const key = envValue("AMAP_SERVICE_KEY");
if (!key) throw new Error("AMAP_SERVICE_KEY missing in server .env");

async function getJson(endpoint, params, label) {
  const query = new URLSearchParams({ ...params, key });
  const url = "https://restapi.amap.com" + endpoint + "?" + query.toString();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
      const data = await response.json();
      if (data.status === "1") {
        await pause(160);
        return data;
      }
      const info = String(data.info || "AMap error");
      if (/QPS|LIMIT|NETWORK|TIMEOUT/i.test(info) && attempt < 3) {
        await pause(1200 * (attempt + 1));
        continue;
      }
      throw new Error(label + ": " + info + " (" + String(data.infocode || "") + ")");
    } catch (error) {
      if (attempt === 3) throw error;
      await pause(500 * (attempt + 1));
    }
  }
  throw new Error(label + ": request failed");
}

function polygonCentroid(points) {
  let area = 0, x = 0, y = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i], b = points[(i + 1) % points.length];
    const cross = a[1] * b[0] - b[1] * a[0];
    area += cross;
    x += (a[1] + b[1]) * cross;
    y += (a[0] + b[0]) * cross;
  }
  if (Math.abs(area) < 1e-12) return { lat: points.reduce((sum, p) => sum + p[0], 0) / points.length, lng: points.reduce((sum, p) => sum + p[1], 0) / points.length };
  return { lat: y / (3 * area), lng: x / (3 * area) };
}
function worldPixel(lat, lng, zoom) {
  const scale = 256 * Math.pow(2, zoom);
  const sin = Math.sin((lat * Math.PI) / 180);
  return { x: ((lng + 180) / 360) * scale, y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale };
}
function fitZoom(points, center) {
  for (let zoom = 16; zoom >= 8; zoom -= 1) {
    const c = worldPixel(center.lat, center.lng, zoom);
    const pixels = points.map((p) => worldPixel(p[0], p[1], zoom));
    const width = Math.max(...pixels.map((p) => p.x)) - Math.min(...pixels.map((p) => p.x));
    const height = Math.max(...pixels.map((p) => p.y)) - Math.min(...pixels.map((p) => p.y));
    if (width <= 690 && height <= 360) return zoom;
  }
  return 8;
}

// AMap administrative geometry is already GCJ-02. This exact geometry powers
// both the map overlay and server-side point-in-polygon validation.
const districtData = await getJson("/v3/config/district", {
  keywords: "姑苏区", subdistrict: "0", extensions: "all"
}, "Gusu district boundary");
const district = (districtData.districts || []).find((item) => item.adcode === "320508") || districtData.districts?.[0];
if (!district || !district.polyline) throw new Error("AMap did not return the Gusu boundary");
const parts = district.polyline.split("|").map((part) => part.split(";").filter(Boolean).map((pair) => pair.split(",").map(Number)));
const rawRing = parts.sort((a, b) => b.length - a.length)[0];
const polygon = rawRing.filter((point, index, list) => index === 0 || point[0] !== list[index - 1][0] || point[1] !== list[index - 1][1]).map((point) => [point[1], point[0]]);
if (polygon.length < 3) throw new Error("Invalid Gusu boundary geometry");
const center = polygonCentroid(polygon);
const zoom = fitZoom(polygon, center);
const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
config.center = { lat: center.lat, lng: center.lng, zoom };
config.area = {
  name: "苏州市姑苏区全域",
  text: "苏州市姑苏区全域（以高德行政区边界为准，含行政区边界沿街）",
  coordinate_system: "GCJ-02",
  source_coordinate_system: "AMap district adcode 320508",
  polygon
};
fs.writeFileSync(configFile, JSON.stringify(config, null, 2) + "\n", "utf8");
const boundaryHash = createHash("sha256").update(district.polyline).digest("hex");
let tileCache = {};
try {
  const cache = JSON.parse(fs.readFileSync(tileCacheFile, "utf8"));
  if (cache.boundary_hash === boundaryHash && cache.step_deg === stepDeg) tileCache = cache.tiles || {};
} catch { /* first run or invalidated cache */ }
function saveTileCache() {
  fs.writeFileSync(tileCacheFile, JSON.stringify({ boundary_hash: boundaryHash, step_deg: stepDeg, tiles: tileCache }) + "\n", "utf8");
}

const lats = polygon.map((p) => p[0]), lngs = polygon.map((p) => p[1]);
const minLat = Math.min(...lats), maxLat = Math.max(...lats);
const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
const poiMap = new Map();
let tileRequests = 0, pagesFetched = 0, splitTiles = 0;
function addPois(rows) {
  for (const poi of rows || []) {
    if (!poi.id || !poi.location) continue;
    const coords = String(poi.location).split(",").map(Number);
    if (coords.length < 2 || !isFinite(coords[0]) || !isFinite(coords[1])) continue;
    if (!store.insidePolygon(coords[1], coords[0], polygon)) continue;
    if (!poiMap.has(String(poi.id))) poiMap.set(String(poi.id), {
      id: String(poi.id), name: String(poi.name || "").trim(), type: String(poi.type || ""),
      typecode: String(poi.typecode || ""), address: String(poi.address || ""), location: poi.location,
      business_area: String(poi.business_area || ""), website: String(poi.website || ""),
      adname: String(poi.adname || "姑苏区"), adcode: String(poi.adcode || "320508")
    });
  }
}
function tileChildren(box) {
  const midLng = (box.minLng + box.maxLng) / 2, midLat = (box.minLat + box.maxLat) / 2;
  return [
    { minLng: box.minLng, minLat: box.minLat, maxLng: midLng, maxLat: midLat },
    { minLng: midLng, minLat: box.minLat, maxLng: box.maxLng, maxLat: midLat },
    { minLng: box.minLng, minLat: midLat, maxLng: midLng, maxLat: box.maxLat },
    { minLng: midLng, minLat: midLat, maxLng: box.maxLng, maxLat: box.maxLat }
  ];
}
async function queryTile(box, depth = 0) {
  const tileKey = [box.minLng, box.minLat, box.maxLng, box.maxLat].map((value) => Number(value).toFixed(6)).join(",");
  const cached = tileCache[tileKey];
  if (cached && Array.isArray(cached.rows)) { addPois(cached.rows); return; }
  if (cached && cached.split && depth < maxSplitDepth) {
    for (const child of tileChildren(box)) await queryTile(child, depth + 1);
    return;
  }
  tileRequests += 1;
  const polygonParam = [[box.minLng, box.minLat], [box.maxLng, box.minLat], [box.maxLng, box.maxLat], [box.minLng, box.maxLat]].map((p) => p.join(",")).join(";");
  const args = { polygon: polygonParam, keywords: "餐饮", types: "050000", offset: "25", extensions: "all" };
  const first = await getJson("/v3/place/polygon", { ...args, page: "1" }, "Gusu restaurant tile");
  const count = Number(first.count) || 0;
  if (count >= splitAt && depth < maxSplitDepth) {
    splitTiles += 1;
    tileCache[tileKey] = { split: true };
    saveTileCache();
    for (const child of tileChildren(box)) await queryTile(child, depth + 1);
    return;
  }
  const tilePois = [...(first.pois || [])];
  pagesFetched += 1;
  const pageCount = Math.ceil(count / 25);
  for (let page = 2; page <= pageCount; page += 1) {
    const result = await getJson("/v3/place/polygon", { ...args, page: String(page) }, "Gusu restaurant tile page " + page);
    pagesFetched += 1;
    tilePois.push(...(result.pois || []));
  }
  tileCache[tileKey] = { rows: tilePois };
  saveTileCache();
  addPois(tilePois);
}
const tilesX = Math.ceil((maxLng - minLng) / stepDeg), tilesY = Math.ceil((maxLat - minLat) / stepDeg);
for (let y = 0; y < tilesY; y += 1) for (let x = 0; x < tilesX; x += 1) await queryTile({
  minLng: minLng + x * stepDeg, maxLng: Math.min(maxLng, minLng + (x + 1) * stepDeg),
  minLat: minLat + y * stepDeg, maxLat: Math.min(maxLat, minLat + (y + 1) * stepDeg)
});
const pois = Array.from(poiMap.values()).filter((poi) => poi.name && poi.address).sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
fs.mkdirSync(outputDir, { recursive: true });
const snapshot = { source: "AMap district adcode 320508; tiled restaurant POI search", queried_at: new Date().toISOString(), district: { name: "姑苏区", adcode: "320508", center, zoom }, polygon_gcj02: polygon, grid_step_degrees: stepDeg, tile_requests: tileRequests, subdivided_tiles: splitTiles, pages_fetched: pagesFetched, fetched_unique: pois.length, pois };
fs.writeFileSync(outputFile, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
const categories = {};
for (const poi of pois) categories[poi.type] = (categories[poi.type] || 0) + 1;
console.log(JSON.stringify({ district: "姑苏区", adcode: "320508", boundary_vertices: polygon.length, map_zoom: zoom, tiles: tileRequests, subdivided_tiles: splitTiles, pages: pagesFetched, unique_restaurants: pois.length, categories, output: "output/shops-amap-candidates.json" }, null, 2));
