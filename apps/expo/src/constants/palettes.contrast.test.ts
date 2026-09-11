/**
 * Accessibility gate for the 6 curated palettes (Story 23.8, AC-3).
 *
 * The irreplaceable proof that hand-authored hues are legible: iterates every palette ×
 * {light, dark} and asserts the load-bearing WCAG pairs. When a curated hue fails here,
 * tune the HUE in palettes.ts — never lower the bar.
 *
 * Thresholds:
 *   - text.primary   on background.primary ≥ 7   (AAA — primary reading text)
 *   - text.secondary on background.primary ≥ 4.5 (AA body)
 *   - text.tertiary  on background.primary ≥ 3   (AA large — placeholders/captions)
 *   - text.onAccent  on accent.primary    ≥ 3   (AA large — `onAccent` labels accent-filled
 *     BUTTONS/CHIPS, i.e. large/bold text, so AA-large is the applicable bar. A 4.5 gate would
 *     contradict AC-1 #2: the byte-identical terracotta default ships white-on-#C65D3B at 4.17.
 *     The 5 authored palettes were tuned to clear the stricter 4.5 body bar anyway — locked below.)
 *
 * Tests live in constants/ but BOTH lint:layers and lint:style skip *.test.ts, so importing
 * @/lib/color here is not a layer/token-home violation.
 */

/**
 * The selection pill's alpha, IMPORTED rather than copied.
 *
 * ⚠️ IT USED TO BE A HAND-COPIED `0.15` whose comment named `indicatorColor`, a `NativeTabs` prop
 * story 6-6 deleted — so the gate went on measuring a blend the app had stopped rendering, green
 * either way. `AppTabBar` exports the number it actually paints with; taking it from there means
 * changing the pill re-measures the pill instead of leaving this file behind.
 */
import { TAB_INDICATOR_ALPHA as INDICATOR_ALPHA } from '@/components/ui/AppTabBar';
import { blendOver, contrastRatio, meetsContrast } from '@/lib/color';
import { PALETTE_NAMES, PALETTES, type PaletteSlice } from './palettes';

const AAA_PRIMARY = 7;
const AA_BODY = 4.5;
const AA_LARGE = 3;
const SCHEMES = ['light', 'dark'] as const;

/**
 * The colour a highlighted verse's background ACTUALLY IS — `accent.faint` composited over the
 * page (story 7-8).
 *
 * ⚠️ `accent.faint` IS AN `rgba(…)` STRING, AND FEEDING ONE TO `contrastRatio` DOES NOT ERROR: it
 * returns the neutral `1`, i.e. "identical colours", which reads as a failing pair rather than as
 * a bad call. `blendOver` takes a hex plus an alpha, so the token is parsed into those two halves
 * here — the same move the tab-bar indicator makes below, one token over.
 */
function highlightFill(s: PaletteSlice): string {
  const parts = /rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/.exec(s.accent.faint);
  // ⚠️ THROW RATHER THAN FALL BACK. Returning the unparsed token would let every measurement
  // below score against an `rgba(…)` string, which `contrastRatio` reads as the neutral 1 — a
  // number, not an error. That is this repo's recorded malformed-hex failure exactly: the
  // dangerous shape produces a believable value instead of stopping.
  if (!parts) throw new Error(`accent.faint is not an rgba() token: ${s.accent.faint}`);
  const hex = `#${[parts[1], parts[2], parts[3]]
    .map((channel) => Number(channel).toString(16).padStart(2, '0'))
    .join('')}`;
  return blendOver(hex, s.background.primary, Number(parts[4]));
}

