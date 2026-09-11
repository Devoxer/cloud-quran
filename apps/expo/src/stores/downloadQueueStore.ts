/**
 * downloadQueueStore — the live state of surah downloads, keyed `{reciterId}:{surah}`
 * (story 7-5, adopted from the inherited per-book queue).
 *
 * ⚠️ ADOPTED IN PLACE RATHER THAN REWRITTEN. This was the one piece of the inherited player with
 * no domain coupling at all — 97 lines of zustand queue mechanics importing nothing but zustand.
 * Its book-shaped types are retyped to `(reciterId, surah)` and its section-status slice is gone;
 * the mechanics, the module-level accessors and the per-key selector are unchanged, because a
 * rewrite would have produced the same file with a shorter history.
 *
 * ⚠️ THE DISK IS THE SOURCE OF TRUTH; THIS IS ITS MIRROR. `downloaded` here means "the runner or
 * a hydration saw the file", never "the app decided so" — `features/audio/lib/audioDownloads.ts`
 * owns every write to both. A store that outranked the filesystem would show a checkmark over a
 * file the OS had removed.
 *
 * The orchestration lives in that module rather than in a component hook, for the reason the
 * inherited version recorded: a download must survive the reader navigating away from the screen
 * that started it, which an `isMountedRef` bail inside a hook cannot do.
 *
 * In-memory only, no MMKV persist — same as `audioPlayerStore` and `alertStore`. Cross-restart
 * resume is explicitly out of scope: an app-killed queue is re-requested by the reader, not
 * silently revived on a launch they did not ask it for.
 */

import { create } from 'zustand';
import { useShallow } from 'zustand/shallow';

/**
 * What a row shows. There is no `idle`: an absent entry IS idle, which is why `resetEntry`
 * deletes rather than assigns — a cancel and a delete both have to leave the key looking exactly
 * like a surah nobody ever touched.
 */
export type SurahDownloadStatus = 'queued' | 'downloading' | 'downloaded' | 'error';

/** One surah's download slice. */
export interface DownloadEntry {
  status: SurahDownloadStatus;
  /** Fraction complete, 0–1. Meaningful only while `downloading`. */
  progress: number;
  /**
   * Why it failed, when it did — carried so a row can SAY something.
   *
   * ⚠️ WITHOUT IT A 404, A FULL DISK AND A DEAD SOCKET ARE ONE BARE GLYPH. The frozen matrix's
   * storage-full row asks for "a stated error on that row", which needs the reason to have
   * survived the catch that produced it. (Story 7-5 review, P5.)
   */
  error?: string;
}

/** The one spelling of a queue key — both halves of this feature agree by construction. */
export function downloadKey(reciterId: string, surah: number): string {
  return `${reciterId}:${surah}`;
}

interface DownloadQueueStore {
  /** `{reciterId}:{surah}` → its slice (absent = nothing kept, nothing pending). */
  entries: Record<string, DownloadEntry>;
  setEntry: (key: string, patch: Partial<DownloadEntry>) => void;
  resetEntry: (key: string) => void;
  hydrate: (reciterId: string, surahs: number[]) => void;
  clearReciter: (reciterId: string) => void;
}

/** The slice a key with no entry resolves to when a caller needs a shape rather than a null. */
const NEW_ENTRY: DownloadEntry = { status: 'queued', progress: 0 };

