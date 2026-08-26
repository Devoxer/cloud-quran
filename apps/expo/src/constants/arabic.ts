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
 *     `useFonts` under the iOS spelling, web only, so the two agree by construction. Without
 *     that, the face is silently absent on the platform the Electron desktop shell wraps.
 *
 * There is no test that can catch a wrong value here: every spelling type-checks, and a missing
 * family renders fallback glyphs rather than throwing. A device smoke on each platform is the
 * only check, which is why the reasoning is written down instead.
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
 * ⚠️ `min` AND `max` BOUND A READER-CHOSEN SIZE THAT STORY 6.5 OWNS, not this one.
 * `PreferencesBody.fontSize` is already a synced number (`lib/outbox.ts`), so a preference may
 * exist before its picker does — this story READS one if it is there and clamps it, and ships
 * `default` when it is not. The range matches the epic's stated 20–44px Arabic scale (Reading
 * Mode only; mushaf mode's size is fixed by its per-page fonts).
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
