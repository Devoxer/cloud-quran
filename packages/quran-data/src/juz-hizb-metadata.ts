// Juz and Hizb boundary metadata for the standard Madinah Mushaf
// Source: Tanzil.net metadata + King Fahd Complex Madinah Mushaf page numbers

export interface JuzMetadata {
  number: number; // 1-30
  startSurah: number; // Surah number where juz starts
  startVerse: number; // Verse number where juz starts
  startPage: number; // Mushaf page where juz starts
}

export interface HizbMetadata {
  number: number; // 1-60
  juz: number; // Which juz this hizb belongs to (1-30)
  startSurah: number;
  startVerse: number;
  startPage: number;
}

// 30 Juz boundaries — standard Madinah Mushaf
export const JUZ_METADATA: JuzMetadata[] = [
  { number: 1, startSurah: 1, startVerse: 1, startPage: 1 },
  { number: 2, startSurah: 2, startVerse: 142, startPage: 22 },
  { number: 3, startSurah: 2, startVerse: 253, startPage: 42 },
  { number: 4, startSurah: 3, startVerse: 93, startPage: 62 },
  { number: 5, startSurah: 4, startVerse: 24, startPage: 82 },
  { number: 6, startSurah: 4, startVerse: 148, startPage: 102 },
  { number: 7, startSurah: 5, startVerse: 83, startPage: 121 },
  { number: 8, startSurah: 6, startVerse: 111, startPage: 142 },
  { number: 9, startSurah: 7, startVerse: 88, startPage: 162 },
  { number: 10, startSurah: 8, startVerse: 41, startPage: 182 },
  { number: 11, startSurah: 9, startVerse: 93, startPage: 201 },
  { number: 12, startSurah: 11, startVerse: 6, startPage: 222 },
  { number: 13, startSurah: 12, startVerse: 53, startPage: 242 },
  { number: 14, startSurah: 15, startVerse: 1, startPage: 262 },
  { number: 15, startSurah: 17, startVerse: 1, startPage: 282 },
  { number: 16, startSurah: 18, startVerse: 75, startPage: 302 },
  { number: 17, startSurah: 21, startVerse: 1, startPage: 322 },
  { number: 18, startSurah: 23, startVerse: 1, startPage: 342 },
  { number: 19, startSurah: 25, startVerse: 21, startPage: 362 },
  { number: 20, startSurah: 27, startVerse: 56, startPage: 382 },
  { number: 21, startSurah: 29, startVerse: 46, startPage: 402 },
  { number: 22, startSurah: 33, startVerse: 31, startPage: 422 },
  { number: 23, startSurah: 36, startVerse: 28, startPage: 442 },
  { number: 24, startSurah: 39, startVerse: 32, startPage: 462 },
  { number: 25, startSurah: 41, startVerse: 47, startPage: 482 },
  { number: 26, startSurah: 46, startVerse: 1, startPage: 502 },
  { number: 27, startSurah: 51, startVerse: 31, startPage: 522 },
  { number: 28, startSurah: 58, startVerse: 1, startPage: 542 },
  { number: 29, startSurah: 67, startVerse: 1, startPage: 562 },
  { number: 30, startSurah: 78, startVerse: 1, startPage: 582 },
];

