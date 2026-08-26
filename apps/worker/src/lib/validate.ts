/**
 * Request-body validation for the four synced entities.
 *
 * Hand-rolled rather than zod, deliberately: the worker's only dependencies for this story are
 * `drizzle-orm` and `drizzle-kit`, and pulling in `@cloudquran/shared` to reach zod would put the
 * whole content contract (and its transitive deps) into the worker bundle for four small bounds
 * checks. When story 5-6 needs these shapes on the CLIENT too, that is the moment to lift them
 * into `packages/shared` as zod schemas and import them from both sides — a shared schema with
 * one consumer is not shared, it is relocated.
 *
 * The bounds are the same ones the retired vendor schema documented in comments and never
 * enforced. A `fontSize` of 4000 was accepted by the old layer and is rejected here.
 */

/**
 * Structural totals of the Quran. Fixed quantities, not configuration.
 * (`@cloudquran/shared`'s `quran.ts` carries the same numbers for the app; the worker does not
 * depend on that package — see the note above.)
 */
const TOTAL_SURAHS = 114;
const TOTAL_PAGES = 604;
/** Longest surah, so the loosest safe upper bound without a per-surah table in the worker. */
const MAX_VERSE = 286;

export const READING_MODES = ['reading', 'mushaf'] as const;
export const THEMES = ['light', 'sepia', 'dark'] as const;

export type ReadingMode = (typeof READING_MODES)[number];
export type Theme = (typeof THEMES)[number];

export type Invalid = { ok: false; error: string };
export type Valid<T> = { ok: true; value: T };
export type Result<T> = Valid<T> | Invalid;

const invalid = (error: string): Invalid => ({ ok: false, error });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function intIn(value: unknown, min: number, max: number): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function numberIn(value: unknown, min: number, max: number): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

/**
 * A millisecond epoch timestamp. Rejects 0/negative and anything past the year 3000 — a client
 * clock skewed far into the future would otherwise pin an LWW row permanently, and no later
 * write could ever beat it.
 */
// ⚠️ Bounded to the SERVER clock plus a day of tolerance, not the year 3000.
// This was `32_503_680_000_000` (year 3000). A client sending an `updatedAt` anywhere in that
// range passed validation and won every last-write-wins comparison FOREVER — the row would be
// pinned for ~974 years and every legitimate later write would silently no-op. A device with a
// wildly wrong clock, or one malicious request, permanently bricks that user's sync. The day of
// slack absorbs ordinary clock skew without admitting a date that cannot be real.
const FUTURE_TOLERANCE_MS = 24 * 60 * 60 * 1000;
function timestamp(value: unknown): boolean {
  return intIn(value, 1, Date.now() + FUTURE_TOLERANCE_MS);
}

function shortString(value: unknown, max: number): boolean {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}

export type ReadingPositionInput = {
  surah: number;
  verse: number;
  page: number;
  mode: ReadingMode;
  updatedAt: number;
};

export function parseReadingPosition(body: unknown): Result<ReadingPositionInput> {
  if (!isRecord(body)) return invalid('body must be an object');
  const { surah, verse, page, mode, updatedAt } = body;
  if (!intIn(surah, 1, TOTAL_SURAHS)) return invalid(`surah must be 1-${TOTAL_SURAHS}`);
  if (!intIn(verse, 1, MAX_VERSE)) return invalid(`verse must be 1-${MAX_VERSE}`);
  if (!intIn(page, 1, TOTAL_PAGES)) return invalid(`page must be 1-${TOTAL_PAGES}`);
  if (!READING_MODES.includes(mode as ReadingMode))
    return invalid("mode must be 'reading' or 'mushaf'");
  if (!timestamp(updatedAt)) return invalid('updatedAt must be an epoch-ms integer');
  return {
    ok: true,
    value: {
      surah: surah as number,
      verse: verse as number,
      page: page as number,
      mode: mode as ReadingMode,
      updatedAt: updatedAt as number,
    },
  };
}

