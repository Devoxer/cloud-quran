/**
 * Canonical book-category taxonomy — the SINGLE source of truth (Story 26.4).
 *
 * Collapses the two tables that previously drifted:
 *   • the pipeline's `TAXONOMY_CATEGORIES` (35 slugs `matchCategory` admits), and
 *   • the expo `CATEGORY_DISPLAY_NAMES` / `CATEGORY_ICONS` (44 slugs — 35 canonical + 9 phantom
 *     alias slugs the pipeline never emitted).
 * Both now import from here, keyed by CANONICAL slug only. Aliases resolve through
 * `canonicalizeCategorySlug` (a FORWARD guard: the live 26.4 audit found ZERO alias rows in the
 * DB, so nothing to migrate — this just stops future ingestion from re-introducing an alias or,
 * as `matchCategory` did before, silently DROPPING an alias-tagged book's category).
 *
 * `slug` matches `instant.schema.ts` `categories.slug`. No two canonical slugs share a display
 * name (enforced by the 26.4 unit test) → a display-name React key stays collision-free.
 */

import {
  CATEGORY_DISPLAY_NAMES_ES,
  CATEGORY_SHORT_NAMES_ES,
  TOPIC_DISPLAY_NAMES_ES,
} from './taxonomy-es.js';
import {
  CATEGORY_DISPLAY_NAMES_FR,
  CATEGORY_SHORT_NAMES_FR,
  TOPIC_DISPLAY_NAMES_FR,
} from './taxonomy-fr.js';

/**
 * The 35 canonical category slugs `matchCategory` admits. ORDER IS SIGNIFICANT: it drives the
 * generation metadata prompt's category list (tools/content-pipeline/lib/local-batch.ts) — keep
 * it stable so a reorder doesn't churn the prompt.
 *
 * ⚠️ NEVER DELETE A SLUG BECAUSE IT CURRENTLY HAS ZERO BOOKS — this list is the classifier's
 * INPUT, not a projection of the catalog, so removing an empty category makes its emptiness
 * self-fulfilling and PERMANENT. The list is injected verbatim into the metadata prompt
 * (`local-batch.ts:704`, "You MUST select ONLY from these predefined lists") and is the admission
 * gate in `matchCategory` (`:688` — a non-listed slug returns null and the book's category is
 * DROPPED). Delete `fiction-romance` and the model is never offered it again; a romance book is
 * mis-filed or loses its category, and no future sync can re-add the slug. Leaving an empty
 * category costs one "nothing here yet" tile and self-heals the moment a matching book syncs.
 * (Story 24.30 — `comics-graphic` and `fiction-romance` measured at 0 books in en AND fr on
 * 2026-08-02; kept deliberately.)
 */
export const CANONICAL_CATEGORY_SLUGS = [
  'art-design',
  'biography-memoir',
  'business',
  'career',
  'children-ya',
  'comics-graphic',
  'cooking-food',
  'economics-finance',
  'education',
  'fiction-literary',
  'fiction-mystery',
  'fiction-romance',
  'fiction-scifi-fantasy',
  'fiction-historical',
  'health-wellness',
  'history',
  'home-lifestyle',
  'humor',
  'leadership',
  'marketing-sales',
  'mindfulness',
  'nature-environment',
  'parenting-family',
  'personal-development',
  'philosophy',
  'politics-society',
  'psychology',
  'religion',
  'science',
  'sports-fitness',
  'technology',
  'travel',
  'true-crime',
  'communication',
  'relationships',
] as const;

export type CanonicalCategorySlug = (typeof CANONICAL_CATEGORY_SLUGS)[number];

const CANONICAL_SET = new Set<string>(CANONICAL_CATEGORY_SLUGS);

/** True when `slug` is one of the 35 canonical category slugs. */
export function isCanonicalCategorySlug(slug: string): boolean {
  return CANONICAL_SET.has(slug);
}

/**
 * Alias slug → canonical slug (forward guard; keys are lowercase). Covers the exact display-name
 * collisions (`nature`/`nature-environment`, `parenting`/`parenting-family`), the title-case
 * collision (`literary-fiction`→`fiction-literary`), and the near-duplicate concepts the two
 * historical tables diverged on. `productivity` is intentionally ABSENT — it has no clear
 * canonical home, so (unchanged from today) an incoming `productivity` slug is dropped by
 * `matchCategory` rather than mis-filed under a wrong canonical.
 */
