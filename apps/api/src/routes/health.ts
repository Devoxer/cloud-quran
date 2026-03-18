import { Hono } from 'hono';
import type { Bindings } from '../index';

export const healthRoutes = new Hono<{ Bindings: Bindings }>().get('/', async (c) => {
  // Verify D1 connection with a simple query
  try {
    const result = await c.env.DB.prepare('SELECT 1 as ok').first<{ ok: number }>();
    return c.json({
      status: 'ok',
      db: result?.ok === 1 ? 'connected' : 'error',
      timestamp: new Date().toISOString(),
    });
  } catch {
    return c.json(
      {
        status: 'degraded',
        db: 'error',
        timestamp: new Date().toISOString(),
      },
      503,
    );
  }
});
