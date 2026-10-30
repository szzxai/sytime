const path = require('path');
const fs = require('fs');

module.exports = function mountMapRoutes(app, services) {
  const { requirePermission, root } = services;
  app.get('/api/map-data', async (c) => {
    try {
      return c.json(JSON.parse(await fs.promises.readFile(path.join(root, 'data.json'), 'utf8')));
    } catch {
      return c.json({ error: 'data.json not found' }, 500);
    }
  });
  app.put('/api/admin/map-popup', requirePermission('map_popup_edit'), async (c) => {
    const { name, popup = '' } = c.get('body') || {};
    if (!name) return c.json({ error: 'name is required' }, 400);
    const file = path.join(root, 'data.json');
    const data = JSON.parse(await fs.promises.readFile(file, 'utf8'));
    const features = (data.features || []).filter((feature) => feature.name === name);
    if (!features.length) return c.json({ error: 'feature not found' }, 404);
    features.forEach((feature) => {
      feature.popup = String(popup);
    });
    await fs.promises.writeFile(file, JSON.stringify(data, null, 2));
    return c.json({ ok: true, name, popup, updated: features.length });
  });
};
