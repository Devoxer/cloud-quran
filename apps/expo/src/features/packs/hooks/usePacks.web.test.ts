/**
 * The shelf ON WEB — the branch that decides whether a browser reader can acquire content at all
 * (story 8-3 review, V4).
 *
 * ⚠️ NO WEB BRANCH OF `usePacks` WAS EXECUTED BY ANYTHING. The suite runs as `ios` throughout, so
 * `PACKS_SUPPORTED` is `true` in every other file and all three of story 8-3's platform forks —
 * which list the local packs, which installer runs, which removal runs — were unreachable. Invert
 * the `install` ternary and `installPack` builds a `{document}/SQLite` path that does not exist in
 * a browser: every gate green, and the only way a web reader can get a source silently broken.
 *
 * ⚠️ THE PLATFORM IS SET BEFORE THE MODULE IS EVER LOADED, which is why this is its own file —
 * `packStore.web.test.ts`'s recorded trick, verbatim. `PACKS_SUPPORTED` is computed once at module
 * scope, deliberately (one fact, read everywhere), so the only way to observe the other value is
 * to have the platform already changed when the module first evaluates. `import` is hoisted and
 * `require` is not; each Jest file gets its own module registry, so nothing else is affected.
 */

import { Platform } from 'react-native';

(Platform as { OS: string }).OS = 'web';

/* biome-ignore-all lint/style/noCommonJs: the module registry has to be loaded AFTER the line above. */

const mockInstallPack = jest.fn<Promise<unknown>, unknown[]>(() => Promise.resolve({ ok: true }));
const mockListInstalledPacks = jest.fn(() => null);
const mockDeleteInstalled = jest.fn<Promise<void>, unknown[]>(() => Promise.resolve());
const mockSweep = jest.fn();

jest.mock('../lib/packStore', () => ({
  anyInstallRunning: () => false,
  cancelPackInstall: jest.fn(),
  deleteInstalledPack: (...args: unknown[]) => mockDeleteInstalled(...args),
  installedPackBytes: () => 999_999,
  installPack: (...args: unknown[]) => mockInstallPack(...args),
  listInstalledPacks: () => mockListInstalledPacks(),
  sweepStalePackParts: () => mockSweep(),
}));

const mockHoldPack = jest.fn<Promise<unknown>, unknown[]>(() => Promise.resolve({ ok: true }));
const mockListHeld = jest.fn<{ id: string; version: number; bytes: number }[], []>(() => []);
const mockForgetHeld = jest.fn<void, unknown[]>();
const mockHeldBytes = jest.fn(() => 1_425_408);

jest.mock('../lib/webPack', () => ({
  anyHoldRunning: () => false,
  forgetHeldPack: (...args: unknown[]) => mockForgetHeld(...args),
  heldPackBytes: () => mockHeldBytes(),
  holdPack: (...args: unknown[]) => mockHoldPack(...args),
  listHeldPacks: () => mockListHeld(),
}));

const mockFetchCatalogue = jest.fn<Promise<unknown>, unknown[]>();
jest.mock('../lib/catalogue', () => ({
  fetchCatalogue: (...args: unknown[]) => mockFetchCatalogue(...args),
}));

