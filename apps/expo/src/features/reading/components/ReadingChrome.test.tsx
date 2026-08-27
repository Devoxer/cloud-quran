/**
 * The chrome: ONE driver, an overlay that shifts nothing, and the route's only exit (story 6-1).
 *
 * ⚠️ THE ONE-DRIVER CASE IS STRUCTURAL, AND THE DOCBLOCK SAYS SO RATHER THAN IMPLYING MORE. What
 * `chrome-render-storm`'s second half actually was: the header faded over 250ms while the tab bar
 * flipped opacity with NO animation, because it was hidden with `display: 'none'` and a display
 * flip cannot animate. Two mechanisms. Reanimated runs its animations on the UI thread and Jest
 * observes an animated style as an opaque descriptor object, so "both bars interpolated in step at
 * t=100ms" is not a fact any renderer here can see — the device smoke is what proves it. What CAN
 * be pinned, and is the regression, is that there is exactly one `useSharedValue` and one
 * `withTiming` in the whole feature, so there is nothing for a second speed to come from.
 *
 * ⚠️ AND THE CASE COUNTS THE FEATURE, WHICH FOR ONE ROUND IT ONLY CLAIMED TO. It listed two file
 * paths by hand while its own comment said "counted over the FEATURE, not one file, so moving the
 * second driver into the component is not an escape". Demonstrated: adding
 * `hooks/useFooterReveal.ts` with its own `useSharedValue` + `withTiming(…, { duration: 900 })`
 * and pointing the footer at it passed this file and everything else — which is
 * `chrome-render-storm`'s second half rebuilt exactly, two mechanisms at two speeds. It walks the
 * directory now.
 *
 * ⚠️ THE CHROME STARTS HIDDEN, so almost every case here reveals it first. That is not ceremony:
 * a dismissed bar is now hidden from the ACCESSIBILITY tree as well as from touch, and RNTL
 * models the accessibility tree — so a query that finds the close button without revealing it is
 * a query that a VoiceOver user's swipe would also find, which is the defect.
 *
 * Everything else below is a real render.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useState } from 'react';
import { Pressable, Text } from 'react-native';

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn<boolean, []>(() => true);

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    replace: mockReplace,
    canGoBack: () => mockCanGoBack(),
  }),
}));

import { HOME_HREF } from '@/constants/navigation';
import { useChromeReveal } from '../hooks/useChromeReveal';
import { CHROME_BAR_HEIGHT, ReadingChrome } from './ReadingChrome';

/** A host that owns the reveal hook, so a tap drives the real state the screen would. */
function Harness({ title = 'Al-Baqarah' }: { title?: string | null }) {
  const reveal = useChromeReveal();
  const [footnote, setFootnote] = useState('Page 42 · 2:255');
  return (
    <>
      <Pressable testID="surface" onPress={reveal.toggle}>
        <Text>surface</Text>
      </Pressable>
      <Pressable testID="advance" onPress={() => setFootnote('Page 43 · 2:260')}>
        <Text>advance</Text>
      </Pressable>
      <ReadingChrome reveal={reveal} title={title} footnote={footnote} />
    </>
  );
}

/** Bars are hidden from BOTH trees when dismissed, so structural queries have to opt in. */
const ANY = { includeHiddenElements: true } as const;

