"use strict";
/* 收藏夹（#23）：数据库与查询层
   - collections：用户按版块（shops）维护收藏夹
   - collection_items：收藏夹内的店铺，按 (collection_id, item_type, item_id) 去重
   - users.default_collection_shops：默认收藏夹（可空） */

const SECTIONS = ["shops"];
const ITEM_TYPES = ["shop"];
const SECTION_ITEM_TYPE = Object.freeze({ shops: "shop" });
const PAGE_SIZE = 20;
const NAME_MAX = 40;
const DEFAULT_NAME = "默认收藏夹";

function sectionOf(value) {
  const section = typeof value === "string" ? value.trim() : "";
  return SECTIONS.indexOf(section) !== -1 ? section : null;
}

function itemTypeOf(value) {
  const type = typeof value === "string" ? value.trim() : "";
  return ITEM_TYPES.indexOf(type) !== -1 ? type : null;
}

function positiveInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function defaultField(section) {
  return "default_collection_shops";
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS collections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      section TEXT NOT NULL CHECK (section IN ('shops')),
      name TEXT NOT NULL,
      is_public INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_collections_user_section ON collections(user_id, section);

    CREATE TABLE IF NOT EXISTS collection_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      collection_id INTEGER NOT NULL,
      item_type TEXT NOT NULL CHECK (item_type IN ('shop')),
      item_id INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      UNIQUE(collection_id, item_type, item_id)
    );
    CREATE INDEX IF NOT EXISTS idx_collection_items_collection ON collection_items(collection_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_collection_items_item ON collection_items(item_type, item_id);
  `);
  const columns = db.prepare("PRAGMA table_info(users)").all().map(function (column) { return column.name; });
  if (columns.indexOf("default_collection_shops") === -1) {
    db.exec("ALTER TABLE users ADD COLUMN default_collection_shops INTEGER");
  }
  if (columns.indexOf("collection_default_public") === -1) {
    db.exec("ALTER TABLE users ADD COLUMN collection_default_public INTEGER NOT NULL DEFAULT 0");
  }
}

function serializeCollection(row) {
  return {
    id: Number(row.id),
    section: row.section,
    name: row.name,
    is_public: Number(row.is_public) === 1,
    created_at: row.created_at,
    items_count: Number(row.items_count || 0)
  };
}

function listForUser(db, userId, section) {
  return db
    .prepare(
      "SELECT c.*, (SELECT COUNT(*) FROM collection_items i WHERE i.collection_id = c.id) AS items_count " +
        "FROM collections c WHERE c.user_id = ? AND c.section = ? ORDER BY c.created_at ASC, c.id ASC"
    )
    .all(userId, section);
}

// 他人主页：只返回公开收藏夹（仅必吃榜）
function listPublicForUser(db, userId) {
  return db
    .prepare(
      "SELECT c.*, (SELECT COUNT(*) FROM collection_items i WHERE i.collection_id = c.id) AS items_count " +
        "FROM collections c WHERE c.user_id = ? AND c.is_public = 1 " +
        "ORDER BY c.section ASC, c.created_at ASC, c.id ASC"
    )
    .all(userId);
}

// 该版块一个收藏夹都没有时，自动创建「默认收藏夹」。
function ensureDefault(db, userId, section) {
  const existing = db
    .prepare("SELECT id FROM collections WHERE user_id = ? AND section = ? ORDER BY created_at ASC, id ASC LIMIT 1")
    .get(userId, section);
  if (existing) return false;
  db.prepare("INSERT INTO collections (user_id, section, name) VALUES (?, ?, ?)").run(userId, section, DEFAULT_NAME);
  return true;
}

function create(db, userId, section, name, isPublic) {
  const info = db
    .prepare("INSERT INTO collections (user_id, section, name, is_public) VALUES (?, ?, ?, ?)")
    .run(userId, section, name, isPublic === 1 ? 1 : 0);
  return db.prepare("SELECT * FROM collections WHERE id = ?").get(Number(info.lastInsertRowid));
}

function getById(db, id) {
  return db.prepare("SELECT * FROM collections WHERE id = ?").get(id) || null;
}

function addItem(db, collectionId, itemType, itemId) {
  const info = db
    .prepare("INSERT OR IGNORE INTO collection_items (collection_id, item_type, item_id) VALUES (?, ?, ?)")
    .run(collectionId, itemType, itemId);
  return Number(info.changes) > 0;
}

function removeItem(db, collectionId, itemType, itemId) {
  const info = db
    .prepare("DELETE FROM collection_items WHERE collection_id = ? AND item_type = ? AND item_id = ?")
    .run(collectionId, itemType, itemId);
  return Number(info.changes) > 0;
}

function setPublic(db, collectionId, isPublic) {
  db.prepare("UPDATE collections SET is_public = ? WHERE id = ?").run(isPublic ? 1 : 0, collectionId);
}

function pageItems(db, collectionId, page) {
  const total = Number(
    db.prepare("SELECT COUNT(*) AS n FROM collection_items WHERE collection_id = ?").get(collectionId).n
  );
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, Number(page) || 1), totalPages);
  const offset = (safePage - 1) * PAGE_SIZE;
  const items = db
    .prepare(
      "SELECT * FROM collection_items WHERE collection_id = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?"
    )
    .all(collectionId, PAGE_SIZE, offset);
  return { items: items, total: total, page: safePage, page_size: PAGE_SIZE, total_pages: totalPages };
}

function defaultsOf(db, userId) {
  const row = db
    .prepare("SELECT default_collection_shops FROM users WHERE id = ?")
    .get(userId);
  return {
    shops: row && row.default_collection_shops !== null && row.default_collection_shops !== undefined
      ? Number(row.default_collection_shops)
      : null
  };
}

function saveDefaults(db, userId, defaults) {
  db.prepare("UPDATE users SET default_collection_shops = ? WHERE id = ?").run(
    defaults.shops === null || defaults.shops === undefined ? null : Number(defaults.shops),
    userId
  );
}

module.exports = {
  SECTIONS,
  ITEM_TYPES,
  SECTION_ITEM_TYPE,
  PAGE_SIZE,
  NAME_MAX,
  DEFAULT_NAME,
  sectionOf,
  itemTypeOf,
  positiveInt,
  defaultField,
  migrate,
  serializeCollection,
  listForUser,
  listPublicForUser,
  ensureDefault,
  create,
  getById,
  addItem,
  removeItem,
  setPublic,
  pageItems,
  defaultsOf,
  saveDefaults
};
