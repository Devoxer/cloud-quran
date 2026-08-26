/**
 * THE CLIENT DATA LAYER AGAINST A REAL WORKER — story 5-6's central evidence.
 *
 * ⚠️ WHY THIS EXISTS AND `sync.test.ts` IS NOT ENOUGH. A mocked `api` cannot see a wrong route, a
 * body the worker rejects, a missing cookie, or a response the drain mis-branches on — the mock
 * answers whatever it was told to answer, on whatever path it was called. Every one of those is a
 * defect that typechecks, lints and unit-tests perfectly and then does nothing in production. So
 * this boots the REAL worker under `wrangler dev` against a REAL local D1, mints REAL anonymous
 * sessions, and drives the REAL outbox and the REAL `send`.
 *
 * ⚠️ IT LIVES IN `apps/expo`, NOT `apps/worker`, AND THAT IS A GATE, NOT A PREFERENCE.
 * `lint:layers` rule 3 forbids `apps/worker/src` importing anything from `apps/expo` — so a
 * client-side integration test cannot live beside the worker's own. The harness below (free port,
 * `--persist-to` a temp dir, real migrations, `waitForHealth`) is copied from
 * `apps/worker/src/__tests__/sync.integration.test.ts`, deliberately, so the two stay recognisable
 * as the same shape.
 *
 * ⚠️ `globalThis.fetch` IS REPLACED, AND THE REASON IS THE TEST ENVIRONMENT, NOT THE CODE.
 * jest-expo runs under React Native's environment, where `fetch` is `whatwg-fetch` layered over
 * RN's `XMLHttpRequest` — which has no native side under Jest and never settles. A single request
 * hangs the runner forever with no error. Everything ABOVE the socket is the real thing: the hono
 * client builds the URL and the body, `lib/api.ts` attaches the cookie, and `send` branches on the
 * status the worker actually returned.
 *
 * ⚠️ `--persist-to` A TEMP DIR. The suite seeds rows; running it against `.wrangler/state/` would
 * make the second run see the first run's data and pass for the wrong reason.
 */

import { type ChildProcess, execFile, spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import { createElement, type ReactNode } from 'react';
import { createAppMMKV } from './mmkv';
import { createOutbox, outbox } from './outbox';
// The device cache, reached directly: `lib/sync.ts` deliberately stops re-exporting the storage
// primitives (see its re-export docblock), and these cases assert on what landed in MMKV.
import { readCache, writeCache } from './syncCache';

const execFileAsync = promisify(execFile);
const require_ = createRequire(__filename);
const repoRoot = join(__dirname, '..', '..', '..', '..');
const workerRoot = join(repoRoot, 'apps', 'worker');
const wranglerBin = join(dirname(require_.resolve('wrangler/package.json')), 'bin/wrangler.js');

/** The session signing key for this run. Local-only, never leaves this process tree. */
const AUTH_SECRET = 'expo-integration-better-auth-secret-0123456789';

/** Mutable state the two module mocks read. Both defer their reads, so TDZ is not a problem. */
const mockState = {
  baseUrl: '',
  cookie: '',
  /** Airplane mode. The transport throws exactly the way a dead network does. */
  transportDown: false,
};

// The base URL is only known after a free port is chosen, so the mock reads it at ACCESS time and
// `@/lib/api` — which calls `hc(config.api.baseUrl)` at module scope — is required afterwards.
jest.mock('@/lib/config', () => ({
  get config() {
    return {
      ...jest.requireActual('@/lib/config').config,
      api: { baseUrl: mockState.baseUrl },
    };
  },
}));

// ⚠️ THE ONLY MOCK THAT REPLACES REAL BEHAVIOUR, AND IT HANDS BACK A REAL CREDENTIAL.
// `@better-auth/expo`'s client keeps the session in SecureStore, which does not exist under Jest.
// The cookie below comes from an actual `POST /api/auth/sign-in/anonymous` against the worker, so
// `lib/api.ts` still has to attach it correctly — the "missing cookie" failure is still in scope,
// which is the point of not mocking `@/lib/api` itself.
jest.mock('@/lib/auth', () => ({
  authClient: { getCookie: async () => mockState.cookie },
}));

type RawResponse = { status: number; body: string; setCookie: string | null };

/** One HTTP request over `node:http`. The transport under everything in this file. */
function rawRequest(
  url: string,
  {
    method = 'GET',
    headers = {},
    body,
  }: { method?: string; headers?: Record<string, string>; body?: string } = {}
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const req = httpRequest(
      {
        hostname: target.hostname,
        port: target.port,
        path: `${target.pathname}${target.search}`,
        method,
        headers:
          body === undefined ? headers : { ...headers, 'content-length': Buffer.byteLength(body) },
      },
      (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          text += chunk;
        });
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            body: text,
            setCookie: res.headers['set-cookie']?.[0] ?? null,
          })
        );
      }
    );
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

