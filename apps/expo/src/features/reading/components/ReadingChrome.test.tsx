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
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { AccessibilityInfo, Pressable, Text } from 'react-native';

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

/**
 * ⚠️ THE FOOTER REACHES THE QUERY MODULE SINCE STORY 7-8 — it carries `ChromeVerseRow`, whose
 * bookmark and reciter controls read the cache through real `useQuery` hooks. The app mounts the
 * `QueryClientProvider` in `app/_layout.tsx`; this file mounts one component, so without the mock
 * every render below throws "No QueryClient set". The ROW's own behaviour is
 * `ChromeVerseRow.test.tsx`'s subject; what this file needs is for it to render.
 */
const mockBookmarks: { id: string; surah: number; verse: number }[] = [];
jest.mock('@/lib/sync', () => ({
  addBookmark: jest.fn(),
  removeBookmark: jest.fn(),
  // `ReciterPicker` (inside the sheet) writes the chosen voice through this.
  patchPreferences: jest.fn(),
  useBookmarks: () => ({ data: mockBookmarks }),
  usePreferences: () => ({ data: null }),
}));

import { DURATIONS } from '@/constants/animation';
import { HOME_HREF, READ_HREF } from '@/constants/navigation';
import { ReciterSheet } from '@/features/audio';
import { useAudioPlayerStore } from '@/stores/audioPlayerStore';
import { CHROME_DWELL_MS, type ChromeReveal, useChromeReveal } from '../hooks/useChromeReveal';
import { ReadingChrome, type ReadingChromeProps } from './ReadingChrome';

