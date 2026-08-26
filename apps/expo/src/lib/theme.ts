/**
 * Theme hook — colors + color scheme for the active Light/Dark/Auto preference.
 *
 * Provider-free replacement for the old `contexts/ThemeContext` (Story 16.6). The
 * preference lives in MMKV (read synchronously at module init so there is no
 * flash-of-wrong-theme) and is mirrored to native chrome via `Appearance.setColorScheme()`.
 * The effective scheme is ALSO computed in JS on every platform so the override works on
 * web, where react-native-web ignores `Appearance.setColorScheme()` (the custom matchMedia
 * `useColorScheme.web.ts` drives web instead). Cross-device InstantDB sync lives in the
 * Profile write path.
 *
 * @example
 * const { colors, isDark, themeMode, setThemeMode } = useTheme();
 * <View style={{ backgroundColor: colors.background.primary }} />
 */

import { useMemo } from 'react';
import { Appearance, Platform } from 'react-native';
import { createMMKV, type MMKV, useMMKVString } from 'react-native-mmkv';
import { type ColorScheme, type ColorTokens, composeColors } from '@/constants/Colors';
import { PALETTE_NAMES, type PaletteName } from '@/constants/palettes';
import { useColorScheme } from '@/lib/useColorScheme';

/** Theme type — matches ColorScheme from Colors.ts */
export type Theme = ColorScheme;

/** ThemeMode — user preference for appearance */
export type ThemeMode = 'light' | 'dark' | 'auto';

/** ThemeContextValue — value returned by useTheme() (name kept for migrated consumers) */
export interface ThemeContextValue {
  /** Current color scheme ('light' or 'dark') */
  colorScheme: ColorScheme;
  /** Current theme's color tokens */
  colors: ColorTokens;
  /** Convenience boolean for dark mode checks */
  isDark: boolean;
  /** Current theme mode preference */
  themeMode: ThemeMode;
  /** Set theme mode preference (persists to MMKV + native chrome) */
  setThemeMode: (mode: ThemeMode) => void;
  /** Currently selected color palette (Story 23.8). */
  palette: PaletteName;
  /** Set the color-palette preference (persists to MMKV; reactive). Orthogonal to light/dark. */
  setPalette: (name: PaletteName) => void;
}

/** MMKV key for the theme preference. */
export const THEME_MODE_KEY = '@cloudquran/themeMode';

/** MMKV key for the selected palette (Story 23.8). Shares the dedicated `theme` instance. */
export const PALETTE_KEY = '@cloudquran/palette';

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'auto';
}

function isPaletteName(value: unknown): value is PaletteName {
  return typeof value === 'string' && (PALETTE_NAMES as readonly string[]).includes(value);
}

// On the web static-render server (expo web `output: "static"`) there is no localStorage,
// and MMKV-web throws "Tried to access storage on the server" on any read/write. Detect that
// environment so we can substitute an in-memory no-op store and skip module-init storage access.
const isServerWeb = Platform.OS === 'web' && typeof window === 'undefined';

/** No-op MMKV used during web SSR so module init + useMMKVString don't crash (return defaults). */
function createServerThemeStub(): MMKV {
  return {
    getString: () => undefined,
    set: () => {},
    delete: () => {},
    remove: () => {}, // real MMKV uses `remove`; useMMKVString's clear path calls it
    addOnValueChangedListener: () => ({ remove: () => {} }),
  } as unknown as MMKV;
}

/**
 * Dedicated MMKV instance for the theme preference. Synchronous on native, on the web client
 * (localStorage-backed), and an in-memory mock under Jest (react-native-mmkv `isTest()`); a no-op
 * stub during web SSR (no localStorage on the server).
 */
const themeStorage: MMKV = isServerWeb ? createServerThemeStub() : createMMKV({ id: 'theme' });

function applyNativeColorScheme(mode: ThemeMode): void {
  // Native chrome (status bar, keyboards, native pickers) honors Appearance.
  // Web ignores it (custom matchMedia useColorScheme.web.ts), so the JS computation
  // in useTheme() is what makes web honor the override — see AC #10.
  if (Platform.OS !== 'web') {
    // RN 0.83: ColorSchemeName dropped `null` in favor of `'unspecified'` as the
    // "follow system" sentinel (Appearance.d.ts). `'unspecified'` resets to system.
    Appearance.setColorScheme(mode === 'auto' ? 'unspecified' : mode);
  }
}

function readStoredMode(): ThemeMode {
  const stored = themeStorage.getString(THEME_MODE_KEY);
  return isThemeMode(stored) ? stored : 'auto';
}

/**
 * Persist the Light/Dark/Auto preference. Writes MMKV (reactive → re-renders every
 * useTheme() consumer via useMMKVString) and sets the native color scheme. Module-level
 * so its identity is stable across renders. Cross-device InstantDB sync stays in the
 * Profile screen's write path (AC #11).
 */
export function setThemeMode(mode: ThemeMode): void {
  themeStorage.set(THEME_MODE_KEY, mode);
  applyNativeColorScheme(mode);
}

/**
 * Persist the selected palette (Story 23.8). Writes MMKV (reactive → re-renders every
 * useTheme() consumer via useMMKVString). Module-level for a stable identity, parallel to
 * setThemeMode. Does NOT touch Appearance.setColorScheme — palette is orthogonal to
 * light/dark, and unlike themeMode it is MMKV-only (no InstantDB cross-device sync — AC-6).
 */
export function setPalette(name: PaletteName): void {
  themeStorage.set(PALETTE_KEY, name);
}

// ── Module init (synchronous, before first render) — AC #9 ──
// Apply the stored scheme to native chrome immediately so there is no flash-of-wrong-theme.
// Skipped during web SSR (no localStorage on the static-render server).
if (!isServerWeb) {
  applyNativeColorScheme(readStoredMode());
}

/**
 * useTheme — drop-in replacement for the old ThemeContext hook (same return shape),
 * now provider-free. Reads the preference reactively from MMKV and computes the
 * effective scheme in JS so the override works on every platform including web (AC #10).
 */
export function useTheme(): ThemeContextValue {
  const [storedMode] = useMMKVString(THEME_MODE_KEY, themeStorage);
  const themeMode: ThemeMode = isThemeMode(storedMode) ? storedMode : 'auto';
  // Palette is read reactively too (Story 23.8) — a setPalette() write re-renders every
  // consumer. Unknown/missing → the default 'terracotta' (SSR-safe via the server stub).
  const [storedPalette] = useMMKVString(PALETTE_KEY, themeStorage);
  const palette: PaletteName = isPaletteName(storedPalette) ? storedPalette : 'terracotta';
  const systemColorScheme = useColorScheme();
  // RN 0.83 useColorScheme() returns 'light' | 'dark' | 'unspecified' (no null); the web
  // variant may still yield null/undefined. Collapse anything that isn't 'dark' to 'light'
  // (preserves the prior `?? 'light'` default for the no-preference case).
  const colorScheme: ColorScheme =
    themeMode === 'auto' ? (systemColorScheme === 'dark' ? 'dark' : 'light') : themeMode;

  // Memoize the returned object (matches the old context's memoized value) so
  // consumers that depend on a stable theme reference don't re-render needlessly.
  // colors recompose when palette OR scheme changes (the single app-wide re-skin point).
  return useMemo<ThemeContextValue>(
    () => ({
      colorScheme,
      colors: composeColors(palette, colorScheme),
      isDark: colorScheme === 'dark',
      themeMode,
      setThemeMode,
      palette,
      setPalette,
    }),
    [colorScheme, themeMode, palette]
  );
}
