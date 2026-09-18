/**
 * THE search normaliser — one function, applied to the corpus and to the query alike (story 6-7).
 *
 * ⚠️ THE SYMMETRY IS THE FEATURE, NOT AN IMPLEMENTATION DETAIL. The failure mode of every
 * hand-rolled Arabic search is a normaliser applied to one side only: the corpus is folded, the
 * query is not, and a reader who types `ٱلرَّحْمَٰن` — which is what a copy-paste from any mushaf
 * app gives them — silently gets nothing. Both sides go through {@link normalizeForSearch}, and
 * `search.test.ts` asserts the vocalised and bare queries return sets that are EQUAL rather than
 * merely non-empty.
 *
 * ⚠️ A DIFFERENT JOB FROM `constants/arabic.ts` § `stripDisplayMarks`, AND THE TWO MUST NOT MERGE.
 * That one removes U+06DF because the KFGQPC face draws it as a solid disc — a font defect, on the
 * DISPLAY path, over text that is still the Quran. This one destroys orthography on purpose and
 * its output is never rendered: it exists only to be compared. Overloading either would mean a
 * font fix changing what search finds, or a search rule changing what the reader sees.
 *
 * ⚠️ NOTHING HERE MUTATES QURAN TEXT. The normalised form is a local string built from a row the
 * `query_only` connection handed over, compared, and thrown away. Nothing persisted, nothing
 * synced, nothing hashed sees it (`lib/quranDb.ts`'s header carries the same guarantee).
 *
 * ── The rules, each with the reason it exists and the corpus measurement behind it ───────────
 *
 * Every count below was measured against the shipped `apps/expo/src/data/quran.db` on 2026-09-17
 * by enumerating the codepoints of all 6,236 rows of both text columns. They are here so a future
 * reader can tell a rule that is carrying weight from one that was copied off a blog post.
 *
 *  1. **Tatweel** (U+0640, 812 in `uthmani_text`, 0 in `simple_text`) — a decorative letter
 *     stretcher with no phonetic value. Nobody types it.
 *  2. **Harakat and the combining marks** (U+064B–U+065F). The corpus is fully vocalised —
 *     122,948 fathas alone — and a reader types bare consonants. ⚠️ THE RANGE IS WIDER THAN
 *     "the eight harakat" ON PURPOSE: `uthmani_text` carries 5,376 U+0653 (maddah above) and 773
 *     U+0654 (hamza above), both OUTSIDE U+064B–U+0652. Stopping at U+0652 leaves `ءَآمَنُوا۟`
 *     holding a maddah that no query will ever carry, so the verse is unreachable.
 *  3. **The Quranic annotation marks** (U+06D6–U+06ED, ~11,000 occurrences). Waqf signs, the
 *     sajdah mark and the small superscript letters: recitation notation printed alongside the
 *     text, not letters of it. U+06DF — the one `stripDisplayMarks` removes for a font reason —
 *     falls inside this range, so the two agree here by accident rather than by coupling.
 *  4. **The dagger alif** (U+0670, 9,726 + 3,218). ⚠️ IT HAS TWO MODERN READINGS AND THAT IS WHY
 *     {@link searchForms} EXISTS — see its docblock; this function takes one of them.
 *  5. **The alif forms** `آ أ إ ٱ` → `ا`. The hamza seat and the wasla are orthographic
 *     decisions a reader does not reproduce: `إبراهيم` and `ابراهيم` are one name.
 *  6. **Alif maqsura** `ى` → `ي` (6,603 + 2,595). `موسى` and `موسي` are the same prophet, and
 *     which one a keyboard produces depends on the keyboard.
 *  7. **Ta marbuta** `ة` → `ه` (2,344). ⚠️ A JUDGEMENT, AND A DELIBERATE ONE (the story's design
 *     note): a reader typing `رحمه` should find `رحمة`. The cost is a handful of false positives
 *     — `رحمه` "his mercy" now also matches `رحمة` "mercy" — which a reader scanning a result
 *     list absorbs without noticing. Fold it, and say so.
 *  8. **Case** — the bundled translation is English prose; `the ever-living` must find
 *     `the Ever-Living`. A no-op on Arabic, which is caseless.
 *  9. **Everything that is not a letter or a digit becomes a SPACE** (see {@link SEPARATOR}).
 * 10. **Whitespace collapses and trims.** Rules 1–3 DELETE rather than space, so a stripped mark
 *     cannot split a word — but `uthmani_text` writes its waqf signs as standalone
 *     space-delimited tokens, so rule 3 leaves real double spaces behind. Without the collapse a
 *     two-word query straddling one of them matches nothing.
 */

