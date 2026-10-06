/**
 * Themed components that automatically use the current theme colors.
 * Learn more about Light and Dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Text as DefaultText, StyleSheet } from 'react-native';

import { isArabicUi } from '@/lib/rtl';
import { useTheme } from '@/lib/theme';

type ThemeProps = {
  lightColor?: string;
  darkColor?: string;
};

export type TextProps = ThemeProps & DefaultText['props'];

/**
 * Hook to get a theme-aware color value.
 * Returns the prop color if provided for current theme, otherwise returns the default.
 */
export function useThemeColor(
  props: { light?: string; dark?: string },
  colorName: 'text' | 'background'
) {
  const { colors, isDark } = useTheme();
  const colorFromProps = isDark ? props.dark : props.light;

  if (colorFromProps) {
    return colorFromProps;
  } else {
    // Use design token system with nested color objects
    return colors[colorName].primary;
  }
}

export function Text(props: TextProps) {
  const { style, lightColor, darkColor, ...otherProps } = props;
  const color = useThemeColor({ light: lightColor, dark: darkColor }, 'text');

  const flat = StyleSheet.flatten(style) ?? {};
  // Arabic system copy needs more room for dots and vowel marks. Content fonts keep their
  // own geometry: encoded mushaf glyphs and the prose face must never be rescaled here.
  const arabicStyle =
    isArabicUi() && !flat.fontFamily
      ? {
          fontSize: (flat.fontSize ?? 15) + 2,
          lineHeight: Math.max(flat.lineHeight ?? 0, ((flat.fontSize ?? 15) + 2) * 1.6),
          letterSpacing: 0,
        }
      : undefined;
  return <DefaultText style={[{ color }, style, arabicStyle]} {...otherProps} />;
}
