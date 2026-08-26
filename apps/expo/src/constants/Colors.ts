/**
 * Color tokens — the composed shape every `useTheme().colors` consumer reads.
 *
 * Since Story 23.8 the color identity is user-selectable: the PALETTE-VARYING groups
 * (`background`, `text`, `accent`, `border`, `separator`) live per-palette in
 * `constants/palettes.ts`, and the BRAND-FIXED groups below (`semantic`, `highlight`,
 * `overlay`, `shadow`) are identical across all palettes. `useTheme()` composes the
 * active palette's `PaletteSlice` with `FIXED_COLORS` into one `ColorTokens` object
 * (`composeColors`), so swapping the active palette re-skins the whole app from a single
 * point. The static `Colors` default export is the DEFAULT palette (terracotta, today's
 * "Cozy Warmth" look) composed with the fixed groups — `Colors[scheme]` still resolves
 * the default, keeping non-reactive call sites and tests working.
 *
 * Light mode: warm off-white background with terracotta accent; dark mode inverted with
 * a lightened accent. `accent.faint`/`accent.soft` (Story 23.8) are the tinted-badge pair.
 *
 * NO `PlatformColor` / `DynamicColorIOS` — the brand is the same on every platform;
 * light/dark is driven by `useColorScheme` via `useTheme()`. A clone re-skins from
 * `palettes.ts` (or opts into system colors itself).
 */

import { PALETTES, type PaletteName, type PaletteSlice } from './palettes';

/** Color scheme — the OS-driven light/dark axis, orthogonal to the selected palette. */
export type ColorScheme = 'light' | 'dark';

/**
 * Brand-FIXED token groups — identical across every palette (Story 23.8 keeps these
 * out of the palette-varying set). `*Bg` semantic keys = soft message-background tints;
 * `overlay.onScrim*` is light-on-dark-scrim text that is scheme-INDEPENDENT (the photo
 * scrim is permanently dark, so it must NOT flip per scheme — Story 17.4.1).
 */
export interface FixedColors {
  shadow: string;
  overlay: { dark: string; light: string; onScrim: string; onScrimSecondary: string };
  semantic: {
    success: string;
    successBg: string;
    warning: string;
    warningBg: string;
    error: string;
    errorBg: string;
    info: string;
    infoBg: string;
  };
  highlight: { sync: string };
}

export const FIXED_COLORS: Record<ColorScheme, FixedColors> = {
  light: {
    shadow: '#000000',
    overlay: {
      dark: 'rgba(26, 22, 18, 0.5)', // Warm black at 50% - matches text.primary
      light: 'rgba(255, 251, 247, 0.8)', // Warm white at 80% - matches background.primary
      onScrim: '#FFFFFF', // Primary text over a dark image scrim
      onScrimSecondary: 'rgba(255, 255, 255, 0.8)', // Secondary text over a dark image scrim
    },
    semantic: {
      success: '#4A7C59', // Completed states
      successBg: '#E8F5E9', // Success message background (soft green)
      warning: '#D4A03D', // Warnings
      warningBg: '#FDF5E6', // Warning message background (soft gold)
      error: '#C44536', // Errors
      errorBg: '#FCEEED', // Error message background (soft red)
      info: '#5B8CB8', // Info states
      infoBg: '#E3F2FD', // Info message background (soft blue)
    },
    highlight: {
      sync: '#FFF3CD', // Synced text highlight (soft gold)
    },
  },
  dark: {
    shadow: '#000000',
    overlay: {
      dark: 'rgba(26, 22, 18, 0.6)', // Warm black at 60% - slightly stronger for dark mode
      light: 'rgba(58, 53, 47, 0.8)', // Dark tertiary at 80%
      onScrim: '#FFFFFF', // Primary text over a dark image scrim (matches light — scrim stays dark)
      onScrimSecondary: 'rgba(255, 255, 255, 0.8)', // Secondary text over a dark image scrim
    },
    semantic: {
      success: '#6B9E7B', // Completed states (lighter)
      successBg: '#1E2E22', // Success message background (dark green)
      warning: '#E8B84A', // Warnings (lighter)
      warningBg: '#2D2820', // Warning message background (dark amber)
      error: '#D66B5C', // Errors (lighter)
      errorBg: '#2D2220', // Error message background (dark red-brown)
      info: '#7BA9D4', // Info states (lighter)
      infoBg: '#1E2530', // Info message background (dark blue)
    },
    highlight: {
      sync: '#3D3520', // Synced text highlight
    },
  },
};

/** The single token shape every consumer sees: palette-varying ⊕ brand-fixed. */
export type ColorTokens = PaletteSlice & FixedColors;

/** Compose a palette's per-scheme slice with the brand-fixed groups → `ColorTokens`. */
export function composeColors(palette: PaletteName, scheme: ColorScheme): ColorTokens {
  return { ...PALETTES[palette][scheme], ...FIXED_COLORS[scheme] };
}

/**
 * Default-palette tokens (terracotta ⊕ fixed). `useTheme()` reads the reactive palette;
 * this static export is the no-reactivity fallback (and what `Colors[scheme]` resolves to).
 */
const Colors: Record<ColorScheme, ColorTokens> = {
  light: composeColors('terracotta', 'light'),
  dark: composeColors('terracotta', 'dark'),
};

export default Colors;

/**
 * Utility types for type-safe color access.
 */
export type BackgroundColor = ColorTokens['background'][keyof ColorTokens['background']];
export type TextColor = ColorTokens['text'][keyof ColorTokens['text']];
export type AccentColor = ColorTokens['accent'][keyof ColorTokens['accent']];
export type SemanticColor = ColorTokens['semantic'][keyof ColorTokens['semantic']];
