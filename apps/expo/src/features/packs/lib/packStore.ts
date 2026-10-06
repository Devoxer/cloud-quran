/**
 * packStore — content packs on disk, and the install that puts them there (story 8-2).
 *
 * ⚠️ THE DISK IS THE TRUTH AND `@/stores/packStore` IS ITS MIRROR. Everything here reads or writes
 * the filesystem; nothing here touches zustand. `audioDownloads.ts` + `downloadQueueStore.ts` are
 * the precedent, and the naming follows the spec rather than the collision: the module you are
 * reading is the DISK half.
 *
 * ── Where packs live, and why there ──────────────────────────────────────────────────────────
 *
 * In `expo-sqlite`'s own default database directory (`{document}/SQLite`), because a pack that
 * lands there opens with `openDatabaseAsync(fileName)` and NOTHING ELSE. The `directory` argument
 * that would let us put it anywhere is explicitly unsupported on web (`SQLiteDatabase.d.ts:346`),
 * so naming is the portable half of the API. That directory is also under the DOCUMENT directory
 * rather than `Paths.cache` — `lib/mushafFonts.ts` set that rule and `audioDownloads.ts`
 * strengthened it: an OS-evicted pack is a broken offline promise for something a reader
 * deliberately kept.
 *
 * ── The commit ───────────────────────────────────────────────────────────────────────────────
 *
 * ⚠️ **A PACK'S REAL PATH IS ONLY EVER CREATED BY A RENAME.** Every transfer writes
 * `{id}-v{n}.db.part` and is moved onto `{id}-v{n}.db` after the download resolves AND both
 * integrity checks pass. A `catch` that deletes covers a rejection and covers nothing else: kill
 * the app mid-transfer and the bytes sit at the final path, the listing calls it installed, and
 * the reader gets a database that is a fragment of a translation. The rename is atomic, only a
 * verified download reaches it, and `parsePackFileName` cannot see a `.part` file at all.
 *
 * ── Two integrity checks, because they catch different things ────────────────────────────────
 *
 * The DIGEST (SHA-256 over the downloaded file) catches corruption in transit. The ROW COUNT
 * catches truncation, which a digest structurally cannot see — a short-but-consistent file hashes
 * perfectly stably, so a catalogue digest minted from a short build agrees with itself forever.
 * `verify-artifacts.ts:201-210` encodes this for the bundled artifacts; a pack needs its own copy
 * because it is verified on the DEVICE, at install time. Both run on the `.part` file, BEFORE the
 * rename, so a pack that fails either never becomes readable.
 *
 * ⚠️ THE DIGEST IS STREAMED; NATIVE RETAINS A 512 MB SANITY CAP (story 8-5). It used to be
 * `expo-crypto`'s one-buffer `digest` over `File.bytes()`, which put the whole pack in the JS heap
 * and capped installs at 32 MB — below every classical tafsir. `File.digest('SHA-256')`
 * (`expo-file-system` 58) hashes the file natively in 64 KB chunks; the bytes never enter JS.
 *
 * ── Failure is a value ───────────────────────────────────────────────────────────────────────
 *
 * `installPack` RESOLVES with a reason rather than rejecting. Being offline is the ordinary case,
 * not an exception, and a surface that has to render "not now" for four different causes is better
 * served by a discriminated result than by sniffing at an Error's message.
 *
 * `lint:layers` rule 2: a feature `lib/` — `expo-crypto`, `expo-file-system`, `@/constants/packs`,
 * `@/lib/quranDb` and `@/lib/errors`. No UI, no routes, no other feature.
 */

import { CryptoDigestAlgorithm, digest } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { AppState } from 'react-native';

import {
  PACK_NATIVE_MAX_BYTES,
  PACK_STALL_TIMEOUT_MS,
  PACKS_SUPPORTED,
  packFileName,
  packPartFileName,
  parsePackFileName,
} from '@/constants/packs';
import { addBreadcrumb, isDeviceOfflineError } from '@/lib/errors';
import { closePack, countPackRows, sqliteDirectoryUri } from '@/lib/quranDb';
import type { CataloguePack } from './catalogue';

/** One pack as it exists on disk. */
export interface InstalledPack {
  id: string;
  version: number;
  bytes: number;
}

