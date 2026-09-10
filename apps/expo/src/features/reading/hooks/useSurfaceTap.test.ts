/**
 * `useSurfaceTap` — the empty-area rule, driven through the gesture's OWN callbacks (story 7-6).
 *
 * ⚠️ WHAT THIS CAN AND CANNOT PROVE. Responder negotiation between RNGH's recogniser and RN's
 * touch system is unmockable in Jest — 6-1 recorded that, and it is why "a drag still scrolls"
 * is a device check and not a case here. What IS testable, and is the whole logic this story
 * adds, is the latch: a child's press-in suppresses the next `onEnd`, `onFinalize` resets it on
 * success AND on failure, and nothing leaks into the touch after. So these cases build the real
 * gesture and invoke `handlers.onEnd` / `handlers.onFinalize` in the order the hardware fires
 * them, rather than rendering anything.
 *
 * The chained configuration (`cancelsTouchesInView(false)`, `runOnJS(true)`) is asserted from
 * `gesture.config` for the reason `read-screen.test.tsx` asserts it: RNGH's default cancels the
 * RN touch when the tap recognises, which would kill every `Pressable` under the detector — i.e.
 * every press this hook now reads. Losing it would break the feature in a way no render shows.
 */

import { renderHook } from '@testing-library/react-native';
import type {
  GestureStateChangeEvent,
  TapGestureHandlerEventPayload,
} from 'react-native-gesture-handler';
import { useSurfaceTap } from './useSurfaceTap';

/** The gesture callbacks take an event this logic never reads. */
const EVENT = {} as GestureStateChangeEvent<TapGestureHandlerEventPayload>;

/** One tap that RECOGNISED: touch up, then finalize. */
function tapEnds(gesture: ReturnType<typeof useSurfaceTap>['gesture']) {
  gesture.handlers.onEnd?.(EVENT, true);
  gesture.handlers.onFinalize?.(EVENT, true);
}

/** One tap that FAILED — a drag. RNGH runs `onFinalize` and never `onEnd`. */
function tapFails(gesture: ReturnType<typeof useSurfaceTap>['gesture']) {
  gesture.handlers.onFinalize?.(EVENT, false);
}

function setup() {
  const toggle = jest.fn();
  const { result } = renderHook(() => useSurfaceTap(toggle));
  return { toggle, result };
}

describe('the empty-area rule', () => {
  it('toggles the chrome when no child took the touch', () => {
    const { toggle, result } = setup();
    tapEnds(result.current.gesture);
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it('does NOT toggle when a child reported a press-in first', () => {
    // The reversal story 7-6 is: a bookmark press, a verse press or a mushaf word press used to
    // ALSO toggle the chrome.
    const { toggle, result } = setup();
    result.current.onChildPressIn();
    tapEnds(result.current.gesture);
    expect(toggle).not.toHaveBeenCalled();
  });

  it('is armed again for the very next tap — one suppression, not a mode', () => {
    // MUTATION: never reset the flag. The first press on a verse would then kill the chrome tap
    // for the rest of the session, which reads as "the chrome stopped working".
    const { toggle, result } = setup();
    result.current.onChildPressIn();
    tapEnds(result.current.gesture);
    expect(toggle).not.toHaveBeenCalled();

    tapEnds(result.current.gesture);
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it('resets on a FAILED tap too — a drag that began on a word leaves no residue', () => {
    // MUTATION: reset in `onEnd` instead of `onFinalize`. A page turn or a scroll that starts on
    // a word never reaches `onEnd`, so the flag would survive into the next touch and eat the
    // reader's next chrome tap. This is the case that separates the two callbacks.
    const { toggle, result } = setup();
    result.current.onChildPressIn();
    tapFails(result.current.gesture);

    tapEnds(result.current.gesture);
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it('keeps toggling on repeated empty-area taps', () => {
    // Anti-vacuity for the suppression cases: a hook that never toggled would pass three of them.
    const { toggle, result } = setup();
    tapEnds(result.current.gesture);
    tapEnds(result.current.gesture);
    tapEnds(result.current.gesture);
    expect(toggle).toHaveBeenCalledTimes(3);
  });
});

describe('the gesture configuration', () => {
  it('cannot cancel the RN touches underneath it, and runs its callback on the JS thread', () => {
    // ⚠️ `cancelsTouchesInView(false)` is what lets both touch systems see the same touch — the
    // fix above works BECAUSE of it, not in spite of it. `runOnJS(true)` because the callback is
    // a React state setter, not a worklet.
    const { result } = setup();
    expect(result.current.gesture.config.cancelsTouchesInView).toBe(false);
    expect(result.current.gesture.config.runOnJS).toBe(true);
  });

  it('is built once for a stable toggle — a new gesture per render re-registers the handler', () => {
    const toggle = jest.fn();
    const { result, rerender } = renderHook(() => useSurfaceTap(toggle));
    const gesture = result.current.gesture;
    // ⚠️ CAPTURED BEFORE THE RE-RENDER, BOTH OF THEM. This line used to read
    // `expect(result.current.onChildPressIn).toBe(result.current.onChildPressIn)` — one value
    // compared with itself, which is true of every possible implementation.
    const onChildPressIn = result.current.onChildPressIn;
    rerender({});
    expect(result.current.gesture).toBe(gesture);
    expect(result.current.onChildPressIn).toBe(onChildPressIn);
  });
});
