/**
 * downloadQueueStore — global per-book download state (Story 22.19 §B).
 *
 * The download orchestration was lifted out of `useDownloadBook` (a component hook whose
 * `isMountedRef` bail aborted a download the moment the user left the book detail page).
 * It now lives in a module-level runner (`features/library/lib/downloadRunner.ts`) that
 * writes per-book progress HERE, and `useDownloadBook` is a thin OBSERVER that reads this
 * store. A download therefore survives in-app navigation (the reported bug) and any screen
 * re-mounting mid-download shows the live progress, not a reset.
 *
 * In-memory only (no MMKV persist) — same as the other global stores (`audioPlayerStore`,
 * `entitlementStore`, `alertStore`). Cross-restart auto-resume is explicitly OUT of scope
 * (an app-killed download is re-startable by the user, not silently resumed).
 */

import { create } from 'zustand';
import { useShallow } from 'zustand/shallow';

/** Download state machine (retained field-for-field from the old `useDownloadBook`). */
export type DownloadState = 'idle' | 'querying' | 'downloading' | 'saving' | 'complete' | 'error';

/** Per-section status for the detail screen's per-section progress UI. */
export interface SectionDownloadStatus {
  sectionType: string;
  status: 'pending' | 'downloading' | 'complete' | 'error';
  progress: number;
  error?: string;
}

/** A single book's download slice. */
export interface DownloadEntry {
  downloadState: DownloadState;
  /** Overall progress 0-100. */
  progress: number;
  /** User-facing error message, or null. */
  error: string | null;
  sectionStatuses: SectionDownloadStatus[];
}

/** The idle entry returned for a book with no active/finished download (stable ref). */
export const IDLE_DOWNLOAD_ENTRY: DownloadEntry = {
  downloadState: 'idle',
  progress: 0,
  error: null,
  sectionStatuses: [],
};

interface DownloadQueueStore {
  /** bookId → its download slice (absent = idle). */
  entries: Record<string, DownloadEntry>;
  setEntry: (bookId: string, patch: Partial<DownloadEntry>) => void;
  resetEntry: (bookId: string) => void;
}

export const useDownloadQueueStore = create<DownloadQueueStore>((set) => ({
  entries: {},
  setEntry: (bookId, patch) =>
    set((s) => ({
      entries: {
        ...s.entries,
        [bookId]: { ...(s.entries[bookId] ?? IDLE_DOWNLOAD_ENTRY), ...patch },
      },
    })),
  resetEntry: (bookId) =>
    set((s) => {
      if (!s.entries[bookId]) return s;
      const next = { ...s.entries };
      delete next[bookId];
      return { entries: next };
    }),
}));

// ─── Non-React accessors for the module-level runner (no component required) ───

/** Read a book's current download slice (or the idle entry). */
export function getDownloadEntry(bookId: string): DownloadEntry {
  return useDownloadQueueStore.getState().entries[bookId] ?? IDLE_DOWNLOAD_ENTRY;
}

/** Merge a patch into a book's download slice. */
export function setDownloadEntry(bookId: string, patch: Partial<DownloadEntry>): void {
  useDownloadQueueStore.getState().setEntry(bookId, patch);
}

/** Drop a book's slice entirely (back to idle — used on cancel). */
export function resetDownloadEntry(bookId: string): void {
  useDownloadQueueStore.getState().resetEntry(bookId);
}

/**
 * useDownloadEntry — reactive selector for a single book's slice. Re-renders only when
 * THAT book's slice changes (per-key selection), so an unrelated book's progress never
 * re-renders this consumer.
 */
export function useDownloadEntry(bookId: string): DownloadEntry {
  return useDownloadQueueStore(useShallow((s) => s.entries[bookId] ?? IDLE_DOWNLOAD_ENTRY));
}
