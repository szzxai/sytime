/* 头衔系统（#10）接口：用户查看/佩戴，管理员维护目录与授予撤销。 */

const store = require('./store');
const rules = require('./rules');
function intParam(value) {
  const n = parseInt(value, 10);
  return isNaN(n) ? null : n;
}
function fail(c, error) {
  c.res = c.json(
    { error: error && error.message ? error.message : 'error' },
    error && error.status ? error.status : 500,
  );
}
// 与改角色/封号一致：不能给自己或权重不低于自己的人授予、撤销头衔。
// checkTarget 返回 "ok" / "forbidden" / "missing"，据此区分 403 与 404。
function guardTarget(checkTarget) {
  return async function (c, next) {
    const userId = intParam(c.req.param().id);
    const verdict =
      userId === null || !checkTarget ? 'missing' : checkTarget(c.get('user').id, userId);
    if (verdict === 'missing') {
      c.res = c.json({ error: 'user not found' }, 404);
      return;
    }
    if (verdict !== 'ok') {
      c.res = c.json({ error: 'forbidden' }, 403);
      return;
    }
    return next();
  };
}
function mountTitleRoutes(app, db, options) {
  const authenticate = options.authenticate;
  const requirePermission = options.requirePermission;
  const manage = requirePermission('title_manage');
  // 目录维护是全局的，只查权限；针对具体账号的授予/撤销再查目标权重
  const manageTarget = guardTarget(options.checkTarget);
  // 我的头衔：已拥有的（含佩戴状态）+ 未达成的自动头衔进度
  app.get('/api/user/titles', authenticate, function (c) {
    if (!c.get('user') || c.get('user').id === null || c.get('user').id === undefined) {
      c.res = c.json({ error: 'login required' }, 401);
      return;
    }
    try {
      rules.evaluateAutoTitles(db, c.get('user').id);
      c.res = c.json({
        titles: store.ownedTitles(db, c.get('user').id),
        locked: rules.autoTitleProgress(db, c.get('user').id),
      });
    } catch (error) {
      fail(c, error);
    }
  });
  // 佩戴 / 不佩戴：body { title_id: 12 } 或 { title_id: null }
  app.put('/api/user/title', authenticate, function (c) {
    if (!c.get('user') || c.get('user').id === null || c.get('user').id === undefined) {
      c.res = c.json({ error: 'login required' }, 401);
      return;
    }
    const body = c.get('body') || {};
    try {
      const title = store.setEquippedTitle(db, c.get('user').id, body.title_id);
      c.res = c.json({ title: title });
    } catch (error) {
      fail(c, error);
    }
  });
  // 自动规则清单：后台新建自动头衔时选择
  app.get('/api/admin/titles/rules', manage, function (c) {
    c.res = c.json({
      rules: rules.RULES.map(function (rule) {
        return { key: rule.key, label: rule.label, target: rule.target, unit: rule.unit };
      }),
    });
  });
  app.get('/api/admin/titles', manage, function (c) {
    c.res = c.json({ titles: store.listCatalog(db) });
  });
  app.post('/api/admin/titles', manage, function (c) {
    try {
      c.res = c.json({ title: store.createTitle(db, c.get('body') || {}) }, 201);
    } catch (error) {
      fail(c, error);
    }
  });
  app.put('/api/admin/titles/:id', manage, function (c) {
    const id = intParam(c.req.param().id);
    if (id === null) {
      c.res = c.json({ error: 'head title not found' }, 404);
      return;
    }
    try {
      c.res = c.json({ title: store.updateTitle(db, id, c.get('body') || {}) });
    } catch (error) {
      fail(c, error);
    }
  });
  app.delete('/api/admin/titles/:id', manage, function (c) {
    const id = intParam(c.req.param().id);
    if (id === null) {
      c.res = c.json({ error: 'head title not found' }, 404);
      return;
    }
    try {
      const result = store.deleteTitle(db, id);
      c.res = c.json({ ok: true, removed: result.removed });
    } catch (error) {
      fail(c, error);
    }
  });
  app.post('/api/admin/users/:id/titles', manage, manageTarget, function (c) {
    const userId = intParam(c.req.param().id);
    const titleId = intParam((c.get('body') || {}).title_id);
    if (titleId === null) {
      c.res = c.json({ error: 'invalid head title' }, 422);
      return;
    }
    try {
      const result = store.grantTitle(db, userId, titleId, c.get('user').id);
      c.res = c.json({
        granted: result.granted,
        title: result.title,
        titles: store.ownedTitles(db, userId),
      });
    } catch (error) {
      fail(c, error);
    }
  });
  // 给单个账号颁发专属自定义头衔：只在该账号的授予与佩戴界面出现
  app.post('/api/admin/users/:id/titles/custom', manage, manageTarget, function (c) {
    const userId = intParam(c.req.param().id);
    const body = c.get('body') || {};
    try {
      const title = store.createExclusiveTitle(db, userId, {
        name: body.name,
        hue: body.hue,
        description: body.description,
      });
      const granted = store.grantTitle(db, userId, title.id, c.get('user').id);
      c.res = c.json(
        { title: title, granted: granted.granted, titles: store.ownedTitles(db, userId) },
        201,
      );
    } catch (error) {
      fail(c, error);
    }
  });
  app.delete('/api/admin/users/:id/titles/:titleId', manage, manageTarget, function (c) {
    const userId = intParam(c.req.param().id);
    const titleId = intParam(c.req.param().titleId);
    if (titleId === null) {
      c.res = c.json({ error: 'head title not found' }, 404);
      return;
    }
    try {
      const result = store.revokeTitle(db, userId, titleId);
      c.res = c.json({
        removed: result.removed,
        unequipped: result.unequipped,
        titles: store.ownedTitles(db, userId),
      });
    } catch (error) {
      fail(c, error);
    }
  });
}
module.exports = { mountTitleRoutes };
