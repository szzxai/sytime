"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const store = require("../lib/dishes/store");
const { nameFields } = require("../lib/menu/schema");
const { startApp } = require("./helpers/app-fixture.cjs");
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6h0AAAAASUVORK5CYII=", "base64");

function database(context) {
  const db = new DatabaseSync(":memory:");
  context.after(() => db.close());
  db.exec(`CREATE TABLE dishes (id INTEGER PRIMARY KEY, name TEXT, name_key TEXT UNIQUE, initial TEXT, pinyin TEXT, pinyin_initials TEXT, sort_key TEXT);
    CREATE TABLE menu_records (dish_id INTEGER);
    CREATE TABLE recipes (id INTEGER PRIMARY KEY, user_id INTEGER, username TEXT, name TEXT, rating INTEGER, comment TEXT,
      image_url TEXT, is_weekly INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL DEFAULT 1);`);
  for (const [index, name] of ["红烧牛肉面", "A 套餐", "未发布菜品"].entries()) {
    const fields = nameFields(name);
    db.prepare("INSERT INTO dishes VALUES (?, ?, ?, ?, ?, ?, ?)").run(index + 1, fields.name, fields.name_key,
      fields.initial, fields.pinyin, fields.pinyin_initials, fields.sort_key);
  }
  db.exec("INSERT INTO menu_records VALUES (1), (2)");
  return db;
}

test("historical review migration normalizes names without rewriting or dropping old reviews", context => {
  const db = database(context);
  db.exec(`INSERT INTO recipes (id, name, rating, comment, is_weekly) VALUES
    (1, '  红烧牛肉面  ', 4, '保留原文', 0), (2, 'a   套餐', 3, '大小写与空白', 0),
    (3, '目录外旧菜名', 5, '继续显示在评价栏', 0), (4, '红烧牛肉面', 5, '历史每周记录', 1)`);
  store.migrate(db);
  assert.deepEqual(db.prepare("SELECT dish_id FROM recipes ORDER BY id").all().map(row => row.dish_id), [1, 2, null, null]);
  assert.equal(db.prepare("SELECT name FROM recipes WHERE id = 1").get().name, "  红烧牛肉面  ");
  assert.equal(db.prepare("SELECT COUNT(*) AS total FROM recipes").get().total, 4);
  assert.ok(db.prepare("PRAGMA foreign_key_list(recipes)").all().some(row => row.table === "dishes" && row.from === "dish_id"));
  db.exec("UPDATE recipes SET dish_id = 2 WHERE id = 1");
  store.migrate(db);
  assert.equal(db.prepare("SELECT dish_id FROM recipes WHERE id = 1").get().dish_id, 2);
});

test("dish details isolate reviews and preserve newest-first pagination and averages", context => {
  const db = database(context);
  store.migrate(db);
  const insert = db.prepare("INSERT INTO recipes (dish_id, name, rating, is_weekly, created_at) VALUES (?, ?, ?, ?, ?)");
  let sum = 0;
  for (let position = 0; position < 27; position++) {
    const rating = position % 5 + 1;
    sum += rating;
    insert.run(1, "红烧牛肉面", rating, 0, 100);
  }
  insert.run(1, "红烧牛肉面", 0, 1, 101);
  insert.run(2, "A 套餐", 1, 0, 102);
  const dish = store.detail(db, 1);
  assert.equal(dish.reviews_count, 27);
  assert.equal(dish.rating_avg, Number((sum / 27).toFixed(1)));
  const first = store.reviews(db, 1, 0), second = store.reviews(db, 1, 20);
  assert.equal(first.reviews.length, 20);
  assert.equal(first.reviews[0].id, 27);
  assert.equal(first.has_more, true);
  assert.equal(second.reviews.length, 7);
  assert.equal(second.has_more, false);
  assert.equal(new Set([...first.reviews, ...second.reviews].map(review => review.id)).size, 27);
  assert.equal(store.detail(db, 2).reviews_count, 1);
  db.exec("DELETE FROM recipes WHERE dish_id = 2");
  assert.equal(store.detail(db, 2).rating_avg, null);
});

test("malformed, oversized, nonexistent and unpublished dish identities cannot resolve", context => {
  const db = database(context);
  store.migrate(db);
  for (const value of [null, undefined, [], {}, "", "01", 0, -1, 1.5, "1e0", "1 OR 1=1", "9007199254740992", 3, 999999]) {
    assert.equal(store.findDish(db, value), null, String(value));
  }
  assert.equal(store.findDish(db, "1").name, "红烧牛肉面");
});

