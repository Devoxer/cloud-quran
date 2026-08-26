/**
 * useChromeReveal — ONE driver for the reader's header and footer (story 6-1).
 *
 * ⚠️ THIS HOOK IS THE FIX FOR HALF OF `chrome-render-storm`. The pre-fork build faded the header
 * over 250ms while the tab bar flipped opacity with **no animation at all** — not because nobody
 * tried, but because the tab bar was hidden with `display: 'none'`, and a display flip cannot
 * animate. Two mechanisms, two speeds, one visibly broken transition.
 *
 * So there is exactly ONE `useSharedValue` in this file and exactly ONE `withTiming` call, and
 * both bars read that same `progress`. They cannot desynchronise, because there is nothing to
 * desynchronise from. `useChromeReveal.contract.test.ts` asserts those counts against this
 * source — a second driver is the regression, and it type-checks and lints perfectly.
 *
 * ⚠️ THE BARS OVERLAY; THEY NEVER OCCUPY LAYOUT. `progress` drives opacity and a translate, never
 * height, `display` or a layout prop — revealing chrome must not shift the verse the reader is
 * looking at. `ReadingChrome` positions both bars absolutely; this hook only animates them.
 *
 * ⚠️ REDUCE MOTION IS HONOURED BY DOING NOTHING. `withTiming` with no `reduceMotion` config
 * defaults to `ReduceMotion.System`: Reanimated reads the OS setting on the UI thread and jumps
 * straight to the target value when it is on. Reading `AccessibilityInfo.isReduceMotionEnabled`
 * here would re-implement that, one race later. The accessibility floor is met by NOT adding a
 * mechanism — which is worth writing down, because "nothing reads reduce motion" is otherwise a
 * true statement about this tree that reads like a gap.
 *
 * ── The chrome starts VISIBLE, and that is a decision, not an oversight ──────────────────────
 *
 * The immersive route has no native header, no dismiss gesture, and on web never had one — its
 * only way out is the close control inside this chrome. Starting hidden would ship a screen whose
 * exit is discoverable only by guessing that a tap does something. So it starts revealed and the
 * first tap dismisses it; "immersive" is satisfied by the bars OVERLAYING rather than by their
 * being absent on arrival, which is exactly what the acceptance criterion asks ("no chrome
 * occupying layout").
 *
 * Scroll-to-dismiss is deliberately NOT here. The epic's UX note mentions it, but this story's
 * frozen matrix specifies tap only — and an `onScroll` handler on the one screen whose recorded
 * defect is a per-scroll-tick storm is a mechanism to add later, with a reason, not by default.
 */

import { useCallback, useEffect, useState } from 'react';
import type { ViewStyle } from 'react-native';
import {
  type AnimatedStyle,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { DURATIONS, EASINGS } from '@/constants/animation';

/**
 * How far each bar travels while fading, in points. Small on purpose: the bars slide out of the
 * way rather than flying, and a large travel on the header reads as the content moving.
 */
export const CHROME_TRAVEL = 12;

export interface ChromeReveal {
  /** Whether the chrome is currently revealed. Drives `pointerEvents`, never layout. */
  visible: boolean;
  /** Flip it. Idempotent per tap; the animation is interrupted and re-targeted, never queued. */
  toggle: () => void;
  /** Animated style for the TOP bar — same driver as `footerStyle`, opposite travel. */
  headerStyle: AnimatedStyle<ViewStyle>;
  /** Animated style for the BOTTOM bar — same driver as `headerStyle`, opposite travel. */
  footerStyle: AnimatedStyle<ViewStyle>;
}

export function useChromeReveal(initiallyVisible = true): ChromeReveal {
  const progress = useSharedValue(initiallyVisible ? 1 : 0);
  const [visible, setVisible] = useState(initiallyVisible);

  // The single animation. Driven from an effect rather than from inside `toggle` so the shared
  // value is a pure function of `visible` — a state update that arrives from anywhere (a future
  // "hide chrome while audio plays") animates identically, and `toggle` stays a plain setter.
  useEffect(() => {
    progress.value = withTiming(visible ? 1 : 0, {
      duration: DURATIONS.standard,
      easing: EASINGS.standard,
    });
  }, [visible, progress]);

  const toggle = useCallback(() => setVisible((wasVisible) => !wasVisible), []);

  const headerStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (progress.value - 1) * CHROME_TRAVEL }],
  }));

  const footerStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * CHROME_TRAVEL }],
  }));

  return { visible, toggle, headerStyle, footerStyle };
}
