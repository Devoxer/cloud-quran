/**
 * Localization boot readers (Story 17.9)
 *
 * Reads the device locale + timezone once at app boot and caches the result. This is the data
 * layer ONLY — i18next, translation bundles, and `t(...)` rendering are the presentation layer
 * in `src/i18n/` (Story 20.2).
 *
 * ⚠️ `getCachedLocale()` IS the language preference's device seed as of Story 24.13 — this reverses
 * 20.6, which removed the seed (unset meant `en`, the picker was the sole writer) because seeding
 * CONTENT from the device bypassed the released-language gate. 24.13 made exposure a COMPILE-TIME
 * constant (`EXPOSED_LANGUAGES`), so `lib/language.ts`'s `deviceSeedLanguage()` can gate the seed
 * synchronously: the device's language is adopted only when this build exposes it. The module was
 * kept alive through 20.6 for exactly this; `textDirection` additionally serves RTL support (deferred — 20.5 was skipped; see epics.md Epic 20 § 20.5)
 * and `timeZone` any future date/number formatting.
 *
 * ⚠️ `initLocalization()` must therefore run BEFORE `initI18n()` at boot — see `app/_layout.tsx`.
 * It is the only writer of the cache `deviceSeedLanguage()` reads, and an uninitialized cache
 * silently floors the seed to `en`.
 *
 * `getLocales()` / `getCalendars()` (expo-localization) are synchronous and
 * always return a non-empty array (the device's preferred locale is `[0]`).
 */
import { getCalendars, getLocales } from 'expo-localization';

export interface DeviceLocale {
  /** Full BCP-47 tag, e.g. `'en-US'`. */
  languageTag: string;
  /** Language code without region, e.g. `'en'`. */
  languageCode: string;
  /** Region code, e.g. `'US'` (null when undetermined). */
  regionCode: string | null;
  /** Text direction for the active locale. */
  textDirection: 'ltr' | 'rtl';
  /** IANA timezone, e.g. `'America/Los_Angeles'` (falls back to `'UTC'`). */
  timeZone: string;
}

let cached: DeviceLocale | null = null;

/** Reads the current device locale + timezone (uncached). */
export function getDeviceLocale(): DeviceLocale {
  // These "always return a non-empty array" on real devices, but on web/jsdom or a
  // misconfigured emulator they can be empty — indexing [0] then yields undefined and
  // `.languageTag` throws at boot (this runs in the root _layout). Guard with `?.` +
  // safe defaults so a degraded environment can't red-screen the app (epic-17 review).
  const locale = getLocales()[0] as ReturnType<typeof getLocales>[number] | undefined;
  const calendar = getCalendars()[0] as ReturnType<typeof getCalendars>[number] | undefined;
  return {
    languageTag: locale?.languageTag ?? 'en-US',
    languageCode: locale?.languageCode ?? 'en',
    regionCode: locale?.regionCode ?? null,
    textDirection: locale?.textDirection ?? 'ltr',
    timeZone: calendar?.timeZone ?? 'UTC',
  };
}

/**
 * Reads the device locale once at app boot and caches it. Safe to call
 * repeatedly — only the first call touches the native module. Invoked from the
 * root `_layout.tsx` alongside the other boot-time init.
 */
export function initLocalization(): DeviceLocale {
  if (!cached) {
    cached = getDeviceLocale();
  }
  return cached;
}

/** The cached boot locale, or `null` if {@link initLocalization} hasn't run. */
export function getCachedLocale(): DeviceLocale | null {
  return cached;
}

/**
 * Resets the cached locale.
 * @internal test-only
 */
export function _resetLocalizationCache(): void {
  cached = null;
}
