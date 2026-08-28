/**
 * ThemeCrossfade — the two things that can go wrong, and one of them is a boot defect.
 *
 * ⚠️ THE MOUNT CASE IS NOT DECORATION. A crossfade seeded from `useRef(undefined)` — the obvious
 * spelling — dips the app to 0.4 on its FIRST effect run, i.e. at every cold launch, which is a
 * dimmed first frame on a tree whose whole boot rule is that nothing delays or degrades first
 * paint. It typechecks, it looks right in a screenshot taken 400ms later, and only a test that
 * counts animations at mount can see it.
 *
 * The real `@/lib/theme` is used (the global jest mock is a FIXED light terracotta, so a mocked
 * theme could never change and every case here would pass vacuously). Reanimated's own jest setup
 * runs `withTiming` synchronously enough that the settled value is observable; what these cases
 * assert is which VALUES were driven, via a spy on `withTiming`, because the settled opacity is 1
 * in both the "animated" and the "never animated" worlds — the difference is entirely in whether
 * the dip happened at all.
 */

jest.unmock('@/lib/theme');

const mockWithTiming = jest.fn();
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  return {
    ...actual,
    __esModule: true,
    default: actual.default,
    withTiming: (...args: unknown[]) => {
      mockWithTiming(...args);
      return (actual.withTiming as (...a: unknown[]) => unknown)(...args);
    },
  };
});

import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { DURATIONS } from '@/constants/animation';
import { setPalette, setThemeMode } from '@/lib/theme';
import { THEME_CROSSFADE_FLOOR, ThemeCrossfade } from './ThemeCrossfade';

beforeEach(() => {
  mockWithTiming.mockClear();
  // Both MMKV axes back to the default, so each case starts from terracotta · light.
  act(() => {
    setPalette('terracotta');
    setThemeMode('light');
  });
  mockWithTiming.mockClear();
});

function renderCrossfade() {
  return render(
    <ThemeCrossfade>
      <Text>content</Text>
    </ThemeCrossfade>
  );
}

it('renders its children — the wrapper is a wrapper, not a gate', () => {
  renderCrossfade();
  expect(screen.getByText('content')).toBeTruthy();
});

it('does NOT animate on mount — the first frame is never dimmed', () => {
  renderCrossfade();
  expect(mockWithTiming).not.toHaveBeenCalled();
  // …and the opacity it mounts at is the full one, not the dip.
  expect(screen.getByTestId('theme-crossfade')).toHaveStyle({ opacity: 1 });
});

it('animates back to 1 when the PALETTE changes, at the theme duration', () => {
  renderCrossfade();
  act(() => setPalette('sepia'));
  expect(mockWithTiming).toHaveBeenCalledTimes(1);
  expect(mockWithTiming).toHaveBeenCalledWith(
    1,
    expect.objectContaining({ duration: DURATIONS.theme })
  );
});

it('animates when the SCHEME changes with no palette change', () => {
  // The dusk case: `colorScheme` moves and the palette does not. A crossfade keyed on the palette
  // alone would sit still through the biggest repaint the app ever does.
  renderCrossfade();
  act(() => setThemeMode('dark'));
  expect(mockWithTiming).toHaveBeenCalledTimes(1);
});

it('does not animate when the mode changes but the RESOLVED look does not', () => {
  // `light` → `auto` under jest-expo's light system scheme: `themeMode` moved, `colorScheme` did
  // not, nothing repainted. Watching `themeMode` instead of the resolved pair fails here.
  renderCrossfade();
  act(() => setThemeMode('auto'));
  expect(mockWithTiming).not.toHaveBeenCalled();
});

it('dips rather than blanks — the floor is a visible page, not an invisible one', () => {
  // ⚠️ ANTI-REGRESSION FOR THE PRE-FORK REVIEW FIX. `setValue(0)` was what shipped first there;
  // the number is the whole difference between "the app dipped" and "the app blinked out".
  expect(THEME_CROSSFADE_FLOOR).toBeGreaterThan(0);
  expect(THEME_CROSSFADE_FLOOR).toBeLessThan(1);
});
