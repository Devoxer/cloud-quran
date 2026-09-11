/**
 * Surah downloads on disk, and the runner that puts them there (story 7-5).
 *
 * The mutations this file exists to catch, all of which typecheck and render fine:
 *   1. the layout drifting from the CDN key — a download written to `18.mp3` while playback looks
 *      for `018.mp3` is a file that exists and is never found;
 *   2. the cache moving to `Paths.cache` — an OS-evicted download is a broken offline promise,
 *      which is the whole argument for the document directory (`lib/mushafFonts.ts`'s docblock);
 *   3. the partial-file cleanup removed from either failure path. Android streams the response
 *      body straight into the destination, so a failed or cancelled transfer leaves a truncated
 *      MP3 that `file.exists` cheerfully answers `true` for — a surah that stops in the middle;
 *   4. a cancel settling as an `error` row, which would put a red retry under a reader who had
 *      just pressed stop.
 *
 * ⚠️ `expo-file-system` IS MOCKED LOCALLY, as an in-memory filesystem. `jest.setup.js` mocks only
 * the legacy API and this module uses the SDK-56 `File`/`Directory`/`Paths` classes — and the
 * cases below are about what is left ON DISK after a failure, which a `jest.fn()` returning a
 * fixed value cannot answer.
 */

/** uri → size in bytes. The whole filesystem. */
const mockFiles = new Map<string, number>();
const mockDirs = new Set<string>();
const mockDownload = jest.fn<Promise<void>, [string, { uri: string }, Record<string, unknown>]>(
  () => Promise.resolve()
);
/**
 * Which API the transfer went through — `mockDownload` is shared by both so every case below is
 * blind to the choice, and these two say which door it came in by.
 *
 * ⚠️ THE SUITE RUNS AS `ios`, so the TASK API is the live path here; `downloadFileAsync` is the
 * Android one and must stay uncalled. See `BACKGROUND_TRANSFERS` for why the two differ at all.
 */
const mockTaskDownload = jest.fn();
const mockRequestDownload = jest.fn();
/** What `Paths.availableDiskSpace` answers. `undefined` is "the platform would not say". */
const mockDiskSpace: { value: number | undefined } = { value: undefined };
/** Flipped by the P3 case: every `list()` throws, the way a real filesystem failure would. */
const mockListingBroken = { value: false };
const mockAddBreadcrumb = jest.fn();
const mockCaptureException = jest.fn();

jest.mock('@/lib/errors', () => ({
  addBreadcrumb: (...args: unknown[]) => mockAddBreadcrumb(...args),
  captureException: (...args: unknown[]) => mockCaptureException(...args),
  isDeviceOfflineError: (error: unknown) =>
    String(error instanceof Error ? error.message : error)
      .toLowerCase()
      .includes('device is offline'),
}));

