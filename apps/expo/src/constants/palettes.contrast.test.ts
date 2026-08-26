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

import { blendOver, contrastRatio, meetsContrast } from '@/lib/color';
import { PALETTE_NAMES, PALETTES } from './palettes';

const AAA_PRIMARY = 7;
const AA_BODY = 4.5;
const AA_LARGE = 3;
const SCHEMES = ['light', 'dark'] as const;
/** Mirrors the `withAlpha(accent.primary, 0.15)` the tab layout passes as `indicatorColor`. */
const INDICATOR_ALPHA = 0.15;

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
 * ⚠️ WHAT THIS BLOCK DOES **NOT** REACH: the iOS surface. There the bar and header keep the
 * system Liquid Glass material by design — a translucent, content-dependent surface has no hex to
 * measure. The LABEL colours below do reach iOS, because `labelStyle` is not platform-gated
 * (`(tabs)/_layout.tsx`); the surface they are measured against is Android's and web's.
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
      });
    }
  }
});
