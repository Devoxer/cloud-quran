/**
 * Graft probe for the `quran-data` workspace package.
 *
 * Story 5-1 wired `"quran-data": "workspace:*"` into apps/expo/package.json, but nothing under
 * `apps/expo/src` imported it — so a break in workspace linking, Metro resolution or the jest
 * moduleNameMapper would stay invisible until epic 6 tried to render a verse, at which point it
 * would look like a reading bug rather than a packaging one. This is the cheapest possible
 * assertion that the graft holds: it imports across the boundary and reads a real value.
 *
 * ⚠️ **STORY 6-1 MADE THE "NOTHING IMPORTS IT" PREMISE FALSE, AND THE FILE STILL EARNS ITS KEEP.**
 * `app/read.tsx`, `lib/usePosition.ts` and `lib/quranDb.ts` all import `quran-data` now, so a
 * broken graft would fail loudly at the reading surface rather than silently. What this file
 * still covers that they do not is the INTEGRITY BASELINE: those three read `SURAH_METADATA`,
 * `SURAH_COUNT` and `getPageForVerse`, and none of them touches `VERSE_HASHES` — the reference
 * set `pnpm verify` hashes the shipped database against. A truncated or mangled `hashes.ts` is
 * still visible to nothing else in the normal `pnpm test` run.
 */

import { SURAH_COUNT, TOTAL_VERSES, VERSE_HASHES } from 'quran-data';

describe('quran-data graft', () => {
  it('resolves across the workspace boundary', () => {
    expect(SURAH_COUNT).toBe(114);
  });

  it('exposes the per-ayah integrity hashes the build-time gate checks', () => {
    // `pnpm verify` hashes the shipped SQLite database against these. If the export shape
    // changes, the integrity non-negotiable loses its reference set.
    // Story 5-3 review: this asserted `> 0`, which a baseline truncated to ONE entry satisfies.
    // The count is a fixed constant the same package exports, so there is an exact number to
    // insist on — and this is the only assertion in the normal `pnpm test` run that would notice
    // a mangled hashes.ts.
    expect(Object.keys(VERSE_HASHES).length).toBe(TOTAL_VERSES);
  });
});
