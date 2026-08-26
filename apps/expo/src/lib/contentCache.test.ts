/**
 * Section content cache tests (Story 22.4).
 *
 * ⚠️ story 5-2 collapsed the two tiers into one. These tests used to pin "free → permanent MMKV,
 * premium → session-only in-memory", the rule that kept premium bytes off disk so a lapsed
 * subscriber could not read them offline. Cloud Quran has no premium tier, so the whole axis —
 * the session Map, `clearSessionContentCache`, and every premium-vs-free case here — is gone.
 *
 * Two properties survive it, and they are the ones worth keeping:
 *   • Story 20.6 AC-15's LANGUAGE dimension — a read in one language cannot address another's
 *     entry. That is what made the deleted `clearContentCache` sweep optional (Story 24.27).
 *   • Story 24.13 § D8 — a language-FALLBACK result never reaches the permanent store. It used to
 *     be routed to the session tier; with no session tier it is simply not written, and the
 *     property it protects ("a newly-published translation is picked up") is unchanged.
 */

import { getCachedContent, setCachedContent } from './contentCache';
import { createAppMMKV } from './mmkv';

const BOOK = 'book-1';
const SECTION = 'summaryBrief';
const SECTION2 = 'aboutBook';
const EN = 'en';
const FR = 'fr';

beforeEach(() => {
  // The store is PERMANENT MMKV and survives a process restart, so without this a previous test's
  // `en`/`fr` entries leak into the next. Reset it DIRECTLY: Story 24.27 deleted the
  // `clearContentCache` sweep with its last production caller, and keeping an export alive purely
  // to serve this `beforeEach` would be dead code the next reviewer has to re-litigate.
  createAppMMKV('content-cache-free').clearAll();
});

describe('contentCache', () => {
  it('returns undefined on a miss', () => {
    expect(getCachedContent(BOOK, SECTION, EN)).toBeUndefined();
  });

  it('round-trips a string through permanent MMKV', () => {
    setCachedContent(BOOK, SECTION, EN, 'section text');
    expect(getCachedContent(BOOK, SECTION, EN)).toBe('section text');
  });

  it('round-trips an object value (JSON)', () => {
    setCachedContent(BOOK, SECTION2, EN, { paragraphs: ['a', 'b'] });
    expect(getCachedContent(BOOK, SECTION2, EN)).toEqual({ paragraphs: ['a', 'b'] });
  });

  it('survives a cold start — the entry is on disk, not in a process Map', () => {
    setCachedContent(BOOK, SECTION, EN, 'section text');
    // Re-opening the same MMKV id is what a new JS context does; the value must still be there.
    expect(createAppMMKV('content-cache-free').getString(`${EN}/${BOOK}/${SECTION}`)).toBeDefined();
  });

  it('ignores an undefined write', () => {
    setCachedContent(BOOK, SECTION, EN, undefined);
    expect(getCachedContent(BOOK, SECTION, EN)).toBeUndefined();
  });

  it('treats a corrupt entry as a miss rather than throwing', () => {
    createAppMMKV('content-cache-free').set(`${EN}/${BOOK}/${SECTION}`, '{not json');
    expect(getCachedContent(BOOK, SECTION, EN)).toBeUndefined();
  });

  it('keys by book + section (no cross-talk)', () => {
    setCachedContent(BOOK, SECTION, EN, 'a');
    setCachedContent('book-2', SECTION, EN, 'b');
    expect(getCachedContent(BOOK, SECTION, EN)).toBe('a');
    expect(getCachedContent('book-2', SECTION, EN)).toBe('b');
  });

  describe('language dimension (Story 20.6 AC-15)', () => {
    it('never serves one language’s bytes for another', () => {
      // Before 20.6 this store was language-blind, so the French reader of a book already warm in
      // English simply got the English text — a mixed-language section (arch §4.4) arriving
      // through the cache rather than through a resolver, and the store is PERMANENT.
      setCachedContent(BOOK, SECTION, EN, 'english');
      expect(getCachedContent(BOOK, SECTION, FR)).toBeUndefined();
    });

    it('holds both languages at once without either overwriting the other', () => {
      setCachedContent(BOOK, SECTION, EN, 'english');
      setCachedContent(BOOK, SECTION, FR, 'français');

      expect(getCachedContent(BOOK, SECTION, EN)).toBe('english');
      expect(getCachedContent(BOOK, SECTION, FR)).toBe('français');
    });
  });
});

/**
 * Story 24.13 § D8 / AC-27 — a language-FALLBACK result never reaches permanent MMKV.
 *
 * The whole point: nothing ever sweeps this store (Story 24.27 removed the last lever), so a
 * mis-keyed entry would serve the stale English FOREVER, across cold starts, the day the book
 * gains a real `fr` translation.
 */
describe('Story 24.13 § D8 — a fallback result is not cached', () => {
  it('a fallback write leaves NOTHING behind, so the next resolve can pick up the translation', () => {
    setCachedContent('b1', SECTION, FR, 'ENGLISH TEXT', /* wasLanguageFallback */ true);

    expect(getCachedContent('b1', SECTION, FR)).toBeUndefined();
    expect(createAppMMKV('content-cache-free').getString(`fr/b1/${SECTION}`)).toBeUndefined();
  });

  it('a NON-fallback write still persists (the flag is the only thing that suppresses it)', () => {
    setCachedContent('b1', SECTION, EN, 'REAL EN TEXT');

    expect(createAppMMKV('content-cache-free').getString(`en/b1/${SECTION}`)).toBeDefined();
    expect(getCachedContent('b1', SECTION, EN)).toBe('REAL EN TEXT');
  });

  it('a later fallback write never overwrites a real persisted entry at the same key', () => {
    setCachedContent('b1', SECTION, EN, 'REAL');
    setCachedContent('b1', SECTION, EN, 'FALLBACK', true);
    expect(getCachedContent('b1', SECTION, EN)).toBe('REAL');
  });
});
