/**
 * Tests for contentRead — voice/language resolution, the absent-content contract, and the
 * session play-sources cache.
 *
 * ⚠️ Story 5-2 changed what this suite CAN cover, and the change is worth stating plainly.
 * Before it, every case fed rows in by mocking `queryOnce` from `lib/dbHooks`, and a second
 * group asserted the premium classifier (`PREMIUM_REQUIRED`, the entitlement mirror, the
 * debounced recheck). Both are gone: `dbHooks` and `entitlementMirror` were deleted with
 * InstantDB and RevenueCat, and `contentRead`'s row source is now a documented empty seam that
 * story 5-4 fills against the worker's data API.
 *
 * So the row-fed cases were not "fixed" — they were removed, because there is no longer a seam
 * to feed. What survives is everything that never needed a database:
 *   • `buildSectionSources` — the voice-fallback rules, exercised by passing rows DIRECTLY,
 *     which is strictly better than routing them through a query mock
 *   • `resolveContentLanguage` — pure
 *   • the absent-content contract every caller already handled
 *   • the session cache
 *
 * **Story 5-4 must restore row-level coverage** of `resolveSectionSources`, `resolveBookTextUrls`
 * and `resolveBookPlaySources` when it gives `queryContentObjectRows` a real implementation.
 * Until then those paths are exercised only at their empty-seam boundary — do not read this
 * suite's green as proof that row resolution works end to end.
 */

import {
  buildSectionSources,
  clearPlaySourcesCache,
  getCachedSectionSource,
  invalidateBookPlaySources,
  resolveBookPlaySources,
  resolveContentLanguage,
  resolveSectionSources,
  warmBookPlaySources,
} from './contentRead';
import { AppError } from './errors';

/** Build a contentObjects row. */
function row(
  kind: string,
  r2Key: string,
  voiceId?: string,
  extra?: Record<string, unknown>
): Parameters<typeof buildSectionSources>[0][number] {
  return { kind, r2Key, voiceId, ext: 'mp3', ...extra };
}

/** A complete triad for one voice: text is voice-independent, audio + blocks are per-voice. */
function triad(voiceId: string, durationMs = 1000) {
  return [
    row('text', `t/${voiceId}.json`),
    row('audio', `a/${voiceId}.mp3`, voiceId, { durationMs }),
    row('blocks', `b/${voiceId}.json`, voiceId),
  ];
}

beforeEach(() => {
  clearPlaySourcesCache();
});

describe('buildSectionSources — the voice fallback rules (AC-8)', () => {
  it('resolves the selected voice triad, carrying ext and duration through', () => {
    const sources = buildSectionSources(triad('en_f', 4242), 'en_f', 'en');

    expect(sources).not.toBeNull();
    expect(sources?.resolvedVoiceId).toBe('en_f');
    expect(sources?.resolvedLanguage).toBe('en');
    expect(sources?.audioExt).toBe('mp3');
    expect(sources?.durationMs).toBe(4242);
    expect(sources?.audioUrl).toContain('a/en_f.mp3');
    expect(sources?.textUrl).toContain('t/en_f.json');
    expect(sources?.blocksUrl).toContain('b/en_f.json');
  });

  it('falls back to ANOTHER voice of the same language when the selected one is incomplete', () => {
    // Selected voice has audio but no blocks — an incomplete triad must not resolve partially.
    const rows = [
      row('text', 't/shared.json'),
      row('audio', 'a/selected.mp3', 'en_m'),
      ...triad('en_f').filter((r) => r.kind !== 'text'),
    ];

    const sources = buildSectionSources(rows, 'en_m', 'en');

    expect(sources).not.toBeNull();
    // en_m had audio but no blocks; the registry's other English voice completes the triad.
    expect(sources?.resolvedVoiceId).toBe('en_f');
  });

  it('returns null when NO voice has a complete triad', () => {
    // Text present, but no voice has both audio and blocks.
    const rows = [row('text', 't/shared.json'), row('audio', 'a/lonely.mp3', 'en_f')];

    expect(buildSectionSources(rows, 'en_f', 'en')).toBeNull();
  });

  it('returns null when the voice-independent TEXT row is missing', () => {
    // A section is atomic: audio without its text is not a resolvable section.
    const rows = triad('en_f').filter((r) => r.kind !== 'text');

    expect(buildSectionSources(rows, 'en_f', 'en')).toBeNull();
  });

  it('defaults a missing duration to 0 rather than undefined', () => {
    const rows = [
      row('text', 't/x.json'),
      row('audio', 'a/x.mp3', 'en_f'),
      row('blocks', 'b/x.json', 'en_f'),
    ];

    expect(buildSectionSources(rows, 'en_f', 'en')?.durationMs).toBe(0);
  });
});

