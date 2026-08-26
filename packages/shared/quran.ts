/**
 * Cloud Quran's own domain constants and helpers.
 *
 * ⚠️ Restored by the story 5-1 code review. These lived at `packages/shared/src/{arabicNumbers,
 * constants}.ts` before the seed replaced `packages/shared` wholesale with wisdom-fruits' content
 * contract. The story's Code Map sanctioned bringing that package over whole ("stripping it is a
 * later story's problem") and its "Kept from Cloud Quran" list did not mention these files — so
 * they went out with the domain deletion and nothing noticed, because nothing imports them yet.
 * Epic 6 does: verse numbers render in Arabic-Indic digits and the reader's font-size control is
 * bounded by MIN/MAX.
 */

const ARABIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

/**
 * Render a number in Arabic-Indic digits (٠-٩), as the mushaf does.
 * Sign and fraction are dropped: verse, juz' and page numbers are whole and positive.
 */
export function toArabicNumber(num: number): string {
  return String(Math.trunc(Math.abs(num)))
    .split('')
    .map((digit) => ARABIC_DIGITS[parseInt(digit, 10)])
    .join('');
}

/** Structural totals of the Quran. Fixed quantities, not configuration. */
export const TOTAL_SURAHS = 114;
export const TOTAL_VERSES = 6236;
export const TOTAL_PAGES = 604;
export const TOTAL_JUZS = 30;

/** Alias kept because the pre-seed tree exported both names. */
export const SURAH_COUNT = 114;

/** Reader font-size bounds, in points. */
export const MAX_FONT_SIZE = 44;
export const MIN_FONT_SIZE = 20;
export const DEFAULT_FONT_SIZE = 28;
