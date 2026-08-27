/**
 * usePosition — the reading position as ONE `(surah, verse)` pair, and the only door a screen has
 * to it (story 6-1).
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

import { getPageForVerse } from 'quran-data';
import { useCallback, useRef } from 'react';
import { type ReadingPosition, setReadingPosition, useReadingPosition } from './sync';

/** The canonical verse key — `{surah}:{verse}`, the same spelling `VERSE_PAGE_MAP` uses. */
export function verseKey(surah: number, verse: number): string {
  return `${surah}:${verse}`;
}

/** Where the reader is. `null` until they have read anything on any device. */
export interface ReadingPositionPair {
  surah: number;
  verse: number;
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