export const ALIAS_TO_CANONICAL: Record<string, CanonicalCategorySlug> = {
  nature: 'nature-environment',
  parenting: 'parenting-family',
  'literary-fiction': 'fiction-literary',
  'mindfulness-spirituality': 'mindfulness',
  money: 'economics-finance',
  politics: 'politics-society',
  society: 'politics-society',
  'self-help': 'personal-development',
  sports: 'sports-fitness',
};

/**
 * Normalize any incoming category slug to its canonical form (case-insensitive on the alias key).
 * A canonical or unknown slug passes through unchanged. AC-2's source-side guard hangs on this.
 */
export function canonicalizeCategorySlug(slug: string): string {
  // Null-guard: this is exported from the shared barrel and consumed on UNTYPED model output
  // (the pipeline's matchCategory) where a null/undefined category can slip past the `string`
  // type. A missing slug should drop through as-is, never throw a TypeError up the call chain.
  if (!slug) return slug;
  return ALIAS_TO_CANONICAL[slug.toLowerCase()] ?? slug;
}

/**
 * Canonical slug → English display name. One entry per canonical slug.
 *
 * Story 24.14 (§ D6): this is now the BASE row of {@link CATEGORY_DISPLAY_NAMES}, which carries
 * the per-language dimension. Kept as its own export because it is the English fallback every
 * other language resolves through — that is the whole reason, and it is enough. (Step I: this
 * comment also claimed the pipeline's taxonomy audit reads it; `audit-taxonomy-26-4.ts` hardcodes
 * its own copy and imports nothing from this package.)
 */
export const CATEGORY_DISPLAY_NAMES_EN: Record<string, string> = {
  'art-design': 'Art & Design',
  'biography-memoir': 'Biography & Memoir',
  business: 'Business',
  career: 'Career',
  'children-ya': 'Children & YA',
  'comics-graphic': 'Comics & Graphic',
  communication: 'Communication',
  'cooking-food': 'Cooking & Food',
  'economics-finance': 'Economics & Finance',
  education: 'Education',
  'fiction-literary': 'Literary Fiction',
  'fiction-mystery': 'Mystery & Thriller',
  'fiction-romance': 'Romance',
  'fiction-scifi-fantasy': 'Sci-Fi & Fantasy',
  'fiction-historical': 'Historical Fiction',
  'health-wellness': 'Health & Wellness',
  history: 'History',
  'home-lifestyle': 'Home & Lifestyle',
  humor: 'Humor',
  leadership: 'Leadership',
  'marketing-sales': 'Marketing & Sales',
  mindfulness: 'Mindfulness',
  'nature-environment': 'Nature & Environment',
  'parenting-family': 'Parenting & Family',
  'personal-development': 'Personal Development',
  philosophy: 'Philosophy',
  'politics-society': 'Politics & Society',
  psychology: 'Psychology',
  relationships: 'Relationships',
  religion: 'Religion',
  science: 'Science',
  'sports-fitness': 'Sports & Fitness',
  technology: 'Technology',
  travel: 'Travel & Adventure',
  'true-crime': 'True Crime',
};

/** Canonical slug → emoji icon. One entry per canonical slug. */
export const CATEGORY_ICONS: Record<string, string> = {
  'art-design': '🎨',
  'biography-memoir': '📖',
  business: '💼',
  career: '🎯',
  'children-ya': '🧸',
  'comics-graphic': '💥',
  communication: '🗣️',
  'cooking-food': '🍳',
  'economics-finance': '📊',
  education: '🎓',
  'fiction-literary': '📚',
  'fiction-mystery': '🔍',
  'fiction-romance': '💕',
  'fiction-scifi-fantasy': '🚀',
  'fiction-historical': '🏛️',
  'health-wellness': '💪',
  history: '📜',
  'home-lifestyle': '🏡',
  humor: '😄',
  leadership: '👑',
  'marketing-sales': '📣',
  mindfulness: '🧘',
  'nature-environment': '🌿',
  'parenting-family': '👨‍👩‍👧',
  'personal-development': '🧭',
  philosophy: '💭',
  'politics-society': '⚖️',
  psychology: '🧠',
  relationships: '❤️',
  religion: '🕊️',
  science: '🔬',
  'sports-fitness': '🏋️',
  technology: '💻',
  travel: '✈️',
  'true-crime': '🕵️',
};

/**
 * Language → that language's canonical-slug → display-name map. Story 24.14 (§ D6).
 *
 * Adding a language is one row here plus one in `TOPIC_DISPLAY_NAMES`. A language with no row
 * falls back to English rather than rendering a raw slug.
 */
