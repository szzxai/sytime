"use strict";
/* 收藏夹（#23）后端测试：自动默认收藏夹、创建 / 收藏 / 取消、版块校验、分页详情、
   公开状态、默认收藏夹设置与店铺删除清理。
   在系统临时目录启动真实 server.js，使用临时数据库，不触碰项目 data.db。 */
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "szzx-collections-test-"));
const port = 4811 + Math.floor(Math.random() * 200);
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

const SHOP = {
  name: "收藏测试面馆",
  address: "苏州市姑苏区十梓街 321 号",
  type: "面馆",
  lat: 31.3004,
  lng: 120.6226,
  campus_distance_m: 420,
  campus_walk_min: 6,
  metro_station: "乐桥",
  metro_exit: "3 号口",
  metro_distance_m: 480,
  metro_walk_min: 7
};

let developer, user, other;
let shopId = null;
let mainCollectionId = null;
let shopCollectionId = null;
const shopIds = [];

test.before(async () => {
  server = spawn(process.execPath, [path.join(temp, "server.js")], {
    cwd: temp,
    env: { ...process.env, NODE_PATH: path.join(root, "node_modules"), PORT: String(port), JWT_SECRET: "collections-test-only-secret" },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"]
  });
  await waitForReady();
  developer = await account("collections_dev");
  user = await account("collections_user");
  other = await account("collections_other");

  const shop = await api("/api/shops", { token: developer.token, method: "POST", body: SHOP });
  assert.equal(shop.status, 201, "create shop");
  shopId = shop.data.shop.id;

  for (let i = 1; i <= 21; i++) {
    const shop = await api("/api/shops", { token: developer.token, method: "POST", body: { ...SHOP, name: "分页店铺 " + i } });
    assert.equal(shop.status, 201);
    shopIds.push(shop.data.shop.id);
  }
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

test("收藏夹接口需要登录，版块参数校验", async () => {
  assert.equal((await api("/api/collections?section=shops")).status, 401);
  assert.equal((await api("/api/collections?section=bad", { token: user.token })).status, 400);
  assert.equal((await api("/api/collections", { token: user.token })).status, 400);
});

test("首次读取店铺收藏夹自动创建默认收藏夹且不重复", async () => {
  const first = await api("/api/collections?section=shops", { token: user.token });
  assert.equal(first.status, 200);
  assert.equal(first.data.collections.length, 1);
  assert.equal(first.data.collections[0].name, "默认收藏夹");
  assert.equal(first.data.collections[0].section, "shops");
  assert.equal(first.data.collections[0].items_count, 0);

  const second = await api("/api/collections?section=shops", { token: user.token });
  assert.equal(second.data.collections.length, 1);
});

test("创建收藏夹、收藏店铺并去重", async () => {
  const created = await api("/api/collections", { token: user.token, method: "POST", body: { section: "shops", name: "我的店铺" } });
  assert.equal(created.status, 201);
  assert.equal(created.data.collection.name, "我的店铺");
  const id = created.data.collection.id;
  mainCollectionId = id;

  const add = await api("/api/collections/" + id + "/items", { token: user.token, method: "POST", body: { item_type: "shop", item_id: shopIds[0] } });
  assert.equal(add.status, 201);
  assert.equal(add.data.added, true);

  const again = await api("/api/collections/" + id + "/items", { token: user.token, method: "POST", body: { item_type: "shop", item_id: shopIds[0] } });
  assert.equal(again.status, 200);
  assert.equal(again.data.added, false);

  const missing = await api("/api/collections/" + id + "/items", { token: user.token, method: "POST", body: { item_type: "shop", item_id: 999999 } });
  assert.equal(missing.status, 404);

  const list = await api("/api/collections?section=shops", { token: user.token });
  const target = list.data.collections.filter(function (c) { return c.id === id; })[0];
  assert.equal(target.items_count, 1);
});

test("收藏项详情包含店铺卡片信息并能分页", async () => {
  const id = mainCollectionId;
  for (let i = 1; i < shopIds.length; i++) {
    const add = await api("/api/collections/" + id + "/items", { token: user.token, method: "POST", body: { item_type: "shop", item_id: shopIds[i] } });
    assert.equal(add.status, 201);
  }

  const page1 = await api("/api/collections/" + id + "/items?page=1", { token: user.token });
  assert.equal(page1.status, 200);
  assert.equal(page1.data.total, 21);
  assert.equal(page1.data.page_size, 20);
  assert.equal(page1.data.total_pages, 2);
  assert.equal(page1.data.items.length, 20);
  const item = page1.data.items[0];
  assert.equal(item.item_type, "shop");
  assert.ok(item.shop.name.startsWith("分页店铺"));
  assert.equal(item.deleted, false);
  const page2 = await api("/api/collections/" + id + "/items?page=2", { token: user.token });
  assert.equal(page2.data.items.length, 1);

  const clamped = await api("/api/collections/" + id + "/items?page=99", { token: user.token });
  assert.equal(clamped.data.page, 2);
  assert.equal(clamped.data.items.length, 1);
});

test("取消收藏与分页边界", async () => {
  const id = mainCollectionId;
  const removed = await api("/api/collections/" + id + "/items/shop/" + shopIds[0], { token: user.token, method: "DELETE" });
  assert.equal(removed.status, 200);
  assert.equal(removed.data.removed, true);

  const removedAgain = await api("/api/collections/" + id + "/items/shop/" + shopIds[0], { token: user.token, method: "DELETE" });
  assert.equal(removedAgain.data.removed, false);

  const list = await api("/api/collections/" + id + "/items", { token: user.token });
  assert.equal(list.data.total, 20);
});

test("公开状态控制他人查看", async () => {
  const id = mainCollectionId;
  assert.equal((await api("/api/collections/" + id + "/items", { token: other.token })).status, 403);
  assert.equal((await api("/api/collections/" + id + "/items")).status, 401);

  const opened = await api("/api/collections/" + id + "/public", { token: user.token, method: "PUT", body: { is_public: true } });
  assert.equal(opened.status, 200);
  assert.equal(opened.data.collection.is_public, true);
  assert.equal((await api("/api/collections/" + id + "/items", { token: other.token })).status, 200);
  assert.equal((await api("/api/collections/" + id + "/items")).status, 200, "公开收藏夹可匿名读取");

  const publicList = await api("/api/users/" + user.user.id + "/collections");
  assert.equal(publicList.status, 200);
  assert.ok(publicList.data.collections.some(function (c) { return c.id === id; }));

  await api("/api/collections/" + id + "/public", { token: user.token, method: "PUT", body: { is_public: false } });
  assert.equal((await api("/api/collections/" + id + "/items", { token: other.token })).status, 403);
  assert.equal((await api("/api/collections/" + id + "/items")).status, 401);
  const afterClose = await api("/api/users/" + user.user.id + "/collections");
  assert.ok(!afterClose.data.collections.some(function (c) { return c.id === id; }));
});

test("必吃榜收藏夹自动创建、收藏店铺并返回店铺卡片信息", async () => {
  const initial = await api("/api/collections?section=shops", { token: user.token });
  assert.equal(initial.data.collections.length, 2);
  const id = initial.data.collections[0].id;
  shopCollectionId = id;

  const add = await api("/api/collections/" + id + "/items", { token: user.token, method: "POST", body: { item_type: "shop", item_id: shopId } });
  assert.equal(add.status, 201);

  const mismatch = await api("/api/collections/" + id + "/items", { token: user.token, method: "POST", body: { item_type: "invalid", item_id: shopIds[0] } });
  assert.equal(mismatch.status, 400);

  const items = await api("/api/collections/" + id + "/items", { token: user.token });
  assert.equal(items.status, 200);
  assert.equal(items.data.total, 1);
  const entry = items.data.items[0];
  assert.equal(entry.item_type, "shop");
  assert.equal(entry.deleted, false);
  assert.equal(entry.shop.name, SHOP.name);
  assert.equal(entry.shop.type, SHOP.type);
  assert.equal(entry.shop.address, SHOP.address);
  assert.ok(entry.shop.likes_count === 0);
});

test("保存默认收藏夹设置并拒绝跨用户 / 跨版块", async () => {
  const shopsId = shopCollectionId;

  const saved = await api("/api/user/settings/collection", {
    token: user.token,
    method: "PUT",
    body: { default_collection_shops: shopsId }
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.default_collection_shops, shopsId);

  const list = await api("/api/collections?section=shops", { token: user.token });
  assert.equal(list.data.defaults.shops, shopsId);

  const profile = await api("/api/user/profile", { token: user.token });
  assert.equal(profile.data.user.default_collection_shops, shopsId);

  const otherCreated = await api("/api/collections", { token: other.token, method: "POST", body: { section: "shops", name: "别人的" } });
  const foreign = await api("/api/user/settings/collection", {
    token: user.token,
    method: "PUT",
    body: { default_collection_shops: otherCreated.data.collection.id }
  });
  assert.equal(foreign.status, 400);

  const crossSection = await api("/api/user/settings/collection", {
    token: user.token,
    method: "PUT",
    body: { section: "forum", collection_id: shopsId }
  });
  assert.equal(crossSection.status, 400);

  const single = await api("/api/user/settings/collection", {
    token: user.token,
    method: "PUT",
    body: { section: "shops", collection_id: null }
  });
  assert.equal(single.status, 200);
  assert.equal(single.data.default_collection_shops, null);
});

test("论坛页面、接口、通知偏好及收藏版块已移除", async () => {
  for (const url of ["/api/forum/posts", "/api/forum/posts/1", "/api/forum/posts/1/replies", "/api/user/preferences"]) {
    for (const method of ["GET", "POST", "PUT", "DELETE"]) {
      assert.equal((await fetch(base + url, { method, headers: { Authorization: "Bearer " + user.token } })).status, 404);
    }
  }
  for (const file of ["forum.html", "post.html", "js/forum.js", "js/pages/forum.js", "js/pages/post.js"]) {
    assert.equal(fs.existsSync(path.join(root, "public", file)), false);
  }
  assert.equal((await api("/api/user/settings", { token: user.token, method: "PUT", body: { default_page: "forum.html" } })).status, 200);
  assert.equal((await api("/api/user/profile", { token: user.token })).data.user.default_page, "index.html");
  assert.equal((await api("/api/messages", { token: user.token })).status, 200);
  assert.equal((await api("/api/collections?section=forum", { token: user.token })).status, 400);
});