/** Flatten whatever `Headers`-ish thing the hono client hands us into a plain record. */
function toHeaderRecord(headers: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  if (typeof (headers as Headers).forEach === 'function') {
    (headers as Headers).forEach((value: string, key: string) => {
      out[key] = value;
    });
    return out;
  }
  for (const [key, value] of Object.entries(headers as Record<string, string>)) out[key] = value;
  return out;
}

/** A `Response`-shaped answer over `node:http` — enough for the hono client and for `send`. */
function installFetchShim(): void {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (mockState.transportDown) throw new TypeError('Network request failed');
    const url = typeof input === 'string' ? input : input.toString();
    const res = await rawRequest(url, {
      method: init?.method ?? 'GET',
      headers: toHeaderRecord(init?.headers),
      body: typeof init?.body === 'string' ? init.body : undefined,
    });
    return {
      status: res.status,
      ok: res.status >= 200 && res.status < 300,
      headers: {
        get: (name: string) => (name.toLowerCase() === 'set-cookie' ? res.setCookie : null),
      },
      text: async () => res.body,
      json: async () => JSON.parse(res.body),
    } as unknown as Response;
  }) as typeof fetch;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function waitForHealth(url: string, deadlineMs: number): Promise<void> {
  const until = Date.now() + deadlineMs;
  let lastError: unknown;
  while (Date.now() < until) {
    try {
      const res = await rawRequest(`${url}/health`);
      if (res.status === 200) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`wrangler dev never became healthy at ${url}: ${String(lastError)}`);
}

/**
 * A distinct caller address per identity. `lib/auth.ts` keys its rate limiter on
 * `cf-connecting-ip`, and upstream limits anonymous sign-in to 3 per 10s — without this the whole
 * suite is one caller hammering the same route.
 */
let callerSeq = 0;
async function identity(): Promise<{ cookie: string; userId: string }> {
  callerSeq += 1;
  const res = await rawRequest(`${mockState.baseUrl}/api/auth/sign-in/anonymous`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': `203.0.113.${callerSeq}` },
    body: '{}',
  });
  const parsed = JSON.parse(res.body) as { user?: { id?: string } };
  if (!res.setCookie || !parsed.user?.id) {
    throw new Error(`anonymous sign-in failed (${res.status}): ${res.body}`);
  }
  return { cookie: res.setCookie.split(';')[0], userId: parsed.user.id };
}

let child: ChildProcess | undefined;
let persistTo = '';

// ⚠️ `./sync` is REQUIRED LATE, once the base URL is known — see the note in `beforeAll`. Only
// this one module has to wait: `./outbox` and `./mmkv` touch no configuration, so they are
// ordinary top-level imports.
type SyncModule = typeof import('./sync');
let sync: SyncModule;

let alice: { cookie: string; userId: string };
let bob: { cookie: string; userId: string };

const asAlice = () => {
  mockState.cookie = alice.cookie;
  sync.setSyncUserId(alice.userId);
};
const asBob = () => {
  mockState.cookie = bob.cookie;
  sync.setSyncUserId(bob.userId);
};

jest.setTimeout(180_000);

