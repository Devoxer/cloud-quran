/**
 * audioDownloads — surah MP3s kept on disk, and the runner that puts them there (story 7-5).
 *
 * ⚠️ THE FILES LIVE IN THE DOCUMENT DIRECTORY, NEVER `Paths.cache`. `lib/mushafFonts.ts` made
 * this call first and its docblock carries the reasoning; it is STRONGER here. A page font is a
 * few hundred kilobytes the app fetched on the reader's behalf, and an eviction costs a page in
 * airplane mode. A surah MP3 is several megabytes the reader DELIBERATELY chose to keep, for a
 * commute or a flight, and the OS may evict `Paths.cache` under disk pressure without telling
 * anybody. An offline promise the system can silently revoke is not a promise.
 *
 * The layout mirrors the CDN key exactly (`constants/audio.ts`'s zero-padding rule), so
 * `{document}/audio/{reciterId}/{NNN}.mp3` sits under the same `{reciterId}/{NNN}.mp3` tail the
 * network path uses. Downloads are therefore PER RECITER by construction: 18 kept under
 * `alafasy` says nothing about `husary`, which is the frozen matrix's reciter-switch row.
 *
 * ⚠️ **A SURAH'S REAL PATH IS ONLY EVER CREATED BY A RENAME, AND THIS IS THE MOST IMPORTANT LINE
 * IN THE FILE.** Every transfer writes `{NNN}.mp3.part` and is moved onto `{NNN}.mp3` after the
 * download resolves — never before. The first cut downloaded straight to the final path and
 * removed it in a `catch`, which covers a rejection and covers nothing else: kill the app or
 * reload the JS bundle mid-transfer and the bytes written so far SIT at `{NNN}.mp3`, `file.exists`
 * answers `true`, hydration calls it downloaded, and the reader gets Quran audio that stops in
 * the middle of a recitation with no error anywhere. A rename is atomic and only a completed
 * download can reach it, so an interrupted one leaves a `.part` file that every reader below
 * ignores and the next attempt overwrites. (Story 7-5 review, P1.)
 *
 * ⚠️ EVERY DISK READ ON THE PLAYBACK PATH ANSWERS FALSE/NULL/0 ON FAILURE, and that is a contract
 * rather than defensive padding: `audioSource.ts` asks "is it local?" for every track of every
 * playlist build, and the only honest answer to "the filesystem misbehaved" there is to stream
 * instead. ⚠️ **THE LISTING IS THE EXCEPTION AND IT REPORTS `null`.** `downloadedSurahs` used to
 * answer `[]` both for "nothing kept" and "the listing threw", and hydration reads an empty
 * keep-set as proof that every `downloaded` row is stale — so ONE transient failure dropped every
 * row, the surface read "Nothing downloaded yet", and "download all" would re-fetch a gigabyte
 * the device already had. That is this repo's own recorded family (a believable value instead of
 * an error, `palettes`' malformed hex). A caller that cannot act on "unknown" must skip, not
 * assume empty. (Story 7-5 review, P3.)
 *
 * ⚠️ WEB HAS NO DOCUMENT DIRECTORY AND IS NOT A SUPPORTED SURFACE FOR THIS. Every entry point
 * short-circuits on `DOWNLOADS_SUPPORTED` — same shape as `reciterManifest.ts`'s reader and
 * `mushafFonts.ts`'s cache. The browser's own HTTP cache is what a web reader gets.
 *
 * ⚠️ ANDROID ALREADY KEEPS THIS DIRECTORY OUT OF BACKUP, AND iOS DOES NOT — a gigabyte of
 * re-downloadable MP3s must reach neither cloud. Android is covered by construction rather than
 * by anything of ours: `expo-secure-store`'s config plugin owns `android:fullBackupContent` and
 * `android:dataExtractionRules`, and its rule files are ALLOW-lists (`<include domain="sharedpref"
 * path="."/>`), so shared preferences are the only thing backed up at all and `files/` — this
 * directory included — is excluded. Adding a second plugin would have to take those attributes
 * over from secure-store and re-state its SecureStore exclusion, i.e. take on the risk of
 * silently un-excluding a keystore in order to re-exclude what is already excluded. iOS is the
 * open half: the flag there is `NSURLIsExcludedFromBackupKey`, a RUNTIME resource value on a
 * runtime-created directory, which no config plugin can reach and which `expo-file-system` 56
 * exposes no API for. It needs a small native module; it is an owner call, and it is recorded in
 * `deferred-work.md` rather than hacked around.
 *
 * ── The runner half ─────────────────────────────────────────────────────────────────────────
 *
 * The queue is module-level, never a component hook, for the reason `downloadQueueStore`'s own
 * header records: a download must survive the reader navigating away from the screen that
 * started it. Progress and status are published into `@/stores/downloadQueueStore`; the disk is
 * the source of truth for "is it downloaded" and the store is its mirror, seeded by
 * `hydrateDownloadState`.
 *
 * ⚠️ NOTHING IS RESUMED ON LAUNCH, DELIBERATELY. The queue holds no MMKV state, so an app killed
 * with forty surahs pending reopens with what COMPLETED and nothing pending — reviving forty
 * downloads is a network decision the reader did not make on this launch, the same reasoning
 * that keeps sync's outbox drain explicit.
 *
 * `lint:layers`: a feature `lib/` — it imports `expo-file-system`, `react-native`'s Platform and
 * AppState, `@/constants/audio`, `@/lib/errors`, this feature's own catalogue and the shared
 * queue store.
 * No UI, no routes, no other feature.
 */

