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
 * ⚠️ THE TAB-BAR OFFSET IS NOT HERE ANY MORE — it is `useTabBarHeight()` in
 * `lib/useTabBarHeight.ts`, and it stopped being a constant in story 6-0's review round.
 * `TAB_BAR_HEIGHT` answered 0 on any iPad running iPadOS 18+, because `<NativeTabs
 * sidebarAdaptable>` moves the tabs to the top or a sidebar there — but only at REGULAR horizontal
 * width. In Slide Over and in a compact-width Split View the bottom bar comes back, and no
 * module-scope value can see that: the width changes at runtime when the reader resizes the split.
 * The numbers, and the device smoke behind each, moved with it.
 *
 * ⚠️ story 6-0 also deleted `FLOATING_PILL_CLEARANCE`, which reserved 88px at the bottom of five
 * profile screens (`account`, `data`, `feedback`, `privacy-settings`, `sign-in`) to clear the
 * floating mini-player pill. ⚠️ ITS DELETION RATIONALE WAS FIRST WRITTEN DOWN WRONG, as "on web and
 * iPad nothing sits at the bottom at all" — the flat `Platform.isPad` premise `useTabBarHeight`
 * rejects at length, and an inversion of the constant's own reason. Web and iPad were its only
 * NON-zero branches precisely because something DID sit at the bottom there, unreserved: on
 * iPhone and Android the native bar auto-insets the content and the pill floats above it, while on
 * web and iPad nothing insets, so the 88px had to be reserved by hand. What actually made the
 * constant dead is simpler and platform-independent: the mini-player it cleared went with the audio
 * feature in story 5-1, so all five call sites were reserving space for an element that no longer
 * exists. Epic 7 rebuilds the player; it does not inherit this constant.
 */

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
