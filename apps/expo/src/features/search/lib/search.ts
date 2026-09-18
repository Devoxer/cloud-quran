/**
 * The matcher — a substring scan over the normalised corpus (story 6-7).
 *
 * ⚠️ SUBSTRING, NOT TOKENS, AND THAT IS BETTER FOR ARABIC RATHER THAN MERELY EASIER. Arabic
 * morphology is templatic: `رحم` is the root living inside `ٱلرَّحْمَٰن`, `رَحْمَة` and `يَرْحَم`.
 * A token index matches whole tokens and misses all three; a substring scan over normalised text
 * finds 201 verses. At 6,236 rows the scan is not worth optimising — measured at ~4 ms per query
 * in Node over the real corpus. ⚠️ THAT NUMBER IS NODE, NOT A DEVICE, and is quoted as such: the
 * screen defers the query through `useDeferredValue` rather than trusting it. The source the fold
 * runs over is ~2.2 M characters of source text (704 K Uthmani + 679 K simple + 855 K translation).
 *
 * ⚠️ THE ORDER IS THE BOOK'S OWN, AND THERE IS NO RANKING. The story's frozen boundaries forbid
 * "any ranking the reader cannot explain", and the only ranking a reader of the Quran can explain
 * without being taught it is mushaf order. So results come back in `(surah, verse)` order — which
 * is simply the order the corpus was read in — and nothing is scored, counted or promoted.
 *
 * ⚠️ AND THERE IS NO CAP. A capped list is a count the reader cannot see: `الله` matches over a
 * thousand verses, and silently showing the first 300 of them tells a reader who scrolls to the
 * end that there are no more. The scan visits every verse whether or not it collects them, so the
 * cap would bound allocation only, and `FlashList` virtualises the rows it does not draw.
 */

import { normalizeForSearch, PLAIN_ALIF, searchableText } from './normalize';

/**
 * A verse as the matcher sees it: what is DISPLAYED, and what is COMPARED, kept apart.
 *
 * The two `*Match` fields are built by `useSearchCorpus` through `searchableText`, which is where
 * the dual dagger-alif reading and the two orthographies (`uthmani_text` + `simple_text`) are
 * folded together. Nothing renders them.
 */
export interface SearchVerse {
  surah: number;
  verse: number;
  /** `uthmani_text` — what the row draws, exactly as the database stores it. */
  textUthmani: string;
  /** The bundled English translation, or `null` when the join could not answer for this verse. */
  translation: string | null;
  /** Normalised Arabic, every form, joined by `normalize.ts`'s `FORM_SEPARATOR`. Never rendered. */
  arabicMatch: string;
  /** Normalised translation. Empty when there is none. Never rendered. */
  translationMatch: string;
}

/**
 * A verse as `lib/quranDb.ts` hands it over — structural rather than an import of
 * `SearchableVerse`, so the matcher owes nothing to the module that reads the database and its
 * tests can build a corpus from any row source.
 */
export interface SearchSource {
  surah: number;
  verse: number;
  textUthmani: string;
  textSimple: string;
  translation: string | null;
}

/**
 * Fold raw rows into the corpus the matcher scans.
 *
 * ⚠️ THE ARABIC SIDE IS BUILT FROM **BOTH** TEXT COLUMNS, AND THAT IS A MEASUREMENT, NOT A
 * BELT-AND-BRACES CHOICE. `uthmani_text` is the mushaf's orthography, which is not the
 * orthography anybody types: normalised, it answers 0 verses for `الصلاة`, 0 for `الزكاة` and 0
 * for `إبراهيم`, while `simple_text` answers 61, 28 and 63 (measured against the shipped
 * database, 2026-09-17). A search over the DISPLAYED text alone would look like a working
 * feature and fail on some of the most-searched words in the book.
 *
 * ⚠️ IT LIVES HERE RATHER THAN INSIDE `useSearchCorpus` SO THE TESTS CAN RUN THE REAL THING. A
 * test that rebuilt these five lines itself would keep passing while the hook's copy drifted —
 * which is the "expected value derived from the thing under test" failure one door down.
 */
export function buildCorpus(rows: readonly SearchSource[]): SearchVerse[] {
  return rows.map((row) => ({
    surah: row.surah,
    verse: row.verse,
    textUthmani: row.textUthmani,
    translation: row.translation,
    arabicMatch: searchableText(row.textUthmani, row.textSimple),
    // English has no dagger alif, so the single canonical form is the whole answer — and
    // `searchForms` would allocate a second identical string for every one of 6,236 rows.
    translationMatch: row.translation === null ? '' : normalizeForSearch(row.translation),
  }));
}

/** Which half of the row the reader's words were found in. The row says so; see `SearchResultRow`. */
export type MatchSide = 'arabic' | 'translation';

export interface SearchResult {
  /** The corpus row, carrying the text to draw. */
  entry: SearchVerse;
  side: MatchSide;
}

/**
 * The shortest query that runs.
 *
 * ⚠️ MEASURED ON THE NORMALISED FORM, NOT ON WHAT WAS TYPED, which is the only way it means
 * anything: `بِ` is two codepoints and one letter, and a reader pasting a vocalised fragment can
 * spend six codepoints on two letters. One Arabic letter matches a large fraction of the book, so
 * it is not a search — and the resting state below the field is what the reader sees instead.
 * There is no "type more" scolding (the frozen matrix's row): the resting state simply stays.
 */
