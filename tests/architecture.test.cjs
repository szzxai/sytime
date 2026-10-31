"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createDatabase, query } = require("../packages/db/src/client.ts");
const { migrateDatabase } = require("../packages/db/src/migrate.ts");
const initialize = require("../apps/api/src/database.js");
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
    for (const username of ["developer", "member"]) {
      assert.equal((await app.api("/api/register", { method: "POST", body: { username, nickname: username, password: "CampusTest2026" } })).status, 201);
    }
    const login = (await app.api("/api/login", { method: "POST", body: { username: "member", password: "CampusTest2026" } })).data;
    db = createDatabase(path.join(app.directory, "data.db"));
    query(db, "UPDATE users SET role='admin' WHERE id=?").run(login.user.id);
    const settings = body => app.api("/api/admin/settings/banner", { method: "PUT", token: login.token, body });
    assert.equal((await settings({ value: "authorized" })).status, 200);
    query(db, "UPDATE users SET role='user' WHERE id=?").run(login.user.id);
    assert.equal((await settings({ value: "should not change" })).status, 403);
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
