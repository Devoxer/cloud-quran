/**
 * `/read` — the reading surface, driven (story 6-1; a TAB ROUTE with our chrome since 6-6).
 *
 * ⚠️ THE CLOSE-BUTTON CASES ARE GONE BECAUSE THE CLOSE BUTTON IS: the surface is a tab route now,
 * and the way out is the TAB BAR the reveal brings back (plus the mode toggle). What survives
 * from the old "door" block is the intent — a failed surface must reveal an exit, and the exit
 * must actually navigate — re-aimed at the controls that exist.
 *
 * ⚠️ FLASHLIST IS MOCKED LOCALLY, OVERRIDING `jest.setup.js`'s FlatList stand-in. Two reasons the
 * global one does not serve here: FlatList refuses `scrollToIndex` without `getItemLayout` — and
 * this story forbids `getItemLayout` outright — so the restore case could not be observed at all;
 * and the imperative ref is exactly what the restore IS, so it has to be inspectable.
 *
 * ⚠️ GESTURE HANDLER IS MOCKED LOCALLY TOO, AND THE MOCK RECORDS THE GESTURE'S CONFIGURATION
 * RATHER THAN JUST SWALLOWING IT. Two of its three chained settings are load-bearing in ways
 * nothing renders: `runOnJS(true)` (the callback is a React setter, not a worklet) and
 * `cancelsTouchesInView(false)` (RNGH's default cancels the RN touch when the tap recognises,
 * which would silently kill every `Pressable` inside the gesture's area). Both are asserted.
 * What no Jest renderer can see is that a drag still scrolls — the simulator smoke proves that.
 *
 * ⚠️ `useFocusEffect` IS MOCKED TO RUN ON MOUNT AND TO BE RE-FIREABLE — story 6-6's focus resync
 * ("one position, two renderers") is driven by calling the captured callback again, the way a tab
 * switch back to this screen would. A resync test MUST `rerender()` first: in production the
 * mounted position hook re-renders this screen when the other renderer writes the pair (that is
 * how `savedRef` is fresh at focus time), and `rerender` is that re-render.
 */

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockNavigate = jest.fn();
const mockCanGoBack = jest.fn<boolean, []>(() => true);

/** Every focus callback the screen registered — the LAST one is the live screen's. */
const mockFocusCallbacks: (() => void)[] = [];

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useRouter: () => ({
      back: mockBack,
      replace: mockReplace,
      navigate: mockNavigate,
      canGoBack: () => mockCanGoBack(),
      push: jest.fn(),
      dismissAll: jest.fn(),
    }),
    useSegments: () => ['(tabs)', 'read'],
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
const mockScrollToOffset = jest.fn();
/** Captured on every render so a case can assert what the list was configured with. */
const mockListProps: Record<string, unknown>[] = [];

jest.mock('@shopify/flash-list', () => {
  const React = require('react');
  const { View } = require('react-native');
  const FlashList = React.forwardRef((props: any, ref: any) => {
    mockListProps.push(props);
    React.useImperativeHandle(ref, () => ({
      scrollToIndex: mockScrollToIndex,
      scrollToOffset: mockScrollToOffset,
    }));
    const data = props.data ?? [];
    return React.createElement(
      View,
      { testID: props.testID },
      data.map((item: any, index: number) =>
        React.createElement(
          React.Fragment,
          { key: props.keyExtractor(item, index) },
          props.renderItem({ item, index })
        )
      ),
      props.ListFooterComponent ?? null
    );
  });
  FlashList.displayName = 'FlashList';
  return { __esModule: true, FlashList, MasonryFlashList: FlashList };
});

const mockSetReadingPosition = jest.fn();
const mockReadingPositionRow = { current: null as { surah: number; verse: number } | null };
const mockPreferencesRow = { current: null as { fontSize?: number } | null };

jest.mock('@/lib/sync', () => ({
  setReadingPosition: (...args: unknown[]) => mockSetReadingPosition(...args),
  useReadingPosition: () => ({ data: mockReadingPositionRow.current }),
  usePreferences: () => ({ data: mockPreferencesRow.current }),
}));

const mockGetSurahVerses = jest.fn();
const mockGetSurahMetadata = jest.fn();

