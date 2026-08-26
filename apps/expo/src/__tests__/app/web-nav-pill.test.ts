/**
 * The web nav pill's CSS — the half of the tab chrome no prop can reach (story 6-0 review).
 *
 * ⚠️ `app/+html.tsx` IS STATIC CSS RENDERED IN NODE BEFORE HYDRATION, so it has no access to the
 * RN theme and can hold no token. It works by pointing at custom properties expo-router publishes
 * from the props `(tabs)/_layout.tsx` passes — which makes it the one place in the app whose
 * correctness depends on THREE upstream names and one upstream selector, none of which anything
 * else in the tree reads. A rename in a dependency bump degrades every rule there to its hardcoded
 * fallback silently: the keyboard focus ring goes back to `#444444` (~1.6:1 on our bars, the
 * accessibility defect this story fixed) and the pill border disappears, with tsc, Biome, jest and
 * every other gate green. Demonstrated during the third review pass — deleting `labelStyle`
 * entirely returned the ring to the library's `#8b8b8b`/`#ffffff` fallbacks with no test red.
 *
 * So this file reads BOTH sides and fails when they stop agreeing. It is a structural test on
 * purpose: no jest renderer runs the web CSS, and the colours it resolves to are measured here
 * against the palettes rather than sampled from a browser.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PALETTE_NAMES, PALETTES, type PaletteSlice } from '@/constants/palettes';
import { contrastRatio } from '@/lib/color';

/** WCAG 1.4.11: a non-text boundary — which is what the pill's edge is — needs 3:1. */
const AA_NON_TEXT = 3;

const SCHEMES = ['light', 'dark'] as const;

const HTML_ROOT = readFileSync(join(__dirname, '..', '..', 'app', '+html.tsx'), 'utf8');

/** The `webNavPillPolish` template literal — the rules this file is about. */
const POLISH_CSS = (() => {
  const match = HTML_ROOT.match(/const webNavPillPolish = `([\s\S]*?)`;/);
  if (!match) throw new Error('`+html.tsx` no longer defines `webNavPillPolish`');
  return match[1];
})();

const EXPO_ROUTER_DIR = dirname(require.resolve('expo-router/package.json'));
const UPSTREAM_CSS = readFileSync(
  join(EXPO_ROUTER_DIR, 'assets', 'native-tabs.module.css'),
  'utf8'
);
const UPSTREAM_WEB_VIEW = readFileSync(
  join(EXPO_ROUTER_DIR, 'build', 'native-tabs', 'NativeTabsView.web.js'),
  'utf8'
);

/**
 * Which palette token each custom property carries, from `NativeTabsView.web.js`'s
 * `convertNativeTabsPropsToStyleVars` composed with the props `(tabs)/_layout.tsx` passes.
 * `tab-chrome.test.tsx` pins that half — that the layout really sends these tokens — on all twelve
 * palette × scheme slices; this map is only the wiring in between.
 */
const VAR_TOKENS: Record<string, (slice: PaletteSlice) => string> = {
  '--expo-router-tabs-text-color': (s) => s.text.secondary,
  '--expo-router-tabs-active-text-color': (s) => s.text.primary,
  '--expo-router-tabs-background-color': (s) => s.background.secondary,
};

