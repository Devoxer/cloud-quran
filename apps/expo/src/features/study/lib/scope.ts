/**
 * scope — what the study sheet is looking AT, resolved to a verse RANGE (story 8-3).
 *
 * ⚠️ A SCOPE SELECTS A RANGE; A TYPE SELECTS WHAT TO SHOW FOR IT. That split is the whole reason
 * "every type at every scope" is coherent rather than a grid of nonsense: ayah → that ayah, page →
 * the ayat printed on that mushaf page, surah → the whole surah. Every content type answers for a
 * RANGE, so no type ever has to be hidden at a scope and no capability flags are needed.
 *
 * ⚠️ THERE IS NO WORD SCOPE, AND THAT IS AN OWNER CALL (2026-09-19) RATHER THAN AN OVERSIGHT. The
 * reference app offers one; with per-word granularity dropped a word scope is behaviourally
 * IDENTICAL to ayah scope, so it would ship a fourth control that does nothing a third already
 * does. Pressing a word on the mushaf still selects its AYAH (story 7-8, unchanged). It earns a
 * row again only when story 8-6 lands the Quranic Arabic Corpus and makes word meanings and i'rab
 * word-addressable — not before, and adding one here before there is data behind it is the
 * regression `scope.test.ts` counts the scope list against.
 *
 * ⚠️ A PAGE RANGE CROSSES SURAHS, AND THAT IS WHY A RANGE IS A PAIR OF PAIRS RATHER THAN
 * `(surah, from, to)`. Page 106 ends in Al-Ma'idah and page 604 holds three whole surahs; a range
 * keyed to one surah number would silently truncate every page that turns one over. The two ends
 * are ordered `(surah, verse)` lexicographically, which is exactly how `getPackRange`'s row-value
 * comparison reads them in SQL.
 *
 * `lint:layers` rule 2: a feature `lib/` — pure logic, no UI, no routes.
 */

import { getFirstVerseForPage, getPageForVerse, SURAH_COUNT, SURAH_METADATA } from 'quran-data';
import type { VersePair } from '@/lib/usePosition';

/** What the reader is studying. The row is fixed here — a fourth entry is an owner call. */
export type StudyScope = 'ayah' | 'page' | 'surah';

/**
 * Every scope, in the order the control draws them: narrowest first.
 *
 * ⚠️ DECLARED ONCE AND MAPPED EVERYWHERE. The sheet's control, the labels and the tests all read
 * this array, so a scope cannot exist in one of the three and not the others.
 */
export const STUDY_SCOPES = ['ayah', 'page', 'surah'] as const satisfies readonly StudyScope[];

/** An inclusive span of the book, ordered `(surah, verse)`. `from` never sorts after `to`. */
export interface VerseRange {
  from: VersePair;
  to: VersePair;
}

/** How many ayat a surah holds, or `0` when the number is not a surah. */
function verseCountOf(surah: number): number {
  return SURAH_METADATA[surah - 1]?.verseCount ?? 0;
}

/** The pair immediately BEFORE `pair` in the book, or `null` at 1:1. */
function previousVerse(pair: VersePair): VersePair | null {
  if (pair.verse > 1) return { surah: pair.surah, verse: pair.verse - 1 };
  const previousSurah = pair.surah - 1;
  const count = verseCountOf(previousSurah);
  return count > 0 ? { surah: previousSurah, verse: count } : null;
}

/** The last ayah of the book — An-Nas, and the page-604 range's closing end. */
function lastVerseOfBook(): VersePair {
  return { surah: SURAH_COUNT, verse: verseCountOf(SURAH_COUNT) };
}

