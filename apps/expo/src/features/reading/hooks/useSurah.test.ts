/**
 * `useSurah` — the read that stands between the bundled database and the reading surface
 * (story 6-1).
 *
 * ⚠️ TWO OF THIS HOOK'S THREE MECHANISMS WERE UNEXERCISED, AND BOTH ARE THE KIND THAT FAIL
 * INVISIBLY.
 *
 *   1. **The `cancelled` latch.** Removing all three guards passed the entire suite. It is
 *      load-bearing: two quick "Next" taps start two reads, and if the FIRST resolves LAST its
 *      rows land on top of the second's — the reader ends up on a surah they already moved past,
 *      while the chrome names the one they asked for. `read.tsx`'s next-surah control makes that
 *      two taps away, not a thought experiment.
 *   2. **Clearing the rows on a surah change.** `surah` is a prop and `verses` is state, so
 *      between the render that changes the number and the render that lands the rows the hook
 *      answered the OLD surah's verses with `loading: true`. The screen renders both: the list
 *      showed Al-Fatihah while the header, footnote and next-surah button named Al-Baqarah. And
 *      those stale rows are what the viewability callback reports, which is how a surah change
 *      wrote a reading position the reader never chose.
 *
 * Both are asserted with DEFERRED promises resolved out of order, because "the slow one lands
 * last" is the whole condition and an `await` cannot express it.
 */

const mockGetSurahVerses = jest.fn();
const mockGetSurahMetadata = jest.fn();
const mockCaptureException = jest.fn();

jest.mock('@/lib/quranDb', () => ({
  getSurahVerses: (...args: unknown[]) => mockGetSurahVerses(...args),
  getSurahMetadata: (...args: unknown[]) => mockGetSurahMetadata(...args),
}));
jest.mock('@/lib/errors', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { Surah, Verse } from 'quran-data';
import { type SurahContent, useSurah } from './useSurah';

/** A promise plus its resolver, so a test decides WHEN — and in what order — a read lands. */
function deferred<T>() {
  let settle: (value: T) => void = () => {};
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
}

function versesOf(surah: number, count: number): Verse[] {
  return Array.from({ length: count }, (_, i) => ({
    surah,
    verse: i + 1,
    textUthmani: `أية ${surah}:${i + 1}`,
    textSimple: `aya ${surah}:${i + 1}`,
  }));
}

function metaOf(surah: number): Surah {
  return {
    number: surah,
    nameArabic: 'x',
    nameEnglish: `English ${surah}`,
    nameTransliteration: `Surah ${surah}`,
    verseCount: 7,
    revelationType: 'meccan',
    order: surah,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSurahVerses.mockImplementation(async (surah: number) => versesOf(surah, 7));
  mockGetSurahMetadata.mockImplementation(async (surah: number) => metaOf(surah));
});

describe('it answers one surah at a time', () => {
  it('loads the verses and the metadata for the surah it was given', async () => {
    const { result } = renderHook(() => useSurah(2));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.verses).toHaveLength(7);
    expect(result.current.verses[0].surah).toBe(2);
    expect(result.current.meta?.nameTransliteration).toBe('Surah 2');
    expect(result.current.error).toBeNull();
    expect(result.current.surah).toBe(2);
  });

  it('NEVER answers the old surah’s rows while the new one is loading', async () => {
    // ⚠️ THE MEASURED DEFECT. `loading: true` beside last-surah verses is a lie the whole screen
    // renders — and the stale rows are what the viewability callback reports.
    const second = deferred<Verse[]>();
    const { result, rerender } = renderHook<SurahContent, { surah: number }>(
      ({ surah }) => useSurah(surah),
      { initialProps: { surah: 1 } }
    );
    await waitFor(() => expect(result.current.verses).toHaveLength(7));
    expect(result.current.verses[0].surah).toBe(1);

    mockGetSurahVerses.mockImplementation(() => second.promise);
    act(() => rerender({ surah: 2 }));

    expect(result.current.loading).toBe(true);
    expect(result.current.verses).toEqual([]);
    expect(result.current.meta).toBeNull();

    await act(async () => {
      second.settle(versesOf(2, 7));
    });
    await waitFor(() => expect(result.current.verses).toHaveLength(7));
    expect(result.current.verses[0].surah).toBe(2);
  });
});

