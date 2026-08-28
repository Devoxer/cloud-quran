/**
 * Juz' and Hizb boundary metadata — Tanzil.net segmentation, VERSE PAIRS ONLY.
 *
 * ⚠️ THERE IS NO STORED PAGE COLUMN, AND THAT IS A FIX, NOT AN OMISSION (story 6-3). This file
 * used to carry a `startPage` per entry, credited to "King Fahd Complex Madinah Mushaf page
 * numbers". It was nothing of the sort: 56 of the 60 hizb values were exactly `10n − 8` and 27 of
 * the 30 juz' values exactly `20n − 18` — an arithmetic ladder, hand-nudged in four places to
 * meet the juz' column. The real page gaps between hizb boundaries (from the verse↔page map) run
 * 7–13 pages; the stored column's ran 9–11, which no printed mushaf does. Measured against the
 * map regenerated and verified in story 6-2, the stored column mislabelled the hizb on 27 of 604
 * page headers and the juz' on 1.
 *
 * So the page is DERIVED, never stored: `getPageForVerse(startSurah, startVerse)` is the one
 * answer to "which page does this boundary sit on", and the two halves agree by construction.
 * `juz-hizb-metadata.test.ts` pins that the stored column has not come back.
 *
 * ⚠️ THE VERSE PAIRS ARE THE RELIGIOUS SEGMENTATION AND ARE UNTOUCHED — which verse begins which
 * juz' or hizb is exactly as Tanzil states it. Only the fabricated page column was removed.
 */

import { getPageForVerse } from './verse-page-map';

export interface JuzMetadata {
  number: number; // 1-30
  startSurah: number; // Surah number where juz starts
  startVerse: number; // Verse number where juz starts
}

export interface HizbMetadata {
  number: number; // 1-60
  juz: number; // Which juz this hizb belongs to (1-30)
  startSurah: number;
  startVerse: number;
}

// 30 Juz boundaries — Tanzil.net segmentation
export const JUZ_METADATA: JuzMetadata[] = [
  { number: 1, startSurah: 1, startVerse: 1 },
  { number: 2, startSurah: 2, startVerse: 142 },
  { number: 3, startSurah: 2, startVerse: 253 },
  { number: 4, startSurah: 3, startVerse: 93 },
  { number: 5, startSurah: 4, startVerse: 24 },
  { number: 6, startSurah: 4, startVerse: 148 },
  { number: 7, startSurah: 5, startVerse: 83 },
  { number: 8, startSurah: 6, startVerse: 111 },
  { number: 9, startSurah: 7, startVerse: 88 },
  { number: 10, startSurah: 8, startVerse: 41 },
  { number: 11, startSurah: 9, startVerse: 93 },
  { number: 12, startSurah: 11, startVerse: 6 },
  { number: 13, startSurah: 12, startVerse: 53 },
  { number: 14, startSurah: 15, startVerse: 1 },
  { number: 15, startSurah: 17, startVerse: 1 },
  { number: 16, startSurah: 18, startVerse: 75 },
  { number: 17, startSurah: 21, startVerse: 1 },
  { number: 18, startSurah: 23, startVerse: 1 },
  { number: 19, startSurah: 25, startVerse: 21 },
  { number: 20, startSurah: 27, startVerse: 56 },
  { number: 21, startSurah: 29, startVerse: 46 },
  { number: 22, startSurah: 33, startVerse: 31 },
  { number: 23, startSurah: 36, startVerse: 28 },
  { number: 24, startSurah: 39, startVerse: 32 },
  { number: 25, startSurah: 41, startVerse: 47 },
  { number: 26, startSurah: 46, startVerse: 1 },
  { number: 27, startSurah: 51, startVerse: 31 },
  { number: 28, startSurah: 58, startVerse: 1 },
  { number: 29, startSurah: 67, startVerse: 1 },
  { number: 30, startSurah: 78, startVerse: 1 },
];

