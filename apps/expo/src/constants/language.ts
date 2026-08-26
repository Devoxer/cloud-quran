/**
 * Language constants (Story 20.3) — a LEAF module, deliberately dependency-free.
 *
 * `BASE_LANGUAGE` used to live in `lib/contentRead.ts`, and `lib/contentLanguage.ts` reading it
 * from there had two costs worth removing:
 *
 *  1. **A heavy graph for one string.** Every consumer of the language PREFERENCE (the picker
 *     screens, `playbackSource`) pulled the whole content-resolution module — `dbHooks`,
 *     `entitlementMirror`, `contentUrl`, `errors` — for a two-character constant.
 *  2. **A silent-`undefined` footgun in tests.** Any suite that `jest.mock`s `@/lib/contentRead`
 *     (three already do) dropped `BASE_LANGUAGE` unless it happened to re-declare it, so
 *     `getContentLanguage()` returned `undefined` and every downstream query filtered on
 *     `language: undefined` — wrong, and silently so.
 *
 * Keeping it here makes the constant unmockable-by-accident. This is the SINGLE source — there is
 * deliberately no compat re-export from `lib/contentRead.ts` (every importer takes it from here),
 * because a second export path is exactly how a future module would re-acquire the footgun above.
 */

/**
 * The base content language — the floor of the `requested → preferred → en` resolution chain
 * (`resolveContentLanguage`), the target of the whole-section-atomic language fallback, the floor
 * `lib/language.ts` normalizes an unset/unshipped preference to, and the one language always
 * present in the picker's option set.
 *
 * Since Story 20.6 offline downloads are NO LONGER pinned here — every offline file carries its
 * language in the filename and follows the selected language (§ D4).
 */
export const BASE_LANGUAGE = 'en';

/**
 * The languages this BUILD offers (Story 24.13 § D1) — the exposure gate, and the ONE lever that
 * turns a language on for users.
 *
 * ⚠️ This is deliberately a SEPARATE constant from `AVAILABLE_UI_LANGUAGES`, not a reuse of it.
 * `locales/fr` already ships (Story 20.4 authored the chrome ahead of the catalog), so reusing the
 * bundle set would expose French the moment 24.13 merged — at 12 translated books.
 * "Do we ship chrome for this?" (`isAvailableLanguage`) is a strictly WEAKER claim than "do we
 * offer it?".
 *
 * ⚠️ MUST BE A SUBSET OF `AVAILABLE_UI_LANGUAGES` — pinned by a test (`language.test.ts`), because
 * nothing validates it at runtime. Being compile-time is the whole point (it lets the synchronous
 * getter consult it, which a live DB query never could — that is what makes the device seed safe
 * where 20.3 Step I found it unsafe), and the cost of that is no runtime guard: expose a code whose
 * bundle doesn't ship and `initI18n` hands i18next a language with no resources, rendering the
 * ENTIRE app through `fallbackLng` from one plausible one-line edit.
 *
 * Adding a language is one line, in the release that ships its chrome — which Story 20.4's
 * just-in-time rule already required, so this is not a new release burden. The bar owner decision 6
 * set was roughly 100 books, on the reasoning that Discover is Categories → Topics → Popular →
 * grid, so at a dozen books most category taps return 0–2 results.
 *
 * ⚠️ `fr` WAS EXPOSED AT 12 COMPLETE BOOKS (2026-07-26), BELOW THAT BAR — an explicit owner
 * override to ship the app now, made knowing the thin-catalog cost. ONE thing bounds it: the TTS
 * run was completing ~24 books/hour, so the catalog fills in behind the flag rather than staying
 * thin.
 *
 * ⚠️ `es` WAS EXPOSED AT 131 CONTENT-COMPLETE BOOKS (2026-08-16, Story 36.5) — above the bar, and
 * an order of magnitude above what `fr` shipped at. Its text was already complete corpus-wide
 * (2,772 books), so the number is the audio/publish gate rather than translation, and the catalog
 * run behind it was converging on the full corpus. Discover reads `availableLanguages` live, so
 * coverage grows in the SHIPPED build with no further release.
 *
 * ⚠️ IT USED TO CITE A SECOND BOUND — "the picker shows an honest per-language count, so nobody is
 * misled about what is there" — AND AN ESCAPE HATCH, `contentLanguages.released = false` to pull
 * French back with one admin write and no app release. STORY 24.16 REMOVED BOTH, deliberately, so
 * this paragraph must not keep claiming them:
 *   • The per-language count is GONE from the picker (§ Decisions 2). A row shows its endonym and
 *     nothing else, so exposing a thin language is no longer softened by disclosure.
 *   • `released` is DELETED. It was never the safety net it read as — measured at 24.13 Step G, it
 *     was consulted in exactly ONE place (the picker's option set) and could not be consulted
 *     anywhere else: `resolveLanguage`, `deviceSeedLanguage`, `getLanguage`, `useLanguage` and the
 *     discovery filter are all synchronous by design, and `released` was an async DB read. So it
 *     never stopped a language being SERVED to a user already on it, and never stopped a
 *     device-locale SEED (a fresh install on a French-locale phone seeded to `fr` regardless) —
 *     which is the population the ~100-book bar was actually about. Meanwhile, being declared
 *     REQUIRED in the schema, it made CREATING a registry row impossible: it BLOCKED adding a
 *     language end to end. A lever that cannot do the job it names, and blocks a job it does not,
 *     is worth less than nothing.
 *
 * So the ONLY way to un-expose a language is what it always really was: a one-line edit HERE plus
 * a release. Exposure is this constant and nothing else — there is deliberately NO numeric
 * threshold in code, and no runtime override.
 */
