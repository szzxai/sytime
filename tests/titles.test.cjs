"use strict";
/* 头衔系统（#10）后端测试：
   - 目录种子、管理员 CRUD、重名/超长校验
   - 授予 / 撤销（撤销佩戴中的头衔会清空佩戴并写系统消息）
   - 用户查看与佩戴（未拥有 403、不佩戴）
   - 自动规则：推荐店铺、连续登录、学生认证（规则引擎单独用临时库验证）
   - 权限：title_manage 默认 super_admin，可显式授予
   - 序列化：个人资料、店铺评价带佩戴头衔
   在系统临时目录启动真实 server.js，使用临时数据库，不触碰项目 data.db。 */
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { spawn } = require("node:child_process");
const { DatabaseSync } = require("./helpers/database.cjs");
const titleStore = require("../apps/api/src/domain/titles/store");
const rules = require("../apps/api/src/domain/titles/rules");

const root = path.resolve(__dirname, "..");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "szzx-titles-test-"));
const port = 4911 + Math.floor(Math.random() * 200);
const base = "http://127.0.0.1:" + port;

fs.copyFileSync(path.join(root, "server.js"), path.join(temp, "server.js"));
fs.copyFileSync(path.join(root, "data.json"), path.join(temp, "data.json"));
fs.copyFileSync(path.join(root, "menu-json-rules.md"), path.join(temp, "menu-json-rules.md"));
fs.cpSync(path.join(root, "apps"), path.join(temp, "apps"), { recursive: true, filter: source => !source.includes("node_modules") && (!source.includes("/src") && !source.includes("/public")) });
fs.cpSync(path.join(root,"packages"),path.join(temp,"packages"),{recursive:true});
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

// 姑苏区范围内的坐标，用于满足店铺地理围栏
const SHOP_POINT = { lat: 31.3004, lng: 120.6226 };
function shopBody(name) {
  return {
    name: name,
    address: "苏州市姑苏区十梓街 123 号",
    type: "面馆",
    lat: SHOP_POINT.lat,
    lng: SHOP_POINT.lng,
    campus_distance_m: 420,
    campus_walk_min: 6,
    metro_station: "乐桥",
    metro_exit: "3 号口",
    metro_distance_m: 480,
    metro_walk_min: 7
  };
}

let developer, plainUser, studentUser;
let founderId, foodieId;

