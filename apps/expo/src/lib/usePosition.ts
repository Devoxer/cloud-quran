/**
 * usePosition — the reading position as ONE `(surah, verse)` pair, and the only door a screen has
 * to it (story 6-1).
 *
 * ⚠️ SINCE STORY 7-7 THIS FILE ALSO HOSTS THE SHARED CLAMP, AND ONE OF ITS CONSUMERS IS NOT A
 * READING SURFACE. `clampPosition` below turns an untrusted saved `(surah, verse)` into a pair
 * that is really in the book; `features/audio/hooks/useResumeListening.ts` runs the saved
 * LISTENING row through the same function, because a second copy would be a second place for the
 * three defects documented on it to come back. So the pair type here is `VersePair` — a position
 * in the book, with no claim about which of the two positions it is — and `ReadingPositionPair`
 * is the name for it when reading is what it means. The hook and its writer below are still the
 * reading position's only door; the clamp is a shared function that happens to live beside them.
 *
 * ── Why the pair is one value ────────────────────────────────────────────────────────────────
 *
 * ⚠️ NOTHING MAY REDUCE THE POSITION TO A FLAT VERSE INDEX. The pre-fork store held
 * `currentVerse: number` beside a separate `currentSurah`, with `setCurrentSurah` resetting the
 * verse to 1 — so the two decoupled, and audio playing in one surah scrolled another surah's
 * list (`highlight-seek-race`, still open against epic 7). Here the pair is written together,
 * compared together, and never exists as a lone number.
 *
 * ── Why the verse-changed comparison lives HERE and not in the screen ────────────────────────
 *
 * ⚠️ THE DEFECT THIS HOOK EXISTS TO MAKE UNWRITABLE: `onViewableItemsChanged` firing a database
 * write per scroll tick, unthrottled (`chrome-render-storm`). A write-per-tick client once burned
 * a day of the account-wide budget in 4.6 hours.
 *
 * The outbox coalesces and `lib/sync.ts` debounces, and neither is a licence to write per tick —
 * they bound the REQUEST rate, not the row churn, and `DRAIN_MAX_WAIT_MS` guarantees a request
 * every 15s under an unbroken burst regardless. So the fix has to be upstream of the queue, and
 * it has to live somewhere a future screen cannot forget it. The shape that achieves that: a
 * screen reports "the visible verse is now X" as often as it likes, and this hook writes only
 * when X differs from the last pair it wrote. A screen holds no ref, makes no comparison, and
 * has no way to reach `setReadingPosition` past it.
 *
 * ⚠️ THE COMPARISON KEY CARRIES THE SURAH. Comparing verse numbers alone would suppress the write
 * at every surah boundary that lands on the same verse number — 2:1 → 3:1 is a real move and
 * would look like "no change".
 *
 * ── The restore is not itself a write ────────────────────────────────────────────────────────
 *
 * `lastWritten` is SEEDED from the saved row on the first render. `useReadingPosition()` reads
 * `initialData` synchronously out of MMKV (that is the whole point of `lib/sync.ts`'s rule 1), so
 * on a cold launch with a saved position the row is already there when this hook initialises —
 * and the screen scrolling to that verse, then reporting it back, writes nothing. Without the
 * seed every launch would spend one write re-asserting a position that had not moved.
 *
 * ⚠️ SEEDED VIA `useRef(initial)`, WHICH READS ITS ARGUMENT ONLY ON THE FIRST RENDER. If the row
 * arrives LATER (a first-ever launch that then syncs from another device) the seed is `null` and
 * the reader's first genuine verse costs one write. That is correct: at that point the reader has
 * moved, and the server's copy is stale.
 */

import { getPageForVerse, SURAH_COUNT, SURAH_METADATA } from 'quran-data';
import { useCallback, useRef } from 'react';
import { type ReadingPosition, setReadingPosition, useReadingPosition } from './sync';

/** The canonical verse key — `{surah}:{verse}`, the same spelling `VERSE_PAGE_MAP` uses. */
export function verseKey(surah: number, verse: number): string {
  return `${surah}:${verse}`;
}

/**
 * A `(surah, verse)` pair — a position in the BOOK, and nothing about what the reader is doing
 * there. Reading position and listening position are both this shape and are DIFFERENT things
 * (epic 7's criterion); naming the shape after one of them is what made a listening contract read
 * as a reading one.
 */
export interface VersePair {
  surah: number;
  verse: number;
}

/** Where the reader is READING. `null` until they have read anything on any device. */
export type ReadingPositionPair = VersePair;

/** Where a reader with no usable position anywhere starts. */
const FIRST_SURAH = 1;
const FIRST_VERSE = 1;

