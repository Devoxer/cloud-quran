/**
 * The query module — the I/O matrix, asserted at the `api` boundary.
 *
 * ⚠️ MOCKED AT THE CLIENT BOUNDARY, PROVEN ONCE AGAINST A REAL SERVER. That is the house
 * convention (`lib/auth.test.ts:20-26`) and it is a division of labour, not a shortcut: these
 * cases pin the POLICY — which status becomes which verdict, what a mutation writes locally, what
 * it invalidates, what survives a sign-out — while `sync.integration.test.ts` boots a real
 * `wrangler dev` and proves the parts a mock structurally cannot see: a wrong path, a missing
 * cookie, a response body the drain mis-branches on.
 *
 * ⚠️ THE MOCK USES A GETTER. Jest hoists `jest.mock` above the imports, and `./api` is required
 * while this module is still initialising — so a factory that touches `mockApi` EAGERLY would hit
 * the temporal dead zone. A getter defers the reference to the first `api.…` call, which is after
 * initialisation. (The same reason the sibling suites wrap their fakes in arrow functions.)
 */

import NetInfo from '@react-native-community/netinfo';
import { focusManager, onlineManager, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import { createElement, type ReactNode } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as errors from './errors';
import type { OutboxEntry } from './outbox';
import { outbox } from './outbox';
// ⚠️ THE STORAGE PRIMITIVES COME FROM `./syncCache`, NOT `./sync`. story 5-6's code review
// trimmed them out of the query module's re-export, because forwarding them handed a feature a
// blessed way to read and write server state with no hook and no outbox. A test may reach past
// the boundary — `lint:layers` does not scan test files — and it should be visible that it is
// doing so.
import { privacyStore, setSyncEnabled } from './privacyPrefs';
import {
  addBookmark,
  CEILING_BACKOFF_MS,
  cancelScheduledDrains,
  clearSyncState,
  currentUserId,
  DRAIN_DEBOUNCE_MS,
  DRAIN_MAX_WAIT_MS,
  drainNow,
  exportMyData,
  prefetchSyncReads,
  purgeMyData,
  queryClient,
  RETRY_BACKOFF_MS,
  removeBookmark,
  send,
  setAudioPosition,
  setPreferences,
  setReadingPosition,
  setSyncUserId,
  startSyncManagers,
  syncKey,
  useAudioPosition,
  useBookmarks,
  usePreferences,
  useReadingPosition,
  verdictForStatus,
} from './sync';
import { readCache, syncStore, writeCache } from './syncCache';

jest.mock('@/lib/api', () => ({
  get api() {
    return mockApi;
  },
}));

/**
 * ⚠️ THE DELIVERY HALF IS MOCKED, AND THE SPLIT IS THE POINT. `lib/sync.ts` owns the FETCH and the
 * serialization — the things rule 7 makes it the only module allowed to do — while
 * `lib/sharing.ts` owns writing a file and opening a share sheet. Mocking the seam is what lets
 * these cases assert the DOCUMENT rather than the filesystem; `sharing.test.ts` owns the other
 * side, where a real `writeAsStringAsync` and a real `shareAsync` are asserted.
 */
jest.mock('./sharing', () => ({
  saveDocument: jest.fn(async () => 'shared'),
}));

/** A worker response as the drain sees it: a status, and a body it deliberately does not read. */
const reply = (status: number, body: unknown = { ok: status < 300 }) => ({
  status,
  json: async () => body,
});

const mockApi = {
  api: {
    // story 5-7's two lifecycle routes. `account.delete` is deliberately ABSENT — the worker's
    // 501 stub was deleted rather than filled, and a mock carrying it would let a call to a route
    // that no longer exists typecheck and pass here.
    account: {
      data: { $post: jest.fn() },
      export: { $get: jest.fn() },
    },
    sync: {
      'reading-position': { $get: jest.fn(), $put: jest.fn() },
      preferences: { $get: jest.fn(), $put: jest.fn() },
      'audio-position': { $get: jest.fn(), $put: jest.fn() },
      bookmarks: Object.assign(
        { $get: jest.fn(), $post: jest.fn() },
        { ':id': { $delete: jest.fn() } }
      ),
    },
  },
};

/**
 * The real provider from `app/_layout.tsx`, over the module's OWN client — the same instance the
 * mutations write into. A throwaway client here would let a hook read state no mutation touched.
 */
const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(QueryClientProvider, { client: queryClient }, children);

const ALICE = 'user-alice';

const READING_POSITION = {
  userId: ALICE,
  surah: 2,
  verse: 255,
  page: 42,
  mode: 'reading',
  updatedAt: 10,
};
const BOOKMARK = { id: 'bk-1', userId: ALICE, surah: 18, verse: 10, label: null, createdAt: 5 };

function resetApi() {
  mockApi.api.sync['reading-position'].$get.mockResolvedValue(
    reply(200, { ok: true, position: READING_POSITION })
  );
  mockApi.api.sync['reading-position'].$put.mockResolvedValue(
    reply(200, { ok: true, applied: true })
  );
  mockApi.api.sync.preferences.$get.mockResolvedValue(reply(200, { ok: true, preferences: null }));
  mockApi.api.sync.preferences.$put.mockResolvedValue(reply(200, { ok: true, applied: true }));
  mockApi.api.sync['audio-position'].$get.mockResolvedValue(
    reply(200, { ok: true, audioPosition: null })
  );
  mockApi.api.sync['audio-position'].$put.mockResolvedValue(
    reply(200, { ok: true, applied: true })
  );
  mockApi.api.sync.bookmarks.$get.mockResolvedValue(
    reply(200, { ok: true, bookmarks: [BOOKMARK] })
  );
  mockApi.api.sync.bookmarks.$post.mockResolvedValue(
    reply(200, { ok: true, created: true, bookmark: BOOKMARK })
  );
  mockApi.api.sync.bookmarks[':id'].$delete.mockResolvedValue(
    reply(200, { ok: true, deleted: true })
  );
  mockApi.api.account.data.$post.mockResolvedValue(reply(200, { ok: true, purged: true }));
  mockApi.api.account.export.$get.mockResolvedValue(
    reply(200, { ok: true, export: EXPORT_DOCUMENT })
  );
}

/** What the worker's export route answers — the envelope `queries.ts` builds. */
const EXPORT_DOCUMENT = {
  format: 'cloud-quran-export',
  version: 1,
  exportedAt: '2026-08-26T00:00:00.000Z',
  account: {
    id: ALICE,
    name: '',
    email: 'a@example.com',
    emailVerified: true,
    isAnonymous: false,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  providers: [{ providerId: 'apple', linkedAt: '2026-01-01T00:00:00.000Z' }],
  readingPosition: READING_POSITION,
  preferences: null,
  audioPosition: null,
  bookmarks: [BOOKMARK],
};

/**
 * Write the device cache as a PREVIOUS LAUNCH would have left it — old enough that the query
 * considers it stale and wants the network. Faking the clock rather than hand-writing the storage
 * envelope keeps the test off `writeCache`'s internal format.
 */
function seedStaleCache<T>(entity: Parameters<typeof writeCache>[1], data: T) {
  const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.now() - 10 * 60_000);
  writeCache(ALICE, entity, data);
  clock.mockRestore();
}

const position = { surah: 2, verse: 255, page: 42, mode: 'reading' as const };
const preferences = {
  theme: 'sepia' as const,
  fontSize: 24,
  reciterId: 'alafasy',
  readingMode: 'reading' as const,
  translationId: null,
  speedRate: 1,
  transliteration: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  resetApi();
  // ⚠️ BOTH, AND IN THIS ORDER. `clearSyncState` empties the queue and the caches; it does NOT
  // cancel the debounce (see its docblock — in the app a drain over an empty queue is a no-op).
  // Here it matters: a 2s timer scheduled by one case's mutation would otherwise fire inside a
  // LATER case and drain its queue out from under an assertion.
  cancelScheduledDrains();
  clearSyncState();
  // The sync opt-out is device-local and defaults ON; a case that turns it off must not leak that
  // into the next one, where every request would silently stop happening and pass for it.
  privacyStore.clearAll();
  onlineManager.setOnline(true);
  setSyncUserId(ALICE);
});

