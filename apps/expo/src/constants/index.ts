/**
 * Design Token System - Barrel Export
 * Source: docs/ux-design-specification.md
 *
 * Usage:
 *   import { Colors, SPACING, TYPOGRAPHY, SHADOWS, RADII } from '@/constants';
 */

// Animation
export type { DurationToken, DurationValue, EasingToken, EasingValue } from './animation';
export { DURATIONS, EASINGS } from './animation';
// Colors
export type {
  AccentColor,
  BackgroundColor,
  ColorScheme,
  ColorTokens,
  SemanticColor,
  TextColor,
} from './Colors';
export { default as Colors } from './Colors';
// Library home (Story 23.15)
export { LIBRARY_PREVIEW_CAP } from './library';
// Navigation
export type { TabConfig, TabIconMapping } from './navigation';
export { HOME_HREF, TABS } from './navigation';
// Opacity
export type { OpacityToken, OpacityValue } from './opacity';
export { OPACITY } from './opacity';
// Radii
export type { RadiiToken, RadiiValue } from './radii';
export { RADII } from './radii';
// Shadows
export type { ShadowStyle, ShadowToken } from './shadows';
export { SHADOWS } from './shadows';
// Spacing & Layout
export type {
  LayoutMaxWidthToken,
  LayoutMaxWidthValue,
  SpacingToken,
  SpacingValue,
} from './spacing';
export { LAYOUT, MIN_TOUCH_TARGET, SPACING, spacing } from './spacing';
// Typography
export type { FontSizeToken, FontWeightToken, LineHeightToken } from './typography';
export { FONT_FAMILY, FONT_SIZE, FONT_WEIGHT, LINE_HEIGHT, TYPOGRAPHY } from './typography';
