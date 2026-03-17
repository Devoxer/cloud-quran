import type { ThemeName, ThemeTokens } from './tokens';
import { animation, spacing, themes, typography } from './tokens';

function getAllColorValues(tokens: ThemeTokens): string[] {
  return [
    tokens.surface.primary,
    tokens.surface.secondary,
    tokens.text.quran,
    tokens.text.translation,
    tokens.text.ui,
    tokens.accent.highlight,
    tokens.accent.audio,
    tokens.accent.bookmark,
    tokens.border,
    tokens.status.error,
  ];
}

describe('tokens', () => {
  const themeNames: ThemeName[] = ['light', 'sepia', 'dark'];

  test.each(themeNames)('%s theme has all required token groups', (name) => {
    const theme = themes[name];
    expect(theme.surface).toBeDefined();
    expect(theme.surface.primary).toBeDefined();
    expect(theme.surface.secondary).toBeDefined();
    expect(theme.text).toBeDefined();
    expect(theme.text.quran).toBeDefined();
    expect(theme.text.translation).toBeDefined();
    expect(theme.text.ui).toBeDefined();
    expect(theme.accent).toBeDefined();
    expect(theme.accent.highlight).toBeDefined();
    expect(theme.accent.audio).toBeDefined();
    expect(theme.accent.bookmark).toBeDefined();
    expect(theme.border).toBeDefined();
    expect(theme.status).toBeDefined();
    expect(theme.status.error).toBeDefined();
  });

  test.each(themeNames)('%s theme does not contain #FFFFFF', (name) => {
    const colors = getAllColorValues(themes[name]);
    for (const color of colors) {
      expect(color.toUpperCase()).not.toBe('#FFFFFF');
    }
  });

  test.each(themeNames)('%s theme does not contain #000000', (name) => {
    const colors = getAllColorValues(themes[name]);
    for (const color of colors) {
      expect(color.toUpperCase()).not.toBe('#000000');
    }
  });

  test('spacing scale has all expected keys', () => {
    expect(spacing.xs).toBe(4);
    expect(spacing.sm).toBe(8);
    expect(spacing.md).toBe(12);
    expect(spacing.lg).toBe(16);
    expect(spacing.xl).toBe(24);
    expect(spacing['2xl']).toBe(32);
    expect(spacing['3xl']).toBe(48);
    expect(spacing['4xl']).toBe(64);
    expect(spacing['5xl']).toBe(96);
  });

  test('animation tokens have all expected keys', () => {
    expect(animation.fade).toBe(250);
    expect(animation.slide).toBe(300);
    expect(animation.highlight).toBe(150);
    expect(animation.theme).toBe(400);
  });

  test('typography tokens have required fields', () => {
    expect(typography.quran.fontFamily).toBeDefined();
    expect(typography.quran.fontSize).toBe(28);
    expect(typography.quran.lineHeightMultiplier).toBe(2.0);

    expect(typography.translation.fontSize).toBe(16);
    expect(typography.translation.lineHeightMultiplier).toBe(1.6);

    expect(typography.ui.fontSize).toBe(14);
    expect(typography.ui.lineHeightMultiplier).toBe(1.4);

    expect(typography.uiCaption.fontSize).toBe(12);
    expect(typography.uiCaption.lineHeightMultiplier).toBe(1.3);

    expect(typography.verseNumber.fontSize).toBe(12);
    expect(typography.surahTitleArabic.fontSize).toBe(22);
    expect(typography.surahTitleEnglish.fontSize).toBe(14);
  });
});
