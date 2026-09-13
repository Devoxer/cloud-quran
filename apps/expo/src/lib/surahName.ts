/**
 * THE door for naming a SURAH in the interface (story 8-1 follow-up).
 *
 * ⚠️ RECITERS HAVE THEIR OWN DOOR AND IT PREDATES THIS ONE: `features/audio/data/reciters.ts`
 * § `reciterDisplayName` / `reciterNameOf`, which was already the single lookup for "the name a
 * surface should print for a voice" and simply learned the same language rule. Do not add a
 * second one here.
 *
 * ── ⚠️ WHY A MODULE AND NOT `?? nameTransliteration` AT EACH SITE ────────────────────────────
 *
 * `SURAH_METADATA` carries THREE names — `nameArabic` (البقرة), `nameTransliteration`
 * (Al-Baqarah) and `nameEnglish` (The Cow) — and until 2026-09-13 every one of the fourteen
 * surfaces that names a surah hardcoded the transliteration. Measured on the owner's iPhone in
 * the Arabic build: the chrome title read `Al-Baqarah`, the welcome-back banner read
 * `كنت تقرأ Al-Baqarah`, and the mushaf page announced `صفحة ٣، سورة Al-Baqarah` to a screen
 * reader that was itself in Arabic. That last one is the worst case for exactly the reader the
 * Arabic interface exists for, and it is invisible to every gate: a data binding has no literal
 * for `lint:i18n` to see, and the transliteration is a perfectly valid string in any language.
 *
 * One door, so "which surfaces show the Arabic name?" has an answer, and so the next surface that
 * names a surah cannot re-introduce the defect by writing the obvious thing.
 *
 * ── ⚠️ THE RULE, WHICH BOTH READING SURFACES NOW SHARE (F3) ──────────────────────────────────
 *
 * **A surface that names a surah prints ONE name, in the UI language.** The mushaf's page header
 * used to print `البقرة · Al-Baqarah` while the chrome title over it printed `Al-Baqarah` — two
 * renderings of the same fact, disagreeing, on one screen. The joined form is gone: under English
 * both say `Al-Baqarah`, under Arabic both say `البقرة`.
 *
 * The ONE exception is the surah INDEX, which is a cross-script picker rather than a label — a
 * reader looks a surah up there by whichever name they know. {@link surahIndexNames} owns that
 * row's three slots so the exception is a named function rather than a habit, and it still prints
 * each script exactly once: the UI language's name as the title, the other script in the
 * supporting line, and no third copy in the trailing slot.
 *
 * ── ⚠️ SCRIPT, NOT DIRECTION ─────────────────────────────────────────────────────────────────
 *
 * Everything here keys off {@link isArabicUi} — the committed UI LANGUAGE — never `isRTL()`,
 * which is the process's LAYOUT direction and is floored to `false` on web. A web reader on
 * Arabic gets Arabic copy in an LTR layout, so keying the name off direction would print
 * `Al-Baqarah` inside an Arabic interface on one platform only. See `lib/rtl.ts`.
 */

import { isArabicUi } from './rtl';

/**
 * The shape a surah must have to be named. Structural rather than `SurahMetadata`, because the
 * reading surface holds a row that came out of `lib/quranDb.ts` (mapped from the SQLite columns)
 * while everything else holds a `quran-data` table entry — the same three fields, two origins.
 */
export interface NameableSurah {
  nameArabic: string;
  nameEnglish: string;
  nameTransliteration: string;
}

/**
 * The ONE name a surface prints for a surah: `البقرة` under Arabic, `Al-Baqarah` otherwise.
 *
 * Returns `null` for a surah the table cannot name, so a caller can choose its own fallback —
 * the number, or a translated `Surah {{n}}`. It deliberately does not invent one: a bare `''`
 * inside an interpolated sentence reads as a missing word rather than as missing data.
 */
export function surahDisplayName(surah: NameableSurah | null | undefined): string | null {
  if (!surah) return null;
  return isArabicUi() ? surah.nameArabic : surah.nameTransliteration;
}

/**
 * The three slots of a surah row in the INDEX — the one surface that shows both scripts.
 *
 * - `title` — the name in the UI language (the same answer {@link surahDisplayName} gives).
 * - `gloss` — the supporting descriptor: the English MEANING under a Latin-script UI, the
 *   romanization under an Arabic one. ⚠️ Not the meaning under Arabic, because `quran-data` has
 *   no Arabic gloss and `The Cow` inside `البقرة · ٢٨٦ آية · مدنية` is the mixed-script defect
 *   again. The romanization is what an Arabic reader actually cross-references (a search, a file
 *   name, an English-language reference), which the English meaning is not.
 * - `trailing` — the other script's name, or `null` when the title already IS that script. Under
 *   Arabic the title is `البقرة` and the gloss is `Al-Baqarah`, so a trailing slot could only
 *   repeat one of them.
 *
 * So either language shows each script exactly once, and no row mixes them inside one string.
 */
export function surahIndexNames(surah: NameableSurah): {
  title: string;
  gloss: string;
  trailing: string | null;
} {
  return isArabicUi()
    ? { title: surah.nameArabic, gloss: surah.nameTransliteration, trailing: null }
    : {
        title: surah.nameTransliteration,
        gloss: surah.nameEnglish,
        trailing: surah.nameArabic,
      };
}
