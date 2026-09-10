/**
 * `/` — the 604-page mushaf surface, driven (story 6-2; THE HOME TAB with our chrome since 6-6,
 * mirroring `read-screen.test.tsx`).
 *
 * ⚠️ THE FLASHLIST MOCK CAPTURES PROPS AND RENDERS NO ITEMS, unlike the read screen's (which
 * renders every verse row). Rendering 604 `MushafPage`s per case would start 604 async loads for
 * nothing: what this file drives is the SCREEN — reversed data, paging, the initial index, the
 * viewability→position wiring, the chrome and the focus resync — and each of those is a prop or
 * a callback. The page component itself is driven with the real renderer in `MushafPage.test.tsx`.
 *
 * The gesture mock records the tap's chained configuration for the same two load-bearing,
 * unrenderable settings `read-screen.test.tsx` documents. That a drag still turns the page is
 * native recognizer behaviour no Jest renderer can see — the simulator smoke proves it.
 */

const mockBack = jest.fn();
const mockNavigate = jest.fn();
const mockCanGoBack = jest.fn<boolean, []>(() => true);

/** Every focus callback the screen registered — the LAST one is the live screen's. */
const mockFocusCallbacks: (() => void)[] = [];
/**
 * Every CLEANUP those callbacks returned — i.e. what a BLUR runs (story 7-8's review).
 *
 * ⚠️ THE MOCK DISCARDED THESE, so the blur edge was unreachable from any test — and blur is what
 * clears the selection when the MODE TOGGLE navigates away, the one navigation that leaves this
 * screen's chrome revealed behind the other renderer.
 */
const mockBlurCallbacks: (void | (() => void))[] = [];

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useRouter: () => ({
      back: mockBack,
      navigate: mockNavigate,
      replace: jest.fn(),
      canGoBack: () => mockCanGoBack(),
      push: jest.fn(),
      dismissAll: jest.fn(),
    }),
    useSegments: () => ['(tabs)'],
    useFocusEffect: (callback: () => void | (() => void)) => {
      React.useEffect(() => {
        mockFocusCallbacks.push(callback);
        mockBlurCallbacks.push(callback());
      }, [callback]);
    },
  };
});

const mockScrollToIndex = jest.fn();
/** Captured on every render so a case can assert what the list was configured with. */
const mockListProps: Record<string, unknown>[] = [];

jest.mock('@shopify/flash-list', () => {
  const React = require('react');
  const { View } = require('react-native');
  const FlashList = React.forwardRef((props: any, ref: any) => {
    mockListProps.push(props);
    React.useImperativeHandle(ref, () => ({
      scrollToIndex: mockScrollToIndex,
      scrollToOffset: jest.fn(),
    }));
    // Props only — see the file header for why no items render here.
    return React.createElement(View, { testID: props.testID });
  });
  FlashList.displayName = 'FlashList';
  return { __esModule: true, FlashList, MasonryFlashList: FlashList };
});

const mockSetReadingPosition = jest.fn();
const mockReadingPositionRow = {
  current: null as { surah: number; verse: number; updatedAt?: number } | null,
};
/** The saved LISTENING row (story 7-7) — a different thing from the reading one above. */
const mockAudioPositionRow = {
  current: null as { surah: number; verse: number; reciterId: string } | null,
};
/** The chrome row's bookmark reader (story 7-8). */
const mockAddBookmark = jest.fn();
const mockRemoveBookmark = jest.fn();
const mockBookmarksRow = { current: [] as { id: string; surah: number; verse: number }[] };

jest.mock('@/lib/sync', () => ({
  setReadingPosition: (...args: unknown[]) => mockSetReadingPosition(...args),
  useReadingPosition: () => ({ data: mockReadingPositionRow.current }),
  useAudioPosition: () => ({ data: mockAudioPositionRow.current }),
  usePreferences: () => ({ data: null }),
  // ⚠️ THE CHROME'S FOOTER READS BOOKMARKS SINCE STORY 7-8 — `ChromeVerseRow`'s control acts on
  // the SELECTED pair, so the mushaf now mounts a bookmark reader it never had. Mocked, like
  // every other sync door in this file; the row's own behaviour is `ChromeVerseRow.test.tsx`'s.
  addBookmark: (...args: unknown[]) => mockAddBookmark(...args),
  removeBookmark: (...args: unknown[]) => mockRemoveBookmark(...args),
  useBookmarks: () => ({ data: mockBookmarksRow.current }),
}));

const mockPreload = jest.fn<Promise<void>, [number]>(() => Promise.resolve());

jest.mock('@/lib/mushafFonts', () => ({
  getPageFontFamily: (page: number) => `QCF_P${String(page).padStart(3, '0')}`,
  loadPageFont: jest.fn(() => Promise.resolve('QCF_P001')),
  preloadAdjacentPageFonts: (page: number) => mockPreload(page),
}));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { getFirstVerseForPage, getPageForVerse, TOTAL_PAGES } from 'quran-data';
import type { ViewToken } from 'react-native';
import Mushaf from '@/app/(tabs)/index';
import { DURATIONS } from '@/constants/animation';
import { useAudioPlayerStore } from '@/stores/audioPlayerStore';