afterEach(() => {
  jest.useRealTimers();
  // A timer armed by one case must not fire inside the next one. `clearSyncState` does NOT do
  // this (see its docblock) — the scheduler lives one module up from it.
  cancelScheduledDrains();
  onlineManager.setOnline(true);
});

// ⚠️ NOT COSMETIC — WITHOUT IT JEST NEVER EXITS, AND `afterEach` CANNOT DO IT. An unobserved
// query schedules its garbage collection as a `setTimeout`, which holds Node's event loop open
// long after the last assertion; `queryClient.clear()` destroys the query and the timer with it.
// But jest-circus runs `afterEach` hooks in REVERSE declaration order, and RNTL registers its
// unmount cleanup when it is IMPORTED — i.e. before the hook above — so the hook above runs
// FIRST and the unmount that schedules the timer happens after it. `afterAll` is downstream of
// both. Observed as a suite that passed 29/29 and then hung forever with no failing test.
afterAll(() => {
  queryClient.clear();
});

describe('the synchronous seed — nothing gates first paint', () => {
  it('a hook returns the CACHED rows on the FIRST render, with the network refusing everything', async () => {
    // THE OFFLINE-COLD-LAUNCH ROW OF THE MATRIX. The cache is from a PREVIOUS launch — stale, so
    // the query genuinely wants to refetch — and the device is offline. `useSession()` has
    // resolved nothing; the user id comes from the MMKV mirror and the rows come from MMKV.
    seedStaleCache('bookmarks', [BOOKMARK]);
    onlineManager.setOnline(false);
    mockApi.api.sync.bookmarks.$get.mockRejectedValue(new Error('offline'));

    const { result } = renderHook(() => useBookmarks(), { wrapper });

    expect(result.current.data).toEqual([BOOKMARK]);
    expect(result.current.isPending).toBe(false);
    // PAUSED, not failed, and not errored — `networkMode: 'online'` is the offline guarantee. An
    // `'always'` network mode would turn this into a failed query and an error path where the
    // architecture promises cached rows.
    expect(result.current.fetchStatus).toBe('paused');
    expect(result.current.isError).toBe(false);
    expect(mockApi.api.sync.bookmarks.$get).not.toHaveBeenCalled();

    // ⚠️ THE RECONNECT IS PART OF THIS CASE, AND NOT ONLY BECAUSE IT IS WORTH ASSERTING: a
    // paused fetch left dangling at the end of a suite makes the Jest RUNNER hang after every
    // test has passed — 29 green, no failure, no open handle `--detectOpenHandles` can name.
    // Resuming it here settles the retryer and proves the other half of the row: the cached
    // answer is replaced by the server's the moment the network returns.
    mockApi.api.sync.bookmarks.$get.mockResolvedValue(reply(200, { ok: true, bookmarks: [] }));
    onlineManager.setOnline(true);
    await waitFor(() => expect(result.current.data).toEqual([]));
    expect(mockApi.api.sync.bookmarks.$get).toHaveBeenCalledTimes(1);
  });

  it('a FRESH cache is not even refetched — the device answer stands', () => {
    writeCache(ALICE, 'bookmarks', [BOOKMARK]);

    const { result } = renderHook(() => useBookmarks(), { wrapper });

    expect(result.current.data).toEqual([BOOKMARK]);
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockApi.api.sync.bookmarks.$get).not.toHaveBeenCalled();
  });

  it('a FIRST launch ever — empty MMKV, no identity — is not an error state', () => {
    // Absent identity is normal, not a failure. The query is disabled rather than 401-looping.
    syncStore.clearAll();
    expect(currentUserId()).toBeUndefined();

    const { result } = renderHook(() => useReadingPosition(), { wrapper });

    expect(result.current.data).toBeUndefined();
    expect(result.current.isError).toBe(false);
    expect(mockApi.api.sync['reading-position'].$get).not.toHaveBeenCalled();
  });

  it('reconciles from the network after the first paint, and writes the answer back to MMKV', async () => {
    const { result } = renderHook(() => useReadingPosition(), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual(READING_POSITION));
    expect(readCache(ALICE, 'reading-position')?.data).toEqual(READING_POSITION);
  });

  it('keys the cache by USER, so the next account cannot be served the previous one′s rows', () => {
    writeCache(ALICE, 'bookmarks', [BOOKMARK]);
    expect(readCache('user-bob', 'bookmarks')).toBeUndefined();
    expect(syncKey('bookmarks', ALICE)).not.toEqual(syncKey('bookmarks', 'user-bob'));
  });

  it('pulls all four entities once an identity resolves — the launch-time refresh', async () => {
    // ⚠️ WITHOUT THIS THE DEVICE CACHE ONLY CONVERGES WHERE A SCREEN IS OPEN. The query cache lives
    // for one process; MMKV is what survives. A reader who never opens the surface mounting
    // `useBookmarks` would never learn what their other device wrote.
    prefetchSyncReads();

    await waitFor(() => expect(mockApi.api.sync.bookmarks.$get).toHaveBeenCalledTimes(1));
    expect(mockApi.api.sync['reading-position'].$get).toHaveBeenCalledTimes(1);
    expect(mockApi.api.sync.preferences.$get).toHaveBeenCalledTimes(1);
    expect(mockApi.api.sync['audio-position'].$get).toHaveBeenCalledTimes(1);
    // …and every answer lands in the device cache, where the next cold launch reads it.
    expect(readCache(ALICE, 'bookmarks')?.data).toEqual([BOOKMARK]);
  });

  it('the launch-time refresh is a NO-OP with no identity — it never calls anonymously', () => {
    syncStore.clearAll();

    prefetchSyncReads();

    expect(mockApi.api.sync.bookmarks.$get).not.toHaveBeenCalled();
  });

  it('never clears the mirrored id on a pending or signed-out session', () => {
    // `useSession()` answers null while pending AND while signed out. Treating either as "forget
    // the user" would evaporate the offline seed exactly when it is needed.
    setSyncUserId(null);
    setSyncUserId(undefined);
    setSyncUserId('');
    expect(currentUserId()).toBe(ALICE);
  });
});

describe('mutations — local first, queued, debounced', () => {
  it('a write while OFFLINE updates the cache and the query data at once, and queues', () => {
    onlineManager.setOnline(false);

    setReadingPosition(position);

    expect(readCache(ALICE, 'reading-position')?.data).toMatchObject(position);
    expect(queryClient.getQueryData(syncKey('reading-position', ALICE))).toMatchObject(position);
    expect(outbox.size()).toBe(1);
    expect(mockApi.api.sync['reading-position'].$put).not.toHaveBeenCalled();
  });

  it('fifty rapid position writes cost ONE entry and ONE request', async () => {
    jest.useFakeTimers();

    for (let i = 0; i < 50; i++) setReadingPosition({ ...position, verse: i + 1 });

    expect(outbox.size()).toBe(1);
    expect(mockApi.api.sync['reading-position'].$put).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(DRAIN_DEBOUNCE_MS);

    expect(mockApi.api.sync['reading-position'].$put).toHaveBeenCalledTimes(1);
    expect(mockApi.api.sync['reading-position'].$put).toHaveBeenCalledWith({
      json: expect.objectContaining({ verse: 50 }),
    });
  });

  it('a bookmark add is optimistic locally and idempotent on the wire', async () => {
    writeCache(ALICE, 'bookmarks', []);

    addBookmark({ id: 'bk-9', surah: 18, verse: 10 });

    expect(queryClient.getQueryData(syncKey('bookmarks', ALICE))).toEqual([
      expect.objectContaining({ id: 'bk-9', surah: 18, verse: 10 }),
    ]);
    await drainNow();
    // The CLIENT-MINTED id goes to the server, so a retry lands on the same row.
    expect(mockApi.api.sync.bookmarks.$post).toHaveBeenCalledWith({
      json: expect.objectContaining({ id: 'bk-9' }),
    });
  });

  it('a bookmark remove drops it locally and deletes by id on the wire', async () => {
    writeCache(ALICE, 'bookmarks', [BOOKMARK]);

    removeBookmark(BOOKMARK.id);

    expect(queryClient.getQueryData(syncKey('bookmarks', ALICE))).toEqual([]);
    await drainNow();
    expect(mockApi.api.sync.bookmarks[':id'].$delete).toHaveBeenCalledWith({
      param: { id: BOOKMARK.id },
    });
  });
});

