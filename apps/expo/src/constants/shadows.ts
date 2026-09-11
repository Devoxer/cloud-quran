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
  /**
   * The chrome bars' boundary, and the ONLY thing that now separates `AppHeader` /
   * `AppTabBar` from the Quran beneath them (owner call 2026-09-11 — the 1px edge read as
   * "distracting and outdated").
   *
   * ⚠️ TUNE THIS AND YOU ARE TUNING THE DELIMITER, NOT A DECORATION. The bars OVERLAY the
   * reading surface and `background.secondary` is measured at **1.08–1.16:1 against
   * `background.primary` in all twelve slices** — bar and page are the same colour to the
   * eye, so "let the contrast do the work" was not on the table and the cast is carrying it
   * alone. Heavier than `card` for that reason.
   *
   * ⚠️ AND IT IS WEAKEST EXACTLY WHERE IT MATTERS MOST: a black cast over a near-black page
   * is nearly invisible, and on `contrast · dark` the page is `#000000`, so there is no
   * boundary there at all. The real fix for the dark slices is to lift `background.secondary`
   * into a genuine elevated surface; that is a palette edit reaching every Card and sheet, so
   * it is parked rather than smuggled in here.
   */
  chromeDown: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 6,
  },
  /** `chromeDown` cast upward, for the tab bar. ⚠️ Android's `elevation` has no direction —
   *  it casts by height alone — so the up-cast is an iOS/web effect and Android gets a
   *  symmetric lift instead. Read `chromeDown`'s note before touching either. */
  chromeUp: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 6,
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