/** The most recent props the list was rendered with. */
function listProps(): Record<string, unknown> {
  return mockListProps[mockListProps.length - 1];
}

/** Drive the viewability callback the way FlashList would — `item` is the PAGE number. */
function settleOnPage(page: number) {
  const handler = listProps().onViewableItemsChanged as (info: {
    viewableItems: ViewToken<number>[];
  }) => void;
  act(() => handler({ viewableItems: [{ item: page, key: '', index: 0, isViewable: true }] }));
}

/**
 * Press the page's HEADER BAND — the mushaf's chrome toggle since 2026-09-10.
 *
 * ⚠️ THE SCREEN BUILDS NO GESTURE AT ALL ANY MORE, so there is nothing here to fake. The bands
 * live inside `MushafPage` (driven for real in `MushafPage.test.tsx`); the list mock renders no
 * items, so what this file checks is the SCREEN half — that the page is handed a working toggle.
 */
function tapBand() {
  act(() => pageProps(42).onToggleChrome?.());
}

/**
 * The props `renderPage` hands `MushafPage` for a given page. The list mock renders no items
 * (see the file header), so this is how the screen→page wiring is inspected.
 */
function pageProps(page: number): {
  activeVerseKey?: string | null;
  onSelectVerse?: (surah: number, verse: number) => void;
  selectedVerseKey?: string | null;
  onToggleChrome?: () => void;
} {
  const renderItem = listProps().renderItem as (info: { item: number }) => {
    props: { children: { props: Record<string, unknown> } };
  };
  return renderItem({ item: page }).props.children.props;
}

/**
 * Fire the screen's focus effects again — what a tab switch back to this screen does.
 *
 * ⚠️ ALL OF THEM, NOT THE LAST ONE — see `read-screen.test.tsx` for the same note. Story 7-1 added
 * a second `useFocusEffect` (the tracker that keeps an unfocused surface from writing the
 * listening position), and "the last one" quietly stopped meaning "the resync".
 */
function refocus() {
  act(() => {
    for (const callback of mockFocusCallbacks) mockBlurCallbacks.push(callback?.());
  });
}

/** Run every cleanup those focus callbacks returned — what leaving this tab does. */
function blur() {
  act(() => {
    for (const cleanup of mockBlurCallbacks) if (typeof cleanup === 'function') cleanup();
  });
}

function chromeTouches(): unknown {
  return screen.getByTestId('reading-chrome-header', { includeHiddenElements: true }).props
    .pointerEvents;
}

async function revealChrome() {
  tapBand();
  await waitFor(() => expect(chromeTouches()).toBe('box-none'));
}

/**
 * ⚠️ THE CHROME DESCRIBE RUNS ON FAKE TIMERS — see `read-screen.test.tsx` for the full note. The
 * chrome dwells since story 7-6, so a chrome case that grew one more `waitFor` could outlive the
 * reveal it is asserting about on a loaded machine. The page-failure describe below stays on the
 * real clock: those reveals come from `show()` and are sticky, so no dwell is ever armed there.
 */
let fakeTimers = false;

/**
 * Wait out everything a reveal needs to reach `pointerEvents`: the timing itself plus the
 * `runOnJS` hop that flips `interactive`. `revealChrome` polls for the POSITIVE answer and can
 * stop early; a case asserting the chrome did NOT come back has to burn the same wall-clock or
 * it passes vacuously.
 */
async function settle() {
  if (fakeTimers) {
    await act(async () => {
      jest.advanceTimersByTime(DURATIONS.standard * 2);
    });
    return;
  }
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, DURATIONS.standard * 2));
  });
}

/** The chrome did not move: still no touches once a reveal would have finished. */
async function expectChromeStayedHidden() {
  await settle();
  expect(chromeTouches()).toBe('none');
}

beforeEach(() => {
  jest.clearAllMocks();
  mockListProps.length = 0;
  mockFocusCallbacks.length = 0;
  mockBlurCallbacks.length = 0;
  mockCanGoBack.mockReturnValue(true);
  mockReadingPositionRow.current = null;
  mockAudioPositionRow.current = null;
});

describe('the reversed pager', () => {
  it('holds all 604 pages, page 604 first and page 1 last — the RTL turn', () => {
    render(<Mushaf />);
    const data = listProps().data as number[];
    expect(data).toHaveLength(TOTAL_PAGES);
    expect(data[0]).toBe(604);
    expect(data[603]).toBe(1);
    // MUTATION: `inverted` instead of reversed data — the pre-fork measured it breaking web
    // scroll/drag, and reversed data is the one strategy for all platforms.
    expect(listProps().inverted).toBeUndefined();
  });

  it('pages horizontally, one screen per page', () => {
    render(<Mushaf />);
    expect(listProps().horizontal).toBe(true);
    expect(listProps().pagingEnabled).toBe(true);
    expect(listProps().showsHorizontalScrollIndicator).toBe(false);
  });

  it('is never wired to a scroll handler', () => {
    // The same mutation `read-screen.test.tsx` pins: a write (or anything) per scroll tick.
    render(<Mushaf />);
    expect(listProps().onScroll).toBeUndefined();
    expect(listProps().onViewableItemsChanged).toBeInstanceOf(Function);
  });

  it('keys pages stably', () => {
    render(<Mushaf />);
    const keyExtractor = listProps().keyExtractor as (item: number) => string;
    expect(keyExtractor(42)).toBe('page-42');
  });
});

