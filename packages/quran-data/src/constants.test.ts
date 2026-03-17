import { SURAH_COUNT, TOTAL_PAGES, TOTAL_VERSES } from './constants';

describe('constants', () => {
  test('TOTAL_PAGES is 604', () => {
    expect(TOTAL_PAGES).toBe(604);
  });

  test('TOTAL_VERSES is 6236', () => {
    expect(TOTAL_VERSES).toBe(6236);
  });

  test('SURAH_COUNT is 114', () => {
    expect(SURAH_COUNT).toBe(114);
  });
});
