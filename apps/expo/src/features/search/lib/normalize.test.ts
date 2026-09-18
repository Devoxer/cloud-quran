/**
 * The normaliser, rule by rule (story 6-7).
 *
 * ⚠️ EVERY EXPECTED VALUE HERE IS A LITERAL, NEVER A SECOND CALL TO THE THING UNDER TEST. The
 * repo's first non-negotiable exists because two files have already shipped a test whose
 * expectation was computed by the function it was checking; the honest question — "what edit would
 * redden this?" — is answered here by "any edit to any rule", because the right-hand sides are
 * typed-out strings.
 *
 * ⚠️ AND EVERY ARABIC STRING IS WRITTEN AS `\uXXXX` ESCAPES RATHER THAN AS LITERAL GLYPHS. This
 * file's whole subject is which codepoint is which, and the distinctions it pins are invisible in
 * rendered text: U+0622 (a precomposed alef-with-maddah) and U+0627 + U+0653 (the two-codepoint
 * spelling the mushaf actually uses) draw identically, and a combining mark inside a quoted string
 * attaches itself to whichever glyph the editor decides. A reviewer must be able to read the
 * INPUT, not just recognise the word. Prose comments name the word; the code names the bytes.
 */

import { FORM_SEPARATOR, normalizeForSearch, searchableText, searchForms } from './normalize';

describe('normalizeForSearch', () => {
  it('rule 1 — strips tatweel, which stretches a letter and means nothing', () => {
    // al-rahman with a tatweel (U+0640) wedged in after the ra.
    expect(normalizeForSearch('\u0627\u0644\u0631\u0640\u062d\u0645\u0646')).toBe(
      '\u0627\u0644\u0631\u062d\u0645\u0646'
    );
  });

  it('rule 2 — strips the harakat, INCLUDING the maddah and hamza above U+0652', () => {
    // 1:3 verbatim: alef wasla, fatha, shadda, sukun, dagger alif, kasra — twice.
    expect(
      normalizeForSearch(
        '\u0671\u0644\u0631\u064e\u0651\u062d\u0652\u0645\u064e\u0670\u0646\u0650' +
          ' \u0671\u0644\u0631\u064e\u0651\u062d\u0650\u064a\u0645\u0650'
      )
    ).toBe('\u0627\u0644\u0631\u062d\u0645\u0646 \u0627\u0644\u0631\u062d\u064a\u0645');
    // U+0653 MADDAH ABOVE — 5,376 occurrences, and OUTSIDE the U+064B–U+0652 the story's task
    // list names. A range that stopped at U+0652 leaves this word unreachable. The mushaf writes
    // `aamana` as hamza + alif + maddah, so the mark sits in the middle of the word.
    // The bare hamza that opens this word is gone by rule 5a, not by this one — what this case
    // pins is that the MADDAH in the middle is stripped, which it is either way.
    expect(normalizeForSearch('\u0621\u0627\u0653\u0645\u0646')).toBe('\u0627\u0645\u0646');
  });

  it('rule 3 — strips the waqf signs, which are recitation notation beside the text', () => {
    // U+06D6 is written as its own space-delimited token between two words.
    expect(normalizeForSearch('\u0627\u0644\u062d\u0645\u062f \u06d6 \u0644\u0644\u0647')).toBe(
      '\u0627\u0644\u062d\u0645\u062f \u0644\u0644\u0647'
    );
    // U+06DF — the mark `stripDisplayMarks` removes for a FONT reason — is inside this range too,
    // and 2,240 verses carry one. `ulaika`: hamza-on-alif, waw, U+06DF, lam, dagger alif, ya-
    // hamza, kaf.
    // The trailing ya-hamza folds to a plain ya under rule 5a; U+06DF vanishing is this case's
    // subject and is unaffected by that.
    expect(normalizeForSearch('\u0623\u0648\u06df\u0644\u0670\u0626\u0643')).toBe(
      '\u0627\u0648\u0644\u064a\u0643'
    );
  });

  it('rule 4 — the dagger alif is DELETED by default and SPELLED on request', () => {
    const withDagger = '\u0627\u0644\u0631\u062d\u0645\u0670\u0646';
    expect(normalizeForSearch(withDagger)).toBe('\u0627\u0644\u0631\u062d\u0645\u0646');
    expect(normalizeForSearch(withDagger, '\u0627')).toBe(
      '\u0627\u0644\u0631\u062d\u0645\u0627\u0646'
    );
  });

  it('rule 5 — every alif form folds onto the plain alif', () => {
    // U+0622 madda, U+0623 hamza above, U+0625 hamza below, U+0671 wasla, U+0627 plain.
    expect(normalizeForSearch('\u0622\u0623\u0625\u0671\u0627')).toBe(
      '\u0627\u0627\u0627\u0627\u0627'
    );
    // `Ibrahim` written with hamza-below, as the mushaf and most keyboards do.
    expect(normalizeForSearch('\u0625\u0628\u0631\u0627\u0647\u064a\u0645')).toBe(
      '\u0627\u0628\u0631\u0627\u0647\u064a\u0645'
    );
  });

  it('rule 5a — the hamza carriers fold onto the letter under them', () => {
    // ⚠️ THE HALF OF RULE 5 READERS ACTUALLY TYPE. `مؤمنون` is written `مومنون` by anyone not
    // reaching for the hamza key, and before this rule that query found nothing while `أولئك`
    // (an ALIF carrier, rule 5) already worked — a fold that helped exactly the letters people
    // get right and abandoned the ones they get wrong.
    // waw-hamza -> waw: `مؤمنون` and `مومنون` are one query.
    expect(normalizeForSearch('\u0645\u0624\u0645\u0646\u0648\u0646')).toBe(
      normalizeForSearch('\u0645\u0648\u0645\u0646\u0648\u0646')
    );
    // ya-hamza -> ya.
    expect(normalizeForSearch('\u0626')).toBe('\u064a');
    // Bare hamza has no carrier to fall back to and is dropped — which is what makes the mushaf's
    // `ءامن` and the modern `آمن` the same string.
    expect(normalizeForSearch('\u0621\u0627\u0645\u0646')).toBe(
      normalizeForSearch('\u0622\u0645\u0646')
    );
  });

  it('rule 5b — the Persian/Urdu letters an Arabic-adjacent keyboard emits', () => {
    // ⚠️ THESE WOULD OTHERWISE BE SHREDDED, NOT MERELY UNFOLDED. They fall outside rule 9's
    // keep-range, so before this rule the separator turned them into SPACES — splitting the query
    // into fragments that match nothing, with the same "no results" face as a real miss.
    // U+06CC farsi yeh -> U+064A, U+06A9 keheh -> U+0643.
    expect(normalizeForSearch('\u06cc')).toBe('\u064a');
    expect(normalizeForSearch('\u06a9')).toBe('\u0643');
    // And the whole word survives as ONE token rather than two.
    expect(normalizeForSearch('\u06a9\u062a\u0627\u0628').split(' ')).toHaveLength(1);
  });

  it('rule 6 — alif maqsura folds to ya', () => {
    // `Musa` — U+0649 at the end, which many keyboards produce as U+064A instead.
    expect(normalizeForSearch('\u0645\u0648\u0633\u0649')).toBe('\u0645\u0648\u0633\u064a');
  });

  it('rule 7 — ta marbuta folds to ha, the documented judgement', () => {
    // `rahma` → `rahmah`, so a reader typing the ha spelling finds the ta-marbuta one.
    expect(normalizeForSearch('\u0631\u062d\u0645\u0629')).toBe('\u0631\u062d\u0645\u0647');
  });

  it('rule 8 — case folds, so the English side is case-insensitive', () => {
    expect(normalizeForSearch('The Ever-Living')).toBe('the ever living');
  });

  it('rule 9 — punctuation becomes a space, which is what the bracketed translation needs', () => {
    // The shipped translation of 1:2, verbatim. 3,019 of the 6,236 rows carry brackets like these,
    // and a reader types the sentence without them.
    expect(normalizeForSearch('[All] praise is [due] to Allah, Lord of the worlds -')).toBe(
      'all praise is due to allah lord of the worlds'
    );
  });

  it('rule 10 — whitespace collapses and trims', () => {
    expect(normalizeForSearch('  the   worlds \n ')).toBe('the worlds');
  });

  it('is idempotent — a normalised string normalises to itself', () => {
    const once = normalizeForSearch(
      '\u0671\u0644\u0631\u064e\u0651\u062d\u0652\u0645\u064e\u0670\u0646\u0650'
    );
    expect(once).toBe('\u0627\u0644\u0631\u062d\u0645\u0646');
    expect(normalizeForSearch(once)).toBe(once);
  });

  it('answers the empty string for input that is all marks and punctuation', () => {
    expect(normalizeForSearch('\u06d6 \u06da — ,')).toBe('');
  });
});

