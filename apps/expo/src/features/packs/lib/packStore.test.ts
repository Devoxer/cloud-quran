/**
 * Content packs on disk, and the install that puts them there (story 8-2).
 *
 * This is the frozen I/O matrix, with LITERAL expected values. The mutations it exists to catch
 * all typecheck, lint and render perfectly:
 *
 *   1. the install writing straight to the final path instead of `{name}.part` — kill the app
 *      mid-transfer and the listing reports a FRAGMENT of a translation as installed;
 *   2. the digest check removed or inverted — a corrupted download becomes readable;
 *   3. the ROW COUNT check removed — the case a digest structurally cannot catch, because a
 *      digest minted from a truncated build agrees with itself forever;
 *   4. the listing conflating "could not list" with "nothing installed", which drops every
 *      installed pack on one transient filesystem error (`audioDownloads.ts:29`'s lesson);
 *   5. packs moving to `Paths.cache`, where the OS may evict an offline promise the reader kept.
 *
 * ⚠️ `expo-file-system` IS MOCKED LOCALLY, as an in-memory filesystem, for the same reason
 * `audioDownloads.test.ts` mocks it: every case here is about WHAT IS LEFT ON DISK after a
 * failure, which a `jest.fn()` returning a fixed value cannot answer.
 */

/** uri → size in bytes. The whole filesystem. */
const mockFiles = new Map<string, number>();
const mockDirs = new Set<string>();
/** uri → the bytes a `File.bytes()` answers with. Only what the digest check reads. */
const mockBytes = new Map<string, Uint8Array>();
const mockDownload = jest.fn<Promise<void>, [string, { uri: string }, Record<string, unknown>]>();
/** Flipped by the listing case: every `list()` throws, the way a real failure would. */
const mockListingBroken = { value: false };
/** Flipped by the C1 case: the COMMIT throws, the way a full disk would. */
const mockMoveBroken = { value: false };

/** What `countPackRows` answers for a given file name. The truncation case moves it. */
const mockRowCount = { value: 6236 };
const mockClosePack = jest.fn<Promise<void>, [string]>(() => Promise.resolve());
const mockCountPackRows = jest.fn<Promise<number>, [string]>(() =>
  Promise.resolve(mockRowCount.value)
);

jest.mock('@/lib/quranDb', () => ({
  sqliteDirectoryUri: () => 'file:///documents/SQLite',
  closePack: (id: string) => mockClosePack(id),
  countPackRows: (name: string) => mockCountPackRows(name),
}));

jest.mock('@/lib/errors', () => ({
  addBreadcrumb: jest.fn(),
  isDeviceOfflineError: (error: unknown) =>
    String(error instanceof Error ? error.message : error)
      .toLowerCase()
      .includes('device is offline'),
}));

/** SHA-256 over the bytes, from Node's own crypto — a REAL digest, never the one under test. */
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digest: async (_algorithm: string, data: Uint8Array) => {
    // biome-ignore lint/style/noCommonJs: a Jest module factory cannot use a hoisted import.
    const { createHash } = require('node:crypto');
    const buffer = createHash('sha256').update(Buffer.from(data)).digest();
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  },
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
    create() {
      let path = this.uri;
      while (path.includes('/') && path !== 'file://') {
        mockDirs.add(path);
        path = path.slice(0, path.lastIndexOf('/'));
      }
    }
    list() {
      if (mockListingBroken.value) throw new Error('EIO');
      const out: any[] = [];
      for (const uri of mockFiles.keys()) {
        if (!uri.startsWith(`${this.uri}/`)) continue;
        if (uri.slice(this.uri.length + 1).includes('/')) continue;
        out.push(new File(uri));
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
      mockBytes.delete(this.uri);
    }
    bytes() {
      return Promise.resolve(mockBytes.get(this.uri) ?? new Uint8Array());
    }
    moveSync(destination: any) {
      if (mockMoveBroken.value) throw new Error('ENOSPC');
      const size = mockFiles.get(this.uri);
      if (size === undefined) return;
      const bytes = mockBytes.get(this.uri);
      mockFiles.delete(this.uri);
      mockBytes.delete(this.uri);
      mockFiles.set(destination.uri, size);
      if (bytes) mockBytes.set(destination.uri, bytes);
      this.uri = destination.uri;
    }
    static downloadFileAsync(url: string, destination: any, options: any) {
      return mockDownload(url, destination, options);
    }
  }

  return { __esModule: true, Directory, File, Paths: { document: 'file:///documents' } };
});

import { createHash } from 'node:crypto';

import { AppState } from 'react-native';