import { Directory, File, Paths } from 'expo-file-system';
import { SURAH_COUNT } from 'quran-data';
import { AppState, Platform } from 'react-native';

import { surahAudioUrl } from '@/constants/audio';
import { addBreadcrumb, captureException, isDeviceOfflineError } from '@/lib/errors';
import type { ReciterManifest } from '@/lib/reciterManifest';
import {
  clearReciterEntries,
  downloadKey,
  getDownloadEntry,
  hydrateReciterEntries,
  resetDownloadEntry,
  setDownloadEntry,
} from '@/stores/downloadQueueStore';

/** Subdirectory of the DOCUMENT directory every downloaded surah lives under. */
export const AUDIO_DOWNLOAD_DIR = 'audio';

/**
 * Whether this platform can keep a download at all — the ONE fact both controls branch on.
 *
 * ⚠️ THE CONTROLS ARE ABSENT ON WEB RATHER THAN INERT. Every function below already answers
 * `false`/`null`/`0` there, so a rendered download button would open a confirmation, take the
 * reader's yes, and do nothing at all — and the browser already caches what it streams, so there
 * is no promise going unkept. One exported fact, two consumers: a second `Platform.OS` test in a
 * component is how the two surfaces start disagreeing about what web can do.
 */
export const DOWNLOADS_SUPPORTED = Platform.OS !== 'web';

/**
 * Whether a transfer is handed to the OS and survives the app being suspended.
 *
 * ⚠️ IT IS TRUE ON iOS ONLY, AND THAT IS THE LIBRARY'S LIMIT RATHER THAN A CHOICE OF OURS.
 * `sessionType: 'background'` reaches a `URLSessionConfiguration.background` session on iOS
 * (`expo-file-system/ios/FileSystemDownloadTask.swift`) — the transfer continues at the system
 * level while the app is suspended. On Android the same option is declared "accepted for API
 * consistency and ignored", and the Kotlin proves it: `DownloadTaskOptions` there has ONE field,
 * `headers`, and the transfer is an in-process OkHttp call that lives exactly as long as the
 * process does. Nothing in `expo-file-system` can give Android background continuation; that
 * would take a foreground service or WorkManager, which is a native change and not this one.
 *
 * ⚠️ AND THE ANDROID PATH DELIBERATELY STAYS ON `File.downloadFileAsync`, WHICH IS NOT MERELY
 * "the same thing without the flag". The task API's Kotlin read loop checks a cancel flag between
 * `read()` returning and the write, and RETURNS from the response callback without ever resuming
 * the coroutine — so a cancel that lands in that window settles no promise at all, the drain's
 * `await` never returns, and every remaining row sits at `queued` forever. `downloadFileAsync`
 * has no such path: a cancel closes the stream and the IOException always settles. Taking a
 * hang-on-cancel for a flag the platform ignores would be a pure loss.
 *
 * Two things that do NOT change under a background session, both checked in the SDK source:
 * progress still arrives through the same throttled `onProgress` (~100ms), and an `AbortSignal`
 * still cancels — `DownloadTask` wires the signal to `cancel()` and rejects with `AbortError`,
 * exactly as `downloadFileAsync` does. The `.part`-then-rename commit is untouched: iOS moves
 * the completed temp file onto the `.part` path inside its own delegate, and the rename to
 * `{NNN}.mp3` stays here, in JS. What a background session does NOT do is survive the app being
 * KILLED — the JS task is not restored, so a transfer that finishes after termination is simply
 * lost. Lost, never truncated: only the JS rename creates the real path.
 */
