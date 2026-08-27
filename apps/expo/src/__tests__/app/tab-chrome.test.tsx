/**
 * The tab bar's theming, asserted where it is actually decided (story 6-0; re-aimed at OUR
 * `AppTabBar` by story 6-6, which deleted the `<NativeTabs>` layout this file used to capture).
 *
 * ⚠️ THIS FILE EXISTS BECAUSE THE CONTRAST GATE DOES NOT GUARD THE CODE, AND CANNOT.
 * `constants/palettes.contrast.test.ts` imports the palettes and the colour helpers; it never
 * loads the component. Under `NativeTabs`, deleting the selected-label colour left all sixty of
 * its cases green while the accent shipped as ~12sp text on a 3.07:1 pair — demonstrated, not
 * supposed. What the palette gate can prove is that a colour is LEGIBLE; what only a render can
 * prove is that the colour is the one SHIPPED. So every case here renders the real component and
 * asserts the RESOLVED colour.
 *
 * ⚠️ IT DRIVES THE PALETTE AND THE SCHEME, BECAUSE OTHERWISE IT PROVES ONE OF TWELVE. `jest.setup`
 * mocks `@/lib/theme` to a fixed terracotta·light for every component test; the real hook is
 * unmocked below and pointed at each palette × scheme through the same MMKV keys the settings
 * picker writes, so the component resolves them exactly as it does on a device.
 *
 * ⚠️ THE PLATFORM AXIS IS DELIBERATELY STILL HERE, AND WHAT IT PROVES CHANGED. Under `NativeTabs`
 * each platform got a different SURFACE group (iOS kept Liquid Glass). Under our chrome there is
 * no platform branch to configure — the same component paints `background.secondary` everywhere,
 * iOS included — so the three platform renders prove the ABSENCE of divergence: every colour
 * resolves identically under each `Platform.OS`. (Module resolution stays the iOS preset's, so
 * the icon renderer is the SF-symbol frame on all three — the COLOUR passed to it is what is
 * asserted, and that value is platform-independent by construction.)
 */

let mockPlatformOS = 'ios';

jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');
  // A proxy rather than a spread, for the reason `sign-in-parity.test.tsx` documents: spreading
  // react-native READS every export and the deprecation getters among them warn on import.
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

// Exercise the REAL theme hook, not jest.setup's fixed-light stand-in — see the header.
jest.unmock('@/lib/theme');

const mockNavigate = jest.fn();
let mockSegments: string[] = ['(tabs)'];

jest.mock('expo-router', () => ({
  useRouter: () => ({
    navigate: mockNavigate,
    back: jest.fn(),
    replace: jest.fn(),
    push: jest.fn(),
    canGoBack: () => false,
  }),
  useSegments: () => mockSegments,
}));

import { render, screen } from '@testing-library/react-native';
import { AppTabBar, TAB_INDICATOR_ALPHA } from '@/components/ui/AppTabBar';
import { type ColorScheme, type ColorTokens, composeColors } from '@/constants/Colors';
import { TABS } from '@/constants/navigation';
import { PALETTE_NAMES, type PaletteName } from '@/constants/palettes';
import { withAlpha } from '@/lib/color';
import { setPalette, setThemeMode } from '@/lib/theme';

const PLATFORMS = ['ios', 'android', 'web'] as const;
const SCHEMES: readonly ColorScheme[] = ['light', 'dark'];

/** Every palette × scheme — the twelve slices the chrome must hold on. */
const SLICES: readonly (readonly [PaletteName, ColorScheme])[] = PALETTE_NAMES.flatMap((palette) =>
  SCHEMES.map((scheme) => [palette, scheme] as const)
);

/** Every platform × palette × scheme. */
const COMBOS: readonly (readonly [string, PaletteName, ColorScheme])[] = PLATFORMS.flatMap((os) =>
  SLICES.map(([palette, scheme]) => [os, palette, scheme] as const)
);

