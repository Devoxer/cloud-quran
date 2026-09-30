/**
 * `buildPackGroups` — the grouping and search every long pack list renders (story 8-4).
 *
 * ⚠️ ASSERTED ON THE PURE FUNCTION, AS `ReciterPicker`'s GROUPING IS. What matters about 75
 * editions is their ORDER, and a virtualized list can only be interrogated one row at a time; a
 * literal sequence is the only expectation that cannot pass with the rows in the wrong order.
 */

import { buildPackGroups, foldForSearch, type GroupablePack } from './packGroups';

const pack = (id: string, language: string, languageName: string, title: string, english = '') =>
  ({ id, language, languageName, languageNameEnglish: english, title }) satisfies GroupablePack;

const SHELF = [
  pack('ur-1', 'ur', 'اردو', 'اردو ترجمہ', 'Urdu'),
  pack('de-1', 'de', 'Deutsch', 'Die deutsche Übersetzung', 'German'),
  pack('fr-1', 'fr', 'Français', 'La traduction en français - Rachid Maach', 'French'),
  pack('en-1', 'en', 'English', 'English Translation - Rowwad', 'English'),
  pack('fr-2', 'fr', 'Français', 'La traduction en français - Montada', 'French'),
  pack('en-2', 'en', 'English', 'English Translation - Noor', 'English'),
];

const shape = (rows: ReturnType<typeof buildPackGroups>) =>
  rows.map((row) => (row.kind === 'language' ? `#${row.language}` : row.pack.id));

describe('grouping', () => {
  it("puts the reader's own language first, then collates the rest by their own names", () => {
    expect(shape(buildPackGroups(SHELF, '', 'fr'))).toEqual([
      '#fr',
      'fr-1',
      'fr-2',
      '#de',
      'de-1',
      '#en',
      'en-1',
      'en-2',
      '#ur',
      'ur-1',
    ]);
  });

  it('keeps an item order the caller chose, inside a group', () => {
    const [heading] = buildPackGroups(SHELF, '', 'en');
    expect(heading).toEqual({
      kind: 'language',
      language: 'en',
      languageName: 'English',
      count: 2,
    });
  });

  it("matches the interface's primary subtag, so `fr-CA` still puts French first", () => {
    expect(shape(buildPackGroups(SHELF, '', 'fr-CA'))[0]).toBe('#fr');
  });

  it('keeps an interface language with no editions from reordering anything', () => {
    // Arabic interface: there is no Arabic translation, so the collation alone decides.
    expect(shape(buildPackGroups(SHELF, '', 'ar'))[0]).toBe('#de');
  });
});

describe('search', () => {
  it('finds by English name, endonym, code and title — and drops the rest WITH their headings', () => {
    expect(shape(buildPackGroups(SHELF, 'urdu', 'en'))).toEqual(['#ur', 'ur-1']);
    expect(shape(buildPackGroups(SHELF, 'اردو', 'en'))).toEqual(['#ur', 'ur-1']);
    expect(shape(buildPackGroups(SHELF, 'DE', 'en'))).toEqual(['#de', 'de-1']);
    expect(shape(buildPackGroups(SHELF, 'noor', 'en'))).toEqual(['#en', 'en-2']);
  });

  it('ignores Latin accents on either side', () => {
    expect(foldForSearch('Français')).toBe('francais');
    expect(shape(buildPackGroups(SHELF, 'francais', 'en'))).toEqual(['#fr', 'fr-1', 'fr-2']);
  });

  it('answers nothing — not a stray heading — when nothing matches', () => {
    expect(buildPackGroups(SHELF, 'zzzz', 'en')).toEqual([]);
  });

  it('treats a blank query as everything', () => {
    expect(buildPackGroups(SHELF, '   ', 'en')).toHaveLength(
      buildPackGroups(SHELF, '', 'en').length
    );
  });
});