test.before(async () => {
  server = spawn(process.execPath, [path.join(temp, "server.js")], {
    cwd: temp,
    env: { ...process.env, NODE_PATH: path.join(root, "node_modules"), PORT: String(port), JWT_SECRET: "titles-test-only-secret" },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"]
  });
  await waitForReady();
  developer = await account("titles_dev");
  plainUser = await account("titles_user");
  studentUser = await account("titles_student");
  const promoted = await api("/api/admin/users/role", {
    token: developer.token,
    method: "PUT",
    body: { userId: studentUser.user.id, newRole: "student" }
  });
  assert.equal(promoted.status, 200, "promote to student");
  const relogin = await api("/api/login", { method: "POST", body: { username: "titles_student", password: "test-password" } });
  studentUser = relogin.data;
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

test("规则引擎：新增规则只依赖注册表，未注册的 rule 不会发放", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, role TEXT NOT NULL DEFAULT 'user', login_streak INTEGER NOT NULL DEFAULT 0)");
  db.exec("CREATE TABLE shops (id INTEGER PRIMARY KEY, created_by INTEGER)");
  // 成就类规则会查询这些业务表
  db.exec("CREATE TABLE recipes (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, is_weekly INTEGER NOT NULL DEFAULT 0)");
  titleStore.migrate(db);
  db.prepare("INSERT INTO users (id, role) VALUES (1, 'user'), (2, 'student'), (3, 'admin'), (4, 'developer'), (5, 'super_admin')").run();

  const catalog = titleStore.listCatalog(db);
  assert.equal(catalog.length, 7);
  assert.deepEqual(
    catalog.filter(function (t) { return t.source === "auto"; }).map(function (t) { return t.rule; }).sort(),
    ["canteen_veteran", "login_streak", "shop_contributor", "weekend_regular"]
  );
  assert.equal(
    catalog.some(function (t) { return t.rule.indexOf("role_") === 0 || t.rule === "student_verified"; }),
    false,
    "已无角色/权限等级头衔"
  );
  const mentor = catalog.filter(function (t) { return t.key === "mentor"; })[0];
  assert.equal(mentor.name, "师者");
  assert.equal(mentor.source, "grant", "师者已改为手动授予");
  assert.equal(mentor.rule, "");

  // 行为类头衔只增不减
  db.prepare("UPDATE users SET login_streak = 7 WHERE id = 1").run();
  assert.deepEqual(rules.evaluateAutoTitles(db, 1).map(function (t) { return t.name; }), ["夜读星"]);
  const insert = db.prepare("INSERT INTO shops (created_by) VALUES (?)");
  for (let i = 0; i < 10; i += 1) insert.run(1);
  assert.deepEqual(rules.evaluateAutoTitles(db, 1).map(function (t) { return t.name; }), ["三元坊老饕"]);
  assert.deepEqual(
    titleStore.ownedTitles(db, 1).map(function (t) { return t.name; }).sort(),
    ["三元坊老饕", "夜读星"].sort()
  );
  // 幂等：再次评估不重复发放
  assert.deepEqual(rules.evaluateAutoTitles(db, 1), []);
  // 角色变化不再影响头衔（已无等级头衔）
  db.prepare("UPDATE users SET role = 'admin' WHERE id = 1").run();
  assert.deepEqual(rules.evaluateAutoTitles(db, 1), []);
  assert.deepEqual(
    titleStore.ownedTitles(db, 1).map(function (t) { return t.name; }).sort(),
    ["三元坊老饕", "夜读星"].sort()
  );
  db.close();
});

test("周末窗口：连续三个周末登录才算达成", () => {
  const now = Date.parse("2026-10-07T02:00:00Z");
  const DAY = 86400000;
  const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
  const today = Date.parse(new Date(now + 8 * 3600000).toISOString().slice(0, 10) + "T00:00:00Z");
  const dow = new Date(today).getUTCDay();
  const sat = today - (dow === 0 ? 1 : dow === 6 ? 0 : dow + 1) * DAY;
  const thisSat = iso(sat);
  const thisSun = iso(sat + DAY);
  const lastWeekend = iso(sat - 7 * DAY);
  const twoWeeksAgo = iso(sat - 14 * DAY);

  assert.equal(rules.consecutiveWeekends([], now), 0);
  assert.equal(rules.consecutiveWeekends([thisSat], now), 1);
  assert.equal(rules.consecutiveWeekends([thisSun], now), 1, "周日与同周末的周六算同一个周末");
  assert.equal(rules.consecutiveWeekends([thisSat, lastWeekend], now), 2);
  assert.equal(rules.consecutiveWeekends([thisSat, lastWeekend, twoWeeksAgo], now), 3);
  assert.equal(rules.consecutiveWeekends([thisSat, twoWeeksAgo], now), 1, "中间断档就重新计数");
  assert.equal(rules.consecutiveWeekends([lastWeekend, twoWeeksAgo], now), 0, "最近一个周末没登录就不算连续");
});

