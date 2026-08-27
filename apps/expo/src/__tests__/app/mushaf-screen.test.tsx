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
    useFocusEffect: (callback: () => void) => {
      React.useEffect(() => {
        mockFocusCallbacks.push(callback);
        callback();
      }, [callback]);
    },
  };
});

/** Every tap gesture the screen built, with its chained configuration and its handler. */
const mockTaps: { settings: string[]; end?: () => void }[] = [];

jest.mock('react-native-gesture-handler', () => {
  // ⚠️ NO TYPE ANNOTATIONS INSIDE THIS FACTORY — Jest's hoisting guard rejects any identifier it
  // does not recognise as in-scope, and a TypeScript parameter type is an identifier to it.
  const { View } = require('react-native');
  const Tap = () => {
    const gesture: any = { settings: [] };
    const setting =
      (name: string) =>
      (...args: unknown[]) => {
        gesture.settings.push(`${name}(${args.map(String).join(',')})`);
        return gesture;
      };
    gesture.cancelsTouchesInView = setting('cancelsTouchesInView');
    gesture.runOnJS = setting('runOnJS');
    gesture.maxDuration = setting('maxDuration');
    gesture.maxDistance = setting('maxDistance');
    gesture.onEnd = (callback: any) => {
      gesture.end = callback;
      return gesture;
    };
    mockTaps.push(gesture);
    return gesture;
  };
  const GestureDetector = ({ children }: any) => children;
  return { __esModule: true, Gesture: { Tap }, GestureDetector, GestureHandlerRootView: View };
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
const mockReadingPositionRow = { current: null as { surah: number; verse: number } | null };

jest.mock('@/lib/sync', () => ({
  setReadingPosition: (...args: unknown[]) => mockSetReadingPosition(...args),
  useReadingPosition: () => ({ data: mockReadingPositionRow.current }),
  usePreferences: () => ({ data: null }),
}));

const mockPreload = jest.fn<Promise<void>, [number]>(() => Promise.resolve());

jest.mock('@/lib/mushafFonts', () => ({
  getPageFontFamily: (page: number) => `QCF_P${String(page).padStart(3, '0')}`,
  loadPageFont: jest.fn(() => Promise.resolve('QCF_P001')),
  preloadAdjacentPageFonts: (page: number) => mockPreload(page),
}));

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { getFirstVerseForPage, getPageForVerse, TOTAL_PAGES } from 'quran-data';
import type { ViewToken } from 'react-native';
import Mushaf from '@/app/(tabs)/index';
import { DURATIONS } from '@/constants/animation';

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

/** Tap the surface — the screen's ONE gesture, and the chrome's only reveal. */
function tapSurface() {
  const tap = mockTaps[mockTaps.length - 1];
  act(() => tap.end?.());
}

/** Fire the screen's focus effect again — what a tab switch back to this screen does. */
function refocus() {
  const callback = mockFocusCallbacks[mockFocusCallbacks.length - 1];
  act(() => callback?.());
}

function chromeTouches(): unknown {
  return screen.getByTestId('reading-chrome-header', { includeHiddenElements: true }).props
    .pointerEvents;
}

async function revealChrome() {
  tapSurface();
  await waitFor(() => expect(chromeTouches()).toBe('box-none'));
}

/**
 * Wait out everything a reveal needs to reach `pointerEvents`: the timing itself plus the
 * `runOnJS` hop that flips `interactive`. `revealChrome` polls for the POSITIVE answer and can
 * stop early; a case asserting the chrome did NOT come back has to burn the same wall-clock or
 * it passes vacuously.
 */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, DURATIONS.standard * 2));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockListProps.length = 0;
  mockTaps.length = 0;
  mockFocusCallbacks.length = 0;
  mockCanGoBack.mockReturnValue(true);
  mockReadingPositionRow.current = null;
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

describe('the chrome, and the gesture that reveals it', () => {
  it('starts HIDDEN — the mushaf is immersive when it renders', () => {
    render(<Mushaf />);
    expect(chromeTouches()).toBe('none');
  });

  it('toggles on a tap; a swipe never toggles (nothing but the tap is wired to the reveal)', async () => {
    render(<Mushaf />);
    await revealChrome();
    // The screen wires no scroll/drag callback to the reveal at all — the recognizer failing on
    // movement is what separates swipe from tap, and that half is native (simulator smoke).
    tapSurface();
    expect(chromeTouches()).toBe('none');
  });

  it('configures the tap so it cannot cancel the RN touches underneath it', () => {
    render(<Mushaf />);
    const tap = mockTaps[mockTaps.length - 1];
    expect(tap.settings).toContain('cancelsTouchesInView(false)');
    expect(tap.settings).toContain('runOnJS(true)');
    expect(tap.end).toBeInstanceOf(Function);
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