describe('the drain — verdicts, and the explicit invalidation', () => {
  /** The mapping the retry policy IS. */
  it('maps every status the worker can answer to a verdict', () => {
    expect(verdictForStatus(200)).toBe('sent');
    expect(verdictForStatus(204)).toBe('sent');
    // ⚠️ THE 404 THE DOCBLOCK ARGUES FROM, PINNED. The worker's own `notFound` handler answers it
    // on any path this client gets wrong or any route a later deploy removes, and `drain` stops on
    // the first `retry` — so before the 4xx rule, one such entry blocked the queue permanently.
    expect(verdictForStatus(404)).toBe('drop');
    expect(verdictForStatus(403)).toBe('drop');
    expect(verdictForStatus(400)).toBe('drop');
    // A redirect this client does not follow is not transient: the same request gets it again.
    expect(verdictForStatus(301)).toBe('drop');
    expect(verdictForStatus(302)).toBe('drop');
    // An absent or non-finite status is a defect, and `retry` on it wedged the whole queue.
    expect(verdictForStatus(Number.NaN)).toBe('drop');
    expect(verdictForStatus(undefined as unknown as number)).toBe('drop');
    // ⚠️ `{ ok: true, applied: false }` IS A SUCCESS — an LWW no-op and a clock skew are
    // indistinguishable from here, so retrying it spins forever.
    expect(verdictForStatus(429)).toBe('halt');
    expect(verdictForStatus(401)).toBe('retry');
    expect(verdictForStatus(409)).toBe('drop');
    expect(verdictForStatus(422)).toBe('drop');
    expect(verdictForStatus(413)).toBe('drop');
    expect(verdictForStatus(500)).toBe('retry');
  });

  it('treats a `{ ok: true, applied: false }` LWW no-op as SUCCESS and removes the entry', async () => {
    mockApi.api.sync['reading-position'].$put.mockResolvedValue(
      reply(200, { ok: true, applied: false })
    );
    setReadingPosition(position);

    await drainNow();

    expect(outbox.size()).toBe(0);
    expect(mockApi.api.sync['reading-position'].$put).toHaveBeenCalledTimes(1);
  });

  it('DROPS a 409 and keeps draining — an id-in-use must not wedge the queue forever', async () => {
    mockApi.api.sync.bookmarks.$post.mockResolvedValue(
      reply(409, { ok: false, error: 'bookmark id already in use' })
    );
    addBookmark({ id: 'taken', surah: 2, verse: 1 });
    setPreferences(preferences);

    await drainNow();

    expect(outbox.size()).toBe(0);
    expect(mockApi.api.sync.preferences.$put).toHaveBeenCalledTimes(1);
  });

  it('DROPS a 422 rather than retrying a body the server will never accept', async () => {
    mockApi.api.sync['audio-position'].$put.mockResolvedValue(
      reply(422, { ok: false, error: 'bad' })
    );
    setAudioPosition({ surah: 1, verse: 1, reciterId: 'alafasy' });

    await drainNow();

    expect(outbox.size()).toBe(0);
  });

  it('KEEPS a 401 — anonymous-first means a missing session is normal on a cold start', async () => {
    mockApi.api.sync['reading-position'].$put.mockResolvedValue(
      reply(401, { ok: false, error: 'unauthorized' })
    );
    setReadingPosition(position);

    await drainNow();

    expect(outbox.size()).toBe(1);
  });

  it('KEEPS everything and HALTS on the daily write ceiling', async () => {
    mockApi.api.sync['reading-position'].$put.mockResolvedValue(
      reply(429, { ok: false, error: 'daily-write-ceiling-reached' })
    );
    setReadingPosition(position);
    setPreferences(preferences);

    await drainNow();

    expect(outbox.size()).toBe(2);
    // The whole drain stopped — the next entry would be refused too.
    expect(mockApi.api.sync.preferences.$put).not.toHaveBeenCalled();
  });

  it('KEEPS the entry when the transport throws — an offline drain is deferred, not lost', async () => {
    mockApi.api.sync['reading-position'].$put.mockRejectedValue(
      new Error('Network request failed')
    );
    setReadingPosition(position);

    await drainNow();

    expect(outbox.size()).toBe(1);
  });

  // ⚠️ THE ACCEPTANCE CRITERION: "the affected query is invalidated explicitly by the mutation
  // that caused it — and deleting that invalidation reddens the suite". Deleting the
  // `invalidateQueries` call in `send`, or any row of `INVALIDATED_BY`, reddens one of these.
  it.each([
    ['reading-position', () => setReadingPosition(position)],
    ['preferences', () => setPreferences(preferences)],
    ['audio-position', () => setAudioPosition({ surah: 1, verse: 1, reciterId: 'alafasy' })],
    ['bookmarks', () => addBookmark({ id: 'bk-x', surah: 2, verse: 1 })],
  ] as const)('invalidates the %s query when its write lands', async (entity, write) => {
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    write();

    await drainNow();

    expect(invalidate).toHaveBeenCalledWith({ queryKey: syncKey(entity, ALICE) });
    invalidate.mockRestore();
  });

  it('a bookmark DELETE invalidates the bookmarks query too', async () => {
    writeCache(ALICE, 'bookmarks', [BOOKMARK]);
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    removeBookmark(BOOKMARK.id);
    await drainNow();

    expect(invalidate).toHaveBeenCalledWith({ queryKey: syncKey('bookmarks', ALICE) });
    invalidate.mockRestore();
  });

  it('does NOT invalidate when the write did not land', async () => {
    mockApi.api.sync['reading-position'].$put.mockResolvedValue(
      reply(401, { ok: false, error: 'unauthorized' })
    );
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    setReadingPosition(position);
    await drainNow();

    expect(invalidate).not.toHaveBeenCalledWith({
      queryKey: syncKey('reading-position', ALICE),
    });
    invalidate.mockRestore();
  });

  it('sends each entry down the RIGHT route — the paths are not interchangeable', async () => {
    const cases: [OutboxEntry['kind'], jest.Mock][] = [
      ['reading-position', mockApi.api.sync['reading-position'].$put],
      ['preferences', mockApi.api.sync.preferences.$put],
      ['audio-position', mockApi.api.sync['audio-position'].$put],
      ['bookmark-create', mockApi.api.sync.bookmarks.$post],
      ['bookmark-delete', mockApi.api.sync.bookmarks[':id'].$delete],
    ];
    setReadingPosition(position);
    setPreferences(preferences);
    setAudioPosition({ surah: 1, verse: 1, reciterId: 'alafasy' });
    addBookmark({ id: 'bk-r', surah: 3, verse: 3 });
    removeBookmark('bk-other');

    await drainNow();

    for (const [, route] of cases) expect(route).toHaveBeenCalledTimes(1);
  });

  it('a queued write survives a RECONNECT and then drains', async () => {
    onlineManager.setOnline(false);
    setReadingPosition(position);
    expect(outbox.size()).toBe(1);

    onlineManager.setOnline(true);
    await drainNow();

    expect(outbox.size()).toBe(0);
    expect(mockApi.api.sync['reading-position'].$put).toHaveBeenCalledTimes(1);
  });
});

