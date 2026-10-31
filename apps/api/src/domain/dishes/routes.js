const { setHeaders } = require('../../http');
const store = require('./store');
const { query } = require('../../../../../packages/db/src/client.ts');
function mountDishRoutes(app, db, attachAuthors) {
  app.get('/api/dishes/:id', function (c) {
    const dish = store.detail(db, c.req.param().id);
    if (!dish) return (c.res = c.json({ error: '菜品不存在或已不在当前目录中' }, 404));
    setHeaders(c, 'Cache-Control', 'no-store');
    const supplies = query(
      db,
      `SELECT r.date,r.time_json,r.place,r.group_name,r.price,r.spicy,s.url,s.title
      FROM menu_records r JOIN menu_sources s ON s.id=r.source_id
      WHERE r.dish_id=? ORDER BY r.date DESC,r.place LIMIT 100`,
    )
      .all(dish.id)
      .map(({ time_json, spicy, ...row }) => ({
        ...row,
        time: JSON.parse(time_json),
        spicy: spicy === null ? null : !!spicy,
      }));
    c.res = c.json({ dish, supplies });
  });
  app.get('/api/dishes/:id/reviews', function (c) {
    const dish = store.findDish(db, c.req.param().id);
    if (!dish) return (c.res = c.json({ error: '菜品不存在或已不在当前目录中' }, 404));
    const rawOffset = c.req.query().offset === undefined ? '0' : c.req.query().offset;
    if (
      c.req.queries('offset')?.length > 1 ||
      typeof rawOffset !== 'string' ||
      !/^(0|[1-9]\d*)$/.test(rawOffset) ||
      !Number.isSafeInteger(Number(rawOffset)) ||
      Number(rawOffset) > 1000000
    ) {
      return (c.res = c.json({ error: '评价分页参数无效' }, 400));
    }
    const result = store.reviews(db, dish.id, Number(rawOffset));
    const reviewId = Number(c.req.query().review);
    if (Number.isSafeInteger(reviewId) && reviewId > 0) {
      result.focus_review =
        query(db, 'SELECT * FROM recipes WHERE id=? AND dish_id=? AND is_weekly=0').get(
          reviewId,
          dish.id,
        ) || null;
      if (result.focus_review) attachAuthors([result.focus_review]);
    }
    attachAuthors(result.reviews);
    setHeaders(c, 'Cache-Control', 'no-store');
    c.res = c.json(result);
  });
}
module.exports = { mountDishRoutes };
