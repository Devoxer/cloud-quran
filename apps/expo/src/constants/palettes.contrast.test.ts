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

import { contrastRatio, meetsContrast } from '@/lib/color';
import { PALETTE_NAMES, PALETTES } from './palettes';

const AAA_PRIMARY = 7;
const AA_BODY = 4.5;
const AA_LARGE = 3;
const SCHEMES = ['light', 'dark'] as const;

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
