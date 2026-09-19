/**
 * useStudyContent — (scope × source) resolved to rows the sheet can draw, or to a typed state
 * that says why it cannot (story 8-3).
 *
 * ⚠️ A FAILURE IS A VALUE, NEVER A THROWN PROMISE. `useSurah` set this rule for the reading
 * surface and the reason is the same one indirection out: a rejected read reaching the router's
 * `ErrorBoundary` is a redbox in dev and a blank screen in production — inside a half-sheet it
 * would also take the chrome with it. Every path here ends in a `StudyContentState`, and `error`
 * carries a retry that actually re-runs the reads.
 *
 * ⚠️ `empty` AND `error` ARE DIFFERENT ANSWERS AND MUST NOT BE COLLAPSED. `empty` is "no source is
 * installed for this type", which is the CORRECT state on a fresh install for four of the five
 * types and is answered with a download offer; `error` is "a source is installed and could not be
 * read" — a file removed under a live handle — and is answered with a retry. Rendering either as
 * the other tells a reader to fix the wrong thing.
 *
 * ⚠️ THE ARABIC IS ALWAYS READ, EVEN WITH NO SOURCE. The frozen criterion is "the Arabic at the
 * top for context and the selected type's content below", and the context half comes from the
 * bundled database, which is present on every platform with no pack at all. So an `empty` state
 * still carries its verses — the sheet draws the Quran and says the commentary is missing, rather
 * than drawing nothing.
 *
 * ⚠️ AND THE JOIN NEVER DROPS AN AYAH. `useBookmarkRows`' rule: a row survives its join failing.
 * A pack that is missing the verse the reader selected — a partial edition, an ayah an editor
 * skipped — keeps its row with `content: null`, because "this source says nothing here" is
 * information and a silently shorter list is not.
 *
 * `lint:layers`: a feature hook — it reaches `@/lib` and its own feature's `lib/`, never a route.
 */

import type { Verse } from 'quran-data';
import { useCallback, useEffect, useState } from 'react';
import { captureException } from '@/lib/errors';
import { getPackRange, getVersesForPositions } from '@/lib/quranDb';
import { verseKey } from '@/lib/usePosition';
import { rangeKey, type VerseRange, versesInRange } from '../lib/scope';

/** One ayah of the range: the Quran, and what the chosen source says about it. */
export interface StudyRow {
  surah: number;
  verse: number;
  /** `uthmani_text`, exactly as the database holds it. The draw site strips display marks. */
  arabic: string;
  /** The source's text for this ayah, or `null` when it has none. Never a reason to drop a row. */
  content: string | null;
  /** The edition's own footnotes for this ayah. Part of the edition, never dropped. */
  footnotes: string | null;
}

/** What the sheet has to draw. One union, so the sheet's branch is total. */
export type StudyContentState =
  | { kind: 'loading' }
  /** No source is installed for this type. `rows` still carries the Arabic. */
  | { kind: 'empty'; rows: StudyRow[] }
  | { kind: 'ready'; rows: StudyRow[] }
  | { kind: 'error' };

export interface StudyContent {
  state: StudyContentState;
  /** Clear the failure and run the reads again. */
  retry: () => void;
}

/** Empty rows for a state that has none yet — one object, so `loading` never allocates. */
const NO_ROWS: StudyRow[] = [];

export function useStudyContent(
  range: VerseRange | null,
  /** The pack id to read, or `null` when this type has no installed source. */
  sourceId: string | null
): StudyContent {
  const [state, setState] = useState<StudyContentState>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const key = range === null ? null : rangeKey(range);

  // ⚠️ `attempt` IS IN THE DEPENDENCIES AND IS DELIBERATELY NOT READ IN THE BODY — it IS the retry
  // trigger, and Biome's "more dependencies than necessary" reads only the body. Taking its
  // suggested fix deletes the retry: `retry()` would bump a counter nothing re-runs on, and the
  // error state's button would become decorative with every test still green except the one that
  // presses it. (`useSurah` carries the identical ignore, for the identical reason.)
  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` is the retry trigger (above)
  useEffect(() => {
    if (range === null) {
      setState({ kind: 'loading' });
      return;
    }
    // ⚠️ THE CANCELLATION IS LOAD-BEARING. Changing scope twice quickly starts two reads, and
    // without this the slower one lands last — the reader sees the page's ayat under a control
    // that says "Surah". `useSurah` paid for this lesson on the reading surface.
    let cancelled = false;
    setState({ kind: 'loading' });
    void (async () => {
      try {
        const pairs = versesInRange(range);
        const [verses, entries] = await Promise.all([
          getVersesForPositions(pairs),
          sourceId === null ? Promise.resolve([]) : getPackRange(sourceId, range.from, range.to),
        ]);
        if (cancelled) return;
        const rows = joinRows(pairs, verses, entries);
        setState(sourceId === null ? { kind: 'empty', rows } : { kind: 'ready', rows });
      } catch (cause) {
        if (cancelled) return;
        captureException(cause, { sourceId });
        setState({ kind: 'error' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, sourceId, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, retry };
}

/**
 * Join the Quran text and the source's entries onto the range's own order.
 *
 * ⚠️ THE RANGE DECIDES THE ORDER, NOT EITHER QUERY. `getVersesForPositions` documents that its
 * result order is the database's and carries no meaning, and a pack is a third-party file whose
 * `entries` table we do not control. Ordering by the enumeration is what makes the list the ayat
 * in the order they are recited, whatever the two reads answer in.
 */
function joinRows(
  pairs: readonly { surah: number; verse: number }[],
  verses: readonly Verse[],
  entries: readonly { surah: number; verse: number; text: string; footnotes: string | null }[]
): StudyRow[] {
  const arabic = new Map(verses.map((v) => [verseKey(v.surah, v.verse), v.textUthmani]));
  const content = new Map(entries.map((e) => [verseKey(e.surah, e.verse), e]));
  const rows: StudyRow[] = [];
  for (const pair of pairs) {
    const id = verseKey(pair.surah, pair.verse);
    const text = arabic.get(id);
    // An ayah the BUNDLED database cannot answer is not a row at all — there is no Quran to show
    // and a commentary with no verse above it is not what the sheet promises. That is a different
    // case from a pack having no entry, which keeps its row.
    if (text === undefined) continue;
    const entry = content.get(id);
    rows.push({
      surah: pair.surah,
      verse: pair.verse,
      arabic: text,
      content: entry?.text ?? null,
      footnotes: entry?.footnotes ?? null,
    });
  }
  return rows.length === 0 ? NO_ROWS : rows;
}