/** ARABIC LETTER SUPERSCRIPT ALEF — the one rule with two answers ({@link searchForms}). */
const DAGGER_ALIF = /\u0670/g;

/** The letter the alif forms fold onto, and the dagger alif's second reading. */
export const PLAIN_ALIF = '\u0627';

/**
 * Rules 1–3 as one deletion. ⚠️ THE ORDER MATTERS: this runs BEFORE the letter folds, so a mark
 * sitting on a letter about to be folded cannot survive the fold and reappear as a difference.
 */
const DROPPED_MARKS = /[\u0640\u064B-\u065F\u06D6-\u06ED]/g;

/** Rule 5 — `آ أ إ ٱ`, every alif a keyboard or a mushaf can produce. */
const ALIF_FORMS = /[\u0622\u0623\u0625\u0671]/g;

/**
 * Rule 5a — the HAMZA CARRIERS, the other half of rule 5.
 *
 * ⚠️ WITHOUT THIS, THE FOLD IS ONLY HALF DONE AND THE HALF THAT IS MISSING IS THE ONE READERS
 * TYPE. Rule 5 folds the alif carriers (`آ أ إ ٱ`), so `أولئك` already loses its opening hamza —
 * but `ؤ` and `ئ` survive, and those are exactly the letters an ordinary typist omits: `مومنون`
 * for `مؤمنون`, `مسولون` for `مسؤولون`. The carrier is a spelling convention about where the
 * hamza SITS, not a distinct consonant, so it folds onto the letter underneath it: `ؤ` → `و`,
 * `ئ` → `ي`. The bare hamza `ء` has no carrier to fall back to and is simply dropped, which is
 * symmetric: `شيء` and `شي` become one query on both sides.
 *
 * This does NOT rescue an inserted alif (`اولايك` for `أولئك`) — that needs the alif-deleting
 * trick `searchForms` measured and rejected for merging `قال` with `قل`. Do not claim it does.
 */
const HAMZA_ON_WAW = /\u0624/g;
const HAMZA_ON_YEH = /\u0626/g;
const BARE_HAMZA = /\u0621/g;

/**
 * Rule 5b — the PERSIAN/URDU letters an Arabic-adjacent keyboard emits.
 *
 * ⚠️ THESE ARE NOT EXOTIC — they are what a Farsi, Urdu or Pashto layout produces for the letters
 * a reader thinks of as `ي` and `ك`, and those layouts are common wherever this app will be read.
 * They matter here because they fall OUTSIDE rule 9's `U+0621–U+064A` keep-range: left unfolded
 * they are not letters to the separator rule, so it turns them into SPACES and shatters the query
 * into fragments that match nothing. The failure is indistinguishable from "no such ayah", which
 * is why it has to be fixed here rather than in the keep-range.
 *
 * Folded BEFORE rule 9 runs, so the results land inside the kept range.
 */
const FARSI_YEH = /\u06CC/g;
const KEHEH = /\u06A9/g;

/** Rule 6 — ARABIC LETTER ALEF MAKSURA. */
const ALIF_MAQSURA = /\u0649/g;

/** Rule 7 — ARABIC LETTER TEH MARBUTA. See the header: this one is a judgement. */
const TEH_MARBUTA = /\u0629/g;

/**
 * Rule 9 — every run of characters that is not a letter or a digit, folded to ONE space.
 *
 * ⚠️ WHAT THIS BUYS IS THE ENGLISH SIDE, AND IT IS NOT COSMETIC. The bundled translation is
 * Sahih International, which marks its editorial insertions with square brackets: 3,019 of the
 * 6,236 rows carry a `[` — `"[All] praise is [due] to Allah, Lord of the worlds"`. Without this
 * rule a reader typing that sentence as they read it matches nothing on nearly half the book.
 * 9,980 commas and 1,130 hyphens are the same problem one punctuation mark down: `Ever-Living`
 * and `Ever Living` must be one query, and they are, because BOTH sides pass through here.
 *
 * ⚠️ IT IS AN EXPLICIT CHARACTER CLASS RATHER THAN `\p{L}`, AND THAT IS A RUNTIME CONSTRAINT.
 * Unicode property escapes are not something to rely on in Hermes; an unsupported `\p{…}` is a
 * SyntaxError at module load, which on this path would take the whole search feature down on
 * device while every test in Node stayed green.
 *
 * The kept set is ASCII alphanumerics, Latin-1/Extended letters (so a reader typing `é` keeps a
 * word whole) and U+0621–U+064A — which, by the time this rule runs, is every Arabic letter that
 * can still be here: rules 4–7 have already folded U+0649, U+0629 and U+0671 down into it.
 * Arabic punctuation and Arabic-Indic digits fall outside it and become spaces, which is right.
 */
