/**
 * Icon + icon-registry tests (Story 17.4.2 Thread E, AC-19).
 *
 * - Render-smoke: <Icon> renders for a semantic name and forwards testID.
 * - Registry completeness: EVERY entry maps to a non-empty `sf` (iOS SF Symbol) AND `ion`
 *   (Android/Web Ionicons) name. tsc already guarantees the names are VALID (the typed unions
 *   reject typos); this guards against an accidentally-empty entry the type system would still
 *   allow only if widened — it stays a real, cheap regression net. Story 28.2: `md` → `ion`.
 */
import { render } from '@testing-library/react-native';
import * as rtl from '@/lib/rtl';
import { Icon } from './Icon';
import { ICON_REGISTRY, type IconName, mirrorIcon, RTL_MIRRORED_ICONS } from './icon-registry';

describe('Icon', () => {
  it('renders for a semantic name and forwards testID', () => {
    const { getByTestId } = render(<Icon name="search" testID="icon-search" />);
    expect(getByTestId('icon-search')).toBeTruthy();
  });

  it('renders a registry name that uses the outline→base Material mapping', () => {
    const { getByTestId } = render(<Icon name="trash-outline" testID="icon-trash" />);
    expect(getByTestId('icon-trash')).toBeTruthy();
  });
});

describe('ICON_REGISTRY', () => {
  const names = Object.keys(ICON_REGISTRY) as IconName[];

  it('has entries', () => {
    expect(names.length).toBeGreaterThan(50);
  });

  it.each(names)('maps "%s" to a non-empty sf + ion name', (name) => {
    const entry = ICON_REGISTRY[name];
    expect(typeof entry.sf).toBe('string');
    expect(entry.sf.length).toBeGreaterThan(0);
    expect(typeof entry.ion).toBe('string');
    expect(entry.ion.length).toBeGreaterThan(0);
  });
});

describe('mirrorIcon — the RTL swap for literal Ionicons glyphs (story 8-1)', () => {
  it('is the identity in LTR', () => {
    for (const name of Object.keys(RTL_MIRRORED_ICONS) as IconName[]) {
      expect(mirrorIcon(name, false)).toBe(name);
    }
  });

  it('swaps every directional pair in RTL', () => {
    expect(mirrorIcon('chevron-back', true)).toBe('chevron-forward');
    expect(mirrorIcon('chevron-forward', true)).toBe('chevron-back');
    expect(mirrorIcon('arrow-back', true)).toBe('arrow-forward');
    expect(mirrorIcon('arrow-forward', true)).toBe('arrow-back');
  });

  it('leaves a non-directional glyph alone in RTL', () => {
    expect(mirrorIcon('search', true)).toBe('search');
    expect(mirrorIcon('bookmark', true)).toBe('bookmark');
  });

  it('is an INVOLUTION — every mirror is itself mirrored back', () => {
    // A half-filled table is the live failure mode: map `chevron-back` without its partner and
    // one of the two chevrons points the wrong way in Arabic, which nothing else here can see.
    for (const name of Object.keys(RTL_MIRRORED_ICONS) as IconName[]) {
      expect(mirrorIcon(mirrorIcon(name, true), true)).toBe(name);
    }
  });

  it('names only icons the registry actually has', () => {
    for (const [from, to] of Object.entries(RTL_MIRRORED_ICONS)) {
      expect(ICON_REGISTRY).toHaveProperty(from);
      expect(ICON_REGISTRY).toHaveProperty(to as string);
    }
  });
});

