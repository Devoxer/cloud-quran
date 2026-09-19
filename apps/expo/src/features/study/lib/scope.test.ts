/**
 * The scope model — the thing the whole matrix rests on (story 8-3).
 *
 * ⚠️ EVERY EXPECTATION HERE IS A LITERAL, NEVER `getFirstVerseForPage(42)`. A test whose expected
 * value is derived from the function under test proves nothing: it would hold with the page map
 * regenerated wrongly, with the off-by-one at the end of a page reversed, and with the whole
 * surah-crossing branch deleted. This repo has paid for that exact shape twice
 * (`MushafPageHeader.test.tsx`, `web-focus-ring.test.ts`), so the page boundaries below are
 * written out by hand from `PAGE_FIRST_VERSE`.
 *
 * The mutations these cases exist to redden:
 *   1. a page range ending at the NEXT page's first verse rather than the one before it;
 *   2. a page range clamped to one surah (`{surah, from, to}`), which silently truncates every
 *      page that turns a surah over — page 106 is 4:176 → 5:2;
 *   3. page 604 having no next page and answering an empty or a one-ayah range;
 *   4. a fourth scope appearing in the row (the word scope, dropped by owner call 2026-09-19).
 */

import { rangeKey, resolveScope, STUDY_SCOPES, versesInRange } from './scope';

describe('the scope row', () => {
  it('is exactly three, narrowest first — there is NO word scope', () => {
    // ⚠️ A LITERAL LIST, not `STUDY_SCOPES.length`. The owner dropped per-word granularity; a
    // word scope is behaviourally identical to ayah scope until story 8-6 lands the corpus, so
    // re-adding one is a control that does nothing another already does.
    expect([...STUDY_SCOPES]).toEqual(['ayah', 'page', 'surah']);
  });
});

describe('ayah scope', () => {
  it('is the pair the reader pressed, both ends', () => {
    expect(resolveScope('ayah', { surah: 2, verse: 255 })).toEqual({
      from: { surah: 2, verse: 255 },
      to: { surah: 2, verse: 255 },
    });
  });

  it('enumerates to exactly that one ayah', () => {
    expect(versesInRange(resolveScope('ayah', { surah: 2, verse: 255 }))).toEqual([
      { surah: 2, verse: 255 },
    ]);
  });
});

describe('surah scope', () => {
  it('is ayah 1 to the surah’s last', () => {
    // Al-Fatihah is 7 ayat — the literal, not `SURAH_METADATA[0].verseCount`.
    expect(resolveScope('surah', { surah: 1, verse: 4 })).toEqual({
      from: { surah: 1, verse: 1 },
      to: { surah: 1, verse: 7 },
    });
  });

  it('holds for the longest surah too', () => {
    expect(resolveScope('surah', { surah: 2, verse: 255 })).toEqual({
      from: { surah: 2, verse: 1 },
      to: { surah: 2, verse: 286 },
    });
    expect(versesInRange(resolveScope('surah', { surah: 2, verse: 255 }))).toHaveLength(286);
  });
});

describe('page scope', () => {
  it('ends at the ayah BEFORE the next page starts', () => {
    // 2:255 is on page 42. Page 42 starts at 2:253 and page 43 starts at 2:257, so the page is
    // 2:253 → 2:256. MUTATION: ending at the next page's first verse gives 2:257 and puts an
    // ayah the reader is not looking at into the sheet.
    expect(resolveScope('page', { surah: 2, verse: 255 })).toEqual({
      from: { surah: 2, verse: 253 },
      to: { surah: 2, verse: 256 },
    });
  });

  it('CROSSES a surah boundary rather than truncating at it', () => {
    // Page 106 starts at 4:176 — An-Nisa's last ayah — and page 107 starts at 5:3. A range keyed
    // to one surah could not express this, which is why a range is a pair of pairs.
    expect(resolveScope('page', { surah: 5, verse: 1 })).toEqual({
      from: { surah: 4, verse: 176 },
      to: { surah: 5, verse: 2 },
    });
    expect(versesInRange(resolveScope('page', { surah: 5, verse: 1 }))).toEqual([
      { surah: 4, verse: 176 },
      { surah: 5, verse: 1 },
      { surah: 5, verse: 2 },
    ]);
  });

  it('page 1 ends at the end of Al-Fatihah, not at 2:1', () => {
    expect(resolveScope('page', { surah: 1, verse: 1 })).toEqual({
      from: { surah: 1, verse: 1 },
      to: { surah: 1, verse: 7 },
    });
  });

  it('the LAST page ends at the end of the book', () => {
    // Page 604 starts at 112:1 and has no next page. An-Nas is 6 ayat.
    expect(resolveScope('page', { surah: 114, verse: 1 })).toEqual({
      from: { surah: 112, verse: 1 },
      to: { surah: 114, verse: 6 },
    });
    // Al-Ikhlas 4 + Al-Falaq 5 + An-Nas 6.
    expect(versesInRange(resolveScope('page', { surah: 114, verse: 1 }))).toHaveLength(15);
  });

  it('degrades to a REAL ayah for a verse that is not in the book', () => {
    // ⚠️ THE DEGRADE HAS TO BE ENUMERABLE, WHICH IT WAS NOT (review S2). It answered
    // `{2:999 → 2:999}` — the promised shape — and `versesInRange` then clamped that against
    // Al-Baqarah's 286 ayat and answered `[]`, so the sheet rendered "this source has nothing for
    // this range": a statement about the PACK, and false. 2:999 clamps to 2:286, which is on
    // page 49 (2:283 → 2:286, the literal from `PAGE_FIRST_VERSE`).
    expect(resolveScope('page', { surah: 2, verse: 999 })).toEqual({
      from: { surah: 2, verse: 283 },
      to: { surah: 2, verse: 286 },
    });
  });

  it('…and NO scope ever hands the sheet an empty range, whatever it is given', () => {
    // Nothing can select surah 200; the point is that the promise holds by construction rather
    // than by the caller being careful. MUTATION: drop the clamp and every row here answers [].
    for (const pair of [
      { surah: 200, verse: 1 },
      { surah: 0, verse: 0 },
      { surah: 2, verse: -5 },
      { surah: 2, verse: 999 },
    ]) {
      for (const scope of ['ayah', 'page', 'surah'] as const) {
        expect(versesInRange(resolveScope(scope, pair)).length).toBeGreaterThan(0);
      }
    }
  });
});

describe('versesInRange', () => {
  it('answers [] for a range whose end sorts before its start', () => {
    expect(versesInRange({ from: { surah: 5, verse: 1 }, to: { surah: 2, verse: 1 } })).toEqual([]);
    expect(versesInRange({ from: { surah: 2, verse: 9 }, to: { surah: 2, verse: 8 } })).toEqual([]);
  });

  it('answers [] rather than looping for a surah past the book', () => {
    expect(versesInRange({ from: { surah: 1, verse: 1 }, to: { surah: 200, verse: 1 } })).toEqual(
      []
    );
  });
});

describe('rangeKey', () => {
  it('is the two ends, so an effect can depend on it instead of two object literals', () => {
    expect(rangeKey({ from: { surah: 2, verse: 253 }, to: { surah: 2, verse: 256 } })).toBe(
      '2:253-2:256'
    );
  });
});
