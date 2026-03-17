import { getHizbForPage, getJuzForPage, HIZB_METADATA, JUZ_METADATA } from './juz-hizb-metadata';

describe('JUZ_METADATA', () => {
  test('has exactly 30 entries', () => {
    expect(JUZ_METADATA.length).toBe(30);
  });

  test('juz numbers are 1-30 in order', () => {
    JUZ_METADATA.forEach((juz, i) => {
      expect(juz.number).toBe(i + 1);
    });
  });

  test('all start pages are within 1-604 range', () => {
    JUZ_METADATA.forEach((juz) => {
      expect(juz.startPage).toBeGreaterThanOrEqual(1);
      expect(juz.startPage).toBeLessThanOrEqual(604);
    });
  });

  test('all start surahs are within 1-114 range', () => {
    JUZ_METADATA.forEach((juz) => {
      expect(juz.startSurah).toBeGreaterThanOrEqual(1);
      expect(juz.startSurah).toBeLessThanOrEqual(114);
    });
  });

  test('juz pages are in ascending order', () => {
    for (let i = 1; i < JUZ_METADATA.length; i++) {
      expect(JUZ_METADATA[i].startPage).toBeGreaterThan(JUZ_METADATA[i - 1].startPage);
    }
  });

  test('first juz starts at page 1, surah 1, verse 1', () => {
    expect(JUZ_METADATA[0].startPage).toBe(1);
    expect(JUZ_METADATA[0].startSurah).toBe(1);
    expect(JUZ_METADATA[0].startVerse).toBe(1);
  });

  test('last juz starts at page 582', () => {
    expect(JUZ_METADATA[29].startPage).toBe(582);
  });
});

describe('HIZB_METADATA', () => {
  test('has exactly 60 entries', () => {
    expect(HIZB_METADATA.length).toBe(60);
  });

  test('hizb numbers are 1-60 in order', () => {
    HIZB_METADATA.forEach((hizb, i) => {
      expect(hizb.number).toBe(i + 1);
    });
  });

  test('all start pages are within 1-604 range', () => {
    HIZB_METADATA.forEach((hizb) => {
      expect(hizb.startPage).toBeGreaterThanOrEqual(1);
      expect(hizb.startPage).toBeLessThanOrEqual(604);
    });
  });

  test('all start surahs are within 1-114 range', () => {
    HIZB_METADATA.forEach((hizb) => {
      expect(hizb.startSurah).toBeGreaterThanOrEqual(1);
      expect(hizb.startSurah).toBeLessThanOrEqual(114);
    });
  });

  test('hizb pages are in ascending order', () => {
    for (let i = 1; i < HIZB_METADATA.length; i++) {
      expect(HIZB_METADATA[i].startPage).toBeGreaterThanOrEqual(HIZB_METADATA[i - 1].startPage);
    }
  });

  test('each juz has exactly 2 hizbs', () => {
    for (let j = 1; j <= 30; j++) {
      const hizbs = HIZB_METADATA.filter((h) => h.juz === j);
      expect(hizbs.length).toBe(2);
    }
  });

  test('juz values are within 1-30 range', () => {
    HIZB_METADATA.forEach((hizb) => {
      expect(hizb.juz).toBeGreaterThanOrEqual(1);
      expect(hizb.juz).toBeLessThanOrEqual(30);
    });
  });
});

describe('getJuzForPage', () => {
  test('returns 1 for page 1', () => {
    expect(getJuzForPage(1)).toBe(1);
  });

  test('returns 1 for page 21 (last page of juz 1)', () => {
    expect(getJuzForPage(21)).toBe(1);
  });

  test('returns 2 for page 22 (first page of juz 2)', () => {
    expect(getJuzForPage(22)).toBe(2);
  });

  test('returns 30 for page 604', () => {
    expect(getJuzForPage(604)).toBe(30);
  });

  test('returns 30 for page 582 (first page of juz 30)', () => {
    expect(getJuzForPage(582)).toBe(30);
  });
});

describe('getHizbForPage', () => {
  test('returns 1 for page 1', () => {
    expect(getHizbForPage(1)).toBe(1);
  });

  test('returns 2 for page 12 (second hizb of juz 1)', () => {
    expect(getHizbForPage(12)).toBe(2);
  });

  test('returns 60 for page 604', () => {
    expect(getHizbForPage(604)).toBe(60);
  });

  test('returns 58 for page 581 (page within hizb 58 range)', () => {
    expect(getHizbForPage(581)).toBe(58);
  });
});