/**
 * The nearest real ayah to `pair` — the degrade's FIRST step, and the one it was missing.
 *
 * ⚠️ THE DEGRADE-TO-AYAH PROMISE DID NOT SURVIVE THE ENUMERATION (story 8-3 review, S2).
 * `resolveScope('page', { surah: 2, verse: 999 })` dutifully answered `{2:999 → 2:999}`, and then
 * `versesInRange` clamped that against Al-Baqarah's 286 ayat and answered `[]` — so the sheet
 * rendered "this source has nothing for this range", which is a statement about the PACK and is
 * false. A range is only honest if it is enumerable, so the pair is pulled into the book before
 * any scope reasons about it; `usePosition` clamps a saved position the same way and for the same
 * reason. `1:1` is the floor for anything that is not a position at all.
 */
function clampPair(pair: VersePair): VersePair {
  const surah = Math.min(Math.max(Math.trunc(pair.surah) || 1, 1), SURAH_COUNT);
  const count = verseCountOf(surah);
  const verse = Math.min(Math.max(Math.trunc(pair.verse) || 1, 1), count);
  return { surah, verse };
}

/**
 * The range a scope names, given the ayah the reader selected.
 *
 * ⚠️ EVERY FAILURE DEGRADES TO A REAL AYAH, NEVER TO AN EMPTY RANGE OR A THROW. A verse the page
 * map cannot place (`getPageForVerse` answers `-1`) and a pair outside the book both resolve to
 * the nearest real ayah, so the sheet always has something to show. An empty range would render
 * as "this source has nothing here", which is a different — and false — statement about the pack.
 * ⚠️ The clamp is what makes that true rather than merely intended; see `clampPair`.
 */
export function resolveScope(scope: StudyScope, requested: VersePair): VerseRange {
  // See `clampPair`: every range this function returns has to be enumerable, or the degrade is a
  // promise the sheet cannot keep.
  const pair = clampPair(requested);
  const ayah: VerseRange = { from: pair, to: pair };
  if (scope === 'ayah') return ayah;

  if (scope === 'surah') {
    const count = verseCountOf(pair.surah);
    if (count === 0) return ayah;
    return { from: { surah: pair.surah, verse: 1 }, to: { surah: pair.surah, verse: count } };
  }

  const page = getPageForVerse(pair.surah, pair.verse);
  if (page < 1) return ayah;
  const from = getFirstVerseForPage(page);
  if (from.surah === 0) return ayah;
  // The page's last ayah is the one before the NEXT page's first — a table read on both ends, so
  // the two halves cannot disagree. The final page ends at the end of the book.
  const nextPageStart = getFirstVerseForPage(page + 1);
  const to = nextPageStart.surah === 0 ? lastVerseOfBook() : previousVerse(nextPageStart);
  return to === null ? ayah : { from, to };
}

/**
 * Every `(surah, verse)` in the range, in order.
 *
 * ⚠️ IT IS BOUNDED BY THE BOOK, NOT BY THE INPUT. A malformed range walks surah numbers, so an
 * end that sorts before its start, or a surah past 114, answers `[]` rather than looping — the
 * enumeration feeds a SQL `IN (VALUES …)` list, and an unbounded one is a hung read on the one
 * screen a reader opened to look something up.
 */
export function versesInRange(range: VerseRange): VersePair[] {
  const { from, to } = range;
  if (from.surah < 1 || to.surah > SURAH_COUNT) return [];
  if (from.surah > to.surah || (from.surah === to.surah && from.verse > to.verse)) return [];
  const pairs: VersePair[] = [];
  for (let surah = from.surah; surah <= to.surah; surah++) {
    const count = verseCountOf(surah);
    if (count === 0) continue;
    const start = surah === from.surah ? Math.max(1, from.verse) : 1;
    const end = surah === to.surah ? Math.min(count, to.verse) : count;
    for (let verse = start; verse <= end; verse++) pairs.push({ surah, verse });
  }
  return pairs;
}

/** A stable identity for a range — what an effect depends on instead of two object literals. */
export function rangeKey(range: VerseRange): string {
  return `${range.from.surah}:${range.from.verse}-${range.to.surah}:${range.to.verse}`;
}
