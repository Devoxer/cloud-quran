/**
 * The shelf: its join, and the orchestration around it (story 8-2).
 *
 * ⚠️ THE ORCHESTRATION HALF WAS RUN BY NOTHING. This file imported only `buildRows`, and the
 * screen test mocks `@/features/packs` wholesale — so deleting the `refresh()` after a SUCCESSFUL
 * install left the shelf reading "Install" over an installed pack with every gate green. That is
 * the story's headline promise ("installs, and is readable without restarting the app"), and it
 * had no test at all. (Story 8-2 review, V1.)
 *
 * Two mutations the join half exists to catch:
 *   1. joining on the catalogue rather than unioning with it — offline the catalogue is `null`,
 *      and an inner join makes every installed pack VANISH from the one screen it is managed
 *      from, including the withdrawn ones a reader most needs a delete control for;
 *   2. the store's `installing` / `error` states losing to the disk join — neither has a file, so
 *      a row rebuilt from disk alone would silently drop back to "Install" mid-transfer.
 */

const mockInstallPack = jest.fn<Promise<unknown>, unknown[]>();
const mockListInstalledPacks = jest.fn();
const mockSweep = jest.fn();
const mockDeleteInstalled = jest.fn<Promise<void>, unknown[]>(() => Promise.resolve());
const mockCancelInstall = jest.fn();
const mockAnyInstallRunning = jest.fn(() => false);
const mockInstalledPackBytes = jest.fn(() => 0);

jest.mock('../lib/packStore', () => ({
  anyInstallRunning: () => mockAnyInstallRunning(),
  cancelPackInstall: (id: string) => mockCancelInstall(id),
  deleteInstalledPack: (id: string, version: number) => mockDeleteInstalled(id, version),
  installedPackBytes: () => mockInstalledPackBytes(),
  installPack: (...args: unknown[]) => mockInstallPack(...args),
  listInstalledPacks: () => mockListInstalledPacks(),
  sweepStalePackParts: () => mockSweep(),
}));

const mockFetchCatalogue = jest.fn<Promise<unknown>, unknown[]>();
jest.mock('../lib/catalogue', () => ({
  fetchCatalogue: (...args: unknown[]) => mockFetchCatalogue(...args),
}));

const mockOpenPack = jest.fn<Promise<void>, unknown[]>(() => Promise.resolve());
const mockReadable = { value: true };
jest.mock('@/lib/quranDb', () => ({
  closePack: jest.fn(() => Promise.resolve()),
  getPackMeta: jest.fn(() =>
    Promise.resolve({
      title: 'Le Noble Coran — Rachid Maach',
      language: 'fr',
      languageName: 'Français',
      type: 'translation',
      source: 'QuranEnc',
      sourceVersion: '1.0.3',
      attribution: 'Traduction française : Rachid Maach. Source : QuranEnc.com (v1.0.3).',
    })
  ),
  getPackSurah: jest.fn(() =>
    Promise.resolve([
      { surah: 1, verse: 1, text: 'Au nom d’Allah…', footnotes: null },
      { surah: 1, verse: 2, text: 'Louange à Allah…', footnotes: null },
    ])
  ),
  isPackReadable: () => mockReadable.value,
  openPack: (...args: unknown[]) => mockOpenPack(...args),
}));

jest.mock('@/lib/errors', () => ({ captureException: jest.fn() }));

import { act, renderHook, waitFor } from '@testing-library/react-native';

import { usePackStore } from '@/stores/packStore';
import { buildRows, usePacks } from './usePacks';

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
  attribution: 'Traduction française : Rachid Maach. Source : QuranEnc.com (v1.0.3).',
  url: 'https://cdn.nobleachievements.com/packs/translation-fr-rashid-v1.db',
  bytes: 1_425_408,
  rows: 6236,
  digest: '142dedef190bb94180bbbba6f78f86d70077396732d9df130bf27505a3b4b37c',
};

const ON_DISK = [{ id: 'translation-fr-rashid', version: 1, bytes: 1_425_408 }];

