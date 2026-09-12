/**
 * The mushaf pager's index maths, in BOTH layout directions (story 8-1).
 *
 * ⚠️ THIS SUITE EXISTS BECAUSE A DEVICE CAN ONLY BE SMOKED IN ONE DIRECTION AT A TIME. Turning
 * the app to Arabic means restarting it under `forceRTL`, so the English pager and the Arabic
 * pager are never both observable in one session — whichever one is smoked, the other's
 * regression is carried here or nowhere.
 *
 * The invariant both halves encode: **the page the reader turns TO is the same page in either
 * direction.** Under LTR the data is reversed so that dragging a finger left-to-right lands on a
 * LOWER index and therefore a HIGHER page. Under RTL FlashList already anchors a horizontal list
 * at the right edge and re-aims every offset (`RecyclerView.js`: `isHorizontalRTL =
 * I18nManager.isRTL && horizontal`), so a rising index ALREADY walks leftward through the book —
 * reversing the data too is the double inversion, and it turns pages backwards.
 */

import { TOTAL_PAGES } from 'quran-data';

import { pagerData, pageToIndex } from '@/app/(tabs)/index';

const LTR = false;
const RTL = true;

describe('pagerData', () => {
  it('holds all 604 pages exactly once, in either direction', () => {
    for (const rtl of [LTR, RTL]) {
      const data = pagerData(rtl);
      expect(data).toHaveLength(TOTAL_PAGES);
      expect(new Set(data).size).toBe(TOTAL_PAGES);
      expect(Math.min(...data)).toBe(1);
      expect(Math.max(...data)).toBe(TOTAL_PAGES);
    }
  });

  it('is REVERSED in LTR — page 1 last, page 604 first', () => {
    const data = pagerData(LTR);
    expect(data[0]).toBe(TOTAL_PAGES);
    expect(data[TOTAL_PAGES - 1]).toBe(1);
  });

  it('is NOT reversed in RTL — the framework supplies the turn (the double inversion)', () => {
    const data = pagerData(RTL);
    expect(data[0]).toBe(1);
    expect(data[TOTAL_PAGES - 1]).toBe(TOTAL_PAGES);
  });

  it('gives the two directions genuinely different data', () => {
    // Anti-vacuity: were `pagerData` ever collapsed back to one array, every case above still
    // passes for whichever direction that array happens to describe.
    expect(pagerData(LTR)).not.toEqual(pagerData(RTL));
  });
});

describe('pageToIndex', () => {
  // Literal expectations, not `TOTAL_PAGES - page` re-derived from the implementation: page 1's
  // LTR index is 603 because there are 604 pages, and writing 603 is what would red if the
  // reversal were dropped.
  it.each([
    [1, 603],
    [2, 602],
    [42, 562],
    [604, 0],
  ])('LTR: page %i sits at index %i', (page, index) => {
    expect(pageToIndex(page, LTR)).toBe(index);
  });

  it.each([
    [1, 0],
    [2, 1],
    [42, 41],
    [604, 603],
  ])('RTL: page %i sits at index %i', (page, index) => {
    expect(pageToIndex(page, RTL)).toBe(index);
  });

  it('addresses the page it is given, in the data that direction actually renders', () => {
    // The one property that makes the pair correct rather than merely consistent: whatever index
    // `pageToIndex` answers, `pagerData` must hold THAT page there. A sign flip in either half
    // alone breaks this; the two cases above cannot see it, because each checks one half.
    for (const rtl of [LTR, RTL]) {
      const data = pagerData(rtl);
      for (const page of [1, 2, 42, 300, 603, 604]) {
        expect(data[pageToIndex(page, rtl)]).toBe(page);
      }
    }
  });

  it('advances the SAME WAY in both directions — a page turn is a page turn', () => {
    /**
     * The acceptance criterion, stated as arithmetic. Advancing one item in the list (the next
     * screen the pager settles on as the reader drags the page across) must reach page n+1 in
     * Arabic and in English alike — in LTR by moving one index DOWN through reversed data, in RTL
     * by moving one index UP through natural data, because RN has already flipped which way "up"
     * travels on screen.
     */
    for (const page of [1, 42, 300, 603]) {
      expect(pageToIndex(page + 1, LTR)).toBe(pageToIndex(page, LTR) - 1);
      expect(pageToIndex(page + 1, RTL)).toBe(pageToIndex(page, RTL) + 1);
    }
  });
});
