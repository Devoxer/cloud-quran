/**
 * `/read` — the reading surface, driven (story 6-1, replacing story 6-0's placeholder cases).
 *
 * ⚠️ THE SINGLE-BUTTON ASSERTION IS GONE, DELIBERATELY, AND WHAT IT PROTECTED IS NOT. Story 6-0's
 * version asserted `getAllByRole('button')` had length exactly 1, because the placeholder had one
 * control and that control was the whole point: `immersive-route.test.ts` greps this screen for
 * `canGoBack()` and `accessibilityRole="button"`, and a grep cannot tell a door from a mirror —
 * changing the no-history branch to `router.replace('/read')` left every gate green. A real
 * reading surface has a second control (next surah), so the count is no longer the thing to pin;
 * the DOOR is, addressed by its testID. Both `canGoBack()` branches and the never-`/read` case
 * survive here, and the door's own render behaviour is covered in
 * `features/reading/components/ReadingChrome.test.tsx`.
 *
 * ⚠️ FLASHLIST IS MOCKED LOCALLY, OVERRIDING `jest.setup.js`'s FlatList stand-in. Two reasons the
 * global one does not serve here: FlatList refuses `scrollToIndex` without `getItemLayout` — and
 * this story forbids `getItemLayout` outright — so the restore case could not be observed at all;
 * and the imperative ref is exactly what the restore IS, so it has to be inspectable.
 *
 * ⚠️ GESTURE HANDLER IS MOCKED LOCALLY TOO, AND THE MOCK RECORDS THE GESTURE'S CONFIGURATION
 * RATHER THAN JUST SWALLOWING IT. The surface tap is the screen's only way to reveal the chrome —
 * i.e. the route's only exit — and two of its three chained settings are load-bearing in ways
 * nothing renders: `runOnJS(true)` (the callback is a React setter, not a worklet) and
 * `cancelsTouchesInView(false)` (RNGH's default cancels the RN touch when the tap recognises,
 * which would silently kill every `Pressable` inside the gesture's area). Both are asserted.
 * What no Jest renderer can see is the thing the gesture exists FOR — that a drag still scrolls —
 * because responder/recogniser negotiation is native. The simulator smoke is what proves that.
 */

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn<boolean, []>(() => true);

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    replace: mockReplace,
    canGoBack: () => mockCanGoBack(),
    push: jest.fn(),
    navigate: jest.fn(),
    dismissAll: jest.fn(),
  }),
}));

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
import Read from '@/app/read';
import { ARABIC_FONT_SIZE, UTHMANI_FONT_FAMILY } from '@/constants/arabic';
import { HOME_HREF } from '@/constants/navigation';

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

/** Tap the reading surface — the screen's ONE gesture, and the chrome's only way back. */
function tapSurface() {
  const tap = mockTaps[mockTaps.length - 1];
  act(() => tap.end?.());
}