export const useDownloadQueueStore = create<DownloadQueueStore>((set) => ({
  entries: {},

  setEntry: (key, patch) =>
    set((s) => ({
      entries: { ...s.entries, [key]: { ...(s.entries[key] ?? NEW_ENTRY), ...patch } },
    })),

  resetEntry: (key) =>
    set((s) => {
      if (!s.entries[key]) return s;
      const next = { ...s.entries };
      delete next[key];
      return { entries: next };
    }),

  /**
   * Seed one reciter's `downloaded` rows from what is actually on disk.
   *
   * ⚠️ IT REMOVES STALE `downloaded` ROWS TOO, AND ONLY THOSE. A file can vanish behind the
   * store's back — a reader clearing app storage, a restore from a backup that did not carry it —
   * and a hydration that only ever ADDED would leave a checkmark over nothing until the app was
   * killed. Queued, downloading and error rows are left strictly alone: they describe work in
   * flight, which the disk has nothing to say about yet.
   */
  hydrate: (reciterId, surahs) =>
    set((s) => {
      const keep = new Set(surahs.map((surah) => downloadKey(reciterId, surah)));
      const prefix = `${reciterId}:`;
      const next = { ...s.entries };
      for (const [key, entry] of Object.entries(next)) {
        if (!key.startsWith(prefix)) continue;
        if (entry.status === 'downloaded' && !keep.has(key)) delete next[key];
      }
      for (const key of keep) {
        if (next[key] === undefined) next[key] = { status: 'downloaded', progress: 1 };
      }
      return { entries: next };
    }),

  clearReciter: (reciterId) =>
    set((s) => {
      const prefix = `${reciterId}:`;
      const next = { ...s.entries };
      for (const key of Object.keys(next)) if (key.startsWith(prefix)) delete next[key];
      return { entries: next };
    }),
}));

// ─── Non-React accessors, for the module-level runner (no component required) ─────────────────

/** This key's slice, or `null` when nothing is kept or pending for it. */
export function getDownloadEntry(key: string): DownloadEntry | null {
  return useDownloadQueueStore.getState().entries[key] ?? null;
}

/** Merge a patch into a key's slice, creating it if it is new. */
export function setDownloadEntry(key: string, patch: Partial<DownloadEntry>): void {
  useDownloadQueueStore.getState().setEntry(key, patch);
}

/** Drop a key's slice entirely — back to "not downloaded" (a cancel, or a delete). */
export function resetDownloadEntry(key: string): void {
  useDownloadQueueStore.getState().resetEntry(key);
}

/** Seed one reciter's downloaded rows from disk. */
export function hydrateReciterEntries(reciterId: string, surahs: number[]): void {
  useDownloadQueueStore.getState().hydrate(reciterId, surahs);
}

/** Drop every row belonging to one reciter (its downloads were all deleted). */
export function clearReciterEntries(reciterId: string): void {
  useDownloadQueueStore.getState().clearReciter(reciterId);
}

// ─── Selectors ────────────────────────────────────────────────────────────────────────────────

/**
 * One surah's slice, reactively. Per-key selection, so a queue advancing through 114 surahs
 * re-renders only the row it is on — the property the inherited version was extracted for.
 */
export function useDownloadEntry(reciterId: string, surah: number): DownloadEntry | null {
  return useDownloadQueueStore(useShallow((s) => s.entries[downloadKey(reciterId, surah)] ?? null));
}

/** What a reciter-level surface shows: how many surahs are kept, and how many are still moving. */
export interface ReciterDownloadSummary {
  downloaded: number;
  /** Queued or in flight — what a stop control exists for. */
  active: number;
  /** Settled as failed and waiting for a retry. Counted separately: it is neither. */
  failed: number;
}

export function useReciterDownloadSummary(reciterId: string): ReciterDownloadSummary {
  return useDownloadQueueStore(
    useShallow((s) => {
      const prefix = `${reciterId}:`;
      let downloaded = 0;
      let active = 0;
      let failed = 0;
      for (const [key, entry] of Object.entries(s.entries)) {
        if (!key.startsWith(prefix)) continue;
        if (entry.status === 'downloaded') downloaded++;
        else if (entry.status === 'error') failed++;
        else active++;
      }
      return { downloaded, active, failed };
    })
  );
}

/**
 * How many surahs are kept, across every reciter — the signal a disk-reading surface refreshes on.
 *
 * ⚠️ IT COUNTS `downloaded` ROWS, NOT ROWS. The picker's indicator first keyed on the total entry
 * count, which moves when a download is QUEUED (no file yet) and does NOT move when one COMPLETES
 * (a status change on a key that already existed) — so a reciter's first kept surah never lit its
 * indicator while the screen stayed mounted, and a queue lit it before a single byte had landed.
 * Wrong in both directions, and the docblock claimed the opposite. (Story 7-5 review, P12.)
 */
export function useDownloadedCount(): number {
  return useDownloadQueueStore((s) => {
    let downloaded = 0;
    for (const entry of Object.values(s.entries)) if (entry.status === 'downloaded') downloaded++;
    return downloaded;
  });
}
