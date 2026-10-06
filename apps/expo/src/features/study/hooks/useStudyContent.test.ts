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

const mockOpenPack = jest.fn<Promise<void>, unknown[]>(() => Promise.resolve());

jest.mock('@/lib/quranDb', () => ({
  getVersesForPositions: (...args: unknown[]) => mockGetVersesForPositions(...args),
  getPackRange: (...args: unknown[]) => mockGetPackRange(...args),
  openPack: (...args: unknown[]) => mockOpenPack(...args),
}));
jest.mock('@/lib/errors', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { VerseRange } from '../lib/scope';
import { joinRows, useStudyContent } from './useStudyContent';

/** Al-Fatihah 1–3, as the bundled database answers them — deliberately out of range order. */
const QURAN = [
  { surah: 1, verse: 3, textUthmani: 'ٱلرَّحْمَٰنِ ٱلرَّحِيمِ', textSimple: 'c' },
  { surah: 1, verse: 1, textUthmani: 'بِسْمِ ٱللَّهِ', textSimple: 'a' },
  { surah: 1, verse: 2, textUthmani: 'ٱلْحَمْدُ لِلَّهِ', textSimple: 'b' },
];

const RANGE: VerseRange = { from: { surah: 1, verse: 1 }, to: { surah: 1, verse: 3 } };

/** The source, as the pair the hook needs to OPEN it (story 8-4). */
const FRENCH = { id: 'translation-fr-rashid', version: 2 };

function deferred<T>() {
  let settle: (value: T) => void = () => {};
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockOpenPack.mockImplementation(() => Promise.resolve());
  mockGetVersesForPositions.mockResolvedValue(QURAN);
  mockGetPackRange.mockResolvedValue([]);
});

describe('with a source', () => {
  it('joins the source onto the Quran, IN RANGE ORDER', async () => {
    mockGetPackRange.mockResolvedValue([
      { surah: 1, verse: 2, lastVerse: 2, text: 'Louange à Allah', footnotes: 'note' },
      { surah: 1, verse: 1, lastVerse: 1, text: 'Au nom d’Allah', footnotes: null },
      { surah: 1, verse: 3, lastVerse: 3, text: 'le Tout Miséricordieux', footnotes: null },
    ]);
    const { result } = renderHook(() => useStudyContent(RANGE, FRENCH));
    await waitFor(() => expect(result.current.state.kind).toBe('ready'));

    const state = result.current.state;
    if (state.kind !== 'ready') throw new Error('expected ready');
    // MUTATION: order by either query's answer. Both are shuffled above, and both would pass a
    // test that only counted rows.
    expect(state.rows.map((row) => row.verse)).toEqual([1, 2, 3]);
    expect(state.rows[0].ayat).toEqual([{ surah: 1, verse: 1, arabic: 'بِسْمِ ٱللَّهِ' }]);
    expect(state.rows[0].content).toBe('Au nom d’Allah');
    expect(state.rows[1].footnotes).toBe('note');
  });

  it('reads the pack by RANGE, with both ends — never a per-ayah loop', async () => {
    renderHook(() => useStudyContent(RANGE, FRENCH));
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
      { surah: 1, verse: 1, lastVerse: 1, text: 'Au nom d’Allah', footnotes: null },
    ]);
    const { result } = renderHook(() => useStudyContent(RANGE, FRENCH));
    await waitFor(() => expect(result.current.state.kind).toBe('ready'));

    const state = result.current.state;
    if (state.kind !== 'ready') throw new Error('expected ready');
    expect(state.rows).toHaveLength(3);
    expect(state.rows[1].content).toBeNull();
    expect(state.rows[1].ayat).toEqual([{ surah: 1, verse: 2, arabic: 'ٱلْحَمْدُ لِلَّهِ' }]);
  });
});

describe('opening the pack it reads (story 8-4)', () => {
  it('opens the SOURCE, at its version, before the first read of it', async () => {
    // ⚠️ THE SHELF NO LONGER OPENS PACKS. It only reads their metadata, so this read is where a
    // pack becomes a handle — and without the open, `getPackRange` rejects `PackNotOpenError`.
    const order: string[] = [];
    mockOpenPack.mockImplementation(async () => {
      order.push('open');
    });
    mockGetPackRange.mockImplementation(async () => {
      order.push('read');
      return [];
    });
    const { result } = renderHook(() => useStudyContent(RANGE, FRENCH));
    await waitFor(() => expect(result.current.state.kind).toBe('ready'));
    expect(mockOpenPack).toHaveBeenCalledWith('translation-fr-rashid', 2);
    expect(order).toEqual(['open', 'read']);
  });

  it('turns a failed OPEN into the retryable error, not a thrown promise', async () => {
    mockOpenPack.mockRejectedValueOnce(new Error('file is not a database'));
    const { result } = renderHook(() => useStudyContent(RANGE, FRENCH));
    await waitFor(() => expect(result.current.state.kind).toBe('error'));
    expect(mockGetPackRange).not.toHaveBeenCalled();
  });

  it('opens nothing when there is no source', async () => {
    const { result } = renderHook(() => useStudyContent(RANGE, null));
    await waitFor(() => expect(result.current.state.kind).toBe('empty'));
    expect(mockOpenPack).not.toHaveBeenCalled();
  });
});

