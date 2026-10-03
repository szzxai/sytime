"use strict";
/* 三元坊必吃榜（#6）后端测试：
   - 校验规则（地址格式、距离/步行范围、自定义类型）
   - 权限（未登录 401、普通用户 403、达到最低角色 201、后端强校验）
   - 列表筛选/排序、详情、重复名称 409
   在系统临时目录启动真实 server.js，使用临时数据库，不触碰项目 data.db。 */
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { spawn } = require("node:child_process");
const { DatabaseSync } = require("node:sqlite");
const shopStore = require("../lib/shops/store");

const root = path.resolve(__dirname, "..");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "szzx-shops-test-"));
const port = 4611 + Math.floor(Math.random() * 200);
const base = "http://127.0.0.1:" + port;

fs.copyFileSync(path.join(root, "server.js"), path.join(temp, "server.js"));
fs.copyFileSync(path.join(root, "data.json"), path.join(temp, "data.json"));
fs.copyFileSync(path.join(root, "menu-json-rules.md"), path.join(temp, "menu-json-rules.md"));
fs.cpSync(path.join(root, "lib"), path.join(temp, "lib"), { recursive: true });
fs.cpSync(path.join(root, "data"), path.join(temp, "data"), { recursive: true });

let server = null;
let log = "";

function waitForReady() {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("server start timeout\n" + log)), 30000);
    function scan(chunk) {
      log += chunk;
      if (/Campus map running/.test(log)) {
        clearTimeout(timer);
        resolve();
      }
    }
    server.stdout.on("data", scan);
    server.stderr.on("data", scan);
  });
}

