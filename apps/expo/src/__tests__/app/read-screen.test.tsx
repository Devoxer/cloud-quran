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
      replace: mockReplace,
      navigate: mockNavigate,
      canGoBack: () => mockCanGoBack(),
      push: jest.fn(),
      dismissAll: jest.fn(),
    }),
    useSegments: () => ['(tabs)', 'read'],
    useFocusEffect: (callback: () => void | (() => void)) => {
      React.useEffect(() => {
        mockFocusCallbacks.push(callback);
        mockBlurCallbacks.push(callback());
      }, [callback]);
    },
  };
});

/**
 * Every tap gesture the screen built, with its chained configuration and its handlers.
 * ⚠️ `finalize` ARRIVED WITH STORY 7-6 and is not decoration: it is the edge that resets the
 * empty-area latch on a FAILED tap (a drag), so a mock without it models a gesture whose
 * suppression never clears.
 */
const mockTaps: { settings: string[]; end?: () => void; finalize?: () => void }[] = [];

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
    gesture.onFinalize = (callback: any) => {
      gesture.finalize = callback;
      return gesture;
    };
    mockTaps.push(gesture);
    return gesture;
  };
  const GestureDetector = ({ children }: any) => children;
  return { __esModule: true, Gesture: { Tap }, GestureDetector, GestureHandlerRootView: View };
});

/**
 * The header reservation every programmatic scroll subtracts, as a LITERAL — `CHROME_BAR_HEIGHT`
 * (56) + the mocked `insets.top` (0) + `SPACING.md` (12). Written out rather than imported and
 * summed, so a change to any of the three reddens this file and has to be looked at: computing it
 * from the same constants the screen uses would restate the screen instead of checking it. A zero
 * here is the regression it guards — `scrollToIndex` aligns to the viewport top, which is BEHIND
 * the overlaying header, so the followed verse's first line was hidden under the bar. NEGATED at
 * the call site: FlashList ADDS `viewOffset` to the target offset, so the positive value pushes
 * the row further under the bar. A flipped sign is the failure this asserts against.
 */
const HEADER_INSET = 68;

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
    // ⚠️ THE MOCK MUST FIRE `onLoad`, OR IT MODELS A LIST THAT NEVER FINISHES MEASURING.
    // The screen defers its restore `scrollToIndex` until FlashList reports it has laid out —
    // that deferral is the fix for a blank reading surface on Android, where scrolling to an
    // unmeasured index overshoots the content. A mock that never calls `onLoad` would make every
    // restore case fail for a reason the real list does not have.
    React.useEffect(() => {
      props.onLoad?.({ elapsedTimeInMs: 0 });
    }, [props.onLoad]);
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
const mockAddBookmark = jest.fn();
const mockRemoveBookmark = jest.fn();
const mockReadingPositionRow = { current: null as { surah: number; verse: number } | null };
/** The saved LISTENING row (story 7-7) — a different thing from the reading one above. */
const mockAudioPositionRow = {
  current: null as { surah: number; verse: number; reciterId: string } | null,
};
const mockPreferencesRow = { current: null as { fontSize?: number } | null };
type TestBookmark = { id: string; surah: number; verse: number };
const mockBookmarksRow = { current: [] as TestBookmark[] };

jest.mock('@/lib/sync', () => ({
  setReadingPosition: (...args: unknown[]) => mockSetReadingPosition(...args),
  addBookmark: (...args: unknown[]) => mockAddBookmark(...args),
  removeBookmark: (...args: unknown[]) => mockRemoveBookmark(...args),
  useReadingPosition: () => ({ data: mockReadingPositionRow.current }),
  useAudioPosition: () => ({ data: mockAudioPositionRow.current }),
  usePreferences: () => ({ data: mockPreferencesRow.current }),
  useBookmarks: () => ({ data: mockBookmarksRow.current }),
}));

// `expo-crypto`'s native module is absent under Jest, so the real `randomUUID()` answers nothing —
// the `auth.test.ts` convention. The screen mints bookmark ids with it.
const mockRandomUUID = jest.fn(() => 'uuid-under-test');
jest.mock('expo-crypto', () => ({ randomUUID: () => mockRandomUUID() }));

const mockGetSurahVerses = jest.fn();
const mockGetSurahMetadata = jest.fn();

jest.mock('@/lib/quranDb', () => ({
  getSurahVerses: (...args: unknown[]) => mockGetSurahVerses(...args),
  getSurahMetadata: (...args: unknown[]) => mockGetSurahMetadata(...args),
}));

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ViewToken } from 'react-native';
import Read from '@/app/(tabs)/read';
// ⚠️ THE CONSTANT, NOT A LITERAL `56`. The padding case is the surviving half of a coupling whose
// other half (`ReadingChrome.test.tsx` asserting the bar RENDERS at this height) story 6-6
// deleted; measuring the padding against a hand-typed number would leave the pair free to drift
// apart in both directions at once.
import { DURATIONS } from '@/constants/animation';
import { ARABIC_FONT_SIZE, UTHMANI_FONT_FAMILY } from '@/constants/arabic';
import { CHROME_BAR_HEIGHT } from '@/constants/navigation';
import { useAudioPlayerStore } from '@/stores/audioPlayerStore';

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

/**
 * Tap the reading surface — the screen's ONE gesture, and the chrome's only reveal.
 * ⚠️ BOTH EDGES, IN HARDWARE ORDER (story 7-6): a recognised tap runs `onEnd` and then
 * `onFinalize`, and the second is what resets the empty-area latch. A helper that fired only
 * `onEnd` would model a gesture that never resets and would go green on a broken reset.
 */
