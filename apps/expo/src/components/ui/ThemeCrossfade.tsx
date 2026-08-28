/**
 * ThemeCrossfade — the whole app dips and settles when the reading look changes (story 6-5).
 *
 * A theme change repaints every pixel on screen simultaneously. Without a transition that reads
 * as a hard cut: the reader taps "Sepia" and the app appears to have re-launched. This wraps the
 * app content in one `Animated.View` and fades its opacity back up whenever the resolved
 * `(palette, colorScheme)` pair changes.
 *
 * ── The three things that are load-bearing ───────────────────────────────────────────────────
 *
 * ⚠️ 1. IT MOUNTS AT OPACITY 1 AND ANIMATES ONLY ON A SUBSEQUENT CHANGE. A crossfade that ran on
 * mount would fade the app IN at every cold launch — which is a boot gate wearing an animation's
 * clothes: the first frame would be at 0.4 opacity, and `root-layout-boot.test.tsx` exists
 * because this app's rule is that nothing delays or dims first paint. The `useRef` seeded with
 * the CURRENT pair is what makes the first effect run a no-op.
 *
 * ⚠️ 2. IT STARTS AT 0.4, NOT AT 0. The pre-fork provider (`e8c05e7`
 * `src/theme/ThemeProvider.tsx:32-46`) shipped `setValue(0)` first and fixed it in review: a full
 * fade from invisible reads as a flash/blink, and for the ~200ms the app is near-transparent the
 * reader is looking at nothing. A dip to 0.4 says "something changed" without ever removing the
 * page. That number is taken from the pre-fork, and so is `DURATIONS.theme = 400`.
 *
 * ⚠️ 3. REDUCE MOTION IS HONOURED BY DOING NOTHING. `withTiming` with no `reduceMotion` config
 * defaults to `ReduceMotion.System`, which reads the OS setting on the UI thread and jumps
 * straight to the target. Reading `AccessibilityInfo` here would re-implement that one race
 * later. Same precedent as `features/reading/hooks/useChromeReveal.ts`. The state is correct
 * either way — only the 400ms in between is skipped.
 *
 * ⚠️ IT WATCHES THE RESOLVED PAIR, NOT `themeMode`. A device flipping to dark at dusk under
 * `themeMode: 'auto'` changes `colorScheme` with no user action and no `themeMode` change — the
 * repaint is identical and deserves the same transition. Conversely, selecting "Light" while the
 * device is already light changes `themeMode` and repaints nothing, so there is nothing to fade.
 */

import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { DURATIONS, EASINGS } from '@/constants/animation';
import { useTheme } from '@/lib/theme';

/** The opacity the app dips to before settling back to 1. See point 2 in the header. */
export const THEME_CROSSFADE_FLOOR = 0.4;

export interface ThemeCrossfadeProps {
  children: ReactNode;
}

export function ThemeCrossfade({ children }: ThemeCrossfadeProps) {
  const { palette, colorScheme } = useTheme();
  const opacity = useSharedValue(1);
  // Seeded with the CURRENT pair, so the first effect run compares equal and does nothing.
  const previous = useRef(`${palette}:${colorScheme}`);

  useEffect(() => {
    const next = `${palette}:${colorScheme}`;
    if (previous.current === next) return;
    previous.current = next;
    opacity.value = THEME_CROSSFADE_FLOOR;
    opacity.value = withTiming(1, { duration: DURATIONS.theme, easing: EASINGS.standard });
  }, [palette, colorScheme, opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View style={[styles.fill, style]} testID="theme-crossfade">
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
