/**
 * THE language preference — its normalization, the ATOMIC persist → changeLanguage →
 * rollback-on-reject contract, and the APP RELOAD a committed switch fires.
 *
 * Story 20.6 AC-1/AC-2/AC-14 authored this suite. **Story 24.13 § D1 changes what it normalizes
 * AGAINST and re-introduces the device seed 20.6 removed**, so the exposure blocks below are new
 * and the `getLanguage` block asserts the OPPOSITE of what it used to (see its own header).
 *
 * **Story 24.18 split the readers**, which is what decides where a case belongs here:
 * `getStoredLanguage()` = the MMKV preference (boot only), `getLanguage()`/`useLanguage()` = the
 * COMMITTED language (`i18n.language`, every runtime read). The stored-preference blocks were
 * re-homed onto the first; the committed blocks and `initI18n`'s boot pin are new. § `setLanguage`
 * is deliberately UNTOUCHED — its contract did not move, and that it still passes verbatim is the
 * evidence.
 *
 * ⚠️ `EXPOSED_LANGUAGES` is a compile-time constant, so exercising a genuine two-language switch
 * means overriding it — see {@link setExposed}. The switch-machinery suite (ticket / rollback /
 * pre-burst) is about reasoning that is INDEPENDENT of exposure, so it runs with `fr` exposed;
 * the exposure suites run against the shipped `['en']`.
 *
 * MMKV comes from the reactive in-memory mock in `jest.setup.js`; only the i18next singleton and
 * the native reload are stubbed.
 */

import { act, renderHook } from '@testing-library/react-native';
import i18n from 'i18next';

// The reload is stubbed on `globalThis.expo` in `jest.setup.js` — NOT as a `jest.mock('expo', …)`
// here, which would be inert (setup loads `@/i18n` → `lib/language` → `expo` first) and which broke
// the wider suite when tried. `expo`'s `reloadAppAsync` is a one-liner over this global, so the
// real function runs and lands on the stub. See that file's note for the three rejected forms.
const mockReloadAppAsync = (globalThis as unknown as { expo: { reloadAppAsync: jest.Mock } }).expo
  .reloadAppAsync;

// Story 24.27 DELETED the download sweep from the committed switch. This mock exists to prove it
// stays deleted: nothing in `lib/language` imports the module any more, so a future change that
// reinstates the sweep through the old lazy `require` seam is what makes the
// `not.toHaveBeenCalled()` assertions below go red. It also keeps `lib/storage` + `lib/instantdb`
// off this suite's module graph, which is why it is a factory and not a spy.
//
// ⚠️ Be honest about its REACH (Story 24.27 Step I): a STATIC re-import would NOT be caught here,
// for the same reason the two notes above and below this one describe — `jest.setup.js` loads
// `@/i18n` → `lib/language` before this file's factories register, so a static binding resolves to
// the real module and this factory never reaches it. A lazy `require` is evaluated per call and
// does land on it. Nothing headless covers the static case — do not read a green suite as proof of
// it; `lib/language.ts`'s header and a review round are what stand against that one.
// ⚠️ STORY 5-2 REMOVED A GUARD HERE, AND THIS NOTE IS WHAT REPLACES IT.
// This suite used to mock `./offlineTeardown` and assert, on two paths below, that a language
// change NEVER calls `deleteAllOfflineDownloads`. `lib/offlineTeardown.ts` was an InstantDB
// writer and went with the vendor, so the guard has no subject left to point at — and mocking a
// module that no longer exists is a suite that fails to run, not a guard.
//
// THE INVARIANT STILL HOLDS AND IS STILL LOAD-BEARING: switching language must not delete the
// user's downloaded audio. Every offline filename carries its own language, so the other
// language's files stay on disk, unreachable until you switch back — inert rather than stale.
// A sweep would silently destroy content the user waited on a slow connection for.
//
// Nothing headless covers it right now. Whoever reinstates offline downloads (epic 7) MUST
// re-pin it against whatever module owns the sweep then. Do not read this suite's green as
// evidence that a language change leaves downloads alone.

// ⚠️ A SPY, not a module factory — same reason as `setExposed` below: `jest.setup.js` loads
// `@/i18n` → `lib/language` → `lib/errors` before this file's factories register, so a factory
// never reaches the already-bound module. Babel's live property read is what makes the spy land.
// (Sentry itself is mocked globally, so the real `captureException` is inert here.)
let captureExceptionSpy: jest.SpyInstance;

import {
  CANONICAL_CATEGORY_SLUGS,
  CATEGORY_DISPLAY_NAMES,
  CATEGORY_SHORT_NAMES,
  LOCALIZED_BOOK_ATTRS,
  localizedBookFields,
  TOPIC_DISPLAY_NAMES,
} from '@cloudquran/shared';
import * as languageConstants from '@/constants/language';
import { BASE_LANGUAGE } from '@/constants/language';
import { POPULAR_TOPICS } from '@/constants/popularTaxonomy.generated';
import { initI18n } from '@/i18n';
import { getCachedContent, setCachedContent } from './contentCache';
import * as errors from './errors';
import {
  AVAILABLE_UI_LANGUAGES,
  deviceSeedLanguage,
  getLanguage,
  getStoredLanguage,
  isAvailableLanguage,
  isExposedLanguage,
  LANGUAGE_KEY,
  resolveLanguage,
  setLanguage,
  useLanguage,
} from './language';
import * as localization from './localization';
import { createAppMMKV } from './mmkv';

const storage = createAppMMKV('language-prefs');

// The REAL i18next singleton (jest.setup.js initializes it with the shipped bundles), so these
// tests exercise the actual `changeLanguage` contract rather than a stand-in.
let changeLanguageSpy: jest.SpyInstance;
let localeSpy: jest.SpyInstance;

/** The device locale `getCachedLocale()` reports; `undefined` = no locale readable. */
function setDeviceLocale(languageCode: string | undefined): void {
  localeSpy.mockReturnValue(
    languageCode === undefined
      ? null
      : {
          languageTag: languageCode,
          languageCode,
          regionCode: null,
          textDirection: 'ltr',
          timeZone: 'UTC',
        }
  );
}

/** The shipped value, restored after every test that overrides it. */
const REAL_EXPOSED = languageConstants.EXPOSED_LANGUAGES;

