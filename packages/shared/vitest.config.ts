import { defineConfig } from 'vitest/config';

// packages/shared runs pure-TS zod schema tests in the default node environment.
// No `include` → Vitest's default glob matches co-located `*.test.ts` next to source.
export default defineConfig({
  test: {
    globals: true,
  },
});