jest.mock('@/lib/quranDb', () => ({
  getSurahVerses: (...args: unknown[]) => mockGetSurahVerses(...args),
  getSurahMetadata: (...args: unknown[]) => mockGetSurahMetadata(...args),
}));

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ViewToken } from 'react-native';
import Read from '@/app/(tabs)/read';
import { ARABIC_FONT_SIZE, UTHMANI_FONT_FAMILY } from '@/constants/arabic';
// ⚠️ THE CONSTANT, NOT A LITERAL `56`. The padding case is the surviving half of a coupling whose
// other half (`ReadingChrome.test.tsx` asserting the bar RENDERS at this height) story 6-6
// deleted; measuring the padding against a hand-typed number would leave the pair free to drift
// apart in both directions at once.
import { CHROME_BAR_HEIGHT } from '@/constants/navigation';

type TestVerse = { surah: number; verse: number; textUthmani: string; textSimple: string };

function versesOf(surah: number, count: number): TestVerse[] {
  return Array.from({ length: count }, (_, i) => ({
    surah,
    verse: i + 1,
    textUthmani: `أية ${surah}:${i + 1}`,
    textSimple: `aya ${surah}:${i + 1}`,
  }));
}

/** The most recent props the list was rendered with. */
function listProps(): Record<string, unknown> {
  return mockListProps[mockListProps.length - 1];
}

/** Drive the viewability callback the way FlashList would. */
function reportVisible(item: TestVerse) {
  const handler = listProps().onViewableItemsChanged as (info: {
    viewableItems: ViewToken<TestVerse>[];
  }) => void;
  act(() => handler({ viewableItems: [{ item, key: '', index: 0, isViewable: true }] }));
}

/** Tap the reading surface — the screen's ONE gesture, and the chrome's only reveal. */
function tapSurface() {
  const tap = mockTaps[mockTaps.length - 1];
  act(() => tap.end?.());
}

/** Fire the screen's focus effect again — what a tab switch back to this screen does. */
function refocus() {
  const callback = mockFocusCallbacks[mockFocusCallbacks.length - 1];
  act(() => callback?.());
}

/**
 * The chrome bar's touch state — `'none'` while dismissed or still fading in.
 *
 * ⚠️ `includeHiddenElements` IS REQUIRED, AND THAT IS ITSELF THE PROOF OF ANOTHER FIX. A dismissed
 * bar carries `accessibilityElementsHidden` / `importantForAccessibility` as well as
 * `pointerEvents: 'none'`, so RNTL — which models the accessibility tree — cannot see it by
 * default. Before that fix every query below found the chrome's controls while they were
 * invisible, which is exactly what a VoiceOver or TalkBack user experienced.
 */
function chromeTouches(): unknown {
  return screen.getByTestId('reading-chrome-header', { includeHiddenElements: true }).props
    .pointerEvents;
}

/** Tap, then wait for the reveal to settle — which is when the bars re-enter both trees. */
async function revealChrome() {
  tapSurface();
  await waitFor(() => expect(chromeTouches()).toBe('box-none'));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockListProps.length = 0;
  mockTaps.length = 0;
  mockFocusCallbacks.length = 0;
  mockCanGoBack.mockReturnValue(true);
  mockReadingPositionRow.current = null;
  mockPreferencesRow.current = null;
  mockGetSurahVerses.mockImplementation(async (surah: number) =>
    surah >= 1 && surah <= 114 ? versesOf(surah, surah === 2 ? 286 : 7) : []
  );
  mockGetSurahMetadata.mockImplementation(async (surah: number) =>
    surah >= 1 && surah <= 114
      ? {
          number: surah,
          nameArabic: 'x',
          nameEnglish: 'x',
          nameTransliteration: surah === 1 ? 'Al-Fatihah' : 'Al-Baqarah',
          verseCount: surah === 2 ? 286 : 7,
          revelationType: 'meccan' as const,
          order: 1,
        }
      : null
  );
});

