const { sendFile, setHeaders, setContentType } = require('../../http');
const { query } = require('../../../../../packages/db/src/client.ts');
const { Hono } = require('hono');
const { withUpload } = require('../../upload');
const { catalog } = require('./store');
const { MenuError, cleanError } = require('./schema');
function mountMenuRoutes(app, db, service, authenticate) {
  const router = new Hono();
  const roles = (allowed) => async (c, next) =>
    authenticate(c, () => {
      const id = c.get('user')?.id;
      if (id === null || id === undefined) return (c.res = c.json({ error: '请先登录' }, 401));
      const user = query(db, 'SELECT role,status FROM users WHERE id=?').get(id);
      if (!user || !allowed.includes(user.role) || user.status !== 'active')
        return (c.res = c.json({ error: '当前账号无权执行此菜单操作' }, 403));
      setHeaders(c, 'Cache-Control', 'no-store');
      return next();
    });
  const developer = roles(['developer']),
    staff = roles(['developer', 'super_admin', 'admin']);
  const action = (handler) => async (c, next) => {
    try {
      await handler(c);
    } catch (error) {
      if (c.finalized) return next(error);
      c.res = c.json(
        { error: cleanError(error), code: error.code || 'menu_error' },
        error instanceof MenuError ? error.status : 500,
      );
    }
  };
  const upload = {
    memory: true,
    maxBytes: 10 * 1024 * 1024,
    maxFiles: 6,
    maxFields: 3,
    types: ['image/jpeg', 'image/png', 'image/webp'],
  };
  router.get(
    '/menu',
    action((c) => {
      setHeaders(c, 'Cache-Control', 'no-store');
      const ids = c.req.queries('source_id');
      if (ids?.length > 1 || (ids && (!ids[0] || ids[0].length > 100)))
        throw new MenuError('食谱选择无效');
      const all = c.req.queries('all');
      if (all && (all.length !== 1 || all[0] !== '1' || ids))
        throw new MenuError('食谱选择无效', 400);
      c.res = c.json(require('./public').weeklyMenu(db, ids?.[0], !!all));
    }),
  );
  router.get(
    '/dishes',
    action((c) => {
      setHeaders(c, 'Cache-Control', 'no-store');
      c.res = c.json(catalog(db));
    }),
  );
  router.get(
    '/admin/menu-sync/imports',
    staff,
    action((c) => (c.res = c.json(service.manual.list()))),
  );
  router.get(
    '/admin/menu-sync/imports/source',
    staff,
    action(
      (c) => (c.res = c.json(service.manual.load(c.req.query().source_id, c.req.query().job_id))),
    ),
  );
  router.post(
    '/admin/menu-sync/imports/preview',
    staff,
    action((c) => (c.res = c.json(service.manual.preview(c.get('body'))))),
  );
  router.post(
    '/admin/menu-sync/imports',
    staff,
    action(
      (c) =>
        (c.res = c.json({ import: service.manual.publish(c.get('body'), c.get('user').id) }, 201)),
    ),
  );
  router.get(
    '/admin/menu-sync/settings',
    developer,
    action((c) => (c.res = c.json({ settings: service.settings() }))),
  );
  router.put(
    '/admin/menu-sync/settings',
    developer,
    action((c) => (c.res = c.json({ settings: service.saveSettings(c.get('body')) }))),
  );
  router.post(
    '/admin/menu-sync/test',
    developer,
    action(async (c) => (c.res = c.json(await service.testSettings()))),
  );
  router.get(
    '/admin/menu-sync/jobs',
    developer,
    action(
      (c) =>
        (c.res = c.json({
          jobs: service.jobs(),
          sources: service.sources(),
          settings: service.settings(),
        })),
    ),
  );
  router.post(
    '/admin/menu-sync/jobs',
    developer,
    async (c, next) => {
      if (!(c.req.header('content-type') || '').startsWith('multipart/form-data')) return next();
      return withUpload(c, upload, 'images', (error) => {
        if (error)
          return (c.res = c.json(
            {
              error:
                error instanceof MenuError
                  ? error.message
                  : '菜单图片超过 10 MB、数量超过六张或上传格式无效',
            },
            422,
          ));
        return next();
      });
    },
    action(async (c) => {
      let sourceIds = null;
      if (c.get('body')?.source_id) sourceIds = [c.get('body').source_id];
      const job = await service.enqueue({
        sourceIds,
        files: c.get('files')?.length ? c.get('files') : null,
        force: !!c.get('files')?.length,
      });
      c.res = c.json({ job }, 202);
    }),
  );
  router.get(
    '/admin/menu-sync/jobs/:id',
    staff,
    action((c) => (c.res = c.json({ job: service.job(c.req.param().id) }))),
  );
  router.post(
    '/admin/menu-sync/jobs/:id/retry',
    developer,
    action(async (c) => (c.res = c.json({ job: await service.retry(c.req.param().id) }, 202))),
  );
  router.post(
    '/admin/menu-sync/jobs/:id/cancel',
    developer,
    action((c) => (c.res = c.json({ job: service.cancel(c.req.param().id) }))),
  );
  router.get(
    '/admin/menu-sync/jobs/:id/artifacts/:kind',
    staff,
    action((c) => {
      const file = service.artifact(c.req.param().id, c.req.query().source_id, c.req.param().kind);
      setHeaders(c, {
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      });
      if (!c.req.param().kind.startsWith('image-'))
        c.header('Content-Disposition', 'attachment; filename=' + (c.req.param('kind') + '.json'));
      // Only the authenticated, validated artifact path may expose .private files.
      c.res = sendFile(c, file, { dotfiles: 'allow' });
    }),
  );
  app.route('/api', router);
  app.get(
    '/menu-json-rules.md',
    (c) => (
      setContentType(c, 'text/plain; charset=utf-8'),
      (c.res = sendFile(c, require('node:path').join(service.root, 'menu-json-rules.md')))
    ),
  );
}
module.exports = { mountMenuRoutes };