/** Why an install did not happen. Each one is a different sentence to a reader. */
export type PackInstallFailure =
  /** No network, or the CDN could not be reached. Not an error — the ordinary offline case. */
  | 'offline'
  /** The bytes that arrived are not the bytes the catalogue describes. */
  | 'digest'
  /** Well-formed, and short. The case a digest alone cannot catch. */
  | 'rows'
  /** The transfer delivered nothing for `PACK_STALL_TIMEOUT_MS`. */
  | 'stalled'
  /**
   * Bigger than this platform will take: a browser session's `PACK_WEB_MAX_BYTES`, or on native a
   * catalogue size past the `PACK_NATIVE_MAX_BYTES` sanity cap.
   */
  | 'tooLarge'
  /** Native: the device has less free space than the install needs. Nothing was fetched. */
  | 'noSpace'
  /** The reader cancelled. Nothing is left behind and nothing is reported. */
  | 'cancelled'
  /** Anything else — a full disk, a permission, a 404. */
  | 'failed';

export type PackInstallResult = { ok: true } | { ok: false; reason: PackInstallFailure };

export interface PackInstallProgress {
  /** 0–1, and `0` while the server has sent no `Content-Length`. Never a denominator. */
  fraction: number;
  bytesWritten: number;
  /** `0` means the length is unknown, NOT that the file is empty. */
  totalBytes: number;
}

/** The directory packs are installed into, or `null` where there is none (web). */
function packDirectory(): Directory | null {
  if (!PACKS_SUPPORTED) return null;
  const uri = sqliteDirectoryUri();
  return uri === null ? null : new Directory(uri);
}

function packFile(id: string, version: number): File | null {
  const dir = packDirectory();
  return dir === null ? null : new File(dir, packFileName(id, version));
}

function packPartFile(id: string, version: number): File | null {
  const dir = packDirectory();
  return dir === null ? null : new File(dir, packPartFileName(id, version));
}

/** Delete a path if it is there, swallowing anything the filesystem says about it. */
function deleteQuietly(file: File | null): void {
  if (!file) return;
  try {
    if (file.exists) file.delete();
  } catch {
    // A delete that fails leaves a file the next attempt overwrites. Nothing reads it.
  }
}

/**
 * Abort handles for the installs currently in flight, by pack id.
 *
 * Declared up here because the `.part` sweep below needs it: a transfer that is writing RIGHT NOW
 * owns its `.part` file, and deleting the file the native writer has open is how a healthy
 * install becomes a mystery failure.
 */
const inFlight = new Map<string, AbortController>();

/**
 * Which packs are on disk — ONE directory listing.
 *
 * ⚠️ `null` MEANS "COULD NOT LIST", AND IT IS NOT THE SAME ANSWER AS AN EMPTY ARRAY. Hydration
 * acts on an empty listing by dropping every installed row, so conflating the two turns one
 * transient filesystem failure into "you have nothing installed" over a pack that is still there.
 * `audioDownloads.ts:29` is where that lesson was paid for.
 *
 * `*.part` files and the bundled `quran.db` are both invisible here by construction —
 * `parsePackFileName` wants the exact `{id}-v{n}.db` tail.
 */
export function listInstalledPacks(): InstalledPack[] | null {
  if (!PACKS_SUPPORTED) return [];
  try {
    const dir = packDirectory();
    if (dir === null) return [];
    if (!dir.exists) return [];
    const installed: InstalledPack[] = [];
    for (const entry of dir.list()) {
      const parsed = parsePackFileName(entry.name ?? '');
      if (!parsed) continue;
      installed.push({ ...parsed, bytes: entry.size ?? 0 });
    }
    // A byte-wise sort, not `localeCompare`: a pack id is a machine slug, and a listing that
    // ordered itself by the reader's collation would be a different order per language for a
    // value no reader ever sees.
    return installed.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  } catch {
    return null;
  }
}

/**
 * How many bytes installed packs occupy. `0` when none are, or when the listing failed.
 *
 * ⚠️ IT SUMS THE COMMITTED FILES, NOT `dir.size`. The directory also holds the bundled Quran
 * database and any `.part` file currently in flight, and a total that counted either would be a
 * number describing something other than what the screen says it is (`audioDownloads.ts`'s
 * `reciterBytesOnDisk` measured exactly that defect on device).
 */
export function installedPackBytes(): number {
  const installed = listInstalledPacks();
  if (installed === null) return 0;
  return installed.reduce((total, pack) => total + pack.bytes, 0);
}