/**
 * Override the compile-time exposure set for one test.
 *
 * ⚠️ A plain assignment, NOT `jest.mock`/`jest.spyOn`. Babel compiles `export const X` to a
 * writable `exports.X` and every use site to a live `_language.X` property read, so assignment is
 * what actually reaches the already-loaded `lib/language` binding (the same reason `contentCache`
 * above needs a spy rather than a module factory — `jest.setup.js` loads this graph first).
 */
function setExposed(codes: readonly string[]): void {
  (languageConstants as { EXPOSED_LANGUAGES: readonly string[] }).EXPOSED_LANGUAGES = codes;
}

beforeEach(async () => {
  jest.clearAllMocks();
  storage.clearAll();
  setExposed(REAL_EXPOSED);
  localeSpy = jest.spyOn(localization, 'getCachedLocale');
  captureExceptionSpy = jest.spyOn(errors, 'captureException').mockImplementation(() => {});
  createAppMMKV('content-cache-free').clearAll();
  setDeviceLocale('en');
  // The i18next singleton is module state and SURVIVES between tests — a test that successfully
  // switches to `fr` would otherwise leave the next one asserting against a language it never set.
  await i18n.changeLanguage('en');
  changeLanguageSpy = jest.spyOn(i18n, 'changeLanguage');
});

afterEach(() => {
  setExposed(REAL_EXPOSED);
  changeLanguageSpy.mockRestore();
  localeSpy.mockRestore();
  captureExceptionSpy.mockRestore();
});

// `ja` is the "unshipped" sentinel throughout: `fr` became a REAL bundle in Story 20.4, so any
// assertion needing a code the app cannot render uses one from the far end of the TTS roadmap.
const UNSHIPPED = 'ja';
/** A SECOND unshipped sentinel. The overlap tests need two distinct non-moving switches (Story
 *  24.27 — a MOVING switch restarts instead of calling `changeLanguage`, so it can no longer
 *  exercise the ticket/rollback path at all). */
const UNSHIPPED2 = 'ko';

describe('AVAILABLE_UI_LANGUAGES', () => {
  it('is derived from the shipped bundles — `en` + `es` + `fr` today', () => {
    // Order matters: it IS the picker's on-screen order (see `i18n/resources.ts`).
    expect(AVAILABLE_UI_LANGUAGES).toEqual(['en', 'es', 'fr']);
  });
});

