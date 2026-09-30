/**
 * The matcher, against the REAL corpus (story 6-7).
 *
 * ⚠️ A FIXTURE WOULD PROVE NOTHING HERE, for `lib/quranDb.test.ts`'s reason one layer up. The
 * question this file has to answer is not "does substring matching work" — it is "does THIS
 * normaliser, over THESE 6,236 rows, find the verses a reader is looking for". A hand-written
 * corpus of three invented verses answers a question nobody was asking. So the rows come out of
 * the shipped `apps/expo/src/data/quran.db` through `node:sqlite`, and they are folded by the
 * SHIPPED `buildCorpus` rather than by a copy of it — which is why that function lives in
 * `search.ts` and not inside the hook.
 *
 * ⚠️ AND EVERY EXPECTED COUNT BELOW WAS DERIVED INDEPENDENTLY, by writing the normaliser a second
 * time as a throwaway script and running it over the same file (2026-09-17). They are typed-out
 * literals, not values read back from the thing under test — the repo's first non-negotiable. If
 * a rule in `normalize.ts` changes, these numbers move and this file goes red, which is the whole
 * point of them being numbers.
 *
 * ⚠️ `{ readOnly: true }` IS CAMELCASE DELIBERATELY. `node:sqlite` SILENTLY IGNORES unknown
 * constructor options, which is how Bun's `{ readonly: true }` once handed `verify-quran.ts` a
 * WRITABLE handle on the shipped Quran database (story 5-3). The same trap, two directories away.
 */

import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { TOTAL_VERSES } from 'quran-data';
import {
  buildCorpus,
  isSearchable,
  matchedWordRange,
  type SearchResult,
  type SearchVerse,
  searchVerses,
  splitWords,
} from './search';

/** The file the app actually bundles — resolved from this test's own location, never copied. */
const DB_PATH = join(__dirname, '..', '..', '..', 'data', 'quran.db');

interface Row {
  surah_number: number;
  verse_number: number;
  uthmani_text: string;
  simple_text: string;
  translation: string | null;
}

let corpus: SearchVerse[];

beforeAll(() => {
  const db = new DatabaseSync(DB_PATH, { readOnly: true });
  // The same SQL `getAllVersesForSearch` sends, so the join and the LEFT are exercised too.
  const rows = db
    .prepare(
      'SELECT v.surah_number, v.verse_number, v.uthmani_text, v.simple_text, t.text AS translation ' +
        'FROM verses v LEFT JOIN translations t ON t.surah_number = v.surah_number ' +
        'AND t.verse_number = v.verse_number AND t.language = ? ' +
        'ORDER BY v.surah_number, v.verse_number'
    )
    .all('en') as unknown as Row[];
  db.close();
  corpus = buildCorpus(
    rows.map((row) => ({
      surah: row.surah_number,
      verse: row.verse_number,
      textUthmani: row.uthmani_text,
      textSimple: row.simple_text,
      translation: row.translation,
    }))
  );
});

/** Anti-vacuity: every count below is meaningless if the corpus did not actually load. */
it('loaded the whole book', () => {
  expect(corpus).toHaveLength(TOTAL_VERSES);
  expect(corpus[0]?.arabicMatch.length).toBeGreaterThan(0);
  expect(corpus[0]?.translationMatch.length).toBeGreaterThan(0);
});

const keysOf = (results: SearchResult[]) => results.map((r) => `${r.entry.surah}:${r.entry.verse}`);

