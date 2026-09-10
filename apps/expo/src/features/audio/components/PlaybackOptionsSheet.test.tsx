/**
 * The playback-options sheet — speed and the sleep timer (story 7-4).
 *
 * ⚠️ THE STORE IS THE REAL ONE, as in every other audio suite here. What these cases are about is
 * which control writes WHICH state, and a fake store would let this file assert its own
 * arithmetic instead of the rule the sheet is enforcing.
 */

/** The window the sheet sizes against — `MushafPage.test`'s idiom, and its reason: the wide
 *  branch is a different renderer, not a different width. */
const mockWindow = { width: 390, height: 844, scale: 2, fontScale: 1 };

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => mockWindow,
}));

import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { useAudioPlayerStore } from '@/stores/audioPlayerStore';
import { PlaybackOptionsSheet } from './PlaybackOptionsSheet';

const store = () => useAudioPlayerStore.getState();
const MINUTE = 60_000;

beforeEach(() =>
  act(() => {
    store().clearPlayback();
    store().setSpeed(1);
  })
);

// The playback store is a module singleton: a suite that leaves a timer armed changes what every
// later file's chrome renders.
afterEach(() =>
  act(() => {
    store().clearSleepTimer();
    store().setSpeed(1);
  })
);

const open = () => render(<PlaybackOptionsSheet open onClose={() => {}} />);

