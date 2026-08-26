/**
 * The tab bar's theming, asserted where it is actually decided (story 6-0).
 *
 * ⚠️ THIS FILE EXISTS BECAUSE THE CONTRAST GATE DOES NOT GUARD THE CODE, AND CANNOT.
 * `constants/palettes.contrast.test.ts` imports the palettes and the colour helpers; it never
 * loads this layout. Deleting `labelStyle.selected` — the prop whose whole purpose is to keep the
 * selected label off a 3.07:1 pair — left all sixty of its cases green, the full app suite green,
 * and every lint gate OK. Demonstrated, not supposed. What the palette can prove is that a colour
 * is legible; what only a render can prove is that the colour is the one shipped.
 *
 * ⚠️ THE UPSTREAM FALLBACK IS THE WHOLE DEFECT, AND IT IS INVISIBLE FROM THE PROPS WE PASS.
 * `NativeBottomTabsNavigator` derives `selectedLabelStyle = { color: tintColor }` whenever
 * `tintColor` is set and no selected label colour is given, and `appearance.ios.ts` writes it into
 * the UITabBarAppearance unconditionally. So "we did not set a selected label colour" does not
 * mean the platform default applies — it means the ACCENT applies. That is why the assertions
 * below resolve the selected colour the way upstream does rather than merely checking a prop is
 * present.
 *
 * The three platforms differ only in the SURFACE group — the reasons are in the layout's own
 * docblock — so each is rendered and asserted separately. iOS is the case that regressed once
 * already: `labelStyle` was gated to android||web, which left iOS shipping the accent label.
 *
 * ⚠️ IT DRIVES THE PALETTE AND THE SCHEME, BECAUSE OTHERWISE IT PROVES ONE OF TWELVE. `jest.setup`
 * mocks `@/lib/theme` to a fixed terracotta·light for every component test, so an earlier cut of
 * this file rendered that one slice thirty-six times and its dark branch was dead code — the story
 * claims the chrome "holds on all six palettes", and nothing here was in a position to say so.
 * The real hook is unmocked below and pointed at each palette × scheme through the same MMKV keys
 * the settings picker writes, so the layout resolves them exactly as it does on a device.
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

/**
 * Capture the props `<NativeTabs>` receives, the way `root-layout-boot.test.tsx` captures the
 * root `<Stack>`. The real component is a `react-native-screens` host that renders an inert shell
 * under jest-expo — it would tell us nothing about what was passed to it.
 */
const capturedProps: { current: Record<string, unknown> | null } = { current: null };

jest.mock('expo-router/unstable-native-tabs', () => {
  const NativeTabs = (props: Record<string, unknown>) => {
    capturedProps.current = props;
    return null;
  };
  const Trigger = Object.assign(() => null, { Icon: () => null, Label: () => null });
  return { NativeTabs: Object.assign(NativeTabs, { Trigger }) };
});

import { render } from '@testing-library/react-native';
import TabLayout from '@/app/(tabs)/_layout';
import { type ColorScheme, type ColorTokens, composeColors } from '@/constants/Colors';
import { PALETTE_NAMES, type PaletteName } from '@/constants/palettes';
import { withAlpha } from '@/lib/color';
import { setPalette, setThemeMode } from '@/lib/theme';

const PLATFORMS = ['ios', 'android', 'web'] as const;
const SCHEMES: readonly ColorScheme[] = ['light', 'dark'];

/** Every palette × scheme — the twelve slices the story claims the chrome holds on. */
const SLICES: readonly (readonly [PaletteName, ColorScheme])[] = PALETTE_NAMES.flatMap((palette) =>
  SCHEMES.map((scheme) => [palette, scheme] as const)
);

/** Every platform × palette × scheme. */
const COMBOS: readonly (readonly [string, PaletteName, ColorScheme])[] = PLATFORMS.flatMap((os) =>
  SLICES.map(([palette, scheme]) => [os, palette, scheme] as const)
);

function renderAs(os: string, palette: PaletteName, scheme: ColorScheme): Record<string, unknown> {
  mockPlatformOS = os;
  // The two MMKV keys the settings picker writes. `setThemeMode` with an explicit scheme (rather
  // than 'auto') is what makes the dark slice reachable at all: `useColorScheme()` answers `light`
  // under jest-expo, so an 'auto' preference can only ever resolve light here.
  setPalette(palette);
  setThemeMode(scheme);
  capturedProps.current = null;
  render(<TabLayout />);
  if (!capturedProps.current) throw new Error(`NativeTabs never rendered on ${os}`);
  return capturedProps.current;
}

/**
 * The colour the SELECTED label resolves to, computed the way `NativeBottomTabsNavigator` does:
 *
 *   selectedLabelStyle = processedLabelStyle.selected
 *     ? { ...selected, color: selected.color ?? tintColor }
 *     : tintColor ? { color: tintColor } : undefined
 *
 * ⚠️ THERE IS NO FALL-THROUGH FROM THE DEFAULT LABEL STYLE, AND AN EARLIER VERSION OF THIS HELPER
 * INVENTED ONE. `utils/label.js`'s `convertLabelStylePropToObject` maps a FLAT `labelStyle` onto
 * `default` only, so a flat style never contributes to the selected colour — it falls through to
 * `tintColor`, i.e. to the accent. A `?? default?.color` link in here would report that shape as
 * shipping a legible colour while the device shipped the 3.07:1 pair. Mirror upstream exactly or
 * the helper is a second, wrong implementation of the thing under test.
 */