/** A host that owns the reveal hook, so a tap drives the real state the screen would. */
function Harness({
  title = 'Al-Baqarah',
  mode = 'reading',
  capture,
}: {
  title?: string | null;
  mode?: ReadingChromeProps['mode'];
  /**
   * ⚠️ ONLY THE DWELL CASES USE THIS, AND THEY HAVE TO — see that block. Everything else drives
   * the chrome by pressing `surface`, which is the shape a reader's tap actually takes.
   */
  capture?: (reveal: ChromeReveal) => void;
}) {
  const reveal = useChromeReveal();
  capture?.(reveal);
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
    // ⚠️ AND THE SHEET THE CHROME MOUNTS, WHICH LIVES IN ANOTHER FEATURE (story 7-8). The walk
    // covers `features/reading`; `ReciterSheet` is in `features/audio`, so a driver added there
    // would be a second animation inside the chrome that this count could not see — exactly the
    // blind spot 6-6 closed by reaching into `components/ui` for the two bars.
    read(join(__dirname, '..', '..', 'audio', 'components', 'ReciterSheet.tsx'));
    // …and the SECOND such sheet (story 7-4), for the same reason. Listing them one at a time is
    // the weak part of this walk, so both are named in the anti-vacuity case below.
    read(join(__dirname, '..', '..', 'audio', 'components', 'PlaybackOptionsSheet.tsx'));
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
    expect(all).toMatch(/export function ReciterSheet/);
    expect(all).toMatch(/export function PlaybackOptionsSheet/);
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
  it('the title carries a CHEVRON — the index must not be invisible again', async () => {
    // ⚠️ THE REGRESSION HERE IS INVISIBILITY, NOT BREAKAGE, so pressing the title is not enough
    // to assert: story 6-3 shipped exactly that and the app's own author could not find the
    // index. A case that only exercised `onTitlePress` would stay green while the thing a reader
    // can SEE disappeared. The chevron is what says the name opens a list.
    render(<Harness />);
    await reveal();
    expect(screen.getByTestId('chrome-title-chevron')).toBeTruthy();
    fireEvent.press(screen.getByTestId('chrome-title-entry'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/surahs', params: { mode: 'reading' } });
  });

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

describe('the dismiss chevron (2026-09-10)', () => {
  it('puts the chrome away — the only VISIBLE way out', async () => {
    // ⚠️ WHY THIS CONTROL EXISTS. Revealed chrome covers whatever revealed it: on the mushaf the
    // page header band sits under this very bar and the page number under the tab bar's pills, so
    // the only thing still showing is Quran text, which seeks. Before the chevron, dismissal was
    // the 5s dwell or a tap falling through `box-none` onto a band the reader cannot see —
    // two invisible affordances. MUTATION: point `onPress` at `show` instead of `toggle`.
    render(<Harness />);
    await reveal();
    expect(touchesOf('reading-chrome-header')).toBe('box-none');

    fireEvent.press(screen.getByTestId('chrome-dismiss'));
    // `interactive` drops on the LEADING edge of a dismissal — the bars stop taking touches while
    // they are still drawn, so this needs no timer, only React's own flush.
    await waitFor(() => expect(touchesOf('reading-chrome-header')).toBe('none'));
    expect(touchesOf('reading-chrome-footer')).toBe('none');
  });

  it.each(['reading', 'mushaf'] as const)('is carried on the %s surface too', (mode) => {
    // The mushaf is the surface that needs it most — its bands are the things the bar covers — so
    // a chevron wired only on `reading` would miss the case it was added for.
    render(<Harness mode={mode} />);
    expect(screen.getByTestId('chrome-dismiss', ANY)).toBeTruthy();
  });

  it('sits BESIDE the transport rather than instead of it', () => {
    // MUTATION: return the chevron from the `trailing` slot alone. A listener would lose play or
    // pause the moment the chrome carried a way out.
    const reveal: ChromeReveal = {
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
    render(
      <ReadingChrome
        reveal={reveal}
        title="Al-Fatihah"
        mode="reading"
        playing={false}
        onTogglePlay={jest.fn()}
      />
    );
    expect(screen.getByTestId('chrome-play-toggle', ANY)).toBeTruthy();
    expect(screen.getByTestId('chrome-dismiss', ANY)).toBeTruthy();
  });

  it('takes no keyboard focus while the chrome is dismissed', async () => {
    // The web third tree — see the overlay block for the Tab-key defect this mirrors.
    render(<Harness />);
    expect(screen.getByTestId('chrome-dismiss', ANY).props.focusable).toBe(false);
    await reveal();
    expect(screen.getByTestId('chrome-dismiss', ANY).props.focusable).toBe(true);
  });
});

describe('the DOM hit-test tree (2026-09-10)', () => {
  it('makes every control inert while the bars are dismissed', async () => {
    // ⚠️ A FOURTH TREE, AND `focusable` DOES NOT COVER IT. The bar sets `pointerEvents` on
    // itself, but react-native-web's `box-none` hands children `pointer-events: auto`, and a
    // child's own `auto` beats a parent's `none` in CSS — so a DISMISSED bar's controls stayed
    // CLICKABLE on web. It was invisible until the mushaf started revealing its chrome from a
    // band under the header: measured in WebKit 2026-09-10, 7 of 7 probe points across that band
    // hit a chrome control instead of the band, i.e. the reveal was dead on web. 7 of 7 reach the
    // band with these styles in place. MUTATION: drop any `inert` entry — this reddens.
    render(<Harness />);
    for (const id of ['chrome-title-entry', 'chrome-mode-toggle', 'chrome-dismiss', TAB_IDS[0]]) {
      expect(styleOf(id).pointerEvents).toBe('none');
    }

    await reveal();
    for (const id of ['chrome-title-entry', 'chrome-mode-toggle', 'chrome-dismiss', TAB_IDS[0]]) {
      expect(styleOf(id).pointerEvents).toBeUndefined();
    }
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

/**
 * ⚠️ THE DWELL — REVEALED CHROME PUTS ITSELF AWAY AGAIN (story 7-6).
 *
 * ⚠️ THIS BLOCK DRIVES THE REVEAL THROUGH THE CAPTURED HOOK, NOT THROUGH `fireEvent.press`, AND
 * THAT IS NOT A SHORTCUT. It needs Jest's fake timers to reach `CHROME_DWELL_MS` without spending
 * five real seconds — and RN's `Pressability`, which is what turns a `fireEvent.press` on the
 * surface into an `onPress`, schedules its own timers and simply does not fire under them
 * (measured: the press left `visible` false). Calling `toggle()`/`show()` is the same entry point
 * the surface gesture uses, and everything asserted below is read off the RENDERED chrome, so
 * what is under test is still the bars going away rather than a flag.
 *
 * Every other case in this file stays on real timers and runs far inside the dwell, so none of
 * them is affected by it.
 */
describe('the dwell (story 7-6)', () => {
  /** The live reveal, captured from the harness on each render. */
  let reveal: ChromeReveal;

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /**
   * Reveal by the reader's own entry point and let the animation settle — the bars are usable.
   * ⚠️ THE DWELL STARTS WITH THE REVEAL, NOT WITH THE SETTLE, so this spends `DURATIONS.standard`
   * of it; a case measuring the boundary has to subtract that.
   */
  function revealByTap() {
    act(() => reveal.toggle());
    act(() => jest.advanceTimersByTime(DURATIONS.standard));
    expect(touchesOf('reading-chrome-header')).toBe('box-none');
  }

  it('dismisses itself once the reader has been idle for the dwell', () => {
    render(<Harness capture={(r) => (reveal = r)} />);
    revealByTap();
    // A whisker before: still there. This half is what stops the dwell from being "any timeout at
    // all" — a 100ms value would pass the assertion below and fail this one. The reveal already
    // spent `DURATIONS.standard` of the dwell (see `revealByTap`).
    act(() => jest.advanceTimersByTime(CHROME_DWELL_MS - DURATIONS.standard - 1));
    expect(touchesOf('reading-chrome-header')).toBe('box-none');
    act(() => jest.advanceTimersByTime(1));
    expect(touchesOf('reading-chrome-header')).toBe('none');
    expect(touchesOf('reading-chrome-footer')).toBe('none');
  });

  it('re-arms a FRESH dwell on the next reveal', () => {
    render(<Harness capture={(r) => (reveal = r)} />);
    revealByTap();
    act(() => jest.advanceTimersByTime(CHROME_DWELL_MS));
    expect(touchesOf('reading-chrome-header')).toBe('none');

    revealByTap();
    act(() => jest.advanceTimersByTime(CHROME_DWELL_MS));
    expect(touchesOf('reading-chrome-header')).toBe('none');
  });

  it('clears the pending dwell when the reader dismisses it early', () => {
    // MUTATION: arm the timer without cleaning it up. The reader dismisses at 2s and re-reveals
    // at 3s; the orphaned timer then fires at 5s and takes the chrome away one second into a
    // reveal that should have had its own five.
    render(<Harness capture={(r) => (reveal = r)} />);
    revealByTap();
    act(() => jest.advanceTimersByTime(2000));
    act(() => reveal.toggle()); // dismissed by hand
    expect(touchesOf('reading-chrome-header')).toBe('none');

    act(() => jest.advanceTimersByTime(1000));
    revealByTap();
    // Now WELL past the moment the orphaned first dwell would have fired, and well short of the
    // second one's — so only an uncleaned timer can redden this.
    act(() => jest.advanceTimersByTime(2000));
    expect(touchesOf('reading-chrome-header')).toBe('box-none');
  });

  it('does NOT arm a dwell for a `show()` reveal — the error exit stays put', () => {
    // ⚠️ EVERY `show()` CALLER IS A FAILURE SURFACE whose message is drawn inside the chrome and
    // whose only exit is the tab bar the reveal brings back: an unreadable surah, an empty one, a
    // mushaf page whose font could not be fetched, a playback error. A dwell there rebuilds the
    // trap the reveal exists to prevent.
    render(<Harness capture={(r) => (reveal = r)} />);
    act(() => reveal.show());
    act(() => jest.advanceTimersByTime(DURATIONS.standard));
    expect(touchesOf('reading-chrome-header')).toBe('box-none');
    act(() => jest.advanceTimersByTime(CHROME_DWELL_MS * 4));
    expect(touchesOf('reading-chrome-header')).toBe('box-none');
  });

  it('cancels a dwell already running when a failure arrives over an ordinary reveal', () => {
    // MUTATION: make `show()` sticky only for reveals it starts. A playback error arriving while
    // the chrome is already up changes no state, so the effect never re-runs — the dwell armed by
    // the reader's tap keeps counting and fades the error message out from under them.
    render(<Harness capture={(r) => (reveal = r)} />);
    revealByTap();
    act(() => jest.advanceTimersByTime(2000));
    act(() => reveal.show());
    act(() => jest.advanceTimersByTime(CHROME_DWELL_MS * 2));
    expect(touchesOf('reading-chrome-header')).toBe('box-none');
  });

  it('lets the reader dismiss a sticky reveal, after which reveals dwell again', () => {
    // The sticky mark is the reader's to clear: `show()` sets it, `toggle()` clears it. Without
    // the clear, one page-load failure would disable the dwell for the rest of the session.
    render(<Harness capture={(r) => (reveal = r)} />);
    act(() => reveal.show());
    act(() => jest.advanceTimersByTime(DURATIONS.standard));
    act(() => reveal.toggle()); // dismissed by hand
    expect(touchesOf('reading-chrome-header')).toBe('none');

    revealByTap();
    act(() => jest.advanceTimersByTime(CHROME_DWELL_MS));
    expect(touchesOf('reading-chrome-header')).toBe('none');
  });

  it('does NOT dwell while a screen reader is on', async () => {
    // ⚠️ VoiceOver and TalkBack navigate by swiping the ACCESSIBILITY tree, and a dismissed bar
    // leaves that tree entirely (the case above pins that). Chrome that vanishes five seconds
    // after it appears is chrome a screen-reader user can never finish reading.
    const probe = jest
      .spyOn(AccessibilityInfo, 'isScreenReaderEnabled')
      .mockResolvedValue(true as never);
    render(<Harness capture={(r) => (reveal = r)} />);
    await act(async () => {}); // the probe is a promise; let it land before the first reveal
    revealByTap();
    act(() => jest.advanceTimersByTime(CHROME_DWELL_MS * 4));
    expect(touchesOf('reading-chrome-header')).toBe('box-none');
    // ⚠️ RE-MOCKED, NOT RESTORED. `mockRestore()` on the RN preset's OWN `jest.fn()` leaves a
    // function that returns `undefined`, not the `Promise.resolve(false)` it shipped with — which
    // poisons every later case in the file.
    probe.mockResolvedValue(false as never);
  });

  it('cancels a dwell ALREADY COUNTING when the reader turns a screen reader on', async () => {
    // MUTATION: have the listener only record the flag. `screenReaderOn` is read once, at arm
    // time, so a pending timer would still fire — and the ONE reader who most needs the chrome
    // to stay put watches it vanish exactly once before the suspension takes effect.
    let notify: ((on: boolean) => void) | undefined;
    const listener = jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((
      _event: string,
      handler: (on: boolean) => void
    ) => {
      notify = handler;
      return { remove: () => {} };
    }) as never);
    render(<Harness capture={(r) => (reveal = r)} />);
    await act(async () => {});
    revealByTap();
    act(() => jest.advanceTimersByTime(2000));
    act(() => notify?.(true));
    act(() => jest.advanceTimersByTime(CHROME_DWELL_MS * 4));
    expect(touchesOf('reading-chrome-header')).toBe('box-none');
    // Re-mocked rather than restored, for the reason the case above spells out.
    listener.mockImplementation((() => ({ remove: () => {} })) as never);
  });

  it('treats a failed detection as "no screen reader" rather than as an error', async () => {
    // MUTATION: let the rejection through. An unavailable accessibility bridge would then be an
    // unhandled rejection at boot AND — worse — could take the dwell away for every reader.
    const probe = jest
      .spyOn(AccessibilityInfo, 'isScreenReaderEnabled')
      .mockRejectedValue(new Error('no bridge') as never);
    render(<Harness capture={(r) => (reveal = r)} />);
    await act(async () => {});
    revealByTap();
    act(() => jest.advanceTimersByTime(CHROME_DWELL_MS));
    expect(touchesOf('reading-chrome-header')).toBe('none');
    probe.mockResolvedValue(false as never);
  });

  it('leaves no timer behind when the reader leaves the screen mid-dwell', () => {
    // A `setTimeout` that outlives its hook sets state on an unmounted component. The arm and its
    // cleanup are the same effect, which is what makes unmount, re-arm and dismissal one rule.
    render(<Harness capture={(r) => (reveal = r)} />);
    revealByTap();
    screen.unmount();
    expect(() => act(() => jest.advanceTimersByTime(CHROME_DWELL_MS * 2))).not.toThrow();
    expect(jest.getTimerCount()).toBe(0);
  });
});

/**
 * ⚠️ THE SELECTED VERSE (story 7-8) — held by the reveal, so it cannot outlive the bars.
 *
 * ⚠️ THIS BLOCK DRIVES THE HOOK DIRECTLY, LIKE THE DWELL BLOCK ABOVE AND FOR THE SAME REASON: it
 * needs fake timers to reach `CHROME_DWELL_MS`, and RN's `Pressability` does not fire under them.
 * `revealFor` is the same entry point a verse press uses, and everything asserted is read off the
 * RENDERED chrome — the row the footer draws, not a flag.
 */
describe('the selection (story 7-8)', () => {
  let reveal: ChromeReveal;

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /** Reveal for a pair (or for nothing) and let the animation settle. */
  function press(pair: { surah: number; verse: number } | null) {
    act(() => reveal.revealFor(pair));
    act(() => jest.advanceTimersByTime(DURATIONS.standard));
  }

  /** What the footer's contextual row says, or null when it draws nothing. */
  function rowLabel(): string | null {
    const node = screen.queryByTestId('chrome-verse-label', ANY);
    return node ? (node.props.children as string) : null;
  }

  it('a verse press reveals the bars AND selects that ayah', () => {
    render(<Harness capture={(r) => (reveal = r)} />);
    press({ surah: 2, verse: 255 });
    expect(touchesOf('reading-chrome-header')).toBe('box-none');
    expect(rowLabel()).toBe('Al-Baqarah · 255');
  });

  it('an EMPTY press reveals the bars with nothing selected', () => {
    // MUTATION: have `toggle` keep the previous selection. An empty area names no ayah, so the
    // row would then act on a verse the reader did not press.
    render(<Harness capture={(r) => (reveal = r)} />);
    press(null);
    expect(touchesOf('reading-chrome-header')).toBe('box-none');
    expect(rowLabel()).toBeNull();
  });

  it('a press on ANOTHER ayah moves the selection and keeps the bars up', () => {
    render(<Harness capture={(r) => (reveal = r)} />);
    press({ surah: 2, verse: 255 });
    press({ surah: 2, verse: 256 });
    expect(touchesOf('reading-chrome-header')).toBe('box-none');
    expect(rowLabel()).toBe('Al-Baqarah · 256');
  });

  it('…and RE-ARMS the dwell, so moving the selection does not inherit the old countdown', () => {
    // ⚠️ THE CASE THE `visible`-KEYED EFFECT COULD NOT PASS. Moving the selection leaves `visible`
    // true, so an effect keyed on it alone would keep the ORIGINAL five seconds running and take
    // the bars away mid-decision. MUTATION: drop `chrome.token` from the dwell effect's deps.
    render(<Harness capture={(r) => (reveal = r)} />);
    press({ surah: 2, verse: 255 });
    // Most of the first dwell spent…
    act(() => jest.advanceTimersByTime(CHROME_DWELL_MS - DURATIONS.standard - 1));
    press({ surah: 2, verse: 256 });
    // …and now past where the FIRST dwell would have fired. A fresh one is counting.
    act(() => jest.advanceTimersByTime(DURATIONS.standard + 2));
    expect(touchesOf('reading-chrome-header')).toBe('box-none');
    expect(rowLabel()).toBe('Al-Baqarah · 256');
  });

  it('the DWELL takes the selection with the bars', () => {
    render(<Harness capture={(r) => (reveal = r)} />);
    press({ surah: 2, verse: 255 });
    act(() => jest.advanceTimersByTime(CHROME_DWELL_MS));
    expect(touchesOf('reading-chrome-header')).toBe('none');
    expect(rowLabel()).toBeNull();
  });

  it('pressing the SAME ayah again RE-ARMS rather than dismissing — the mushaf-word case', () => {
    // ⚠️ THIS CASE ASSERTED THE OPPOSITE FOR ONE ROUND, AND THE OPPOSITE WAS A DEFECT. `samePair`
    // matches at AYAH granularity, and on the mushaf an ayah is many words — so "a repeat press
    // dismisses" meant pressing a second word of the verse you are acting on threw away the
    // chrome and the selection mid-decision. Only an EMPTY press dismisses now. MUTATION: restore
    // the dismissal; the first assertion reddens.
    render(<Harness capture={(r) => (reveal = r)} />);
    press({ surah: 2, verse: 255 });
    // Most of the dwell spent…
    act(() => jest.advanceTimersByTime(CHROME_DWELL_MS - DURATIONS.standard - 1));
    act(() => reveal.revealFor({ surah: 2, verse: 255 }));
    expect(touchesOf('reading-chrome-header')).toBe('box-none');
    expect(rowLabel()).toBe('Al-Baqarah · 255');
    // …and it re-armed, so the ORIGINAL countdown no longer decides.
    act(() => jest.advanceTimersByTime(DURATIONS.standard + 2));
    expect(touchesOf('reading-chrome-header')).toBe('box-none');
  });

  it('a row control RE-ARMS the dwell — the bars must not vanish under the reader’s finger', () => {
    // ⚠️ ONLY `revealFor` USED TO BUMP THE TOKEN, so pressing the row's play or bookmark left
    // whatever was left of the original five seconds running. The story named this as its open
    // question; the row existing is what answers it. MUTATION: drop `keepAlive`'s bump.
    render(<Harness capture={(r) => (reveal = r)} />);
    press({ surah: 2, verse: 255 });
    act(() => jest.advanceTimersByTime(CHROME_DWELL_MS - DURATIONS.standard - 1));
    act(() => reveal.keepAlive());
    act(() => jest.advanceTimersByTime(DURATIONS.standard + 2));
    expect(touchesOf('reading-chrome-header')).toBe('box-none');
    expect(rowLabel()).toBe('Al-Baqarah · 255');
  });

  it('a HELD dwell does not fire at all, and releasing it starts a FULL fresh one', () => {
    // The reciter sheet's hold. A reader picking a voice is using the chrome; coming back to no
    // bars and no selection is the failure. MUTATION: make `holdDwell` a no-op.
    render(<Harness capture={(r) => (reveal = r)} />);
    press({ surah: 2, verse: 255 });
    act(() => reveal.holdDwell(true));
    act(() => jest.advanceTimersByTime(CHROME_DWELL_MS * 4));
    expect(touchesOf('reading-chrome-header')).toBe('box-none');
    expect(rowLabel()).toBe('Al-Baqarah · 255');

    act(() => reveal.holdDwell(false));
    // A FULL dwell, not the remainder of a spent one.
    act(() => jest.advanceTimersByTime(CHROME_DWELL_MS - 1));
    expect(touchesOf('reading-chrome-header')).toBe('box-none');
    act(() => jest.advanceTimersByTime(2));
    expect(touchesOf('reading-chrome-header')).toBe('none');
  });

  it('`clearSelection` drops the ayah and LEAVES the bars — the position-change exit', () => {
    // ⚠️ THE SELECTION DIES WITH THE AYAH AS WELL AS WITH THE BARS. A surah change, a settled
    // mushaf page, a focus resync and the mode toggle all move the reader without touching
    // `visible`; the screens call this. MUTATION: make it clear `visible` too, and the reader
    // loses their chrome every time the recitation turns a page.
    render(<Harness capture={(r) => (reveal = r)} />);
    press({ surah: 2, verse: 255 });
    act(() => reveal.clearSelection());
    expect(rowLabel()).toBeNull();
    expect(touchesOf('reading-chrome-header')).toBe('box-none');
  });

  it('an empty press while the bars are up dismisses them, selection and all', () => {
    render(<Harness capture={(r) => (reveal = r)} />);
    press({ surah: 2, verse: 255 });
    act(() => reveal.revealFor(null));
    expect(touchesOf('reading-chrome-header')).toBe('none');
    expect(rowLabel()).toBeNull();
  });

  it('the dismiss chevron clears it too — `toggle` IS `revealFor(null)`', () => {
    // MUTATION: give `toggle` its own setter that only flips `visible`. The bars would go and the
    // selection would survive into the next reveal — the orphan state the one-object shape exists
    // to make unwritable.
    render(<Harness capture={(r) => (reveal = r)} />);
    press({ surah: 2, verse: 255 });
    act(() => reveal.toggle());
    expect(rowLabel()).toBeNull();
    press(null);
    expect(rowLabel()).toBeNull();
  });

  it('`show()` — the error exit — clears it and stays put', () => {
    // Every `show()` caller is a FAILURE surface whose message is drawn inside the chrome. A
    // verse the reader selected before the failure is not what that chrome is about, and the
    // reveal must not dwell away underneath the message.
    render(<Harness capture={(r) => (reveal = r)} />);
    press({ surah: 2, verse: 255 });
    act(() => reveal.show());
    expect(rowLabel()).toBeNull();
    act(() => jest.advanceTimersByTime(CHROME_DWELL_MS * 4));
    expect(touchesOf('reading-chrome-header')).toBe('box-none');
  });

  it('never survives the bars, whichever exit was taken — the one rule, stated once', () => {
    // Anti-vacuity for the five cases above: a selection is only ever readable while the chrome
    // is up. MUTATION: hold the selection in a second `useState` and clear it from an effect —
    // every case above can still pass while one exit forgets.
    render(<Harness capture={(r) => (reveal = r)} />);
    for (const dismiss of [
      () => reveal.toggle(),
      () => jest.advanceTimersByTime(CHROME_DWELL_MS),
      () => reveal.revealFor(null),
    ]) {
      press({ surah: 2, verse: 255 });
      expect(reveal.selectedVerse).toMatchObject({ surah: 2, verse: 255 });
      act(() => dismiss());
      expect(reveal.visible).toBe(false);
      expect(reveal.selectedVerse).toBeNull();
    }
  });
});

/**
 * ⚠️ THE RECITER SHEET — MOUNTED HERE, OUTSIDE BOTH BARS (story 7-8).
 *
 * Nothing verified this until the review: `ChromeVerseRow` only reports that the reader asked for
 * the picker, so deleting the `<ReciterSheet>` element, hard-coding `open={false}`, or wiring
 * `onOpenReciters` to `closeReciters` left every case green. These drive the real element.
 */
describe('the reciter sheet (story 7-8)', () => {
  /** The chrome with a loaded track, which is the only state that draws the reciter control. */
  function revealWithTrack() {
    act(() => {
      useAudioPlayerStore.getState().setTrack(18, 'alafasy', true);
      useAudioPlayerStore.getState().setPlaybackState('playing');
    });
    render(<Harness />);
    return reveal();
  }

  afterEach(() => act(() => useAudioPlayerStore.getState().clearPlayback()));

  it('opens on the row’s reciter control and closes again', async () => {
    await revealWithTrack();
    expect(screen.queryByTestId('reciter-sheet')).toBeNull();

    fireEvent.press(screen.getByTestId('chrome-reciter'));
    expect(screen.getByTestId('reciter-sheet')).toBeTruthy();
    // The list itself, not just the wrapper — the sheet exists to host `ReciterPicker`.
    expect(screen.getByTestId('reciter-picker')).toBeTruthy();

    fireEvent.press(screen.getByTestId('reciter-sheet-close'));
    expect(screen.queryByTestId('reciter-sheet')).toBeNull();
  });

  it('renders OUTSIDE the animated footer, which is the whole placement argument', async () => {
    // ⚠️ THE FAILURE THIS PINS. Inside the footer's `Animated.View` the sheet inherits the
    // reveal's opacity and `pointerEvents`, so the 5s dwell would fade the reader's open sheet
    // away and make it untouchable — a bar's animation deciding the fate of a modal that is not
    // part of it. MUTATION: move the element inside the footer; this reddens while the case
    // above stays green.
    await revealWithTrack();
    fireEvent.press(screen.getByTestId('chrome-reciter'));
    expect(screen.getByTestId('reciter-sheet', ANY)).toBeTruthy();
    expect(
      within(screen.getByTestId('reading-chrome-footer', ANY)).queryByTestId('reciter-sheet')
    ).toBeNull();
    expect(
      within(screen.getByTestId('reading-chrome-header', ANY)).queryByTestId('reciter-sheet')
    ).toBeNull();
  });

  it('gives the picker a BOUNDED box, on the wide branch as well as the narrow one', () => {
    // ⚠️ `snapPoints` IS IGNORED AT ≥768pt — `BottomSheet` renders a dialog card whose body is
    // `flexShrink: 1, minHeight: 0`, i.e. the content-MEASURED host that collapses a `flex: 1`
    // `FlashList` (the Thread-H3 class `BottomSheet.tsx` documents). So the sheet's own detent
    // covers phones and nothing else, and the explicit height is what makes the claim true on
    // iPad, Android tablet and wide web. MUTATION: drop the height; this reddens.
    render(<ReciterSheet open onClose={() => {}} />);
    const style = screen.getByTestId('reciter-sheet-body').props.style;
    const flat = Object.assign(
      {},
      ...(Array.isArray(style) ? style.flat(3) : [style]).filter(Boolean)
    );
    expect(typeof flat.height).toBe('number');
    expect(flat.height).toBeGreaterThan(0);
  });
});

/**
 * ⚠️ THE PLAYBACK-OPTIONS SHEET — MOUNTED HERE TOO, OUTSIDE BOTH BARS (story 7-4).
 *
 * The same three claims the reciter sheet's cases pin, for the same three reasons: the row only
 * ASKS, the sheet must not live inside an animated bar, and its body needs a bound because
 * `snapPoints` is ignored at ≥768pt.
 */
describe('the playback-options sheet (story 7-4)', () => {
  /** The chrome with a loaded track — the only state that draws the mini player's controls. */
  function revealWithTrack() {
    act(() => {
      useAudioPlayerStore.getState().setTrack(18, 'alafasy', true);
      useAudioPlayerStore.getState().setPlaybackState('playing');
    });
    render(<Harness />);
    return reveal();
  }

  afterEach(() =>
    act(() => {
      useAudioPlayerStore.getState().clearSleepTimer();
      useAudioPlayerStore.getState().clearPlayback();
    })
  );

  it('opens on the row’s overflow control and closes again', async () => {
    await revealWithTrack();
    expect(screen.queryByTestId('playback-options-sheet')).toBeNull();

    fireEvent.press(screen.getByTestId('chrome-playback-options'));
    // The controls themselves, not just the wrapper — the sheet exists to host them.
    expect(screen.getByTestId('playback-options-speed')).toBeTruthy();
    expect(screen.getByTestId('playback-options-sleep-surah')).toBeTruthy();

    fireEvent.press(screen.getByTestId('playback-options-close'));
    expect(screen.queryByTestId('playback-options-body')).toBeNull();
  });

  it('renders OUTSIDE the animated bars, which is the whole placement argument', async () => {
    // ⚠️ INSIDE THE FOOTER IT INHERITS THE REVEAL'S OPACITY, so the 5s dwell would fade a speed
    // slider away mid-drag and leave the reader at whatever rate they had reached. MUTATION:
    // move the element inside the footer; this reddens while the case above stays green.
    await revealWithTrack();
    fireEvent.press(screen.getByTestId('chrome-playback-options'));
    expect(
      within(screen.getByTestId('reading-chrome-footer', ANY)).queryByTestId(
        'playback-options-body'
      )
    ).toBeNull();
    expect(
      within(screen.getByTestId('reading-chrome-header', ANY)).queryByTestId(
        'playback-options-body'
      )
    ).toBeNull();
  });

  it('holds the dwell while it is open, and releases it on close', () => {
    // ⚠️ A READER CHOOSING A SPEED IS USING THE CHROME. Without the hold they come back from the
    // sheet to no bars — and, unlike the reciter list, possibly mid-drag. MUTATION: drop the
    // `holdDwell` calls; the sheet's own cases stay green and this reddens.
    //
    // Fake timers and the `capture` harness, the dwell block's idiom — see its header.
    jest.useFakeTimers();
    try {
      let live: ChromeReveal | undefined;
      act(() => {
        useAudioPlayerStore.getState().setTrack(18, 'alafasy', true);
        useAudioPlayerStore.getState().setPlaybackState('playing');
      });
      render(<Harness capture={(r) => (live = r)} />);
      act(() => live?.toggle());
      act(() => jest.advanceTimersByTime(DURATIONS.standard));
      expect(touchesOf('reading-chrome-header')).toBe('box-none');

      fireEvent.press(screen.getByTestId('chrome-playback-options'));
      act(() => jest.advanceTimersByTime(CHROME_DWELL_MS * 3));
      expect(touchesOf('reading-chrome-header')).toBe('box-none');

      fireEvent.press(screen.getByTestId('playback-options-close'));
      act(() => jest.advanceTimersByTime(CHROME_DWELL_MS + DURATIONS.standard + 100));
      expect(touchesOf('reading-chrome-header')).toBe('none');
    } finally {
      jest.useRealTimers();
    }
  });
});
