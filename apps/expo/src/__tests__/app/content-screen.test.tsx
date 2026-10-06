/**
 * `/content` — the content-pack shelf, driven (story 8-2). Lives HERE, never beside the route: a
 * co-located test under `app/` becomes a phantom route in the web export (the rule
 * `route-integrity.test.ts` enforces).
 *
 * What it pins is the part of the frozen matrix that is about what the READER is told:
 *   • an offered pack gets an install control, and the installed one gets a remove control;
 *   • an unreachable catalogue is a NOTE beside the installed packs, never an error screen;
 *   • a failed install says WHICH failure it was, with a retry;
 *   • the attribution and the pack's own text are on screen — the grant's condition, met in UI;
 *   • and on web the screen SAYS packs are unsupported rather than drawing a dead button.
 *
 * `usePacks` is mocked: the join it performs has its own suite (`usePacks.test.ts`) and the disk
 * half has another (`packStore.test.ts`). What is under test here is the rendering of each state.
 */

const mockPacks = {
  rows: [] as unknown[],
  catalogue: 'ready' as string,
  disk: 'ready' as string,
  installedBytes: 0,
  install: jest.fn(),
  cancel: jest.fn(),
  remove: jest.fn(),
  refresh: jest.fn(),
};

jest.mock('@/features/packs', () => ({
  // The REAL grouping — pure, and the grouping is part of what this screen promises.
  buildPackGroups: jest.requireActual('@/features/packs/lib/packGroups').buildPackGroups,
  isOnShelf: jest.requireActual('@/features/packs/lib/packGroups').isOnShelf,
  SHELF_TYPES: jest.requireActual('@/features/packs/lib/packGroups').SHELF_TYPES,
  shelvesPresent: jest.requireActual('@/features/packs/lib/packGroups').shelvesPresent,
  usePacks: () => mockPacks,
}));

const mockSupported = { value: true };
jest.mock('@/constants/packs', () => ({
  get PACKS_SUPPORTED() {
    return mockSupported.value;
  },
}));

import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import ContentScreen from '@/app/(tabs)/(profile)/content';
import { DEFAULT_NUMERAL_SYSTEM, setNumeralSystem } from '@/lib/numerals';

const OFFERED = {
  id: 'translation-fr-rashid',
  packVersion: 1,
  type: 'translation',
  language: 'fr',
  languageName: 'Français',
  languageNameEnglish: 'French',
  direction: 'ltr',
  title: 'Le Noble Coran — Rachid Maach',
  source: 'QuranEnc',
  sourceVersion: '1.0.3',
  licenceId: 'quranenc-republication',
  attribution: 'Traduction française : Rachid Maach. Source : QuranEnc.com (v1.0.3).',
  url: 'https://cdn.nobleachievements.com/packs/translation-fr-rashid-v1.db',
  bytes: 1_425_408,
  rows: 6236,
  digest: 'abc',
};

const baseRow = {
  id: 'translation-fr-rashid',
  title: 'Le Noble Coran — Rachid Maach',
  language: 'fr',
  languageName: 'Français',
  languageNameEnglish: 'French',
  direction: 'ltr',
  type: 'translation',
  source: 'QuranEnc',
  sourceVersion: '1.0.3',
  attribution: 'Traduction française : Rachid Maach. Source : QuranEnc.com (v1.0.3).',
  offered: OFFERED,
  installedVersion: null as number | null,
  bytes: 1_425_408,
  status: 'available' as string,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSupported.value = true;
  mockPacks.rows = [];
  mockPacks.catalogue = 'ready';
  mockPacks.disk = 'ready';
  mockPacks.installedBytes = 0;
});

describe('an offered pack', () => {
  it('draws an install control that hands the catalogue entry back', () => {
    mockPacks.rows = [baseRow];
    render(<ContentScreen />);

    fireEvent.press(screen.getByTestId('content-pack-translation-fr-rashid-install'));

    expect(mockPacks.install).toHaveBeenCalledWith(OFFERED);
  });
});