function tapSurface() {
  const tap = mockTaps[mockTaps.length - 1];
  act(() => {
    tap.end?.();
    tap.finalize?.();
  });
}

/** A drag that started somewhere and never recognised — RNGH runs `onFinalize` alone. */
function dragSurface() {
  const tap = mockTaps[mockTaps.length - 1];
  act(() => tap.finalize?.());
}

/**
 * Fire the screen's focus effects again — what a tab switch back to this screen does.
 *
 * ⚠️ ALL OF THEM, NOT THE LAST ONE. This took the newest callback until story 7-1 added a SECOND
 * `useFocusEffect` (the focus tracker that keeps an unfocused surface from writing the listening
 * position), at which point "the last one" silently stopped meaning "the resync" and the 6-6
 * resync cases went green against the wrong effect. A real focus runs every one of them.
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

/**
 * ⚠️ THE CHROME DESCRIBE RUNS ON FAKE TIMERS, AND STORY 7-6 IS WHY. The chrome now DWELLS: a
 * reveal puts itself away after `CHROME_DWELL_MS` (5s) of wall-clock. Every chrome case here
 * reads the bars within milliseconds of revealing them, so none is close to that today — but a
 * case that grew one more `waitFor` would go intermittently red on a loaded machine, and a
 * flake that only appears under load is the worst kind to diagnose. Freezing the clock for that
 * block removes the class rather than the instance. The DWELL ITSELF is covered in
 * `ReadingChrome.test.tsx`, which drives it deliberately.
 *
 * `settle()` below has to work in both modes, because other describes in this file use it on the
 * real clock.
 */
let fakeTimers = false;

/**
 * ⚠️ WAIT OUT A REVEAL BEFORE ASSERTING THERE WASN'T ONE. `chromeTouches()` is `'none'` both when
 * the chrome is dismissed AND while it is still fading in, so a synchronous "expect none" right
 * after a tap passes whether or not the toggle ran — three cases in this file were exactly that
 * restatement until story 7-6's review mutated `useSurfaceTap` and watched them stay green. A
 * reveal reaches `pointerEvents` only after the timing lands and `runOnJS` hops the setter back,
 * so a case asserting the chrome did NOT come back has to burn the same wall-clock first.
 * (`mushaf-screen.test.tsx` has the same helper, for the same reason.)
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
  mockTaps.length = 0;
  mockFocusCallbacks.length = 0;
  mockBlurCallbacks.length = 0;
  mockCanGoBack.mockReturnValue(true);
  mockReadingPositionRow.current = null;
  mockAudioPositionRow.current = null;
  mockPreferencesRow.current = null;
  mockBookmarksRow.current = [];
  mockRandomUUID.mockReturnValue('uuid-under-test');
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

  it('keeps that exit on screen when the reader presses Try Again (story 7-6)', async () => {
    // ⚠️ THE MOST DAMAGING DOUBLE-FIRE OF THE THREE THIS STORY CLOSES. This surface is revealed
    // STICKILY — the chrome carries the ONLY way out of a failed screen — so a retry that also
    // ran the chrome toggle hid that exit AND cleared the sticky mark, at the exact moment the
    // reader was trying to recover. MUTATION: drop `onActionPressIn` from the `ErrorView`.
    mockGetSurahVerses.mockImplementation(async () => []);
    render(<Read />);
    await screen.findByTestId('reading-error');
    await waitFor(() => expect(chromeTouches()).toBe('box-none'));
    fireEvent(screen.getByTestId('error-view-action'), 'pressIn');
    tapSurface();
    // The tap must be a no-op here: the chrome is up and must stay up.
    await settle();
    expect(chromeTouches()).toBe('box-none');
    expect(screen.getByTestId('chrome-tab-(profile)')).toBeTruthy();
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

describe('the recitation, and what it does to the position write (story 7-1)', () => {
  const store = () => useAudioPlayerStore.getState();

  beforeEach(() => {
    act(() => store().clearPlayback());
  });

  // ⚠️ AND AFTER, TOO. The playback store is a module singleton: a test that leaves it `playing`
  // — or holding an active verse key — suppresses the position write and re-targets the surah in
  // every case that follows, in files that have nothing to do with audio.
  afterEach(() => {
    act(() => store().clearPlayback());
  });

  /**
   * ⚠️ THE WRITE-BUDGET CRITERION. An hour of listening advances the verse every few seconds, and
   * `usePosition` writes once per verse CHANGE — which is exactly what an advancing recitation
   * produces. Left unguarded, one commute is hundreds of synced writes. The suppression is what
   * makes "bounded by pause/stop, not by verse count" true.
   */
  it('writes NOTHING while the recitation is playing, however many verses pass', async () => {
    render(<Read />);
    await screen.findByText('أية 1:7');
    act(() => store().setPlaybackState('playing'));

    for (const v of versesOf(1, 7)) reportVisible(v);
    expect(mockSetReadingPosition).not.toHaveBeenCalled();
  });

  it('writes ONCE when playback stops, at the verse the reader stopped on', async () => {
    render(<Read />);
    await screen.findByText('أية 1:7');
    act(() => store().setPlaybackState('playing'));
    reportVisible(versesOf(1, 7)[4]); // 1:5 — recorded in the ref, not written
    expect(mockSetReadingPosition).not.toHaveBeenCalled();

    act(() => store().setPlaybackState('paused'));
    expect(mockSetReadingPosition).toHaveBeenCalledTimes(1);
    expect(mockSetReadingPosition.mock.calls[0][0]).toMatchObject({ surah: 1, verse: 5 });
  });

  it('reports normally again once playback has stopped — the guard is not a mute button', async () => {
    render(<Read />);
    await screen.findByText('أية 1:7');
    act(() => store().setPlaybackState('playing'));
    act(() => store().setPlaybackState('paused'));
    mockSetReadingPosition.mockClear();

    reportVisible(versesOf(1, 7)[2]);
    expect(mockSetReadingPosition).toHaveBeenCalledTimes(1);
    expect(mockSetReadingPosition.mock.calls[0][0]).toMatchObject({ surah: 1, verse: 3 });
  });

  it('highlights exactly the ayah the engine names, and only that one', async () => {
    render(<Read />);
    await screen.findByText('أية 1:7');
    act(() => {
      store().setTrack(1, 'husary', true);
      store().setActiveVerse(4);
    });

    const background = (verse: number) => {
      const style = screen.getByTestId(`verse-1:${verse}`).props.style;
      const parts = (Array.isArray(style) ? style.flat(2) : [style]).filter(Boolean);
      return Object.assign({}, ...parts).backgroundColor;
    };
    const lit = [1, 2, 3, 4, 5, 6, 7].filter((v) => background(v) !== undefined);
    expect(lit).toEqual([4]);
  });

  it('follows the recitation across a surah boundary — the reader does not stay behind', async () => {
    render(<Read />);
    await screen.findByText('أية 1:7');
    act(() => store().setPlaybackState('playing'));
    act(() => {
      store().setTrack(2, 'husary', true);
      store().setActiveVerse(1);
    });
    // The screen re-targets the surah the audio moved to and loads its rows.
    await screen.findByText('أية 2:1');
  });

  it('scrolls the followed verse BELOW the header, not under it', async () => {
    // ⚠️ THE FIRST LINE USED TO BE LOST. The chrome overlays the list, and `scrollToIndex` aligns
    // a row with the top of the VIEWPORT — behind the header — so each ayah the recitation
    // reached parked its opening line under the bar. `viewOffset` is the whole fix; a call
    // arriving without it, or with 0, is the regression.
    render(<Read />);
    await screen.findByText('أية 1:7');
    mockScrollToIndex.mockClear();
    act(() => store().setPlaybackState('playing'));
    act(() => {
      store().setTrack(1, 'husary', true);
      store().setActiveVerse(5);
    });
    await waitFor(() =>
      expect(mockScrollToIndex).toHaveBeenCalledWith({
        index: 4,
        animated: true,
        viewOffset: -HEADER_INSET,
      })
    );
    /**
     * ⚠️ EVERY CALL, NOT JUST ONE MATCHING CALL. Each scroll is a PAIR — an immediate one and a
     * `requestAnimationFrame` repeat — and the repeat runs last, so it decides where the row
     * actually lands. `toHaveBeenCalledWith` is satisfied by any one matching call, so deleting
     * the offset from the rAF call left this suite green while reinstating the whole defect;
     * that was demonstrated on both scroll paths before this assertion existed.
     */
    for (const [arg] of mockScrollToIndex.mock.calls) {
      expect(arg).toMatchObject({ viewOffset: -HEADER_INSET });
    }
  });
});

