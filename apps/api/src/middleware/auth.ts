import type { Context, Next } from 'hono';
import { createAuth } from '../auth';
import type { Bindings } from '../index';

export type AuthUser = {
  id: string;
  name: string;
  email: string;
};

export type AuthSessionData = {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
};

type AuthSession = {
  user: AuthUser;
  session: AuthSessionData;
};

export type AuthVariables = {
  user: AuthUser;
  session: AuthSessionData;
};

type AuthEnv = { Bindings: Bindings; Variables: AuthVariables };

/**
 * Middleware that validates the session and attaches user info to the context.
 * Returns 401 if no valid session is found.
 */
export async function requireAuth(c: Context<AuthEnv>, next: Next) {
  const auth = createAuth(c.env);
  const session = (await auth.api.getSession({
    headers: c.req.raw.headers,
  })) as AuthSession | null;

  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  c.set('user', session.user);
  c.set('session', session.session);
  await next();
}
