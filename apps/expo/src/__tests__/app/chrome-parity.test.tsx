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

/**
 * ⚠️ THE CHROME REACHES THE QUERY MODULE SINCE STORY 7-8 — its footer carries `ChromeVerseRow`,
 * whose bookmark and reciter controls read the cache. `useBookmarks` is a real `useQuery`, so
 * without this every render here throws "No QueryClient set" (the app mounts the provider in
 * `app/_layout.tsx`; this file mounts one component). Empty data is the state that matters here:
 * the control INVENTORY is what is compared, and it must be identical on all three platforms
 * with the row drawing nothing.
 */
jest.mock('@/lib/sync', () => ({
  addBookmark: jest.fn(),
  removeBookmark: jest.fn(),
  // `ReciterPicker` (inside the sheet) writes the chosen voice through this.
  patchPreferences: jest.fn(),
  useBookmarks: () => ({ data: [] }),
  usePreferences: () => ({ data: null }),
}));

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

import { act, render, screen } from '@testing-library/react-native';
import { TABS } from '@/constants/navigation';
import type { ChromeReveal } from '@/features/reading';
import { ReadingChrome } from '@/features/reading';
import { useAudioPlayerStore } from '@/stores/audioPlayerStore';

/**
 * The chrome fully revealed, with the animation out of the picture.
 *
 * ⚠️ A COMPLETE LITERAL, ON PURPOSE — a new field on `ChromeReveal` breaks this file until it is
 * added here, which is the reminder that the new field also has to work on every platform.
 * `selectedVerse: null` is the no-selection state, so the inventory below is the chrome's
 * baseline: story 7-8's contextual row draws nothing without a selection or a loaded track.
 */
const REVEALED: ChromeReveal = {
  visible: true,
  interactive: true,
  selectedVerse: null,
  revealFor: () => {},
  clearSelection: () => {},
  keepAlive: () => {},
  holdDwell: () => {},
  toggle: () => {},
  show: () => {},
  headerStyle: {},
  footerStyle: {},
};

/** Every platform the app ships on. Desktop is the web export, so it renders as `web`. */
const PLATFORMS = ['ios', 'android', 'web'] as const;

/**
 * The control inventory of one render: every testID with the chrome- prefix, sorted.
 *
 * ⚠️ `reveal` IS A PARAMETER SINCE STORY 7-8, AND IT HAS TO BE. The baseline literal selects
 * nothing over an idle store, which is precisely the state in which the contextual row draws
 * NOTHING — so pinning only that state would leave all four of its controls outside the parity
 * gate this file claims to enforce, on every platform, forever.
 */
function controlSet(platform: string, reveal: ChromeReveal = REVEALED): string[] {
  mockPlatformOS = platform;
  render(
    <ReadingChrome reveal={reveal} title="Al-Baqarah" mode="reading" onTogglePlay={() => {}} />
  );
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

  it('the SELECTED-verse row is identical on every platform (story 7-8)', () => {
    // The row's verse face: play-from-here and the bookmark, which exist only while an ayah is
    // selected. MUTATION: branch either control on `Platform.OS`.
    const selected: ChromeReveal = { ...REVEALED, selectedVerse: { surah: 2, verse: 255 } };
    const [ios, android, web] = PLATFORMS.map((platform) => controlSet(platform, selected));
    expect(ios).toContain('chrome-verse-play');
    expect(ios).toContain('chrome-verse-bookmark');
    expect(android).toEqual(ios);
    expect(web).toEqual(ios);
  });

  it('the MINI PLAYER is identical on every platform, and the header transport yields to it', () => {
    // ⚠️ TWO TRANSPORTS DREW AT ONCE UNTIL 7-8'S REVIEW, both labelled `playRecitation`. The
    // header's is resume-from-cold; the row's is control-what-is-playing. Exactly one survives —
    // and that has to be true on all three platforms, not only the one anybody looked at.
    act(() => {
      useAudioPlayerStore.getState().setTrack(18, 'alafasy', true);
      useAudioPlayerStore.getState().setPlaybackState('playing');
    });
    const [ios, android, web] = PLATFORMS.map((platform) => controlSet(platform));
    expect(ios).toContain('chrome-reciter');
    expect(ios).toContain('chrome-mini-transport');
    expect(ios).not.toContain('chrome-play-toggle');
    expect(android).toEqual(ios);
    expect(web).toEqual(ios);
    act(() => useAudioPlayerStore.getState().clearPlayback());
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
