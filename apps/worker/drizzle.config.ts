import { defineConfig } from 'drizzle-kit';

/**
 * ⚠️ `dialect: 'sqlite'`, NOT `driver: 'd1-http'`. The d1-http driver makes drizzle-kit talk to
 * the REMOTE database over the Cloudflare API — which needs an account id and token, and spends
 * the shared daily budget. Plain sqlite generation emits the .sql the project owns; `wrangler d1
 * migrations apply` is what applies it, locally by default.
 *
 * The generated SQL is COMMITTED and is the durable artifact: dropping Drizzle still leaves a
 * schema. That is the whole portability claim.
 */
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle/migrations',
  dialect: 'sqlite',
});
