/**
 * packStore — the live state of content packs, keyed by pack id (story 8-2).
 *
 * ⚠️ THE DISK IS THE SOURCE OF TRUTH; THIS IS ITS MIRROR. `installed` here means "a listing saw
 * the file", never "the app decided so" — `features/packs/lib/packStore.ts` owns every write to
 * both, and it is the module that actually touches the filesystem. A store that outranked the
 * filesystem would show a pack as installed over a file the OS had removed.
 * `downloadQueueStore.ts` is the precedent and carries the same warning for the same reason.
 *
 * ⚠️ IT LIVES IN `stores/` RATHER THAN IN THE FEATURE BECAUSE `lint:layers` RULE 5 MAKES THAT THE
 * ONLY PLACE A SHARED READER COULD REACH IT. A shared-layer file may never import
 * `@/features/{x}`, so a store inside the feature is invisible to anything outside it — which is
 * exactly the shape `audioPlayerStore` was moved out of the player feature for.
 *
 * In-memory only, no MMKV persist. What is installed is a question with a real answer on disk,
 * asked once per arrival at the content screen; caching that answer across restarts would be a
 * second source of truth with no way to be right.
 */

import { useMemo } from 'react';
import { create } from 'zustand';

/**
 * What a row shows. There is no `notInstalled`: an ABSENT entry is that state, which is why
 * `resetEntry` deletes rather than assigns — a cancelled install and a deleted pack both have to
 * leave the key looking exactly like a pack nobody ever touched.
 */
export type PackStatus = 'installing' | 'installed' | 'error';

/** One pack's slice. */
export interface PackEntryState {
  status: PackStatus;
  /** The version installed, or the version being installed. */
  version: number;
  /** Fraction complete, 0–1. Meaningful only while `installing`. */
  progress: number;
  /** Bytes on disk once installed; bytes landed so far while installing. */
  bytes?: number;
  /**
   * Why it failed, when it did — carried so a row can SAY something.
   *
   * ⚠️ WITHOUT IT, A CORRUPT DOWNLOAD, A TRUNCATED BUILD AND NO NETWORK ARE ONE BARE GLYPH. The
   * frozen matrix asks for a TYPED failure with a retry on three separate rows, which needs the
   * reason to have survived the call that produced it.
   */
  error?: string;
}

interface PackStoreState {
  /** pack id → its slice (absent = not installed, nothing in flight). */
  entries: Record<string, PackEntryState>;
  setEntry: (id: string, patch: Partial<PackEntryState> & { version: number }) => void;
  resetEntry: (id: string) => void;
  hydrate: (installed: { id: string; version: number; bytes: number }[]) => void;
}

/** The slice a key with no entry resolves to when a caller needs a shape rather than a null. */
const NEW_ENTRY: PackEntryState = { status: 'installing', version: 0, progress: 0 };

export const usePackStore = create<PackStoreState>((set) => ({
  entries: {},

  setEntry: (id, patch) =>
    set((s) => ({
      entries: {
        ...s.entries,
        // `NEW_ENTRY` is the shape a key with no entry resolves to; an existing slice and then the
        // patch both override it, so a progress tick never resets the status it is reporting on.
        [id]: { ...NEW_ENTRY, ...s.entries[id], ...patch },
      },
    })),

  resetEntry: (id) =>
    set((s) => {
      if (!s.entries[id]) return s;
      const next = { ...s.entries };
      delete next[id];
      return { entries: next };
    }),

  /**
   * Seed from what is actually on disk.
   *
   * ⚠️ IT REMOVES STALE `installed` ROWS TOO, AND ONLY THOSE. A file can vanish behind the store's
   * back — a reader clearing app storage, a restore that did not carry it — and a hydration that
   * only ever ADDED would keep claiming the pack was there until the app was killed. An
   * `installing` or `error` row is left strictly alone: it describes work the disk has nothing to
   * say about yet.
   */
  hydrate: (installed) =>
    set((s) => {
      const next = { ...s.entries };
      const keep = new Set(installed.map((pack) => pack.id));
      for (const [id, entry] of Object.entries(next)) {
        if (entry.status === 'installed' && !keep.has(id)) delete next[id];
      }
      for (const pack of installed) {
        const existing = next[pack.id];
        if (existing && existing.status === 'installing') continue;
        next[pack.id] = {
          status: 'installed',
          version: pack.version,
          progress: 1,
          bytes: pack.bytes,
        };
      }
      return { entries: next };
    }),
}));