const mockClosePack = jest.fn<Promise<void>, unknown[]>(() => Promise.resolve());
jest.mock('@/lib/quranDb', () => ({
  closePack: (...args: unknown[]) => mockClosePack(...args),
  getPackMeta: jest.fn(() =>
    Promise.resolve({
      title: 'Le Noble Coran — Rachid Maach',
      language: 'fr',
      languageName: 'Français',
      type: 'translation',
      source: 'QuranEnc',
      sourceVersion: '1.0.3',
      attribution: 'Traduction française : Rachid Maach.',
    })
  ),
  getPackSurah: jest.fn(() => Promise.resolve([{ surah: 1, verse: 1, text: 'Au nom d’Allah' }])),
  isPackReadable: () => true,
  openPack: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/lib/errors', () => ({ captureException: jest.fn() }));

import { act, renderHook, waitFor } from '@testing-library/react-native';

/**
 * ⚠️ `require`, NOT `import` — AND THAT IS THE WHOLE TRICK. A static `import` is HOISTED above the
 * `Platform.OS` assignment at the top of this file, so `PACKS_SUPPORTED` would evaluate as `ios`
 * and every case below would exercise the native branch while claiming to be web. `import` is
 * hoisted, `require` is not; `packStore.web.test.ts` records the same line for the same reason.
 */
const { usePackStore } = require('@/stores/packStore') as typeof import('@/stores/packStore');
const { usePacks } = require('./usePacks') as typeof import('./usePacks');

const OFFERED = {
  id: 'translation-fr-rashid',
  packVersion: 1,
  type: 'translation',
  language: 'fr',
  languageName: 'Français',
  title: 'Le Noble Coran — Rachid Maach',
  source: 'QuranEnc',
  sourceVersion: '1.0.3',
  licenceId: 'quranenc-republication',
  attribution: 'Traduction française : Rachid Maach.',
  url: 'https://cdn.nobleachievements.com/packs/translation-fr-rashid-v1.db',
  bytes: 1_425_408,
  rows: 6236,
  digest: '142dedef190bb94180bbbba6f78f86d70077396732d9df130bf27505a3b4b37c',
};

const HELD = [{ id: 'translation-fr-rashid', version: 1, bytes: 1_425_408 }];

beforeEach(() => {
  jest.clearAllMocks();
  mockListHeld.mockReturnValue([]);
  mockFetchCatalogue.mockResolvedValue([OFFERED]);
  usePackStore.setState({ entries: {} });
});

describe('on web', () => {
  it('reads what is HELD, never the filesystem — and never sweeps a directory that has none', async () => {
    mockListHeld.mockReturnValue(HELD);
    const { result } = renderHook(() => usePacks());

    await waitFor(() => expect(result.current.disk).toBe('ready'));
    expect(mockListInstalledPacks).not.toHaveBeenCalled();
    expect(mockSweep).not.toHaveBeenCalled();
    expect(result.current.rows[0].installedVersion).toBe(1);
    // The session map's own total, not the directory's — `installedPackBytes` would answer for a
    // disk this platform does not have.
    expect(result.current.installedBytes).toBe(1_425_408);
  });

  it('a held pack is NOT re-opened by file name — it is already open', async () => {
    mockListHeld.mockReturnValue(HELD);
    const { result } = renderHook(() => usePacks());
    await waitFor(() => expect(result.current.disk).toBe('ready'));
    // ⚠️ `openPack` OPENS BY FILE NAME. On web there is no file; `holdPack` opened the connection
    // from the bytes it verified, so calling it here would fail every hydration.
    // biome-ignore lint/style/noCommonJs: see the module header — `import` is hoisted, `require` is not.
    const quranDb = require('@/lib/quranDb') as { openPack: jest.Mock };
    expect(quranDb.openPack).not.toHaveBeenCalled();
  });

  it('INSTALL means hold-for-the-session, never a download to a directory', async () => {
    const { result } = renderHook(() => usePacks());
    await waitFor(() => expect(result.current.catalogue).toBe('ready'));

    act(() => result.current.install(OFFERED));
    await waitFor(() => expect(mockHoldPack).toHaveBeenCalledWith(OFFERED));
    // MUTATION: invert the ternary. `installPack` then builds a `{document}/SQLite` path that
    // does not exist in a browser, and every gate stays green.
    expect(mockInstallPack).not.toHaveBeenCalled();
  });

  it('REMOVE closes the handle once and forgets the session record', async () => {
    mockListHeld.mockReturnValue(HELD);
    const { result } = renderHook(() => usePacks());
    await waitFor(() => expect(result.current.disk).toBe('ready'));

    act(() => result.current.remove('translation-fr-rashid', 1));
    await waitFor(() => expect(mockForgetHeld).toHaveBeenCalledWith('translation-fr-rashid'));
    // ⚠️ ONCE. The first cut called `closePack` here AND inside `releaseHeldPack`, closing the
    // same connection twice (8-3 review, S8).
    expect(mockClosePack).toHaveBeenCalledTimes(1);
    expect(mockDeleteInstalled).not.toHaveBeenCalled();
  });

  it('fetches the catalogue on web — 8-2 short-circuited it, and web now has content', async () => {
    const { result } = renderHook(() => usePacks());
    await waitFor(() => expect(result.current.catalogue).toBe('ready'));
    expect(mockFetchCatalogue).toHaveBeenCalledTimes(1);
  });
});