jest.mock('expo-file-system', () => {
  // ⚠️ NO TYPE ANNOTATIONS in the factory — Jest's hoisting guard rejects unknown identifiers.
  const uriOf = (part: any) => (typeof part === 'string' ? part : part.uri);
  const join = (parts: any[]) => parts.map(uriOf).join('/');

  class Directory {
    uri: string;
    constructor(...parts: any[]) {
      this.uri = join(parts);
    }
    get name() {
      return this.uri.split('/').pop();
    }
    get exists() {
      return mockDirs.has(this.uri);
    }
    get size() {
      let total = 0;
      for (const [uri, size] of mockFiles) if (uri.startsWith(`${this.uri}/`)) total += size;
      return total;
    }
    create() {
      // `intermediates: true` is what production passes; the mock always behaves that way, so
      // `{document}/audio` exists as soon as any reciter's directory does.
      let path = this.uri;
      while (path.includes('/') && path !== 'file://') {
        mockDirs.add(path);
        path = path.slice(0, path.lastIndexOf('/'));
      }
    }
    delete() {
      mockDirs.delete(this.uri);
      for (const uri of [...mockFiles.keys()]) {
        if (uri.startsWith(`${this.uri}/`)) mockFiles.delete(uri);
      }
      for (const dir of [...mockDirs]) if (dir.startsWith(`${this.uri}/`)) mockDirs.delete(dir);
    }
    list() {
      if (mockListingBroken.value) throw new Error('EIO');
      const out: any[] = [];
      const seen = new Set<string>();
      for (const uri of mockFiles.keys()) {
        if (!uri.startsWith(`${this.uri}/`)) continue;
        const rest = uri.slice(this.uri.length + 1);
        const slash = rest.indexOf('/');
        if (slash === -1) {
          out.push(new File(uri));
          continue;
        }
        const child = `${this.uri}/${rest.slice(0, slash)}`;
        if (seen.has(child)) continue;
        seen.add(child);
        out.push(new Directory(child));
      }
      return out;
    }
  }

  class File {
    uri: string;
    constructor(...parts: any[]) {
      this.uri = join(parts);
    }
    get name() {
      return this.uri.split('/').pop();
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    get size() {
      return mockFiles.get(this.uri) ?? 0;
    }
    delete() {
      mockFiles.delete(this.uri);
    }
    moveSync(destination: any) {
      const size = mockFiles.get(this.uri);
      if (size === undefined) return;
      mockFiles.delete(this.uri);
      mockFiles.set(destination.uri, size);
      this.uri = destination.uri;
    }
    static downloadFileAsync(url: string, destination: any, options: any) {
      mockRequestDownload(url, destination, options);
      return mockDownload(url, destination, options);
    }
    static createDownloadTask(url: string, destination: any, options: any) {
      mockTaskDownload(url, destination, options);
      return { downloadAsync: () => mockDownload(url, destination, options) };
    }
  }

  return {
    __esModule: true,
    Directory,
    File,
    Paths: {
      document: 'file:///documents',
      get availableDiskSpace() {
        return mockDiskSpace.value;
      },
    },
  };
});

import { AppState } from 'react-native';

import { downloadKey, setDownloadEntry, useDownloadQueueStore } from '@/stores/downloadQueueStore';
import {
  __resetDownloadRunner,
  availableDownloadSpace,
  BACKGROUND_TRANSFERS,
  cancelReciterDownloads,
  cancelSurahDownload,
  DOWNLOAD_STALL_TIMEOUT_MS,
  DOWNLOADS_SUPPORTED,
  deleteOrphanedDownloads,
  deleteReciterDownloads,
  deleteSurahDownload,
  downloadedSurahs,
  downloadSurah,
  estimateReciterDownload,
  hydrateDownloadState,
  isDownloaded,
  localSurahUri,
  orphanedDownloadBytes,
  queueReciterDownloads,
  reciterBytesOnDisk,
  reciterDownloadCounts,
  startSurahDownload,
  surahFileName,
  sweepStalePartFiles,
} from './audioDownloads';

const DOC = 'file:///documents';
const uriFor = (reciterId: string, surah: number) =>
  `${DOC}/audio/${reciterId}/${String(surah).padStart(3, '0')}.mp3`;

/** Put a file on the fake disk, creating its directory. */
function seedFile(uri: string, size = 3_000_000): void {
  mockFiles.set(uri, size);
  let path = uri.slice(0, uri.lastIndexOf('/'));
  while (path.includes('/') && path !== 'file://') {
    mockDirs.add(path);
    path = path.slice(0, path.lastIndexOf('/'));
  }
}

/** Let every pending microtask and the runner's loop settle. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  jest.clearAllMocks();
  mockFiles.clear();
  mockDirs.clear();
  mockListingBroken.value = false;
  mockDiskSpace.value = undefined;
  __resetDownloadRunner();
  useDownloadQueueStore.setState({ entries: {} });
  // The default transfer behaves: it writes the `.part` file the rename then commits.
  mockDownload.mockImplementation((_url, file) => {
    mockFiles.set(file.uri, 1000);
    return Promise.resolve();
  });
});

describe('the on-disk layout', () => {
  it('is exercised as a NATIVE platform — every case below assumes it', () => {
    // ⚠️ Without this the whole file could be passing vacuously through the web short-circuit,
    // which answers `null`/`[]`/`0` to almost everything here. The web branch has its own suite.
    expect(DOWNLOADS_SUPPORTED).toBe(true);
  });

  it('zero-pads to the CDN key, so the two layouts cannot drift', () => {
    expect(surahFileName(1)).toBe('001.mp3');
    expect(surahFileName(18)).toBe('018.mp3');
    expect(surahFileName(114)).toBe('114.mp3');
  });

  it('keeps downloads in the DOCUMENT directory, never the evictable cache', async () => {
    await downloadSurah('husary', 18);

    const [, destination] = mockDownload.mock.calls[0];
    // The transfer writes `.part`; the rename commits it to the real path.
    expect(destination.uri).toBe(`${DOC}/audio/husary/018.mp3.part`);
    expect(destination.uri).not.toContain('cache');
    expect(localSurahUri('husary', 18)).toBe(`${DOC}/audio/husary/018.mp3`);
  });

  it("downloads from the app's own CDN and nowhere else", async () => {
    await downloadSurah('husary', 18);
    expect(mockDownload.mock.calls[0][0]).toBe(
      'https://cdn.nobleachievements.com/audio/husary/018.mp3'
    );
  });

  it('separates reciters, so a surah kept under one says nothing about another', () => {
    seedFile(uriFor('alafasy', 18));
    expect(isDownloaded('alafasy', 18)).toBe(true);
    expect(isDownloaded('husary', 18)).toBe(false);
  });
});

describe('the transfer is handed to the OS where the OS will take it', () => {
  /**
   * ⚠️ THE FLAG IS THE WHOLE FEATURE AND IT IS INVISIBLE EVERYWHERE ELSE. Dropping `sessionType`
   * leaves a download that works perfectly on the bench and dies the moment the reader locks the
   * phone — no error, no failed row, just a transfer that stopped. Only this assertion reddens.
   */
  it('asks for a background session on iOS', async () => {
    expect(BACKGROUND_TRANSFERS).toBe(true);
    await downloadSurah('husary', 18);

    expect(mockTaskDownload).toHaveBeenCalledTimes(1);
    expect(mockTaskDownload.mock.calls[0][2]).toMatchObject({ sessionType: 'background' });
    // ⚠️ AND NOT THROUGH THE REQUEST API, which has no `sessionType` at all — a silent revert to
    // a foreground session is exactly what this pairs with.
    expect(mockRequestDownload).not.toHaveBeenCalled();
  });

  it('still commits by renaming, so an interrupted background transfer leaves no surah', async () => {
    mockDownload.mockImplementation((_url, file) => {
      expect(file.uri).toBe(`${uriFor('husary', 18)}.part`);
      mockFiles.set(file.uri, 1000);
      return Promise.resolve();
    });

    await downloadSurah('husary', 18);
    expect(isDownloaded('husary', 18)).toBe(true);
  });

  it('still cancels through the caller signal', async () => {
    mockDownload.mockImplementation((_url, _file, options) => {
      return new Promise((_resolve, reject) => {
        (options.signal as AbortSignal).addEventListener('abort', () =>
          reject(new Error('AbortError'))
        );
      });
    });

    startSurahDownload('husary', 18);
    await flush();
    cancelSurahDownload('husary', 18);
    await flush();

    expect(useDownloadQueueStore.getState().entries['husary:18']).toBeUndefined();
  });
});

