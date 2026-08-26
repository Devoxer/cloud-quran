/**
 * useLiquidGlassHeaderInset — top padding to clear the floating iOS Liquid Glass
 * Stack header for a FIXED element pinned above a scroll region.
 *
 * `LIQUID_GLASS_STACK_OPTIONS` sets `headerTransparent: true` on iOS, so the
 * header floats OVER content and does NOT consume layout space. A scroll view
 * that is the screen's direct child clears it for free via
 * `contentInsetAdjustmentBehavior="automatic"` — but a fixed element pinned
 * ABOVE the scroll (a sticky search field) can't lean on that inset, so it must
 * offset itself.
 *
 * `useSafeAreaInsets().top` is NOT enough — it's the status bar only (~47–59pt),
 * NOT the ~44pt compact nav bar above it. The full header ≈ status bar + 44pt
 * (the "~88pt" the cheat-sheet documents). On Android/Web the header is opaque
 * and consumes layout space, so the offset is 0.
 *
 * NOTE: 44pt is the iOS *compact* (non-large-title) nav bar — correct for the
 * `/search`, `/filters`, and Notes screens (all plain inline titles). A
 * `headerLargeTitle` screen would need a taller offset (or a different approach).
 */
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** iOS compact navigation-bar height (portrait). */
const IOS_NAV_BAR_HEIGHT = 44;

export function useLiquidGlassHeaderInset(): number {
  const insets = useSafeAreaInsets();
  return Platform.OS === 'ios' ? insets.top + IOS_NAV_BAR_HEIGHT : 0;
}