export const MIN_QUERY_LENGTH = 2;

/**
 * Is there enough here to search for?
 *
 * The screen asks this to tell its RESTING state from its NO-MATCH state — an empty result set
 * means both, and telling a reader "no matches" before they have typed a word is the scolding the
 * frozen matrix rules out. One function, so the threshold cannot drift between the two callers.
 */
export function isSearchable(query: string): boolean {
  return normalizeForSearch(query).length >= MIN_QUERY_LENGTH;
}

/**
 * Every verse whose Arabic or translation contains the query, in mushaf order.
 *
 * The Arabic side is checked FIRST and wins a tie: this is a Quran reader, and a verse that
 * contains the reader's Arabic words should not be labelled as a translation hit because its
 * English happens to contain them too.
 */
export function searchVerses(corpus: readonly SearchVerse[], query: string): SearchResult[] {
  const needle = normalizeForSearch(query);
  if (needle.length < MIN_QUERY_LENGTH) return [];
  const results: SearchResult[] = [];
  for (const entry of corpus) {
    if (entry.arabicMatch.includes(needle)) {
      results.push({ entry, side: 'arabic' });
    } else if (entry.translationMatch.includes(needle)) {
      results.push({ entry, side: 'translation' });
    }
  }
  return results;
}

/** A half-open range of WORD indices — `[start, end)` into the array that was passed in. */
export interface WordRange {
  start: number;
  end: number;
}

/**
 * Which WORDS of a displayed text the query landed on, or `null` when it did not land on any.
 *
 * ⚠️ WORDS, NOT CHARACTERS, AND THE REASON IS ARABIC SHAPING. The obvious thing — return the
 * character offsets and let the row wrap that span in its own `<Text>` — would cut `ٱلرَّحْمَٰنِ`
 * between the `ل` and the `ر` for the query `رحم`, and a nested `<Text>` boundary breaks the
 * cursive join there. The reader would be shown a word of the Quran drawn with a seam through it.
 * Arabic ligatures never cross a space, so a WHOLE-WORD range is the largest unit that is
 * guaranteed safe to split on, and it is what the row both emphasises and windows around.
 *
 * ⚠️ IT RETURNS `null` FAR MORE OFTEN THAN "NO MATCH", AND THAT IS EXPECTED. The corpus matches a
 * verse through four normalised forms — two orthographies × two dagger-alif readings — and this
 * function is handed only the ONE text the row is drawing. A hit that came from `simple_text`
 * (`الصلاة` finds 61 verses there and 0 in `uthmani_text`) has no range in the Uthmani words, so
 * the row falls back to its head snippet with nothing emphasised. A wrong emphasis would be worse
 * than none.
 */
export function matchedWordRange(words: readonly string[], query: string): WordRange | null {
  const needle = normalizeForSearch(query);
  if (needle.length < MIN_QUERY_LENGTH) return null;

  // Words that normalise to nothing — `uthmani_text` writes its waqf signs as standalone
  // space-delimited tokens — are dropped from the haystack and keep their raw index, so the
  // joined string matches what the corpus holds and the answer still points at real words.
  //
  // Both dagger-alif readings are kept per word, for the reason the corpus keeps both: a reader
  // who typed `الرحمان` matched through the spelled-out form, and emphasising nothing on the one
  // row that proves the feature works would be a poor answer. The two arrays have identical word
  // boundaries — the rule rewrites one codepoint, it does not split or join words — so ONE index
  // walk serves whichever of them the needle is found in.
  const kept: { index: number; deleted: string; spelled: string }[] = [];
  for (let i = 0; i < words.length; i++) {
    const word = words[i] ?? '';
    const deleted = normalizeForSearch(word, '');
    if (deleted.length > 0)
      kept.push({ index: i, deleted, spelled: normalizeForSearch(word, PLAIN_ALIF) });
  }
  if (kept.length === 0) return null;

  let lengths = kept.map((k) => k.deleted.length);
  let at = kept
    .map((k) => k.deleted)
    .join(' ')
    .indexOf(needle);
  if (at < 0) {
    lengths = kept.map((k) => k.spelled.length);
    at = kept
      .map((k) => k.spelled)
      .join(' ')
      .indexOf(needle);
  }
  if (at < 0) return null;

  // Char offset → word index, walking the same joined string the match was found in.
  let cursor = 0;
  let start = -1;
  let end = kept.length;
  for (let i = 0; i < kept.length; i++) {
    const next = cursor + (lengths[i] ?? 0);
    if (start < 0 && next > at) start = i;
    if (next >= at + needle.length) {
      end = i + 1;
      break;
    }
    cursor = next + 1; // the joining space
  }
  if (start < 0) return null;
  return { start: kept[start]?.index ?? 0, end: (kept[end - 1]?.index ?? 0) + 1 };
}

/**
 * Split a display text into the words {@link matchedWordRange} indexes and the row renders.
 *
 * ⚠️ ONE SPLITTER, USED BY BOTH, or the indices this module hands back point into a different
 * array than the one the row draws. The separator is any whitespace run, which is also what the
 * normaliser's rule 10 collapses — so the two agree by construction rather than by comment.
 */
export function splitWords(text: string): string[] {
  const trimmed = text.trim();
  return trimmed.length === 0 ? [] : trimmed.split(/\s+/);
}