export type AudioPositionInput = {
  surah: number;
  verse: number;
  reciterId: string;
  updatedAt: number;
};

export function parseAudioPosition(body: unknown): Result<AudioPositionInput> {
  if (!isRecord(body)) return invalid('body must be an object');
  const { surah, verse, reciterId, updatedAt } = body;
  if (!intIn(surah, 1, TOTAL_SURAHS)) return invalid(`surah must be 1-${TOTAL_SURAHS}`);
  if (!intIn(verse, 1, MAX_VERSE)) return invalid(`verse must be 1-${MAX_VERSE}`);
  if (!shortString(reciterId, 64)) return invalid('reciterId must be a 1-64 character string');
  if (!timestamp(updatedAt)) return invalid('updatedAt must be an epoch-ms integer');
  return {
    ok: true,
    value: {
      surah: surah as number,
      verse: verse as number,
      reciterId: reciterId as string,
      updatedAt: updatedAt as number,
    },
  };
}

export type PreferencesInput = {
  theme: Theme;
  fontSize: number;
  reciterId: string;
  readingMode: ReadingMode;
  translationId: string | null;
  speedRate: number;
  transliteration: boolean;
  updatedAt: number;
};

export function parsePreferences(body: unknown): Result<PreferencesInput> {
  if (!isRecord(body)) return invalid('body must be an object');
  const {
    theme,
    fontSize,
    reciterId,
    readingMode,
    translationId,
    speedRate,
    transliteration,
    updatedAt,
  } = body;
  if (!THEMES.includes(theme as Theme)) return invalid("theme must be 'light', 'sepia' or 'dark'");
  if (!intIn(fontSize, 20, 44)) return invalid('fontSize must be 20-44');
  if (!shortString(reciterId, 64)) return invalid('reciterId must be a 1-64 character string');
  if (!READING_MODES.includes(readingMode as ReadingMode))
    return invalid("readingMode must be 'reading' or 'mushaf'");
  if (translationId !== undefined && translationId !== null && !shortString(translationId, 64))
    return invalid('translationId must be null or a 1-64 character string');
  if (!numberIn(speedRate, 0.5, 2)) return invalid('speedRate must be 0.5-2.0');
  if (typeof transliteration !== 'boolean') return invalid('transliteration must be a boolean');
  if (!timestamp(updatedAt)) return invalid('updatedAt must be an epoch-ms integer');
  return {
    ok: true,
    value: {
      theme: theme as Theme,
      fontSize: fontSize as number,
      reciterId: reciterId as string,
      readingMode: readingMode as ReadingMode,
      translationId: (translationId ?? null) as string | null,
      speedRate: speedRate as number,
      transliteration,
      updatedAt: updatedAt as number,
    },
  };
}

export type BookmarkInput = {
  id: string;
  surah: number;
  verse: number;
  label: string | null;
  createdAt: number;
};

export function parseBookmark(body: unknown): Result<BookmarkInput> {
  if (!isRecord(body)) return invalid('body must be an object');
  const { id, surah, verse, label, createdAt } = body;
  // Client-minted so an offline create keeps its identity through the outbox drain (story 5-6).
  if (!shortString(id, 64)) return invalid('id must be a 1-64 character string');
  if (!intIn(surah, 1, TOTAL_SURAHS)) return invalid(`surah must be 1-${TOTAL_SURAHS}`);
  if (!intIn(verse, 1, MAX_VERSE)) return invalid(`verse must be 1-${MAX_VERSE}`);
  if (label !== undefined && label !== null && (typeof label !== 'string' || label.length > 200))
    return invalid('label must be null or a string of at most 200 characters');
  if (!timestamp(createdAt)) return invalid('createdAt must be an epoch-ms integer');
  return {
    ok: true,
    value: {
      id: id as string,
      surah: surah as number,
      verse: verse as number,
      label: (label ?? null) as string | null,
      createdAt: createdAt as number,
    },
  };
}
