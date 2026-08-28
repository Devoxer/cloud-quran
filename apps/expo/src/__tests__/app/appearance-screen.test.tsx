/**
 * `/appearance` — the palette picker, the light/dark control and the Quran text-size slider,
 * driven (story 6-5, reshaped 6-6).
 *
 * Lives HERE, never beside the route: a co-located test under `app/` becomes a phantom route in
 * the web export (the rule `route-integrity.test.ts` enforces).
 *
 * ⚠️ THE GLOBAL `@/lib/theme` MOCK IS UNMOCKED FOR THIS FILE, AND THAT IS THE POINT. It returns a
 * FIXED terracotta-light object with `jest.fn()` setters, so under it the selected swatch could
 * never move and every "selecting X writes Y" case would pass against a control that does
 * nothing. The real hook reads MMKV reactively, which is what makes a selection observable.
 *
 * ⚠️ WHAT IS MOCKED IS THE WRITE SEAM (`@/lib/sync`). What `patchPreferences` DOES with a partial
 * — the merge base, the default body, the coalescing — is proven in `lib/sync.test.ts` against
 * the real outbox. What is proven only here is the wiring: which control calls it, with what,
 * and how many times. Both halves are needed: the mapping can be right while the picker writes
 * the wrong axis, and vice versa.
 *
 * ⚠️ THE AXES ARE ASSERTED SEPARATELY, IN BOTH DIRECTIONS. The model this replaced projected four
 * options onto the two axes and had "Sepia" force `themeMode: 'light'`. With six palettes that
 * coupling does not generalise — it would make four of them unreachable after dusk — so the cases
 * that matter most below are the two that read MMKV back and prove the OTHER axis did not move.
 */

const mockPatchPreferences = jest.fn();
let mockPreferences: Record<string, unknown> | null = null;

jest.unmock('@/lib/theme');

jest.mock('@/lib/sync', () => ({
  patchPreferences: (...args: unknown[]) => mockPatchPreferences(...args),
  usePreferences: () => ({ data: mockPreferences }),
}));

/**
 * ⚠️ THE SLIDER IS MOCKED SO A CASE CAN EMIT A VALUE. The real wrapper renders `@expo/ui`'s web
 * fallback — an HTML `<input type="range">` — which RNTL cannot drag, so the step-2 behaviour and
 * the same-value guard would be unobservable. The stub keeps the props visible (`step`, the
 * bounds) so the configuration is asserted rather than assumed, and exposes the handler.
 */
