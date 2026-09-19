/**
 * The read that stands between an installed pack and the study sheet (story 8-3).
 *
 * Four mechanisms here fail INVISIBLY, so each has its own case:
 *   1. **`empty` is not `error`.** No installed source is the CORRECT state for four of the five
 *      types on a fresh install and is answered with a download offer; a read that FAILED is
 *      answered with a retry. Collapsing them tells a reader to fix the wrong thing.
 *   2. **`empty` still carries the Arabic.** The frozen criterion is "the Arabic at the top for
 *      context"; the bundled text is present on every platform with no pack at all.
 *   3. **The join never drops an ayah.** A pack missing the verse the reader selected keeps its
 *      row with `content: null` — "this source says nothing here" is information.
 *   4. **Order comes from the RANGE.** Both reads document that their result order carries no
 *      meaning; a list ordered by either query is a list of ayat in an arbitrary order.
 */

const mockGetVersesForPositions = jest.fn();
const mockGetPackRange = jest.fn();
const mockCaptureException = jest.fn();

jest.mock('@/lib/quranDb', () => ({
  getVersesForPositions: (...args: unknown[]) => mockGetVersesForPositions(...args),
  getPackRange: (...args: unknown[]) => mockGetPackRange(...args),
}));
jest.mock('@/lib/errors', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { VerseRange } from '../lib/scope';
import { useStudyContent } from './useStudyContent';

/** Al-Fatihah 1–3, as the bundled database answers them — deliberately out of range order. */
const QURAN = [
  { surah: 1, verse: 3, textUthmani: 'ٱلرَّحْمَٰنِ ٱلرَّحِيمِ', textSimple: 'c' },
  { surah: 1, verse: 1, textUthmani: 'بِسْمِ ٱللَّهِ', textSimple: 'a' },
  { surah: 1, verse: 2, textUthmani: 'ٱلْحَمْدُ لِلَّهِ', textSimple: 'b' },
];

const RANGE: VerseRange = { from: { surah: 1, verse: 1 }, to: { surah: 1, verse: 3 } };

function deferred<T>() {
  let settle: (value: T) => void = () => {};
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetVersesForPositions.mockResolvedValue(QURAN);
  mockGetPackRange.mockResolvedValue([]);
});

describe('with a source', () => {
  it('joins the source onto the Quran, IN RANGE ORDER', async () => {
    mockGetPackRange.mockResolvedValue([
      { surah: 1, verse: 2, text: 'Louange à Allah', footnotes: 'note' },
      { surah: 1, verse: 1, text: 'Au nom d’Allah', footnotes: null },
      { surah: 1, verse: 3, text: 'le Tout Miséricordieux', footnotes: null },
    ]);
    const { result } = renderHook(() => useStudyContent(RANGE, 'translation-fr-rashid'));
    await waitFor(() => expect(result.current.state.kind).toBe('ready'));

    const state = result.current.state;
    if (state.kind !== 'ready') throw new Error('expected ready');
    // MUTATION: order by either query's answer. Both are shuffled above, and both would pass a
    // test that only counted rows.
    expect(state.rows.map((row) => row.verse)).toEqual([1, 2, 3]);
    expect(state.rows[0].arabic).toBe('بِسْمِ ٱللَّهِ');
    expect(state.rows[0].content).toBe('Au nom d’Allah');
    expect(state.rows[1].footnotes).toBe('note');
  });

  it('reads the pack by RANGE, with both ends — never a per-ayah loop', async () => {
    renderHook(() => useStudyContent(RANGE, 'translation-fr-rashid'));
    await waitFor(() => expect(mockGetPackRange).toHaveBeenCalled());
    expect(mockGetPackRange).toHaveBeenCalledTimes(1);
    expect(mockGetPackRange).toHaveBeenCalledWith(
      'translation-fr-rashid',
      { surah: 1, verse: 1 },
      { surah: 1, verse: 3 }
    );
  });

  it('KEEPS a row the source has nothing for', async () => {
    // A partial edition, or an ayah an editor skipped. `useBookmarkRows`' rule: a row survives
    // its join failing — a silently shorter list is not information.
    mockGetPackRange.mockResolvedValue([
      { surah: 1, verse: 1, text: 'Au nom d’Allah', footnotes: null },
    ]);
    const { result } = renderHook(() => useStudyContent(RANGE, 'translation-fr-rashid'));
    await waitFor(() => expect(result.current.state.kind).toBe('ready'));

    const state = result.current.state;
    if (state.kind !== 'ready') throw new Error('expected ready');
    expect(state.rows).toHaveLength(3);
    expect(state.rows[1].content).toBeNull();
    expect(state.rows[1].arabic).toBe('ٱلْحَمْدُ لِلَّهِ');
  });
});