describe('EXPOSED_LANGUAGES — AC-1/AC-34, the exposure gate', () => {
  it('ships `en` only — the deliberate exposure set', () => {
    // ⚠️ A CHANGE HERE IS A RELEASE DECISION, never incidental.
    //
    // Cloud Quran ships ONE locale. Story 5-1's Design Note 2 kept i18next and `lint:i18n` —
    // because routing strings through `t()` from the start is cheap and retrofitting it across a
    // finished app is not — while PRD NFR29 makes the interface English-only. The `es`/`fr`
    // bundles inherited from wisdom-fruits stay on disk so the parity gate keeps working, but
    // they are not offered: `AVAILABLE_UI_LANGUAGES` (what i18next can render) and
    // `EXPOSED_LANGUAGES` (what we OFFER) have deliberately come apart here, which is exactly
    // why the next test insists they stay separate constants.
    //
    // If this fails unexpectedly, a language went live (or dark) by accident.
    expect(REAL_EXPOSED).toEqual(['en']);
  });

  it('stays a SEPARATE constant from AVAILABLE_UI_LANGUAGES even when the values coincide', () => {
    // The two happen to be equal today because every shipped bundle is now exposed — but they
    // answer different questions and must not be merged. `AVAILABLE_UI_LANGUAGES` is "can i18next
    // render this"; `EXPOSED_LANGUAGES` is "do we OFFER it". Reusing the bundle set is exactly how
    // the next language would go live the moment its chrome landed, before its catalog existed.
    expect(REAL_EXPOSED).not.toBe(AVAILABLE_UI_LANGUAGES);
    setExposed(['en']);
    expect(isAvailableLanguage('fr')).toBe(true); // bundle still ships…
    expect(isExposedLanguage('fr')).toBe(false); // …while exposure is independently off
  });

  it('⊆ AVAILABLE_UI_LANGUAGES — a language can never be exposed without its chrome bundle', () => {
    // ⚠️ THE fail-closed invariant (AC-34). Nothing validates this at runtime — being compile-time
    // is exactly what lets the synchronous getter consult it — so expose a code whose `locales/`
    // bundle doesn't ship and `initI18n` hands i18next a language with no resources: the ENTIRE app
    // renders through `fallbackLng`, from one plausible one-line edit (the very edit this design
    // makes routine). This assertion is what turns that into a red test.
    expect(REAL_EXPOSED.every((code) => isAvailableLanguage(code))).toBe(true);
  });

  it('every exposed non-base language has its `books` display-metadata columns (Story 24.14)', () => {
    // ⚠️ THE OTHER HALF OF "ADDING A LANGUAGE", and the one with no runtime signal at all. Exposing
    // a code whose `LOCALIZED_BOOK_ATTRS` entry is missing does not crash and does not warn: every
    // `localizedBookFields(code)` returns `[]`, every projection silently omits the columns, and
    // `displayTitle` falls back to `books.title` — so the app ships a fully translated body under
    // an English title on every list, grid, search row, player and lock screen. That is exactly the
    // defect this story exists to remove, re-introduced by the same one-line edit that adds the
    // next language. Pin it here, beside the ⊆-chrome invariant it mirrors.
    const missing = REAL_EXPOSED.filter(
      (code) => code !== BASE_LANGUAGE && !(code in LOCALIZED_BOOK_ATTRS)
    );
    expect(missing).toEqual([]);
  });

  it('every exposed non-base language has its TAXONOMY label rows (Story 24.14 Step G)', () => {
    // ⚠️ The SAME class as the `LOCALIZED_BOOK_ATTRS` invariant above, on the other display
    // authority — and it was unguarded: a language could be exposed with its two `books` columns
    // and pass the whole net while every category chip, topic chip, filter label, quiz-hub tile
    // and stats label rendered English. `CATEGORY_SHORT_NAMES` is included because it is what the
    // icon-on-top cards actually render, and its fallback is the FULL display name — so a missing
    // short row does not degrade to a short English label, it degrades to a long one that
    // truncates, which is the whole reason the map exists.
    //
    // ⚠️ PRESENCE IS NOT ENOUGH (Step I). `code in MAP` is satisfied by `de: {}`, so the guard as
    // first written would have passed a language shipped with three EMPTY maps — the exact outcome
    // it exists to prevent, since a missing key falls back to the English label just as silently as
    // a missing map. The completeness assertions that would have caught it live in
    // `packages/shared/taxonomy.test.ts` and are hard-coded to `.fr`, so they do not generalize to
    // the next language either. Assert COVERAGE here, per exposed language.
    const nonBase = REAL_EXPOSED.filter((code) => code !== BASE_LANGUAGE);

    // ⚠️ ANTI-VACUITY, RESHAPED — NOT DELETED. Every assertion below is a
    // `filter(...).toEqual([])`, which an empty `nonBase` satisfies trivially. The original
    // guard was `expect(nonBase.length).toBeGreaterThan(0)`, which held while wisdom-fruits
    // exposed three languages. Cloud Quran exposes one (PRD NFR29), so `nonBase` is legitimately
    // empty and that assertion would now fail on a CORRECT tree — the classic way a fail-closed
    // check gets deleted rather than fixed.
    //
    // Instead: assert the reference set is still non-empty (it can go vacuous on its own, which
    // is a real bug), and make the English-only state EXPLICIT so this test starts enforcing
    // coverage again the moment a second language is exposed, rather than passing silently.
    expect(CANONICAL_CATEGORY_SLUGS.length).toBeGreaterThan(0);
    if (nonBase.length === 0) {
      expect(REAL_EXPOSED).toEqual([BASE_LANGUAGE]);
    }
    expect(nonBase.filter((code) => !(code in CATEGORY_DISPLAY_NAMES))).toEqual([]);
    expect(nonBase.filter((code) => !(code in TOPIC_DISPLAY_NAMES))).toEqual([]);
    expect(nonBase.filter((code) => !(code in CATEGORY_SHORT_NAMES))).toEqual([]);

    // Every canonical category slug, in every exposed non-base language. Reported as
    // `[code, slug]` pairs so a failure names the language AND the slug (jest's `expect` takes no
    // message argument — that is vitest, and this suite is jest-expo).
    const missingCats = nonBase.flatMap((code) =>
      CANONICAL_CATEGORY_SLUGS.filter((slug) => !CATEGORY_DISPLAY_NAMES[code]?.[slug]).map(
        (slug) => [code, slug] as const
      )
    );
    expect(missingCats).toEqual([]);

    // ⚠️ THE TOPIC REFERENCE IS `POPULAR_TOPICS`, NOT THE UNION OF THE MAPS (Step I round 3).
    // The union was `Object.values(TOPIC_DISPLAY_NAMES).flatMap(Object.keys)` — and
    // `TOPIC_DISPLAY_NAMES` holds exactly one row (`fr`), which is also the only entry in
    // `nonBase`. So the assertion reduced to `fr ⊇ union(fr)`: true by construction, unfailable,
    // and it would have passed a French map shipped with 200 of 240 entries. The anti-vacuity pin
    // above did not catch it because the set was non-empty — just self-referential.
    //
    // `POPULAR_TOPICS` is an INDEPENDENT, committed, English-keyed list (generated from the live
    // catalog) and it is exactly the set rendered as chips through `getTopicDisplayName`
    // (`discover.tsx`, `filters.tsx`), so a missing entry is a visibly English chip in a French
    // app — the defect this story exists to remove. Deriving the reference from the translations
    // themselves could never express that. (`CATEGORY_SHORT_NAMES` stays presence-only: it is a
    // deliberately PARTIAL override map for labels that would truncate.)
    expect(POPULAR_TOPICS.length).toBeGreaterThan(0);
    const missingTopics = nonBase.flatMap((code) =>
      POPULAR_TOPICS.filter((name) => !TOPIC_DISPLAY_NAMES[code]?.[name]).map(
        (name) => [code, name] as const
      )
    );
    expect(missingTopics).toEqual([]);
  });

  it('has no `books` display-metadata columns for the BASE language', () => {
    // The inverse drift, and it is not cosmetic: an `en` entry would make `localizedBookFields('en')`
    // non-empty, so every base-language query would project two attributes that do not exist —
    // and it would mean an English title had a second home that could disagree with `books.title`.
    // The base language's display metadata IS `books.title`/`books.subtitle`, by design.
    expect(LOCALIZED_BOOK_ATTRS[BASE_LANGUAGE]).toBeUndefined();
    expect(localizedBookFields(BASE_LANGUAGE)).toEqual([]);
  });

  it('does not gate on any numeric book threshold', () => {
    // Exposure is `EXPOSED_LANGUAGES` and nothing else — asserted structurally by the eligibility
    // predicate taking no count at all. (24.13 owner decision 6 said `bookCount` was DISPLAY-only
    // and `MIN_BOOKS_FOR_LANGUAGE` unimplemented; 24.16 deleted the attribute outright, so there is
    // no count anywhere to gate on — this assertion now pins the absence of a threshold that has
    // no possible input.)
    expect(isExposedLanguage.length).toBe(1);
  });
});

describe('resolveLanguage — AC-2: PURE, normalized against EXPOSED_LANGUAGES', () => {
  it('prefers a persisted value this build EXPOSES', () => {
    expect(resolveLanguage('en')).toBe('en');
  });

  it('floors a SHIPPED-BUT-NOT-EXPOSED code to the fallback', () => {
    // The self-repair property: a preference naming a language a later release un-exposes resolves
    // to the fallback at the next launch, synchronously, with no migration machinery. Exercised by
    // un-exposing `fr` — i.e. exactly what a kill-switch pull or a future release would do.
    setExposed(['en']);
    expect(resolveLanguage('fr')).toBe('en');
  });

  it('floors an UNSHIPPED persisted code to the fallback', () => {
    // An unknown/removed stored code must never reach i18next — it would resolve every key
    // through `fallbackLng` while `i18n.language` reported a language the app cannot render.
    expect(resolveLanguage(UNSHIPPED)).toBe('en');
  });

  it('floors an EMPTY string like it floors undefined', () => {
    // The `||`-not-`??` rule ported from `lib/contentLanguage.ts`: a corrupted MMKV entry must not
    // send `language: ''` into every `contentObjects` query (0 rows, then a permanent extra
    // full-namespace fallback query per book open / page turn / quiz).
    expect(resolveLanguage('')).toBe('en');
    expect(resolveLanguage(undefined)).toBe('en');
  });

  it('returns the CALLER-SUPPLIED fallback, defaulting to BASE_LANGUAGE', () => {
    setExposed(['en', 'fr']);
    expect(resolveLanguage(undefined, 'fr')).toBe('fr');
    expect(resolveLanguage('', 'fr')).toBe('fr');
    expect(resolveLanguage(UNSHIPPED, 'fr')).toBe('fr');
    // A stored EXPOSED value still wins over the fallback.
    expect(resolveLanguage('en', 'fr')).toBe('en');
    expect(resolveLanguage(undefined)).toBe('en');
  });

  it('is PURE — it never reads the device locale', () => {
    // ⚠️ Load-bearing (§ D1). `setLanguage`'s rollback asks the counterfactual "would an UNSET
    // preference already resolve to what is rendering?" and must ask it without a device read of
    // its own; the seed is therefore a PARAMETER. A device read inside here would also put
    // `getLocales()` on `lib/language`'s graph, which the module's leaf discipline forbids.
    setDeviceLocale('fr');
    setExposed(['en', 'fr']);
    expect(resolveLanguage(undefined)).toBe('en');
    expect(localeSpy).not.toHaveBeenCalled();
  });
});