/**
 * Delete `.part` residue no transfer owns any more.
 *
 * The rename-is-the-commit rule makes an interrupted transfer harmless for READING — nothing
 * mistakes `{id}-v{n}.db.part` for an installed pack — and `installPack`'s own `catch` covers
 * every failure the process lives to see. What it cannot cover is the process not living: kill the
 * app mid-transfer and the bytes stay on disk under a name only the next attempt would overwrite.
 *
 * ⚠️ IT SKIPS THE `.part` A TRANSFER IS WRITING RIGHT NOW. Hydration runs on every arrival at the
 * content screen, which can land mid-install, and deleting the file the native writer has open is
 * how a healthy install becomes a mystery failure.
 */
export function sweepStalePackParts(): void {
  if (!PACKS_SUPPORTED) return;
  try {
    const dir = packDirectory();
    if (dir === null || !dir.exists) return;
    for (const entry of dir.list()) {
      const name = entry.name ?? '';
      if (!name.endsWith('.part')) continue;
      const parsed = parsePackFileName(name.slice(0, -'.part'.length));
      if (!parsed) continue;
      if (inFlight.has(parsed.id)) continue;
      deleteQuietly(packPartFile(parsed.id, parsed.version));
    }
  } catch {
    // One unreadable directory changes nothing: the residue stays and the next install of that
    // exact pack overwrites it, exactly as before this function existed.
  }
}

/**
 * Lowercase hex of a SHA-256 over bytes already in memory — the form the catalogue records. WEB's
 * digest only: the native install never reads a pack into JS and hashes the FILE natively
 * (`File.digest`, see the header).
 *
 * `Uint8Array<ArrayBuffer>` rather than a bare `Uint8Array`: `expo-crypto`'s `BufferSource` cannot
 * accept a view onto a `SharedArrayBuffer`, and `File.bytes()` already answers the narrow form.
 *
 * ⚠️ EXPORTED FOR `webPack.ts`, WHICH VERIFIES THE SAME DIGEST OVER BYTES THAT NEVER TOUCH A DISK
 * (story 8-3). A second copy of the hex encoding is a second place for the padding to be wrong,
 * and a digest that is wrong in a plausible way is the exact failure class this repo keeps paying
 * for. Intra-feature import, so `lint:layers` rule 4 is satisfied without a barrel entry.
 */
export async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const buffer = await digest(CryptoDigestAlgorithm.SHA256, bytes);
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Whether ANY install is running right now — the "one install at a time" guard.
 *
 * ⚠️ IT IS THE DISK MODULE'S ANSWER, NOT THE STORE'S. The store is a mirror, and a mirror cannot
 * tell you whether a native transfer is actually writing; `inFlight` is the only thing that knows.
 * The hook's docblock promised one install at a time and nothing enforced it until this existed.
 * (Story 8-2 review, S7.)
 */
export function anyInstallRunning(): boolean {
  return inFlight.size > 0;
}

/** Stop an install. The `.part` file is removed by the attempt's own `catch`, not from here. */
export function cancelPackInstall(id: string): void {
  inFlight.get(id)?.abort();
}

/**
 * Remove an installed pack: its handle first, then its file.
 *
 * ⚠️ THE HANDLE GOES FIRST AND IT IS AWAITED. Deleting a database SQLite still holds open is how
 * a removal becomes a phantom — the bytes go, the open connection keeps answering from its own
 * page cache, and the reader is told the pack is gone while it carries on rendering.
 */
export async function deleteInstalledPack(id: string, version: number): Promise<void> {
  await closePack(id);
  deleteQuietly(packFile(id, version));
  deleteQuietly(packPartFile(id, version));
}

/**
 * Download, verify and install one pack. Resolves with a reason rather than rejecting.
 *
 * The order is the whole contract: `.part` → digest → row count → close → **rename**. Nothing
 * before the rename is visible to `listInstalledPacks`, and nothing after it is unverified.
 */