async function api(url, { token, method = "GET", body } = {}) {
  const response = await fetch(base + url, {
    method,
    headers: {
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: response.status, data: await response.json() };
}

async function account(username) {
  await api("/api/register", { method: "POST", body: { username, nickname: username, password: "test-password" } });
  const login = await api("/api/login", { method: "POST", body: { username, password: "test-password" } });
  assert.equal(login.status, 200, "login " + username);
  return login.data;
}

test("已配置覆盖区域多边形后端限制上传坐标（边界点允许）", () => {
  const polygon = [[31.3, 120.61], [31.31, 120.61], [31.31, 120.63], [31.3, 120.63]];
  assert.equal(shopStore.insidePolygon(31.3065, 120.6221, polygon), true);
  assert.equal(shopStore.insidePolygon(31.32, 120.6221, polygon), false);
  assert.equal(shopStore.insidePolygon(31.3, 120.6221, polygon), true);
  assert.throws(() => shopStore.validate({
    name: "区域外店铺", address: "十梓街 1 号", type: "面馆", lat: 31.32, lng: 120.6221,
    campus_distance_m: 100, campus_walk_min: 2,
    metro_station: "乐桥", metro_exit: "1 号口", metro_distance_m: 100, metro_walk_min: 2
  }, polygon), (error) => error.status === 422 && /不在苏州市姑苏区行政范围内/.test(error.fields.lat));
});

const SHOP = {
  name: "老王面馆",
  address: "苏州市姑苏区十梓街 123 号",
  location_note: "路口第二家",
  type: "面馆",
  lat: 31.3004,
  lng: 120.6226,
  campus_distance_m: 420,
  campus_walk_min: 6,
  metro_station: "乐桥",
  dianping_url: "https://www.dianping.com/shop/test-shop",
  metro_exit: "3 号口",
  metro_distance_m: 480,
  metro_walk_min: 7
};

let developer, plainUser, studentUser, staleStudentToken, createdShopId;

test.before(async () => {
  server = spawn(process.execPath, [path.join(temp, "server.js")], {
    cwd: temp,
    env: { ...process.env, NODE_PATH: path.join(root, "node_modules"), PORT: String(port), JWT_SECRET: "shops-test-only-secret" },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"]
  });
  await waitForReady();
  developer = await account("shops_dev");
  plainUser = await account("shops_user");
  studentUser = await account("shops_student");
  staleStudentToken = studentUser.token;
  // developer 把第三个账号提升为学生，用于验证「达到最低角色即可上传」
  const promoted = await api("/api/admin/users/role", { token: developer.token, method: "PUT", body: { userId: studentUser.user.id, newRole: "student" } });
  assert.equal(promoted.status, 200, "promote to student");
  // JWT 里带的是登录时的角色，改角色后需要重新登录（与后台管理流程一致）
  const relogin = await api("/api/login", { method: "POST", body: { username: "shops_student", password: "test-password" } });
  studentUser = relogin.data;
  assert.equal(studentUser.user.role, "student");
});

test.after(async () => {
  if (server) {
    const exited = new Promise((resolve) => server.once("exit", resolve));
    server.kill();
    await exited;
  }
  assert.equal(path.dirname(fs.realpathSync(temp)).toLowerCase(), fs.realpathSync(os.tmpdir()).toLowerCase());
  try {
    fs.rmSync(temp, { recursive: true, force: true });
  } catch (err) {
    /* Windows 下数据库句柄可能稍后释放，临时目录可留给系统清理 */
  }
});

test("首个注册账号是 developer，普通注册账号是 user", () => {
  assert.equal(developer.user.role, "developer");
  assert.equal(plainUser.user.role, "user");
});

test("公开读取：空列表与 meta 的基本内容", async () => {
  const list = await api("/api/shops");
  assert.equal(list.status, 200);
  assert.deepEqual(list.data.shops, []);
  assert.equal(list.data.total, 0);
  assert.equal(list.data.can_create, false);
  assert.equal(list.data.create_min_role, "student");
  assert.ok(list.data.types.presets.includes("面馆"));
  assert.equal(list.data.area.text.includes("姑苏区"), true);

  const meta = await api("/api/shops/meta");
  assert.equal(meta.status, 200);
  assert.equal(meta.data.map.key_configured, false);
  assert.equal(meta.data.map.static_map_configured, false);
  assert.equal(Object.prototype.hasOwnProperty.call(meta.data.map, "service_key"), false, "server-only map key must never be returned");
  assert.equal((await api("/api/shops/map-image")).status, 503);
  assert.equal((await api("/api/shops/map-image?lat=31.317748&lng=120.597977&zoom=19")).status, 400);
  assert.equal((await api("/api/shops/map-image?lat=35&lng=120.6&zoom=11")).status, 400);
  assert.equal((await api("/api/shops/map-image?lat=31.317748&zoom=11")).status, 400);
  assert.deepEqual(meta.data.map.center, { lat: 31.317748450024663, lng: 120.59797697782813, zoom: 11 });
  assert.equal(meta.data.map.anchors.length, 1);
  assert.equal(meta.data.map.anchors[0].key, "campus");
  assert.equal(meta.data.map.anchors[0].configured, true);
  assert.equal(meta.data.map.area.polygon.length, 323);
  assert.equal(meta.data.map.area.coordinate_system, "GCJ-02");
});

test("上传权限：未登录 401，普通用户 403，学生 201（前端隐藏按钮之外后端仍校验）", async () => {
  const anonymous = await api("/api/shops", { method: "POST", body: SHOP });
  assert.equal(anonymous.status, 401);

  const denied = await api("/api/shops", { token: plainUser.token, method: "POST", body: SHOP });
  assert.equal(denied.status, 403);

  const metaAsUser = await api("/api/shops/meta", { token: plainUser.token });
  assert.equal(metaAsUser.data.can_create, false);
  const metaAsStudent = await api("/api/shops/meta", { token: studentUser.token });
  assert.equal(metaAsStudent.data.can_create, true, "student 及以上可见上传入口");
  // 角色在 JWT 签发后提升，后端按数据库中的当前角色授权。
  const ok = await api("/api/shops", { token: staleStudentToken, method: "POST", body: SHOP });
  assert.equal(ok.status, 201);
  assert.equal(ok.data.shop.name, SHOP.name);
  assert.equal(ok.data.shop.metro_station, "乐桥");
  assert.equal(ok.data.shop.metro_exit, "3 号口");
  assert.equal(ok.data.shop.campus_distance_m, 420);
  assert.equal(ok.data.shop.campus_walk_min, 6);
  assert.equal(ok.data.shop.dianping_url, "https://www.dianping.com/shop/test-shop");
  createdShopId = ok.data.shop.id;
});

test("学生及以上可点赞和评价；评分计数、平均分与更新正确", async () => {
  assert.equal((await api("/api/shops/" + createdShopId + "/like", { method: "POST", body: {} })).status, 401);
  assert.equal((await api("/api/shops/" + createdShopId + "/like", { token: plainUser.token, method: "POST", body: {} })).status, 403);
  assert.equal((await api("/api/shops/" + createdShopId + "/reviews", { token: plainUser.token, method: "POST", body: { rating: 5, content: "普通用户不能评价" } })).status, 403);
  const devLike = await api("/api/shops/" + createdShopId + "/like", { token: developer.token, method: "POST", body: {} });
  assert.equal(devLike.status, 200, "学生及以上的 developer 角色可点赞/评价");
  assert.equal(devLike.data.liked, true);
  const devUnlike = await api("/api/shops/" + createdShopId + "/like", { token: developer.token, method: "POST", body: {} });
  assert.equal(devUnlike.data.liked, false);

  const liked = await api("/api/shops/" + createdShopId + "/like", { token: studentUser.token, method: "POST", body: {} });
  assert.equal(liked.status, 200);
  assert.equal(liked.data.liked, true);
  assert.equal(liked.data.shop.likes_count, 1);
  const unliked = await api("/api/shops/" + createdShopId + "/like", { token: studentUser.token, method: "POST", body: {} });
  assert.equal(unliked.data.liked, false);
  const likedAgain = await api("/api/shops/" + createdShopId + "/like", { token: studentUser.token, method: "POST", body: {} });
  assert.equal(likedAgain.data.shop.likes_count, 1);

  assert.equal((await api("/api/shops/" + createdShopId + "/reviews", { token: studentUser.token, method: "POST", body: { rating: 0 } })).status, 422);
  assert.equal((await api("/api/shops/" + createdShopId + "/reviews", { token: studentUser.token, method: "POST", body: { rating: 6 } })).status, 422);
  const review = await api("/api/shops/" + createdShopId + "/reviews", { token: studentUser.token, method: "POST", body: { rating: 5, content: "汤头不错" } });
  assert.equal(review.status, 201);
  assert.equal(review.data.shop.reviews_count, 1);
  assert.equal(review.data.shop.ratings_count, 1);
  assert.equal(review.data.shop.rating_avg, 5);
  const updated = await api("/api/shops/" + createdShopId + "/reviews", { token: studentUser.token, method: "POST", body: { rating: 4, content: "复评，仍然不错" } });
  assert.equal(updated.status, 200);
  assert.equal(updated.data.shop.reviews_count, 1, "每位认证学生一店一条评价，可更新而非重复累加");
  assert.equal(updated.data.shop.rating_avg, 4);

  const publicReviews = await api("/api/shops/" + createdShopId + "/reviews");
  assert.equal(publicReviews.status, 200);
  assert.equal(publicReviews.data.reviews.length, 1);
  assert.equal(publicReviews.data.reviews[0].rating, 4);
  assert.equal(publicReviews.data.reviews[0].author, "shops_student");
  assert.equal(publicReviews.data.my_review, null, "访客不读取个人评价标记");
});

test("地址必须包含道路/巷坊名和门牌号，其余字段范围校验返回 422", async () => {
  const cases = [
    [{ address: "十梓街 123" }, "address"],
    [{ address: "123 号" }, "address"],
    [{ name: "" }, "name"],
    [{ type: "" }, "type"],
    [{ campus_distance_m: 0 }, "campus_distance_m"],
    [{ campus_walk_min: 999 }, "campus_walk_min"],
    [{ metro_distance_m: 2.5 }, "metro_distance_m"],
    [{ metro_station: "" }, "metro_station"],
    [{ metro_exit: "" }, "metro_exit"],
    [{ dianping_url: "https://not-dianping.example/shop/123" }, "dianping_url"],
    [{ lat: 0 }, "lat"]
  ];
  for (const [patch, field] of cases) {
    const body = { ...SHOP, name: "校验用例" + field, ...patch };
    const r = await api("/api/shops", { token: studentUser.token, method: "POST", body });
    assert.equal(r.status, 422, JSON.stringify(patch));
    assert.ok(r.data.fields && r.data.fields[field], "应返回字段错误 " + field);
  }
  // 十梓街/凤凰街这类「街」结尾的地址合法
  const streetOk = await api("/api/shops", { token: studentUser.token, method: "POST", body: { ...SHOP, name: "凤凰街小笼", address: "凤凰街 88 号" } });
  assert.equal(streetOk.status, 201);
  const fangOk = await api("/api/shops", { token: studentUser.token, method: "POST", body: { ...SHOP, name: "滚绣坊小馆", address: "滚绣坊 51 号" } });
  assert.equal(fangOk.status, 201, "苏州本地巷坊地址可按高德逆地理结果保存");
});

test("自定义类型可保存并原样返回", async () => {
  const r = await api("/api/shops", { token: studentUser.token, method: "POST", body: { ...SHOP, name: "青石巷小店", address: "新市路 5 号", type: "卤味" } });
  assert.equal(r.status, 201);
  assert.equal(r.data.shop.type, "卤味");
  const detail = await api("/api/shops/" + r.data.shop.id);
  assert.equal(detail.data.shop.type, "卤味");
  const list = await api("/api/shops");
  assert.equal(list.data.types.all.includes("卤味"), true, "自定义类型进入筛选项");
});

test("同名店铺返回 409，并带 existing_id", async () => {
  const r = await api("/api/shops", { token: studentUser.token, method: "POST", body: { ...SHOP, type: "小吃" } });
  assert.equal(r.status, 409);
  assert.equal(r.data.message, "已有同名店铺");
  assert.equal(r.data.existing_id, createdShopId);
});

test("列表支持类型筛选、校区距离/地铁距离/最新排序", async () => {
  const all = await api("/api/shops");
  assert.equal(all.data.total >= 3, true);

  const noodle = await api("/api/shops?type=" + encodeURIComponent("面馆"));
  const expectedNoodles = all.data.shops.filter((s) => s.type === "面馆").length;
  assert.equal(noodle.data.shops.length, expectedNoodles);
  assert.equal(noodle.data.shops.every((s) => s.type === "面馆"), true);

  const empty = await api("/api/shops?type=" + encodeURIComponent("不存在的类型"));
  assert.equal(empty.data.shops.length, 0);

  const search = await api("/api/shops?q=" + encodeURIComponent("老王面馆"));
  assert.equal(search.data.shops.length, 1);
  assert.equal(search.data.shops[0].name, SHOP.name);
  const roadSearch = await api("/api/shops?q=" + encodeURIComponent("十梓街"));
  assert.equal(roadSearch.data.shops.every((s) => s.address.includes("十梓街")), true);
  const ranged = await api("/api/shops?distance_min_m=400&distance_max_m=450&walk_min=5&walk_max=7");
  assert.equal(ranged.data.shops.length >= 1, true);
  assert.equal(ranged.data.shops.every((s) => s.campus_distance_m >= 400 && s.campus_distance_m <= 450 && s.campus_walk_min >= 5 && s.campus_walk_min <= 7), true);

  const campus = await api("/api/shops?sort=campus");
  const campusMeters = campus.data.shops.map((s) => s.campus_distance_m);
  assert.deepEqual(campusMeters, [...campusMeters].sort((a, b) => a - b));
  const legacyCampus = await api("/api/shops?sort=north");
  assert.equal(legacyCampus.data.sort, "campus");

  const metro = await api("/api/shops?sort=metro");
  const metroMeters = metro.data.shops.map((s) => s.metro_distance_m);
  assert.deepEqual(metroMeters, [...metroMeters].sort((a, b) => a - b));

  const byLikes = await api("/api/shops?sort=likes");
  assert.equal(byLikes.data.shops[0].id, createdShopId);
  const byReviews = await api("/api/shops?sort=reviews");
  assert.equal(byReviews.data.shops[0].id, createdShopId);
  const byRating = await api("/api/shops?sort=rating");
  assert.equal(byRating.data.shops[0].id, createdShopId);
  const likesFiltered = await api("/api/shops?likes_min=1");
  assert.equal(likesFiltered.data.shops.every((s) => s.likes_count >= 1), true);
  const reviewsFiltered = await api("/api/shops?reviews_min=1");
  assert.equal(reviewsFiltered.data.shops.every((s) => s.reviews_count >= 1), true);
  const ratingFiltered = await api("/api/shops?rating_min=4&rating_max=4");
  assert.equal(ratingFiltered.data.shops.length, 1);
  assert.equal(ratingFiltered.data.shops[0].rating_avg, 4);

  const newest = await api("/api/shops?sort=new");
  assert.equal(newest.data.shops[0].id >= newest.data.shops[newest.data.shops.length - 1].id, true);
  // 非法排序回退默认（距北门最近）
  const fallback = await api("/api/shops?sort=rank");
  assert.equal(fallback.data.sort, "campus");
});

test("详情：合法 id 返回，非法 id 与不存在的 id 返回 404", async () => {
  const ok = await api("/api/shops/" + createdShopId);
  assert.equal(ok.status, 200);
  assert.equal(ok.data.shop.id, createdShopId);
  assert.equal(ok.data.shop.created_by, "shops_student");

  assert.equal((await api("/api/shops/abc")).status, 404);
  assert.equal((await api("/api/shops/999999")).status, 404);
  assert.equal((await api("/api/shops/abc")).data.message, "店铺不存在或已被删除");
});

test("店铺数据落在 shops 表，字段与接口一致", () => {
  const db = new DatabaseSync(path.join(temp, "data.db"), { readOnly: true });
  const row = db.prepare("SELECT * FROM shops WHERE id = ?").get(createdShopId);
  db.close();
  assert.equal(row.name, SHOP.name);
  assert.equal(row.address, SHOP.address);
  assert.equal(row.campus_distance_m, 420);
  assert.equal(row.campus_walk_min, 6);
  assert.equal(row.metro_walk_min, 7);
  assert.equal(row.lat, SHOP.lat);
});

test("显式授权：普通用户被单独授予 shop_create 后可以上传", async () => {
  const grant = await api("/api/admin/users/permissions", {
    token: developer.token,
    method: "PUT",
    body: { userId: plainUser.user.id, permissions: ["shop_create"] }
  });
  assert.equal(grant.status, 200);
  const meta = await api("/api/shops/meta", { token: plainUser.token });
  assert.equal(meta.data.can_create, true);
  const created = await api("/api/shops", { token: plainUser.token, method: "POST", body: { ...SHOP, name: "授权小店", address: "司前街 12 号" } });
  assert.equal(created.status, 201);
});

test("用户角色降级后，旧 student JWT 立即失去店铺创建权限", async () => {
  const demoted = await api("/api/admin/users/role", {
    token: developer.token,
    method: "PUT",
    body: { userId: studentUser.user.id, newRole: "user" }
  });
  assert.equal(demoted.status, 200);
  const staleRole = await api("/api/shops/meta", { token: studentUser.token });
  assert.equal(staleRole.data.can_create, false);
  const denied = await api("/api/shops", { token: studentUser.token, method: "POST", body: { ...SHOP, name: "降级后无权店" } });
  assert.equal(denied.status, 403);
});