describe('free space', () => {
  it('is reported when the platform knows it', () => {
    mockDiskSpace.value = 5_000_000_000;
    expect(availableDownloadSpace()).toBe(5_000_000_000);
  });

  /** ⚠️ UNKNOWN IS NOT ZERO. A caller refuses on this number; `null` must never refuse. */
  it('is null — not 0 — when the platform will not say', () => {
    mockDiskSpace.value = undefined;
    expect(availableDownloadSpace()).toBeNull();
  });
});

describe('isDownloaded answers from disk', () => {
  it('is false for a surah nobody kept', () => {
    expect(isDownloaded('husary', 18)).toBe(false);
    expect(localSurahUri('husary', 18)).toBeNull();
  });

  it('is true, and yields the file uri, once the file is there', () => {
    seedFile(uriFor('husary', 18));
    expect(isDownloaded('husary', 18)).toBe(true);
    expect(localSurahUri('husary', 18)).toBe(uriFor('husary', 18));
  });

  it('goes back to false the moment the file is deleted', () => {
    seedFile(uriFor('husary', 18));
    deleteSurahDownload('husary', 18);
    expect(isDownloaded('husary', 18)).toBe(false);
  });
});

describe('the partial file', () => {
  it('is written to `.part` and never to the real path', async () => {
    mockDownload.mockImplementation((_url, file) => {
      // Mid-transfer: bytes are on disk under the temporary name.
      mockFiles.set(file.uri, 91_000);
      expect(file.uri).toBe(`${uriFor('husary', 18)}.part`);
      // ⚠️ AND THE SURAH IS NOT DOWNLOADED WHILE THAT IS TRUE. This is the whole of P1: a
      // process killed at exactly this moment must leave nothing hydration can mistake.
      expect(isDownloaded('husary', 18)).toBe(false);
      return Promise.resolve();
    });

    await downloadSurah('husary', 18);
    expect(isDownloaded('husary', 18)).toBe(true);
    expect(mockFiles.has(`${uriFor('husary', 18)}.part`)).toBe(false);
  });

  it('is ignored by the listing, so an interrupted transfer never reads as downloaded', () => {
    // Exactly what a killed app leaves behind.
    seedFile(`${uriFor('husary', 18)}.part`, 91_000);
    expect(downloadedSurahs('husary')).toEqual([]);
    expect(isDownloaded('husary', 18)).toBe(false);
  });

  it('is removed when the download fails', async () => {
    mockDownload.mockImplementation((_url, file) => {
      mockFiles.set(file.uri, 91_000);
      return Promise.reject(new Error('network died'));
    });

    await expect(downloadSurah('husary', 18)).rejects.toThrow('network died');
    expect(mockFiles.has(`${uriFor('husary', 18)}.part`)).toBe(false);
    expect(mockFiles.has(uriFor('husary', 18))).toBe(false);
    expect(isDownloaded('husary', 18)).toBe(false);
  });

  it('is removed when the download is cancelled, and the row goes back to absent', async () => {
    let settle: (() => void) | null = null;
    mockDownload.mockImplementation((_url, file, options) => {
      mockFiles.set(file.uri, 91_000);
      return new Promise((_resolve, reject) => {
        settle = () => reject(new Error('AbortError'));
        (options.signal as AbortSignal).addEventListener('abort', () => settle?.());
      });
    });

    startSurahDownload('husary', 18);
    await flush();
    expect(useDownloadQueueStore.getState().entries['husary:18']?.status).toBe('downloading');

    cancelSurahDownload('husary', 18);
    await flush();

    expect(mockFiles.has(`${uriFor('husary', 18)}.part`)).toBe(false);
    expect(mockFiles.has(uriFor('husary', 18))).toBe(false);
    // ⚠️ ABSENT, NOT `error`. A cancel is not a failure surface — see the module's catch.
    expect(useDownloadQueueStore.getState().entries['husary:18']).toBeUndefined();
  });
});

