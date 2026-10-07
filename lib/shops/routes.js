"use strict";
/* 三元坊必吃榜 · 路由（#6）
   - GET  /api/shops         公开：列表（类型筛选 + 排序）
   - GET  /api/shops/meta    公开：预设类型、地图配置、上传权限
   - GET  /api/shops/:id     公开：单店详情
   - POST /api/shops         需要 shop_create 权限（默认 student 及以上，后端强校验） */
const express = require("express");
const fs = require("node:fs");
const path = require("node:path");
const multer = require("multer");
const store = require("./store");
const { equippedTitleMap } = require("../titles/store");

function intParam(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function mountShopRoutes(app, db, options) {
  const opt = options || {};
  const root = opt.root;
  const authenticate = opt.authenticate || function (req, res, next) { next(); };
  const requirePermission = opt.requirePermission;
  const requireCreate = requirePermission
    ? requirePermission("shop_create")
    : function (req, res, next) {
        authenticate(req, res, next);
      };
  const createMinRole = opt.createMinRole || "student";
  const mapServiceKey = opt.mapServiceKey || "";
  const staticMapCache = new Map();

  // 评价配图：JPG / PNG，2 MB 内，存 uploads/shops
  const REVIEWS_DIR = path.join(root, "uploads", "shops");
  if (!fs.existsSync(REVIEWS_DIR)) fs.mkdirSync(REVIEWS_DIR, { recursive: true });
  const reviewUpload = multer({
    storage: multer.diskStorage({
      destination: function (req, file, cb) { cb(null, REVIEWS_DIR); },
      filename: function (req, file, cb) {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, Date.now() + "-" + Math.round(Math.random() * 1e9) + ext);
      }
    }),
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: function (req, file, cb) {
      if (file.mimetype === "image/jpeg" || file.mimetype === "image/png") cb(null, true);
      else cb(new Error("only jpg/png images are allowed"));
    }
  });

  // 删除评价配图文件（仅限本目录内，防路径穿越）
  function removeReviewImage(url) {
    const s = String(url || "");
    if (!s.startsWith("/uploads/shops/")) return;
    fs.unlink(path.join(REVIEWS_DIR, path.basename(s)), function () {});
  }

  const router = express.Router();
  router.use(function (req, res, next) {
    res.set("Cache-Control", "no-store");
    next();
  });

  function fail(res, error) {
    const status = error instanceof store.ShopError ? error.status : 500;
    const body = { error: error.error || "shop error", message: error.message || "操作失败，请稍后再试" };
    if (error.fields) body.fields = error.fields;
    if (error.existing_id !== undefined) body.existing_id = error.existing_id;
    if (status === 500) console.error("[shops]", error);
    res.status(status).json(body);
  }

  // 复用 server.js 的 hasPermission：角色权重达到默认等级，或存在显式授权
  function canCreate(req) {
    if (!opt.hasPermission) return false;
    return !!opt.hasPermission(req, "shop_create");
  }

  // Eligibility is based on the current database role/status, never a stale JWT role.
  function canInteract(req) {
    return !!(opt.isVerifiedStudent && opt.isVerifiedStudent(req));
  }

  function requireVerifiedStudent(req, res, next) {
    if (!req.user || req.user.id === null || req.user.id === undefined) {
      res.status(401).json({ error: "login required", message: "请先登录后再点赞或评价" });
      return;
    }
    if (!canInteract(req)) {
      res.status(403).json({ error: "verified student required", message: "学生及以上权限可点赞或评价" });
      return;
    }
    next();
  }

  function attachEngagement(shops, userId) {
    if (!shops.length) return [];
    const ids = shops.map(function (shop) { return shop.id; });
    const marks = ids.map(function () { return "?"; }).join(",");
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
    const rows = db.prepare(sql).all(viewerId, viewerId, viewerId, ...ids);
    const byId = new Map(rows.map(function (row) { return [Number(row.shop_id), row]; }));
    return shops.map(function (shop) {
      const stats = byId.get(Number(shop.id)) || {};
      return Object.assign({}, shop, {
        likes_count: Number(stats.likes_count || 0),
        reviews_count: Number(stats.reviews_count || 0),
        ratings_count: Number(stats.ratings_count || 0),
        rating_avg: stats.rating_avg === null || stats.rating_avg === undefined ? null : Number(stats.rating_avg),
        user_liked: Number(stats.user_liked || 0) > 0,
        user_rating: stats.user_rating === undefined ? null : stats.user_rating,
        user_review_content: stats.user_review_content || ""
      });
    });
  }

  function meta(req, res) {
    const config = store.loadConfig(root);
    res.json({
      types: store.types(db),
      total: store.count(db),
      create_min_role: createMinRole,
      can_create: canCreate(req),
      can_interact: canInteract(req),
      area: { name: config.area.name, text: config.area.text },
      map: {
        js_key: opt.mapKey || "",
        security_code: opt.mapSecurityCode || "",
        key_configured: !!opt.mapKey,
        static_map_configured: !!mapServiceKey,
        config_file: "data/shops-config.json",
        center: config.center,
        anchors: Object.keys(config.anchors).map(function (key) {
          return {
            key: key,
            name: config.anchors[key].name,
            lat: config.anchors[key].point ? config.anchors[key].point.lat : null,
            lng: config.anchors[key].point ? config.anchors[key].point.lng : null,
            configured: !!config.anchors[key].point
          };
        }),
        area: { name: config.area.name, polygon: config.area.polygon, coordinate_system: config.area.coordinate_system }
      }
    });
  }

  router.get("/shops/meta", authenticate, function (req, res) {
    meta(req, res);
  });

  router.get("/shops", authenticate, function (req, res) {
    try {
      const result = store.list(db, {
        type: req.query.type,
        sort: req.query.sort,
        q: req.query.q,
        distance_min_m: req.query.distance_min_m,
        distance_max_m: req.query.distance_max_m,
        walk_min: req.query.walk_min,
        walk_max: req.query.walk_max,
        likes_min: req.query.likes_min,
        likes_max: req.query.likes_max,
        reviews_min: req.query.reviews_min,
        reviews_max: req.query.reviews_max,
        rating_min: req.query.rating_min,
        rating_max: req.query.rating_max
      });
      const config = store.loadConfig(root);
      const canInteractNow = canInteract(req);
      res.json({
        shops: attachEngagement(result.shops, req.user && req.user.id).map(function (shop) { return Object.assign(shop, { can_interact: canInteractNow }); }),
        total: result.total,
        type: result.type || "全部",
        sort: result.sort,
        types: store.types(db),
        create_min_role: createMinRole,
        can_create: canCreate(req),
        can_interact: canInteractNow,
        area: { name: config.area.name, text: config.area.text }
      });
    } catch (error) {
      fail(res, error);
    }
  });

  // Server-side AMap Static Map proxy. The Web Service Key is never returned to the browser.
  router.get("/shops/map-image", async function (req, res) {
    const config = store.loadConfig(root);
    const center = config.center || { lat: 31.300423, lng: 120.622602, zoom: 16 };
    const polygon = config.area.polygon || [];
    const hasLat = req.query.lat !== undefined;
    const hasLng = req.query.lng !== undefined;
    if (hasLat !== hasLng || (hasLat && (typeof req.query.lat !== "string" || typeof req.query.lng !== "string"))) {
      res.status(400).json({ error: "invalid map center", message: "地图中心坐标无效" });
      return;
    }
    let lat = hasLat ? Number(req.query.lat) : Number(center.lat);
    let lng = hasLng ? Number(req.query.lng) : Number(center.lng);
    const zoom = req.query.zoom === undefined ? Number(center.zoom || 11) : Number(req.query.zoom);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isInteger(zoom) || zoom < 9 || zoom > 18) {
      res.status(400).json({ error: "invalid map view", message: "地图中心或缩放级别无效" });
      return;
    }
    if (polygon.length) {
      const minLat = Math.min(...polygon.map(function (point) { return Number(point[0]); })) - 0.06;
      const maxLat = Math.max(...polygon.map(function (point) { return Number(point[0]); })) + 0.06;
      const minLng = Math.min(...polygon.map(function (point) { return Number(point[1]); })) - 0.06;
      const maxLng = Math.max(...polygon.map(function (point) { return Number(point[1]); })) + 0.06;
      if (lat < minLat || lat > maxLat || lng < minLng || lng > maxLng) {
        res.status(400).json({ error: "map center outside allowed bounds", message: "地图中心超出可浏览范围" });
        return;
      }
    }
    if (!mapServiceKey) {
      res.status(503).json({ error: "static map unavailable", message: "高德静态地图服务未配置" });
      return;
    }

    lat = Number(lat.toFixed(6));
    lng = Number(lng.toFixed(6));
    const cacheKey = [lat, lng, zoom].join(",");
    const now = Date.now();
    const cached = staticMapCache.get(cacheKey);
    if (cached && now - cached.createdAt < 10 * 60 * 1000) {
      staticMapCache.delete(cacheKey);
      staticMapCache.set(cacheKey, cached);
      res.set("Cache-Control", "public, max-age=300").type("png").send(cached.data);
      return;
    }
    try {
      const url = new URL("https://restapi.amap.com/v3/staticmap");
      url.searchParams.set("location", lng + "," + lat);
      url.searchParams.set("zoom", String(zoom));
      url.searchParams.set("size", "750*420");
      url.searchParams.set("key", mapServiceKey);
      const upstream = await fetch(url, { signal: AbortSignal.timeout(15000) });
      const type = upstream.headers.get("content-type") || "";
      if (!upstream.ok || !/^image\//i.test(type)) {
        res.status(502).json({ error: "static map upstream error", message: "高德底图暂时不可用" });
        return;
      }
      const image = Buffer.from(await upstream.arrayBuffer());
      if (!image.length || image.length > 4 * 1024 * 1024) {
        res.status(502).json({ error: "invalid static map", message: "高德底图响应无效" });
        return;
      }
      staticMapCache.set(cacheKey, { data: image, createdAt: now });
      while (staticMapCache.size > 32) staticMapCache.delete(staticMapCache.keys().next().value);
      res.set("Cache-Control", "public, max-age=300").type("png").send(image);
    } catch (error) {
      // Do not log the upstream URL: it contains the server-only map key.
      res.status(502).json({ error: "static map unavailable", message: "高德底图暂时不可用" });
    }
  });

  router.get("/shops/:id", authenticate, function (req, res) {
    const id = intParam(req.params.id);
    if (id === null) {
      res.status(404).json({ error: "shop not found", message: "店铺不存在或已被删除" });
      return;
    }
    const shop = store.get(db, id);
    if (!shop) {
      res.status(404).json({ error: "shop not found", message: "店铺不存在或已被删除" });
      return;
    }
    const canInteractNow = canInteract(req);
    const enriched = attachEngagement([shop], req.user && req.user.id)[0];
    enriched.can_interact = canInteractNow;
    res.json({ shop: enriched, can_interact: canInteractNow });
  });

  router.get("/shops/:id/reviews", authenticate, function (req, res) {
    const id = intParam(req.params.id);
    if (id === null || !store.get(db, id)) {
      res.status(404).json({ error: "shop not found", message: "店铺不存在或已被删除" });
      return;
    }
    const parsedLimit = Number(req.query.limit);
    const limit = Number.isInteger(parsedLimit) ? Math.max(1, Math.min(parsedLimit, 100)) : 20;
    const parsedOffset = Number(req.query.offset);
    const offset = Number.isInteger(parsedOffset) ? Math.max(0, parsedOffset) : 0;
    // 头衔系统（#10）：评价卡统一用 UI.userLine，需要作者的头像/角色/佩戴头衔
    const rows = db.prepare(`SELECT r.id, r.rating, r.content, r.guests, r.total_price, r.image_url, r.created_at, r.updated_at,
      r.user_id, u.username, u.nickname, u.avatar_url, u.role, u.show_role,
      COALESCE(u.nickname, u.username, '同学') AS author
      FROM shop_reviews r LEFT JOIN users u ON u.id = r.user_id
      WHERE r.shop_id = ? ORDER BY r.updated_at DESC, r.id DESC LIMIT ? OFFSET ?`).all(id, limit, offset);
    const reviewTitles = equippedTitleMap(db, rows.map(function (row) { return row.user_id; }));
    rows.forEach(function (row) {
      row.guests = row.guests === null || row.guests === undefined ? null : Number(row.guests);
      row.total_price = row.total_price === null || row.total_price === undefined ? null : Number(row.total_price);
      row.per_person = store.perPerson(row.guests, row.total_price);
      row.image_url = row.image_url || "";
      row.user_title = reviewTitles.get(row.user_id) || null;
    });
    const viewerId = req.user && req.user.id !== null ? req.user.id : -1;
    const mineRow = db.prepare("SELECT id, rating, content, guests, total_price, image_url, created_at, updated_at FROM shop_reviews WHERE shop_id = ? AND user_id = ?").get(id, viewerId);
    if (mineRow) mineRow.image_url = mineRow.image_url || "";
    res.json({ reviews: rows, total: Number(db.prepare("SELECT COUNT(*) AS n FROM shop_reviews WHERE shop_id = ?").get(id).n), my_review: mineRow || null, can_interact: canInteract(req) });
  });

  router.post("/shops/:id/like", authenticate, requireVerifiedStudent, function (req, res) {
    const id = intParam(req.params.id);
    if (id === null || !store.get(db, id)) {
      res.status(404).json({ error: "shop not found", message: "店铺不存在或已被删除" });
      return;
    }
    const userId = req.user.id;
    const liked = db.prepare("SELECT id FROM shop_likes WHERE shop_id = ? AND user_id = ?").get(id, userId);
    if (liked) db.prepare("DELETE FROM shop_likes WHERE shop_id = ? AND user_id = ?").run(id, userId);
    else db.prepare("INSERT OR IGNORE INTO shop_likes (shop_id, user_id) VALUES (?, ?)").run(id, userId);
    const enriched = attachEngagement([store.get(db, id)], userId)[0];
    res.json({ liked: !liked, shop: enriched });
  });

  router.post("/shops/:id/reviews", authenticate, requireVerifiedStudent, function (req, res) {
    reviewUpload.single("image")(req, res, function (err) {
      if (err) {
        const message = /only jpg\/png/.test(String(err.message))
          ? "评价配图仅支持 JPG / PNG"
          : err && err.code === "LIMIT_FILE_SIZE"
            ? "评价配图不能超过 2 MB"
            : "评价提交失败，请稍后重试";
        res.status(400).json({ error: "invalid image", message: message, fields: { image: message } });
        return;
      }
      const id = intParam(req.params.id);
      if (id === null || !store.get(db, id)) {
        if (req.file) removeReviewImage("/uploads/shops/" + req.file.filename);
        res.status(404).json({ error: "shop not found", message: "店铺不存在或已被删除" });
        return;
      }
      const rating = Number(req.body && req.body.rating);
      const content = String((req.body && req.body.content) || "").trim();
      const guests = store.reviewGuests(req.body && req.body.guests);
      const totalPrice = store.reviewTotalPrice(req.body && req.body.total_price);
      const dropUpload = function () { if (req.file) removeReviewImage("/uploads/shops/" + req.file.filename); };
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        dropUpload();
        res.status(422).json({ error: "invalid rating", message: "评分必须为 1–5 星", fields: { rating: "请选择 1–5 星" } });
        return;
      }
      if (content.length > 500) {
        dropUpload();
        res.status(422).json({ error: "review too long", message: "评价内容不能超过 500 字", fields: { content: "评价内容不能超过 500 字" } });
        return;
      }
      if (guests === undefined) {
        dropUpload();
        res.status(422).json({ error: "invalid guests", message: "评价信息有误", fields: { guests: "人数须为 1–99 的整数" } });
        return;
      }
      if (totalPrice === undefined) {
        dropUpload();
        res.status(422).json({ error: "invalid total price", message: "评价信息有误", fields: { total_price: "总价须为 0–100000 的数字" } });
        return;
      }
      const previous = db.prepare("SELECT id, image_url FROM shop_reviews WHERE shop_id = ? AND user_id = ?").get(id, req.user.id);
      // 配图规则：上传新图则替换旧图；勾选不带图则清除；未上传且未勾选时保留原图
      let imageUrl = previous ? previous.image_url || "" : "";
      if (req.file) {
        removeReviewImage(imageUrl);
        imageUrl = "/uploads/shops/" + req.file.filename;
      } else if (String((req.body && req.body.remove_image) || "") === "1") {
        removeReviewImage(imageUrl);
        imageUrl = "";
      }
      db.prepare(`INSERT INTO shop_reviews (shop_id, user_id, rating, content, guests, total_price, image_url)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(shop_id, user_id) DO UPDATE SET rating = excluded.rating, content = excluded.content,
          guests = excluded.guests, total_price = excluded.total_price, image_url = excluded.image_url,
          updated_at = strftime('%s','now')`)
        .run(id, req.user.id, rating, content, guests, totalPrice, imageUrl);
      const enriched = attachEngagement([store.get(db, id)], req.user.id)[0];
      res.status(previous ? 200 : 201).json({
        review: { rating: rating, content: content, guests: guests, total_price: totalPrice, image_url: imageUrl, per_person: store.perPerson(guests, totalPrice) },
        shop: enriched,
        message: previous ? "评价已更新" : "评价已提交"
      });
    });
  });

  router.delete("/shops/:id/reviews/me", authenticate, requireVerifiedStudent, function (req, res) {
    const id = intParam(req.params.id);
    if (id === null || !store.get(db, id)) {
      res.status(404).json({ error: "shop not found", message: "店铺不存在或已被删除" });
      return;
    }
    const previous = db.prepare("SELECT image_url FROM shop_reviews WHERE shop_id = ? AND user_id = ?").get(id, req.user.id);
    db.prepare("DELETE FROM shop_reviews WHERE shop_id = ? AND user_id = ?").run(id, req.user.id);
    if (previous) removeReviewImage(previous.image_url);
    res.json({ shop: attachEngagement([store.get(db, id)], req.user.id)[0], message: "评价已删除" });
  });

  router.post("/shops", requireCreate, function (req, res) {
    try {
      const shop = store.create(db, req.body || {}, req.user, store.loadConfig(root));
      if (opt.onCreated && req.user && req.user.id !== null && req.user.id !== undefined) opt.onCreated(req.user.id);
      res.status(201).json({ shop: shop, message: "已添加" });
    } catch (error) {
      fail(res, error);
    }
  });

  app.use("/api", router);
}

module.exports = { mountShopRoutes };
