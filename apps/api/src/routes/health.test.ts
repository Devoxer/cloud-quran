import app from '../index';

// Mock D1Database
function createMockD1(result: unknown = { ok: 1 }, shouldThrow = false) {
  return {
    prepare: () => ({
      first: shouldThrow
        ? () => {
            throw new Error('DB connection failed');
          }
        : () => Promise.resolve(result),
      run: () => Promise.resolve({ success: true }),
      all: () => Promise.resolve({ results: [] }),
      bind: () => ({
        first: () => Promise.resolve(result),
        run: () => Promise.resolve({ success: true }),
        all: () => Promise.resolve({ results: [] }),
      }),
    }),
    exec: () => Promise.resolve({ count: 0 }),
    batch: () => Promise.resolve([]),
    dump: () => Promise.resolve(new ArrayBuffer(0)),
  } as unknown as D1Database;
}

describe('Health endpoint', () => {
  it('GET /api/health returns 200 with db connected', async () => {
    const res = await app.request('/api/health', {}, { DB: createMockD1() } as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.status).toBe('ok');
    expect(body.db).toBe('connected');
    expect(body.timestamp).toBeDefined();
  });

  it('GET /api/health returns 503 when DB fails', async () => {
    const res = await app.request('/api/health', {}, { DB: createMockD1(null, true) } as never);
    expect(res.status).toBe(503);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.status).toBe('degraded');
    expect(body.db).toBe('error');
  });
});