/**
 * The chrome bar's touch state — `'none'` while dismissed or still fading in.
 *
 * ⚠️ `includeHiddenElements` IS REQUIRED, AND THAT IS ITSELF THE PROOF OF ANOTHER FIX. A dismissed
 * bar now carries `accessibilityElementsHidden` / `importantForAccessibility` as well as
 * `pointerEvents: 'none'`, so RNTL — which models the accessibility tree — cannot see it by
 * default. Before that fix every query below found the close button while it was invisible, which
 * is exactly what a VoiceOver or TalkBack user experienced.
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
    // branch — so `fontSize={fontSize}` could have been `fontSize={ARABIC_FONT_SIZE.default}` and
    // nothing would have noticed. Story 6.5 ships the picker; the READ side is this story's.
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
    // FOOTER, gated on `verses.length > 0` — was not there either. No verses, no error, no way
    // forward.
    mockGetSurahVerses.mockImplementation(async () => []);
    render(<Read />);
    await screen.findByTestId('reading-error');
    expect(screen.getByText('No verses to show')).toBeTruthy();
    expect(screen.getByText('Try Again')).toBeTruthy();
  });

  it('reveals the door on a failed surface, because a tap is not a discoverable exit there', async () => {
    // The chrome is hidden on arrival everywhere else — one tap brings it back. On a screen that
    // has FAILED, "guess that a tap does something" is not an exit, and `fullScreenModal` has no
    // dismiss gesture on any platform.
    mockGetSurahVerses.mockImplementation(async () => []);
    render(<Read />);
    await screen.findByTestId('reading-error');
    await waitFor(() => expect(screen.getByTestId('reading-close')).toBeTruthy());
    fireEvent.press(screen.getByTestId('reading-close'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});

describe('what the chrome says', () => {
  // ⚠️ NOTHING OBSERVED EITHER STRING FOR A ROUND, AND BOTH MUTATIONS PASSED 1826 TESTS:
  // `const title = null` (a blank header forever) and swapping `getPageForVerse`'s arguments
  // (`Page -1 · 1:1`, frozen). `ReadingChrome.test.tsx` asserts literals its own harness passes
  // in, so the screen's side of the wiring was covered by nobody.

  it('names the surah the rows came from', async () => {
    render(<Read />);
    await screen.findByText('أية 1:1');
    await revealChrome();
    expect(screen.getByText('Al-Fatihah')).toBeTruthy();
  });

  it('names the page and the verse the reader is on, and follows them', async () => {
    render(<Read />);
    await screen.findByText('أية 1:1');
    await revealChrome();
    expect(screen.getByText('Page 1 · 1:1')).toBeTruthy();
    reportVisible({ surah: 1, verse: 5, textUthmani: '', textSimple: '' });
    expect(screen.getByText('Page 1 · 1:5')).toBeTruthy();
  });

  it('reads the page from the verse↔page map, in the right argument order', async () => {
    // 2:255 is on page 42 of the Madinah mushaf; `getPageForVerse(255, 2)` answers -1. Swapping
    // the two arguments type-checks — they are both `number` — and renders `Page -1` forever.
    mockReadingPositionRow.current = { surah: 2, verse: 255 };
    render(<Read />);
    await screen.findByText('أية 2:255');
    await revealChrome();
    expect(screen.getByText('Page 42 · 2:255')).toBeTruthy();
  });

  it('never renders a page of -1 for an out-of-range saved verse', async () => {
    // ⚠️ MEASURED DEFECT: `visibleVerse` was seeded from the saved row with NO range check, while
    // the restore effect applied exactly that check one screen over. A row of `{1, 999}` — a
    // corrupt or newer-build value — put `Page -1 · 1:999` in front of the reader.
    mockReadingPositionRow.current = { surah: 1, verse: 999 };
    render(<Read />);
    await screen.findByText('أية 1:1');
    await revealChrome();
    expect(screen.queryByText('Page -1 · 1:999')).toBeNull();
    expect(screen.getByText('Page 1 · 1:1')).toBeTruthy();
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
    // MUTATION: drop the surah from the persisted pair. `1:1 → 2:1` is a real move and would
    // look like "no change" to a verse-number comparison — covered exhaustively in
    // `lib/usePosition.test.ts`; this is the screen's half.
    expect(mockSetReadingPosition).toHaveBeenCalledTimes(1);
    expect(mockSetReadingPosition.mock.calls[0][0]).toMatchObject({ surah: 2, verse: 2 });
  });

  it('writes NOTHING when a surah change scrolls the old rows to the top', async () => {
    // ⚠️ THE ONE LEAK IN THE "ONE WRITE PER VERSE CHANGE" DISCIPLINE, MEASURED. `goToSurah` calls
    // `scrollToOffset({ offset: 0 })` — and for one round it did so while the OLD surah's rows
    // were still the list's data, so viewability fired and `(oldSurah, 1)` was written. A reader
    // at 1:7 tapping "next" produced `[{1,7}, {1,1}]` before the new rows existed; if the next
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
    // (`useState(() => saved?.surah ?? 1)`) while the restore effect read `saved?.verse` on a
    // LATER render, with no comparison between them. A row that arrives one render late — null
    // first, `{18, 4}` next, which is exactly what a first-ever launch syncing from another
    // device looks like — opened Al-Fatihah and scrolled to index 3. The reader landed on 1:4.
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
    // A corrupted or future-build row (surah 1 has 7 verses). The documented fallback is the top,
    // never a crash and never an out-of-range scroll.
    mockReadingPositionRow.current = { surah: 1, verse: 999 };
    render(<Read />);
    await screen.findByText('أية 1:1');
    expect(mockScrollToIndex).not.toHaveBeenCalled();
  });

  it('falls back to 1:1 — and to a real screen — for a saved SURAH outside the book', async () => {
    // ⚠️ MEASURED DEFECT: `{200, 1}` reached `getSurahVerses(200)`, which answers `[]`. `error`
    // stayed null, the footer control was gated off, and the reader got a blank surface with the
    // close button as the only thing on it. The I/O matrix's documented fallback is "falls back
    // to the top" — only the VERSE half of it was implemented.
    mockReadingPositionRow.current = { surah: 200, verse: 1 };
    render(<Read />);
    await screen.findByText('أية 1:1');
    expect(mockGetSurahVerses).toHaveBeenCalledWith(1);
    expect(mockGetSurahVerses).not.toHaveBeenCalledWith(200);
    await revealChrome();
    expect(screen.getByText('Page 1 · 1:1')).toBeTruthy();
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

describe('the next-surah control', () => {
  it('is in CONTENT, below the last verse, and clear of the bottom chrome', async () => {
    render(<Read />);
    await screen.findByText('أية 1:7');
    // In the list's footer — not in the chrome bar, which it has to be CLEAR of.
    expect(screen.getByTestId('next-surah-button')).toBeTruthy();
    const content = listProps().contentContainerStyle as Record<string, number>;
    // The reservation is permanent, so revealing chrome shifts nothing, and it clears the footer
    // bar plus the safe-area inset. ⚠️ NOT `useTabBarHeight()`: `/read` is a root sibling of
    // `(tabs)` and no tab bar is on screen here.
    expect(content.paddingBottom).toBeGreaterThan(56);
    expect(content.paddingTop).toBeGreaterThan(56);
  });

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
});

describe('the chrome, and the gesture that reveals it', () => {
  it('starts HIDDEN — the screen is immersive when it renders', async () => {
    // ⚠️ IT SHIPPED STARTING VISIBLE FOR ONE ROUND. The frozen acceptance criterion is "given the
    // reading screen, when it renders, then it is immersive", and the frozen I/O matrix's row is
    // "Tap the surface | Chrome hidden | Header and footer appear together" — the hidden state is
    // the one the screen opens in. The argument for flipping it (with the tap on the rows there
    // was no "elsewhere" to tap, so the exit was undiscoverable) was answered by giving the tap
    // back its surface, not by moving the intent.
    render(<Read />);
    await screen.findByText('أية 1:1');
    expect(chromeTouches()).toBe('none');
  });

  it('reveals both bars on a tap of the surface', async () => {
    render(<Read />);
    await screen.findByText('أية 1:1');
    await revealChrome();
    expect(screen.getByTestId('reading-chrome-footer').props.pointerEvents).toBe('box-none');
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
    // the touch in the RN view tree — which silently kills every `Pressable` inside the gesture's
    // area, i.e. the next-surah control and the error state's retry. And `runOnJS(true)` because
    // the callback is a React state setter, not a worklet: without it Reanimated tries to run it
    // on the UI thread. Neither is observable in a render.
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

  it('keeps both bars in the tree either way', async () => {
    render(<Read />);
    await screen.findByText('أية 1:7');
    const options = { includeHiddenElements: true } as const;
    expect(screen.getByTestId('reading-chrome-header', options)).toBeTruthy();
    await revealChrome();
    expect(screen.getByTestId('reading-chrome-header', options)).toBeTruthy();
    expect(screen.getByTestId('reading-chrome-footer', options)).toBeTruthy();
  });

  it('hides a dismissed bar from VoiceOver and TalkBack, not just from touch', async () => {
    // ⚠️ `pointerEvents` REASONS ABOUT THE TOUCH TREE ONLY. A bar at `opacity: 0` was still a
    // first-class citizen of the ACCESSIBILITY tree, so a screen-reader user swiping the reading
    // surface landed on a Close button nobody could see and no gesture had revealed.
    render(<Read />);
    await screen.findByText('أية 1:1');
    expect(screen.queryByTestId('reading-close')).toBeNull();
    await revealChrome();
    expect(screen.getByTestId('reading-close')).toBeTruthy();
  });
});

describe('the room still has a door', () => {
  it('goes back when there is history to pop', async () => {
    render(<Read />);
    await screen.findByText('أية 1:1');
    await revealChrome();
    fireEvent.press(screen.getByTestId('reading-close'));
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('replaces to the home tab when there is none', async () => {
    mockCanGoBack.mockReturnValue(false);
    render(<Read />);
    await screen.findByText('أية 1:1');
    await revealChrome();
    fireEvent.press(screen.getByTestId('reading-close'));
    expect(mockReplace).toHaveBeenCalledWith(HOME_HREF);
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('never sends the reader back to the screen they are leaving', async () => {
    mockCanGoBack.mockReturnValue(false);
    render(<Read />);
    await screen.findByText('أية 1:1');
    await revealChrome();
    fireEvent.press(screen.getByTestId('reading-close'));
    for (const call of mockReplace.mock.calls) expect(call[0]).not.toBe('/read');
  });

  it('a tappable verse is not a button — and is no longer tappable at all', async () => {
    // ⚠️ THE ROWS CARRIED THE CHROME TAP FOR A ROUND, AND GIVING IT BACK TO THE SURFACE IS WHAT
    // FREES THEM. Epic 7's reserved semantics are "a tap on a verse plays audio from it and a tap
    // elsewhere toggles chrome"; a row that already owns the chrome toggle has nowhere to put
    // that. The rows are text again — no `onPress`, and still no `accessibilityRole`, which would
    // announce 286 buttons on Al-Baqarah.
    render(<Read />);
    await screen.findByText('أية 1:7');
    await revealChrome();
    const roles = screen.getAllByRole('button');
    expect(roles).toHaveLength(2); // the door, and next surah
    expect(screen.getByTestId('verse-1:1').props.onStartShouldSetResponder).toBeUndefined();
  });

  it('the reading surface is a plain View, never a Pressable wrapping the list', async () => {
    // MUTATION, AND IT IS THE ONE THIS STORY ACTUALLY SHIPPED FOR A ROUND: wrap the list in a
    // full-screen `Pressable` so a tap anywhere toggles chrome. It takes the responder on touch
    // START and RN cancels a press only when the touch leaves the element, so a drag inside it
    // never releases — the list does not scroll at all, and every swipe lands as a toggle.
    // Reproduced on the iOS simulator; Jest cannot model responder negotiation, so this asserts
    // the SHAPE instead of the behaviour and says so. The gesture that replaced it is asserted
    // above; that a drag still scrolls is proved by the simulator smoke and by nothing here.
    render(<Read />);
    await screen.findByText('أية 1:7');
    expect(screen.getByTestId('reading-surface').props.onStartShouldSetResponder).toBeUndefined();
    expect(
      screen.getByTestId('reading-tap-surface').props.onStartShouldSetResponder
    ).toBeUndefined();
  });
});
