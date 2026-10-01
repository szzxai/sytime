"use strict";
const express = require("express");
const multer = require("multer");
const { catalog } = require("./store");
const { MenuError, cleanError } = require("./schema");
function mountMenuRoutes(app, db, service, authenticate) {
  const router = express.Router();
  const roles = allowed => (req, res, next) => authenticate(req, res, () => {
    const id = req.user?.id;
    if (id === null || id === undefined) return res.status(401).json({ error: "请先登录" });
    const user = db.prepare("SELECT role,status FROM users WHERE id=?").get(id);
    if (!user || !allowed.includes(user.role) || user.status !== "active") return res.status(403).json({ error: "当前账号无权执行此菜单操作" });
    res.set("Cache-Control", "no-store"); next();
  });
  const developer = roles(["developer"]), staff = roles(["developer","super_admin","admin"]);
  const action = handler => async (req, res, next) => {
    try { await handler(req, res); } catch (error) {
      if (res.headersSent) return next(error);
      res.status(error instanceof MenuError ? error.status : 500).json({ error: cleanError(error), code: error.code || "menu_error" });
    }
  };
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 6, fields: 3 }, fileFilter(_req, file, cb) {
    cb(["image/jpeg", "image/png", "image/webp"].includes(file.mimetype) ? null : new MenuError("补充菜单仅支持 JPG、PNG、WEBP"), true);
  } }).array("images", 6);
  router.get("/dishes", action((_req, res) => { res.set("Cache-Control", "no-store").json(catalog(db)); }));
  router.get("/admin/menu-sync/imports", staff, action((_req,res) => res.json(service.manual.list())));
  router.get("/admin/menu-sync/imports/source", staff, action((req,res) => res.json(service.manual.load(req.query.source_id,req.query.job_id))));
  router.post("/admin/menu-sync/imports/preview", staff, action((req,res) => res.json(service.manual.preview(req.body))));
  router.post("/admin/menu-sync/imports", staff, action((req,res) => res.status(201).json({import:service.manual.publish(req.body,req.user.id)})));
  router.get("/admin/menu-sync/settings", developer, action((_req, res) => res.json({ settings: service.settings() })));
  router.put("/admin/menu-sync/settings", developer, action((req, res) => res.json({ settings: service.saveSettings(req.body) })));
  router.post("/admin/menu-sync/test", developer, action(async (_req, res) => res.json(await service.testSettings())));
  router.get("/admin/menu-sync/jobs", developer, action((_req, res) => res.json({ jobs: service.jobs(), sources: service.sources(), settings: service.settings() })));
  router.post("/admin/menu-sync/jobs", developer, (req, res, next) => {
    if (!req.is("multipart/form-data")) return next();
    upload(req, res, error => {
      if (error) return res.status(422).json({ error: error instanceof MenuError ? error.message : "菜单图片超过 10 MB、数量超过六张或上传格式无效" });
      next();
    });
  }, action(async (req, res) => {
    let sourceIds = null;
    if (req.body?.source_id) sourceIds = [req.body.source_id];
    const job = await service.enqueue({ sourceIds, files: req.files?.length ? req.files : null, force: !!req.files?.length });
    res.status(202).json({ job });
  }));
  router.get("/admin/menu-sync/jobs/:id", staff, action((req, res) => res.json({ job: service.job(req.params.id) })));
  router.post("/admin/menu-sync/jobs/:id/retry", developer, action(async (req, res) => res.status(202).json({ job: await service.retry(req.params.id) })));
  router.post("/admin/menu-sync/jobs/:id/cancel", developer, action((req, res) => res.json({ job: service.cancel(req.params.id) })));
  router.get("/admin/menu-sync/jobs/:id/artifacts/:kind", staff, action((req, res) => {
    const file = service.artifact(req.params.id, req.query.source_id, req.params.kind);
    res.set({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" });
    if (!req.params.kind.startsWith("image-")) res.attachment(req.params.kind + ".json");
    // Only the authenticated, validated artifact path may expose .private files.
    res.sendFile(file, { dotfiles: "allow" });
  }));
  app.use("/api", router);
  app.get("/menu-json-rules.md", (_req,res) => res.type("text/plain; charset=utf-8").sendFile(require("node:path").join(service.root,"menu-json-rules.md")));
}
module.exports = { mountMenuRoutes };
