/**
 * Glow — a soft, edgeless radial glow (Story 23.9).
 *
 * A real radial gradient (opaque center → fully transparent edge) via `react-native-svg`,
 * so it reads as ambient light rather than the hard-edged flat disc a plain translucent
 * `View` + `borderRadius` produces. Used behind the streak hero, the avatar, and in the
 * Go-Premium / record banner corners. Decorative + `pointerEvents="none"` — never
 * intercepts touches.
 *
 * The gradient id is per-instance (`useId`) so multiple glows on one screen don't collide
 * on web (SVG def ids are document-global there).
 */

import { useId } from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

export interface GlowProps {
  /** Glow color — pass an accent token (a hex/rgb string). */
  color: string;
  /** Diameter in px. */
  size: number;
  /** Opacity at the center (fades to 0 at the edge). @default 0.3 */
  opacity?: number;
  /** Positioning (e.g. absolute placement behind a sibling). */
  style?: StyleProp<ViewStyle>;
}

export function Glow({ color, size, opacity = 0.3, style }: GlowProps) {
  const gradientId = `glow-${useId().replace(/:/g, '')}`;
  return (
    <View pointerEvents="none" style={[{ width: size, height: size }, style]}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={gradientId} cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={color} stopOpacity={opacity} />
            <Stop offset="100%" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width={size} height={size} fill={`url(#${gradientId})`} />
      </Svg>
    </View>
  );
}
