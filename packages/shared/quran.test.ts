import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FONT_SIZE,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  SURAH_COUNT,
  TOTAL_JUZS,
  TOTAL_PAGES,
  TOTAL_SURAHS,
  TOTAL_VERSES,
  toArabicNumber,
} from './quran';

describe('toArabicNumber', () => {
  it('maps each Western digit to its Arabic-Indic counterpart', () => {
    expect(toArabicNumber(1234567890)).toBe('١٢٣٤٥٦٧٨٩٠');
  });

  it('renders a single digit', () => {
    expect(toArabicNumber(7)).toBe('٧');
  });

  it('renders zero rather than an empty string', () => {
    expect(toArabicNumber(0)).toBe('٠');
  });

  it('renders the last verse of the Quran', () => {
    expect(toArabicNumber(TOTAL_VERSES)).toBe('٦٢٣٦');
  });

  // Verse, juz' and page numbers are whole and positive, so sign and fraction are dropped
  // rather than rendered — a "-٣" or "٣.٥" has no meaning on a mushaf page.
  it('drops the sign', () => {
    expect(toArabicNumber(-42)).toBe('٤٢');
  });

  it('truncates toward zero rather than rounding', () => {
    expect(toArabicNumber(9.99)).toBe('٩');
  });
});

describe('Quran structural constants', () => {
  it('holds the fixed totals', () => {
    expect(TOTAL_SURAHS).toBe(114);
    expect(TOTAL_VERSES).toBe(6236);
    expect(TOTAL_PAGES).toBe(604);
    expect(TOTAL_JUZS).toBe(30);
  });

  it('keeps SURAH_COUNT and TOTAL_SURAHS in agreement', () => {
    expect(SURAH_COUNT).toBe(TOTAL_SURAHS);
  });

  it('bounds the default font size', () => {
    expect(DEFAULT_FONT_SIZE).toBeGreaterThanOrEqual(MIN_FONT_SIZE);
    expect(DEFAULT_FONT_SIZE).toBeLessThanOrEqual(MAX_FONT_SIZE);
  });
});
