/**
 * useBookmarkRows — the bookmarks list's rows: sync-cache bookmarks joined to their Arabic
 * previews from the bundled Quran database (story 6-4).
 *
 * ⚠️ THE JOIN LIVES HERE BECAUSE THE TWO HALVES ARE THE TWO DATA PATHS THE ARCHITECTURE KEEPS
 * SEPARATE. The rows are worker-owned state (`useBookmarks()` — cache + outbox); the verse text
 * has no server copy and ships in the bundle (`lib/quranDb.ts`, rule 8's one door). Sync rows in,
 * quranDb previews attached; a preview failure degrades the DECORATION and never the list.
 *
 * ⚠️ A ROW IS NEVER DROPPED. The pre-fork hook filtered out bookmarks whose position the database
 * could not answer, which silently hid orphans forever — decided against in 6-4: a corrupt cache
 * row still renders (name fallback, no preview), still navigates, and can still be deleted.
 *
 * ⚠️ THE DATABASE IS RE-QUERIED ONLY WHEN THE KEY SET CHANGES, and the mechanism is a string.
 * `useBookmarks()`'s array gets a fresh identity on unrelated cache traffic, so an effect keyed
 * on the array would re-read the database per render. The pre-fork solved the same
 * array-identity problem with a render-mutated ref replaced under a comparison
 * (`useBookmarkedVerses.ts:23-30`); the React-safe spelling is a `useMemo`'d join of the sorted
 * keys — the effect depends on THAT, and reads the pairs through a ref the render keeps fresh.
 *
 * Sorted most-recent-first (`createdAt` desc), bookmark id as the tie-break so two rows created
 * in the same millisecond keep a stable order across renders and devices.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { getVersesForPositions } from '@/lib/quranDb';
import { useBookmarks } from '@/lib/sync';
import { verseKey } from '@/lib/usePosition';

export interface BookmarkListRow {
  /** The bookmark's client-minted id — the list key, and what a delete removes by. */
  id: string;
  surah: number;
  verse: number;
  createdAt: number;
  /**
   * The verse's `uthmani_text`, or `null` when the bundled database could not answer for this
   * pair (unopenable database, out-of-range pair). The ROW renders either way.
   */
  preview: string | null;
}

/** One shared identity for "no rows yet" — a fresh `[]` per render would cascade new identities
 *  through every memo below and defeat the row memoization they exist to protect. */
const NO_BOOKMARKS: never[] = [];

export function useBookmarkRows(): BookmarkListRow[] {
  const { data } = useBookmarks();
  const bookmarks = data ?? NO_BOOKMARKS;

  const sorted = useMemo(
    () =>
      [...bookmarks].sort(
        (a, b) =>
          // The MMKV row is untrusted (the read.tsx doctrine): a corrupt `createdAt` must not
          // hand the comparator a NaN, which makes the whole order arbitrary.
          (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0) ||
          (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
      ),
    // The array identity IS the dependency here — cheap, and the string below absorbs the churn.
    [bookmarks]
  );

  // The key-set string: the ONLY thing the preview effect re-runs on. Sorted, so a cache write
  // that reorders nothing and changes no pair (LWW traffic, a refetch) re-queries nothing.
  const pairKeys = useMemo(() => sorted.map((b) => verseKey(b.surah, b.verse)).join(','), [sorted]);
  const pairsRef = useRef(sorted);
  pairsRef.current = sorted;

  const [previews, setPreviews] = useState<ReadonlyMap<string, string>>(new Map());

  // ⚠️ `pairKeys` IS IN THE DEPENDENCIES AND IS DELIBERATELY NOT READ IN THE BODY — it IS the
  // "did the key set change" trigger (see the header), and the pairs are read through the ref so
  // the effect does not re-run on every array identity. The same shape, and the same Biome
  // suppression, as `useSurah`'s retry trigger.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `pairKeys` is the requery trigger (above)
  useEffect(() => {
    let cancelled = false;
    const pairs = pairsRef.current.map((b) => ({ surah: b.surah, verse: b.verse }));
    if (pairs.length === 0) {
      setPreviews(new Map());
      return;
    }
    getVersesForPositions(pairs)
      .then((verses) => {
        if (cancelled) return;
        setPreviews(new Map(verses.map((v) => [verseKey(v.surah, v.verse), v.textUthmani])));
      })
      .catch(() => {
        // Silent per-list degrade (the frozen matrix's row): the previews we already hold keep
        // rendering, rows without one render without it, and the LIST — names, refs, delete,
        // navigation — stays fully usable. The reading surface owns surfacing an unreadable
        // database; a decoration must not turn it into a takeover here.
      });
    return () => {
      cancelled = true;
    };
  }, [pairKeys]);

  return useMemo(
    () =>
      sorted.map((b) => ({
        id: b.id,
        surah: b.surah,
        verse: b.verse,
        createdAt: b.createdAt,
        preview: previews.get(verseKey(b.surah, b.verse)) ?? null,
      })),
    [sorted, previews]
  );
}
