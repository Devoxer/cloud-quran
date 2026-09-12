/**
 * The mushaf pager's index maths — pure, direction-aware, and deliberately NOT in the route
 * (story 8-1).
 *
 * ⚠️ REVERSE ONLY IN LTR. In a left-to-right layout the data is `[604 … 1]`: page 1 sits at index
 * 603, and advancing a finger left-to-right lands on a LOWER index = a HIGHER page — the
 * right-to-left page turn, on every platform. (The pre-fork ran `inverted` on native and reversed
 * data on web because `inverted` broke web scroll/drag; one strategy everywhere replaced that.)
 *
 * Under `I18nManager.isRTL` FlashList is ALREADY doing it: `RecyclerView.js` computes
 * `isHorizontalRTL = I18nManager.isRTL && horizontal`, anchors the list at the right edge and
 * re-aims every offset through `adjustOffsetForRTL`. So a rising index already walks leftward
 * through the book, and reversing the data on top of that is the double inversion — measured on a
 * Pixel 9 Pro, 2026-09-12: it turns pages BACKWARDS in Arabic.
 *
 * ⚠️ THE DIRECTION IS A PARAMETER BECAUSE A DEVICE CAN ONLY BE SMOKED IN ONE DIRECTION AT A TIME.
 * Turning the app to Arabic means restarting it under `forceRTL`, so the English pager and the
 * Arabic pager are never both observable in one session; whichever is smoked, the other's
 * regression is carried by `mushaf-pager-direction.test.ts` or by nothing.
 *
 * It lives beside `MushafPage` rather than in `app/(tabs)/index.tsx` so that testing two array
 * lookups does not mean evaluating the whole home surface — FlashList, the audio store, the sync
 * client and the Quran database included.
 */

import { TOTAL_PAGES } from 'quran-data';

/** All 604 pages, REVERSED. Index i holds page 604 − i. */
const PAGE_DATA_LTR: number[] = Array.from({ length: TOTAL_PAGES }, (_, i) => TOTAL_PAGES - i);

/** All 604 pages in reading order. Index i holds page i + 1. */
const PAGE_DATA_RTL: number[] = Array.from({ length: TOTAL_PAGES }, (_, i) => i + 1);

/**
 * The pager's data for a layout direction. Returns one of two module constants — never a fresh
 * array, so a caller needs no memo to keep FlashList's `data` identity stable.
 */
export function pagerData(rtl: boolean): number[] {
  return rtl ? PAGE_DATA_RTL : PAGE_DATA_LTR;
}

/** The list index a page sits at, in the data {@link pagerData} returns for that direction. */
export function pageToIndex(page: number, rtl: boolean): number {
  return rtl ? page - 1 : TOTAL_PAGES - page;
}
