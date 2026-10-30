import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const vite = path.join(path.dirname(require.resolve('vite/package.json')), 'bin/vite.js');
const children = [
  spawn(process.execPath, [path.join(root, 'tools/dev-api.mjs')], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, APP_ROOT: process.env.APP_ROOT || root },
  }),
  spawn(process.execPath, [vite], { cwd: path.join(root, 'apps/web'), stdio: 'inherit' }),
];
let closing = false;
function stop() {
  if (closing) return;
  closing = true;
  children.forEach((child) => child.kill('SIGTERM'));
}
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
children.forEach((child) => {
  child.once('error', (error) => {
    console.error(error);
    process.exitCode = 1;
    stop();
  });
  child.once('exit', (code) => {
    process.exitCode ||= code || 0;
    stop();
  });
});
