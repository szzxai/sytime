import { context } from 'esbuild';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { apiBuildOptions } from './build-api.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
let server;
let closing = false;
async function stopServer() {
  if (!server || server.exitCode !== null || server.signalCode !== null) return;
  const stopped = new Promise((resolve) => server.once('exit', resolve));
  server.kill('SIGTERM');
  await stopped;
}
const builder = await context({
  ...apiBuildOptions,
  plugins: [
    {
      name: 'restart-api',
      setup(build) {
        build.onEnd(async (result) => {
          if (result.errors.length || closing) return;
          await stopServer();
          if (closing) return;
          server = spawn(process.execPath, [root + 'server.js'], {
            cwd: root,
            stdio: 'inherit',
            env: { ...process.env, APP_ROOT: process.env.APP_ROOT || root },
          });
        });
      },
    },
  ],
});
async function shutdown() {
  if (closing) return;
  closing = true;
  await builder.dispose();
  await stopServer();
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
await builder.watch();
