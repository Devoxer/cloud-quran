/**
 * `/search` — Quran search, driven (story 6-7). Lives HERE, never beside the route: a co-located
 * test under `app/` becomes a phantom route in the web export (`route-integrity.test.ts`).
 *
 * ⚠️ WHAT THIS FILE PINS IS THE WRITE DISCIPLINE AT THE SEAM, the same pin `surahs-screen` and
 * `bookmarks-screen` carry, because a result tap is 6-3's mechanism verbatim: ONE `reportVerse`
 * through `usePosition(mode)`, landing BEFORE the navigation (the reading surface re-resolves the
 * saved pair on FOCUS; a write arriving after the refocus is a jump that never happens), with the
 * navigation deferred one macrotask. The REAL `usePosition` runs over a mocked `@/lib/sync`
 * precisely so its comparison is part of what is under test.
 *
 * ⚠️ AND THE OTHER HALF — opened and dismissed WITHOUT a selection, the reading position must be
 * exactly what it was. That is a frozen-matrix row, and the only way to observe it is to assert
 * that nothing was written across a full mount/type/unmount cycle.
 *
 * The four body states each have a case, because the resting state and the no-match state are
 * both "zero results" and telling a reader "no matches" before they have typed is the scolding
 * the story forbids.
 */

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockDismissAll = jest.fn();
const mockCanDismiss = jest.fn(() => true);
/**
 * ⚠️ THE POP LOOP READS THIS, AND IT HAS TO DRAIN. The exit pops until `canGoBack()` says there
 * is nothing left; a mock that answers a constant `true` would spin to the bound and assert
 * nothing useful. `depth` is how many pushed routes sit above `(tabs)` — 2 for the real path
 * (`surahs` → `search`), 0 for a deep link with nothing beneath it.
 */
let mockStackDepth = 2;
const mockCanGoBack = jest.fn(() => mockStackDepth > 0);

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: (...args: unknown[]) => {
      mockStackDepth = Math.max(0, mockStackDepth - 1);
      return mockBack(...args);
    },
    canGoBack: mockCanGoBack,
    replace: mockReplace,
    dismissAll: mockDismissAll,
    canDismiss: mockCanDismiss,
    push: jest.fn(),
    navigate: jest.fn(),
  }),
  useLocalSearchParams: () => mockRouteParams.current,
  useSegments: () => ['search'],
}));

const mockRouteParams = { current: {} as { mode?: string } };

jest.mock('@shopify/flash-list', () => {
  const React = require('react');
  const { View } = require('react-native');
  const FlashList = React.forwardRef((props: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({ scrollToIndex: jest.fn() }));
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
      )
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
}));

/**
 * The corpus read, faked at the DATABASE boundary rather than at the hook — so the real
 * `buildCorpus`, the real normaliser and the real matcher all run inside this suite. Four verses
 * is enough to separate the states; the matcher's own behaviour is pinned against all 6,236 rows
 * in `features/search/lib/search.test.ts`.
 */
const mockGetAllVersesForSearch = jest.fn();
jest.mock('@/lib/quranDb', () => ({
  getAllVersesForSearch: (...args: unknown[]) => mockGetAllVersesForSearch(...args),
}));

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import Search from '@/app/search';
import { __resetSearchCorpusForTests } from '@/features/search/hooks/useSearchCorpus';
import i18n from '@/i18n';

jest.useFakeTimers();

/** 1:1–1:3 and 2:255, with both orthographies, exactly as the database stores them. */
const VERSES = [
  {
    surah: 1,
    verse: 1,
    textUthmani: 'بِسْمِ ٱللَّهِ',
    textSimple: 'بسم الله',
    translation: 'In the name of Allah, the Entirely Merciful, the Especially Merciful.',
  },
  {
    surah: 1,
    verse: 3,
    textUthmani: 'ٱلرَّحْمَٰنِ' + ' ٱلرَّحِيمِ',
    textSimple: 'الرحمن الرحيم',
    translation: 'The Entirely Merciful, the Especially Merciful,',
  },
  {
    surah: 2,
    verse: 255,
    textUthmani: 'ٱللَّهُ لَآ إِلَٰهَ',
    textSimple: 'الله لا اله',
    translation: 'Allah - there is no deity except Him, the Ever-Living, the Sustainer.',
  },
];

/** Mount and flush the corpus load's microtask, under the suite's fake timers. */
async function renderScreen() {
  render(<Search />);
  // ⚠️ THE TIMER RUN IS REQUIRED, NOT BELT-AND-BRACES. `loadCorpus` yields a MACROTASK between
  // the database read and the fold, so the `LoadingView` can actually paint before the JS thread
  // disappears into 6,236 rows of normalisation. Under fake timers a microtask flush alone
  // leaves the corpus permanently loading, and every state below reads as "still loading".
  await settleCorpus();
}