describe('an installed pack', () => {
  const installed = {
    ...baseRow,
    installedVersion: 1,
    status: 'installed',
  };

  it('renders the attribution the grant requires', () => {
    mockPacks.rows = [installed];
    mockPacks.installedBytes = 1_425_408;
    render(<ContentScreen />);

    expect(
      screen.getByText('Traduction française : Rachid Maach. Source : QuranEnc.com (v1.0.3).')
    ).toBeTruthy();
    // ⚠️ AND NO PREVIEW (story 8-4). A preview row was the reason every installed pack was OPENED
    // on every mount; a pack is read in the study sheet now.
    expect(screen.queryByTestId('content-pack-translation-fr-rashid-preview')).toBeNull();
  });

  it('draws a remove control carrying the INSTALLED version, not the offered one', () => {
    mockPacks.rows = [{ ...installed, offered: { ...OFFERED, packVersion: 1 } }];
    render(<ContentScreen />);

    fireEvent.press(screen.getByTestId('content-pack-translation-fr-rashid-remove'));

    expect(mockPacks.remove).toHaveBeenCalledWith('translation-fr-rashid', 1);
  });

  it('reports how much space the installed packs take, with the FIGURE', () => {
    // ⚠️ ASSERTING A testID PASSES WITH THE SIZE OMITTED, WRONG OR UNFORMATTED. Storage is what a
    // reader came to this screen to find out; the number is the test. (Story 8-2 review, V6.)
    mockPacks.rows = [installed];
    mockPacks.installedBytes = 1_425_408;
    render(<ContentScreen />);

    expect(screen.getByText('1 pack installed · \u20681.4 MB\u2069')).toBeTruthy();
  });

  it('pluralises the count rather than printing one string for every number', () => {
    mockPacks.rows = [installed, { ...installed, id: 'tafsir-ar-saadi', title: 'Tafsir As-Saadi' }];
    mockPacks.installedBytes = 2_000_000;
    render(<ContentScreen />);

    expect(screen.getByText('2 packs installed · \u20681.9 MB\u2069')).toBeTruthy();
  });

  it('draws the COUNT in the reader’s numerals, like the percent five rows down', () => {
    /**
     * ⚠️ IT WAS PASSED RAW, BYPASSING THE PREFERENCE ITS OWN NEIGHBOUR RESPECTS (story 8-3 review,
     * D5b). `count` has to stay a NUMBER — i18next selects the plural from it, and formatting it
     * would collapse six Arabic categories to one — so the displayed figure is a second
     * interpolation. MUTATION: drop `number` and interpolate `{{count}}` again; the plural still
     * works and this reddens, which is the only way the two halves can be told apart.
     */
    setNumeralSystem('arabic-indic');
    try {
      mockPacks.rows = [installed];
      mockPacks.installedBytes = 1_425_408;
      render(<ContentScreen />);
      // ١ — Arabic-Indic, and the plural category still selected from the numeric 1.
      expect(screen.getByText('١ pack installed · \u20681.4 MB\u2069')).toBeTruthy();
    } finally {
      setNumeralSystem(DEFAULT_NUMERAL_SYSTEM);
    }
  });
});

describe('when the catalogue cannot be read', () => {
  it('is a note beside the installed packs, never an error screen', () => {
    mockPacks.catalogue = 'unavailable';
    mockPacks.rows = [{ ...baseRow, offered: null, installedVersion: 1, status: 'installed' }];
    render(<ContentScreen />);

    // The shelf is still here, and the installed pack still has its control.
    expect(screen.getByTestId('content-screen')).toBeTruthy();
    expect(screen.getByTestId('content-offline')).toBeTruthy();
    expect(screen.getByTestId('content-pack-translation-fr-rashid-remove')).toBeTruthy();
  });
});

describe('when the DISK cannot be read', () => {
  it('never renders "Install" over a pack that may well be installed', () => {
    // ⚠️ THE C2 CASE AT THE SURFACE. `null` from the listing is "could not say"; offering an
    // install is a guess, and pressing it answers `{ok: true}` with nothing visibly changing.
    mockPacks.disk = 'unavailable';
    mockPacks.rows = [{ ...baseRow, status: 'unknown' }];
    render(<ContentScreen />);

    expect(screen.getByTestId('content-disk-unavailable')).toBeTruthy();
    expect(screen.queryByTestId('content-pack-translation-fr-rashid-install')).toBeNull();
    expect(screen.getByTestId('content-pack-translation-fr-rashid-unknown')).toBeTruthy();
  });

  it('shows no storage figure it cannot stand behind', () => {
    mockPacks.disk = 'unavailable';
    mockPacks.rows = [{ ...baseRow, installedVersion: 1, status: 'unknown' }];
    render(<ContentScreen />);

    expect(screen.queryByTestId('content-storage')).toBeNull();
  });
});

