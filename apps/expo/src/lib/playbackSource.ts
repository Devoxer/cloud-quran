/**
 * Playback-source resolution (Story 22.3).
 *
 * Single place every online-playback site resolves audio + highlight blocks, so the
 * "offline-first, else resolve remotely" rule lives once. A downloaded section MUST play from
 * local disk with ZERO network (offline cold-start — arch §4.5 / Story-19 boundary).
 *
 * Callers (usePlaySection + the engine's playQueueItem / prefetch / section-nav) do:
 *   const offline = await resolveOfflineSource(bookId, sectionType, language, voiceId);
 *   if (offline) → play local (pass offline as the OfflineSource), return — no network.
 *   else → resolveOnlineSource: content rows → edge URLs → load the voice-independent text
 *          (loadSectionText) + per-voice blocks (loadSectionBlocks).
 *
 * ⚠️ story 5-2 removed the LICENCE AXIS entirely. `resolveOfflineSource` used to return a third
 * value — the `OFFLINE_LOCKED` sentinel — for a downloaded PREMIUM section whose offline licence
 * had expired, so the engine could prompt "Reconnect to keep listening". Cloud Quran is free and
 * waqf-funded: there is no premium section, no licence and nothing to expire, so a downloaded
 * section either resolves or is simply not downloaded. Two outcomes, not three.
 *
 * Story 20.6: BOTH resolvers take the language, defaulted from the one preference at RESOLUTION
 * time (exactly as they already did the voice). On the offline side that is what makes the
 * language-in-the-filename guard real — no offline path can serve another language's audio,
 * blocks, text or metadata.
 */

import type { OfflineSource } from '@/stores/audioPlayerStore';
import { loadSectionBlocks, loadSectionText } from './blockSidecar';
import { setCachedContent } from './contentCache';
import { getCachedSectionSource, resolveSectionSources } from './contentRead';
import { getLanguage } from './language';
import { findOfflineAudioPath, loadOfflineText, loadOfflineVoiceData } from './storage';
import { getVoicePreference } from './voicePreference';

/**
 * Resolve the local source for a downloaded section. Returns the `OfflineSource` when it is
 * downloaded and complete, `null` when it isn't (caller then resolves the online source).
 *
 * Reads ONLY local disk — safe on a cold offline start.
 */
export async function resolveOfflineSource(
  bookId: string,
  sectionType: string,
  language: string = getLanguage(),
  voiceId: string = getVoicePreference(language)
): Promise<OfflineSource | null> {
  // Story 22.12 + 20.6: resolve the SELECTED (language, voice)'s audio (.wav/.mp3); null → it
  // isn't downloaded → caller signs the online source (which respects the same preferences).
  // Another voice's OR another language's cached audio is NEVER served — the match is exact on
  // both axes (§ D4). Since Story 24.27 that exactness is what lets another language's downloads
  // sit on disk indefinitely: they are unresolvable from here, so they are harmless.
  const audioPath = await findOfflineAudioPath(bookId, sectionType, language, voiceId);
  if (!audioPath) {
    return null;
  }
  // Completeness self-heal: a half-written download (audio present, per-voice data missing)
  // must NOT play locally with empty blocks forever — return null so the caller signs the
  // online source and repairs on next download.
  const data = await loadOfflineVoiceData(bookId, sectionType, language, voiceId);
  if (!data) {
    return null;
  }
  // story 5-2: the Story-22.19 §C offline-licence gate sat here — a downloaded premium section
  // played from disk only while its persisted licence was still valid. Every section is free, so
  // a downloaded file always plays.
  // Story 22.4: cache the (voice-independent) section text so the player's synced/read
  // viewer renders it without a second fetch. This is the single funnel every play path
  // goes through, so the cache is populated for free. Keyed by the same language as the file.
  // The OFFLINE path is language-keyed by filename (20.6 § D4), so a downloaded file for this
  // language IS this language — never a Story 24.13 § D8 fallback, so the ordinary write applies.
  const text = await loadOfflineText(bookId, sectionType, language);
  if (text?.text !== undefined) setCachedContent(bookId, sectionType, language, text.text);
  return {
    audioUri: `file://${audioPath}`,
    blocks: data.blocks,
    durationMs: data.durationMs,
  };
}

