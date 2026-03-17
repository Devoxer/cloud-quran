import {
  DEFAULT_FONT_SIZE,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  SURAH_COUNT,
  TOTAL_JUZS,
  TOTAL_PAGES,
  TOTAL_SURAHS,
  TOTAL_VERSES,
} from './constants';

describe('Quran constants', () => {
  test('surah constants are correct', () => {
    expect(TOTAL_SURAHS).toBe(114);
    expect(SURAH_COUNT).toBe(114);
  });

  test('verse count is correct', () => {
    expect(TOTAL_VERSES).toBe(6236);
  });

  test('page and juz counts are correct', () => {
    expect(TOTAL_PAGES).toBe(604);
    expect(TOTAL_JUZS).toBe(30);
  });

  test('font size bounds are valid', () => {
    expect(MIN_FONT_SIZE).toBeLessThan(MAX_FONT_SIZE);
    expect(DEFAULT_FONT_SIZE).toBeGreaterThanOrEqual(MIN_FONT_SIZE);
    expect(DEFAULT_FONT_SIZE).toBeLessThanOrEqual(MAX_FONT_SIZE);
  });
});
