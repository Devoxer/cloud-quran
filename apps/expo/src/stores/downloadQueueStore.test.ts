/**
 * The download queue store (story 7-5) — the mirror the rows read.
 *
 * What this pins is the STATE MACHINE, not the transfers: `audioDownloads.test.ts` drives the
 * runner against a fake filesystem, and this file asserts the shapes that file writes.
 *
 * The mutations it exists to catch:
 *   1. `resetEntry` assigning an `idle` status rather than deleting the key — a cancel would then
 *      leave a row that renders as something, and "not downloaded" would stop being the absence
 *      of an entry;
 *   2. hydration overwriting rows that describe work in flight, so a surah being downloaded
 *      snaps to `downloaded` because a listing ran;
 *   3. the per-reciter summary counting another voice's rows, which is what would make "34 of
 *      114 kept" a number about the wrong reciter.
 */

import { act, renderHook } from '@testing-library/react-native';

import {
  clearReciterEntries,
  downloadKey,
  getDownloadEntry,
  hydrateReciterEntries,
  resetDownloadEntry,
  setDownloadEntry,
  useDownloadEntry,
  useDownloadedCount,
  useDownloadQueueStore,
  useReciterDownloadSummary,
} from './downloadQueueStore';

const entries = () => useDownloadQueueStore.getState().entries;

beforeEach(() => {
  useDownloadQueueStore.setState({ entries: {} });
});

describe('the key', () => {
  it("is reciter and surah, so one voice's downloads never answer for another", () => {
    expect(downloadKey('husary', 18)).toBe('husary:18');
    expect(downloadKey('alafasy', 18)).not.toBe(downloadKey('husary', 18));
  });
});

describe('queueing and progress', () => {
  it('creates a row on the first patch and merges into it afterwards', () => {
    setDownloadEntry('husary:18', { status: 'queued', progress: 0 });
    expect(entries()['husary:18']).toEqual({ status: 'queued', progress: 0 });

    setDownloadEntry('husary:18', { status: 'downloading' });
    setDownloadEntry('husary:18', { progress: 0.42 });
    expect(entries()['husary:18']).toEqual({ status: 'downloading', progress: 0.42 });
  });

  it('settles as downloaded', () => {
    setDownloadEntry('husary:18', { status: 'downloading', progress: 0.9 });
    setDownloadEntry('husary:18', { status: 'downloaded', progress: 1 });
    expect(getDownloadEntry('husary:18')).toEqual({ status: 'downloaded', progress: 1 });
  });

  it('answers null for a surah nobody has touched', () => {
    expect(getDownloadEntry('husary:18')).toBeNull();
  });
});

describe('cancel and delete', () => {
  it('DELETE the key rather than writing an idle status — absent IS not-downloaded', () => {
    setDownloadEntry('husary:18', { status: 'downloading', progress: 0.5 });
    resetDownloadEntry('husary:18');

    expect(getDownloadEntry('husary:18')).toBeNull();
    expect(Object.hasOwn(entries(), 'husary:18')).toBe(false);
  });

  it('leaves the store alone when the key was never there', () => {
    const before = entries();
    resetDownloadEntry('husary:18');
    expect(entries()).toBe(before);
  });
});

describe('hydration from disk', () => {
  it('marks what is on disk as downloaded', () => {
    hydrateReciterEntries('husary', [1, 18]);
    expect(entries()['husary:1'].status).toBe('downloaded');
    expect(entries()['husary:18'].status).toBe('downloaded');
  });

  it("drops a downloaded row whose file has vanished behind the store's back", () => {
    hydrateReciterEntries('husary', [1, 18]);
    hydrateReciterEntries('husary', [1]);
    expect(entries()['husary:18']).toBeUndefined();
    expect(entries()['husary:1'].status).toBe('downloaded');
  });

  it('never touches a row that describes work in flight', () => {
    setDownloadEntry('husary:18', { status: 'downloading', progress: 0.3 });
    setDownloadEntry('husary:19', { status: 'error', progress: 0 });
    hydrateReciterEntries('husary', [1]);

    expect(entries()['husary:18']).toEqual({ status: 'downloading', progress: 0.3 });
    expect(entries()['husary:19'].status).toBe('error');
  });

  it("leaves another reciter's rows alone", () => {
    hydrateReciterEntries('alafasy', [5]);
    hydrateReciterEntries('husary', [1]);
    expect(entries()['alafasy:5'].status).toBe('downloaded');
  });
});

