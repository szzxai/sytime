"use strict";
/* 头衔系统（#10）后端测试：
   - 目录种子、管理员 CRUD、重名/超长校验
   - 授予 / 撤销（撤销佩戴中的头衔会清空佩戴并写系统消息）
   - 用户查看与佩戴（未拥有 403、不佩戴）
   - 自动规则：推荐店铺、连续登录、学生认证（规则引擎单独用临时库验证）
   - 权限：title_manage 默认 super_admin，可显式授予
   - 序列化：个人资料、论坛帖子/回复、店铺评价带佩戴头衔
   在系统临时目录启动真实 server.js，使用临时数据库，不触碰项目 data.db。 */
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { spawn } = require("node:child_process");
const { DatabaseSync } = require("node:sqlite");
const titleStore = require("../lib/titles/store");
const rules = require("../lib/titles/rules");

const root = path.resolve(__dirname, "..");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "szzx-titles-test-"));
const port = 4911 + Math.floor(Math.random() * 200);
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
let founderId, foodieId, scholarId;

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
  db.exec("CREATE TABLE forum_posts (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL)");
  db.exec("CREATE TABLE forum_replies (id INTEGER PRIMARY KEY, post_id INTEGER NOT NULL)");
  db.exec("CREATE TABLE post_likes (id INTEGER PRIMARY KEY, post_id INTEGER NOT NULL, user_id INTEGER NOT NULL)");
  db.exec("CREATE TABLE recipes (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, is_weekly INTEGER NOT NULL DEFAULT 0)");
  titleStore.migrate(db);
  db.prepare("INSERT INTO users (id, role) VALUES (1, 'user'), (2, 'student'), (3, 'admin'), (4, 'developer'), (5, 'super_admin')").run();

  const catalog = titleStore.listCatalog(db);
  assert.equal(catalog.length, 14);
  assert.deepEqual(
    catalog.filter(function (t) { return t.source === "auto"; }).map(function (t) { return t.rule; }).sort(),
    [
      "canteen_veteran",
      "forum_catalyst",
      "login_streak",
      "role_admin",
      "role_developer",
      "role_super_admin",
      "role_user",
      "shop_contributor",
      "student_verified",
      "top_liked",
      "weekend_regular"
    ]
  );
  const mentor = catalog.filter(function (t) { return t.key === "mentor"; })[0];
  assert.equal(mentor.name, "师者");
  assert.equal(mentor.source, "grant", "师者已改为手动授予");
  assert.equal(mentor.rule, "");

  return Promise.resolve()
    .then(function () {
      // 每个角色恰好一枚等级徽章，各等级之间互不重叠
      assert.deepEqual(rules.evaluateAutoTitles(db, 1).map(function (t) { return t.name; }), ["同窗"]);
      assert.deepEqual(rules.evaluateAutoTitles(db, 2).map(function (t) { return t.name; }), ["学子"]);
      assert.deepEqual(rules.evaluateAutoTitles(db, 3).map(function (t) { return t.name; }), ["管理员"]);
      assert.deepEqual(rules.evaluateAutoTitles(db, 4).map(function (t) { return t.name; }), ["开发者"]);
      assert.deepEqual(rules.evaluateAutoTitles(db, 5).map(function (t) { return t.name; }), ["超级管理员"]);
      // 幂等：再次评估不重复发放
      assert.deepEqual(rules.evaluateAutoTitles(db, 2), []);
      assert.deepEqual(rules.evaluateAutoTitles(db, 3), []);
      assert.deepEqual(
        titleStore.ownedTitles(db, 4).map(function (t) { return t.name; }),
        ["开发者"],
        "developer 不会额外获得学子、同窗或师者"
      );
    })
    .then(function () {
      // 等级头衔互斥：角色变化时自动收下旧徽章，只保留当前角色那一枚
      db.prepare("UPDATE users SET role = 'admin' WHERE id = 1").run();
      assert.deepEqual(rules.evaluateAutoTitles(db, 1).map(function (t) { return t.name; }), ["管理员"]);
      assert.deepEqual(
        titleStore.ownedTitles(db, 1).map(function (t) { return t.name; }),
        ["管理员"],
        "普通用户升为管理员后「同窗」被收回"
      );
    })
    .then(function () {
      // 行为类头衔不受角色变化影响，仍然只增不减
      db.prepare("UPDATE users SET login_streak = 7 WHERE id = 1").run();
      assert.deepEqual(rules.evaluateAutoTitles(db, 1).map(function (t) { return t.name; }), ["夜读星"]);
      const insert = db.prepare("INSERT INTO shops (created_by) VALUES (?)");
      for (let i = 0; i < 10; i += 1) insert.run(1);
      assert.deepEqual(rules.evaluateAutoTitles(db, 1).map(function (t) { return t.name; }), ["三元坊老饕"]);
      assert.deepEqual(
        titleStore.ownedTitles(db, 1).map(function (t) { return t.name; }).sort(),
        ["三元坊老饕", "夜读星", "管理员"].sort(),
        "等级徽章与行为徽章可以并存"
      );
      db.close();
    });
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