describe('where it opens', () => {
  it('opens at the saved pair’s page — declaratively, uniform items making the index exact', () => {
    // 2:255 sits on page 42 of the Madinah mushaf; page 42 sits at index 604−42 under the
    // reversed data.
    mockReadingPositionRow.current = { surah: 2, verse: 255 };
    render(<Mushaf />);
    expect(listProps().initialScrollIndex).toBe(TOTAL_PAGES - 42);
  });

  it('re-targets when the saved row arrives AFTER the first render', async () => {
    // ⚠️ THE DEFECT THIS PINS LOST THE RESTORE FOR A WHOLE SESSION, NOT JUST A MOMENT.
    // `readCache` answers `undefined` while there is no user id, and the anonymous session
    // resolves after the first render — so `opening` captured page 1, and the focus resync could
    // not correct it because on mount the fresh page and the visible page were both 1. Measured
    // in WebKit 2026-09-10: a saved Al-Kahf position (page 293) opened page 1 and was still there
    // ten seconds later. MUTATION: delete the late-restore effect — this reddens.
    mockReadingPositionRow.current = null;
    const view = render(<Mushaf />);
    expect(listProps().initialScrollIndex).toBe(TOTAL_PAGES - 1);

    mockReadingPositionRow.current = { surah: 18, verse: 1 };
    view.rerender(<Mushaf />);
    await waitFor(() =>
      expect(mockScrollToIndex).toHaveBeenCalledWith({
        index: TOTAL_PAGES - getPageForVerse(18, 1),
        animated: false,
      })
    );
  });

  it('does NOT re-target a second time — the row landing is one shot', async () => {
    // MUTATION: latch on a successful re-target instead of on first sight of a row. TanStack
    // hands back a fresh object identity, so the effect re-runs on later renders and would drag
    // the reader back to the saved page after they had turned away.
    mockReadingPositionRow.current = null;
    const view = render(<Mushaf />);
    mockReadingPositionRow.current = { surah: 18, verse: 1 };
    view.rerender(<Mushaf />);
    await waitFor(() => expect(mockScrollToIndex).toHaveBeenCalled());
    mockScrollToIndex.mockClear();

    mockReadingPositionRow.current = { surah: 2, verse: 255 };
    view.rerender(<Mushaf />);
    expect(mockScrollToIndex).not.toHaveBeenCalled();
  });

  it('opens at page 1 with no saved row', () => {
    render(<Mushaf />);
    expect(listProps().initialScrollIndex).toBe(TOTAL_PAGES - 1);
  });

  it('clamps an invalid pair to page 1 — resolved as a PAIR, not half-trusted', () => {
    // A pair the verse↔page map does not hold answers -1; 1:999 is a corrupt or newer-build row.
    mockReadingPositionRow.current = { surah: 1, verse: 999 };
    render(<Mushaf />);
    expect(listProps().initialScrollIndex).toBe(TOTAL_PAGES - 1);
  });
});

describe('the position write', () => {
  it('writes NOTHING while the reader stays on the opening page', () => {
    // The opening page's own settle is the RESTORE landing, not a move — and reporting its first
    // verse would overwrite the saved 2:255 with the earlier 2:253 (page 42's first verse).
    mockReadingPositionRow.current = { surah: 2, verse: 255 };
    render(<Mushaf />);
    settleOnPage(42);
    for (let i = 0; i < 10; i++) settleOnPage(42);
    expect(mockSetReadingPosition).not.toHaveBeenCalled();
  });

  it('writes exactly once per page change — the page’s first verse, mode mushaf', () => {
    mockReadingPositionRow.current = { surah: 2, verse: 255 };
    render(<Mushaf />);
    settleOnPage(42);
    settleOnPage(41);
    const first = getFirstVerseForPage(41);
    expect(mockSetReadingPosition).toHaveBeenCalledTimes(1);
    expect(mockSetReadingPosition.mock.calls[0][0]).toMatchObject({
      surah: first.surah,
      verse: first.verse,
      page: 41,
      mode: 'mushaf',
    });
  });

  it('writes zero more times for jitter on the settled page', () => {
    mockReadingPositionRow.current = { surah: 2, verse: 255 };
    render(<Mushaf />);
    settleOnPage(42);
    settleOnPage(41);
    for (let i = 0; i < 20; i++) settleOnPage(41);
    expect(mockSetReadingPosition).toHaveBeenCalledTimes(1);
  });

  it('writes again when the reader moves on — including back to where they opened', () => {
    mockReadingPositionRow.current = { surah: 2, verse: 255 };
    render(<Mushaf />);
    settleOnPage(41);
    settleOnPage(42);
    // Returning to page 42 is a real move now; its first verse is written, not the saved 2:255.
    expect(mockSetReadingPosition).toHaveBeenCalledTimes(2);
    expect(mockSetReadingPosition.mock.calls[1][0]).toMatchObject({
      ...getFirstVerseForPage(42),
      page: 42,
      mode: 'mushaf',
    });
  });

  it('re-aims the ±2 font preload at every settled page', () => {
    render(<Mushaf />);
    expect(mockPreload).toHaveBeenCalledWith(1); // the opening page, on mount
    settleOnPage(2);
    expect(mockPreload).toHaveBeenLastCalledWith(2);
  });
});