describe('clearing a reciter', () => {
  it("drops that reciter's rows and only those", () => {
    hydrateReciterEntries('husary', [1, 2]);
    hydrateReciterEntries('alafasy', [1]);
    clearReciterEntries('husary');

    expect(Object.keys(entries())).toEqual(['alafasy:1']);
  });
});

describe('the per-reciter summary', () => {
  it('counts kept and in-flight rows for one voice, ignoring errors and other voices', () => {
    const { result } = renderHook(() => useReciterDownloadSummary('husary'));
    expect(result.current).toEqual({ downloaded: 0, active: 0, failed: 0 });

    act(() => {
      hydrateReciterEntries('husary', [1, 2, 3]);
      setDownloadEntry('husary:4', { status: 'downloading', progress: 0.2 });
      setDownloadEntry('husary:5', { status: 'queued', progress: 0 });
      // An error is neither kept nor moving — it is a row waiting for a retry.
      setDownloadEntry('husary:6', { status: 'error', progress: 0 });
      // Another voice's downloads must not reach this number.
      hydrateReciterEntries('alafasy', [7, 8]);
    });

    // ⚠️ `failed` IS ITS OWN NUMBER, NOT FOLDED INTO EITHER. Counting an error as neither kept
    // nor moving is what made the surface read "102 of 114" with nothing saying twelve failed.
    // (Story 7-5 review, P6.)
    expect(result.current).toEqual({ downloaded: 3, active: 2, failed: 1 });
  });
});

describe('the downloaded-count signal', () => {
  /**
   * ⚠️ THE PICKER'S INDICATOR KEYED ON THE TOTAL ENTRY COUNT AND WAS WRONG IN BOTH DIRECTIONS:
   * queueing moved it with no file on disk, and completing did NOT move it because the key
   * already existed. This counts `downloaded` rows, which is exactly "a file was added or
   * removed". (Story 7-5 review, P12.)
   */
  it('does not move when a download is merely queued', () => {
    const { result } = renderHook(() => useDownloadedCount());
    expect(result.current).toBe(0);

    act(() => setDownloadEntry('husary:1', { status: 'queued', progress: 0 }));
    expect(result.current).toBe(0);

    act(() => setDownloadEntry('husary:1', { status: 'downloading', progress: 0.5 }));
    expect(result.current).toBe(0);
  });

  it('DOES move when one completes on a key that already existed', () => {
    const { result } = renderHook(() => useDownloadedCount());
    act(() => setDownloadEntry('husary:1', { status: 'downloading', progress: 0.9 }));
    expect(result.current).toBe(0);

    act(() => setDownloadEntry('husary:1', { status: 'downloaded', progress: 1 }));
    expect(result.current).toBe(1);
  });

  it('moves back down when a kept surah is deleted', () => {
    const { result } = renderHook(() => useDownloadedCount());
    act(() => hydrateReciterEntries('husary', [1, 2]));
    expect(result.current).toBe(2);

    act(() => resetDownloadEntry('husary:1'));
    expect(result.current).toBe(1);
  });

  it('counts across reciters, which is the question the picker asks', () => {
    const { result } = renderHook(() => useDownloadedCount());
    act(() => {
      hydrateReciterEntries('husary', [1]);
      hydrateReciterEntries('alafasy', [1, 2]);
    });
    expect(result.current).toBe(3);
  });
});

describe('the per-surah selector', () => {
  it('answers null until something touches that surah, then follows it', () => {
    const { result } = renderHook(() => useDownloadEntry('husary', 18));
    expect(result.current).toBeNull();

    act(() => setDownloadEntry('husary:18', { status: 'downloading', progress: 0.5 }));
    expect(result.current).toEqual({ status: 'downloading', progress: 0.5 });

    act(() => resetDownloadEntry('husary:18'));
    expect(result.current).toBeNull();
  });

  it("does not see another surah's progress", () => {
    const { result } = renderHook(() => useDownloadEntry('husary', 18));
    act(() => setDownloadEntry('husary:19', { status: 'downloading', progress: 0.5 }));
    expect(result.current).toBeNull();
  });
});
