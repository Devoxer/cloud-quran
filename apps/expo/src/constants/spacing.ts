/**
 * Spacing tokens based on 4px base unit
 * Source: docs/ux-design-specification.md (lines 389-405)
 */

import type { ViewStyle } from 'react-native';

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
 * ⚠️ THE TAB-BAR OFFSET IS `CHROME_BAR_HEIGHT` IN `constants/navigation.ts` (story 6-6). The
 * hook that used to answer this (`lib/useTabBarHeight.ts`) was deleted WITH the native bar it
 * measured: its `ios: 49` / `android: 80` / iPad-width logic were all facts about `NativeTabs`'
 * own chrome, and our bar is one bottom-docked row at one height on every platform and at every
 * window width. The iPad question the hook existed for (Slide Over puts a bottom bar back)
 * returns only with epic 9's sidebar — whoever builds that re-opens it there, with our bar.
 *
 * ⚠️ story 6-0 also deleted `FLOATING_PILL_CLEARANCE` (the mini-player reservation); the player
 * went with the audio feature in 5-1 and epic 7 does not inherit the constant.
 */

/**
 * Cross-platform TOP breathing room below the header for a scroll screen whose content otherwise
 * butts the header.
 *
 * ⚠️ RE-DERIVED A THIRD TIME (story 6-6), and the platform split DIED with the native header.
 * The old values were measurements of three different native headers — iOS 0 because a
 * transparent large-title header auto-inset scroll content, Android/web `SPACING.xl` because
 * their opaque headers left no gap. There is ONE header now (`components/ui/AppHeader`), opaque
 * and identical on every platform, so the breathing room below it is one value everywhere.
 *
 * MUST be summed into a scroll view's `contentContainerStyle.paddingTop`. Routes that already
 * set an explicit `padding`/`paddingTop` (the settings forms do) already have a cross-platform
 * gap → do NOT add this, it would stack into double-spacing.
 */
export const HEADER_CONTENT_CLEARANCE = SPACING.xl;

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
