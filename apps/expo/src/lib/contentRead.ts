/**
 * Content resolution — section rows → public edge URLs.
 *
 * ⚠️ story 5-2 CUT THIS MODULE'S DATA SOURCE, and left the shape standing. It used to read a
 * section's `contentObjects` rows from InstantDB (RLS-gated: free rows world-readable, premium
 * rows returned only for an entitled user) and build a public edge URL with `contentUrl(r2Key)`.
 * The vendor is being retired, so the read goes through {@link queryContentObjectRows} — the ONE
 * seam, and today it has nothing behind it. ⚠️ NOT story 5-4. That story shipped the worker data API for the four SYNCED entities (reading position, bookmarks, preferences, audio position) — none of which is a content catalog. This seam resolves wisdom-fruits' contentObjects rows to R2 URLs and has no data source at all until one exists; recitation content is Epic 7.
 *
 * Two consequences, both deliberate:
 *   1. **Every section resolves as absent**, i.e. `AUDIO_NOT_AVAILABLE`. That is honest: there is
 *      no catalog in this tree either — Cloud Quran's recitation content arrives in epic 7.
 *   2. **There is no denial branch left.** The old classifier inferred an RLS-hidden premium row
 *      from `books.generatedSections` + the entitlement mirror and threw `PREMIUM_REQUIRED` to
 *      raise a paywall. Cloud Quran is free and waqf-funded: absent means absent, full stop.
 *
 * Per-language voice→voice fallback (AC-8, arch §4.4) is kept whole: a section resolves ATOMICALLY
 * per voice (audio + blocks from ONE voice, text voice-independent). If the selected voice's triad
 * is incomplete, another voice OF THE SAME LANGUAGE is used (a complete read-along in a different
 * voice beats a broken section); only when no voice of that language is complete does the
 * whole-section language fallback to `en` fire, and only when THAT is exhausted does the section
 * surface as unavailable. Story 20.6 made the voice list per-language
 * (`getVoiceIdsForLanguage`) — it used to be the global Kokoro flagship set, which no non-English
 * row could ever match.
 */

import { getVoiceIdsForLanguage } from '@cloudquran/shared';
import { BASE_LANGUAGE } from '@/constants/language';
import i18n from '@/i18n';
import { contentUrl } from './contentUrl';
import { AppError } from './errors';

/**
 * Resolve the display content language (Story 32.6 AC-7, arch §4.4): `requested → preferred → base en`,
 * constrained to the languages the book actually offers (`availableLanguages`). The `preferred`
 * tier is the ONE device-local language preference (`lib/language.ts`). Base `en` is the floor.
 *
 * ⚠️ This is the DISPLAY floor. The play / read resolvers deliberately pass the RAW preference
 * instead: flooring there would dead-key the play cache and warm the text cache in a different
 * language than the audio. The DOWNLOAD gate is a third thing again — it REFUSES rather than
 * floors (`isBookAvailableInLanguage`, § D5), because a persisted file mislabelled on disk is not
 * recoverable the way a transient stream degrading to English is.
 *
 * ⚠️ HOW THIS RECONCILES WITH STORY 24.13's CATALOG FILTER — the two rules govern different
 * questions and both are correct:
 *
 *   • **The FILTER governs DISCOVERY.** A book with no rows in the selected language does not
 *     appear on Discover, in Search, or in the Feed — you are never HANDED English content you did
 *     not ask for.
 *   • **This FLOOR governs a book you already own or reached directly.** The shelf is deliberately
 *     language-agnostic (24.13 owner decision 10 — a book is one entity, a language is a rendering
 *     of it), and deep links, notifications and the open player all bypass discovery entirely. Such
 *     a book still has to render, so it falls through to `en`.
 *
 * The accepted consequence, recorded as a decision rather than an oversight: a shelf book with no
 * rows in the selected language shows English content under translated chrome. It is a book the
 * user saved themselves, and Story 24.13 § D8 keeps that fallback out of the cache so the day its
 * translation lands it is picked up rather than served stale forever.
 */
