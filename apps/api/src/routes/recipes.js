const fs = require('fs');

const { withUpload } = require('../upload');
const { query } = require('../../../../packages/db/src/client.ts');

const dishStore = require('../domain/dishes/store');

const { evaluateAutoTitles } = require('../domain/titles/rules');

module.exports = function mountRecipesRoutes(app, services) {
  const { db, requireLogin, UPLOAD_DIR } = services;
  app.get('/api/recipes', function (c) {
    const rows = query(
      db,
      'SELECT r.*, u.role AS role, u.show_role AS show_role FROM recipes r LEFT JOIN users u ON u.id = r.user_id ORDER BY r.name COLLATE NOCASE ASC, r.id ASC',
    ).all();
    c.res = c.json({ recipes: rows });
  });
  app.post('/api/recipes', requireLogin, async function (c) {
    return withUpload(c, { directory: UPLOAD_DIR, maxBytes: 2097152 }, 'image', function (err) {
      if (err) {
        c.res = c.json({ error: err.message }, 400);
        return;
      }
      const body = c.get('body') || {};
      function reject(message) {
        if (c.get('file')) {
          try {
            fs.unlinkSync(c.get('file').path);
          } catch (error) {
            if (error.code !== 'ENOENT') console.error('评价图片清理失败', error.code);
          }
        }
        return (c.res = c.json({ error: message }, 400));
      }
      const dish = dishStore.findDish(db, body.dish_id);
      const rating = Number(body.rating);
      const comment = typeof body.comment === 'string' ? body.comment.trim() || null : null;
      if (!dish) return reject('请从下拉列表选择已有菜品');
      if (
        !['string', 'number'].includes(typeof body.rating) ||
        String(body.rating).trim() === '' ||
        !Number.isInteger(rating) ||
        rating < 1 ||
        rating > 5
      )
        return reject('评分必须是 1 到 5 的整数');
      if (body.comment !== undefined && typeof body.comment !== 'string')
        return reject('评论格式无效');
      if (comment && comment.length > 500) return reject('评论不能超过 500 字');
      const imageUrl = c.get('file') ? '/uploads/' + c.get('file').filename : null;
      const info = query(
        db,
        'INSERT INTO recipes (dish_id, user_id, username, name, rating, comment, image_url, is_weekly) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(
        dish.id,
        c.get('user').id,
        c.get('user').username,
        dish.name,
        rating,
        comment,
        imageUrl,
        0,
      );
      evaluateAutoTitles(db, c.get('user').id);
      const recipe = query(db, 'SELECT * FROM recipes WHERE id = ?').get(
        Number(info.lastInsertRowid),
      );
      c.res = c.json({ recipe: recipe }, 201);
    });
  });
};
