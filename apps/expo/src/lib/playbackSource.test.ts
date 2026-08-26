/**
 * Playback-source resolver tests (Story 22.3).
 *
 * resolveOfflineSource → local source when downloaded (reads ONLY storage; no network),
 * null otherwise. resolveOnlineSource → resolves content rows to edge URLs (mocked
 * resolveSectionSources) + loads text/blocks from them.
 *
 * ⚠️ story 5-2 deleted the LICENCE cases. Three tests here drove `isOfflinePremiumValid` to pin
 * the Story-22.19 §C gate: a downloaded PREMIUM section played from disk only while its offline
 * licence held, otherwise `resolveOfflineSource` returned the `OFFLINE_LOCKED` sentinel. Cloud
 * Quran is free — no premium section, no licence, and two outcomes instead of three. The case
 * below that asserts a downloaded section resolves regardless of its section type is what is
 * left of them, and it is the one that matters: nothing gates playback.
 */

const mockFindOfflineAudioPath = jest.fn();
const mockLoadOfflineText = jest.fn();
const mockLoadOfflineVoiceData = jest.fn();
jest.mock('./storage', () => ({
  findOfflineAudioPath: (...a: unknown[]) => mockFindOfflineAudioPath(...a),
  loadOfflineText: (...a: unknown[]) => mockLoadOfflineText(...a),
  loadOfflineVoiceData: (...a: unknown[]) => mockLoadOfflineVoiceData(...a),
}));

const mockResolveSectionSources = jest.fn();
const mockGetCachedSectionSource = jest.fn();
jest.mock('./contentRead', () => ({
  resolveSectionSources: (...a: unknown[]) => mockResolveSectionSources(...a),
  getCachedSectionSource: (...a: unknown[]) => mockGetCachedSectionSource(...a),
}));

const mockLoadSectionText = jest.fn();
const mockLoadSectionBlocks = jest.fn();
jest.mock('./blockSidecar', () => ({
  loadSectionText: (...a: unknown[]) => mockLoadSectionText(...a),
  loadSectionBlocks: (...a: unknown[]) => mockLoadSectionBlocks(...a),
}));

// Story 22.12: resolveOnlineSource reads the current voice preference (default param).
const mockGetVoicePreference = jest.fn(() => 'en_f');
jest.mock('./voicePreference', () => ({
  getVoicePreference: () => mockGetVoicePreference(),
}));

const mockSetCachedContent = jest.fn();
jest.mock('./contentCache', () => ({
  setCachedContent: (...a: unknown[]) => mockSetCachedContent(...a),
}));

import { resolveOfflineSource, resolveOnlineSource } from './playbackSource';

const BLOCKS = [{ startMs: 0, endMs: 100 }];

beforeEach(() => {
  jest.clearAllMocks();
  // Default: play-cache MISS → resolveOnlineSource falls through to the live resolve.
  mockGetCachedSectionSource.mockReturnValue(undefined);
});

describe('resolveOfflineSource', () => {
  it('returns the local source (file:// uri at the real extension + cached blocks + duration) when downloaded', async () => {
    // Real on-disk extension is .wav (Kokoro) — resolved by findOfflineAudioPath, not assumed .mp3.
    mockFindOfflineAudioPath.mockResolvedValue('/docs/offline/book-1/summaryBrief.wav');
    // Story 22.4/22.12: per-voice blocks+duration; the voice-independent text is cached.
    mockLoadOfflineVoiceData.mockResolvedValue({ blocks: BLOCKS, durationMs: 42000 });
    mockLoadOfflineText.mockResolvedValue({ text: 'hi' });

    const result = await resolveOfflineSource('book-1', 'summaryBrief');

    expect(result).toEqual({
      audioUri: 'file:///docs/offline/book-1/summaryBrief.wav',
      blocks: BLOCKS,
      durationMs: 42000,
    });
    // Story 22.12 + 20.6: resolves the SELECTED (language, voice)'s audio + per-voice data.
    expect(mockFindOfflineAudioPath).toHaveBeenCalledWith('book-1', 'summaryBrief', 'en', 'en_f');
    expect(mockLoadOfflineVoiceData).toHaveBeenCalledWith('book-1', 'summaryBrief', 'en', 'en_f');
    // Story 22.4: the offline section text is cached for the synced/read viewer.
    expect(mockSetCachedContent).toHaveBeenCalledWith('book-1', 'summaryBrief', 'en', 'hi');
    // Offline must NOT hit the online resolver.
    expect(mockResolveSectionSources).not.toHaveBeenCalled();
  });

  it('returns null when the section is not downloaded (no audio on disk)', async () => {
    mockFindOfflineAudioPath.mockResolvedValue(null);
    expect(await resolveOfflineSource('book-1', 'summaryBrief')).toBeNull();
    expect(mockLoadOfflineVoiceData).not.toHaveBeenCalled();
  });

  it('returns null for a half-written download (audio present, per-voice data missing) so the caller signs online to self-heal', async () => {
    mockFindOfflineAudioPath.mockResolvedValue('/docs/offline/book-1/summaryBrief.wav');
    mockLoadOfflineVoiceData.mockResolvedValue(null);

    expect(await resolveOfflineSource('book-1', 'summaryBrief')).toBeNull();
  });

  // story 5-2: three offline-LICENCE cases stood here (premium-valid, premium-expired →
  // OFFLINE_LOCKED, free-never-gated). The gate they drove is deleted; this is the property they
  // collectively asserted, now that it holds unconditionally.

  it('resolves a downloaded section whatever its type — nothing gates playback', async () => {
    mockFindOfflineAudioPath.mockResolvedValue('/docs/offline/book-1/summaryCore.wav');
    mockLoadOfflineVoiceData.mockResolvedValue({ blocks: BLOCKS, durationMs: 1000 });
    mockLoadOfflineText.mockResolvedValue({ text: 'x' });

    // `summaryCore` was the archetypal PREMIUM section under wisdom-fruits' tiering.
    expect(await resolveOfflineSource('book-1', 'summaryCore')).toEqual({
      audioUri: 'file:///docs/offline/book-1/summaryCore.wav',
      blocks: BLOCKS,
      durationMs: 1000,
    });
  });
});

