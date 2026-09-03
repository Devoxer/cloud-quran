/**
 * Reciter timing manifests (story 7-1) — the lookup that turns media position into a verse.
 *
 * ⚠️ THIS FILE IS THE WHOLE HIGHLIGHTING MECHANISM. Everything the reader sees follow the
 * recitation — the reading row's background, the mushaf page's glyphs, the lock-screen ayah — is
 * `verseAtMs` answering "which ayah owns this millisecond?". There is no timer, nothing
 * accumulates, and nothing is estimated, which is why playback rate needs no handling at all:
 * `currentTime` is MEDIA time, so at 2x it simply advances twice as fast and the same lookup
 * keeps answering correctly.
 *
 * ⚠️ THE MANIFEST IS MILLISECONDS AND THE PLAYER IS SECONDS. `AudioPlaylist.currentTime`,
 * `duration` and `seekTo` all speak seconds; every number in here is a millisecond. The
 * conversion belongs at the engine boundary and nowhere else — a stray `* 1000` in a surface is
 * how the two units start drifting apart.
 *
 * ⚠️ THE PARSED FORM IS NOT THE WIRE FORM. The wire is `{ "<surah>": [{ verse_key,
 * timestamp_from, timestamp_to }] }` — a 419 KB JSON object keyed by strings, with the surah
 * number repeated inside every one of 6,236 `verse_key`s. Parsing it into a `Map<number,
 * VerseWindow[]>` once, at load, is what lets the hot path be a binary search over a plain array
 * instead of string work ten times a second.
 *
 * Layer note: `lib/`, because the engine, the reading surface and the mushaf surface all need it
 * and none of them may reach across to another feature. It imports only `expo-file-system`,
 * `react-native`'s Platform, and `@/constants/audio` — all downward.
 */

import { Directory, File, Paths } from 'expo-file-system';
import { SURAH_METADATA } from 'quran-data';
import { Platform } from 'react-native';

import { MANIFEST_CACHE_DIR, reciterManifestUrl } from '@/constants/audio';

/** One ayah's span inside its surah's MP3. Half-open: `[fromMs, toMs)`. */
export interface VerseWindow {
  verse: number;
  fromMs: number;
  toMs: number;
}

/** A reciter's whole book: surah number → its ayah windows, ascending and contiguous. */
export type ReciterManifest = ReadonlyMap<number, readonly VerseWindow[]>;

/** Raised when a manifest cannot be loaded. Carries the reciter so a retry surface can name it. */
export class ReciterManifestError extends Error {
  readonly reciterId: string;
  constructor(reciterId: string, cause: unknown) {
    super(`Timing manifest for reciter ${reciterId} could not be loaded`, { cause });
    this.name = 'ReciterManifestError';
    this.reciterId = reciterId;
  }
}

/** The wire shape, exactly as `scripts/prepare-audio.ts` publishes it. */
interface WireTiming {
  verse_key: string;
  timestamp_from: number;
  timestamp_to: number;
}

/**
 * Parse the wire object into the lookup form, dropping anything malformed rather than throwing.
 *
 * ⚠️ A BAD ROW IS DROPPED, NOT FATAL, AND THAT IS DELIBERATE. The manifest is generated data, and
 * one unusable window costs one ayah's highlight; refusing the whole file would cost the reader
 * the entire recitation. What is NOT tolerated is silent disorder — the windows are sorted here,
 * because the binary search below is only correct on an ascending array and the pipeline's
 * ordering is a property of its output rather than a guarantee of the format.
 */
export function parseReciterManifest(wire: unknown): ReciterManifest {
  const out = new Map<number, VerseWindow[]>();
  if (typeof wire !== 'object' || wire === null) return out;

  for (const [surahKey, timings] of Object.entries(wire as Record<string, unknown>)) {
    const surah = Number.parseInt(surahKey, 10);
    if (!Number.isInteger(surah) || surah < 1 || !Array.isArray(timings)) continue;

    const windows: VerseWindow[] = [];
    for (const raw of timings as WireTiming[]) {
      const verse = Number.parseInt(String(raw?.verse_key ?? '').split(':')[1] ?? '', 10);
      const fromMs = raw?.timestamp_from;
      const toMs = raw?.timestamp_to;
      if (!Number.isInteger(verse) || verse < 1) continue;
      if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) continue;
      windows.push({ verse, fromMs, toMs });
    }
    if (windows.length === 0) continue;
    windows.sort((a, b) => a.fromMs - b.fromMs);
    out.set(surah, windows);
  }
  return out;
}

/**
 * Which ayah is being recited at `ms` in this surah's file — or `null` when the surah has no
 * timings at all.
 *
 * Binary search for the LAST window whose `fromMs` is at or before `ms`. Two clamps, both of
 * which are real states rather than defensive padding: a position before the first window is the
 * lead-in some reciters record before the first ayah, and a position past the last window is the
 * tail after the final one. Both belong to the nearest ayah — never to "nothing", which would
 * blank the highlight at exactly the moments a listener is most likely to be looking at it.
 */
export function verseAtMs(manifest: ReciterManifest, surah: number, ms: number): number | null {
  const windows = manifest.get(surah);
  if (!windows || windows.length === 0) return null;
  if (ms < windows[0].fromMs) return windows[0].verse;

  let lo = 0;
  let hi = windows.length - 1;
  while (lo < hi) {
    // Upper midpoint: this search moves `lo` up, so a lower midpoint would not terminate.
    const mid = Math.ceil((lo + hi) / 2);
    if (windows[mid].fromMs <= ms) lo = mid;
    else hi = mid - 1;
  }
  return windows[lo].verse;
}