beforeAll(async () => {
  installFetchShim();
  persistTo = mkdtempSync(join(tmpdir(), 'cq-expo-d1-'));
  const env = { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false' };

  // Real migrations, applied by wrangler — the same command a human runs, against the same
  // committed .sql. If the migration is wrong, this suite cannot start.
  await execFileAsync(
    process.execPath,
    [wranglerBin, 'd1', 'migrations', 'apply', 'cloud-quran', '--local', '--persist-to', persistTo],
    { cwd: workerRoot, env }
  );

  const port = await freePort();
  mockState.baseUrl = `http://127.0.0.1:${port}`;
  child = spawn(
    process.execPath,
    [
      wranglerBin,
      'dev',
      '--local',
      '--persist-to',
      persistTo,
      '--ip',
      '127.0.0.1',
      '--port',
      String(port),
      '--var',
      `BETTER_AUTH_SECRET:${AUTH_SECRET}`,
      '--var',
      'ENVIRONMENT:development',
    ],
    { cwd: workerRoot, env, stdio: ['ignore', 'ignore', 'ignore'] }
  );
  await waitForHealth(mockState.baseUrl, 90_000);

  // ⚠️ REQUIRED HERE, NOT AT THE TOP. `lib/api.ts` calls `hc(config.api.baseUrl)` at MODULE
  // SCOPE, so it must not be loaded until the port is known — an `import` at the top of this file
  // would pin the client to the empty default base URL and every request would go nowhere.
  sync = require('./sync');

  alice = await identity();
  bob = await identity();
  expect(alice.userId).not.toBe(bob.userId);
});

afterAll(async () => {
  if (child && child.exitCode === null) {
    const exited = new Promise<void>((resolve) => child?.once('exit', () => resolve()));
    child.kill('SIGTERM');
    // ⚠️ THE GRACE TIMER IS CLEARED WHEN THE CHILD WINS THE RACE. An uncleared 10s `setTimeout`
    // holds Node's event loop open after the last assertion, and Jest reports it as
    // "did not exit one second after the test run" — a warning that reads like a leaked handle
    // in the code under test rather than in the teardown that printed it.
    let grace: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      exited,
      new Promise((resolve) => {
        grace = setTimeout(resolve, 10_000);
      }),
    ]);
    if (grace) clearTimeout(grace);
    if (child.exitCode === null) child.kill('SIGKILL');
  }
  if (persistTo) rmSync(persistTo, { recursive: true, force: true });
  sync?.clearSyncState();
});

beforeEach(() => {
  mockState.transportDown = false;
  // ⚠️ BOTH CALLS, AND THE COMMENT HERE USED TO CLAIM THE SECOND ONE DID THE FIRST ONE'S JOB.
  // `clearSyncState` empties the queue and the caches; it does NOT cancel the debounce, which
  // lives one module up from it (see its docblock). The first case below writes through
  // `setReadingPosition`, which arms a real 2s drain on the module singleton — and with a live
  // worker on the other end, that timer firing inside a LATER case would empty a queue out from
  // under an assertion. The unit suite calls both for exactly this reason.
  sync.cancelScheduledDrains();
  sync.clearSyncState();
});

const position = (updatedAt: number, surah: number) => ({
  kind: 'reading-position' as const,
  body: { surah, verse: 1, page: surah, mode: 'reading' as const, updatedAt },
});

const prefs = (updatedAt: number, fontSize: number) => ({
  kind: 'preferences' as const,
  body: {
    theme: 'sepia' as const,
    fontSize,
    reciterId: 'alafasy',
    readingMode: 'mushaf' as const,
    translationId: null,
    speedRate: 1.25,
    transliteration: false,
    updatedAt,
  },
});

const bookmark = (id: string, verse: number) => ({
  kind: 'bookmark-create' as const,
  body: { id, surah: 18, verse, label: null, createdAt: 1_700_000_000_000 },
});

/** A second outbox over the SAME store — what the app has after a relaunch. */
const relaunchedOutbox = () => createOutbox(createAppMMKV('outbox'));

/**
 * Read a synced entity straight off the worker over raw HTTP, as the CURRENT cookie.
 *
 * ⚠️ DELIBERATELY NOT THROUGH `lib/sync`'s OWN READ PATH. The assertions below are about what the
 * WRITE path put in the database, and an instrument built out of the code under test cannot fail
 * independently of it — a shared bug in path or auth would make both agree on the wrong answer.
 * The read path gets its own case at the bottom of this file, where it is the subject.
 */
async function readBack<T>(path: string, field: string): Promise<T> {
  const res = await rawRequest(`${mockState.baseUrl}/api/sync/${path}`, {
    headers: { cookie: mockState.cookie },
  });
  const body = JSON.parse(res.body) as Record<string, unknown>;
  if (body.ok !== true) throw new Error(`read-back refused (${res.status}): ${res.body}`);
  return body[field] as T;
}

type Row = Record<string, unknown>;
const storedPosition = () => readBack<Row | null>('reading-position', 'position');
const storedPreferences = () => readBack<Row | null>('preferences', 'preferences');
const storedBookmarks = () => readBack<Row[]>('bookmarks', 'bookmarks');