// ⚠️ Adding a language whose alphabet contains `ø ł đ ı ß æ œ` ALSO requires extending
// `foldForSearch` in `app/(tabs)/(discover)/filters.tsx`: NFD cannot decompose those letters, so
// its `\p{Diacritic}` strip is a no-op for them and filter search would miss the words that use
// them. Latent today — none of them occurs in English or French (Story 24.27).
/*
 * ⚠️ EXPOSING A LANGUAGE ALSO OWES ONE PRE-GENERATED ARTIFACT (Story 24.25), minted by the content
 * pipeline per language:
 *
 *   pnpm generate-content --build-quote-bundle --language <code>   → a COMMITTED app asset
 *
 * It IS guarded: `features/quotes/data/bundles.test.ts` reads THIS constant and goes red for any
 * exposed language with no committed, non-empty bundle. So the artifact cannot be forgotten.
 *
 * ⚠️ This block used to name a SECOND, UNGUARDED artifact — `--build-pools`, the cross-book quiz
 * pool — and warned that skipping it shipped a permanently empty Quizzes hub. **Story 24.30 deleted
 * that flag and the pool with it**: a cross-book round is assembled LIVE from the per-book
 * `quizQuestions` banks, so there is nothing to pre-mint and no way to forget it. What a new
 * language DOES need for quizzes is ordinary content coverage — books published in that language
 * with a `quizQuestions` bank. A scope with none lands on the runner's empty state, which is the
 * same honest surface a French reader already sees for a category with no French books.
 */
// Story 5-1 Design Note 2 and PRD NFR29: keep i18next and `lint:i18n`, route strings through
// `t()`, and ship EXACTLY ONE locale. The es/fr bundles are wisdom-fruits' book-app copy; they
// stay on disk so the parity gate keeps working and so adding a real locale later is a
// translation job rather than a retrofit, but they are not offered in the picker.
export const EXPOSED_LANGUAGES: readonly string[] = ['en'];

/**
 * Endonyms for the languages the app ships chrome for — the fallback label each option shows in
 * the language picker, in that language's own script ("Français", not "French").
 *
 * These are DATA, not copy, so they are deliberately NOT extracted through `t()`: a language's
 * own name does not change with the active language. Since Story 24.16 this map is the SOLE
 * source of a picker row's label — the DB's admin-written `contentLanguages.nativeName` was
 * deleted, because it was a second authority that could only ever disagree with the bundle (and
 * `language.test.ts` pins an entry here for every `AVAILABLE_UI_LANGUAGES` code, so a shipped
 * language always has a name).
 *
 * Add an entry each time a language's chrome is authored (just-in-time, alongside its content and
 * TTS — `tools/content-pipeline/translate-ui-bundle.ts`). A code with no entry falls back to the
 * code itself, so a missing entry degrades to a row labelled `"de"` rather than a blank one —
 * a soft failure, which is why `language.test.ts` asserts every `AVAILABLE_UI_LANGUAGES` code has
 * one. This is a lookup map read by key; its declaration order affects nothing (the picker's
 * on-screen order is `resources.ts`'s declaration order, documented there).
 */
export const UI_LANGUAGE_NATIVE_NAMES: Readonly<Record<string, string>> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
};

/**
 * The endonym for a UI-language code, falling back to the code itself.
 *
 * ENDONYMS ARE DELIBERATELY NOT TRANSLATED — "Français" is "Français" in every UI language; that
 * is the whole point of a language picker (a user who cannot read the current UI must still find
 * their own language). The name trips `lint-i18n` sink 6, which is why the carve-out is explicit.
 */
// lint-i18n-ok: endonyms are identical in every locale by design
export function uiLanguageLabel(code: string): string {
  return UI_LANGUAGE_NATIVE_NAMES[code] ?? code;
}