export async function installPack(
  pack: CataloguePack,
  options: { onProgress?: (progress: PackInstallProgress) => void; signal?: AbortSignal } = {}
): Promise<PackInstallResult> {
  if (!PACKS_SUPPORTED) return { ok: false, reason: 'failed' };
  const dir = packDirectory();
  const part = packPartFile(pack.id, pack.packVersion);
  if (dir === null || part === null) return { ok: false, reason: 'failed' };

  try {
    if (!dir.exists) dir.create({ intermediates: true });
  } catch {
    return { ok: false, reason: 'failed' };
  }

  // ⚠️ ALREADY INSTALLED AT THIS VERSION IS A NO-OP, NOT A RE-DOWNLOAD. A pack file name carries
  // its version, so the same name can only ever hold the same verified build — re-fetching it
  // would spend a reader's data to arrive at the file already on disk. A NEWER version is a
  // different name and falls straight through to the transfer below.
  const target = packFile(pack.id, pack.packVersion);
  if (target?.exists) return { ok: true };

  // ⚠️ REFUSED BEFORE A BYTE IS FETCHED: a catalogue size that is nonsense, or a device without
  // room for it. The `.part` and the renamed file can coexist with the old version for the width
  // of the commit, so the need is twice the pack. An UNKNOWN free space is not "full" — see
  // `audioDownloads.ts` § `availableDownloadSpace` — and proceeds.
  if (pack.bytes > PACK_NATIVE_MAX_BYTES) return { ok: false, reason: 'tooLarge' };
  const free = freeDiskBytes();
  if (free !== null && free < pack.bytes * 2) {
    addBreadcrumb('http', 'pack refused: not enough space', {
      id: pack.id,
      free,
      bytes: pack.bytes,
    });
    return { ok: false, reason: 'noSpace' };
  }
  // A `.part` left by a killed run belongs to nobody; this attempt owns the path.
  deleteQuietly(part);

  const controller = new AbortController();
  inFlight.set(pack.id, controller);
  const watchdog = new AbortController();
  let stalled = false;
  /** Set when the transfer outgrew the sanity cap mid-flight — a server sending more than it said. */
  let oversize = false;
  let stallTimer: ReturnType<typeof setTimeout> | null = null;
  const disarm = () => {
    if (stallTimer) clearTimeout(stallTimer);
    stallTimer = null;
  };
  const rearm = () => {
    disarm();
    // ⚠️ SILENCE ONLY MEANS "STALLED" WHILE SOMEBODY IS THERE TO BE TOLD. A suspended app runs no
    // JS, so no progress event arrives to re-arm the timer and the timer fires on the wall clock
    // the moment the app resumes — aborting exactly the transfer the watchdog exists to protect.
    // Only a KNOWN background state disarms; `inactive` and Android's `unknown` still run JS.
    if (AppState.currentState === 'background') return;
    stallTimer = setTimeout(() => {
      stalled = true;
      watchdog.abort();
    }, PACK_STALL_TIMEOUT_MS);
  };
  const forwardAbort = () => watchdog.abort();
  controller.signal.addEventListener('abort', forwardAbort);
  options.signal?.addEventListener('abort', () => controller.abort());
  const appState = AppState.addEventListener('change', (next) =>
    next === 'background' ? disarm() : rearm()
  );
  rearm();

  try {
    await File.downloadFileAsync(pack.url, part, {
      idempotent: true,
      signal: watchdog.signal,
      onProgress: ({ bytesWritten, totalBytes }) => {
        rearm();
        if (bytesWritten > PACK_NATIVE_MAX_BYTES) {
          oversize = true;
          watchdog.abort();
          return;
        }
        // `-1`/`0` is "the server sent no Content-Length" — a real state that must not produce a
        // fraction a progress ring would draw backwards. The BYTES are still worth reporting.
        const known = totalBytes > 0;
        options.onProgress?.({
          fraction: known ? Math.min(1, bytesWritten / totalBytes) : 0,
          bytesWritten: Math.max(0, bytesWritten),
          totalBytes: known ? totalBytes : 0,
        });
      },
    });
    disarm();

    // ⚠️ STREAMED, NATIVELY — never `part.bytes()`. A 54 MB tafsir (al-Alusi, the largest) read into one buffer is an OOM
    // on a low-memory Android during the one step whose job is to be trustworthy; the native
    // digest reads the file in 64 KB chunks and answers lowercase hex, the catalogue's form.
    const actualDigest = (await part.digest('SHA-256')).toLowerCase();
    if (actualDigest !== pack.digest) {
      addBreadcrumb('http', 'pack digest mismatch', { id: pack.id });
      deleteQuietly(part);
      return { ok: false, reason: 'digest' };
    }

    // ⚠️ THE ROW COUNT IS READ FROM THE `.part` FILE, WHICH IS WHY IT CAN REFUSE AT ALL. Checking
    // after the rename would mean an unverified pack had already been installed, and "uninstall
    // it again" is not the same promise as "it never became readable".
    const rows = await countPackRows(packPartFileName(pack.id, pack.packVersion));
    if (rows !== pack.rows) {
      addBreadcrumb('http', 'pack row count mismatch', { id: pack.id, rows, expected: pack.rows });
      deleteQuietly(part);
      return { ok: false, reason: 'rows' };
    }

    // ⚠️ THE CANCEL IS RE-CHECKED HERE, ON THE LAST LINE BEFORE THE POINT OF NO RETURN. Verifying
    // a 54 MB pack is not instant, and a reader who pressed stop during it was still getting the
    // pack installed: the abort had nothing left to interrupt, because the transfer had already
    // finished. A cancel means "do not end up with this", not "stop the socket".
    // (Story 8-2 review, C4.)
    if (controller.signal.aborted && !stalled) {
      deleteQuietly(part);
      return { ok: false, reason: 'cancelled' };
    }

    // ⚠️ THE OLD VERSION'S HANDLE IS CLOSED BEFORE THE RENAME AND ITS FILE IS DELETED AFTER, AND
    // THE ORDER IS THE WHOLE POINT. The handle has to go first — a live connection onto a file
    // being replaced is a pack that keeps answering from its page cache. The FILE must go last:
    // deleting it first and then having `moveSync` throw leaves the reader with neither the old
    // working pack nor the new one, on the exact path this module calls atomic. A new version is
    // a different NAME, so the two can coexist for the width of one rename — which is what makes
    // "it downloads beside the old one, verifies, and only then is the old file deleted" true
    // rather than aspirational. (Story 8-2 review, C1.)
    await closePack(pack.id);
    const supersededBefore = listInstalledPacks();

    // ⚠️ THE COMMIT. Nothing else in this module ever creates `{id}-v{n}.db`. A FRESH handle, not
    // the one the transfer wrote through: `moveSync` REWRITES the instance it is called on.
    const commitTarget = packFile(pack.id, pack.packVersion);
    if (commitTarget === null) return { ok: false, reason: 'failed' };
    packPartFile(pack.id, pack.packVersion)?.moveSync(commitTarget);

    // ⚠️ THE SUPERSEDED FILE IS FOUND BY LISTING TWICE AND IT FALLS BACK TO THE PRE-RENAME
    // LISTING. `listInstalledPacks()` answers `null` for "could not list", and acting on that as
    // "nothing to clean up" orphans the old version on disk — several megabytes no control in the
    // app can ever reach, because the shelf shows one row per id. The pre-rename listing is the
    // better answer when the post-rename one is unavailable; when BOTH are unavailable the old
    // file stays and the next successful install of this pack clears it.
    const supersededAfter = listInstalledPacks() ?? supersededBefore;
    for (const existing of supersededAfter ?? []) {
      if (existing.id !== pack.id) continue;
      if (existing.version === pack.packVersion) continue;
      deleteQuietly(packFile(existing.id, existing.version));
    }
    return { ok: true };
  } catch (error) {
    deleteQuietly(part);
    if (oversize) return { ok: false, reason: 'tooLarge' };
    if (options.signal?.aborted || (controller.signal.aborted && !stalled)) {
      return { ok: false, reason: 'cancelled' };
    }
    if (stalled) return { ok: false, reason: 'stalled' };
    if (isDeviceOfflineError(error) || isTransientNetworkFailure(error)) {
      return { ok: false, reason: 'offline' };
    }
    return { ok: false, reason: 'failed' };
  } finally {
    disarm();
    appState.remove();
    controller.signal.removeEventListener('abort', forwardAbort);
    inFlight.delete(pack.id);
  }
}