describe('a first arrival', () => {
  it('is a loading state rather than a blank screen', () => {
    // (Story 8-2 review, S3.)
    mockPacks.catalogue = 'loading';
    mockPacks.disk = 'loading';
    mockPacks.rows = [];
    render(<ContentScreen />);

    expect(screen.getByTestId('content-loading')).toBeTruthy();
  });
});

describe('a failed install', () => {
  it.each([
    ['digest', 'The download did not match its checksum. Nothing was installed.'],
    ['rows', 'The download was incomplete. Nothing was installed.'],
    ['offline', 'No connection. Nothing was installed.'],
  ])('says which failure %s was, and offers a retry', (failure, sentence) => {
    mockPacks.rows = [{ ...baseRow, status: 'error', failure }];
    render(<ContentScreen />);

    expect(screen.getByText(sentence)).toBeTruthy();
    fireEvent.press(screen.getByTestId('content-pack-translation-fr-rashid-retry'));
    expect(mockPacks.install).toHaveBeenCalledWith(OFFERED);
  });

  it('still offers REMOVE when the failed attempt was an update of an installed pack', () => {
    // ⚠️ THE S2 CASE. "The last attempt failed" and "something is installed" are both true, and
    // returning early on the first left a reader with a pack they could not remove and an update
    // they could not complete.
    mockPacks.rows = [{ ...baseRow, status: 'error', failure: 'digest', installedVersion: 1 }];
    render(<ContentScreen />);

    expect(screen.getByTestId('content-pack-translation-fr-rashid-retry')).toBeTruthy();
    fireEvent.press(screen.getByTestId('content-pack-translation-fr-rashid-remove'));
    expect(mockPacks.remove).toHaveBeenCalledWith('translation-fr-rashid', 1);
  });

  it('offers remove beside an available UPDATE too', () => {
    mockPacks.rows = [
      {
        ...baseRow,
        status: 'updatable',
        installedVersion: 1,
        offered: { ...OFFERED, packVersion: 2 },
      },
    ];
    render(<ContentScreen />);

    expect(screen.getByTestId('content-pack-translation-fr-rashid-update')).toBeTruthy();
    expect(screen.getByTestId('content-pack-translation-fr-rashid-remove')).toBeTruthy();
  });
});

describe('the pack’s own text', () => {
  it('sets the title and attribution in the direction the PACK states — from its data alone', () => {
    // ⚠️ STORY 8-4's RTL CASE, AND THE CODE IS CHOSEN SO NO LANGUAGE LIST COULD PASS IT. `nqo` (N'Ko)
    // is marked right to left by QuranEnc's list API and was absent from the hand-written list
    // 8-3 used; the ONLY thing that can make this row RTL is its `direction` field.
    mockPacks.rows = [
      { ...baseRow, installedVersion: 1, status: 'installed' },
      {
        ...baseRow,
        id: 'translation-nqo-dayyan',
        title: 'ߡߊ߲߬ߘߋ߲߫ ߝߘߏ߬ߓߊ߬ߞߊ߲',
        language: 'nqo',
        languageName: 'ߒߞߏ',
        languageNameEnglish: "N'Ko",
        direction: 'rtl',
        installedVersion: 1,
        status: 'installed',
        attribution: 'ߡߊ߲߬ߘߋ߲߫ ߝߘߏ߬ߓߊ߬ߞߊ߲ · QuranEnc.com · v1.0.5',
      },
    ];
    render(<ContentScreen />);

    const french = screen.getByTestId('content-pack-translation-fr-rashid-attribution');
    const nko = screen.getByTestId('content-pack-translation-nqo-dayyan-attribution');
    expect(StyleSheet.flatten(french.props.style)).toMatchObject({ writingDirection: 'ltr' });
    expect(StyleSheet.flatten(nko.props.style)).toMatchObject({
      writingDirection: 'rtl',
      textAlign: 'right',
    });
  });

  it('treats a pack with NO direction as left to right — the I/O matrix rule', () => {
    mockPacks.rows = [{ ...baseRow, direction: '', installedVersion: 1, status: 'installed' }];
    render(<ContentScreen />);
    expect(
      StyleSheet.flatten(
        screen.getByTestId('content-pack-translation-fr-rashid-attribution').props.style
      )
    ).toMatchObject({ writingDirection: 'ltr' });
  });
});

