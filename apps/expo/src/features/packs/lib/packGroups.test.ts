/**
 * `buildPackGroups` — the grouping and search every long pack list renders (story 8-4).
 *
 * ⚠️ ASSERTED ON THE PURE FUNCTION, AS `ReciterPicker`'s GROUPING IS. What matters about 75
 * editions is their ORDER, and a virtualized list can only be interrogated one row at a time; a
 * literal sequence is the only expectation that cannot pass with the rows in the wrong order.
 */

import {
  buildPackGroups,
  foldForSearch,
  type GroupablePack,
  isOnShelf,
  shelvesPresent,
} from './packGroups';

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

/**
 * THE SHELF'S TWO HALVES (story 8-5). MUTATION: `type === 'translation'` for the first half, and an
 * installed pack whose metadata could not be read (type `''`) appears on neither — unremovable.
 */
describe('isOnShelf', () => {
  it('puts tafsir on the tafsir half and nowhere else', () => {
    expect(isOnShelf('tafsir', 'tafsir')).toBe(true);
    expect(isOnShelf('tafsir', 'translation')).toBe(false);
  });

  it('puts translations, and any type it has no half for, on the translations half', () => {
    for (const type of ['translation', '', 'asbab']) {
      expect(isOnShelf(type, 'translation')).toBe(true);
      expect(isOnShelf(type, 'tafsir')).toBe(false);
    }
  });
});

describe('a shelf per type (story 8-5 review)', () => {
  it('gives I’rab and Meanings their own shelves, and nothing of theirs to Tafsir', () => {
    expect(isOnShelf('irab', 'irab')).toBe(true);
    expect(isOnShelf('irab', 'tafsir')).toBe(false);
    expect(isOnShelf('irab', 'translation')).toBe(false);
    expect(isOnShelf('meanings', 'meanings')).toBe(true);
    expect(isOnShelf('meanings', 'translation')).toBe(false);
  });

  it('offers only the shelves that hold something, in a fixed order', () => {
    expect(
      shelvesPresent([{ type: 'meanings' }, { type: 'translation' }, { type: 'tafsir' }])
    ).toEqual(['translation', 'tafsir', 'meanings']);
    expect(shelvesPresent([{ type: '' }])).toEqual(['translation']);
    expect(shelvesPresent([])).toEqual([]);
  });
});

describe('finding an Arabic-titled work by its Latin name', () => {
  it('matches the pack id, which carries the work’s Latin slug', () => {
    // MUTATION: drop `pack.id` from the searched fields — "tabari" finds nothing, because the
    // title is تفسير الطبري and the language names are "العربية" / "Arabic".
    const packs: GroupablePack[] = [
      {
        id: 'tafsir-ar-tabari',
        title: 'تفسير الطبري',
        language: 'ar',
        languageName: 'العربية',
        languageNameEnglish: 'Arabic',
      },
      {
        id: 'tafsir-ar-saadi',
        title: 'تفسير السعدي',
        language: 'ar',
        languageName: 'العربية',
        languageNameEnglish: 'Arabic',
      },
    ];
    const ids = (query: string) =>
      buildPackGroups(packs, query, 'en').flatMap((row) =>
        row.kind === 'pack' ? [row.pack.id] : []
      );
    expect(ids('tabari')).toEqual(['tafsir-ar-tabari']);
    expect(ids('Saadi')).toEqual(['tafsir-ar-saadi']);
    expect(ids('الطبري')).toEqual(['tafsir-ar-tabari']);
  });
});