/**
 * Clamp an untrusted saved pair into the book — AS A PAIR — or answer `null` when there is
 * nothing in it worth trusting.
 *
 * ⚠️ THE SAVED ROW IS UNTRUSTED INPUT. It comes out of MMKV, it can be written by a newer build,
 * it survives a downgrade, it can arrive from another device, and it can be corrupt. Three
 * defects came from trusting parts of it:
 *
 *   • the surah was locked on the first render while the VERSE was read again on a later one, so
 *     a row arriving one render late (`{18, 4}` after an initial `null`) opened Al-Fatihah and
 *     scrolled to its fourth ayah — the reader landed on 1:4 instead of 18:4;
 *   • an out-of-range verse (`{1, 999}`) was range-checked by the restore effect and NOT by the
 *     chrome, which rendered `Page -1 · 1:999` to the reader;
 *   • an out-of-range surah (`{200, 1}`) reached `getSurahVerses`, which answers `[]` — a blank
 *     screen with no verses, no error, and no next-surah control to escape by.
 *
 * So the whole pair is resolved in one place. An out-of-range surah resets the VERSE too: a verse
 * number from a surah that does not exist means nothing in the surah we fall back to.
 * ⚠️ The worker bounds these values on the way in; this clamp is about the copy already on the
 * device, which no server check has ever seen.
 *
 * ⚠️ IT LIVES HERE, AND NOT IN A SCREEN, BECAUSE IT HAS TWO CALLERS NOW (story 7-7). It was
 * `openingPosition` inside `read.tsx` until the listening-position resume needed the same clamp
 * on a different row; a second copy in `features/audio` would be a second place for those three
 * defects to come back. The two callers want different answers to "nothing usable", which is why
 * this one is `| null` and `openingPosition` below is the reading surface's `?? 1:1` on top of it:
 * a resume with no trustworthy row must fall back to what the reader is LOOKING at, not to the
 * top of the book.
 */
export function clampPosition(saved: VersePair | null): VersePair | null {
  if (!saved) return null;
  const { surah, verse } = saved;
  if (!Number.isInteger(surah) || surah < FIRST_SURAH || surah > SURAH_COUNT) return null;
  const verseCount = SURAH_METADATA[surah - 1]?.verseCount ?? FIRST_VERSE;
  if (!Number.isInteger(verse) || verse < FIRST_VERSE || verse > verseCount) {
    return { surah, verse: FIRST_VERSE };
  }
  return { surah, verse };
}

/**
 * The pair a reading surface OPENS at — the clamp above, with the top of the book as the answer
 * for a reader who has nothing saved anywhere (or whose row named a surah that does not exist).
 */
export function openingPosition(saved: VersePair | null): VersePair {
  return clampPosition(saved) ?? { surah: FIRST_SURAH, verse: FIRST_VERSE };
}

export interface UsePositionResult {
  /**
   * The saved pair, or `null` for a reader with no row anywhere. Present on the FIRST render when
   * MMKV holds it, so a screen restores without waiting for the network.
   */
  saved: ReadingPositionPair | null;
  /**
   * Report the verse currently being read. Safe to call on every scroll tick, every viewability
   * callback, every render — it writes only when the pair actually changed.
   */
  reportVerse: (surah: number, verse: number) => void;
}

function pairOf(row: ReadingPosition): ReadingPositionPair | null {
  return row ? { surah: row.surah, verse: row.verse } : null;
}

/**
 * @param mode Which renderer is reporting — written through to the row so a resume (story 6.3)
 *   knows which surface to reopen. Defaults to `'reading'`, the only caller before story 6-2;
 *   the mushaf screen passes `'mushaf'`. The wire type (`outbox.ts` / the worker's `validate.ts`)
 *   allowed both values before either surface existed.
 */
export function usePosition(mode: 'reading' | 'mushaf' = 'reading'): UsePositionResult {
  const { data } = useReadingPosition();
  const saved = pairOf(data ?? null);

  // See the header: the argument is read on the first render only, which is exactly when the
  // MMKV-seeded row is available if it exists at all.
  const lastWritten = useRef<string | null>(saved ? verseKey(saved.surah, saved.verse) : null);

  const reportVerse = useCallback(
    (surah: number, verse: number) => {
      const key = verseKey(surah, verse);
      // THE comparison. Everything above this line is why it is here rather than in a screen.
      if (lastWritten.current === key) return;
      lastWritten.current = key;
      // ⚠️ `page` and `mode` are REQUIRED by `ReadingPositionBody`, and `page` is not derivable
      // from the pair by arithmetic — it is a table read. `getPageForVerse` answers -1 for a verse
      // that is not in the map, which the worker would store as-is; the map covers all 6,236
      // verses, so a -1 here means the pair itself is wrong.
      setReadingPosition({
        surah,
        verse,
        page: getPageForVerse(surah, verse),
        mode,
      });
      // No invalidation, deliberately: `setReadingPosition` writes MMKV and the query cache
      // optimistically, and the drain invalidates on success via `INVALIDATED_BY`. A caller that
      // invalidated here would invalidate against the PRE-write server.
    },
    [mode]
  );

  return { saved, reportVerse };
}