describe('the focus resync — one position, two renderers (story 6-6)', () => {
  it('jumps to the page where the OTHER renderer moved the pair, on focus', () => {
    mockReadingPositionRow.current = { surah: 2, verse: 255 }; // page 42
    const view = render(<Mushaf />);
    // Reading mode moves the position while this tab is blurred; the mounted position hook
    // re-renders the screen (rerender stands in for that), then the tab regains focus.
    mockReadingPositionRow.current = { surah: 18, verse: 1 };
    view.rerender(<Mushaf />);
    refocus();
    const page = getPageForVerse(18, 1);
    expect(mockScrollToIndex).toHaveBeenCalledWith({
      index: TOTAL_PAGES - page,
      animated: false,
    });
    // …and the preload re-aims at the new page.
    expect(mockPreload).toHaveBeenLastCalledWith(page);
  });

  it('does NOTHING on a focus where the pair still resolves to the visible page', () => {
    mockReadingPositionRow.current = { surah: 2, verse: 255 };
    const view = render(<Mushaf />);
    settleOnPage(42);
    view.rerender(<Mushaf />);
    refocus();
    expect(mockScrollToIndex).not.toHaveBeenCalled();
  });

  it('a resync landing is a RESTORE, not a move — its settle writes nothing', () => {
    mockReadingPositionRow.current = { surah: 2, verse: 255 };
    const view = render(<Mushaf />);
    settleOnPage(42); // the opening restore settles; no write
    mockReadingPositionRow.current = { surah: 18, verse: 1 };
    view.rerender(<Mushaf />);
    refocus();
    const page = getPageForVerse(18, 1);
    settleOnPage(page); // the resync's own landing
    // Writing here would clobber 18:1 with the page's first verse — the same clobber the
    // opening latch exists for, so the latch re-arms on every resync.
    expect(mockSetReadingPosition).not.toHaveBeenCalled();
    // …and moving on afterwards writes normally, so the re-armed latch is not a mute button.
    settleOnPage(page - 1);
    expect(mockSetReadingPosition).toHaveBeenCalledTimes(1);
  });
});

describe('the chrome, and the two bands that toggle it', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    fakeTimers = true;
  });
  afterEach(() => {
    fakeTimers = false;
    jest.useRealTimers();
  });

  it('starts HIDDEN — the mushaf is immersive when it renders', () => {
    render(<Mushaf />);
    expect(chromeTouches()).toBe('none');
  });

  it('toggles: the band reveals it, and the band puts it away again', async () => {
    render(<Mushaf />);
    await revealChrome();
    tapBand();
    await expectChromeStayedHidden();
  });

  it('builds NO gesture recogniser — the bands are the whole mechanism', () => {
    // ⚠️ THE REGRESSION THIS GUARDS IS RE-ADDING THE SURFACE TAP. While one existed, RNGH's
    // recogniser and RN's responder both saw every touch, and only their dispatch order decided
    // whether a word press ALSO toggled the chrome — 2-4 leaks per 14 synthetic taps, measured on
    // a Pixel 9 Pro 2026-09-10 and logged in `deferred-work.md`. One touch system is what makes
    // that race unwritable rather than merely unlikely, so a recogniser reappearing on this
    // screen is the thing to catch.
    const source = readFileSync(join(__dirname, '..', '..', 'app', '(tabs)', 'index.tsx'), 'utf8');
    // ⚠️ MATCH THE CALL, NOT THE NAME — the docblock explains at length why the recogniser went
    // and names both symbols, so a bare substring scan fails on its own prose.
    expect(source).not.toMatch(/<GestureDetector/);
    expect(source).not.toMatch(/useSurfaceTap\(/);
  });

  it('hands the page a SELECT and a chrome toggle that are separate props', () => {
    // A word press cannot reach the chrome's no-selection path even by accident: the page is
    // given two callbacks and wires them to different things (the words, and the two bands).
    render(<Mushaf />);
    const props = pageProps(42);
    expect(props.onSelectVerse).toBeInstanceOf(Function);
    expect(props.onToggleChrome).toBeInstanceOf(Function);
    expect(props.onSelectVerse).not.toBe(props.onToggleChrome);
  });

  it('names the settled page’s surah — and not the page number, which the page itself draws', async () => {
    mockReadingPositionRow.current = { surah: 2, verse: 255 };
    render(<Mushaf />);
    await revealChrome();
    expect(screen.getByText('Al-Baqarah')).toBeTruthy();
    expect(screen.queryByText('Page 42')).toBeNull();
  });

  it('carries the mode toggle, and it navigates to reading mode', async () => {
    render(<Mushaf />);
    await revealChrome();
    fireEvent.press(screen.getByTestId('chrome-mode-toggle'));
    expect(mockNavigate).toHaveBeenCalledWith('/read');
  });

  it('carries the tab bar, and switching away works', async () => {
    render(<Mushaf />);
    await revealChrome();
    fireEvent.press(screen.getByTestId('chrome-tab-(profile)'));
    expect(mockNavigate).toHaveBeenCalledWith('/account');
  });
});