import {
  PACK_MAX_VERIFIABLE_BYTES,
  PACK_STALL_TIMEOUT_MS,
  PACKS_SUPPORTED,
} from '@/constants/packs';
import type { CataloguePack } from './catalogue';
import {
  __resetPackInstalls,
  anyInstallRunning,
  cancelPackInstall,
  deleteInstalledPack,
  installedPackBytes,
  installPack,
  listInstalledPacks,
  sweepStalePackParts,
} from './packStore';

/**
 * Every `AppState` change handler the module under test registered.
 *
 * ⚠️ THE SUBSCRIPTION IS PROVIDED BY THIS FILE RATHER THAN BY THE PRESET. `installPack`'s `finally`
 * calls `subscription.remove()`, and a preset mock whose implementation `jest.clearAllMocks()`
 * wipes hands back `undefined` — which surfaces as every case after the first spy as
 * "Cannot read properties of undefined (reading 'remove')", a failure about the harness and not
 * about the code.
 */
const mockAppStateHandlers: ((state: string) => void)[] = [];

/** Let every pending microtask settle without advancing the fake clock. */
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

/** A transfer that never delivers and never settles, until its signal aborts. */
function hangingDownload() {
  mockDownload.mockImplementation(
    (_url, _file, options) =>
      new Promise((_resolve, reject) => {
        (options.signal as AbortSignal).addEventListener('abort', () =>
          reject(new Error('aborted'))
        );
      })
  );
}

const SQLITE_DIR = 'file:///documents/SQLite';
const PACK_URI = `${SQLITE_DIR}/translation-fr-rashid-v1.db`;
const PART_URI = `${PACK_URI}.part`;

/** The bytes a healthy transfer delivers, and the digest the catalogue therefore carries. */
const GOOD_BYTES = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
const GOOD_DIGEST = createHash('sha256').update(Buffer.from(GOOD_BYTES)).digest('hex');

const PACK: CataloguePack = {
  id: 'translation-fr-rashid',
  packVersion: 1,
  type: 'translation',
  language: 'fr',
  languageName: 'Français',
  title: 'Le Noble Coran — Rachid Maach',
  source: 'QuranEnc',
  sourceVersion: '1.0.3',
  licenceId: 'quranenc-republication',
  attribution: 'Traduction française : Rachid Maach. Source : QuranEnc.com (v1.0.3).',
  url: 'https://cdn.nobleachievements.com/packs/translation-fr-rashid-v1.db',
  bytes: 1_425_408,
  rows: 6236,
  digest: GOOD_DIGEST,
};

/** Put a file on the fake disk, creating its directory. */
function seedFile(uri: string, bytes: Uint8Array, size = bytes.length): void {
  mockFiles.set(uri, size);
  mockBytes.set(uri, bytes);
  let path = uri.slice(0, uri.lastIndexOf('/'));
  while (path.includes('/') && path !== 'file://') {
    mockDirs.add(path);
    path = path.slice(0, path.lastIndexOf('/'));
  }
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAppStateHandlers.length = 0;
  (AppState as { currentState: string }).currentState = 'active';
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((
    _event: unknown,
    handler: (state: string) => void
  ) => {
    mockAppStateHandlers.push(handler);
    return { remove: jest.fn() };
  }) as never);
  mockFiles.clear();
  mockBytes.clear();
  mockDirs.clear();
  mockListingBroken.value = false;
  mockMoveBroken.value = false;
  mockRowCount.value = 6236;
  mockCountPackRows.mockImplementation(() => Promise.resolve(mockRowCount.value));
  __resetPackInstalls();
  // The default transfer behaves: it writes the `.part` file the rename then commits.
  mockDownload.mockImplementation((_url, file) => {
    seedFile(file.uri, GOOD_BYTES);
    return Promise.resolve();
  });
});