describe('the write path, end to end', () => {
  it('a mutation made OFFLINE is durable, survives a relaunch, and lands on reconnect', async () => {
    // ⚠️ THE STORY'S CENTRAL CASE. Everything between the mutation and the row coming back over
    // HTTP is real: MMKV, the coalescing queue, `lib/api.ts`'s cookie header, the hono client's
    // path and body, the worker's validation, D1, and `send`'s branch on the status.
    asAlice();
    mockState.transportDown = true;

    sync.setReadingPosition({ surah: 36, verse: 1, page: 36, mode: 'reading' });
    await sync.drainNow();

    // Nothing left the device, and the write is still there.
    expect(outbox.size()).toBe(1);
    // The reader already sees it — the local cache is updated before anything is sent.
    expect(readCache(alice.userId, 'reading-position')?.data).toMatchObject({ surah: 36 });

    // The relaunch: a NEW outbox instance, sharing nothing in memory with the one above.
    const afterRelaunch = relaunchedOutbox();
    expect(afterRelaunch.size()).toBe(1);

    // ⚠️ NO `await` BETWEEN THESE TWO LINES, ON PURPOSE. The debounced drain scheduled by the
    // mutation above is still pending; a timer can only fire at an await boundary, so draining
    // synchronously after bringing the transport up is what keeps the two off each other.
    mockState.transportDown = false;
    const result = await afterRelaunch.drain(sync.send);

    expect(result).toEqual({ sent: 1, dropped: 0, halted: false, remaining: 0 });

    // …and the row is really on the server, read back through the real client.
    expect(await storedPosition()).toMatchObject({
      surah: 36,
      verse: 1,
      page: 36,
      mode: 'reading',
    });
  });

  it('an entry with NO session is kept, not dropped — a 401 is normal, not a failure', async () => {
    asAlice();
    mockState.cookie = '';
    outbox.enqueue(position(Date.now(), 12));

    const result = await outbox.drain(sync.send);

    expect(result.remaining).toBe(1);
    expect(result.sent).toBe(0);
  });

  it('an LWW no-op comes back `applied: false` and is treated as SUCCESS', async () => {
    asAlice();
    const now = Date.now();
    outbox.enqueue(position(now, 20));
    await outbox.drain(sync.send);

    // Re-send an OLDER timestamp: the worker's `setWhere: lt(updatedAt, incoming)` changes no row
    // and answers 200 `{ ok: true, applied: false }`. Retrying that spins forever, because a
    // no-op and a skewed clock are indistinguishable from the client.
    outbox.enqueue(position(now - 60_000, 21));
    const result = await outbox.drain(sync.send);

    expect(result).toEqual({ sent: 1, dropped: 0, halted: false, remaining: 0 });
    expect(await storedPosition()).toMatchObject({ surah: 20 });
  });

  it('a 409 from a real id collision is DROPPED, and the drain carries on', async () => {
    // `createBookmark`'s untargeted `onConflictDoNothing()` answers 409 when the id belongs to
    // somebody else (deferred-work.md). Retrying it would wedge every later write behind it.
    asAlice();
    outbox.enqueue(bookmark('shared-id', 1));
    await outbox.drain(sync.send);

    asBob();
    outbox.enqueue(bookmark('shared-id', 2));
    outbox.enqueue(bookmark('bobs-own', 3));
    const result = await outbox.drain(sync.send);

    expect(result).toEqual({ sent: 1, dropped: 1, halted: false, remaining: 0 });
    expect((await storedBookmarks()).map((b) => b.id)).toEqual(['bobs-own']);
  });

  it('a body the worker refuses is DROPPED rather than retried forever', async () => {
    asAlice();
    // `surah: 999` fails `parseReadingPosition` — a 422 the server will never accept.
    outbox.enqueue({
      ...position(Date.now(), 1),
      body: { surah: 999, verse: 1, page: 1, mode: 'reading', updatedAt: Date.now() },
    });

    const result = await outbox.drain(sync.send);

    expect(result).toEqual({ sent: 0, dropped: 1, halted: false, remaining: 0 });
  });
});

