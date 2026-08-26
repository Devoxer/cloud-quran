/**
 * The verse-change write rule (story 6-1).
 *
 * ⚠️ THIS FILE IS THE FIX FOR `chrome-render-storm`'s FIRST HALF, and the defect it guards is
 * cheap to reintroduce: the pre-fork build fired a database transaction straight out of
 * `onViewableItemsChanged` with no comparison at all, and a write-per-tick client burned a day of
 * the account-wide budget in 4.6 hours. Every case below is written so that removing the
 * comparison, or narrowing it to the verse number alone, reddens.
 *
 * The mutations this file must catch, all of which type-check and lint clean:
 *   1. `reportVerse` calls `setReadingPosition` unconditionally (the original defect);
 *   2. the comparison key drops the surah (`2:1 → 3:1` then looks like "no change");
 *   3. the seed from the saved row is removed (every launch spends a write re-asserting a
 *      position that has not moved).
 */

import { act, renderHook } from '@testing-library/react-native';

const mockSetReadingPosition = jest.fn();
const mockUseReadingPosition = jest.fn(() => ({ data: null as unknown }));

jest.mock('./sync', () => ({
  setReadingPosition: (...args: unknown[]) => mockSetReadingPosition(...args),
  useReadingPosition: () => mockUseReadingPosition(),
}));

import { usePosition, verseKey } from './usePosition';

beforeEach(() => {
  jest.clearAllMocks();
  mockUseReadingPosition.mockReturnValue({ data: null });
});

describe('a write fires on VERSE CHANGE, and only then', () => {
  it('writes once when the verse changes', () => {
    const { result } = renderHook(() => usePosition());
    act(() => result.current.reportVerse(2, 5));
    expect(mockSetReadingPosition).toHaveBeenCalledTimes(1);
    expect(mockSetReadingPosition).toHaveBeenCalledWith({
      surah: 2,
      verse: 5,
      page: 2,
      mode: 'reading',
    });
  });

  it('writes ZERO times for repeated reports of the same verse', () => {
    // MUTATION 1 — the original defect. A scroll within one long ayah fires the viewability
    // callback many times; every one of them reports the same pair.
    const { result } = renderHook(() => usePosition());
    act(() => result.current.reportVerse(2, 5));
    mockSetReadingPosition.mockClear();
    act(() => {
      for (let i = 0; i < 50; i++) result.current.reportVerse(2, 5);
    });
    expect(mockSetReadingPosition).not.toHaveBeenCalled();
  });

  it('writes once per boundary across a long scroll', () => {
    // Twenty verses, each reported several times as it crosses the viewport — twenty writes.
    const { result } = renderHook(() => usePosition());
    act(() => {
      for (let verse = 1; verse <= 20; verse++) {
        for (let tick = 0; tick < 4; tick++) result.current.reportVerse(2, verse);
      }
    });
    expect(mockSetReadingPosition).toHaveBeenCalledTimes(20);
  });

  it('treats a SURAH change on the same verse number as a change', () => {
    // MUTATION 2. Comparing verse numbers alone would suppress this write, and `2:1 → 3:1` is a
    // real move — it is the shape every surah boundary takes.
    const { result } = renderHook(() => usePosition());
    act(() => result.current.reportVerse(2, 1));
    act(() => result.current.reportVerse(3, 1));
    expect(mockSetReadingPosition).toHaveBeenCalledTimes(2);
    expect(mockSetReadingPosition.mock.calls[1][0]).toMatchObject({ surah: 3, verse: 1 });
  });

  it('writes again when the reader returns to a verse they already left', () => {
    // The comparison is against the LAST pair written, not a set of everything ever seen —
    // scrolling back up has to move the saved position back.
    const { result } = renderHook(() => usePosition());
    act(() => result.current.reportVerse(2, 5));
    act(() => result.current.reportVerse(2, 6));
    act(() => result.current.reportVerse(2, 5));
    expect(mockSetReadingPosition).toHaveBeenCalledTimes(3);
  });
});

describe('the persisted pair', () => {
  it('always carries the surah — nothing may reduce it to a verse index', () => {
    // The pre-fork store held `currentVerse: number` beside a separate surah, and
    // `setCurrentSurah` reset the verse to 1; the two decoupled and audio in one surah scrolled
    // another surah's list. Asserted on the BODY, because that is what reaches the worker.
    const { result } = renderHook(() => usePosition());
    act(() => result.current.reportVerse(36, 12));
    const body = mockSetReadingPosition.mock.calls[0][0];
    expect(body.surah).toBe(36);
    expect(body.verse).toBe(12);
  });

  it('carries the mushaf page, read from the verse↔page map', () => {
    // `page` is REQUIRED by `ReadingPositionBody` and is a table read, not arithmetic. 2:255 is
    // on page 42 of the Madinah mushaf.
    const { result } = renderHook(() => usePosition());
    act(() => result.current.reportVerse(2, 255));
    expect(mockSetReadingPosition.mock.calls[0][0].page).toBe(42);
  });

  it('carries the reading mode, so a resume knows which renderer to open', () => {
    const { result } = renderHook(() => usePosition());
    act(() => result.current.reportVerse(1, 1));
    expect(mockSetReadingPosition.mock.calls[0][0].mode).toBe('reading');
  });
});

describe('a restored position is not itself a write', () => {
  it('reports the saved verse back without writing', () => {
    // MUTATION 3. On a cold launch the screen scrolls to the saved verse and viewability reports
    // it — which, unseeded, would spend one write per launch re-asserting a position that has not
    // moved. `useReadingPosition` seeds from MMKV synchronously, so the row is there on the FIRST
    // render, which is the only render `useRef`'s initial argument is read on.
    mockUseReadingPosition.mockReturnValue({ data: { surah: 18, verse: 10 } });
    const { result } = renderHook(() => usePosition());
    expect(result.current.saved).toEqual({ surah: 18, verse: 10 });
    act(() => result.current.reportVerse(18, 10));
    expect(mockSetReadingPosition).not.toHaveBeenCalled();
  });

  it('writes as soon as the reader actually moves off it', () => {
    // Anti-vacuity for the case above: the seed must suppress the FIRST identical report, not
    // every report.
    mockUseReadingPosition.mockReturnValue({ data: { surah: 18, verse: 10 } });
    const { result } = renderHook(() => usePosition());
    act(() => result.current.reportVerse(18, 10));
    act(() => result.current.reportVerse(18, 11));
    expect(mockSetReadingPosition).toHaveBeenCalledTimes(1);
    expect(mockSetReadingPosition.mock.calls[0][0]).toMatchObject({ surah: 18, verse: 11 });
  });

  it('is null for a reader who has never read anything anywhere', () => {
    const { result } = renderHook(() => usePosition());
    expect(result.current.saved).toBeNull();
  });
});

describe('verseKey', () => {
  it('is the `{surah}:{verse}` spelling the whole app uses', () => {
    // The same spelling as `VERSE_PAGE_MAP`'s keys and the outbox's bookmark identity — one
    // vocabulary, so a key from one place is readable in another.
    expect(verseKey(2, 255)).toBe('2:255');
  });
});