export function resolveContentLanguage(
  availableLanguages: unknown,
  opts: { requested?: string; preferred?: string } = {}
): string {
  const filtered =
    Array.isArray(availableLanguages) && availableLanguages.length > 0
      ? (availableLanguages.filter((x) => typeof x === 'string') as string[])
      : [];
  // Floor to base `en` when the array is absent/empty OR held no strings (a malformed row like
  // `[42, null]` — untrusted shape at read time). Epic-32 boundary CR: without this floor the
  // all-non-string case fell through to `return avail[0]` === `undefined`, contradicting the
  // `: string` return and injecting `language: undefined` downstream.
  const avail = filtered.length > 0 ? filtered : [BASE_LANGUAGE];
  for (const candidate of [opts.requested, opts.preferred, BASE_LANGUAGE]) {
    if (candidate && avail.includes(candidate)) return candidate;
  }
  // Reaching here means even base `en` isn't offered (a future non-`en` book) — return the first
  // language the book DOES offer so the query hits real rows, honouring the "constrained to
  // availableLanguages" contract (never a language absent from `avail`). `avail` is non-empty above.
  return avail[0];
}

/** A content-object row as this module reads it (narrowed defensively — the source is untrusted). */
export interface ContentObjectRow {
  kind: string;
  sectionType?: string;
  voiceId?: string;
  r2Key: string;
  ext: string;
  durationMs?: number;
}

/** A section fully resolved to public edge URLs (one voice's atomic triad). */
export interface SectionSources {
  audioUrl: string;
  textUrl: string;
  blocksUrl: string;
  /** The voice the audio+blocks actually resolved to (the selected one, or the next voice in
   *  THIS language's registry entry — Story 20.6 replaced the global flagship list). */
  resolvedVoiceId: string;
  /**
   * The LANGUAGE the section actually resolved to (requested, or `en` after the fallback) —
   * the language-axis twin of `resolvedVoiceId`, and it is load-bearing, not symmetry.
   *
   * Architecture §4.4 orders the language fallback AGAINST the on-demand TTS enqueue and names
   * the exact failure mode: "if resolution silently returns `en` first, the '`fr` rows missing'
   * signal is consumed and generation is never triggered → permanent `en` fallback." A fallback
   * that returned `en` indistinguishably from a native-`en` resolve would destroy that signal
   * for good.
   */
  resolvedLanguage: string;
  /** Audio container from the row (`mp3` | `wav`) — opaque keys carry no extension. */
  audioExt: string;
  /** Authoritative duration from the audio row (0 when the row lacks it). */
  durationMs: number;
}

/**
 * THE ROW SOURCE — the one seam, and it is currently empty.
 *
 * story 5-2 deleted the InstantDB client this read went through (`queryOnce` from the retired
 * `lib/dbHooks.ts`). ⚠️ NOT story 5-4 — that shipped the API for the four SYNCED entities, none of which is a content
 * catalog. This seam has no data source until one exists (Epic 7 owns recitation). Until
 * then it answers "no rows", which every caller below already handles as "absent" because that was
 * always a legitimate answer. Nothing downstream had to change shape.
 *
 * ⚠️ Do NOT reintroduce a direct client here. Features never reach the data layer directly — the
 * query module is the chokepoint `lint:layers` polices, and 5-4 built it for the synced entities only.
 */
async function queryContentObjectRows(_where: {
  bookId: string;
  language: string;
  sectionType?: string;
  kind?: string;
}): Promise<ContentObjectRow[]> {
  return [];
}

/** Read every content row for a (book, section, language). */
async function querySectionRows(
  bookId: string,
  sectionType: string,
  language: string = BASE_LANGUAGE
): Promise<ContentObjectRow[]> {
  return queryContentObjectRows({ bookId, sectionType, language });
}

/**
 * The section is absent in every language this resolver tried.
 *
 * story 5-2: this was `classifyAbsentSection`, a four-condition inference that distinguished "not
 * generated" from "RLS-hidden because you are not entitled" and threw `PREMIUM_REQUIRED` for the
 * latter, after firing a debounced live RevenueCat recheck. With no premium tier there is nothing
 * to distinguish — absent is absent, and it is always retryable-unavailable.
 */
function absentSection(): never {
  throw new AppError('AUDIO_NOT_AVAILABLE', i18n.t('book:errors.contentUnavailable'));
}

/** Pick one voice's complete `(audio, blocks)` pair from the rows, or null. */
function pickVoicePair(
  rows: ContentObjectRow[],
  voiceId: string
): { audio: ContentObjectRow; blocks: ContentObjectRow } | null {
  const audio = rows.find((r) => r.kind === 'audio' && r.voiceId === voiceId);
  const blocks = rows.find((r) => r.kind === 'blocks' && r.voiceId === voiceId);
  return audio && blocks ? { audio, blocks } : null;
}

