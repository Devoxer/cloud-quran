import { jest, describe, test, expect, beforeEach } from '@jest/globals';

// Mock better-auth to avoid ESM import issues
// When env has no valid auth secret, return null session (401)
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

function createMockD1() {
  return {
    prepare: (sql: string) => {
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

describe('Sync routes', () => {
  describe('POST /api/sync/push', () => {
    test('returns 401 without auth', async () => {
      // Empty env → mock auth returns null session → 401
      const res = await app.request(
        '/api/sync/push',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        },
        {} as never,
      );
      expect(res.status).toBe(401);
    });

    test('returns 400 for invalid payload — surah out of range', async () => {
      const res = await app.request(
        '/api/sync/push',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ position: { currentSurah: 999, currentVerse: 1, currentMode: 'r', lastReadTimestamp: 1 } }),
        },
        createMockEnv(),
      );
      expect(res.status).toBe(400);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.error).toBe('Invalid payload');
    });

    test('returns 400 for invalid fontSize', async () => {
      const res = await app.request(
        '/api/sync/push',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            preferences: { fontSize: 100, autoFollowAudio: true, tapToSeek: false },
          }),
        },
        createMockEnv(),
      );
      expect(res.status).toBe(400);
    });

    test('returns 400 for surah = 0', async () => {
      const res = await app.request(
        '/api/sync/push',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            position: { currentSurah: 0, currentVerse: 1, currentMode: 'reading', lastReadTimestamp: 1 },
          }),
        },
        createMockEnv(),
      );
      expect(res.status).toBe(400);
    });

    test('returns 200 for valid push with all sections', async () => {
      const payload = {
        position: {
          currentSurah: 2,
          currentVerse: 142,
          currentMode: 'reading',
          lastReadTimestamp: Date.now(),
        },
        bookmarks: [
          { surahNumber: 1, verseNumber: 1, createdAt: 1000 },
          { surahNumber: 2, verseNumber: 255, createdAt: 2000 },
        ],
        preferences: { fontSize: 30, autoFollowAudio: true, tapToSeek: false },
        audio: { selectedReciterId: 'alafasy', playbackSpeed: 1.0, continuousPlayback: true },
      };

      const res = await app.request(
        '/api/sync/push',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
        createMockEnv(),
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.ok).toBe(true);
      expect(body.serverTimestamp).toBeDefined();
    });

    test('returns 200 for partial payload (position only)', async () => {
      const res = await app.request(
        '/api/sync/push',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            position: { currentSurah: 1, currentVerse: 1, currentMode: 'mushaf', lastReadTimestamp: Date.now() },
          }),
        },
        createMockEnv(),
      );
      expect(res.status).toBe(200);
    });

    test('returns 200 for empty payload (no sections)', async () => {
      const res = await app.request(
        '/api/sync/push',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        },
        createMockEnv(),
      );
      expect(res.status).toBe(200);
    });

    test('returns 400 for playbackSpeed out of range', async () => {
      const res = await app.request(
        '/api/sync/push',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            audio: { selectedReciterId: 'x', playbackSpeed: 5.0, continuousPlayback: true },
          }),
        },
        createMockEnv(),
      );
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/sync/pull', () => {
    test('returns 401 without auth', async () => {
      const res = await app.request('/api/sync/pull', {}, {} as never);
      expect(res.status).toBe(401);
    });

    test('returns 200 with sync data structure', async () => {
      const res = await app.request('/api/sync/pull', {}, createMockEnv());

      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty('position');
      expect(body).toHaveProperty('bookmarks');
      expect(body).toHaveProperty('preferences');
      expect(body).toHaveProperty('audio');
    });

    test('returns ETag header', async () => {
      const res = await app.request('/api/sync/pull', {}, createMockEnv());
      expect(res.status).toBe(200);
      const etag = res.headers.get('ETag');
      expect(etag).toBeTruthy();
      expect(etag).toMatch(/^"[a-f0-9]+"$/);
    });

    test('returns 304 when ETag matches', async () => {
      const env = createMockEnv();
      const res1 = await app.request('/api/sync/pull', {}, env);
      const etag = res1.headers.get('ETag');
      expect(etag).toBeTruthy();

      const res2 = await app.request(
        '/api/sync/pull',
        { headers: { 'If-None-Match': etag! } },
        env,
      );
      expect(res2.status).toBe(304);
    });

    test('returns null/empty for new user with no data', async () => {
      const res = await app.request('/api/sync/pull', {}, createMockEnv());
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.position).toBeNull();
      expect(body.bookmarks).toEqual([]);
      expect(body.preferences).toBeNull();
      expect(body.audio).toBeNull();
    });
  });
});
