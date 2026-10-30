"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("./helpers/database.cjs");
const titles = require("../apps/api/src/domain/titles/store");
const collections = require("../apps/api/src/domain/collections/store");
const removeForum = require("../apps/api/src/domain/migrations/remove-forum");

test("旧库清除论坛及衍生数据，保留店铺收藏和系统通知，重复迁移结果一致", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
      CREATE TABLE users (id INTEGER PRIMARY KEY, default_page TEXT, default_collection_forum INTEGER,
        default_collection_shops INTEGER, pref_comment INTEGER, pref_reply INTEGER, pref_like INTEGER);
      INSERT INTO users VALUES (1, 'forum.html', 10, 20, 1, 1, 1);
      CREATE TABLE forum_posts (id INTEGER PRIMARY KEY);
      CREATE TABLE forum_replies (id INTEGER PRIMARY KEY);
      CREATE TABLE post_likes (id INTEGER PRIMARY KEY);
      INSERT INTO forum_posts VALUES (1);
      CREATE TABLE messages (id INTEGER PRIMARY KEY, type TEXT, target_kind TEXT, body TEXT);
      INSERT INTO messages VALUES (1, 'comment', 'post', '评论'), (2, 'system', NULL, '系统通知');
      CREATE TABLE collections (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, section TEXT CHECK(section IN ('forum','shops')),
        name TEXT, is_public INTEGER, created_at INTEGER);
      INSERT INTO collections VALUES (10, 1, 'forum', '旧帖子', 1, 100), (20, 1, 'shops', '美食', 1, 101);
      CREATE TABLE collection_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT, collection_id INTEGER, item_type TEXT CHECK(item_type IN ('forum_post','shop')),
        item_id INTEGER, created_at INTEGER, UNIQUE(collection_id, item_type, item_id));
      INSERT INTO collection_items VALUES (30, 10, 'forum_post', 1, 100), (40, 20, 'shop', 2, 101);
    `);
    titles.migrate(db);
    db.exec(`
      INSERT INTO titles (id, key, name, rule) VALUES (100, 'catalyst', '论坛催化剂', 'forum_catalyst'),
        (101, 'topliked', '高赞校友', 'top_liked');
      INSERT INTO user_titles (user_id, title_id) VALUES (1, 100), (1, 101);
      UPDATE users SET equipped_title_id = 100;
    `);
    collections.migrate(db);
    db.exec("UPDATE users SET collection_default_public = 1 WHERE id = 1");
    for (let run = 0; run < 2; run++) {
      titles.migrate(db);
      collections.migrate(db);
      removeForum(db);
      assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name IN ('forum_posts','forum_replies','post_likes')").all().length, 0);
      const columns = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
      assert.equal(columns.includes("default_collection_forum"), false);
      assert.equal(columns.includes("pref_comment"), false);
      const user = db.prepare("SELECT * FROM users").get();
      assert.equal(user.default_page, "index.html");
      assert.equal(user.default_collection_shops, 20);
      assert.equal(user.collection_default_public, 1);
      assert.equal(user.equipped_title_id, null);
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM user_titles").get().n, 0);
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM titles WHERE rule IN ('forum_catalyst','top_liked')").get().n, 0);
      assert.deepEqual(db.prepare("SELECT * FROM collections").all().map(r => ({...r})), [
        { id: 20, user_id: 1, section: "shops", name: "美食", is_public: 1, created_at: 101 }
      ]);
      assert.deepEqual(db.prepare("SELECT * FROM collection_items").all().map(r => ({...r})), [
        { id: 40, collection_id: 20, item_type: "shop", item_id: 2, created_at: 101 }
      ]);
      assert.equal(db.prepare("SELECT body FROM messages").get().body, "系统通知");
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM messages").get().n, 1);
      assert.throws(() => db.prepare("INSERT INTO collections (user_id,section,name) VALUES (1,'forum','旧')").run(), /CHECK/);
      assert.throws(() => db.prepare("INSERT INTO collection_items (collection_id,item_type,item_id) VALUES (20,'forum_post',1)").run(), /CHECK/);
    }
  } finally {
    db.close();
  }
});
