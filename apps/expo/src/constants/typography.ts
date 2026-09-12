/**
 * Typography tokens - Font sizes, weights, and line heights
 * Source: docs/ux-design-specification.md (lines 368-388)
 */

/**
 * Font size scale in pixels
 */
export const FONT_SIZE = {
  /** 28px - Book titles (detail view) */
  display: 28,
  /** 22px - Section headers */
  h1: 22,
  /** 18px - Card titles */
  h2: 18,
  /** 16px - Subsections */
  h3: 16,
  /** 15px - Summary text */
  body: 15,
  /** 13px - Secondary info */
  bodySmall: 13,
  /** 11px - Badges, timestamps */
  caption: 11,
  /** 17px - Read-along text (generous for highlighting) */
  syncedText: 17,
} as const;

/**
 * Font weight scale
 */
export const FONT_WEIGHT = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

/**
 * Line height ratios matching UX spec
 */
export const LINE_HEIGHT = {
  /** 1.2 - Tight (display text) */
  tight: 1.2,
  /** 1.25 - Heading 1 */
  heading1: 1.25,
  /** 1.3 - Heading 2, captions */
  heading2: 1.3,
  /** 1.35 - Heading 3 */
  heading3: 1.35,
  /** 1.4 - Body small */
  relaxed: 1.4,
  /** 1.5 - Body text */
  body: 1.5,
  /** 1.7 - Synced text (generous for highlighting) */
  loose: 1.7,
} as const;

/**
 * System font family stack
 */
export const FONT_FAMILY = {
  sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
} as const;

/**
 * Letter-spacing for the uppercase section-label caption (settings groups, the reciter picker's
 * headers, the sign-in and feedback screens) — the ONE number all five copies of that treatment
 * read (story 8-1).
 *
 * ⚠️ IT IS ZERO UNDER RTL, AND THAT IS A SCRIPT FACT RATHER THAN A PREFERENCE. Arabic is cursive:
 * letters JOIN, and tracking prises the joins apart into something that reads as broken rather
 * than as emphasis. (`textTransform: 'uppercase'` beside it is simply inert for Arabic — there is
 * no case — so it needs no branch; this does.)
 *
 * Pure, and it takes the direction rather than reading it, so `constants/` stays a leaf that
 * imports nothing from `lib/`. Callers pass `isRTL()`.
 */
export function captionLetterSpacing(rtl: boolean): number {
  return rtl ? 0 : 1.0;
}

/**
 * Combined typography constant with nested structure
 */
export const TYPOGRAPHY = {
  fontSize: FONT_SIZE,
  fontWeight: FONT_WEIGHT,
  lineHeight: LINE_HEIGHT,
  fontFamily: FONT_FAMILY,
} as const;

// Type exports
export type FontSizeToken = keyof typeof FONT_SIZE;
export type FontWeightToken = keyof typeof FONT_WEIGHT;
export type LineHeightToken = keyof typeof LINE_HEIGHT;
