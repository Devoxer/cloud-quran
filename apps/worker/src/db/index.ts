/**
 * The Drizzle client factory.
 *
 * ⚠️ CONSTRUCT PER REQUEST FROM `c.env.DB`. Never hoist a database handle to module scope in a
 * Worker: module scope is shared across every request an isolate serves and outlives any one of
 * them, so a hoisted handle leaks one request's binding into the next.
 */
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

export function createDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

export type Database = ReturnType<typeof createDb>;
