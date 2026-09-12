/**
 * Layout DIRECTION — the ONE place that reads it and the ONE place that applies it (story 8-1).
 *
 * ── ⚠️ WE FORCE RTL, WE DO NOT HAND-MIRROR ──────────────────────────────────────────────────
 *
 * The story's first draft chose `allowRTL(false)` plus a hand-written mirror on every surface, on
 * the (correct) grounds that FlashList v2 already compensates for RTL and would double-invert the
 * mushaf's deliberately reversed `[604…1]` pager. The conclusion was wrong, and the reason is one
 * sentence: **`marginStart`/`paddingEnd`/`flexDirection: 'row'` all resolve through
 * `I18nManager.isRTL`.** With RTL disallowed the flag is permanently `false`, every logical
 * property is inert, and the mirror becomes an `isArabic ? … : …` conditional at ~40 style sites
 * and ~48 row containers — i.e. every surface, forever. Forcing RTL leaves exactly ONE problem,
 * the pager, and the framework handles the rest. See `app/(tabs)/index.tsx` for the pager's half.
 *
 * ── ⚠️ IT TAKES EFFECT ON THE NEXT LAUNCH, WHICH IS WHY THE PICKER RELOADS ───────────────────
 *
 * `forceRTL` writes a native preference (Android shared-prefs / iOS `UIView` appearance) that is
 * read when views are CREATED. {@link applyStoredDirection} therefore runs at module scope in
 * `app/_layout.tsx`, before the first React render, and a language switch persists and then calls
 * `reloadAppAsync()` (`lib/language.ts` § `setLanguage`) so the fresh JS context re-applies it
 * before anything is drawn. `(tabs)/(profile)/language.tsx` says so to the reader.
 *
 * ── ⚠️ AND THAT IS WHY {@link isRTL} READS THE LANGUAGE, NOT `I18nManager.isRTL` ─────────────
 *
 * **`I18nManager.isRTL` IS STALE FOR EXACTLY ONE PROCESS AFTER A SWITCH, AND THAT PROCESS IS THE
 * ONE THE READER IS LOOKING AT.** React Native captures it ONCE, at module-evaluation time
 * (`I18nManager.js`: `const i18nConstants = getI18nManagerConstants()`), from native constants
 * that survive a JS-context reload — while `reloadAppAsync()` restarts the JS context and NOT the
 * process. So after a switch the native views come up in the new direction and the JS flag still
 * reports the old one.
 *
 * ⚠️ Measured on a Pixel 9 Pro emulator, 2026-09-12, and it is not cosmetic: with the pager keyed
 * off the stale flag, switching Arabic → English left the mushaf laid out in the OTHER direction's
 * index order — page 604's view parked at x = 603 × 1440 = 868320 in a 1440-wide window, i.e. a
 * blank screen that a force-quit fixed and nothing else did. The in-process Arabic direction had
 * the mirror-image fault: page turns did nothing at all.
 *
 * The stored language does not have that problem: `setLanguage` persists BEFORE it reloads, so a
 * fresh JS context reads the new value immediately. It is cached for the process, because
 * direction cannot change without one.
 *
 * ── ⚠️ AND THE FRAMEWORK'S OWN FLAG IS PUT IN STEP *BEFORE* THE RELOAD, NOT AFTER ────────────
 *
 * Our flag agreeing with itself is not enough: **FlashList reads `I18nManager.isRTL` too**
 * (`RecyclerView.js` → `isHorizontalRTL`), and so does every logical style property. The stale
 * read happens because `react-native`'s `I18nManager.js` is evaluated by the entry chain LONG
 * before `app/_layout.tsx` runs — so a pref written by {@link applyStoredDirection} lands after
 * the constant that reads it has already been captured for that context.
 *
 * {@link applyDirectionForLanguage} is the answer: the picker calls it for the NEW language
 * BEFORE `setLanguage` reloads, so the fresh context evaluates `I18nManager.js` against a pref
 * that is already correct. {@link applyStoredDirection} stays, and stays first — it is the
 * COLD-START path, where nothing ran before it.
 *
 * ── ⚠️ ON WEB THIS IS A NO-OP, AND THAT IS THE FRAMEWORK'S ANSWER, NOT AN OVERSIGHT ──────────
 *
 * `react-native-web@0.21`'s `I18nManager` is a stub: `allowRTL`/`forceRTL` return immediately and
 * `isRTL` is hardcoded `false` (`react-native-web/dist/exports/I18nManager/index.js`). Web
 * direction lives on the DOM (`dir="rtl"` + CSS logical properties) instead, and setting it would
 * mirror the chrome while leaving the mushaf pager broken: FlashList's RTL compensation reads
 * that SAME stubbed `I18nManager` (`RecyclerView.js` → `I18nManager.isRTL && horizontal`), so an
 * RTL document flips the scroll container's origin underneath maths that still assume LTR — on
 * the app's home surface, on the one platform that cannot be smoked on a device. So the web build
 * renders Arabic COPY in an LTR layout, exactly as it renders today, and there is ONE answer to
 * "which way does this app lay out" per process rather than two that can disagree.
 */

