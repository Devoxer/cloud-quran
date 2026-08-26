/**
 * `/read` — the immersive route's DOOR, pressed (story 6-0 review).
 *
 * ⚠️ THIS FILE EXISTS BECAUSE NOTHING EXECUTED `app/read.tsx` EITHER. `immersive-route.test.ts`
 * pins where the route lives and how it is registered by reading source text; its case for the way
 * out greps for the two substrings `canGoBack()` and `accessibilityRole="button"`. Demonstrated
 * during the third review pass: changing the no-history branch to `router.replace('/read')` — so
 * the close control returns the reader to the screen they are trying to leave — left 7 suites and
 * 91 tests green, because both substrings still matched. The story's whole thesis is that a
 * chromeless route must ship a way OUT; a grep cannot tell a door from a mirror.
 *
 * Both `canGoBack()` answers are exercised, because they are two different exits and the second is
 * the one a deep link or a direct URL takes.
 */

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn<boolean, []>(() => true);

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    replace: mockReplace,
    canGoBack: () => mockCanGoBack(),
    push: jest.fn(),
    navigate: jest.fn(),
    dismissAll: jest.fn(),
  }),
}));

import { fireEvent, render, screen } from '@testing-library/react-native';
import Read from '@/app/read';
import { HOME_HREF } from '@/constants/navigation';

beforeEach(() => {
  jest.clearAllMocks();
  mockCanGoBack.mockReturnValue(true);
});

describe('the room has a door', () => {
  it('renders exactly one pressable control', () => {
    // `fullScreenModal` has no dismiss gesture and web never had one, so this control is the only
    // exit on every platform. It is a `Pressable` in the RN view tree and NOT a native header
    // slot: a control in the native stack header is drawn perfectly and never receives a mouse
    // click on an Apple-silicon Mac running the iPhone build.
    render(<Read />);
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('goes back when there is history to pop', () => {
    render(<Read />);
    fireEvent.press(screen.getByRole('button'));
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('replaces to the home tab when there is none', () => {
    // A direct URL load or a deep link has nothing to pop. ⚠️ The target is `HOME_HREF` and NOT
    // `/`: `/` is itself a redirect that pops the root stack, so routing the exit through it means
    // leaving a chromeless screen for a blank one while a queued pop settles.
    mockCanGoBack.mockReturnValue(false);
    render(<Read />);
    fireEvent.press(screen.getByRole('button'));
    expect(mockReplace).toHaveBeenCalledWith(HOME_HREF);
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('never sends the reader back to the screen they are leaving', () => {
    // The mutation that passed every gate: `router.replace('/read')` in the no-history branch.
    mockCanGoBack.mockReturnValue(false);
    render(<Read />);
    fireEvent.press(screen.getByRole('button'));
    for (const call of mockReplace.mock.calls) expect(call[0]).not.toBe('/read');
  });
});
