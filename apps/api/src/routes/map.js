const path = require('path');
const fs = require('fs');

module.exports = function mountMapRoutes(app, services) {
  const { root } = services;
  app.get('/api/map-data', async (c) => {
    try {
      return c.json(JSON.parse(await fs.promises.readFile(path.join(root, 'data.json'), 'utf8')));
    } catch {
      return c.json({ error: 'data.json not found' }, 500);
    }
  });
};
