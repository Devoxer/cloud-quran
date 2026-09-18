/**
 * usePacks — the content shelf: what is offered, what is installed, and what is moving
 * (story 8-2).
 *
 * ⚠️ THE STORE MIRRORS DISK AND THIS HOOK IS WHAT MAKES IT DO SO. Every arrival at the content
 * screen lists the directory, sweeps `.part` residue, and hydrates `@/stores/packStore` from what
 * it found. A listing that could not be read hydrates NOTHING rather than hydrating emptiness —
 * `features/packs/lib/packStore.ts`'s `null`-is-not-`[]` rule, which exists because one transient
 * filesystem error otherwise reads as "you have nothing".
 *
 * ⚠️ AN INSTALLED PACK DESCRIBES ITSELF, SO THE SHELF WORKS OFFLINE. Each installed pack is
 * OPENED and its `pack_meta` read; the catalogue is only consulted for packs that are not
 * installed yet, and its absence degrades the screen to "installed only" rather than to an error.
 * Opening it is also the proof the frozen matrix asks for — a pack is readable the moment it is
 * installed, with no restart — which is why a one-line PREVIEW comes back with the metadata.
 *
 * ⚠️ ONE INSTALL AT A TIME. Two concurrent transfers into the same directory buy nothing on a
 * phone's link and make the stall watchdog meaningless; the frozen scope says one foreground
 * install is enough here.
 *
 * `lint:layers`: a feature hook — it may reach `@/lib`, `@/stores`, `@/constants` and its own
 * feature's `lib/`, and it must not import a route.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { PACKS_SUPPORTED } from '@/constants/packs';
import { captureException } from '@/lib/errors';
import { compareInAppLanguage } from '@/lib/format';
import { closePack, getPackMeta, getPackSurah, isPackReadable, openPack } from '@/lib/quranDb';
import {
  getPackEntry,
  hydratePackEntries,
  resetPackEntry,
  setPackEntry,
  usePackStore,
} from '@/stores/packStore';
import { type CataloguePack, fetchCatalogue } from '../lib/catalogue';
import {
  anyInstallRunning,
  cancelPackInstall,
  deleteInstalledPack,
  installPack,
  listInstalledPacks,
  type PackInstallFailure,
  installedPackBytes as readInstalledPackBytes,
  sweepStalePackParts,
} from '../lib/packStore';

/** Whether the catalogue could be read. `unavailable` is a STATE, never an error surface. */
export type CatalogueState = 'loading' | 'ready' | 'unavailable';

/**
 * Whether the DISK could be read. The `null`-is-not-`[]` rule, carried to the surface.
 *
 * ⚠️ IT EXISTS BECAUSE THE RULE WAS HONOURED IN THE STORE AND THEN DEFEATED AT THE SCREEN. On a
 * listing failure the disk effect returns early, the local facts stay empty, and a shelf built
 * from them renders every installed pack as "Install" — precisely the outcome
 * `listInstalledPacks`' `null` exists to prevent, and worse than the empty set it was protecting
 * against, because pressing Install then answers `{ok: true}` with nothing visibly changing.
 * "Could not say" has to survive all the way to the row. (Story 8-2 review, C2.)
 */
export type DiskState = 'loading' | 'ready' | 'unavailable';

/** What one row on the shelf knows about itself. */
export interface PackRow {
  id: string;
  title: string;
  /** BCP-47 code of the CONTENT — what decides the preview's writing direction, never the UI's. */
  language: string;
  /** The content language's own name — a French pack says "Français", not "French". */
  languageName: string;
  type: string;
  source: string;
  /** The upstream edition's version. The grant requires it to be stated; so we state it. */
  sourceVersion: string;
  /** Rendered beside the pack, never buried. Required by the grant. */
  attribution: string;
  /** The catalogue entry, when this pack is currently offered. `null` offline or if withdrawn. */
  offered: CataloguePack | null;
  installedVersion: number | null;
  /** Size on disk when installed; the catalogue's figure otherwise. */
  bytes: number;
  /** `unknown` is "the disk could not be listed" — not "not installed". See `DiskState`. */
  status: 'available' | 'installing' | 'installed' | 'updatable' | 'error' | 'unknown';
  /** 0–1 while installing. */
  progress: number;
  /**
   * Why the last attempt failed. Present only on `error`.
   *
   * ⚠️ `cancelled` IS EXCLUDED AT THE TYPE LEVEL, and that is what keeps the copy honest. A cancel
   * takes the `resetPackEntry` branch — the row goes back to looking like a pack nobody touched —
   * so a `failure.cancelled` sentence was four locales of copy no reader could ever see. Narrowing
   * the type means the screen's `content.failure.{reason}` lookup is total over the strings that
   * actually exist. (Story 8-2 review, S4.)
   */
  failure?: Exclude<PackInstallFailure, 'cancelled'>;
  /** The pack's first ayah, read from the installed file — the proof it is readable. */
  preview: string | null;
}