/**
 * Let a corpus load finish — the FIRST one or a retry's.
 *
 * ⚠️ ORDER MATTERS: `loadCorpus` yields a MACROTASK between the database read and the fold, so
 * the `LoadingView` can paint before the JS thread disappears into 6,236 rows of normalisation.
 * The yield is SCHEDULED only once the awaited read resolves, so a timer run before that
 * microtask flush finds nothing pending and the corpus stays loading forever. Flush, run, flush.
 */
async function settleCorpus() {
  await act(async () => {});
  await act(async () => {
    jest.runOnlyPendingTimers();
  });
  await act(async () => {});
}

/**
 * Type into the field and let the scan settle.
 *
 * ⚠️ TWO `act`s, BECAUSE THE SCAN RUNS ON A DEFERRED VALUE. `useDeferredValue` schedules the
 * rescan at a lower priority than the keystroke, so the first flush paints the new field value
 * against the OLD result list — which is the whole point on a device and an off-by-one render in
 * a test. The second flush is where the results catch up.
 */
function type(query: string) {
  act(() => {
    fireEvent.changeText(screen.getByTestId('search-field-input'), query);
  });
  act(() => {});
}

/** Press, then run the deferred navigation macrotask (the 6-3 deferral, see the header). */
function pressAndSettle(testID: string) {
  fireEvent.press(screen.getByTestId(testID));
  act(() => {
    jest.runOnlyPendingTimers();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  __resetSearchCorpusForTests();
  mockRouteParams.current = {};
  mockReadingPositionRow.current = null;
  mockCanDismiss.mockReturnValue(true);
  mockStackDepth = 2;
  mockGetAllVersesForSearch.mockResolvedValue(VERSES);
});

afterEach(async () => {
  await act(async () => {
    await i18n.changeLanguage('en');
  });
});

describe('the four body states', () => {
  it('rests with a plain invitation before anything is typed — never "no matches"', async () => {
    await renderScreen();
    expect(screen.getByTestId('search-resting')).toBeTruthy();
    expect(screen.queryByTestId('search-empty')).toBeNull();
    expect(screen.queryByTestId('search-results')).toBeNull();
  });

  it('stays at rest for a one-character query — no search, and no scolding', async () => {
    await renderScreen();
    type('ب');
    expect(screen.getByTestId('search-resting')).toBeTruthy();
    expect(screen.queryByTestId('search-empty')).toBeNull();
  });

  it('says plainly that nothing matched, and leaves the field ready', async () => {
    await renderScreen();
    type('qwerty');
    expect(screen.getByTestId('search-empty')).toBeTruthy();
    // The field keeps what was typed — a cleared field would be a search the reader cannot edit.
    expect(screen.getByTestId('search-field-input').props.value).toBe('qwerty');
  });

  it('shows a real error surface with a retry when the corpus cannot be read', async () => {
    mockGetAllVersesForSearch.mockRejectedValueOnce(new Error('asset missing'));
    await renderScreen();
    expect(screen.getByTestId('search-error')).toBeTruthy();

    // The retry actually re-reads — a failed load is not cached (`useSearchCorpus`).
    mockGetAllVersesForSearch.mockResolvedValue(VERSES);
    fireEvent.press(screen.getByTestId('error-view-action'));
    await settleCorpus();
    expect(mockGetAllVersesForSearch).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('search-error')).toBeNull();
    expect(screen.getByTestId('search-resting')).toBeTruthy();
  });
});

describe('matching, end to end through the real normaliser', () => {
  it('finds a verse from a bare Arabic query against fully-vocalised text', async () => {
    await renderScreen();
    type('الرحمن');
    expect(screen.getByTestId('search-result-1:3')).toBeTruthy();
    expect(screen.queryByTestId('search-result-1:1')).toBeNull();
  });

  it('returns the SAME verse for the vocalised spelling of the same query', async () => {
    await renderScreen();
    type('ٱلرَّحْمَٰنِ');
    expect(screen.getByTestId('search-result-1:3')).toBeTruthy();
    expect(screen.queryByTestId('search-result-1:1')).toBeNull();
  });

  it('matches the English translation and says so on the row', async () => {
    await renderScreen();
    type('the Ever-Living');
    expect(screen.getByTestId('search-result-2:255')).toBeTruthy();
    expect(screen.getByText('Al-Baqarah 2:255 · Translation')).toBeTruthy();
  });
});