// 60 Hizb boundaries — each juz has 2 hizbs
export const HIZB_METADATA: HizbMetadata[] = [
  { number: 1, juz: 1, startSurah: 1, startVerse: 1 },
  { number: 2, juz: 1, startSurah: 2, startVerse: 75 },
  { number: 3, juz: 2, startSurah: 2, startVerse: 142 },
  { number: 4, juz: 2, startSurah: 2, startVerse: 203 },
  { number: 5, juz: 3, startSurah: 2, startVerse: 253 },
  { number: 6, juz: 3, startSurah: 3, startVerse: 15 },
  { number: 7, juz: 4, startSurah: 3, startVerse: 93 },
  { number: 8, juz: 4, startSurah: 3, startVerse: 171 },
  { number: 9, juz: 5, startSurah: 4, startVerse: 24 },
  { number: 10, juz: 5, startSurah: 4, startVerse: 88 },
  { number: 11, juz: 6, startSurah: 4, startVerse: 148 },
  { number: 12, juz: 6, startSurah: 5, startVerse: 27 },
  { number: 13, juz: 7, startSurah: 5, startVerse: 83 },
  { number: 14, juz: 7, startSurah: 6, startVerse: 36 },
  { number: 15, juz: 8, startSurah: 6, startVerse: 111 },
  { number: 16, juz: 8, startSurah: 7, startVerse: 1 },
  { number: 17, juz: 9, startSurah: 7, startVerse: 88 },
  { number: 18, juz: 9, startSurah: 7, startVerse: 189 },
  { number: 19, juz: 10, startSurah: 8, startVerse: 41 },
  { number: 20, juz: 10, startSurah: 9, startVerse: 34 },
  { number: 21, juz: 11, startSurah: 9, startVerse: 93 },
  { number: 22, juz: 11, startSurah: 10, startVerse: 26 },
  { number: 23, juz: 12, startSurah: 11, startVerse: 6 },
  { number: 24, juz: 12, startSurah: 11, startVerse: 83 },
  { number: 25, juz: 13, startSurah: 12, startVerse: 53 },
  { number: 26, juz: 13, startSurah: 13, startVerse: 19 },
  { number: 27, juz: 14, startSurah: 15, startVerse: 1 },
  { number: 28, juz: 14, startSurah: 16, startVerse: 30 },
  { number: 29, juz: 15, startSurah: 17, startVerse: 1 },
  { number: 30, juz: 15, startSurah: 17, startVerse: 99 },
  { number: 31, juz: 16, startSurah: 18, startVerse: 75 },
  { number: 32, juz: 16, startSurah: 19, startVerse: 59 },
  { number: 33, juz: 17, startSurah: 21, startVerse: 1 },
  { number: 34, juz: 17, startSurah: 22, startVerse: 19 },
  { number: 35, juz: 18, startSurah: 23, startVerse: 1 },
  { number: 36, juz: 18, startSurah: 24, startVerse: 21 },
  { number: 37, juz: 19, startSurah: 25, startVerse: 21 },
  { number: 38, juz: 19, startSurah: 26, startVerse: 111 },
  { number: 39, juz: 20, startSurah: 27, startVerse: 56 },
  { number: 40, juz: 20, startSurah: 28, startVerse: 51 },
  { number: 41, juz: 21, startSurah: 29, startVerse: 46 },
  { number: 42, juz: 21, startSurah: 31, startVerse: 22 },
  { number: 43, juz: 22, startSurah: 33, startVerse: 31 },
  { number: 44, juz: 22, startSurah: 34, startVerse: 24 },
  { number: 45, juz: 23, startSurah: 36, startVerse: 28 },
  { number: 46, juz: 23, startSurah: 37, startVerse: 145 },
  { number: 47, juz: 24, startSurah: 39, startVerse: 32 },
  { number: 48, juz: 24, startSurah: 40, startVerse: 41 },
  { number: 49, juz: 25, startSurah: 41, startVerse: 47 },
  { number: 50, juz: 25, startSurah: 43, startVerse: 24 },
  { number: 51, juz: 26, startSurah: 46, startVerse: 1 },
  { number: 52, juz: 26, startSurah: 48, startVerse: 18 },
  { number: 53, juz: 27, startSurah: 51, startVerse: 31 },
  { number: 54, juz: 27, startSurah: 54, startVerse: 28 },
  { number: 55, juz: 28, startSurah: 58, startVerse: 1 },
  { number: 56, juz: 28, startSurah: 61, startVerse: 1 },
  { number: 57, juz: 29, startSurah: 67, startVerse: 1 },
  { number: 58, juz: 29, startSurah: 71, startVerse: 11 },
  { number: 59, juz: 30, startSurah: 78, startVerse: 1 },
  { number: 60, juz: 30, startSurah: 84, startVerse: 1 },
];

/**
 * Resolve one boundary pair to its page, FAILING CLOSED.
 *
 * ⚠️ `getPageForVerse` ANSWERS `-1` FOR A PAIR IT CANNOT FIND, AND `-1` IS CATASTROPHIC HERE
 * RATHER THAN MERELY WRONG. Both lookups below scan in reverse and return the first entry whose
 * start page is `<= page`; `page >= -1` is true for every page in the book, so a single
 * unresolvable pair would make the LAST juz'/hizb the answer for all 604 pages — every page
 * header in the mushaf reading "Juz' 30 · Hizb 60", with no test failing unless one happened to
 * cover that page. Since story 6-3 these arrays are the only source of the labels, so a silent
 * `-1` is a whole-book defect on the facsimile. Throwing at module load turns it into an
 * immediate, obvious failure instead.
 */
function boundaryPage(surah: number, verse: number, label: string): number {
  const page = getPageForVerse(surah, verse);
  if (page < 1) {
    throw new Error(
      `${label} boundary ${surah}:${verse} is absent from the verse↔page map (got ${page})`
    );
  }
  return page;
}

// The derived page boundaries, computed once at module load. Ascending because the verse pairs
// are ascending through the book — pinned by the test rather than assumed.
const JUZ_START_PAGES = JUZ_METADATA.map((j) =>
  boundaryPage(j.startSurah, j.startVerse, `juz' ${j.number}`)
);
const HIZB_START_PAGES = HIZB_METADATA.map((h) =>
  boundaryPage(h.startSurah, h.startVerse, `hizb ${h.number}`)
);

/** Get the juz number for a given mushaf page (1-604). */
export function getJuzForPage(page: number): number {
  for (let i = JUZ_METADATA.length - 1; i >= 0; i--) {
    if (page >= JUZ_START_PAGES[i]) return JUZ_METADATA[i].number;
  }
  return 1;
}

/** Get the hizb number for a given mushaf page (1-604). */
export function getHizbForPage(page: number): number {
  for (let i = HIZB_METADATA.length - 1; i >= 0; i--) {
    if (page >= HIZB_START_PAGES[i]) return HIZB_METADATA[i].number;
  }
  return 1;
}
