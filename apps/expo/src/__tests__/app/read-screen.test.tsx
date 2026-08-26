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

const mockScrollToIndex = jest.fn();
const mockScrollToOffset = jest.fn();
/** Captured on every render so a case can assert what the list was configured with. */
const mockListProps: Record<string, unknown>[] = [];

jest.mock('@shopify/flash-list', () => {
  // ⚠️ NO TYPE ANNOTATIONS INSIDE THIS FACTORY. Jest's hoisting guard rejects any identifier it
  // does not recognise as in-scope, and a TypeScript parameter type is an identifier to it.
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

jest.mock('@/lib/sync', () => ({
  setReadingPosition: (...args: unknown[]) => mockSetReadingPosition(...args),
  useReadingPosition: () => ({ data: mockReadingPositionRow.current }),
  usePreferences: () => ({ data: null }),
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

beforeEach(() => {
  jest.clearAllMocks();
  mockListProps.length = 0;
  mockCanGoBack.mockReturnValue(true);
  mockReadingPositionRow.current = null;
  mockGetSurahVerses.mockImplementation(async (surah: number) =>
    versesOf(surah, surah === 2 ? 286 : 7)
  );
  mockGetSurahMetadata.mockImplementation(async (surah: number) => ({
    number: surah,
    nameArabic: 'x',
    nameEnglish: 'x',
    nameTransliteration: surah === 1 ? 'Al-Fatihah' : 'Al-Baqarah',
    verseCount: surah === 2 ? 286 : 7,
    revelationType: 'meccan' as const,
    order: 1,
  }));
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
    render(<Read />);
    await screen.findByText('أية 1:7');
    reportVisible({ surah: 1, verse: 1, textUthmani: '', textSimple: '' });
    reportVisible({ surah: 2, verse: 1, textUthmani: '', textSimple: '' });
    // MUTATION: drop the surah from the persisted pair. `1:1 → 2:1` is a real move and would
    // look like "no change" to a verse-number comparison.
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

  it('falls back to the top when the saved verse is not in the surah', async () => {
    // A corrupted or future-build row (surah 1 has 7 verses). The documented fallback is the top,
    // never a crash and never an out-of-range scroll.
    mockReadingPositionRow.current = { surah: 1, verse: 999 };
    render(<Read />);
    await screen.findByText('أية 1:1');
    expect(mockScrollToIndex).not.toHaveBeenCalled();
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

  it('wraps from An-Nas back to Al-Fatiha rather than dead-ending', async () => {
    mockReadingPositionRow.current = { surah: 114, verse: 1 };
    render(<Read />);
    await screen.findByTestId('next-surah-button');
    fireEvent.press(screen.getByTestId('next-surah-button'));
    await waitFor(() => expect(mockGetSurahVerses).toHaveBeenCalledWith(1));
  });
});

describe('chrome toggling does not shift content', () => {
  it('leaves the list content style identical across a toggle', async () => {
    render(<Read />);
    await screen.findByText('أية 1:7');
    const before = { ...(listProps().contentContainerStyle as object) };
    fireEvent.press(screen.getByTestId('verse-1:1'));
    const after = { ...(listProps().contentContainerStyle as object) };
    // MUTATION: reserve the chrome's space only while it is shown. Every verse would then move
    // on each tap — the exact failure the acceptance criterion names.
    expect(after).toEqual(before);
  });

  it('keeps both bars in the tree either way', async () => {
    render(<Read />);
    await screen.findByText('أية 1:7');
    fireEvent.press(screen.getByTestId('verse-1:1'));
    expect(screen.getByTestId('reading-chrome-header')).toBeTruthy();
    expect(screen.getByTestId('reading-chrome-footer')).toBeTruthy();
  });
});

describe('the room still has a door', () => {
  it('goes back when there is history to pop', async () => {
    render(<Read />);
    await screen.findByTestId('reading-close');
    fireEvent.press(screen.getByTestId('reading-close'));
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('replaces to the home tab when there is none', async () => {
    mockCanGoBack.mockReturnValue(false);
    render(<Read />);
    await screen.findByTestId('reading-close');
    fireEvent.press(screen.getByTestId('reading-close'));
    expect(mockReplace).toHaveBeenCalledWith(HOME_HREF);
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('never sends the reader back to the screen they are leaving', async () => {
    mockCanGoBack.mockReturnValue(false);
    render(<Read />);
    await screen.findByTestId('reading-close');
    fireEvent.press(screen.getByTestId('reading-close'));
    for (const call of mockReplace.mock.calls) expect(call[0]).not.toBe('/read');
  });

  it('a tappable verse is not a button', async () => {
    // ⚠️ THE ROWS CARRY THE CHROME TAP (a full-screen wrapper blocked scrolling — see `VerseRow`),
    // and they carry NO `accessibilityRole`. Without that, Al-Baqarah would announce 286 buttons
    // and the role queries would stop describing the real controls.
    render(<Read />);
    await screen.findByText('أية 1:7');
    const roles = screen.getAllByRole('button');
    expect(roles).toHaveLength(2); // the door, and next surah
  });

  it('the reading surface is a plain View, never a Pressable wrapping the list', async () => {
    // MUTATION, AND IT IS THE ONE THIS STORY ACTUALLY SHIPPED FOR A ROUND: wrap the list in a
    // full-screen `Pressable` so a tap anywhere toggles chrome. It takes the responder on touch
    // START and RN cancels a press only when the touch leaves the element, so a drag inside it
    // never releases — the list does not scroll at all, and every swipe lands as a toggle.
    // Reproduced on the iOS simulator; Jest cannot model responder negotiation, so this asserts
    // the SHAPE instead of the behaviour and says so.
    render(<Read />);
    await screen.findByText('أية 1:7');
    expect(screen.getByTestId('reading-surface').props.onStartShouldSetResponder).toBeUndefined();
    // …and the tap really is on the rows, which is what makes the shape above sufficient.
    fireEvent.press(screen.getByTestId('verse-1:2'));
    expect(screen.getByTestId('reading-chrome-header').props.pointerEvents).toBe('none');
  });
});