describe('the on-disk layout', () => {
  it('is exercised as a NATIVE platform — every case below assumes it', () => {
    // ⚠️ Without this the whole file could be passing vacuously through the web short-circuit,
    // which answers `[]`/`0` to almost everything here. Web has its own suite.
    expect(PACKS_SUPPORTED).toBe(true);
  });

  it("installs into expo-sqlite's directory, never the evictable cache", async () => {
    await installPack(PACK);

    const [, destination] = mockDownload.mock.calls[0];
    // The transfer writes `.part`; the rename commits it to the real path.
    expect(destination.uri).toBe(PART_URI);
    expect(destination.uri).not.toContain('cache');
    expect(mockFiles.has(PACK_URI)).toBe(true);
  });

  it("fetches from the app's own CDN and nowhere else", async () => {
    await installPack(PACK);
    expect(mockDownload.mock.calls[0][0]).toBe(
      'https://cdn.nobleachievements.com/packs/translation-fr-rashid-v1.db'
    );
  });

  it('carries the version in the file name, so an update is a different file', () => {
    seedFile(PACK_URI, GOOD_BYTES, 1000);
    seedFile(`${SQLITE_DIR}/translation-fr-rashid-v2.db`, GOOD_BYTES, 2000);
    expect(listInstalledPacks()).toEqual([
      { id: 'translation-fr-rashid', version: 1, bytes: 1000 },
      { id: 'translation-fr-rashid', version: 2, bytes: 2000 },
    ]);
  });

  it('never mistakes the bundled Quran database for a pack', () => {
    seedFile(`${SQLITE_DIR}/quran.db`, GOOD_BYTES, 4_200_000);
    expect(listInstalledPacks()).toEqual([]);
    expect(installedPackBytes()).toBe(0);
  });
});

describe('installing', () => {
  it('verifies and installs, and the pack is listed straight away', async () => {
    const result = await installPack(PACK);

    expect(result).toEqual({ ok: true });
    expect(listInstalledPacks()).toEqual([
      { id: 'translation-fr-rashid', version: 1, bytes: GOOD_BYTES.length },
    ]);
    // The row count was read from the `.part` file — BEFORE the rename, which is the only place
    // a refusal can still mean "nothing became readable".
    expect(mockCountPackRows).toHaveBeenCalledWith('translation-fr-rashid-v1.db.part');
  });

  it('is a no-op when the same version is already installed — no re-download', async () => {
    seedFile(PACK_URI, GOOD_BYTES, 1_425_408);

    const result = await installPack(PACK);

    expect(result).toEqual({ ok: true });
    expect(mockDownload).not.toHaveBeenCalled();
    expect(listInstalledPacks()).toEqual([
      { id: 'translation-fr-rashid', version: 1, bytes: 1_425_408 },
    ]);
  });

  it('refuses a corrupted transfer, discards the `.part`, and installs nothing', async () => {
    mockDownload.mockImplementation((_url, file) => {
      seedFile(file.uri, new Uint8Array([9, 9, 9]));
      return Promise.resolve();
    });

    const result = await installPack(PACK);

    expect(result).toEqual({ ok: false, reason: 'digest' });
    expect(mockFiles.has(PART_URI)).toBe(false);
    expect(mockFiles.has(PACK_URI)).toBe(false);
    expect(listInstalledPacks()).toEqual([]);
  });

  it('refuses a TRUNCATED but well-formed pack — the case a digest cannot catch', async () => {
    // The bytes hash exactly as the catalogue says; the pack is simply short. This is the whole
    // argument for carrying a row count beside the digest.
    mockRowCount.value = 4100;

    const result = await installPack(PACK);

    expect(result).toEqual({ ok: false, reason: 'rows' });
    expect(mockFiles.has(PART_URI)).toBe(false);
    expect(mockFiles.has(PACK_URI)).toBe(false);
    expect(listInstalledPacks()).toEqual([]);
  });

  it('reports being offline as a value rather than throwing', async () => {
    mockDownload.mockRejectedValue(new Error('java.net.UnknownHostException: cdn'));

    const result = await installPack(PACK);

    expect(result).toEqual({ ok: false, reason: 'offline' });
    expect(mockFiles.has(PART_URI)).toBe(false);
    expect(listInstalledPacks()).toEqual([]);
  });

  it('closes the old handle before replacing an older version', async () => {
    seedFile(`${SQLITE_DIR}/translation-fr-rashid-v1.db`, GOOD_BYTES, 10);
    const newer = { ...PACK, packVersion: 2, url: `${PACK.url.slice(0, -4)}2.db` };
    mockDownload.mockImplementation((_url, file) => {
      seedFile(file.uri, GOOD_BYTES);
      return Promise.resolve();
    });

    const result = await installPack(newer);

    expect(result).toEqual({ ok: true });
    expect(mockClosePack).toHaveBeenCalledWith('translation-fr-rashid');
    // The old file is gone and the new one is the only pack installed.
    expect(listInstalledPacks()).toEqual([
      { id: 'translation-fr-rashid', version: 2, bytes: GOOD_BYTES.length },
    ]);
  });
});

