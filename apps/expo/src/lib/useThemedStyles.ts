/**
 * useThemedStyles — the canonical helper for theme-aware StyleSheets.
 *
 * Pass a factory that maps the current theme to a StyleSheet; the result is memoized
 * and only recomputed when the theme changes. New/touched code should prefer this over
 * hand-rolling `StyleSheet.create` + inline `colors.*` (STACK-CHEAT-SHEET § Theme).
 *
 * Story 16.6 creates the helper; wholesale migration of existing call sites is out of
 * scope (and lives in later hardening) — so this has no consumers yet by design.
 *
 * @example
 * const styles = useThemedStyles((t) => ({
 *   container: { backgroundColor: t.colors.background.primary },
 *   title: { color: t.colors.text.primary },
 * }));
 */

import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { type ThemeContextValue, useTheme } from '@/lib/theme';

export function useThemedStyles<T extends StyleSheet.NamedStyles<T>>(
  factory: (theme: ThemeContextValue) => T
): T {
  const theme = useTheme();
  // Recompute only when the theme changes (per STACK-CHEAT-SHEET § Theme). `factory` is
  // intentionally excluded: the documented call site passes an inline arrow (fresh identity
  // every render), so including it would defeat memoization. Styles are assumed pure over theme.
  // biome-ignore lint/correctness/useExhaustiveDependencies: factory excluded by design (see above)
  return useMemo(() => StyleSheet.create(factory(theme)), [theme]);
}
