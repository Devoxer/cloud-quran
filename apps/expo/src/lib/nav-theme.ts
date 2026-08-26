/**
 * Cross-platform navigation header options.
 *
 * Story 17.3 (iPhone smoke pass 7) — centralised the iOS-specific
 * Liquid Glass opt-in so it lives in ONE place. Every migrated Stack
 * layout spreads `LIQUID_GLASS_STACK_OPTIONS` in its `screenOptions`
 * instead of repeating `Platform.select` per layout.
 *
 * Why centralise:
 * - Solo dev + AI + template scale → per-layout `Platform.select` is N
 *   places to maintain. One config util = one edit point. (User
 *   directive 2026-05-26: "i dont want divergeance thats gonna add
 *   maintenance".)
 *
 * Why iOS-only:
 * - `headerTransparent: true` on iOS lets the iOS 26 system
 *   `UINavigationBarAppearance` render its default Liquid Glass
 *   floating-capsule chrome. NOT setting `headerBlurEffect` is
 *   important — that prop forces the legacy iOS-17/18 `UIBlurEffect`
 *   flat-bar chrome and SUPPRESSES iOS 26's default Liquid Glass
 *   (per react-native-screens 4.25 docs).
 * - On Android, `headerTransparent: true` works at the toolbar level
 *   BUT `contentInsetAdjustmentBehavior` is iOS-only, so the
 *   ScrollView content overlaps the toolbar (top items hidden behind
 *   chrome). The native Android default — solid Material 3 toolbar —
 *   renders cleanly with no overlap. Don't fight it.
 * - On web, expo-router renders a JS `Header`; the native solid
 *   chrome is the safer + more accessible default.
 *
 * Net result on each platform with this util:
 * - iOS 26: floating Liquid Glass capsules, content scrolls under
 *   (auto-inset via `contentInsetAdjustmentBehavior="automatic"` on
 *   the scroll view).
 * - Android: solid Material 3 toolbar, content starts below it.
 * - Web: solid JS header, content starts below it.
 */

import { Platform } from 'react-native';

import type { ColorTokens } from '@/constants/Colors';

// Intentionally NO explicit `NativeStackNavigationOptions` annotation —
// that type lives at `expo-router/build/react-navigation/native-stack/types`
// (deep internal path, no clean re-export) and tying this util to it
// would make us brittle to expo-router internal moves. The literal
// returned by `Platform.select` is structurally compatible with the
// `screenOptions` slot at every Stack spread site; TS validates the
// shape there.
export const LIQUID_GLASS_STACK_OPTIONS = Platform.select({
  ios: {
    headerTransparent: true,
    headerStyle: { backgroundColor: 'transparent' as const },
  },
  default: {},
}) as { headerTransparent?: boolean; headerStyle?: { backgroundColor: string } };

/**
 * For the Bottom Tabs `headerBackground` BlurView, see the
 * `Platform.OS === 'ios'` guard in `(tabs)/_layout.tsx`. BlurView lives
 * there alongside the `<Tabs.Screen>` config; this util stays
 * dep-light so it can be spread into any Stack layout's `screenOptions`
 * without pulling in `expo-blur`.
 */

/**
 * ⚠️ story 6-0 deleted FIVE presets from this file — `SHARED_BOOK_STACK_OPTIONS`,
 * `SHARED_NOTE_STACK_OPTIONS`, `SHARED_QUIZ_STACK_OPTIONS`, `SHARED_QUOTES_STACK_OPTIONS` and
 * `PLAYER_STACK_OPTIONS`. Every one of them configured the chrome of a route that went with the
 * wisdom-fruits domain deletion in story 5-1, so each had zero importers and each was a
 * confident, detailed, WRONG answer waiting for whoever greps this file for a modal or a shared
 * route. `PLAYER_STACK_OPTIONS` in particular described the root-modal pattern story 6-0 is
 * built on — including the two native header controls `lint:header-controls` forbids here.
 * Epic 7 rebuilds the player; it should read the gate and the story, not a dead const.
 */

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