/**
 * Build a section's `SectionSources` from its own rows for the selected voice, with a
 * voice→voice fallback WITHIN THE LANGUAGE (AC-8) — text is voice-independent, audio+blocks
 * atomic per voice. Returns null when no complete triad exists (missing text, or no voice with a
 * complete (audio, blocks) pair). The pure core shared by the per-section resolve + the whole-book
 * play preload.
 *
 * ⚠️ Story 20.6: the fallback order comes from THIS LANGUAGE's registry entry, not a global
 * flagship list. Before 20.6 it was `FLAGSHIP_VOICE_IDS` — Kokoro/English ids — so a `fr` row
 * voiced `fr_f` matched NO candidate, `pickVoicePair` returned null for every one, and the whole
 * section fell through to the `en` fallback. Every non-English language was unresolvable by
 * construction, silently, with every test green. The requested voice still leads (it may be this
 * language's, or a leftover from the previous one), then the language's own voices in picker order.
 */
export function buildSectionSources(
  rows: ContentObjectRow[],
  voiceId: string,
  language: string
): SectionSources | null {
  const text = rows.find((r) => r.kind === 'text');
  // Selected voice first, then this language's other voices (order preserved, no repeats).
  const voiceOrder = [voiceId, ...getVoiceIdsForLanguage(language).filter((v) => v !== voiceId)];
  const pair = text ? voiceOrder.map((v) => pickVoicePair(rows, v)).find((p) => p !== null) : null;
  if (!text || !pair) return null;
  return {
    audioUrl: contentUrl(pair.audio.r2Key),
    textUrl: contentUrl(text.r2Key),
    blocksUrl: contentUrl(pair.blocks.r2Key),
    resolvedVoiceId: pair.audio.voiceId ?? voiceId,
    resolvedLanguage: language,
    audioExt: pair.audio.ext ?? 'mp3',
    durationMs: pair.audio.durationMs ?? 0,
  };
}

/**
 * Resolve a section's full playback triad (audio + text + blocks) to edge URLs for the
 * selected voice, with a voice→voice fallback WITHIN the language followed by the
 * whole-section base-`en` language fallback (AC-8). Throws `AppError('AUDIO_NOT_AVAILABLE')`
 * when no voice's triad is complete in either.
 */
export async function resolveSectionSources(
  bookId: string,
  sectionType: string,
  voiceId: string,
  language: string = BASE_LANGUAGE
): Promise<SectionSources> {
  let rows: ContentObjectRow[];
  try {
    rows = await querySectionRows(bookId, sectionType, language);
  } catch (err) {
    throw new AppError('NETWORK', i18n.t('common:errors.network'), err);
  }
  const requested = buildSectionSources(rows, voiceId, language);
  if (requested) return requested;

  // Whole-section-atomic language fallback (Story 20.3 AC-5, arch §4.4): the requested language
  // has no COMPLETE triad for this section, so re-resolve the ENTIRE section at base `en` —
  // never a mixed-language section (`fr` text over `en` blocks). No-op on the en-only path that
  // ships today, so it costs zero extra queries until a second language is released.
  if (language !== BASE_LANGUAGE) {
    let baseRows: ContentObjectRow[];
    try {
      baseRows = await querySectionRows(bookId, sectionType, BASE_LANGUAGE);
    } catch (err) {
      throw new AppError('NETWORK', i18n.t('common:errors.network'), err);
    }
    const base = buildSectionSources(baseRows, voiceId, BASE_LANGUAGE);
    if (base) return base;
  }

  return absentSection();
}

/** A resolved TEXT url plus the language it ACTUALLY came from (Story 24.13 § D8). */
export interface SectionTextUrl {
  url: string;
  /**
   * The language the row was actually found in — `language` normally, `BASE_LANGUAGE` when the
   * whole-section fallback fired. The caller compares it to what it REQUESTED to decide whether to
   * cache: a fallback result must not be persisted under the requested language's key (§ D8).
   */
  resolvedLanguage: string;
}

/**
 * Resolve a section's voice-independent TEXT edge URL (read mode / book-open — no audio).
 *
 * ⚠️ Story 24.13 § D8 WIDENED THE RETURN from a bare string to `{ url, resolvedLanguage }`.
 * `resolveSectionSources` already reported its resolved language; these text resolvers did not, and
 * the fallback-cache-poisoning fix needs the signal at all three write-site groups at once — a
 * half-fix (only the play path, which already had it) makes the caching behaviour incoherent.
 */