let sliderProps: Record<string, unknown> = {};
jest.mock('@/components/ui/Slider', () => ({
  Slider: (props: Record<string, unknown>) => {
    sliderProps = props;
    const react = require('react');
    const { View } = require('react-native');
    return react.createElement(View, { testID: props.testID });
  },
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => {
  const Stack = Object.assign(() => null, { Screen: () => null });
  return {
    Stack,
    useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
    useSegments: () => ['(tabs)', '(profile)', 'appearance'],
  };
});

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import AccountScreen from '@/app/(tabs)/(profile)/account';
import AppearanceScreen, {
  APPEARANCE_MODES,
  FONT_SIZE_STEP,
  wireTheme,
} from '@/app/(tabs)/(profile)/appearance';
import { ARABIC_FONT_SIZE, ARABIC_LINE_HEIGHT } from '@/constants/arabic';
import { BASMALA_TEXT } from '@/constants/mushaf';
import { PALETTE_NAMES, type PaletteName } from '@/constants/palettes';
import { PALETTE_KEY, setPalette, setThemeMode, THEME_MODE_KEY } from '@/lib/theme';

/** The MMKV instance `lib/theme.ts` writes — read back to assert both axes independently. */
const themeStore = require('react-native-mmkv').createMMKV({ id: 'theme' });

/** jest-expo's device scheme. `System` must mirror THIS, not the mode it replaced. */
const DEVICE_SCHEME = 'light';

beforeEach(() => {
  jest.clearAllMocks();
  mockPreferences = null;
  sliderProps = {};
  act(() => {
    setPalette('terracotta');
    setThemeMode('auto');
  });
});

/** Tap one palette swatch. */
function choosePalette(name: PaletteName) {
  act(() => {
    fireEvent.press(screen.getByTestId(`palette-swatch-${name}`));
  });
}

/** Tap one segment of the light/dark control by its index in `APPEARANCE_MODES`. */
function chooseMode(index: number) {
  act(() => {
    fireEvent.press(screen.getByTestId(`appearance-segment-${index}`));
  });
}

describe('the palette picker — six swatches, and the palette is device-local', () => {
  it('offers every palette the app ships, and names the one in force', () => {
    render(<AppearanceScreen />);
    for (const name of PALETTE_NAMES) {
      expect(screen.getByTestId(`palette-swatch-${name}`)).toBeTruthy();
    }
    expect(PALETTE_NAMES).toHaveLength(6);
    // Naming it is what makes "High contrast" findable by a reader who needs it rather than
    // only by whoever recognises the hue.
    expect(screen.getByTestId('palette-name')).toHaveTextContent('Warm');
  });

  it('choosing a palette stores it and leaves the MODE exactly where it was', () => {
    // ⚠️ THE COUPLING THIS STORY DELETED. The old picker forced `themeMode: 'light'` from a
    // colour choice; with six palettes that would strand four of them after dusk.
    act(() => setThemeMode('dark'));
    render(<AppearanceScreen />);
    choosePalette('olive');

    expect(themeStore.getString(PALETTE_KEY)).toBe('olive');
    expect(themeStore.getString(THEME_MODE_KEY)).toBe('dark');
  });

  it('sepia in the DARK scheme is a place a reader can actually be', () => {
    act(() => setThemeMode('dark'));
    render(<AppearanceScreen />);
    choosePalette('sepia');

    expect(themeStore.getString(PALETTE_KEY)).toBe('sepia');
    expect(themeStore.getString(THEME_MODE_KEY)).toBe('dark');
  });

  it('sepia is the one palette with a wire name of its own', () => {
    render(<AppearanceScreen />);
    choosePalette('sepia');
    expect(mockPatchPreferences).toHaveBeenCalledTimes(1);
    expect(mockPatchPreferences).toHaveBeenCalledWith({ theme: 'sepia' });
  });

  it('leaving sepia mirrors the plain resolved scheme again', () => {
    act(() => {
      setPalette('sepia');
      setThemeMode('dark');
    });
    render(<AppearanceScreen />);
    choosePalette('linen');
    expect(mockPatchPreferences).toHaveBeenCalledWith({ theme: 'dark' });
  });

  it('a palette change the STORED ROW already agrees with writes NOTHING', () => {
    // Six palettes collapse onto three wire values. olive and terracotta both mirror as the
    // resolved scheme, so with a row that already says `light` this tap has nothing for the
    // server to hold — an entry per tap would spend a write on a preference that never syncs.
    mockPreferences = { theme: 'light' };
    render(<AppearanceScreen />);
    choosePalette('olive');
    expect(themeStore.getString(PALETTE_KEY)).toBe('olive');
    expect(mockPatchPreferences).not.toHaveBeenCalled();
  });

  it('with NO row yet, the same tap DOES write — the row has to get created', () => {
    // ⚠️ THE ANTI-VACUITY FOR THE CASE ABOVE, and the half that was broken. The guard means
    // "the server already knows"; with `preferences` undefined it knows nothing, so a first
    // touch of this screen must create the row rather than skip because the device agrees
    // with itself.
    mockPreferences = null;
    render(<AppearanceScreen />);
    choosePalette('olive');
    expect(mockPatchPreferences).toHaveBeenCalledWith({ theme: 'light' });
  });

  it('REPAIRS a stored row that disagrees, even though this device did not change', () => {
    // ⚠️ THE CROSS-DEVICE DEFECT. Phone A wrote `sepia`; this tablet is on terracotta in dark.
    // Tapping Dark changes nothing locally — the old guard compared this device's derived value
    // against itself and returned early, so the row stayed `sepia` forever. Comparing against
    // the row is what makes the disagreement visible and self-healing.
    mockPreferences = { theme: 'sepia' };
    act(() => setThemeMode('dark'));
    render(<AppearanceScreen />);
    chooseMode(APPEARANCE_MODES.indexOf('dark'));
    expect(mockPatchPreferences).toHaveBeenCalledWith({ theme: 'dark' });
  });

  it('the selected swatch is the STORED one, not the first', () => {
    act(() => setPalette('midnight'));
    render(<AppearanceScreen />);
    expect(screen.getByTestId('palette-swatch-midnight').props.accessibilityState.selected).toBe(
      true
    );
    expect(screen.getByTestId('palette-swatch-terracotta').props.accessibilityState.selected).toBe(
      false
    );
    expect(screen.getByTestId('palette-name')).toHaveTextContent('Night');
  });
});

describe('the appearance control — System / Light / Dark, and nothing else', () => {
  it('renders exactly the three modes, labelled from the bundle', () => {
    render(<AppearanceScreen />);
    expect(screen.getByText('System')).toBeTruthy();
    expect(screen.getByText('Light')).toBeTruthy();
    expect(screen.getByText('Dark')).toBeTruthy();
    expect(APPEARANCE_MODES).toHaveLength(3);
    // There is no fourth segment: a palette is not a scheme.
    expect(screen.queryByTestId('appearance-segment-3')).toBeNull();
  });

  it('choosing a mode stores it and leaves the PALETTE exactly where it was', () => {
    act(() => setPalette('midnight'));
    render(<AppearanceScreen />);
    chooseMode(APPEARANCE_MODES.indexOf('dark'));

    expect(themeStore.getString(THEME_MODE_KEY)).toBe('dark');
    expect(themeStore.getString(PALETTE_KEY)).toBe('midnight');
  });

  it('System mirrors the DEVICE scheme, never a mode name the column has no room for', () => {
    // ⚠️ FROM AN EXPLICIT DARK, so the resolved scheme being left behind is not the answer.
    // The wire column is `'light' | 'sepia' | 'dark'`; `'auto'` would be a 422 the drain drops.
    act(() => setThemeMode('dark'));
    render(<AppearanceScreen />);
    chooseMode(APPEARANCE_MODES.indexOf('auto'));

    expect(themeStore.getString(THEME_MODE_KEY)).toBe('auto');
    expect(mockPatchPreferences).toHaveBeenCalledWith({ theme: DEVICE_SCHEME });
    expect(mockPatchPreferences).not.toHaveBeenCalledWith({ theme: 'auto' });
  });

  it('choosing Dark mirrors dark', () => {
    render(<AppearanceScreen />);
    chooseMode(APPEARANCE_MODES.indexOf('dark'));
    expect(mockPatchPreferences).toHaveBeenCalledTimes(1);
    expect(mockPatchPreferences).toHaveBeenCalledWith({ theme: 'dark' });
  });

  it('a mode change that does not move the resolved scheme writes nothing', () => {
    // Auto already resolves to the device's light here, so pinning Light is a device-local
    // change only — and the row already says what the reader is looking at.
    mockPreferences = { theme: 'light' };
    render(<AppearanceScreen />);
    chooseMode(APPEARANCE_MODES.indexOf('light'));
    expect(themeStore.getString(THEME_MODE_KEY)).toBe('light');
    expect(mockPatchPreferences).not.toHaveBeenCalled();
  });

  it('a mode change under sepia keeps the wire value on sepia', () => {
    mockPreferences = { theme: 'sepia' };
    act(() => setPalette('sepia'));
    render(<AppearanceScreen />);
    chooseMode(APPEARANCE_MODES.indexOf('dark'));
    expect(themeStore.getString(THEME_MODE_KEY)).toBe('dark');
    // sepia is the palette's own wire name in BOTH schemes, so nothing moved on the wire.
    expect(mockPatchPreferences).not.toHaveBeenCalled();
  });

  it('the rendered control highlights the stored mode, not the first segment', () => {
    act(() => setThemeMode('dark'));
    render(<AppearanceScreen />);
    const dark = APPEARANCE_MODES.indexOf('dark');
    expect(screen.getByTestId(`appearance-segment-${dark}`).props.accessibilityState.selected).toBe(
      true
    );
    expect(screen.getByTestId('appearance-segment-0').props.accessibilityState.selected).toBe(
      false
    );
  });
});

describe('wireTheme — what the NOT-NULL, three-literal column is told', () => {
  it('never invents a value the worker would refuse', () => {
    for (const name of PALETTE_NAMES) {
      for (const scheme of ['light', 'dark'] as const) {
        expect(['light', 'sepia', 'dark']).toContain(wireTheme(name, scheme));
      }
    }
  });

  it('sepia is sepia in BOTH schemes — the palette is the coarse look', () => {
    expect(wireTheme('sepia', 'light')).toBe('sepia');
    expect(wireTheme('sepia', 'dark')).toBe('sepia');
  });

  it('every other palette reports the plain resolved scheme', () => {
    for (const name of PALETTE_NAMES.filter((n) => n !== 'sepia')) {
      expect(wireTheme(name, 'light')).toBe('light');
      expect(wireTheme(name, 'dark')).toBe('dark');
    }
    // Anti-vacuity: the filter left something behind.
    expect(PALETTE_NAMES.filter((n) => n !== 'sepia')).toHaveLength(5);
  });
});

describe('the font-size slider — integers, live, and one write per real change', () => {
  it('is configured over the Arabic scale in steps of two', () => {
    render(<AppearanceScreen />);
    expect(sliderProps.minimumValue).toBe(ARABIC_FONT_SIZE.min);
    expect(sliderProps.maximumValue).toBe(ARABIC_FONT_SIZE.max);
    expect(sliderProps.step).toBe(FONT_SIZE_STEP);
  });

  it('a fresh guest with no preferences shows the default size', () => {
    mockPreferences = null;
    render(<AppearanceScreen />);
    expect(screen.getByTestId('font-size-value')).toHaveTextContent(
      String(ARABIC_FONT_SIZE.default)
    );
    expect(sliderProps.value).toBe(ARABIC_FONT_SIZE.default);
  });

  it('seeds from the CACHED preference when there is one', () => {
    mockPreferences = { fontSize: 36 };
    render(<AppearanceScreen />);
    expect(sliderProps.value).toBe(36);
    // …and does not write on mount: showing a value is not choosing it.
    expect(mockPatchPreferences).not.toHaveBeenCalled();
  });

  it('a change writes an INTEGER in range, and updates the label on the same tick', () => {
    render(<AppearanceScreen />);
    act(() => (sliderProps.onValueChange as (v: number) => void)(36));

    expect(mockPatchPreferences).toHaveBeenCalledWith({ fontSize: 36, theme: 'light' });
    expect(Number.isInteger(mockPatchPreferences.mock.calls[0][0].fontSize)).toBe(true);
    expect(screen.getByTestId('font-size-value')).toHaveTextContent('36');
  });

  it('rounds anything fractional — the worker rejects a fraction outright', () => {
    // `intIn(fontSize, 20, 44)` refuses `33.5`, and `clampArabicFontSize` clamps without
    // rounding, so the rounding has to happen here or the entry can only be 422-and-dropped.
    render(<AppearanceScreen />);
    act(() => (sliderProps.onValueChange as (v: number) => void)(33.5));
    expect(mockPatchPreferences).toHaveBeenCalledWith({ fontSize: 34, theme: 'light' });
  });

  it('clamps a value outside the scale rather than sending it', () => {
    render(<AppearanceScreen />);
    act(() => (sliderProps.onValueChange as (v: number) => void)(999));
    expect(mockPatchPreferences).toHaveBeenCalledWith({
      fontSize: ARABIC_FONT_SIZE.max,
      theme: 'light',
    });
  });

  it('THE SAME-VALUE GUARD: repeated emissions of one value write exactly once', () => {
    // ⚠️ `step` QUANTIZES THE VALUE, NOT THE EVENT RATE. Dragging one pixel back and forth over a
    // step boundary fires `onValueChange` repeatedly with the SAME number; without this guard
    // each one is a cache write, a re-render of every verse row on the reading screen, an outbox
    // coalesce and a re-armed drain timer.
    render(<AppearanceScreen />);
    const emit = sliderProps.onValueChange as (v: number) => void;
    act(() => {
      emit(30);
      emit(30);
      emit(30);
    });
    expect(mockPatchPreferences).toHaveBeenCalledTimes(1);
  });

  it('does not write when the first emission equals the value already stored', () => {
    // The ref is seeded from the cached preference, so opening the screen and nudging the thumb
    // back to where it was is not a change.
    mockPreferences = { fontSize: 30 };
    render(<AppearanceScreen />);
    act(() => (sliderProps.onValueChange as (v: number) => void)(30));
    expect(mockPatchPreferences).not.toHaveBeenCalled();
  });

  it.each([
    // themeMode, palette, the look the size write must carry
    ['dark', 'terracotta', 'dark'],
    ['light', 'sepia', 'sepia'],
  ])('a size write from a %s / %s reader creates the row as %s, not the default light', (mode, palette, expected) => {
    // ⚠️ THE ROW CAN BE CREATED BY THE SLIDER, AND USED TO BE CREATED WRONG. `patchPreferences`
    // completes the body from `DEFAULT_PREFERENCES`, whose `theme` is the literal `'light'`.
    // A reader in Dark or Parchment with no row yet, who only ever drags this slider, would
    // therefore create their row describing a screen they are not looking at — and the mirror
    // guard would never repair it, because the device agrees with itself.
    mockPreferences = null;
    act(() => {
      setPalette(palette as 'terracotta' | 'sepia');
      setThemeMode(mode as 'light' | 'dark');
    });
    render(<AppearanceScreen />);
    act(() => (sliderProps.onValueChange as (v: number) => void)(34));

    expect(mockPatchPreferences).toHaveBeenCalledWith({ fontSize: 34, theme: expected });
  });

  it('TRACKS A PREFERENCES ROW THAT ARRIVES AFTER MOUNT — thumb, number and guard', () => {
    // ⚠️ `usePreferences()` IS `undefined` UNTIL THE PULL LANDS. Seeding `useState` once and
    // never tracking it left a signed-in reader whose row says 40, opening this screen first,
    // looking at 28 here while `read.tsx` rendered verses at 40 — and `lastWritten` stale with
    // it, so the first nudge wrote off a number they never chose.
    mockPreferences = null;
    const { rerender } = render(<AppearanceScreen />);
    expect(sliderProps.value).toBe(ARABIC_FONT_SIZE.default);

    mockPreferences = { fontSize: 40 };
    act(() => rerender(<AppearanceScreen />));

    expect(sliderProps.value).toBe(40);
    expect(screen.getByTestId('font-size-value')).toHaveTextContent('40');
    // …and the guard re-seeded with it: nudging the thumb back onto the arrived value is not a
    // change, so it must not queue a write.
    act(() => (sliderProps.onValueChange as (v: number) => void)(40));
    expect(mockPatchPreferences).not.toHaveBeenCalled();
    // Anti-vacuity: a DIFFERENT value still writes, off the arrived number rather than the seed.
    act(() => (sliderProps.onValueChange as (v: number) => void)(42));
    expect(mockPatchPreferences).toHaveBeenCalledWith({ fontSize: 42, theme: 'light' });
  });

  it('a drag through every step writes once per DISTINCT step', () => {
    render(<AppearanceScreen />);
    const emit = sliderProps.onValueChange as (v: number) => void;
    const steps: number[] = [];
    for (let v = ARABIC_FONT_SIZE.min; v <= ARABIC_FONT_SIZE.max; v += FONT_SIZE_STEP)
      steps.push(v);
    act(() => {
      for (const v of steps) {
        emit(v);
        emit(v); // the jitter the guard absorbs
      }
    });
    // TWENTY-SIX emissions, THIRTEEN writes. The guard compares against the last value WRITTEN,
    // not against the seed forever — so every distinct step still writes, and only the duplicate
    // of each one is absorbed. That is the whole difference between "the outbox coalesces this"
    // (which it does, downstream) and "the UI stops re-rendering the reading list twice a step".
    expect(steps).toHaveLength(13);
    expect(mockPatchPreferences).toHaveBeenCalledTimes(steps.length);
  });
});

describe('the live preview — the same face and ratio the verse rows use', () => {
  it('renders the basmala at the live size with the Arabic line height', () => {
    render(<AppearanceScreen />);
    act(() => (sliderProps.onValueChange as (v: number) => void)(40));

    const preview = screen.getByTestId('font-size-preview');
    expect(preview).toHaveTextContent(BASMALA_TEXT);
    const style = (
      Array.isArray(preview.props.style) ? preview.props.style.flat(3) : [preview.props.style]
    )
      .filter(Boolean)
      .reduce((acc: Record<string, unknown>, s: object) => Object.assign(acc, s), {});
    expect(style.fontSize).toBe(40);
    expect(style.lineHeight).toBe(40 * ARABIC_LINE_HEIGHT);
    // RTL locally, never an app-wide flip — the same choice `VerseRow` makes.
    expect(style.writingDirection).toBe('rtl');
    expect(style.textAlign).toBe('right');
  });
});

describe('the door — and the chrome it must not draw', () => {
  it('the settings home has an Appearance row that pushes /appearance', () => {
    render(<AccountScreen />);
    fireEvent.press(screen.getByTestId('appearance-row'));
    expect(mockPush).toHaveBeenCalledWith('/appearance');
  });

  it('the screen writes no native header control and no headerShown', () => {
    // ⚠️ SOURCE-SCANNED, because a rendered test cannot see an option that is merely PASSED.
    // The `(profile)` layout owns the header (`AppHeader`) and the tab bar; a screen reaching for
    // the native stack header is the defect `lint:header-controls` exists for, and on an
    // Apple-silicon Mac running the iPhone build such a control is drawn and never clickable.
    // ⚠️ COMMENTS STRIPPED FIRST. The screen's own docblock EXPLAINS that it sets no
    // `headerShown` and reaches for no native slot, so a raw-text scan matches the file's own
    // changelog and fails on a correct file — the same trap `root-layout-boot.test.ts` documents.
    const source: string = require('node:fs')
      .readFileSync(
        require('node:path').join(
          __dirname,
          '..',
          '..',
          'app',
          '(tabs)',
          '(profile)',
          'appearance.tsx'
        ),
        'utf8'
      )
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(source).not.toMatch(/headerShown/);
    expect(source).not.toMatch(/headerLeft|headerRight/);
    expect(source).not.toMatch(/unstable_header/);
    expect(source).not.toMatch(/Stack\.Toolbar/);
    // Anti-vacuity: the file exists and is the screen.
    expect(source).toMatch(/export default function AppearanceScreen/);
  });
});