describe('the I/O matrix', () => {
  it('Arabic, bare — matches regardless of the corpus harakat', () => {
    const results = searchVerses(corpus, '\u0627\u0644\u0631\u062d\u0645\u0646');
    expect(results).toHaveLength(48);
    expect(keysOf(results).slice(0, 5)).toEqual(['1:1', '1:3', '2:163', '13:30', '17:110']);
    expect(results.every((r) => r.side === 'arabic')).toBe(true);
  });

  it('Arabic, vocalised — an IDENTICAL result set to the bare query', () => {
    // ⚠️ THE CASE A NORMALISER REGRESSION BREAKS FIRST, and the story names it as such. The
    // assertion is EQUALITY of the two sets, not that each is non-empty: a normaliser applied to
    // the corpus but not to the query still answers plenty of verses for the bare query while
    // answering nothing at all for this one.
    const bare = keysOf(searchVerses(corpus, '\u0627\u0644\u0631\u062d\u0645\u0646'));
    const vocalised = keysOf(
      searchVerses(
        corpus,
        '\u0671\u0644\u0631\u064e\u0651\u062d\u0652\u0645\u064e\u0670\u0646\u0650'
      )
    );
    expect(vocalised).toEqual(bare);
    expect(vocalised).toHaveLength(48);
  });

  it('Arabic, orthographic variants — alif forms, dagger alif and tatweel all fold', () => {
    const bare = keysOf(searchVerses(corpus, '\u0627\u0644\u0631\u062d\u0645\u0646'));
    // Written-out alif, alef wasla, dagger alif, tatweel — the four spellings a reader can type.
    for (const variant of [
      '\u0627\u0644\u0631\u062d\u0645\u0627\u0646',
      '\u0671\u0644\u0631\u062d\u0645\u0646',
      '\u0627\u0644\u0631\u062d\u0645\u0670\u0646',
      '\u0627\u0644\u0631\u0640\u062d\u0645\u0646',
    ]) {
      expect(keysOf(searchVerses(corpus, variant))).toEqual(bare);
    }
  });

  it('Arabic substring — matches INSIDE longer words, which is why it is not a token index', () => {
    const results = searchVerses(corpus, '\u0631\u062d\u0645');
    expect(results).toHaveLength(201);
    expect(keysOf(results).slice(0, 3)).toEqual(['1:1', '1:3', '2:64']);
  });

  it('finds the modern spelling the mushaf does not use — the reason BOTH columns are folded', () => {
    // `al-salah`: 0 hits in `uthmani_text` alone (it writes the word with a waw), 61 through
    // `simple_text`. This is the case that makes a search over the displayed text alone look
    // like a working feature while failing on one of the most-searched words in the book.
    const results = searchVerses(corpus, '\u0627\u0644\u0635\u0644\u0627\u0629');
    expect(results).toHaveLength(61);
    expect(keysOf(results).slice(0, 3)).toEqual(['2:3', '2:43', '2:45']);
  });

  it('keeps `qala` and `qul` apart — the false-positive the alif-deleting trick would cause', () => {
    expect(searchVerses(corpus, '\u0642\u0627\u0644')).toHaveLength(805);
    expect(searchVerses(corpus, '\u0642\u0644')).toHaveLength(621);
  });

  it('Translation — case-insensitive, and the result says which side matched', () => {
    const results = searchVerses(corpus, 'the Ever-Living');
    expect(results).toHaveLength(5);
    expect(keysOf(results)).toEqual(['2:255', '3:2', '20:111', '25:58', '40:65']);
    expect(results.every((r) => r.side === 'translation')).toBe(true);
    // The same phrase without the editorial hyphen is the same query.
    expect(keysOf(searchVerses(corpus, 'the ever living'))).toEqual(keysOf(results));
  });

  it('Translation — reaches through the inline footnote markers the English carries', () => {
    // ⚠️ STORY 8-4 RE-SOURCED THE BUNDLED ENGLISH TO QURANENC's `english_rwwad`, which writes its
    // footnote references INLINE — Al-Fatihah 1:2 is `All praise be to Allah[1], the Lord[2] of
    // the worlds[3],` — and the grant forbids removing them from the text. Without rule 8 this,
    // the sentence as a reader says it, missed 1:2 and answered the other five alone.
    expect(keysOf(searchVerses(corpus, 'All praise be to Allah, the Lord of the worlds'))).toEqual([
      '1:2',
      '6:45',
      '10:10',
      '37:182',
      '39:75',
      '40:65',
    ]);
  });

  it('Translation — reaches through the editorial brackets, typed with or without them', () => {
    // 1,295 rows carry a bracketed insertion. Rule 9 folds the brackets to spaces on BOTH sides,
    // so the phrase pasted from the app and the phrase as a reader says it are one query.
    const bracketed = searchVerses(corpus, '[O Prophet]');
    expect(bracketed).toHaveLength(185);
    expect(keysOf(bracketed).slice(0, 3)).toEqual(['2:4', '2:97', '2:119']);
    expect(keysOf(searchVerses(corpus, 'O Prophet'))).toEqual(keysOf(bracketed));
  });

  it('Mixed / no match — an empty result set, and no throw', () => {
    expect(searchVerses(corpus, 'qwerty')).toEqual([]);
  });

  it('Empty or whitespace query — no search runs', () => {
    expect(searchVerses(corpus, '')).toEqual([]);
    expect(searchVerses(corpus, '   ')).toEqual([]);
    expect(isSearchable('')).toBe(false);
    expect(isSearchable('   ')).toBe(false);
  });

  it('Very short query — nothing runs until the minimum length', () => {
    // One Arabic letter is in 4,607 verses; it is not a search.
    expect(searchVerses(corpus, '\u0628')).toEqual([]);
    expect(isSearchable('\u0628')).toBe(false);
    // ⚠️ MEASURED ON THE NORMALISED FORM: this is ONE letter carrying three marks, so a check on
    // the typed length would call it a four-character query and run it.
    expect(isSearchable('\u0628\u0650\u0651\u06ed')).toBe(false);
    expect(isSearchable('\u0631\u062d\u0645')).toBe(true);
  });

  it('returns results in mushaf order, with no ranking of any kind', () => {
    const results = searchVerses(corpus, '\u0627\u0644\u0631\u062d\u0645\u0646');
    const ordered = [...results].sort(
      (a, b) => a.entry.surah - b.entry.surah || a.entry.verse - b.entry.verse
    );
    expect(keysOf(results)).toEqual(keysOf(ordered));
  });

  it('prefers the Arabic side when a verse matches on both', () => {
    // `Allah` appears in the Arabic of 2:255 and in its English; the row must not be labelled a
    // translation hit. A purely-Latin query can only ever match the translation, so the tie has
    // to be made with a string that exists in both — which `allah` is, transliterated.
    const both = searchVerses(corpus, '\u0627\u0644\u0644\u0647').filter(
      (r) => r.entry.surah === 2 && r.entry.verse === 255
    );
    expect(both).toHaveLength(1);
    expect(both[0]?.side).toBe('arabic');
  });
});

