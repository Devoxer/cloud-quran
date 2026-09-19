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
 * ⚠️ **QURAN STRUCTURE NUMBERS ARE A READER SETTING, NOT A CONSEQUENCE OF THE LANGUAGE — AND
 * THIS PARAGRAPH HAS NOW SAID ALL THREE THINGS.** It first said "digits stay Western in every
 * language" (8-1), then "Arabic-Indic whenever the UI is Arabic" (2026-09-13, after the QPC font
 * drew the ayah markers `٦ ٧ ٨` above our own page number reading `3`), and since 2026-09-14 the
 * answer is a DEVICE-LOCAL PREFERENCE defaulting to Western in every language, including Arabic.
 * Nothing here decides it: `lib/numerals.ts` owns the preference and carries all three states,
 * `lib/format.ts` § `formatQuranNumber` owns the rendering and the BOUNDARY (durations, byte
 * sizes and anything a reader compares against a Latin-digit source stay Western whatever the
 * setting says). ⚠️ Do NOT re-couple it to {@link isArabicUi} — that coupling IS state 2.
 *
 * ⚠️ **`app.json` GAINS NO `locales` / `CFBundleLocalizations`, SO iOS OFFERS NO PER-APP LANGUAGE
 * ROW IN SYSTEM SETTINGS.** Deliberate for this story: the picker is in-app and device-local, and
 * an OS-level row would be a SECOND authority over the same preference with no way to keep the two
 * in step (the system row changes the locale, not our MMKV key). If it is ever wanted, it belongs
 * with a `deviceSeedLanguage()` that re-reads on foreground — which is a story, not a config line.
 */

import { reloadAppAsync } from 'expo';
import { I18nManager, Platform } from 'react-native';

import { getLanguage, getStoredLanguage } from './language';
import { createAppMMKV } from './mmkv';

/**
 * START-EDGE TEXT ALIGNMENT — the value a UI `Text` must SPELL OUT, and the reason it is the word
 * `'left'` (bug fix, 2026-09-14).
 *
 * ── ⚠️ THE DEFECT: AN UNSET `textAlign` DOES NOT FOLLOW `forceRTL` ON iOS ────────────────────
 *
 * Reported on the owner's iPhone in the Arabic build: on `/surahs` the header title `القرآن` sat
 * at the FAR LEFT and every row's title/subtitle was LEFT-aligned, while the row's own flex
 * container had mirrored correctly (the surah number on the right, the download control on the
 * left). One screen, two halves disagreeing.
 *
 * The cause is in React Native's iOS text layer, and it is a HOLE rather than a choice.
 * `RCTAttributedTextUtils.mm` writes a paragraph style's `alignment` **only inside
 * `if (textAttributes.alignment.has_value())`** — i.e. only when `textAlign` was explicitly set —
 * and it is that same block that swaps `Left`↔`Right` under an RTL layout direction. With no
 * `textAlign`, no `NSParagraphStyle` alignment is written at all, so TextKit falls back to
 * `NSTextAlignmentNatural`, which resolves from the app BUNDLE's localization
 * (`defaultWritingDirectionForLanguage:`) — and `app.json` deliberately declares no `locales` /
 * `CFBundleLocalizations` (see the note at the foot of this header). `I18nManager.forceRTL` is
 * not part of that resolution on any path. Android has no such hole: `ReactTextViewManager`
 * defaults to `Gravity.START`, which follows the view's layout direction — which is why the bug
 * was iOS-only, exactly like this story's SF-symbol one.
 *
 * ⚠️ IT ONLY SHOWS IN A BOX WIDER THAN THE TEXT, which is what made it look local rather than
 * global. A `Text` that hugs its content is already placed by the flex container, so the mirror
 * is correct and the alignment inside it is unobservable — the mushaf chrome's title
 * (`flex: 0` beside its chevron), the tab-bar labels (centred) and every pill and button. The
 * symptom appears exactly where a `Text` STRETCHES: `flex: 1` (a settings/list row's text block,
 * this app's header title when it has no press target) or a full-width column child (a group
 * label, a footnote, a paragraph).
 *
 * ── ⚠️ WHY THE VALUE IS `'left'`, AND WHY THAT IS NOT A PHYSICAL PROPERTY IN DISGUISE ────────
 *
 * RN has no `textAlign: 'start'`. It does not need one: BOTH platforms swap `left`↔`right` for
 * `textAlign` under an RTL layout direction — iOS in the block quoted above, Android in
 * `TextAttributeProps.kt` (`"left" -> if (isRTL) Gravity.RIGHT else Gravity.LEFT`). So `'left'`
 * IS the logical start edge, in both directions, on both platforms; on web it is literally left,
 * which is also start there because {@link resolveDirection} floors web to LTR. Spelling it as a
 * named constant is what stops the next reader "fixing" it to `'right'` — which would align to
 * the END edge under Arabic and be correct nowhere.
 *
 * ⚠️ NEVER PUT THIS ON QURAN CONTENT. Verse rows, mushaf lines, bookmark previews and the
 * appearance sample set `writingDirection: 'rtl'` + `textAlign: 'right'` themselves and must keep
 * it whatever the interface language is — content direction is not UI direction
 * (`lib/rtl.test.ts` § "content direction is not UI direction" is the gate for that half).
 */
