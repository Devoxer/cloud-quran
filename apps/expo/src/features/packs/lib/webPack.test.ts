/**
 * The web content path — fetch, verify, hold (story 8-3).
 *
 * ⚠️ THE ROW COUNT IS THE CASE THAT MATTERS MOST HERE, because it is the one a digest cannot
 * stand in for. A short-but-well-formed pack hashes to a perfectly stable value and agrees with
 * a catalogue digest minted from it forever; only the population can say the pack is not all
 * there. The mutation: drop the count check and a commentary that stops at surah 5 reads as a
 * healthy source that simply has nothing to say about most of the Quran.
 *
 * ⚠️ AND A FAILED HOLD MUST LEAVE NO READABLE HANDLE. `openPackFromBytes` registers a connection
 * before the count can be asked; a `rows` failure that forgot to close it would hand the study
 * sheet a live handle onto a pack this module just refused.
 */

const mockOpenPackFromBytes = jest.fn<Promise<unknown>, unknown[]>(() =>
  Promise.resolve({ ok: true })
);
const mockReadable = { value: true };

jest.mock('@/lib/quranDb', () => ({
  openPackFromBytes: (...args: unknown[]) => mockOpenPackFromBytes(...args),
  isPackReadable: () => mockReadable.value,
}));

const mockSha256Hex = jest.fn<Promise<string>, unknown[]>(() => Promise.resolve(DIGEST));
jest.mock('./packStore', () => ({
  sha256Hex: (...args: unknown[]) => mockSha256Hex(...args),
  // The native shapes `audioDownloads.ts` measured; the browser ones live in `webPack` itself.
  isTransientNetworkFailure: (error: unknown) =>
    error instanceof Error && /SocketTimeout|UnknownHost/.test(error.message),
}));

const mockCapture = jest.fn();
jest.mock('@/lib/errors', () => ({
  addBreadcrumb: jest.fn(),
  captureException: (...args: unknown[]) => mockCapture(...args),
  isDeviceOfflineError: () => false,
}));

import { PACK_STALL_TIMEOUT_MS } from '@/constants/packs';
import type { CataloguePack } from './catalogue';
import {
  __resetHeldPacks,
  anyHoldRunning,
  forgetHeldPack,
  heldPackBytes,
  holdPack,
  listHeldPacks,
} from './webPack';

const DIGEST = 'a'.repeat(64);

const PACK: CataloguePack = {
  id: 'translation-fr-rashid',
  packVersion: 1,
  type: 'translation',
  language: 'fr',
  languageName: 'Français',
  title: 'Le Noble Coran — Rachid Maach',
  source: 'QuranEnc',
  sourceVersion: '1.0.3',
  licenceId: 'quranenc-republication',
  attribution: 'Traduction française : Rachid Maach.',
  url: 'https://cdn.nobleachievements.com/packs/translation-fr-rashid-v1.db',
  bytes: 1_425_408,
  rows: 6236,
  digest: DIGEST,
};

/** Every fetch init this module handed out, so the cache mode can be asserted. */
const requests: Record<string, unknown>[] = [];