describe('isAvailableLanguage / isExposedLanguage', () => {
  it('rejects null/undefined/unknown codes', () => {
    expect(isAvailableLanguage('en')).toBe(true);
    expect(isAvailableLanguage('fr')).toBe(true);
    expect(isAvailableLanguage(UNSHIPPED)).toBe(false);
    expect(isAvailableLanguage(undefined)).toBe(false);
    expect(isAvailableLanguage(null)).toBe(false);

    expect(isExposedLanguage('en')).toBe(true);
    expect(isExposedLanguage(UNSHIPPED)).toBe(false);
    expect(isExposedLanguage(undefined)).toBe(false);
    expect(isExposedLanguage(null)).toBe(false);
  });
});

describe('deviceSeedLanguage + getStoredLanguage — AC-3: the device locale SEEDS an unset preference', () => {
  // ⚠️ THIS REVERSES STORY 20.6, which asserted here that the device locale is NOT consulted.
  // 20.6's objection was that an ungated device-derived code would reach every `contentObjects`
  // query before the language was ready. 24.13 gates the seed on the COMPILE-TIME
  // `EXPOSED_LANGUAGES`, which the synchronous getter can consult — so a French-locale phone gets
  // French only when the app was BUILT with French exposed. That is the whole design.
  //
  // ⚠️ RE-HOMED ONTO `getStoredLanguage()` BY STORY 24.18, NOT WEAKENED. Every case below asserts
  // STORED-PREFERENCE resolution — device seeding, "a stored preference wins", unexposed
  // normalization — which is exactly what `getStoredLanguage()` now owns; `getLanguage()` moved to
  // the COMMITTED language (`i18n.language`). Four of these would go red unchanged, because
  // `jest.setup.js` boots the real i18next on `en` for every suite, so the committed reader
  // answers `en` whatever the device locale is. Re-pointing preserves their meaning verbatim;
  // weakening them to match would have deleted the coverage instead.

  it('adopts the device language when this build EXPOSES it', () => {
    setExposed(['en', 'fr']);
    setDeviceLocale('fr');
    expect(deviceSeedLanguage()).toBe('fr');
    expect(getStoredLanguage()).toBe('fr');
  });

  it('IGNORES a device language this build does not expose', () => {
    // `fr` is exposed in the shipped set now, so un-expose it to exercise the gate — this is the
    // property that kept the seed safe where 20.3 Step I found it unsafe.
    setExposed(['en']);
    setDeviceLocale('fr');
    expect(deviceSeedLanguage()).toBe('en');
    expect(getStoredLanguage()).toBe('en');
  });

  it('ignores an unshipped device language', () => {
    setDeviceLocale(UNSHIPPED);
    expect(getStoredLanguage()).toBe('en');
  });

  it('floors to BASE_LANGUAGE when no device locale is readable at all', () => {
    // `getCachedLocale()` is `null` before `initLocalization()` runs and under web SSR.
    setDeviceLocale(undefined);
    expect(deviceSeedLanguage()).toBe('en');
    expect(getStoredLanguage()).toBe('en');
  });

  it('does NOT write the seed back — nothing is persisted', () => {
    setExposed(['en', 'fr']);
    setDeviceLocale('fr');
    expect(getStoredLanguage()).toBe('fr');
    // A seed is a resolution rule, not a migration: leaving the key unset is what lets a LATER
    // release un-expose `fr` and have the preference self-repair.
    expect(storage.contains(LANGUAGE_KEY)).toBe(false);
  });

  it('a STORED preference wins over the device locale', () => {
    setExposed(['en', 'fr']);
    setDeviceLocale('fr');
    storage.set(LANGUAGE_KEY, 'en');
    expect(getStoredLanguage()).toBe('en');
  });

  it('normalizes a stored code this build does not expose, falling back to the SEED', () => {
    setExposed(['en', 'fr']);
    setDeviceLocale('fr');
    storage.set(LANGUAGE_KEY, UNSHIPPED);
    expect(getStoredLanguage()).toBe('fr');
  });
});

describe('AC-6 — web SSR resolves BASE_LANGUAGE, the client hydrates the real preference', () => {
  // ⚠️ epic-20 boundary Step 4 — this comment used to claim the divergence was "UNREACHABLE in
  // this build" on the premise `EXPOSED_LANGUAGES = ['en']`. That premise EXPIRED when 20.4
  // shipped the `fr` pack: `EXPOSED_LANGUAGES` is `['en', 'fr']` at HEAD and `app.json` sets
  // `web.output: "static"`, so the prerender really does floor to `en` while a French client
  // hydrates to `fr`. The divergence is REACHABLE — this test is the unit-level evidence, and it
  // does NOT excuse skipping the browser pass (that is round-3 MEDIUM #3, open, owned by 24.19).
  //
  // ⚠️ Story 24.18 re-homed this onto `getStoredLanguage()` — the boot reader, which is what the
  // prerender actually calls. The COMMITTED reader's SSR floor is a separate property and has its
  // own case in § AC-8.
  it('SSR (no locale cache, no MMKV) → `en`; client (French locale) → `fr`', () => {
    setExposed(['en', 'fr']);

    // SSR: `createAppMMKV` substitutes a no-op stub when `window` is undefined, and
    // `initLocalization()`'s `getLocales()[0]` guard leaves the cache unset — both floor to `en`.
    setDeviceLocale(undefined);
    expect(getStoredLanguage()).toBe('en');

    // Client hydration: the real locale is readable, nothing is stored → the seed applies.
    setDeviceLocale('fr');
    expect(getStoredLanguage()).toBe('fr');
  });
});