describe('an interrupted transfer', () => {
  it('leaves only a `.part` file, which no listing can see', () => {
    // What a killed app leaves behind: the bytes written so far, under the `.part` name.
    seedFile(PART_URI, GOOD_BYTES, 400_000);

    expect(listInstalledPacks()).toEqual([]);
    expect(installedPackBytes()).toBe(0);
  });

  it('is swept, so the residue does not sit on disk forever', () => {
    seedFile(PART_URI, GOOD_BYTES, 400_000);

    sweepStalePackParts();

    expect(mockFiles.has(PART_URI)).toBe(false);
  });

  it('leaves a file that is not a pack alone', () => {
    seedFile(`${SQLITE_DIR}/quran.db.part`, GOOD_BYTES, 10);
    sweepStalePackParts();
    expect(mockFiles.has(`${SQLITE_DIR}/quran.db.part`)).toBe(true);
  });
});

describe('the listing', () => {
  it('answers `null` for "could not list", which is NOT an empty set', () => {
    seedFile(PACK_URI, GOOD_BYTES, 1000);
    mockListingBroken.value = true;

    // ⚠️ The literal matters: `[]` here is what dropped every kept row in `audioDownloads`.
    expect(listInstalledPacks()).toBeNull();
  });

  it('answers an empty array when the directory genuinely holds no packs', () => {
    mockDirs.add(SQLITE_DIR);
    expect(listInstalledPacks()).toEqual([]);
  });

  it('sums only the committed packs', () => {
    seedFile(PACK_URI, GOOD_BYTES, 1_425_408);
    seedFile(`${SQLITE_DIR}/translation-es-garcia-v1.db.part`, GOOD_BYTES, 900_000);
    seedFile(`${SQLITE_DIR}/quran.db`, GOOD_BYTES, 4_200_000);

    expect(installedPackBytes()).toBe(1_425_408);
  });
});

describe('deleting', () => {
  it('closes the handle first, then removes the file', async () => {
    seedFile(PACK_URI, GOOD_BYTES, 1000);

    await deleteInstalledPack('translation-fr-rashid', 1);

    expect(mockClosePack).toHaveBeenCalledWith('translation-fr-rashid');
    expect(mockFiles.has(PACK_URI)).toBe(false);
    expect(listInstalledPacks()).toEqual([]);
    expect(installedPackBytes()).toBe(0);
  });
});

describe('the stall watchdog', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('calls a transfer that delivers NOTHING stalled, and leaves no residue', async () => {
    // ⚠️ A captive portal produces a request that neither delivers nor rejects. Without the
    // watchdog the install sits there forever with no way to tell anything is wrong.
    hangingDownload();
    const settled = installPack(PACK);
    await flush();

    jest.advanceTimersByTime(PACK_STALL_TIMEOUT_MS);
    await expect(settled).resolves.toEqual({ ok: false, reason: 'stalled' });
    expect(mockFiles.has(PART_URI)).toBe(false);
    expect(listInstalledPacks()).toEqual([]);
  });

  it('is re-armed by progress, so a SLOW link is never mistaken for a stalled one', async () => {
    let report: ((p: { bytesWritten: number; totalBytes: number }) => void) | null = null;
    mockDownload.mockImplementation(
      (_url, _file, options) =>
        new Promise((_resolve, reject) => {
          report = (options as unknown as { onProgress: NonNullable<typeof report> }).onProgress;
          (options.signal as AbortSignal).addEventListener('abort', () =>
            reject(new Error('aborted'))
          );
        })
    );
    const settled = installPack(PACK);
    await flush();

    // Two ticks, each just before the deadline. A watchdog that did not re-arm would have fired.
    for (let i = 0; i < 2; i++) {
      jest.advanceTimersByTime(PACK_STALL_TIMEOUT_MS - 1_000);
      (report as ((p: { bytesWritten: number; totalBytes: number }) => void) | null)?.({
        bytesWritten: 1_000 * (i + 1),
        totalBytes: PACK.bytes,
      });
      await flush();
    }
    expect(anyInstallRunning()).toBe(true);

    jest.advanceTimersByTime(PACK_STALL_TIMEOUT_MS);
    await expect(settled).resolves.toEqual({ ok: false, reason: 'stalled' });
  });

  it('is DISARMED in the background, so a pocketed transfer is not killed on resume', async () => {
    // ⚠️ A suspended app runs no JS: no progress event arrives to re-arm, and the timer fires on
    // the wall clock the moment the app resumes — aborting exactly the transfers the watchdog
    // exists to protect. Silence only means "stalled" while somebody is there to be told.
    hangingDownload();

    const settled = installPack(PACK);
    await flush();

    (AppState as { currentState: string }).currentState = 'background';
    for (const handler of mockAppStateHandlers) handler('background');
    jest.advanceTimersByTime(PACK_STALL_TIMEOUT_MS * 3);
    await flush();
    // Still running: nothing aborted it while nobody was watching.
    expect(anyInstallRunning()).toBe(true);

    (AppState as { currentState: string }).currentState = 'active';
    for (const handler of mockAppStateHandlers) handler('active');
    jest.advanceTimersByTime(PACK_STALL_TIMEOUT_MS);
    await expect(settled).resolves.toEqual({ ok: false, reason: 'stalled' });
  });
});