/**
 * ⚠️ THE RENAME-IS-THE-COMMIT RULE MAKES A `.part` FILE HARMLESS FOR PLAYBACK AND INVISIBLE TO
 * EVERY READER — AND `dir.size` COUNTS IT ANYWAY. `downloadSurah`'s catch covers every failure
 * the process lives to SEE; killing the app mid-transfer is the one it cannot, and the bytes then
 * sit under a name only a re-download of that exact surah would overwrite. The reader is told
 * they are keeping megabytes that are a corpse.
 */
/**
 * ⚠️ MEASURED ON THE PIXEL 9 PRO EMULATOR, 2026-09-11, not reasoned. Both cases are about the
 * MIRROR rather than the files: the disk was correct in each, and the surface lied about it.
 */
describe('what a running queue does to what is already kept', () => {
  it('leaves a completed row alone when the reciter queue is stopped', () => {
    seedFile(uriFor('sudais', 1));
    seedFile(uriFor('sudais', 2));
    hydrateDownloadState('sudais');
    setDownloadEntry(downloadKey('sudais', 3), { status: 'queued', progress: 0 });

    cancelReciterDownloads('sudais');

    // "Nothing downloaded yet" over 143 MB of kept Quran was the observed defect.
    expect(useDownloadQueueStore.getState().entries['sudais:1']?.status).toBe('downloaded');
    expect(useDownloadQueueStore.getState().entries['sudais:2']?.status).toBe('downloaded');
    expect(useDownloadQueueStore.getState().entries['sudais:3']).toBeUndefined();
  });

  it('counts only committed files toward the kept size, never the transfer in flight', () => {
    seedFile(uriFor('sudais', 1), 838_887);
    seedFile(`${uriFor('sudais', 2)}.part`, 94_000_000);

    // "1 of 114 surahs · 94.6 MB" — a count and a size describing different things.
    expect(reciterBytesOnDisk('sudais')).toBe(838_887);
  });
});