// ─── Non-React accessors, for the module-level installer ──────────────────────────────────────

/** This pack's slice, or `null` when nothing is installed or in flight for it. */
export function getPackEntry(id: string): PackEntryState | null {
  return usePackStore.getState().entries[id] ?? null;
}

/** Merge a patch into a pack's slice, creating it if it is new. */
export function setPackEntry(
  id: string,
  patch: Partial<PackEntryState> & { version: number }
): void {
  usePackStore.getState().setEntry(id, patch);
}

/** Drop a pack's slice entirely — back to "not installed" (a cancel, or a delete). */
export function resetPackEntry(id: string): void {
  usePackStore.getState().resetEntry(id);
}

/** Seed every installed pack from disk. */
export function hydratePackEntries(
  installed: { id: string; version: number; bytes: number }[]
): void {
  usePackStore.getState().hydrate(installed);
}

// ─── Selectors ──────────────────────────────────────────────────────────────────────────────

/** What the shelf's STRUCTURE needs of one slice — everything but the moving progress figure. */
export interface PackStatusSlice {
  status: PackStatus;
  version: number;
  error?: string;
}

/**
 * Every slice WITHOUT its progress — the shelf's structure, which a progress tick does not move.
 *
 * ⚠️ THE SHELF USED TO READ `entries` WHOLE, AND THAT WAS WRITTEN DOWN AS A SCALE ASSUMPTION (story
 * 8-4). The note here said "a handful of rows rather than 114, so per-key selection buys
 * nothing" — true for one French pack, and false for a shelf of 75 editions, where every progress
 * tick of one install rebuilt every row and re-rendered the whole virtualized list. The selector
 * answers a STRING signature, which Zustand compares with `Object.is`: a tick changes only a
 * `progress`, which the signature does not contain, so nothing subscribed here re-renders. The
 * progress itself is read per KEY by the one row that shows it, through {@link usePackProgress}.
 */
export function usePackStatuses(): Readonly<Record<string, PackStatusSlice>> {
  const signature = usePackStore((state) =>
    JSON.stringify(
      Object.entries(state.entries)
        .map(([id, entry]) => [id, entry.status, entry.version, entry.error ?? null] as const)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    )
  );
  return useMemo(() => {
    const parsed = JSON.parse(signature) as [string, PackStatus, number, string | null][];
    return Object.fromEntries(
      parsed.map(([id, status, version, error]) => [
        id,
        error === null ? { status, version } : { status, version, error },
      ])
    );
  }, [signature]);
}

/**
 * One pack's transfer progress, 0–1 — PER KEY, so a tick re-renders the one row drawing it and
 * nothing else. `0` for a pack with no slice.
 */
export function usePackProgress(id: string): number {
  return usePackStore((state) => state.entries[id]?.progress ?? 0);
}

/**
 * ⚠️ `useAnyPackInstalling` LOOKED LOAD-BEARING AND WAS NOT, AND IT STAYS DELETED. It reads like
 * the "one install at a time" guard the hook's docblock promises, and a store cannot answer that
 * question: the store is a MIRROR, and only `features/packs/lib/packStore.ts`'s `inFlight` knows
 * whether a native transfer is running. A selector answering it from the mirror would be
 * confidently wrong between the press and the first progress tick — which is exactly the window
 * a double-press lands in. The real guard is `anyInstallRunning()`, in the module that owns the
 * disk. (Story 8-2 review, S7.)
 */