const SEPARATOR = /[^0-9A-Za-z\u00C0-\u024F\u0621-\u064A]+/g;

/** Rule 10. */
const WHITESPACE = /\s+/g;

/**
 * Fold one string — corpus text or a reader's query — into the form the two are compared in.
 *
 * @param daggerAlif what rule 4 writes the dagger alif as: `''` (the default, the spelling
 *   `الرحمن`) or {@link PLAIN_ALIF} (the spelling `الرحمان`). Callers want {@link searchForms}
 *   rather than this argument; it exists so both readings come out of ONE rule table.
 */
export function normalizeForSearch(text: string, daggerAlif: '' | typeof PLAIN_ALIF = ''): string {
  return text
    .replace(DROPPED_MARKS, '')
    .replace(DAGGER_ALIF, daggerAlif)
    .replace(ALIF_FORMS, PLAIN_ALIF)
    .replace(HAMZA_ON_WAW, '\u0648')
    .replace(HAMZA_ON_YEH, '\u064A')
    .replace(BARE_HAMZA, '')
    .replace(FARSI_YEH, '\u064A')
    .replace(KEHEH, '\u0643')
    .replace(ALIF_MAQSURA, '\u064A')
    .replace(TEH_MARBUTA, '\u0647')
    .toLowerCase()
    .replace(SEPARATOR, ' ')
    .replace(WHITESPACE, ' ')
    .trim();
}

/**
 * The form(s) a piece of CORPUS text has to be held in, because the dagger alif has two modern
 * spellings and the reader picks one.
 *
 * ⚠️ THIS IS THE ONE RULE THAT CANNOT BE SYMMETRIC, AND THE ASYMMETRY IS IN THE CORPUS, NOT IN
 * THE RULE. `ٱلرَّحْمَٰن` is written `الرحمن` by most readers and `الرحمان` by some; the mushaf
 * writes neither, it writes a dagger alif. Deleting the dagger makes the first spelling work and
 * the second find nothing; folding it to `ا` does the exact reverse. There is no single answer,
 * so the CORPUS carries both readings and the QUERY is normalised once — a reader types one
 * spelling and we hold the other for them.
 *
 * ⚠️ THE ALTERNATIVE — DELETING EVERY PLAIN ALIF, THE USUAL "alif is optional" TRICK — WAS TRIED
 * AND MEASURED AND IS WRONG HERE. It does make all five spellings agree, at 56 verses each. It
 * also collapses `قال` ("he said", 805 verses) and `قل` ("Say:", 621 verses) into one token of
 * 1,357 verses — two of the most common words in the Quran, merged, so a reader searching for the
 * command `قل` is handed every narrative `قال` in the book. Measured 2026-09-17. Do not re-derive
 * it: the dual reading costs ~50% more normalised strings and keeps those two words apart.
 *
 * Returns one entry when the text holds no dagger alif — which is most of it.
 */
export function searchForms(text: string): string[] {
  const deleted = normalizeForSearch(text, '');
  const spelled = normalizeForSearch(text, PLAIN_ALIF);
  return deleted === spelled ? [deleted] : [deleted, spelled];
}

/**
 * The separator that joins a verse's forms into ONE matchable string, so a match is a single
 * `indexOf` per side rather than one per form.
 *
 * ⚠️ IT MUST BE SOMETHING NO NORMALISED STRING CAN CONTAIN, or a query could match ACROSS two
 * forms and return a verse that contains neither. `\n` qualifies by construction: rule 10 folds
 * every whitespace run to a single U+0020, so a newline cannot survive normalisation on either
 * side.
 */
export const FORM_SEPARATOR = '\n';

/** Join a text's forms into the one string {@link FORM_SEPARATOR} makes safe to scan. */
export function searchableText(...texts: string[]): string {
  const forms = new Set<string>();
  for (const text of texts) {
    for (const form of searchForms(text)) {
      if (form.length > 0) forms.add(form);
    }
  }
  return [...forms].join(FORM_SEPARATOR);
}