describe('the welcome-back banner (story 6-3)', () => {
  const EIGHT_DAYS_MS = 8 * 24 * 60 * 60 * 1000;

  it('mounts for a saved row ≥7 days old, naming the saved surah', () => {
    mockReadingPositionRow.current = {
      surah: 2,
      verse: 255,
      updatedAt: Date.now() - EIGHT_DAYS_MS,
    };
    render(<Mushaf />);
    expect(screen.getByTestId('welcome-back-banner')).toBeTruthy();
    expect(screen.getByText('Welcome back. You were reading Al-Baqarah.')).toBeTruthy();
  });

  it('does not mount for a fresh row', () => {
    mockReadingPositionRow.current = { surah: 2, verse: 255, updatedAt: Date.now() };
    render(<Mushaf />);
    expect(screen.queryByTestId('welcome-back-banner')).toBeNull();
  });

  it('dismisses on the first REAL page move — the restore settling is not one', () => {
    mockReadingPositionRow.current = {
      surah: 2,
      verse: 255,
      updatedAt: Date.now() - EIGHT_DAYS_MS,
    };
    render(<Mushaf />);
    // The opening restore lands on page 42 — the latch ignores it, and so must the banner.
    settleOnPage(42);
    expect(screen.getByTestId('welcome-back-banner')).toBeTruthy();
    // …and the first genuine page turn dismisses it.
    settleOnPage(41);
    expect(screen.queryByTestId('welcome-back-banner')).toBeNull();
  });
});

describe('a word press SELECTS its ayah — and makes no sound (story 7-8)', () => {
  const store = () => useAudioPlayerStore.getState();
  const playSurah = jest.fn(async () => {});
  const seekToVerse = jest.fn(async () => {});

  beforeEach(() => {
    playSurah.mockClear();
    seekToVerse.mockClear();
    act(() => {
      store().clearPlayback();
      // What the engine host does at boot; before it the actions are inert, by design.
      store().registerEngineActions({
        playSurah,
        seekToVerse,
        pause: async () => {},
        resume: async () => {},
        stop: async () => {},
        abandonPlayback: async () => {},
      });
    });
  });
  afterEach(() => act(() => store().clearPlayback()));

  it('hands every page the selector and the chrome toggle', () => {
    render(<Mushaf />);
    expect(typeof pageProps(42).onSelectVerse).toBe('function');
    expect(typeof pageProps(42).onToggleChrome).toBe('function');
  });

  it('⚠️ STARTS NOTHING — the whole story, as one case', () => {
    // ⚠️ 7-6 WIRED THIS TO `useVerseSeek`, WHICH PLAYS IN EVERY STATE THAT IS NOT ALREADY
    // PLAYING. On the app's primary surface, where every word is a press target, that made a
    // mistap one tap from recitation out loud — from a cold launch and from paused. MUTATION:
    // hand `useVerseSeek()` back to `onSelectVerse`; both assertions below redden.
    render(<Mushaf />);
    act(() => pageProps(42).onSelectVerse?.(2, 255));
    expect(playSurah).not.toHaveBeenCalled();
    expect(seekToVerse).not.toHaveBeenCalled();
  });

  it('…and does not seek even when that surah is the loaded track', () => {
    // The other half of the rule it used to run: with the track loaded, 7-6 seeked inside it.
    act(() => {
      store().setTrack(2, 'husary', true);
      store().setPlaybackState('playing');
    });
    render(<Mushaf />);
    act(() => pageProps(42).onSelectVerse?.(2, 255));
    expect(seekToVerse).not.toHaveBeenCalled();
    expect(playSurah).not.toHaveBeenCalled();
  });

  it('reveals the chrome and marks the pressed ayah as the selected one', async () => {
    render(<Mushaf />);
    act(() => pageProps(42).onSelectVerse?.(2, 255));
    await waitFor(() => expect(chromeTouches()).toBe('box-none'));
    // The page is told which ayah to underline, in the same `"{surah}:{verse}"` shape the
    // highlight uses — `MushafPage` matches both against `location` prefixes.
    expect(pageProps(42).selectedVerseKey).toBe('2:255');
  });

  it('a BAND press reveals the chrome with NOTHING selected', async () => {
    // MUTATION: route the bands through `revealFor(pair)`. A band names no ayah, so the row would
    // then act on whichever verse happened to be selected last.
    render(<Mushaf />);
    tapBand();
    await waitFor(() => expect(chromeTouches()).toBe('box-none'));
    expect(pageProps(42).selectedVerseKey).toBeNull();
  });

  it('the selection goes when the chrome does — one lifetime, not two', async () => {
    render(<Mushaf />);
    act(() => pageProps(42).onSelectVerse?.(2, 255));
    await waitFor(() => expect(chromeTouches()).toBe('box-none'));
    // The dismiss chevron is `toggle`, which is `revealFor(null)`.
    fireEvent.press(screen.getByTestId('chrome-dismiss'));
    await waitFor(() => expect(chromeTouches()).toBe('none'));
    expect(pageProps(42).selectedVerseKey).toBeNull();
  });

  it('keeps the page renderer identity-stable across a page turn', () => {
    // ⚠️ LOAD-BEARING: `renderPage` is a `useCallback`, and an unstable handler inside it would
    // re-render all 604 pages on every turn. Both new props are stable by construction.
    render(<Mushaf />);
    const before = listProps().renderItem;
    settleOnPage(41);
    expect(listProps().renderItem).toBe(before);
  });
});

