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

const OFFERED = {
  id: 'translation-fr-rashid',
  packVersion: 1,
  type: 'translation',
  language: 'fr',
  languageName: 'Français',
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
  type: 'translation',
  source: 'QuranEnc',
  sourceVersion: '1.0.3',
  attribution: 'Traduction française : Rachid Maach. Source : QuranEnc.com (v1.0.3).',
  offered: OFFERED,
  installedVersion: null as number | null,
  bytes: 1_425_408,
  status: 'available' as string,
  progress: 0,
  preview: null as string | null,
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
    preview: 'Au nom d’Allah, le Tout Miséricordieux, le Très Miséricordieux[1].',
  };

  it('renders the attribution the grant requires, and the pack’s own text', () => {
    mockPacks.rows = [installed];
    mockPacks.installedBytes = 1_425_408;
    render(<ContentScreen />);

    expect(
      screen.getByText('Traduction française : Rachid Maach. Source : QuranEnc.com (v1.0.3).')
    ).toBeTruthy();
    expect(
      screen.getByText('Au nom d’Allah, le Tout Miséricordieux, le Très Miséricordieux[1].')
    ).toBeTruthy();
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

    expect(screen.getByText('1 pack installed · 1.4 MB')).toBeTruthy();
  });

  it('pluralises the count rather than printing one string for every number', () => {
    mockPacks.rows = [installed, { ...installed, id: 'tafsir-ar-saadi', title: 'Tafsir As-Saadi' }];
    mockPacks.installedBytes = 2_000_000;
    render(<ContentScreen />);

    expect(screen.getByText('2 packs installed · 1.9 MB')).toBeTruthy();
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
  it('renders the preview and the attribution in the CONTENT’s direction', () => {
    // ⚠️ Fine for French and wrong for the Arabic tafsir packs that are next — this repo sets
    // content direction locally at every content site because web is deliberately not mirrored.
    // (Story 8-2 review, S6.)
    mockPacks.rows = [
      { ...baseRow, installedVersion: 1, status: 'installed', preview: 'Au nom d’Allah…' },
      {
        ...baseRow,
        id: 'tafsir-ar-saadi',
        title: 'تفسير السعدي',
        language: 'ar',
        languageName: 'العربية',
        installedVersion: 1,
        status: 'installed',
        preview: 'بسم الله',
        attribution: 'تفسير السعدي',
      },
    ];
    render(<ContentScreen />);

    const french = screen.getByTestId('content-pack-translation-fr-rashid-preview');
    const arabic = screen.getByTestId('content-pack-tafsir-ar-saadi-preview');

    expect(StyleSheet.flatten(french.props.style)).toMatchObject({ writingDirection: 'ltr' });
    expect(StyleSheet.flatten(arabic.props.style)).toMatchObject({
      writingDirection: 'rtl',
      textAlign: 'right',
    });
    // The attribution is content too — an Arabic pack's credit is Arabic.
    expect(
      StyleSheet.flatten(screen.getByTestId('content-pack-tafsir-ar-saadi-attribution').props.style)
    ).toMatchObject({ writingDirection: 'rtl' });
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