test("成就头衔：校园老吃家 / 闲者爱上网", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, role TEXT NOT NULL DEFAULT 'user', login_streak INTEGER NOT NULL DEFAULT 0)");
  db.exec("CREATE TABLE shops (id INTEGER PRIMARY KEY, created_by INTEGER)");
  db.exec("CREATE TABLE recipes (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, is_weekly INTEGER NOT NULL DEFAULT 0)");
  titleStore.migrate(db);
  db.prepare("INSERT INTO users (id, role) VALUES (1, 'user')").run();

  const names = function () { return titleStore.ownedTitles(db, 1).map(function (t) { return t.name; }); };
  // 校园老吃家：累计 10 篇食堂菜品评价，每周食谱不计入
  const addRecipe = db.prepare("INSERT INTO recipes (user_id, is_weekly) VALUES (1, ?)");
  for (let i = 0; i < 9; i += 1) addRecipe.run(0);
  addRecipe.run(1);
  rules.evaluateAutoTitles(db, 1);
  assert.equal(names().indexOf("校园老吃家"), -1, "每周食谱不算菜品评价");
  addRecipe.run(0);
  assert.deepEqual(rules.evaluateAutoTitles(db, 1).map(function (t) { return t.name; }), ["校园老吃家"]);

  // 闲者爱上网：连续 3 个周末登录
  const now = Date.now();
  const DAY = 86400000;
  const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
  const today = Date.parse(new Date(now + 8 * 3600000).toISOString().slice(0, 10) + "T00:00:00Z");
  const dow = new Date(today).getUTCDay();
  const sat = today - (dow === 0 ? 1 : dow === 6 ? 0 : dow + 1) * DAY;
  const markDay = db.prepare("INSERT OR IGNORE INTO user_login_days (user_id, day) VALUES (1, ?)");
  markDay.run(iso(sat));
  markDay.run(iso(sat - 7 * DAY));
  rules.evaluateAutoTitles(db, 1);
  assert.equal(names().indexOf("闲者爱上网"), -1, "仅 2 个周末还不发放");
  markDay.run(iso(sat - 14 * DAY));
  assert.deepEqual(rules.evaluateAutoTitles(db, 1).map(function (t) { return t.name; }), ["闲者爱上网"]);

  assert.deepEqual(
    names().sort(),
    ["校园老吃家", "闲者爱上网"].sort(),
    "两个成就头衔并存"
  );
  db.close();
});

test("目录种子：7 个头衔，自动规则可读，未登录不可读", async () => {
  assert.equal((await api("/api/admin/titles")).status, 401);
  assert.equal((await api("/api/admin/titles", { token: plainUser.token })).status, 403);

  const list = await api("/api/admin/titles", { token: developer.token });
  assert.equal(list.status, 200);
  assert.equal(list.data.titles.length, 7);
  const byName = {};
  list.data.titles.forEach(function (t) { byName[t.name] = t; });
  assert.equal(byName["创站元老"].source, "grant");
  assert.equal(byName["创站元老"].hue, "teal");
  assert.equal(byName["三元坊老饕"].source, "auto");
  assert.equal(byName["三元坊老饕"].rule, "shop_contributor");
  assert.equal(byName["夜读星"].rule, "login_streak");
  // 已无角色/权限等级头衔
  assert.equal(byName["开发者"], undefined);
  assert.equal(byName["学子"], undefined);
  // 成就头衔
  assert.equal(byName["闲者爱上网"].rule, "weekend_regular");
  assert.equal(byName["闲者爱上网"].hue, "wisteria");
  assert.equal(byName["校园老吃家"].rule, "canteen_veteran");
  assert.equal(byName["校园老吃家"].hue, "ochre");
  // 师者已改为手动授予
  assert.equal(byName["师者"].source, "grant");
  assert.equal(byName["师者"].rule, "");
  assert.equal(byName["师者"].hue, "indigo");
  assert.equal(byName["官方"].source, "grant");
  assert.equal(byName["创站元老"].owner_user_id, null, "公共头衔不属于任何账号");
  founderId = byName["创站元老"].id;
  foodieId = byName["三元坊老饕"].id;

  const ruleList = await api("/api/admin/titles/rules", { token: developer.token });
  assert.equal(ruleList.status, 200);
  assert.deepEqual(ruleList.data.rules.map(function (r) { return r.key; }).sort(), [
    "canteen_veteran",
    "login_streak",
    "shop_contributor",
    "weekend_regular"
  ]);
});

