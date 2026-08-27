/**
 * The navigator's THEME — the one thing left in this module (story 6-6).
 *
 * ⚠️ `LIQUID_GLASS_STACK_OPTIONS` and `lib/useLiquidGlassHeaderInset.ts` were DELETED here.
 * Both described the NATIVE stack header — iOS 26's transparent Liquid Glass chrome and the
 * inset a fixed element needed to clear it — and story 6-6 removed the native header from every
 * screen: the app draws its own (`components/ui/AppHeader`), which is opaque, occupies layout
 * in the settings shell and overlays on the reading surfaces. An option preset for a header
 * that renders nowhere is a confident, detailed, WRONG answer waiting for the next grep — the
 * same reason story 6-0 deleted five dead presets from this file before it.
 */

import type { ColorTokens } from '@/constants/Colors';

/**
 * The React Navigation theme — the ONE place our palette tokens reach the native navigator.
 *
 * ⚠️ IT PAINTS MORE THAN THE HEADER, WHICH IS WHY IT LIVES IN A MODULE WITH A TEST. React
 * Navigation's `theme.colors.background` is the default `contentStyle` background for every
 * native-stack SCENE, `card` is the header/tab-bar surface, `text` the header title and `border`
 * the hairline under it. So a token missing here is not a header bug — it is a scene that stops
 * following the palette three screens down, which is exactly the shape of defect that gets found
 * on one screen and assumed everywhere else.
 *
 * ⚠️ IT MOVED OUT OF `app/_layout.tsx` IN STORY 6-0 FOR ONE REASON: a function defined inside a
 * route file cannot be unit-tested without dragging the whole boot path (better-auth's
 * module-scope listeners included) into the suite. `nav-theme.test.ts` now walks all six palettes
 * × both schemes against `composeColors`, so "the chrome is themed" is measured rather than
 * asserted on the one screen somebody looked at.
 *
 * The `fonts` group is required by the `ReactNavigation.Theme` contract and is deliberately the
 * system face — Cloud Quran ships no custom UI typeface, and the Quran faces are content, not
 * chrome.
 */
export function createNavigationTheme(colors: ColorTokens, isDark: boolean): ReactNavigation.Theme {
  return {
    dark: isDark,
    colors: {
      primary: colors.accent.primary,
      background: colors.background.primary,
      card: colors.background.secondary,
      text: colors.text.primary,
      border: colors.border,
      notification: colors.accent.primary,
    },
    fonts: {
      regular: { fontFamily: 'System', fontWeight: '400' },
      medium: { fontFamily: 'System', fontWeight: '500' },
      bold: { fontFamily: 'System', fontWeight: '700' },
      heavy: { fontFamily: 'System', fontWeight: '900' },
    },
  };
}
