const { setHeaders, setContentType } = require('../../http');
const { query } = require('../../../../../packages/db/src/client.ts');
/* 三元坊必吃榜 · 路由（#6）
   - GET  /api/shops         公开：列表（类型筛选 + 排序）
   - GET  /api/shops/meta    公开：预设类型、地图配置、上传权限
   - GET  /api/shops/:id     公开：单店详情
   - POST /api/shops         需要 shop_create 权限（默认 student 及以上，后端强校验） */
const { Hono } = require('hono');
const fs = require('node:fs');
const path = require('node:path');
const { withUpload } = require('../../upload');
const store = require('./store');
const { equippedTitleMap } = require('../titles/store');
function intParam(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}
function mountShopRoutes(app, db, options) {
  const opt = options || {};
  const root = opt.root;
  const authenticate =
    opt.authenticate ||
    async function (c, next) {
      return next();
    };
  const requirePermission = opt.requirePermission;
  const requireCreate = requirePermission
    ? requirePermission('shop_create')
    : async function (c, next) {
        authenticate(c, next);
      };
  const createMinRole = opt.createMinRole || 'student';
  const mapServiceKey = opt.mapServiceKey || '';
  const staticMapCache = new Map();
  // 评价配图：JPG / PNG，2 MB 内，存 uploads/shops
  const REVIEWS_DIR = path.join(root, 'uploads', 'shops');
  if (!fs.existsSync(REVIEWS_DIR)) fs.mkdirSync(REVIEWS_DIR, { recursive: true });
  const reviewUpload = { directory: REVIEWS_DIR, maxBytes: 2 * 1024 * 1024 };
  // 删除评价配图文件（仅限本目录内，防路径穿越）
  function removeReviewImage(url) {
    const s = String(url || '');
    if (!s.startsWith('/uploads/shops/')) return;
    fs.unlink(path.join(REVIEWS_DIR, path.basename(s)), function () {});
  }
  const router = new Hono();
  router.use('*', async function (c, next) {
    setHeaders(c, 'Cache-Control', 'no-store');
    return next();
  });
  function fail(c, error) {
    const status = error instanceof store.ShopError ? error.status : 500;
    const body = {
      error: error.error || 'shop error',
      message: error.message || '操作失败，请稍后再试',
    };
    if (error.fields) body.fields = error.fields;
    if (error.existing_id !== undefined) body.existing_id = error.existing_id;
    if (status === 500) console.error('[shops]', error);
    c.res = c.json(body, status);
  }
  // 复用 server.js 的 hasPermission：角色权重达到默认等级，或存在显式授权
  function canCreate(c) {
    if (!opt.hasPermission) return false;
    return !!opt.hasPermission(c, 'shop_create');
  }
  // Eligibility is based on the current database role/status, never a stale JWT role.
  function canInteract(c) {
    return !!(opt.isVerifiedStudent && opt.isVerifiedStudent(c));
  }
  async function requireVerifiedStudent(c, next) {
    if (!c.get('user') || c.get('user').id === null || c.get('user').id === undefined) {
      c.res = c.json({ error: 'login required', message: '请先登录后再点赞或评价' }, 401);
      return;
    }
    if (!canInteract(c)) {
      c.res = c.json(
        { error: 'verified student required', message: '学生及以上权限可点赞或评价' },
        403,
      );
      return;
    }
    return next();
  }
  function attachEngagement(shops, userId) {
    if (!shops.length) return [];
    const ids = shops.map(function (shop) {
      return shop.id;
    });
    const marks = ids
      .map(function () {
        return '?';
      })
      .join(',');
    const sql = `SELECT s.id AS shop_id,
      (SELECT COUNT(*) FROM shop_likes l WHERE l.shop_id = s.id) AS likes_count,
      (SELECT COUNT(*) FROM shop_reviews r WHERE r.shop_id = s.id) AS reviews_count,
      (SELECT COUNT(rating) FROM shop_reviews r WHERE r.shop_id = s.id) AS ratings_count,
      (SELECT ROUND(AVG(rating), 2) FROM shop_reviews r WHERE r.shop_id = s.id) AS rating_avg,
      (SELECT COUNT(*) FROM shop_likes l WHERE l.shop_id = s.id AND l.user_id = ?) AS user_liked,
      (SELECT rating FROM shop_reviews r WHERE r.shop_id = s.id AND r.user_id = ? LIMIT 1) AS user_rating,
      (SELECT content FROM shop_reviews r WHERE r.shop_id = s.id AND r.user_id = ? LIMIT 1) AS user_review_content
      FROM shops s WHERE s.id IN (${marks})`;
    const viewerId = userId === null || userId === undefined ? -1 : userId;
    const rows = query(db, sql).all(viewerId, viewerId, viewerId, ...ids);
    const byId = new Map(
      rows.map(function (row) {
        return [Number(row.shop_id), row];
      }),
    );
    return shops.map(function (shop) {
      const stats = byId.get(Number(shop.id)) || {};
      return Object.assign({}, shop, {
        likes_count: Number(stats.likes_count || 0),
        reviews_count: Number(stats.reviews_count || 0),
        ratings_count: Number(stats.ratings_count || 0),
        rating_avg:
          stats.rating_avg === null || stats.rating_avg === undefined
            ? null
            : Number(stats.rating_avg),
        user_liked: Number(stats.user_liked || 0) > 0,
        user_rating: stats.user_rating === undefined ? null : stats.user_rating,
        user_review_content: stats.user_review_content || '',
      });
    });
  }
  function meta(c) {
    const config = store.loadConfig(root);
    c.res = c.json({
      types: store.types(db),
      total: store.count(db),
      create_min_role: createMinRole,
      can_create: canCreate(c),
      can_interact: canInteract(c),
      area: { name: config.area.name, text: config.area.text },
      map: {
        js_key: opt.mapKey || '',
        security_code: opt.mapSecurityCode || '',
        key_configured: !!opt.mapKey,
        static_map_configured: !!mapServiceKey,
        config_file: 'data/shops-config.json',
        center: config.center,
        anchors: Object.keys(config.anchors).map(function (key) {
          return {
            key: key,
            name: config.anchors[key].name,
            lat: config.anchors[key].point ? config.anchors[key].point.lat : null,
            lng: config.anchors[key].point ? config.anchors[key].point.lng : null,
            configured: !!config.anchors[key].point,
          };
        }),
        area: {
          name: config.area.name,
          polygon: config.area.polygon,
          coordinate_system: config.area.coordinate_system,
        },
      },
    });
  }
  router.get('/shops/meta', authenticate, function (c) {
    meta(c);
  });
  router.get('/shops', authenticate, function (c) {
    try {
      const result = store.list(db, {
        type: c.req.query().type,
        sort: c.req.query().sort,
        q: c.req.query().q,
        distance_min_m: c.req.query().distance_min_m,
        distance_max_m: c.req.query().distance_max_m,
        walk_min: c.req.query().walk_min,
        walk_max: c.req.query().walk_max,
        likes_min: c.req.query().likes_min,
        likes_max: c.req.query().likes_max,
        reviews_min: c.req.query().reviews_min,
        reviews_max: c.req.query().reviews_max,
        rating_min: c.req.query().rating_min,
        rating_max: c.req.query().rating_max,
      });
      const config = store.loadConfig(root);
      const canInteractNow = canInteract(c);
      c.res = c.json({
        shops: attachEngagement(result.shops, c.get('user') && c.get('user').id).map(
          function (shop) {
            return Object.assign(shop, { can_interact: canInteractNow });
          },
        ),
        total: result.total,
        type: result.type || '全部',
        sort: result.sort,
        types: store.types(db),
        create_min_role: createMinRole,
        can_create: canCreate(c),
        can_interact: canInteractNow,
        area: { name: config.area.name, text: config.area.text },
      });
    } catch (error) {
      fail(c, error);
    }
  });
  // Server-side AMap Static Map proxy. The Web Service Key is never returned to the browser.
  router.get('/shops/map-image', async function (c) {
    const config = store.loadConfig(root);
    const center = config.center || { lat: 31.300423, lng: 120.622602, zoom: 16 };
    const polygon = config.area.polygon || [];
    const hasLat = c.req.query().lat !== undefined;
    const hasLng = c.req.query().lng !== undefined;
    if (
      hasLat !== hasLng ||
      (hasLat && (typeof c.req.query().lat !== 'string' || typeof c.req.query().lng !== 'string'))
    ) {
      c.res = c.json({ error: 'invalid map center', message: '地图中心坐标无效' }, 400);
      return;
    }
    let lat = hasLat ? Number(c.req.query().lat) : Number(center.lat);
    let lng = hasLng ? Number(c.req.query().lng) : Number(center.lng);
    const zoom =
      c.req.query().zoom === undefined ? Number(center.zoom || 11) : Number(c.req.query().zoom);
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      !Number.isInteger(zoom) ||
      zoom < 9 ||
      zoom > 18
    ) {
      c.res = c.json({ error: 'invalid map view', message: '地图中心或缩放级别无效' }, 400);
      return;
    }
    if (polygon.length) {
      const minLat =
        Math.min(
          ...polygon.map(function (point) {
            return Number(point[0]);
          }),
        ) - 0.06;
      const maxLat =
        Math.max(
          ...polygon.map(function (point) {
            return Number(point[0]);
          }),
        ) + 0.06;
      const minLng =
        Math.min(
          ...polygon.map(function (point) {
            return Number(point[1]);
          }),
        ) - 0.06;
      const maxLng =
        Math.max(
          ...polygon.map(function (point) {
            return Number(point[1]);
          }),
        ) + 0.06;
      if (lat < minLat || lat > maxLat || lng < minLng || lng > maxLng) {
        c.res = c.json(
          { error: 'map center outside allowed bounds', message: '地图中心超出可浏览范围' },
          400,
        );
        return;
      }
    }
    if (!mapServiceKey) {
      c.res = c.json({ error: 'static map unavailable', message: '高德静态地图服务未配置' }, 503);
      return;
    }
    lat = Number(lat.toFixed(6));
    lng = Number(lng.toFixed(6));
    const cacheKey = [lat, lng, zoom].join(',');
    const now = Date.now();
    const cached = staticMapCache.get(cacheKey);
    if (cached && now - cached.createdAt < 10 * 60 * 1000) {
      staticMapCache.delete(cacheKey);
      staticMapCache.set(cacheKey, cached);
      setContentType(c, 'png');
      setHeaders(c, 'Cache-Control', 'public, max-age=300');
      c.res = c.body(cached.data);
      return;
    }
    try {
      const url = new URL('https://restapi.amap.com/v3/staticmap');
      url.searchParams.set('location', lng + ',' + lat);
      url.searchParams.set('zoom', String(zoom));
      url.searchParams.set('size', '750*420');
      url.searchParams.set('key', mapServiceKey);
      const upstream = await fetch(url, { signal: AbortSignal.timeout(15000) });
      const type = upstream.headers.get('content-type') || '';
      if (!upstream.ok || !/^image\//i.test(type)) {
        c.res = c.json({ error: 'static map upstream error', message: '高德底图暂时不可用' }, 502);
        return;
      }
      const image = Buffer.from(await upstream.arrayBuffer());
      if (!image.length || image.length > 4 * 1024 * 1024) {
        c.res = c.json({ error: 'invalid static map', message: '高德底图响应无效' }, 502);
        return;
      }
      staticMapCache.set(cacheKey, { data: image, createdAt: now });
      while (staticMapCache.size > 32) staticMapCache.delete(staticMapCache.keys().next().value);
      setContentType(c, 'png');
      setHeaders(c, 'Cache-Control', 'public, max-age=300');
      c.res = c.body(image);
    } catch (error) {
      // Do not log the upstream URL: it contains the server-only map key.
      c.res = c.json({ error: 'static map unavailable', message: '高德底图暂时不可用' }, 502);
    }
  });
  router.get('/shops/:id', authenticate, function (c) {
    const id = intParam(c.req.param().id);
    if (id === null) {
      c.res = c.json({ error: 'shop not found', message: '店铺不存在或已被删除' }, 404);
      return;
    }
    const shop = store.get(db, id);
    if (!shop) {
      c.res = c.json({ error: 'shop not found', message: '店铺不存在或已被删除' }, 404);
      return;
    }
    const canInteractNow = canInteract(c);
    const enriched = attachEngagement([shop], c.get('user') && c.get('user').id)[0];
    enriched.can_interact = canInteractNow;
    c.res = c.json({ shop: enriched, can_interact: canInteractNow });
  });
  router.get('/shops/:id/reviews', authenticate, function (c) {
    const id = intParam(c.req.param().id);
    if (id === null || !store.get(db, id)) {
      c.res = c.json({ error: 'shop not found', message: '店铺不存在或已被删除' }, 404);
      return;
    }
    const parsedLimit = Number(c.req.query().limit);
    const limit = Number.isInteger(parsedLimit) ? Math.max(1, Math.min(parsedLimit, 100)) : 20;
    const parsedOffset = Number(c.req.query().offset);
    const offset = Number.isInteger(parsedOffset) ? Math.max(0, parsedOffset) : 0;
    // 头衔系统（#10）：评价卡统一用 UI.userLine，需要作者的头像/角色/佩戴头衔
    const rows = query(
      db,
      `SELECT r.id, r.rating, r.content, r.guests, r.total_price, r.image_url, r.created_at, r.updated_at,
      r.user_id, u.username, u.nickname, u.avatar_url, u.role, u.show_role,
      COALESCE(u.nickname, u.username, '同学') AS author
      FROM shop_reviews r LEFT JOIN users u ON u.id = r.user_id
      WHERE r.shop_id = ? ORDER BY r.updated_at DESC, r.id DESC LIMIT ? OFFSET ?`,
    ).all(id, limit, offset);
    const reviewTitles = equippedTitleMap(
      db,
      rows.map(function (row) {
        return row.user_id;
      }),
    );
    rows.forEach(function (row) {
      row.guests = row.guests === null || row.guests === undefined ? null : Number(row.guests);
      row.total_price =
        row.total_price === null || row.total_price === undefined ? null : Number(row.total_price);
      row.per_person = store.perPerson(row.guests, row.total_price);
      row.image_url = row.image_url || '';
      row.user_title = reviewTitles.get(row.user_id) || null;
    });
    const viewerId = c.get('user') && c.get('user').id !== null ? c.get('user').id : -1;
    const mineRow = query(
      db,
      'SELECT id, rating, content, guests, total_price, image_url, created_at, updated_at FROM shop_reviews WHERE shop_id = ? AND user_id = ?',
    ).get(id, viewerId);
    if (mineRow) mineRow.image_url = mineRow.image_url || '';
    c.res = c.json({
      reviews: rows,
      total: Number(
        query(db, 'SELECT COUNT(*) AS n FROM shop_reviews WHERE shop_id = ?').get(id).n,
      ),
      my_review: mineRow || null,
      can_interact: canInteract(c),
    });
  });
  router.post('/shops/:id/like', authenticate, requireVerifiedStudent, function (c) {
    const id = intParam(c.req.param().id);
    if (id === null || !store.get(db, id)) {
      c.res = c.json({ error: 'shop not found', message: '店铺不存在或已被删除' }, 404);
      return;
    }
    const userId = c.get('user').id;
    const liked = query(db, 'SELECT id FROM shop_likes WHERE shop_id = ? AND user_id = ?').get(
      id,
      userId,
    );
    if (liked)
      query(db, 'DELETE FROM shop_likes WHERE shop_id = ? AND user_id = ?').run(id, userId);
    else
      query(db, 'INSERT OR IGNORE INTO shop_likes (shop_id, user_id) VALUES (?, ?)').run(
        id,
        userId,
      );
    const enriched = attachEngagement([store.get(db, id)], userId)[0];
    c.res = c.json({ liked: !liked, shop: enriched });
  });
  router.post('/shops/:id/reviews', authenticate, requireVerifiedStudent, async function (c) {
    return withUpload(c, reviewUpload, 'image', function (err) {
      if (err) {
        const message = /only jpg\/png/.test(String(err.message))
          ? '评价配图仅支持 JPG / PNG'
          : err && err.code === 'LIMIT_FILE_SIZE'
            ? '评价配图不能超过 2 MB'
            : '评价提交失败，请稍后重试';
        c.res = c.json(
          { error: 'invalid image', message: message, fields: { image: message } },
          400,
        );
        return;
      }
      const id = intParam(c.req.param().id);
      if (id === null || !store.get(db, id)) {
        if (c.get('file')) removeReviewImage('/uploads/shops/' + c.get('file').filename);
        c.res = c.json({ error: 'shop not found', message: '店铺不存在或已被删除' }, 404);
        return;
      }
      const rating = Number(c.get('body') && c.get('body').rating);
      const content = String((c.get('body') && c.get('body').content) || '').trim();
      const guests = store.reviewGuests(c.get('body') && c.get('body').guests);
      const totalPrice = store.reviewTotalPrice(c.get('body') && c.get('body').total_price);
      const dropUpload = function () {
        if (c.get('file')) removeReviewImage('/uploads/shops/' + c.get('file').filename);
      };
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        dropUpload();
        c.res = c.json(
          {
            error: 'invalid rating',
            message: '评分必须为 1–5 星',
            fields: { rating: '请选择 1–5 星' },
          },
          422,
        );
        return;
      }
      if (content.length > 500) {
        dropUpload();
        c.res = c.json(
          {
            error: 'review too long',
            message: '评价内容不能超过 500 字',
            fields: { content: '评价内容不能超过 500 字' },
          },
          422,
        );
        return;
      }
      if (guests === undefined) {
        dropUpload();
        c.res = c.json(
          {
            error: 'invalid guests',
            message: '评价信息有误',
            fields: { guests: '人数须为 1–99 的整数' },
          },
          422,
        );
        return;
      }
      if (totalPrice === undefined) {
        dropUpload();
        c.res = c.json(
          {
            error: 'invalid total price',
            message: '评价信息有误',
            fields: { total_price: '总价须为 0–100000 的数字' },
          },
          422,
        );
        return;
      }
      const previous = query(
        db,
        'SELECT id, image_url FROM shop_reviews WHERE shop_id = ? AND user_id = ?',
      ).get(id, c.get('user').id);
      // 配图规则：上传新图则替换旧图；勾选不带图则清除；未上传且未勾选时保留原图
      let imageUrl = previous ? previous.image_url || '' : '';
      if (c.get('file')) {
        removeReviewImage(imageUrl);
        imageUrl = '/uploads/shops/' + c.get('file').filename;
      } else if (String((c.get('body') && c.get('body').remove_image) || '') === '1') {
        removeReviewImage(imageUrl);
        imageUrl = '';
      }
      query(
        db,
        `INSERT INTO shop_reviews (shop_id, user_id, rating, content, guests, total_price, image_url)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(shop_id, user_id) DO UPDATE SET rating = excluded.rating, content = excluded.content,
          guests = excluded.guests, total_price = excluded.total_price, image_url = excluded.image_url,
          updated_at = strftime('%s','now')`,
      ).run(id, c.get('user').id, rating, content, guests, totalPrice, imageUrl);
      const enriched = attachEngagement([store.get(db, id)], c.get('user').id)[0];
      c.res = c.json(
        {
          review: {
            rating: rating,
            content: content,
            guests: guests,
            total_price: totalPrice,
            image_url: imageUrl,
            per_person: store.perPerson(guests, totalPrice),
          },
          shop: enriched,
          message: previous ? '评价已更新' : '评价已提交',
        },
        previous ? 200 : 201,
      );
    });
  });
  router.delete('/shops/:id/reviews/me', authenticate, requireVerifiedStudent, function (c) {
    const id = intParam(c.req.param().id);
    if (id === null || !store.get(db, id)) {
      c.res = c.json({ error: 'shop not found', message: '店铺不存在或已被删除' }, 404);
      return;
    }
    const previous = query(
      db,
      'SELECT image_url FROM shop_reviews WHERE shop_id = ? AND user_id = ?',
    ).get(id, c.get('user').id);
    query(db, 'DELETE FROM shop_reviews WHERE shop_id = ? AND user_id = ?').run(
      id,
      c.get('user').id,
    );
    if (previous) removeReviewImage(previous.image_url);
    c.res = c.json({
      shop: attachEngagement([store.get(db, id)], c.get('user').id)[0],
      message: '评价已删除',
    });
  });
  router.post('/shops', requireCreate, function (c) {
    try {
      const shop = store.create(db, c.get('body') || {}, c.get('user'), store.loadConfig(root));
      if (
        opt.onCreated &&
        c.get('user') &&
        c.get('user').id !== null &&
        c.get('user').id !== undefined
      )
        opt.onCreated(c.get('user').id);
      c.res = c.json({ shop: shop, message: '已添加' }, 201);
    } catch (error) {
      fail(c, error);
    }
  });
  app.route('/api', router);
}
module.exports = { mountShopRoutes };
