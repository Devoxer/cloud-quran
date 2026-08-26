import { defineConfig } from 'vitest/config';

/**
 * The worker's suite is two kinds of test in one runner:
 *   • pure unit tests (schema shape, the identity gate, validation bounds), and
 *   • ONE integration suite that boots `wrangler dev --local` and drives the real worker against
 *     a real local D1 (`src/__tests__/sync.integration.test.ts`).
 *
 * The boot is why `testTimeout`/`hookTimeout` are generous and why the file count is deliberately
 * small — a worker cold start is seconds, and paying it per file would be the whole runtime.
 */
export default defineConfig({
  test: {
    globals: true,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