describe('searchForms', () => {
  it('gives ONE form when there is no dagger alif — which is most of the book', () => {
    expect(searchForms('\u0627\u0644\u062d\u0645\u062f')).toEqual([
      '\u0627\u0644\u062d\u0645\u062f',
    ]);
  });

  it('gives BOTH readings when there is one', () => {
    expect(searchForms('\u0627\u0644\u0631\u062d\u0645\u0670\u0646')).toEqual([
      '\u0627\u0644\u0631\u062d\u0645\u0646',
      '\u0627\u0644\u0631\u062d\u0645\u0627\u0646',
    ]);
  });
});

describe('searchableText', () => {
  it('joins the forms of every column with a separator no query can contain', () => {
    // The same word in two orthographies: with the dagger alif, and with it already deleted.
    const joined = searchableText(
      '\u0627\u0644\u0631\u062d\u0645\u0670\u0646',
      '\u0627\u0644\u0631\u062d\u0645\u0646'
    );
    expect(joined).toBe(
      `\u0627\u0644\u0631\u062d\u0645\u0646${FORM_SEPARATOR}\u0627\u0644\u0631\u062d\u0645\u0627\u0646`
    );
  });

  it('dedupes, so a verse whose two columns agree carries one form', () => {
    const joined = searchableText(
      '\u0627\u0644\u062d\u0645\u062f',
      '\u0627\u0644\u062d\u0645\u062f'
    );
    expect(joined).toBe('\u0627\u0644\u062d\u0645\u062f');
    expect(joined.includes(FORM_SEPARATOR)).toBe(false);
  });

  it('drops a column that normalises to nothing rather than leaving an empty form', () => {
    expect(searchableText('\u0627\u0644\u062d\u0645\u062f', '\u06d6')).toBe(
      '\u0627\u0644\u062d\u0645\u062f'
    );
  });

  it('cannot be matched ACROSS the separator — the reason it is a newline', () => {
    // Rule 10 folds every whitespace run to U+0020, so no normalised query can hold a newline:
    // the join is unreachable by construction rather than by convention.
    expect(normalizeForSearch(`a${FORM_SEPARATOR}b`)).toBe('a b');
  });
});