describe('palette contrast (AC-3 accessibility gate)', () => {
  for (const name of PALETTE_NAMES) {
    for (const scheme of SCHEMES) {
      const s = PALETTES[name][scheme];

      describe(`${name} · ${scheme}`, () => {
        it('text.primary on background.primary ≥ 7 (AAA)', () => {
          expect(contrastRatio(s.text.primary, s.background.primary)).toBeGreaterThanOrEqual(
            AAA_PRIMARY
          );
        });

        it('text.secondary on background.primary ≥ 4.5 (AA body)', () => {
          expect(contrastRatio(s.text.secondary, s.background.primary)).toBeGreaterThanOrEqual(
            AA_BODY
          );
        });

        it('text.tertiary on background.primary ≥ 3 (AA large)', () => {
          expect(contrastRatio(s.text.tertiary, s.background.primary)).toBeGreaterThanOrEqual(
            AA_LARGE
          );
        });

        it('text.onAccent on accent.primary ≥ 3 (button labels = large text)', () => {
          expect(meetsContrast(s.text.onAccent, s.accent.primary, AA_LARGE)).toBe(true);
        });

        it('the SELECTION OUTLINE clears 3:1 on the page AND on the audio highlight (story 7-8)', () => {
          // ⚠️ TWO SURFACES, BECAUSE THE OUTLINE HAS TO SURVIVE THE OVERLAP. A selected ayah that
          // is ALSO the one being recited carries `accent.faint` as a FILL underneath it, so the
          // outline is measured against the colour actually rendered there — not against the bare
          // page, which is the easier of the two on every slice. The outline is `accent.soft`
          // (the accent's foreground strength): measured 2026-09-10 at 4.40–11.29 over the
          // highlight, floor terracotta·light. `accent.primary` was the other candidate and
          // measures 3.50 there — inside the bar, but with a third of the headroom.
          expect(meetsContrast(s.accent.soft, s.background.primary, AA_LARGE)).toBe(true);
          expect(meetsContrast(s.accent.soft, highlightFill(s), AA_LARGE)).toBe(true);
        });

        it('…and ANDROID’s fallback colour clears the same two bars', () => {
          // ⚠️ ANDROID IGNORES `textDecorationColor`. The mushaf draws the selection as a text
          // decoration (a nested `<Text>` cannot take a border), and on Android that underline
          // renders in the WORD's colour — `text.primary`. Measuring only the authored token
          // would leave the colour most readers of the primary surface actually see unmeasured.
          expect(meetsContrast(s.text.primary, s.background.primary, AA_LARGE)).toBe(true);
          expect(meetsContrast(s.text.primary, highlightFill(s), AA_LARGE)).toBe(true);
        });

        it('…and the highlight it is measured over is a real, PARSED surface', () => {
          // Anti-vacuity for the two cases above, the `blendOver` shape. ⚠️ THE HEX ASSERTION IS
          // THE POINT, NOT THE INEQUALITY: a `highlightFill` that failed OPEN would return the
          // raw `rgba(…)` token, which is never equal to a hex background — so the inequality
          // alone passes on a broken parse while every ratio above silently scores against
          // `contrastRatio`'s neutral 1. The helper throws now, and this pins the shape it must
          // return for that throw to be reachable.
          expect(highlightFill(s)).toMatch(/^#[0-9a-f]{6}$/i);
          expect(highlightFill(s).toLowerCase()).not.toBe(s.background.primary.toLowerCase());
        });

        it('accent.primary on background.primary ≥ 3 (bookmark indicator, WCAG 1.4.11)', () => {
          // Story 6-4: the verse bookmark control's FILLED state is `accent.primary` drawn
          // directly on the reading page (`background.primary`) — a non-text component, so 3:1
          // is the applicable bar. Measured 2026-08-28 at ≥ 4.05:1 across all twelve slices
          // (floor: terracotta·light); this pins that a palette edit cannot walk it under.
          expect(meetsContrast(s.accent.primary, s.background.primary, AA_LARGE)).toBe(true);
        });

        // The 5 non-default palettes are authored from scratch, so hold them to the stricter
        // 4.5 body bar (terracotta is the documented 4.17 live-default exception).
        if (name !== 'terracotta') {
          it('text.onAccent on accent.primary ≥ 4.5 (authored-palette headroom)', () => {
            expect(contrastRatio(s.text.onAccent, s.accent.primary)).toBeGreaterThanOrEqual(
              AA_BODY
            );
          });
        }
      });
    }
  }
});

/**
 * Navigation chrome (story 6-0, AC "chrome meets WCAG AA against its own background").
 *
 * ⚠️ THE PAIRS ABOVE ARE ALL "CONTENT ON `background.primary`", AND THE CHROME SITS ELSEWHERE.
 * The tab bar and the native header are painted from `background.secondary` — React Navigation's
 * `theme.colors.card`, see `lib/nav-theme.ts` — so nothing in the block above says anything about
 * whether a tab label or a header title is legible. Until this block, the tab bar's theming was
 * verified on the one palette anybody had looked at.
 *
 * ⚠️ AND THE SELECTED TAB ITEM DOES NOT SIT ON THAT SURFACE EITHER. It sits on the selection
 * indicator — `withAlpha(accent.primary, 0.15)` composited over `background.secondary` — which on
 * a light palette is the DARKER of the two. Measuring the selected label against the bare bar
 * answers a question nobody asked; `blendOver` produces the colour actually rendered. Feeding
 * `contrastRatio` the `rgba(…)` string directly would not error, it would silently return 1.
 *
 * Every case below measures a DISTINCT pair. An earlier cut had five cases over three pairs — the
 * selected label and the header title both evaluated `text.primary` on `background.secondary`, so
 * the AA case could not fail while the AAA one passed, and the unselected icon could not fail
 * while the unselected label passed. A case that cannot fail independently is not a test.
 *
 * Which bar applies to which pair is not uniform, and the difference is load-bearing:
 *   - a tab LABEL is ~12sp text → WCAG AA body, 4.5;
 *   - a header TITLE is primary reading chrome → the AAA 7 the block above holds text to;
 *   - a tab ICON and a header tint are non-text UI components → WCAG 1.4.11, 3.
 *
 * ⚠️ SINCE STORY 6-6 EVERY PAIR BELOW REACHES EVERY PLATFORM, iOS INCLUDED. The chrome is our
 * own (`components/ui/AppHeader` / `AppTabBar`), and it paints `background.secondary` everywhere
 * — the old carve-out ("iOS keeps the Liquid Glass material, which has no hex to measure") died
 * with the native bar it described. What this file still cannot prove is that these are the
 * colours SHIPPED — that is `__tests__/app/tab-chrome.test.tsx`'s job, which renders the real
 * component across every platform × palette × scheme.
 */
describe('navigation chrome contrast (story 6-0)', () => {
  for (const name of PALETTE_NAMES) {
    for (const scheme of SCHEMES) {
      const s = PALETTES[name][scheme];
      /** The selection indicator, as rendered: accent at 15% over the bar. */
      const indicator = blendOver(s.accent.primary, s.background.secondary, INDICATOR_ALPHA);

      describe(`${name} · ${scheme}`, () => {
        it('the indicator is a DISTINCT surface from the bar (blendOver is not a no-op)', () => {
          // ⚠️ THE ANTI-VACUITY CASE FOR THE HELPER EVERY CASE BELOW STANDS ON. `blendOver` has no
          // runtime consumer — this file is its only caller — so it fails OPEN: making it
          // `return base` unconditionally (the shape of its own documented unparseable-input
          // fallback) collapses the two indicator cases into duplicates of the header-title and
          // header-tint cases, and every one of them stays green while the 3.07 floor goes
          // unmeasured. Demonstrated, not supposed. Compared case-insensitively because the
          // palettes are authored in upper-case hex and `toString(16)` emits lower-case.
          expect(indicator.toLowerCase()).not.toBe(s.background.secondary.toLowerCase());
        });

        it('unselected tab label on the bar ≥ 4.5 (AA body)', () => {
          expect(contrastRatio(s.text.secondary, s.background.secondary)).toBeGreaterThanOrEqual(
            AA_BODY
          );
        });

        it('SELECTED tab label on the indicator ≥ 4.5 (AA body)', () => {
          // ⚠️ THE CASE THAT FORCED A CODE CHANGE RATHER THAN A NUMBER CHANGE — but it does not
          // guard that code, and cannot: this file never loads the layout. Deleting
          // `labelStyle.selected` would leave every case here green, because upstream's fallback
          // (`selectedLabelStyle = { color: tintColor }`) is invisible from the palette alone.
          // `__tests__/app/tab-chrome.test.tsx` renders the layout and asserts the RESOLVED
          // colour; this case pins that the colour it resolves to is legible where it lands.
          // Without that prop the pair would be `accent.primary` on this same indicator —
          // 3.07 on terracotta·light, under this bar.
          expect(contrastRatio(s.text.primary, indicator)).toBeGreaterThanOrEqual(AA_BODY);
        });

        it('selected tab icon on the indicator ≥ 3 (WCAG 1.4.11 non-text)', () => {
          // The accent is still the selection cue — on the icon, which is a component rather than
          // text, so 3 is the applicable bar and not a relaxed one. ⚠️ Measured floor across the
          // twelve is terracotta·light at 3.07: almost no headroom. A hue edit that moves
          // `background.secondary` toward the accent, or that raises the indicator's alpha, reds
          // this first.
          expect(meetsContrast(s.accent.primary, indicator, AA_LARGE)).toBe(true);
        });

        it('header title on the header surface ≥ 7 (AAA)', () => {
          expect(contrastRatio(s.text.primary, s.background.secondary)).toBeGreaterThanOrEqual(
            AAA_PRIMARY
          );
        });

        it('header tint on the header surface ≥ 3 (WCAG 1.4.11 non-text)', () => {
          // The back chevron and any tinted header glyph. Distinct from the icon case above: this
          // one is on the bare surface, that one is on the indicator.
          expect(meetsContrast(s.accent.primary, s.background.secondary, AA_LARGE)).toBe(true);
        });

        it('the bar SURFACE cannot delimit chrome on its own — the cast has to (1.08–1.16:1)', () => {
          // ⚠️ THIS CASE REPLACES "the bar EDGE delimits chrome from the page", DELETED
          // 2026-09-11 WITH THE 1px EDGE IT GATED (owner: the line read as "distracting and
          // outdated"). It is not a weaker version of that case — it asserts the OPPOSITE fact,
          // and asserts it because a future palette edit is the thing most likely to make
          // somebody believe the border was safe to drop for the ordinary reason.
          //
          // `AppHeader` and `AppTabBar` OVERLAY the reading surface, and "let the contrast do the
          // work" is NOT available to them: bar-on-page measures 1.08–1.16:1 in every slice, i.e.
          // the same colour to the eye. `SHADOWS.chromeDown` / `chromeUp` are the whole boundary.
          //
          // So this pins the premise rather than a floor. If a palette edit ever lifts
          // `background.secondary` into a genuine elevated surface, THIS case reddens — and the
          // right response is to re-read the shadow docblock and decide whether the cast is still
          // load-bearing, not to raise a number here.
          const barOnPage = contrastRatio(s.background.secondary, s.background.primary);
          expect(barOnPage).toBeLessThan(1.25);
        });
      });
    }
  }
});