describe('speed', () => {
  it('shows the current rate and moves it', () => {
    open();
    fireEvent.press(screen.getByTestId('playback-options-speed-increment'));
    expect(store().speed).toBe(1.1);
    fireEvent.press(screen.getByTestId('playback-options-speed-decrement'));
    expect(store().speed).toBe(1);
  });

  it('reflects a rate the store already holds, rather than starting from 1.0', () => {
    act(() => store().setSpeed(1.5));
    open();
    expect(screen.getByTestId('playback-options-speed')).toBeTruthy();
    fireEvent.press(screen.getByTestId('playback-options-speed-increment'));
    expect(store().speed).toBe(1.6);
  });

  /**
   * ⚠️ THE CONTROL IS NEVER GATED ON PLAYBACK. The inherited menu disabled its speed selector
   * unless something was playing, and "speed only applies while playing" is the very defect this
   * story exists to fix — a greyed-out control is that defect wearing a different face. Nothing
   * is loaded here at all. MUTATION: pass `disabled={!playing}`; this reddens.
   */
  it('works with nothing playing', () => {
    open();
    expect(store().playbackState).toBe('idle');
    fireEvent.press(screen.getByTestId('playback-options-speed-increment'));
    expect(store().speed).toBe(1.1);
  });

  it('DISABLES the stepper at each end, rather than leaning on the clamp', () => {
    /**
     * ⚠️ THE FIRST CUT ASSERTED `store().speed` AND CLAIMED TO BE ABOUT THE BUTTON (story 7-4
     * review, P16). `clampSpeed` guarantees that value at either end whether or not the control
     * is disabled, so deleting `disabled={isAtMax}` left it green — a control that looks live,
     * presses, and does nothing. The disabled state is the thing under test, so assert it.
     */
    act(() => store().setSpeed(2));
    open();
    const up = screen.getByTestId('playback-options-speed-increment');
    expect(up.props.accessibilityState).toMatchObject({ disabled: true });
    expect(
      screen.getByTestId('playback-options-speed-decrement').props.accessibilityState
    ).toMatchObject({
      disabled: false,
    });
    fireEvent.press(up);
    expect(store().speed).toBe(2);

    screen.unmount();
    act(() => store().setSpeed(0.5));
    open();
    const down = screen.getByTestId('playback-options-speed-decrement');
    expect(down.props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(down);
    expect(store().speed).toBe(0.5);
  });
});

describe('the sleep timer', () => {
  it('arms a duration and shows it as chosen', () => {
    open();
    fireEvent.press(screen.getByTestId('playback-options-sleep-30'));

    expect(store().sleepDurationMs).toBe(30 * MINUTE);
    expect(store().sleepDeadline).not.toBeNull();
    expect(screen.getByTestId('playback-options-sleep-30').props.accessibilityState).toMatchObject({
      selected: true,
    });
    expect(screen.getByTestId('playback-options-sleep-15').props.accessibilityState).toMatchObject({
      selected: false,
    });
  });

  it('arms “end of surah”, which is not a duration at all', () => {
    open();
    fireEvent.press(screen.getByTestId('playback-options-sleep-surah'));

    expect(store().sleepEndOfSurah).toBe(true);
    expect(store().sleepDeadline).toBeNull();
    expect(store().sleepDurationMs).toBeNull();
  });

  /**
   * ⚠️ THE BAD STATE THE SPEC ASKS ABOUT: "30 minutes AND at the end of the surah" — two answers
   * to one question, with no rule for which wins. It is unreachable by construction because one
   * setter answers both kinds; there is no sequence of presses that arms both. MUTATION: give
   * end-of-surah its own setter that leaves the deadline alone; this reddens in both directions.
   */
  it('the two kinds are mutually exclusive, whichever order they are pressed in', () => {
    open();
    fireEvent.press(screen.getByTestId('playback-options-sleep-45'));
    fireEvent.press(screen.getByTestId('playback-options-sleep-surah'));
    expect(store().sleepEndOfSurah).toBe(true);
    expect(store().sleepDeadline).toBeNull();

    fireEvent.press(screen.getByTestId('playback-options-sleep-15'));
    expect(store().sleepEndOfSurah).toBe(false);
    expect(store().sleepDurationMs).toBe(15 * MINUTE);
  });

  it('replacing a duration replaces it rather than stacking', () => {
    open();
    fireEvent.press(screen.getByTestId('playback-options-sleep-15'));
    const first = store().sleepDeadline;
    fireEvent.press(screen.getByTestId('playback-options-sleep-60'));

    expect(store().sleepDurationMs).toBe(60 * MINUTE);
    expect(store().sleepDeadline).not.toBe(first);
  });

  it('offers no way to turn off a timer that is not on', () => {
    // An always-present "Turn Off" beside four durations reads as a fifth duration, and pressing
    // it would be a control whose whole effect is the state the store is already in.
    open();
    expect(screen.queryByTestId('playback-options-sleep-off')).toBeNull();
    expect(screen.queryByTestId('playback-options-sleep-armed')).toBeNull();
  });

  it('cancels an armed timer, leaving nothing behind', () => {
    open();
    fireEvent.press(screen.getByTestId('playback-options-sleep-30'));
    expect(screen.getByTestId('playback-options-sleep-armed')).toBeTruthy();

    fireEvent.press(screen.getByTestId('playback-options-sleep-off'));

    expect(store().sleepDeadline).toBeNull();
    expect(store().sleepEndOfSurah).toBe(false);
    expect(store().sleepRemainingMs).toBe(0);
    expect(screen.queryByTestId('playback-options-sleep-off')).toBeNull();
  });

  it('spells a chip and the countdown it arms IDENTICALLY', () => {
    /**
     * ⚠️ 60 MINUTES READ "60m" ON THE CHIP AND "1h 0m" ON THE LABEL BENEATH IT (story 7-4 review,
     * P12) — two spellings of one duration, on one screen, at the same moment. The chip goes
     * through `formatSleepRemaining` now, which is the same function the countdown uses.
     * MUTATION: spell the chip `t('player:sleep.minutes')`; this reddens.
     */
    open();
    const chipLabel = screen.getByTestId('playback-options-sleep-60-text').props.children;
    fireEvent.press(screen.getByTestId('playback-options-sleep-60'));
    expect(screen.getByTestId('playback-options-sleep-armed').props.children).toBe(chipLabel);
  });

  it('spells the armed timer with the shared formatter', () => {
    open();
    fireEvent.press(screen.getByTestId('playback-options-sleep-30'));
    // `formatSleepRemaining(30 min)` — the same string the chrome row's indicator shows, because
    // it is the same function. Two spellings of one countdown is the `formatSpeed` defect again.
    expect(screen.getByTestId('playback-options-sleep-armed').props.children).toBe('30m');

    fireEvent.press(screen.getByTestId('playback-options-sleep-surah'));
    expect(screen.getByTestId('playback-options-sleep-armed').props.children).toBe('End');
  });

  it('keeps showing which duration is running once it has counted down', () => {
    // ⚠️ WHY `sleepDurationMs` EXISTS BESIDE THE DEADLINE. Ten minutes into a 30-minute timer the
    // remainder is "20m", which matches no chip; deriving the selection from it would show four
    // unselected options under a running countdown. MUTATION: select by `remainingMs`.
    act(() => {
      store().setSleepTimer(30 * MINUTE);
      store().setSleepRemaining(20 * MINUTE);
    });
    open();
    expect(screen.getByTestId('playback-options-sleep-30').props.accessibilityState).toMatchObject({
      selected: true,
    });
  });
});

describe('the sheet itself', () => {
  it.each([
    ['a phone', 390, 844],
    ['the ≥768pt dialog-card branch', 1024, 768],
  ])('bounds its body on %s', (_label, width, height) => {
    /**
     * ⚠️ `snapPoints` IS IGNORED AT ≥768pt — `BottomSheet` renders a centered dialog card there
     * instead of the native sheet, whose body is the content-MEASURED host that has no detent to
     * obey. So the detent covers phones and nothing else, and the explicit bound is what makes
     * the claim true on iPad, Android tablet and wide web. `ReciterSheet` records the same lesson.
     *
     * ⚠️ AND IT IS ASSERTED AT BOTH WIDTHS NOW (story 7-4 review, P20). The first cut ran at the
     * default width and asserted only `typeof maxHeight === 'number' && > 0`, which any positive
     * number passes — so the wide branch, the whole reason the bound exists, was never entered.
     * MUTATION: drop the bound; both cases redden.
     */
    mockWindow.width = width;
    mockWindow.height = height;
    open();
    const style = screen.getByTestId('playback-options-bound').props.style;
    const flat = Object.assign(
      {},
      ...(Array.isArray(style) ? style.flat(3) : [style]).filter(Boolean)
    );
    // Half the window, capped at 420 — never the whole screen, and never unbounded.
    expect(flat.maxHeight).toBe(Math.min(height * 0.5, 420));
  });

  it('renders nothing until it is opened', () => {
    render(<PlaybackOptionsSheet open={false} onClose={() => {}} />);
    expect(screen.queryByTestId('playback-options-body')).toBeNull();
  });
});
