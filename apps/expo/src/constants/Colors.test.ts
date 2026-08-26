/**
 * Unit tests for Color design tokens
 * Verifies colors match UX spec and structure is correct
 */

import Colors, { ColorScheme, ColorTokens } from './Colors';

describe('Colors', () => {
  describe('structure', () => {
    it('exports light and dark color schemes', () => {
      expect(Colors).toHaveProperty('light');
      expect(Colors).toHaveProperty('dark');
    });

    it('has matching structure for light and dark modes', () => {
      const lightKeys = Object.keys(Colors.light);
      const darkKeys = Object.keys(Colors.dark);
      expect(lightKeys).toEqual(darkKeys);
    });

    it('has nested background colors', () => {
      expect(Colors.light.background).toHaveProperty('primary');
      expect(Colors.light.background).toHaveProperty('secondary');
      expect(Colors.light.background).toHaveProperty('tertiary');
    });

    it('has nested text colors', () => {
      expect(Colors.light.text).toHaveProperty('primary');
      expect(Colors.light.text).toHaveProperty('secondary');
      expect(Colors.light.text).toHaveProperty('tertiary');
    });

    it('has nested accent colors', () => {
      expect(Colors.light.accent).toHaveProperty('primary');
      expect(Colors.light.accent).toHaveProperty('secondary');
    });

    it('has the Story 23.8 tinted-badge accent sub-tokens (faint + soft)', () => {
      expect(Colors.light.accent).toHaveProperty('faint');
      expect(Colors.light.accent).toHaveProperty('soft');
      expect(Colors.dark.accent).toHaveProperty('faint');
      expect(Colors.dark.accent).toHaveProperty('soft');
    });

    it('has the Story 23.9 avatar-gradient accent.strong sub-token', () => {
      // `strong` is the deeper gradient anchor for the avatar / Go-Premium banner;
      // composed onto every palette's slice so `useTheme().colors.accent.strong`
      // resolves on all six palettes (premise-check #2 — undefined would break the
      // gradient only after a palette switch).
      expect(Colors.light.accent).toHaveProperty('strong');
      expect(Colors.dark.accent).toHaveProperty('strong');
      // Terracotta default values (from design-artifacts/tokens.ts).
      expect(Colors.light.accent.strong).toBe('#A8472A');
      expect(Colors.dark.accent.strong).toBe('#AE4E30');
    });

    it('has nested semantic colors', () => {
      expect(Colors.light.semantic).toHaveProperty('success');
      expect(Colors.light.semantic).toHaveProperty('warning');
      expect(Colors.light.semantic).toHaveProperty('error');
    });

    it('has highlight sync color', () => {
      expect(Colors.light.highlight).toHaveProperty('sync');
      expect(Colors.dark.highlight).toHaveProperty('sync');
    });

    it('has a separator token distinct from border (hairline dividers)', () => {
      expect(Colors.light).toHaveProperty('separator');
      expect(Colors.dark).toHaveProperty('separator');
      expect(Colors.light.separator).not.toBe(Colors.light.border);
      expect(Colors.dark.separator).not.toBe(Colors.dark.border);
    });

    it('has scrim text overlay tokens (scheme-independent light-on-scrim)', () => {
      expect(Colors.light.overlay).toHaveProperty('onScrim');
      expect(Colors.light.overlay).toHaveProperty('onScrimSecondary');
      // The image scrim is permanently dark, so onScrim* must NOT flip per scheme.
      expect(Colors.dark.overlay.onScrim).toBe(Colors.light.overlay.onScrim);
      expect(Colors.dark.overlay.onScrimSecondary).toBe(Colors.light.overlay.onScrimSecondary);
    });

    it('uses *Bg semantic message-background keys', () => {
      expect(Colors.light.semantic).toHaveProperty('successBg');
      expect(Colors.light.semantic).toHaveProperty('warningBg');
      expect(Colors.light.semantic).toHaveProperty('errorBg');
      expect(Colors.light.semantic).toHaveProperty('infoBg');
    });

    it('drops the legacy aliases (clean cutover — no retrocompat)', () => {
      expect(Colors.light).not.toHaveProperty('tint');
      expect(Colors.light).not.toHaveProperty('tabIconDefault');
      expect(Colors.light).not.toHaveProperty('tabIconSelected');
      expect(Colors.light.overlay).not.toHaveProperty('textOnDark');
      expect(Colors.light.overlay).not.toHaveProperty('textOnDarkSecondary');
      expect(Colors.light.semantic).not.toHaveProperty('successBackground');
    });
  });

  describe('light mode values (UX spec lines 337-362)', () => {
    it('has correct background.primary (warm off-white)', () => {
      expect(Colors.light.background.primary).toBe('#FFFBF7');
    });

    it('has correct background.secondary', () => {
      expect(Colors.light.background.secondary).toBe('#F5EFE9');
    });

    it('has correct background.tertiary', () => {
      expect(Colors.light.background.tertiary).toBe('#EBE3DA');
    });

    it('has correct text.primary (warm black)', () => {
      expect(Colors.light.text.primary).toBe('#1A1612');
    });

    it('has correct accent.primary (terracotta)', () => {
      expect(Colors.light.accent.primary).toBe('#C65D3B');
    });

    it('has correct highlight.sync (soft gold)', () => {
      expect(Colors.light.highlight.sync).toBe('#FFF3CD');
    });

    it('has correct semantic colors', () => {
      expect(Colors.light.semantic.success).toBe('#4A7C59');
      expect(Colors.light.semantic.warning).toBe('#D4A03D');
      expect(Colors.light.semantic.error).toBe('#C44536');
    });
  });

  describe('dark mode values', () => {
    it('has inverted background.primary', () => {
      expect(Colors.dark.background.primary).toBe('#1A1612');
    });

    it('has lighter accent for dark background', () => {
      expect(Colors.dark.accent.primary).toBe('#E8A87C');
    });

    it('has correct highlight.sync for dark mode', () => {
      expect(Colors.dark.highlight.sync).toBe('#3D3520');
    });

    it('has lighter semantic colors for dark mode', () => {
      expect(Colors.dark.semantic.success).toBe('#6B9E7B');
      expect(Colors.dark.semantic.warning).toBe('#E8B84A');
      expect(Colors.dark.semantic.error).toBe('#D66B5C');
    });
  });

  describe('type exports', () => {
    it('ColorScheme type is valid', () => {
      const scheme: ColorScheme = 'light';
      expect(['light', 'dark']).toContain(scheme);
    });

    it('ColorTokens type matches light structure', () => {
      const tokens: ColorTokens = Colors.light;
      expect(tokens.background.primary).toBeDefined();
    });
  });
});