export const BACKGROUND_TRANSFERS = Platform.OS === 'ios';

/**
 * The nominal bitrate an estimate is computed at, in bits per second.
 *
 * ⚠️ IT IS NOMINAL, AND THAT IS WHY THE COPY SAYS "ABOUT". `scripts/prepare-audio.ts` republishes
 * its sources with `ffmpeg -c copy`, so the real bitrate is whichever the source recording used —
 * 40, 64, 128 or 192 kbps depending on the reciter. 128 is the modal value across the catalogue,
 * which makes the estimate right to within a factor of two at the extremes and close at the
 * middle. Publishing exact sizes in the manifest would fix that and is a PIPELINE change (the
 * spec's Ask First); 114 HEAD requests to answer one dialog is the alternative nobody wants.
 * A number a reader uses to decide "do I have room for this" does not need to be exact — it needs
 * to be labelled.
 */
export const NOMINAL_BITRATE_BPS = 128_000;

/**
 * How long a transfer may report no progress before it is called failed.
 *
 * ⚠️ NO BYTES IS NOT THE SAME AS AN ERROR, AND THE DRAIN IS SERIAL — which is what makes this
 * load-bearing rather than tidy. A captive portal or a dead socket produces a request that
 * neither delivers nor rejects, and without a watchdog the loop waits on it forever with every
 * one of the remaining 113 rows frozen at `queued` and no way to tell that anything is wrong.
 * The timer is re-armed on every progress event, so a slow connection is never mistaken for a
 * stalled one — only silence counts. (Story 7-5 review, P4.)
 */
export const DOWNLOAD_STALL_TIMEOUT_MS = 30_000;

/** The suffix an in-flight transfer writes under. See the header: the rename IS the commit. */
const PART_SUFFIX = '.part';

/** The download's file name — the CDN key's tail, so the two layouts cannot drift. */
export function surahFileName(surah: number): string {
  return `${String(surah).padStart(3, '0')}.mp3`;
}

/** Where a transfer writes until it has finished. Never read by anything but its own attempt. */
export function surahPartFileName(surah: number): string {
  return `${surahFileName(surah)}${PART_SUFFIX}`;
}

function reciterDirectory(reciterId: string): Directory {
  return new Directory(Paths.document, AUDIO_DOWNLOAD_DIR, reciterId);
}

function surahFile(reciterId: string, surah: number): File {
  return new File(reciterDirectory(reciterId), surahFileName(surah));
}

function surahPartFile(reciterId: string, surah: number): File {
  return new File(reciterDirectory(reciterId), surahPartFileName(surah));
}

/** Delete a path if it is there, swallowing anything the filesystem says about it. */
function deleteQuietly(file: File): void {
  try {
    if (file.exists) file.delete();
  } catch {
    // A delete that fails leaves a file the next `idempotent` download overwrites.
  }
}

/**
 * The `file://` uri of a downloaded surah, or `null` when it is not on disk.
 *
 * This is the ONLY thing `audioSource.ts` asks, and the null is not an error — it is the ordinary
 * answer for every surah a reader never chose to keep.
 */
export function localSurahUri(reciterId: string, surah: number): string | null {
  if (!DOWNLOADS_SUPPORTED) return null;
  try {
    const file = surahFile(reciterId, surah);
    return file.exists ? file.uri : null;
  } catch {
    return null;
  }
}

/** Whether this surah is on disk for this reciter. */
export function isDownloaded(reciterId: string, surah: number): boolean {
  return localSurahUri(reciterId, surah) !== null;
}

/**
 * Which surahs this reciter has on disk — ONE directory listing, not 114 stats.
 *
 * ⚠️ `null` MEANS "COULD NOT LIST", AND IT IS NOT THE SAME ANSWER AS AN EMPTY SET. See the
 * header: hydration acts on an empty set by dropping every kept row, which on a transient
 * filesystem failure would throw away a gigabyte of correct state.
 *
 * `*.part` files are invisible here by construction — the regex wants the exact `{NNN}.mp3` tail,
 * so an interrupted transfer's residue can never be mistaken for a kept surah.
 */