describe('two devices, one reader — the worker decides, and the drain does not defeat it', () => {
  it('bookmarks UNION-MERGE and position resolves LAST-WRITE-WINS', async () => {
    // Two outboxes over two different stores: one reader, two devices, both written offline.
    asAlice();
    const deviceA = createOutbox(createAppMMKV('outbox-device-a'));
    const deviceB = createOutbox(createAppMMKV('outbox-device-b'));
    deviceA.clear();
    deviceB.clear();

    const older = Date.now() - 5_000;
    const newer = Date.now();
    deviceA.enqueue(bookmark('merge-a', 11));
    deviceA.enqueue(position(newer, 55));
    deviceB.enqueue(bookmark('merge-b', 12));
    deviceB.enqueue(position(older, 66));

    // B reconnects LAST and carries the OLDER position — the wire order is not the answer.
    await deviceA.drain(sync.send);
    await deviceB.drain(sync.send);

    const bookmarks = await storedBookmarks();
    // `arrayContaining`, not equality: this reader accumulates rows across the cases above, and
    // what is being asserted is that NEITHER device's bookmark was lost — not the whole table.
    expect(bookmarks.map((b) => b.id)).toEqual(expect.arrayContaining(['merge-a', 'merge-b']));
    // Neither device's bookmark was lost, and the LATER write won the single-row table.
    expect(await storedPosition()).toMatchObject({ surah: 55 });
  });

  it('PREFERENCES resolve last-write-wins too, not just position', async () => {
    // ⚠️ ONLY READING-POSITION HAD REAL-WORKER LWW EVIDENCE. The three single-row tables share a
    // guarded upsert, but "share" is an assumption until two of them are driven — and preferences
    // is the one whose body has eight fields, any of which a wrong mapping could drop.
    asAlice();
    const older = Date.now() - 5_000;
    const newer = Date.now();

    outbox.enqueue(prefs(newer, 42));
    await outbox.drain(sync.send);
    outbox.enqueue(prefs(older, 20));
    const result = await outbox.drain(sync.send);

    // The stale write is a `{ ok: true, applied: false }` no-op, and the drain treats it as sent.
    expect(result).toEqual({ sent: 1, dropped: 0, halted: false, remaining: 0 });
    const stored = await storedPreferences();
    expect(stored).toMatchObject({ fontSize: 42, theme: 'sepia', speedRate: 1.25 });
  });

  it("one reader's rows are invisible to another — authorization is the shape of the query", async () => {
    // ⚠️ BOB HAS TO WRITE FIRST, OR THIS PASSES FOR THE WRONG REASON. Reading as a user who owns
    // nothing returns nothing whatever the authorization does — the assertion only means
    // something once Bob has rows of his own to be confused with Alice's.
    asBob();
    outbox.enqueue(position(Date.now(), 7));
    outbox.enqueue(bookmark('bobs-only', 21));
    await outbox.drain(sync.send);

    const bobsPosition = await storedPosition();
    expect(bobsPosition).toMatchObject({ surah: 7, userId: bob.userId });
    const bobsBookmarks = await storedBookmarks();
    expect(bobsBookmarks.length).toBeGreaterThan(0);
    expect(bobsBookmarks.every((b) => b.userId === bob.userId)).toBe(true);
    // Alice wrote surah 55 and the `merge-*` bookmarks above; none of it is visible here.
    expect(bobsPosition?.surah).not.toBe(55);
    expect(bobsBookmarks.map((b) => b.id)).not.toContain('merge-a');

    // …and Alice still sees hers, unchanged by anything Bob did.
    asAlice();
    expect(await storedPosition()).toMatchObject({ surah: 55, userId: alice.userId });
  });
});

describe('the read path, end to end', () => {
  it('a hook paints the cached row first and then reconciles from the real worker', async () => {
    // The read half of the story, with nothing mocked between the hook and D1: `useReadingPosition`
    // seeds synchronously from MMKV, the query fires `GET /api/sync/reading-position` with the
    // session cookie attached by `lib/api.ts`, and the worker's `{ ok, position }` envelope is
    // unwrapped into the same shape the cache holds.
    asAlice();
    outbox.enqueue(position(Date.now(), 78));
    await outbox.drain(sync.send);

    expect(await storedPosition()).toMatchObject({ surah: 78 });

    // A cache left by a PREVIOUS launch — deliberately wrong, so the reconciliation is visible,
    // and deliberately OLD, because a fresh seed is not refetched at all (`staleTime`).
    const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.now() - 10 * 60_000);
    writeCache(alice.userId, 'reading-position', { surah: 1, verse: 1 });
    clock.mockRestore();
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: sync.queryClient }, children);

    const { result } = renderHook(() => sync.useReadingPosition(), { wrapper });

    expect(result.current.data).toMatchObject({ surah: 1 });
    await waitFor(() => expect(result.current.data).toMatchObject({ surah: 78 }));
    // …and the answer is written back to the device cache for the next cold launch.
    expect(readCache(alice.userId, 'reading-position')?.data).toMatchObject({ surah: 78 });
  });
});
