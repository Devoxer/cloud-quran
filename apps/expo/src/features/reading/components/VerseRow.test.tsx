/**
 * `VerseRow` — one ayah (story 6-1; the bookmark control folded back in 6-4).
 *
 * ⚠️ THIS COMPONENT HAD NO TEST FILE AT ALL, AND TWO OF ITS FOUR DECISIONS WERE SILENTLY
 * REMOVABLE.
 *
 *   • **`memo`**, which its own docblock calls load-bearing. Stripping it is invisible: the row
 *     renders identically, every screen case passes, and the cost is that ONE chrome toggle
 *     re-renders all 286 rows of Al-Baqarah — each re-running `useThemedStyles` and re-measuring
 *     a full paragraph of Arabic. A performance decision nothing pins is a decision that gets
 *     removed by the next person who finds it noisy.
 *   • **The row is not a control.** It carried an `onPress` for one round; giving the chrome tap
 *     back to the surface (an RNGH gesture in `read.tsx`) is what frees the verse tap for epic 7
 *     and what let the chrome ship hidden, as the frozen criterion requires. A `Pressable` here
 *     again re-opens both. Story 6-4 adds the bookmark control INSIDE the meta row — a small
 *     target, not the row tap — so "the row takes no tap" survives with one button in it.
 *
 * The direction and the type scale are asserted here rather than only through the screen, because
 * they are this component's own contract: Arabic needs `writingDirection` + `textAlign` locally,
 * and the app has no RTL infrastructure to lean on.
 *
 * ⚠️ TWO MORE CASES ARRIVED ON 2026-08-27, BOTH FOLDED BACK FROM THE PRE-FORK ROW, AND BOTH WERE
 * INVISIBLE TO EVERY OTHER GATE — the surface rendered, typechecked, linted and passed 100+ suites
 * while showing a bullet-hole mid-word in a third of the book and a `2:16` debug label above every
 * verse. The badge geometry is asserted as MEASURED NUMBERS, not as an expression over the
 * component's own ratio constants: a test that recomputes the formula agrees with any formula.
 */

import { fireEvent, render, screen } from '@testing-library/react-native';
import { memo } from 'react';
import { ARABIC_LINE_HEIGHT, UTHMANI_FONT_FAMILY } from '@/constants/arabic';
import { VerseRow, type VerseRowProps } from './VerseRow';

/** ARABIC SMALL HIGH ROUNDED ZERO — the mark the KFGQPC face draws at full letter size. */
const ROUNDED_ZERO = '\u06DF';

/** The mocked theme's tokens (jest.setup's fixed terracotta·light) the control resolves. */
const ACCENT_PRIMARY = '#C65D3B';
const TEXT_SECONDARY = '#5C534A';

function renderRow(props: Partial<VerseRowProps> = {}) {
  return render(
    <VerseRow
      surah={1}
      verse={1}
      text="بِسْمِ"
      fontSize={28}
      bookmarked={false}
      onToggleBookmark={() => {}}
      {...props}
    />
  );
}

/** Flatten whatever a host element's `style` prop is into one object. */
function flatten(style: unknown): Record<string, unknown> {
  const parts = (Array.isArray(style) ? style.flat(2) : [style]).filter(Boolean);
  return Object.assign({}, ...parts.map((s: unknown) => (typeof s === 'object' ? s : {})));
}

/** The flattened style of a rendered text node. */
function styleOf(text: string): Record<string, unknown> {
  return flatten(screen.getByText(text).props.style);
}

/** The SF glyph and tint the bookmark control's icon actually renders with. */
function bookmarkIcon(verse: number): { name: unknown; tintColor: unknown } {
  // `includeHiddenElements`: the glyph is deliberately a11y-hidden (decorative — the Pressable
  // carries the label), which also hides it from RNTL's default queries.
  const frame = screen.getByTestId(`bookmark-icon-${verse}`, { includeHiddenElements: true });
  const symbol = (frame.props as { children: { props: { name?: unknown; tintColor?: unknown } } })
    .children;
  return { name: symbol.props.name, tintColor: symbol.props.tintColor };
}

describe('it renders the ayah, in the Uthmani face', () => {
  it('shows the text', () => {
    renderRow({ verse: 255, text: 'ٱللَّهُ', testID: 'row' });
    expect(screen.getByText('ٱللَّهُ')).toBeTruthy();
  });

  it('sets its own direction locally — the app itself stays LTR', () => {
    // Cloud Quran has no RTL infrastructure: `I18nManager.forceRTL` is unbuilt tree-wide and the
    // interface ships one locale. What Arabic actually needs is on the text itself.
    renderRow();
    const arabic = styleOf('بِسْمِ');
    expect(arabic.writingDirection).toBe('rtl');
    expect(arabic.textAlign).toBe('right');
    expect(arabic.fontFamily).toBe(UTHMANI_FONT_FAMILY);
  });

  it('takes the size it is given and derives the line height from it', () => {
    // ⚠️ NO FIXED HEIGHT, ANYWHERE — verse height varies with the Arabic length, the chosen size
    // and the width. Story 1-7.5 fixed "scrolls to the wrong place" by REMOVING the estimate.
    renderRow({ fontSize: 40 });
    const arabic = styleOf('بِسْمِ');
    expect(arabic.fontSize).toBe(40);
    expect(arabic.lineHeight).toBe(40 * ARABIC_LINE_HEIGHT);
    expect(arabic.height).toBeUndefined();
  });
});