export const CATEGORY_DISPLAY_NAMES: Record<string, Record<string, string>> = {
  en: CATEGORY_DISPLAY_NAMES_EN,
  es: CATEGORY_DISPLAY_NAMES_ES,
  fr: CATEGORY_DISPLAY_NAMES_FR,
};

/** Topic NAME (the English query key) → display name, per language. Story 24.14 (§ D6). */
export const TOPIC_DISPLAY_NAMES: Record<string, Record<string, string>> = {
  es: TOPIC_DISPLAY_NAMES_ES,
  fr: TOPIC_DISPLAY_NAMES_FR,
};

/**
 * Convert a category slug to its display name in `language`: canonicalize → the language's map →
 * English → title-case fallback.
 *
 * ⚠️ `language` is REQUIRED, not an optional English default. An optional parameter would let a
 * missed call site render English with no tsc signal — which is precisely the defect this story
 * exists to remove, and it would be re-introduced silently by the next screen anyone adds. Making
 * it required means the compiler walks every call site for you.
 *
 * The title-case fallback stays only as a genuine last-resort safety net (every live/canonical slug
 * has a real English entry), never as the effective mapping for a known slug.
 */
export function getCategoryDisplayName(slug: string, language: string): string {
  const canon = canonicalizeCategorySlug(slug);
  const mapped = CATEGORY_DISPLAY_NAMES[language]?.[canon] ?? CATEGORY_DISPLAY_NAMES_EN[canon];
  if (mapped) return mapped;
  return canon
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Display name for a topic in `language`.
 *
 * ⚠️ THE ARGUMENT IS THE QUERY KEY. `topics.name` is what every filter passes to
 * `where: { 'topics.name': … }`, so this translates for DISPLAY only and the caller must keep
 * handing the raw English `name` to its press handler and `testID`. The highest-risk shape is
 * `discover.tsx`'s popular-topics row, where the label and the query key were literally the same
 * identifier.
 *
 * A topic with no entry falls back to its English name, so a newly-ingested topic degrades to one
 * English chip rather than a blank one.
 */
export function getTopicDisplayName(name: string, language: string): string {
  return TOPIC_DISPLAY_NAMES[language]?.[name] ?? name;
}

/** Emoji icon for a category slug: canonicalize → look up → 📘 fallback. */
export function getCategoryIcon(slug: string): string {
  return CATEGORY_ICONS[canonicalizeCategorySlug(slug)] ?? '📘';
}

/**
 * Short ENGLISH labels for the icon-on-top category cards (Discover quick-filters + book-detail
 * category cards) — avoids truncation on a narrow card. Only the long names need an entry;
 * everything else falls back to the full display name. Keyed by CANONICAL slug.
 *
 * Story 24.14 (§ D6): the base row of {@link CATEGORY_SHORT_NAMES}. French needs its OWN entries
 * rather than a fallback to the (longer) full French name — see `taxonomy-fr.ts`.
 */
export const CATEGORY_SHORT_NAMES_EN: Record<string, string> = {
  'personal-development': 'Personal Dev',
  'politics-society': 'Politics',
};

/**
 * Language → the short card labels for that language. Story 24.14 (§ D6).
 *
 * ⚠️ THIS is the map users actually READ on the icon-on-top cards: `discover.tsx` and
 * `BookDetailContent.tsx` render `getCategoryShortName(...)` and use the full display name only as
 * the `accessibilityLabel`. So a language with translated FULL names but no SHORT ones would show
 * its long French labels truncated on the very cards the short names exist for.
 */
export const CATEGORY_SHORT_NAMES: Record<string, Record<string, string>> = {
  en: CATEGORY_SHORT_NAMES_EN,
  es: CATEGORY_SHORT_NAMES_ES,
  fr: CATEGORY_SHORT_NAMES_FR,
};

/**
 * Short card label for a category slug in `language`: canonicalize → the language's own short
 * override → that language's full display name.
 *
 * ⚠️ It falls back to the SAME language's full name, never to English's short name — a mixed
 * "Développement personnel" card sitting beside a "Politics" one is worse than either alone.
 */
export function getCategoryShortName(slug: string, language: string): string {
  const canon = canonicalizeCategorySlug(slug);
  return CATEGORY_SHORT_NAMES[language]?.[canon] ?? getCategoryDisplayName(slug, language);
}

/** All canonical category slugs (for filtering/validation). Mirrors the old expo `CATEGORY_IDS`. */
export const CATEGORY_IDS: string[] = [...CANONICAL_CATEGORY_SLUGS];
