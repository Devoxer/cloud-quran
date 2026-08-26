/**
 * useTabBarHeight — the height of the native tab bar's own chrome, in points/dp. The ONE value any
 * screen that must sit above it consumes, as `useTabBarHeight() + insets.bottom`.
 *
 * ⚠️ IT IS NOT `useBottomTabBarHeight()`, WHICH WOULD CRASH. That is expo-router's re-export of the
 * **JS bottom-tabs navigator's** hook: it reads `BottomTabBarHeightContext`, which only that
 * navigator's `BottomTabView` mounts, and it THROWS where no provider exists. This app renders
 * `<NativeTabs>`, which mounts none — so the obvious call is a crash, not a wrong number.
 * wisdom-fruits ships `NativeTabs` in production and has zero call sites for it.
 *
 * ⚠️ IT IS A HOOK RATHER THAN A CONSTANT ONLY BECAUSE OF THE iPad, AND STORY 6-0 SHIPPED IT AS A
 * CONSTANT FIRST. `TAB_BAR_HEIGHT` lived in `constants/spacing.ts` and answered 0 on any iPad
 * running iPadOS 18+, on the grounds that `<NativeTabs sidebarAdaptable>` moves the tabs to the top
 * or a sidebar there. It does — **in regular horizontal width**. In Slide Over, and in a
 * compact-width Split View, iPadOS falls back to the BOTTOM bar, and the constant answered 0 with
 * the bar still sitting over the content. That is the `tab-bar-covers-last-verse` defect exactly,
 * reintroduced by the fix for its sibling, and no module-scope value can see it: the width changes
 * at runtime when the reader resizes the split.
 *
 * ⚠️ THE WIDTH TEST IS A STAND-IN FOR A SIZE CLASS RN CANNOT READ, AND IT FAILS TOWARD RESERVING.
 * React Native exposes no horizontal size class, so `REGULAR_WIDTH_MIN` stands in for one. 508 is
 * the first point above the widest window UIKit still classes as compact (a portrait half-split,
 * 507pt), so nothing that actually has a bottom bar is ever told it has none. The residual error
 * runs the harmless way: a 12.9" iPad in a half-split may be regular-width with the tabs already at
 * the top, and would reserve 49pt it does not need — the element floats slightly high, which is
 * cosmetic, where under-reserving covers the verse the reader is on. A device smoke on 6.1's
 * reading surface is what settles the exact boundary.
 *
 * Every number below was paid for on a device, and each replaced a plausible wrong one:
 * - **iOS 49.** iOS 18–25 UITabBar visible content is 49pt, and `insets.bottom` already supplies
 *   the home indicator. A previous `ios: 84` double-counted it (84 ≈ 49 + ~34) and floated the
 *   element far too high.
 * - **Android 80.** Material-3 `NavigationBar` — what `NativeTabs` renders there — is 80dp, NOT
 *   Material-2's 56dp. At 56 the element overlapped the bar in an Android smoke.
 * - **iPad 0 — on iPadOS 18+ AND at regular width.** Reserving 49pt where the tabs had moved to the
 *   top floated the element too high in an owner iPad smoke. ⚠️ `sidebarAdaptable` needs iPadOS
 *   **18** and this app deploys to **16.4**, so iPadOS 16.4–17 is a real shipping window in which
 *   an iPad still renders a bottom bar — which is why the version is checked and not just
 *   `Platform.isPad`.
 * - **Web 0**, for the same reason as the modern iPad: its chrome is a top pill.
 *
 * ⚠️ story 6-0 shipped this WITHOUT a consumer, and says so rather than implying otherwise. The
 * first screen that reserves space above the bar is story 6.1's reading surface. That is a real
 * gap, and it is the exact shape of the defect: `MINI_PLAYER_HEIGHT` was exported and correct and
 * had zero consumers, and the last verse was still covered. An exported number is not a fix — it is
 * only the end of the argument about which number to use.
 */

import { Platform, useWindowDimensions } from 'react-native';

/**
 * iPadOS major version from which `<NativeTabs sidebarAdaptable>` actually moves the tabs off the
 * bottom. The prop is documented "iOS 18+"; the app's deployment target is **16.4**
 * (`app.json` → `expo-build-properties`).
 */
const IPAD_TOP_TABS_MIN_MAJOR = 18;

/**
 * Window width, in points, at or above which an iPad is treated as regular horizontal width — the
 * condition under which `sidebarAdaptable` actually moves the tabs. See the header for why this
 * threshold is 508 and which way its error runs.
 */
const REGULAR_WIDTH_MIN = 508;

/** iOS `UITabBar` visible content height, excluding the home indicator `insets.bottom` supplies. */
const IOS_TAB_BAR_HEIGHT = 49;

/** Material-3 `NavigationBar` height — what `<NativeTabs>` renders on Android. */
const ANDROID_NAV_BAR_HEIGHT = 80;

export function useTabBarHeight(): number {
  const { width } = useWindowDimensions();
  const tabsHaveLeftTheBottomEdge =
    Platform.OS === 'ios' &&
    Platform.isPad &&
    Number.parseInt(String(Platform.Version), 10) >= IPAD_TOP_TABS_MIN_MAJOR &&
    width >= REGULAR_WIDTH_MIN;

  if (tabsHaveLeftTheBottomEdge) return 0;
  return (
    Platform.select({ ios: IOS_TAB_BAR_HEIGHT, android: ANDROID_NAV_BAR_HEIGHT, default: 0 }) ?? 0
  );
}