describe('dozens of editions (story 8-4)', () => {
  const edition = (id: string, language: string, languageName: string, title: string) => ({
    ...baseRow,
    id,
    language,
    languageName,
    languageNameEnglish: '',
    title,
    offered: { ...OFFERED, id },
  });

  it('groups by language under the language’s own name, the reader’s language first', () => {
    mockPacks.rows = [
      edition('translation-ur-junagarhi', 'ur', 'اردو', 'اردو ترجمہ'),
      edition('translation-de-rwwad', 'de', 'Deutsch', 'Die deutsche Übersetzung'),
      edition('translation-en-rwwad', 'en', 'English', 'English Translation - Rowwad'),
      edition('translation-en-saheeh', 'en', 'English', 'English Translation - Noor'),
    ];
    render(<ContentScreen />);
    expect(screen.getByTestId('content-language-en').props.children).toBe('English');
    expect(screen.getByTestId('content-language-de')).toBeTruthy();
    expect(screen.getByTestId('content-language-ur').props.children).toBe('اردو');
    // Both English editions are listed and told apart by title.
    expect(screen.getByTestId('content-pack-translation-en-rwwad')).toBeTruthy();
    expect(screen.getByTestId('content-pack-translation-en-saheeh')).toBeTruthy();
  });

  it('finds a language by search and drops the rest', () => {
    mockPacks.rows = [
      edition('translation-ur-junagarhi', 'ur', 'اردو', 'اردو ترجمہ'),
      edition('translation-de-rwwad', 'de', 'Deutsch', 'Die deutsche Übersetzung'),
    ];
    render(<ContentScreen />);
    fireEvent.changeText(screen.getByTestId('content-search-input'), 'deutsch');
    expect(screen.getByTestId('content-pack-translation-de-rwwad')).toBeTruthy();
    expect(screen.queryByTestId('content-pack-translation-ur-junagarhi')).toBeNull();

    fireEvent.changeText(screen.getByTestId('content-search-input'), 'zzzz');
    expect(screen.getByTestId('content-no-matches')).toBeTruthy();
  });
});

/**
 * TRANSLATIONS AND TAFSIR, TWO HALVES OF ONE SHELF (story 8-5).
 *
 * ⚠️ THE FILTER IS A TYPE, APPLIED BEFORE THE GROUPING. 103 tafsir packs beside 75 translations —
 * 52 of them in the Arabic group alone — would bury both. MUTATION: drop the `isOnShelf` filter
 * and the tafsir pack renders under the default translations half.
 */
