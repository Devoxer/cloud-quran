/**
 * Bundle the Electron main + preload for `apps/desktop` (Story 38.3).
 *
 * ⚠️ THIS EXISTS BECAUSE tsc OUTPUT IS NOT SHIPPABLE HERE. `pnpm-workspace.yaml` sets
 * `nodeLinker: hoisted`, so `apps/desktop/node_modules` does not exist — every dependency
 * lives in the repo-root store. `@electron/packager` copies the forge project directory, so
 * a packaged app built from bare tsc output carries `.dist/main.js` and NO `node_modules`:
 * `import serve from 'electron-serve'` then resolves only while the .app happens to sit
 * inside the repo, where Node walks up into the hoisted store. Copy the .app anywhere else —
 * which is what an installer does — and the window comes up blank. Bundling inlines the
 * dependency so the asar is self-contained wherever it lands.
 *
 * `electron` stays external: it is provided by the runtime, never bundled.
 *
 * Preload is emitted as `.cjs` on purpose. `apps/desktop/package.json` declares
 * `"type": "module"`, which would make a `.js` preload ESM, and Electron only accepts an ESM
 * preload under conditions this shell does not meet. The explicit extension sidesteps the
 * question entirely.
 */
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

// fileURLToPath, NOT `URL.pathname` — on Windows the latter returns `/D:/a/...`, a path with
// a leading slash before the drive letter that nothing can resolve. It reads fine on macOS and
// Linux, so it failed only on the windows-latest runner.
const root = fileURLToPath(new URL('../apps/desktop/', import.meta.url));
// Wipe stale output first — a rename or an extension change otherwise leaves the old file
// sitting in `.dist`, and packaging copies whatever is there.
await rm(path.join(root, '.dist'), { recursive: true, force: true });

const shared = {
  bundle: true,
  platform: 'node',
  target: 'node22', // Electron 42 ships Node 22.
  external: ['electron'],
  logLevel: 'info',
};

await build({
  ...shared,
  entryPoints: [path.join(root, 'src', 'main.ts')],
  format: 'esm',
  outfile: path.join(root, '.dist', 'main.js'),
});

await build({
  ...shared,
  entryPoints: [path.join(root, 'src', 'preload.ts')],
  format: 'cjs',
  outfile: path.join(root, '.dist', 'preload.cjs'),
});
