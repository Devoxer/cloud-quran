/**
 * Curated color palettes — the reading look, and the whole of it (story 23.8, reshaped by 6-5).
 *
 * A `src/constants/` module is a sanctioned `lint:style` token home, so the hex/rgba
 * literals below are allowed here (and ONLY here for palette data — `lib/` is not a
 * token home). Each palette ships a `PaletteSlice` per `ColorScheme` (light + dark);
 * `useTheme()` composes the active palette's slice with the brand-fixed `FIXED_COLORS`
 * group (`semantic`/`highlight`/`overlay`/`shadow`, identical across all palettes) into
 * the single `ColorTokens` shape every consumer reads. Swapping the active palette
 * re-skins the whole app through that one composition point (the swap is viable only
 * because Story 18.7 routes ALL color through `useTheme().colors` — `lint:style` Scan 1).
 *
 * Palette-VARYING tokens (this file): background · text · accent · border · separator.
 * Brand-FIXED tokens (Colors.ts `FIXED_COLORS`): semantic · highlight · overlay · shadow.
 *
 * ── ⚠️ SIX PALETTES, AND THE SET HAS BEEN CUT TO TWO AND BACK ────────────────────────────────
 *
 * Six palettes were inherited from wisdom-fruits (cobalt, forest, plum, honey, slate beside
 * terracotta) and story 6-5 deleted five of them, because **no picker for them ever shipped in
 * this fork** — 23.8's UI died with the wisdom-fruits profile screen and `setPalette` had zero
 * callers — and because the product was stated then as THREE reading themes. The owner reopened
 * that: the model is wisdom-fruits' again, a swatch picker over six palettes PLUS a separate
 * light/dark control. The six here are authored for a Quran reader, not restored by name.
 *
 * ⚠️ THE MIGRATION FOR A STORED NAME THIS FILE NO LONGER EXPORTS IS THAT THERE IS NONE, AND THAT
 * IS DELIBERATE. `lib/theme.ts`'s `isPaletteName` guard validates the MMKV value against
 * `PALETTE_NAMES` and falls back to `terracotta`; a retired name simply fails the guard. Do not
 * add a rename table — the guard IS the table, and `theme.test.ts` pins it.
 *
 * `terracotta` is the default and reproduces today's "Cozy Warmth" look BYTE-FOR-BYTE
 * from the live `Colors.ts` values (a clean no-op cutover for existing users) — the two
 * genuinely-new sub-tokens `accent.faint` / `accent.soft` (the tinted-badge pair) are
 * the only values harvested from the `design-artifacts/tokens.ts` mockup. Its LIGHT slice is
 * the epic's warm white and its DARK slice is the warm charcoal.
 *
 * `sepia` is the parchment reading look, and it is a PALETTE rather than a third scheme —
 * `ColorScheme` stays exactly `'light' | 'dark'`. Its light slice is adapted from the pre-fork
 * theme (`e8c05e7` `src/theme/tokens.ts`: surfaces `#F5E6D3`/`#EBD9C4`, text `#2C1810`, border
 * `#D4C4B0`); its DARK slice is its own low-glare parchment-at-night, because the picker no
 * longer forces a scheme and every palette must therefore work in both.
 *
 * EVERY palette × {light,dark} is contrast-checked by `palettes.contrast.test.ts` (the
 * accessibility gate — tune the hue, never lower the bar), which holds every non-terracotta
 * palette to the stricter 4.5 `onAccent` bar. That is what moved sepia's `accent.primary` off
 * terracotta's `#C65D3B` (4.17 white-on-accent, and 2.59 against the tab-bar selection
 * indicator) onto the deeper `#A8472A` — same hue family, 5.83 and 3.50.
 */

import type { ColorScheme } from './Colors';

export type PaletteName = 'terracotta' | 'sepia' | 'linen' | 'contrast' | 'olive' | 'midnight';

/** Display order (terracotta = default, first). */
export const PALETTE_NAMES: readonly PaletteName[] = [
  'terracotta',
  'sepia',
  'linen',
  'contrast',
  'olive',
  'midnight',
];

