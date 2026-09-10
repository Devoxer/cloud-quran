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
 *
 * ── The dwell: revealed chrome puts itself away again (story 7-6) ────────────────────────────
 *
 * ⚠️ A `setTimeout` IS NOT A SECOND DRIVER, AND `ReadingChrome.test.tsx`'s ONE-DRIVER WALK IS
 * RIGHT TO IGNORE IT. That walk counts `useSharedValue(` and `withTiming(` because
 * `chrome-render-storm` was two ANIMATION mechanisms running at two speeds. The dwell adds
 * neither: it flips `visible`, and the effect below turns that into the same single `withTiming`
 * every other reveal and dismissal goes through — exactly like `toggle()`. The docblock above
 * already promised this ("a state update that arrives from anywhere … animates identically");
 * this is that future arriving, and it is also why BOTH surfaces get the dwell for free rather
 * than each growing a timer of its own.
 *
 * ⚠️ `show()` IS STICKY AND `toggle()` IS NOT — the distinction costs a ref, not a new API. Every
 * `show()` caller is a FAILURE surface (an unreadable surah, an empty one, a mushaf page whose
 * font could not be fetched, a playback error) whose message is drawn INSIDE the chrome and whose
 * only exit is the tab bar the reveal brings back. Dismissing that on a timer would rebuild the
 * trap the reveal was added to prevent. So `show()` marks the reveal sticky and clears any dwell
 * already running (a failure arriving over an ordinary reveal must not inherit its countdown),
 * and `toggle()` clears the mark — the reader dismissing it by hand is the documented exit, and
 * the next ordinary reveal gets a fresh dwell.
 *
 * ── The SELECTED VERSE lives here too, and that is what makes it die with the bars (story 7-8) ─
 *
 * ⚠️ THE SELECTION IS NOT A SECOND STATE MACHINE — IT IS THE SAME ONE. The owner's model is
 * "selection lifetime IS chrome lifetime": whatever puts the bars away clears the selected ayah,
 * with no orphan state and no silent deselection. Held in a screen instead, that sentence becomes
 * an effect each surface has to remember (and a future third surface would forget), watching
 * `visible` for a falling edge it does not own. Held here it is STRUCTURAL: `visible` and
 * `selected` are ONE `useState` object, so every transition to hidden — the dwell, the reader's
 * own tap, the dismiss chevron — writes `selected: null` in the same update. There is no ordering
 * to get wrong because there is no second update.
 *
 * ⚠️ `revealFor` IS THE ONLY WAY IN, AND `toggle()` IS `revealFor(null)`. One entry point, two
 * arguments: a `(surah, verse)` pair for a press on Quran text, `null` for a press on an empty
 * area. ⚠️ **ONLY AN EMPTY PRESS DISMISSES.** A press on Quran text never puts the chrome away —
 * a different ayah moves the selection, the ayah already selected re-arms the dwell. The first
 * cut treated a repeat press as a dismissal on a "Quran text is never a dead zone" argument, and
 * on the MUSHAF that meant pressing a SECOND WORD of the verse you are acting on threw the whole
 * thing away, because `samePair` matches at ayah granularity and a verse is many words.
 *
 * ⚠️ A SELECTION ALSO DIES WITH THE AYAH IT POINTS AT, not only with the bars — `clearSelection`.
 * A surah change, a settled mushaf page, a focus resync and the mode toggle all move the reader
 * without touching `visible`, and a row offering play-from-here for an ayah that scrolled away is
 * 6-4's wrong-surah bookmark defect one indirection out.
 *
 * ⚠️ AND THE DWELL IS ITS OWN EFFECT NOW, KEYED ON A TOKEN. Moving the selection does not change
 * `visible`, so an effect keyed on `visible` alone would leave the ORIGINAL five seconds running
 * and take the bars away mid-decision. The token bumps on every `revealFor` AND on `keepAlive`,
 * which every control inside the chrome calls — the bars must not vanish in the instant after
 * the reader presses play. `holdDwell` suspends it entirely while the reciter sheet is open. The
 * token is deliberately NOT a dependency of the animation effect, so re-selecting never re-runs
 * `withTiming` on a value that is already where it belongs.
 *
 * ⚠️ A SCREEN READER SUSPENDS THE DWELL — INCLUDING ONE ALREADY COUNTING DOWN. VoiceOver and
 * TalkBack navigate by swiping through the accessibility tree, and a dismissed bar leaves that
 * tree entirely, so chrome that vanishes five seconds after it appears is chrome a screen-reader
 * user can never finish reading. Turning the reader on mid-dwell therefore CANCELS the pending
 * timer rather than only governing the next reveal. Both halves of the check are
 * failure-tolerant (a rejected probe or a listener that cannot be attached means "off"), because
 * a detection failure must degrade to the sighted behaviour rather than to no chrome timer for
 * anybody. This is the ONE `AccessibilityInfo` read in the
 * tree, and it is not the reduce-motion one the paragraph above explains away: reduce motion is
 * about how the bars move, this is about whether they leave at all.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, type ViewStyle } from 'react-native';
