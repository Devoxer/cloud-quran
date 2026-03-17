import { TOTAL_PAGES } from './constants';
import {
  getFirstVerseForPage,
  getPageForVerse,
  PAGE_FIRST_VERSE,
  VERSE_PAGE_MAP,
} from './verse-page-map';

describe('VERSE_PAGE_MAP', () => {
  test('contains 6236 verse entries', () => {
    expect(Object.keys(VERSE_PAGE_MAP).length).toBe(6236);
  });

  test('all page values are between 1 and 604', () => {
    for (const page of Object.values(VERSE_PAGE_MAP)) {
      expect(page).toBeGreaterThanOrEqual(1);
      expect(page).toBeLessThanOrEqual(604);
    }
  });
});

describe('PAGE_FIRST_VERSE', () => {
  test('has exactly 604 entries', () => {
    expect(PAGE_FIRST_VERSE.length).toBe(604);
  });

  test('all entries have valid surah and verse numbers', () => {
    for (const entry of PAGE_FIRST_VERSE) {
      expect(entry.surah).toBeGreaterThanOrEqual(1);
      expect(entry.surah).toBeLessThanOrEqual(114);
      expect(entry.verse).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('getPageForVerse', () => {
  test('Al-Fatiha verse 1 is on page 1', () => {
    expect(getPageForVerse(1, 1)).toBe(1);
  });

  test('Al-Fatiha verse 7 is on page 1', () => {
    expect(getPageForVerse(1, 7)).toBe(1);
  });

  test('Al-Baqarah verse 1 is on page 2', () => {
    expect(getPageForVerse(2, 1)).toBe(2);
  });

  test('last page (604) contains surahs from the end of the Quran', () => {
    // Surah 112 (Al-Ikhlas) starts on page 604
    expect(getPageForVerse(112, 1)).toBe(604);
  });

  test('returns -1 for invalid verse (surah 0)', () => {
    expect(getPageForVerse(0, 1)).toBe(-1);
  });

  test('returns -1 for nonexistent verse', () => {
    expect(getPageForVerse(1, 100)).toBe(-1);
  });

  test('returns -1 for invalid surah (surah 115)', () => {
    expect(getPageForVerse(115, 1)).toBe(-1);
  });
});

describe('getFirstVerseForPage', () => {
  test('page 1 starts with surah 1, verse 1', () => {
    expect(getFirstVerseForPage(1)).toEqual({ surah: 1, verse: 1 });
  });

  test('page 2 starts with surah 2, verse 1', () => {
    expect(getFirstVerseForPage(2)).toEqual({ surah: 2, verse: 1 });
  });

  test('page 604 returns a valid verse', () => {
    const result = getFirstVerseForPage(604);
    expect(result.surah).toBeGreaterThanOrEqual(1);
    expect(result.verse).toBeGreaterThanOrEqual(1);
  });

  test('returns { surah: 0, verse: 0 } for page 0', () => {
    expect(getFirstVerseForPage(0)).toEqual({ surah: 0, verse: 0 });
  });

  test('returns { surah: 0, verse: 0 } for page 605', () => {
    expect(getFirstVerseForPage(605)).toEqual({ surah: 0, verse: 0 });
  });

  test('returns { surah: 0, verse: 0 } for negative page', () => {
    expect(getFirstVerseForPage(-1)).toEqual({ surah: 0, verse: 0 });
  });

  test('TOTAL_PAGES matches the data', () => {
    // Page TOTAL_PAGES should be valid
    const result = getFirstVerseForPage(TOTAL_PAGES);
    expect(result.surah).toBeGreaterThanOrEqual(1);

    // Page TOTAL_PAGES + 1 should be invalid
    const invalid = getFirstVerseForPage(TOTAL_PAGES + 1);
    expect(invalid).toEqual({ surah: 0, verse: 0 });
  });
});