export const TEXT_ALIGN_START = 'left' as const;

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
 * The CONTENT languages written right to left — every script a content pack may arrive in.
 *
 * ⚠️ IT IS A DIFFERENT LIST FROM {@link RTL_LANGUAGES} AND THAT SEPARATION IS THE POINT (story
 * 8-3 review, S6). `RTL_LANGUAGES` is the set of INTERFACE locales this app ships, which is two;
 * a content pack's language is not an interface language and never will be. Story 8-2's content
 * screen and story 8-3's study sheet both drew a pack's own text with `isRTLLanguage`, so the one
 * entry there — Arabic — was doing double duty. **Story 8-4 ships Urdu, Persian and Pashto**, all
 * of which would have ranged LEFT with nothing to catch it: `rtl.test.ts` only scans content files
 * for `I18nManager`/`isRTL` reads, and a correct-looking call to the wrong list passes that scan.
 *
 * Codes are BCP-47 PRIMARY subtags, matched case-insensitively against everything before the first
 * separator, so `fa-IR`, `ur-PK` and `ckb-IQ` all resolve. Scripts, not countries: `pa` (Punjabi)
 * is deliberately ABSENT because Gurmukhi is left-to-right and Shahmukhi is written `pa-Arab` —
 * a tag with an explicit Arabic script subtag is matched below on the script instead.
 */
export const RTL_CONTENT_LANGUAGES: readonly string[] = [
  'ar', // Arabic
  'fa', // Persian / Farsi
  'ur', // Urdu
  'ps', // Pashto
  'sd', // Sindhi
  'ks', // Kashmiri
  'ug', // Uyghur
  'dv', // Divehi
  'ckb', // Central Kurdish (Sorani)
  'ku', // Kurdish, where written in the Arabic script
  'he', // Hebrew
  'yi', // Yiddish
  'prs', // Dari
  'bal', // Balochi
  'arc', // Aramaic / Syriac
];

/** Script subtags that decide direction on their own, whatever the language in front of them. */
const RTL_SCRIPTS = ['arab', 'aran', 'hebr', 'syrc', 'thaa'];

/**
 * Whether a CONTENT language is written right to left — the one question a draw site should ask
 * about a pack's own text. Never about the interface: that is {@link resolveDirection}.
 */
export function isRTLContentLanguage(code: string | undefined | null): boolean {
  if (code == null || code.length === 0) return false;
  const parts = code.toLowerCase().split(/[-_]/);
  if (parts.some((part) => RTL_SCRIPTS.includes(part))) return true;
  return RTL_CONTENT_LANGUAGES.includes(parts[0]);
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

/**
 * Whether the COMMITTED UI language is written in the Arabic SCRIPT — the question every surface
 * asks that is about the copy rather than about the layout (story 8-1 follow-up): which of a
 * surah's two names to print, which of a reciter's two names to say, and which numerals a Quran
 * structure number gets. See `lib/surahName.ts` and `lib/format.ts` § `formatQuranNumber`.
 *
 * ⚠️ IT IS NOT {@link isRTL}, AND THE DIFFERENCE IS WEB. `isRTL()` answers "is THIS PROCESS laid
 * out right to left", which is floored to `false` on web because `react-native-web`'s
 * `I18nManager` is a stub (see the header). A web reader on Arabic still gets Arabic COPY — so a
 * web build asking `isRTL()` here would print `Al-Baqarah` inside an otherwise Arabic interface,
 * which is the mixed-script defect this predicate exists to close. Script, not direction.
 *
 * ⚠️ AND IT READS THE COMMITTED LANGUAGE PER CALL, never a module-scope constant: `getLanguage()`
 * floors to the device seed before `initI18n()` runs, so a value captured at import time can be a
 * different answer from the one the app commits to (`lib/language.ts` § `getLanguage`).
 */
export function isArabicUi(): boolean {
  return isRTLLanguage(getLanguage());
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