/** What an installed pack says about itself, read from its own `pack_meta`. */
interface LocalPackFacts {
  version: number;
  bytes: number;
  language: string;
  title: string;
  languageName: string;
  type: string;
  source: string;
  sourceVersion: string;
  attribution: string;
  preview: string | null;
}

export interface UsePacksResult {
  rows: PackRow[];
  catalogue: CatalogueState;
  /** Whether what is installed could be read at all. See `DiskState`. */
  disk: DiskState;
  /** Total bytes the installed packs occupy. `0` while the disk state is not `ready`. */
  installedBytes: number;
  install: (pack: CataloguePack) => void;
  cancel: (id: string) => void;
  remove: (id: string, version: number) => void;
  /** Re-read disk and re-fetch the catalogue — what the retry on an unavailable shelf calls. */
  refresh: () => void;
}

export function usePacks(): UsePacksResult {
  const entries = usePackStore((state) => state.entries);
  const [catalogue, setCatalogue] = useState<CataloguePack[] | null>(null);
  const [catalogueState, setCatalogueState] = useState<CatalogueState>('loading');
  /** `null` means the listing FAILED. `{}` means it succeeded and found nothing. */
  const [local, setLocal] = useState<Record<string, LocalPackFacts> | null>(null);
  const [diskState, setDiskState] = useState<DiskState>('loading');
  const [revision, setRevision] = useState(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // ── Disk: hydrate the mirror, then let every installed pack describe itself ──
  useEffect(() => {
    if (!PACKS_SUPPORTED) {
      setDiskState('unavailable');
      return;
    }
    sweepStalePackParts();
    const installed = listInstalledPacks();
    // `null` is "could not list", which is not "nothing installed". Leave the mirror alone AND
    // say so — a row built from absent facts would claim the pack is not installed.
    if (installed === null) {
      setLocal(null);
      setDiskState('unavailable');
      return;
    }
    hydratePackEntries(installed);

    let cancelled = false;
    void (async () => {
      const facts: Record<string, LocalPackFacts> = {};
      for (const pack of installed) {
        try {
          await openPack(pack.id, pack.version);
          /**
           * ⚠️ ASK WHETHER THE HANDLE ACTUALLY REGISTERED, RATHER THAN ASSUMING IT DID. `openPack`
           * resolves without registering when a delete landed while it was parked on its await —
           * the generation guard that stops a live connection being opened onto a file that is
           * being removed. Calling `getPackMeta` blind would then throw `PackNotOpenError` and
           * this pack would be filed as broken when nothing is wrong with it; it is simply gone.
           * (Story 8-2 review, C3 + S7.)
           */
          if (!isPackReadable(pack.id)) continue;
          const meta = await getPackMeta(pack.id);
          // One row of the pack's own content: the proof that it is readable, right now, with no
          // restart — which is the frozen matrix's headline acceptance criterion.
          const firstSurah = await getPackSurah(pack.id, 1);
          facts[pack.id] = {
            version: pack.version,
            bytes: pack.bytes,
            language: meta.language ?? '',
            title: meta.title ?? pack.id,
            languageName: meta.languageName ?? meta.language ?? '',
            type: meta.type ?? '',
            source: meta.source ?? '',
            sourceVersion: meta.sourceVersion ?? '',
            attribution: meta.attribution ?? '',
            preview: firstSurah[0]?.text ?? null,
          };
        } catch (error) {
          // An installed file that will not open is a broken pack, not a broken screen: it keeps
          // its row (so the reader can delete it) and simply has nothing to preview.
          captureException(error, { packId: pack.id });
          facts[pack.id] = {
            version: pack.version,
            bytes: pack.bytes,
            language: '',
            title: pack.id,
            languageName: '',
            type: '',
            source: '',
            sourceVersion: '',
            attribution: '',
            preview: null,
          };
        }
      }
      if (!cancelled && mounted.current) {
        setLocal(facts);
        setDiskState('ready');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [revision]);

  // ── Network: the catalogue, and nothing depends on it arriving ──
  useEffect(() => {
    if (!PACKS_SUPPORTED) {
      setCatalogueState('unavailable');
      return;
    }
    const controller = new AbortController();
    setCatalogueState('loading');
    void fetchCatalogue(controller.signal).then((packs) => {
      if (controller.signal.aborted || !mounted.current) return;
      setCatalogue(packs);
      setCatalogueState(packs === null ? 'unavailable' : 'ready');
    });
    return () => controller.abort();
  }, [revision]);

  const refresh = useCallback(() => setRevision((n) => n + 1), []);

  const install = useCallback(
    (pack: CataloguePack) => {
      // ⚠️ ONE INSTALL AT A TIME, ENFORCED RATHER THAN PROMISED. The docblock claimed this and
      // nothing checked it: two rows could both be transferring into the same directory, each
      // with its own stall watchdog, neither aware of the other. The disk module is the source of
      // truth for what is moving. (Story 8-2 review, S7.)
      if (anyInstallRunning()) return;
      setPackEntry(pack.id, { status: 'installing', version: pack.packVersion, progress: 0 });
      void installPack(pack, {
        onProgress: ({ fraction, bytesWritten }) => {
          // The row is only interested while it is still the one installing; a late tick from a
          // cancelled transfer must not resurrect a row the reader just dismissed.
          if (getPackEntry(pack.id)?.status !== 'installing') return;
          setPackEntry(pack.id, {
            version: pack.packVersion,
            progress: fraction,
            bytes: bytesWritten,
          });
        },
      })
        .then(async (result) => {
          if (!mounted.current) return;
          if (result.ok) {
            setPackEntry(pack.id, {
              status: 'installed',
              version: pack.packVersion,
              progress: 1,
              bytes: pack.bytes,
              error: undefined,
            });
            refresh();
            return;
          }
          if (result.reason === 'cancelled') {
            resetPackEntry(pack.id);
            return;
          }
          setPackEntry(pack.id, {
            status: 'error',
            version: pack.packVersion,
            progress: 0,
            error: result.reason,
          });
        })
        /**
         * ⚠️ `installPack` RESOLVES WITH A REASON — EXCEPT WHEN IT THROWS BEFORE ITS OWN `try`.
         * The directory build, the pre-flight checks and the abort wiring all run outside it, so a
         * rejection there escaped as an unhandled promise and left the row pinned at
         * "Installing… 0%" with no control that could clear it. Every path now ends in a row.
         * (Story 8-2 review, S1.)
         */
        .catch((error: unknown) => {
          captureException(error, { packId: pack.id });
          if (!mounted.current) return;
          setPackEntry(pack.id, {
            status: 'error',
            version: pack.packVersion,
            progress: 0,
            error: 'failed',
          });
        });
    },
    [refresh]
  );

  const cancel = useCallback((id: string) => {
    cancelPackInstall(id);
    resetPackEntry(id);
  }, []);

  const remove = useCallback(
    (id: string, version: number) => {
      void (async () => {
        await closePack(id);
        await deleteInstalledPack(id, version);
        resetPackEntry(id);
        if (mounted.current) {
          setLocal((current) => {
            if (current === null) return current;
            const next = { ...current };
            delete next[id];
            return next;
          });
          refresh();
        }
      })();
    },
    [refresh]
  );

  const rows = buildRows(catalogue, local, entries);
  /**
   * ⚠️ THE DISK'S OWN ANSWER, NOT A SUM OVER THE FACTS THIS HOOK HAPPENS TO HOLD. The two agree
   * today; they stop agreeing the moment a pack is on disk that this hook could not open, and the
   * number a reader reads about their storage should come from the thing that owns the storage.
   * `installedPackBytes` already sums only committed `{id}-v{n}.db` files — never a `.part`, never
   * the bundled Quran database. (Story 8-2 review, S7.)
   */
  const installedBytes = diskState === 'ready' ? readInstalledPackBytes() : 0;

  return {
    rows,
    catalogue: catalogueState,
    disk: diskState,
    installedBytes,
    install,
    cancel,
    remove,
    refresh,
  };
}

/**
 * Join the catalogue with what is on disk.
 *
 * ⚠️ AN INSTALLED PACK IS NEVER DROPPED FOR BEING ABSENT FROM THE CATALOGUE. Offline, the
 * catalogue is empty and every installed pack would vanish from the screen it is managed from —
 * and a withdrawn pack is exactly the one a reader needs a delete control for. This is
 * `useBookmarkRows`' rule: a row survives its join failing.
 */
export function buildRows(
  catalogue: CataloguePack[] | null,
  /** `null` is "the disk could not be listed" — see `DiskState`. */
  local: Record<string, LocalPackFacts> | null,
  entries: Record<string, { status: string; version: number; progress: number; error?: string }>
): PackRow[] {
  const byId = new Map<string, PackRow>();
  const diskUnknown = local === null;

  for (const facts of Object.entries(local ?? {})) {
    const [id, pack] = facts;
    byId.set(id, {
      id,
      title: pack.title,
      language: pack.language,
      languageName: pack.languageName,
      type: pack.type,
      source: pack.source,
      sourceVersion: pack.sourceVersion,
      attribution: pack.attribution,
      offered: null,
      installedVersion: pack.version,
      bytes: pack.bytes,
      status: 'installed',
      progress: 1,
      preview: pack.preview,
    });
  }

  for (const offered of catalogue ?? []) {
    const existing = byId.get(offered.id);
    byId.set(offered.id, {
      id: offered.id,
      // The catalogue's title wins when the pack is not installed; an installed pack's own
      // metadata wins when it is, because that is what the reader actually has.
      title: existing?.title ?? offered.title,
      language: existing?.language || offered.language,
      languageName: existing?.languageName || offered.languageName,
      type: existing?.type || offered.type,
      source: existing?.source || offered.source,
      sourceVersion: existing?.sourceVersion || offered.sourceVersion,
      attribution: existing?.attribution || offered.attribution,
      offered,
      installedVersion: existing?.installedVersion ?? null,
      bytes: existing?.bytes ?? offered.bytes,
      // ⚠️ `unknown` RATHER THAN `available` WHEN THE DISK COULD NOT BE LISTED. Offering "Install"
      // over a pack that may well be installed is the believable-wrong-value defect this whole
      // `null` convention exists to prevent. (Story 8-2 review, C2.)
      status: diskUnknown
        ? 'unknown'
        : existing == null
          ? 'available'
          : existing.installedVersion !== null && existing.installedVersion < offered.packVersion
            ? 'updatable'
            : 'installed',
      progress: existing?.progress ?? 0,
      preview: existing?.preview ?? null,
    });
  }

  // The store outranks the join for the two states the DISK cannot describe: an install in
  // flight has no file yet, and a failure has no file at all.
  for (const [id, entry] of Object.entries(entries)) {
    const row = byId.get(id);
    if (!row) continue;
    if (entry.status === 'installing') {
      byId.set(id, { ...row, status: 'installing', progress: entry.progress });
    } else if (entry.status === 'error') {
      byId.set(id, {
        ...row,
        status: 'error',
        progress: 0,
        failure: entry.error as Exclude<PackInstallFailure, 'cancelled'> | undefined,
      });
    }
  }

  // Titles are copy, so they collate in the reader's language — through `lib/format.ts`, the one
  // module `lint:i18n` allows a locale-sensitive comparator to live in.
  return [...byId.values()].sort((a, b) => compareInAppLanguage(a.title, b.title));
}
