/**
 * Spacing tokens based on 4px base unit
 * Source: docs/ux-design-specification.md (lines 389-405)
 */

import { Platform, type ViewStyle } from 'react-native';

export const SPACING = {
  /** 4px - Tight gaps, icon padding */
  xs: 4,
  /** 8px - Inline spacing, small gaps */
  sm: 8,
  /** 12px - Standard component padding */
  md: 12,
  /** 16px - Card padding, section gaps */
  lg: 16,
  /** 24px - Section separation */
  xl: 24,
  /** 32px - Major section breaks */
  xxl: 32,
  /** 48px - Screen padding (top/bottom) */
  xxxl: 48,
} as const;

export type SpacingToken = keyof typeof SPACING;
export type SpacingValue = (typeof SPACING)[SpacingToken];

/**
 * Layout tokens for container widths and max-widths
 * Source: Common responsive design patterns
 */
export const LAYOUT = {
  maxWidth: {
    /** 360px - Compact modals, prompts, dialogs */
    modal: 360,
    /** 400px - Narrow forms, auth screens */
    narrow: 400,
    /** 480px - Forms, modals, cards */
    form: 480,
    /** 640px - Content containers */
    content: 640,
    /** 768px - Main content area */
    main: 768,
    /** 1024px - Wide content */
    wide: 1024,
    /** 1280px - Full app shell (sidebar + content) */
    appShell: 1280,
  },
  /** Component-specific sizes */
  component: {
    /** 200px - Note card width in horizontal lists */
    noteCardWidth: 200,
    /** 48x72 - Book cover thumbnail (3:4.5 aspect ratio) */
    bookCoverThumbnail: {
      width: 48,
      height: 72,
    },
  },
} as const;

export type LayoutMaxWidthToken = keyof typeof LAYOUT.maxWidth;
export type LayoutMaxWidthValue = (typeof LAYOUT.maxWidth)[LayoutMaxWidthToken];

/**
 * iPadOS major version from which `<NativeTabs sidebarAdaptable>` actually moves the tabs off the
 * bottom. The prop is documented "iOS 18+"; the app's deployment target is **16.4**
 * (`app.json` → `expo-build-properties`), so iPadOS 16.4–17 is a real, shipping window in which an
 * iPad still renders a BOTTOM bar.
 */
const IPAD_TOP_TABS_MIN_MAJOR = 18;

/** True only where the tabs genuinely leave the bottom edge: an iPad on iPadOS 18 or later. */
const HAS_TOP_OR_SIDEBAR_TABS =
  Platform.OS === 'ios' &&
  Platform.isPad &&
  Number.parseInt(String(Platform.Version), 10) >= IPAD_TOP_TABS_MIN_MAJOR;

/**
 * The height of the native tab bar's own chrome, in points/dp — the ONE number any screen that
 * must sit above it consumes, as `TAB_BAR_HEIGHT + insets.bottom`.
 *
 * ⚠️ IT IS A CONSTANT AND NOT A HOOK, AND THAT IS THE WHOLE POINT. `useBottomTabBarHeight()` is
 * expo-router's re-export of the **JS bottom-tabs navigator's** hook: it reads
 * `BottomTabBarHeightContext`, which only that navigator's `BottomTabView` mounts, and it THROWS
 * where no provider exists. This app renders `<NativeTabs>`, which mounts none — so the obvious
 * call is a crash, not a wrong number. wisdom-fruits ships `NativeTabs` in production and has zero
 * call sites for that hook.
 *
 * Every value below was paid for on a device, and each replaced a plausible wrong one:
 * - **iOS 49.** iOS 18–25 UITabBar visible content is 49pt, and `insets.bottom` already supplies
 *   the home indicator. A previous `ios: 84` double-counted it (84 ≈ 49 + ~34) and floated the
 *   element far too high.
 * - **Android 80.** Material-3 `NavigationBar` — what `NativeTabs` renders there — is 80dp, NOT
 *   Material-2's 56dp. At 56 the element overlapped the bar in an Android smoke.
 * - **iPad 0 — but only on iPadOS 18+.** `sidebarAdaptable` moves the tabs to the TOP or a sidebar
 *   there, so there is no bottom bar to clear, and reserving 49pt anyway floated the element too
 *   high in an owner iPad smoke. ⚠️ The prop needs iPadOS **18**, and this app deploys to **16.4**:
 *   on iPadOS 16.4–17 the tabs are still at the bottom, so a flat `Platform.isPad → 0` would
 *   UNDER-reserve there and cover the last verse — the exact defect this constant exists to
 *   prevent, reintroduced by the fix for its sibling. The version check is why
 *   `HAS_TOP_OR_SIDEBAR_TABS` exists rather than a bare `Platform.isPad`.
 * - **Web 0**, for the same reason as the modern iPad: its chrome is a top pill.
 *
 * ⚠️ story 6-0 shipped this WITHOUT a consumer, and says so rather than implying otherwise. The
 * first screen that reserves space above the bar is story 6.1's reading surface. That is a real
 * gap, and it is the exact shape of the `tab-bar-covers-last-verse` defect: `MINI_PLAYER_HEIGHT`
 * was exported and correct and had zero consumers, and the last verse was still covered. An
 * exported number is not a fix — it is only the end of the argument about which number to use.
 *
 * ⚠️ story 6-0 also deleted `FLOATING_PILL_CLEARANCE`, which reserved 88px at the bottom of five
 * profile screens to clear a floating mini-player that went with the audio feature in story 5-1 —
 * the call sites were live, the reason was not, and on web and iPad (its only non-zero branches)
 * nothing sits at the bottom at all.
 */
