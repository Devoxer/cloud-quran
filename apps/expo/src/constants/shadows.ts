/**
 * Shadow tokens for elevation levels
 * Source: _bmad-output/design-artifacts/tokens.ts (Epic 23 locked set)
 *
 * On dark, depth comes from surface lightness + 1px border first; shadows are
 * subtle and use a neutral black base. iOS shadow* / Android elevation.
 */

import { ViewStyle } from 'react-native';

/**
 * Shadow presets compatible with React Native shadowOffset/shadowOpacity/shadowRadius
 */
export const SHADOWS = {
  /** Book covers - lifted artwork */
  cover: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 4,
  },
  /** Book-detail hero cover - a defined lift, a step above the grid `cover` (Story 26.12).
   *  Moderate radius so it reads on a LIGHT background without looking heavy. */
  coverHero: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.3,
    shadowRadius: 13,
    elevation: 8,
  },
  /** Card surfaces - grouped rounded surfaces.
   *  Lightened radius 8→6 / opacity 0.18→0.14 (28.1 owner feedback): the softer,
   *  tighter cast keeps adjacent cards in a horizontal row from bleeding into each
   *  other AND shrinks the vertical room a horizontal scroller must reserve so its
   *  cells don't shave the shadow. App-wide, both schemes (on dark it stays subtle —
   *  depth there is carried by the surface lightness + 1px border, per the note above). */
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 6,
    elevation: 2,
  },
  /** Floating chrome - tab bar / mini-player */
  floating: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 34,
    elevation: 12,
  },
  /** Sheets - bottom sheets, modals */
  sheet: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -20 },
    shadowOpacity: 0.5,
    shadowRadius: 50,
    elevation: 16,
  },
} as const;

export type ShadowToken = keyof typeof SHADOWS;
export type ShadowStyle = Pick<
  ViewStyle,
  'shadowColor' | 'shadowOffset' | 'shadowOpacity' | 'shadowRadius' | 'elevation'
>;