describe('sign-out — nothing of the previous user reaches the next account', () => {
  it('clears the outbox, the query cache and the sync MMKV cache', () => {
    writeCache(ALICE, 'bookmarks', [BOOKMARK]);
    queryClient.setQueryData(syncKey('bookmarks', ALICE), [BOOKMARK]);
    setReadingPosition(position);
    expect(outbox.size()).toBeGreaterThan(0);

    clearSyncState();

    expect(outbox.size()).toBe(0);
    expect(readCache(ALICE, 'bookmarks')).toBeUndefined();
    expect(queryClient.getQueryData(syncKey('bookmarks', ALICE))).toBeUndefined();
    expect(currentUserId()).toBeUndefined();
  });

  it('a queued write from the departing user NEVER drains under the next session', async () => {
    // The one clear that is about CORRECTNESS rather than privacy: an entry carries no identity,
    // so it lands on whatever session is current — which after a sign-out is the next account.
    setReadingPosition(position);
    clearSyncState();
    setSyncUserId('user-next');

    await drainNow();

    expect(mockApi.api.sync['reading-position'].$put).not.toHaveBeenCalled();
  });

  it('a guest′s queued writes SURVIVE a sign-IN and drain under the new session', async () => {
    // The opposite of sign-out, and deliberately so: the guest′s writes belong in the account
    // they merge into (5-5b). Nothing clears here — only the mirrored id changes.
    setReadingPosition(position);
    setSyncUserId('user-upgraded');

    await drainNow();

    expect(mockApi.api.sync['reading-position'].$put).toHaveBeenCalledTimes(1);
    expect(outbox.size()).toBe(0);
  });
});

describe('send() is the only place an entry becomes a request', () => {
  it('answers a verdict rather than throwing, for every failure the worker can produce', async () => {
    const entry: OutboxEntry = {
      kind: 'reading-position',
      body: { ...position, updatedAt: 1 },
      key: 'reading-position',
      seq: 1,
      rev: 1,
      queuedAt: 1,
    };
    mockApi.api.sync['reading-position'].$put.mockRejectedValue(new Error('boom'));
    await expect(send(entry)).resolves.toBe('retry');

    mockApi.api.sync['reading-position'].$put.mockResolvedValue(
      reply(413, { ok: false, error: 'body-too-large' })
    );
    await expect(send(entry)).resolves.toBe('drop');
  });
});

describe('the drain TRIGGERS — startSyncManagers, which nothing else executes', () => {
  // ⚠️ BEFORE THIS BLOCK, `startSyncManagers` HAD NO TEST AT ALL. `root-layout-boot.test.tsx`
  // mocks it wholesale (it asserts the wiring, not the behaviour) and nothing here imported it —
  // so deleting the `onlineManager.subscribe` drain, or inverting its condition, left every suite
  // in the repo green while a queued write never left the device.
  let stop: (() => void) | undefined;
  let appStateSpy: jest.SpyInstance;
  let onAppState: ((status: AppStateStatus) => void) | undefined;

  /** The listener `startSyncManagers` handed NetInfo — the real reconnect signal, not a stand-in. */
  const emitNetworkState = (state: {
    isConnected: boolean | null;
    isInternetReachable: boolean | null;
  }) => {
    const listener = (NetInfo.addEventListener as jest.Mock).mock.calls.at(-1)?.[0];
    if (!listener) throw new Error('startSyncManagers did not subscribe to NetInfo');
    listener(state);
  };

  beforeEach(() => {
    // ⚠️ AN EXPLICIT SUBSCRIPTION, NOT A CALL-THROUGH. `focusManager`'s teardown calls
    // `subscription.remove()`, so whatever `AppState.addEventListener` returns has to be a real
    // object for the WHOLE block — and a call-through spy restored by one case left the next
    // case's teardown dereferencing `undefined`. Owning the stub also gives the foreground case
    // the handler to fire, which is the only way to drive `focusManager` from outside.
    onAppState = undefined;
    appStateSpy = jest.spyOn(AppState, 'addEventListener').mockImplementation(((
      _event: string,
      handler: (status: AppStateStatus) => void
    ) => {
      onAppState = handler;
      return { remove: jest.fn() };
    }) as never);
  });

  afterEach(() => {
    stop?.();
    stop = undefined;
    appStateSpy.mockRestore();
    // ⚠️ PUT THE MANAGERS BACK TO INERT SETUPS. `startSyncManagers`' teardown unsubscribes our
    // drains but deliberately leaves `onlineManager`/`focusManager` wired to NetInfo and AppState
    // (recorded in `deferred-work.md` under this story). Harmless in the app, where the root
    // layout unmounts only at process death — but in a suite the NEXT provider mount re-runs that
    // setup against a restored `AppState`, and the cleanup it returns then dereferences a
    // subscription that does not exist.
    onlineManager.setEventListener(() => () => {});
    focusManager.setEventListener(() => () => {});
  });

  it('drains ONCE AT STARTUP — both managers only ever notify on a CHANGE', async () => {
    // ⚠️ THE ORDINARY PATH, AND IT HAD NO TRIGGER. NetInfo's first emit on a device that is
    // already online is not a change, and `AppState` emits nothing when you subscribe while the
    // app is already active. So a queue that survived an app kill sat untouched until the network
    // happened to flip or the user backgrounded and came back — on a device with steady signal,
    // "until they next leave the app".
    setReadingPosition(position);
    cancelScheduledDrains(); // no debounce: the only thing that may drain here is the startup call
    expect(outbox.size()).toBe(1);
    expect(mockApi.api.sync['reading-position'].$put).not.toHaveBeenCalled();

    stop = startSyncManagers();

    await waitFor(() => expect(outbox.size()).toBe(0));
    expect(mockApi.api.sync['reading-position'].$put).toHaveBeenCalledTimes(1);
  });

  it('drains when the network RECONNECTS — observed, not driven by a hand-rolled drainNow', async () => {
    stop = startSyncManagers();
    await waitFor(() => expect(outbox.size()).toBe(0)); // the startup drain, over an empty queue

    emitNetworkState({ isConnected: false, isInternetReachable: false });
    setReadingPosition(position);
    cancelScheduledDrains();
    expect(outbox.size()).toBe(1);
    expect(mockApi.api.sync['reading-position'].$put).not.toHaveBeenCalled();

    // The ONLY thing this case does is tell NetInfo the network came back.
    emitNetworkState({ isConnected: true, isInternetReachable: true });

    await waitFor(() => expect(mockApi.api.sync['reading-position'].$put).toHaveBeenCalledTimes(1));
    expect(outbox.size()).toBe(0);
  });

  it('drains when the app FOREGROUNDS', async () => {
    stop = startSyncManagers();
    await waitFor(() => expect(outbox.size()).toBe(0));
    if (!onAppState) throw new Error('startSyncManagers did not subscribe to AppState');

    onAppState('background');
    setReadingPosition(position);
    cancelScheduledDrains();
    expect(outbox.size()).toBe(1);
    expect(mockApi.api.sync['reading-position'].$put).not.toHaveBeenCalled();

    // The ONLY thing this case does is tell AppState the app came back.
    onAppState('active');

    await waitFor(() => expect(outbox.size()).toBe(0));
    expect(mockApi.api.sync['reading-position'].$put).toHaveBeenCalledTimes(1);
  });

  it('reads REACHABILITY, not just attachment — a captive portal is offline', () => {
    // ⚠️ `lib/connectivity.ts`'s docblock says netinfo is kept precisely because "a device
    // attached to a captive-portal wifi is 'connected' and cannot reach the worker", and names
    // this drain as the thing acting on the distinction. `Boolean(state.isConnected)` alone
    // contradicted it: every queued write would be posted into a portal's login page.
    stop = startSyncManagers();

    emitNetworkState({ isConnected: true, isInternetReachable: false });
    expect(onlineManager.isOnline()).toBe(false);

    // …and `null` is UNKNOWN, not offline: the probe has not finished yet, and treating that as
    // offline would pause every query for the first seconds of every launch.
    emitNetworkState({ isConnected: true, isInternetReachable: null });
    expect(onlineManager.isOnline()).toBe(true);

    emitNetworkState({ isConnected: false, isInternetReachable: null });
    expect(onlineManager.isOnline()).toBe(false);
  });

  it('the teardown stops the triggers AND cancels a pending drain', async () => {
    stop = startSyncManagers();
    await waitFor(() => expect(outbox.size()).toBe(0));

    emitNetworkState({ isConnected: false, isInternetReachable: false });
    setReadingPosition(position);
    stop();
    stop = undefined;

    // The debounce the mutation scheduled is cancelled, and a reconnect no longer reaches us.
    onlineManager.setOnline(true);
    await new Promise((resolve) => setTimeout(resolve, DRAIN_DEBOUNCE_MS + 50));
    expect(mockApi.api.sync['reading-position'].$put).not.toHaveBeenCalled();
    expect(outbox.size()).toBe(1);
  });
});

