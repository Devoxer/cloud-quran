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
 * the pager, and the framework handles the rest. See `features/reading/mushaf/mushafPager.ts`.
 *
 * ── ⚠️ IT TAKES EFFECT ON THE NEXT LAUNCH, WHICH IS WHY BOTH PATHS RELOAD ────────────────────
 *
 * `forceRTL` writes a native preference that is read when views are CREATED — and, worse, React
 * Native captures `isRTL` ONCE, at module-evaluation time (`I18nManager.js`: `const i18nConstants
 * = getI18nManagerConstants()`), which the entry chain reaches LONG before `app/_layout.tsx` runs.
 * So a pref written from JS is invisible to the session that wrote it: to the logical style
 * properties, and to FlashList's `isHorizontalRTL`, which is the mushaf pager's whole geometry.
 *
 * ⚠️ Measured on a Pixel 9 Pro emulator, 2026-09-12, and it is not cosmetic. Switching Arabic →
 * English with the pref written on the far side of the reload left the mushaf laid out in the
 * OTHER direction's index order — page 604's view parked at x = 603 × 1440 = 868320 in a 1440-wide
 * window, i.e. a blank home surface that only a force-quit cleared. English → Arabic had the
 * mirror-image fault: the pager would not turn at all.
 *
 * There are exactly TWO ways into that state, and each has its own answer:
 *
 *  1. **The reader picks a language.** {@link applyDirectionForLanguage} writes the pref for the
 *     NEW language BEFORE `setLanguage` reloads, so the fresh context evaluates `I18nManager.js`
 *     against a pref that is already right. `(tabs)/(profile)/language.tsx` owns that order.
 *  2. **A fresh install on an Arabic device.** Nobody picks anything: `getStoredLanguage()` seeds
 *     from the device locale, so the FIRST session wants RTL while every framework read still says
 *     LTR. This is the spec's I/O matrix row 1, reached with no user action at all. Answer:
 *     {@link applyStoredDirection} compares what it wants against what the framework actually has
 *     and, when they differ, reloads ONCE — which is case 1's mechanism, applied by the boot path
 *     to itself. The one-shot is durable (MMKV), because the module scope that would hold a flag
 *     does not survive the reload it is guarding against.
 *
 * ── ⚠️ WEB IS FLOORED TO LTR IN CODE, NOT ONLY IN PROSE ─────────────────────────────────────
 *
 * `react-native-web@0.21`'s `I18nManager` is a stub: `allowRTL`/`forceRTL` return immediately and
 * `isRTL` is hardcoded `false` (`react-native-web/dist/exports/I18nManager/index.js`). Web
 * direction lives on the DOM (`dir="rtl"` + CSS logical properties) instead, and setting it would
 * mirror the chrome while leaving the mushaf pager broken: FlashList's RTL compensation reads that
 * SAME stubbed `I18nManager`, so an RTL document flips the scroll container's origin underneath
 * maths that still assume LTR — on the app's home surface, on the platform that cannot be smoked
 * on a device. So the web build renders Arabic COPY in an LTR layout.
 *
 * ⚠️ **AND THAT IS A `Platform.OS` FLOOR IN {@link resolveDirection}, NOT A COMMENT.** MMKV is
 * localStorage-backed on web, so a web reader who picks Arabic persists `language=ar` like anyone
 * else. Without the floor every later load would answer `isRTL() === true` against a framework
 * that is permanently LTR — and `pagerData(true)` hands FlashList UNREVERSED data with no RTL
 * compensation behind it, i.e. **the mushaf would turn pages backwards on web**. Reachable with no
 * native device in the story at all.
 *
 * ── Decisions recorded here because nothing else in the tree states them ─────────────────────
 *
 * ⚠️ **DIGITS STAY WESTERN (`1`, `2`, `3`) IN EVERY LANGUAGE.** Page numbers, ayah badges,
 * juz'/hizb labels, durations and byte sizes are all rendered from the `ar` bundle's own literal
 * digits and from `lib/format.ts`, neither of which switches numbering system. That is a choice,
 * not an oversight: the mushaf's own ayah markers are drawn by the QPC font as Arabic-Indic
 * glyphs, so the page already carries both, and the numbers OUTSIDE the facsimile are chrome the
 * reader cross-references against a page number printed in the book. Changing it means one place
 * (`lib/format.ts`) and a re-smoke of the mushaf header, not a sweep.
 *
 * ⚠️ **`app.json` GAINS NO `locales` / `CFBundleLocalizations`, SO iOS OFFERS NO PER-APP LANGUAGE
 * ROW IN SYSTEM SETTINGS.** Deliberate for this story: the picker is in-app and device-local, and
 * an OS-level row would be a SECOND authority over the same preference with no way to keep the two
 * in step (the system row changes the locale, not our MMKV key). If it is ever wanted, it belongs
 * with a `deviceSeedLanguage()` that re-reads on foreground — which is a story, not a config line.
 */

import { reloadAppAsync } from 'expo';
import { I18nManager, Platform } from 'react-native';

import { getStoredLanguage } from './language';
import { createAppMMKV } from './mmkv';

/**
 * The UI languages written right to left. A set rather than a per-language flag on the bundle:
 * direction is a property of the SCRIPT, and the only thing that reads it is this module.
 */
export const RTL_LANGUAGES: readonly string[] = ['ar'];