describe('resolveOnlineSource', () => {
  it('resolves the current voice once, loads text + per-voice blocks, and caches the text', async () => {
    mockResolveSectionSources.mockResolvedValue({
      audioUrl: 'https://edge/audio-key',
      textUrl: 'https://edge/text-key',
      blocksUrl: 'https://edge/blocks-key',
      resolvedVoiceId: 'en_f',
      // Story 24.13 § D8 — the caller compares this to the REQUESTED language to decide the cache
      // tier, so a fixture omitting it would read as a language fallback.
      resolvedLanguage: 'en',
      audioExt: 'mp3',
      durationMs: 1234,
    });
    mockLoadSectionText.mockResolvedValue('the text');
    mockLoadSectionBlocks.mockResolvedValue(BLOCKS);

    const result = await resolveOnlineSource('book-1', 'summaryCore');

    expect(result).toEqual({ audioUrl: 'https://edge/audio-key', blocks: BLOCKS });
    // Resolves ONCE, passing the selected voice (Story 22.12 semantics preserved).
    expect(mockResolveSectionSources).toHaveBeenCalledTimes(1);
    expect(mockResolveSectionSources).toHaveBeenCalledWith('book-1', 'summaryCore', 'en_f', 'en');
    // Story 22.12 split: text from the text object, per-voice blocks from the blocks object.
    expect(mockLoadSectionText).toHaveBeenCalledWith(
      'https://edge/text-key',
      'book-1',
      'summaryCore',
      'en'
    );
    expect(mockLoadSectionBlocks).toHaveBeenCalledWith(
      'https://edge/blocks-key',
      'book-1',
      'summaryCore',
      'en',
      'en_f'
    );
    // The section text is cached for the player's synced/read viewer.
    // Story 24.13 § D8 — the 5th arg is `wasLanguageFallback`. `false` here: the section resolved
    // in the language that was requested, so the ordinary write applies.
    expect(mockSetCachedContent).toHaveBeenCalledWith(
      'book-1',
      'summaryCore',
      'en',
      'the text',
      false
    );
  });

  it('Story 32.6 AC-5: a play-cache HIT skips the DB round-trip (resolveSectionSources not called)', async () => {
    mockGetCachedSectionSource.mockReturnValue({
      audioUrl: 'https://edge/cached-audio',
      textUrl: 'https://edge/cached-text',
      blocksUrl: 'https://edge/cached-blocks',
      resolvedVoiceId: 'en_f',
      // Story 24.13 § D8 — the caller compares this to the REQUESTED language to decide the cache
      // tier, so a fixture omitting it would read as a language fallback.
      resolvedLanguage: 'en',
      audioExt: 'mp3',
      durationMs: 1000,
    });
    mockLoadSectionText.mockResolvedValue('cached-text-body');
    mockLoadSectionBlocks.mockResolvedValue(BLOCKS);

    const result = await resolveOnlineSource('book-1', 'summaryCore');

    expect(result).toEqual({ audioUrl: 'https://edge/cached-audio', blocks: BLOCKS });
    expect(mockGetCachedSectionSource).toHaveBeenCalledWith('book-1', 'summaryCore', 'en_f', 'en');
    expect(mockResolveSectionSources).not.toHaveBeenCalled(); // the round-trip was skipped
    expect(mockLoadSectionBlocks).toHaveBeenCalledWith(
      'https://edge/cached-blocks',
      'book-1',
      'summaryCore',
      'en',
      'en_f'
    );
  });

  it('Story 32.6 AC-5: a play-cache MISS falls through to the live resolve (graceful degrade)', async () => {
    mockGetCachedSectionSource.mockReturnValue(undefined); // miss
    mockResolveSectionSources.mockResolvedValue({
      audioUrl: 'https://edge/live-audio',
      textUrl: 'https://edge/live-text',
      blocksUrl: 'https://edge/live-blocks',
      resolvedVoiceId: 'en_f',
      // Story 24.13 § D8 — the caller compares this to the REQUESTED language to decide the cache
      // tier, so a fixture omitting it would read as a language fallback.
      resolvedLanguage: 'en',
      audioExt: 'mp3',
      durationMs: 0,
    });
    mockLoadSectionText.mockResolvedValue(undefined);
    mockLoadSectionBlocks.mockResolvedValue([]);

    const result = await resolveOnlineSource('book-1', 'summaryCore');
    expect(result.audioUrl).toBe('https://edge/live-audio');
    expect(mockResolveSectionSources).toHaveBeenCalledTimes(1);
  });

  it('resolves an explicitly passed voice (overriding the preference)', async () => {
    mockResolveSectionSources.mockResolvedValue({
      audioUrl: 'a',
      textUrl: 'c',
      blocksUrl: 'b',
      resolvedVoiceId: 'en_m',
      resolvedLanguage: 'en',
      audioExt: 'mp3',
      durationMs: 0,
    });
    mockLoadSectionText.mockResolvedValue(undefined);
    mockLoadSectionBlocks.mockResolvedValue([]);

    await resolveOnlineSource('book-1', 'summaryCore', 'en', 'en_m');
    expect(mockResolveSectionSources).toHaveBeenCalledWith('book-1', 'summaryCore', 'en_m', 'en');
  });

  it("loads blocks under the RESOLVED voice when the language's voice fallback kicked in (AC-8)", async () => {
    // Selected en_f missing → resolver fell back to en_m's triad WITHIN the language; the blocks
    // fetch + offline fallback must key on the voice the audio actually resolved to.
    mockResolveSectionSources.mockResolvedValue({
      audioUrl: 'https://edge/a2',
      textUrl: 'https://edge/t',
      blocksUrl: 'https://edge/b2',
      resolvedVoiceId: 'en_m',
      resolvedLanguage: 'en',
      audioExt: 'mp3',
      durationMs: 0,
    });
    mockLoadSectionText.mockResolvedValue(undefined);
    mockLoadSectionBlocks.mockResolvedValue(BLOCKS);

    await resolveOnlineSource('book-1', 'summaryCore', 'en', 'en_f');
    expect(mockLoadSectionBlocks).toHaveBeenCalledWith(
      'https://edge/b2',
      'book-1',
      'summaryCore',
      'en',
      'en_m'
    );
  });
});