describe('the drain SCHEDULE — every path that must re-arm itself', () => {
  it.each([
    ['setReadingPosition', () => setReadingPosition(position), 'reading-position'],
    ['setPreferences', () => setPreferences(preferences), 'preferences'],
    [
      'setAudioPosition',
      () => setAudioPosition({ surah: 1, verse: 1, reciterId: 'alafasy' }),
      'audio-position',
    ],
    ['addBookmark', () => addBookmark({ id: 'bk-d', surah: 2, verse: 9 }), 'bookmarks'],
    ['removeBookmark', () => removeBookmark('bk-gone'), 'bookmarks-delete'],
  ] as const)('%s reaches the wire through the DEBOUNCE, with no explicit drain', async (_name, write, key) => {
    // ⚠️ ONLY `setReadingPosition` USED TO HAVE THIS. The other four reached the drain because a
    // test called `drainNow()` by hand, so deleting `scheduleDrain()` from `addBookmark` changed
    // nothing observable — the write simply never left the device on its own.
    jest.useFakeTimers();
    const route =
      key === 'bookmarks'
        ? mockApi.api.sync.bookmarks.$post
        : key === 'bookmarks-delete'
          ? mockApi.api.sync.bookmarks[':id'].$delete
          : mockApi.api.sync[key as 'reading-position' | 'preferences' | 'audio-position'].$put;

    write();
    expect(route).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(DRAIN_DEBOUNCE_MS);

    expect(route).toHaveBeenCalledTimes(1);
  });

  it('drains at the MAX WAIT even while writes keep arriving', async () => {
    // ⚠️ THE APP'S MAIN WRITE PATTERN. A reader moving through verses writes every few hundred
    // milliseconds; a trailing-only window restarts on each one and never closes, so the whole
    // session lived in MMKV until they stopped reading — and a crash lost it.
    jest.useFakeTimers();

    for (let i = 0; i < 20; i++) {
      setReadingPosition({ ...position, verse: i + 1 });
      await jest.advanceTimersByTimeAsync(DRAIN_MAX_WAIT_MS / 15); // comfortably under the debounce
    }

    expect(mockApi.api.sync['reading-position'].$put).toHaveBeenCalledTimes(1);
    // …and it is still ONE request for the whole burst: coalescing is untouched by the ceiling.
    // The writes made AFTER that drain reopened the window and are still one coalesced entry,
    // which the ordinary trailing debounce carries once the burst finally stops.
    expect(outbox.size()).toBe(1);
    await jest.advanceTimersByTimeAsync(DRAIN_DEBOUNCE_MS);
    expect(mockApi.api.sync['reading-position'].$put).toHaveBeenCalledTimes(2);
    expect(outbox.size()).toBe(0);
  });

  it('RE-ARMS after a drain that left work behind — a 401 must not go quiet', async () => {
    // ⚠️ `drainNow` re-armed only on `halted`. Every other reason for a non-empty queue — a
    // `retry` verdict, or the entry the outbox defers when an enqueue lands mid-drain — waited on
    // an unrelated event that may never come in that session.
    jest.useFakeTimers();
    mockApi.api.sync['reading-position'].$put.mockResolvedValue(
      reply(401, { ok: false, error: 'unauthorized' })
    );

    setReadingPosition(position);
    await jest.advanceTimersByTimeAsync(DRAIN_DEBOUNCE_MS);
    expect(mockApi.api.sync['reading-position'].$put).toHaveBeenCalledTimes(1);
    expect(outbox.size()).toBe(1);

    // Nothing happens in between: no reconnect, no foreground, no further write.
    mockApi.api.sync['reading-position'].$put.mockResolvedValue(
      reply(200, { ok: true, applied: true })
    );
    await jest.advanceTimersByTimeAsync(RETRY_BACKOFF_MS);

    expect(mockApi.api.sync['reading-position'].$put).toHaveBeenCalledTimes(2);
    expect(outbox.size()).toBe(0);
  });

  it('a HALT waits the CEILING backoff, not the short one — and then retries', async () => {
    // Both halves: the ceiling's own timer is armed (deleting that block leaves a halted queue
    // waiting on an unrelated event), and it is the LONGER of the two backoffs, because a
    // per-user daily bucket is not going to clear in thirty seconds.
    jest.useFakeTimers();
    mockApi.api.sync['reading-position'].$put.mockResolvedValue(
      reply(429, { ok: false, error: 'daily-write-ceiling-reached' })
    );

    setReadingPosition(position);
    await jest.advanceTimersByTimeAsync(DRAIN_DEBOUNCE_MS);
    expect(mockApi.api.sync['reading-position'].$put).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(RETRY_BACKOFF_MS);
    expect(mockApi.api.sync['reading-position'].$put).toHaveBeenCalledTimes(1);

    mockApi.api.sync['reading-position'].$put.mockResolvedValue(
      reply(200, { ok: true, applied: true })
    );
    await jest.advanceTimersByTimeAsync(CEILING_BACKOFF_MS);

    expect(mockApi.api.sync['reading-position'].$put).toHaveBeenCalledTimes(2);
    expect(outbox.size()).toBe(0);
  });
});

describe('a REFUSED read must not erase the offline seed', () => {
  it('leaves the device cache exactly as it was', async () => {
    // ⚠️ EVERY OTHER READ CASE MOCKS `{ ok: true }`, so `unwrap`'s throw was unpinned: delete it
    // and a 401 read resolves `undefined`, `writeCache` stores that over the last-known rows, and
    // the next offline cold launch paints nothing. The seed is the whole offline guarantee.
    seedStaleCache('bookmarks', [BOOKMARK]);
    mockApi.api.sync.bookmarks.$get.mockResolvedValue(
      reply(401, { ok: false, error: 'unauthorized' })
    );

    prefetchSyncReads();

    await waitFor(() => expect(mockApi.api.sync.bookmarks.$get).toHaveBeenCalled());
    expect(readCache(ALICE, 'bookmarks')?.data).toEqual([BOOKMARK]);
  });

  it('an `{ ok: false }` body with a 200 status is refused too', async () => {
    // The envelope is the contract, not the status line — the worker answers `{ ok: false }` on
    // paths where it also sets a status, and a client that only read the status would cache the
    // error object as if it were rows.
    seedStaleCache('reading-position', READING_POSITION);
    mockApi.api.sync['reading-position'].$get.mockResolvedValue(
      reply(200, { ok: false, error: 'unauthorized' })
    );

    prefetchSyncReads();

    await waitFor(() => expect(mockApi.api.sync['reading-position'].$get).toHaveBeenCalled());
    expect(readCache(ALICE, 'reading-position')?.data).toEqual(READING_POSITION);
  });
});

