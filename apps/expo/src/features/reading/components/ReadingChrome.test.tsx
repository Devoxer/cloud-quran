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
 * Everything else below is a real render.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react-native';
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

/** Flattened style of one bar, as an object. */
function styleOf(testID: string): Record<string, unknown> {
  const style = screen.getByTestId(testID).props.style;
  const flat = (Array.isArray(style) ? style : [style]).filter(Boolean);
  return Object.assign({}, ...flat.map((s: unknown) => (typeof s === 'object' ? s : {})));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCanGoBack.mockReturnValue(true);
});

describe('one driver', () => {
  const source = (...segments: string[]) =>
    readFileSync(join(__dirname, '..', ...segments), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

  it('the whole feature holds exactly ONE shared value and ONE withTiming', () => {
    // MUTATION: give the header and the footer their own drivers. It type-checks, it lints, it
    // renders — and it is the defect. Counted over the FEATURE, not one file, so moving the
    // second driver into the component is not an escape.
    const files = ['hooks/useChromeReveal.ts', 'components/ReadingChrome.tsx'];
    const all = files.map((f) => source(f)).join('\n');
    expect(all.match(/useSharedValue\(/g)).toHaveLength(1);
    expect(all.match(/withTiming\(/g)).toHaveLength(1);
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

describe('it overlays; it never occupies layout', () => {
  it('positions both bars absolutely', () => {
    render(<Harness />);
    expect(styleOf('reading-chrome-header')).toMatchObject({ position: 'absolute', top: 0 });
    expect(styleOf('reading-chrome-footer')).toMatchObject({ position: 'absolute', bottom: 0 });
  });

  it('keeps both bars mounted and the same size through a toggle', () => {
    // The acceptance criterion is "page content does not shift". The bars are what could shift
    // it, so their box must not change — only opacity and a transform, which are the two things
    // that cost no layout.
    render(<Harness />);
    const before = [styleOf('reading-chrome-header'), styleOf('reading-chrome-footer')];
    fireEvent.press(screen.getByTestId('surface'));
    const after = [styleOf('reading-chrome-header'), styleOf('reading-chrome-footer')];
    for (const [b, a] of [
      [before[0], after[0]],
      [before[1], after[1]],
    ]) {
      expect(a.height).toBe(b.height);
      expect(a.position).toBe(b.position);
    }
    expect(screen.getByTestId('reading-chrome-header')).toBeTruthy();
    expect(screen.getByTestId('reading-chrome-footer')).toBeTruthy();
  });

  it('stops taking taps when it is dismissed, and takes them again when it is not', () => {
    // A bar at `opacity: 0` that still swallows touches is an invisible dead zone across the top
    // and bottom of a reading surface.
    render(<Harness />);
    expect(screen.getByTestId('reading-chrome-header').props.pointerEvents).toBe('auto');
    fireEvent.press(screen.getByTestId('surface'));
    expect(screen.getByTestId('reading-chrome-header').props.pointerEvents).toBe('none');
    expect(screen.getByTestId('reading-chrome-footer').props.pointerEvents).toBe('none');
    fireEvent.press(screen.getByTestId('surface'));
    expect(screen.getByTestId('reading-chrome-header').props.pointerEvents).toBe('auto');
    expect(screen.getByTestId('reading-chrome-footer').props.pointerEvents).toBe('auto');
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
  it('goes back when there is history to pop', () => {
    render(<Harness />);
    fireEvent.press(screen.getByTestId('reading-close'));
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('replaces to the home tab when there is none', () => {
    // A direct URL load or a deep link has nothing to pop. ⚠️ The target is `HOME_HREF` and NOT
    // `/`: `/` is itself a redirect that pops the root stack, so routing the exit through it
    // means leaving a chromeless screen for a blank one while a queued pop settles.
    mockCanGoBack.mockReturnValue(false);
    render(<Harness />);
    fireEvent.press(screen.getByTestId('reading-close'));
    expect(mockReplace).toHaveBeenCalledWith(HOME_HREF);
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('never sends the reader back to the screen they are leaving', () => {
    // The mutation that passed every gate in story 6-0: `router.replace('/read')` in the
    // no-history branch — a mirror, not a door.
    mockCanGoBack.mockReturnValue(false);
    render(<Harness />);
    fireEvent.press(screen.getByTestId('reading-close'));
    for (const call of mockReplace.mock.calls) expect(call[0]).not.toBe('/read');
  });

  it('installs no control into a native header slot', () => {
    const chrome = readFileSync(join(__dirname, 'ReadingChrome.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(chrome).not.toMatch(/header(?:Left|Right)/);
    expect(chrome).not.toMatch(/setOptions/);
  });
});

describe('what the bars say', () => {
  it('names the surah once the metadata read lands, and renders empty before it', () => {
    const { rerender } = render(<Harness title={null} />);
    expect(screen.queryByText('Al-Baqarah')).toBeNull();
    rerender(<Harness title="Al-Baqarah" />);
    expect(screen.getByText('Al-Baqarah')).toBeTruthy();
  });

  it('follows the verse the reader is on', () => {
    render(<Harness />);
    expect(screen.getByText('Page 42 · 2:255')).toBeTruthy();
    fireEvent.press(screen.getByTestId('advance'));
    expect(screen.getByText('Page 43 · 2:260')).toBeTruthy();
  });
});
