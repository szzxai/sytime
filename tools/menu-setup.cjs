'use strict';
// Run with --import tsx after npm run build. Credentials come from the environment
// or a local key file; never accept them as command-line arguments or log them.
require('dotenv/config');
const fs = require('node:fs');
const path = require('node:path');
const createApp = require('../apps/api/src/app');
const root = path.resolve(process.env.APP_ROOT || process.cwd());
process.env.MENU_WORKER_PATH = path.resolve('apps/api/dist/worker.cjs');
async function main() {
  const key = (
    process.env.GEMINI_API_KEY ||
    (process.env.MENU_KEY_FILE ? fs.readFileSync(process.env.MENU_KEY_FILE, 'utf8') : '')
  ).trim();
  if (!key) throw new Error('Set GEMINI_API_KEY or MENU_KEY_FILE before setup');
  const { db, menuService: service } = createApp(root);
  try {
    service.saveSettings({
      provider: 'gemini',
      model: process.env.MENU_GEMINI_MODEL || 'gemini-flash-lite-latest',
      api_key: key,
      schedule_mode: 'weekend',
    });
    await service.testSettings();
    service.saveSettings({ enabled: true });
    console.log('Gemini capability test passed; weekend schedule enabled.');
    const job = await service.enqueue();
    let result;
    do {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      result = service.job(job.id);
    } while (result.status === 'running');
    console.log(
      JSON.stringify(
        {
          id: result.id,
          status: result.status,
          total: result.total,
          succeeded: result.succeeded,
          failed: result.failed,
          items: result.items.map((item) => ({
            article_id: item.article_id,
            status: item.status,
            records_count: item.records_count,
            error: item.error,
          })),
        },
        null,
        2,
      ),
    );
    if (!['succeeded'].includes(result.status)) process.exitCode = 1;
  } finally {
    await service.close();
    db.$client.close();
  }
}
main().catch(() => {
  // Avoid echoing library exceptions that might include API credentials.
  console.error('Menu setup failed. Check configuration and the saved job diagnostics.');
  process.exitCode = 1;
});