// 60 Hizb boundaries — each juz has 2 hizbs
export const HIZB_METADATA: HizbMetadata[] = [
  { number: 1, juz: 1, startSurah: 1, startVerse: 1, startPage: 1 },
  { number: 2, juz: 1, startSurah: 2, startVerse: 75, startPage: 12 },
  { number: 3, juz: 2, startSurah: 2, startVerse: 142, startPage: 22 },
  { number: 4, juz: 2, startSurah: 2, startVerse: 203, startPage: 32 },
  { number: 5, juz: 3, startSurah: 2, startVerse: 253, startPage: 42 },
  { number: 6, juz: 3, startSurah: 3, startVerse: 15, startPage: 52 },
  { number: 7, juz: 4, startSurah: 3, startVerse: 93, startPage: 62 },
  { number: 8, juz: 4, startSurah: 3, startVerse: 171, startPage: 72 },
  { number: 9, juz: 5, startSurah: 4, startVerse: 24, startPage: 82 },
  { number: 10, juz: 5, startSurah: 4, startVerse: 88, startPage: 92 },
  { number: 11, juz: 6, startSurah: 4, startVerse: 148, startPage: 102 },
  { number: 12, juz: 6, startSurah: 5, startVerse: 27, startPage: 112 },
  { number: 13, juz: 7, startSurah: 5, startVerse: 83, startPage: 121 },
  { number: 14, juz: 7, startSurah: 6, startVerse: 36, startPage: 132 },
  { number: 15, juz: 8, startSurah: 6, startVerse: 111, startPage: 142 },
  { number: 16, juz: 8, startSurah: 7, startVerse: 1, startPage: 151 },
  { number: 17, juz: 9, startSurah: 7, startVerse: 88, startPage: 162 },
  { number: 18, juz: 9, startSurah: 7, startVerse: 189, startPage: 172 },
  { number: 19, juz: 10, startSurah: 8, startVerse: 41, startPage: 182 },
  { number: 20, juz: 10, startSurah: 9, startVerse: 34, startPage: 192 },
  { number: 21, juz: 11, startSurah: 9, startVerse: 93, startPage: 201 },
  { number: 22, juz: 11, startSurah: 10, startVerse: 26, startPage: 212 },
  { number: 23, juz: 12, startSurah: 11, startVerse: 6, startPage: 222 },
  { number: 24, juz: 12, startSurah: 11, startVerse: 83, startPage: 232 },
  { number: 25, juz: 13, startSurah: 12, startVerse: 53, startPage: 242 },
  { number: 26, juz: 13, startSurah: 13, startVerse: 19, startPage: 252 },
  { number: 27, juz: 14, startSurah: 15, startVerse: 1, startPage: 262 },
  { number: 28, juz: 14, startSurah: 16, startVerse: 30, startPage: 272 },
  { number: 29, juz: 15, startSurah: 17, startVerse: 1, startPage: 282 },
  { number: 30, juz: 15, startSurah: 17, startVerse: 99, startPage: 292 },
  { number: 31, juz: 16, startSurah: 18, startVerse: 75, startPage: 302 },
  { number: 32, juz: 16, startSurah: 19, startVerse: 59, startPage: 312 },
  { number: 33, juz: 17, startSurah: 21, startVerse: 1, startPage: 322 },
  { number: 34, juz: 17, startSurah: 22, startVerse: 19, startPage: 332 },
  { number: 35, juz: 18, startSurah: 23, startVerse: 1, startPage: 342 },
  { number: 36, juz: 18, startSurah: 24, startVerse: 21, startPage: 352 },
  { number: 37, juz: 19, startSurah: 25, startVerse: 21, startPage: 362 },
  { number: 38, juz: 19, startSurah: 26, startVerse: 111, startPage: 372 },
  { number: 39, juz: 20, startSurah: 27, startVerse: 56, startPage: 382 },
  { number: 40, juz: 20, startSurah: 28, startVerse: 51, startPage: 392 },
  { number: 41, juz: 21, startSurah: 29, startVerse: 46, startPage: 402 },
  { number: 42, juz: 21, startSurah: 31, startVerse: 22, startPage: 412 },
  { number: 43, juz: 22, startSurah: 33, startVerse: 31, startPage: 422 },
  { number: 44, juz: 22, startSurah: 34, startVerse: 24, startPage: 432 },
  { number: 45, juz: 23, startSurah: 36, startVerse: 28, startPage: 442 },
  { number: 46, juz: 23, startSurah: 37, startVerse: 145, startPage: 452 },
  { number: 47, juz: 24, startSurah: 39, startVerse: 32, startPage: 462 },
  { number: 48, juz: 24, startSurah: 40, startVerse: 41, startPage: 472 },
  { number: 49, juz: 25, startSurah: 41, startVerse: 47, startPage: 482 },
  { number: 50, juz: 25, startSurah: 43, startVerse: 24, startPage: 492 },
  { number: 51, juz: 26, startSurah: 46, startVerse: 1, startPage: 502 },
  { number: 52, juz: 26, startSurah: 48, startVerse: 18, startPage: 512 },
  { number: 53, juz: 27, startSurah: 51, startVerse: 31, startPage: 522 },
  { number: 54, juz: 27, startSurah: 54, startVerse: 28, startPage: 532 },
  { number: 55, juz: 28, startSurah: 58, startVerse: 1, startPage: 542 },
  { number: 56, juz: 28, startSurah: 61, startVerse: 1, startPage: 552 },
  { number: 57, juz: 29, startSurah: 67, startVerse: 1, startPage: 562 },
  { number: 58, juz: 29, startSurah: 71, startVerse: 11, startPage: 572 },
  { number: 59, juz: 30, startSurah: 78, startVerse: 1, startPage: 582 },
  { number: 60, juz: 30, startSurah: 84, startVerse: 1, startPage: 592 },
];

/** Get the juz number for a given mushaf page (1-604) */
export function getJuzForPage(page: number): number {
  for (let i = JUZ_METADATA.length - 1; i >= 0; i--) {
    if (page >= JUZ_METADATA[i].startPage) return JUZ_METADATA[i].number;
  }
  return 1;
}

/** Get the hizb number for a given mushaf page (1-604) */
export function getHizbForPage(page: number): number {
  for (let i = HIZB_METADATA.length - 1; i >= 0; i--) {
    if (page >= HIZB_METADATA[i].startPage) return HIZB_METADATA[i].number;
  }
  return 1;
}
