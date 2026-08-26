/**
 * Curated color palettes (Story 23.8) — the user-selectable color identity.
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
 * `terracotta` is the default and reproduces today's "Cozy Warmth" look BYTE-FOR-BYTE
 * from the live `Colors.ts` values (a clean no-op cutover for existing users) — the two
 * genuinely-new sub-tokens `accent.faint` / `accent.soft` (the tinted-badge pair) are
 * the only values harvested from the `design-artifacts/tokens.ts` mockup. The other five
 * palettes derive their full slice from each preset's `tokens.ts` anchors, matching the
 * production-terracotta intra-ramp relationships, and EVERY palette × {light,dark} is
 * contrast-checked by `palettes.contrast.test.ts` (the accessibility gate — tune the hue,
 * never lower the bar). A few non-default accents were nudged lighter/darker from their
 * raw mockup anchor to clear the WCAG `onAccent`-on-accent bar. Their BACKGROUND ramps are
 * deliberately MUTED (chroma reduced to ~55%) so surfaces stay close to neutral with only a
 * whisper of hue — terracotta keeps its byte-identical warm default.
 *
 * 23.17 heads-up: a future per-mascot `illustration` group may join the palette-varying
 * set — `PaletteSlice` is kept small + flat so adding a sibling group later is a localized,
 * one-value-per-palette edit, not a restructure.
 */

import type { ColorScheme } from './Colors';

export type PaletteName = 'terracotta' | 'cobalt' | 'forest' | 'plum' | 'honey' | 'slate';

