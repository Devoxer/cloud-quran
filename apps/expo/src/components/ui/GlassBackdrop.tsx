/**
 * GlassBackdrop — the canonical chrome-adjacent surface backdrop.
 *
 * One helper, four platform tiers (Story 17.4 §B, AC 11):
 *   - iOS 26+        → real Liquid Glass via `<GlassView>` (OS handles blur).
 *   - iOS 16.4–18.x  → `<BlurView tint="systemChromeMaterial">` (native blur look).
 *   - Android        → semi-transparent theme tint (Material 3 scrim — a blur
 *                      here would be the non-native choice + a perf cost).
 *   - Web            → semi-transparent tint + CSS `backdrop-filter: blur(20px)`.
 *
 * Use on chrome-adjacent surfaces ONLY (sheet/menu backdrops, sub-header bands,
 * MiniPlayer-pill backdrops). Content-area surfaces (cards, list items, button
 * fills, form inputs) stay flat via `useTheme().colors` — see architecture.md
 * § "UI primitives — build vs adopt" for the canonical Liquid Glass classification table.
 *
 * Extracted from `MiniPlayer.tsx`'s `PillBackdrop` (Story 17.3.5) — MiniPlayer
 * is the first consumer; behavior is unchanged.
 *
 * `isLiquidGlassAvailable()` from `expo-glass-effect` is the source of truth for
 * the iOS-26 check — never roll a `Platform.Version` check (it's a STRING on
 * iOS; see STACK-CHEAT-SHEET.md § `Platform.Version`).
 *
 * Source: STACK-CHEAT-SHEET.md § "Pill MiniPlayer backdrop".
 */

import { BlurView } from 'expo-blur';
import { type GlassStyle, GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import type { ComponentProps } from 'react';
import { Platform, type StyleProp, View, type ViewStyle } from 'react-native';
import { withAlpha } from '@/lib/color';

export interface GlassBackdropProps {
  /** Base style applied to the glass / blur / opaque container. */
  style?: StyleProp<ViewStyle>;
  /** Extra style applied ONLY to the iOS 16.4–18 `<BlurView>` tier (e.g. `overflow: 'hidden'` so the blur clips). */
  blurStyle?: StyleProp<ViewStyle>;
  /**
   * Plain `#rrggbb` (or `#rgb`) hex string used as the fallback tint on the
   * non-iOS-26 tiers (Android / Web / opaque). Composited at `alpha` opacity.
   */
  backgroundColor: string;
  /** Liquid Glass material (iOS 26+). @default 'regular' */
  glassEffectStyle?: GlassStyle;
  /** Fallback tint opacity for the Android/Web/opaque tier. @default 0.88 */
  alpha?: number;
  /** iOS 16.4–18 `<BlurView>` intensity. @default 80 */
  blurIntensity?: number;
  /** iOS 16.4–18 `<BlurView>` tint. @default 'systemChromeMaterial' */
  blurTint?: ComponentProps<typeof BlurView>['tint'];
  /**
   * Skip every backdrop tier and render a plain transparent `<View>` — the
   * parent already provides the surface (e.g. a NativeTabs BottomAccessory's
   * OS Liquid Glass capsule, or a native BottomSheet/Dialog's own backdrop).
   */
  transparent?: boolean;
  testID?: string;
  accessibilityLabel?: string;
  children?: React.ReactNode;
}

export function GlassBackdrop({
  style,
  blurStyle,
  backgroundColor,
  glassEffectStyle = 'regular',
  alpha = 0.88,
  blurIntensity = 80,
  blurTint = 'systemChromeMaterial',
  transparent,
  testID,
  accessibilityLabel,
  children,
}: GlassBackdropProps) {
  if (transparent) {
    return (
      <View style={style} testID={testID} accessibilityLabel={accessibilityLabel}>
        {children}
      </View>
    );
  }

  if (Platform.OS === 'ios' && isLiquidGlassAvailable()) {
    return (
      <GlassView
        style={style}
        glassEffectStyle={glassEffectStyle}
        testID={testID}
        accessibilityLabel={accessibilityLabel}
      >
        {children}
      </GlassView>
    );
  }

  if (Platform.OS === 'ios') {
    // iOS 16.4–18: BlurView with system chrome material gives the iOS look.
    return (
      <BlurView
        intensity={blurIntensity}
        tint={blurTint}
        style={[style, blurStyle]}
        testID={testID}
        accessibilityLabel={accessibilityLabel}
      >
        {children}
      </BlurView>
    );
  }

  // Android + Web: translucent tint on a regular View. Web adds CSS
  // `backdrop-filter: blur(20px)` so content behind blurs through.
  const webBlur: ViewStyle =
    Platform.OS === 'web'
      ? // react-native-web supports `backdropFilter`; Safari needs the vendor
        // prefix. RN's ViewStyle type doesn't include either.
        ({
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
        } as ViewStyle)
      : {};

  return (
    <View
      style={[style, { backgroundColor: withAlpha(backgroundColor, alpha) }, webBlur]}
      testID={testID}
      accessibilityLabel={accessibilityLabel}
    >
      {children}
    </View>
  );
}
