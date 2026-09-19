/**
 * The study sheet — the frozen I/O matrix, row by row (story 8-3).
 *
 * ⚠️ THE HEADLINE CASE IS "THE TYPE ROW IS IDENTICAL AT EVERY SCOPE", and it is the one a future
 * change is most likely to break for a reasonable-sounding reason ("i'rab only makes sense per
 * ayah"). The owner's correction (2026-09-16) is that no scope is specialised to one type, which
 * is coherent precisely because a scope selects a RANGE and every type answers for a range. The
 * case walks all three scopes and counts all five chips each time.
 *
 * ⚠️ AND THE SECOND IS THAT OPENING THE SHEET TOUCHES NO NETWORK. That is a frozen constraint, it
 * is invisible on a fast connection, and the only thing enforcing it is `deferCatalogue` — so the
 * option is asserted at the call, not inferred from behaviour.
 */

let mockPlatformOS = 'ios';
jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');
  // A proxy rather than a spread — `sign-in-parity.test.tsx`'s recorded reason: spreading
  // react-native READS every export and the deprecation getters warn before a test can run.
  return new Proxy(actual, {
    get(target, prop, receiver) {
      if (prop === 'Platform') {
        return new Proxy(target.Platform, {
          get: (p: object, key: string | symbol) =>
            key === 'OS' ? mockPlatformOS : Reflect.get(p, key),
        });
      }
      return Reflect.get(target, prop, receiver);
    },
  });
});

const mockSessionOnly = { value: false };
jest.mock('@/constants/packs', () => ({
  get PACKS_SESSION_ONLY() {
    return mockSessionOnly.value;
  },
}));

const mockGetVersesForPositions = jest.fn();
const mockGetPackRange = jest.fn();
jest.mock('@/lib/quranDb', () => ({
  getVersesForPositions: (...args: unknown[]) => mockGetVersesForPositions(...args),
  getPackRange: (...args: unknown[]) => mockGetPackRange(...args),
}));
jest.mock('@/lib/errors', () => ({ captureException: jest.fn() }));

const mockInstall = jest.fn();
const mockRemove = jest.fn();
const mockRefresh = jest.fn();
const mockUsePacksOptions: unknown[] = [];
const mockPacks = {
  rows: [] as unknown[],
  catalogue: 'idle' as string,
  disk: 'ready' as string,
  installedBytes: 0,
  install: mockInstall,
  cancel: jest.fn(),
  remove: mockRemove,
  refresh: mockRefresh,
};
jest.mock('@/features/packs', () => ({
  usePacks: (options?: unknown) => {
    mockUsePacksOptions.push(options);
    return mockPacks;
  },
}));

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { StudySheet } from './StudySheet';

/** One shelf row, in `PackRow`'s shape. `installedVersion` is what makes it READABLE. */
function packRow(over: Record<string, unknown> = {}) {
  return {
    id: 'translation-fr-rashid',
    title: 'Le Noble Coran — Rachid Maach',
    language: 'fr',
    languageName: 'Français',
    type: 'translation',
    source: 'QuranEnc',
    sourceVersion: '1.0.3',
    attribution: 'Traduction française : Rachid Maach. Source : QuranEnc.com (v1.0.3).',
    offered: null,
    installedVersion: 1,
    bytes: 1_425_408,
    status: 'installed',
    progress: 1,
    preview: null,
    ...over,
  };
}

const ALFATIHAH = [
  { surah: 1, verse: 1, textUthmani: 'بِسْمِ ٱللَّهِ', textSimple: 'a' },
  { surah: 1, verse: 2, textUthmani: 'ٱلْحَمْدُ لِلَّهِ', textSimple: 'b' },
];

/**
 * ⚠️ THE TIMEOUT IS EXPLICIT AND IT IS NOT FLAKE-PAPERING. Each render of this tree walks
 * `@expo/ui`'s `ViewManagerAdapter` host, and three renders of it land within a few hundred
 * milliseconds of RNTL's 1,000ms default — so the default made this helper pass or fail on how
 * busy the machine was. The reads themselves are mocked and resolve on a microtask.
 */
