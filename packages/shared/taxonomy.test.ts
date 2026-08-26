/**
 * Canonical category taxonomy — the single-source-of-truth guards (Story 26.4).
 *
 * The load-bearing invariant is the display-name collision guard: two canonical slugs sharing a
 * display name would re-introduce the duplicate-tile / React-key-collision bug the whole story
 * removes. The alias-map guard proves the forward normalizer maps every alias onto a real
 * canonical slug.
 */
import { describe, expect, it } from 'vitest';
import {
  ALIAS_TO_CANONICAL,
  CANONICAL_CATEGORY_SLUGS,
  CATEGORY_DISPLAY_NAMES,
  CATEGORY_DISPLAY_NAMES_EN,
  CATEGORY_ICONS,
  CATEGORY_SHORT_NAMES,
  canonicalizeCategorySlug,
  getCategoryDisplayName,
  getCategoryIcon,
  getCategoryShortName,
  getTopicDisplayName,
  isCanonicalCategorySlug,
  TOPIC_DISPLAY_NAMES,
} from './taxonomy';

describe('canonical category set', () => {
  it('has no two canonical slugs sharing a display name (collision guard)', () => {
    const byName = new Map<string, string[]>();
    for (const slug of CANONICAL_CATEGORY_SLUGS) {
      const name = CATEGORY_DISPLAY_NAMES_EN[slug];
      byName.set(name, [...(byName.get(name) ?? []), slug]);
    }
    const collisions = [...byName.entries()].filter(([, slugs]) => slugs.length > 1);
    expect(collisions).toEqual([]);
  });

  it('gives every canonical slug a real display name + icon (no fallback for a live slug)', () => {
    for (const slug of CANONICAL_CATEGORY_SLUGS) {
      expect(CATEGORY_DISPLAY_NAMES_EN[slug], `display name for ${slug}`).toBeTruthy();
      expect(CATEGORY_ICONS[slug], `icon for ${slug}`).toBeTruthy();
    }
  });

  it('has unique slugs', () => {
    expect(new Set(CANONICAL_CATEGORY_SLUGS).size).toBe(CANONICAL_CATEGORY_SLUGS.length);
  });

  it('display-name + icon maps carry ONLY canonical slugs', () => {
    for (const [language, map] of Object.entries(CATEGORY_DISPLAY_NAMES)) {
      for (const slug of Object.keys(map)) {
        expect(isCanonicalCategorySlug(slug), `${slug} in the ${language} display map`).toBe(true);
      }
    }
    for (const slug of Object.keys(CATEGORY_ICONS)) {
      expect(isCanonicalCategorySlug(slug), `${slug} in icon map`).toBe(true);
    }
  });
});

describe('canonicalizeCategorySlug (forward guard)', () => {
  it('maps every known alias to a REAL canonical slug', () => {
    for (const [alias, canonical] of Object.entries(ALIAS_TO_CANONICAL)) {
      expect(canonicalizeCategorySlug(alias)).toBe(canonical);
      expect(isCanonicalCategorySlug(canonical), `${alias} → ${canonical} is canonical`).toBe(true);
      // An alias must NOT itself be a canonical slug (else it isn't an alias).
      expect(isCanonicalCategorySlug(alias), `${alias} is not canonical`).toBe(false);
    }
  });

  it('is identity on canonical slugs and unknown slugs', () => {
    for (const slug of CANONICAL_CATEGORY_SLUGS) {
      expect(canonicalizeCategorySlug(slug)).toBe(slug);
    }
    expect(canonicalizeCategorySlug('not-a-real-slug')).toBe('not-a-real-slug');
  });

  it('is case-insensitive on the alias key', () => {
    expect(canonicalizeCategorySlug('Nature')).toBe('nature-environment');
    expect(canonicalizeCategorySlug('SELF-HELP')).toBe('personal-development');
  });

  it('drops a null/undefined/empty slug through without throwing (untyped model-output guard)', () => {
    // Exported from the shared barrel + consumed on untyped pipeline model output, where a null
    // category can slip past the `string` type — it must drop through, never throw a TypeError.
    expect(canonicalizeCategorySlug('')).toBe('');
    expect(canonicalizeCategorySlug(null as unknown as string)).toBeNull();
    expect(canonicalizeCategorySlug(undefined as unknown as string)).toBeUndefined();
  });
});

