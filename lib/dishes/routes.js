"use strict";

const store = require("./store");

function mountDishRoutes(app, db, attachAuthors) {
  app.get("/api/dishes/:id", function (req, res) {
    const dish = store.detail(db, req.params.id);
    if (!dish) return res.status(404).json({ error: "菜品不存在或已不在当前目录中" });
    res.set("Cache-Control", "no-store").json({ dish });
  });
  app.get("/api/dishes/:id/reviews", function (req, res) {
    const dish = store.findDish(db, req.params.id);
    if (!dish) return res.status(404).json({ error: "菜品不存在或已不在当前目录中" });
    const rawOffset = req.query.offset === undefined ? "0" : req.query.offset;
    if (typeof rawOffset !== "string" || !/^(0|[1-9]\d*)$/.test(rawOffset) ||
        !Number.isSafeInteger(Number(rawOffset)) || Number(rawOffset) > 1000000) {
      return res.status(400).json({ error: "评价分页参数无效" });
    }
    const result = store.reviews(db, dish.id, Number(rawOffset));
    attachAuthors(result.reviews);
    res.set("Cache-Control", "no-store").json(result);
  });
}

module.exports = { mountDishRoutes };
