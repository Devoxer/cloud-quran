/**
 * Story 24.14 — the display resolver. The risk surfaces are the fallback rule (a blank stored
 * translation must NOT win over the English title) and base-language inertness.
 */

import { displaySubtitle, displayTitle } from './bookDisplay';

const BOOK = {
  title: 'Atomic Habits',
  subtitle: 'Tiny Changes, Remarkable Results',
  titleFr: 'Un Rien Peut Tout Changer',
  subtitleFr: 'De petits changements, de grands résultats',
};

describe('displayTitle / displaySubtitle', () => {
  it('returns the base values under the base language', () => {
    // `LOCALIZED_BOOK_ATTRS` has no `en` entry, so the resolver never even looks at `titleFr`.
    expect(displayTitle(BOOK, 'en')).toBe('Atomic Habits');
    expect(displaySubtitle(BOOK, 'en')).toBe('Tiny Changes, Remarkable Results');
  });

  it('returns the translated values under a non-base language', () => {
    expect(displayTitle(BOOK, 'fr')).toBe('Un Rien Peut Tout Changer');
    expect(displaySubtitle(BOOK, 'fr')).toBe('De petits changements, de grands résultats');
  });

  it('falls back to the base value when the translation is absent', () => {
    // The standing state for most of the catalog while coverage fills in behind the pipeline.
    const untranslated = { title: 'Atomic Habits', subtitle: 'Tiny Changes' };
    expect(displayTitle(untranslated, 'fr')).toBe('Atomic Habits');
    expect(displaySubtitle(untranslated, 'fr')).toBe('Tiny Changes');
  });

  it('treats a blank or whitespace-only translation as absent', () => {
    // A `''` written by a partial pipeline run would otherwise render an EMPTY title — a blank row
    // reads as a broken app, strictly worse than an English one.
    expect(displayTitle({ title: 'Atomic Habits', titleFr: '   ' }, 'fr')).toBe('Atomic Habits');
    expect(displaySubtitle({ subtitle: 'Tiny Changes', subtitleFr: '' }, 'fr')).toBe(
      'Tiny Changes'
    );
  });

  it('ignores a non-string value in the localized attribute', () => {
    // A projected row is untyped AT RUNTIME (the `as Book[]` cast at every query site is
    // unchecked), so a malformed write must degrade, never throw. The cast here is the point of
    // the test — tsc would reject the shape, and the runtime is what ships it.
    const malformed = { title: 'Atomic Habits', titleFr: 42 } as unknown as Parameters<
      typeof displayTitle
    >[0];
    expect(displayTitle(malformed, 'fr')).toBe('Atomic Habits');
  });

  it('returns undefined only when the row carries no title at all', () => {
    expect(displayTitle({}, 'fr')).toBeUndefined();
    expect(displaySubtitle({}, 'fr')).toBeUndefined();
  });

  it('falls back to the base value for a language with no localized columns', () => {
    expect(displayTitle(BOOK, 'de')).toBe('Atomic Habits');
  });

  it('does NOT consult `availableLanguages` (§ D3)', () => {
    // Display follows the attribute, not the publish certificate — a shelf book that is not yet
    // published in French still shows its French title.
    const unpublished = { ...BOOK, availableLanguages: ['en'] };
    expect(displayTitle(unpublished, 'fr')).toBe('Un Rien Peut Tout Changer');
  });
});