/** Free bytes on internal storage, or `null` when the platform cannot say (never "zero"). */
function freeDiskBytes(): number | null {
  try {
    const free: unknown = Paths.availableDiskSpace;
    return typeof free === 'number' && Number.isFinite(free) && free >= 0 ? free : null;
  } catch {
    return null;
  }
}

/**
 * Network conditions rather than defects — the same shapes `audioDownloads.ts` measured on a
 * Pixel 9 Pro over a throttled link.
 *
 * ⚠️ EXPORTED FOR `webPack.ts` (story 8-3 review, C4), which adds the BROWSER spellings on top
 * rather than keeping a second list of the native ones. A duplicated pattern here is a duplicated
 * place for "this is a network condition, not a bug" to drift — and getting that answer wrong in
 * either direction tells a reader something false about their own connection.
 *
 * The shapes: a slow link rejects with `SocketTimeoutException`, an absent
 * one with `UnknownHostException`. Neither is a thing anybody can fix from a stack trace, and
 * neither should be reported to a reader as "something went wrong".
 */
export function isTransientNetworkFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /SocketTimeout|UnknownHost|ConnectException|Network is unreachable|NSURLErrorDomain/i.test(
    message
  );
}

/** Test seam — abandons any in-flight install. Not for runtime use. */
export function __resetPackInstalls(): void {
  for (const controller of inFlight.values()) controller.abort();
  inFlight.clear();
}