describe('stale `.part` residue', () => {
  it('is swept on hydration, and the kept surahs are untouched', () => {
    seedFile(uriFor('husary', 2));
    seedFile(`${uriFor('husary', 36)}.part`, 4_000_000);

    hydrateDownloadState('husary');

    expect(mockFiles.has(`${uriFor('husary', 36)}.part`)).toBe(false);
    expect(mockFiles.has(uriFor('husary', 2))).toBe(true);
    // The residue was never a kept surah, before or after.
    expect(downloadedSurahs('husary')).toEqual([2]);
  });

  it('gives the disk back — the whole reason it is not merely ignored', () => {
    seedFile(uriFor('husary', 2), 3_000_000);
    seedFile(`${uriFor('husary', 36)}.part`, 4_000_000);

    hydrateDownloadState('husary');

    // Every READER already ignores a `.part` file; the storage does not.
    let onDisk = 0;
    for (const [uri, size] of mockFiles) if (uri.includes('/husary/')) onDisk += size;
    expect(onDisk).toBe(3_000_000);
  });

  /**
   * ⚠️ THE FILE A TRANSFER IS WRITING RIGHT NOW IS NOT RESIDUE. Hydration runs on every surface
   * arrival and every voice change, which can land mid-queue — deleting the path the native
   * writer has open is how a healthy download becomes a mystery failure.
   */
  it('spares the transfer that is in flight', async () => {
    let settle: (() => void) | undefined;
    mockDownload.mockImplementation((_url, file) => {
      mockFiles.set(file.uri, 120);
      return new Promise<void>((resolve) => {
        settle = resolve;
      });
    });

    startSurahDownload('husary', 18);
    await flush();
    expect(mockFiles.has(`${uriFor('husary', 18)}.part`)).toBe(true);

    sweepStalePartFiles('husary');

    expect(mockFiles.has(`${uriFor('husary', 18)}.part`)).toBe(true);
    settle?.();
    await flush();
    expect(mockFiles.has(uriFor('husary', 18))).toBe(true);
  });
});

describe('the runner', () => {
  it('reports progress and settles as downloaded', async () => {
    mockDownload.mockImplementation((_url, file, options) => {
      const onProgress = options.onProgress as (p: {
        bytesWritten: number;
        totalBytes: number;
      }) => void;
      onProgress({ bytesWritten: 500, totalBytes: 1000 });
      mockFiles.set(file.uri, 1000);
      return Promise.resolve();
    });

    startSurahDownload('husary', 18);
    await flush();

    expect(useDownloadQueueStore.getState().entries['husary:18']).toEqual({
      status: 'downloaded',
      progress: 1,
      // The BYTES the last tick carried, not only the fraction — what the progress panel reads.
      bytesWritten: 500,
      totalBytes: 1000,
      error: undefined,
    });
  });

  it('ignores a progress event with no Content-Length rather than going backwards', async () => {
    const seen: number[] = [];
    mockDownload.mockImplementation((_url, _file, options) => {
      const onProgress = options.onProgress as (p: {
        bytesWritten: number;
        totalBytes: number;
      }) => void;
      onProgress({ bytesWritten: 500, totalBytes: -1 });
      seen.push(useDownloadQueueStore.getState().entries['husary:18']?.progress ?? -99);
      return Promise.resolve();
    });

    startSurahDownload('husary', 18);
    await flush();
    expect(seen).toEqual([0]);
  });

  it('settles a failure as error, leaving a retry, and keeps the rest of the queue', async () => {
    mockDownload.mockImplementation((url, file) => {
      if (url.endsWith('002.mp3')) return Promise.reject(new Error('404'));
      mockFiles.set(file.uri, 1000);
      return Promise.resolve();
    });

    startSurahDownload('husary', 1);
    startSurahDownload('husary', 2);
    startSurahDownload('husary', 3);
    await flush();

    const entries = useDownloadQueueStore.getState().entries;
    expect(entries['husary:1'].status).toBe('downloaded');
    expect(entries['husary:2'].status).toBe('error');
    expect(entries['husary:3'].status).toBe('downloaded');
  });

  it('does not re-download a surah already on disk', async () => {
    seedFile(uriFor('husary', 18));
    startSurahDownload('husary', 18);
    await flush();

    expect(mockDownload).not.toHaveBeenCalled();
    expect(useDownloadQueueStore.getState().entries['husary:18'].status).toBe('downloaded');
  });

  it('queues the whole book for "download all"', async () => {
    mockDownload.mockImplementation((_url, file) => {
      mockFiles.set(file.uri, 1000);
      return Promise.resolve();
    });

    queueReciterDownloads('husary');
    await flush();

    expect(mockDownload).toHaveBeenCalledTimes(114);
    expect(downloadedSurahs('husary')).toHaveLength(114);
  });
});