export function downloadedSurahSet(reciterId: string): Set<number> | null {
  if (!DOWNLOADS_SUPPORTED) return new Set();
  try {
    const dir = reciterDirectory(reciterId);
    if (!dir.exists) return new Set();
    const surahs = new Set<number>();
    for (const entry of dir.list()) {
      const match = /^(\d{3})\.mp3$/.exec(entry.name);
      if (!match) continue;
      const surah = Number.parseInt(match[1], 10);
      if (surah >= 1 && surah <= SURAH_COUNT) surahs.add(surah);
    }
    return surahs;
  } catch {
    return null;
  }
}

/** The same listing as a sorted array. `null` still means "could not list". */
export function downloadedSurahs(reciterId: string): number[] | null {
  const set = downloadedSurahSet(reciterId);
  return set === null ? null : [...set].sort((a, b) => a - b);
}

/** How many bytes this reciter's downloads occupy. `0` when nothing is kept. */
export function reciterBytesOnDisk(reciterId: string): number {
  if (!DOWNLOADS_SUPPORTED) return 0;
  try {
    const dir = reciterDirectory(reciterId);
    if (!dir.exists) return 0;
    return dir.size ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Free bytes on the device's internal storage, or `null` when the platform cannot say.
 *
 * ⚠️ `null` IS "UNKNOWN" AND MUST NEVER BE TREATED AS "FULL". A caller refuses a download on this
 * number, and refusing because the answer was unavailable would block a reader whose device has
 * plenty of room. The same `null`-is-not-a-value rule `downloadedSurahSet` records, pointing the
 * other way: there, empty could not stand in for unknown; here, unknown must not stand in for
 * zero.
 */
export function availableDownloadSpace(): number | null {
  if (!DOWNLOADS_SUPPORTED) return null;
  try {
    const free = Paths.availableDiskSpace;
    return typeof free === 'number' && Number.isFinite(free) && free >= 0 ? free : null;
  } catch {
    return null;
  }
}

/** Every reciter directory under the audio root, whether or not the catalogue still names it. */
function reciterDirectories(): Directory[] {
  const root = new Directory(Paths.document, AUDIO_DOWNLOAD_DIR);
  if (!root.exists) return [];
  return root.list().filter((entry): entry is Directory => entry instanceof Directory);
}

/**
 * Every reciter id with at least one surah on disk — the picker's downloaded indicator.
 *
 * Short-circuits on the first kept file per reciter rather than building each one's full set:
 * the caller only needs "any", and this runs on the JS thread of a surface that is live while a
 * queue is draining. (Story 7-5 review, P12.)
 */
export function recitersWithDownloads(): string[] {
  if (!DOWNLOADS_SUPPORTED) return [];
  try {
    const ids: string[] = [];
    for (const dir of reciterDirectories()) {
      if (dir.list().some((entry) => /^\d{3}\.mp3$/.test(entry.name))) ids.push(dir.name);
    }
    return ids;
  } catch {
    return [];
  }
}

/**
 * Downloads kept under a reciter the catalogue no longer offers.
 *
 * ⚠️ THIS IS UNREACHABLE STORAGE UNTIL SOMETHING NAMES IT. `abdulkareem` was deleted from the
 * catalogue on 2026-09-08 (its published audio was truncated in three surahs and unrepairable),
 * and a reader who had kept surahs under it has files no row lists, no control deletes — remove-
 * all is scoped to the CURRENT reciter — and no player can use, because the voice is not offered.
 * Reporting the bytes is what gives the reader a door; `deleteOrphanedDownloads` is the door.
 * (Story 7-5 review, P14.)
 */
export function orphanedDownloadBytes(knownReciterIds: readonly string[]): number {
  if (!DOWNLOADS_SUPPORTED) return 0;
  const known = new Set(knownReciterIds);
  try {
    let total = 0;
    for (const dir of reciterDirectories()) {
      if (!known.has(dir.name)) total += dir.size ?? 0;
    }
    return total;
  } catch {
    return 0;
  }
}

/** Delete every download kept under a reciter the catalogue no longer offers. */
export function deleteOrphanedDownloads(knownReciterIds: readonly string[]): void {
  if (!DOWNLOADS_SUPPORTED) return;
  const known = new Set(knownReciterIds);
  try {
    for (const dir of reciterDirectories()) {
      if (known.has(dir.name)) continue;
      clearReciterEntries(dir.name);
      try {
        dir.delete();
      } catch {
        // One unreadable directory must not stop the rest.
      }
    }
  } catch {
    // Nothing to do — the row simply keeps reporting the bytes.
  }
}

/**
 * Remove one surah's file, and any residue of a transfer that never finished.
 *
 * Never throws — the row is going back to "not downloaded" either way, and a delete that fails
 * leaves a file the next download overwrites (`idempotent: true`).
 */
export function removeSurahFile(reciterId: string, surah: number): void {
  if (!DOWNLOADS_SUPPORTED) return;
  deleteQuietly(surahFile(reciterId, surah));
  deleteQuietly(surahPartFile(reciterId, surah));
}

/** Remove everything kept for one reciter, directory included. */
export function removeReciterFiles(reciterId: string): void {
  if (!DOWNLOADS_SUPPORTED) return;
  try {
    const dir = reciterDirectory(reciterId);
    if (dir.exists) dir.delete();
  } catch {
    // Nothing to do: see `removeSurahFile`.
  }
}

/** A transfer that delivered no bytes for `DOWNLOAD_STALL_TIMEOUT_MS`. Named so a row can say so. */
export class DownloadStalledError extends Error {
  constructor(reciterId: string, surah: number) {
    super(`Download of ${reciterId} surah ${surah} stalled`);
    this.name = 'DownloadStalledError';
  }
}

/**
 * Download one surah into the document directory.
 *
 * ⚠️ IT WRITES A `.part` FILE AND RENAMES IT ON SUCCESS — see the header for why that, and not a
 * `catch` that deletes, is what makes a truncated surah impossible. The `catch` stays, and takes
 * the `.part` file with it: the two together mean a failure leaves the directory exactly as it
 * found it, whether the failure was a rejection, a cancel, a stall, or the process being killed.
 *
 * ⚠️ THE WATCHDOG ABORTS A *SEPARATE* CONTROLLER FROM THE CALLER'S, which is what lets the runner
 * still tell a reader's cancel from a dead socket: only the caller's signal being aborted means
 * "the reader pressed stop", and everything else is a failure the row should report.
 *
 * ⚠️ AND THE WATCHDOG IS DISARMED WHILE THE APP IS IN THE BACKGROUND, WHICH BACKGROUND TRANSFERS
 * MADE LOAD-BEARING. A suspended iOS app runs no JS: no progress event arrives to re-arm the
 * timer, and the timer itself fires on the wall clock the moment the app is resumed. So a
 * perfectly healthy transfer that spent a minute in the reader's pocket would be aborted as
 * "stalled" on the way back — the watchdog killing exactly the downloads it was added to protect.
 * Silence only means "stalled" while somebody is there to be told; `background` is the one state
 * that says nobody is.
 */
export async function downloadSurah(
  reciterId: string,
  surah: number,
  options: { onProgress?: (fraction: number) => void; signal?: AbortSignal } = {}
): Promise<void> {
  if (!DOWNLOADS_SUPPORTED) throw new Error('audio downloads are not available on web');

  const dir = reciterDirectory(reciterId);
  if (!dir.exists) dir.create({ intermediates: true });
  // A `.part` left by a killed run belongs to nobody; this attempt owns the path.
  deleteQuietly(surahPartFile(reciterId, surah));

  const watchdog = new AbortController();
  let stallTimer: ReturnType<typeof setTimeout> | null = null;
  let stalled = false;
  const disarm = () => {
    if (stallTimer) clearTimeout(stallTimer);
    stallTimer = null;
  };
  const rearm = () => {
    disarm();
    // Only a KNOWN background state disarms: `inactive` and Android's `unknown` still run JS,
    // and treating "not certainly active" as suspended would switch the watchdog off wholesale.
    if (AppState.currentState === 'background') return;
    stallTimer = setTimeout(() => {
      stalled = true;
      watchdog.abort();
    }, DOWNLOAD_STALL_TIMEOUT_MS);
  };
  const forwardAbort = () => watchdog.abort();
  options.signal?.addEventListener('abort', forwardAbort);
  const appState = AppState.addEventListener('change', (next) =>
    next === 'background' ? disarm() : rearm()
  );
  rearm();

  const url = surahAudioUrl(reciterId, surah);
  const onProgress = ({
    bytesWritten,
    totalBytes,
  }: {
    bytesWritten: number;
    totalBytes: number;
  }) => {
    rearm();
    // `-1` is "the server sent no Content-Length" — a real state, and one that must not
    // produce a negative fraction the progress ring would draw backwards.
    if (!(totalBytes > 0)) return;
    options.onProgress?.(Math.min(1, bytesWritten / totalBytes));
  };

  try {
    if (BACKGROUND_TRANSFERS) {
      // ⚠️ `idempotent` IS NOT AN OPTION ON THE TASK API, AND DOES NOT NEED TO BE: the `.part`
      // path was deleted above, and iOS removes an existing destination before its move anyway.
      await File.createDownloadTask(url, surahPartFile(reciterId, surah), {
        sessionType: 'background',
        signal: watchdog.signal,
        onProgress,
      }).downloadAsync();
    } else {
      await File.downloadFileAsync(url, surahPartFile(reciterId, surah), {
        idempotent: true,
        signal: watchdog.signal,
        onProgress,
      });
    }
    // ⚠️ THE COMMIT. Nothing else in this module ever creates `{NNN}.mp3`.
    deleteQuietly(surahFile(reciterId, surah));
    // ⚠️ A FRESH HANDLE, NOT THE ONE THE TRANSFER WROTE THROUGH: `moveSync` REWRITES the instance
    // it is called on, so a shared one would silently start pointing at the committed path.
    surahPartFile(reciterId, surah).moveSync(surahFile(reciterId, surah));
  } catch (error) {
    deleteQuietly(surahPartFile(reciterId, surah));
    if (stalled) throw new DownloadStalledError(reciterId, surah);
    throw error;
  } finally {
    disarm();
    appState.remove();
    options.signal?.removeEventListener('abort', forwardAbort);
  }
}

/**
 * An approximate byte total for keeping this reciter's whole book, and how many surahs that is.
 *
 * Duration × bitrate, summed over the surahs the manifest describes — the manifest's last window
 * per surah IS the recitation's length, so the total needs no network beyond the manifest the
 * reader's highlighting already wants. See `NOMINAL_BITRATE_BPS` for why the answer is
 * approximate and why the copy has to say so.
 *
 * ⚠️ THE COUNT COMES FROM THE MANIFEST TOO, AND THE DIALOG MUST USE IT RATHER THAN 114. All 39
 * shipped reciters describe the whole book today, so the two agree — but a manifest describing
 * fewer surahs would have its gaps contribute nothing to the total while the copy still promised
 * 114 files, which makes the number quietly LOW rather than merely approximate. (Story 7-5
 * review, P16.)
 */
export function estimateReciterDownload(manifest: ReciterManifest): {
  bytes: number;
  surahs: number;
} {
  let totalMs = 0;
  let surahs = 0;
  for (const windows of manifest.values()) {
    const last = windows[windows.length - 1];
    if (!last) continue;
    totalMs += last.toMs;
    surahs++;
  }
  return { bytes: Math.round((totalMs / 1000) * (NOMINAL_BITRATE_BPS / 8)), surahs };
}

// ─── The runner: one download at a time, published into the queue store ───────────────────────

/** Abort handles for the download currently in flight, keyed the way the store keys entries. */
const inFlight = new Map<string, AbortController>();
/** Surahs waiting their turn, oldest first. Module-level so navigation cannot interrupt it. */
const pending: { reciterId: string; surah: number }[] = [];
let draining = false;
/**
 * Which run of the queue is current.
 *
 * ⚠️ `draining = false` ON ITS OWN LETS TWO LOOPS RUN. `__resetDownloadRunner` clears the flag
 * while the old loop is still parked on an `await`; that loop then resumes, finds the flag free
 * to ignore, and keeps shifting entries off the SAME array the new one is reading. A generation
 * the loop re-checks each iteration is what makes an abandoned run actually stop.
 * (Story 7-5 review, P9.)
 */
let generation = 0;

/** How much of a failure reason a row is allowed to speak. */
const REASON_MAX_LENGTH = 80;

/**
 * Network conditions rather than defects — the tier-2 half of `errors.ts`'s capture policy.
 *
 * Measured on a Pixel 9 Pro over a throttled link, 2026-09-11: a slow connection rejects with
 * `java.net.SocketTimeoutException: timeout`, and an absent one with `UnknownHostException`.
 * Neither is a thing anybody can fix from a stack trace.
 */
function isTransientDownloadFailure(error: unknown): boolean {
  if (error instanceof DownloadStalledError) return true;
  if (isDeviceOfflineError(error)) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /SocketTimeout|UnknownHost|ConnectException|Network is unreachable|NSURLErrorDomain/i.test(
    message
  );
}

/**
 * The reason a row should show, short enough to sit in a label.
 *
 * ⚠️ THE RAW MESSAGE IS NOT COPY, AND ON ANDROID IT IS A JAVA STACK FRAGMENT. Measured on the
 * emulator over a throttled link: `Call to function 'FileSystem.downloadFileAsync' has been
 * rejected.\n→ Caused by: java.net.SocketTimeoutException: timeout` — a newline and a hundred
 * characters of implementation detail, read out in full by TalkBack. The first line, trimmed, is
 * the part that names what happened.
 */
function describeError(error: unknown): string {
  if (error instanceof DownloadStalledError) return 'stalled';
  const raw = error instanceof Error ? error.message : String(error);
  const firstLine = raw.split('\n')[0].trim();
  return firstLine.length > REASON_MAX_LENGTH
    ? `${firstLine.slice(0, REASON_MAX_LENGTH - 1)}…`
    : firstLine;
}

/**
 * Drain the queue, one surah at a time.
 *
 * ⚠️ SERIAL, AND A FAILURE DOES NOT STOP IT. The frozen matrix says "any surah failing leaves the
 * rest queued": a 404 on one file, or a full disk on one write, is that file's problem. The row
 * settles into `error` with a retry and the loop moves on, so a reader who asked for 114 does not
 * lose 113 of them to one bad response.
 */
async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  const gen = generation;
  try {
    while (pending.length > 0 && gen === generation) {
      const next = pending.shift();
      if (!next) break;
      const { reciterId, surah } = next;
      const key = downloadKey(reciterId, surah);
      const controller = new AbortController();
      inFlight.set(key, controller);
      setDownloadEntry(key, { status: 'downloading', progress: 0, error: undefined });
      try {
        await downloadSurah(reciterId, surah, {
          signal: controller.signal,
          onProgress: (fraction) => setDownloadEntry(key, { progress: fraction }),
        });
        /**
         * ⚠️ THE SUCCESS WRITE IS CONDITIONAL, BECAUSE REMOVE-ALL CAN LAND WHILE A TRANSFER IS
         * FINISHING. `deleteReciterDownloads` cancels every row and wipes the directory; a
         * transfer that resolved a tick earlier would otherwise write `downloaded` on top of the
         * cleared store and leave a checkmark over a file that is gone. The entry surviving is
         * the proof nobody has cancelled this row. (Story 7-5 review, P8.)
         */
        if (!controller.signal.aborted && getDownloadEntry(key) !== null) {
          setDownloadEntry(key, { status: 'downloaded', progress: 1, error: undefined });
        } else {
          removeSurahFile(reciterId, surah);
        }
      } catch (error) {
        /**
         * ⚠️ A CANCEL IS NOT AN ERROR SURFACE, AND THE SIGNAL IS WHAT SAYS SO — not the store.
         * Writing `error` after a cancel would put a red retry row under a reader who had just
         * pressed stop. Asking the STORE whether an entry survives looks equivalent and is not:
         * a reader who cancels and immediately presses download again has a fresh `queued` entry
         * under the same key by the time this abort rejects, and the store test would clobber it
         * with `error`. `controller` belongs to THIS run and cannot be confused with the next.
         */
        if (!controller.signal.aborted) {
          const reason = describeError(error);
          // ⚠️ THE REASON IS CARRIED, NOT DISCARDED (story 7-5 review, P5). A 404, a full disk
          // and a dead socket are the same bare glyph without it, and the frozen matrix asks for
          // "a stated error on that row" for the storage-full case.
          setDownloadEntry(key, { status: 'error', progress: 0, error: reason });
          addBreadcrumb('ui', 'surah download failed', { reciterId, surah, reason });
          /**
           * ⚠️ A BREADCRUMB ALWAYS, A CAPTURE ONLY FOR SOMETHING ACTIONABLE — `errors.ts`'s own
           * capture policy, tier 2: "expected / transient / user-or-device state → skip, or
           * breadcrumb". A download that fails because the reader walked into a tunnel is the
           * definition of self-healing connectivity, and a 114-file queue on a flaky link would
           * otherwise send up to 114 captures for one bad afternoon. The stall watchdog is the
           * same class by construction. Measured while smoking this on the emulator: every
           * throttled failure raised a full-screen dev red box, which is what a tier-3 capture
           * feels like from the inside.
           */
          if (!isTransientDownloadFailure(error)) {
            captureException(error, { context: 'audio.downloadSurah', reciterId, surah });
          }
        }
      } finally {
        inFlight.delete(key);
      }
    }
  } finally {
    // Only the CURRENT run may hand the flag back; an abandoned one leaving it set would block
    // the queue forever, and an abandoned one clearing it is exactly the double-drain above.
    if (gen === generation) draining = false;
  }
}

/**
 * Seed the store from disk — what the surfaces call so a row can render before any press.
 *
 * A listing that could not be read hydrates NOTHING rather than hydrating emptiness; see the
 * header's note on `downloadedSurahSet`'s `null`.
 */
export function hydrateDownloadState(reciterId: string): void {
  const kept = downloadedSurahs(reciterId);
  if (kept === null) return;
  hydrateReciterEntries(reciterId, kept);
}

/** Queue one surah. Already downloaded, queued or downloading: nothing happens. */
export function startSurahDownload(reciterId: string, surah: number): void {
  if (!DOWNLOADS_SUPPORTED) return;
  const key = downloadKey(reciterId, surah);
  const entry = getDownloadEntry(key);
  if (entry?.status === 'queued' || entry?.status === 'downloading') return;
  // Already on disk — including the case where the store has never been hydrated for this
  // reciter. A retry after a failure reaches this too, and correctly: the failed download
  // removed its `.part` file and never created the real one, so this is false and the push runs.
  if (isDownloaded(reciterId, surah)) {
    setDownloadEntry(key, { status: 'downloaded', progress: 1, error: undefined });
    return;
  }
  setDownloadEntry(key, { status: 'queued', progress: 0, error: undefined });
  pending.push({ reciterId, surah });
  void drain();
}

/**
 * Stop a download, in flight or merely queued, and leave nothing behind.
 *
 * The store entry is dropped FIRST: it is what the drain reads to tell an abort from a failure,
 * and what the row reads to go back to "not downloaded".
 */
export function cancelSurahDownload(reciterId: string, surah: number): void {
  const key = downloadKey(reciterId, surah);
  const queuedAt = pending.findIndex((e) => e.reciterId === reciterId && e.surah === surah);
  if (queuedAt >= 0) pending.splice(queuedAt, 1);
  resetDownloadEntry(key);
  /**
   * ⚠️ THE `.part` FILE IS NOT DELETED HERE, AND THAT IS THE ORDERING, NOT AN OMISSION.
   * `downloadSurah`'s own catch removes it when the abort's rejection lands — which is AFTER the
   * native writer has actually stopped. Deleting eagerly, from here, races a stream that is still
   * writing. Nothing depends on the timing any more (the residue is a `.part` file nobody reads),
   * but the ordering is still the correct one.
   */
  inFlight.get(key)?.abort();
}

/** Delete a kept surah: the file, then the row. */
export function deleteSurahDownload(reciterId: string, surah: number): void {
  removeSurahFile(reciterId, surah);
  resetDownloadEntry(downloadKey(reciterId, surah));
}

/**
 * Queue every surah for one reciter — "download all", the frozen matrix's confirmed action.
 *
 * ONE listing decides what is already kept, rather than 114 `file.exists` stats on the JS thread
 * of the screen the reader just pressed a button on. (Story 7-5 review, P13.)
 */
export function queueReciterDownloads(reciterId: string): void {
  if (!DOWNLOADS_SUPPORTED) return;
  const kept = downloadedSurahSet(reciterId);
  for (let surah = 1; surah <= SURAH_COUNT; surah++) {
    if (kept?.has(surah)) {
      setDownloadEntry(downloadKey(reciterId, surah), {
        status: 'downloaded',
        progress: 1,
        error: undefined,
      });
      continue;
    }
    startSurahDownload(reciterId, surah);
  }
}

/** Stop everything outstanding for one reciter, keeping what already landed. */
export function cancelReciterDownloads(reciterId: string): void {
  for (let surah = SURAH_COUNT; surah >= 1; surah--) cancelSurahDownload(reciterId, surah);
}

/** Re-queue only the rows that failed — what the "N failed" line offers. */
export function retryFailedDownloads(reciterId: string): void {
  for (let surah = 1; surah <= SURAH_COUNT; surah++) {
    if (getDownloadEntry(downloadKey(reciterId, surah))?.status === 'error') {
      startSurahDownload(reciterId, surah);
    }
  }
}

/** Cancel anything outstanding for a reciter and delete everything it has on disk. */
export function deleteReciterDownloads(reciterId: string): void {
  cancelReciterDownloads(reciterId);
  removeReciterFiles(reciterId);
  clearReciterEntries(reciterId);
}

/** Test seam — abandons the current run and drops the queue. Not for runtime use. */
export function __resetDownloadRunner(): void {
  generation++;
  for (const controller of inFlight.values()) controller.abort();
  inFlight.clear();
  pending.length = 0;
  draining = false;
}
