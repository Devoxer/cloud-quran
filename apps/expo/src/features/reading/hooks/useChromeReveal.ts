/**
 * useChromeReveal — ONE driver for the reader's header and footer (story 6-1).
 *
 * ⚠️ THIS HOOK IS THE FIX FOR HALF OF `chrome-render-storm`. The pre-fork build faded the header
 * over 250ms while the tab bar flipped opacity with **no animation at all** — not because nobody
 * tried, but because the tab bar was hidden with `display: 'none'`, and a display flip cannot
 * animate. Two mechanisms, two speeds, one visibly broken transition.
 *
 * So there is exactly ONE `useSharedValue` in this FEATURE and exactly ONE `withTiming` call, and
 * both bars read that same `progress`. They cannot desynchronise, because there is nothing to
 * desynchronise from. `ReadingChrome.test.tsx`'s "one driver" case counts both over the whole
 * feature directory — a second driver is the regression, and it type-checks and lints perfectly.
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
 * ── The chrome starts HIDDEN, and the tap that brings it back is a GESTURE ───────────────────
 *
 * ⚠️ IT SHIPPED STARTING VISIBLE FOR ONE ROUND, AND THAT WAS A CHANGE OF FROZEN INTENT WEARING A
 * USABILITY ARGUMENT. The frozen acceptance criterion is "given the reading screen, when it
 * renders, then it is immersive", and the frozen I/O matrix's row reads "Tap the surface | Chrome
 * hidden | Header and footer appear together" — the hidden state is the one the screen opens in.
 * The argument for flipping it was real: with the tap living on the verse rows there was no
 * "elsewhere" to tap, so the exit was discoverable only by guessing. The answer is to give the
 * tap back its surface, not to move the intent — see `read.tsx`, which puts an RNGH
 * `Gesture.Tap()` over the whole reading area. A gesture recognises a tap and lets a drag through
 * to the list; the `Pressable` that shipped in the first round could not, because it took the RN
 * responder on touch START and never released it inside its own bounds.
 *
 * There is therefore **no `initiallyVisible` parameter**. A hook whose entire thesis is that
 * there is nothing to desynchronise from should not ship a second starting state for a caller to
 * disagree with.
 *
 * ── `interactive` is not `visible`, and the gap is the point ─────────────────────────────────
 *
 * ⚠️ A BAR THAT IS STILL FADING IN MUST NOT TAKE A TAP. The reveal runs for `DURATIONS.standard`;
 * flipping `pointerEvents` with `visible` makes the close button live and ~transparent for that
 * whole window, so a second tap landing in the header strip 100ms after the first EXITS THE
 * SCREEN. So `interactive` lags `visible` on the way in — it turns on from the animation's own
 * completion callback, i.e. off the one driver rather than off a second timer — and LEADS it on
 * the way out, dropping to false the instant the dismissal starts.
 *
 * Scroll-to-dismiss is deliberately NOT here. The epic's UX note mentions it, but this story's
 * frozen matrix specifies tap only — and an `onScroll` handler on the one screen whose recorded
 * defect is a per-scroll-tick storm is a mechanism to add later, with a reason, not by default.
 */

import { useCallback, useEffect, useState } from 'react';
import type { ViewStyle } from 'react-native';
import {
  type AnimatedStyle,
  runOnJS,
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
  /** Whether the chrome is on its way in (or already there). Drives the animation, never layout. */
  visible: boolean;
  /**
   * Whether the bars may take a touch at all. NOT the same as `visible` — see the header: it
   * turns on only once the reveal has finished, and off the moment a dismissal starts.
   */
  interactive: boolean;
  /** Flip it. Idempotent per tap; the animation is interrupted and re-targeted, never queued. */
  toggle: () => void;
  /**
   * Bring the chrome back regardless of where it was. One consumer, and it is not decoration:
   * the error and empty surfaces have no other exit, so the screen reveals the door rather than
   * leaving the reader to guess that a tap does something.
   */
  show: () => void;
  /** Animated style for the TOP bar — same driver as `footerStyle`, opposite travel. */
  headerStyle: AnimatedStyle<ViewStyle>;
  /** Animated style for the BOTTOM bar — same driver as `headerStyle`, opposite travel. */
  footerStyle: AnimatedStyle<ViewStyle>;
}

export function useChromeReveal(): ChromeReveal {
  const progress = useSharedValue(0);
  const [visible, setVisible] = useState(false);
  const [interactive, setInteractive] = useState(false);

  // The single animation. Driven from an effect rather than from inside `toggle` so the shared
  // value is a pure function of `visible` — a state update that arrives from anywhere (a future
  // "hide chrome while audio plays") animates identically, and `toggle` stays a plain setter.
  useEffect(() => {
    // Leading edge of a dismissal: stop taking taps NOW, while the bars are still drawn.
    if (!visible) setInteractive(false);
    progress.value = withTiming(
      visible ? 1 : 0,
      { duration: DURATIONS.standard, easing: EASINGS.standard },
      (finished) => {
        // ⚠️ THE COMPLETION CALLBACK RUNS ON THE UI THREAD, so the state setter has to be hopped
        // back. An interrupted animation reports `finished === false` — that is a re-target, and
        // the effect that re-targeted it owns the next answer.
        if (finished && visible) runOnJS(setInteractive)(true);
      }
    );
  }, [visible, progress]);

  const toggle = useCallback(() => setVisible((wasVisible) => !wasVisible), []);
  const show = useCallback(() => setVisible(true), []);

  const headerStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (progress.value - 1) * CHROME_TRAVEL }],
  }));

  const footerStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * CHROME_TRAVEL }],
  }));

  return { visible, interactive, toggle, show, headerStyle, footerStyle };
}