describe('the transport’s COLD press — resume where the listening stopped (story 7-7)', () => {
  const store = () => useAudioPlayerStore.getState();
  const playSurah = jest.fn(async () => {});
  const resume = jest.fn(async () => {});

  beforeEach(() => {
    // The chrome dwells (story 7-6) and every case here reveals it to reach the transport.
    jest.useFakeTimers();
    fakeTimers = true;
    playSurah.mockClear();
    resume.mockClear();
    act(() => {
      store().clearPlayback();
      store().registerEngineActions({
        playSurah,
        resume,
        pause: async () => {},
        seekToVerse: async () => {},
        stop: async () => {},
        abandonPlayback: async () => {},
      });
    });
  });
  afterEach(() => {
    act(() => store().clearPlayback());
    fakeTimers = false;
    jest.useRealTimers();
  });

  /**
   * Reveal the chrome and press its play control. ⚠️ The reveal is CONDITIONAL — the chrome
   * dwells rather than latches, so an unconditional band tap on a second press dismisses the bars
   * and the press lands on nothing (`read-screen.test.tsx` carries the same helper).
   */
  /**
   * Press whichever transport the chrome is currently showing.
   *
   * ⚠️ THERE IS EXACTLY ONE, AND WHICH ONE MOVED IN STORY 7-8. The HEADER's play is
   * resume-from-cold (7-7's resolver); once a track is loaded the footer's mini player draws the
   * transport instead and the header YIELDS, because two controls with the same label were two
   * implementations of one thing. So a case that pressed `chrome-play-toggle` unconditionally was
   * pressing a control that no longer exists in the second half of a listening session. The
   * assertion below is what keeps this helper from papering over a state with NO transport.
   */
  async function pressPlay() {
    if (chromeTouches() !== 'box-none') await revealChrome();
    const header = screen.queryByTestId('chrome-play-toggle');
    const mini = screen.queryByTestId('chrome-mini-transport');
    expect([header, mini].filter(Boolean)).toHaveLength(1);
    fireEvent.press((header ?? mini) as NonNullable<typeof header>);
  }

  /** The engine's own sequence — `loading` before `setTrack`, exactly as `startPlayback` runs. */
  function engineStarts(surah: number, verse: number | null, timed = true) {
    act(() => {
      store().setPlaybackState('loading');
      store().setTrack(surah, 'husary', timed);
      if (timed && verse !== null) store().setActiveVerse(verse);
      store().setPlaybackState('playing');
    });
  }

  /**
   * ⚠️ THE SAME RULE AS `read.tsx`, THROUGH THE SAME RESOLVER. Two copies of this branch is what
   * `useVerseSeek` was extracted to prevent, and the failure of a drifted copy here is silent:
   * the reader presses play and hears the page they are on instead of where they stopped.
   */
  it('starts at the SAVED LISTENING verse, not the settled page’s first one', async () => {
    mockAudioPositionRow.current = { surah: 18, verse: 23, reciterId: 'husary' };
    render(<Mushaf />);
    settleOnPage(42); // whose first verse is 2:253 — deliberately not the answer

    await pressPlay();
    expect(playSurah).toHaveBeenCalledWith(18, 23);
  });

  /**
   * ⚠️ THE LITERAL, NOT `getFirstVerseForPage(42)`. Computing the expectation from the very
   * function the screen calls restates the call instead of checking it — the repo's standing rule
   * — and page 42's first verse is 2:253, which the case above already names in prose.
   */
  it('starts at the settled page’s first verse when there is no saved listening row', async () => {
    render(<Mushaf />);
    settleOnPage(42);

    await pressPlay();
    expect(playSurah).toHaveBeenCalledWith(2, 253);
  });

  /**
   * ⚠️ AN UNRESOLVABLE PAGE IS NOT A REASON TO REFUSE A GOOD ROW. `getFirstVerseForPage` answers
   * `{0, 0}` for a page the map does not hold, and the first cut checked that BEFORE consulting
   * the resolver — so a screen that could not name its own page suppressed a saved listening
   * position that named itself perfectly well. The guard belongs on the resolver's answer.
   */
  it('resumes the saved row even when the settled page cannot be resolved', async () => {
    mockAudioPositionRow.current = { surah: 18, verse: 23, reciterId: 'husary' };
    render(<Mushaf />);
    settleOnPage(0);

    await pressPlay();
    expect(playSurah).toHaveBeenCalledWith(18, 23);
  });

  it('plays nothing when neither the page nor a row can name a verse', async () => {
    render(<Mushaf />);
    settleOnPage(0);

    await pressPlay();
    expect(playSurah).not.toHaveBeenCalled();
  });

  it('resumes in place on the second press, without consulting the row', async () => {
    mockAudioPositionRow.current = { surah: 18, verse: 23, reciterId: 'husary' };
    render(<Mushaf />);
    settleOnPage(42);

    await pressPlay();
    engineStarts(18, 23);
    act(() => store().setPlaybackState('paused'));
    playSurah.mockClear();

    await pressPlay();
    expect(resume).toHaveBeenCalledTimes(1);
    expect(playSurah).not.toHaveBeenCalled();
  });

  /**
   * ⚠️ THE PAGER FOLLOWS THE TRACK EVEN WHEN NOTHING CAN HIGHLIGHT — `read.tsx`'s note, on this
   * surface. A track whose manifest cannot name every ayah leaves `activeVerseKey` null for its
   * whole life, so following the KEY alone would leave the reader hearing Al-Kahf while looking
   * at page 42. Al-Kahf's first ayah is on page 293.
   */
  it('turns to a resumed track’s page when its surah has no usable timings', async () => {
    mockAudioPositionRow.current = { surah: 18, verse: 23, reciterId: 'husary' };
    render(<Mushaf />);
    settleOnPage(42);
    await pressPlay();
    mockScrollToIndex.mockClear();

    engineStarts(18, null, false);
    expect(store().activeVerseKey).toBeNull();
    expect(mockScrollToIndex).toHaveBeenCalledWith({
      index: TOTAL_PAGES - 293,
      animated: true,
    });
  });

  /**
   * ⚠️ THE FROZEN BOUNDARY, ONE PAUSE LATER. This surface's stop-write is the more damaging half
   * — it writes the settled page's FIRST verse — so a resumed session pausing here would move the
   * reader to the top of a page they never turned to.
   */
  it('writes NO reading position when the session was resumed somewhere else', async () => {
    mockAudioPositionRow.current = { surah: 18, verse: 23, reciterId: 'husary' };
    render(<Mushaf />);
    settleOnPage(42);
    await pressPlay();
    engineStarts(18, 23);
    settleOnPage(293); // the pager followed the audio
    mockSetReadingPosition.mockClear();

    act(() => store().setPlaybackState('paused'));
    expect(mockSetReadingPosition).not.toHaveBeenCalled();
  });

  /** Anti-vacuity: 7-1's write is suppressed for a RESUME, not switched off. */
  it('still writes it when the session started on the page the reader was on', async () => {
    render(<Mushaf />);
    settleOnPage(42);
    await pressPlay();
    expect(playSurah).toHaveBeenCalledWith(2, 253);
    engineStarts(2, 255);
    settleOnPage(43); // the recitation carried the reader on a page — a write, once it stops
    mockSetReadingPosition.mockClear();

    act(() => store().setPlaybackState('paused'));
    expect(mockSetReadingPosition).toHaveBeenCalledTimes(1);
  });
});