const SETTLE = { timeout: 10_000 } as const;

// ⚠️ AND THE PER-TEST BUDGET HAS TO CLEAR `SETTLE`, OR THE HELPER'S PATIENCE IS UNREACHABLE: under
// `--concurrency=1` with 160 other suites in flight these renders run several times slower than
// they do alone, and Jest's 5s default cut the wait short before `waitFor` ever gave up.
jest.setTimeout(30_000);

/**
 * ⚠️ A FAKE `document`, BECAUSE THIS SUITE RUNS IN THE NODE ENVIRONMENT AND `jest-expo` GIVES IT
 * NO DOM. Recording the listeners is also the better assertion than dispatching a real event: the
 * regression to catch is a `keydown` handler left registered on a native platform, or left behind
 * after the sheet closes, and both are visible in this array and in neither a rendered tree nor a
 * dispatched event.
 */
const keyListeners: ((event: { key: string } & Record<string, unknown>) => void)[] = [];

/** Deliver a key to whatever the sheet registered, or to nothing at all. */
function press(key: string, modifiers: Record<string, boolean> = {}) {
  for (const listener of [...keyListeners]) listener({ key, ...modifiers });
}

async function open(verse = { surah: 1, verse: 1 }) {
  const view = render(<StudySheet open onClose={onClose} verse={verse} />);
  await waitFor(() => expect(screen.queryByTestId('study-loading')).toBeNull(), SETTLE);
  return view;
}

const onClose = jest.fn();

beforeAll(() => {
  (globalThis as { document?: unknown }).document = {
    addEventListener: (_type: string, listener: (event: { key: string }) => void) =>
      keyListeners.push(listener),
    removeEventListener: (_type: string, listener: (event: { key: string }) => void) => {
      const at = keyListeners.indexOf(listener);
      if (at >= 0) keyListeners.splice(at, 1);
    },
  };
});

afterAll(() => {
  (globalThis as { document?: unknown }).document = undefined;
});

beforeEach(() => {
  jest.clearAllMocks();
  keyListeners.length = 0;
  mockUsePacksOptions.length = 0;
  mockPlatformOS = 'ios';
  mockSessionOnly.value = false;
  mockPacks.rows = [packRow()];
  mockPacks.catalogue = 'idle';
  mockPacks.disk = 'ready';
  mockGetVersesForPositions.mockResolvedValue(ALFATIHAH);
  mockGetPackRange.mockResolvedValue([
    { surah: 1, verse: 1, text: 'Au nom d’Allah', footnotes: null },
    { surah: 1, verse: 2, text: 'Louange à Allah', footnotes: null },
  ]);
});

describe('closed', () => {
  it('renders nothing at all, and mounts no shelf', () => {
    render(<StudySheet open={false} onClose={onClose} verse={{ surah: 1, verse: 1 }} />);
    expect(screen.queryByTestId('study-sheet')).toBeNull();
    // ⚠️ THE HOOKS LIVE IN THE BODY. The chrome is mounted on both reading surfaces for the whole
    // session; a shelf up here would list the pack directory on every reading-screen mount.
    expect(mockUsePacksOptions).toHaveLength(0);
  });

  it('renders nothing with no ayah selected, even when asked to open', () => {
    render(<StudySheet open onClose={onClose} verse={null} />);
    expect(screen.queryByTestId('study-sheet')).toBeNull();
  });
});

