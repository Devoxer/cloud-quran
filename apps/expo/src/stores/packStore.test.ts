/**
 * The pack MIRROR, and the one invariant that is observable on a device (story 8-2 review, V5).
 *
 * ⚠️ THIS WAS THE ONLY FILE IN `stores/` WITH NO TEST, AND `hydratePackEntries` WAS CALLED BY
 * NOTHING under test at all. Its documented rule — "an `installing` or `error` row is left
 * strictly alone" — is not decoration: hydration runs on every arrival at the content screen,
 * which can land in the middle of an update, and a hydration that overwrote the in-flight row
 * would draw "Update to the newer version" over a running transfer. Remove the `continue` and
 * nothing else in this repo reddens.
 *
 * The other half is the opposite direction: a hydration MUST drop an `installed` row whose file
 * has vanished behind the store's back — a reader clearing app storage, a restore that did not
 * carry it — or the shelf keeps claiming a pack that is not there until the app is killed.
 */

import {
  getPackEntry,
  hydratePackEntries,
  resetPackEntry,
  setPackEntry,
  usePackStore,
} from './packStore';

const ID = 'translation-fr-rashid';
const OTHER = 'tafsir-ar-saadi';

const onDisk = (id: string, version = 1, bytes = 1_425_408) => ({ id, version, bytes });

beforeEach(() => usePackStore.setState({ entries: {} }));

describe('the mirror', () => {
  it('starts empty — an ABSENT entry is "not installed", which is why reset deletes', () => {
    expect(getPackEntry(ID)).toBeNull();

    setPackEntry(ID, { status: 'installed', version: 1, progress: 1 });
    expect(getPackEntry(ID)?.status).toBe('installed');

    resetPackEntry(ID);
    // ⚠️ A LITERAL, not `toBeFalsy()`: a cancel and a delete both have to leave the key looking
    // exactly like a pack nobody ever touched, and `{ status: 'idle' }` is not that.
    expect(usePackStore.getState().entries).toEqual({});
  });

  it('merges a patch without resetting the status it is reporting on', () => {
    setPackEntry(ID, { status: 'installing', version: 1, progress: 0 });
    setPackEntry(ID, { version: 1, progress: 0.4, bytes: 500_000 });

    expect(getPackEntry(ID)).toEqual({
      status: 'installing',
      version: 1,
      progress: 0.4,
      bytes: 500_000,
    });
  });

  it('carries the failure reason, so a row can SAY which failure it was', () => {
    setPackEntry(ID, { status: 'error', version: 1, progress: 0, error: 'rows' });
    expect(getPackEntry(ID)?.error).toBe('rows');
  });
});

describe('hydrating from disk', () => {
  it('records what the listing found, with its size', () => {
    hydratePackEntries([onDisk(ID)]);

    expect(getPackEntry(ID)).toEqual({
      status: 'installed',
      version: 1,
      progress: 1,
      bytes: 1_425_408,
    });
  });

  it('LEAVES AN INSTALL IN FLIGHT ALONE — the invariant a device can see', () => {
    // ⚠️ Arriving at the content screen mid-update re-hydrates from a disk that still holds the
    // OLD version. Overwriting the in-flight row draws "Update to the newer version" over a
    // running transfer, and the reader presses it.
    setPackEntry(ID, { status: 'installing', version: 2, progress: 0.3 });

    hydratePackEntries([onDisk(ID, 1)]);

    expect(getPackEntry(ID)).toEqual({ status: 'installing', version: 2, progress: 0.3 });
  });

  it('drops an `installed` row whose file has vanished behind the store’s back', () => {
    hydratePackEntries([onDisk(ID), onDisk(OTHER)]);
    hydratePackEntries([onDisk(OTHER)]);

    expect(getPackEntry(ID)).toBeNull();
    expect(getPackEntry(OTHER)?.status).toBe('installed');
  });

  it('does NOT drop an error row, which describes work the disk knows nothing about', () => {
    setPackEntry(ID, { status: 'error', version: 1, progress: 0, error: 'offline' });

    hydratePackEntries([]);

    expect(getPackEntry(ID)).toEqual({
      status: 'error',
      version: 1,
      progress: 0,
      error: 'offline',
    });
  });

  it('is idempotent — hydrating the same listing twice changes nothing', () => {
    hydratePackEntries([onDisk(ID)]);
    const first = usePackStore.getState().entries;
    hydratePackEntries([onDisk(ID)]);

    expect(usePackStore.getState().entries).toEqual(first);
  });
});