function resolvedSelectedLabelColor(props: Record<string, unknown>): unknown {
  const raw = props.labelStyle as
    | { color?: unknown; default?: { color?: unknown }; selected?: { color?: unknown } }
    | undefined;
  const keyed = raw && typeof raw === 'object' && ('default' in raw || 'selected' in raw);
  const selected = keyed ? raw?.selected : undefined;
  return selected ? (selected.color ?? props.tintColor) : props.tintColor;
}

describe.each(COMBOS)('tab chrome on %s · %s · %s', (os, palette, scheme) => {
  const t: ColorTokens = composeColors(palette, scheme);

  it('never resolves the selected label to the accent', () => {
    // THE REGRESSION, stated as the thing that must not happen rather than as a prop that must be
    // present — a future refactor that renames the prop but keeps the fallback fails here too.
    const props = renderAs(os, palette, scheme);
    expect(resolvedSelectedLabelColor(props)).not.toBe(t.accent.primary);
    expect(resolvedSelectedLabelColor(props)).toBe(t.text.primary);
  });

  it('gives the unselected label the secondary text token', () => {
    const props = renderAs(os, palette, scheme);
    const label = props.labelStyle as { default?: { color?: unknown } };
    expect(label?.default?.color).toBe(t.text.secondary);
  });

  it('tints the selected icon with the accent', () => {
    // The accent is still the selection cue; it just stops being small text. This case is also
    // what proves the palette × scheme actually reached the layout — if the driving above stopped
    // working, every colour would resolve to terracotta·light and this reddens on eleven slices.
    const props = renderAs(os, palette, scheme);
    expect(props.tintColor).toBe(t.accent.primary);
  });

  it('takes every colour from a palette token — no literals', () => {
    const props = renderAs(os, palette, scheme);
    const known = new Set<unknown>([
      t.accent.primary,
      t.text.primary,
      t.text.secondary,
      t.background.secondary,
      withAlpha(t.accent.primary, 0.15),
    ]);
    const colours = [
      props.tintColor,
      props.backgroundColor,
      props.iconColor,
      props.indicatorColor,
      props.rippleColor,
      (props.labelStyle as { default?: { color?: unknown } })?.default?.color,
      (props.labelStyle as { selected?: { color?: unknown } })?.selected?.color,
    ].filter((c) => c !== undefined);
    for (const colour of colours) expect(known.has(colour)).toBe(true);
  });
});

describe.each(SLICES)('the SURFACE group — the only platform-varying part · %s · %s', (p, s) => {
  const t: ColorTokens = composeColors(p, s);

  it('themes the web pill — the case that was absent, not merely unverified', () => {
    // expo-router's web CSS falls back to hardcoded greys (`#272727` pill, `#444444` selected
    // pill) when these vars are unset, so gating them to Android left every palette rendering the
    // same dark-grey pill on web. Both props reach the web view through the SCREEN options.
    // ⚠️ Theming it also removed the only thing separating the pill from the page — `#272727` was
    // ~14:1 against a light page and `background.secondary` is 1.11–1.24:1 — which is why
    // `app/+html.tsx` now draws a border. `web-nav-pill.test.ts` holds that half.
    const props = renderAs('web', p, s);
    expect(props.backgroundColor).toBe(t.background.secondary);
    expect(props.indicatorColor).toBe(withAlpha(t.accent.primary, 0.15));
  });

  it('themes the Android Material bar, ripple and all', () => {
    const props = renderAs('android', p, s);
    expect(props.backgroundColor).toBe(t.background.secondary);
    expect(props.iconColor).toBe(t.text.secondary);
    expect(props.indicatorColor).toBe(withAlpha(t.accent.primary, 0.15));
    expect(props.rippleColor).toBe(withAlpha(t.accent.primary, 0.15));
  });

  it('leaves the iOS SURFACE alone — Liquid Glass is the point of keeping native chrome', () => {
    // ⚠️ The narrow claim, and the one the earlier gate over-applied: the surface stays system,
    // the LABEL does not. Setting `backgroundColor` here kills the iOS 26 material; setting a
    // label colour does not, and leaving it unset is what shipped the accent label.
    const props = renderAs('ios', p, s);
    expect(props.backgroundColor).toBeUndefined();
    expect(props.iconColor).toBeUndefined();
    expect(props.rippleColor).toBeUndefined();
    expect(props.labelStyle).toBeDefined();
  });
});

describe('the iPad', () => {
  it('adapts to the sidebar', () => {
    expect(renderAs('ios', 'terracotta', 'light').sidebarAdaptable).toBe(true);
  });
});