describe('setLanguage — atomicity (ported verbatim from the retired uiLanguage.ts)', () => {
  // `fr` is exposed for this whole block: the ticket / rollback / pre-burst reasoning under test is
  // independent of exposure.
  beforeEach(() => {
    setExposed(['en', 'fr']);
  });

  // ⚠️ RE-HOMED BY STORY 24.27, NOT WEAKENED. These cases used to drive a MOVING switch
  // (`setLanguage('fr')` while rendering `en`). A moving switch now RESTARTS the app instead of
  // switching i18next live — it never calls `changeLanguage`, so it cannot reject and cannot roll
  // back (see `setLanguage`: reloading into the live-switch cascade is a `SIGBUS`). The persist →
  // `changeLanguage` → rollback contract these tests exist to pin is therefore reachable via a
  // NON-MOVING switch, and that is what they drive now: a code this build does not expose
  // normalizes to the seed, which is already what is rendering, so nothing "moves" while
  // `changeLanguage` still runs against the raw code. Identical code path, identical guarantees,
  // reachable scenario (a stored-but-unexposed preference, or re-picking the current row).
  it('persists then switches i18next when the language does NOT move', async () => {
    storage.set(LANGUAGE_KEY, 'en');

    await setLanguage(UNSHIPPED);

    // The RAW code is stored; every read normalizes it (see `resolveLanguage`).
    expect(storage.getString(LANGUAGE_KEY)).toBe(UNSHIPPED);
    expect(changeLanguageSpy).toHaveBeenCalledWith(UNSHIPPED);
    expect(mockReloadAppAsync).not.toHaveBeenCalled();
  });

  it('ROLLS BACK to the previous value when the switch rejects', async () => {
    storage.set(LANGUAGE_KEY, 'en');
    changeLanguageSpy.mockRejectedValueOnce(new Error('switch failed'));

    await expect(setLanguage(UNSHIPPED)).rejects.toThrow('switch failed');

    // MMKV and i18n.language agree again: the failed switch left nothing behind.
    expect(storage.getString(LANGUAGE_KEY)).toBe('en');
    expect(i18n.language).toBe('en');
  });

  it('ROLLS BACK to UNSET when there was no previous value', async () => {
    changeLanguageSpy.mockRejectedValueOnce(new Error('switch failed'));

    await expect(setLanguage(UNSHIPPED)).rejects.toThrow('switch failed');

    // Cleared, not left as the failed code — otherwise the next cold start would silently adopt a
    // language the app never actually switched to.
    expect(storage.contains(LANGUAGE_KEY)).toBe(false);
    expect(getLanguage()).toBe('en');
    expect(i18n.language).toBe('en');
  });

  // Story 20.3 Step I — the rollback is a COMPARE-AND-SWAP. The picker's commit guard is
  // per-MOUNT, so picking one language, popping, and re-entering to pick another starts a second
  // switch while the first is in flight. A blind restore by the LOSER would write its own stale
  // predecessor over the winner's committed value while `i18n.language` held the winner.
  it('does NOT roll back over a value another switch committed in the meantime', async () => {
    storage.set(LANGUAGE_KEY, 'en');
    let failFirst: (err: Error) => void = () => {};
    changeLanguageSpy.mockImplementationOnce(
      () => new Promise((_resolve, reject) => (failFirst = reject))
    );

    const first = setLanguage(UNSHIPPED);
    // A second, successful switch lands while the first is still pending.
    await setLanguage(UNSHIPPED2);
    expect(storage.getString(LANGUAGE_KEY)).toBe(UNSHIPPED2);

    failFirst(new Error('switch failed'));
    await expect(first).rejects.toThrow('switch failed');

    // The winner survives: the superseded switch's failure is a no-op, not a stale restore to `en`.
    expect(storage.getString(LANGUAGE_KEY)).toBe(UNSHIPPED2);
  });

  // Story 20.4 AC-9 — the second half of the same overlap. The CAS decides WHO rolls back; this
  // decides WHAT it restores. A predecessor is only ever a language some switch INTENDED, so
  // restoring it can persist a language i18next never applied.
  it('restores what i18next is ACTUALLY rendering when both overlapping switches reject', async () => {
    let failA: (err: Error) => void = () => {};
    changeLanguageSpy.mockImplementationOnce(
      () => new Promise((_resolve, reject) => (failA = reject))
    );
    let failB: (err: Error) => void = () => {};
    changeLanguageSpy.mockImplementationOnce(
      () => new Promise((_resolve, reject) => (failB = reject))
    );

    const a = setLanguage(UNSHIPPED);
    const b = setLanguage(UNSHIPPED2);
    expect(storage.getString(LANGUAGE_KEY)).toBe(UNSHIPPED2);

    failA(new Error('A failed'));
    await expect(a).rejects.toThrow('A failed');
    // A is superseded — its rejection must not touch B's write.
    expect(storage.getString(LANGUAGE_KEY)).toBe(UNSHIPPED2);

    failB(new Error('B failed'));
    await expect(b).rejects.toThrow('B failed');

    // Neither switch was ever applied, so the app is still rendering `en` — and MMKV agrees.
    expect(i18n.language).toBe('en');
    // CLEARED, not pinned. The clear-vs-pin decision reads the preference as it stood before the
    // whole BURST, not before this one call (20.4 Step G): B's own predecessor is A's never-applied
    // write, so keying on it would pin a user who had NEVER chosen a language.
    expect(storage.contains(LANGUAGE_KEY)).toBe(false);
    expect(getLanguage()).toBe('en');
  });

  // Story 20.4 Step G — the third face of the overlap: two switches to the SAME language. A value
  // compare cannot tell OUR write from an identical one, which is why "superseded" is decided by a
  // monotonic TICKET instead.
  it('does NOT roll back over an in-flight switch to the SAME language', async () => {
    let failA: (err: Error) => void = () => {};
    changeLanguageSpy.mockImplementationOnce(
      () => new Promise((_resolve, reject) => (failA = reject))
    );

    const a = setLanguage(UNSHIPPED);
    const b = setLanguage(UNSHIPPED); // same code — the value-CAS blind spot

    failA(new Error('A failed'));
    await expect(a).rejects.toThrow('A failed');
    await b;

    // A value-CAS would have read its own code back, concluded nothing superseded it, and rolled
    // MMKV back to `en` while B had already committed.
    expect(storage.getString(LANGUAGE_KEY)).toBe(UNSHIPPED);
    expect(getLanguage()).toBe('en');
  });

  it('PINS the live language when clearing would resolve somewhere ELSE', async () => {
    // The pin branch needs a NON-MOVING switch whose live language the seed would not reproduce:
    // i18next is rendering `fr` (a committed switch whose MMKV write was later cleared) and the
    // device locale is `en`, so clearing would resolve `en` ≠ the live `fr`. Re-picking `fr` — the
    // row already selected — is the non-moving switch that reaches it.
    await i18n.changeLanguage('fr');
    storage.clearAll();
    changeLanguageSpy.mockRejectedValueOnce(new Error('switch failed'));

    await expect(setLanguage('fr')).rejects.toThrow('switch failed');

    expect(mockReloadAppAsync).not.toHaveBeenCalled();
    expect(i18n.language).toBe('fr');
    expect(storage.getString(LANGUAGE_KEY)).toBe('fr');
    expect(getLanguage()).toBe('fr');
  });

  // Story 24.13 AC-4 — the SAME clear-vs-pin branch, now asked under a device seed. This is the one
  // branch the `resolveLanguage` signature change reaches, and getting it wrong pins a user who
  // never chose a language.
  it('CLEARS rather than pins when the DEVICE SEED already resolves to the live language', async () => {
    setDeviceLocale('fr');
    await i18n.changeLanguage('fr');
    storage.clearAll();
    changeLanguageSpy.mockRejectedValueOnce(new Error('switch failed'));

    await expect(setLanguage(UNSHIPPED)).rejects.toThrow('switch failed');

    // An unset preference on THIS device already resolves to `fr`, so writing `fr` explicitly would
    // PIN a French-locale user who never picked a language — turning "follow my device" into a
    // permanent choice they never made. Passing the bare `BASE_LANGUAGE` default into the
    // counterfactual instead of the seed is exactly how this test goes red.
    expect(storage.contains(LANGUAGE_KEY)).toBe(false);
    expect(i18n.language).toBe('fr');
    expect(getLanguage()).toBe('fr');
  });
});