describe('cancelling', () => {
  it('reports a reader-pressed stop as `cancelled`, never as a failure', async () => {
    // ⚠️ A cancel settling as an `error` would put a red retry under a reader who had just
    // pressed stop.
    hangingDownload();
    const settled = installPack(PACK);
    await flush();

    cancelPackInstall(PACK.id);

    await expect(settled).resolves.toEqual({ ok: false, reason: 'cancelled' });
    expect(mockFiles.has(PART_URI)).toBe(false);
    expect(listInstalledPacks()).toEqual([]);
  });

  it('still refuses to install when the cancel lands AFTER verification passed', async () => {
    // ⚠️ THE C4 CASE. Verifying a 24 MB pack is not instant, and the abort has nothing left to
    // interrupt once the transfer has finished — so a reader who pressed stop during verification
    // got the pack installed anyway. A cancel means "do not end up with this".
    mockCountPackRows.mockImplementation(() => {
      cancelPackInstall(PACK.id);
      return Promise.resolve(PACK.rows);
    });

    const result = await installPack(PACK);

    expect(result).toEqual({ ok: false, reason: 'cancelled' });
    expect(mockFiles.has(PACK_URI)).toBe(false);
    expect(mockFiles.has(PART_URI)).toBe(false);
    expect(listInstalledPacks()).toEqual([]);
  });
});

describe('the verification ceiling', () => {
  it('refuses a pack the catalogue already says is too big, without fetching it', async () => {
    // ⚠️ `expo-crypto` has no incremental digest, so verifying means holding the whole file in
    // the JS heap. Spending a reader's data on something that can only end in an OOM is worse
    // than saying no.
    const huge = { ...PACK, bytes: PACK_MAX_VERIFIABLE_BYTES + 1 };

    await expect(installPack(huge)).resolves.toEqual({ ok: false, reason: 'tooLarge' });
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it('refuses one whose real size exceeds the ceiling even when the catalogue understated it', async () => {
    mockDownload.mockImplementation((_url, file) => {
      seedFile(file.uri, GOOD_BYTES, PACK_MAX_VERIFIABLE_BYTES + 1);
      return Promise.resolve();
    });

    await expect(installPack(PACK)).resolves.toEqual({ ok: false, reason: 'tooLarge' });
    expect(mockFiles.has(PART_URI)).toBe(false);
    expect(listInstalledPacks()).toEqual([]);
  });
});

describe('replacing an older version', () => {
  it('keeps the old pack when the COMMIT fails, rather than losing both', async () => {
    // ⚠️ THE C1 CASE. The old file used to be deleted BEFORE the rename, so a `moveSync` that
    // threw left the reader with neither the old working pack nor the new one — on the exact path
    // this module's docblock calls atomic.
    seedFile(`${SQLITE_DIR}/translation-fr-rashid-v1.db`, GOOD_BYTES, 1_000);
    const newer = {
      ...PACK,
      packVersion: 2,
      url: 'https://cdn.nobleachievements.com/packs/translation-fr-rashid-v2.db',
    };
    mockMoveBroken.value = true;

    const result = await installPack(newer);

    expect(result).toEqual({ ok: false, reason: 'failed' });
    // The old version is untouched and still the installed one.
    expect(listInstalledPacks()).toEqual([
      { id: 'translation-fr-rashid', version: 1, bytes: 1_000 },
    ]);
  });
});

describe('the sweep', () => {
  it('leaves alone the `.part` a transfer is writing RIGHT NOW', async () => {
    // ⚠️ Hydration runs on every arrival at the content screen, which can land mid-install.
    // Deleting the file the native writer has open turns a healthy download into a checksum
    // error nobody can explain. (Story 8-2 review, V4.)
    hangingDownload();
    const settled = installPack(PACK);
    await flush();
    seedFile(PART_URI, GOOD_BYTES, 400_000);

    sweepStalePackParts();

    expect(mockFiles.has(PART_URI)).toBe(true);
    cancelPackInstall(PACK.id);
    await settled;
  });
});