describe('it shows verses', () => {
  it('renders Al-Fatiha in the Uthmani face, at the Arabic scale', async () => {
    render(<Read />);
    await screen.findByText('أية 1:7');
    // Every verse of the surah, not a window of them.
    for (let verse = 1; verse <= 7; verse++)
      expect(screen.getByText(`أية 1:${verse}`)).toBeTruthy();
    const style = screen.getByText('أية 1:1').props.style.flat(2);
    const flat = Object.assign({}, ...style.filter(Boolean));
    expect(flat.fontFamily).toBe(UTHMANI_FONT_FAMILY);
    expect(flat.fontSize).toBe(ARABIC_FONT_SIZE.default);
    // Arabic sets its own direction locally; the app itself stays LTR (no RTL infrastructure).
    expect(flat.writingDirection).toBe('rtl');
  });

  it('sizes the verse from the reader’s synced preference, clamped', async () => {
    // ⚠️ THE ONLY CASE THAT RUNS THE PREFERENCE PATH AT ALL. Every other one mocks
    // `usePreferences` as `{ data: null }`, which exercises only `clampArabicFontSize`'s default
    // branch. Story 6.5 ships the picker; the READ side is this story's.
    mockPreferencesRow.current = { fontSize: 1000 };
    render(<Read />);
    await screen.findByText('أية 1:1');
    const style = screen.getByText('أية 1:1').props.style.flat(2);
    const flat = Object.assign({}, ...style.filter(Boolean));
    expect(flat.fontSize).toBe(ARABIC_FONT_SIZE.max);
  });

  it('renders the longest surah without a fixed-height estimate', async () => {
    mockReadingPositionRow.current = { surah: 2, verse: 1 };
    render(<Read />);
    await screen.findByText('أية 2:286');
    // MUTATION: reintroducing a height estimate. FlashList v2 dropped `getItemLayout`, and story
    // 1-7.5 fixed "scrolls to the wrong place" by REMOVING the abstraction — a fixed estimate
    // accumulated thousands of pixels of error over these 286 verses.
    expect(listProps().getItemLayout).toBeUndefined();
    expect(listProps().estimatedItemSize).toBeUndefined();
    expect(listProps().initialScrollIndex).toBeUndefined();
  });

  it('surfaces an unreadable database as an error with a retry, never a blank screen', async () => {
    // `captureException` logs to the console under `__DEV__`; the failure here is the point of
    // the case, so the log is silenced rather than left to look like a broken suite.
    const logged = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetSurahVerses.mockRejectedValue(new Error('asset missing'));
    render(<Read />);
    const view = await screen.findByTestId('reading-error');
    expect(view).toBeTruthy();
    // The retry re-runs the read — `lib/quranDb.ts` deliberately does not cache a failed open.
    mockGetSurahVerses.mockImplementation(async () => versesOf(1, 7));
    fireEvent.press(screen.getByText('Try Again'));
    await screen.findByText('أية 1:7');
    // Anti-vacuity: the failure really was reported, not swallowed. Nothing else in the app would
    // ever tell us the bundled Quran text could not be opened on a reader's device.
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it('gives a surah that reads clean and EMPTY its own surface, not a blank one', async () => {
    // ⚠️ A DIFFERENT FAILURE FROM THE ONE ABOVE, AND IT SHIPPED AS A BLANK SCREEN FOR A ROUND.
    // `getSurahVerses` answers `[]` rather than throwing for anything it cannot find, so `error`
    // stayed null, the list rendered nothing, and the next-surah control — being the list's
    // FOOTER, gated on `verses.length > 0` — was not there either.
    mockGetSurahVerses.mockImplementation(async () => []);
    render(<Read />);
    await screen.findByTestId('reading-error');
    expect(screen.getByText('No verses to show')).toBeTruthy();
    expect(screen.getByText('Try Again')).toBeTruthy();
  });

  it('reveals the chrome on a failed surface, because a tap is not a discoverable exit there', async () => {
    // The chrome is hidden on arrival everywhere else — one tap brings it back. On a screen that
    // has FAILED, "guess that a tap does something" is not an exit. The tab bar the reveal
    // brings back is the way out, and it must actually navigate.
    mockGetSurahVerses.mockImplementation(async () => []);
    render(<Read />);
    await screen.findByTestId('reading-error');
    await waitFor(() => expect(screen.getByTestId('chrome-tab-(profile)')).toBeTruthy());
    fireEvent.press(screen.getByTestId('chrome-tab-(profile)'));
    expect(mockNavigate).toHaveBeenCalledWith('/account');
  });
});

describe('what the chrome says', () => {
  // ⚠️ NOTHING OBSERVED THE TITLE FOR A ROUND ONCE, AND `const title = null` (a blank header
  // forever) passed 1826 tests. The screen's side of the wiring is covered here; the chrome's
  // own render behaviour is `ReadingChrome.test.tsx`'s.
  it('names the surah the rows came from', async () => {
    render(<Read />);
    await screen.findByText('أية 1:1');
    await revealChrome();
    expect(screen.getByText('Al-Fatihah')).toBeTruthy();
  });
});

describe('the position write', () => {
  it('fires once per verse boundary and zero times within a verse', async () => {
    render(<Read />);
    await screen.findByText('أية 1:7');
    const verses = versesOf(1, 7);

    reportVisible(verses[0]);
    for (let i = 0; i < 20; i++) reportVisible(verses[0]);
    expect(mockSetReadingPosition).toHaveBeenCalledTimes(1);

    reportVisible(verses[1]);
    for (let i = 0; i < 20; i++) reportVisible(verses[1]);
    expect(mockSetReadingPosition).toHaveBeenCalledTimes(2);
    expect(mockSetReadingPosition.mock.calls[1][0]).toMatchObject({
      surah: 1,
      verse: 2,
      mode: 'reading',
    });
  });

  it('is never wired to a scroll handler', async () => {
    // MUTATION: write the position from `onScroll` instead of the verse-changed branch. That is
    // the shape of `chrome-render-storm` — a write per scroll tick, which burned a day of the
    // account-wide budget in 4.6 hours from a single client.
    render(<Read />);
    await screen.findByText('أية 1:7');
    expect(listProps().onScroll).toBeUndefined();
    expect(listProps().onViewableItemsChanged).toBeInstanceOf(Function);
  });

  it('keeps the surah in the pair across a surah boundary', async () => {
    mockReadingPositionRow.current = { surah: 2, verse: 1 };
    render(<Read />);
    await screen.findByText('أية 2:1');
    reportVisible({ surah: 2, verse: 1, textUthmani: '', textSimple: '' });
    reportVisible({ surah: 2, verse: 2, textUthmani: '', textSimple: '' });
    // MUTATION: drop the surah from the persisted pair — covered exhaustively in
    // `lib/usePosition.test.ts`; this is the screen's half.
    expect(mockSetReadingPosition).toHaveBeenCalledTimes(1);
    expect(mockSetReadingPosition.mock.calls[0][0]).toMatchObject({ surah: 2, verse: 2 });
  });

  it('writes NOTHING when a surah change scrolls the old rows to the top', async () => {
    // ⚠️ THE ONE LEAK IN THE "ONE WRITE PER VERSE CHANGE" DISCIPLINE, MEASURED. A reader at 1:7
    // tapping "next" once produced `[{1,7}, {1,1}]` before the new rows existed; if the next
    // read then failed, their saved place was permanently the top of the surah they had left.
    render(<Read />);
    await screen.findByText('أية 1:7');
    reportVisible({ surah: 1, verse: 7, textUthmani: '', textSimple: '' });
    expect(mockSetReadingPosition).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByTestId('next-surah-button'));
    // The stale report the scroll provokes, replayed exactly: the old surah's verse 1.
    reportVisible({ surah: 1, verse: 1, textUthmani: '', textSimple: '' });
    expect(mockSetReadingPosition).toHaveBeenCalledTimes(1);

    // …and the NEW surah's rows are reported normally, so the guard is not a mute button.
    await screen.findByText('أية 2:1');
    reportVisible({ surah: 2, verse: 1, textUthmani: '', textSimple: '' });
    expect(mockSetReadingPosition).toHaveBeenCalledTimes(2);
    expect(mockSetReadingPosition.mock.calls[1][0]).toMatchObject({ surah: 2, verse: 1 });
  });
});

describe('cold launch', () => {
  it('restores to the saved (surah, verse) after mount', async () => {
    mockReadingPositionRow.current = { surah: 2, verse: 100 };
    render(<Read />);
    await screen.findByText('أية 2:100');
    // It opened the SAVED surah, and scrolled to that verse's index rather than predicting an
    // offset from a height estimate.
    expect(mockGetSurahVerses).toHaveBeenCalledWith(2);
    await waitFor(() =>
      expect(mockScrollToIndex).toHaveBeenCalledWith({ index: 99, animated: false })
    );
  });

  it('opens at 1:1 with no saved row, and scrolls nothing', async () => {
    mockReadingPositionRow.current = null;
    render(<Read />);
    await screen.findByText('أية 1:1');
    expect(mockGetSurahVerses).toHaveBeenCalledWith(1);
    expect(mockScrollToIndex).not.toHaveBeenCalled();
  });

  it('never applies a saved VERSE to a surah the saved SURAH did not name', async () => {
    // ⚠️ MEASURED DEFECT, AND THE SUBTLEST ONE IN THIS SCREEN. The surah was locked on render one
    // while the restore effect read `saved?.verse` on a LATER render, with no comparison between
    // them. A row that arrives one render late — null first, `{18, 4}` next — opened Al-Fatihah
    // and scrolled to index 3. Under 6-6 a late row is applied only at the next FOCUS, as a PAIR.
    mockReadingPositionRow.current = null;
    render(<Read />);
    await screen.findByText('أية 1:1');
    // The row lands after the first render, and a re-render delivers it.
    mockReadingPositionRow.current = { surah: 18, verse: 4 };
    reportVisible({ surah: 1, verse: 1, textUthmani: '', textSimple: '' });
    await waitFor(() => expect(screen.getByText('أية 1:1')).toBeTruthy());
    expect(mockGetSurahVerses).not.toHaveBeenCalledWith(18);
    expect(mockScrollToIndex).not.toHaveBeenCalled();
  });

  it('falls back to the top when the saved verse is not in the surah', async () => {
    // A corrupted or future-build row (surah 1 has 7 verses). The documented fallback is the
    // top, never a crash and never an out-of-range scroll.
    mockReadingPositionRow.current = { surah: 1, verse: 999 };
    render(<Read />);
    await screen.findByText('أية 1:1');
    expect(mockScrollToIndex).not.toHaveBeenCalled();
  });

  it('falls back to 1:1 — and to a real screen — for a saved SURAH outside the book', async () => {
    // ⚠️ MEASURED DEFECT: `{200, 1}` reached `getSurahVerses(200)`, which answers `[]`. `error`
    // stayed null, the footer control was gated off, and the reader got a blank surface.
    mockReadingPositionRow.current = { surah: 200, verse: 1 };
    render(<Read />);
    await screen.findByText('أية 1:1');
    expect(mockGetSurahVerses).toHaveBeenCalledWith(1);
    expect(mockGetSurahVerses).not.toHaveBeenCalledWith(200);
  });

  it('restores ONCE — moving to the next surah does not re-apply it', async () => {
    mockReadingPositionRow.current = { surah: 1, verse: 5 };
    render(<Read />);
    await screen.findByText('أية 1:5');
    await waitFor(() => expect(mockScrollToIndex).toHaveBeenCalledTimes(1));
    fireEvent.press(screen.getByTestId('next-surah-button'));
    await screen.findByText('أية 2:1');
    // Without the latch, the new surah's list would be yanked to the old surah's saved index.
    expect(mockScrollToIndex).toHaveBeenCalledTimes(1);
    expect(mockScrollToOffset).toHaveBeenCalledWith({ offset: 0, animated: false });
  });
});

describe('the focus resync — one position, two renderers (story 6-6)', () => {
  it('re-targets to where the OTHER renderer moved the pair, on focus', async () => {
    mockReadingPositionRow.current = { surah: 1, verse: 1 };
    const view = render(<Read />);
    await screen.findByText('أية 1:7');
    // The mushaf moves the position while this tab is blurred; the mounted position hook
    // re-renders the screen (rerender stands in for that), then the tab regains focus.
    mockReadingPositionRow.current = { surah: 2, verse: 100 };
    view.rerender(<Read />);
    refocus();
    await screen.findByText('أية 2:100');
    expect(mockGetSurahVerses).toHaveBeenCalledWith(2);
    await waitFor(() =>
      expect(mockScrollToIndex).toHaveBeenCalledWith({ index: 99, animated: false })
    );
  });

  it('does NOTHING on a focus where the pair has not moved — no jump, no reload', async () => {
    mockReadingPositionRow.current = { surah: 2, verse: 100 };
    const view = render(<Read />);
    await screen.findByText('أية 2:100');
    await waitFor(() => expect(mockScrollToIndex).toHaveBeenCalledTimes(1));
    view.rerender(<Read />);
    refocus();
    // A plain tab switch away and back must not scroll the reader or re-read the surah.
    expect(mockScrollToIndex).toHaveBeenCalledTimes(1);
    expect(mockGetSurahVerses.mock.calls.filter(([s]) => s === 2).length).toBeLessThanOrEqual(2);
  });

  it('a resync jump within the SAME surah scrolls to the new verse', async () => {
    mockReadingPositionRow.current = { surah: 2, verse: 10 };
    const view = render(<Read />);
    await screen.findByText('أية 2:10');
    await waitFor(() =>
      expect(mockScrollToIndex).toHaveBeenCalledWith({ index: 9, animated: false })
    );
    mockReadingPositionRow.current = { surah: 2, verse: 255 };
    view.rerender(<Read />);
    refocus();
    await waitFor(() =>
      expect(mockScrollToIndex).toHaveBeenCalledWith({ index: 254, animated: false })
    );
  });
});

describe('the chrome, and the gesture that reveals it', () => {
  it('starts HIDDEN — the screen is immersive when it renders', async () => {
    // ⚠️ THE FROZEN CRITERION: "given the reading screen, when it renders, then it is
    // immersive". Under 6-6 immersion is OURS — the chrome overlays and starts hidden — rather
    // than a `fullScreenModal`'s.
    render(<Read />);
    await screen.findByText('أية 1:1');
    expect(chromeTouches()).toBe('none');
  });

  it('reveals both bars on a tap of the surface — header AND tab bar together', async () => {
    render(<Read />);
    await screen.findByText('أية 1:1');
    await revealChrome();
    expect(screen.getByTestId('reading-chrome-footer').props.pointerEvents).toBe('box-none');
    expect(screen.getByTestId('app-tab-bar')).toBeTruthy();
  });

  it('dismisses them again on the next tap, immediately', async () => {
    render(<Read />);
    await screen.findByText('أية 1:1');
    await revealChrome();
    tapSurface();
    // ⚠️ NO `waitFor` HERE, DELIBERATELY. Touches stop on the LEADING edge of a dismissal while
    // the bars are still drawn; only the reveal waits for the animation to finish.
    expect(chromeTouches()).toBe('none');
  });

  it('configures the gesture so a tap cannot cancel the RN touches underneath it', async () => {
    // ⚠️ RNGH's DEFAULT IS `cancelsTouchesInView: true`: when the tap recognises, UIKit cancels
    // the touch in the RN view tree — which silently kills every `Pressable` inside the
    // gesture's area, i.e. the next-surah control and the error state's retry. And
    // `runOnJS(true)` because the callback is a React state setter, not a worklet.
    render(<Read />);
    await screen.findByText('أية 1:1');
    const tap = mockTaps[mockTaps.length - 1];
    expect(tap.settings).toContain('cancelsTouchesInView(false)');
    expect(tap.settings).toContain('runOnJS(true)');
    expect(tap.end).toBeInstanceOf(Function);
  });

  it('leaves the list content style identical across a toggle', async () => {
    render(<Read />);
    await screen.findByText('أية 1:7');
    const before = { ...(listProps().contentContainerStyle as object) };
    tapSurface();
    const after = { ...(listProps().contentContainerStyle as object) };
    // MUTATION: reserve the chrome's space only while it is shown. Every verse would then move
    // on each tap — the exact failure the acceptance criterion names.
    expect(after).toEqual(before);
  });

  it('reserves BOTH bars in the permanent padding — the tab bar is what the bottom clears now', async () => {
    render(<Read />);
    await screen.findByText('أية 1:7');
    expect(screen.getByTestId('next-surah-button')).toBeTruthy();
    const content = listProps().contentContainerStyle as Record<string, number>;
    // CHROME_BAR_HEIGHT is 56 and the reservation is permanent, so the last verse AND the
    // next-surah control below it stay clear of the revealed tab bar.
    expect(content.paddingBottom).toBeGreaterThan(CHROME_BAR_HEIGHT);
    expect(content.paddingTop).toBeGreaterThan(CHROME_BAR_HEIGHT);
  });

  /**
   * ⚠️ THE TWO CASES BELOW WERE STORY 6-1'S AND STORY 6-6 DELETED THEM, WHILE THE CONTROL THEY
   * GUARD SHIPPED ON UNCHANGED. `nextSurah()` and the label derivation in `(tabs)/read.tsx` both
   * survive the migration; only their coverage did not. Restored verbatim in substance, because
   * a chrome migration is not a licence to retire a reading gate — and because both defects they
   * were written for are silent: a numeric label looks like a loading state, and a dead end at
   * An-Nas looks like the end of the book.
   */
  it('labels and navigates to the SAME surah — one derivation, not three', async () => {
    // ⚠️ `nextSurah(surah)` was computed three times for one press: twice in this screen for the
    // label, once inside the button's own `onPress`. Three places for the label and the
    // destination to disagree. The screen derives it once and passes both halves down.
    render(<Read />);
    await screen.findByText('أية 1:7');
    expect(screen.getByText('Next: Al-Baqarah')).toBeTruthy();
    fireEvent.press(screen.getByTestId('next-surah-button'));
    await waitFor(() => expect(mockGetSurahVerses).toHaveBeenCalledWith(2));
  });

  it('wraps from An-Nas back to Al-Fatiha rather than dead-ending', async () => {
    mockReadingPositionRow.current = { surah: 114, verse: 1 };
    render(<Read />);
    await screen.findByTestId('next-surah-button');
    fireEvent.press(screen.getByTestId('next-surah-button'));
    await waitFor(() => expect(mockGetSurahVerses).toHaveBeenCalledWith(1));
  });

  it('keeps both bars in the tree either way', async () => {
    render(<Read />);
    await screen.findByText('أية 1:7');
    const options = { includeHiddenElements: true } as const;
    expect(screen.getByTestId('reading-chrome-header', options)).toBeTruthy();
    await revealChrome();
    expect(screen.getByTestId('reading-chrome-header', options)).toBeTruthy();
    expect(screen.getByTestId('reading-chrome-footer', options)).toBeTruthy();
  });

  it('hides dismissed controls from VoiceOver and TalkBack, not just from touch', async () => {
    // ⚠️ `pointerEvents` REASONS ABOUT THE TOUCH TREE ONLY. The controls at `opacity: 0` were
    // still first-class citizens of the ACCESSIBILITY tree once; a screen-reader user swiping
    // the reading surface landed on controls nobody could see.
    render(<Read />);
    await screen.findByText('أية 1:1');
    expect(screen.queryByTestId('chrome-mode-toggle')).toBeNull();
    await revealChrome();
    expect(screen.getByTestId('chrome-mode-toggle')).toBeTruthy();
  });

  it('a tappable verse is not a button — and is not tappable at all', async () => {
    // Epic 7's reserved semantics are "a tap on a verse plays audio from it and a tap elsewhere
    // toggles chrome". The rows are text — no `onPress`, and still no `accessibilityRole`, which
    // would announce 286 buttons on Al-Baqarah.
    render(<Read />);
    await screen.findByText('أية 1:7');
    expect(screen.getByTestId('verse-1:1').props.onStartShouldSetResponder).toBeUndefined();
  });

  it('the reading surface is a plain View, never a Pressable wrapping the list', async () => {
    // MUTATION, AND IT IS THE ONE 6-1 ACTUALLY SHIPPED FOR A ROUND: wrap the list in a
    // full-screen `Pressable` so a tap anywhere toggles chrome. It takes the responder on touch
    // START, so a drag inside it never releases — the list does not scroll at all.
    render(<Read />);
    await screen.findByText('أية 1:7');
    expect(screen.getByTestId('reading-surface').props.onStartShouldSetResponder).toBeUndefined();
    expect(
      screen.getByTestId('reading-tap-surface').props.onStartShouldSetResponder
    ).toBeUndefined();
  });

  it('the mode toggle is in the revealed header and goes to the mushaf', async () => {
    render(<Read />);
    await screen.findByText('أية 1:1');
    await revealChrome();
    fireEvent.press(screen.getByTestId('chrome-mode-toggle'));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });
});