describe('without a source', () => {
  it('is `empty`, it reads NO pack, and it still carries the Arabic', async () => {
    const { result } = renderHook(() => useStudyContent(RANGE, null));
    await waitFor(() => expect(result.current.state.kind).toBe('empty'));

    const state = result.current.state;
    if (state.kind !== 'empty') throw new Error('expected empty');
    expect(mockGetPackRange).not.toHaveBeenCalled();
    expect(state.rows.map((row) => row.ayat[0].arabic)).toEqual([
      'بِسْمِ ٱللَّهِ',
      'ٱلْحَمْدُ لِلَّهِ',
      'ٱلرَّحْمَٰنِ ٱلرَّحِيمِ',
    ]);
    expect(state.rows.every((row) => row.content === null)).toBe(true);
  });
});

describe('failure', () => {
  it('is a VALUE, and `error` is not `empty`', async () => {
    mockGetPackRange.mockRejectedValue(new Error('file removed under a live handle'));
    const { result } = renderHook(() => useStudyContent(RANGE, FRENCH));
    await waitFor(() => expect(result.current.state.kind).toBe('error'));
    expect(mockCaptureException).toHaveBeenCalled();
  });

  it('retries by RE-RUNNING the reads, not by replaying the failure', async () => {
    mockGetPackRange.mockRejectedValueOnce(new Error('transient'));
    mockGetPackRange.mockResolvedValue([
      { surah: 1, verse: 1, lastVerse: 1, text: 'Au nom d’Allah', footnotes: null },
    ]);
    const { result } = renderHook(() => useStudyContent(RANGE, FRENCH));
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
      ({ range }: { range: VerseRange }) => useStudyContent(range, FRENCH),
      { initialProps: { range: RANGE } }
    );

    const narrower: VerseRange = { from: { surah: 1, verse: 2 }, to: { surah: 1, verse: 2 } };
    rerender({ range: narrower });

    await act(async () => {
      second.settle([{ surah: 1, verse: 2, lastVerse: 2, text: 'the new scope', footnotes: null }]);
      first.settle([{ surah: 1, verse: 1, lastVerse: 1, text: 'the OLD scope', footnotes: null }]);
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.state.kind).toBe('ready'));
    const state = result.current.state;
    if (state.kind !== 'ready') throw new Error('expected ready');
    expect(state.rows).toHaveLength(1);
    expect(state.rows[0].content).toBe('the new scope');
  });
});

/**
 * PASSAGES (story 8-5) — the spec's I/O matrix, against the pure join.
 *
 * ⚠️ A TAFSIR IS WRITTEN ONCE OVER SEVERAL AYAT. The mutations these catch all render a plausible
 * sheet: a per-ayah join (the passage 2:1–5 vanishes for a reader on 2:3, because it is stored at
 * 2:1), a join that repeats the text under every ayah, an order taken from a query, and a passage
 * that swallows the ayah after it so a real gap reads as covered.
 */
