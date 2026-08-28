/**
 * Animation Design Tokens
 * Source: STACK-CHEAT-SHEET.md § "Animations" + § "Style boundary"
 *
 * Canonical durations + easings for the app. All transition `withTiming`
 * calls read their duration from `DURATIONS` and (where an easing is set)
 * `EASINGS.standard` — no inline numeric `duration:` literals, no inline
 * `Easing.*` for standard transitions.
 *
 * Usage:
 *   import { DURATIONS, EASINGS } from '@/constants/animation';
 *   withTiming(opacity, { duration: DURATIONS.standard, easing: EASINGS.standard });
 *
 * Domain-specific durations that are NOT UI transitions (e.g. a continuous
 * icon spin) may remain as named local consts in the consuming component.
 */

import { Easing } from 'react-native-reanimated';

export const DURATIONS = {
  /** Micro-interactions: press feedback, fade-in. 100–150ms range. */
  micro: 150,
  /** Standard transitions: modal show, route change. 200–250ms range. */
  standard: 200,
  /** Screen-level transitions. 300ms max. */
  screen: 300,
  /**
   * The whole-app theme crossfade (story 6-5) — `components/ui/ThemeCrossfade`.
   *
   * ⚠️ LONGER THAN `screen`, AND THAT IS THE MEASURED PRE-FORK VALUE (`e8c05e7`
   * `src/theme/tokens.ts` `animation.theme = 400`), not a drift. A route change moves one
   * surface; a theme change repaints every pixel at once, and at 300ms the repaint reads as a
   * flicker rather than a settle. It is the one duration above the 300ms ceiling, which is why
   * it is named here rather than left inline.
   */
  theme: 400,
} as const;

export type DurationToken = keyof typeof DURATIONS;
export type DurationValue = (typeof DURATIONS)[DurationToken];

export const EASINGS = {
  /** Default easing for transitions. Matches cheat-sheet guidance. */
  standard: Easing.out(Easing.cubic),
} as const;

export type EasingToken = keyof typeof EASINGS;
export type EasingValue = (typeof EASINGS)[EasingToken];
