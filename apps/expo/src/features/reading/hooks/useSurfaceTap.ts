/**
 * useSurfaceTap — the reading surfaces' ONE tap gesture, plus the empty-area rule (story 7-6).
 *
 * Both reading surfaces built the identical `Gesture.Tap()` inline, and story 7-6 gives that tap
 * a rule it did not have, so it moves here rather than being edited twice: the chrome toggles
 * only where NO child took the touch. The margins, the meta strip, the gaps between rows, the
 * mushaf page header and the page number still toggle; the Arabic, the bookmark control and a
 * mushaf word do not.
 *
 * ── ⚠️ THE ORDERING THIS RESTS ON, AND EXACTLY HOW FAR IT WAS MEASURED ───────────────────────
 *
 * The surface gesture and the presses inside it live in two DIFFERENT touch systems — RNGH's
 * recogniser and RN's responder — and `.cancelsTouchesInView(false)` is precisely what lets both
 * see the same touch (without it, RNGH cancels the RN touch the moment the tap recognises and
 * every `Pressable` under the detector goes dead; 6-1 measured that). `onPressIn` fires on touch
 * DOWN and this gesture's `onEnd` on touch UP, so the flag is normally set before it is read.
 *
 * ⚠️ THAT IS A STRONG TENDENCY, NOT A GUARANTEE, AND THE DOCBLOCK SAID "DETERMINISTIC" UNTIL THE
 * DEVICE SAID OTHERWISE. Physical precedence belongs to the TOUCHES; the CALLBACKS travel
 * different routes to JS (RNGH dispatches its own, `onPressIn` comes through RN's responder
 * system) and nothing sequences them. Measured on a Pixel 9 Pro emulator 2026-09-10:
 *
 *   • realistic presses — `adb shell input swipe` at 20/40/60/120ms, i.e. DOWN + MOVE + UP as a
 *     finger produces: **0 leaks in 48 trials**, reading surface and mushaf words alike;
 *   • `adb shell input tap`'s degenerate DOWN+UP (no MOVE, ~0ms duration, which no finger can
 *     produce): **2-4 leaks per 14 trials** — the press still fired (playback started every
 *     time), this callback simply ran first.
 *
 * ⚠️ DEFERRING THE DECISION ONE MACROTASK WAS TRIED AND DID NOT HELP — do not re-add it without
 * new measurements. A/B on the same device, same synthetic taps: deferred 3/14 and 4/14 vs
 * synchronous 2/14 and 4/14, i.e. no effect, because the late `onPressIn` arrives in a later
 * task than the drain. It cost a `setTimeout`, a second ref, and async test helpers for nothing.
 * The residual is logged in `deferred-work.md`; a real fix means putting both halves in ONE
 * touch system, which is a bigger change than this story.
 *
 * ⚠️ THIS REVERSES STORY 6-4'S ACCEPTED DOUBLE-FIRE, on the owner's call (2026-09-09). 6-4 named
 * the bookmark control's press also toggling the chrome and accepted it; 7-1 inherited the same
 * behaviour for the verse press. `VerseRow`'s docblock has been corrected to match — a comment
 * arguing for the opposite of the shipped behaviour is how the next story re-derives the wrong
 * rule.
 *
 * ⚠️ NOT AN ANIMATION MECHANISM. This file lives inside the feature directory that
 * `ReadingChrome.test.tsx` walks counting `useSharedValue(` / `withTiming(`; it contains neither
 * and must not grow one. It only calls the toggle the one driver already listens to.
 */

import { useCallback, useMemo, useRef } from 'react';
import { Gesture, type TapGesture } from 'react-native-gesture-handler';

export interface SurfaceTap {
  /** Hand this to the `<GestureDetector>` wrapping the whole reading area. */
  gesture: TapGesture;
  /**
   * Wire this to `onPressIn` on every control and every piece of Quran text inside that area.
   * It suppresses the chrome toggle for THIS touch only — it changes nothing else, so a press
   * that also seeks or bookmarks still does so.
   */
  onChildPressIn: () => void;
}

/**
 * @param toggle the chrome's `toggle` — i.e. `revealFor(null)`, "reveal with NOTHING selected"
 *   since story 7-8. Identity-stable, so the gesture is built once. ⚠️ It must stay the
 *   no-selection entry point: this gesture fires exactly where no child took the touch, which is
 *   the definition of an empty area, and an empty area names no ayah.
 */
export function useSurfaceTap(toggle: () => void): SurfaceTap {
  // A ref, not state: the flag is read inside a gesture callback in the same touch, and a
  // re-render between touch-down and touch-up would be both useless and a render per press.
  const childPressed = useRef(false);

  const onChildPressIn = useCallback(() => {
    childPressed.current = true;
  }, []);

  const gesture = useMemo(
    () =>
      Gesture.Tap()
        // ⚠️ RNGH's DEFAULT IS `true`, which cancels the RN touch when the tap recognises and
        // kills every `Pressable` under the detector — including the ones this hook now reads.
        .cancelsTouchesInView(false)
        // The callback is a React state setter, not a worklet.
        .runOnJS(true)
        .onEnd(() => {
          // Touch UP. See the docblock for what this read does and does not guarantee.
          if (!childPressed.current) toggle();
        })
        // Success AND failure — a drag that started on a child must not leave the flag set.
        .onFinalize(() => {
          childPressed.current = false;
        }),
    [toggle]
  );

  return { gesture, onChildPressIn };
}
