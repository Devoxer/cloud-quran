/**
 * Story 24.14 — THE resolver for a book's displayed title/subtitle. Every surface that renders
 * either one reads through here; no site indexes `titleFr` by hand.
 *
 * Why one function rather than "just read `book.titleFr ?? book.title`" at each site: the attribute
 * name is per-language (`LOCALIZED_BOOK_ATTRS`), so a hand-written read hard-codes French into a
 * screen — and the fallback rule (present-and-non-empty, else the base value) is the kind of thing
 * that gets written three ways across fifteen files. Nineteen query sites feed these, and their
 * `fields` projections are load-bearing and unchecked by tsc; keeping the READ in one place is what
 * makes "which surfaces show a translated title?" a question with an answer.
 *
 * ⚠️ NOT GATED ON `availableLanguages` (§ D3). A title is metadata about the book; a language is a
 * rendering of it. Gating display on the publish certificate would re-couple the two and would need
 * that field projected into every shelf query for no user benefit. Accepted consequence: a library
 * book not yet published in French still shows its French title. Discovery surfaces are unaffected
 * — they already filter to the published set.
 *
 * ⚠️ The base language has no localized attributes at all (`LOCALIZED_BOOK_ATTRS` omits `en`), so
 * under `en` both functions are exactly `book.title` / `book.subtitle`.
 */

import { LOCALIZED_BOOK_ATTRS, type LocalizedBookAttr } from '@cloudquran/shared';

/**
 * The minimum a book row must carry to resolve a display title. Deliberately structural, not
 * `Book`: most call sites hold a FIELD-PROJECTED row (structurally narrower than `Book` — see
 * `useSearch`'s header), and the download path holds a hand-built row that never came from a query
 * at all.
 *
 * ⚠️ NO index signature — that would make every caller's own `interface` fail to match
 * (`DownloadBookInput`, the projected rows), which is exactly the set of call sites this resolver
 * exists for. The localized attributes come in as an OPTIONAL mapped type DERIVED from
 * `LocalizedBookAttr`, so a literal `{ title, titleFr }` fixture typechecks, adding a language
 * widens it automatically, and no French attribute name is ever hardcoded outside the shared map.
 * The read itself still goes through one narrow cast inside {@link localized}, because the
 * attribute NAME is only known at runtime.
 */
export type LocalizableBook = {
  title?: string | null;
  subtitle?: string | null;
} & Partial<Record<LocalizedBookAttr, string | null>>;

/** Read one localized attribute, treating an absent/blank/non-string value as "not translated". */
function localized(book: LocalizableBook, attr: string | undefined): string | undefined {
  if (!attr) return undefined;
  const value = (book as Record<string, unknown>)[attr];
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

/**
 * The book's title in `language`: the translated one when present, else `books.title`.
 *
 * OVERLOADED on whether the row's own `title` is required. A row that guarantees a `title` gets a
 * `string` back — which is what lets this be dropped in wherever `book.title` was read before,
 * with no `?? ''` churn at fifteen call sites. A partial row (a projection, an offline synthetic,
 * a still-loading `book?`) gets `string | undefined`, and callers that need a guaranteed string
 * keep their own last-resort copy — a UI decision, not this module's.
 */
export function displayTitle(book: LocalizableBook & { title: string }, language: string): string;
export function displayTitle(book: LocalizableBook, language: string): string | undefined;
export function displayTitle(book: LocalizableBook, language: string): string | undefined {
  return localized(book, LOCALIZED_BOOK_ATTRS[language]?.title) ?? book.title ?? undefined;
}

/**
 * The book's subtitle in `language`: the translated one when present, else `books.subtitle`.
 *
 * Overloaded on the same principle as {@link displayTitle}: a row whose `subtitle` is a required
 * `string` gets a `string` back, so the resolver can be dropped in wherever the raw field was read
 * without forcing a `?? ''` at the call site.
 */
export function displaySubtitle(
  book: LocalizableBook & { subtitle: string },
  language: string
): string;
export function displaySubtitle(book: LocalizableBook, language: string): string | undefined;
export function displaySubtitle(book: LocalizableBook, language: string): string | undefined {
  return localized(book, LOCALIZED_BOOK_ATTRS[language]?.subtitle) ?? book.subtitle ?? undefined;
}