/**
 * Story 24.27 REPLACED Story 20.6's AC-14. The committed switch used to delete every download and
 * sweep the content cache; it now destroys NOTHING and reloads the app instead. These are the
 * inverted assertions — they are the only thing standing between that decision and a future story
 * quietly reinstating the sweep.
 */
describe('setLanguage — the committed switch destroys NOTHING (Story 24.27 AC-9)', () => {
  beforeEach(() => {
    setExposed(['en', 'fr']);
  });

  // `it('does NOT sweep the downloads')` lived here. Story 5-2 deleted lib/offlineTeardown.ts
  // with InstantDB, so the guard lost its subject — see the note at the top of this file. The
  // invariant survives and epic 7 owes it a new home.

  it('does NOT clear the old language’s cached content', async () => {
    setCachedContent('book-1', 'summaryBrief', 'en', 'english text');

    await setLanguage('fr');

    // Keyed by language, so `fr` can never READ this entry — and keeping it means switching back
    // is warm. Asserted through the store rather than a spy: 24.27 deleted `clearContentCache`
    // with its last production caller, so there is no export left to watch.
    expect(getCachedContent('book-1', 'summaryBrief', 'en')).toBe('english text');
  });
});

describe('setLanguage — the reload (Story 24.27 AC-1/AC-2)', () => {
  beforeEach(() => {
    setExposed(['en', 'fr']);
  });

  it('reloads the app AFTER persisting the new language', async () => {
    // Ordering is the whole correctness surface: reload before the MMKV write and the app restarts
    // into the OLD language, so the switch silently does nothing.
    //
    // ⚠️ RECORD the persisted value inside the stub, ASSERT it out here — never `expect` inside the
    // stub itself. `setLanguage` wraps the reload in its own `.catch` (the rejection fallback), so a
    // throwing assertion in there is swallowed by production code and the test passes green with
    // the ordering reversed: the pin would be vacuous, which is the whole failure mode this suite
    // exists to prevent (Story 24.27 Step I).
    let persistedAtReload: string | undefined = 'NOT CALLED';
    mockReloadAppAsync.mockImplementationOnce(async () => {
      persistedAtReload = storage.getString(LANGUAGE_KEY);
    });

    await setLanguage('fr');

    expect(persistedAtReload).toBe('fr');
    expect(mockReloadAppAsync).toHaveBeenCalledTimes(1);
  });

  // ⚠️ THE CRASH FIX, PINNED. Switching i18next live starts the cascade (every `useMMKVString`
  // subscriber re-renders, every language-scoped query re-subscribes, the picker pops) and reloading
  // into it frees React’s Scheduler mid-mounting-transaction — `SIGBUS`, reproduced on device three
  // times. A committed switch must therefore restart WITHOUT touching the i18next singleton;
  // `initI18n` reads the persisted key back on the fresh context. Re-adding `await changeLanguage`
  // on this path makes this test go red — and the app crash.
  it('does NOT switch i18next live on a committed move — it restarts instead', async () => {
    await setLanguage('fr');

    expect(changeLanguageSpy).not.toHaveBeenCalled();
    expect(i18n.language).toBe('en'); // untouched; the restart is what applies `fr`
    expect(storage.getString(LANGUAGE_KEY)).toBe('fr');
    expect(mockReloadAppAsync).toHaveBeenCalledTimes(1);
  });

  it('does NOT reload when the language did not move — and still switches i18next', async () => {
    await setLanguage('en');

    expect(mockReloadAppAsync).not.toHaveBeenCalled();
    // The no-move path keeps the original persist → changeLanguage → rollback contract, which is
    // what still makes a rejection (and the picker’s retry alert) reachable.
    expect(changeLanguageSpy).toHaveBeenCalledWith('en');
  });

  it('does NOT reload when a NON-MOVING switch rejects — the rollback path never restarts', async () => {
    changeLanguageSpy.mockRejectedValueOnce(new Error('switch failed'));

    await expect(setLanguage('en')).rejects.toThrow('switch failed');

    expect(mockReloadAppAsync).not.toHaveBeenCalled();
  });

  // ⚠️ THE ONLY THING BETWEEN A FAILED RESTART AND A SPLIT-BRAIN SESSION (Step G HIGH, found by two
  // independent review layers). The native reload REJECTS when there is no current activity — the
  // user backgrounds the app exactly as the commit lands. A bare `void` swallowed that, leaving
  // MMKV on `fr` and i18next on `en` for the rest of the session with every per-site guard AC-4
  // deleted: English chrome over French audio, silently and permanently. Applying the language live
  // is safe HERE and only here, because the restart already failed and cannot race the cascade.
  it('applies the language LIVE when the reload REJECTS — never leaves MMKV and i18next split', async () => {
    mockReloadAppAsync.mockRejectedValueOnce(new Error('no current activity'));

    await setLanguage('fr');
    await Promise.resolve(); // let the rejection handler run

    expect(storage.getString(LANGUAGE_KEY)).toBe('fr');
    expect(changeLanguageSpy).toHaveBeenCalledWith('fr');
    expect(captureExceptionSpy).toHaveBeenCalled();
  });

  it('normalizes before deciding — a switch to an UNEXPOSED code is not a language change', async () => {
    // `setLanguage(UNSHIPPED)` resolves to the seed (`en`); if `en` is what is already rendering,
    // nothing moved and there is nothing to restart for, even though the raw `code` differs.
    changeLanguageSpy.mockResolvedValueOnce(undefined as never);

    await setLanguage(UNSHIPPED);

    expect(mockReloadAppAsync).not.toHaveBeenCalled();
  });
});

