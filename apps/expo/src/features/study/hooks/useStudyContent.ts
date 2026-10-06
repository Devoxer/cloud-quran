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
 * ⚠️ A ROW IS A PASSAGE, AND A TRANSLATION'S PASSAGES ARE ONE AYAH LONG (story 8-5). Tafsir is
 * written once over several ayat, so its row carries the passage's whole span (`verse`…
 * `lastVerse`, for the label) and the in-range ayat it covers (for the Arabic), and draws its text
 * ONCE. A translation is the degenerate case — every entry spans one ayah — so it reads exactly as
 * it did before passages existed. An ayah in the range that no passage covers gets a row of its
 * own with `content: null`.
 *
 * `lint:layers`: a feature hook — it reaches `@/lib` and its own feature's `lib/`, never a route.
 */

import { SURAH_METADATA, type Verse } from 'quran-data';
import { useCallback, useEffect, useState } from 'react';
import { captureException } from '@/lib/errors';
import { getPackRange, getVersesForPositions, openPack } from '@/lib/quranDb';
import { verseKey } from '@/lib/usePosition';
import { rangeKey, type VerseRange, versesInRange } from '../lib/scope';

/** One ayah of the Quran, as a row draws it. */
export interface StudyAyah {
  surah: number;
  verse: number;
  /** `uthmani_text`, exactly as the database holds it. The draw site strips display marks. */
  arabic: string;
}

/** One passage of the range: the Quran it covers, and what the chosen source says about it. */
export interface StudyRow {
  surah: number;
  /** The first ayah the source's text is about — for a tafsir passage, possibly before the range. */
  verse: number;
  /**
   * The surah the text ENDS in — `surah` itself, except for a passage the pipeline stored once per
   * surah because it crosses one (Fi Zilal on 103:1–104:6), which the sheet draws as ONE row.
   */
  lastSurah: number;
  /** The last ayah it is about, in `lastSurah`. Equal to `verse` for every one-ayah row. */
  lastVerse: number;
  /** The ayat of the RANGE this row covers, in order. Never empty, never drawn under two rows. */
  ayat: StudyAyah[];
  /** The source's text, or `null` when it has none for these ayat. Never a reason to drop a row. */
  content: string | null;
  /** The edition's own footnotes for this text. Part of the edition, never dropped. */
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

/** The pack to read — the pair, because opening one takes its version. */
export interface StudyContentSource {
  id: string;
  version: number;
}

export function useStudyContent(
  range: VerseRange | null,
  /** The pack to read, or `null` when this type has no installed source. */
  source: StudyContentSource | null
): StudyContent {
  const [state, setState] = useState<StudyContentState>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const key = range === null ? null : rangeKey(range);
  const sourceId = source?.id ?? null;
  const sourceVersion = source?.version ?? null;

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
          sourceId === null || sourceVersion === null
            ? Promise.resolve([])
            : readSource(sourceId, sourceVersion, range),
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
  }, [key, sourceId, sourceVersion, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, retry };
}

/**
 * Open the pack if it is not open yet, then read the range.
 *
 * ⚠️ THIS IS WHERE A PACK IS OPENED NOW, AND THE ONLY PLACE (story 8-4). The shelf used to open
 * every installed pack on every mount so that this read would find a handle; it now only reads
 * their metadata, so the reader of the TEXT opens what it reads. `openPack` is idempotent for the
 * same version and a no-op for a web pack, which `holdPack` registered already.
 */
async function readSource(
  id: string,
  version: number,
  range: VerseRange
): Promise<Awaited<ReturnType<typeof getPackRange>>> {
  await openPack(id, version);
  return getPackRange(id, range.from, range.to);
}

/**
 * Join the Quran text and the source's passages onto the range's own order.
 *
 * ⚠️ THE RANGE DECIDES WHICH AYAT ARE DRAWN, NOT EITHER QUERY. `getVersesForPositions` documents
 * that its result order is the database's and carries no meaning, and a pack is a third-party file
 * whose `entries` table we do not control. Each passage draws only the ayat of the range it covers
 * — the passage 2:1–5 under ayah scope 2:3 draws 2:3 — and the rows are ordered by where their
 * text starts, which is the order the ayat are recited.
 */
