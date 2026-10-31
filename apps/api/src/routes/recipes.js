const { query } = require('../../../../packages/db/src/client.ts');

module.exports = function mountRecipesRoutes(app, services) {
  const { db } = services;
  app.get('/api/recipes', function (c) {
    const rows = query(
      db,
      'SELECT r.*, u.role AS role, u.show_role AS show_role FROM recipes r LEFT JOIN users u ON u.id = r.user_id ORDER BY r.name COLLATE NOCASE ASC, r.id ASC',
    ).all();
    c.res = c.json({ recipes: rows });
  });
};
