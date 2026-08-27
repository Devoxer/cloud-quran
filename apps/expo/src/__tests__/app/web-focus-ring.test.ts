/**
 * The web keyboard focus ring for OUR chrome (story 6-6 — this file replaces
 * `web-nav-pill.test.ts`, whose subject, expo-router's web nav pill, died with `NativeTabs`).
 *
 * ⚠️ WHAT SURVIVED THE PILL IS THE FLOOR: a keyboard user must SEE which chrome control has
 * focus, against every palette × scheme — story 6-0 measured the library default at 1.6:1 and
 * fixed it, and that fix died with the CSS it patched. `app/+html.tsx` is static CSS rendered in
 * Node before hydration, so it can hold no theme token; the replacement is the two-tone ring
 * (white outline inside a black box-shadow).
 *
 * ⚠️ THAT RING'S WORST CASE IS A THEOREM, NOT A MEASUREMENT OF THESE PALETTES, AND THIS FILE USED
 * TO CONFUSE THE TWO. For every colour in the sRGB cube the better of {white, black} clears
 * 4.58:1, so the two per-palette loops that asserted `>= 3` could not fail — not for any hue edit,
 * not if the palettes were deleted. They are replaced by the one fact here that IS
 * palette-dependent: each tone ALONE fails 3:1 on half the twelve slices, and no slice defeats
 * both, which is what makes the pair necessary rather than decorative.
 *
 * ⚠️ AND THE SELECTOR IS A CONTRACT WITH OUR OWN COMPONENTS, so this file reads BOTH sides —
 * exactly what its predecessor did with upstream's stylesheet. react-native-web maps `testID` to
 * `data-testid`; the CSS targets the `chrome-` prefix; the components must actually carry it.
 * Either side drifting un-styles the ring with every other gate green.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PALETTE_NAMES, PALETTES } from '@/constants/palettes';
import { contrastRatio } from '@/lib/color';

/** WCAG 1.4.11: a non-text indicator needs 3:1 against its background. */
const AA_NON_TEXT = 3;

const SCHEMES = ['light', 'dark'] as const;

const SRC = join(__dirname, '..', '..');
const HTML_ROOT = readFileSync(join(SRC, 'app', '+html.tsx'), 'utf8');

/** The `chromeFocusRing` template literal — the rules this file is about. */
const RING_CSS = (() => {
  const match = HTML_ROOT.match(/const chromeFocusRing = `([\s\S]*?)`;/);
  if (!match) throw new Error('`+html.tsx` no longer defines `chromeFocusRing`');
  return match[1];
})();

const RING_INNER = '#ffffff';
const RING_OUTER = '#000000';

describe('the ring is declared, on the right selector', () => {
  it('targets our chrome controls by their data-testid prefix, on :focus-visible', () => {
    expect(RING_CSS).toMatch(/\[data-testid\^="chrome-"\]:focus-visible/);
  });

  it('is the two-tone pair: white outline inside a black box-shadow', () => {
    expect(RING_CSS).toMatch(/outline:\s*2px\s+solid\s+#ffffff/);
    expect(RING_CSS).toMatch(/box-shadow:[^;]*#000000/);
  });

  it('the pill polish it replaced is really gone — one subject, one ruleset', () => {
    // The DEFINITION, not the word: the comment above the ring names its predecessor on purpose.
    expect(HTML_ROOT).not.toMatch(/const webNavPillPolish/);
    expect(HTML_ROOT).not.toMatch(/\[role="tablist"\]/);
    // The pre-hydration body paint is unrelated to the pill and stays.
    expect(HTML_ROOT).toMatch(/responsiveBackground/);
  });
});

describe('the other side of the contract: the components carry the prefix', () => {
  const SOURCES = [
    join(SRC, 'components', 'ui', 'AppHeader.tsx'),
    join(SRC, 'components', 'ui', 'AppTabBar.tsx'),
    join(SRC, 'features', 'reading', 'components', 'ReadingChrome.tsx'),
  ];

  it('every chrome source declares at least one chrome- testID', () => {
    for (const file of SOURCES) {
      expect(readFileSync(file, 'utf8')).toMatch(/testID=[{"'`]+chrome-/);
    }
  });
});

describe('the ring is visible on every palette × scheme', () => {
  /**
   * ⚠️ THE TWO CASES THAT USED TO LIVE HERE COULD NOT FAIL, AND SAID "MEASURED" WHILE DOING IT.
   * They looped all twelve slices asserting `max(contrast(#fff, X), contrast(#000, X)) >= 3`.
   * That holds for EVERY colour in the sRGB cube — the true floor is 4.58 (at #e12d0f), so the
   * loop was a restatement of a theorem with the palettes as decoration. Editing any hue, or
   * deleting the palettes entirely, left it green.
   *
   * What is genuinely palette-dependent is whether the ring needs BOTH tones, and it does:
   * a white-only ring fails 3:1 on 6 of the 12 slices and a black-only ring on the other 6.
   * That is the case below, and it reddens the day a palette set stops needing the pair —
   * which is exactly when someone would be tempted to simplify the CSS.
   */
  it('neither tone alone would do it — each fails 3:1 somewhere, which is why the pair exists', () => {
    const whiteAlone: string[] = [];
    const blackAlone: string[] = [];
    for (const name of PALETTE_NAMES) {
      for (const scheme of SCHEMES) {
        const bar = PALETTES[name][scheme].background.secondary;
        if (contrastRatio(RING_INNER, bar) < AA_NON_TEXT) whiteAlone.push(`${name}·${scheme}`);
        if (contrastRatio(RING_OUTER, bar) < AA_NON_TEXT) blackAlone.push(`${name}·${scheme}`);
      }
    }
    expect(whiteAlone.length).toBeGreaterThan(0);
    expect(blackAlone.length).toBeGreaterThan(0);
    // …and no slice defeats both, which is what makes the PAIR sufficient where each is not.
    expect(whiteAlone.filter((slice) => blackAlone.includes(slice))).toEqual([]);
  });

  it('the two rings delimit each other at 21:1 — the pair needs no background at all', () => {
    expect(contrastRatio(RING_INNER, RING_OUTER)).toBeCloseTo(21, 0);
  });
});