describe('the type filter (story 8-5)', () => {
  const tafsirRow = {
    ...baseRow,
    id: 'tafsir-ar-saadi',
    type: 'tafsir',
    language: 'ar',
    languageName: 'العربية',
    languageNameEnglish: 'Arabic',
    direction: 'rtl',
    title: 'تفسير السعدي',
    offered: { ...OFFERED, id: 'tafsir-ar-saadi', type: 'tafsir' },
  };

  it('opens on translations and shows no tafsir there', () => {
    mockPacks.rows = [baseRow, tafsirRow];
    render(<ContentScreen />);
    expect(screen.getByTestId('content-pack-translation-fr-rashid')).toBeTruthy();
    expect(screen.queryByTestId('content-pack-tafsir-ar-saadi')).toBeNull();
  });

  it('switches to tafsir and shows tafsir only, grouped by language as before', () => {
    mockPacks.rows = [baseRow, tafsirRow];
    render(<ContentScreen />);
    fireEvent.press(screen.getByText('Tafsir'));
    expect(screen.getByTestId('content-pack-tafsir-ar-saadi')).toBeTruthy();
    expect(screen.getByTestId('content-language-ar').props.children).toBe('العربية');
    expect(screen.queryByTestId('content-pack-translation-fr-rashid')).toBeNull();
  });

  const irabRow = {
    ...tafsirRow,
    id: 'irab-ar-darwish',
    type: 'irab',
    title: 'إعراب القرآن لدرويش',
    offered: { ...OFFERED, id: 'irab-ar-darwish', type: 'irab' },
  };

  it('offers a segment for every type on the shelf — and none for a type with nothing', () => {
    mockPacks.rows = [baseRow, tafsirRow, irabRow];
    render(<ContentScreen />);
    expect(screen.getByTestId('content-types-0').props.accessibilityLabel).toBe('Translations');
    expect(screen.getByTestId('content-types-1').props.accessibilityLabel).toBe('Tafsir');
    expect(screen.getByTestId('content-types-2').props.accessibilityLabel).toBe("I'rab");
    expect(screen.queryByTestId('content-types-3')).toBeNull();
    // The control as a whole says what it chooses.
    expect(screen.getByTestId('content-types').props.accessibilityLabel).toBe('Pack type');
    fireEvent.press(screen.getByTestId('content-types-2'));
    expect(screen.getByTestId('content-pack-irab-ar-darwish')).toBeTruthy();
    expect(screen.queryByTestId('content-pack-tafsir-ar-saadi')).toBeNull();
  });

  it('KEEPS the search across a switch of type — "Arabic" on Tafsir is "Arabic" on I’rab', () => {
    mockPacks.rows = [baseRow, tafsirRow, irabRow];
    render(<ContentScreen />);
    fireEvent.press(screen.getByText('Tafsir'));
    fireEvent.changeText(screen.getByTestId('content-search-input'), 'arabic');
    fireEvent.press(screen.getByTestId('content-types-2'));
    expect(screen.getByTestId('content-search-input').props.value).toBe('arabic');
    expect(screen.getByTestId('content-pack-irab-ar-darwish')).toBeTruthy();
  });

  it('says a shelf is EMPTY — not "no match" — when its last pack goes and no query is typed', () => {
    mockPacks.rows = [
      baseRow,
      { ...irabRow, offered: null, installedVersion: 1, status: 'installed' },
    ];
    const { rerender } = render(<ContentScreen />);
    fireEvent.press(screen.getByText("I'rab"));
    // The reader removes their only I'rab pack; the catalogue offers none.
    mockPacks.rows = [baseRow];
    rerender(<ContentScreen />);
    expect(screen.getByTestId('content-type-empty')).toBeTruthy();
    expect(screen.queryByTestId('content-no-matches')).toBeNull();
  });

  it('keeps a pack of an unknown type on the translations half, where it can still be removed', () => {
    mockPacks.rows = [{ ...baseRow, type: '', installedVersion: 1, status: 'installed' }];
    render(<ContentScreen />);
    expect(screen.getByTestId('content-pack-translation-fr-rashid-remove')).toBeTruthy();
  });
});

describe('the bundled English', () => {
  it('is credited with its source and version, beside the packs', () => {
    render(<ContentScreen />);
    expect(screen.getAllByText('English Translation - Rowwad Translation Center')).toHaveLength(1);
    // The adjacent credit keeps the publisher and edition without repeating the title.
    expect(screen.getByTestId('content-bundled-attribution').props.children).toBe(
      'QuranEnc.com · v1.0.19'
    );
  });
});

describe('on web', () => {
  it('offers no INSTALL control, and says where content comes from instead', () => {
    // ⚠️ THE SENTENCE CHANGED IN STORY 8-3 AND THE CASE IS STILL THE SAME ONE. Web can now READ a
    // pack (fetched into memory from the study sheet) but still cannot KEEP one, so this screen —
    // which manages what is kept — still renders no control here. Telling a browser reader that
    // content is only in the mobile app is what stopped being true.
    mockSupported.value = false;
    mockPacks.rows = [baseRow];
    render(<ContentScreen />);

    expect(screen.getByTestId('content-unsupported')).toBeTruthy();
    expect(screen.queryByTestId('content-pack-translation-fr-rashid-install')).toBeNull();
    // ⚠️ AND IT SAYS HOW TO REACH THE SHEET (story 8-3 review, S10). "Open a source from the
    // study sheet" is a dead end on its own: the sheet has exactly one entry point, and it is
    // selecting an ayah while reading.
    expect(
      screen.getByText(
        'On the web, open a source from the study sheet: select an ayah while reading.'
      )
    ).toBeTruthy();
  });
});
