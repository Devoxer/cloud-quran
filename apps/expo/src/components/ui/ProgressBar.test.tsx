/**
 * ProgressBar — the direction-aware seek maths, and the fact that the component actually uses
 * them (story 8-1).
 *
 * ⚠️ `progressFromTouch` was exported with a docblock saying it was exported "so both directions
 * can be asserted without a layout", and then nothing asserted either. This file is that claim,
 * honoured. The component half matters separately: dropping the `rtl` argument at the CALL SITES
 * leaves the helper's own cases green, which is how a mutation survived this story's review.
 */

import { render } from '@testing-library/react-native';

import * as rtl from '@/lib/rtl';
import { ProgressBar, progressFromTouch } from './ProgressBar';

describe('progressFromTouch', () => {
  // Literal expectations. `locationX` is PHYSICAL — measured from the left edge whatever the
  // layout direction — while the fill and thumb are placed with `start`, so under RTL zero
  // progress sits at the RIGHT and the fraction has to be read backwards.
  it.each([
    [0, 0],
    [25, 0.25],
    [50, 0.5],
    [100, 1],
  ])('LTR: a touch at %ipx of 100 is %f', (x, expected) => {
    expect(progressFromTouch(x, 100, false)).toBe(expected);
  });

  it.each([
    [0, 1],
    [25, 0.75],
    [50, 0.5],
    [100, 0],
  ])('RTL: a touch at %ipx of 100 is %f', (x, expected) => {
    expect(progressFromTouch(x, 100, true)).toBe(expected);
  });

  it('clamps a touch outside the track, in both directions', () => {
    // `hitSlop` widens the touch area past the track, so an out-of-range x is routine rather than
    // exotic — and an unclamped one seeks past the end of the recitation.
    expect(progressFromTouch(-40, 100, false)).toBe(0);
    expect(progressFromTouch(140, 100, false)).toBe(1);
    expect(progressFromTouch(-40, 100, true)).toBe(1);
    expect(progressFromTouch(140, 100, true)).toBe(0);
  });

  it('answers 0 for an unmeasured track rather than guessing', () => {
    // Before `onLayout` there is no track. The call sites decline the touch entirely; this is the
    // floor under that, so a width of 0 can never become a division by zero or an Infinity.
    expect(progressFromTouch(25, 0, false)).toBe(0);
    expect(progressFromTouch(25, 0, true)).toBe(0);
    expect(progressFromTouch(25, -10, false)).toBe(0);
  });

  it('is genuinely direction-dependent — the anti-vacuity case', () => {
    // If the `rtl` branch were deleted the two tables above would still agree at the midpoint and
    // nowhere else; this says so in one line, so a reader can see the cases are not decoration.
    expect(progressFromTouch(25, 100, false)).not.toBe(progressFromTouch(25, 100, true));
  });
});

describe('ProgressBar places its fill and thumb logically', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  /** Flatten a style prop that may be an array. */
  // biome-ignore lint/suspicious/noExplicitAny: RNTL exposes untyped style props
  const flat = (style: any): Record<string, unknown> =>
    Array.isArray(style)
      ? style.reduce((acc, s) => ({ ...acc, ...(s ?? {}) }), {})
      : ((style ?? {}) as Record<string, unknown>);

  it('positions with `start`, never `left` — so the fill grows from the reading edge', () => {
    jest.spyOn(rtl, 'isRTL').mockReturnValue(false);
    const { getByTestId } = render(
      <ProgressBar currentMs={25_000} durationMs={100_000} onSeek={jest.fn()} testID="bar" />
    );
    const thumb = flat(getByTestId('bar-thumb').props.style);
    const filled = flat(getByTestId('bar-filled').props.style);
    expect(thumb.start).toBe('25%');
    expect(thumb.left).toBeUndefined();
    expect(thumb.marginStart).toBeDefined();
    expect(filled.start).toBe(0);
    expect(filled.left).toBeUndefined();
  });

  it('reads the direction at render — the seek maths are wired, not merely present', () => {
    // The mutation this catches: `progressFromTouch(x, w, false)` hard-coded at the call sites.
    // Nothing else in the suite would notice, because `isRTL()` is `false` under Jest.
    const spy = jest.spyOn(rtl, 'isRTL').mockReturnValue(true);
    render(<ProgressBar currentMs={25_000} durationMs={100_000} onSeek={jest.fn()} testID="bar" />);
    expect(spy).toHaveBeenCalled();
  });
});
