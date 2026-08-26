/**
 * Themed components that automatically use the current theme colors.
 * Learn more about Light and Dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Text as DefaultText } from 'react-native';

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

  return <DefaultText style={[{ color }, style]} {...otherProps} />;
}
