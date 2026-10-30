const { query } = require('../../../../../packages/db/src/client.ts');
const { nameKey } = require('../menu/schema');
const REVIEW_PAGE_SIZE = 20;
function migrate(db) {
  const columns = query(db, 'PRAGMA table_info(recipes)').all();
  if (!columns.some((column) => column.name === 'dish_id')) {
    db.$client.exec('ALTER TABLE recipes ADD COLUMN dish_id INTEGER REFERENCES dishes(id)');
  }
  db.$client.exec(
    'CREATE INDEX IF NOT EXISTS idx_recipes_dish ON recipes(dish_id, created_at DESC, id DESC)',
  );
  const pending = query(
    db,
    'SELECT id, name FROM recipes WHERE dish_id IS NULL AND is_weekly = 0',
  ).all();
  if (!pending.length) return;
  const find = query(db, 'SELECT id FROM dishes WHERE name_key = ?');
  const link = query(db, 'UPDATE recipes SET dish_id = ? WHERE id = ? AND dish_id IS NULL');
  db.$client.exec('BEGIN IMMEDIATE');
  try {
    for (const review of pending) {
      const dish = find.get(nameKey(review.name));
      if (dish) link.run(dish.id, review.id);
    }
    db.$client.exec('COMMIT');
  } catch (error) {
    db.$client.exec('ROLLBACK');
    throw error;
  }
}
function findDish(db, value) {
  if (!['string', 'number'].includes(typeof value) || !/^[1-9]\d*$/.test(String(value)))
    return null;
  const id = Number(value);
  if (!Number.isSafeInteger(id)) return null;
  return (
    query(
      db,
      `SELECT id, name, initial, pinyin, pinyin_initials, sort_key FROM dishes
    WHERE id = ?`,
    ).get(id) || null
  );
}
function detail(db, value) {
  const dish = findDish(db, value);
  if (!dish) return null;
  const summary = query(
    db,
    `SELECT COUNT(*) AS reviews_count, AVG(rating) AS rating_avg
    FROM recipes WHERE dish_id = ? AND is_weekly = 0`,
  ).get(dish.id);
  return {
    ...dish,
    reviews_count: summary.reviews_count,
    rating_avg: summary.rating_avg === null ? null : Number(summary.rating_avg.toFixed(1)),
  };
}
function reviews(db, dishId, offset) {
  const rows = query(
    db,
    `SELECT * FROM recipes WHERE dish_id = ? AND is_weekly = 0
    ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
  ).all(dishId, REVIEW_PAGE_SIZE, offset);
  const total = query(
    db,
    'SELECT COUNT(*) AS total FROM recipes WHERE dish_id = ? AND is_weekly = 0',
  ).get(dishId).total;
  return { reviews: rows, total, offset, has_more: offset + rows.length < total };
}
module.exports = { migrate, findDish, detail, reviews };