describe('a result tap', () => {
  it('writes the pair ONCE and then unwinds the WHOLE stack, not one screen', async () => {
    await renderScreen();
    type('الرحمن');
    pressAndSettle('search-result-1:3-open');

    expect(mockSetReadingPosition).toHaveBeenCalledTimes(1);
    expect(mockSetReadingPosition).toHaveBeenCalledWith(
      expect.objectContaining({ surah: 1, verse: 3, mode: 'reading' })
    );
    // ⚠️ TWO pops, not one: search is pushed FROM the index, so a single `back()` would leave the
    // reader looking at the surah list with their verse loaded behind it.
    expect(mockBack).toHaveBeenCalledTimes(2);
    // ⚠️ AND NO NAVIGATION. This is the regression guard for the measured WebKit crash: on a
    // deep-linked `/search` the tabs are already mounted beneath the modal, so `dismissAll()` or
    // `replace()` re-enters a mounted tree and re-renders until React throws "Maximum update
    // depth exceeded". Popping reveals what is already there; navigating re-enters it.
    expect(mockDismissAll).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('writes the mushaf mode when that is where the reader came from', async () => {
    mockRouteParams.current = { mode: 'mushaf' };
    await renderScreen();
    type('الرحمن');
    pressAndSettle('search-result-1:3-open');
    expect(mockSetReadingPosition).toHaveBeenCalledWith(
      expect.objectContaining({ surah: 1, verse: 3, mode: 'mushaf' })
    );
  });

  it('writes BEFORE it navigates — a write after the refocus is a jump that never happens', async () => {
    await renderScreen();
    type('الرحمن');
    fireEvent.press(screen.getByTestId('search-result-1:3-open'));
    // The write is synchronous with the press; the unwind is one macrotask later.
    expect(mockSetReadingPosition).toHaveBeenCalledTimes(1);
    expect(mockBack).not.toHaveBeenCalled();
    act(() => {
      jest.runOnlyPendingTimers();
    });
    expect(mockBack).toHaveBeenCalledTimes(2);
  });

  it('ignores a second tap inside the deferral window — one destination, not two', async () => {
    await renderScreen();
    type('الله');
    fireEvent.press(screen.getByTestId('search-result-1:1-open'));
    fireEvent.press(screen.getByTestId('search-result-2:255-open'));
    act(() => {
      jest.runOnlyPendingTimers();
    });
    expect(mockSetReadingPosition).toHaveBeenCalledTimes(1);
    expect(mockSetReadingPosition).toHaveBeenCalledWith(
      expect.objectContaining({ surah: 1, verse: 1 })
    );
    expect(mockBack).toHaveBeenCalledTimes(2);
  });

  it('replaces toward the opener home ONLY when there was nothing to pop — a deep link', async () => {
    // Nothing pushed beneath: the loop pops zero times, and only then may we navigate, because
    // the alternative is dead-ending on a screen with no back control.
    mockStackDepth = 0;
    mockRouteParams.current = { mode: 'mushaf' };
    await renderScreen();
    type('الرحمن');
    pressAndSettle('search-result-1:3-open');
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('does NOT navigate once it has popped — the crash guard, stated as its own case', async () => {
    // ⚠️ The measured defect was a `replace`/`dismissAll` landing on a tab route that was ALREADY
    // mounted under the modal. If the loop popped anything, we are where we belong and any
    // further navigation re-enters that tree. A mutation that drops the `popped === 0` guard
    // reddens here and nowhere else.
    mockStackDepth = 2;
    await renderScreen();
    type('الرحمن');
    pressAndSettle('search-result-1:3-open');
    expect(mockBack).toHaveBeenCalledTimes(2);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('still navigates when the tapped verse IS the saved one — the write is the no-op', async () => {
    // `usePosition`'s comparison suppresses a same-pair write; the reader must still land there.
    mockReadingPositionRow.current = { surah: 1, verse: 3 };
    await renderScreen();
    type('الرحمن');
    pressAndSettle('search-result-1:3-open');
    expect(mockSetReadingPosition).not.toHaveBeenCalled();
    expect(mockBack).toHaveBeenCalledTimes(2);
  });
});

describe('opened and dismissed without a selection', () => {
  it('writes NOTHING — the reading position underneath is exactly unchanged', async () => {
    mockReadingPositionRow.current = { surah: 18, verse: 10 };
    const view = render(<Search />);
    await act(async () => {});
    type('الرحمن');
    type('qwerty');
    type('');
    view.unmount();
    act(() => {
      jest.runOnlyPendingTimers();
    });
    expect(mockSetReadingPosition).not.toHaveBeenCalled();
    expect(mockDismissAll).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});

describe('the corpus', () => {
  it('is read ONCE per launch, not once per visit', async () => {
    await renderScreen();
    expect(mockGetAllVersesForSearch).toHaveBeenCalledTimes(1);
    screen.unmount();
    await renderScreen();
    expect(mockGetAllVersesForSearch).toHaveBeenCalledTimes(1);
    // …and the second visit opens straight at its resting state, with no loading flash.
    expect(screen.getByTestId('search-resting')).toBeTruthy();
  });
});
