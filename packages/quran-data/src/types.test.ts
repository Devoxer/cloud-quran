import type { Page, Surah, Verse, VerseTiming } from './types';

describe('Quran data types', () => {
  test('Verse type is structurally valid', () => {
    const verse: Verse = {
      surah: 1,
      verse: 1,
      textUthmani: 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ',
      textSimple: 'بسم الله الرحمن الرحيم',
    };
    expect(verse.surah).toBe(1);
    expect(verse.verse).toBe(1);
    expect(verse.textUthmani).toBeTruthy();
    expect(verse.textSimple).toBeTruthy();
  });

  test('Surah type is structurally valid', () => {
    const surah: Surah = {
      number: 1,
      nameArabic: 'الفاتحة',
      nameEnglish: 'The Opening',
      nameTransliteration: 'Al-Fatihah',
      verseCount: 7,
      revelationType: 'meccan',
      order: 5,
    };
    expect(surah.number).toBe(1);
    expect(surah.revelationType).toBe('meccan');
  });

  test('Page type is structurally valid', () => {
    const page: Page = {
      pageNumber: 1,
      surah: 1,
      startVerse: 1,
      endVerse: 7,
    };
    expect(page.pageNumber).toBe(1);
  });

  test('VerseTiming type is structurally valid', () => {
    const timing: VerseTiming = {
      surah: 1,
      verse: 1,
      startTime: 0,
      endTime: 5000,
      reciterId: 'mishari-rashid',
    };
    expect(timing.endTime).toBeGreaterThan(timing.startTime);
  });
});