/** Display order (terracotta = default, first). */
export const PALETTE_NAMES: readonly PaletteName[] = [
  'terracotta',
  'cobalt',
  'forest',
  'plum',
  'honey',
  'slate',
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

export const PALETTES: Record<PaletteName, Record<ColorScheme, PaletteSlice>> = {
  // ── Terracotta (default) — existing keys BYTE-IDENTICAL to live Colors.ts;
  //    accent.faint/soft harvested from tokens.ts. Dark accent.primary is the
  //    LIGHTENED #E8A87C (base #C65D3B is secondary) — do not invert it.
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
    dark: {
      background: { primary: '#1A1612', secondary: '#2A2520', tertiary: '#3A352F' },
      text: { primary: '#F5EFE9', secondary: '#C4BCB3', tertiary: '#8C8279', onAccent: '#1A1612' },
      accent: {
        primary: '#E8A87C',
        secondary: '#C65D3B',
        faint: 'rgba(198, 93, 59, 0.16)',
        soft: '#E3906E',
        strong: '#AE4E30',
      },
      border: '#3A342E',
      separator: '#322D28',
    },
  },

  // ── Cobalt — cool blue. Dark accent nudged lighter (#4E80E0) so the dark
  //    onAccent clears the WCAG button-label bar.
  cobalt: {
    light: {
      background: { primary: '#F7F8FB', secondary: '#EAEDF2', tertiary: '#E0E3EA' },
      text: { primary: '#1A2230', secondary: '#485466', tertiary: '#7B8696', onAccent: '#FFFFFF' },
      accent: {
        primary: '#3361C8',
        secondary: '#6E97E6',
        faint: 'rgba(51, 97, 200, 0.12)',
        soft: '#3F73D9',
        strong: '#254DA9',
      },
      border: '#DCE3F0',
      separator: '#E6EBF6',
    },
    dark: {
      background: { primary: '#141518', secondary: '#25282E', tertiary: '#32353C' },
      text: { primary: '#EAECF1', secondary: '#B3BAC6', tertiary: '#828A98', onAccent: '#0B1220' },
      accent: {
        primary: '#4E80E0',
        secondary: '#3F73D9',
        faint: 'rgba(78, 128, 224, 0.16)',
        soft: '#6E97E6',
        strong: '#284D93',
      },
      border: '#262A33',
      separator: '#20242C',
    },
  },

  // ── Forest — muted green. Light accent nudged darker (#2C8056) for the white-on-accent bar.
  forest: {
    light: {
      background: { primary: '#F7F9F7', secondary: '#E8ECE8', tertiary: '#DDE3DD' },
      text: { primary: '#18241C', secondary: '#4B5A4F', tertiary: '#7C8B80', onAccent: '#FFFFFF' },
      accent: {
        primary: '#2C8056',
        secondary: '#6FBE92',
        faint: 'rgba(44, 128, 86, 0.12)',
        soft: '#3E9B6B',
        strong: '#1D613F',
      },
      border: '#DCE7DD',
      separator: '#E5EDE6',
    },
    dark: {
      background: { primary: '#121512', secondary: '#232823', tertiary: '#2E352F' },
      text: { primary: '#E9EEE6', secondary: '#B4BDB2', tertiary: '#828C82', onAccent: '#0C1610' },
      accent: {
        primary: '#3E9B6B',
        secondary: '#2F895A',
        faint: 'rgba(62, 155, 107, 0.16)',
        soft: '#6FBE92',
        strong: '#2C5B43',
      },
      border: '#262C24',
      separator: '#20251E',
    },
  },

  // ── Plum — purple. Dark accent nudged lighter (#A468CE) for the dark onAccent bar.
  plum: {
    light: {
      background: { primary: '#FBF9FC', secondary: '#EEE9F0', tertiary: '#E4DEE8' },
      text: { primary: '#271E2E', secondary: '#5A4E60', tertiary: '#897E90', onAccent: '#FFFFFF' },
      accent: {
        primary: '#8A4BB5',
        secondary: '#B98ADB',
        faint: 'rgba(138, 75, 181, 0.12)',
        soft: '#9A5BC5',
        strong: '#72389A',
      },
      border: '#E7DCEE',
      separator: '#EFE6F4',
    },
    dark: {
      background: { primary: '#161418', secondary: '#27242D', tertiary: '#332E39' },
      text: { primary: '#EEE9F2', secondary: '#BDB4C4', tertiary: '#8C8294', onAccent: '#150E1A' },
      accent: {
        primary: '#A468CE',
        secondary: '#9A5BC5',
        faint: 'rgba(164, 104, 206, 0.16)',
        soft: '#B98ADB',
        strong: '#673888',
      },
      border: '#2A2233',
      separator: '#241C2C',
    },
  },

  // ── Honey — warm gold. Light accent nudged much darker (#8C6A1E) because
  //    white-on-bright-gold is intrinsically low-contrast; light `soft` is a deep
  //    gold so the tinted-badge glyph stays legible on the pale faint fill.
  honey: {
    light: {
      background: { primary: '#FBFAF6', secondary: '#ECE7DD', tertiary: '#E1DCCF' },
      text: { primary: '#2A2415', secondary: '#5E5236', tertiary: '#8B8164', onAccent: '#FFFFFF' },
      accent: {
        primary: '#8C6A1E',
        secondary: '#C99A3B',
        faint: 'rgba(140, 106, 30, 0.12)',
        soft: '#946F1F',
        strong: '#694F13',
      },
      border: '#ECE1C9',
      separator: '#F3EAD6',
    },
    dark: {
      background: { primary: '#161511', secondary: '#26231D', tertiary: '#332F27' },
      text: { primary: '#F2EDE2', secondary: '#C4BBA6', tertiary: '#8C846E', onAccent: '#1A150A' },
      accent: {
        primary: '#C99A3B',
        secondary: '#B0852A',
        faint: 'rgba(201, 154, 59, 0.16)',
        soft: '#E0BD6E',
        strong: '#765D2C',
      },
      border: '#2C2618',
      separator: '#261F13',
    },
  },

  // ── Slate — desaturated blue-gray. Dark accent nudged lighter (#6E889C) for the
  //    dark onAccent bar.
  slate: {
    light: {
      background: { primary: '#F7F8F9', secondary: '#E7EAED', tertiary: '#DDE0E4' },
      text: { primary: '#1E262C', secondary: '#4D5860', tertiary: '#7D868C', onAccent: '#FFFFFF' },
      accent: {
        primary: '#4C6376',
        secondary: '#8AA0B2',
        faint: 'rgba(76, 99, 118, 0.12)',
        soft: '#5B7488',
        strong: '#364C5E',
      },
      border: '#DCE2E8',
      separator: '#E6EBF0',
    },
    dark: {
      background: { primary: '#131416', secondary: '#24272C', tertiary: '#303339' },
      text: { primary: '#E8ECEF', secondary: '#B2BAC2', tertiary: '#828A92', onAccent: '#0E1216' },
      accent: {
        primary: '#6E889C',
        secondary: '#5B7488',
        faint: 'rgba(110, 136, 156, 0.16)',
        soft: '#8AA0B2',
        strong: '#46545F',
      },
      border: '#262C33',
      separator: '#20252C',
    },
  },
};