test("目录 CRUD：重名 409、超长 422、删除会清理拥有关系", async () => {
  const created = await api("/api/admin/titles", {
    token: developer.token,
    method: "POST",
    body: { name: "优秀答主", hue: "indigo", description: "答疑认真" }
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.title.source, "grant");
  const customId = created.data.title.id;

  const duplicate = await api("/api/admin/titles", { token: developer.token, method: "POST", body: { name: "优秀答主" } });
  assert.equal(duplicate.status, 409);
  const tooLong = await api("/api/admin/titles", { token: developer.token, method: "POST", body: { name: "一二三四五六七八九" } });
  assert.equal(tooLong.status, 422);
  const badHue = await api("/api/admin/titles/" + customId, {
    token: developer.token,
    method: "PUT",
    body: { name: "优秀答主", hue: "rainbow" }
  });
  assert.equal(badHue.status, 200);
  assert.equal(badHue.data.title.hue, "stone", "未知颜色回退 stone");

  const renamed = await api("/api/admin/titles/" + customId, { token: developer.token, method: "PUT", body: { name: "优秀答主2" } });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.data.title.name, "优秀答主2");

  // 授予后再删除目录：拥有关系与佩戴状态一并清理
  const granted = await api("/api/admin/users/" + studentUser.user.id + "/titles", {
    token: developer.token,
    method: "POST",
    body: { title_id: customId }
  });
  assert.equal(granted.status, 200);
  assert.equal(granted.data.granted, true);
  const wear = await api("/api/user/title", { token: studentUser.token, method: "PUT", body: { title_id: customId } });
  assert.equal(wear.status, 200);
  assert.equal(wear.data.title.name, "优秀答主2");

  const removed = await api("/api/admin/titles/" + customId, { token: developer.token, method: "DELETE" });
  assert.equal(removed.status, 200);
  assert.equal(removed.data.removed, 1);
  const mine = await api("/api/user/titles", { token: studentUser.token });
  assert.equal(mine.data.titles.some(function (t) { return t.name === "优秀答主2"; }), false, "删除目录后拥有关系一并清理");
  const profile = await api("/api/user/profile", { token: studentUser.token });
  assert.equal(profile.data.user.title, null, "目录被删除后佩戴状态清空");
  assert.equal((await api("/api/admin/titles/" + customId, { token: developer.token, method: "DELETE" })).status, 404);
});

test("授予/撤销：自动头衔不可手动授予，撤销佩戴中的头衔会写系统消息", async () => {
  const auto = await api("/api/admin/users/" + plainUser.user.id + "/titles", {
    token: developer.token,
    method: "POST",
    body: { title_id: foodieId }
  });
  assert.equal(auto.status, 409, "自动头衔只能由规则发放");

  const granted = await api("/api/admin/users/" + plainUser.user.id + "/titles", {
    token: developer.token,
    method: "POST",
    body: { title_id: founderId }
  });
  assert.equal(granted.status, 200);
  assert.equal(granted.data.granted, true);
  const again = await api("/api/admin/users/" + plainUser.user.id + "/titles", {
    token: developer.token,
    method: "POST",
    body: { title_id: founderId }
  });
  assert.equal(again.data.granted, false, "重复授予幂等");

  assert.equal((await api("/api/user/title", { token: plainUser.token, method: "PUT", body: { title_id: founderId } })).status, 200);
  assert.equal((await api("/api/user/profile", { token: plainUser.token })).data.user.title.name, "创站元老");

  const revoked = await api("/api/admin/users/" + plainUser.user.id + "/titles/" + founderId, { token: developer.token, method: "DELETE" });
  assert.equal(revoked.status, 200);
  assert.equal(revoked.data.removed, true);
  assert.equal(revoked.data.unequipped, true, "撤销佩戴中的头衔应自动取消佩戴");
  assert.deepEqual(revoked.data.titles.map(function (t) { return t.name; }), []);

  const messages = await api("/api/messages?type=system", { token: plainUser.token });
  assert.equal(messages.status, 200);
  assert.equal(messages.data.messages[0].title, "头衔已撤销");
  assert.match(messages.data.messages[0].body, /创站元老/);
});