test("成就头衔：论坛催化剂 / 高赞校友 / 校园老吃家 / 闲者爱上网", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, role TEXT NOT NULL DEFAULT 'user', login_streak INTEGER NOT NULL DEFAULT 0)");
  db.exec("CREATE TABLE shops (id INTEGER PRIMARY KEY, created_by INTEGER)");
  db.exec("CREATE TABLE forum_posts (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL)");
  db.exec("CREATE TABLE forum_replies (id INTEGER PRIMARY KEY, post_id INTEGER NOT NULL)");
  db.exec("CREATE TABLE post_likes (id INTEGER PRIMARY KEY, post_id INTEGER NOT NULL, user_id INTEGER NOT NULL)");
  db.exec("CREATE TABLE recipes (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, is_weekly INTEGER NOT NULL DEFAULT 0)");
  titleStore.migrate(db);
  db.prepare("INSERT INTO users (id, role) VALUES (1, 'user')").run();

  const names = function () { return titleStore.ownedTitles(db, 1).map(function (t) { return t.name; }); };
  const addPost = db.prepare("INSERT INTO forum_posts (user_id) VALUES (1)");
  const addReply = db.prepare("INSERT INTO forum_replies (post_id) VALUES (?)");

  // 论坛催化剂：3 篇帖子各获 5 条评论
  const firstPost = Number(addPost.run().lastInsertRowid);
  const secondPost = Number(addPost.run().lastInsertRowid);
  for (let i = 0; i < 5; i += 1) { addReply.run(firstPost); addReply.run(secondPost); }
  rules.evaluateAutoTitles(db, 1);
  assert.equal(names().indexOf("论坛催化剂"), -1, "只有 2 篇达标时不发放");
  const thirdPost = Number(addPost.run().lastInsertRowid);
  for (let i = 0; i < 5; i += 1) addReply.run(thirdPost);
  assert.deepEqual(rules.evaluateAutoTitles(db, 1).map(function (t) { return t.name; }), ["论坛催化剂"]);

  // 高赞校友：帖子累计获赞 30
  const addLike = db.prepare("INSERT INTO post_likes (post_id, user_id) VALUES (?, ?)");
  for (let i = 0; i < 29; i += 1) addLike.run(firstPost, 100 + i);
  rules.evaluateAutoTitles(db, 1);
  assert.equal(names().indexOf("高赞校友"), -1, "29 个赞还不够");
  addLike.run(firstPost, 200);
  assert.deepEqual(rules.evaluateAutoTitles(db, 1).map(function (t) { return t.name; }), ["高赞校友"]);

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
    ["校园老吃家", "论坛催化剂", "高赞校友", "闲者爱上网", "同窗"].sort(),
    "四个成就头衔与等级头衔（同窗）并存"
  );
  db.close();
});