/**
 * The palette-VARYING token subset. Shape mirrors the matching groups in `ColorTokens`
 * (string-valued, never `as const` — a non-terracotta palette's hexes must stay
 * assignable). `accent.faint`/`accent.soft` are the tinted-badge pair (faint = fill,
 * soft = glyph); `text.onAccent` is the readable-on-accent label color.
 */
export interface PaletteSlice {
  background: { primary: string; secondary: string; tertiary: string };
  text: { primary: string; secondary: string; tertiary: string; onAccent: string };
  accent: { primary: string; secondary: string; faint: string; soft: string; strong: string };
  border: string;
  separator: string;
}

/**
 * Terracotta's dark slice — the app's original warm charcoal, byte-for-byte. Held out as a named
 * const because it is the reference dark reading look, and retuning it changes what every
 * existing reader already sees after dusk.
 *
 * ⚠️ IT USED TO BE SHARED WITH SEPIA, and the reason it no longer is matters. The first picker
 * forced `themeMode: 'light'` whenever sepia was chosen, so sepia × dark was a cell that existed
 * only because `PALETTES` is `Record<PaletteName, Record<ColorScheme, PaletteSlice>>` and the
 * contrast gate iterates every one. That coupling is gone — the appearance screen's two axes are
 * independent, and a colour choice may not decide a reader's scheme — so every palette needs a
 * dark face somebody can actually sit in, and sepia has its own.
 */
const WARM_CHARCOAL_DARK: PaletteSlice = {
  background: { primary: '#1A1612', secondary: '#2A2520', tertiary: '#3A352F' },
  text: { primary: '#F5EFE9', secondary: '#C4BCB3', tertiary: '#8C8279', onAccent: '#1A1612' },
  accent: {
    // The LIGHTENED #E8A87C (base #C65D3B is secondary) — do not invert it.
    primary: '#E8A87C',
    secondary: '#C65D3B',
    faint: 'rgba(198, 93, 59, 0.16)',
    soft: '#E3906E',
    strong: '#AE4E30',
  },
  border: '#3A342E',
  separator: '#322D28',
};

