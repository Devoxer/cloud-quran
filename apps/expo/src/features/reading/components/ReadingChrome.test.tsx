/**
 * The chrome: ONE driver, an overlay that shifts nothing, and — since story 6-6 — the app's own
 * header and TAB BAR riding that driver together.
 *
 * ⚠️ THE ONE-DRIVER CASE IS STRUCTURAL, AND THE DOCBLOCK SAYS SO RATHER THAN IMPLYING MORE. What
 * `chrome-render-storm`'s second half actually was: the header faded over 250ms while the tab bar
 * flipped opacity with NO animation, because it was hidden with `display: 'none'` and a display
 * flip cannot animate. Two mechanisms. Reanimated runs its animations on the UI thread and Jest
 * observes an animated style as an opaque descriptor object, so "both bars interpolated in step"
 * is not a fact any renderer here can see — the device smoke is what proves it. What CAN be
 * pinned, and is the regression, is that there is exactly one `useSharedValue` and one
 * `withTiming` in the whole feature PLUS the two chrome components it mounts, so there is nothing
 * for a second speed to come from. ⚠️ Story 6-6 made this count REACH `components/ui/AppHeader`
 * and `AppTabBar` too: the tab bar now rides the reveal, so a driver inside the component itself
 * would be exactly the pre-fork defect rebuilt, one directory over from where the old count
 * looked.
 *
 * ⚠️ THE CHROME STARTS HIDDEN, so almost every case here reveals it first. That is not ceremony:
 * a dismissed bar is hidden from the ACCESSIBILITY tree as well as from touch, and RNTL models
 * the accessibility tree — a query that finds a control without revealing it is a query a
 * VoiceOver user's swipe would also find, which is the defect.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

const mockBack = jest.fn();
const mockNavigate = jest.fn();
const mockPush = jest.fn();
const mockCanGoBack = jest.fn<boolean, []>(() => true);

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    navigate: mockNavigate,
    replace: jest.fn(),
    push: mockPush,
    canGoBack: () => mockCanGoBack(),
  }),
  useSegments: () => ['(tabs)', 'read'],
}));

import { HOME_HREF, READ_HREF } from '@/constants/navigation';
import { useChromeReveal } from '../hooks/useChromeReveal';
import { ReadingChrome, type ReadingChromeProps } from './ReadingChrome';

/** A host that owns the reveal hook, so a tap drives the real state the screen would. */
function Harness({
  title = 'Al-Baqarah',
  mode = 'reading',
}: {
  title?: string | null;
  mode?: ReadingChromeProps['mode'];
}) {
  const reveal = useChromeReveal();
  return (
    <>
      <Pressable testID="surface" onPress={reveal.toggle}>
        <Text>surface</Text>
      </Pressable>
      <ReadingChrome reveal={reveal} title={title} mode={mode} />
    </>
  );
}

/** Bars are hidden from BOTH trees when dismissed, so structural queries have to opt in. */
const ANY = { includeHiddenElements: true } as const;

/** Every tab the bar carries, as an EXPLICIT list — four since 6-4's Bookmarks. Deliberately
 *  not derived from `TABS`: a test that maps the same table the component maps cannot notice a
 *  tab going missing from it. */
const TAB_IDS = [
  'chrome-tab-index',
  'chrome-tab-read',
  'chrome-tab-bookmarks',
  'chrome-tab-(profile)',
] as const;

/** Flattened style of one element, as an object. */
function styleOf(testID: string): Record<string, unknown> {
  const style = screen.getByTestId(testID, ANY).props.style;
  const flat = (Array.isArray(style) ? style.flat(3) : [style]).filter(Boolean);
  return Object.assign({}, ...flat.map((s: unknown) => (typeof s === 'object' ? s : {})));
}

/** The bar's touch state: `'none'` while dismissed OR while still fading in. */
function touchesOf(testID: string): unknown {
  return screen.getByTestId(testID, ANY).props.pointerEvents;
}

/** Tap the surface and wait for the reveal to settle — which is when the bars become usable. */
async function reveal() {
  fireEvent.press(screen.getByTestId('surface'));
  await waitFor(() => expect(touchesOf('reading-chrome-header')).toBe('box-none'));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCanGoBack.mockReturnValue(true);
});