describe('the recitation moves the page, and lights one ayah (story 7-1)', () => {
  const store = () => useAudioPlayerStore.getState();

  beforeEach(() => act(() => store().clearPlayback()));
  // The store is a module singleton — see `read-screen.test.tsx` for what leaks without this.
  afterEach(() => act(() => store().clearPlayback()));

  /** The seam story 6-2 built for exactly this and left unset. */
  const activeKeyOnPage = (page: number) => pageProps(page).activeVerseKey;

  it('hands the page renderer the ayah the engine names', () => {
    render(<Mushaf />);
    expect(activeKeyOnPage(42)).toBeNull();

    act(() => {
      store().setTrack(2, 'husary', true);
      store().setActiveVerse(255);
    });
    // Every page gets the same key; `MushafPage` matches it against its own words' locations, so
    // only the page actually holding 2:255 lights anything.
    expect(activeKeyOnPage(42)).toBe('2:255');
  });

  /**
   * ⚠️ THE CRITERION: audio crossing a page boundary turns the page. The destination is a table
   * read (2:255 is on page 42), never arithmetic on page numbers.
   */
  it('turns to the page holding the active ayah', () => {
    render(<Mushaf />);
    mockScrollToIndex.mockClear();

    act(() => {
      store().setTrack(2, 'husary', true);
      store().setActiveVerse(255);
    });
    expect(mockScrollToIndex).toHaveBeenCalledWith({
      index: TOTAL_PAGES - 42,
      animated: true,
    });
  });

  it('does NOT re-scroll while the recitation stays on the page already shown', () => {
    render(<Mushaf />);
    act(() => {
      store().setTrack(2, 'husary', true);
      store().setActiveVerse(255);
    });
    mockScrollToIndex.mockClear();

    // 2:256 is on page 42 too. A scroll per ayah would make the pager twitch every few seconds.
    act(() => store().setActiveVerse(256));
    expect(mockScrollToIndex).not.toHaveBeenCalled();
  });

  it('writes no position while playing, and one when playback stops', () => {
    render(<Mushaf />);
    act(() => store().setPlaybackState('playing'));
    settleOnPage(300);
    settleOnPage(301);
    expect(mockSetReadingPosition).not.toHaveBeenCalled();

    act(() => store().setPlaybackState('paused'));
    expect(mockSetReadingPosition).toHaveBeenCalledTimes(1);
  });
});

