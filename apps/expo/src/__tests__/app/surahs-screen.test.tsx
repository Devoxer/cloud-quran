/**
 * `/surahs` — the Quran index, driven (story 6-3). Lives HERE, never beside the route: a
 * co-located test under `app/` becomes a phantom route in the web export (the rule
 * `route-integrity.test.ts` enforces).
 *
 * ⚠️ WHAT THIS FILE PINS IS THE WRITE DISCIPLINE AT THE SEAM. A selection is ONE
 * `reportVerse` — which must land BEFORE the navigation pops, because the surface underneath
 * re-resolves the saved pair on focus and a write that arrives after the refocus is a jump that
 * never happens. The current surah's row writes NOTHING (a write of `(surah, 1)` would clobber
 * the reader's saved verse), and a juz'/hizb row whose start IS the saved pair is suppressed by
 * `usePosition`'s own comparison — this suite runs the REAL `usePosition` over a mocked
 * `@/lib/sync` precisely so that comparison is the thing under test.
 */

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockNavigate = jest.fn();
const mockCanGoBack = jest.fn<boolean, []>(() => true);
const mockParams = { current: {} as Record<string, string> };

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    replace: mockReplace,
    navigate: mockNavigate,
    push: jest.fn(),
    canGoBack: () => mockCanGoBack(),
  }),
  useLocalSearchParams: () => mockParams.current,
  useSegments: () => ['surahs'],
}));

/** Captured on every render so a case can assert what the list was configured with. */
const mockListProps: Record<string, unknown>[] = [];

