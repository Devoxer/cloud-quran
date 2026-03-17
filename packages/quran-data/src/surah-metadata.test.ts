import { SURAH_METADATA } from './surah-metadata';

describe('SURAH_METADATA', () => {
  test('contains exactly 114 surahs', () => {
    expect(SURAH_METADATA).toHaveLength(114);
  });

  test('total verse count sums to 6236', () => {
    const total = SURAH_METADATA.reduce((sum, s) => sum + s.verseCount, 0);
    expect(total).toBe(6236);
  });

  test('all fields are non-empty', () => {
    for (const surah of SURAH_METADATA) {
      expect(surah.number).toBeGreaterThan(0);
      expect(surah.nameArabic).toBeTruthy();
      expect(surah.nameEnglish).toBeTruthy();
      expect(surah.nameTransliteration).toBeTruthy();
      expect(surah.verseCount).toBeGreaterThan(0);
      expect(surah.order).toBeGreaterThan(0);
    }
  });

  test('revelationType is meccan or medinan for each surah', () => {
    for (const surah of SURAH_METADATA) {
      expect(['meccan', 'medinan']).toContain(surah.revelationType);
    }
  });

  test('surah numbers are sequential 1-114', () => {
    for (let i = 0; i < 114; i++) {
      expect(SURAH_METADATA[i].number).toBe(i + 1);
    }
  });

  test('Al-Fatihah is surah 1 with 7 verses, meccan', () => {
    const fatihah = SURAH_METADATA[0];
    expect(fatihah.number).toBe(1);
    expect(fatihah.nameEnglish).toBe('The Opening');
    expect(fatihah.nameTransliteration).toBe('Al-Fatihah');
    expect(fatihah.verseCount).toBe(7);
    expect(fatihah.revelationType).toBe('meccan');
  });

  test('Al-Baqarah is surah 2 with 286 verses, medinan', () => {
    const baqarah = SURAH_METADATA[1];
    expect(baqarah.number).toBe(2);
    expect(baqarah.nameEnglish).toBe('The Cow');
    expect(baqarah.nameTransliteration).toBe('Al-Baqarah');
    expect(baqarah.verseCount).toBe(286);
    expect(baqarah.revelationType).toBe('medinan');
  });
});