export function joinRows(
  pairs: readonly { surah: number; verse: number }[],
  verses: readonly Verse[],
  entries: readonly {
    surah: number;
    verse: number;
    lastVerse: number;
    text: string;
    footnotes: string | null;
  }[]
): StudyRow[] {
  const arabic = new Map(verses.map((v) => [verseKey(v.surah, v.verse), v.textUthmani]));
  // An ayah the BUNDLED database cannot answer is not drawn at all — there is no Quran to show,
  // and a commentary with no verse above it is not what the sheet promises. That is a different
  // case from a pack having no entry, which keeps its row.
  const inRange = new Set(
    pairs.map((pair) => verseKey(pair.surah, pair.verse)).filter((id) => arabic.has(id))
  );
  const covered = new Set<string>();
  const rows: StudyRow[] = [];
  const ordered = [...entries].sort((a, b) => a.surah - b.surah || a.verse - b.verse);
  for (const entry of ordered) {
    // ⚠️ A MALFORMED SPAN IS CLAMPED, NEVER TRUSTED: `last_verse < verse` would draw no ayah at all.
    const lastVerse = Math.max(entry.lastVerse, entry.verse);
    const ayat: StudyAyah[] = [];
    for (let verse = entry.verse; verse <= lastVerse; verse++) {
      const id = verseKey(entry.surah, verse);
      const text = arabic.get(id);
      // ⚠️ AN AYAH IS DRAWN UNDER ONE PASSAGE ONLY. Two passages that overlap (a pack built before
      // the pipeline merged them, or a third-party file) would otherwise print the same ayah twice.
      if (!inRange.has(id) || text === undefined || covered.has(id)) continue;
      ayat.push({ surah: entry.surah, verse, arabic: text });
      covered.add(id);
    }
    // A passage the query answered that covers none of the range's ayat has nothing to stand under.
    if (ayat.length === 0) continue;
    const previous = rows[rows.length - 1];
    /**
     * ⚠️ ONE PASSAGE ACROSS A SURAH BOUNDARY IS ONE ROW. The pack stores Fi Zilal's 103:1–104:6 as
     * two rows with the same text, because a row cannot cross a surah; drawn as stored, a page
     * holding both surahs would print the whole commentary twice. Consecutive rows with the same
     * text, the first ending its surah and the second opening the next, are joined back.
     */
    if (
      previous &&
      previous.content === entry.text &&
      previous.footnotes === entry.footnotes &&
      entry.surah === previous.lastSurah + 1 &&
      entry.verse === 1 &&
      previous.lastVerse === (SURAH_METADATA[previous.lastSurah - 1]?.verseCount ?? -1)
    ) {
      previous.lastSurah = entry.surah;
      previous.lastVerse = lastVerse;
      previous.ayat.push(...ayat);
      continue;
    }
    rows.push({
      surah: entry.surah,
      verse: entry.verse,
      lastSurah: entry.surah,
      lastVerse,
      ayat,
      content: entry.text,
      footnotes: entry.footnotes,
    });
  }
  for (const pair of pairs) {
    const id = verseKey(pair.surah, pair.verse);
    const text = arabic.get(id);
    if (text === undefined || covered.has(id) || !inRange.has(id)) continue;
    covered.add(id);
    rows.push({
      surah: pair.surah,
      verse: pair.verse,
      lastSurah: pair.surah,
      lastVerse: pair.verse,
      ayat: [{ surah: pair.surah, verse: pair.verse, arabic: text }],
      content: null,
      footnotes: null,
    });
  }
  rows.sort((a, b) => a.surah - b.surah || a.verse - b.verse);
  return rows.length === 0 ? NO_ROWS : rows;
}