describe('per-reciter totals', () => {
  it("sums only that reciter's files", () => {
    seedFile(uriFor('husary', 1), 1000);
    seedFile(uriFor('husary', 2), 2000);
    seedFile(uriFor('alafasy', 1), 9000);
    expect(reciterBytesOnDisk('husary')).toBe(3000);
    expect(reciterBytesOnDisk('nobody')).toBe(0);
  });

  it('lists which surahs are kept, in order, ignoring anything else in the directory', () => {
    seedFile(uriFor('husary', 18));
    seedFile(uriFor('husary', 2));
    mockFiles.set(`${DOC}/audio/husary/notes.txt`, 10);
    expect(downloadedSurahs('husary')).toEqual([2, 18]);
  });

  it("counts each reciter's kept surahs — the picker's per-row control", () => {
    seedFile(uriFor('husary', 1));
    seedFile(uriFor('husary', 2));
    seedFile(uriFor('alafasy', 5));
    // A literal expected map, not one derived from the listing under test.
    expect([...reciterDownloadCounts().entries()].sort()).toEqual([
      ['alafasy', 1],
      ['husary', 2],
    ]);
  });

  it('leaves a reciter with nothing kept OUT of the map rather than at zero', () => {
    // A `.part` file is residue, never a kept surah — the rename IS the commit.
    seedFile(`${DOC}/audio/husary/001.mp3.part`);
    expect(reciterDownloadCounts().size).toBe(0);
  });

  it('takes everything for a reciter away at once, rows included', async () => {
    seedFile(uriFor('husary', 1));
    seedFile(uriFor('husary', 2));
    hydrateDownloadState('husary');
    expect(Object.keys(useDownloadQueueStore.getState().entries)).toHaveLength(2);

    deleteReciterDownloads('husary');
    await flush();

    expect(downloadedSurahs('husary')).toEqual([]);
    expect(useDownloadQueueStore.getState().entries).toEqual({});
  });
});

describe('the approximate estimate', () => {
  it('is duration times the nominal bitrate, summed over the surahs the manifest knows', () => {
    const manifest = new Map([
      [1, [{ verse: 1, fromMs: 0, toMs: 10_000 }]],
      [2, [{ verse: 1, fromMs: 0, toMs: 5_000 }]],
    ]);
    // ⚠️ A LITERAL, NOT `15 * (NOMINAL_BITRATE_BPS / 8)`. Deriving the expectation from the
    // constant under test makes the case agree with any edit to it — the repo's own
    // non-negotiable, and `web-focus-ring.test.ts`'s recorded failure. 15 seconds at 128 kbps
    // is 240,000 bytes, computed by hand. (Story 7-5 review, P24.)
    expect(estimateReciterDownload(manifest).bytes).toBe(240_000);
  });

  it('counts the surahs the MANIFEST describes, never 114', () => {
    const manifest = new Map([
      [1, [{ verse: 1, fromMs: 0, toMs: 10_000 }]],
      [2, [{ verse: 1, fromMs: 0, toMs: 5_000 }]],
    ]);
    // The dialog promises this many files; a manifest covering 2 must not promise 114.
    expect(estimateReciterDownload(manifest).surahs).toBe(2);
  });

  it('is zero for an empty manifest rather than NaN', () => {
    expect(estimateReciterDownload(new Map())).toEqual({ bytes: 0, surahs: 0 });
  });
});

describe('hydration', () => {
  it('seeds downloaded rows from disk and drops rows whose file has vanished', () => {
    seedFile(uriFor('husary', 1));
    hydrateDownloadState('husary');
    expect(useDownloadQueueStore.getState().entries['husary:1'].status).toBe('downloaded');

    mockFiles.delete(uriFor('husary', 1));
    hydrateDownloadState('husary');
    expect(useDownloadQueueStore.getState().entries['husary:1']).toBeUndefined();
  });
});

describe('a listing that could not be read', () => {
  /**
   * ⚠️ `[]` AND `null` ARE DIFFERENT ANSWERS, AND CONFLATING THEM COSTS A GIGABYTE. Hydration
   * reads an empty keep-set as proof every kept row is stale; one transient EIO would therefore
   * drop every row, the surface would read "Nothing downloaded yet", and "download all" would
   * re-fetch what the device already has. (Story 7-5 review, P3.)
   */
  it('answers null rather than empty', () => {
    seedFile(uriFor('husary', 1));
    mockListingBroken.value = true;
    expect(downloadedSurahs('husary')).toBeNull();
  });

  it('leaves the mirror alone rather than wiping it', () => {
    seedFile(uriFor('husary', 1));
    hydrateDownloadState('husary');
    expect(useDownloadQueueStore.getState().entries['husary:1'].status).toBe('downloaded');

    mockListingBroken.value = true;
    hydrateDownloadState('husary');
    expect(useDownloadQueueStore.getState().entries['husary:1'].status).toBe('downloaded');
  });
});

