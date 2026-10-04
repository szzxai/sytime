"use strict";
/* 头衔系统（#10）接口：用户查看/佩戴，管理员维护目录与授予撤销。 */
const express = require("express");
const store = require("./store");
const rules = require("./rules");

function intParam(value) {
  const n = parseInt(value, 10);
  return isNaN(n) ? null : n;
}

function fail(res, error) {
  res.status(error && error.status ? error.status : 500).json({ error: error && error.message ? error.message : "error" });
}

// 与改角色/封号一致：不能给自己或权重不低于自己的人授予、撤销头衔。
// checkTarget 返回 "ok" / "forbidden" / "missing"，据此区分 403 与 404。
function guardTarget(checkTarget) {
  return function (req, res, next) {
    const userId = intParam(req.params.id);
    const verdict = userId === null || !checkTarget ? "missing" : checkTarget(req.user.id, userId);
    if (verdict === "missing") {
      res.status(404).json({ error: "user not found" });
      return;
    }
    if (verdict !== "ok") {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    next();
  };
}

function mountTitleRoutes(app, db, options) {
  const authenticate = options.authenticate;
  const requirePermission = options.requirePermission;
  const manage = requirePermission("title_manage");
  // 目录维护是全局的，只查权限；针对具体账号的授予/撤销再查目标权重
  const manageTarget = guardTarget(options.checkTarget);

  // 我的头衔：已拥有的（含佩戴状态）+ 未达成的自动头衔进度
  app.get("/api/user/titles", authenticate, function (req, res) {
    if (!req.user || req.user.id === null || req.user.id === undefined) {
      res.status(401).json({ error: "login required" });
      return;
    }
    try {
      rules.evaluateAutoTitles(db, req.user.id);
      res.json({ titles: store.ownedTitles(db, req.user.id), locked: rules.autoTitleProgress(db, req.user.id) });
    } catch (error) {
      fail(res, error);
    }
  });

  // 佩戴 / 不佩戴：body { title_id: 12 } 或 { title_id: null }
  app.put("/api/user/title", authenticate, function (req, res) {
    if (!req.user || req.user.id === null || req.user.id === undefined) {
      res.status(401).json({ error: "login required" });
      return;
    }
    const body = req.body || {};
    try {
      const title = store.setEquippedTitle(db, req.user.id, body.title_id);
      res.json({ title: title });
    } catch (error) {
      fail(res, error);
    }
  });

  // 自动规则清单：后台新建自动头衔时选择
  app.get("/api/admin/titles/rules", manage, function (req, res) {
    res.json({
      rules: rules.RULES.map(function (rule) {
        return { key: rule.key, label: rule.label, target: rule.target, unit: rule.unit };
      })
    });
  });

  app.get("/api/admin/titles", manage, function (req, res) {
    res.json({ titles: store.listCatalog(db) });
  });

  app.post("/api/admin/titles", manage, function (req, res) {
    try {
      res.status(201).json({ title: store.createTitle(db, req.body || {}) });
    } catch (error) {
      fail(res, error);
    }
  });

  app.put("/api/admin/titles/:id", manage, function (req, res) {
    const id = intParam(req.params.id);
    if (id === null) {
      res.status(404).json({ error: "head title not found" });
      return;
    }
    try {
      res.json({ title: store.updateTitle(db, id, req.body || {}) });
    } catch (error) {
      fail(res, error);
    }
  });

  app.delete("/api/admin/titles/:id", manage, function (req, res) {
    const id = intParam(req.params.id);
    if (id === null) {
      res.status(404).json({ error: "head title not found" });
      return;
    }
    try {
      const result = store.deleteTitle(db, id);
      res.json({ ok: true, removed: result.removed });
    } catch (error) {
      fail(res, error);
    }
  });

  app.post("/api/admin/users/:id/titles", manage, manageTarget, function (req, res) {
    const userId = intParam(req.params.id);
    const titleId = intParam((req.body || {}).title_id);
    if (titleId === null) {
      res.status(422).json({ error: "invalid head title" });
      return;
    }
    try {
      const result = store.grantTitle(db, userId, titleId, req.user.id);
      res.json({ granted: result.granted, title: result.title, titles: store.ownedTitles(db, userId) });
    } catch (error) {
      fail(res, error);
    }
  });

  // 给单个账号颁发专属自定义头衔：只在该账号的授予与佩戴界面出现
  app.post("/api/admin/users/:id/titles/custom", manage, manageTarget, function (req, res) {
    const userId = intParam(req.params.id);
    const body = req.body || {};
    try {
      const title = store.createExclusiveTitle(db, userId, {
        name: body.name,
        hue: body.hue,
        description: body.description
      });
      const granted = store.grantTitle(db, userId, title.id, req.user.id);
      res.status(201).json({ title: title, granted: granted.granted, titles: store.ownedTitles(db, userId) });
    } catch (error) {
      fail(res, error);
    }
  });

  app.delete("/api/admin/users/:id/titles/:titleId", manage, manageTarget, function (req, res) {
    const userId = intParam(req.params.id);
    const titleId = intParam(req.params.titleId);
    if (titleId === null) {
      res.status(404).json({ error: "head title not found" });
      return;
    }
    try {
      const result = store.revokeTitle(db, userId, titleId);
      res.json({ removed: result.removed, unequipped: result.unequipped, titles: store.ownedTitles(db, userId) });
    } catch (error) {
      fail(res, error);
    }
  });
}

module.exports = { mountTitleRoutes };
