"use strict";

// 幂等清理旧版本论坛数据；收藏夹重建保留店铺收藏的 ID、公开状态和默认选择。
module.exports = function removeForum(db) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const schema = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'collections'").get();
    if (schema && schema.sql.includes("'forum'")) {
      db.exec(`
        CREATE TABLE collections_shops (
          id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
          section TEXT NOT NULL CHECK (section IN ('shops')), name TEXT NOT NULL,
          is_public INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
        );
        INSERT INTO collections_shops SELECT * FROM collections WHERE section = 'shops';
        CREATE TABLE collection_items_shops (
          id INTEGER PRIMARY KEY AUTOINCREMENT, collection_id INTEGER NOT NULL,
          item_type TEXT NOT NULL CHECK (item_type IN ('shop')), item_id INTEGER NOT NULL,
          created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
          UNIQUE(collection_id, item_type, item_id)
        );
        INSERT INTO collection_items_shops SELECT * FROM collection_items
          WHERE item_type = 'shop' AND collection_id IN (SELECT id FROM collections_shops);
        DROP TABLE collection_items;
        DROP TABLE collections;
        ALTER TABLE collections_shops RENAME TO collections;
        ALTER TABLE collection_items_shops RENAME TO collection_items;
        CREATE INDEX idx_collections_user_section ON collections(user_id, section);
        CREATE INDEX idx_collection_items_collection ON collection_items(collection_id, created_at);
        CREATE INDEX idx_collection_items_item ON collection_items(item_type, item_id);
      `);
    }
    db.exec(`
      DELETE FROM messages WHERE target_kind = 'post' OR type IN ('comment', 'reply', 'like');
      UPDATE users SET default_page = 'index.html' WHERE default_page IN ('forum.html', 'post.html');
      DROP TABLE IF EXISTS post_likes;
      DROP TABLE IF EXISTS forum_replies;
      DROP TABLE IF EXISTS forum_posts;
    `);
    const columns = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
    for (const column of ["default_collection_forum", "pref_comment", "pref_reply", "pref_like"]) {
      if (columns.includes(column)) db.exec("ALTER TABLE users DROP COLUMN " + column);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
};