/**
 * Story 24.18 — the hook reports the COMMITTED language and subscribes to i18next, not to MMKV.
 *
 * ⚠️ These used to drive the preference (`setLanguage('fr')`, `storage.set(LANGUAGE_KEY, …)`) and
 * expect the hook to follow. It no longer does, deliberately: a MOVING switch persists and
 * restarts WITHOUT touching i18next, so the only thing that moves a reader is a real
 * `changeLanguage` — which is exactly what boot performs on the fresh context. Driving i18next is
 * therefore the faithful stand-in for a restart, and it is what these cases do now.
 */
describe('useLanguage — the COMMITTED language (Story 24.18)', () => {
  it('reports the committed language and follows a real changeLanguage', async () => {
    setExposed(['en', 'fr']);
    const { result } = renderHook(() => useLanguage());
    expect(result.current.language).toBe('en');

    // The restart, as boot's `initI18n` would apply it.
    await act(async () => {
      await i18n.changeLanguage('fr');
    });
    expect(result.current.language).toBe('fr');
  });

  it('normalizes a committed code this build does not expose', async () => {
    setExposed(['en']);
    await act(async () => {
      await i18n.changeLanguage(UNSHIPPED);
    });
    const { result } = renderHook(() => useLanguage());
    expect(result.current.language).toBe('en');
  });

  // ⚠️ AC-3 — THE CASCADE SHRINK, and the assertion most likely to be lost in a refactor.
  // `setLanguage` persists BEFORE the restart, so under the old `useMMKVString` reader that one
  // write fanned out to ~40 consumers (and their language-scoped queries re-subscribed) in the
  // milliseconds before the process died — the remaining half of the cascade that produced a
  // SIGBUS in React's Scheduler, which `setLanguage`'s own comment prescribes shrinking.
  //
  // ⚠️ Be exact about the scope of this pin: it instruments `useLanguage` ONLY, so it proves THIS
  // reader left the key — not the app-wide "zero subscribers" claim, which no test can make and
  // which holds today by grep (`LANGUAGE_KEY` appears nowhere outside `lib/language.ts`). The
  // independent second pin is `useLocalizedNotificationChannels.test.ts` § "is keyed on i18next,
  // not on the MMKV preference write", which covers a real consumer end to end.
  it('does NOT re-render — or move — on a bare write to LANGUAGE_KEY (AC-3)', () => {
    setExposed(['en', 'fr']);
    let renders = 0;
    const { result } = renderHook(() => {
      renders++;
      return useLanguage();
    });
    expect(result.current.language).toBe('en');
    const rendersBefore = renders;

    // A committed switch's persist, with no `changeLanguage` behind it — the normal shape of a
    // switch since Story 24.27.
    act(() => {
      storage.set(LANGUAGE_KEY, 'fr');
    });

    expect(result.current.language).toBe('en');
    expect(renders).toBe(rendersBefore);
  });

  // ⚠️ AC-7 — RENDER COUNT, NOT VALUE. A value assertion here is VACUOUS and must not be written:
  // the rollback path is reachable only on a NON-MOVING switch, which is defined by
  // `resolveLanguage(code, seed) === rendering`, so the old MMKV-backed hook already normalized
  // the intended code straight back to the rendering language and returned the same string. It
  // re-rendered twice — optimistic write, then rollback — with an unchanged value. The count is
  // the only signal that tells the old reader from the new one.
  it('renders ZERO extra times across a REJECTED switch and its rollback (AC-7)', async () => {
    setExposed(['en', 'fr']);
    storage.set(LANGUAGE_KEY, 'en');
    changeLanguageSpy.mockRejectedValueOnce(new Error('switch failed'));

    let renders = 0;
    const { result } = renderHook(() => {
      renders++;
      return useLanguage();
    });
    const rendersBefore = renders;

    await act(async () => {
      await expect(setLanguage(UNSHIPPED)).rejects.toThrow('switch failed');
    });

    expect(renders).toBe(rendersBefore);
    expect(result.current.language).toBe('en');
    // The rollback still happened — this pins the re-render, not the atomicity.
    expect(storage.getString(LANGUAGE_KEY)).toBe('en');
  });

  // Story 24.13 AC-35, now spanning THREE readers — they must resolve identically.
  it('agrees with getLanguage(), including where the DEVICE SEED produces the answer (AC-5)', async () => {
    setExposed(['en', 'fr']);
    setDeviceLocale('fr');
    // ⚠️ `jest.setup.js` boots the singleton on `en`, so a bare seeded launch would have both
    // readers answer `en` and demonstrate nothing about the seed. Committing an UNEXPOSED language
    // is what makes the seed load-bearing: it is the only thing either reader can floor to.
    await act(async () => {
      await i18n.changeLanguage(UNSHIPPED);
    });
    const { result } = renderHook(() => useLanguage());

    expect(result.current.language).toBe('fr');
    expect(result.current.language).toBe(getLanguage());
  });

  it('ignores a device language this build does not expose', () => {
    setExposed(['en']);
    setDeviceLocale('fr');
    const { result } = renderHook(() => useLanguage());
    expect(result.current.language).toBe('en');
    expect(result.current.language).toBe(getLanguage());
  });

  it('unsubscribes from i18next on unmount — no listener left behind', () => {
    setExposed(['en', 'fr']);
    // i18next's emitter keys `observers[event]` by the listener itself, so this counts the real
    // registration rather than a proxy for it.
    const { observers } = i18n as unknown as {
      observers: Record<string, Map<unknown, number> | undefined>;
    };
    const before = observers.languageChanged?.size ?? 0;

    const { unmount } = renderHook(() => useLanguage());
    expect(observers.languageChanged?.size ?? 0).toBe(before + 1);

    unmount();

    // ⚠️ Counted on the emitter, NOT with a spy on `off`: a teardown that calls `off` with the
    // wrong listener satisfies a spy and still leaks. ~40 consumers mount and unmount across a
    // session, and the singleton outlives all of them.
    expect(observers.languageChanged?.size ?? 0).toBe(before);
  });
});

