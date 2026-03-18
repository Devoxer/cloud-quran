import type { Context, Next } from 'hono';

const MAX_WRITES_PER_REQUEST = 100;

/**
 * Middleware that enforces a hard cap on D1 writes per request.
 * Prevents runaway loops from causing unbounded billing.
 *
 * Usage: Apply to all routes that write to D1.
 * The counter is tracked via a request-scoped variable.
 */
export async function writeGuard(c: Context, next: Next) {
  c.set('writeCount', 0);
  await next();
}

/**
 * Increment the write counter and abort if the cap is exceeded.
 * Call this before every D1 write operation.
 *
 * @throws Error if write cap is exceeded
 */
export function trackWrite(c: Context): void {
  const current = (c.get('writeCount') as number) || 0;
  if (current >= MAX_WRITES_PER_REQUEST) {
    throw new Error(
      `Write cap exceeded: ${MAX_WRITES_PER_REQUEST} writes per request. ` +
        'This is a safety guard against runaway billing. ' +
        'If this is expected, increase MAX_WRITES_PER_REQUEST.',
    );
  }
  c.set('writeCount', current + 1);
}
