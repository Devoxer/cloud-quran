/**
 * Arabic rendering tokens — the Uthmani face and the scale it is set at (story 6-1).
 *
 * Separate from `typography.ts` on purpose: that file is the Latin UI scale (11–28px, ratios
 * tuned for English body copy), and Arabic in the KFGQPC face needs both a much larger size and a
 * much looser line height to be legible. Mixing the two scales is how "make the verse bigger"
 * turns into "the settings screen grew".
 *
 * ── ⚠️ THE FAMILY NAME IS PLATFORM-SPECIFIC, AND BOTH HALVES ARE TRAPS ──────────────────────
 *
 * The font is loaded by the **expo-font config plugin** (`app.json`), not `useFonts`, and the
 * plugin does something different on each platform:
 *
 *   • **iOS** — the file is added to the Xcode target and listed in `UIAppFonts`, so UIKit
 *     registers it under its INTERNAL name. That name is `"KFGQPC HAFS Uthmanic Script"` (the
 *     `name` table's family record), **not** the filename `KFGQPCUthmanicScriptHAFS`. This trap
 *     is recorded in `epic-1-retro-2026-03-20.md:117` and cost a story there.
 *     (The PostScript record is a third string again — `KFGQPCHAFSUthmanicScript-Regula`,
 *     truncated to 31 characters by the format. The retro calls the family name "the internal
 *     PostScript name"; they are different records and the family one is what RN resolves.)
 *
 *   • **Android — THE OPPOSITE, and the retro does not say so.** The plugin copies the file to
 *     `app/src/main/assets/fonts/<filename>.ttf` and React Native's `ReactFontManager` resolves
 *     `fontFamily` by looking for `fonts/<fontFamily>.ttf` in the assets. So on Android the
 *     family IS the filename, and the iOS name finds nothing. Android's `Typeface.create` falls
 *     back to the system font **silently**, so a wrong name here is not an error — it is Arabic
 *     rendered in Roboto, which still looks like Arabic to anything automated.
 *
 *   • **Web — the plugin does not run at all.** `app/_layout.tsx` registers the face with
 *     `useFonts`, web only, under the iOS spelling, so the two agree by construction. Without
 *     that, the face is silently absent on the platform the Electron desktop shell wraps.
 *     The map itself is `UTHMANI_WEB_FONT` at the bottom of this file — see its docblock for why
 *     it is here rather than written inline at the call site.
 *
 * A device smoke on each platform is the check that matters — every spelling type-checks, and a
 * missing family renders fallback glyphs rather than throwing. What CAN be pinned, and is
 * (`arabic.test.ts`), is that the value actually differs per platform: replacing the whole
 * `Platform.select` with the iOS spelling passed 104 suites, because the one case that read it
 * compared the rendered style against this same constant.
 */

import { Platform } from 'react-native';

/** The iOS/web spelling — the font's `name` table family record. Also the `useFonts` key. */
export const UTHMANI_FONT_FAMILY_IOS = 'KFGQPC HAFS Uthmanic Script';

/** The Android spelling — the bundled asset's filename without its extension. */
export const UTHMANI_FONT_FAMILY_ANDROID = 'KFGQPCUthmanicScriptHAFS';

/** The one value a style should ever use. See the header for why it is not a single string. */
export const UTHMANI_FONT_FAMILY: string =
  Platform.select({
    ios: UTHMANI_FONT_FAMILY_IOS,
    android: UTHMANI_FONT_FAMILY_ANDROID,
    default: UTHMANI_FONT_FAMILY_IOS,
  }) ?? UTHMANI_FONT_FAMILY_IOS;

/**
 * The Arabic reading scale, in points.
 *
 * ⚠️ `min` AND `max` BOUND A READER-CHOSEN SIZE, AND THE PICKER SHIPPED IN STORY 6-5:
 * `app/(tabs)/(profile)/appearance.tsx`, a `step: 2` slider over exactly this range writing
 * `PreferencesBody.fontSize` through `patchPreferences`. (This docblock used to say 6.5 "owns"
 * it, in the future tense — it does now.) `default` is what a reader with no stored preference
 * gets, and `lib/sync.ts`'s `DEFAULT_PREFERENCES.fontSize` carries the same number for the
 * first-ever wire body.
 *
 * The range matches the epic's stated 20–44px Arabic scale, **Reading Mode only** — mushaf
 * mode's size is fixed by its per-page fonts and nothing on the appearance screen touches it.
 *
 * ⚠️ THE WORKER REQUIRES AN INTEGER (`intIn(fontSize, 20, 44)`), and `clampArabicFontSize` below
 * clamps without ROUNDING. Anything feeding a value toward the wire rounds first; the slider's
 * `step` is what makes that a formality rather than a live risk.
 */
export const ARABIC_FONT_SIZE = {
  min: 20,
  default: 28,
  max: 44,
} as const;

/**
 * Line-height ratio for Uthmani text.
 *
 * ⚠️ MUCH LOOSER THAN ANY LATIN RATIO IN `typography.ts`, and it is not a taste call: the KFGQPC
 * face stacks vowel marks and the small waqf signs well above and below the baseline, and at the
 * Latin body ratio (1.5) the marks of one line collide with the letters of the next.
 */