describe('one driver', () => {
  /**
   * Every source file the revealed chrome is built from, comment-stripped. Tests excluded.
   * ⚠️ The feature directory AND the two shared chrome components — see the file header.
   */
  function chromeSources(): string {
    const out: string[] = [];
    const read = (full: string) =>
      out.push(
        readFileSync(full, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/^\s*\/\/.*$/gm, '')
      );
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        // ⚠️ THE BANNER IS THE ONE DOCUMENTED EXCLUSION, BY FILENAME (story 6-3). It is NOT
        // chrome: a transient notice with its own lifecycle (4s, or the first page move) that
        // must never ride the reveal — so its fade is legitimately its own driver. Excluding
        // this ONE file keeps the count fail-closed for every other file in the walk; raising
        // the count to 2 instead would let a second CHROME driver hide behind the banner's
        // allowance. The companion case below proves the banner never touches `useChromeReveal`.
        else if (entry.name === 'WelcomeBackBanner.tsx') continue;
        else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) read(full);
      }
    };
    walk(join(__dirname, '..'));
    const ui = join(__dirname, '..', '..', '..', 'components', 'ui');
    read(join(ui, 'AppHeader.tsx'));
    read(join(ui, 'AppTabBar.tsx'));
    return out.join('\n');
  }

  it('the feature plus both chrome components hold exactly ONE shared value and ONE withTiming', () => {
    // MUTATION: give the tab bar its own driver. It type-checks, it lints, it renders — and it
    // is the defect. Counted by WALKING the feature directory plus the two components, so a
    // second driver cannot hide in a file this case forgot to list.
    const all = chromeSources();
    expect(all.match(/useSharedValue\(/g)).toHaveLength(1);
    expect(all.match(/withTiming\(/g)).toHaveLength(1);
  });

  it('the walk really covers the chrome, not two files', () => {
    // Anti-vacuity for the case above: a walk that found nothing would also count zero, and a
    // walk that found only the hook would count one and pass for the wrong reason.
    const all = chromeSources();
    expect(all).toMatch(/export function ReadingChrome/);
    expect(all).toMatch(/export function useChromeReveal/);
    expect(all).toMatch(/export function useSurah/);
    expect(all).toMatch(/export function AppHeader/);
    expect(all).toMatch(/export function AppTabBar/);
  });

  it('both animated styles come off that one value', () => {
    // Anti-vacuity for the counts above: one shared value used by one bar, with the other bar
    // toggled some other way, would also count 1. Two `useAnimatedStyle` bodies, both naming
    // `progress`, is what makes the single count mean "shared".
    const hook = source('hooks/useChromeReveal.ts');
    expect(hook.match(/useAnimatedStyle\(/g)).toHaveLength(2);
    expect(hook.match(/progress\.value/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it('the excluded banner never touches the reveal — and really has the driver the exclusion excuses', () => {
    // Both directions of the exclusion's honesty: the banner must not import the chrome's
    // driver (riding the reveal would summon it on every chrome tap), and it must actually
    // CONTAIN its own — an exclusion excusing nothing would mean the walk skips a file that
    // could later gain a second chrome driver unnoticed.
    const banner = source('components/WelcomeBackBanner.tsx');
    expect(banner).not.toMatch(/useChromeReveal/);
    expect(banner).toMatch(/withTiming\(/);
  });

  it('takes its duration and easing from the tokens, never inline', () => {
    const hook = source('hooks/useChromeReveal.ts');
    expect(hook).toMatch(/duration:\s*DURATIONS\./);
    expect(hook).toMatch(/easing:\s*EASINGS\.standard/);
    expect(hook).not.toMatch(/duration:\s*\d/);
    expect(hook).not.toMatch(/Easing\./);
  });

  it('never hides a bar by unmounting it or by `display`', () => {
    // `display: 'none'` is precisely what made the pre-fork tab bar unanimatable, and unmounting
    // leaves the reveal with nothing to fade FROM.
    const chrome = source('components/ReadingChrome.tsx');
    expect(chrome).not.toMatch(/display:/);
    expect(chrome).not.toMatch(/\{\s*reveal\.visible\s*&&/);
  });
});

/** One feature file, comment-stripped. */
const source = (...segments: string[]) =>
  readFileSync(join(__dirname, '..', ...segments), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

describe('it overlays; it never occupies layout', () => {
  it('positions both bar slots absolutely', () => {
    render(<Harness />);
    expect(styleOf('reading-chrome-header')).toMatchObject({ position: 'absolute', top: 0 });
    expect(styleOf('reading-chrome-footer')).toMatchObject({ position: 'absolute', bottom: 0 });
  });

  it('keeps both bars mounted and the same size through a toggle', async () => {
    // The acceptance criterion is "page content does not shift". The bars are what could shift
    // it, so their box must not change — only opacity and a transform, which are the two things
    // that cost no layout.
    render(<Harness />);
    const before = [styleOf('app-header'), styleOf('app-tab-bar')];
    await reveal();
    const after = [styleOf('app-header'), styleOf('app-tab-bar')];
    for (const [b, a] of [
      [before[0], after[0]],
      [before[1], after[1]],
    ]) {
      expect(a.height).toBe(b.height);
    }
    expect(screen.getByTestId('reading-chrome-header', ANY)).toBeTruthy();
    expect(screen.getByTestId('reading-chrome-footer', ANY)).toBeTruthy();
  });

  it('starts dismissed, and a dismissed bar takes no taps', () => {
    // ⚠️ THE STARTING STATE IS THE FROZEN ONE: "given the reading screen, when it renders, then
    // it is immersive". It shipped starting REVEALED for one round; the answer was giving the
    // tap back a surface (see the reading screens' `Gesture.Tap()`), not moving the intent.
    render(<Harness />);
    expect(touchesOf('reading-chrome-header')).toBe('none');
    expect(touchesOf('reading-chrome-footer')).toBe('none');
  });

  it('takes taps again once revealed — and only as `box-none`', async () => {
    // ⚠️ `box-none`, NOT `auto`. The bars are 56pt bands across the top and bottom of a SCROLLING
    // surface; with `auto` the bar itself is a touch target, so a drag that starts inside those
    // bands is swallowed and the list does not scroll. `box-none` gives touches to the CHILDREN —
    // the controls — and lets everything else fall through to the reading surface.
    render(<Harness />);
    await reveal();
    expect(touchesOf('reading-chrome-header')).toBe('box-none');
    expect(touchesOf('reading-chrome-footer')).toBe('box-none');
    // The inner bars must pass through too — an `auto` bar inside a `box-none` wrapper is the
    // same dead zone, one level down.
    expect(screen.getByTestId('app-header').props.pointerEvents).toBe('box-none');
    expect(screen.getByTestId('app-tab-bar').props.pointerEvents).toBe('box-none');
  });

  it('stops taking taps on the LEADING edge of a dismissal', async () => {
    render(<Harness />);
    await reveal();
    fireEvent.press(screen.getByTestId('surface'));
    expect(touchesOf('reading-chrome-header')).toBe('none');
    expect(touchesOf('reading-chrome-footer')).toBe('none');
  });

  it('does NOT take taps while it is still fading in', () => {
    // ⚠️ THE OTHER HALF. The reveal runs for `DURATIONS.standard`; keying `pointerEvents` on
    // `visible` makes the controls live and ~transparent for that whole window, so a second tap
    // landing in the header strip 100ms after the first would press an invisible control.
    render(<Harness />);
    fireEvent.press(screen.getByTestId('surface'));
    expect(touchesOf('reading-chrome-header')).toBe('none');
    expect(screen.queryByTestId('chrome-mode-toggle')).toBeNull();
  });

  it('hides a dismissed bar from the accessibility tree, not just from touch', async () => {
    // `pointerEvents` reasons about the TOUCH tree only. A screen-reader user swiping the reading
    // surface would otherwise land on controls nobody can see.
    render(<Harness />);
    expect(screen.getByTestId('reading-chrome-header', ANY).props.accessibilityElementsHidden).toBe(
      true
    );
    expect(screen.getByTestId('reading-chrome-header', ANY).props.importantForAccessibility).toBe(
      'no-hide-descendants'
    );
    await reveal();
    expect(screen.getByTestId('reading-chrome-header').props.accessibilityElementsHidden).toBe(
      false
    );
  });

  it('…and from the WEB KEYBOARD tab order, which is a third tree neither of those covers', async () => {
    // ⚠️ THE ONE THE FIRST CUT MISSED, AND NO GATE COULD SEE. `pointerEvents` is the touch tree and
    // `accessibilityElementsHidden`/`importantForAccessibility` are the iOS/Android ones; none of
    // them touches the DOM tab order. Observed in Chromium against the running web build: one Tab
    // from a cold reading surface focused `chrome-tab-(profile)` — an invisible control, with no
    // ring to see because its bar is at `opacity: 0`, and Enter would have navigated.
    //
    // ⚠️ ASSERT `tabIndex`, NOT `focusable` — the first fix here set `focusable` alone and DID
    // NOTHING on the one platform with the defect. react-native-web's `Pressable` derives its
    // tabIndex from `tabIndex ?? (disabled ? -1 : 0)` and never reads `focusable`
    // (`react-native-web/dist/exports/Pressable/index.js:118-122`), so the prop was inert in the
    // DOM while this very test went green off the React prop. Both are passed — `focusable` is the
    // native/TV one — but this case measures the half that reaches the browser.
    render(<Harness />);
    for (const id of TAB_IDS) {
      expect(screen.getByTestId(id, ANY).props.tabIndex).toBe(-1);
    }
    expect(screen.getByTestId('chrome-mode-toggle', ANY).props.tabIndex).toBe(-1);
    await reveal();
    for (const id of TAB_IDS) {
      expect(screen.getByTestId(id).props.tabIndex).toBe(0);
    }
    expect(screen.getByTestId('chrome-mode-toggle').props.tabIndex).toBe(0);
  });
});

describe('the controls the chrome carries (story 6-6)', () => {
  it('the tab bar is the revealed footer — every tab, and switching away works', async () => {
    render(<Harness />);
    await reveal();
    // Every tab exists — FOUR since 6-4's Bookmarks (the parity test holds this per platform;
    // this is the wiring). Explicit ids, not a TABS-derived list: a test that derives its
    // expectations from the same table the component maps proves nothing about the table.
    for (const id of TAB_IDS) {
      expect(screen.getByTestId(id)).toBeTruthy();
    }
    fireEvent.press(screen.getByTestId('chrome-tab-(profile)'));
    expect(mockNavigate).toHaveBeenCalledWith('/account');
  });

  it('the mode toggle navigates to the OTHER renderer — and carries no position of its own', async () => {
    // One position, two renderers: the toggle is a plain navigation; the screens re-resolve the
    // saved pair on focus. A toggle that passed a position would be a second source of truth.
    render(<Harness mode="reading" />);
    await reveal();
    fireEvent.press(screen.getByTestId('chrome-mode-toggle'));
    expect(mockNavigate).toHaveBeenCalledWith(HOME_HREF);
    expect(mockNavigate.mock.calls.every((call) => typeof call[0] === 'string')).toBe(true);
  });

  it('…and from the mushaf it navigates to reading mode', async () => {
    render(<Harness mode="mushaf" />);
    await reveal();
    fireEvent.press(screen.getByTestId('chrome-mode-toggle'));
    expect(mockNavigate).toHaveBeenCalledWith(READ_HREF);
  });

  it('the title is the index entry — from reading mode it pushes /surahs in that mode', async () => {
    // Story 6-3: `onTitlePress` had zero callers since 6-6 shipped it; this is the wiring. The
    // mode param is what makes a selection write — and a deep-linked exit go — toward the
    // surface the reader came from.
    render(<Harness mode="reading" />);
    await reveal();
    fireEvent.press(screen.getByTestId('chrome-title-entry'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/surahs', params: { mode: 'reading' } });
  });

  it('…and from the mushaf it pushes /surahs in mushaf mode', async () => {
    render(<Harness mode="mushaf" />);
    await reveal();
    fireEvent.press(screen.getByTestId('chrome-title-entry'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/surahs', params: { mode: 'mushaf' } });
  });

  it('shows a back control when there is history, and it pops', async () => {
    mockCanGoBack.mockReturnValue(true);
    render(<Harness />);
    await reveal();
    fireEvent.press(screen.getByTestId('chrome-back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('shows NO back control when there is nothing to pop — absent, not inert', async () => {
    mockCanGoBack.mockReturnValue(false);
    render(<Harness />);
    await reveal();
    expect(screen.queryByTestId('chrome-back')).toBeNull();
  });

  it('installs no control into a native header slot', () => {
    const chrome = source('components/ReadingChrome.tsx');
    expect(chrome).not.toMatch(/header(?:Left|Right)/);
    expect(chrome).not.toMatch(/setOptions/);
  });
});

describe('what the bars say', () => {
  it('names the surah once the metadata read lands, and renders empty before it', async () => {
    const { rerender } = render(<Harness title={null} />);
    await reveal();
    expect(screen.queryByText('Al-Baqarah')).toBeNull();
    rerender(<Harness title="Al-Baqarah" />);
    expect(screen.getByText('Al-Baqarah')).toBeTruthy();
  });
});
