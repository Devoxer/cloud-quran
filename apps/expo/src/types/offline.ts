/**
 * Offline Storage Type Definitions
 *
 * Story 11.1: Create Offline Books Schema and Storage Helpers
 * Epic 11: Offline Access
 *
 * Types for managing offline book downloads and storage.
 */

import type { BlockRange } from '@cloudquran/shared';

/**
 * Voice-INDEPENDENT offline text (Story 22.12 split) — saved once per (book, section) at
 * `{OFFLINE_DIR}{bookId}/{sectionType}_{language}.json`. The section text is identical across
 * voices, so it is NOT keyed by voice (mirrors the online split: a stable text key + per-voice
 * blocks) — but Story 20.6 § D4 DID key it by LANGUAGE, because the text is the one artefact whose
 * name would otherwise collide outright between two languages. Read by the synced/read viewer on a
 * cold offline start.
 */
export interface OfflineText {
  /** Full text content for display */
  text: string;
  /** Timestamp when content was generated */
  generatedAt: number;
  /** Schema version for future migrations */
  version: number;
}

/**
 * PER-VOICE offline playback data (Story 22.12 split) — saved per (book, section, voiceId)
 * at `{OFFLINE_DIR}{bookId}/{sectionType}_{language}_{voiceId}.blocks.json`, alongside the
 * per-voice audio `{sectionType}_{language}_{voiceId}.{ext}` (Story 20.6 § D4 added the language
 * segment; a file written under one language must be UNRESOLVABLE under another, which is what
 * makes another language's downloads safe to leave on disk — Story 24.27). The block timings +
 * audio duration differ per voice
 * (each voice's narration has its own pacing/silences), so they're keyed by voice.
 */
export interface OfflineVoiceData {
  /** Block ranges for block-level highlight, for THIS voice (Story 22.9). */
  blocks: BlockRange[];
  /** Audio duration in milliseconds, for THIS voice. */
  durationMs: number;
  /** Schema version for future migrations */
  version: number;
}

/**
 * Per-book display metadata persisted at download time (Story 22.19 §A) as
 * `{OFFLINE_DIR}{bookId}/meta_{language}.json` (Story 20.6 § D4 — it carries the TRANSLATED title,
 * so it is per-language; the cover beside it stays language-neutral `cover.{ext}`). Display-only — the InstantDB `offlineBooks`
 * rows remain the source of truth for "what's downloaded" (used by the 30-book
 * limit); this record + the local cover image let the player chrome + lock screen
 * render fully on a cold offline start (no live `useQuery({books})` to resolve).
 * A missing/old meta is re-derived or re-downloaded — never migrated (no users /
 * template, STACK-CHEAT-SHEET § Don't).
 */
export interface OfflineBookMeta {
  /** Book display title. */
  title: string;
  /** Book author. */
  author: string;
  /** Basename of the on-disk cover (e.g. `cover.jpg`); the resolver re-derives the
   *  real on-disk file regardless, so this is informational. */
  coverFile?: string;
  /** The section types downloaded for this book (for the offline section list). */
  sectionTypes: string[];
  /** When the metadata was written (download time). */
  downloadedAt: number;
}

/**
 * The offline book metadata resolved for the player/engine (Story 22.19 §A) — the
 * persisted meta plus the local cover resolved to a `file://` URI. `null` when the
 * book isn't downloaded. Mirrors `resolveOfflineSource`'s local-only, offline-first
 * contract (no `useQuery`, no network).
 */
export interface ResolvedOfflineBookMeta {
  title: string;
  author: string;
  /** `file://…` local cover URI, or `undefined` when no cover was downloaded. */
  coverUri?: string;
  sectionTypes: string[];
}

/**
 * Offline book record matching InstantDB offlineBooks entity
 * Tracks what content has been downloaded for offline access
 */
export interface OfflineBookRecord {
  id: string;
  bookId: string;
  sectionType: string;
  /** Story 20.6 AC-13 — the language the downloaded file actually holds. Required: a download
   *  belongs to the language it was fetched in, several languages' rows can coexist (Story 24.27),
   *  and the library query is scoped by this field. */
  language: string;
  filePath: string;
  sizeBytes: number;
  downloadedAt: number;
  version: number;
}

/**
 * Download progress tracking for UI updates
 */
export interface DownloadProgress {
  /** Book being downloaded */
  bookId: string;
  /** Current section being downloaded */
  sectionType: string;
  /** Progress percentage (0-100) */
  progress: number;
  /** Bytes downloaded so far */
  bytesDownloaded: number;
  /** Total bytes to download */
  totalBytes: number;
  /** Current phase of download */
  phase: 'audio' | 'content' | 'complete' | 'error';
  /** Error message if phase is 'error' */
  error?: string;
}

/**
 * Section types that can be downloaded for offline access
 * Matches the sectionType values used in audioFiles entity
 */
export type OfflineSectionType =
  | 'summaryBrief'
  | 'summaryCore'
  | 'summaryInDepth'
  | 'aboutBook'
  | 'keyTakeaways'
  | 'notableQuotes'
  | 'faq';

/**
 * Current content schema version
 * Increment when OfflineContent structure changes
 */
export const OFFLINE_CONTENT_VERSION = 1;