describe('addBookmark — both halves of the documented contract', () => {
  it('does NOT duplicate a row the reader already has for that ayah', async () => {
    // The `alreadyThere` branch: every other case ran against an empty bookmark cache, so half of
    // what the comment promises was never executed.
    writeCache(ALICE, 'bookmarks', [BOOKMARK]);

    addBookmark({ id: 'a-different-id', surah: BOOKMARK.surah, verse: BOOKMARK.verse });

    expect(queryClient.getQueryData(syncKey('bookmarks', ALICE))).toBeUndefined();
    expect(readCache<(typeof BOOKMARK)[]>(ALICE, 'bookmarks')?.data).toEqual([BOOKMARK]);
  });

  it('…and STILL sends it — the client does not re-implement the union-merge', async () => {
    // The other half. The device cache can be stale, and `createBookmark` is idempotent: it
    // answers `exists` and spends no write budget. The client sends; the worker decides.
    writeCache(ALICE, 'bookmarks', [BOOKMARK]);

    addBookmark({ id: 'a-different-id', surah: BOOKMARK.surah, verse: BOOKMARK.verse });
    await drainNow();

    expect(mockApi.api.sync.bookmarks.$post).toHaveBeenCalledWith({
      json: expect.objectContaining({ id: 'a-different-id' }),
    });
  });

  it('builds on what the READER can see, not on MMKV alone', async () => {
    // ⚠️ THE LIST-WIPE. Both bookmark mutations built `current` from `readCache(...) ?? []`. When
    // the query cache holds rows that MMKV does not — a fetch that has not been re-read, a
    // `setQueryData` from earlier in the same tick, a fresh install — the optimistic update
    // replaced the reader's whole list with one row.
    queryClient.setQueryData(syncKey('bookmarks', ALICE), [BOOKMARK]);
    expect(readCache(ALICE, 'bookmarks')).toBeUndefined();

    addBookmark({ id: 'bk-added', surah: 30, verse: 5 });

    expect(queryClient.getQueryData(syncKey('bookmarks', ALICE))).toEqual([
      BOOKMARK,
      expect.objectContaining({ id: 'bk-added' }),
    ]);
  });

  it('removeBookmark keeps the rest of the reader′s list', async () => {
    const other = { ...BOOKMARK, id: 'bk-2', verse: 11 };
    queryClient.setQueryData(syncKey('bookmarks', ALICE), [BOOKMARK, other]);

    removeBookmark(BOOKMARK.id);

    expect(queryClient.getQueryData(syncKey('bookmarks', ALICE))).toEqual([other]);
  });
});

describe('the code-review patches — behaviour nothing else pins', () => {
  it('does NOT drain while the device is offline', async () => {
    // ⚠️ READS PAUSE THEMSELVES (`networkMode: 'online'`); WRITES HAD NO EQUIVALENT. The drain
    // fired at startup and then every `RETRY_BACKOFF_MS`, because a doomed request leaves
    // `remaining > 0` and re-arms — a failing request twice a minute, forever, in a tunnel.
    onlineManager.setOnline(false);
    setReadingPosition(position);
    cancelScheduledDrains();

    await drainNow();

    expect(mockApi.api.sync['reading-position'].$put).not.toHaveBeenCalled();
    expect(outbox.size()).toBe(1);

    // …and the online subscription is what resumes it. Nothing polls.
    onlineManager.setOnline(true);
    await drainNow();
    expect(mockApi.api.sync['reading-position'].$put).toHaveBeenCalledTimes(1);
  });

  it('a write DURING the ceiling backoff does not fire a drain into it', async () => {
    // The backoff bounded nothing while the user kept reading — which is exactly when the ceiling
    // gets hit — because `scheduleDrain` never consulted the armed timer.
    jest.useFakeTimers();
    mockApi.api.sync['reading-position'].$put.mockResolvedValue(
      reply(429, { ok: false, error: 'daily-write-ceiling-reached' })
    );
    setReadingPosition(position);
    await jest.advanceTimersByTimeAsync(DRAIN_DEBOUNCE_MS);
    expect(mockApi.api.sync['reading-position'].$put).toHaveBeenCalledTimes(1);

    // The reader keeps reading. Each write is durable; none of them may re-fire the drain.
    for (let i = 0; i < 10; i++) {
      setReadingPosition({ ...position, verse: i + 1 });
      await jest.advanceTimersByTimeAsync(DRAIN_DEBOUNCE_MS * 2);
    }
    expect(mockApi.api.sync['reading-position'].$put).toHaveBeenCalledTimes(1);

    mockApi.api.sync['reading-position'].$put.mockResolvedValue(
      reply(200, { ok: true, applied: true })
    );
    await jest.advanceTimersByTimeAsync(CEILING_BACKOFF_MS);
    expect(mockApi.api.sync['reading-position'].$put).toHaveBeenCalledTimes(2);
  });

  it('INVALIDATES on a drop, so a refused write stops being shown as if it landed', async () => {
    // ⚠️ THE OPTIMISTIC ROW OUTLIVES THE REFUSAL, AND THE CACHE IS MMKV — so it survives cold
    // launches. Without this the reader keeps seeing a bookmark the server permanently refused.
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    mockApi.api.sync.bookmarks.$post.mockResolvedValue(
      reply(409, { ok: false, error: 'bookmark id already in use' })
    );

    addBookmark({ id: 'doomed', surah: 2, verse: 1 });
    await drainNow();

    expect(invalidate).toHaveBeenCalledWith({ queryKey: syncKey('bookmarks', ALICE) });
    invalidate.mockRestore();
  });

  it('CAPTURES a dropped write at tier 1 — a breadcrumb does not report it', async () => {
    // Sentry is opt-IN and off by default, and a breadcrumb only ships attached to a LATER
    // captured exception. A discarded bookmark was invisible to the reader and to us.
    const captured = jest.spyOn(errors, 'captureException');
    mockApi.api.sync.bookmarks.$post.mockResolvedValue(
      reply(409, { ok: false, error: 'bookmark id already in use' })
    );

    addBookmark({ id: 'doomed', surah: 2, verse: 1 });
    await drainNow();

    expect(captured).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ operation: 'sync.send', kind: 'bookmark-create', status: 409 })
    );
    captured.mockRestore();
  });

  it('a writeCache of `undefined` does not erase the offline seed', () => {
    // `JSON.stringify({ data: undefined })` drops the key entirely, so the envelope would come
    // back with no rows — and the next offline cold launch would paint nothing.
    writeCache(ALICE, 'bookmarks', [BOOKMARK]);
    writeCache(ALICE, 'bookmarks', undefined);
    expect(readCache(ALICE, 'bookmarks')?.data).toEqual([BOOKMARK]);
  });

  it('an envelope with no usable `cachedAt` is refused, not handed to the query as `NaN`', () => {
    // It becomes `initialDataUpdatedAt`; a non-numeric one makes the staleness arithmetic
    // meaningless in whichever direction the comparison happens to fall.
    syncStore.set(`${ALICE}:bookmarks`, JSON.stringify({ data: [BOOKMARK] }));
    expect(readCache(ALICE, 'bookmarks')).toBeUndefined();
  });

  it('a throwing MMKV never reaches the caller', () => {
    const boom = jest.spyOn(syncStore, 'set').mockImplementation(() => {
      throw new Error('mmkv is full');
    });
    // Both are called from render-path or UI-handler code, where an exception is a redbox.
    expect(() => writeCache(ALICE, 'bookmarks', [BOOKMARK])).not.toThrow();
    expect(() => setSyncUserId('someone-new')).not.toThrow();
    boom.mockRestore();
  });

  it('drainNow swallows a throwing queue rather than rejecting into a timer', async () => {
    const boom = jest.spyOn(outbox, 'drain').mockRejectedValue(new Error('mmkv is unreadable'));
    await expect(drainNow()).resolves.toBeUndefined();
    boom.mockRestore();
  });
});

