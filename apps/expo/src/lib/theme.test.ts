/**
 * Unit tests for lib/theme — the provider-free theme hook (Story 16.6).
 *
 * Covers the auto/light/dark scheme resolution, isDark, and reactive setThemeMode.
 */

import { act, renderHook } from '@testing-library/react-native';
import { createMMKV } from 'react-native-mmkv';

// Exercise the REAL hook, not the global mock from jest.setup.js.
jest.unmock('@/lib/theme');

// Control the system color scheme.
const mockUseColorScheme = jest.fn<'light' | 'dark' | null, []>(() => 'light');
jest.mock('@/lib/useColorScheme', () => ({
  useColorScheme: () => mockUseColorScheme(),
}));

import Colors from '@/constants/Colors';
import { PALETTE_NAMES, PALETTES } from '@/constants/palettes';
import { PALETTE_KEY, setPalette, setThemeMode, THEME_MODE_KEY, useTheme } from '@/lib/theme';

// Shares the same in-memory store the module's instance uses (mock keys stores by id).
const themeStore = createMMKV({ id: 'theme' });

describe('lib/theme', () => {
  beforeEach(() => {
    themeStore.clearAll();
    mockUseColorScheme.mockReturnValue('light');
  });

  describe('scheme resolution', () => {
    it("'auto' follows the system scheme (light)", () => {
      mockUseColorScheme.mockReturnValue('light');
      const { result } = renderHook(() => useTheme());
      expect(result.current.themeMode).toBe('auto');
      expect(result.current.colorScheme).toBe('light');
      expect(result.current.isDark).toBe(false);
    });

    it("'auto' follows the system scheme (dark)", () => {
      mockUseColorScheme.mockReturnValue('dark');
      const { result } = renderHook(() => useTheme());
      expect(result.current.colorScheme).toBe('dark');
      expect(result.current.isDark).toBe(true);
    });

    it("'auto' falls back to light when the system scheme is null", () => {
      mockUseColorScheme.mockReturnValue(null);
      const { result } = renderHook(() => useTheme());
      expect(result.current.colorScheme).toBe('light');
    });

    it("explicit 'light' overrides a dark system scheme", () => {
      mockUseColorScheme.mockReturnValue('dark');
      act(() => setThemeMode('light'));
      const { result } = renderHook(() => useTheme());
      expect(result.current.themeMode).toBe('light');
      expect(result.current.colorScheme).toBe('light');
      expect(result.current.isDark).toBe(false);
    });

    it("explicit 'dark' overrides a light system scheme", () => {
      mockUseColorScheme.mockReturnValue('light');
      act(() => setThemeMode('dark'));
      const { result } = renderHook(() => useTheme());
      expect(result.current.themeMode).toBe('dark');
      expect(result.current.colorScheme).toBe('dark');
      expect(result.current.isDark).toBe(true);
    });

    it('returns the color tokens for the resolved scheme', () => {
      mockUseColorScheme.mockReturnValue('light');
      const { result } = renderHook(() => useTheme());
      expect(result.current.colors).toBeDefined();
      expect(typeof result.current.colors.background.primary).toBe('string');
    });
  });

  describe('setThemeMode reactivity', () => {
    it('updates a mounted consumer when the preference changes', () => {
      mockUseColorScheme.mockReturnValue('light');
      const { result } = renderHook(() => useTheme());
      expect(result.current.colorScheme).toBe('light');

      act(() => setThemeMode('dark'));
      expect(result.current.colorScheme).toBe('dark');
      expect(result.current.themeMode).toBe('dark');

      act(() => setThemeMode('auto'));
      expect(result.current.themeMode).toBe('auto');
      expect(result.current.colorScheme).toBe('light'); // back to system
    });

    it('persists the preference to the MMKV key', () => {
      act(() => setThemeMode('dark'));
      expect(themeStore.getString(THEME_MODE_KEY)).toBe('dark');
    });
  });

  describe('palette selection (Story 23.8)', () => {
    it('defaults to terracotta when nothing is stored', () => {
      const { result } = renderHook(() => useTheme());
      expect(result.current.palette).toBe('terracotta');
      // The default composition equals the static Colors (terracotta ⊕ fixed) → no-op cutover.
      expect(result.current.colors.accent.primary).toBe(Colors.light.accent.primary);
    });

    it('setPalette persists to the palette MMKV key', () => {
      act(() => setPalette('sepia'));
      expect(themeStore.getString(PALETTE_KEY)).toBe('sepia');
    });

    it('returns the selected palette colors and re-renders reactively', () => {
      mockUseColorScheme.mockReturnValue('light');
      const { result } = renderHook(() => useTheme());
      expect(result.current.palette).toBe('terracotta');

      act(() => setPalette('sepia'));
      expect(result.current.palette).toBe('sepia');
      expect(result.current.colors.accent.primary).toBe(PALETTES.sepia.light.accent.primary);
      expect(result.current.colors.background.primary).toBe(
        PALETTES.sepia.light.background.primary
      );
      // The parchment is genuinely a different surface, not the default under another name.
      expect(result.current.colors.background.primary).not.toBe(
        PALETTES.terracotta.light.background.primary
      );
    });

    /**
     * ⚠️ THE WHOLE MIGRATION STORY FOR THE FIVE PALETTES STORY 6-5 DELETED, AND THE REASON THERE
     * IS NO MIGRATION CODE. A device that stored `'cobalt'` before the deletion still has that
     * string in MMKV; `isPaletteName` validates against `PALETTE_NAMES`, so it fails the guard
     * exactly like a typo and the reader lands on the default. Deleting the guard, or replacing
     * it with a cast, turns that stored value into `PALETTES[undefined]` at compose time.
     */
    it('falls back to terracotta for an unknown stored palette', () => {
      act(() => themeStore.set(PALETTE_KEY, 'neon-banana'));
      const { result } = renderHook(() => useTheme());
      expect(result.current.palette).toBe('terracotta');
    });

    it('falls back to terracotta for a palette this fork DELETED (stored `cobalt`)', () => {
      act(() => themeStore.set(PALETTE_KEY, 'cobalt'));
      const { result } = renderHook(() => useTheme());
      expect(result.current.palette).toBe('terracotta');
      expect(result.current.colors.background.primary).toBe(
        PALETTES.terracotta.light.background.primary
      );
    });

    it('still flips light/dark WITHIN the selected palette', () => {
      mockUseColorScheme.mockReturnValue('dark');
      act(() => {
        setPalette('sepia');
        setThemeMode('dark');
      });
      const { result } = renderHook(() => useTheme());
      expect(result.current.palette).toBe('sepia');
      expect(result.current.colorScheme).toBe('dark');
      expect(result.current.colors.background.primary).toBe(PALETTES.sepia.dark.background.primary);
    });

    /**
     * ⚠️ THIS PINNED THE EXACT OPPOSITE UNTIL THE PICKER'S TWO AXES WERE SEPARATED. Sepia's dark
     * slice used to BE terracotta's, on the argument that sepia was defined by its light face and
     * the picker forced `themeMode: 'light'` whenever it was chosen — so sepia × dark was a cell
     * nobody could navigate to. That coupling is gone: a colour choice may not decide a reader's
     * scheme, so every palette × scheme is somewhere a reader can actually sit, and two palettes
     * sharing a slice would mean two swatches that are indistinguishable after dusk.
     */
    it('every palette has a dark face of its own, distinct from its light one', () => {
      const darks = PALETTE_NAMES.map((name) => JSON.stringify(PALETTES[name].dark));
      expect(new Set(darks).size).toBe(PALETTE_NAMES.length);
      for (const name of PALETTE_NAMES) {
        expect(PALETTES[name].dark).not.toEqual(PALETTES[name].light);
      }
      // Anti-vacuity: there is more than one palette to tell apart.
      expect(PALETTE_NAMES.length).toBeGreaterThan(1);
    });

    it('keeps the fixed groups identical across palettes (semantic unchanged)', () => {
      const { result } = renderHook(() => useTheme());
      const fixedError = result.current.colors.semantic.error;
      act(() => setPalette('sepia'));
      expect(result.current.colors.semantic.error).toBe(fixedError);
    });
  });
});