describe('opening at ayah scope', () => {
  it('rises with the Arabic on top and the translation beneath it, with attribution', async () => {
    await open();
    expect(screen.getByTestId('study-sheet')).toBeTruthy();
    expect(screen.getByTestId('study-arabic-1-1').props.children).toBe('بِسْمِ ٱللَّهِ');
    expect(screen.getByTestId('study-content-1-1').props.children).toBe('Au nom d’Allah');
    expect(screen.getByTestId('study-attribution').props.children).toBe(
      'Traduction française : Rachid Maach. Source : QuranEnc.com (v1.0.3).'
    );
  });

  it('touches NO network — the shelf is mounted with the catalogue deferred', async () => {
    await open();
    // The frozen constraint, asserted at the call rather than inferred: "reads are local, opening
    // the sheet touches no network on any platform".
    expect(mockUsePacksOptions[0]).toEqual({ deferCatalogue: true });
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('reads exactly the SELECTED ayah, both ends', async () => {
    await open({ surah: 2, verse: 255 });
    expect(mockGetPackRange).toHaveBeenCalledWith(
      'translation-fr-rashid',
      { surah: 2, verse: 255 },
      { surah: 2, verse: 255 }
    );
  });
});

describe('the type row', () => {
  it('is the SAME five at every scope', async () => {
    await open();
    // ⚠️ THE CASE THIS FILE EXISTS FOR. MUTATION: hide a chip at one scope — "i'rab only makes
    // sense per ayah" — and this reddens at `page` while every other case stays green.
    const types = ['meanings', 'tafsir', 'translation', 'irab', 'asbab'] as const;
    for (const scopeIndex of [0, 1, 2]) {
      await act(async () => {
        fireEvent.press(screen.getByTestId(`study-scope-${scopeIndex}`));
      });
      const row = within(screen.getByTestId('study-types'));
      for (const type of types) expect(row.getByTestId(`study-type-${type}`)).toBeTruthy();
      expect(row.queryByTestId('study-type-word')).toBeNull();
    }
  });
});

describe('changing scope', () => {
  it('re-resolves the content for the PAGE’s ayat', async () => {
    await open({ surah: 2, verse: 255 });
    mockGetPackRange.mockClear();

    await act(async () => {
      fireEvent.press(screen.getByTestId('study-scope-1'));
    });
    await waitFor(() => expect(mockGetPackRange).toHaveBeenCalled(), SETTLE);
    // Page 42 is 2:253 → 2:256 — the literal, from `PAGE_FIRST_VERSE`.
    expect(mockGetPackRange).toHaveBeenCalledWith(
      'translation-fr-rashid',
      { surah: 2, verse: 253 },
      { surah: 2, verse: 256 }
    );
  });

  it('…and for the whole SURAH', async () => {
    await open({ surah: 1, verse: 1 });
    mockGetPackRange.mockClear();

    await act(async () => {
      fireEvent.press(screen.getByTestId('study-scope-2'));
    });
    await waitFor(() => expect(mockGetPackRange).toHaveBeenCalled(), SETTLE);
    expect(mockGetPackRange).toHaveBeenCalledWith(
      'translation-fr-rashid',
      { surah: 1, verse: 1 },
      { surah: 1, verse: 7 }
    );
  });
});

describe('a type with no installed source', () => {
  it('says so and offers the download — never an empty panel', async () => {
    await open();
    mockGetPackRange.mockClear();
    await act(async () => {
      fireEvent.press(screen.getByTestId('study-type-tafsir'));
    });
    await waitFor(() => expect(screen.getByTestId('study-no-source')).toBeTruthy(), SETTLE);

    expect(screen.getByText('No Tafsir source is installed yet.')).toBeTruthy();
    expect(screen.getByTestId('study-get-content')).toBeTruthy();
    // ⚠️ AND THE ARABIC IS STILL THERE. "Never an empty panel" is not satisfied by a message on a
    // blank sheet — the frozen criterion is the Arabic on top for context.
    expect(screen.getByTestId('study-arabic-1-1')).toBeTruthy();
    // Nothing was read from a pack that does not exist.
    expect(mockGetPackRange).not.toHaveBeenCalled();
  });

  it('fetches the catalogue only when the reader ASKS for it', async () => {
    await open();
    await act(async () => {
      fireEvent.press(screen.getByTestId('study-type-tafsir'));
    });
    expect(mockRefresh).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('study-get-content'));
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it('offers the packs the catalogue names, and installing one goes through the shelf', async () => {
    const offered = { id: 'tafsir-ar-saadi', packVersion: 1, bytes: 9_000_000 };
    mockPacks.catalogue = 'ready';
    mockPacks.rows = [
      packRow(),
      packRow({
        id: 'tafsir-ar-saadi',
        title: 'تفسير السعدي',
        type: 'tafsir',
        language: 'ar',
        installedVersion: null,
        status: 'available',
        progress: 0,
        offered,
      }),
    ];
    await open();
    await act(async () => {
      fireEvent.press(screen.getByTestId('study-type-tafsir'));
    });

    fireEvent.press(screen.getByTestId('study-install-tafsir-ar-saadi'));
    expect(mockInstall).toHaveBeenCalledWith(offered);
  });

  it('says the catalogue is unreachable rather than claiming nothing is offered', async () => {
    // Offline and "nothing on offer" are different answers; conflating them tells a reader on a
    // plane that the source they want does not exist.
    mockPacks.catalogue = 'unavailable';
    await open();
    await act(async () => {
      fireEvent.press(screen.getByTestId('study-type-tafsir'));
    });
    expect(screen.getByTestId('study-catalogue-error')).toBeTruthy();
    expect(screen.queryByTestId('study-no-offers')).toBeNull();
  });
});

describe('several sources for one type', () => {
  it('draws a picker and swaps the content immediately', async () => {
    mockPacks.rows = [
      packRow(),
      packRow({ id: 'translation-en-saheeh', title: 'Saheeh International', language: 'en' }),
    ];
    mockGetPackRange.mockImplementation((id: string) =>
      Promise.resolve([
        {
          surah: 1,
          verse: 1,
          text: id === 'translation-en-saheeh' ? 'In the name of Allah' : 'Au nom d’Allah',
          footnotes: null,
        },
      ])
    );
    await open();
    expect(screen.getByTestId('study-content-1-1').props.children).toBe('Au nom d’Allah');

    await act(async () => {
      fireEvent.press(screen.getByTestId('study-source-translation-en-saheeh'));
    });
    await waitFor(
      () =>
        expect(screen.getByTestId('study-content-1-1').props.children).toBe('In the name of Allah'),
      SETTLE
    );
  });

  it('draws NO picker when there is only one source to pick', async () => {
    await open();
    expect(screen.queryByTestId('study-sources')).toBeNull();
  });
});

describe('a failed read', () => {
  it('is a typed error with a retry, and the sheet stays open', async () => {
    mockGetPackRange.mockRejectedValueOnce(new Error('file removed under a live handle'));
    await open();
    await waitFor(() => expect(screen.getByTestId('study-error')).toBeTruthy(), SETTLE);
    expect(screen.getByTestId('study-sheet')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.press(within(screen.getByTestId('study-error')).getByText('Try again'));
    await waitFor(() => expect(screen.getByTestId('study-content-1-1')).toBeTruthy(), SETTLE);
  });
});

describe('web', () => {
  it('resolves content with no filesystem, and says the source is session-only', async () => {
    mockPlatformOS = 'web';
    mockSessionOnly.value = true;
    await open();
    // ⚠️ THE READ WENT THROUGH THE SAME DOOR AS NATIVE. On web the pack is a fetched buffer that
    // `lib/quranDb.ts` deserialised; nothing in this component knows or asks, which is the point.
    expect(screen.getByTestId('study-content-1-1').props.children).toBe('Au nom d’Allah');
    expect(screen.getByTestId('study-session-only')).toBeTruthy();
  });

  it('closes on Escape', async () => {
    mockPlatformOS = 'web';
    await open();
    act(() => press('Escape'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('switches source on a number key', async () => {
    mockPlatformOS = 'web';
    mockPacks.rows = [
      packRow(),
      packRow({ id: 'translation-en-saheeh', title: 'Saheeh International', language: 'en' }),
    ];
    await open();
    mockGetPackRange.mockClear();

    await act(async () => press('2'));
    await waitFor(() => expect(mockGetPackRange).toHaveBeenCalled(), SETTLE);
    expect(mockGetPackRange.mock.calls[0][0]).toBe('translation-en-saheeh');
  });

  it('registers NO key listener on a native platform', async () => {
    // The listener is the only thing here that is platform-conditional, and a listener left
    // registered on native is a global `keydown` handler on a device that has no keyboard events.
    await open();
    expect(keyListeners).toHaveLength(0);
  });

  it('removes its listener when the sheet closes', async () => {
    mockPlatformOS = 'web';
    const view = await open();
    expect(keyListeners).toHaveLength(1);
    view.unmount();
    expect(keyListeners).toHaveLength(0);
  });
});

describe('the reading position', () => {
  it('is untouched — nothing in this feature can write one', () => {
    // ⚠️ A SOURCE SCAN, BECAUSE THE ABSENCE OF A WRITE CANNOT BE OBSERVED FROM A RENDER. The
    // frozen matrix says dismissing the sheet leaves the reading position exactly unchanged, and
    // the only way it could move is `usePosition`'s writers. 6-3 established the rule that a
    // selection is WRITE → BACK → FOCUS RESYNC; the sheet is not a navigation at all.
    const { readdirSync, readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) return walk(full);
        return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
      });
    const sources = walk(join(__dirname, '..'))
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');
    expect(sources).toMatch(/StudySheet/);
    expect(sources).not.toMatch(/reportVerse|usePosition\(/);
  });
});

/**
 * The review's user-visible corrections (story 8-3 review, C2/C6/S1/S3/S5).
 */
describe('while the shelf cannot say what is installed', () => {
  it('⚠️ does NOT offer a re-download of a pack the reader may already have', async () => {
    // ⚠️ 8-2's `null`-IS-NOT-`[]` RULE, DEFEATED ONE LAYER UP (review C2). `readable` is empty
    // while the directory is still being listed and whenever the listing FAILED, and neither of
    // those is "nothing is installed" — which is what the download offer says.
    mockPacks.disk = 'unavailable';
    mockPacks.rows = [];
    await open();
    expect(screen.getByTestId('study-sources-unknown')).toBeTruthy();
    expect(screen.getByTestId('study-sources-error')).toBeTruthy();
    expect(screen.queryByTestId('study-no-source')).toBeNull();
    // …and the Arabic is still drawn, which is the other half of "never an empty panel".
    expect(screen.getByTestId('study-arabic-1-1')).toBeTruthy();
  });

  it('says it is still CHECKING rather than that nothing is there', async () => {
    mockPacks.disk = 'loading';
    mockPacks.rows = [];
    await open();
    expect(screen.getByTestId('study-sources-checking')).toBeTruthy();
    expect(screen.queryByTestId('study-no-source')).toBeNull();
  });
});

describe('saying "nothing here" once', () => {
  it('⚠️ does not repeat the absence per row when there is NO SOURCE AT ALL', async () => {
    // Surah scope on Al-Baqarah drew 286 copies of it beneath a panel that had already said, once,
    // that no source is installed (review S1).
    mockPacks.rows = [];
    await open();
    expect(screen.getByTestId('study-no-source')).toBeTruthy();
    expect(screen.queryByTestId('study-absent-1-1')).toBeNull();
  });

  it('…and DOES say it per row when a source is installed and this ayah is the gap', async () => {
    // With a source present, "this edition says nothing about this ayah" is information.
    mockGetPackRange.mockResolvedValue([]);
    await open();
    expect(screen.getByTestId('study-absent-1-1')).toBeTruthy();
  });
});

describe('a failed download, from inside the sheet', () => {
  const offered = { id: 'tafsir-ar-saadi', packVersion: 1, bytes: 9_000_000 };

  function withOffer(over: Record<string, unknown>) {
    mockPacks.catalogue = 'ready';
    mockPacks.rows = [
      packRow(),
      packRow({
        id: 'tafsir-ar-saadi',
        title: 'تفسير السعدي',
        type: 'tafsir',
        language: 'ar',
        installedVersion: null,
        offered,
        ...over,
      }),
    ];
  }

  it('⚠️ says WHY, instead of re-rendering as a fresh offer', async () => {
    // A digest mismatch, a dead network and a pack too large to verify all looked identical —
    // "Get {title}" — so the reader pressed again and was told nothing (review S5).
    withOffer({ status: 'error', progress: 0, failure: 'digest' });
    await open();
    await act(async () => {
      fireEvent.press(screen.getByTestId('study-type-tafsir'));
    });
    expect(screen.getByTestId('study-install-tafsir-ar-saadi-failure')).toBeTruthy();
    expect(
      screen.getByText('The download did not match its checksum. Nothing was installed.')
    ).toBeTruthy();
  });

  it('⚠️ disables the offer while a transfer is running, rather than no-opping in silence', async () => {
    // `usePacks.install` enforces one-at-a-time by returning silently; from this panel the reader
    // cannot see the other transfer, so the press simply did nothing and said nothing (review S5).
    withOffer({ status: 'installing', progress: 0.4 });
    await open();
    await act(async () => {
      fireEvent.press(screen.getByTestId('study-type-tafsir'));
    });
    const control = screen.getByTestId('study-install-tafsir-ar-saadi');
    expect(control.props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(control);
    expect(mockInstall).not.toHaveBeenCalled();
  });
});

describe('releasing a session-held source', () => {
  it('⚠️ is the only way out on web, and it names the pair', async () => {
    // `/content` returns early on web, so `usePacks.remove` was unreachable there — three sources
    // tried meant three packs held in the JS heap until the page was reloaded (review C6).
    mockPlatformOS = 'web';
    mockSessionOnly.value = true;
    await open();

    fireEvent.press(screen.getByTestId('study-release'));
    expect(mockRemove).toHaveBeenCalledWith('translation-fr-rashid', 1);
  });

  it('draws NO release control on native, where the content screen owns removal', async () => {
    await open();
    expect(screen.queryByTestId('study-release')).toBeNull();
  });
});

describe('the web hotkeys', () => {
  it('⚠️ ignore a MODIFIER — Cmd/Ctrl+2 is "switch browser tab"', async () => {
    // Without the guard, a reader changing browser tabs silently changed which edition of the
    // Quran they were reading (review S3).
    mockPlatformOS = 'web';
    mockPacks.rows = [
      packRow(),
      packRow({ id: 'translation-en-saheeh', title: 'Saheeh International', language: 'en' }),
    ];
    await open();
    mockGetPackRange.mockClear();

    await act(async () => press('2', { metaKey: true }));
    await act(async () => press('2', { ctrlKey: true }));
    await act(async () => press('2', { altKey: true }));
    expect(mockGetPackRange).not.toHaveBeenCalled();
  });

  it('are WRITTEN DOWN on the chips, because an invisible shortcut is not a feature', async () => {
    mockPlatformOS = 'web';
    mockPacks.rows = [
      packRow(),
      packRow({ id: 'translation-en-saheeh', title: 'Saheeh International', language: 'en' }),
    ];
    await open();
    // The pack's own title, isolated inside UI copy — see the surah-crossing case above.
    expect(screen.getByText('\u2068Saheeh International\u2069 (2)')).toBeTruthy();
  });

  it('…and are absent from the labels on native, which has no keyboard', async () => {
    mockPacks.rows = [
      packRow(),
      packRow({ id: 'translation-en-saheeh', title: 'Saheeh International', language: 'en' }),
    ];
    await open();
    expect(screen.getByText('\u2068Saheeh International\u2069')).toBeTruthy();
  });
});

/**
 * NAMING THE SURAH WHEN THE RANGE CROSSES ONE (owner, on an iPhone, 2026-09-19).
 *
 * ⚠️ MUSHAF PAGE 221 IS THE OWNER'S SCREENSHOT: `10:107 → 11:5`. Yunus ends, Hud begins, and the
 * sheet drew a bare "1" for Hud 11:1 beneath a chrome that reads يونس — an ayah number with no
 * way to tell which of two surahs it belonged to. Roughly a sixth of the 604 pages turn a surah
 * over, so this is not an edge case; surah and ayah scope never do, which is why the name appears
 * only where it answers a question.
 */
describe('a range that crosses a surah', () => {
  /** 10:107 → 11:5, the page's real span — the literal, not `resolveScope`'s answer. */
  const PAGE_221 = [
    { surah: 10, verse: 107, textUthmani: 'وَإِن يَمْسَسْكَ', textSimple: 'a' },
    { surah: 10, verse: 109, textUthmani: 'وَٱتَّبِعْ مَا يُوحَىٰ', textSimple: 'b' },
    { surah: 11, verse: 1, textUthmani: 'الٓر ۚ كِتَٰبٌ', textSimple: 'c' },
  ];

  it('names the surah on every row', async () => {
    mockGetVersesForPositions.mockResolvedValue(PAGE_221);
    mockGetPackRange.mockResolvedValue([]);
    await open({ surah: 11, verse: 1 });

    await act(async () => {
      fireEvent.press(screen.getByTestId('study-scope-1'));
    });
    await waitFor(() => expect(screen.getByTestId('study-entry-11-1')).toBeTruthy(), SETTLE);

    // MUTATION: go back to the bare ayah number and BOTH of these read "1" and "107".
    // ⚠️ THE NAME IS BIDI-ISOLATED (review D5d) — `U+2068` … `U+2069`, written out rather than
    // produced by `isolate()`, so dropping the wrapper reddens this instead of agreeing with it.
    expect(
      within(screen.getByTestId('study-entry-11-1')).getByText('\u2068Hud\u2069 · 1')
    ).toBeTruthy();
    expect(
      within(screen.getByTestId('study-entry-10-107')).getByText('\u2068Yunus\u2069 · 107')
    ).toBeTruthy();
  });

  it('stays QUIET at ayah scope, where there is nothing to disambiguate', async () => {
    // The common case must not grow a surah name on every row for a range of one.
    await open({ surah: 1, verse: 1 });
    expect(within(screen.getByTestId('study-entry-1-1')).getByText('1')).toBeTruthy();
  });

  it('…and at surah scope, which by construction cannot cross one', async () => {
    await open({ surah: 1, verse: 1 });
    await act(async () => {
      fireEvent.press(screen.getByTestId('study-scope-2'));
    });
    await waitFor(() => expect(screen.getByTestId('study-entry-1-1')).toBeTruthy(), SETTLE);
    expect(within(screen.getByTestId('study-entry-1-1')).getByText('1')).toBeTruthy();
  });
});

/**
 * THE CHIP ROWS ARE INSET, NOT CLIPPED FLUSH (owner, 1.5× system font scale, 2026-09-19).
 *
 * ⚠️ RNTL HAS NO LAYOUT ENGINE, so "the chip is fully visible" is not a fact any renderer here can
 * see — the device is what proved it. What CAN be pinned is the MECHANISM, and it is two halves
 * that only work together: the scroller bleeds past the sheet's own horizontal padding so it owns
 * the full width, and its content container puts that padding back so the chips line up with the
 * controls above. Drop either and the row is narrower than the sheet it sits in, with the
 * overflowing chip sliced by a boundary that has no gap before it.
 */
describe('the chip rows', () => {
  /** Flattened style of one element, as an object. */
  function styleOf(testID: string, prop: 'style' | 'contentContainerStyle') {
    const raw = screen.getByTestId(testID).props[prop];
    const flat = (Array.isArray(raw) ? raw.flat(3) : [raw]).filter(Boolean);
    return Object.assign({}, ...flat.map((s: unknown) => (typeof s === 'object' ? s : {})));
  }

  it('bleed and inset are equal and opposite on BOTH rows', async () => {
    mockPacks.rows = [
      packRow(),
      packRow({ id: 'translation-en-saheeh', title: 'Saheeh International', language: 'en' }),
    ];
    await open();

    for (const id of ['study-types', 'study-sources']) {
      const bleed = styleOf(id, 'style').marginHorizontal;
      const inset = styleOf(id, 'contentContainerStyle').paddingHorizontal;
      expect(typeof bleed).toBe('number');
      expect(bleed).toBeLessThan(0);
      // MUTATION: change either number. A bleed deeper than the inset puts the chips outside the
      // sheet's text column; a shallower one leaves the row narrower than the sheet.
      expect(inset).toBe(-bleed);
    }
  });

  it('…and the row still does not grow vertically', async () => {
    // The other half of this row's history: a horizontal `ScrollView` in a column fills the column
    // unless told not to, which put two empty bands where the Arabic belongs.
    await open();
    expect(styleOf('study-types', 'style').flexGrow).toBe(0);
  });
});
