const { setHeaders } = require('../../http');
const { Hono } = require('hono');
const { catalog } = require('./store');
const { MenuError, cleanError } = require('./schema');
function mountMenuRoutes(app, db) {
  const router = new Hono();
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
  app.route('/api', router);
}
module.exports = { mountMenuRoutes };
