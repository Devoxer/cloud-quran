import { toArabicNumber } from './arabicNumbers';

describe('toArabicNumber', () => {
  test('converts single digit numbers', () => {
    expect(toArabicNumber(0)).toBe('٠');
    expect(toArabicNumber(1)).toBe('١');
    expect(toArabicNumber(9)).toBe('٩');
  });

  test('converts multi-digit numbers', () => {
    expect(toArabicNumber(10)).toBe('١٠');
    expect(toArabicNumber(114)).toBe('١١٤');
    expect(toArabicNumber(604)).toBe('٦٠٤');
    expect(toArabicNumber(6236)).toBe('٦٢٣٦');
  });

  test('converts verse-relevant numbers', () => {
    expect(toArabicNumber(255)).toBe('٢٥٥'); // Ayat al-Kursi
    expect(toArabicNumber(286)).toBe('٢٨٦'); // Al-Baqarah verse count
  });

  test('handles negative numbers by using absolute value', () => {
    expect(toArabicNumber(-1)).toBe('١');
    expect(toArabicNumber(-114)).toBe('١١٤');
  });

  test('handles decimal numbers by truncating', () => {
    expect(toArabicNumber(3.14)).toBe('٣');
    expect(toArabicNumber(99.9)).toBe('٩٩');
  });
});
