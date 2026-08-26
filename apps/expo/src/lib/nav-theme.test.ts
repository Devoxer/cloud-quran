/**
 * `createNavigationTheme` — the one seam where our palette reaches the native navigator (6-0).
 *
 * ⚠️ WHY THIS IS WORTH A TEST AT ALL. The theme object looks like plumbing, and it is the opposite:
 * React Navigation reads `colors.background` as the DEFAULT scene background for every native-stack
 * screen, `card` as the header and tab-bar surface, `text` as the header title and `border` as the
 * hairline beneath it. A token dropped here is not a header bug — it is a screen three pushes deep
 * that stops following the palette, on one of six palettes nobody switched to. That is precisely
 * the failure story 6-0 was written against: chrome theming that was *claimed* on the default
 * palette and *measured* on none.
 *
 * So the assertions walk all six palettes × both schemes against `composeColors`, which is the same
 * function `useTheme()` composes from — not against hard-coded hexes, which would pin today's
 * terracotta values and say nothing about the other five.
 */

import Colors, { composeColors } from '@/constants/Colors';
import { PALETTE_NAMES } from '@/constants/palettes';
import { createNavigationTheme } from './nav-theme';

const SCHEMES = ['light', 'dark'] as const;

describe('createNavigationTheme', () => {
  for (const palette of PALETTE_NAMES) {
    for (const scheme of SCHEMES) {
      const colors = composeColors(palette, scheme);
      const theme = createNavigationTheme(colors, scheme === 'dark');

      describe(`${palette} · ${scheme}`, () => {
        it('paints the SCENE background from the palette', () => {
          // The one that is not about the header at all, and the one the story called out: a
          // scene that does not follow the palette is the same bug seen once, further down.
          expect(theme.colors.background).toBe(colors.background.primary);
        });

        it('paints the header and tab-bar surface from the palette', () => {
          expect(theme.colors.card).toBe(colors.background.secondary);
        });

        it('paints the header title and hairline from the palette', () => {
          expect(theme.colors.text).toBe(colors.text.primary);
          expect(theme.colors.border).toBe(colors.border);
        });

        it('carries the accent as both primary and notification tint', () => {
          expect(theme.colors.primary).toBe(colors.accent.primary);
          expect(theme.colors.notification).toBe(colors.accent.primary);
        });

        it('reports the scheme it was built for', () => {
          // `dark` drives upstream defaults we never set (the status-bar style among them), so a
          // theme whose flag disagrees with its colours renders light chrome over a dark scene.
          expect(theme.dark).toBe(scheme === 'dark');
        });
      });
    }
  }

  it('never returns a token from a DIFFERENT palette than the one asked for', () => {
    // ANTI-VACUITY. Every case above would still pass if the function ignored its argument and
    // returned the default palette — the terracotta slice IS what `Colors[scheme]` resolves to, so
    // a hard-coded implementation looks correct on the default and is wrong on the other five.
    const cobalt = createNavigationTheme(composeColors('cobalt', 'light'), false);
    expect(cobalt.colors.background).not.toBe(Colors.light.background.primary);
  });

  it('supplies the whole `fonts` group the navigator contract requires', () => {
    // Missing a weight here throws inside React Navigation's own header renderer at runtime —
    // there is no type error, because the object is built literal-by-literal.
    const { fonts } = createNavigationTheme(composeColors('terracotta', 'light'), false);
    expect(Object.keys(fonts).sort()).toEqual(['bold', 'heavy', 'medium', 'regular']);
    for (const face of Object.values(fonts)) {
      expect(face.fontFamily).toBeTruthy();
      expect(face.fontWeight).toBeTruthy();
    }
  });
});