describe('U+06DF is stripped for display', () => {
  // ⚠️ A MEASURED FONT DEFECT, RE-CONFIRMED IN CHROMIUM ON 2026-08-27 AGAINST THIS REPO'S OWN
  // `KFGQPCUthmanicScriptHAFS.ttf`: beside a lone waw at 200px the mark renders as a solid black
  // disc wider than the letter, and 2,240 of the 6,236 verses carry at least one. The pre-fork row
  // had the strip and the reason; story 6-1 shipped without both. Story 6-4 moved the regex to
  // `constants/arabic.ts` (`stripDisplayMarks`) so the bookmarks preview shares it — these cases
  // now pin that the row still CONSUMES it.
  const RAW = `أُو${ROUNDED_ZERO}لَٰٓئِكَ`;

  it('renders the verse without the mark', () => {
    renderRow({ verse: 5, text: RAW });
    expect(screen.queryByText(RAW)).toBeNull();
    expect(screen.getByText(RAW.replaceAll(ROUNDED_ZERO, ''))).toBeTruthy();
  });

  it('strips ONLY that mark, not its neighbours in the block', () => {
    // ⚠️ ANTI-VACUITY, AND A REAL RISK. A broader class — `\p{Mn}`, or the `ۖ-ۭ` range
    // the waqf signs live in — would satisfy the case above and quietly delete the pause marks and
    // the small high seen that ARE drawn correctly. U+06E0 (SMALL HIGH UPRIGHT RECTANGULAR ZERO)
    // is the closest neighbour by name and by codepoint; it must survive.
    const RECTANGULAR_ZERO = '\u06E0';
    const mixed = `أُو${ROUNDED_ZERO}لَٰٓ${RECTANGULAR_ZERO}ئِكَ`;
    renderRow({ verse: 5, text: mixed });
    const rendered = screen.getByText(mixed.replace(ROUNDED_ZERO, '')).props.children as string;
    expect(rendered).toHaveLength(mixed.length - 1);
    expect(rendered).not.toContain(ROUNDED_ZERO);
    expect(rendered).toContain(RECTANGULAR_ZERO);
  });

  it('leaves a verse that has no mark exactly as the database holds it', () => {
    const clean = 'بِسْمِ ٱللَّهِ';
    renderRow({ text: clean });
    expect(screen.getByText(clean).props.children).toBe(clean);
  });
});

describe('the ayah reference is a circular badge, sized off the reader', () => {
  /**
   * The badge `View`'s flattened style. Reached by `testID` rather than by walking up from the
   * numeral: RNTL's `.parent` lands on the `Text` host, not on the ring around it.
   */
  function badgeStyle(verse: number): Record<string, unknown> {
    return flatten(screen.getByTestId(`ayah-badge-${verse}`).props.style);
  }

  it('shows the ayah number alone, not the `surah:verse` pair', () => {
    // ⚠️ THE REGRESSION THIS PINS. The row printed `2:16` as plain text on a line of its own,
    // left of the verse — which is what made the reading surface read as a debug view. The list
    // is one surah and the chrome footer names it; the row owes only the ayah number.
    renderRow({ verse: 16 });
    expect(screen.getByText('16')).toBeTruthy();
    expect(screen.queryByText('2:16')).toBeNull();
  });

  it('is a circle at the measured geometry — 28pt verse ⇒ 26pt ring, 14.3pt numeral', () => {
    renderRow({ verse: 16 });
    const badge = badgeStyle(16);
    // A circle: width === height, and the radius is exactly half of it. `borderRadius` at
    // anything less than half turns the ring into a rounded square.
    expect(badge.width).toBe(26);
    expect(badge.height).toBe(26);
    expect(badge.borderRadius).toBe(13);
    expect(badge.borderWidth).toBe(1.5);
    const numeral = styleOf('16');
    expect(numeral.fontSize).toBe(14.3);
    expect(numeral.fontWeight).toBe('600');
  });

  it('grows with the reader — 44pt verse ⇒ 40pt ring, 22pt numeral', () => {
    // ⚠️ THE POINT OF THE RATIOS. Story 6.5 ships the size picker over the 20–44pt Arabic scale;
    // a badge at a fixed pixel size would strand a 13pt ring beside 44pt Arabic.
    renderRow({ verse: 286, fontSize: 44 });
    const badge = badgeStyle(286);
    expect(badge.width).toBe(40);
    expect(badge.height).toBe(40);
    expect(badge.borderRadius).toBe(20);
    expect(styleOf('286').fontSize).toBe(22);
  });
});

