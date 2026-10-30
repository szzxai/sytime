const { query } = require('../../../../packages/db/src/client.ts');

module.exports = function mountAnnouncementsRoutes(app, services) {
  const { requirePermission, db } = services;
  app.post('/api/admin/announcements', requirePermission('announcement_publish'), function (c) {
    const body = c.get('body') || {};
    const title = body.title;
    const content = body.content;
    if (!title || !content) {
      c.res = c.json({ error: 'title and content are required' }, 400);
      return;
    }
    const publishDate = body.publish_date || null;
    let info;
    if (publishDate) {
      info = query(
        db,
        'INSERT INTO announcements (title, content, publish_date) VALUES (?, ?, ?)',
      ).run(title, content, publishDate);
    } else {
      info = query(db, 'INSERT INTO announcements (title, content) VALUES (?, ?)').run(
        title,
        content,
      );
    }
    const announcement = query(db, 'SELECT * FROM announcements WHERE id = ?').get(
      Number(info.lastInsertRowid),
    );
    c.res = c.json({ announcement: announcement }, 201);
  });
  app.delete(
    '/api/admin/announcements/:id',
    requirePermission('announcement_publish'),
    function (c) {
      const id = Number(c.req.param().id);
      if (!Number.isInteger(id) || id <= 0) {
        c.res = c.json({ error: 'invalid id' }, 400);
        return;
      }
      const row = query(db, 'SELECT id FROM announcements WHERE id = ?').get(id);
      if (!row) {
        c.res = c.json({ error: 'announcement not found' }, 404);
        return;
      }
      query(db, 'DELETE FROM announcements WHERE id = ?').run(id);
      c.res = c.json({ ok: true });
    },
  );
  app.get('/api/settings/banner', function (c) {
    const row = query(db, "SELECT value FROM settings WHERE key = 'banner'").get();
    const ver = query(db, "SELECT value FROM settings WHERE key = 'banner_version'").get();
    c.res = c.json({
      banner: row && row.value ? row.value : '',
      version: ver && ver.value ? Number(ver.value) : 0,
    });
  });
  app.put('/api/admin/settings/banner', requirePermission('banner_edit'), function (c) {
    const body = c.get('body') || {};
    let value = null;
    if (body.value !== undefined) value = body.value;
    else if (body.banner !== undefined) value = body.banner;
    if (value === null) {
      c.res = c.json({ error: 'value is required' }, 400);
      return;
    }
    value = String(value);
    query(
      db,
      "INSERT INTO settings (key, value) VALUES ('banner', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).run(value);
    query(
      db,
      "INSERT INTO settings (key, value) VALUES ('banner_version', '1') ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT)",
    ).run();
    const ver = query(db, "SELECT value FROM settings WHERE key = 'banner_version'").get();
    c.res = c.json({ banner: value, version: ver && ver.value ? Number(ver.value) : 0 });
  });
  app.get('/api/announcements', function (c) {
    const rows = query(db, 'SELECT * FROM announcements ORDER BY publish_date DESC, id DESC').all();
    c.res = c.json({ announcements: rows });
  });
};