/** Whether a UI language code is written right to left. Pure — no native read, no platform read. */
export function isRTLLanguage(code: string | undefined | null): boolean {
  return code != null && RTL_LANGUAGES.includes(code);
}

/**
 * The direction a language actually gets ON THIS PLATFORM — the floor, and the only function that
 * knows about web.
 *
 * ⚠️ Keep every direction decision downstream of THIS, never of {@link isRTLLanguage}: the latter
 * answers "is this script RTL", which is true of Arabic on web too, where the framework cannot act
 * on it. See the header for what a web reader on `ar` would otherwise get.
 */
export function resolveDirection(code: string | undefined | null): boolean {
  return Platform.OS !== 'web' && isRTLLanguage(code);
}

/** The answer {@link isRTL} caches. Resolved at boot by {@link applyStoredDirection}. */
let processDirection: boolean | null = null;

/**
 * Whether THIS PROCESS is laid out right to left — the single question every surface asks.
 *
 * ⚠️ DERIVED FROM THE STORED LANGUAGE (through the platform floor), NOT FROM `I18nManager.isRTL`
 * — see the header for the measured defect that decides it. Cached for the life of the process
 * (direction cannot change without a restart), which also keeps it free for the callers that ask
 * per render: every `Icon`, and the mushaf pager.
 *
 * ⚠️ A FUNCTION, NEVER A CONSTANT OTHER MODULES IMPORT. A `const` exported from here would be
 * evaluated when the importing module is, which on the boot path can precede
 * {@link applyStoredDirection}.
 */
export function isRTL(): boolean {
  if (processDirection === null) processDirection = resolveDirection(getStoredLanguage());
  return processDirection;
}

/** Device-local store for the boot reconcile's one-shot. Its own id: `lib/language.ts` owns its. */
const storage = createAppMMKV('direction');

/**
 * The direction the last boot reconcile already reloaded for. Durable ON PURPOSE — a module-scope
 * flag is exactly what the reload destroys, so it could never stop a second one.
 */
export const RECONCILED_KEY = 'reconciled-direction';

/**
 * Write the native preference. BOTH CALLS, ALWAYS, AND IN THIS ORDER.
 *
 * `allowRTL(true)` is what lets `forceRTL` mean anything. `forceRTL(false)` is not redundant
 * either: without it a reader moving Arabic → English keeps a mirrored interface forever, because
 * the native preference is sticky and nothing else ever clears it.
 */
function writeNativeDirection(rtl: boolean): void {
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(rtl);
}

/**
 * Apply the stored language's direction, and reconcile the framework to it. Call ONCE, at module
 * scope in `app/_layout.tsx`, after `initLocalization()` (the stored-language read seeds an unset
 * preference from the device locale) and before React renders. `root-layout-boot.test.tsx` pins
 * that call site and its order, because a source scan for `forceRTL` cannot see a missing CALLER.
 *
 * ⚠️ `getStoredLanguage()` — the MMKV preference, normalized to `EXPOSED_LANGUAGES` — not
 * `getLanguage()`: i18next has not been initialized yet, so the committed reader would answer the
 * device seed and discard the reader's own choice. Same rule, same reason, as `initI18n()`.
 *
 * ⚠️ THE RELOAD IS THE POINT, NOT A FALLBACK. A fresh install on an Arabic device never touches
 * the picker, so nothing else would ever put the framework in step — the reader would get RTL
 * copy, LTR chrome and a pager on its RTL branch, permanently. One reload fixes it because the
 * fresh context evaluates `I18nManager.js` against the pref this function has just written.
 *
 * ⚠️ AND IT IS ONE-SHOT PER DIRECTION, GUARDED IN MMKV. If a platform ever fails to honour the
 * pref, an unguarded "reload until they agree" is an infinite boot loop — the worst failure this
 * file could ship. The marker is cleared the moment they DO agree, so a later genuine change still
 * gets its one reload.
 */
export function applyStoredDirection(): void {
  const desired = resolveDirection(getStoredLanguage());
  // The boot path IS this process's direction, so it owns the cache (unlike the picker's call —
  // see {@link applyDirectionForLanguage}).
  processDirection = desired;
  writeNativeDirection(desired);

  // Web can never agree: the stub's `isRTL` is a hardcoded `false` and `resolveDirection` floors
  // to `false` with it, so the comparison below is always equal — but returning early says so
  // rather than relying on that coincidence.
  if (Platform.OS === 'web') return;

  if (I18nManager.isRTL === desired) {
    storage.remove(RECONCILED_KEY);
    return;
  }
  if (storage.getString(RECONCILED_KEY) === String(desired)) return;
  storage.set(RECONCILED_KEY, String(desired));
  // Nothing may depend on code after this line having run — see `lib/language.ts` § `setLanguage`.
  // A rejection (Android with no current activity) simply leaves the marker set, so the next
  // launch tries once more rather than looping in this one.
  void reloadAppAsync('Layout direction changed');
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
 * ⚠️ IT DELIBERATELY DOES **NOT** MOVE {@link isRTL}'s ANSWER. The tree is still mounted and its
 * native views are still laid out the old way, so every `Icon` that re-renders between the tap and
 * the reload must keep mirroring the way the screen actually looks. This function is about the
 * NEXT process; `applyStoredDirection` is what decides the current one.
 */
export function applyDirectionForLanguage(code: string | undefined | null): void {
  writeNativeDirection(resolveDirection(code));
}
