const { query } = require('../../../../packages/db/src/client.ts');

const { equippedTitle: equippedTitleOf, ownedTitles } = require('../domain/titles/store');

module.exports = function mountProfileRoutes(app, services) {
  const { requireLogin, db } = services;
  app.get('/api/user/profile', requireLogin, function (c) {
    const user = query(
      db,
      'SELECT id, display_id, username, nickname, avatar_url, signature, role, default_page, default_floor, recipe_default_view, shop_default_sort, shop_default_type, shop_layout, shop_layout_mode, default_collection_shops, collection_default_public, show_role, status FROM users WHERE id = ?',
    ).get(c.get('user').id);
    if (!user) {
      c.res = c.json({ error: 'user not found' }, 404);
      return;
    }
    c.res = c.json({
      user: Object.assign({}, user, {
        title: equippedTitleOf(db, c.get('user').id),
      }),
    });
  });
  app.get('/api/users/:id/profile', function (c) {
    const id = parseInt(c.req.param().id, 10);
    if (isNaN(id)) {
      c.res = c.json({ error: 'user not found' }, 404);
      return;
    }
    const user = query(
      db,
      'SELECT id, display_id, username, nickname, avatar_url, signature, role, show_role, status FROM users WHERE id = ?',
    ).get(id);
    if (!user) {
      c.res = c.json({ error: 'user not found' }, 404);
      return;
    }
    c.res = c.json({ user: Object.assign({}, user, { title: equippedTitleOf(db, id) }) });
  });
  app.get('/api/users/:id/titles', function (c) {
    const id = parseInt(c.req.param().id, 10);
    const exists = !isNaN(id) && query(db, 'SELECT id FROM users WHERE id = ?').get(id);
    if (!exists) {
      c.res = c.json({ error: 'user not found' }, 404);
      return;
    }
    const titles = ownedTitles(db, id).map(function (t) {
      return {
        id: t.id,
        name: t.name,
        hue: t.hue,
        description: t.description,
        source: t.source,
        equipped: t.equipped,
      };
    });
    c.res = c.json({ titles: titles });
  });
  app.put('/api/user/settings', requireLogin, function (c) {
    const body = c.get('body') || {};
    const current = query(
      db,
      'SELECT default_page, default_floor, recipe_default_view, shop_default_sort, shop_default_type, shop_layout, shop_layout_mode, collection_default_public, show_role FROM users WHERE id = ?',
    ).get(c.get('user').id);
    if (!current) {
      c.res = c.json({ error: 'user not found' }, 404);
      return;
    }
    const allowedPages = ['index.html', 'map.html', 'recipe.html'];
    let collectionDefaultPublic = current.collection_default_public;
    if (body.collection_default_public !== undefined) {
      if (body.collection_default_public !== 0 && body.collection_default_public !== 1) {
        c.res = c.json({ error: '默认公开设置只能是 0 或 1' }, 400);
        return;
      }
      collectionDefaultPublic = body.collection_default_public;
    }
    let defaultPage = current.default_page;
    if (body.default_page !== undefined) {
      defaultPage =
        allowedPages.indexOf(body.default_page) === -1 ? 'index.html' : body.default_page;
    }
    let defaultFloor = current.default_floor;
    if (body.default_floor !== undefined) {
      const floor = parseInt(body.default_floor, 10);
      defaultFloor = isNaN(floor) || floor < 1 || floor > 4 ? 1 : floor;
    }
    let recipeView = current.recipe_default_view;
    if (body.recipe_default_view !== undefined) {
      recipeView =
        ['all', 'reviews', 'weekly', 'daily'].indexOf(body.recipe_default_view) === -1
          ? 'all'
          : body.recipe_default_view;
    }
    const allowedShopSorts = ['campus', 'az', 'metro', 'likes', 'reviews', 'rating', 'new'];
    let shopSort = current.shop_default_sort;
    if (body.shop_default_sort !== undefined) {
      shopSort =
        allowedShopSorts.indexOf(body.shop_default_sort) === -1 ? 'campus' : body.shop_default_sort;
    }
    let shopType = current.shop_default_type;
    if (body.shop_default_type !== undefined) {
      shopType =
        typeof body.shop_default_type === 'string'
          ? body.shop_default_type.trim().slice(0, 20)
          : '';
    }
    let shopLayout = current.shop_layout;
    if (body.shop_layout !== undefined) {
      shopLayout = body.shop_layout === 'split' ? 'split' : 'stacked';
    }
    let shopLayoutMode = current.shop_layout_mode;
    if (body.shop_layout_mode !== undefined) {
      shopLayoutMode = body.shop_layout_mode === 'auto' ? 'auto' : 'manual';
    }
    let showRole = current.show_role;
    if (body.show_role !== undefined) {
      showRole = body.show_role === 0 || body.show_role === false || body.show_role === '0' ? 0 : 1;
    }
    query(
      db,
      'UPDATE users SET default_page = ?, default_floor = ?, recipe_default_view = ?, shop_default_sort = ?, shop_default_type = ?, shop_layout = ?, shop_layout_mode = ?, collection_default_public = ?, show_role = ? WHERE id = ?',
    ).run(
      defaultPage,
      defaultFloor,
      recipeView,
      shopSort,
      shopType,
      shopLayout,
      shopLayoutMode,
      collectionDefaultPublic,
      showRole,
      c.get('user').id,
    );
    c.res = c.json({
      default_page: defaultPage,
      default_floor: defaultFloor,
      recipe_default_view: recipeView,
      shop_default_sort: shopSort,
      shop_default_type: shopType,
      shop_layout: shopLayout,
      shop_layout_mode: shopLayoutMode,
      collection_default_public: collectionDefaultPublic,
      show_role: showRole,
    });
  });
};