test("目录种子：14 个头衔，自动规则可读，未登录不可读", async () => {
  assert.equal((await api("/api/admin/titles")).status, 401);
  assert.equal((await api("/api/admin/titles", { token: plainUser.token })).status, 403);

  const list = await api("/api/admin/titles", { token: developer.token });
  assert.equal(list.status, 200);
  assert.equal(list.data.titles.length, 14);
  const byName = {};
  list.data.titles.forEach(function (t) { byName[t.name] = t; });
  assert.equal(byName["创站元老"].source, "grant");
  assert.equal(byName["创站元老"].hue, "teal");
  assert.equal(byName["三元坊老饕"].source, "auto");
  assert.equal(byName["三元坊老饕"].rule, "shop_contributor");
  assert.equal(byName["夜读星"].rule, "login_streak");
  assert.equal(byName["学子"].rule, "student_verified");
  assert.equal(byName["学子"].description, "在校学生");
  // 管理等级头衔与角色一一对应
  assert.equal(byName["开发者"].source, "auto");
  assert.equal(byName["开发者"].rule, "role_developer");
  assert.equal(byName["开发者"].hue, "rose");
  assert.equal(byName["超级管理员"].rule, "role_super_admin");
  assert.equal(byName["超级管理员"].hue, "vermilion");
  assert.equal(byName["管理员"].rule, "role_admin");
  assert.equal(byName["管理员"].hue, "teal");
  assert.equal(byName["同窗"].source, "auto");
  assert.equal(byName["同窗"].rule, "role_user");
  assert.equal(byName["同窗"].hue, "stone");
  assert.equal(byName["同窗"].description, "已注册用户");
  // 成就头衔
  assert.equal(byName["论坛催化剂"].source, "auto");
  assert.equal(byName["论坛催化剂"].rule, "forum_catalyst");
  assert.equal(byName["论坛催化剂"].hue, "vermilion");
  assert.equal(byName["闲者爱上网"].rule, "weekend_regular");
  assert.equal(byName["闲者爱上网"].hue, "wisteria");
  assert.equal(byName["高赞校友"].rule, "top_liked");
  assert.equal(byName["高赞校友"].hue, "rose");
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
  scholarId = byName["学子"].id;

  const ruleList = await api("/api/admin/titles/rules", { token: developer.token });
  assert.equal(ruleList.status, 200);
  assert.deepEqual(ruleList.data.rules.map(function (r) { return r.key; }).sort(), [
    "canteen_veteran",
    "forum_catalyst",
    "login_streak",
    "role_admin",
    "role_developer",
    "role_super_admin",
    "role_user",
    "shop_contributor",
    "student_verified",
    "top_liked",
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
  assert.deepEqual(revoked.data.titles.map(function (t) { return t.name; }), ["同窗"]);

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

  // 自动头衔由规则发放，撤销会在下次评估恢复，故后端拒绝
  const revokeAuto = await api("/api/admin/users/" + plainUser.user.id + "/titles/" + byName["同窗"].id, { token: developer.token, method: "DELETE" });
  assert.equal(revokeAuto.status, 409, "自动头衔不可手动撤销");

  // 专属头衔不能与公共头衔同名
  const clash = await api("/api/admin/users/" + plainUser.user.id + "/titles/custom", {
    token: developer.token, method: "POST", body: { name: "官方", hue: "teal" }
  });
  assert.equal(clash.status, 409, "专属头衔不能与公共头衔同名");

  // 即时发放：3 篇帖子各 5 条评论后，作者无需等待下次评估即获得「论坛催化剂」
  // 用独立账号，避免影响后续用例对既有用户头衔的精确断言
  const author = await account("titles_catalyst");
  const postIds = [];
  for (let i = 0; i < 3; i += 1) {
    const created = await api("/api/forum/posts", {
      token: author.token, method: "POST",
      body: { category: "讨论", title: "即时头衔 " + i, content: "等待评论" }
    });
    assert.equal(created.status, 201);
    postIds.push(created.data.post.id);
  }
  const countCatalyst = function () {
    const db = new DatabaseSync(path.join(temp, "data.db"));
    const n = db.prepare("SELECT COUNT(*) AS n FROM user_titles ut JOIN titles t ON t.id = ut.title_id WHERE ut.user_id = ? AND t.key = 'catalyst'").get(author.user.id).n;
    db.close();
    return n;
  };
  for (let p = 0; p < postIds.length; p += 1) {
    for (let i = 0; i < 5; i += 1) {
      const rep = await api("/api/forum/posts/" + postIds[p] + "/replies", { token: studentUser.token, method: "POST", body: { content: "评论 " + i } });
      assert.equal(rep.status, 201);
    }
    assert.equal(countCatalyst(), p === 2 ? 1 : 0, "仅在第 3 篇帖子集满 5 条评论后即时发放");
  }
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
  // 学生身份会同时自动获得「学子」
  assert.deepEqual(list.data.titles.map(function (t) { return t.name; }).sort(), ["创站元老", "学子"]);
  assert.equal(list.data.titles.filter(function (t) { return t.equipped; }).length, 0);
  const locked = {};
  list.data.locked.forEach(function (t) { locked[t.rule] = t; });
  assert.equal(locked.student_verified.met, true, "学生认证已达成");
  assert.equal(locked.student_verified.progress, 1);
  assert.equal(locked.login_streak.met, false);
  assert.equal(locked.shop_contributor.target, 10);
  assert.match(locked.shop_contributor.text, /累计推荐/);
  assert.equal((await api("/api/user/titles")).status, 401);
});

test("自动头衔：新增店铺后自动获得「三元坊老饕」，登录后自动获得「学子」", async () => {
  for (let i = 0; i < 10; i += 1) {
    const created = await api("/api/shops", { token: studentUser.token, method: "POST", body: shopBody("头衔测试店 " + i) });
    assert.equal(created.status, 201, "create shop " + i);
  }
  const list = await api("/api/user/titles", { token: studentUser.token });
  const rules = list.data.titles.map(function (t) { return t.rule; });
  assert.equal(rules.indexOf("shop_contributor") !== -1, true, "推荐 10 家后自动获得三元坊老饕");
  assert.equal(rules.indexOf("student_verified") !== -1, true, "学生认证后自动获得学子");
  const foodie = list.data.titles.filter(function (t) { return t.rule === "shop_contributor"; })[0];
  assert.equal(foodie.name, "三元坊老饕");
  assert.equal(foodie.equipped, false);

  // 自动头衔可以通过登录链路发放（此处验证登录不报错且返回发放列表字段）
  const relogin = await api("/api/login", { method: "POST", body: { username: "titles_student", password: "test-password" } });
  assert.equal(relogin.status, 200);
  assert.deepEqual(relogin.data.granted_titles, [], "已拥有的自动头衔不会重复发放");
});

test("序列化：个人资料、论坛帖子与回复、店铺评价都带佩戴头衔", async () => {
  const worn = await api("/api/user/title", { token: studentUser.token, method: "PUT", body: { title_id: scholarId } });
  assert.equal(worn.status, 200);
  assert.equal(worn.data.title.name, "学子");

  const profile = await api("/api/user/profile", { token: studentUser.token });
  assert.deepEqual(profile.data.user.title, { name: "学子", hue: "bamboo" });

  const post = await api("/api/forum/posts", {
    token: studentUser.token,
    method: "POST",
    body: { category: "讨论", title: "头衔展示", content: "帖子正文" }
  });
  assert.equal(post.status, 201);

  const feed = await api("/api/forum/posts", { token: plainUser.token });
  assert.equal(feed.data.posts[0].title, "头衔展示", "佩戴头衔不能覆盖 forum_posts.title");
  assert.equal(feed.data.posts[0].user_title.name, "学子", "帖子卡头带佩戴头衔");
  assert.equal(feed.data.posts[0].nickname, "titles_student", "同时补齐昵称等统一用户组件字段");
  assert.equal(feed.data.posts[0].role, "student");

  const reply = await api("/api/forum/posts/" + post.data.post.id + "/replies", {
    token: plainUser.token,
    method: "POST",
    body: { content: "回复一下" }
  });
  assert.equal(reply.status, 201);
  assert.equal(reply.data.reply.user_title, null, "未佩戴则不带徽章，也不报错");
  assert.equal(reply.data.reply.nickname, "titles_user");

  const replies = await api("/api/forum/posts/" + post.data.post.id + "/replies", { token: plainUser.token });
  assert.equal(replies.data.replies[0].role, "user");

  const detail = await api("/api/forum/posts/" + post.data.post.id, { token: plainUser.token });
  assert.equal(detail.data.post.title, "头衔展示");
  assert.deepEqual(detail.data.post.user_title, { name: "学子", hue: "bamboo" });

  const shopId = (await api("/api/shops")).data.shops[0].id;
  const review = await api("/api/shops/" + shopId + "/reviews", {
    token: studentUser.token,
    method: "POST",
    body: { rating: 5, content: "好吃" }
  });
  assert.equal(review.status, 201);
  const reviews = await api("/api/shops/" + shopId + "/reviews");
  assert.deepEqual(reviews.data.reviews[0].user_title, { name: "学子", hue: "bamboo" });
  assert.equal(reviews.data.reviews[0].user_id, studentUser.user.id);
  assert.equal(reviews.data.reviews[0].nickname, "titles_student");
});

test("管理等级头衔：developer 获得「开发者」，且不会获得学子/师者", async () => {
  const mine = await api("/api/user/titles", { token: developer.token });
  assert.equal(mine.status, 200);
  assert.deepEqual(mine.data.titles.map(function (t) { return t.name; }).sort(), ["开发者"]);
  const grade = mine.data.titles[0];
  assert.equal(grade.source, "auto");
  assert.equal(grade.rule, "role_developer");
  assert.equal(grade.equipped, false);
  const locked = {};
  mine.data.locked.forEach(function (t) { locked[t.rule] = t; });
  assert.equal(locked.student_verified.met, false, "开发者不满足学子条件");
  assert.equal(locked.student_verified.text, "尚未通过学生认证");
  assert.equal(locked.role_developer.met, true);
  assert.equal(locked.role_developer.text, "当前角色为开发者");
  assert.equal(locked.role_admin.met, false);
  assert.equal(locked.role_super_admin.met, false);
  // 师者是手动头衔，不出现在自动规则的锁定项里
  assert.equal(Object.prototype.hasOwnProperty.call(locked, "mentor"), false);
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
  assert.deepEqual(created.data.titles.map(function (t) { return t.name; }).sort(), ["同窗", "首席摸鱼官"].sort());

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
  assert.equal(again.data.titles.length, 2, "「同窗」+ 专属头衔");

  // 只有所属账号能看到并使用
  assert.deepEqual((await api("/api/user/titles", { token: plainUser.token })).data.titles.map(function (t) { return t.name; }).sort(), ["同窗", "只属于我"].sort());
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
  assert.deepEqual(revoked.data.titles.map(function (t) { return t.name; }), ["同窗"]);
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

test("管理等级：admin 与 super_admin 分别获得对应等级头衔", async () => {
  const promoted = await api("/api/admin/users/role", {
    token: developer.token,
    method: "PUT",
    body: { userId: plainUser.user.id, newRole: "admin" }
  });
  assert.equal(promoted.status, 200, "promote to admin");
  const adminLogin = await api("/api/login", { method: "POST", body: { username: "titles_user", password: "test-password" } });
  assert.equal(adminLogin.status, 200);
  const adminTitles = await api("/api/user/titles", { token: adminLogin.data.token });
  assert.deepEqual(
    adminTitles.data.titles.map(function (t) { return t.name; }),
    ["管理员"],
    "升为管理员后自动换发「管理员」，旧的「同窗」被收回"
  );

  const suLogin = await api("/api/login", { method: "POST", body: { username: "titles_dev", password: "test-password" } });
  const stale = await api("/api/admin/users/role", {
    token: suLogin.data.token,
    method: "PUT",
    body: { userId: plainUser.user.id, newRole: "super_admin" }
  });
  assert.equal(stale.status, 200, "promote to super_admin");
  const suReLogin = await api("/api/login", { method: "POST", body: { username: "titles_user", password: "test-password" } });
  const suTitles = await api("/api/user/titles", { token: suReLogin.data.token });
  assert.deepEqual(
    suTitles.data.titles.map(function (t) { return t.name; }),
    ["超级管理员"],
    "升为超级管理员后换发「超级管理员」，「管理员」被收回"
  );
});