/** A body of `size` bytes — the fetch's whole contract as far as this module is concerned. */
function respondWith(size: number, ok = true) {
  global.fetch = jest.fn(async (_url: string, init: Record<string, unknown>) => {
    requests.push(init);
    return { ok, arrayBuffer: async () => new ArrayBuffer(size) };
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  jest.clearAllMocks();
  __resetHeldPacks();
  requests.length = 0;
  mockReadable.value = true;
  mockSha256Hex.mockResolvedValue(DIGEST);
  mockOpenPackFromBytes.mockResolvedValue({ ok: true });
  respondWith(1_425_408);
});

describe('a healthy hold', () => {
  it('fetches once, verifies BOTH facts, and holds the pack', async () => {
    await expect(holdPack(PACK)).resolves.toEqual({ ok: true });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(mockSha256Hex).toHaveBeenCalledTimes(1);
    // ⚠️ THE EXPECTED ROW COUNT GOES **INTO** THE OPEN. Counting afterwards meant the new handle
    // was already in the registry while we decided whether to keep it — 8-2's review C1 shape.
    expect(mockOpenPackFromBytes).toHaveBeenCalledWith(
      'translation-fr-rashid',
      1,
      expect.any(Uint8Array),
      6236
    );
    expect(listHeldPacks()).toEqual([
      { id: 'translation-fr-rashid', version: 1, bytes: 1_425_408 },
    ]);
    expect(heldPackBytes()).toBe(1_425_408);
  });

  it('holding the SAME version again costs no second fetch', async () => {
    await holdPack(PACK);
    await expect(holdPack(PACK)).resolves.toEqual({ ok: true });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('two concurrent presses share ONE fetch', async () => {
    const both = Promise.all([holdPack(PACK), holdPack(PACK)]);
    expect(anyHoldRunning()).toBe(true);
    await both;
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(anyHoldRunning()).toBe(false);
  });
});

describe('integrity', () => {
  it('refuses a DIGEST mismatch without ever opening a connection', async () => {
    mockSha256Hex.mockResolvedValue('b'.repeat(64));
    await expect(holdPack(PACK)).resolves.toEqual({ ok: false, reason: 'digest' });
    expect(mockOpenPackFromBytes).not.toHaveBeenCalled();
    expect(listHeldPacks()).toEqual([]);
  });

  it('refuses a SHORT pack the digest agrees with, and records nothing', async () => {
    // The open itself refuses now — see `openPackFromBytes`, which verifies BEFORE it supersedes.
    mockOpenPackFromBytes.mockResolvedValue({ ok: false, reason: 'rows', rows: 1200 });
    await expect(holdPack(PACK)).resolves.toEqual({ ok: false, reason: 'rows' });
    expect(listHeldPacks()).toEqual([]);
  });

  it('records nothing when the handle did not register — a release landed underneath', async () => {
    // `openPackFromBytes` resolves without registering when the generation moved. Recording a held
    // pack blind would file a session entry against a connection that does not exist.
    mockReadable.value = false;
    await expect(holdPack(PACK)).resolves.toEqual({ ok: false, reason: 'cancelled' });
    expect(listHeldPacks()).toEqual([]);
  });

  it('refuses a pack the catalogue already says is too large, before fetching', async () => {
    const huge = { ...PACK, bytes: 64 * 1024 * 1024 };
    await expect(holdPack(huge)).resolves.toEqual({ ok: false, reason: 'tooLarge' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('…and re-checks the ceiling against what ACTUALLY landed', async () => {
    // A catalogue understating a pack's size would otherwise walk straight into the heap the
    // pre-flight check exists to protect.
    respondWith(64 * 1024 * 1024);
    await expect(holdPack(PACK)).resolves.toEqual({ ok: false, reason: 'tooLarge' });
    expect(mockOpenPackFromBytes).not.toHaveBeenCalled();
  });
});

describe('failure', () => {
  it('reports OFFLINE for a fetch that never reached the network', async () => {
    global.fetch = jest.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    await expect(holdPack(PACK)).resolves.toEqual({ ok: false, reason: 'offline' });
  });

  it('reports a non-OK response as a failure rather than holding nothing silently', async () => {
    respondWith(0, false);
    await expect(holdPack(PACK)).resolves.toEqual({ ok: false, reason: 'failed' });
    expect(listHeldPacks()).toEqual([]);
  });

  it('leaves nothing running after a failure', async () => {
    respondWith(0, false);
    await holdPack(PACK);
    expect(anyHoldRunning()).toBe(false);
  });
});

/**
 * The three failure mechanics the first cut did not have (story 8-3 review, C3/C4/C5).
 */
describe('a hung, poisoned or broken hold', () => {
  it('⚠️ TIMES OUT, so one dead socket does not block every later install for the session', async () => {
    // ⚠️ THE FAILURE IS NOT THE HUNG FETCH, IT IS WHAT IT LEAVES BEHIND. Without the watchdog the
    // promise never settles, the `holding` entry stays forever, and `anyHoldRunning()` then
    // refuses every install for the rest of the session — from a surface that cannot say why.
    jest.useFakeTimers();
    try {
      global.fetch = jest.fn(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => reject(new Error('aborted')));
          })
      ) as unknown as typeof fetch;

      const pending = holdPack(PACK);
      expect(anyHoldRunning()).toBe(true);
      jest.advanceTimersByTime(PACK_STALL_TIMEOUT_MS + 1);

      await expect(pending).resolves.toEqual({ ok: false, reason: 'stalled' });
      expect(anyHoldRunning()).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it('clears the in-flight entry even when a SECOND caller is the one awaiting it', async () => {
    // The cleanup used to sit in the first caller's own `try/finally`, so a joined hold could
    // return without it ever running.
    const first = holdPack(PACK);
    const second = holdPack(PACK);
    await Promise.all([first, second]);
    expect(anyHoldRunning()).toBe(false);
  });

  it('⚠️ RE-FETCHES PAST THE BROWSER CACHE after a digest failure, and only then', async () => {
    // ⚠️ WITHOUT THIS THE RETRY CAN ONLY EVER REPRODUCE THE FAILURE. A corrupt body is re-served
    // from the HTTP cache, the digest fails identically, and nothing in the UI tells the reader
    // to clear their browser cache — which is the only thing that would have helped.
    mockSha256Hex.mockResolvedValue('b'.repeat(64));
    await holdPack(PACK);
    expect(requests[0].cache).toBeUndefined();

    mockSha256Hex.mockResolvedValue(DIGEST);
    await expect(holdPack(PACK)).resolves.toEqual({ ok: true });
    expect(requests[1].cache).toBe('reload');

    // …and a clean hold does not keep asking for it forever.
    forgetHeldPack(PACK.id);
    await holdPack(PACK);
    expect(requests[2].cache).toBeUndefined();
  });

  it('⚠️ DOES NOT CALL A DESERIALIZER FAULT "OFFLINE" — and captures it', async () => {
    // ⚠️ THE BELIEVABLE-WRONG-VALUE CLASS. Everything after the bytes arrive used to share the
    // fetch's `catch`, where any `TypeError` was reported as a network failure — so a malformed
    // buffer told a fully-connected reader their connection was down, and the real fault reached
    // Sentry as nothing at all: three breadcrumbs and no capture.
    mockOpenPackFromBytes.mockRejectedValue(new TypeError('not a database'));
    await expect(holdPack(PACK)).resolves.toEqual({ ok: false, reason: 'failed' });
    expect(mockCapture).toHaveBeenCalledTimes(1);
  });

  it('…and still calls a real network TypeError offline, WITHOUT capturing it', async () => {
    // Being offline is the ordinary state of a reader on a plane, not an exception to report.
    global.fetch = jest.fn(async () => {
      throw new TypeError('Load failed');
    }) as unknown as typeof fetch;
    await expect(holdPack(PACK)).resolves.toEqual({ ok: false, reason: 'offline' });
    expect(mockCapture).not.toHaveBeenCalled();
  });
});