describe('a transfer that stalls', () => {
  /**
   * A captive portal or a dead socket delivers no bytes and never rejects. Without the watchdog
   * the serial drain waits on it forever and all 113 remaining rows stay `queued`.
   * (Story 7-5 review, P4.)
   */
  it('is failed, with a reason, and the queue moves on', async () => {
    jest.useFakeTimers();
    try {
      mockDownload.mockImplementation((url, file, options) =>
        url.endsWith('001.mp3')
          ? // Never settles on its own — only the watchdog's abort can end it.
            new Promise((_resolve, reject) => {
              (options.signal as AbortSignal).addEventListener('abort', () =>
                reject(new Error('aborted'))
              );
            })
          : (mockFiles.set(file.uri, 1000), Promise.resolve())
      );

      startSurahDownload('husary', 1);
      startSurahDownload('husary', 2);
      await Promise.resolve();
      expect(useDownloadQueueStore.getState().entries['husary:1'].status).toBe('downloading');

      jest.advanceTimersByTime(DOWNLOAD_STALL_TIMEOUT_MS + 1);
      // Let the rejection, the catch and the next iteration all land.
      for (let i = 0; i < 12; i++) await Promise.resolve();

      const entries = useDownloadQueueStore.getState().entries;
      expect(entries['husary:1'].status).toBe('error');
      expect(entries['husary:1'].error).toBe('stalled');
      expect(entries['husary:2'].status).toBe('downloaded');
    } finally {
      jest.useRealTimers();
    }
  });

  /**
   * ⚠️ THE WHOLE QUEUE REACHES THE OS BEFORE THE FIRST FILE FINISHES — the "download all and put
   * the phone away" fix, and the case that would have caught its absence.
   *
   * The transfers were always real background `URLSession` tasks; the QUEUE was a JS `await` loop,
   * and a suspended app runs no JS to hand over the next one. So exactly one surah completed in
   * the reader's pocket and the rest sat at `queued` — measured by the owner, and invisible to
   * every case here, all of which let their downloads resolve.
   *
   * ⚠️ THE MUTATION: put the `await` back (drain one at a time on iOS). With no transfer ever
   * resolving, a serial drain reaches exactly ONE, and this reds at 1 instead of 3. That is also
   * why nothing is allowed to settle — a resolving mock cannot tell the two shapes apart.
   */
  it('hands the OS every queued surah up front, not one per completion', async () => {
    mockDownload.mockImplementation(
      (_url, _file, options) =>
        new Promise((_resolve, reject) => {
          (options.signal as AbortSignal).addEventListener('abort', () =>
            reject(new Error('aborted'))
          );
        })
    );

    startSurahDownload('husary', 1);
    startSurahDownload('husary', 2);
    startSurahDownload('husary', 3);
    await flush();

    expect(mockTaskDownload).toHaveBeenCalledTimes(3);
    const entries = useDownloadQueueStore.getState().entries;
    expect(entries['husary:1'].status).toBe('downloading');
    expect(entries['husary:2'].status).toBe('downloading');
    expect(entries['husary:3'].status).toBe('downloading');
  });

  /**
   * ⚠️ A SUSPENDED APP IS NOT A STALLED TRANSFER, AND BACKGROUND TRANSFERS MADE THE DIFFERENCE
   * MATTER. iOS keeps the download running while it freezes the JS that would re-arm this timer,
   * so an unguarded watchdog aborts a healthy transfer the moment the reader comes back — killing
   * precisely the downloads `sessionType: 'background'` was added to keep alive.
   */
  it('is not declared stalled while the app is in the background', async () => {
    jest.useFakeTimers();
    const appState = AppState as unknown as { currentState: string };
    const wasActive = appState.currentState;
    try {
      appState.currentState = 'background';
      mockDownload.mockImplementation(
        (_url, _file, options) =>
          new Promise((_resolve, reject) => {
            (options.signal as AbortSignal).addEventListener('abort', () =>
              reject(new Error('aborted'))
            );
          })
      );

      startSurahDownload('husary', 1);
      await Promise.resolve();
      jest.advanceTimersByTime(DOWNLOAD_STALL_TIMEOUT_MS * 4);
      for (let i = 0; i < 12; i++) await Promise.resolve();

      expect(useDownloadQueueStore.getState().entries['husary:1'].status).toBe('downloading');
    } finally {
      appState.currentState = wasActive;
      jest.useRealTimers();
    }
  });
});