describe('resolveContentLanguage (AC-7)', () => {
  it('defaults to base en when the book advertises nothing', () => {
    expect(resolveContentLanguage(undefined)).toBe('en');
  });

  it('floors to base en for a non-empty array holding no strings (malformed row)', () => {
    // Without the floor this fell through to `avail[0]` === undefined, contradicting the
    // `: string` return and injecting `language: undefined` downstream.
    expect(resolveContentLanguage([1, {}], { requested: 'fr' })).toBe('en');
  });

  it('honors a requested language only when the book offers it', () => {
    expect(resolveContentLanguage(['en', 'fr'], { requested: 'fr' })).toBe('fr');
    expect(resolveContentLanguage(['en'], { requested: 'fr' })).toBe('en');
  });

  it('prefers `requested` over `preferred`, and base en over neither', () => {
    expect(resolveContentLanguage(['en', 'fr', 'es'], { requested: 'es', preferred: 'fr' })).toBe(
      'es'
    );
    expect(resolveContentLanguage(['en', 'fr'], { preferred: 'fr' })).toBe('fr');
    expect(resolveContentLanguage(['en', 'fr'], {})).toBe('en');
  });

  it('falls back to the FIRST offered language when base en is not advertised', () => {
    // Never return a language the book does not have.
    expect(resolveContentLanguage(['fr', 'es'])).toBe('fr');
  });
});

describe('the empty row seam (story 5-2 → 5-4)', () => {
  it('resolveSectionSources reports AUDIO_NOT_AVAILABLE — retryable, never a paywall', async () => {
    // "Absent" was always a legitimate answer, which is why deleting the data layer did not
    // change any caller's shape. The code matters: AUDIO_NOT_AVAILABLE is retryable and the UI
    // maps it to "not available right now", where PREMIUM_REQUIRED would have offered a paywall
    // that Cloud Quran has no screen for.
    await expect(
      resolveSectionSources('book-1', 'summaryCore', 'en_f', 'en')
    ).rejects.toMatchObject({ code: 'AUDIO_NOT_AVAILABLE' });
  });

  it('the rejection is an AppError, so the UI code-mapping still applies', async () => {
    const err = await resolveSectionSources('book-1', 'summaryCore', 'en_f', 'en').catch((e) => e);

    expect(err).toBeInstanceOf(AppError);
  });

  it('never throws PREMIUM_REQUIRED — Cloud Quran has no premium tier', async () => {
    // The classifier that produced this code is gone with the entitlement mirror. If a future
    // change reinstates any premium branch here, this is what catches it.
    const err = await resolveSectionSources('book-1', 'summaryCore', 'en_f', 'en').catch((e) => e);

    expect(err.code).not.toBe('PREMIUM_REQUIRED');
  });

  it('resolveBookPlaySources returns an EMPTY MAP against the empty seam', async () => {
    // A Record keyed by sectionType, not a list — an empty map is "no section resolved",
    // which every caller already treats as "nothing to play".
    await expect(resolveBookPlaySources('book-1', 'en_f', 'en')).resolves.toEqual({});
  });
});

describe('the session play-sources cache', () => {
  it('starts cold', () => {
    // (bookId, sectionType, voiceId, language) — the language is part of the key so a read in
    // one language can never serve another's URLs (Story 20.3 AC-6).
    expect(getCachedSectionSource('book-1', 'summaryCore', 'en_f', 'en')).toBeUndefined();
  });

  it('warm is best-effort and never throws against the empty seam', async () => {
    // Book-open calls this on the critical path; it must degrade to "nothing cached", never
    // reject and take the screen down with it.
    await expect(warmBookPlaySources('book-1', 'en_f', 'en')).resolves.toEqual({});
  });

  it('invalidate on an uncached book is a no-op, not an error', () => {
    expect(() => invalidateBookPlaySources('never-cached')).not.toThrow();
  });

  it('clearPlaySourcesCache is idempotent — accountTeardown calls it unconditionally', () => {
    // `lib/accountTeardown.ts` step 2 calls this on every sign-out, cached or not.
    expect(() => {
      clearPlaySourcesCache();
      clearPlaySourcesCache();
    }).not.toThrow();
  });
});
