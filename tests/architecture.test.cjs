"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Readable } = require("node:stream");
const test = require("node:test");
const sharp = require("sharp");
const { createDatabase, query } = require("../packages/db/src/client.ts");
const { migrateDatabase } = require("../packages/db/src/migrate.ts");
const initialize = require("../apps/api/src/database.js");
const { AboutAvatarService, mountAboutAvatarRoutes } = require("../apps/api/src/domain/about-avatars.js");
const { aboutAvatarSource } = require("../packages/shared/src/about.ts");
const { startApp } = require("./helpers/app-fixture.cjs");
const root = path.resolve(__dirname, "..");

test("Drizzle adopts an existing installation and preserves linked data across restarts", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sytime-adoption-"));
  const filename = path.join(directory, "data.db");
  let db;
  try {
    // No Drizzle journal: the database represents an already running legacy installation.
    db = createDatabase(filename);
    initialize(db);
    query(db, "INSERT INTO users (id, display_id, username, nickname, collection_default_public, avatar_url) VALUES (42, '777777', 'existing', '原有昵称', 1, '/uploads/old.png')").run();
    query(db, "INSERT INTO collections (id,user_id,section,name,is_public) VALUES (81,42,'shops','原有收藏',1)").run();
    query(db, "UPDATE users SET default_collection_shops=81 WHERE id=42").run();
    query(db, "INSERT INTO titles (id,key,name,hue,source) VALUES (99,'legacy-test','旧头衔','jade','grant')").run();
    query(db, "INSERT INTO user_titles (id,user_id,title_id) VALUES (123,42,99)").run();
    query(db, "UPDATE users SET equipped_title_id=99 WHERE id=42").run();
    query(db, "INSERT INTO recipes (id,user_id,username,name,rating,comment,image_url) VALUES (145,42,'existing','旧评价',4,'保留原文','/uploads/review.png')").run();
    const tables = ["users", "collections", "titles", "user_titles"];
    const before = Object.fromEntries(tables.map(table => [table, query(db, `SELECT * FROM ${table} ORDER BY id`).all()]));
    before.users=before.users.map(user=>({...user,recipe_default_view:'daily'}));
    db.$client.close();
    db = null;
    for (let restart = 0; restart < 2; restart++) {
      db = createDatabase(filename);
      migrateDatabase(db, root);
      initialize(db);
      for (const table of tables) assert.deepEqual(query(db, `SELECT * FROM ${table} ORDER BY id`).all(), before[table]);
      assert.equal(query(db, "SELECT count(*) AS total FROM __drizzle_migrations").get().total, 3);
      assert.equal(query(db,"SELECT count(*) AS n FROM recipes").get().n,restart);
      if(restart===0) query(db,"INSERT INTO recipes(user_id,username,name,rating) VALUES (42,'existing','新评价',5)").run();
      assert.equal(db.$client.pragma("integrity_check", { simple: true }), "ok");
      assert.deepEqual(db.$client.pragma("foreign_key_check"), []);
      db.$client.close();
      db = null;
    }
  } finally {
    db?.$client.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("Hono checks current account authority even when a JWT remains valid", async () => {
  const app = await startApp("sytime-current-auth-");
  let db;
  try {
    db = createDatabase(path.join(app.directory, "data.db"));
    for (const username of ["developer", "member"]) {
      require("./helpers/seed-account.cjs")(db, username);
    }
    const login = (await app.api("/api/login", { method: "POST", body: { username: "member", password: "CampusTest2026" } })).data;
    query(db, "UPDATE users SET role='admin' WHERE id=?").run(login.user.id);
    const settings = body => app.api("/api/admin/settings/banner", { method: "PUT", token: login.token, body });
    assert.equal((await settings({ value: "authorized" })).status, 200);
    const avatarPath = "/api/admin/settings/about-avatars";
    const avatarSettings = body => app.api(avatarPath, { method: "PUT", token: login.token, body });
    assert.equal((await app.api(avatarPath)).status, 401);
    assert.deepEqual((await app.api(avatarPath, { token: login.token })).data, { intervalHours: 24 });
    assert.equal((await avatarSettings({ intervalHours: 2.5 })).status, 400);
    assert.deepEqual((await avatarSettings({ intervalHours: 12 })).data, { intervalHours: 12 });
    assert.deepEqual((await app.api(avatarPath, { token: login.token })).data, { intervalHours: 12 });
    query(db, "UPDATE users SET role='user' WHERE id=?").run(login.user.id);
    assert.equal((await settings({ value: "should not change" })).status, 403);
    assert.equal((await avatarSettings({ intervalHours: 18 })).status, 403);
    query(db, "UPDATE users SET status='banned' WHERE id=?").run(login.user.id);
    assert.equal((await app.api("/api/user/profile", { token: login.token })).status, 401);
    assert.equal((await settings({ value: "banned" })).status, 401);
    for (const route of ["/api", "/api/unknown"]) {
      const response = await fetch(app.base + route);
      assert.equal(response.status, 404);
      assert.match(response.headers.get("content-type"), /application\/json/);
    }
  } finally {
    db?.$client.close();
    await app.stop();
  }
});

test("About avatar sources use one persistent schedule and preserve cached images on failure", async (context) => {
  const db = createDatabase(":memory:");
  context.after(() => db.$client.close());
  initialize(db);
  const github = { name: "GitHub 成员", role: "Engineer", github: "test-member", avatar: "" };
  const custom = { ...github, name: "自定义成员", avatar: "https://example.com/custom.png" };
  const local = { ...github, name: "站内成员", avatar: "img/local.png" };
  const empty = { name: "无头像成员", role: "Engineer", avatar: "" };
  assert.deepEqual(aboutAvatarSource(local), { kind: "local", url: "/img/local.png" });
  assert.equal(aboutAvatarSource(empty), null);
  assert.equal(aboutAvatarSource({ ...github, avatar: "/old/..//example.com/image.png" }), null);
  const teams = [{ members: [github, custom, local, empty] }, { members: [github] }];
  const png = await sharp({ create: { width: 1, height: 1, channels: 3, background: "red" } }).png().toBuffer();
  const calls = [];
  let fail = false;
  const request = async (url) => {
    calls.push(url.href);
    const upstream = Readable.from(fail ? [] : [png]);
    return Object.assign(upstream, { statusCode: fail ? 503 : 200, headers: {} });
  };
  const hour = 60 * 60 * 1000;
  let now = 100 * hour;
  context.mock.method(Date, "now", () => now);
  context.mock.method(console, "warn", () => {});
  const service = new AboutAvatarService(db, { teams, request });
  const { Hono } = require("hono");
  const app = new Hono();
  mountAboutAvatarRoutes(app, service, () => (_context, next) => next());
  const avatar = (member) => app.request(`/api/about/avatars/${encodeURIComponent(member.name)}`);
  assert.equal((await avatar(github)).status, 404);
  assert.equal(calls.length, 0);
  service.start();
  await service.close();
  assert.deepEqual(calls, ["https://github.com/test-member.png?size=96", custom.avatar]);
  const image = await avatar(custom);
  assert.equal(image.headers.get("content-type"), "image/png");
  assert.equal((await sharp(Buffer.from(await image.arrayBuffer())).metadata()).width, 96);
  assert.equal((await avatar(local)).status, 404);
  assert.equal(calls.length, 2);

  const restarted = new AboutAvatarService(db, { teams, request });
  now += 23 * hour;
  await restarted.refreshIfDue();
  assert.equal(calls.length, 2);
  now += hour;
  fail = true;
  await restarted.refreshIfDue();
  assert.equal(calls.length, 4);
  assert.equal((await avatar(custom)).status, 200);
  now += 4 * hour;
  restarted.start();
  restarted.setIntervalHours(4);
  await restarted.close();
  assert.equal(calls.length, 6);
  assert.equal(new AboutAvatarService(db, { teams, request }).intervalHours(), 4);
});