test("dish detail and review HTTP contracts", async context => {
  const site = await startApp("szzx-dishes-api-");
  context.after(() => site.stop());
  const registration = await site.api("/api/register", { method: "POST", body: { username: "dish-tester", nickname: "菜品测试", password: "dish-test-password" } });
  assert.equal(registration.status, 201);
  const login = await site.api("/api/login", { method: "POST", body: { username: "dish-tester", password: "dish-test-password" } });
  assert.equal(login.status, 200);
  const token = login.data.token;
  const catalog = (await site.api("/api/dishes")).data.dishes;
  const target = catalog.find(dish => dish.name === "红烧牛肉面");
  const other = catalog.find(dish => dish.id !== target.id);
  const route = "/api/dishes/" + target.id;

  await context.test("details and empty reviews are public and never invent a score", async () => {
    const response = await site.api(route);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.data.dish.reviews_count, 0);
    assert.equal(response.data.dish.rating_avg, null);
    assert.deepEqual((await site.api(route + "/reviews")).data.reviews, []);
    assert.equal((await site.api("/api/dishes/not-an-id")).status, 404);
    assert.equal((await site.api("/api/dishes/99999999/reviews")).status, 404);
  });
  await context.test("posting requires login and an explicit existing dish identity", async () => {
    assert.equal((await site.api("/api/recipes", { method: "POST", body: { dish_id: target.id, rating: 5 } })).status, 401);
    for (const dishId of [undefined, "", 0, -1, "1e0", "1 OR 1=1", {}, 99999999]) {
      const result = await site.api("/api/recipes", { method: "POST", token, body: { dish_id: dishId, name: target.name, rating: 5 } });
      assert.equal(result.status, 400);
      assert.match(result.data.error, /选择已有菜品/);
    }
    assert.equal((await site.api("/api/recipes")).data.recipes.length, 0);
  });
  await context.test("invalid scores and comments cannot create a review", async () => {
    for (const rating of [undefined, null, "", false, 6, -1, 4.5, "4invalid"]) {
      assert.equal((await site.api("/api/recipes", { method: "POST", token, body: { dish_id: target.id, rating } })).status, 400);
    }
    for (const comment of [{ text: "invalid" }, "长".repeat(501)]) {
      assert.equal((await site.api("/api/recipes", { method: "POST", token, body: { dish_id: target.id, rating: 5, comment } })).status, 400);
    }
  });
  await context.test("the server owns the canonical name and reviews never cross dishes", async () => {
    const result = await site.api("/api/recipes", { method: "POST", token,
      body: { dish_id: target.id, name: "不能伪造这个名字", rating: 4, comment: "只属于牛肉面的评论" } });
    assert.equal(result.status, 201);
    assert.equal(result.data.recipe.name, target.name);
    assert.equal(result.data.recipe.dish_id, target.id);
    await site.api("/api/recipes", { method: "POST", token, body: { dish_id: other.id, rating: 2, comment: "另一道菜的评论" } });
    const summary = (await site.api(route)).data.dish;
    assert.equal(summary.reviews_count, 1);
    assert.equal(summary.rating_avg, 4);
    const response = await site.api(route + "/reviews");
    assert.equal(response.data.reviews.length, 1);
    assert.equal(response.data.reviews[0].username, "dish-tester");
    assert.equal(response.data.reviews[0].comment, "只属于牛肉面的评论");
    assert.ok(Object.hasOwn(response.data.reviews[0], "avatar_url"));
  });
  await context.test("review pages are bounded, ordered and reject invalid offsets", async () => {
    const db = new DatabaseSync(path.join(site.directory, "data.db"));
    try {
      const insert = db.prepare("INSERT INTO recipes (dish_id, user_id, username, name, rating, created_at) VALUES (?, ?, ?, ?, 3, ?)");
      for (let position = 0; position < 25; position++) insert.run(target.id, login.data.user.id, "dish-tester", target.name, position + 1);
    } finally { db.close(); }
    const first = (await site.api(route + "/reviews")).data;
    const second = (await site.api(route + "/reviews?offset=20")).data;
    assert.equal(first.total, 26);
    assert.equal(first.reviews.length, 20);
    assert.equal(first.has_more, true);
    assert.equal(second.reviews.length, 6);
    assert.equal(second.has_more, false);
    assert.equal(new Set([...first.reviews, ...second.reviews].map(review => review.id)).size, 26);
    for (const offset of ["-1", "1.5", "1e2", "NaN", "1000001", "0&offset=20"]) {
      assert.equal((await site.api(route + "/reviews?offset=" + offset)).status, 400);
    }
  });
  await context.test("multipart reviews keep images and rejected choices leave no orphan upload", async () => {
    const data = new FormData();
    data.append("dish_id", String(target.id));
    data.append("rating", "5");
    data.append("comment", "图片评价");
    data.append("image", new Blob([png], { type: "image/png" }), "review.png");
    const result = await site.api("/api/recipes", { method: "POST", token, body: data });
    assert.equal(result.status, 201);
    assert.match(result.data.recipe.image_url, /^\/uploads\/.*\.png$/);
    assert.ok(fs.existsSync(path.join(site.directory, result.data.recipe.image_url)));
    const uploads = path.join(site.directory, "uploads");
    const before = fs.readdirSync(uploads).sort();
    data.set("dish_id", "99999999");
    assert.equal((await site.api("/api/recipes", { method: "POST", token, body: data })).status, 400);
    assert.deepEqual(fs.readdirSync(uploads).sort(), before);
  });
  await context.test("legacy unmatched reviews remain in the unchanged reviews feed", async () => {
    const db = new DatabaseSync(path.join(site.directory, "data.db"));
    try {
      db.prepare("INSERT INTO recipes (user_id, username, name, rating, comment) VALUES (?, ?, ?, 4, ?)")
        .run(login.data.user.id, "dish-tester", "目录外旧菜名", "历史内容保留");
      store.migrate(db);
    } finally { db.close(); }
    const legacy = (await site.api("/api/recipes")).data.recipes.find(review => review.name === "目录外旧菜名");
    assert.equal(legacy.comment, "历史内容保留");
    assert.equal(legacy.dish_id, null);
    assert.equal((await site.api(route)).data.dish.reviews_count, 27);
  });
});
