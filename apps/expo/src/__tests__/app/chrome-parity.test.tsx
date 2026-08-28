/**
 * CHROME PARITY — story 6-6's one hard rule, asserted on every platform.
 *
 * ⚠️ "SAME COMPONENTS, SAME CONTROLS, EVERY PLATFORM" IS THE KIND OF RULE THAT DECAYS ONE
 * `Platform.OS` AT A TIME — the sign-in screen already lived that failure (`sign-in-parity`),
 * and this file is that test's shape aimed at the chrome: render it as each platform and count
 * what exists, in both directions. A platform branch may change safe-area VALUES; it may never
 * remove a control.
 *
 * The chrome is rendered through `ReadingChrome` (which mounts `AppHeader` + `AppTabBar` and
 * adds the mode toggle) with a hand-built revealed state, so what is compared is the full
 * control inventory: back, mode toggle, tab items.
 */

let mockPlatformOS = 'ios';

jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');
  // A proxy rather than a spread: spreading react-native READS every export, and the deprecation
  // getters among them warn and drag the list-virtualisation stack in before a test can run.
  return new Proxy(actual, {
    get(target, prop, receiver) {
      if (prop === 'Platform') {
        return new Proxy(target.Platform, {
          get: (p: object, key: string | symbol) =>
            key === 'OS' ? mockPlatformOS : Reflect.get(p, key),
        });
      }
      return Reflect.get(target, prop, receiver);
    },
  });
});

const mockCanGoBack = jest.fn<boolean, []>(() => true);

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: jest.fn(),
    navigate: jest.fn(),
    replace: jest.fn(),
    push: jest.fn(),
    canGoBack: () => mockCanGoBack(),
  }),
  useSegments: () => ['(tabs)', 'read'],
}));

import { render, screen } from '@testing-library/react-native';
import { TABS } from '@/constants/navigation';
import type { ChromeReveal } from '@/features/reading';
import { ReadingChrome } from '@/features/reading';

/** The chrome fully revealed, with the animation out of the picture. */
const REVEALED: ChromeReveal = {
  visible: true,
  interactive: true,
  toggle: () => {},
  show: () => {},
  headerStyle: {},
  footerStyle: {},
};

/** Every platform the app ships on. Desktop is the web export, so it renders as `web`. */
const PLATFORMS = ['ios', 'android', 'web'] as const;

/** The control inventory of one render: every testID with the chrome- prefix, sorted. */
function controlSet(platform: string): string[] {
  mockPlatformOS = platform;
  render(<ReadingChrome reveal={REVEALED} title="Al-Baqarah" mode="reading" />);
  const ids = new Set<string>();
  for (const role of ['button', 'tab'] as const) {
    for (const node of screen.queryAllByRole(role)) {
      if (typeof node.props.testID === 'string') ids.add(node.props.testID);
    }
  }
  screen.unmount();
  return [...ids].sort();
}

afterEach(() => {
  mockPlatformOS = 'ios';
  mockCanGoBack.mockReturnValue(true);
});

describe('every platform renders the identical control set', () => {
  it('iOS, Android and web agree — in both directions', () => {
    const [ios, android, web] = PLATFORMS.map((platform) => controlSet(platform));
    expect(android).toEqual(ios);
    expect(web).toEqual(ios);
  });

  it('…and that set is the real inventory, not an empty agreement', () => {
    // Anti-vacuity: three empty sets are also "equal". The inventory must contain the back
    // control, the mode toggle, the title's index entry (story 6-3), and one item per TABS entry.
    const ios = controlSet('ios');
    expect(ios).toContain('chrome-back');
    expect(ios).toContain('chrome-mode-toggle');
    expect(ios).toContain('chrome-title-entry');
    for (const tab of TABS) {
      expect(ios).toContain(`chrome-tab-${tab.name}`);
    }
    expect(ios.length).toBeGreaterThanOrEqual(3 + TABS.length);
  });

  it('the history-conditional back is conditional IDENTICALLY on every platform', () => {
    mockCanGoBack.mockReturnValue(false);
    for (const platform of PLATFORMS) {
      const set = controlSet(platform);
      expect(set).not.toContain('chrome-back');
      // The rest of the inventory is unchanged — absence of history removes ONE control.
      expect(set).toContain('chrome-mode-toggle');
    }
  });
});
