"use strict";

const { nameKey } = require("../menu/schema");
const REVIEW_PAGE_SIZE = 20;

function migrate(db) {
  const columns = db.prepare("PRAGMA table_info(recipes)").all();
  if (!columns.some(column => column.name === "dish_id")) {
    db.exec("ALTER TABLE recipes ADD COLUMN dish_id INTEGER REFERENCES dishes(id)");
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_recipes_dish ON recipes(dish_id, created_at DESC, id DESC)");
  const pending = db.prepare("SELECT id, name FROM recipes WHERE dish_id IS NULL AND is_weekly = 0").all();
  if (!pending.length) return;
  const find = db.prepare("SELECT id FROM dishes WHERE name_key = ?");
  const link = db.prepare("UPDATE recipes SET dish_id = ? WHERE id = ? AND dish_id IS NULL");
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const review of pending) {
      const dish = find.get(nameKey(review.name));
      if (dish) link.run(dish.id, review.id);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function findDish(db, value) {
  if (!["string", "number"].includes(typeof value) || !/^[1-9]\d*$/.test(String(value))) return null;
  const id = Number(value);
  if (!Number.isSafeInteger(id)) return null;
  return db.prepare(`SELECT id, name, initial, pinyin, pinyin_initials, sort_key FROM dishes
    WHERE id = ? AND EXISTS (SELECT 1 FROM menu_records WHERE menu_records.dish_id = dishes.id)`).get(id) || null;
}

function detail(db, value) {
  const dish = findDish(db, value);
  if (!dish) return null;
  const summary = db.prepare(`SELECT COUNT(*) AS reviews_count, AVG(rating) AS rating_avg
    FROM recipes WHERE dish_id = ? AND is_weekly = 0`).get(dish.id);
  return { ...dish, reviews_count: summary.reviews_count,
    rating_avg: summary.rating_avg === null ? null : Number(summary.rating_avg.toFixed(1)) };
}

function reviews(db, dishId, offset) {
  const rows = db.prepare(`SELECT * FROM recipes WHERE dish_id = ? AND is_weekly = 0
    ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`).all(dishId, REVIEW_PAGE_SIZE, offset);
  const total = db.prepare("SELECT COUNT(*) AS total FROM recipes WHERE dish_id = ? AND is_weekly = 0").get(dishId).total;
  return { reviews: rows, total, offset, has_more: offset + rows.length < total };
}

module.exports = { migrate, findDish, detail, reviews };
