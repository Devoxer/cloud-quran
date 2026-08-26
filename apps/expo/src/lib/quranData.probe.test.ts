/**
 * Graft probe for the `quran-data` workspace package.
 *
 * Story 5-1 wired `"quran-data": "workspace:*"` into apps/expo/package.json, but nothing under
 * `apps/expo/src` imports it — so a break in workspace linking, Metro resolution or the jest
 * moduleNameMapper would stay invisible until epic 6 tried to render a verse, at which point it
 * would look like a reading bug rather than a packaging one. This is the cheapest possible
 * assertion that the graft holds: it imports across the boundary and reads a real value.
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