describe('the read hooks — all four, and the entity they seed from', () => {
  // ⚠️ `usePreferences` AND `useAudioPosition` WERE EXECUTED BY NO TEST. Mis-pairing an entity
  // with a fetcher in `useSyncQuery` seeds from the wrong cache key and typechecks perfectly,
  // because both arguments are independent — so nothing but a case like this can catch it.
  it.each([
    ['reading-position', () => useReadingPosition() as { data: unknown }, READING_POSITION],
    [
      'preferences',
      () => usePreferences() as { data: unknown },
      { userId: ALICE, theme: 'sepia', fontSize: 24 },
    ],
    [
      'audio-position',
      () => useAudioPosition() as { data: unknown },
      { userId: ALICE, surah: 3, verse: 4 },
    ],
    ['bookmarks', () => useBookmarks() as { data: unknown }, [BOOKMARK]],
  ] as const)('%s seeds from ITS OWN cache key', (entity, useHook, seed) => {
    // A distinct value under every key, so a hook reading the wrong one is visible.
    writeCache(ALICE, 'reading-position', { marker: 'reading-position' });
    writeCache(ALICE, 'preferences', { marker: 'preferences' });
    writeCache(ALICE, 'audio-position', { marker: 'audio-position' });
    writeCache(ALICE, 'bookmarks', [{ marker: 'bookmarks' }]);
    writeCache(ALICE, entity, seed);

    const { result } = renderHook(useHook, { wrapper });

    expect(result.current.data).toEqual(seed);
  });
});

describe('exportMyData — FR29, the reader gets a copy', () => {
  it('hands the WORKER document to the share sheet, verbatim and pretty-printed', async () => {
    const { saveDocument } = jest.requireMock('./sharing') as {
      saveDocument: jest.Mock<Promise<string>, [string, string, string]>;
    };

    await expect(exportMyData()).resolves.toBe('shared');

    const [filename, contents, mimeType] = saveDocument.mock.calls[0];
    // Date-stamped, so a second export the same day overwrites its own file rather than
    // collecting siblings the reader cannot tell apart.
    expect(filename).toMatch(/^cloud-quran-data-\d{4}-\d{2}-\d{2}\.json$/);
    expect(mimeType).toBe('application/json');
    // ⚠️ VERBATIM. The envelope — format, version, exportedAt, the account block — is the
    // SERVER's, so the file says what it is without the app that produced it and a later shape
    // change has exactly one place to happen. A client that rebuilt it here would be a second
    // definition of the export.
    expect(JSON.parse(contents)).toEqual(EXPORT_DOCUMENT);
    // Pretty-printed: the reader is the audience, and an export nobody can open in a text editor
    // answers the letter of the right and not its point.
    expect(contents).toContain('\n  ');
  });

  it('reports the delivery the platform actually managed', async () => {
    const { saveDocument } = jest.requireMock('./sharing') as { saveDocument: jest.Mock };
    saveDocument.mockResolvedValueOnce('unavailable');
    await expect(exportMyData()).resolves.toBe('unavailable');
  });

  it('THROWS RATHER THAN WRITE A HALF FILE when the worker refuses', async () => {
    // The I/O matrix's export row: a network failure is a retryable message, never a partial
    // document. Nothing reaches the share sheet at all.
    const { saveDocument } = jest.requireMock('./sharing') as { saveDocument: jest.Mock };
    mockApi.api.account.export.$get.mockResolvedValue(
      reply(401, { ok: false, error: 'unauthorized' })
    );

    await expect(exportMyData()).rejects.toThrow(/unauthorized/);
    expect(saveDocument).not.toHaveBeenCalled();
  });
});

describe('purgeMyData — FR28, and the outbox is the whole difficulty', () => {
  it('CLEARS THE OUTBOX, so a queued write cannot re-create what was just destroyed', async () => {
    // ⚠️ THE MUTATION TARGET THE STORY NAMES. Delete `outbox.clear()` from `purgeMyData` and this
    // is the case that reddens. Without it a write queued moments before the purge drains a
    // moment after it — under the reader's own session, with no error anywhere — and re-creates
    // precisely the rows they asked to destroy. The caches would then refresh FROM those rows.
    addBookmark({ id: 'bk-doomed', surah: 1, verse: 1 });
    setReadingPosition(position);
    expect(outbox.size()).toBeGreaterThan(0);

    await purgeMyData();

    expect(outbox.size()).toBe(0);
    // ...and a drain now makes no request at all, which is the property that actually matters.
    await drainNow();
    expect(mockApi.api.sync.bookmarks.$post).not.toHaveBeenCalled();
    expect(mockApi.api.sync['reading-position'].$put).not.toHaveBeenCalled();
  });

  it('leaves every entity showing the EMPTY state, in the query cache and on the device', async () => {
    writeCache(ALICE, 'bookmarks', [BOOKMARK]);
    writeCache(ALICE, 'reading-position', READING_POSITION);
    queryClient.setQueryData(syncKey('bookmarks', ALICE), [BOOKMARK]);

    await purgeMyData();

    // The query cache: what a mounted screen is looking at right now.
    expect(queryClient.getQueryData(syncKey('bookmarks', ALICE))).toEqual([]);
    expect(queryClient.getQueryData(syncKey('reading-position', ALICE))).toBeNull();
    // ⚠️ AND THE DEVICE CACHE, WRITTEN RATHER THAN REMOVED. MMKV is what survives the process, so
    // the next OFFLINE cold launch seeds `initialData` from it — leaving the old rows there would
    // paint the purged bookmarks on the first frame, and removing the entry entirely would paint
    // whatever a disabled query paints. The empty value is the truth, and it is synchronous.
    expect(readCache(ALICE, 'bookmarks')?.data).toEqual([]);
    expect(readCache(ALICE, 'reading-position')?.data).toBeNull();
  });

  it('KEEPS THE USER-ID MIRROR — the account survives a data purge', async () => {
    // ⚠️ THIS IS WHY THE PURGE DOES NOT REUSE `clearSyncState()`. That function is the SIGN-OUT
    // teardown: it removes `lastUserId` too. Dropping the mirror here would disable every query
    // (they key on it) until the next session change — and the root layout's bridge only writes
    // it when the session id CHANGES, which it has not. The reader would be left signed in with
    // sync silently switched off until the next cold launch.
    await purgeMyData();
    expect(currentUserId()).toBe(ALICE);
  });

  it('CANCELS in-flight reads, so a late GET cannot repaint what was destroyed', async () => {
    // ⚠️ THE RACE THE FIRST DRAFT LEFT OPEN. A reconnect, a focus refetch or the launch-time
    // prefetch starts a GET; the reader purges; the GET resolves a moment later and its fetcher
    // writes the OLD rows into the query cache AND into MMKV, where they survive a cold launch.
    //
    // ⚠️ THE QUERY HERE IS DELIBERATELY UNOBSERVED — it comes from `prefetchSyncReads`, not from a
    // mounted hook. `invalidateQueries` (step 4 of the purge) only refetches ACTIVE queries, so
    // with a rendered hook it aborts the old request itself and this case would pass with
    // `cancelQueries` deleted. A prefetch has no observer, so nothing but `cancelQueries` stops
    // it — which is exactly the launch-time read most likely to still be in flight.
    //
    // The request is held OPEN throughout: TanStack can only abort a query that is in flight.
    let release: (() => void) | undefined;
    const inFlight = new Promise<void>((resolve) => {
      release = resolve;
    });
    const seen: (AbortSignal | undefined)[] = [];
    mockApi.api.sync.bookmarks.$get.mockImplementation(
      async (_args: unknown, options: { init?: { signal?: AbortSignal } }) => {
        seen.push(options?.init?.signal);
        await inFlight;
        return reply(200, { ok: true, bookmarks: [BOOKMARK] });
      }
    );
    prefetchSyncReads();
    await waitFor(() => expect(seen.length).toBeGreaterThan(0));
    expect(seen[0]).toBeInstanceOf(AbortSignal);
    expect(seen[0]?.aborted).toBe(false);

    await purgeMyData();

    // Aborted, not merely ignored — the fetcher body after the request never runs, which is what
    // keeps `writeCache` from putting the destroyed rows back on disk.
    expect(seen[0]?.aborted).toBe(true);
    release?.();
  });

  it('cancels a MOUNTED hook′s refetch too — the path a real screen takes', async () => {
    // ⚠️ THE CASE ABOVE CANNOT SEE THIS ONE, AND THAT IS WHY BOTH EXIST. It drives the prefetch,
    // whose query has no observer — so it proves `cancelQueries` reaches an unobserved query, and
    // stays green if `useSyncQuery`'s `queryFn` stops passing the signal through. Epic 6 mounts
    // these hooks on every reading surface: a `useBookmarks()` refetch in flight when the reader
    // purges resolves a moment later and writes the PRE-PURGE rows straight back into MMKV, where
    // they survive a cold launch and the erasure is quietly undone.
    seedStaleCache('bookmarks', [BOOKMARK]);
    let release: (() => void) | undefined;
    const seen: (AbortSignal | undefined)[] = [];
    let call = 0;
    mockApi.api.sync.bookmarks.$get.mockImplementation(
      async (_args: unknown, options: { init?: { signal?: AbortSignal } }) => {
        const signal = options?.init?.signal;
        seen.push(signal);
        // The FIRST request is the one in flight when the purge lands; every later one is the
        // post-purge refetch and answers with what the server now holds: nothing.
        if (++call > 1) return reply(200, { ok: true, bookmarks: [] });
        // Rejecting on abort is what a real `fetch` does, and it is the difference this case
        // measures: without the signal there is nothing to listen to, so the body below runs on
        // release and `writeCache` repaints the destroyed rows.
        await new Promise<void>((resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new Error('AbortError')));
          release = resolve;
        });
        return reply(200, { ok: true, bookmarks: [BOOKMARK] });
      }
    );

    renderHook(() => useBookmarks(), { wrapper });
    await waitFor(() => expect(seen.length).toBeGreaterThan(0));

    await purgeMyData();

    // The post-purge invalidation refetches the mounted query; let it settle first, so releasing
    // the stale request below is genuinely the LAST write attempt.
    await waitFor(() => expect(call).toBeGreaterThan(1));
    expect(readCache(ALICE, 'bookmarks')?.data).toEqual([]);

    // Now let the stale request finish. With the signal wired it has ALREADY rejected, so nothing
    // more happens; without it, this is the moment `writeCache` puts the destroyed rows back.
    release?.();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(readCache(ALICE, 'bookmarks')?.data).toEqual([]);
    expect(seen[0]?.aborted).toBe(true);
  });

  it('INVALIDATES, because a mutation that does not is how an erasure gets undone', async () => {
    // The project's rule is that every mutation invalidates explicitly — this is the one where
    // skipping it means the reader's erasure is reverted by whatever refetches next.
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    await purgeMyData();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['sync'] });
    invalidate.mockRestore();
  });

  it('does NOT fail the call when the LOCAL half throws — the rows are already gone', async () => {
    // ⚠️ THE MESSAGE THIS PREVENTS IS THE ONE THE READER CANNOT ACT ON. Every local step touches
    // MMKV or the query cache, both of which can throw; a throw escapes into `data.tsx`'s catch,
    // which paints "Nothing was deleted" over an erasure the worker has already committed. A stale
    // local cache is the smaller failure by a distance, and the next read reconciles it.
    const clear = jest.spyOn(outbox, 'clear').mockImplementation(() => {
      throw new Error('mmkv unwritable');
    });
    const captured = jest.spyOn(errors, 'captureException').mockImplementation(() => {});
    try {
      await expect(purgeMyData()).resolves.toBeUndefined();
      // Reported, not swallowed silently — losing the local half is still a defect.
      expect(captured).toHaveBeenCalled();
    } finally {
      captured.mockRestore();
      clear.mockRestore();
    }
  });

  it('DESTROYS NOTHING LOCALLY when the worker refuses', async () => {
    // Server first, device second. A failed purge must leave the reader exactly as they were,
    // pending writes included.
    addBookmark({ id: 'bk-keep', surah: 1, verse: 1 });
    const queued = outbox.size();
    mockApi.api.account.data.$post.mockResolvedValue(
      reply(429, { ok: false, error: 'daily-write-ceiling-reached' })
    );

    await expect(purgeMyData()).rejects.toThrow(/daily-write-ceiling-reached/);

    expect(outbox.size()).toBe(queued);
    expect(readCache(ALICE, 'bookmarks')?.data).toEqual([
      expect.objectContaining({ id: 'bk-keep' }),
    ]);
  });
});