const LOCAL = {
  'translation-fr-rashid': {
    version: 1,
    bytes: 1_425_408,
    language: 'fr',
    title: 'Le Noble Coran — Rachid Maach',
    languageName: 'Français',
    type: 'translation',
    source: 'QuranEnc',
    sourceVersion: '1.0.3',
    attribution: 'Traduction française : Rachid Maach. Source : QuranEnc.com (v1.0.3).',
    preview: 'Au nom d’Allah, le Tout Miséricordieux, le Très Miséricordieux[1].',
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockReadable.value = true;
  mockAnyInstallRunning.mockReturnValue(false);
  mockInstalledPackBytes.mockReturnValue(0);
  mockListInstalledPacks.mockReturnValue([]);
  mockFetchCatalogue.mockResolvedValue([OFFERED]);
  mockInstallPack.mockResolvedValue({ ok: true });
  usePackStore.setState({ entries: {} });
});

describe('the shelf, driven', () => {
  it('offers the catalogue’s pack when nothing is installed', async () => {
    const { result } = renderHook(() => usePacks());

    await waitFor(() => expect(result.current.catalogue).toBe('ready'));
    expect(result.current.rows).toHaveLength(1);
    expect(result.current.rows[0].status).toBe('available');
    expect(result.current.disk).toBe('ready');
  });

  it('flips the row to installed WITH A PREVIEW after a successful install', async () => {
    const { result } = renderHook(() => usePacks());
    await waitFor(() => expect(result.current.rows).toHaveLength(1));

    // The install lands, and the disk now has it — which is what `refresh()` must go back and read.
    mockInstallPack.mockImplementation(() => {
      mockListInstalledPacks.mockReturnValue(ON_DISK);
      mockInstalledPackBytes.mockReturnValue(1_425_408);
      return Promise.resolve({ ok: true });
    });

    await act(async () => {
      result.current.install(OFFERED);
    });

    await waitFor(() => expect(result.current.rows[0].status).toBe('installed'));
    // ⚠️ THE HEADLINE PROMISE: readable WITHOUT A RESTART. The preview is a row read out of the
    // file that has just been installed, so its presence is the proof.
    expect(result.current.rows[0].preview).toBe('Au nom d’Allah…');
    expect(result.current.rows[0].attribution).toContain('v1.0.3');
    expect(result.current.installedBytes).toBe(1_425_408);
    expect(mockOpenPack).toHaveBeenCalledWith('translation-fr-rashid', 1);
  });

  it('turns a typed failure into an error row carrying the reason', async () => {
    mockInstallPack.mockResolvedValue({ ok: false, reason: 'rows' });
    const { result } = renderHook(() => usePacks());
    await waitFor(() => expect(result.current.rows).toHaveLength(1));

    await act(async () => {
      result.current.install(OFFERED);
    });

    await waitFor(() => expect(result.current.rows[0].status).toBe('error'));
    expect(result.current.rows[0].failure).toBe('rows');
  });

  it('turns a REJECTION into an error row rather than an unhandled promise', async () => {
    // ⚠️ `installPack` resolves with a reason — except when it throws before its own `try`. That
    // left the row pinned at "Installing… 0%" with no control that could clear it.
    // (Story 8-2 review, S1.)
    mockInstallPack.mockRejectedValue(new Error('EACCES'));
    const { result } = renderHook(() => usePacks());
    await waitFor(() => expect(result.current.rows).toHaveLength(1));

    await act(async () => {
      result.current.install(OFFERED);
    });

    await waitFor(() => expect(result.current.rows[0].status).toBe('error'));
    expect(result.current.rows[0].failure).toBe('failed');
  });

  it('clears the row on a cancel rather than showing a failure', async () => {
    mockInstallPack.mockResolvedValue({ ok: false, reason: 'cancelled' });
    const { result } = renderHook(() => usePacks());
    await waitFor(() => expect(result.current.rows).toHaveLength(1));

    await act(async () => {
      result.current.install(OFFERED);
    });

    await waitFor(() => expect(result.current.rows[0].status).toBe('available'));
    expect(result.current.rows[0].failure).toBeUndefined();
  });

  it('refuses a second install while one is running', async () => {
    // ⚠️ The docblock promised one at a time and nothing enforced it.
    // (Story 8-2 review, S7.)
    mockAnyInstallRunning.mockReturnValue(true);
    const { result } = renderHook(() => usePacks());
    await waitFor(() => expect(result.current.rows).toHaveLength(1));

    await act(async () => {
      result.current.install(OFFERED);
    });

    expect(mockInstallPack).not.toHaveBeenCalled();
  });

  it('removes a pack and goes back to offering it', async () => {
    mockListInstalledPacks.mockReturnValue(ON_DISK);
    const { result } = renderHook(() => usePacks());
    await waitFor(() => expect(result.current.rows[0].status).toBe('installed'));

    mockListInstalledPacks.mockReturnValue([]);
    await act(async () => {
      result.current.remove('translation-fr-rashid', 1);
    });

    await waitFor(() => expect(result.current.rows[0].status).toBe('available'));
    expect(mockDeleteInstalled).toHaveBeenCalledWith('translation-fr-rashid', 1);
  });

  it('sweeps stale `.part` residue on every arrival', async () => {
    renderHook(() => usePacks());
    await waitFor(() => expect(mockSweep).toHaveBeenCalled());
  });

  it('keeps the shelf when the catalogue cannot be read', async () => {
    mockListInstalledPacks.mockReturnValue(ON_DISK);
    mockFetchCatalogue.mockResolvedValue(null);
    const { result } = renderHook(() => usePacks());

    await waitFor(() => expect(result.current.catalogue).toBe('unavailable'));
    expect(result.current.rows).toHaveLength(1);
    expect(result.current.rows[0].status).toBe('installed');
    expect(result.current.rows[0].offered).toBeNull();
  });

  it('never claims "not installed" when the DISK could not be listed', async () => {
    // ⚠️ THE C2 CASE, END TO END. `null` is "could not say"; rendering it as "Install" is the
    // believable-wrong-value the whole convention exists to prevent — and pressing Install then
    // answers `{ok: true}` with nothing visibly changing.
    mockListInstalledPacks.mockReturnValue(null);
    const { result } = renderHook(() => usePacks());

    await waitFor(() => expect(result.current.catalogue).toBe('ready'));
    expect(result.current.disk).toBe('unavailable');
    expect(result.current.rows[0].status).toBe('unknown');
    expect(result.current.installedBytes).toBe(0);
  });

  it('files a pack whose handle never registered as broken-but-present, not as absent', async () => {
    // The delete-races-hydration guard in `openPack` resolves without registering a handle.
    mockListInstalledPacks.mockReturnValue(ON_DISK);
    mockReadable.value = false;
    const { result } = renderHook(() => usePacks());

    await waitFor(() => expect(result.current.disk).toBe('ready'));
    // Nothing could be read from it, so it contributes no local facts — and the catalogue's own
    // row is what the reader sees, rather than a crash or a half-populated row.
    expect(result.current.rows[0].preview).toBeNull();
  });
});