export const PALETTES: Record<PaletteName, Record<ColorScheme, PaletteSlice>> = {
  terracotta: {
    light: {
      background: { primary: '#FFFBF7', secondary: '#F5EFE9', tertiary: '#EBE3DA' },
      text: { primary: '#1A1612', secondary: '#5C534A', tertiary: '#8C8279', onAccent: '#FFFFFF' },
      accent: {
        primary: '#C65D3B',
        secondary: '#E8A87C',
        faint: 'rgba(198, 93, 59, 0.12)',
        soft: '#B14E2F',
        strong: '#A8472A',
      },
      border: '#E5DED6',
      separator: '#ECE5DD',
    },
    dark: WARM_CHARCOAL_DARK,
  },
  sepia: {
    light: {
      background: { primary: '#F5E6D3', secondary: '#EBD9C4', tertiary: '#E0CBB2' },
      text: { primary: '#2C1810', secondary: '#5C3D2E', tertiary: '#7A5C4A', onAccent: '#FFFFFF' },
      accent: {
        primary: '#A8472A',
        secondary: '#C98A63',
        faint: 'rgba(168, 71, 42, 0.12)',
        soft: '#9C4123',
        strong: '#8C3D20',
      },
      border: '#D4C4B0',
      separator: '#DFD0BC',
    },
    dark: {
      background: { primary: '#211A13', secondary: '#302619', tertiary: '#41341F' },
      text: { primary: '#F2E3CE', secondary: '#C9B79C', tertiary: '#9A8A72', onAccent: '#211A13' },
      accent: {
        primary: '#E0A96D',
        secondary: '#A8472A',
        faint: 'rgba(224, 169, 109, 0.16)',
        soft: '#D49A5C',
        strong: '#B07F45',
      },
      border: '#40331F',
      separator: '#382C1B',
    },
  },
  // Second paper flavour: cool grey, no warmth. For readers who find sepia yellow.
  linen: {
    light: {
      background: { primary: '#F7F5F0', secondary: '#EDEAE3', tertiary: '#E0DCD3' },
      text: { primary: '#1C1B18', secondary: '#4F4C45', tertiary: '#77736A', onAccent: '#FFFFFF' },
      accent: {
        primary: '#5C6B52',
        secondary: '#8B9A80',
        faint: 'rgba(92, 107, 82, 0.12)',
        soft: '#4E5C45',
        strong: '#42503A',
      },
      border: '#DAD5CA',
      separator: '#E4DFD6',
    },
    dark: {
      background: { primary: '#17181A', secondary: '#232527', tertiary: '#313436' },
      text: { primary: '#EDEEF0', secondary: '#B5B8BC', tertiary: '#83878C', onAccent: '#17181A' },
      accent: {
        primary: '#A3B899',
        secondary: '#5C6B52',
        faint: 'rgba(163, 184, 153, 0.16)',
        soft: '#93A889',
        strong: '#7A8F71',
      },
      border: '#32353A',
      separator: '#2A2D31',
    },
  },
  // Maximum legibility — the accessibility choice, not a mood.
  contrast: {
    light: {
      background: { primary: '#FFFFFF', secondary: '#F2F2F2', tertiary: '#E2E2E2' },
      text: { primary: '#000000', secondary: '#3A3A3A', tertiary: '#5E5E5E', onAccent: '#FFFFFF' },
      accent: {
        primary: '#00457A',
        secondary: '#3D7BB0',
        faint: 'rgba(0, 69, 122, 0.12)',
        soft: '#003A67',
        strong: '#002E52',
      },
      border: '#CFCFCF',
      separator: '#DEDEDE',
    },
    dark: {
      background: { primary: '#000000', secondary: '#131313', tertiary: '#242424' },
      text: { primary: '#FFFFFF', secondary: '#D2D2D2', tertiary: '#A6A6A6', onAccent: '#000000' },
      accent: {
        primary: '#8FC4F5',
        secondary: '#00457A',
        faint: 'rgba(143, 196, 245, 0.16)',
        soft: '#7BB6EE',
        strong: '#5E9AD4',
      },
      border: '#2B2B2B',
      separator: '#1E1E1E',
    },
  },
  // Mushaf green — the colour of a bound Quran.
  olive: {
    light: {
      background: { primary: '#FBFAF4', secondary: '#F1F0E6', tertiary: '#E4E3D5' },
      text: { primary: '#181A14', secondary: '#4B4F42', tertiary: '#74796A', onAccent: '#FFFFFF' },
      accent: {
        primary: '#3F6B43',
        secondary: '#7BA37F',
        faint: 'rgba(63, 107, 67, 0.12)',
        soft: '#365C39',
        strong: '#2C4C2F',
      },
      border: '#DCDBCB',
      separator: '#E7E6D8',
    },
    dark: {
      background: { primary: '#12160F', secondary: '#1E2419', tertiary: '#2C3426' },
      text: { primary: '#E9EFE4', secondary: '#B2BCA9', tertiary: '#7F8A78', onAccent: '#12160F' },
      accent: {
        primary: '#8FC593',
        secondary: '#3F6B43',
        faint: 'rgba(143, 197, 147, 0.16)',
        soft: '#7DB682',
        strong: '#649C69',
      },
      border: '#2D3527',
      separator: '#252C20',
    },
  },
  // Night reading — cool and low-glare.
  midnight: {
    light: {
      background: { primary: '#F7F8FB', secondary: '#EDEFF4', tertiary: '#DFE2EA' },
      text: { primary: '#14171D', secondary: '#474C57', tertiary: '#6F7683', onAccent: '#FFFFFF' },
      accent: {
        primary: '#3B5A99',
        secondary: '#7D95C4',
        faint: 'rgba(59, 90, 153, 0.12)',
        soft: '#334E86',
        strong: '#2A4173',
      },
      border: '#D6DAE3',
      separator: '#E4E7EE',
    },
    dark: {
      background: { primary: '#0E1219', secondary: '#171D27', tertiary: '#242C39' },
      text: { primary: '#E6ECF5', secondary: '#AEB8C7', tertiary: '#7C8697', onAccent: '#0E1219' },
      accent: {
        primary: '#94B4EC',
        secondary: '#3B5A99',
        faint: 'rgba(148, 180, 236, 0.16)',
        soft: '#83A6E4',
        strong: '#6A8DCB',
      },
      border: '#252D3A',
      separator: '#1D2430',
    },
  },
};