describe('a page that fails reveals the chrome — for the page the reader is ON', () => {
  /** The failure-state callback the screen hands each page, reached through `renderItem`. */
  function pageOnErrorChange(): (page: number, failed: boolean) => void {
    const renderItem = listProps().renderItem as (info: { item: number }) => {
      props: { children: { props: { onErrorChange: (page: number, failed: boolean) => void } } };
    };
    return renderItem({ item: 42 }).props.children.props.onErrorChange;
  }
  const pageOnError = () => {
    const report = pageOnErrorChange();
    return (page: number) => report(page, true);
  };

  it('reveals the chrome when the VISIBLE page reports a failure', async () => {
    mockReadingPositionRow.current = { surah: 2, verse: 255 }; // opens on page 42
    render(<Mushaf />);
    expect(chromeTouches()).toBe('none');
    act(() => pageOnError()(42));
    await waitFor(() => expect(chromeTouches()).toBe('box-none'));
  });

  it('reveals it when a page that ALREADY failed off-screen becomes the visible one', async () => {
    // ⚠️ THE REGRESSION, AND IT IS THE COMMON CASE OFFLINE. FlashList renders neighbours
    // off-screen, so the page the reader swipes to has already loaded, already failed and
    // already reported it before the viewability callback makes it current.
    mockReadingPositionRow.current = { surah: 2, verse: 255 }; // opens on page 42
    render(<Mushaf />);
    act(() => pageOnError()(41)); // fails while it is still the off-screen neighbour
    await settle();
    expect(chromeTouches()).toBe('none');
    settleOnPage(41); // …and now the reader is looking at it
    await waitFor(() => expect(chromeTouches()).toBe('box-none'));
  });

  it('forgets a page that recovered, so returning to it does not flash the bars', async () => {
    mockReadingPositionRow.current = { surah: 2, verse: 255 };
    render(<Mushaf />);
    const report = pageOnErrorChange();
    act(() => report(41, true));
    act(() => report(41, false)); // the reader pressed Try Again and it worked
    settleOnPage(41);
    await settle();
    expect(chromeTouches()).toBe('none');
  });

  it('does NOT reveal it for an off-screen neighbour failing its prefetch', async () => {
    mockReadingPositionRow.current = { surah: 2, verse: 255 };
    render(<Mushaf />);
    act(() => pageOnError()(41));
    // ⚠️ THE WAIT IS THE WHOLE CASE. A reveal reaches `pointerEvents` only after the 200ms
    // timing lands and `runOnJS` hops the setter back, so a SYNCHRONOUS assertion here passes
    // whether or not `show()` was called.
    await settle();
    expect(chromeTouches()).toBe('none');
  });

  it('the wait above is long enough to have SEEN a reveal — anti-vacuity', async () => {
    mockReadingPositionRow.current = { surah: 2, verse: 255 };
    render(<Mushaf />);
    act(() => pageOnError()(42));
    await settle();
    expect(chromeTouches()).toBe('box-none');
  });
});

/**
 * ⚠️ THE SELECTION CANNOT OUTLIVE WHAT IT POINTS AT (story 7-8's review) — and a mushaf page turn
 * is the fastest way to lose sight of it, because a settled page changes nothing about `visible`.
 */
describe('the selection cannot outlive what it points at (story 7-8 review)', () => {
  it('a settled PAGE clears it — the ayah was on the page the reader turned away from', async () => {
    // MUTATION: drop `clearSelection()` from the viewability handler. The row keeps offering
    // play-from-here for a verse two pages back, bounded only by the 5s dwell.
    render(<Mushaf />);
    act(() => pageProps(1).onSelectVerse?.(1, 3));
    await waitFor(() => expect(chromeTouches()).toBe('box-none'));
    expect(pageProps(1).selectedVerseKey).toBe('1:3');

    settleOnPage(42);
    expect(pageProps(42).selectedVerseKey).toBeNull();
  });

  it('BLUR clears it — the mode toggle leaves this chrome revealed behind the other renderer', () => {
    render(<Mushaf />);
    act(() => pageProps(1).onSelectVerse?.(1, 3));
    expect(pageProps(1).selectedVerseKey).toBe('1:3');
    blur();
    expect(pageProps(1).selectedVerseKey).toBeNull();
  });

  it('a SECOND WORD of the already-selected ayah re-arms — it does NOT throw the chrome away', async () => {
    // ⚠️ THE MUSHAF CASE THE FIRST CUT GOT WRONG. `samePair` matches at AYAH granularity and a
    // verse is many words, so "a repeat press dismisses" meant pressing another word of the verse
    // you are acting on lost the chrome and the selection mid-decision. Only an EMPTY press —
    // one of the two bands — dismisses. MUTATION: restore the dismissal; both assertions redden.
    render(<Mushaf />);
    act(() => pageProps(42).onSelectVerse?.(2, 255));
    await waitFor(() => expect(chromeTouches()).toBe('box-none'));

    act(() => pageProps(42).onSelectVerse?.(2, 255));
    expect(chromeTouches()).toBe('box-none');
    expect(pageProps(42).selectedVerseKey).toBe('2:255');
  });
});
