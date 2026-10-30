const { setHeaders } = require('../../http');
const { query } = require('../../../../../packages/db/src/client.ts');
/* 收藏夹（#23）：路由
   - GET    /api/collections?section=shops   当前用户的收藏夹（没有则自动建「默认收藏夹」）
   - POST   /api/collections                       新建收藏夹 { section, name }
   - POST   /api/collections/:id/items             收藏 { item_type, item_id }
   - DELETE /api/collections/:id/items/:itemType/:itemId  取消收藏
   - GET    /api/collections/:id/items?page=1      分页读取收藏项（每页 20）
   - PUT    /api/collections/:id/public            切换公开状态 { is_public }
   - PUT    /api/user/settings/collection          保存默认收藏夹设置 */
const { Hono } = require('hono');
const store = require('./store');
function mountCollectionRoutes(app, db, options) {
  const opt = options || {};
  const requireLogin =
    opt.requireLogin ||
    async function (c, next) {
      return next();
    };
  const authenticate = opt.authenticate || requireLogin;
  function fail(c, status, error, message) {
    c.res = c.json({ error: error, message: message || error }, status);
  }
  function ownedCollection(c) {
    const id = store.positiveInt(c.req.param().id);
    if (!id) {
      fail(c, 404, 'collection not found', '收藏夹不存在');
      return null;
    }
    const row = store.getById(db, id);
    if (!row) {
      fail(c, 404, 'collection not found', '收藏夹不存在');
      return null;
    }
    if (Number(row.user_id) !== Number(c.get('user').id)) {
      fail(c, 403, 'forbidden', '无权操作该收藏夹');
      return null;
    }
    return row;
  }
  function shopCard(row) {
    return {
      id: row.id,
      name: row.name,
      address: row.address,
      location_note: row.location_note || '',
      dianping_url: row.dianping_url || '',
      type: row.type,
      lat: row.lat,
      lng: row.lng,
      campus_distance_m: row.campus_distance_m || row.north_gate_distance_m || 0,
      campus_walk_min: row.campus_walk_min || row.north_gate_walk_min || 0,
      metro_station: row.metro_station,
      metro_exit: row.metro_exit,
      metro_distance_m: row.metro_distance_m,
      metro_walk_min: row.metro_walk_min,
      likes_count: Number(row.likes_count || 0),
      reviews_count: Number(row.reviews_count || 0),
      ratings_count: Number(row.ratings_count || 0),
      rating_avg:
        row.rating_avg === null || row.rating_avg === undefined ? null : Number(row.rating_avg),
      created_at: row.created_at,
      created_by: row.created_by_name || '',
    };
  }
  // 按 item_type 批量取店铺详情；已删除的内容保留占位并标记 deleted。
  function describeItems(rows) {
    if (!rows.length) return [];
    const shopIds = [];
    rows.forEach(function (row) {
      const id = Number(row.item_id);
      if (row.item_type === 'shop' && shopIds.indexOf(id) === -1) shopIds.push(id);
    });
    const shops = new Map();
    if (shopIds.length) {
      const marks = shopIds
        .map(function () {
          return '?';
        })
        .join(',');
      const shopRows = query(
        db,
        'SELECT s.*, ' +
          '(SELECT COUNT(*) FROM shop_likes l WHERE l.shop_id = s.id) AS likes_count, ' +
          '(SELECT COUNT(*) FROM shop_reviews r WHERE r.shop_id = s.id) AS reviews_count, ' +
          '(SELECT COUNT(rating) FROM shop_reviews r WHERE r.shop_id = s.id) AS ratings_count, ' +
          '(SELECT ROUND(AVG(rating), 2) FROM shop_reviews r WHERE r.shop_id = s.id) AS rating_avg ' +
          'FROM shops s WHERE s.id IN (' +
          marks +
          ')',
      ).all(...shopIds);
      shopRows.forEach(function (shop) {
        shops.set(Number(shop.id), shop);
      });
    }
    return rows.map(function (item) {
      const base = {
        id: Number(item.id),
        collection_id: Number(item.collection_id),
        item_type: item.item_type,
        item_id: Number(item.item_id),
        added_at: item.created_at,
      };
      const shop = shops.get(Number(item.item_id));
      if (!shop) return Object.assign(base, { deleted: true });
      return Object.assign(base, { deleted: false, shop: shopCard(shop) });
    });
  }
  const router = new Hono();
  router.use('*', async function (c, next) {
    setHeaders(c, 'Cache-Control', 'no-store');
    return next();
  });
  router.get('/collections', requireLogin, function (c) {
    const section = store.sectionOf(c.req.query().section);
    if (!section) {
      fail(c, 400, 'invalid section', '版块只能是 shops');
      return;
    }
    store.ensureDefault(db, c.get('user').id, section);
    c.res = c.json({
      section: section,
      collections: store.listForUser(db, c.get('user').id, section).map(store.serializeCollection),
      defaults: store.defaultsOf(db, c.get('user').id),
    });
  });
  router.post('/collections', requireLogin, function (c) {
    const body = c.get('body') || {};
    const section = store.sectionOf(body.section);
    if (!section) {
      fail(c, 400, 'invalid section', '版块只能是 shops');
      return;
    }
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name || name.length > store.NAME_MAX) {
      fail(c, 400, 'invalid name', '收藏夹名称需为 1–' + store.NAME_MAX + ' 个字符');
      return;
    }
    let isPublic = body.is_public;
    if (isPublic === undefined) {
      const user = query(db, 'SELECT collection_default_public FROM users WHERE id = ?').get(
        c.get('user').id,
      );
      isPublic = user && user.collection_default_public === 1 ? 1 : 0;
    } else if (isPublic !== 0 && isPublic !== 1) {
      fail(c, 400, 'invalid is_public', '收藏夹公开状态只能是 0 或 1');
      return;
    }
    const row = store.create(db, c.get('user').id, section, name, isPublic);
    c.res = c.json({ collection: store.serializeCollection(row) }, 201);
  });
  router.post('/collections/:id/items', requireLogin, function (c) {
    const collection = ownedCollection(c);
    if (!collection) return;
    const body = c.get('body') || {};
    const itemType = store.itemTypeOf(body.item_type);
    const itemId = store.positiveInt(body.item_id);
    if (!itemType) {
      fail(c, 400, 'invalid item_type', '条目类型只能是 shop');
      return;
    }
    if (!itemId) {
      fail(c, 400, 'invalid item_id', '条目编号无效');
      return;
    }
    if (itemType !== store.SECTION_ITEM_TYPE[collection.section]) {
      fail(c, 400, 'item_type mismatch', '必吃榜收藏夹只能收藏店铺');
      return;
    }
    const exists = query(db, 'SELECT id FROM shops WHERE id = ?').get(itemId);
    if (!exists) {
      fail(c, 404, 'item not found', '店铺不存在或已被删除');
      return;
    }
    const added = store.addItem(db, collection.id, itemType, itemId);
    c.res = c.json(
      {
        added: added,
        collection_id: Number(collection.id),
        item_type: itemType,
        item_id: itemId,
      },
      added ? 201 : 200,
    );
  });
  router.delete('/collections/:id/items/:itemType/:itemId', requireLogin, function (c) {
    const collection = ownedCollection(c);
    if (!collection) return;
    const itemType = store.itemTypeOf(c.req.param().itemType);
    const itemId = store.positiveInt(c.req.param().itemId);
    if (!itemType) {
      fail(c, 400, 'invalid item_type', '条目类型只能是 shop');
      return;
    }
    if (!itemId) {
      fail(c, 400, 'invalid item_id', '条目编号无效');
      return;
    }
    if (itemType !== store.SECTION_ITEM_TYPE[collection.section]) {
      fail(c, 400, 'item_type mismatch', '必吃榜收藏夹只能操作店铺');
      return;
    }
    const removed = store.removeItem(db, collection.id, itemType, itemId);
    c.res = c.json({
      removed: removed,
      collection_id: Number(collection.id),
      item_type: itemType,
      item_id: itemId,
    });
  });
  router.get('/collections/:id/items', authenticate, function (c) {
    const id = store.positiveInt(c.req.param().id);
    const collection = id ? store.getById(db, id) : null;
    if (!collection) {
      fail(c, 404, 'collection not found', '收藏夹不存在');
      return;
    }
    const viewerId =
      c.get('user') && c.get('user').id !== null && c.get('user').id !== undefined
        ? Number(c.get('user').id)
        : null;
    const isOwner = viewerId !== null && Number(collection.user_id) === viewerId;
    if (!isOwner && Number(collection.is_public) !== 1) {
      if (viewerId === null) {
        fail(c, 401, 'login required', '请先登录');
      } else {
        fail(c, 403, 'forbidden', '该收藏夹未公开');
      }
      return;
    }
    const result = store.pageItems(db, collection.id, c.req.query().page);
    c.res = c.json({
      collection: store.serializeCollection(
        Object.assign({}, collection, { items_count: result.total }),
      ),
      items: describeItems(result.items),
      page: result.page,
      page_size: result.page_size,
      total: result.total,
      total_pages: result.total_pages,
    });
  });
  // 他人主页：只读的公开收藏夹（可匿名访问）
  router.get('/users/:id/collections', function (c) {
    const id = store.positiveInt(c.req.param().id);
    const user = id ? query(db, 'SELECT id FROM users WHERE id = ?').get(id) : null;
    if (!user) {
      fail(c, 404, 'user not found', '用户不存在');
      return;
    }
    c.res = c.json({ collections: store.listPublicForUser(db, id).map(store.serializeCollection) });
  });
  router.put('/collections/:id/public', requireLogin, function (c) {
    const collection = ownedCollection(c);
    if (!collection) return;
    const body = c.get('body') || {};
    if (body.is_public === undefined) {
      fail(c, 400, 'invalid is_public', '请提供 is_public');
      return;
    }
    const isPublic =
      body.is_public === true || body.is_public === 1 || body.is_public === '1' ? 1 : 0;
    store.setPublic(db, collection.id, isPublic);
    const updated = store.getById(db, collection.id);
    const itemsCount = Number(
      query(db, 'SELECT COUNT(*) AS n FROM collection_items WHERE collection_id = ?').get(
        collection.id,
      ).n,
    );
    c.res = c.json({
      collection: store.serializeCollection(
        Object.assign({}, updated, { items_count: itemsCount }),
      ),
    });
  });
  // 默认收藏夹：同时支持
  //   1) { default_collection_shops }
  //   2) { section: 'shops', collection_id }
  router.put('/user/settings/collection', requireLogin, function (c) {
    const body = c.get('body') || {};
    const current = store.defaultsOf(db, c.get('user').id);
    const next = { shops: current.shops };
    function apply(field, value) {
      if (value === null) {
        next.shops = field === 'default_collection_shops' ? null : next.shops;
        return null;
      }
      const id = store.positiveInt(value);
      if (!id) return '收藏夹编号无效';
      const row = store.getById(db, id);
      const expectedSection = 'shops';
      if (
        !row ||
        Number(row.user_id) !== Number(c.get('user').id) ||
        row.section !== expectedSection
      ) {
        return '请选择本人的对应版块收藏夹';
      }
      next.shops = id;
      return null;
    }
    let error = null;
    if (body.section !== undefined) {
      const section = store.sectionOf(body.section);
      if (!section) {
        fail(c, 400, 'invalid section', '版块只能是 shops');
        return;
      }
      const field = 'default_collection_shops';
      const value = body.collection_id !== undefined ? body.collection_id : body.collectionId;
      error = apply(field, value === undefined ? null : value);
    }
    if (!error && body.default_collection_shops !== undefined) {
      error = apply('default_collection_shops', body.default_collection_shops);
    }
    if (error) {
      fail(c, 400, 'invalid default collection', error);
      return;
    }
    store.saveDefaults(db, c.get('user').id, next);
    c.res = c.json({ default_collection_shops: next.shops });
  });
  app.route('/api', router);
}
module.exports = { mountCollectionRoutes };