import {
  type AnimatedStyle,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { DURATIONS, EASINGS } from '@/constants/animation';
import type { VersePair } from '@/lib/usePosition';

/**
 * How far each bar travels while fading, in points. Small on purpose: the bars slide out of the
 * way rather than flying, and a large travel on the header reads as the content moving.
 */
export const CHROME_TRAVEL = 12;

/**
 * How long revealed chrome waits before putting itself away, in ms. A DOMAIN duration, not an
 * animation one — `DURATIONS` carries transition tokens and explicitly allows a named local
 * const for a duration like this (the same shape as `WelcomeBackBanner`'s `BANNER_DISMISS_MS`).
 * Long enough to read a surah name and reach for the tab bar; short enough that the immersive
 * default is not lost for the rest of the session.
 */
export const CHROME_DWELL_MS = 5000;

export interface ChromeReveal {
  /** Whether the chrome is on its way in (or already there). Drives the animation, never layout. */
  visible: boolean;
  /**
   * Whether the bars may take a touch at all. NOT the same as `visible` — see the header: it
   * turns on only once the reveal has finished, and off the moment a dismissal starts.
   */
  interactive: boolean;
  /**
   * The ayah the reader is acting on, or null when the press was on an empty area (story 7-8).
   * ⚠️ IT CANNOT OUTLIVE `visible` — the two are one state object, so every path to hidden nulls
   * it in the same update. Nothing else may hold a selection.
   */
  selectedVerse: VersePair | null;
  /**
   * Reveal the chrome for `pair` — or for nothing, when the press landed on an empty area
   * (story 7-8). An EMPTY press while the bars are already up dismisses them, which is how the
   * surface tap has always worked. A press on Quran text never dismisses: a different ayah moves
   * the selection, and the ayah ALREADY selected re-arms the dwell.
   *
   * ⚠️ THAT LAST CLAUSE IS A REVIEW FIX, NOT A DETAIL. It first treated a repeat press on the
   * selected ayah as a dismissal ("Quran text is never a dead zone"), which on the MUSHAF meant
   * pressing a second WORD of the verse you are acting on — `samePair` matches at ayah
   * granularity — threw away the chrome and the selection mid-decision.
   */
  revealFor: (pair: VersePair | null) => void;
  /**
   * Drop the selection, leaving the bars exactly where they are (story 7-8, review).
   *
   * ⚠️ THE SELECTION DIES WITH THE CHROME, BUT IT MUST ALSO DIE WITH THE AYAH IT POINTS AT. A
   * surah change, a settled mushaf page, a focus resync and the mode toggle all move the reader
   * without touching `visible`, so without this the row went on offering play-from-here and a
   * bookmark for an ayah no longer on screen — 6-4's wrong-surah defect, one indirection out.
   */
  clearSelection: () => void;
  /**
   * Start the dwell over without changing anything else (story 7-8, review).
   *
   * ⚠️ ONLY `revealFor` USED TO RE-ARM, so the bars could vanish in the instant after the reader
   * pressed the row's play or bookmark — the story's own open question, answered by the row
   * existing. Every control inside the chrome reports here.
   */
  keepAlive: () => void;
  /**
   * Suspend the dwell entirely while something modal is open over the chrome — the reciter sheet
   * (story 7-8, review). Releasing it arms a FRESH dwell rather than resuming a spent one, so a
   * reader who closes the sheet gets the full five seconds, not whatever was left.
   */
  holdDwell: (held: boolean) => void;
  /**
   * Flip it, with nothing selected — exactly `revealFor(null)`, which is what the empty-area tap
   * and the dismiss chevron both call. Idempotent per tap; the animation is interrupted and
   * re-targeted, never queued.
   */
  toggle: () => void;
  /**
   * Bring the chrome back regardless of where it was, and STICKILY — no dwell is armed and any
   * dwell already running is cancelled. Not decoration: the error and empty surfaces have no
   * other exit, so the screen reveals the door rather than leaving the reader to guess that a
   * tap does something, and a five-second timer taking that door away again would be the trap
   * this exists to prevent. `toggle()` — the reader's own dismissal — clears the stickiness.
   */
  show: () => void;
  /** Animated style for the TOP bar — same driver as `footerStyle`, opposite travel. */
  headerStyle: AnimatedStyle<ViewStyle>;
  /** Animated style for the BOTTOM bar — same driver as `headerStyle`, opposite travel. */
  footerStyle: AnimatedStyle<ViewStyle>;
}

/**
 * The whole of what a reveal IS — deliberately one object rather than three states.
 *
 * ⚠️ `visible` AND `selected` MUST MOVE TOGETHER OR THE "selection dies with the chrome" RULE
 * BECOMES AN EFFECT SOMEBODY CAN FORGET. `token` is the dwell's re-arm signal: it bumps on every
 * `revealFor`, including one that only MOVES the selection, which is the case a `visible`-keyed
 * effect cannot see.
 */
interface ChromeState {
  visible: boolean;
  selected: VersePair | null;
  token: number;
}

const HIDDEN: ChromeState = { visible: false, selected: null, token: 0 };

/** Whether two pairs name the same ayah. `null` is never "the same" as a pair. */
function samePair(a: VersePair | null, b: VersePair | null): boolean {
  if (a === null || b === null) return a === b;
  return a.surah === b.surah && a.verse === b.verse;
}

export function useChromeReveal(): ChromeReveal {
  const progress = useSharedValue(0);
  const [chrome, setChrome] = useState<ChromeState>(HIDDEN);
  const { visible } = chrome;
  const [interactive, setInteractive] = useState(false);
  /**
   * Whether something modal is open over the chrome (the reciter sheet). STATE, not a ref: the
   * dwell effect has to re-run when it flips, so that releasing the hold arms a fresh timer.
   */
  const [dwellHeld, setDwellHeld] = useState(false);
  /** Whether this reveal came from `show()` — see the docblock. Set by `show`, cleared by `toggle`. */
  const sticky = useRef(false);
  /** Last known screen-reader state. A ref: it must not re-render anything, only gate the arm. */
  const screenReaderOn = useRef(false);
  /** The pending dwell, so `show()` can cancel one it did not arm. */
  const dwell = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearDwell = useCallback(() => {
    if (dwell.current !== null) {
      clearTimeout(dwell.current);
      dwell.current = null;
    }
  }, []);

  // Both halves swallow their own failures: an unavailable accessibility bridge means "no screen
  // reader", which is the sighted behaviour, rather than an unhandled rejection at boot.
  useEffect(() => {
    let alive = true;
    /**
     * ⚠️ RECORDING IT IS NOT ENOUGH — AN ARMED DWELL HAS TO BE CANCELLED. The arm reads this ref
     * once, when the reveal starts, so a reader who turns VoiceOver on WHILE the chrome is up
     * would still have watched it vanish once before the suspension took effect (and that one
     * time is exactly the reader who needs it least often and can least afford it). Both the
     * initial probe and the live listener therefore clear a pending timer as well as setting the
     * flag; the flag alone governs every LATER reveal.
     */
    const record = (on: boolean) => {
      screenReaderOn.current = on;
      if (on) clearDwell();
    };
    try {
      // `Promise.resolve(...)` rather than `.then` on the answer directly: a stubbed or absent
      // bridge can hand back a non-promise, and a `TypeError` thrown from an effect at boot
      // would take the whole reading surface down over a detail about a timer.
      void Promise.resolve(AccessibilityInfo.isScreenReaderEnabled())
        .then((on) => {
          if (alive) record(on === true);
        })
        .catch(() => {});
    } catch {
      // no probe, no live state — "off" stands, which is the sighted behaviour
    }
    let subscription: { remove: () => void } | undefined;
    try {
      subscription = AccessibilityInfo.addEventListener('screenReaderChanged', (on) => {
        record(on === true);
      });
    } catch {
      // no listener, no live updates — the initial probe still stands
    }
    return () => {
      alive = false;
      subscription?.remove();
    };
  }, [clearDwell]);

  // The single animation. Driven from an effect rather than from inside `toggle` so the shared
  // value is a pure function of `visible` — a state update that arrives from anywhere (the dwell
  // below; a future "hide chrome while audio plays") animates identically, and the setters stay
  // plain. ⚠️ KEYED ON `visible` ALONE: moving the SELECTION must not re-target an animation
  // that is already where it belongs (story 7-8).
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

  /**
   * The dwell. ⚠️ THE ARM AND ITS CLEANUP ARE THE SAME EFFECT, which is what makes "cleared on
   * dismissal, on re-arm and on unmount" one rule instead of three: any change to the deps runs
   * the cleanup first, and so does unmounting, so no timer outlives the reveal it belongs to and
   * nothing sets state after the hook is gone.
   *
   * ⚠️ `chrome.token` IS A DEPENDENCY, AND THAT IS THE STORY-7-8 FIX. A selection that MOVES
   * leaves `visible` true, so a `visible`-only effect would keep counting the ORIGINAL five
   * seconds and take the bars away while the reader was still deciding which ayah to act on.
   * Every control inside the chrome bumps the same token through `keepAlive`, for the same
   * reason: pressing play must not be followed by the bars vanishing.
   *
   * ⚠️ `dwellHeld` SUSPENDS IT ALTOGETHER. A reader who opens the reciter sheet is using the
   * chrome, not ignoring it — and coming back to no chrome and no selection is the failure. It is
   * STATE, so releasing the hold re-runs this effect and arms a FULL fresh dwell.
   */
  useEffect(() => {
    if (!chrome.visible || dwellHeld || sticky.current || screenReaderOn.current) return;
    dwell.current = setTimeout(
      () => setChrome((c) => ({ ...HIDDEN, token: c.token })),
      CHROME_DWELL_MS
    );
    return clearDwell;
  }, [chrome.visible, chrome.token, dwellHeld, clearDwell]);

  const revealFor = useCallback((pair: VersePair | null) => {
    // The reader's own press owns the chrome again — including dismissing a sticky reveal, after
    // which the next reveal is an ordinary one and dwells.
    sticky.current = false;
    setChrome((c) => {
      // ⚠️ ONLY AN EMPTY PRESS DISMISSES. The surface tap has always toggled, and the dismiss
      // chevron is this same call with `null`. A press on QURAN TEXT never puts the chrome away:
      // a different ayah moves the selection, and the ayah already selected re-arms — because on
      // the mushaf "the same ayah" is any of its WORDS, so a dismissal there fired when the
      // reader pressed a second word of the verse they were acting on.
      if (c.visible && pair === null) return { ...HIDDEN, token: c.token + 1 };
      if (c.visible && samePair(c.selected, pair)) return { ...c, token: c.token + 1 };
      return { visible: true, selected: pair, token: c.token + 1 };
    });
  }, []);

  /** See the interface: the selection dies with the AYAH as well as with the bars. */
  const clearSelection = useCallback(() => {
    setChrome((c) => (c.selected === null ? c : { ...c, selected: null }));
  }, []);

  /** Re-arm the dwell, changing nothing else. A no-op while the bars are down. */
  const keepAlive = useCallback(() => {
    setChrome((c) => (c.visible ? { ...c, token: c.token + 1 } : c));
  }, []);

  const holdDwell = useCallback((held: boolean) => setDwellHeld(held), []);

  // ⚠️ NOT A SECOND IMPLEMENTATION. The empty-area tap and the dismiss chevron are `revealFor`
  // with nothing selected; giving them their own setter is how the two paths drift.
  const toggle = useCallback(() => revealFor(null), [revealFor]);

  const show = useCallback(() => {
    sticky.current = true;
    // ⚠️ CANCEL EAGERLY: an error arriving while the chrome is ALREADY revealed changes no state,
    // so the effect does not re-run and the dwell it armed would still be counting down — the
    // failure message would fade out on a reader who never dismissed it.
    clearDwell();
    // ⚠️ IT CLEARS THE SELECTION TOO, and the identity check is what keeps that from being a
    // re-render on every error tick: a `show()` over an already-revealed, unselected chrome
    // returns the SAME object. A failure surface is not a verse the reader chose.
    setChrome((c) =>
      c.visible && c.selected === null ? c : { ...c, visible: true, selected: null }
    );
  }, [clearDwell]);

  const headerStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (progress.value - 1) * CHROME_TRAVEL }],
  }));

  const footerStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * CHROME_TRAVEL }],
  }));

  return {
    visible,
    interactive,
    selectedVerse: chrome.selected,
    revealFor,
    clearSelection,
    keepAlive,
    holdDwell,
    toggle,
    show,
    headerStyle,
    footerStyle,
  };
}
