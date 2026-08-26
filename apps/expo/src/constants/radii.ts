/**
 * Border radius tokens
 * Source: _bmad-output/design-artifacts/tokens.ts (Epic 23 locked scale)
 *
 * Usage guide:
 * - 16px (lg) for grouped card surfaces (Card primitive)
 * - 12px (md) for buttons, inputs, chips
 * - 10px (cover) for book covers
 * - 8px (sm) for small elements, badges
 * - 20px (xl) for large cards, modals
 * - 999px (pill) for pills / circular elements
 */

export const RADII = {
  /** 8px - Small elements, badges */
  sm: 8,
  /** 12px - Buttons, inputs, chips */
  md: 12,
  /** 16px - Grouped card surfaces (Card primitive signature) */
  lg: 16,
  /** 20px - Large cards, modals */
  xl: 20,
  /** 999px - Pills, circular elements */
  pill: 999,
  /** 10px - Book covers */
  cover: 10,
} as const;

export type RadiiToken = keyof typeof RADII;
export type RadiiValue = (typeof RADII)[RadiiToken];
