/**
 * Opacity Design Tokens
 * Source: Design System Guidelines
 *
 * Standardized opacity values for consistent visual states across the app.
 * Usage:
 *   import { OPACITY } from '@/constants/opacity';
 *   style={{ opacity: OPACITY.disabled }}
 */

export const OPACITY = {
  /** Full opacity - fully visible */
  full: 1,
  /** Pressed/active state feedback */
  pressed: 0.8,
  /** Disabled or unavailable state */
  disabled: 0.5,
  /** Subtle background overlays */
  overlay: 0.3,
  /** Very subtle hint state */
  hint: 0.1,
} as const;

export type OpacityToken = keyof typeof OPACITY;
export type OpacityValue = (typeof OPACITY)[OpacityToken];