describe('Icon — the RTL swap is WIRED, not merely available (story 8-1)', () => {
  /**
   * ⚠️ THE TABLE'S TESTS CANNOT SEE THE WIRING, AND THAT WAS MEASURED. Dropping the RTL branch
   * from `mirrorIcon` AND from `progressFromTouch` at the same time left 63 suites / 1005 tests
   * green at this story's review: the pure helpers are well covered and were simply never routed
   * through, because `isRTL()` answers `false` under Jest. These cases render the real components
   * with the direction forced, and assert the GLYPH NAME that reaches the icon font.
   *
   * ⚠️ THE ANDROID/WEB RENDERER IS REQUIRED BY ITS EXACT FILENAME. `jest-expo` resolves a bare
   * `./Icon` to `Icon.ios.tsx`, so the suite above — and every other suite in the app — only ever
   * exercises the SF Symbols path. The Ionicons path is the one that needs the swap, and it is
   * reachable only like this.
   */
  // biome-ignore lint/suspicious/noExplicitAny: a platform-suffixed module has no static type here
  const IonIcon = (require('./Icon.tsx') as any).Icon as typeof Icon;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /** The glyph name the icon font is actually handed. */
  const glyphOf = (tree: ReturnType<typeof render>, testID: string): unknown =>
    // biome-ignore lint/suspicious/noExplicitAny: the mock's node shape is untyped
    (tree.getByTestId(testID).children[0] as any).props.name;

  it('Android/web: draws `chevron-back` as the FORWARD glyph under RTL', () => {
    jest.spyOn(rtl, 'isRTL').mockReturnValue(true);
    expect(glyphOf(render(<IonIcon name="chevron-back" testID="i" />), 'i')).toBe(
      'chevron-forward'
    );
  });

  it('Android/web: draws `chevron-back` as itself under LTR — the mutation control', () => {
    jest.spyOn(rtl, 'isRTL').mockReturnValue(false);
    expect(glyphOf(render(<IonIcon name="chevron-back" testID="i" />), 'i')).toBe('chevron-back');
  });

  it('Android/web: leaves a non-directional glyph alone under RTL', () => {
    jest.spyOn(rtl, 'isRTL').mockReturnValue(true);
    expect(glyphOf(render(<IonIcon name="search" testID="i" />), 'i')).toBe('search');
  });

  /**
   * ⚠️ THESE FOUR CASES REPLACE ONE THAT PINNED THE OPPOSITE, AND THE OLD ONE WAS GREEN THE WHOLE
   * TIME THE APP WAS BROKEN. It asserted `chevron-back` stays `chevron.backward` on iOS under RTL,
   * on the theory that Apple's direction-aware SF names mirror themselves from
   * `semanticContentAttribute`. `expo-symbols`' `SymbolView` does not do that: measured in the
   * Arabic build on the owner's iPhone 2026-09-13, every directional glyph pointed the wrong way
   * inside a correctly mirrored layout. The registry's `sf` names are absolute now and iOS runs the
   * same `mirrorIcon` swap Android and web do, so what must be pinned is that it DOES swap — and
   * that the absolute name is what the swap starts from, since a registry that quietly went back to
   * `chevron.backward` would leave these passing while the device regressed.
   */
  it('iOS: draws `chevron-back` as the RIGHT-pointing SF glyph under RTL', () => {
    jest.spyOn(rtl, 'isRTL').mockReturnValue(true);
    expect(glyphOf(render(<Icon name="chevron-back" testID="i" />), 'i')).toBe('chevron.right');
  });

  it('iOS: draws `chevron-back` as the LEFT-pointing SF glyph under LTR — the mutation control', () => {
    jest.spyOn(rtl, 'isRTL').mockReturnValue(false);
    expect(glyphOf(render(<Icon name="chevron-back" testID="i" />), 'i')).toBe('chevron.left');
  });

  it('iOS: mirrors the arrows too, in both directions', () => {
    jest.spyOn(rtl, 'isRTL').mockReturnValue(true);
    expect(glyphOf(render(<Icon name="arrow-back" testID="a" />), 'a')).toBe('arrow.right');
    expect(glyphOf(render(<Icon name="arrow-forward" testID="b" />), 'b')).toBe('arrow.left');
  });

  it('iOS: leaves a non-directional glyph alone under RTL', () => {
    jest.spyOn(rtl, 'isRTL').mockReturnValue(true);
    expect(glyphOf(render(<Icon name="search" testID="i" />), 'i')).toBe('magnifyingglass');
  });
});

describe('ICON_REGISTRY — the navigational SF names are ABSOLUTE (story 8-1 follow-up)', () => {
  /**
   * The swap above cannot see this, and it is the half that regresses by "helpfully" restoring
   * Apple's semantic names: paired with `mirrorIcon` they would be mirrored TWICE — once by our
   * table, once by whatever honours `semanticContentAttribute` — which is how this defect gets
   * reintroduced by someone fixing it.
   */
  it.each([
    ['chevron-back', 'chevron.left'],
    ['chevron-forward', 'chevron.right'],
    ['arrow-back', 'arrow.left'],
    ['arrow-forward', 'arrow.right'],
  ] as const)('%s maps to the literal SF name %s', (name, sf) => {
    expect(ICON_REGISTRY[name].sf).toBe(sf);
  });

  it('names no direction-aware SF symbol anywhere in the registry', () => {
    for (const entry of Object.values(ICON_REGISTRY)) {
      expect(entry.sf).not.toMatch(/\.(backward|forward)$/);
    }
  });
});