describe('the sync opt-out — the switch that replaced a consent screen', () => {
  /**
   * ⚠️ THIS IS THE HALF THE DELETED CONSENT SCREEN NEVER HAD. That screen gated a NAVIGATION while
   * `prefetchSyncReads()` and the drain ran for every anonymous guest, unasked — so a reader who
   * declined still synced, and a reader who pressed "Stop syncing" was signed out and immediately
   * re-prefetched under a fresh guest. The preference below is read in the two places sync actually
   * happens, which is what makes the label true. Delete either check and one of these reddens.
   */

  it('sends NOTHING on the launch pull when the reader has turned sync off', async () => {
    setSyncEnabled(false);

    prefetchSyncReads();
    // A microtask boundary, so a fetch that WAS started would have reached the mock by now.
    await Promise.resolve();

    expect(mockApi.api.sync.bookmarks.$get).not.toHaveBeenCalled();
    expect(mockApi.api.sync['reading-position'].$get).not.toHaveBeenCalled();
    expect(mockApi.api.sync.preferences.$get).not.toHaveBeenCalled();
    expect(mockApi.api.sync['audio-position'].$get).not.toHaveBeenCalled();
  });

  it('...and pulls again the moment it is turned back on — anti-vacuity, and reversible', async () => {
    setSyncEnabled(false);
    prefetchSyncReads();
    setSyncEnabled(true);

    prefetchSyncReads();

    await waitFor(() => expect(mockApi.api.sync.bookmarks.$get).toHaveBeenCalledTimes(1));
  });

  it('KEEPS a queued write rather than dropping it, and never sends it', async () => {
    // ⚠️ NOT DESTRUCTIVE. The switch says "stop syncing", not "throw away what I wrote" — the
    // outbox is durable and capped, so the honest behaviour is to hold the entry. Dropping it here
    // would make a preference silently lose data.
    addBookmark({ id: 'bk-off', surah: 3, verse: 7 });
    const queued = outbox.size();
    expect(queued).toBeGreaterThan(0);
    setSyncEnabled(false);

    await drainNow();

    expect(mockApi.api.sync.bookmarks.$post).not.toHaveBeenCalled();
    expect(outbox.size()).toBe(queued);
    // The local write still landed: turning sync off changes what LEAVES the device, not what the
    // reader sees.
    expect(readCache(ALICE, 'bookmarks')?.data).toEqual([
      expect.objectContaining({ id: 'bk-off' }),
    ]);
  });

  it('drains the held writes once sync is turned back on', async () => {
    addBookmark({ id: 'bk-later', surah: 4, verse: 1 });
    setSyncEnabled(false);
    await drainNow();
    expect(mockApi.api.sync.bookmarks.$post).not.toHaveBeenCalled();

    setSyncEnabled(true);
    await drainNow();

    expect(mockApi.api.sync.bookmarks.$post).toHaveBeenCalledTimes(1);
    expect(outbox.size()).toBe(0);
  });

  it('a MOUNTED hook stops fetching too, and still paints the device cache', async () => {
    // ⚠️ THE READ HALF, WHICH `prefetchSyncReads` ALONE DOES NOT COVER. Epic 6 mounts these hooks
    // on the reading surfaces; without `enabled` consulting the preference, a reader who turned
    // sync off would still send an authenticated GET the moment a screen opened.
    seedStaleCache('bookmarks', [BOOKMARK]);
    setSyncEnabled(false);

    const { result } = renderHook(() => useBookmarks(), { wrapper });
    await Promise.resolve();

    expect(mockApi.api.sync.bookmarks.$get).not.toHaveBeenCalled();
    expect(result.current.data).toEqual([BOOKMARK]);
  });
});
