/**
 * webPack — content packs on WEB: fetched once, held for the session, never written to a disk
 * (story 8-3).
 *
 * ⚠️ THIS IS THE FILESYSTEM HALF'S TWIN, NOT A SECOND READ PATH. `packStore.ts` downloads,
 * verifies and renames a file; this module fetches, verifies and hands the BYTES to
 * `lib/quranDb.ts`. From there both are identical: one open connection per pack id, read-only,
 * read through `getPackMeta` / `getPackSurah` / `getPackRange`. Nothing downstream — not
 * `usePacks`, not the study sheet — asks which platform a pack arrived on.
 *
 * ⚠️ WHY IT EXISTS AT ALL, MEASURED RATHER THAN ASSUMED. Story 8-2 concluded web has no packs
 * because `expo-file-system` has nowhere to put one. That is true of the FILESYSTEM and not of
 * reading: measured 2026-09-19 in WebKit against the live CDN pack,
 * `deserializeDatabaseAsync(new Uint8Array(await res.arrayBuffer()))` opened a 1,425,408-byte
 * fetch and answered 6,236 rows with correct French text and footnotes. R2's CORS already allows
 * the request.
 *
 * ⚠️ BOTH INTEGRITY CHECKS RUN HERE TOO, AND THE ROW COUNT IS NOT OPTIONAL. The digest catches
 * corruption in transit; the row count catches truncation, which a digest structurally cannot see
 * — a short-but-consistent build hashes to a perfectly stable value. A web pack is never
 * presented as installed and is re-fetched next session, but a reader studying a verse against a
 * commentary that stops at surah 5 is told nothing is wrong. ⚠️ **The count now happens INSIDE
 * `openPackFromBytes`, before the registry swap** — see its docblock: opening first and verifying
 * afterwards destroyed a working edition on the way to refusing its replacement, which is story
 * 8-2's review C1 repeated one story later.
 *
 * ⚠️ AND NOTHING HERE PERSISTS. The browser's HTTP cache is what stops the second visit costing a
 * second megabyte, exactly as `lib/mushafFonts.ts` leaves web fonts to it. OPFS and the Cache API
 * are deliberately out of scope (the story's "Ask First"), and the memory cost of a
 * tens-of-megabytes tafsir is the reason that question will eventually be asked.
 *
 * `lint:layers` rule 2: a feature `lib/` — `@/constants/packs`, `@/lib/quranDb`, `@/lib/errors`
 * and its own sibling. No UI, no routes, no other feature.
 */

import { PACK_MAX_VERIFIABLE_BYTES, PACK_STALL_TIMEOUT_MS } from '@/constants/packs';
import { addBreadcrumb, captureException, isDeviceOfflineError } from '@/lib/errors';
import { isPackReadable, openPackFromBytes } from '@/lib/quranDb';
import type { CataloguePack } from './catalogue';
import type { InstalledPack } from './packStore';
import { isTransientNetworkFailure, type PackInstallResult, sha256Hex } from './packStore';

/**
 * The packs held right now, by id. The MAP is the truth on web, exactly as the directory listing
 * is on native — `@/stores/packStore` mirrors it and never decides it.
 */
const held = new Map<string, InstalledPack>();

/** Holds in flight, so a double press and a re-render share one fetch rather than racing. */
const holding = new Map<string, Promise<PackInstallResult>>();

/**
 * Ids whose CACHED bytes are known bad — a digest or row-count failure this session.
 *
 * ⚠️ WITHOUT IT A CORRUPT DOWNLOAD IS UNRECOVERABLE FROM INSIDE THE APP. The browser re-serves the
 * same broken body from its HTTP cache, the digest fails identically, and the reader's retry can
 * only ever reproduce the failure until they clear their browser cache — which nothing in the UI
 * tells them to do. The next attempt for a poisoned id asks for `cache: 'reload'`, which bypasses
 * the cache for the request and replaces what is in it.
 */
const poisoned = new Set<string>();