describe('the transport’s COLD press — resume where the listening stopped (story 7-7)', () => {
  const store = () => useAudioPlayerStore.getState();
  const playSurah = jest.fn(async () => {});
  const resume = jest.fn(async () => {});
  const pause = jest.fn(async () => {});

  beforeEach(() => {
    // See `fakeTimers` above: every case here reveals the chrome to reach the transport, and the
    // chrome dwells.
    jest.useFakeTimers();
    fakeTimers = true;
    playSurah.mockClear();
    resume.mockClear();
    pause.mockClear();
    act(() => {
      store().clearPlayback();
      // What `RecitationEngineHost` does at boot; before it the actions are inert, by design.
      store().registerEngineActions({
        playSurah,
        resume,
        pause,
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
   * Reveal the chrome and press its play control — the only way to the transport.
   *
   * ⚠️ THE REVEAL IS CONDITIONAL, BECAUSE THE CHROME DWELLS RATHER THAN LATCHES. A case that
   * presses twice reaches the second press with the bars sometimes still up (story 7-6's 5s
   * dwell, whether it has elapsed depends on how many `waitFor`s ran in between) — and an
   * unconditional tap DISMISSES them, so the press then lands on nothing.
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

  /**
   * ⚠️ THE ENGINE'S OWN SEQUENCE, NOT A CONVENIENT ONE. `playSurah` is a mock here, so nothing
   * moves the store unless a case moves it — and a case that presses play and then asserts about
   * a listening session without this is asserting about a session that never began. `loading`
   * comes BEFORE `setTrack` because `startPlayback` orders it that way, and `highlightAvailable`
   * false is the truncated-manifest track that leaves `activeVerseKey` null for its whole life.
   */
  function engineStarts(surah: number, verse: number | null, timed = true) {
    act(() => {
      store().setPlaybackState('loading');
      store().setTrack(surah, 'husary', timed);
      if (timed && verse !== null) store().setActiveVerse(verse);
      store().setPlaybackState('playing');
    });
  }

  /**
   * ⚠️ THE FROZEN CRITERION. The reading position and the listening position are DIFFERENT
   * things, and until this story only one of them survived a restart: the row was written at
   * every pause and stop, synced, pulled by the other device — and read by nothing. A relaunch
   * showed the reading position with playback idle, so pressing play started over from whatever
   * verse the reader happened to be scrolled to.
   */
  it('starts at the SAVED LISTENING verse, not the one on screen', async () => {
    mockReadingPositionRow.current = { surah: 1, verse: 1 };
    mockAudioPositionRow.current = { surah: 2, verse: 100, reciterId: 'husary' };
    render(<Read />);
    await screen.findByText('أية 1:1');

    await pressPlay();
    expect(playSurah).toHaveBeenCalledWith(2, 100);
  });

  it('starts where the reader is LOOKING when there is no saved listening row', async () => {
    render(<Read />);
    await screen.findByText('أية 1:7');
    reportVisible(versesOf(1, 7)[4]); // the reader scrolled to 1:5

    await pressPlay();
    expect(playSurah).toHaveBeenCalledWith(1, 5);
  });

  /**
   * ⚠️ A FAILED PRESS MUST NOT COST THE READER THE ROW — and the failure that matters leaves NO
   * track behind. `startPlayback` sets `loading`, tears down, and only then awaits the manifest,
   * so an offline press reaches `setError` with `surah` still null. Nothing but `clearPlayback`
   * returns the store to `idle` and the chrome offers no stop, so a gate that asked for `idle`
   * answered the on-screen verse for the rest of the process: reconnect, press the error
   * surface's Retry, and the recitation silently starts somewhere the reader never chose.
   */
  it('keeps the saved row for the error surface’s RETRY after a failed press', async () => {
    mockAudioPositionRow.current = { surah: 2, verse: 100, reciterId: 'husary' };
    render(<Read />);
    await screen.findByText('أية 1:1');

    await pressPlay();
    expect(playSurah).toHaveBeenCalledWith(2, 100);
    // Offline: loading, then the catch — with no `setTrack` in between.
    act(() => {
      store().setPlaybackState('loading');
      store().setError('player:errors.playFailed');
    });
    expect(store().surah).toBeNull();
    playSurah.mockClear();

    fireEvent.press(await screen.findByTestId('chrome-playback-error-retry'));
    expect(playSurah).toHaveBeenCalledWith(2, 100);
  });

  /**
   * ⚠️ THE SECOND PRESS IS `resume()`, NOT A RE-READ. A paused track is THIS session's position;
   * consulting the row again would rewind the reader to wherever the last session stopped. It is
   * reachable only because the surface FOLLOWED the resumed track — the branch compares the
   * loaded surah against the one on screen.
   */
  it('resumes in place on the second press, without consulting the row', async () => {
    mockAudioPositionRow.current = { surah: 2, verse: 100, reciterId: 'husary' };
    render(<Read />);
    await screen.findByText('أية 1:1');

    await pressPlay();
    engineStarts(2, 100);
    await screen.findByText('أية 2:100');
    act(() => store().setPlaybackState('paused'));
    playSurah.mockClear();

    await pressPlay();
    expect(resume).toHaveBeenCalledTimes(1);
    expect(playSurah).not.toHaveBeenCalled();
  });

  /**
   * ⚠️ THE SURFACE FOLLOWS THE TRACK EVEN WHEN NOTHING CAN HIGHLIGHT. The store leaves
   * `activeVerseKey` null for a whole track whose manifest cannot name every ayah — `isSurahTimed`
   * exists for exactly that — and before this story that was harmless, because a cold press always
   * played the surah on screen. A resume can start any surah, so following the KEY alone would
   * leave the reader hearing Al-Kahf while looking at Al-Fatihah.
   */
  it('follows a resumed track whose surah has no usable timings', async () => {
    mockAudioPositionRow.current = { surah: 18, verse: 23, reciterId: 'husary' };
    render(<Read />);
    await screen.findByText('أية 1:1');

    await pressPlay();
    engineStarts(18, null, false);
    expect(store().activeVerseKey).toBeNull();
    await screen.findByText('أية 18:1');
  });

  /**
   * ⚠️ THE FROZEN BOUNDARY: "resuming playback must not write one" — and it is one PAUSE later
   * that the write happens, not at the press. Story 7-1 writes the reading position when playback
   * leaves `playing`, which was the reader's own pair while audio could only start from what was
   * on screen. After a resume it is the audio's, and writing it moves the reader somewhere they
   * never went. The whole path has to run for this to mean anything: an assertion made against a
   * `playSurah` mock that never starts a session is green with the behaviour entirely broken.
   */
  it('writes NO reading position when the session was resumed somewhere else', async () => {
    mockAudioPositionRow.current = { surah: 2, verse: 100, reciterId: 'husary' };
    render(<Read />);
    await screen.findByText('أية 1:1');

    await pressPlay();
    engineStarts(2, 100);
    await screen.findByText('أية 2:100'); // the surface followed — the write would be 2:100
    mockSetReadingPosition.mockClear();

    act(() => store().setPlaybackState('paused'));
    expect(mockSetReadingPosition).not.toHaveBeenCalled();
  });

  /** Anti-vacuity: 7-1's write is suppressed for a RESUME, not switched off. */
  it('still writes it when the session started where the reader already was', async () => {
    render(<Read />);
    await screen.findByText('أية 1:7');
    reportVisible(versesOf(1, 7)[4]); // 1:5 — where the reader is, and where the press starts

    await pressPlay();
    expect(playSurah).toHaveBeenCalledWith(1, 5);
    engineStarts(1, 6); // the recitation moved on by one ayah
    mockSetReadingPosition.mockClear();

    act(() => store().setPlaybackState('paused'));
    expect(mockSetReadingPosition).toHaveBeenCalledTimes(1);
    expect(mockSetReadingPosition.mock.calls[0][0]).toMatchObject({ surah: 1, verse: 6 });
  });
});

describe('the bookmark control (story 6-4)', () => {
  it('presses ADD on an unbookmarked row — a minted id and the ROW’s pair, one write', async () => {
    render(<Read />);
    await screen.findByText('أية 1:7');
    fireEvent.press(screen.getByTestId('bookmark-toggle-3'));
    expect(mockAddBookmark).toHaveBeenCalledTimes(1);
    expect(mockAddBookmark).toHaveBeenCalledWith({ id: 'uuid-under-test', surah: 1, verse: 3 });
    expect(mockRemoveBookmark).not.toHaveBeenCalled();
  });

  it('presses REMOVE on a bookmarked row — that row’s id, never a second create', async () => {
    mockBookmarksRow.current = [{ id: 'bk-1-3', surah: 1, verse: 3 }];
    render(<Read />);
    await screen.findByText('أية 1:7');
    fireEvent.press(screen.getByTestId('bookmark-toggle-3'));
    expect(mockRemoveBookmark).toHaveBeenCalledTimes(1);
    expect(mockRemoveBookmark).toHaveBeenCalledWith('bk-1-3');
    expect(mockAddBookmark).not.toHaveBeenCalled();
  });

  it('keys the state by the PAIR — the same verse number in another surah stays outlined', async () => {
    // ⚠️ The map is `verseKey(surah, verse)` → id, not verse → id. A bookmark on 2:3 must not
    // fill 1:3's control or hand its id to 1:3's remove.
    mockBookmarksRow.current = [{ id: 'bk-2-3', surah: 2, verse: 3 }];
    render(<Read />);
    await screen.findByText('أية 1:7');
    fireEvent.press(screen.getByTestId('bookmark-toggle-3'));
    expect(mockAddBookmark).toHaveBeenCalledWith({ id: 'uuid-under-test', surah: 1, verse: 3 });
    expect(mockRemoveBookmark).not.toHaveBeenCalled();
  });

  it('after navigating to another surah, a toggle mints the NEW surah — the row reports its own pair', async () => {
    // ⚠️ THE STALE-SURAH RACE THE REVIEW CAUGHT. The screen's `showing.current` moves
    // synchronously in `goToSurah` and the focus resync while the OLD surah's rows are still
    // tappable, so a toggle that asked the screen "which surah?" minted wrong-surah bookmarks.
    // The row reports the pair it renders; this pins the wiring end-to-end through a real
    // navigation.
    render(<Read />);
    await screen.findByText('أية 1:7');
    fireEvent.press(screen.getByTestId('next-surah-button'));
    await screen.findByText('أية 2:1');
    fireEvent.press(screen.getByTestId('bookmark-toggle-5'));
    expect(mockAddBookmark).toHaveBeenCalledTimes(1);
    expect(mockAddBookmark).toHaveBeenCalledWith({ id: 'uuid-under-test', surah: 2, verse: 5 });
  });

  it('each press reads the CURRENT map — add then remove on one control converges', async () => {
    // The frozen matrix's rapid-double-tap row: the second press must see the state the first
    // one wrote. In production `addBookmark` applies the cache synchronously and `useBookmarks`
    // re-renders the screen; the mock + `rerender` play those two roles here.
    const view = render(<Read />);
    await screen.findByText('أية 1:7');
    fireEvent.press(screen.getByTestId('bookmark-toggle-2'));
    expect(mockAddBookmark).toHaveBeenCalledTimes(1);
    mockBookmarksRow.current = [{ id: 'bk-new', surah: 1, verse: 2 }];
    view.rerender(<Read />);
    fireEvent.press(screen.getByTestId('bookmark-toggle-2'));
    expect(mockRemoveBookmark).toHaveBeenCalledWith('bk-new');
    expect(mockAddBookmark).toHaveBeenCalledTimes(1);
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
      expect(mockScrollToIndex).toHaveBeenCalledWith({
        index: 99,
        animated: false,
        viewOffset: -HEADER_INSET,
      })
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

  it('re-targets when the saved row arrives AFTER the first render', async () => {
    // ⚠️ THE SAME DEFECT `mushaf-screen.test.tsx` pins, on this surface: `readCache` answers
    // `undefined` until the anonymous session resolves, which is after the first render, so
    // `target` was captured as 1:1 and the focus resync could not correct it (on mount the fresh
    // pair and the visible pair are both 1:1). The reader's saved place was lost for the whole
    // session. MUTATION: delete the late-restore effect — this reddens.
    mockReadingPositionRow.current = null;
    const view = render(<Read />);
    await screen.findByText('أية 1:1');

    mockReadingPositionRow.current = { surah: 2, verse: 100 };
    view.rerender(<Read />);
    await screen.findByText('أية 2:100');
  });

  it('restores ONCE — moving to the next surah does not re-apply it', async () => {
    mockReadingPositionRow.current = { surah: 1, verse: 5 };
    render(<Read />);
    await screen.findByText('أية 1:5');
    // ⚠️ ONE restore, but TWO calls — and that is the contract, not slack. The restore scrolls
    // immediately and re-asserts the SAME index on the next frame, because the first call runs
    // before FlashList has measured any row and lands on an estimate (blank page on Android).
    // So this counts TARGETS, not calls: every call must name the same index.
    await waitFor(() => expect(mockScrollToIndex).toHaveBeenCalled());
    const restoreTargets = () =>
      new Set(mockScrollToIndex.mock.calls.map(([arg]) => (arg as { index: number }).index));
    expect(restoreTargets()).toEqual(new Set([4]));
    fireEvent.press(screen.getByTestId('next-surah-button'));
    await screen.findByText('أية 2:1');
    // Without the latch, the new surah's list would be yanked to the old surah's saved index.
    expect(restoreTargets()).toEqual(new Set([4]));
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
      expect(mockScrollToIndex).toHaveBeenCalledWith({
        index: 99,
        animated: false,
        viewOffset: -HEADER_INSET,
      })
    );
  });

  it('does NOTHING on a focus where the pair has not moved — no jump, no reload', async () => {
    mockReadingPositionRow.current = { surah: 2, verse: 100 };
    const view = render(<Read />);
    await screen.findByText('أية 2:100');
    await waitFor(() => expect(mockScrollToIndex).toHaveBeenCalled());
    const callsAfterRestore = mockScrollToIndex.mock.calls.length;
    view.rerender(<Read />);
    refocus();
    // A plain tab switch away and back must not scroll the reader or re-read the surah. Compared
    // against the count the RESTORE left, not against 1: a restore is two idempotent calls to the
    // same index (immediate, then re-asserted after measurement — see the 'restores ONCE' case).
    // What this pins is that an unmoved focus adds NOTHING on top of it.
    expect(mockScrollToIndex.mock.calls.length).toBe(callsAfterRestore);
    expect(mockGetSurahVerses.mock.calls.filter(([s]) => s === 2).length).toBeLessThanOrEqual(2);
  });

  it('a resync jump within the SAME surah scrolls to the new verse', async () => {
    mockReadingPositionRow.current = { surah: 2, verse: 10 };
    const view = render(<Read />);
    await screen.findByText('أية 2:10');
    await waitFor(() =>
      expect(mockScrollToIndex).toHaveBeenCalledWith({
        index: 9,
        animated: false,
        viewOffset: -HEADER_INSET,
      })
    );
    mockReadingPositionRow.current = { surah: 2, verse: 255 };
    view.rerender(<Read />);
    refocus();
    await waitFor(() =>
      expect(mockScrollToIndex).toHaveBeenCalledWith({
        index: 254,
        animated: false,
        viewOffset: -HEADER_INSET,
      })
    );
  });

  it('a resync to VERSE 1 of the same surah scrolls to the TOP — not nowhere', async () => {
    // ⚠️ MEASURED IN THE 6-4 DEVICE SMOKE. Tapping a verse-1 bookmark row while scrolled deep in
    // the same surah wrote the pair, navigated — and the list stayed where it was, because the
    // restore effect's `index <= 0` early-return assumed mount geometry ("verse 1 is already the
    // top"), which is false on a refocused, scrolled list. The top is a REAL scroll on a resync.
    mockReadingPositionRow.current = { surah: 2, verse: 100 };
    const view = render(<Read />);
    await screen.findByText('أية 2:100');
    await waitFor(() =>
      expect(mockScrollToIndex).toHaveBeenCalledWith({
        index: 99,
        animated: false,
        viewOffset: -HEADER_INSET,
      })
    );
    mockReadingPositionRow.current = { surah: 2, verse: 1 };
    view.rerender(<Read />);
    refocus();
    await waitFor(() =>
      expect(mockScrollToOffset).toHaveBeenCalledWith({ offset: 0, animated: false })
    );
    // …and no NEW index target for it: verse 1 is the top, not an estimated offset. Counted as
    // distinct targets, because a restore re-asserts its own index on the next frame (see the
    // 'restores ONCE' case) — what must not happen is a second, different index.
    expect(
      new Set(mockScrollToIndex.mock.calls.map(([arg]) => (arg as { index: number }).index)).size
    ).toBe(1);
  });
});

describe('the chrome, and the gesture that reveals it', () => {
  // See `fakeTimers` above: the chrome dwells now, and wall-clock is the one thing these cases
  // must not be at the mercy of.
  beforeEach(() => {
    jest.useFakeTimers();
    fakeTimers = true;
  });
  afterEach(() => {
    fakeTimers = false;
    jest.useRealTimers();
  });

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

  it('does NOT toggle when the touch started on the Arabic — 6-4’s double-fire, reversed', async () => {
    // ⚠️ THE OWNER REVERSED 6-4’S "named and accepted" CALL ON 2026-09-09. Press-in is touch
    // DOWN and the gesture’s `onEnd` is touch UP, so the latch is settled when it is read — the
    // two touch systems are ordered by physics, not by a guess about dispatch order.
    render(<Read />);
    await screen.findByText('أية 1:1');
    fireEvent(screen.getByTestId('verse-text-1'), 'pressIn');
    tapSurface();
    await expectChromeStayedHidden();
  });

  it('does NOT toggle when the touch started on the BOOKMARK control either', async () => {
    // MUTATION: wire the reporter to the verse text alone. Bookmarking would still summon the
    // chrome — the half of the double-fire story 6-4 actually introduced.
    render(<Read />);
    await screen.findByText('أية 1:1');
    fireEvent(screen.getByTestId('bookmark-toggle-1'), 'pressIn');
    tapSurface();
    await expectChromeStayedHidden();
  });

  it('is armed again for the NEXT tap — one suppression, not a mode', async () => {
    // MUTATION: never reset the latch. The first verse press would kill the chrome tap for the
    // rest of the session, which reads to a reader as "the chrome stopped working".
    render(<Read />);
    await screen.findByText('أية 1:1');
    fireEvent(screen.getByTestId('verse-text-1'), 'pressIn');
    tapSurface();
    await revealChrome();
  });

  it('leaves no residue when a drag STARTS on a verse and never becomes a tap', async () => {
    // MUTATION: reset in `onEnd` instead of `onFinalize`. A scroll that begins on the Arabic
    // never reaches `onEnd`, so the flag would survive into the reader’s next chrome tap.
    render(<Read />);
    await screen.findByText('أية 1:1');
    fireEvent(screen.getByTestId('verse-text-1'), 'pressIn');
    dragSurface();
    await revealChrome();
  });

  it('does NOT toggle when the touch started on the next/prev-surah control (story 7-6)', async () => {
    // `SurahNavigator` is the LIST FOOTER, so it sits inside the surface gesture exactly as the
    // rows do — moving to the next surah used to summon the chrome on the way. MUTATION: drop
    // `onInteractionStart` from the navigator.
    render(<Read />);
    await screen.findByTestId('next-surah-button');
    fireEvent(screen.getByTestId('next-surah-button'), 'pressIn');
    tapSurface();
    await expectChromeStayedHidden();
  });

  it('…and the same for the PREVIOUS-surah control', async () => {
    render(<Read />);
    await screen.findByTestId('prev-surah-button');
    fireEvent(screen.getByTestId('prev-surah-button'), 'pressIn');
    tapSurface();
    await expectChromeStayedHidden();
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

  it('labels and navigates the PREVIOUS surah — the same single derivation, backwards (story 6-3)', async () => {
    mockReadingPositionRow.current = { surah: 2, verse: 1 };
    render(<Read />);
    await screen.findByText('أية 2:1');
    // The label comes from quran-data's table, like next's; Al-Baqarah's predecessor.
    expect(screen.getByText('Previous: Al-Fatihah')).toBeTruthy();
    fireEvent.press(screen.getByTestId('prev-surah-button'));
    await waitFor(() => expect(mockGetSurahVerses).toHaveBeenCalledWith(1));
  });

  it('wraps from Al-Fatiha back to An-Nas — 1 → 114, the other end (story 6-3)', async () => {
    // MUTATION: `prevSurah` computing `surah - 1` without the wrap answers 0 here, and
    // `getSurahVerses(0)` is an empty screen.
    render(<Read />);
    await screen.findByText('أية 1:7');
    expect(screen.getByText('Previous: An-Nas')).toBeTruthy();
    fireEvent.press(screen.getByTestId('prev-surah-button'));
    await waitFor(() => expect(mockGetSurahVerses).toHaveBeenCalledWith(114));
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

/**
 * ⚠️ A VERSE PRESS SELECTS, AND MAKES NO SOUND (story 7-8).
 *
 * ⚠️ THIS BLOCK STAYS ON REAL TIMERS, UNLIKE THE CHROME BLOCK ABOVE, AND IT HAS TO: RN's
 * `Pressability` — what turns a `fireEvent.press` on the rendered verse into an `onPress` —
 * schedules its own timers and does not fire under Jest's fake ones (the same measurement the
 * dwell block in `ReadingChrome.test.tsx` records). Every case here settles inside the 5s dwell,
 * and the DWELL's own interaction with the selection is driven deliberately in that file.
 */
describe('a verse press SELECTS its ayah — and makes no sound (story 7-8)', () => {
  const store = () => useAudioPlayerStore.getState();
  const playSurah = jest.fn(async () => {});
  const seekToVerse = jest.fn(async () => {});

  beforeEach(() => {
    playSurah.mockClear();
    seekToVerse.mockClear();
    act(() => {
      store().clearPlayback();
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

  /** The row's selection outline, as the `borderColor` actually rendered. */
  function outlineOf(verse: number): unknown {
    const style = screen.getByTestId(`verse-1:${verse}`).props.style;
    const flat = (Array.isArray(style) ? style.flat(3) : [style]).filter(Boolean);
    return Object.assign({}, ...flat).borderColor;
  }

  it('⚠️ STARTS NOTHING — the whole story, as one case', async () => {
    // ⚠️ 7-1 WIRED THIS PRESS TO `useVerseSeek`, WHICH PLAYS IN EVERY STATE THAT IS NOT ALREADY
    // PLAYING — so a mistap in a mosque was one tap, from a cold launch and from paused.
    // MUTATION: hand `useVerseSeek()` back to `onSelectVerse`; both assertions redden.
    render(<Read />);
    await screen.findByText('أية 1:7');
    fireEvent.press(screen.getByTestId('verse-text-3'));
    expect(playSurah).not.toHaveBeenCalled();
    expect(seekToVerse).not.toHaveBeenCalled();
  });

  it('…and starts nothing even when that surah is the LOADED, PAUSED track', async () => {
    // The state `seekToVerse` would have played from: 7-1's criterion was "playback RESUMES at
    // that verse's offset", so a paused reader tapping to read was a reader starting audio.
    act(() => {
      store().setTrack(1, 'husary', true);
      store().setPlaybackState('paused');
    });
    render(<Read />);
    await screen.findByText('أية 1:7');
    fireEvent.press(screen.getByTestId('verse-text-3'));
    expect(seekToVerse).not.toHaveBeenCalled();
    expect(playSurah).not.toHaveBeenCalled();
  });

  it('reveals the chrome with THAT ayah outlined, and only that one', async () => {
    render(<Read />);
    await screen.findByText('أية 1:7');
    fireEvent.press(screen.getByTestId('verse-text-3'));
    await waitFor(() => expect(chromeTouches()).toBe('box-none'));
    // `accent.soft` in the default palette's light slice, as a literal.
    expect(outlineOf(3)).toBe('#B14E2F');
    const lit = [1, 2, 3, 4, 5, 6, 7].filter((v) => outlineOf(v) !== 'transparent');
    expect(lit).toEqual([3]);
  });

  it('an EMPTY-AREA tap reveals the chrome with nothing selected', async () => {
    // MUTATION: route the surface gesture through `revealFor(pair)`. The margins and the gaps
    // between rows name no ayah, so the row would act on a verse nobody pressed.
    render(<Read />);
    await screen.findByText('أية 1:7');
    tapSurface();
    await waitFor(() => expect(chromeTouches()).toBe('box-none'));
    for (const v of [1, 2, 3]) expect(outlineOf(v)).toBe('transparent');
  });

  it('moves the outline to another ayah without losing the chrome', async () => {
    render(<Read />);
    await screen.findByText('أية 1:7');
    fireEvent.press(screen.getByTestId('verse-text-3'));
    await waitFor(() => expect(chromeTouches()).toBe('box-none'));
    fireEvent.press(screen.getByTestId('verse-text-5'));
    await settle();
    expect(chromeTouches()).toBe('box-none');
    expect(outlineOf(3)).toBe('transparent');
    expect(outlineOf(5)).toBe('#B14E2F');
  });

  it('the outline goes with the bars — dismissing the chrome clears the selection', async () => {
    // The dwell is the other exit and `ReadingChrome.test.tsx` drives it; what this pins is that
    // the SCREEN's rows follow, which is the half a hook test cannot see.
    render(<Read />);
    await screen.findByText('أية 1:7');
    fireEvent.press(screen.getByTestId('verse-text-3'));
    await waitFor(() => expect(chromeTouches()).toBe('box-none'));
    fireEvent.press(screen.getByTestId('chrome-dismiss'));
    await waitFor(() => expect(chromeTouches()).toBe('none'));
    expect(outlineOf(3)).toBe('transparent');
  });

  it('the chrome row is the ONE path to sound, and it plays the SELECTED ayah', async () => {
    // The other half of the story: deliberate is still one press away, and it lands on the ayah
    // the reader chose rather than on whatever the screen believes it is showing.
    render(<Read />);
    await screen.findByText('أية 1:7');
    fireEvent.press(screen.getByTestId('verse-text-5'));
    await waitFor(() => expect(chromeTouches()).toBe('box-none'));
    fireEvent.press(screen.getByTestId('chrome-verse-play'));
    expect(playSurah).toHaveBeenCalledWith(1, 5);
  });
});

/**
 * ⚠️ THE SELECTION DIES WITH THE AYAH IT POINTS AT, NOT ONLY WITH THE BARS (story 7-8's review).
 *
 * A surah change, a focus resync and the mode toggle all move the reader without touching
 * `visible`, so the row went on offering play-from-here and a bookmark for a verse that had
 * scrolled away — 6-4's wrong-surah defect one indirection out, bounded only by the 5s dwell.
 */
describe('the selection cannot outlive what it points at (story 7-8 review)', () => {
  /** The row's label, or null when it draws nothing. */
  function rowLabel(): string | null {
    const node = screen.queryByTestId('chrome-verse-label', { includeHiddenElements: true });
    return node ? (node.props.children as string) : null;
  }

  async function selectVerse(verse: number) {
    fireEvent.press(screen.getByTestId(`verse-text-${verse}`));
    await waitFor(() => expect(chromeTouches()).toBe('box-none'));
  }

  it('the NEXT-SURAH control clears it — the ayah belonged to the surah being left', async () => {
    // MUTATION: drop `clearSelection()` from `goToSurah`. The row keeps naming 1:3 while
    // Al-Baqarah is on screen, and its bookmark writes into the surah the reader left.
    render(<Read />);
    await screen.findByText('أية 1:7');
    await selectVerse(3);
    expect(rowLabel()).toBe('Al-Fatihah · 3');

    fireEvent.press(screen.getByTestId('next-surah-button'));
    await waitFor(() => expect(mockGetSurahVerses).toHaveBeenCalledWith(2));
    expect(rowLabel()).toBeNull();
  });

  it('a FOCUS RESYNC clears it — the other renderer moved the reader', async () => {
    render(<Read />);
    await screen.findByText('أية 1:7');
    await selectVerse(3);
    expect(rowLabel()).toBe('Al-Fatihah · 3');

    // The mushaf moved the saved pair while this tab was blurred; `rerender` is the re-render a
    // mounted position hook would do (see the file header's resync note).
    mockReadingPositionRow.current = { surah: 2, verse: 100 };
    screen.rerender(<Read />);
    refocus();
    await screen.findByText('أية 2:100');
    expect(rowLabel()).toBeNull();
  });

  it('BLUR clears it — which is the mode toggle, the one navigation that keeps the chrome up', async () => {
    // ⚠️ THE MODE TOGGLE IS A PLAIN `navigate`: nothing unmounts, and this screen's chrome stays
    // revealed with its selection behind the mushaf. Coming back to a row acting on an ayah
    // chosen two renderers ago is the defect. MUTATION: drop the blur cleanup.
    render(<Read />);
    await screen.findByText('أية 1:7');
    await selectVerse(3);
    expect(rowLabel()).toBe('Al-Fatihah · 3');

    blur();
    expect(rowLabel()).toBeNull();
  });
});