describe('what reaches Sentry', () => {
  /**
   * ⚠️ `errors.ts`'s capture policy, tier 2: a transient network condition is a breadcrumb, not
   * a capture. A 114-file queue on a flaky link would otherwise send up to 114 captures for one
   * bad afternoon — and in dev every one of them is a full-screen red box.
   */
  it('breadcrumbs a network failure without capturing it', async () => {
    mockDownload.mockImplementation(() =>
      Promise.reject(new Error('java.net.SocketTimeoutException: timeout'))
    );
    startSurahDownload('husary', 18);
    await flush();

    expect(useDownloadQueueStore.getState().entries['husary:18'].status).toBe('error');
    expect(mockAddBreadcrumb).toHaveBeenCalled();
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('captures something that is actually a defect', async () => {
    mockDownload.mockImplementation(() => Promise.reject(new Error('EACCES permission denied')));
    startSurahDownload('husary', 18);
    await flush();

    expect(mockCaptureException).toHaveBeenCalled();
  });
});

describe('the failure reason', () => {
  it('is carried onto the row rather than discarded', async () => {
    mockDownload.mockImplementation(() =>
      Promise.reject(new Error('HTTP 507 insufficient storage'))
    );
    startSurahDownload('husary', 18);
    await flush();

    expect(useDownloadQueueStore.getState().entries['husary:18']).toEqual({
      status: 'error',
      progress: 0,
      bytesWritten: 0,
      totalBytes: 0,
      error: 'HTTP 507 insufficient storage',
    });
  });

  /**
   * ⚠️ MEASURED ON A PIXEL 9 PRO, 2026-09-11, over a throttled link. Android rejects with a
   * multi-line Java message; a screen reader would otherwise read a hundred characters of
   * implementation detail out loud. The first line, trimmed, is what names the failure.
   */
  it('is one trimmed line, never an Android stack fragment', async () => {
    mockDownload.mockImplementation(() =>
      Promise.reject(
        new Error(
          "Call to function 'FileSystem.downloadFileAsync' has been rejected.\n" +
            '→ Caused by: java.net.SocketTimeoutException: timeout'
        )
      )
    );
    startSurahDownload('husary', 18);
    await flush();

    const reason = useDownloadQueueStore.getState().entries['husary:18'].error ?? '';
    expect(reason).not.toContain('\n');
    expect(reason).not.toContain('Caused by');
    expect(reason.length).toBeLessThanOrEqual(80);
    expect(reason.startsWith("Call to function 'FileSystem.downloadFileAsync'")).toBe(true);
  });
});

describe('remove-all racing a completing transfer', () => {
  /**
   * The files are gone and the store is cleared while the last transfer is resolving; without
   * the guard that transfer writes `downloaded` on top and leaves a checkmark over nothing.
   * (Story 7-5 review, P8.)
   */
  it('does not resurrect a row after the cancel', async () => {
    const settle: { finish: () => void } = { finish: () => {} };
    mockDownload.mockImplementation((_url, file) => {
      mockFiles.set(file.uri, 1000);
      return new Promise<void>((resolve) => {
        settle.finish = resolve;
      });
    });

    startSurahDownload('husary', 18);
    await flush();
    cancelReciterDownloads('husary');
    // The transfer resolves AFTER the cancel — the exact race.
    settle.finish();
    await flush();

    expect(useDownloadQueueStore.getState().entries['husary:18']).toBeUndefined();
    expect(isDownloaded('husary', 18)).toBe(false);
  });
});

describe('orphaned downloads', () => {
  /**
   * `abdulkareem` left the catalogue on 2026-09-08. Files kept under it are listed by no row,
   * deleted by no control and played by nothing. (Story 7-5 review, P14.)
   */
  it('are measured, and removable, without touching a catalogue voice', () => {
    seedFile(uriFor('husary', 1), 2000);
    seedFile(uriFor('abdulkareem', 1), 5000);

    expect(orphanedDownloadBytes(['husary'])).toBe(5000);
    deleteOrphanedDownloads(['husary']);
    expect(orphanedDownloadBytes(['husary'])).toBe(0);
    expect(isDownloaded('husary', 1)).toBe(true);
  });
});