/** Every `var(--expo-router-tabs-…)` this file READS. */
function varsRead(css: string): string[] {
  return [...css.matchAll(/var\((--expo-router-tabs-[a-z-]+)/g)].map((m) => m[1]);
}

/** The declaration value for `prop` inside the first rule whose selector contains `selector`. */
function declaration(css: string, selector: string, prop: string): string | undefined {
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  const rule = rules.find((r) => r[1].includes(selector));
  if (!rule) return undefined;
  const decl = rule[2].match(new RegExp(`(?:^|;)\\s*${prop}\\s*:([^;]+)`));
  return decl?.[1].trim();
}

describe('the upstream contract this CSS is written against', () => {
  it('still renders the tablist our selector targets', () => {
    // The CSS-module class names are hashed at build time and unusable from here; the react-tabs
    // `TabsList` carries a STABLE `aria-label="Main"`, which is what every rule hooks onto.
    expect(UPSTREAM_WEB_VIEW).toMatch(/"aria-label": "Main"/);
    expect(POLISH_CSS).toMatch(/\[role="tablist"\]\[aria-label="Main"\]/);
  });

  it('still defines every custom property the rules read', () => {
    // ⚠️ ANTI-VACUITY FIRST: if the rules stop reading any property, this case would pass by
    // asserting nothing about the thing it exists to guard.
    const read = varsRead(POLISH_CSS);
    expect(read.length).toBeGreaterThan(0);
    for (const name of new Set(read)) expect(UPSTREAM_CSS).toContain(name);
  });

  it('still publishes those properties from the props the layout passes', () => {
    // The other end of the wiring: `convertNativeTabsPropsToStyleVars` is what turns
    // `labelStyle` / `backgroundColor` into these variables. If it stops, the fallbacks ship.
    for (const name of Object.keys(VAR_TOKENS)) expect(UPSTREAM_WEB_VIEW).toContain(name);
  });
});

describe('the keyboard focus ring takes the label colour', () => {
  it('points the outline at the label variable — not a hex, and not currentColor', () => {
    // The library gives the ring `outline-color: var(--expo-router-tabs-tab-outline-color,
    // #444444)` and exposes NO prop that reaches it, so the hardcoded grey shipped on every
    // palette at roughly 1.6:1 against our bars. ⚠️ NOT `currentColor`, which was the first
    // attempt and measured BLACK: the library styles the label on an inner `<span>`, so the
    // trigger's own `color` is whatever `<body>` inherits — about 1.06:1, worse than the grey.
    const base = declaration(
      POLISH_CSS,
      '[aria-label="Main"]',
      '--expo-router-tabs-tab-outline-color'
    );
    expect(base).toMatch(/var\(--expo-router-tabs-text-color/);
    expect(base).not.toMatch(/currentColor/i);
  });

  it('points the SELECTED tab’s outline at the selected label variable', () => {
    // A selected trigger sits on the indicator, where the unselected label colour is the wrong
    // reference. Separate rule, separate variable, separate case.
    const active = declaration(
      POLISH_CSS,
      '[data-state="active"]',
      '--expo-router-tabs-tab-outline-color'
    );
    expect(active).toMatch(/var\(--expo-router-tabs-active-text-color/);
    expect(active).not.toMatch(/currentColor/i);
  });

  it('keeps the library’s own defaults as the fallbacks', () => {
    // So an upstream rename degrades to today's behaviour rather than to `invalid at
    // computed-value time`, which would drop the declaration entirely.
    expect(POLISH_CSS).toContain('#8b8b8b');
    expect(POLISH_CSS).toContain('#ffffff');
    expect(UPSTREAM_CSS).toContain('#8b8b8b');
    expect(UPSTREAM_CSS).toContain('#ffffff');
  });
});

describe('the pill has a visible edge against the page', () => {
  /**
   * ⚠️ THE EDGE IS A STORY-6-0 REGRESSION FIX FOR STORY 6-0. Widening the SURFACE group to web
   * replaced the library's hardcoded `#272727` pill with `background.secondary`. Correct — the old
   * grey ignored every palette — but `#272727` was also what made the pill VISIBLE: it measured
   * ~14:1 against a light page, `.navigationMenuRoot` carries no border and no shadow, and
   * `background.secondary` against `background.primary` measures 1.11–1.24:1 across all twelve
   * slices (terracotta·light 1.11). The contrast gate measures labels ON the bar and never
   * measured the bar against the page.
   */
  it('draws a border, and its colour is a themed variable rather than a literal', () => {
    const border = declaration(POLISH_CSS, '[aria-label="Main"]', 'border');
    expect(border).toBeDefined();
    expect(border).toMatch(/var\(--expo-router-tabs-text-color/);
  });

  it('does not rely on the pill surface alone — which is 1.11–1.24:1 on every slice', () => {
    // The measurement that motivates the border, asserted so the motivation cannot quietly stop
    // being true (and so this block reads as a fix rather than as decoration).
    for (const name of PALETTE_NAMES) {
      for (const scheme of SCHEMES) {
        const s = PALETTES[name][scheme];
        expect(contrastRatio(s.background.secondary, s.background.primary)).toBeLessThan(
          AA_NON_TEXT
        );
      }
    }
  });

  it('clears 3:1 against the page in every palette × scheme (WCAG 1.4.11)', () => {
    // Resolve the variable the border actually references to the token it carries, then measure.
    // ⚠️ This is what makes the case fail INDEPENDENTLY of the palette block: deleting the border,
    // or repointing it at an unthemed literal, reddens here even though the underlying pair is
    // held elsewhere.
    const border = declaration(POLISH_CSS, '[aria-label="Main"]', 'border') ?? '';
    const referenced = varsRead(border).find((name) => name in VAR_TOKENS);
    expect(referenced).toBeDefined();
    const token = VAR_TOKENS[referenced as string];
    for (const name of PALETTE_NAMES) {
      for (const scheme of SCHEMES) {
        const s = PALETTES[name][scheme];
        expect(contrastRatio(token(s), s.background.primary)).toBeGreaterThanOrEqual(AA_NON_TEXT);
      }
    }
  });
});