describe('what the shelf shows', () => {
  it('offers a pack that is not installed', () => {
    const [row] = buildRows([OFFERED], {}, {});
    expect(row.status).toBe('available');
    expect(row.installedVersion).toBeNull();
    expect(row.bytes).toBe(1_425_408);
    expect(row.offered).toEqual(OFFERED);
  });

  it('marks an installed pack installed, and carries its own attribution', () => {
    const [row] = buildRows([OFFERED], LOCAL, {});
    expect(row.status).toBe('installed');
    expect(row.installedVersion).toBe(1);
    expect(row.attribution).toBe(
      'Traduction française : Rachid Maach. Source : QuranEnc.com (v1.0.3).'
    );
    expect(row.preview).toBe('Au nom d’Allah, le Tout Miséricordieux, le Très Miséricordieux[1].');
  });

  it('still lists an installed pack when the catalogue could not be read', () => {
    // ⚠️ THE OFFLINE ROW OF THE MATRIX. `null` catalogue, and the pack is still here, still
    // described, still removable — its facts come from the file's own `pack_meta`.
    const [row] = buildRows(null, LOCAL, {});
    expect(row.status).toBe('installed');
    expect(row.title).toBe('Le Noble Coran — Rachid Maach');
    expect(row.offered).toBeNull();
    expect(row.installedVersion).toBe(1);
  });

  it('marks every row `unknown` when the disk could not be listed', () => {
    const [row] = buildRows([OFFERED], null, {});
    expect(row.status).toBe('unknown');
  });

  it('surfaces a newer catalogue version as updatable', () => {
    const [row] = buildRows([{ ...OFFERED, packVersion: 2 }], LOCAL, {});
    expect(row.status).toBe('updatable');
    expect(row.installedVersion).toBe(1);
    expect(row.offered?.packVersion).toBe(2);
  });

  it('lets an install in flight outrank the disk join', () => {
    const [row] = buildRows(
      [OFFERED],
      {},
      { 'translation-fr-rashid': { status: 'installing', version: 1, progress: 0.42 } }
    );
    expect(row.status).toBe('installing');
    expect(row.progress).toBe(0.42);
  });

  it('carries a typed failure through to the row', () => {
    const [row] = buildRows(
      [OFFERED],
      {},
      { 'translation-fr-rashid': { status: 'error', version: 1, progress: 0, error: 'rows' } }
    );
    expect(row.status).toBe('error');
    expect(row.failure).toBe('rows');
  });

  it('shows nothing when nothing is offered and nothing is installed', () => {
    expect(buildRows([], {}, {})).toEqual([]);
  });
});