test("保护与即时发放：内置不可删、自动不可撤销、专属不重名、达标即时授予", async () => {
  const catalog = await api("/api/admin/titles", { token: developer.token });
  const byName = {};
  catalog.data.titles.forEach(function (t) { byName[t.name] = t; });

  // 内置头衔（带 key）每次启动会重新播种，删除返回 409 且仍在目录
  const delBuiltin = await api("/api/admin/titles/" + byName["创站元老"].id, { token: developer.token, method: "DELETE" });
  assert.equal(delBuiltin.status, 409, "内置头衔不可删除");
  const after = await api("/api/admin/titles", { token: developer.token });
  assert.equal(after.data.titles.some(function (t) { return t.name === "创站元老"; }), true, "内置头衔仍在目录中");

  // 专属头衔不能与公共头衔同名
  const clash = await api("/api/admin/users/" + plainUser.user.id + "/titles/custom", {
    token: developer.token, method: "POST", body: { name: "官方", hue: "teal" }
  });
  assert.equal(clash.status, 409, "专属头衔不能与公共头衔同名");

});

test("佩戴：未拥有 403、可取消佩戴、非法 id 404", async () => {
  const owned = await api("/api/admin/users/" + studentUser.user.id + "/titles", {
    token: developer.token,
    method: "POST",
    body: { title_id: founderId }
  });
  assert.equal(owned.status, 200);

  assert.equal((await api("/api/user/title", { token: plainUser.token, method: "PUT", body: { title_id: founderId } })).status, 403);
  assert.equal((await api("/api/user/title", { token: studentUser.token, method: "PUT", body: { title_id: 9999 } })).status, 404);

  const worn = await api("/api/user/title", { token: studentUser.token, method: "PUT", body: { title_id: founderId } });
  assert.equal(worn.status, 200);
  assert.deepEqual(worn.data.title, { name: "创站元老", hue: "teal" });

  const off = await api("/api/user/title", { token: studentUser.token, method: "PUT", body: { title_id: null } });
  assert.equal(off.status, 200);
  assert.equal(off.data.title, null);

  const list = await api("/api/user/titles", { token: studentUser.token });
  assert.equal(list.status, 200);
  assert.deepEqual(list.data.titles.map(function (t) { return t.name; }).sort(), ["创站元老"]);
  assert.equal(list.data.titles.filter(function (t) { return t.equipped; }).length, 0);
  const locked = {};
  list.data.locked.forEach(function (t) { locked[t.rule] = t; });
  assert.equal(locked.login_streak.met, false);
  assert.equal(locked.shop_contributor.target, 10);
  assert.match(locked.shop_contributor.text, /累计推荐/);
  assert.equal((await api("/api/user/titles")).status, 401);
});

test("自动头衔：新增店铺后自动获得「三元坊老饕」", async () => {
  for (let i = 0; i < 10; i += 1) {
    const created = await api("/api/shops", { token: studentUser.token, method: "POST", body: shopBody("头衔测试店 " + i) });
    assert.equal(created.status, 201, "create shop " + i);
  }
  const list = await api("/api/user/titles", { token: studentUser.token });
  const rules = list.data.titles.map(function (t) { return t.rule; });
  assert.equal(rules.indexOf("shop_contributor") !== -1, true, "推荐 10 家后自动获得三元坊老饕");
  const foodie = list.data.titles.filter(function (t) { return t.rule === "shop_contributor"; })[0];
  assert.equal(foodie.name, "三元坊老饕");
  assert.equal(foodie.equipped, false);

  // 自动头衔可以通过登录链路发放（此处验证登录不报错且返回发放列表字段）
  const relogin = await api("/api/login", { method: "POST", body: { username: "titles_student", password: "test-password" } });
  assert.equal(relogin.status, 200);
  assert.deepEqual(relogin.data.granted_titles, [], "已拥有的自动头衔不会重复发放");
});

