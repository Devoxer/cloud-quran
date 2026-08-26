// Story 24.14 — the LOCALIZED BOOK DISPLAY METADATA contract: which `books` attribute holds the
// translated title/subtitle for a given content language.
//
// ⚠️ THE MAP IS EXPLICIT, NOT DERIVED. A `title${capitalize(lang)}` helper would be one line
// shorter and strictly worse: an explicit map is tsc-checkable at every call site, survives a
// region-tagged code (`pt-BR` has no sane camel-case form), and puts the true cost of a language —
// exactly TWO columns — in one readable place instead of hiding it behind a string template.
//
// The BASE language (`en`) is deliberately ABSENT: its display metadata IS `books.title` /
// `books.subtitle`, so there is never a second copy of an English title and the two can never
// disagree. `localizedBookFields('en')` is therefore `[]` — a base-language query projects exactly
// what it projected before this story.
//
// Adding a language is: two `.indexed().optional()` attributes in `instant.schema.ts`, one entry
// here, and its `EXPOSED_LANGUAGES` line. `language.test.ts` (in the app, where `EXPOSED_LANGUAGES`
// lives) asserts every non-base exposed language has an entry here, so a language exposed without
// its columns fails the regression net rather than silently rendering English titles.

const ATTRS_BY_LANGUAGE = {
  fr: { title: 'titleFr', subtitle: 'subtitleFr' },
  es: { title: 'titleEs', subtitle: 'subtitleEs' },
} as const;

/**
 * Every `books` attribute name any language's display metadata can live in — derived from the map
 * above, never written out by hand.
 *
 * It is a literal UNION rather than `string` because that is what makes a `fields` projection
 * typecheck: InstaQL constrains `fields` to `ValidFieldNames<schema>`, so a `string[]` spread into
 * a projection is rejected at every one of the nineteen call sites. Deriving the union means
 * adding a language keeps that guarantee automatically — and misspelling an attribute here is a
 * tsc error at the schema boundary rather than a silently-empty column at runtime.
 */
export type LocalizedBookAttr = (typeof ATTRS_BY_LANGUAGE)[keyof typeof ATTRS_BY_LANGUAGE][
  | 'title'
  | 'subtitle'];

/** Content-language code → the `books` attributes holding its translated display metadata. */
export const LOCALIZED_BOOK_ATTRS: Record<
  string,
  { title: LocalizedBookAttr; subtitle: LocalizedBookAttr } | undefined
> = ATTRS_BY_LANGUAGE;

/**
 * The attribute names to add to a `books` query's `fields` projection so the active language's
 * display metadata arrives with the row. Empty for the base language (and for any language with no
 * entry — such a query simply falls back to `books.title`/`books.subtitle`).
 *
 * ⚠️ Returns BOTH attributes, even for a surface that renders only the title. The pair is ~51
 * characters of subtitle per row (measured at Step A) and keeping it one indivisible unit is what
 * makes the rule at every call site a single question — *does this surface render localized book
 * metadata?* — rather than a per-field audit that drifts the day a card grows a subtitle line.
 * A projection must stay a SUPERSET of what its consumers render (see `useSearch`'s header: tsc
 * cannot check a `fields` list), so over-fetching one short string is the safe direction.
 */
export function localizedBookFields(language: string): LocalizedBookAttr[] {
  const attrs = LOCALIZED_BOOK_ATTRS[language];
  return attrs ? [attrs.title, attrs.subtitle] : [];
}
