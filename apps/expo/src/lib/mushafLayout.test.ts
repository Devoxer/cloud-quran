/**
 * The layout accessor, exercised against the REAL bundle (story 6-2).
 *
 * ⚠️ THESE CASES READ THE 7.8 MB SHIPPED ARTIFACT, NOT A FIXTURE, on purpose: the facts the
 * renderer leans on — 604 pages, the 8/15 line counts, basmala rows carrying no glyph — are
 * facts about the DATA, and a fixture would only prove the test agrees with itself. The
 * generator hard-validates most of this at build time; this file is what notices a bundle
 * regenerated with different upstreams landing in the tree.
 */

import { TOTAL_PAGES } from 'quran-data';
import { getPageLayout } from './mushafLayout';

describe('the bundle', () => {
  it('holds all 604 pages, each naming itself', async () => {
    // Sampling the corners rather than looping the map: getPageLayout is the door under test.
    for (const page of [1, 2, 3, 302, 603, TOTAL_PAGES]) {
      const layout = await getPageLayout(page);
      expect(layout.page).toBe(page);
      expect(layout.lines.length).toBeGreaterThan(0);
    }
  });

  it('gives pages 1–2 their 8 short lines and every other page exactly 15', async () => {
    // The full sweep IS the point here — the pre-fork "special page" branch keys on `<= 2`, and
    // a third short page appearing in regenerated data would silently render mis-framed.
    for (let page = 1; page <= TOTAL_PAGES; page++) {
      const layout = await getPageLayout(page);
      expect({ page, lines: layout.lines.length }).toEqual({
        page,
        lines: page <= 2 ? 8 : 15,
      });
    }
  });

  it('documents that basmala lines carry NO glyph — the constant is the render', async () => {
    // `constants/mushaf.ts`'s BASMALA_TEXT exists because of this fact; if regenerated data ever
    // starts carrying glyphs here, that constant stops being the only render path and the
    // component should be revisited.
    let basmalaLines = 0;
    for (let page = 1; page <= TOTAL_PAGES; page++) {
      const layout = await getPageLayout(page);
      for (const line of layout.lines) {
        if (line.type !== 'basmala') continue;
        basmalaLines++;
        expect(line.words).toBeUndefined();
        expect(line.qpcV1).toBeUndefined();
        expect(line.text).toBeUndefined();
      }
    }
    // Anti-vacuity: 112 surahs open with a printed basmala (all but 1 and 9).
    expect(basmalaLines).toBe(112);
  });

  it('gives every text line words whose location is the verse identity', async () => {
    // Verse identity comes from `words[].location` ONLY — the renderer and the verse↔page map
    // both derive from it, and `verseRange` is exactly the field that drifted for 565 lines.
    const layout = await getPageLayout(3);
    for (const line of layout.lines) {
      if (line.type !== 'text') continue;
      expect(line.words?.length).toBeGreaterThan(0);
      for (const word of line.words ?? []) {
        expect(word.location).toMatch(/^\d+:\d+:\d+$/);
        expect(word.qpcV1.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('a page the bundle does not hold', () => {
  it.each([
    0,
    605,
    -1,
    Number.NaN,
  ])('rejects %p with a named error, never a blank answer', async (page) => {
    await expect(getPageLayout(page as number)).rejects.toThrow(/No mushaf layout for page/);
  });
});