describe('passages (story 8-5)', () => {
  const ayah = (surah: number, verse: number) => ({
    surah,
    verse,
    textUthmani: `${surah}:${verse}`,
    textSimple: '',
  });
  const passage = (surah: number, verse: number, lastVerse: number, text: string) => ({
    surah,
    verse,
    lastVerse,
    text,
    footnotes: null,
  });
  const pairsOf = (surah: number, from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => ({ surah, verse: from + i }));

  it('reads a passage that STARTS BEFORE the range, labelled by its span, Arabic of the range only', () => {
    // Ayah scope 2:3, passage 2:1–5.
    const rows = joinRows([{ surah: 2, verse: 3 }], [ayah(2, 3)], [passage(2, 1, 5, 'P')]);
    expect(rows).toEqual([
      {
        surah: 2,
        verse: 1,
        lastSurah: 2,
        lastVerse: 5,
        ayat: [{ surah: 2, verse: 3, arabic: '2:3' }],
        content: 'P',
        footnotes: null,
      },
    ]);
  });

  it('draws each passage once, with its in-range ayat together, when a range crosses passages', () => {
    // Surah scope Al-Fatihah, passages 1:1–1 and 1:2–7.
    const pairs = pairsOf(1, 1, 7);
    const rows = joinRows(
      pairs,
      pairs.map((p) => ayah(p.surah, p.verse)),
      [passage(1, 2, 7, 'B'), passage(1, 1, 1, 'A')]
    );
    expect(rows.map((row) => [row.verse, row.lastVerse, row.content])).toEqual([
      [1, 1, 'A'],
      [2, 7, 'B'],
    ]);
    expect(rows[1].ayat.map((a) => a.verse)).toEqual([2, 3, 4, 5, 6, 7]);
  });

  it('orders passages from three surahs by recitation, none from the cross product', () => {
    // Page 604: 112:1–4, 113:1–5, 114:1–6. The passages arrive shuffled.
    const pairs = [...pairsOf(112, 1, 4), ...pairsOf(113, 1, 5), ...pairsOf(114, 1, 6)];
    const rows = joinRows(
      pairs,
      pairs.map((p) => ayah(p.surah, p.verse)),
      [passage(114, 1, 6, 'Nas'), passage(112, 1, 4, 'Ikhlas'), passage(113, 1, 5, 'Falaq')]
    );
    expect(rows.map((row) => `${row.surah}:${row.verse}–${row.lastVerse}`)).toEqual([
      '112:1–4',
      '113:1–5',
      '114:1–6',
    ]);
    expect(rows.map((row) => row.ayat.length)).toEqual([4, 5, 6]);
  });

  it('gives an ayah no passage covers its own row, with nothing for it', () => {
    // A passage gap at 2:7.
    const pairs = pairsOf(2, 6, 8);
    const rows = joinRows(
      pairs,
      pairs.map((p) => ayah(p.surah, p.verse)),
      [passage(2, 6, 6, 'six'), passage(2, 8, 10, 'eight')]
    );
    expect(rows.map((row) => [row.verse, row.lastVerse, row.content])).toEqual([
      [6, 6, 'six'],
      [7, 7, null],
      [8, 10, 'eight'],
    ]);
    expect(rows[1].ayat).toEqual([{ surah: 2, verse: 7, arabic: '2:7' }]);
  });

  it('reads a translation — one ayah per entry — exactly as before passages existed', () => {
    const pairs = pairsOf(1, 1, 3);
    const rows = joinRows(
      pairs,
      pairs.map((p) => ayah(p.surah, p.verse)),
      [passage(1, 1, 1, 'a'), passage(1, 3, 3, 'c')]
    );
    const one = (verse: number, content: string | null) => ({
      surah: 1,
      verse,
      lastSurah: 1,
      lastVerse: verse,
      ayat: [{ surah: 1, verse, arabic: `1:${verse}` }],
      content,
      footnotes: null,
    });
    expect(rows).toEqual([one(1, 'a'), one(2, null), one(3, 'c')]);
  });

  it('never draws one ayah under two passages when a pack’s passages overlap', () => {
    // A pack built before the pipeline merged overlaps: 38:48–49 and 38:49–54.
    const pairs = pairsOf(38, 48, 50);
    const rows = joinRows(
      pairs,
      pairs.map((p) => ayah(p.surah, p.verse)),
      [passage(38, 48, 49, 'first'), passage(38, 49, 54, 'second')]
    );
    expect(rows.map((row) => [row.content, row.ayat.map((a) => a.verse)])).toEqual([
      ['first', [48, 49]],
      ['second', [50]],
    ]);
  });

  it('clamps a malformed span (`last_verse` before `verse`) to the one ayah', () => {
    const rows = joinRows([{ surah: 2, verse: 4 }], [ayah(2, 4)], [passage(2, 4, 2, 'odd')]);
    expect(rows).toEqual([
      {
        surah: 2,
        verse: 4,
        lastSurah: 2,
        lastVerse: 4,
        ayat: [{ surah: 2, verse: 4, arabic: '2:4' }],
        content: 'odd',
        footnotes: null,
      },
    ]);
  });

  it('draws a passage the pipeline split at a surah boundary ONCE, both surahs under one row', () => {
    // Fi Zilal's 103:1–104:6, stored as 103:1–3 and 104:1–6 with the same text.
    const pairs = [...pairsOf(103, 1, 3), ...pairsOf(104, 1, 6)];
    const rows = joinRows(
      pairs,
      pairs.map((p) => ayah(p.surah, p.verse)),
      [passage(103, 1, 3, 'Al-Asr and Al-Humazah'), passage(104, 1, 6, 'Al-Asr and Al-Humazah')]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ surah: 103, verse: 1, lastSurah: 104, lastVerse: 6 });
    expect(rows[0].ayat.map((a) => `${a.surah}:${a.verse}`)).toEqual([
      '103:1',
      '103:2',
      '103:3',
      '104:1',
      '104:2',
      '104:3',
      '104:4',
      '104:5',
      '104:6',
    ]);
    // Different texts across the same boundary stay two rows.
    const apart = joinRows(
      pairs,
      pairs.map((p) => ayah(p.surah, p.verse)),
      [passage(103, 1, 3, 'Al-Asr'), passage(104, 1, 6, 'Al-Humazah')]
    );
    expect(apart).toHaveLength(2);
  });
});
