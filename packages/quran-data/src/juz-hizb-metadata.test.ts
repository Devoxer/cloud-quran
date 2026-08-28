/**
 * Juz'/Hizb metadata — verse pairs only, pages DERIVED (story 6-3).
 *
 * ⚠️ THE STORED `startPage` COLUMN IS DELETED, AND THE FIRST DESCRIBE BLOCK IS WHAT KEEPS IT OUT.
 * This story's original agreement test (`getPageForVerse(startSurah, startVerse) === startPage`
 * over all 90 entries) found 19 disagreements: the stored column was an arithmetic ladder
 * (56/60 hizb values exactly `10n − 8`), not a reading of any printed mushaf, and it was already
 * mislabelling 27 of 604 page headers on the shipped facsimile. With the page computed from the
 * pair, the agreement is true by construction and the test would be a tautology — so what is
 * pinned instead is that no stored page column has come back, and that the derived boundaries
 * are real pages in ascending order.
 */

import { getHizbForPage, getJuzForPage, HIZB_METADATA, JUZ_METADATA } from './juz-hizb-metadata';
import { getPageForVerse } from './verse-page-map';

describe('the page is derived, never stored (story 6-3 resolution)', () => {
  test('no entry carries a stored page column', () => {
    // MUTATION: re-adding `startPage: …` to any entry — the 19-row disagreement this story
    // found came from exactly such a column drifting unchecked against the verse↔page map.
    for (const entry of [...JUZ_METADATA, ...HIZB_METADATA]) {
      expect(entry).not.toHaveProperty('startPage');
    }
  });

  test('every boundary pair resolves to a real page, STRICTLY ascending', () => {
    // ⚠️ STRICT, AND IT WAS BRIEFLY NOT. The stored-column era had a strict juz' case; the
    // derived rewrite relaxed both lists to `>=` with nothing forcing it — today all 30 juz' and
    // all 60 hizb pages are distinct. The relaxation matters because BOTH lookups scan in
    // reverse and return the first entry at or below the page: two boundaries sharing a page
    // makes the LOWER of the two unreachable, so `getJuzForPage` would step 6 → 8 and no page in
    // the book would ever be labelled juz' 7. A tie is exactly the regression this guards.
    for (const list of [JUZ_METADATA, HIZB_METADATA]) {
      let previous = 0;
      for (const entry of list) {
        const page = getPageForVerse(entry.startSurah, entry.startVerse);
        // -1 is the map's "not a verse" answer; a boundary pair must never earn it.
        expect(page).toBeGreaterThanOrEqual(1);
        expect(page).toBeLessThanOrEqual(604);
        expect(page).toBeGreaterThan(previous);
        previous = page;
      }
    }
  });

  test('the corrected boundaries the ladder got wrong', () => {
    // Three of the 19 rows the agreement test surfaced, pinned as derived values: the ladder
    // said 121 / 172 / 592; the facsimile's own map says otherwise.
    expect(getPageForVerse(5, 83)).toBe(122); // juz' 7 / hizb 13
    expect(getPageForVerse(7, 189)).toBe(175); // hizb 18
    expect(getPageForVerse(84, 1)).toBe(589); // hizb 60
  });
});

describe('JUZ_METADATA', () => {
  test('has exactly 30 entries, numbered 1-30 in order', () => {
    expect(JUZ_METADATA.length).toBe(30);
    JUZ_METADATA.forEach((juz, i) => {
      expect(juz.number).toBe(i + 1);
    });
  });

  test('all start surahs are within 1-114 range', () => {
    JUZ_METADATA.forEach((juz) => {
      expect(juz.startSurah).toBeGreaterThanOrEqual(1);
      expect(juz.startSurah).toBeLessThanOrEqual(114);
    });
  });

  test('first juz starts at 1:1, on page 1', () => {
    expect(JUZ_METADATA[0].startSurah).toBe(1);
    expect(JUZ_METADATA[0].startVerse).toBe(1);
    expect(getPageForVerse(1, 1)).toBe(1);
  });

  test('last juz starts at 78:1, on page 582', () => {
    expect(JUZ_METADATA[29].startSurah).toBe(78);
    expect(getPageForVerse(78, 1)).toBe(582);
  });
});

describe('HIZB_METADATA', () => {
  test('has exactly 60 entries, numbered 1-60 in order', () => {
    expect(HIZB_METADATA.length).toBe(60);
    HIZB_METADATA.forEach((hizb, i) => {
      expect(hizb.number).toBe(i + 1);
    });
  });

  test('all start surahs are within 1-114 range', () => {
    HIZB_METADATA.forEach((hizb) => {
      expect(hizb.startSurah).toBeGreaterThanOrEqual(1);
      expect(hizb.startSurah).toBeLessThanOrEqual(114);
    });
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

  test('every odd hizb starts where its juz does — the halves belong to the whole', () => {
    for (const juz of JUZ_METADATA) {
      const firstHalf = HIZB_METADATA[(juz.number - 1) * 2];
      expect(firstHalf.juz).toBe(juz.number);
      expect(firstHalf.startSurah).toBe(juz.startSurah);
      expect(firstHalf.startVerse).toBe(juz.startVerse);
    }
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

  test('juz 7 begins on page 122, not the ladder’s 121 — the one juz label the stored column got wrong', () => {
    expect(getJuzForPage(121)).toBe(6);
    expect(getJuzForPage(122)).toBe(7);
  });

  test('returns 30 for page 604 and for page 582 (first page of juz 30)', () => {
    expect(getJuzForPage(604)).toBe(30);
    expect(getJuzForPage(582)).toBe(30);
  });
});

describe('getHizbForPage', () => {
  test('returns 1 for page 1', () => {
    expect(getHizbForPage(1)).toBe(1);
  });

  test('hizb 2 begins on page 11 — where 2:75 actually sits, not the ladder’s 12', () => {
    expect(getHizbForPage(10)).toBe(1);
    expect(getHizbForPage(11)).toBe(2);
  });

  test('returns 60 for page 604', () => {
    expect(getHizbForPage(604)).toBe(60);
  });

  test('hizb 60 begins on page 589 (84:1) — the ladder said 592, three pages late', () => {
    expect(getHizbForPage(588)).toBe(59);
    expect(getHizbForPage(589)).toBe(60);
  });

  test('returns 58 for page 581 (page within hizb 58 range)', () => {
    expect(getHizbForPage(581)).toBe(58);
  });
});