describe('the bookmark control (story 6-4)', () => {
  it('renders OUTLINE in text.secondary when the verse is not bookmarked', () => {
    renderRow({ verse: 7, bookmarked: false });
    const icon = bookmarkIcon(7);
    expect(icon.name).toBe('bookmark');
    expect(icon.tintColor).toBe(TEXT_SECONDARY);
  });

  it('renders FILLED in accent.primary when it is', () => {
    // The pair is pinned legible (≥ 3:1, WCAG 1.4.11) for every palette × scheme in
    // `palettes.contrast.test.ts`; this asserts the colour SHIPPED is that pair.
    renderRow({ verse: 7, bookmarked: true });
    const icon = bookmarkIcon(7);
    expect(icon.name).toBe('bookmark.fill');
    expect(icon.tintColor).toBe(ACCENT_PRIMARY);
  });

  it('flips its accessibility label AND its selected state between add and remove', () => {
    // The label names the available ACTION; `accessibilityState.selected` announces the current
    // state AS state — the half a screen reader otherwise never hears.
    renderRow({ verse: 7, bookmarked: false });
    expect(screen.getByTestId('bookmark-toggle-7').props.accessibilityLabel).toBe('Add bookmark');
    expect(screen.getByTestId('bookmark-toggle-7').props.accessibilityState).toEqual({
      selected: false,
    });
    screen.unmount();
    renderRow({ verse: 7, bookmarked: true });
    expect(screen.getByTestId('bookmark-toggle-7').props.accessibilityLabel).toBe(
      'Remove bookmark'
    );
    expect(screen.getByTestId('bookmark-toggle-7').props.accessibilityState).toEqual({
      selected: true,
    });
  });

  it('reports its OWN (surah, verse) pair to the one stable callback on press', () => {
    // ⚠️ The pair, not the verse alone: the screen's current-surah ref moves while old rows are
    // still tappable (a resync's rows load async), so the row must report the pair it renders.
    const onToggleBookmark = jest.fn();
    renderRow({ surah: 13, verse: 42, onToggleBookmark });
    fireEvent.press(screen.getByTestId('bookmark-toggle-42'));
    expect(onToggleBookmark).toHaveBeenCalledTimes(1);
    expect(onToggleBookmark).toHaveBeenCalledWith(13, 42);
  });

  it('meets the 44pt target through hitSlop, not a bigger glyph', () => {
    renderRow({ verse: 7 });
    // Assert the DERIVED floor, not the slop constant alone — shrinking the glyph must redden
    // this, and a bare `hitSlop === 12` stays green while the effective target drops under 44.
    const toggle = screen.getByTestId('bookmark-toggle-7');
    const icon = screen.getByTestId('bookmark-icon-7', { includeHiddenElements: true });
    const glyphSize = (icon.props as { children: { props: { size: number } } }).children.props.size;
    expect(glyphSize + 2 * (toggle.props.hitSlop as number)).toBeGreaterThanOrEqual(44);
  });
});

describe('the row is text, not a control', () => {
  it('takes no press on the CONTAINER and announces no row role', () => {
    // MUTATION: give the row itself an `onPress` again. It scrolls fine — which is why it
    // survived a round — and it costs two things: there is then no "elsewhere" left to tap, so
    // the chrome has to ship revealed against the frozen criterion, and epic 7's promised "a tap
    // on a verse plays audio from it" has nowhere to go. A role on the row would also announce
    // 286 ROWS as buttons on Al-Baqarah. The bookmark control is the ONE button inside — its
    // own role, its own label — and it must stay the only one.
    renderRow({ testID: 'row' });
    const row = screen.getByTestId('row');
    expect(row.props.onStartShouldSetResponder).toBeUndefined();
    expect(row.props.accessibilityRole).toBeUndefined();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button').props.testID).toBe('bookmark-toggle-1');
  });
});

describe('memoization', () => {
  it('is a memo component, so a list-level state change does not re-render 286 rows', () => {
    // ⚠️ SILENTLY REMOVABLE UNTIL THIS CASE. `React.memo` leaves an observable marker — the same
    // `$$typeof` a locally-created `memo()` has — so the identity is assertable even though the
    // BEHAVIOUR (a skipped re-render) is not, at this seam.
    const marker = (memo(() => null) as unknown as { $$typeof: symbol }).$$typeof;
    expect((VerseRow as unknown as { $$typeof: symbol }).$$typeof).toBe(marker);
  });

  it('memoizes the real row, not an empty shell — anti-vacuity', () => {
    // `memo(() => null)` would also satisfy the marker above. The inner component has to be the
    // one that renders the ayah.
    const inner = (VerseRow as unknown as { type: (props: never) => unknown }).type;
    expect(typeof inner).toBe('function');
    renderRow();
    expect(screen.getByText('بِسْمِ')).toBeTruthy();
  });
});