describe('without a source', () => {
  it('is `empty`, it reads NO pack, and it still carries the Arabic', async () => {
    const { result } = renderHook(() => useStudyContent(RANGE, null));
    await waitFor(() => expect(result.current.state.kind).toBe('empty'));

    const state = result.current.state;
    if (state.kind !== 'empty') throw new Error('expected empty');
    expect(mockGetPackRange).not.toHaveBeenCalled();
    expect(state.rows.map((row) => row.arabic)).toEqual(['بِسْمِ ٱللَّهِ', 'ٱلْحَمْدُ لِلَّهِ', 'ٱلرَّحْمَٰنِ ٱلرَّحِيمِ']);
    expect(state.rows.every((row) => row.content === null)).toBe(true);
  });
});

describe('failure', () => {
  it('is a VALUE, and `error` is not `empty`', async () => {
    mockGetPackRange.mockRejectedValue(new Error('file removed under a live handle'));
    const { result } = renderHook(() => useStudyContent(RANGE, 'translation-fr-rashid'));
    await waitFor(() => expect(result.current.state.kind).toBe('error'));
    expect(mockCaptureException).toHaveBeenCalled();
  });

  it('retries by RE-RUNNING the reads, not by replaying the failure', async () => {
    mockGetPackRange.mockRejectedValueOnce(new Error('transient'));
    mockGetPackRange.mockResolvedValue([
      { surah: 1, verse: 1, text: 'Au nom d’Allah', footnotes: null },
    ]);
    const { result } = renderHook(() => useStudyContent(RANGE, 'translation-fr-rashid'));
    await waitFor(() => expect(result.current.state.kind).toBe('error'));

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.state.kind).toBe('ready'));
    expect(mockGetPackRange).toHaveBeenCalledTimes(2);
  });
});

describe('a scope change mid-read', () => {
  it('lets the LAST scope win even when its read lands FIRST', async () => {
    // ⚠️ THE CANCELLATION IS LOAD-BEARING AND REMOVING IT PASSES EVERY OTHER CASE. Two quick
    // scope presses start two reads; without the latch the SLOWER one lands last and the reader
    // sees the page's ayat under a control that says "Surah". Deferred, resolved out of order.
    const first = deferred<unknown[]>();
    const second = deferred<unknown[]>();
    mockGetPackRange.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const { result, rerender } = renderHook(
      ({ range }: { range: VerseRange }) => useStudyContent(range, 'translation-fr-rashid'),
      { initialProps: { range: RANGE } }
    );

    const narrower: VerseRange = { from: { surah: 1, verse: 2 }, to: { surah: 1, verse: 2 } };
    rerender({ range: narrower });

    await act(async () => {
      second.settle([{ surah: 1, verse: 2, text: 'the new scope', footnotes: null }]);
      first.settle([{ surah: 1, verse: 1, text: 'the OLD scope', footnotes: null }]);
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.state.kind).toBe('ready'));
    const state = result.current.state;
    if (state.kind !== 'ready') throw new Error('expected ready');
    expect(state.rows).toHaveLength(1);
    expect(state.rows[0].content).toBe('the new scope');
  });
});