/** Where an ayah begins in its surah's file, in milliseconds — `null` if it has no window. */
export function offsetOfVerse(
  manifest: ReciterManifest,
  surah: number,
  verse: number
): number | null {
  const windows = manifest.get(surah);
  if (!windows) return null;
  // Ayah numbers are dense and 1-based, so the direct index is right for every well-formed
  // manifest; the guard catches the dropped-row case above rather than a normal one.
  const direct = windows[verse - 1];
  if (direct?.verse === verse) return direct.fromMs;
  return windows.find((w) => w.verse === verse)?.fromMs ?? null;
}

/**
 * Whether this surah's timings cover EVERY ayah — the gate on highlighting it at all.
 *
 * ⚠️ THIS IS NOT DEFENSIVE PADDING; IT IS THE MEASURED STATE OF THE PUBLISHED DATA. Audited
 * across all 40 catalogue reciters on 2026-09-02: 38 are complete (0 of 6,236 rows missing), and
 * two are not — `alafasy` is missing 1,088 rows (Ya-Sin alone is 81 of 83) and `abdulkareem` 305.
 * The pipeline's EveryAyah path derives offsets with ffprobe and cannot produce a gap, so those
 * two were published from the timing-API path before the re-source; the fix is a pipeline re-run
 * (`node scripts/prepare-audio.ts --reciter alafasy`), NOT anything in the app.
 *
 * ⚠️ AND A PARTIAL MANIFEST IS WORSE THAN NO MANIFEST, which is why this exists rather than a
 * shrug. With 81 of Ya-Sin's 83 windows dropped, `verseAtMs` answers truthfully over the two
 * windows it has — and so parks the highlight on ayah 2 for fifteen minutes while the reciter is
 * somewhere else entirely. A reader would read that as the app being broken, and be right. No
 * highlight is an absence; a confidently wrong one is a lie about the Quran.
 */
export function isSurahTimed(manifest: ReciterManifest, surah: number): boolean {
  const expected = SURAH_METADATA[surah - 1]?.verseCount;
  if (!expected) return false;
  return manifest.get(surah)?.length === expected;
}

/** The last ayah a surah's timings cover — how the engine knows a track ran to its end. */
export function lastVerseOf(manifest: ReciterManifest, surah: number): number | null {
  const windows = manifest.get(surah);
  return windows && windows.length > 0 ? windows[windows.length - 1].verse : null;
}

/**
 * In-memory manifests, keyed by reciter. A reader switching voices mid-session should not re-read
 * 419 KB off disk to switch back, and a manifest is immutable once published.
 */
const loaded = new Map<string, ReciterManifest>();
/** In-flight loads, so two surfaces asking at once share one fetch rather than racing. */
const inFlight = new Map<string, Promise<ReciterManifest>>();

async function readManifest(reciterId: string): Promise<unknown> {
  const url = reciterManifestUrl(reciterId);

  // Web has no writable document directory; the browser's HTTP cache is the disk cache, exactly
  // as it is for the mushaf faces.
  if (Platform.OS === 'web') {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  }

  const cacheDir = new Directory(Paths.document, MANIFEST_CACHE_DIR);
  const file = new File(cacheDir, `${reciterId}.json`);
  if (!file.exists) {
    if (!cacheDir.exists) cacheDir.create({ intermediates: true });
    await File.downloadFileAsync(url, file, { idempotent: true });
  }
  try {
    return await file.json();
  } catch (cause) {
    /**
     * ⚠️ A BAD CACHED FILE MUST BE DESTROYED, NOT KEPT. This directory is deliberately the
     * non-evictable one (an evicted manifest is a broken offline promise), which cuts both ways:
     * a truncated download, or an error page written where JSON was expected, would otherwise
     * fail to parse on every launch for the life of the install, with no path back. Deleting it
     * turns a permanent break into one failed attempt and a retry that can succeed.
     */
    try {
      file.delete();
    } catch {
      // Nothing to do — the next download is `idempotent` and overwrites it anyway.
    }
    throw cause;
  }
}

/**
 * Load a reciter's manifest — memory, then disk, then the network. Rejects with
 * `ReciterManifestError`; offline-and-uncached is the expected instance of that, and the caller
 * turns it into a retry surface rather than a blank screen.
 */
export async function loadReciterManifest(reciterId: string): Promise<ReciterManifest> {
  const cached = loaded.get(reciterId);
  if (cached) return cached;

  const pending = inFlight.get(reciterId);
  if (pending) return pending;

  const task = (async () => {
    try {
      const manifest = parseReciterManifest(await readManifest(reciterId));
      // An empty parse means the file was fetched but says nothing — a truncated download or a
      // reciter published without timings. Treated as a failure so the retry surface appears
      // instead of silent, permanent no-highlighting.
      if (manifest.size === 0) throw new Error('manifest contains no usable timings');
      loaded.set(reciterId, manifest);
      return manifest;
    } catch (cause) {
      throw new ReciterManifestError(reciterId, cause);
    } finally {
      inFlight.delete(reciterId);
    }
  })();

  inFlight.set(reciterId, task);
  return task;
}

/** Test seam — drops the memoized manifests. Not for runtime use. */
export function __resetManifestCache(): void {
  loaded.clear();
  inFlight.clear();
}