import { I18nManager } from 'react-native';

import { getStoredLanguage } from './language';

/**
 * The UI languages written right to left. A set rather than a per-language flag on the bundle:
 * direction is a property of the SCRIPT, and the only thing that reads it is this module.
 */
export const RTL_LANGUAGES: readonly string[] = ['ar'];

/** Whether a UI language code is written right to left. Pure — no native read. */
export function isRTLLanguage(code: string | undefined | null): boolean {
  return code != null && RTL_LANGUAGES.includes(code);
}

/** The answer {@link isRTL} caches. Resolved at boot by {@link applyStoredDirection}. */
let processDirection: boolean | null = null;

/**
 * Whether THIS PROCESS is laid out right to left — the single question every surface asks.
 *
 * ⚠️ DERIVED FROM THE STORED LANGUAGE, NOT FROM `I18nManager.isRTL` — see the header for the
 * measured defect that decides it. Cached for the life of the process (direction cannot change
 * without a restart), which also keeps it free for the callers that ask per render: every `Icon`,
 * and the mushaf pager.
 *
 * ⚠️ A FUNCTION, NEVER A CONSTANT OTHER MODULES IMPORT. A `const` exported from here would be
 * evaluated when the importing module is, which on the boot path can precede
 * {@link applyStoredDirection}.
 */
export function isRTL(): boolean {
  if (processDirection === null) processDirection = isRTLLanguage(getStoredLanguage());
  return processDirection;
}

/**
 * Apply the stored language's direction. Call ONCE, at module scope in `app/_layout.tsx`, after
 * `initLocalization()` (the stored-language read seeds an unset preference from the device locale)
 * and before React renders.
 *
 * ⚠️ BOTH CALLS, ALWAYS, AND IN THIS ORDER. `allowRTL(true)` is what lets `forceRTL` mean
 * anything; `forceRTL(false)` is not redundant either — without it a reader who moves Arabic →
 * English keeps a mirrored interface forever, because the native preference is sticky and nothing
 * else ever clears it.
 *
 * ⚠️ `getStoredLanguage()` — the MMKV preference, normalized to `EXPOSED_LANGUAGES` — not
 * `getLanguage()`: i18next has not been initialized yet, so the committed reader would answer the
 * device seed and discard the reader's own choice. Same rule, same reason, as `initI18n()`.
 */
export function applyStoredDirection(): void {
  applyDirectionForLanguage(getStoredLanguage());
}

/**
 * Put the NATIVE direction preference in step with a language the reader has just chosen, before
 * the app reloads into it.
 *
 * ⚠️ CALL IT BEFORE `setLanguage`, NEVER AFTER — see the header. `setLanguage` persists and then
 * restarts the JS context, and the fresh context evaluates `react-native`'s `I18nManager` (and
 * with it FlashList's `isHorizontalRTL`) well before `app/_layout.tsx` gets to run anything. A
 * pref written on the far side of that reload is a pref the whole session cannot see.
 *
 * ⚠️ BOTH CALLS, ALWAYS, AND IN THIS ORDER. `allowRTL(true)` is what lets `forceRTL` mean
 * anything; `forceRTL(false)` is not redundant either — without it a reader who moves Arabic →
 * English keeps a mirrored interface forever, because the native preference is sticky and nothing
 * else ever clears it.
 */
export function applyDirectionForLanguage(code: string | undefined | null): void {
  processDirection = isRTLLanguage(code);
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(processDirection);
}