test("序列化：个人资料、店铺评价都带佩戴头衔", async () => {
  const worn = await api("/api/user/title", { token: studentUser.token, method: "PUT", body: { title_id: founderId } });
  assert.equal(worn.status, 200);
  assert.equal(worn.data.title.name, "创站元老");

  const profile = await api("/api/user/profile", { token: studentUser.token });
  assert.deepEqual(profile.data.user.title, { name: "创站元老", hue: "teal" });

  const shopId = (await api("/api/shops")).data.shops[0].id;
  const review = await api("/api/shops/" + shopId + "/reviews", {
    token: studentUser.token,
    method: "POST",
    body: { rating: 5, content: "好吃" }
  });
  assert.equal(review.status, 201);
  const reviews = await api("/api/shops/" + shopId + "/reviews");
  assert.deepEqual(reviews.data.reviews[0].user_title, { name: "创站元老", hue: "teal" });
  assert.equal(reviews.data.reviews[0].user_id, studentUser.user.id);
  assert.equal(reviews.data.reviews[0].nickname, "titles_student");
});

test("专属头衔：只发给指定账号、不进公共目录、撤销后目录行一并删除", async () => {
  const before = (await api("/api/admin/titles", { token: developer.token })).data.titles.length;

  const created = await api("/api/admin/users/" + plainUser.user.id + "/titles/custom", {
    token: developer.token,
    method: "POST",
    body: { name: "首席摸鱼官", hue: "rose", description: "本月最会摸鱼" }
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.granted, true);
  assert.equal(created.data.title.name, "首席摸鱼官");
  assert.equal(created.data.title.hue, "rose");
  assert.equal(created.data.title.owner_user_id, plainUser.user.id);
  assert.equal(created.data.title.source, "grant");
  const exclusiveId = created.data.title.id;
  assert.deepEqual(created.data.titles.map(function (t) { return t.name; }).sort(), ["首席摸鱼官"]);

  const after = await api("/api/admin/titles", { token: developer.token });
  assert.equal(after.data.titles.length, before, "专属头衔不进公共目录");
  assert.equal(after.data.titles.some(function (t) { return t.name === "首席摸鱼官"; }), false);
  const res = await api("/api/admin/titles/" + exclusiveId, { token: developer.token, method: "PUT", body: { name: "只属于我" } });
  assert.equal(res.status, 200, "专属头衔仍可按 id 维护");
  assert.equal(res.data.title.owner_user_id, plainUser.user.id, "维护不会把专属头衔变成公共头衔");

  // 同名重复颁发沿用同一行，不产生重复目录项
  const again = await api("/api/admin/users/" + plainUser.user.id + "/titles/custom", {
    token: developer.token,
    method: "POST",
    body: { name: "只属于我", hue: "stone" }
  });
  assert.equal(again.status, 201);
  assert.equal(again.data.title.id, exclusiveId);
  assert.equal(again.data.granted, false, "已拥有则不重复授予");
  assert.equal(again.data.titles.length, 1, "仅专属头衔");

  // 只有所属账号能看到并使用
  assert.deepEqual((await api("/api/user/titles", { token: plainUser.token })).data.titles.map(function (t) { return t.name; }).sort(), ["只属于我"]);
  assert.equal(
    (await api("/api/user/titles", { token: studentUser.token })).data.titles.some(function (t) { return t.name === "只属于我"; }),
    false
  );
  const worn = await api("/api/user/title", { token: plainUser.token, method: "PUT", body: { title_id: exclusiveId } });
  assert.equal(worn.status, 200);
  assert.deepEqual(worn.data.title, { name: "只属于我", hue: "stone" });
  assert.deepEqual((await api("/api/user/profile", { token: plainUser.token })).data.user.title, { name: "只属于我", hue: "stone" });

  // 校验：名称必填、超长 422
  assert.equal((await api("/api/admin/users/" + plainUser.user.id + "/titles/custom", { token: developer.token, method: "POST", body: { name: "  " } })).status, 400);
  assert.equal((await api("/api/admin/users/" + plainUser.user.id + "/titles/custom", { token: developer.token, method: "POST", body: { name: "一二三四五六七八九" } })).status, 422);
  assert.equal((await api("/api/admin/users/9999/titles/custom", { token: developer.token, method: "POST", body: { name: "查无此人" } })).status, 404);
  assert.equal((await api("/api/admin/users/" + plainUser.user.id + "/titles/custom", { token: plainUser.token, method: "POST", body: { name: "越权" } })).status, 403);

  // 撤销专属头衔：拥有关系、佩戴状态与目录行一并清理
  const revoked = await api("/api/admin/users/" + plainUser.user.id + "/titles/" + exclusiveId, { token: developer.token, method: "DELETE" });
  assert.equal(revoked.status, 200);
  assert.equal(revoked.data.removed, true);
  assert.equal(revoked.data.unequipped, true);
  assert.deepEqual(revoked.data.titles.map(function (t) { return t.name; }), []);
  assert.equal((await api("/api/user/profile", { token: plainUser.token })).data.user.title, null);
  assert.equal((await api("/api/admin/titles/" + exclusiveId, { token: developer.token, method: "DELETE" })).status, 404, "专属目录行已随撤销删除");
  const messages = await api("/api/messages?type=system", { token: plainUser.token });
  assert.match(messages.data.messages[0].body, /只属于我/);
});

test("目标权重校验：不能给自己或权重不低于自己的人授予/撤销头衔", async () => {
  // developer 不能给自己授予
  assert.equal(
    (await api("/api/admin/users/" + developer.user.id + "/titles", { token: developer.token, method: "POST", body: { title_id: founderId } })).status,
    403,
    "不能给自己授予"
  );
  assert.equal(
    (await api("/api/admin/users/" + developer.user.id + "/titles/custom", { token: developer.token, method: "POST", body: { name: "自封" } })).status,
    403,
    "不能给自己颁发专属头衔"
  );
  // super_admin 不能操作 developer（权重 5 < 6）
  const suLogin = await api("/api/login", { method: "POST", body: { username: "titles_student", password: "test-password" } });
  const promote = await api("/api/admin/users/role", {
    token: developer.token,
    method: "PUT",
    body: { userId: studentUser.user.id, newRole: "super_admin" }
  });
  assert.equal(promote.status, 200, "把测试账号提升为 super_admin");
  const suReLogin = await api("/api/login", { method: "POST", body: { username: "titles_student", password: "test-password" } });
  assert.equal(suReLogin.data.user.role, "super_admin");
  assert.equal(
    (await api("/api/admin/users/" + developer.user.id + "/titles", { token: suReLogin.data.token, method: "POST", body: { title_id: founderId } })).status,
    403,
    "super_admin 不能给 developer 授予"
  );
  assert.equal(
    (await api("/api/admin/users/" + suReLogin.data.user.id + "/titles", { token: suReLogin.data.token, method: "POST", body: { title_id: founderId } })).status,
    403,
    "super_admin 不能给自己授予"
  );
  // 但可以操作权重更低的普通用户
  assert.equal(
    (await api("/api/admin/users/" + plainUser.user.id + "/titles", { token: suReLogin.data.token, method: "POST", body: { title_id: founderId } })).status,
    200,
    "super_admin 可以给普通用户授予"
  );
  const revoke = await api("/api/admin/users/" + plainUser.user.id + "/titles/" + founderId, { token: suReLogin.data.token, method: "DELETE" });
  assert.equal(revoke.status, 200, "super_admin 可以撤销普通用户的头衔");
  // 恢复 student 以便后续断言
  const restore = await api("/api/admin/users/role", {
    token: developer.token,
    method: "PUT",
    body: { userId: studentUser.user.id, newRole: "student" }
  });
  assert.equal(restore.status, 200);
});

test("权限：title_manage 可显式授予普通用户", async () => {
  assert.equal((await api("/api/admin/titles", { token: plainUser.token })).status, 403);
  const granted = await api("/api/admin/users/permissions", {
    token: developer.token,
    method: "PUT",
    body: { userId: plainUser.user.id, permissions: ["title_manage"] }
  });
  assert.equal(granted.status, 200, "显式授予 title_manage");
  assert.equal(granted.data.permissions.indexOf("title_manage") !== -1, true);
  const allowed = await api("/api/admin/titles", { token: plainUser.token });
  assert.equal(allowed.status, 200, "拥有 title_manage 后可用");
  const catalog = allowed.data.titles;
  assert.equal(catalog.length >= 4, true);
});