describe('getLanguage — AC-8: every floor is safe, and no path returns an unshipped code', () => {
  it('floors to the DEVICE SEED before initI18n has run (and under web SSR)', () => {
    setExposed(['en', 'fr']);
    setDeviceLocale('fr');
    // Pre-init / SSR: the singleton exists (it is an emitter from construction) but has no
    // language yet. `useSyncExternalStore` calls this as `getServerSnapshot` too.
    const instance = i18n as unknown as { language: string | undefined };
    const committed = instance.language;
    instance.language = undefined;
    try {
      expect(getLanguage()).toBe('fr');
      setDeviceLocale(undefined);
      expect(getLanguage()).toBe(BASE_LANGUAGE);
    } finally {
      instance.language = committed;
    }
  });

  it('floors a committed language this build no longer EXPOSES', async () => {
    // The self-repair property on the committed side: `fr` still SHIPS a bundle, so i18next can
    // hold it, but a release that un-exposes it must not leave the app reporting `fr`.
    setExposed(['en']);
    await i18n.changeLanguage('fr');
    expect(isAvailableLanguage('fr')).toBe(true);
    expect(getLanguage()).toBe('en');
  });

  it('floors a committed language with NO shipped bundle', async () => {
    setExposed(['en', 'fr']);
    await i18n.changeLanguage(UNSHIPPED);
    expect(getLanguage()).toBe('en');
    // The invariant behind every floor: whatever comes back, the app can render it.
    expect(isAvailableLanguage(getLanguage())).toBe(true);
  });
});

describe('initI18n — AC-4: BOOT reads the stored preference, not the committed language', () => {
  /**
   * The `lng` `initI18n()` would hand i18next on a cold start, captured WITHOUT re-initializing
   * the singleton this whole suite shares. `use` is stubbed (so no module is registered twice) and
   * `isInitialized` is flipped only for the call — the real `init` never runs.
   */
  function bootLanguage(): string | undefined {
    const instance = i18n as unknown as { isInitialized: boolean };
    const wasInitialized = instance.isInitialized;
    let captured: string | undefined;
    const useSpy = jest.spyOn(i18n, 'use').mockReturnValue({
      init: (options: { lng?: string }) => {
        captured = options.lng;
      },
    } as never);
    instance.isInitialized = false;
    try {
      initI18n();
    } finally {
      instance.isInitialized = wasInitialized;
      useSpy.mockRestore();
    }
    return captured;
  }

  // ⚠️ THE ONE THAT COMPILES, TYPE-CHECKS, AND SILENTLY DISCARDS EVERY USER'S SAVED LANGUAGE.
  // Point `initI18n` at `getLanguage()` instead and this is the only thing that goes red: at boot
  // `i18n.language` is undefined, so the committed reader floors to the device seed and the stored
  // preference is never applied — on every cold start, with no error and no other test signal.
  it('boots on a STORED `fr` even though the device locale is `en`', () => {
    setExposed(['en', 'fr']);
    setDeviceLocale('en');
    storage.set(LANGUAGE_KEY, 'fr');

    // The two readers genuinely disagree at this instant — which is exactly why boot must name
    // the one it wants.
    expect(getStoredLanguage()).toBe('fr');
    expect(getLanguage()).toBe('en');

    expect(bootLanguage()).toBe('fr');
  });

  it('boots on the DEVICE SEED when nothing is stored', () => {
    setExposed(['en', 'fr']);
    setDeviceLocale('fr');
    expect(storage.contains(LANGUAGE_KEY)).toBe(false);

    expect(bootLanguage()).toBe('fr');
  });
});

/**
 * The download record survives a switch INTACT (Story 24.27) — files and rows alike. Story 20.6
 * swept both here and Story 24.13 descoped its auto-resume flag; 24.27 removed the sweep itself,
 * so what is pinned now is that nothing on this path reaches for either.
 */
describe('downloads across a committed switch', () => {
  beforeEach(() => {
    setExposed(['en', 'fr']);
  });

  it('leaves the other language’s downloads in place — switch away and back and they are there', async () => {
    // ⚠️ The restart is what applies the language, so `setLanguage` deliberately leaves i18next
    // alone — which means a bare `setLanguage('fr')` then `setLanguage('en')` is ONE move plus a
    // no-op, not a round trip. Standing in for the restart with `changeLanguage` between the two
    // calls is what makes the second one a genuine committed move back (Story 24.27 Step I).
    await setLanguage('fr');
    await i18n.changeLanguage('fr'); // ← the restart, as boot's `initI18n` would apply it
    await setLanguage('en');

    expect(mockReloadAppAsync).toHaveBeenCalledTimes(2);
    // (The `deleteAllOfflineDownloads` half of this assertion went with story 5-2 — see the
    // note at the top of this file.)
  });

  // ⚠️ The 24.13 descope, still pinned. A resume flag + boot re-run once lived on this path and
  // produced a defect in two consecutive review rounds — the last deleting every download on every
  // launch. There is no sweep left to resume, and no flag may reappear to claim otherwise.
  it('persists NO teardown flag — there is nothing owed', async () => {
    await setLanguage('fr');

    expect(storage.getString('teardown_owed')).toBeUndefined();
  });
});