describe('getCategoryDisplayName / getCategoryIcon', () => {
  it('resolves an alias slug to its canonical display name + icon', () => {
    expect(getCategoryDisplayName('nature', 'en')).toBe('Nature & Environment');
    expect(getCategoryDisplayName('self-help', 'en')).toBe('Personal Development');
    expect(getCategoryIcon('nature')).toBe(getCategoryIcon('nature-environment'));
  });

  it('returns the canonical display name + icon for a canonical slug', () => {
    expect(getCategoryDisplayName('economics-finance', 'en')).toBe('Economics & Finance');
    expect(getCategoryIcon('economics-finance')).toBe('📊');
  });

  it('title-cases an unknown slug and falls back to 📘 for the icon', () => {
    expect(getCategoryDisplayName('quantum-basketry', 'en')).toBe('Quantum Basketry');
    expect(getCategoryIcon('quantum-basketry')).toBe('📘');
  });
});

// ── Story 24.14 (§ D6) — the per-language display dimension ────────────────────────────────────
describe('per-language taxonomy labels (Story 24.14)', () => {
  it('translates a category display name, resolving aliases first', () => {
    expect(getCategoryDisplayName('personal-development', 'fr')).toBe('Développement personnel');
    expect(getCategoryDisplayName('self-help', 'fr')).toBe('Développement personnel');
  });

  it('gives EVERY canonical slug a real French name — not just the ones with books today', () => {
    // The live catalog carries 33 of the 35 canonical slugs. Translating only those would leave
    // two categories permanently English the day a book lands in them.
    for (const slug of CANONICAL_CATEGORY_SLUGS) {
      expect(CATEGORY_DISPLAY_NAMES.fr[slug], `French name for ${slug}`).toBeTruthy();
    }
  });

  it('falls back to English for a language with no map', () => {
    expect(getCategoryDisplayName('psychology', 'de')).toBe('Psychology');
    expect(getTopicDisplayName('Habits', 'de')).toBe('Habits');
  });

  it('falls back to the English NAME for a topic with no entry in the language', () => {
    // An ingest that mints a new topic must degrade to one English chip, never a blank one.
    expect(getTopicDisplayName('Underwater Basket Weaving', 'fr')).toBe(
      'Underwater Basket Weaving'
    );
  });

  it('translates a topic name', () => {
    expect(getTopicDisplayName('Habits', 'fr')).toBe('Habitudes');
    expect(getTopicDisplayName('The Brain', 'fr')).toBe('Le cerveau');
  });

  it('short names fall back to the SAME language’s full name, never to English’s short one', () => {
    // A mixed French card beside an English "Politics" one is worse than either alone — the
    // fallback must stay inside the language.
    // This first line is the OVERRIDE case, not the fallback one: `personal-development` has a
    // French short entry, so it proves the override is read at all. The fallback is the line
    // below it.
    expect(getCategoryShortName('personal-development', 'fr')).toBe('Dév. perso');
    // `communication` has no short override in EITHER language → the full French name. THIS is
    // the assertion that would catch a fallback leaking to English's short map.
    expect(getCategoryShortName('communication', 'fr')).toBe('Communication');
    expect(getCategoryShortName('psychology', 'fr')).toBe('Psychologie');
    expect(getCategoryShortName('psychology', 'en')).toBe('Psychology');
  });

  it('short-name maps carry ONLY canonical slugs, in every language', () => {
    for (const [language, map] of Object.entries(CATEGORY_SHORT_NAMES)) {
      for (const slug of Object.keys(map)) {
        expect(isCanonicalCategorySlug(slug), `${slug} in the ${language} short map`).toBe(true);
      }
    }
  });

  it('no two canonical slugs share a French display name (the collision guard, per language)', () => {
    // Same React-key / duplicate-tile hazard the English guard above exists for — a translation
    // that collapses two categories onto one label re-opens it in that language only.
    const byName = new Map<string, string[]>();
    for (const slug of CANONICAL_CATEGORY_SLUGS) {
      const name = CATEGORY_DISPLAY_NAMES.fr[slug];
      byName.set(name, [...(byName.get(name) ?? []), slug]);
    }
    expect([...byName.entries()].filter(([, slugs]) => slugs.length > 1)).toEqual([]);
  });

  it('leaves the QUERY KEYS untouched — translation is display-only (AC-14)', () => {
    // ⚠️ `categories.slug` and `topics.name` are what every `where` clause filters on. The display
    // layer must never mutate them: a translated slug matches nothing, and a translated topic name
    // silently empties the grid.
    //
    // ⚠️ THIS TEST WAS TAUTOLOGICAL UNTIL STEP G — two review layers caught it independently. It
    // asserted `getTopicDisplayName(name,'fr') !== undefined` (structurally impossible for a
    // string input, since the helper's own fallback is `?? name`) and `typeof name === 'string'`
    // (true of every `Object.keys` result). Neither would have failed if someone had translated a
    // query key. What follows actually distinguishes the two.
    for (const slug of CANONICAL_CATEGORY_SLUGS) {
      expect(canonicalizeCategorySlug(slug)).toBe(slug);
    }
    // The French maps are keyed by the ENGLISH key, never by the French label — the failure this
    // guards is a map whose keys drifted into the translations, which would make every lookup miss
    // and every `where` clause receive a label. Checked only where the label actually DIFFERS from
    // its key: a handful of names are identical in both languages ("Addiction"), and for those the
    // label legitimately IS a key.
    for (const [name, label] of Object.entries(TOPIC_DISPLAY_NAMES.fr)) {
      if (label !== name) expect(TOPIC_DISPLAY_NAMES.fr[label]).toBeUndefined();
    }
    for (const [slug, label] of Object.entries(CATEGORY_DISPLAY_NAMES.fr)) {
      if (label !== slug) expect(CATEGORY_DISPLAY_NAMES.fr[label]).toBeUndefined();
      // Every French row is keyed by a slug the ENGLISH row also carries — a French-only key would
      // be a label that drifted into the key position, unreachable by any query.
      expect(CATEGORY_DISPLAY_NAMES_EN[slug]).toBeDefined();
    }
    expect(Object.keys(CATEGORY_DISPLAY_NAMES.fr).sort()).toEqual(
      Object.keys(CATEGORY_DISPLAY_NAMES_EN).sort()
    );
  });

  it('actually TRANSLATES — the French labels are not just the English keys echoed back', () => {
    // The other half of "display-only": a map that returned its key for everything would satisfy
    // every key-preservation assertion above while shipping an untranslated UI. Assert real
    // divergence on the whole set, so a half-populated map cannot pass.
    const untranslatedCategories = CANONICAL_CATEGORY_SLUGS.filter(
      (slug) => getCategoryDisplayName(slug, 'fr') === getCategoryDisplayName(slug, 'en')
    );
    // A handful of category names are genuinely identical in both languages (proper nouns,
    // borrowed words); the guard is that this is the exception, not the rule.
    expect(untranslatedCategories.length).toBeLessThan(CANONICAL_CATEGORY_SLUGS.length / 4);

    const topicKeys = Object.keys(TOPIC_DISPLAY_NAMES.fr);
    const echoedTopics = topicKeys.filter((name) => getTopicDisplayName(name, 'fr') === name);
    expect(echoedTopics.length).toBeLessThan(topicKeys.length / 4);

    // An unmapped language falls back to the raw key — that IS the contract, pinned so a future
    // change to the fallback (returning `undefined`, throwing) fails here rather than on screen.
    expect(getTopicDisplayName('Habit Formation', 'de')).toBe('Habit Formation');
  });
});