function renderAs(os: string, palette: PaletteName, scheme: ColorScheme) {
  mockPlatformOS = os;
  // The two MMKV keys the settings picker writes. `setThemeMode` with an explicit scheme (rather
  // than 'auto') is what makes the dark slice reachable at all: `useColorScheme()` answers
  // `light` under jest-expo, so an 'auto' preference can only ever resolve light here.
  setPalette(palette);
  setThemeMode(scheme);
  // The read tab focused, so `index` (the first tab) is the UNSELECTED reference and `read` the
  // selected one — both states observable in one render.
  mockSegments = ['(tabs)', 'read'];
  render(<AppTabBar />);
}

/** Flattened style object of one node. */
function styleOf(testID: string): Record<string, unknown> {
  const style = screen.getByTestId(testID).props.style;
  const flat = (Array.isArray(style) ? style.flat(3) : [style]).filter(Boolean);
  return Object.assign({}, ...flat.map((s: unknown) => (typeof s === 'object' ? s : {})));
}

/** The colour the tab's ICON actually receives (the SF-symbol element inside the frame). */
function iconColorOf(tabName: string): unknown {
  const frame = screen.getByTestId(`chrome-tab-${tabName}-icon`);
  const symbol = (frame.props as { children: { props: { tintColor?: unknown } } }).children;
  return symbol.props.tintColor;
}

/** Flattened style of the LABEL inside one tab item. */
function labelStyleOf(label: string): Record<string, unknown> {
  const node = screen.getByText(label);
  const flat = (Array.isArray(node.props.style) ? node.props.style.flat(3) : [node.props.style])
    .filter(Boolean)
    .map((s: unknown) => (typeof s === 'object' ? s : {}));
  return Object.assign({}, ...flat);
}

afterEach(() => {
  jest.clearAllMocks();
  mockPlatformOS = 'ios';
  mockSegments = ['(tabs)'];
});

describe.each(COMBOS)('tab chrome on %s · %s · %s', (os, palette, scheme) => {
  const t: ColorTokens = composeColors(palette, scheme);

  it('never resolves the selected label to the accent', () => {
    // THE REGRESSION `NativeTabs` shipped once: the accent as ~12sp text over the selection pill
    // is 3.07:1 on terracotta·light, and terracotta's accent is byte-locked. Stated as the thing
    // that must not happen, then as the thing that must.
    renderAs(os, palette, scheme);
    const label = labelStyleOf('Read');
    expect(label.color).not.toBe(t.accent.primary);
    expect(label.color).toBe(t.text.primary);
  });

  it('gives the unselected label the secondary text token', () => {
    renderAs(os, palette, scheme);
    expect(labelStyleOf('Mushaf').color).toBe(t.text.secondary);
  });

  it('tints the selected icon with the accent — the selection cue that only needs 3:1', () => {
    // This case is also what proves the palette × scheme actually reached the component — if the
    // driving above stopped working, every colour would resolve to terracotta·light and this
    // reddens on eleven slices.
    renderAs(os, palette, scheme);
    expect(iconColorOf('read')).toBe(t.accent.primary);
    expect(iconColorOf('index')).toBe(t.text.secondary);
  });

  it('paints the bar surface and the selection pill from the tokens — iOS included', () => {
    // ⚠️ The old iOS exception (leave the surface to Liquid Glass) died with the native bar:
    // OUR bar paints `background.secondary` on every platform, which is the surface the
    // contrast gate measures the labels against.
    renderAs(os, palette, scheme);
    expect(styleOf('app-tab-bar').backgroundColor).toBe(t.background.secondary);
    expect(styleOf('chrome-tab-read-pill').backgroundColor).toBe(
      withAlpha(t.accent.primary, TAB_INDICATOR_ALPHA)
    );
    expect(styleOf('chrome-tab-index-pill').backgroundColor).toBeUndefined();
  });
});

describe('the control set is the table, on every slice', () => {
  it('renders one tab per TABS entry, in table order', () => {
    renderAs('ios', 'terracotta', 'light');
    for (const tab of TABS) {
      expect(screen.getByTestId(`chrome-tab-${tab.name}`)).toBeTruthy();
    }
    expect(screen.getAllByRole('tab')).toHaveLength(TABS.length);
  });

  it('marks exactly one tab selected, via accessibilityState', () => {
    renderAs('ios', 'terracotta', 'light');
    const selected = screen
      .getAllByRole('tab')
      .filter((node) => node.props.accessibilityState?.selected === true);
    expect(selected).toHaveLength(1);
  });
});
