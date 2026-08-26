/**
 * `/` — the app's front door, RENDERED (story 6-0 review).
 *
 * ⚠️ THIS FILE EXISTS BECAUSE NOTHING EXECUTED `app/index.tsx`. `route-integrity.test.ts` reads
 * the route tree off the FILESYSTEM and greps the file's source for a forbidden string; neither
 * loads the module. Demonstrated during the third review pass: replacing the whole effect body
 * with a bare `router.replace(home)` — the spelling the file's own docblock records as MEASURED
 * WRONG, because it leaves a phantom back chevron on the app's most common entry — left 7 suites
 * and 91 tests green. So did DELETING the effect outright, which is a front door that redirects
 * nowhere. A redirect is behaviour, and behaviour needs a render.
 *
 * The router is mocked rather than driven through `expo-router`'s test harness: what this screen
 * decides is *which* navigation call it makes, and the harness would answer a different question
 * (whether expo-router implements POP_TO_TOP), one that belongs upstream.
 */

const mockDismissAll = jest.fn();
const mockReplace = jest.fn();
const mockNavigate = jest.fn();
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    dismissAll: mockDismissAll,
    replace: mockReplace,
    navigate: mockNavigate,
    push: mockPush,
    back: jest.fn(),
    canGoBack: jest.fn(() => false),
    canDismiss: jest.fn(() => false),
  }),
}));

import { act, render } from '@testing-library/react-native';
import Index from '@/app/index';
import { HOME_HREF } from '@/constants/navigation';

/** Comfortably past the screen's own `POP_SETTLE_MS`. */
const PAST_SETTLE_MS = 1000;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('the front door pops to the tab shell', () => {
  it('calls dismissAll on mount — not replace, and not navigate', () => {
    // ⚠️ ALL THREE ALTERNATIVES ARE MEASURED-WRONG, not merely different. `<Redirect>` and a bare
    // `replace` both leave `[(tabs), (tabs)+params]` and `navigate` PUSHES a third entry, so every
    // one of them lands on the home tab with `canGoBack() === true` and a back chevron the same
    // screen does not draw when it is loaded directly.
    render(<Index />);
    expect(mockDismissAll).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('paints nothing — the pre-hydration body colour is +html.tsx’s job', () => {
    // A prerendered screen here could only emit the terracotta default, because the palette and
    // the light/dark override are device-local MMKV values; it would flash the wrong palette at
    // every reader who picked another one. See the route's docblock.
    expect(render(<Index />).toJSON()).toBeNull();
  });
});

describe('the fallback fires on an OBSERVABLE condition', () => {
  it('replaces to the home tab when the pop never lands', () => {
    // ⚠️ THE `try`/`catch` THIS REPLACED WAS DEAD CODE. `dismissAll()` is
    // `routingQueue.add({ type: 'POP_TO_TOP' })` — no `assertIsReady()`, and the dispatch happens
    // later, outside any `try` — so it cannot throw, and in the one state the catch claimed to
    // guard (this screen the only route, nothing to pop) the action is dropped as unhandled and a
    // `null`-rendering screen becomes a permanently blank front door. Staying mounted IS the
    // observation: a landed pop unmounts this component.
    render(<Index />);
    act(() => jest.advanceTimersByTime(PAST_SETTLE_MS));
    expect(mockReplace).toHaveBeenCalledWith(HOME_HREF);
  });

  it('does NOT replace when the pop lands and the screen unmounts', () => {
    // The normal path, and the anti-vacuity half of the case above: if the fallback fired
    // unconditionally it would ship exactly the phantom-back-chevron defect `dismissAll` avoids.
    render(<Index />).unmount();
    act(() => jest.advanceTimersByTime(PAST_SETTLE_MS));
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('never targets the immersive route', () => {
    // Launching straight into a screen presented OVER the tabs, with nothing beneath it, is the
    // "cold launch restores an empty player sheet" defect the source app already shipped once.
    // `route-integrity.test.ts` asserts the same thing over the source; this asserts the value
    // that is actually passed, which survives a refactor that stops writing the path literally.
    render(<Index />);
    act(() => jest.advanceTimersByTime(PAST_SETTLE_MS));
    for (const call of mockReplace.mock.calls) expect(call[0]).not.toBe('/read');
  });
});