export async function resolveSectionTextUrl(
  bookId: string,
  sectionType: string,
  language: string = BASE_LANGUAGE
): Promise<SectionTextUrl> {
  let rows: ContentObjectRow[];
  try {
    rows = await querySectionRows(bookId, sectionType, language);
  } catch (err) {
    throw new AppError('NETWORK', i18n.t('common:errors.network'), err);
  }
  const text = rows.find((r) => r.kind === 'text');
  if (text) return { url: contentUrl(text.r2Key), resolvedLanguage: language };

  // Language fallback (AC-5) — same shape as `resolveSectionSources`; no-op when already `en`.
  if (language !== BASE_LANGUAGE) {
    let baseRows: ContentObjectRow[];
    try {
      baseRows = await querySectionRows(bookId, sectionType, BASE_LANGUAGE);
    } catch (err) {
      throw new AppError('NETWORK', i18n.t('common:errors.network'), err);
    }
    const baseText = baseRows.find((r) => r.kind === 'text');
    if (baseText) {
      return { url: contentUrl(baseText.r2Key), resolvedLanguage: BASE_LANGUAGE };
    }
  }

  return absentSection();
}

/** One batch query for a book's TEXT rows in ONE language — the raw leg of `resolveBookTextUrls`. */
async function queryBookTextUrls(
  bookId: string,
  language: string
): Promise<Record<string, string>> {
  const rows = await queryContentObjectRows({ bookId, kind: 'text', language });
  const sections: Record<string, string> = {};
  for (const row of rows) {
    if (typeof row.sectionType === 'string') sections[row.sectionType] = contentUrl(row.r2Key);
  }
  return sections;
}

/**
 * Resolve ALL of a book's display-section TEXT rows in ONE query (the book-open background
 * preload — Story 32.6 AC-4). `language` threads the resolved display language (AC-7; en-only today).
 *
 * ⚠️ Story 24.13 § D8 WIDENED THE VALUES from a bare url to `{ url, resolvedLanguage }`, PER
 * SECTION — this resolver merges two languages' batches, so the answer genuinely differs section by
 * section and a single whole-call flag could not express it.
 */
export async function resolveBookTextUrls(
  bookId: string,
  language: string = BASE_LANGUAGE
): Promise<Record<string, SectionTextUrl>> {
  const requested = await queryBookTextUrls(bookId, language);
  const tag = (urls: Record<string, string>, lang: string): Record<string, SectionTextUrl> =>
    Object.fromEntries(
      Object.entries(urls).map(([section, url]) => [section, { url, resolvedLanguage: lang }])
    );
  // Story 20.3 AC-5 — whole-BOOK fallback in ONE extra query, never N+1. A per-section
  // re-query on the book-open critical path would be a fan-out; instead re-run the same batch
  // at `en` and merge per section: a section present in the requested language keeps its own
  // row, an absent one takes the `en` row. No-op when already `en` (today's only path).
  if (language === BASE_LANGUAGE) return tag(requested, BASE_LANGUAGE);
  // The fallback is a BONUS leg: if it fails (offline mid-open), keep the sections we already
  // resolved rather than failing the whole preload. 20.3 Step G — the per-section resolvers
  // already guard both legs; these two batch resolvers guarded neither.
  try {
    const base = await queryBookTextUrls(bookId, BASE_LANGUAGE);
    // The spread order is unchanged (requested wins); only the tagging is new, and each half keeps
    // the language it was actually queried at.
    return { ...tag(base, BASE_LANGUAGE), ...tag(requested, language) };
  } catch {
    return tag(requested, language);
  }
}

// ─── Play-URL preload (Story 32.6 AC-5) — one query per book; Play skips the round-trip ───

/** One batch query for a book's rows in ONE language — the raw leg of `resolveBookPlaySources`. */
async function queryBookPlaySources(
  bookId: string,
  voiceId: string,
  language: string
): Promise<Record<string, SectionSources>> {
  const rows = await queryContentObjectRows({ bookId, language });

  // Group rows by section, then build each section's sources for the selected voice.
  const bySection = new Map<string, ContentObjectRow[]>();
  for (const r of rows) {
    if (typeof r.sectionType !== 'string') continue;
    const list = bySection.get(r.sectionType) ?? [];
    list.push(r);
    bySection.set(r.sectionType, list);
  }
  const out: Record<string, SectionSources> = {};
  for (const [section, sectionRows] of bySection) {
    const sources = buildSectionSources(sectionRows, voiceId, language);
    if (sources) out[section] = sources;
  }
  return out;
}

/**
 * Resolve EVERY display section's playback triad for a book in ONE query (all kinds, one
 * language), per section: `{ audioUrl, textUrl, blocksUrl, resolvedVoiceId, audioExt, durationMs }`
 * (reusing `resolveSectionSources`' shape + the base-`en` voice→voice fallback). A section whose
 * triad is incomplete is omitted — the Play path falls through to `resolveSectionSources`. Audio
 * BYTES are NOT prefetched — only the resolve round-trip is eliminated.
 */