describe('matchedWordRange', () => {
  it('names the WHOLE word a substring landed inside', () => {
    const words = ['\u0627\u0644\u0631\u062d\u0645\u0646', '\u0627\u0644\u0631\u062d\u064a\u0645'];
    expect(matchedWordRange(words, '\u0631\u062d\u0645')).toEqual({ start: 0, end: 1 });
  });

  it('spans every word a multi-word query covers', () => {
    const words = [
      '\u0628\u0633\u0645',
      '\u0627\u0644\u0644\u0647',
      '\u0627\u0644\u0631\u062d\u0645\u0646',
      '\u0627\u0644\u0631\u062d\u064a\u0645',
    ];
    expect(
      matchedWordRange(words, '\u0627\u0644\u0644\u0647 \u0627\u0644\u0631\u062d\u0645\u0646')
    ).toEqual({ start: 1, end: 3 });
  });

  it('reaches across a waqf token, which normalises to nothing but still occupies an index', () => {
    // The mark is its own space-delimited word in `uthmani_text`; the range covers it because the
    // row has to DRAW it between the two words that matched.
    const words = ['\u0627\u0644\u062d\u0645\u062f', '\u06d6', '\u0644\u0644\u0647'];
    expect(matchedWordRange(words, '\u0627\u0644\u062d\u0645\u062f \u0644\u0644\u0647')).toEqual({
      start: 0,
      end: 3,
    });
  });

  it('finds the written-out dagger alif spelling too', () => {
    // `al-rahmaan` typed with an explicit alif, against the mushaf's dagger-alif spelling.
    expect(
      matchedWordRange(
        ['\u0671\u0644\u0631\u064e\u0651\u062d\u0652\u0645\u064e\u0670\u0646\u0650'],
        '\u0627\u0644\u0631\u062d\u0645\u0627\u0646'
      )
    ).toEqual({ start: 0, end: 1 });
  });

  it('answers null when the query is not in THIS text — the cross-orthography case', () => {
    // 2:3's Uthmani spelling of `al-salah` uses a waw; the query came from `simple_text`, so the
    // row degrades to a head snippet with nothing emphasised rather than emphasising the wrong
    // word.
    expect(
      matchedWordRange(
        ['\u0671\u0644\u0635\u064e\u0651\u0644\u064e\u0648\u0670\u0629\u064e'],
        '\u0627\u0644\u0635\u0644\u0627\u0629'
      )
    ).toBeNull();
  });

  it('answers null for a query below the minimum, and for an empty line', () => {
    expect(matchedWordRange(['\u0627\u0644\u0631\u062d\u0645\u0646'], '\u0631')).toBeNull();
    expect(matchedWordRange([], '\u0631\u062d\u0645')).toBeNull();
    expect(matchedWordRange(['\u06d6'], '\u0631\u062d\u0645')).toBeNull();
  });
});

describe('splitWords', () => {
  it('splits on any whitespace run and answers [] for nothing', () => {
    expect(splitWords('  a   b \n c ')).toEqual(['a', 'b', 'c']);
    expect(splitWords('   ')).toEqual([]);
    expect(splitWords('')).toEqual([]);
  });
});
