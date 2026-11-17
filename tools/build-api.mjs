import { build } from 'esbuild';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
export const apiBuildOptions = {
  absWorkingDir: root,
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  packages: 'external',
  sourcemap: true,
  entryPoints: {
    index: 'apps/api/src/index.ts',
    worker: 'apps/api/src/domain/menu/worker.js',
    operator: 'tools/operator.cjs',
  },
  outdir: 'apps/api/dist',
  outExtension: { '.js': '.cjs' },
};
if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
)
  await build(apiBuildOptions);
