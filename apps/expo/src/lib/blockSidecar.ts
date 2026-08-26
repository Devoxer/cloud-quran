/**
 * Content sidecar fetch (Story 22.9 blocks; co-located text as of 22.4; public-edge URLs
 * as of Story 32.5).
 *
 * The R2 sidecar holds `{ content, blocks }`: the section's `content` (text — the home of
 * record after the `summaries` entity drop) plus the per-displayed-block `{startMs,endMs}`
 * timings the player highlights from. Story 32.5: the URL is a PUBLIC edge URL built from
 * the RLS-gated `contentObjects` row's opaque `r2Key` (`lib/contentRead.ts` →
 * `contentUrl(r2Key)`) — permanent, no signing, no worker hop. This module is
 * URL-agnostic: it fetches whatever URL the resolver hands it.
 *
 * A failed/missing fetch degrades to the on-disk offline cache, then to empty — content
 * highlighting is a nicety, never a blocker for playback.
 */

import { type BlockRange, ContentSidecarSchema } from '@cloudquran/shared';
import { loadOfflineText, loadOfflineVoiceData } from './storage';

/** A section's loaded content + block timings. `content` is the raw stored value
 *  (`parseContent` infers its shape); `undefined` when nothing could be loaded. */
export interface LoadedContent {
  content: unknown;
  blocks: BlockRange[];
}

/**
 * Fetch + validate a section's `{ content, blocks }` from a sidecar URL. Returns
 * `null` on any failure (empty/undefined URL, network error, 404, malformed body).
 *
 * This is the NETWORK-ONLY fetch — the download paths use it to POPULATE the offline
 * cache, so it must NOT read from that cache (use `loadContent` for the read-with-fallback
 * resolver).
 */
export async function fetchContentFromUrl(
  url: string | null | undefined
): Promise<LoadedContent | null> {
  if (!url) return null;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const parsed = ContentSidecarSchema.safeParse(await res.json());
    if (!parsed.success) return null;
    return { content: parsed.data.content, blocks: parsed.data.blocks };
  } catch {
    return null;
  }
}

/**
 * Fetch ONLY a section's block ranges from a sidecar URL. Returns `[]` on any
 * failure. Thin wrapper over the content fetch (one object yields both).
 */
export async function fetchBlockSidecarFromUrl(
  url: string | null | undefined
): Promise<BlockRange[]> {
  const loaded = await fetchContentFromUrl(url);
  return loaded?.blocks ?? [];
}

/**
 * Resolve a section's voice-independent TEXT (Story 22.12 split): the STABLE
 * content sidecar URL first, then the on-disk offline cache. The text is the
 * same across voices, so it is NOT keyed by voice. Returns `undefined` when nothing loads.
 *
 * The offline fallback keeps the synced/read viewer working on a cold offline start (no
 * network, no R2): it reads back the text the download paths persisted. The download
 * paths fetch from the URL directly (they POPULATE the cache), so they must NOT
 * read from it.
 */
export async function loadSectionText(
  contentUrl: string | null,
  bookId: string,
  sectionType: string,
  language: string
): Promise<unknown> {
  const remote = await fetchContentFromUrl(contentUrl);
  if (remote && remote.content !== undefined) return remote.content;

  try {
    // Story 22.12: text is voice-INDEPENDENT offline, so no voiceId here. Story 20.6 AC-17: it is
    // NOT language-independent — reading the requested language ONLY is what stops this fallback
    // putting `en` text over non-`en` audio (the mixed-language section architecture-32 §4.4
    // forbids). A language with no offline text simply yields `undefined`, which is correct.
    const offline = await loadOfflineText(bookId, sectionType, language);
    if (offline?.text !== undefined) return offline.text;
  } catch {
    // ignore — fall through to undefined
  }
  return undefined;
}

/**
 * Resolve a section's PER-VOICE block timings for playback highlighting (Story 22.12
 * split): the per-voice blocks sidecar (`blocksUrl`) first, then the per-voice
 * on-disk offline cache. Returns `[]` when nothing loads (highlighting degrades to none —
 * never blocks playback).
 */
export async function loadSectionBlocks(
  blocksUrl: string | null,
  bookId: string,
  sectionType: string,
  language: string,
  voiceId: string
): Promise<BlockRange[]> {
  const remote = await fetchBlockSidecarFromUrl(blocksUrl);
  if (remote.length > 0) return remote;

  try {
    const offline = await loadOfflineVoiceData(bookId, sectionType, language, voiceId);
    if (offline?.blocks?.length) return offline.blocks;
  } catch {
    // ignore — fall through to empty
  }
  return [];
}