jest.mock('@shopify/flash-list', () => {
  const React = require('react');
  const { View } = require('react-native');
  const FlashList = React.forwardRef((props: any, ref: any) => {
    mockListProps.push(props);
    React.useImperativeHandle(ref, () => ({
      scrollToIndex: jest.fn(),
      scrollToOffset: jest.fn(),
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

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { getPageForVerse } from 'quran-data';
import Surahs from '@/app/surahs';

/**
 * ⚠️ THE EXIT IS DEFERRED ONE MACROTASK, SO A PRESS ALONE NAVIGATES NOTHING IN A TEST.
 * `QuranIndexScreen.exit()` wraps its `back()`/`replace()` in `setTimeout(…, 0)` — a MEASURED fix
 * (see that file's docblock: without it the surfaces' focus resync read a stale `savedRef` and the
 * reader stayed on page 1). These cases were written against the pre-deferral shape and asserted
 * `mockBack` synchronously, so they reddened the moment the fix landed. Fake timers keep the
 * ordering assertions (`invocationCallOrder`) meaningful, which a real `await` would not.
 */
function select(testID: string) {
  fireEvent.press(screen.getByTestId(testID));
  act(() => {
    jest.runOnlyPendingTimers();
  });
}

jest.useFakeTimers();

/** The most recent props the list was rendered with. */
function listProps(): Record<string, unknown> {
  return mockListProps[mockListProps.length - 1];
}

/** Flattened style of one element, as an object. */
function styleOf(testID: string): Record<string, unknown> {
  const style = screen.getByTestId(testID).props.style;
  const flat = (Array.isArray(style) ? style.flat(3) : [style]).filter(Boolean);
  return Object.assign({}, ...flat.map((s: unknown) => (typeof s === 'object' ? s : {})));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockListProps.length = 0;
  mockCanGoBack.mockReturnValue(true);
  mockReadingPositionRow.current = null;
  mockParams.current = {};
});

describe('the Surahs segment', () => {
  it('lists all 114 with number, Arabic name, transliteration, English name, verse count and revelation type', () => {
    render(<Surahs />);
    expect(screen.getByTestId('surah-row-1')).toBeTruthy();
    expect(screen.getByTestId('surah-row-114')).toBeTruthy();
    expect(screen.queryByTestId('surah-row-115')).toBeNull();
    // Row 1, field by field — the frozen matrix's row-content row.
    expect(screen.getByText('Al-Fatihah')).toBeTruthy();
    expect(screen.getByText('الفاتحة')).toBeTruthy();
    expect(screen.getByText('The Opening · 7 verses · Meccan')).toBeTruthy();
    // A Medinan row too, so the revelation branch is not one-sided.
    expect(screen.getByText('The Cow · 286 verses · Medinan')).toBeTruthy();
  });

  it('opens scrolled to and highlighting the surah being read', () => {
    mockReadingPositionRow.current = { surah: 2, verse: 255 };
    render(<Surahs />);
    // Uniform fixed-height rows make the index exact — the docblock's mushaf precedent.
    expect(listProps().initialScrollIndex).toBe(1);
    expect(styleOf('surah-row-2').backgroundColor).toBeTruthy();
    expect(styleOf('surah-row-1').backgroundColor).toBeUndefined();
  });

  it('highlights surah 1 for a corrupt saved row — clamp, never trust', () => {
    mockReadingPositionRow.current = { surah: 200, verse: 1 };
    render(<Surahs />);
    expect(styleOf('surah-row-1').backgroundColor).toBeTruthy();
    expect(listProps().initialScrollIndex).toBeUndefined();
  });
});

describe('the segments switch', () => {
  it('Juz’ shows 30 rows, Hizb shows 60, and the surahs come back', () => {
    render(<Surahs />);
    fireEvent.press(screen.getByTestId('index-segment-1'));
    expect(screen.getByTestId('juz-row-1')).toBeTruthy();
    expect(screen.getByTestId('juz-row-30')).toBeTruthy();
    expect(screen.queryByTestId('surah-row-1')).toBeNull();
    fireEvent.press(screen.getByTestId('index-segment-2'));
    expect(screen.getByTestId('hizb-row-60')).toBeTruthy();
    expect(screen.queryByTestId('juz-row-1')).toBeNull();
    fireEvent.press(screen.getByTestId('index-segment-0'));
    expect(screen.getByTestId('surah-row-1')).toBeTruthy();
  });

  it('a juz’ row names its start pair and its DERIVED page', () => {
    render(<Surahs />);
    fireEvent.press(screen.getByTestId('index-segment-1'));
    // Juz' 3 starts at 2:253, which the verse↔page map puts on page 42.
    expect(screen.getByText('Al-Baqarah 2:253 · Page 42')).toBeTruthy();
  });
});

describe('a selection writes ONCE, through usePosition, then pops', () => {
  it('another surah: one write of (surah, 1) in the opener’s mode, BEFORE the back', () => {
    mockReadingPositionRow.current = { surah: 2, verse: 255 };
    render(<Surahs />);
    select('surah-row-5');
    expect(mockSetReadingPosition).toHaveBeenCalledTimes(1);
    expect(mockSetReadingPosition.mock.calls[0][0]).toMatchObject({
      surah: 5,
      verse: 1,
      page: getPageForVerse(5, 1),
      mode: 'reading',
    });
    expect(mockBack).toHaveBeenCalledTimes(1);
    // Write-before-navigation: the surface's focus resync reads the pair at refocus time.
    expect(mockSetReadingPosition.mock.invocationCallOrder[0]).toBeLessThan(
      mockBack.mock.invocationCallOrder[0]
    );
  });

  it('the pop is DEFERRED — nothing has navigated when the press returns', () => {
    // ⚠️ THE CASE THAT MAKES THE DEFERRAL A FIX RATHER THAN DECORATION, AND IT WAS MISSING.
    // `exit()` wraps its `back()`/`replace()` in `setTimeout(…, 0)` because the surfaces' focus
    // resync reads `savedRef.current`, a ref assigned during RENDER: popping synchronously fires
    // the focus callback before React has flushed the write's re-render, so the resync reads a
    // stale ref, no-ops, and the reader stays on page 1 (measured on web, 2026-08-28).
    // Demonstrated during review: replacing the setTimeout with a direct call left all 13 cases
    // in this file GREEN, because `select()` runs the timers before every assertion. This is the
    // one case that looks BEFORE the flush, so deleting the deferral now reddens.
    mockReadingPositionRow.current = { surah: 2, verse: 255 };
    render(<Surahs />);
    fireEvent.press(screen.getByTestId('surah-row-5'));
    expect(mockSetReadingPosition).toHaveBeenCalledTimes(1); // the write is NOT deferred
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    act(() => {
      jest.runOnlyPendingTimers();
    });
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('a second row pressed inside the deferral window writes ONCE, not twice', () => {
    // The one-shot guard lives in the handlers, not only in `exit()`: the write runs before the
    // pop, so guarding the pop alone still lets a second tap overwrite the reader's destination.
    mockReadingPositionRow.current = { surah: 2, verse: 255 };
    render(<Surahs />);
    fireEvent.press(screen.getByTestId('surah-row-5'));
    fireEvent.press(screen.getByTestId('surah-row-9'));
    act(() => {
      jest.runOnlyPendingTimers();
    });
    expect(mockSetReadingPosition).toHaveBeenCalledTimes(1);
    expect(mockSetReadingPosition.mock.calls[0][0]).toMatchObject({ surah: 5 });
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('the CURRENT surah’s row writes NOTHING and just returns — the saved verse survives', () => {
    // MUTATION: writing (2, 1) here clobbers a reader at 2:255 back to the surah top.
    mockReadingPositionRow.current = { surah: 2, verse: 255 };
    render(<Surahs />);
    select('surah-row-2');
    expect(mockSetReadingPosition).not.toHaveBeenCalled();
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('a juz’ row writes its (startSurah, startVerse) PAIR — never page arithmetic', () => {
    mockParams.current = { mode: 'mushaf' };
    mockReadingPositionRow.current = { surah: 1, verse: 1 };
    render(<Surahs />);
    fireEvent.press(screen.getByTestId('index-segment-1'));
    select('juz-row-3');
    expect(mockSetReadingPosition).toHaveBeenCalledTimes(1);
    expect(mockSetReadingPosition.mock.calls[0][0]).toMatchObject({
      surah: 2,
      verse: 253,
      page: 42,
      mode: 'mushaf',
    });
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('a boundary that IS the saved pair writes nothing — usePosition’s comparison holds', () => {
    mockReadingPositionRow.current = { surah: 2, verse: 253 };
    render(<Surahs />);
    fireEvent.press(screen.getByTestId('index-segment-1'));
    select('juz-row-3');
    expect(mockSetReadingPosition).not.toHaveBeenCalled();
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});

describe('the way out', () => {
  it('with history: back pops, and the chevron is there', () => {
    render(<Surahs />);
    expect(screen.getByTestId('chrome-back')).toBeTruthy();
    select('surah-row-5');
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('deep-linked (no history): the chevron is ABSENT and a selection replaces to reading’s home', () => {
    mockCanGoBack.mockReturnValue(false);
    render(<Surahs />);
    expect(screen.queryByTestId('chrome-back')).toBeNull();
    select('surah-row-5');
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/read');
  });

  it('…and to the mushaf’s home when that is the opener’s mode', () => {
    mockCanGoBack.mockReturnValue(false);
    mockParams.current = { mode: 'mushaf' };
    render(<Surahs />);
    select('surah-row-5');
    expect(mockReplace).toHaveBeenCalledWith('/');
  });
});

describe('the mode param', () => {
  it('anything that is not `mushaf` — including garbage — is reading mode', () => {
    mockParams.current = { mode: 'bogus' };
    render(<Surahs />);
    select('surah-row-5');
    expect(mockSetReadingPosition.mock.calls[0][0]).toMatchObject({ mode: 'reading' });
  });
});