describe('the cancellation latch', () => {
  it('ignores a read that lands after the reader has moved on', async () => {
    // ⚠️ REMOVING ALL THREE `if (cancelled) return` GUARDS PASSED EVERY TEST IN THIS REPO. Two
    // quick "Next" taps: the first read (surah 2) resolves LAST, so without the latch its rows
    // overwrite the surah the reader actually asked for.
    const slow = deferred<Verse[]>();
    const fast = deferred<Verse[]>();
    const { result, rerender } = renderHook<SurahContent, { surah: number }>(
      ({ surah }) => useSurah(surah),
      { initialProps: { surah: 1 } }
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    mockGetSurahVerses.mockImplementation((surah: number) =>
      surah === 2 ? slow.promise : fast.promise
    );
    act(() => rerender({ surah: 2 }));
    act(() => rerender({ surah: 3 }));

    // The SECOND request answers first — the reader is now on surah 3.
    await act(async () => {
      fast.settle(versesOf(3, 7));
    });
    await waitFor(() => expect(result.current.verses).toHaveLength(7));
    expect(result.current.verses[0].surah).toBe(3);

    // …and the first request's answer arrives late and must change nothing.
    await act(async () => {
      slow.settle(versesOf(2, 7));
    });
    expect(result.current.verses[0].surah).toBe(3);
    expect(result.current.loading).toBe(false);
  });

  it('ignores a FAILURE that lands after the reader has moved on', async () => {
    // The same latch, on the catch path. Without it, a surah the reader has already left could
    // paint an error over the surah they are reading — and report it to Sentry as a live failure.
    const slow = deferred<Verse[]>();
    const { result, rerender } = renderHook<SurahContent, { surah: number }>(
      ({ surah }) => useSurah(surah),
      { initialProps: { surah: 1 } }
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    let rejectSlow: (reason: Error) => void = () => {};
    mockGetSurahVerses.mockImplementation((surah: number) =>
      surah === 2
        ? new Promise<Verse[]>((_resolve, reject) => {
            rejectSlow = reject;
          })
        : slow.promise
    );
    act(() => rerender({ surah: 2 }));
    act(() => rerender({ surah: 3 }));
    await act(async () => {
      slow.settle(versesOf(3, 7));
    });
    await waitFor(() => expect(result.current.verses).toHaveLength(7));

    await act(async () => {
      rejectSlow(new Error('too late'));
      await Promise.resolve();
    });
    expect(result.current.error).toBeNull();
    expect(result.current.verses[0].surah).toBe(3);
  });
});

describe('an unreadable database is a VALUE, not a throw', () => {
  it('reports the failure, empties the rows, and offers a retry that re-runs', async () => {
    mockGetSurahVerses.mockRejectedValue(new Error('asset missing'));
    const { result } = renderHook(() => useSurah(1));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.verses).toEqual([]);
    expect(result.current.meta).toBeNull();
    expect(result.current.loading).toBe(false);
    // Tier 1: nothing else in the app would ever tell us the bundled text could not be opened.
    expect(mockCaptureException).toHaveBeenCalledWith(expect.any(Error), {
      operation: 'quranDb.readSurah',
      surah: 1,
    });

    mockGetSurahVerses.mockImplementation(async (surah: number) => versesOf(surah, 7));
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.verses).toHaveLength(7));
    expect(result.current.error).toBeNull();
  });

  it('wraps a non-Error rejection rather than storing a string', async () => {
    mockGetSurahVerses.mockImplementation(() => Promise.reject('a bare string'));
    const { result } = renderHook(() => useSurah(1));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('a bare string');
  });
});