export const ARABIC_LINE_HEIGHT = 2;

/** Clamp a stored/chosen font size into the scale. A preference from a future build cannot make
 *  the verse unreadably small or push one word per screen. */
export function clampArabicFontSize(size: number | undefined | null): number {
  if (typeof size !== 'number' || !Number.isFinite(size)) return ARABIC_FONT_SIZE.default;
  return Math.min(ARABIC_FONT_SIZE.max, Math.max(ARABIC_FONT_SIZE.min, size));
}

/**
 * ⚠️ U+06DF (ARABIC SMALL HIGH ROUNDED ZERO) IS STRIPPED FOR DISPLAY, AND THIS IS A MEASURED FONT
 * DEFECT RATHER THAN A TASTE CALL — recovered from the pre-fork row, which had it and whose reason
 * story 6-1 shipped without (`_reference/prefork-reading/features/reading/VerseRow.tsx`).
 *
 * The mark means "this letter is written but not pronounced" and a printed mushaf draws it as a
 * tiny ring above the letter. **The KFGQPC face draws it at full letter size.** Re-measured in
 * Chromium on 2026-08-27 against this repo's own `KFGQPCUthmanicScriptHAFS.ttf`: rendered beside a
 * lone waw at 200px it is a solid black disc WIDER THAN THE WAW ITSELF, and in 2:5
 * (`أُو۟لَٰٓئِكَ`) it lands mid-word twice, so the word reads as though a bullet were punched
 * through it. 2,240 of the 6,236 verses carry at least one, so this is a third of the book.
 *
 * ⚠️ THIS IS A DISPLAY TRANSFORM AND NOTHING ELSE. The Quran-text non-negotiable says no runtime
 * path MUTATES the text: the database is opened `PRAGMA query_only = ON`, the text reaches a
 * caller exactly as `uthmani_text` stores it, and the stripped copy is a local string that is
 * rendered and thrown away. Nothing persisted, nothing synced, nothing hashed sees it. A future
 * search or copy-to-clipboard must take the raw text, not this.
 *
 * ⚠️ IT IS UNCONDITIONAL, NOT WEB-ONLY, THOUGH THE DEFECT WAS FIRST FOUND ON WEB. The same file is
 * bundled for iOS and Android, one reader may open the same ayah on a phone and on the desktop
 * shell, and a platform branch here would give them two different-looking mushafs. Removing the
 * strip is how you re-measure it; the geometry above is what to look for.
 *
 * Moved here from `VerseRow` in story 6-4, because the bookmarks list's Arabic preview renders
 * the same face and owes the same transform — one definition, layer-legal from both features.
 * ⚠️ It applies to TEXT in the KFGQPC text face only: the mushaf's `word.qpcV1` is QPC glyph
 * encoding, where the codepoints mean glyph ids, so the strip must never touch that path.
 */
const SMALL_HIGH_ROUNDED_ZERO = /\u06DF/g;

/** Strip the marks the KFGQPC text face renders defectively — for DISPLAY only (see above). */
export function stripDisplayMarks(text: string): string {
  return text.replace(SMALL_HIGH_ROUNDED_ZERO, '');
}

/**
 * The web-only `useFonts` map: the family name a style asks for → the bundled face.
 *
 * ⚠️ IT IS A CONSTANT, NOT AN INLINE OBJECT, BECAUSE NOTHING COULD OBSERVE IT INLINE.
 * `jest.setup.js` mocks `useFonts` and its argument was discarded, so deleting the whole
 * registration — the only thing that loads this face on the platform Electron wraps — passed
 * every gate. A named export is something a test can read on both platforms.
 *
 * ⚠️ EMPTY ON NATIVE, AND THAT IS THE POINT. The expo-font config plugin has already installed
 * the face there; adding the TTF to the boot-gating font load would slow every native cold launch
 * to fetch something already present. On web the bundle is an HTTP request either way.
 *
 * ⚠️ THE `require` SITS INSIDE THE WEB BRANCH, AND THE NATIVE BUNDLE DOES NOT CARRY IT — MEASURED,
 * NOT ASSUMED. The worry is real in general (a bundler's dependency graph is static, so a
 * `require` in a dead branch usually still registers the asset), but `babel-preset-expo` inlines
 * `Platform.OS` at transform time and the folded branch is gone before Metro collects
 * dependencies. `expo export --platform ios` lists three assets — `SpaceMono-Regular.ttf` (93 KB),
 * `icon.png`, `src/data/quran.db` — and no KFGQPC face; `expo export --platform web` emits
 * `assets/fonts/kfgqpc/KFGQPCUthmanicScriptHAFS.<hash>.ttf` at exactly 242,368 bytes. So a
 * `.web.ts` sibling would buy nothing and cost a file no Jest resolver picks up by default.
 * ⚠️ Re-measure if the inline-platform transform ever changes; nothing else would notice.
 */
export const UTHMANI_WEB_FONT: Record<string, number> =
  Platform.OS === 'web'
    ? { [UTHMANI_FONT_FAMILY_IOS]: require('@/assets/fonts/kfgqpc/KFGQPCUthmanicScriptHAFS.ttf') }
    : {};
