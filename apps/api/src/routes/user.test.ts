import { jest, describe, test, expect } from '@jest/globals';

// Mock better-auth to avoid ESM import issues
jest.unstable_mockModule('../auth', () => ({
  createAuth: (env: Record<string, unknown>) => ({
    api: {
      getSession: () => {
        if (!env.BETTER_AUTH_SECRET) return Promise.resolve(null);
        return Promise.resolve({
          user: { id: 'test-user-id', name: 'Test', email: 'test@test.com' },
          session: {
            id: 'sess-1',
            userId: 'test-user-id',
            token: 'tok',
            expiresAt: new Date(),
          },
        });
      },
    },
    handler: () => new Response('ok'),
  }),
}));

const { default: app } = await import('../index');

// Track SQL statements for verification
let executedStatements: string[] = [];

function createMockD1() {
  executedStatements = [];
  return {
    prepare: (sql: string) => {
      executedStatements.push(sql);
      const boundResult = {
        run: () => Promise.resolve({ success: true, meta: { changes: 1 } }),
        all: () => Promise.resolve({ results: [] }),
        first: () => Promise.resolve(null),
        raw: () => Promise.resolve([]),
      };
      const statement = {
        bind: (..._params: unknown[]) => boundResult,
        ...boundResult,
      };
      return statement;
    },
    exec: () => Promise.resolve({ count: 0 }),
    batch: (stmts: unknown[]) =>
      Promise.resolve((stmts as unknown[]).map(() => ({ results: [] }))),
    dump: () => Promise.resolve(new ArrayBuffer(0)),
  } as unknown as D1Database;
}

function createMockEnv() {
  return {
    DB: createMockD1(),
    BETTER_AUTH_SECRET: 'test-secret',
    BETTER_AUTH_URL: 'http://localhost:8787',
    GOOGLE_CLIENT_ID: 'gid',
    GOOGLE_CLIENT_SECRET: 'gsec',
    APPLE_CLIENT_ID: 'aid',
    APPLE_CLIENT_SECRET: 'asec',
    RESEND_API_KEY: 'rkey',
  } as never;
}

describe('User routes', () => {
  describe('DELETE /api/user/data', () => {
    test('returns 401 without auth', async () => {
      const res = await app.request(
        '/api/user/data',
        { method: 'DELETE' },
        {} as never,
      );
      expect(res.status).toBe(401);
    });

    test('returns 200 and deletes all user data', async () => {
      const res = await app.request(
        '/api/user/data',
        { method: 'DELETE' },
        createMockEnv(),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.ok).toBe(true);
    });

    test('deletes from all expected tables', async () => {
      await app.request(
        '/api/user/data',
        { method: 'DELETE' },
        createMockEnv(),
      );

      // Verify DELETE statements were issued for all tables
      const deleteStatements = executedStatements.filter((s) =>
        s.toLowerCase().startsWith('delete'),
      );
      expect(deleteStatements.length).toBe(7);

      // Verify app data tables
      expect(deleteStatements.some((s) => s.includes('reading_positions'))).toBe(true);
      expect(deleteStatements.some((s) => s.includes('bookmarks'))).toBe(true);
      expect(deleteStatements.some((s) => s.includes('preferences'))).toBe(true);
      expect(deleteStatements.some((s) => s.includes('audio_positions'))).toBe(true);

      // Verify auth tables
      expect(deleteStatements.some((s) => s.includes('"session"'))).toBe(true);
      expect(deleteStatements.some((s) => s.includes('"account"'))).toBe(true);
      expect(deleteStatements.some((s) => s.includes('"user"'))).toBe(true);
    });
  });

  describe('GET /api/user/export', () => {
    test('returns 401 without auth', async () => {
      const res = await app.request('/api/user/export', {}, {} as never);
      expect(res.status).toBe(401);
    });

    test('returns 200 with export data structure', async () => {
      const res = await app.request('/api/user/export', {}, createMockEnv());
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty('exportedAt');
      expect(body).toHaveProperty('user');
      expect(body).toHaveProperty('data');

      const data = body.data as Record<string, unknown>;
      expect(data).toHaveProperty('position');
      expect(data).toHaveProperty('bookmarks');
      expect(data).toHaveProperty('preferences');
      expect(data).toHaveProperty('audio');
    });

    test('returns Content-Disposition header', async () => {
      const res = await app.request('/api/user/export', {}, createMockEnv());
      expect(res.status).toBe(200);
      const disposition = res.headers.get('Content-Disposition');
      expect(disposition).toBe('attachment; filename="cloud-quran-export.json"');
    });

    test('returns empty export for user with no data', async () => {
      const res = await app.request('/api/user/export', {}, createMockEnv());
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.user).toBeNull();
      const data = body.data as Record<string, unknown>;
      expect(data.position).toBeNull();
      expect(data.bookmarks).toEqual([]);
      expect(data.preferences).toBeNull();
      expect(data.audio).toBeNull();
    });
  });
});
