/**
 * IconBase — shared props + wrapper for the platform-split `Icon` (Story 28.2 follow-up).
 *
 * `Icon` renders per-platform: `Icon.ios.tsx` draws SF Symbols via `expo-symbols`; `Icon.tsx`
 * draws Ionicons via `@expo/vector-icons` on Android + Web (genuine filled/outline glyphs).
 * Both share this `IconProps` shape and the `IconFrame` wrapper — which carries the layout
 * `style`, `testID`, and accessibility props on a `View` so every platform behaves identically
 * (the `expo-symbols` Android/web view drops `style`/`testID`/a11y; the frame restores them).
 */

import type { ColorValue, StyleProp, ViewStyle } from 'react-native';
import { View } from 'react-native';
import type { IconName } from './icon-registry';

/** Symbol weight — honored on iOS (SF Symbols); ignored by the Ionicons renderer. */
export type IconWeight =
  | 'unspecified'
  | 'ultraLight'
  | 'thin'
  | 'light'
  | 'regular'
  | 'medium'
  | 'semibold'
  | 'bold'
  | 'heavy'
  | 'black';

export interface IconProps {
  /** Semantic icon name — see `icon-registry.ts` for the full set. */
  name: IconName;
  /** Symbol size (width/height). Defaults to 24. */
  size?: number;
  /** Tint color. `color` and `tintColor` are equivalent (`color` mirrors the Ionicons prop). */
  color?: ColorValue;
  /** Tint color (alias of `color`; wins if both are provided). */
  tintColor?: ColorValue;
  /** Rendered when no symbol exists for the current platform. */
  fallback?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Symbol weight (iOS only). Defaults to `medium`. */
  weight?: IconWeight;
  accessibilityLabel?: string;
  /** Hides the icon from the accessibility tree (decorative icons). */
  accessibilityElementsHidden?: boolean;
  testID?: string;
}

/** Wrapper `View` carrying layout + testID + a11y, so all platforms behave like the iOS path. */
export function IconFrame({
  style,
  testID,
  accessibilityLabel,
  accessibilityElementsHidden,
  children,
}: Pick<IconProps, 'style' | 'testID' | 'accessibilityLabel' | 'accessibilityElementsHidden'> & {
  children: React.ReactNode;
}) {
  return (
    <View
      style={style}
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      accessibilityElementsHidden={accessibilityElementsHidden}
      importantForAccessibility={accessibilityElementsHidden ? 'no-hide-descendants' : undefined}
    >
      {children}
    </View>
  );
}
