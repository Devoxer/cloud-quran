/**
 * Section content cache (Story 22.4; language-keyed Story 20.6).
 *
 * ⚠️ story 5-2 COLLAPSED THE TIERING. This used to be a two-tier cache: free sections went to
 * permanent MMKV, premium sections to a session-only in-memory Map so a lapsed subscriber could
 * never read premium bytes offline. Cloud Quran is free and waqf-funded — there is no premium
 * tier, no entitlement and nothing to keep off disk — so the session store, `isFreeSection` and
 * `clearSessionContentCache` are gone rather than left switched off. ONE permanent MMKV tier.
 *
 * ⚠️ A LANGUAGE-FALLBACK RESULT STILL NEVER GOES TO DISK (Story 24.13 § D8), and that rule is
 * what the tier collapse must not quietly drop.
 *
 * THE DEFECT it closes: the permanent tier memoized a **language-FALLBACK** result under the
 * **REQUESTED** language's key. Select `fr` → open a book with no `fr` text → read a section →
 * ENGLISH is persisted at `fr/{bookId}/{sectionType}` in permanent MMKV → that book later gains a
 * published `fr` translation → the cache serves the stale English **forever, across cold starts**.
 * There is NO invalidation lever to fall back on: since Story 24.27 nothing sweeps this store at
 * all (the language switch used to, and no longer destroys anything), so a mis-keyed permanent
 * entry would simply never be repaired.
 *
 * THE FIX, restated for one tier: a fallback result is NOT CACHED. It was previously routed to the
 * session tier, which no longer exists; the property that matters is that it never reaches disk,
 * and skipping the write keeps it. A cold start re-resolves and picks up a newly-published
 * translation; so does the next read within the session, which costs one resolve rather than a
 * permanently wrong answer.
 *
 * Story 24.13 § D4 made this path COMMON rather than rare: with the shelf language-agnostic, every
 * book a user already saved, started or collected stays openable in a language it has no rows for.
 *
 * ⚠️ THE KEY CARRIES THE LANGUAGE (Story 20.6, AC-15). Before that story the cache was keyed
 * `${bookId}/${sectionType}` with no language dimension — safe only while exactly one language was
 * released, and a latent data-corruption bug the moment a second one shipped: switching language
 * would re-serve the previous language's text from disk, across cold starts, with no invalidation
 * lever anywhere. Keying it is correct BY CONSTRUCTION (a read in one language simply cannot
 * address another's entry), which is strictly better than "remember to invalidate".
 *
 * ⚠️ And correct-by-construction is now the ONLY thing holding it up — there is deliberately no
 * language sweep any more (Story 24.27). The other language's entries are unreadable under the
 * current key and stay warm for switching back, which is the same bargain the offline downloads
 * make. Do not reintroduce a sweep without a caller that needs one.
 *
 * ⚠️ SAY THE OTHER HALF OUT LOUD: nothing prunes this store — no TTL, no size cap, no eviction.
 * Section bodies accumulate per (language × book × section) for the life of the install. That is
 * text, not audio — but if this store ever needs bounding, bound it on its own terms (size/LRU).
 */

import { createAppMMKV } from './mmkv';

// The one permanent store. (Web gets a no-op stub via createAppMMKV.)
//
// ⚠️ Two test files reset this store by re-creating the SAME id — `lib/contentCache.test.ts` and
// `lib/language.test.ts` both call `createAppMMKV('content-cache-free').clearAll()` in a
// `beforeEach`. They cannot import the store (it is private on purpose, and Story 24.27 deleted
// the export that only tests used rather than keep production API alive for them), so renaming
// this id silently stops both resets and leaks entries between cases with nothing red. The id
// keeps its `-free` suffix for exactly that reason — story 5-2 removed the tier the name refers
// to, but renaming the MMKV instance is a data migration plus a silent test-reset break, and it
// buys nothing. Rename it and grep for the literal.
const contentStore = createAppMMKV('content-cache-free');

/**
 * `${language}/${bookId}/${sectionType}`. The language goes FIRST so a whole language is one
 * `startsWith` away — book ids and section types are opaque, and a language-last key would need a
 * suffix scan. (The prefix sweep that motivated the ordering left with Story 24.27; the ordering
 * stays because it costs nothing and keeps the option open.)
 */
function cacheKey(bookId: string, sectionType: string, language: string): string {
  return `${language}/${bookId}/${sectionType}`;
}

/** Read a section's cached content, or `undefined` on a miss (or a corrupt entry). */
export function getCachedContent(
  bookId: string,
  sectionType: string,
  language: string
): unknown | undefined {
  const raw = contentStore.getString(cacheKey(bookId, sectionType, language));
  if (raw === undefined) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    // A corrupt entry is a miss, never a throw on the read path.
    return undefined;
  }
}

/**
 * Cache a section's content.
 *
 * @param wasLanguageFallback true when the content was resolved in a DIFFERENT language than
 *   `language` (the whole-section `en` fallback fired). Such a result is NOT written, so a
 *   re-resolve picks up the translation the day it lands — see this module's header for the
 *   defect that closes. Callers that cannot know (there are none left in-tree — all three
 *   resolvers report their resolved language as of § D8) omit it and get the ordinary write.
 */
export function setCachedContent(
  bookId: string,
  sectionType: string,
  language: string,
  content: unknown,
  wasLanguageFallback = false
): void {
  if (content === undefined || wasLanguageFallback) return;
  contentStore.set(cacheKey(bookId, sectionType, language), JSON.stringify(content));
}