/**
 * `deferCatalogue` — the option enforcing story 8-3's frozen "opening the sheet touches no
 * network" constraint (8-3 review, V3).
 *
 * ⚠️ IT WAS ASSERTED AT THE CALL SITE AND VERIFIED NOWHERE. `StudySheet.test.tsx` checks that the
 * sheet PASSES `{ deferCatalogue: true }`; every case above calls `usePacks()` with no argument,
 * so the branch that reads it ran in no test at all. Both mutations below shipped green:
 *
 *   1. ignore the option → the shelf fetches on mount, so opening the sheet hits the network on
 *      every open, on every surface, for a reader who only wanted the pack they already have;
 *   2. drop the `&& revision === 0` → `refresh()` can never re-enter the fetch, so the sheet's
 *      "See what is available" becomes a control that does nothing for the rest of the session.
 */
describe('deferring the catalogue', () => {
  it('does NOT fetch on mount, and reports `idle` rather than loading or offline', async () => {
    const { result } = renderHook(() => usePacks({ deferCatalogue: true }));
    await waitFor(() => expect(result.current.disk).toBe('ready'));

    expect(mockFetchCatalogue).not.toHaveBeenCalled();
    // ⚠️ `idle` IS A THIRD ANSWER. `loading` would spin forever and `unavailable` would tell a
    // connected reader they are offline; the shelf simply has not been asked.
    expect(result.current.catalogue).toBe('idle');
  });

  it('fetches once `refresh()` asks — the reader pressing the offer IS the ask', async () => {
    const { result } = renderHook(() => usePacks({ deferCatalogue: true }));
    await waitFor(() => expect(result.current.disk).toBe('ready'));

    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.catalogue).toBe('ready'));
    expect(mockFetchCatalogue).toHaveBeenCalledTimes(1);
    expect(result.current.rows).toHaveLength(1);
  });

  it('is OFF by default — the content screen is a shelf and fetches eagerly', async () => {
    const { result } = renderHook(() => usePacks());
    await waitFor(() => expect(result.current.catalogue).toBe('ready'));
    expect(mockFetchCatalogue).toHaveBeenCalledTimes(1);
  });
});