export async function resolveBookPlaySources(
  bookId: string,
  voiceId: string,
  language: string = BASE_LANGUAGE
): Promise<Record<string, SectionSources>> {
  const requested = await queryBookPlaySources(bookId, voiceId, language);
  // Story 20.3 AC-5 — the whole-BOOK language fallback: ONE extra batch query at `en`, merged
  // per section (a section complete in the requested language keeps its OWN rows entirely; an
  // absent/incomplete one takes the `en` result WHOLE — never a mixed-language section). A
  // per-section re-query here would be an N+1 on the book-open critical path. No-op on `en`.
  if (language === BASE_LANGUAGE) return requested;
  // Bonus leg — a failure keeps the sections already resolved (see `resolveBookTextUrls`).
  try {
    const base = await queryBookPlaySources(bookId, voiceId, BASE_LANGUAGE);
    return { ...base, ...requested };
  } catch {
    return requested;
  }
}

/** In-memory play-source cache, keyed per `(bookId, voiceId, language)` — a session store
 *  (cleared on cold start + account teardown) that holds only edge URLs + metadata, no bytes. */
const playSourcesCache = new Map<string, Record<string, SectionSources>>();

/**
 * The cache key carries the LANGUAGE as well as the voice (Story 20.3 AC-6). Without it two
 * languages collide on one key and `getCachedSectionSource` — which `resolveOnlineSource`
 * consults BEFORE any live resolve — can hand back the previous language's URLs.
 *
 * A keyed cache is correct BY CONSTRUCTION; "invalidate on change" is not the alternative:
 * `invalidateBookPlaySources` needs a `bookId` the language picker does not have and cannot
 * enumerate (the only whole-cache lever is `clearPlaySourcesCache()`), and a clear-on-change is
 * order-dependent where this is not.
 */
function playCacheKey(bookId: string, voiceId: string, language: string): string {
  return `${bookId}/${voiceId}/${language}`;
}

/**
 * Warm the play-source cache for a book+voice (book-open, after paint — AC-5). Best-effort: a
 * failure leaves the cache empty so the Play path falls through to the live resolve. Returns the
 * resolved map so a caller (durations) can also render from it. */
export async function warmBookPlaySources(
  bookId: string,
  voiceId: string,
  language: string = BASE_LANGUAGE
): Promise<Record<string, SectionSources>> {
  try {
    const map = await resolveBookPlaySources(bookId, voiceId, language);
    playSourcesCache.set(playCacheKey(bookId, voiceId, language), map);
    return map;
  } catch {
    return {};
  }
}

/**
 * A pre-resolved section source from the play cache, or undefined on a miss (→ live resolve).
 * `language` is part of the key, so a read in one language can never serve another's URLs.
 */
export function getCachedSectionSource(
  bookId: string,
  sectionType: string,
  voiceId: string,
  language: string = BASE_LANGUAGE
): SectionSources | undefined {
  return playSourcesCache.get(playCacheKey(bookId, voiceId, language))?.[sectionType];
}

/**
 * Drop a book's cached play sources (voice/language change, content re-key). Absent key → no-op.
 * Every argument NARROWS: `(book)` drops every voice and language, `(book, voice)` that voice in
 * every language, `(book, undefined, language)` that language across every voice, and all three
 * the one exact entry.
 */
export function invalidateBookPlaySources(
  bookId: string,
  voiceId?: string,
  language?: string
): void {
  // Fully specified → EXACT key. A prefix match here has no trailing delimiter to stop it, so it
  // would also drop a neighbouring `…/en-GB` when asked for `…/en` (codes are admin-written, so
  // a region-tagged sibling is not hypothetical).
  if (voiceId !== undefined && language !== undefined) {
    playSourcesCache.delete(playCacheKey(bookId, voiceId, language));
    return;
  }
  // The partial modes match on DELIMITED segments, so `…/en` still can't match `…/en-GB`. A
  // language passed without a voice must be honoured rather than silently widened to the whole
  // book — widening would throw away every other language's warm map. (20.3 Step I.)
  const prefix = voiceId === undefined ? `${bookId}/` : `${bookId}/${voiceId}/`;
  const suffix = language === undefined ? undefined : `/${language}`;
  for (const key of [...playSourcesCache.keys()]) {
    if (!key.startsWith(prefix)) continue;
    if (suffix !== undefined && !key.endsWith(suffix)) continue;
    playSourcesCache.delete(key);
  }
}

/** Clear the whole play-source cache (account teardown; tests). */
export function clearPlaySourcesCache(): void {
  playSourcesCache.clear();
}