/**
 * Story 24.13 § D8 — the play path already carried `resolvedLanguage`; this pins that it is
 * actually FORWARDED to the cache, which is the whole point of fixing all three write-site groups
 * together rather than only the two that needed a signature change.
 */
describe('Story 24.13 § D8 — a language FALLBACK is flagged to the cache', () => {
  it('passes wasLanguageFallback=true when the section resolved in a DIFFERENT language', async () => {
    mockResolveSectionSources.mockResolvedValue({
      audioUrl: 'https://edge/audio-key',
      textUrl: 'https://edge/text-key',
      blocksUrl: 'https://edge/blocks-key',
      resolvedVoiceId: 'en_f',
      resolvedLanguage: 'en', // ⚠️ the whole-section fallback fired
      audioExt: 'mp3',
      durationMs: 1234,
    });
    mockLoadSectionText.mockResolvedValue('ENGLISH TEXT');
    mockLoadSectionBlocks.mockResolvedValue(BLOCKS);

    await resolveOnlineSource('book-1', 'summaryBrief', 'fr');

    // Requested `fr`, resolved `en` → the free-tier PERMANENT write must be suppressed, or the
    // English text is served under the `fr` key forever, across cold starts.
    expect(mockSetCachedContent).toHaveBeenCalledWith(
      'book-1',
      'summaryBrief',
      'fr',
      'ENGLISH TEXT',
      true
    );
  });
});
