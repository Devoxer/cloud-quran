/**
 * Unit tests for lib/useThemedStyles — the canonical themed-StyleSheet helper (Story 16.6).
 *
 * Covers: the factory receives the live theme; styles reflect the resolved scheme's tokens;
 * the result is recomputed when the theme changes and is referentially stable when it doesn't
 * (the memoization the Step-G review fixed to deps `[theme]`).
 */

import { act, renderHook } from '@testing-library/react-native';

// Exercise the REAL theme hook (and therefore the real useThemedStyles), not the global
// mock from jest.setup.js — we need setThemeMode to drive scheme changes.
jest.unmock('@/lib/theme');

// Control the system color scheme so 'auto' is deterministic.
const mockUseColorScheme = jest.fn<'light' | 'dark' | null, []>(() => 'light');
jest.mock('@/lib/useColorScheme', () => ({
  useColorScheme: () => mockUseColorScheme(),
}));

import { createMMKV } from 'react-native-mmkv';
import { setThemeMode } from '@/lib/theme';
import { useThemedStyles } from '@/lib/useThemedStyles';

const themeStore = createMMKV({ id: 'theme' });

describe('lib/useThemedStyles', () => {
  beforeEach(() => {
    themeStore.clearAll();
    mockUseColorScheme.mockReturnValue('light');
  });

  it('builds the StyleSheet from the live theme tokens', () => {
    const { result } = renderHook(() =>
      useThemedStyles((t) => ({
        box: { backgroundColor: t.colors.background.primary },
        label: { color: t.colors.text.primary },
      }))
    );

    expect(typeof result.current.box.backgroundColor).toBe('string');
    expect(typeof result.current.label.color).toBe('string');
  });

  it('recomputes styles when the theme scheme changes', () => {
    const factory = (t: { colors: { background: { primary: string } } }) => ({
      box: { backgroundColor: t.colors.background.primary },
    });

    mockUseColorScheme.mockReturnValue('light');
    const { result } = renderHook(() => useThemedStyles(factory));
    const lightBg = result.current.box.backgroundColor;

    act(() => setThemeMode('dark'));

    const darkBg = result.current.box.backgroundColor;
    expect(darkBg).not.toBe(lightBg); // light vs dark tokens differ
  });

  it('returns a referentially stable result across re-renders with the same theme', () => {
    const { result, rerender } = renderHook(() =>
      useThemedStyles((t) => ({ box: { backgroundColor: t.colors.background.primary } }))
    );

    const first = result.current;
    rerender({});
    // Same theme (no scheme/mode change) → memoized, identical reference.
    expect(result.current).toBe(first);
  });
});