/** Flattened style of one bar, as an object. */
function styleOf(testID: string): Record<string, unknown> {
  const style = screen.getByTestId(testID, ANY).props.style;
  const flat = (Array.isArray(style) ? style : [style]).filter(Boolean);
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
  /** Every source file in the reading feature, comment-stripped. Tests excluded. */
  function featureSources(): string {
    const root = join(__dirname, '..');
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
          out.push(
            readFileSync(full, 'utf8')
              .replace(/\/\*[\s\S]*?\*\//g, '')
              .replace(/^\s*\/\/.*$/gm, '')
          );
        }
      }
    };
    walk(root);
    return out.join('\n');
  }

  it('the whole feature holds exactly ONE shared value and ONE withTiming', () => {
    // MUTATION: give the header and the footer their own drivers. It type-checks, it lints, it
    // renders — and it is the defect. Counted by WALKING the feature directory, so a second
    // driver cannot hide in a file this case forgot to list.
    const all = featureSources();
    expect(all.match(/useSharedValue\(/g)).toHaveLength(1);
    expect(all.match(/withTiming\(/g)).toHaveLength(1);
  });

  it('the walk really covers the feature, not two files', () => {
    // Anti-vacuity for the case above: a walk that found nothing would also count zero, and a
    // walk that found only the hook would count one and pass for the wrong reason.
    const all = featureSources();
    expect(all).toMatch(/export function ReadingChrome/);
    expect(all).toMatch(/export function useChromeReveal/);
    expect(all).toMatch(/export function useSurah/);
    expect(all).toMatch(/export function NextSurahButton/);
    expect(all).toMatch(/function VerseRowInner/);
  });

  it('both animated styles come off that one value', () => {
    // Anti-vacuity for the counts above: one shared value used by one bar, with the other bar
    // toggled some other way, would also count 1. Two `useAnimatedStyle` bodies, both naming
    // `progress`, is what makes the single count mean "shared".
    const hook = source('hooks/useChromeReveal.ts');
    expect(hook.match(/useAnimatedStyle\(/g)).toHaveLength(2);
    expect(hook.match(/progress\.value/g)?.length).toBeGreaterThanOrEqual(4);
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
  it('positions both bars absolutely', () => {
    render(<Harness />);
    expect(styleOf('reading-chrome-header')).toMatchObject({ position: 'absolute', top: 0 });
    expect(styleOf('reading-chrome-footer')).toMatchObject({ position: 'absolute', bottom: 0 });
  });

  it('keeps both bars mounted and the same size through a toggle', async () => {
    // The acceptance criterion is "page content does not shift". The bars are what could shift
    // it, so their box must not change — only opacity and a transform, which are the two things
    // that cost no layout.
    render(<Harness />);
    const before = [styleOf('reading-chrome-header'), styleOf('reading-chrome-footer')];
    await reveal();
    const after = [styleOf('reading-chrome-header'), styleOf('reading-chrome-footer')];
    for (const [b, a] of [
      [before[0], after[0]],
      [before[1], after[1]],
    ]) {
      expect(a.height).toBe(b.height);
      expect(a.position).toBe(b.position);
    }
    expect(screen.getByTestId('reading-chrome-header', ANY)).toBeTruthy();
    expect(screen.getByTestId('reading-chrome-footer', ANY)).toBeTruthy();
  });

  it('starts dismissed, and a dismissed bar takes no taps', () => {
    // ⚠️ THE STARTING STATE IS THE FROZEN ONE: "given the reading screen, when it renders, then
    // it is immersive". It shipped starting REVEALED for one round, on the argument that the exit
    // would otherwise be undiscoverable — answered instead by giving the tap back a surface (see
    // `read.tsx`'s `Gesture.Tap()`), not by moving the intent.
    render(<Harness />);
    expect(touchesOf('reading-chrome-header')).toBe('none');
    expect(touchesOf('reading-chrome-footer')).toBe('none');
  });

  it('takes taps again once revealed — and only as `box-none`', async () => {
    // ⚠️ `box-none`, NOT `auto`. The bars are 56pt bands across the top and bottom of a SCROLLING
    // surface; with `auto` the bar itself is a touch target, so a drag that starts inside those
    // bands is swallowed and the list does not scroll. `box-none` gives touches to the CHILDREN
    // — the close button — and lets everything else fall through to the reading surface.
    render(<Harness />);
    await reveal();
    expect(touchesOf('reading-chrome-header')).toBe('box-none');
    expect(touchesOf('reading-chrome-footer')).toBe('box-none');
  });

  it('stops taking taps on the LEADING edge of a dismissal', async () => {
    // A bar at `opacity: 0` that still swallows touches is an invisible dead zone across the top
    // and bottom of a reading surface — so the dismissal drops `pointerEvents` immediately rather
    // than waiting out the fade.
    render(<Harness />);
    await reveal();
    fireEvent.press(screen.getByTestId('surface'));
    expect(touchesOf('reading-chrome-header')).toBe('none');
    expect(touchesOf('reading-chrome-footer')).toBe('none');
  });

  it('does NOT take taps while it is still fading in', () => {
    // ⚠️ THE OTHER HALF, AND THE ONE THAT COSTS THE READER THE SCREEN. The reveal runs for
    // `DURATIONS.standard`; keying `pointerEvents` on `visible` makes the close button live and
    // ~transparent for that whole window, so a second tap landing in the header strip 100ms after
    // the first EXITS. Here the tap has fired and the animation has not finished.
    render(<Harness />);
    fireEvent.press(screen.getByTestId('surface'));
    expect(touchesOf('reading-chrome-header')).toBe('none');
    expect(screen.queryByTestId('reading-close')).toBeNull();
  });

  it('hides a dismissed bar from the accessibility tree, not just from touch', async () => {
    // `pointerEvents` reasons about the TOUCH tree only. A screen-reader user swiping the reading
    // surface would otherwise land on a Close button nobody can see.
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

  it('reserves a stated bar height the list can pad against', () => {
    // `tab-bar-covers-last-verse` existed because a height was exported and consumed by NOBODY.
    // This one is consumed by `read.tsx`'s content padding; the number is asserted so a change
    // there has to be deliberate.
    render(<Harness />);
    expect(CHROME_BAR_HEIGHT).toBeGreaterThanOrEqual(44);
    // The safe-area mock reports zero insets, so the rendered height is the bar's own content.
    expect(styleOf('reading-chrome-header').height).toBe(CHROME_BAR_HEIGHT);
  });
});

describe('the room has a door, and it is in CONTENT', () => {
  it('goes back when there is history to pop', async () => {
    render(<Harness />);
    await reveal();
    fireEvent.press(screen.getByTestId('reading-close'));
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('replaces to the home tab when there is none', async () => {
    // A direct URL load or a deep link has nothing to pop. ⚠️ The target is `HOME_HREF` and NOT
    // `/`: `/` is itself a redirect that pops the root stack, so routing the exit through it
    // means leaving a chromeless screen for a blank one while a queued pop settles.
    mockCanGoBack.mockReturnValue(false);
    render(<Harness />);
    await reveal();
    fireEvent.press(screen.getByTestId('reading-close'));
    expect(mockReplace).toHaveBeenCalledWith(HOME_HREF);
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('never sends the reader back to the screen they are leaving', async () => {
    // The mutation that passed every gate in story 6-0: `router.replace('/read')` in the
    // no-history branch — a mirror, not a door.
    mockCanGoBack.mockReturnValue(false);
    render(<Harness />);
    await reveal();
    fireEvent.press(screen.getByTestId('reading-close'));
    for (const call of mockReplace.mock.calls) expect(call[0]).not.toBe('/read');
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

  it('follows the verse the reader is on', async () => {
    render(<Harness />);
    await reveal();
    expect(screen.getByText('Page 42 · 2:255')).toBeTruthy();
    fireEvent.press(screen.getByTestId('advance'));
    expect(screen.getByText('Page 43 · 2:260')).toBeTruthy();
  });
});
