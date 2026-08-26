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
 * Bottom space a scroll screen must reserve so its last row clears the FLOATING
 * mini-player pill — on platforms where the tab bar is NOT at the bottom, so the
 * pill floats over content with nothing auto-insetting it (Story 23.25, AC-5).
 *
 * Applies on **web** (pill is `position:fixed`, nav is a top pill) AND **iPad**
 * (`<NativeTabs sidebarAdaptable>` moves the tabs to the TOP / a sidebar, so the
 * JS-overlay pill floats over the bottom of the content). On **iPhone / Android**
 * the bottom UITabBar / Material nav auto-insets the content and the pill floats
 * above it, so no extra reservation is needed → 0.
 *
 * = pill height (56 — mirrors `MiniPlayer.PILL_HEIGHT`; duplicated as a literal
 * because a `constants/` module must NOT import a `features/` one — wrong layer)
 * + the pill's bottom offset (~24) + an 8pt breathing gap = 88. Reserved
 * **unconditionally** (NOT audio-gated) for simplicity + robustness — an ~88px
 * bottom gap is a conventional, unobtrusive cost, and avoids coupling every
 * scroll route to the audio store. (`Platform.isPad` is iOS-only; the `||` order
 * keeps it safe on web/Android where the property is absent.)
 */
export const FLOATING_PILL_CLEARANCE =
  Platform.OS === 'web' || (Platform.OS === 'ios' && Platform.isPad) ? 56 + 24 + 8 : 0;

/**
 * Cross-platform TOP breathing room below the header for a scroll screen whose
 * content otherwise butts the header (Story 23.27 — unifies the web-only
 * `WEB_HEADER_CLEARANCE` from 23.25 with the Android half disproved by the 23.26
 * Android smoke).
 *
 * Resolved **independently per platform** (they MAY differ — see below):
 * - **iOS → 0.** The floating large-title header (`headerTransparent: true`) does
 *   NOT consume layout; `contentInsetAdjustmentBehavior="automatic"` already insets
 *   scroll content generously below it. Adding a positive gap here would
 *   *double-space*, so iOS MUST stay 0. Summing 0 into a `paddingTop` is a
 *   guaranteed no-op (the story's load-bearing invariant).
 * - **Web → `SPACING.xl`.** The solid JS header is space-consuming but leaves no
 *   margin, so the first card butts it. Pinned at the 23.25 value (web is a
 *   guaranteed no-op regression) — kept independent from Android so Android can
 *   diverge without touching web.
 * - **Android → `SPACING.xl`.** The opaque Material header consumes layout (content
 *   starts below it) but leaves ZERO breathing gap, so the first row reads cramped
 *   across every header route (23.26 Android smoke). Value confirmed by the 23.27
 *   Android emulator smoke.
 *
 * MUST be summed into a scroll view's `contentContainerStyle.paddingTop` — NEVER a
 * wrapping `<View>` or root scroll wrapper, which re-breaks the iOS large-title
 * shrink-on-scroll (STACK-CHEAT-SHEET § "maxWidth wrapper breaks iOS large-title").
 * Routes that already set an explicit `padding`/`paddingTop` (settings forms) or a
 * fixed `useLiquidGlassHeaderInset`-offset field already have a cross-platform gap
 * → do NOT add this (would stack into double-spacing).
 *
 * ⚠️ TWO KNOWN VIOLATIONS OF THE "NEVER a wrapping `<View>`" RULE, both temporary
 * (Story 24.15 § D1 → 24.16 AC-7): `discover.tsx`'s `emptyLanguageRow` sums this
 * into a non-scroll `<View>` on the two empty branches. It does not re-break the
 * iOS large-title (the banned consequence) only because the value is 0 on iOS —
 * but that same 0 is why the chip renders UNDER iOS's transparent header there
 * (review-log H3). The rule is right and the call site is wrong; 24.16 moves the
 * row inside the scroll container, which fixes iOS and deletes both usages. Do not
 * copy the pattern in the meantime — for a fixed element above a scroll, use
 * `useLiquidGlassHeaderInset()` (`insets.top + 44`), which is what the five other
 * screens with this shape do.
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