/** What is held this session. Ordered by id, byte-wise — a pack id is a machine slug. */
export function listHeldPacks(): InstalledPack[] {
  return [...held.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Total bytes held. `0` with nothing held — there is no "could not say" state in a Map. */
export function heldPackBytes(): number {
  return listHeldPacks().reduce((total, pack) => total + pack.bytes, 0);
}

/** Whether ANY hold is running — the "one at a time" guard, `anyInstallRunning`'s twin. */
export function anyHoldRunning(): boolean {
  return holding.size > 0;
}

/** Forget a held pack. The HANDLE is closed by `usePacks` through `closePack`, once. */
export function forgetHeldPack(id: string): void {
  held.delete(id);
  poisoned.delete(id);
}

/**
 * Fetch, verify and hold one pack for this session. Resolves with a reason rather than rejecting —
 * `installPack`'s contract, for `installPack`'s reason: being offline is the ordinary case.
 */
export async function holdPack(pack: CataloguePack): Promise<PackInstallResult> {
  const current = held.get(pack.id);
  // Already held at this version is a no-op, not a re-fetch: a pack file name carries its
  // version, so the same name can only ever hold the same verified build.
  if (current?.version === pack.packVersion) return { ok: true };

  // ⚠️ REFUSED BEFORE A SINGLE BYTE IS FETCHED. On web the ceiling is sharper than on native, not
  // softer: the bytes land in the JS heap, are hashed there, and then STAY there for the session.
  if (pack.bytes > PACK_MAX_VERIFIABLE_BYTES) return { ok: false, reason: 'tooLarge' };

  const running = holding.get(pack.id);
  if (running) return running;

  const attempt = runHold(pack);
  holding.set(pack.id, attempt);
  // ⚠️ THE `finally` IS ON THE PROMISE, NOT AROUND AN `await`. The first caller used to clear the
  // map in its own `try/finally`, so a second caller that joined an already-running hold returned
  // without ever reaching it — and, worse, a hold whose fetch never settled left the entry behind
  // forever, at which point `anyHoldRunning()` refused every later install for the whole session.
  // Attaching the cleanup to the promise makes it run exactly once, whoever is waiting.
  void attempt.finally(() => holding.delete(pack.id));
  return attempt;
}

async function runHold(pack: CataloguePack): Promise<PackInstallResult> {
  let buffer: ArrayBuffer;

  /**
   * ⚠️ THE FETCH HAS ITS OWN `try`, AND THAT SEPARATION IS THE WHOLE POINT. The first cut wrapped
   * the digest, the deserialize and the row count in the same block and reported every `TypeError`
   * as `offline` — so a malformed buffer or a deserializer fault told a fully-connected reader
   * their connection was down, which is the believable-wrong-value class this repo keeps paying
   * for. Only a request that never reached the network is a network condition; everything after
   * the bytes arrive is a defect and is CAPTURED rather than described away.
   */
  const timeout = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    timeout.abort();
  }, PACK_STALL_TIMEOUT_MS);
  try {
    const response = await fetch(pack.url, {
      // See `poisoned`: a cached body that already failed verification can only fail it again.
      ...(poisoned.has(pack.id) ? { cache: 'reload' as const } : {}),
      signal: timeout.signal,
    });
    if (!response.ok) return { ok: false, reason: 'failed' };
    buffer = await response.arrayBuffer();
  } catch (error) {
    // ⚠️ A WATCHDOG, BECAUSE `fetch` NEITHER DELIVERS NOR REJECTS ON A DEAD SOCKET. A captive
    // portal leaves this promise pending forever; without the abort the hold never settles and
    // the "one at a time" guard refuses every later install for the rest of the session.
    if (timedOut) return { ok: false, reason: 'stalled' };
    if (isDeviceOfflineError(error) || isNetworkFetchFailure(error)) {
      return { ok: false, reason: 'offline' };
    }
    captureException(error, { packId: pack.id });
    return { ok: false, reason: 'failed' };
  } finally {
    clearTimeout(timer);
  }

  try {
    // ⚠️ THE CEILING IS RE-CHECKED AGAINST WHAT ACTUALLY LANDED, not only against what the
    // catalogue promised — `installPack`'s rule, and the same understated-size case.
    if (buffer.byteLength > PACK_MAX_VERIFIABLE_BYTES) {
      addBreadcrumb('http', 'web pack too large to verify', {
        id: pack.id,
        bytes: buffer.byteLength,
      });
      return { ok: false, reason: 'tooLarge' };
    }
    const bytes = new Uint8Array(buffer);
    if ((await sha256Hex(bytes)) !== pack.digest) {
      addBreadcrumb('http', 'web pack digest mismatch', { id: pack.id });
      poisoned.add(pack.id);
      return { ok: false, reason: 'digest' };
    }

    // The open verifies the row count BEFORE it supersedes anything — see `openPackFromBytes`.
    const opened = await openPackFromBytes(pack.id, pack.packVersion, bytes, pack.rows);
    if (!opened.ok) {
      addBreadcrumb('http', 'web pack row count mismatch', {
        id: pack.id,
        rows: opened.rows,
        expected: pack.rows,
      });
      poisoned.add(pack.id);
      return { ok: false, reason: 'rows' };
    }
    /**
     * ⚠️ ASK WHETHER THE HANDLE ACTUALLY REGISTERED. `openPackFromBytes` resolves without
     * registering when a release landed while it was parked — the generation guard. Recording a
     * held pack blind would then file a session entry against a connection that does not exist.
     * `cancelled` is the honest reason: the reader dropped it, so the row goes back to looking
     * like a pack nobody touched (`usePacks` takes the reset branch for exactly this value).
     */
    if (!isPackReadable(pack.id)) return { ok: false, reason: 'cancelled' };

    poisoned.delete(pack.id);
    held.set(pack.id, { id: pack.id, version: pack.packVersion, bytes: buffer.byteLength });
    return { ok: true };
  } catch (error) {
    // Past the network entirely: a deserializer fault, a hashing failure, an out-of-memory. None
    // of these are conditions a reader can act on, and all of them were invisible in Sentry.
    captureException(error, { packId: pack.id });
    return { ok: false, reason: 'failed' };
  }
}

/**
 * A request that never reached the network, as each engine spells it.
 *
 * ⚠️ NOT "ANY `TypeError`". `fetch` rejects with a `TypeError` for a network failure AND for a
 * malformed argument, and the same type is thrown by ordinary programming mistakes everywhere
 * else in the block this used to cover. The message is what distinguishes them: WebKit says
 * "Load failed", Chromium "Failed to fetch", Firefox "NetworkError when attempting to fetch
 * resource", and `isTransientNetworkFailure` carries the native shapes `audioDownloads.ts`
 * measured on a Pixel 9 Pro.
 */
function isNetworkFetchFailure(error: unknown): boolean {
  if (isTransientNetworkFailure(error)) return true;
  if (!(error instanceof TypeError)) return false;
  return /Load failed|Failed to fetch|NetworkError|network error/i.test(error.message);
}

/** Test seam — forgets every held pack. Handles are the caller's to close. Not for runtime use. */
export function __resetHeldPacks(): void {
  held.clear();
  holding.clear();
  poisoned.clear();
}
