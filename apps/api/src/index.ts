/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createAuth } from './auth';
import { requireAuth } from './middleware/auth';
import { writeGuard } from './middleware/write-guard';
import { healthRoutes } from './routes/health';
import { syncRoutes } from './routes/sync';
import { userRoutes } from './routes/user';

export type Bindings = {
  DB: D1Database;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  APPLE_CLIENT_ID: string;
  APPLE_CLIENT_SECRET: string;
  RESEND_API_KEY: string;
  ALLOWED_ORIGINS?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// Dynamic CORS — restrict origins based on environment
// Set ALLOWED_ORIGINS in wrangler.toml [vars] for production
app.use('*', async (c, next) => {
  const origins = c.env.ALLOWED_ORIGINS
    ? c.env.ALLOWED_ORIGINS.split(',')
    : ['http://localhost:8081', 'http://localhost:19006', 'http://localhost:8787'];
  const corsMiddleware = cors({
    origin: origins,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  });
  return corsMiddleware(c, next);
});

app.route('/api/health', healthRoutes);

// Better Auth handles its own routing under /api/auth/*
app.all('/api/auth/*', async (c) => {
  const auth = createAuth(c.env);
  return auth.handler(c.req.raw);
});

// Auth + write guard for protected routes
app.use('/api/sync/*', requireAuth, writeGuard);
app.use('/api/user/*', requireAuth, writeGuard);
app.route('/api/sync', syncRoutes);
app.route('/api/user', userRoutes);

export type AppType = typeof app;
export default app;
