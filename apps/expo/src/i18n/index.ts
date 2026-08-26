/**
 * i18next wiring (Story 20.2) — the presentation layer on top of the
 * `lib/localization.ts` boot readers (data layer).
 *
 * Design (see story ACs):
 * - **Single synchronous boot init.** `initI18n()` runs once at module load in
 *   `app/_layout.tsx`.
 *
 *   ⚠️ `initLocalization()` MUST RUN FIRST, and this comment used to say the opposite (boundary
 *   round 2). Story 20.6 did remove the device-locale fallback and briefly made the two
 *   independent — but **Story 24.13 restored the device seed**, so the order is LOAD-BEARING
 *   again: `initI18n()` reads `getStoredLanguage()` → `resolveLanguage(stored,
 *   deviceSeedLanguage())` → `getCachedLocale()`, which is still `null` if `initLocalization()`
 *   has not run. `_layout.tsx` carries the correct warning at its call site; this header was the
 *   one place in the tree still licensing the reorder that breaks it.
 *
 *   ⚠️ **`getStoredLanguage()`, NEVER `getLanguage()` (Story 24.18).** Those are two different
 *   readers now: MMKV holds the stored preference, i18next holds the committed language, and this
 *   is the one place in the app that wants the former. Swapping in `getLanguage()` compiles and
 *   type-checks, and every user's saved language is silently ignored at launch — `i18n.language`
 *   is undefined until this call returns, so it would floor to the device seed on every cold
 *   start. See `lib/language.ts`'s header.
 *
 *   `initAsync: false` makes init fully synchronous — all resources are
 *   statically bundled (no async backend), so `i18n.isInitialized === true` before
 *   the first React render. That is what lets the pre-init error boundaries keep
 *   hardcoded English without an `isInitialized` guard (they'd never see a false).
 * - **No detector / backend plugins.** The language comes from the persisted preference, and
 *   bundles are static imports.
 * - `fallbackLng: 'en'`, `defaultNS: 'common'`, `escapeValue: false` (React escapes),
 *   `react.useSuspense: false`.
 *
 * Story 20.3: the `resources` map moved to the `./resources` LEAF (so `lib/language.ts` can read
 * `AVAILABLE_UI_LANGUAGES` without cycling back through this module). Story 20.6: `lng` is the ONE
 * unified language preference — persisted → **device seed** → `en` (Story 24.13 restored the seed
 * that 20.6 had removed; the "device locale deliberately NOT consulted" wording that stood here
 * described 20.6's behaviour, not the shipped one), NORMALIZED to the shipped bundles. See
 * `lib/language.ts` § `resolveLanguage`. `resources` / `defaultNS` are re-exported here so
 * existing importers are unaffected.
 *
 * Non-hook modules (logic hooks, services) import the default `i18n` instance and
 * call `i18n.t(...)`; components use `useTranslation()` from `react-i18next`.
 */
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import { getStoredLanguage } from '@/lib/language';

import { defaultNS, resources } from './resources';

export { defaultNS, resources } from './resources';

/**
 * Initializes i18next exactly once, synchronously. Idempotent — safe to call
 * more than once (returns the already-initialized instance).
 *
 * `lng` comes from {@link getStoredLanguage}: the persisted language preference, else the device
 * seed, else `en` — **normalized to `EXPOSED_LANGUAGES`**. The
 * normalization is load-bearing: handing i18next a code with no shipped bundle would resolve
 * every key through `fallbackLng` while `i18n.language` reported a language the app cannot
 * actually render (and the picker would show it as active).
 *
 * ⚠️ This call is what makes MMKV the BOOT SEED (Story 24.18). After it returns, `i18n.language`
 * is the app's single answer to "what language are we in" and every other reader takes it from
 * there — so this line is the whole handover, and reversing it (reading the committed language to
 * decide the committed language) is a silent no-op that discards the preference.
 */
export function initI18n(): typeof i18next {
  if (i18next.isInitialized) return i18next;

  const lng = getStoredLanguage();

  // initAsync:false → synchronous init (resources are bundled). No await needed;
  // isInitialized is true on return. NOTE: i18next v26 renamed the old
  // `initImmediate: false` flag to `initAsync: false` (same semantics) — the story
  // AC2 predates the rename; this is the current spelling.
  void i18next.use(initReactI18next).init({
    lng,
    fallbackLng: 'en',
    defaultNS,
    ns: Object.keys(resources.en),
    resources,
    initAsync: false,
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });

  return i18next;
}

export default i18next;
