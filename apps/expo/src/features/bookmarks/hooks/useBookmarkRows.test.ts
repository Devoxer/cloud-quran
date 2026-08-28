/**
 * `useBookmarkRows` — the sync-rows → Arabic-previews join (story 6-4).
 *
 * The four decisions under test, each individually removable with everything else green:
 * most-recent-first with a STABLE tie-break; re-query only when the KEY SET changes (not on
 * every array identity); a preview failure degrades the decoration and never the list; and an
 * orphan pair (no verse in the database) keeps its row — the pre-fork hid orphans forever.
 */

const mockUseBookmarks = jest.fn();
jest.mock('@/lib/sync', () => ({
  useBookmarks: () => mockUseBookmarks(),
}));

const mockGetVersesForPositions = jest.fn();
jest.mock('@/lib/quranDb', () => ({
  getVersesForPositions: (...args: unknown[]) => mockGetVersesForPositions(...args),
}));

import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useBookmarkRows } from './useBookmarkRows';

type TestBookmark = {
  id: string;
  userId: string;
  surah: number;
  verse: number;
  label: string | null;
  createdAt: number;
};

function bookmark(id: string, surah: number, verse: number, createdAt: number): TestBookmark {
  return { id, userId: 'u', surah, verse, label: null, createdAt };
}

function verse(surah: number, verseNumber: number, text: string) {
  return { surah, verse: verseNumber, textUthmani: text, textSimple: text };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseBookmarks.mockReturnValue({ data: [] });
  mockGetVersesForPositions.mockResolvedValue([]);
});

describe('order', () => {
  it('sorts most-recent-first, bookmark id as the tie-break', async () => {
    mockUseBookmarks.mockReturnValue({
      data: [
        bookmark('bk-c', 1, 1, 100),
        bookmark('bk-b', 2, 2, 300),
        // Two rows in the same millisecond: the id keeps the order stable across renders.
        bookmark('bk-z', 3, 3, 200),
        bookmark('bk-a', 4, 4, 200),
      ],
    });
    const { result } = renderHook(() => useBookmarkRows());
    expect(result.current.map((r) => r.id)).toEqual(['bk-b', 'bk-a', 'bk-z', 'bk-c']);
    await act(async () => {});
  });
});

describe('the preview join', () => {
  it('attaches each verse to its row by PAIR', async () => {
    mockUseBookmarks.mockReturnValue({
      data: [bookmark('bk-1', 1, 1, 200), bookmark('bk-2', 2, 255, 100)],
    });
    mockGetVersesForPositions.mockResolvedValue([verse(2, 255, 'آية الكرسي'), verse(1, 1, 'بِسْمِ')]);
    const { result } = renderHook(() => useBookmarkRows());
    await waitFor(() => expect(result.current[0]?.preview).toBe('بِسْمِ'));
    expect(result.current[1]).toMatchObject({ id: 'bk-2', preview: 'آية الكرسي' });
    expect(mockGetVersesForPositions).toHaveBeenCalledWith([
      { surah: 1, verse: 1 },
      { surah: 2, verse: 255 },
    ]);
  });

  it('keeps an ORPHAN row whose pair the database cannot answer — preview null, row present', async () => {
    // ⚠️ The pre-fork filtered these out, silently hiding a corrupt bookmark forever. Decided
    // against: the row still renders, still navigates, and can still be deleted.
    mockUseBookmarks.mockReturnValue({
      data: [bookmark('bk-ok', 1, 1, 200), bookmark('bk-orphan', 200, 1, 100)],
    });
    mockGetVersesForPositions.mockResolvedValue([verse(1, 1, 'بِسْمِ')]);
    const { result } = renderHook(() => useBookmarkRows());
    await waitFor(() => expect(result.current[0]?.preview).toBe('بِسْمِ'));
    expect(result.current).toHaveLength(2);
    expect(result.current[1]).toMatchObject({ id: 'bk-orphan', preview: null });
  });

  it('degrades EVERY row to no preview when the database read fails — the list survives', async () => {
    mockUseBookmarks.mockReturnValue({ data: [bookmark('bk-1', 1, 1, 100)] });
    mockGetVersesForPositions.mockRejectedValue(new Error('asset missing'));
    const { result } = renderHook(() => useBookmarkRows());
    // The failure is silent per the frozen matrix: rows render (name + ref + delete +
    // navigation) with the preview line absent — never a takeover, never an empty list.
    await act(async () => {});
    expect(result.current).toHaveLength(1);
    expect(result.current[0]).toMatchObject({ id: 'bk-1', surah: 1, verse: 1, preview: null });
  });

  it('does not open the database at all for an empty list', async () => {
    renderHook(() => useBookmarkRows());
    await act(async () => {});
    expect(mockGetVersesForPositions).not.toHaveBeenCalled();
  });
});

describe('the requery discipline', () => {
  it('a fresh array identity with the SAME key set re-queries NOTHING', async () => {
    // ⚠️ `useBookmarks()`'s array gets a new identity on unrelated cache traffic (a refetch, LWW
    // writes on other entities re-rendering the tree). An effect keyed on the array would hit
    // the database per render; the key-set string is what the effect may depend on.
    mockUseBookmarks.mockReturnValue({ data: [bookmark('bk-1', 1, 1, 100)] });
    mockGetVersesForPositions.mockResolvedValue([verse(1, 1, 'بِسْمِ')]);
    const { result, rerender } = renderHook(() => useBookmarkRows());
    await waitFor(() => expect(result.current[0]?.preview).toBe('بِسْمِ'));
    expect(mockGetVersesForPositions).toHaveBeenCalledTimes(1);

    mockUseBookmarks.mockReturnValue({ data: [bookmark('bk-1', 1, 1, 100)] });
    rerender(undefined);
    await act(async () => {});
    expect(mockGetVersesForPositions).toHaveBeenCalledTimes(1);
  });

  it('a CHANGED key set re-queries once, with the new pairs', async () => {
    mockUseBookmarks.mockReturnValue({ data: [bookmark('bk-1', 1, 1, 100)] });
    mockGetVersesForPositions.mockResolvedValue([verse(1, 1, 'بِسْمِ')]);
    const { result, rerender } = renderHook(() => useBookmarkRows());
    await waitFor(() => expect(result.current[0]?.preview).toBe('بِسْمِ'));

    mockUseBookmarks.mockReturnValue({
      data: [bookmark('bk-2', 2, 255, 200), bookmark('bk-1', 1, 1, 100)],
    });
    mockGetVersesForPositions.mockResolvedValue([verse(1, 1, 'بِسْمِ'), verse(2, 255, 'آية الكرسي')]);
    rerender(undefined);
    await waitFor(() => expect(result.current[0]?.preview).toBe('آية الكرسي'));
    expect(mockGetVersesForPositions).toHaveBeenCalledTimes(2);
    expect(mockGetVersesForPositions).toHaveBeenLastCalledWith([
      { surah: 2, verse: 255 },
      { surah: 1, verse: 1 },
    ]);
  });
});