/** Resolved online source: a public edge audio URL + highlight blocks from the sidecar. */
export interface OnlinePlaybackSource {
  audioUrl: string;
  blocks: import('@cloudquran/shared').BlockRange[];
}

/**
 * Resolve an ONLINE section in the listener's selected language + voice to its public edge sources:
 * ONE query yields the audio, the voice-independent TEXT url, and the PER-VOICE blocks url (with
 * the per-language voice→voice fallback and then the whole-section `en` language fallback — arch
 * §4.4); the text + blocks are fetched from their separate keys (the 22.12 split). Both preferences
 * default at RESOLUTION time so a change applies to the next play with no invalidation dance. The
 * section text is cached for the synced/read viewer (Story 22.4); the blocks are returned for
 * playback highlighting. Throws `AppError('AUDIO_NOT_AVAILABLE')` when the section cannot be
 * resolved in any voice or language.
 *
 * ⚠️ Story 20.6 put `language` BEFORE `voiceId` (matching `resolveOfflineSource`): the voice
 * default is now language-scoped (`getVoicePreference(language)`), which only type-checks if the
 * language parameter is declared first. Every call site passes them positionally.
 */
export async function resolveOnlineSource(
  bookId: string,
  sectionType: string,
  language: string = getLanguage(),
  voiceId: string = getVoicePreference(language)
): Promise<OnlinePlaybackSource> {
  // Story 32.6 AC-5: the book-open play-URL preload may have already resolved this section (one
  // query for the whole book) — consult that cache first to skip the per-tap round-trip. A cache
  // MISS (or a voice/language the preload didn't cover) falls through to the live resolve, which
  // ALSO owns the availability classification — so an ABSENT cache entry never strands the tap
  // (premise 4, graceful degrade). A cache HIT carries only edge URLs built from the immutable
  // opaque r2Key; the URLs can go stale only if the content is re-keyed by a mid-session
  // re-publish (rare, owner-gated) — the same bounded staleness a freshly-resolved URL already
  // has, and the session cache clears on cold start / account teardown.
  // The cache read is keyed on the LANGUAGE too (AC-6) — a warm entry from another language can
  // never be served here; it simply misses and falls through to the live resolve.
  const src =
    getCachedSectionSource(bookId, sectionType, voiceId, language) ??
    (await resolveSectionSources(bookId, sectionType, voiceId, language));
  // The OFFLINE fallback inside these two loaders is keyed by the REQUESTED language, not
  // `src.resolvedLanguage` — a download only ever exists in the language the user selected, so
  // asking for `en` files after an `en` fallback would look for files that cannot be there. Same
  // for the cache write below: the cache memoizes "what does a read in language X yield", exactly
  // like the play-sources cache's own key, so a subsequent read in X hits instead of re-resolving.
  const [content, blocks] = await Promise.all([
    loadSectionText(src.textUrl, bookId, sectionType, language),
    loadSectionBlocks(src.blocksUrl, bookId, sectionType, language, src.resolvedVoiceId),
  ]);
  // ⚠️ Story 24.13 § D8 — this is the ONE write site that already had the signal
  // (`resolveSectionSources` has always reported `resolvedLanguage`). It is fixed together with the
  // two text resolvers deliberately: a split fix would make the caching behaviour incoherent
  // between the play path and the read path for the same book.
  if (content !== undefined) {
    setCachedContent(bookId, sectionType, language, content, src.resolvedLanguage !== language);
  }
  return { audioUrl: src.audioUrl, blocks };
}