export const TAB_BAR_HEIGHT = HAS_TOP_OR_SIDEBAR_TABS
  ? 0
  : (Platform.select({ ios: 49, android: 80, default: 0 }) ?? 0);

/**
 * Cross-platform TOP breathing room below the header for a scroll screen whose content otherwise
 * butts the header.
 *
 * ⚠️ story 6-0 DELETED THIS AND THEN PUT IT BACK, which is worth recording because the delete
 * looked obviously right: zero consumers, and the story's own task list named it. What that missed
 * is that its premise had just been REINSTATED. The 2026-08-26 chrome reversal keeps the native
 * header on every pushed screen, and an opaque Material/web header is exactly the condition these
 * branches were measured against — story 6.1's reading surfaces are the first screens to meet it.
 * The story told us to ASK before deleting `useLiquidGlassHeaderInset` for precisely this reason,
 * and this constant is the same case; deleting it would have left three device-measured values
 * surviving only in git history, where nobody looks.
 *
 * Resolved **independently per platform** (they MAY differ):
 * - **iOS → 0.** The floating large-title header (`headerTransparent: true`) does NOT consume
 *   layout; `contentInsetAdjustmentBehavior="automatic"` already insets scroll content generously
 *   below it. A positive value here would *double-space*, so iOS MUST stay 0. Summing 0 into a
 *   `paddingTop` is a guaranteed no-op — the load-bearing invariant, pinned by its test.
 * - **Web → `SPACING.xl`.** The solid JS header is space-consuming but leaves no margin, so the
 *   first card butts it.
 * - **Android → `SPACING.xl`.** The opaque Material header consumes layout but leaves ZERO
 *   breathing gap, so the first row reads cramped across every header route. Confirmed on an
 *   Android emulator smoke.
 *
 * MUST be summed into a scroll view's `contentContainerStyle.paddingTop` — NEVER a wrapping
 * `<View>` or root scroll wrapper, which re-breaks the iOS large-title shrink-on-scroll. Routes
 * that already set an explicit `padding`/`paddingTop` (the settings forms do) already have a
 * cross-platform gap → do NOT add this, it would stack into double-spacing.
 */
export const HEADER_CONTENT_CLEARANCE =
  Platform.OS === 'web' ? SPACING.xl : Platform.OS === 'android' ? SPACING.xl : 0;

/**
 * Minimum interactive touch-target size (pt). Apple HIG / Material accessibility
 * minimum — wrap small icon buttons in a hit area of at least this size. It is a
 * touch-target size, not 4px-grid spacing, so it lives here as a named semantic
 * constant rather than a SPACING token (don't force it to `spacing(11)`).
 */
export const MIN_TOUCH_TARGET = 44;

/**
 * Helper function for custom spacing based on 4px base unit
 * @param multiplier - Number to multiply the base unit (4px) by
 * @returns Spacing value in pixels
 */
export function spacing(multiplier: number): number {
  return 4 * multiplier;
}

/**
 * Wide-screen content cap — the canonical Story 23.7 pattern, generalized in
 * Story 23.25 so scroll screens stop hand-rolling the three literals.
 *
 * Returns the three style props that center + cap a scroll screen's content on
 * wide viewports (web / iPad / Android tablet): `width:'100%'` self-caps to
 * `min(viewport, token)`, so it is a **no-op below the token** (phones
 * unaffected) — no `useWindowDimensions` gate needed (the token self-gates, and
 * RN/CSS re-flow on resize for free).
 *
 * Spread into a scroll view's `contentContainerStyle` (the scroll view stays the
 * screen's DIRECT child) — NOT a wrapping `<View>`, which re-breaks the iOS
 * large-title shrink-on-scroll on iPad (STACK-CHEAT-SHEET § "maxWidth wrapper
 * breaks iOS large-title"). This is a STYLE OBJECT, not a component, for exactly
 * that reason. Works on `ScrollView`, `FlatList`, and `FlashList` v2 (whose
 * `contentContainerStyle` is a full `StyleProp<ViewStyle>`). For non-scroll
 * content blocks use `<ContentContainer>` instead.
 *
 * @param token - a `LAYOUT.maxWidth` key. Reading/list columns → `main` (768,
 *   the default); settings/form columns read better tighter → `content` (640)
 *   or `form` (480).
 */
export function screenContentStyle(
  token: LayoutMaxWidthToken = 'main'
): Pick<ViewStyle, 'width' | 'maxWidth' | 'alignSelf'> {
  return { width: '100%', maxWidth: LAYOUT.maxWidth[token], alignSelf: 'center' };
}
