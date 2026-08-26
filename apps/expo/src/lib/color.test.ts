/**
 * Unit coverage for `withAlpha` — the hex→rgba compositor (promoted from
 * `GlassBackdrop.applyAlpha` in Story 23.5; originally Story 17.4 §B, AC 11).
 *
 * Pure, branchy logic worth a unit net — including the L2 crash-guard: a runtime
 * theme-key miss resolves the color to `undefined`, and without the guard
 * `.startsWith` throws and crashes any render that composites a tint.
 */

import { blendOver, contrastRatio, meetsContrast, withAlpha } from './color';

describe('withAlpha', () => {
  it('composites a 6-digit #rrggbb hex at the given alpha', () => {
    expect(withAlpha('#1A1612', 0.5)).toBe('rgba(26, 22, 18, 0.5)');
    expect(withAlpha('#FFFFFF', 0.88)).toBe('rgba(255, 255, 255, 0.88)');
    expect(withAlpha('#000000', 1)).toBe('rgba(0, 0, 0, 1)');
    // The brand accent at ~15% — exercises a real token value migrated in this story.
    expect(withAlpha('#C65D3B', 0.15)).toBe('rgba(198, 93, 59, 0.15)');
  });

  it('expands a 3-digit #rgb shorthand before compositing', () => {
    expect(withAlpha('#fff', 0.5)).toBe('rgba(255, 255, 255, 0.5)');
    expect(withAlpha('#abc', 1)).toBe('rgba(170, 187, 204, 1)');
  });

  it('returns "transparent" when the color is undefined (L2 crash guard)', () => {
    // A missing theme token resolves to `undefined` despite the `string` type —
    // the guard must not let `.startsWith` throw and crash the render.
    expect(withAlpha(undefined as unknown as string, 0.88)).toBe('transparent');
  });

  it('passes through a non-hex string unchanged (e.g. already-rgba tokens)', () => {
    expect(withAlpha('rgba(26, 22, 18, 0.5)', 0.3)).toBe('rgba(26, 22, 18, 0.5)');
    expect(withAlpha('red', 0.3)).toBe('red');
  });

  it('passes through a malformed-length hex unchanged (no partial parse)', () => {
    // 5-char hex isn't #rgb or #rrggbb → must not produce NaN channels.
    expect(withAlpha('#12345', 0.5)).toBe('#12345');
  });
});

/**
 * ⚠️ THIS BLOCK EXISTS BECAUSE `blendOver` HAD NO TEST AND NO RUNTIME CONSUMER — its only caller
 * is the contrast gate, so it FAILED OPEN in the one place it is load-bearing. Demonstrated:
 * making the function `return base` unconditionally — the exact shape of its own documented
 * fallback — left the whole app suite green, because both new navigation-chrome cases degenerated
 * into duplicates of the header-title and header-tint cases beside them. The 3.07:1 floor the
 * selected-label prop was added to clear then went unmeasured on all twelve palette × scheme
 * combinations, with every gate reporting OK.
 *
 * So the endpoints are pinned here, and `palettes.contrast.test.ts` additionally asserts that the
 * composited indicator is NOT `background.secondary` — the anti-vacuity half, which is what turns
 * a degenerate blend back into a red gate rather than a quieter pass.
 */
describe('blendOver', () => {
  it('returns the base at alpha 0 and the overlay at alpha 1 (the endpoints)', () => {
    expect(blendOver('#C65D3B', '#F5EFE9', 0)).toBe('#f5efe9');
    expect(blendOver('#C65D3B', '#F5EFE9', 1)).toBe('#c65d3b');
  });

  it('composites the real selection indicator — accent at 15% over the bar', () => {
    // The pair the tab layout actually ships: `withAlpha(accent.primary, 0.15)` over
    // `background.secondary`, terracotta · light. 198×0.15 + 245×0.85 = 237.95 → 0xee, and so on.
    expect(blendOver('#C65D3B', '#F5EFE9', 0.15)).toBe('#eed9cf');
  });

  it('midpoints on the sRGB channel values, not in linear light', () => {
    // Deliberately NOT gamma-correct: the platforms composite this way, so the gate must too.
    expect(blendOver('#000000', '#FFFFFF', 0.5)).toBe('#808080');
  });

  it('expands #rgb shorthand on both inputs', () => {
    expect(blendOver('#000', '#fff', 1)).toBe('#000000');
  });

  it('returns the base unchanged for an unparseable input (documented pass-through)', () => {
    expect(blendOver('rgba(198, 93, 59, 0.15)', '#F5EFE9', 0.15)).toBe('#F5EFE9');
    expect(blendOver('#C65D3B', 'transparent', 0.15)).toBe('transparent');
    expect(blendOver(undefined as unknown as string, '#F5EFE9', 0.15)).toBe('#F5EFE9');
  });

  it('clamps an out-of-range alpha to the 0–1 endpoints', () => {
    expect(blendOver('#C65D3B', '#F5EFE9', -1)).toBe('#f5efe9');
    expect(blendOver('#C65D3B', '#F5EFE9', 2)).toBe('#c65d3b');
  });

  it('refuses a non-finite alpha rather than emitting `#NaNNaNNaN`', () => {
    // ⚠️ `Math.min`/`Math.max` do NOT clamp NaN, and the malformed hex that falls out is read by
    // `contrastRatio` as the neutral 1 — a silent "these colours are identical", not an error.
    for (const alpha of [Number.NaN, Number.POSITIVE_INFINITY, undefined as unknown as number]) {
      expect(blendOver('#C65D3B', '#F5EFE9', alpha)).toBe('#F5EFE9');
    }
    expect(contrastRatio(blendOver('#C65D3B', '#F5EFE9', Number.NaN), '#1A1612')).toBeGreaterThan(
      1
    );
  });
});

describe('contrastRatio (WCAG relative-luminance)', () => {
  it('returns 21 for black on white (the max ratio)', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    // Order-independent: the formula puts the lighter color on top either way.
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 5);
  });

  it('returns 1 for two identical colors', () => {
    expect(contrastRatio('#C65D3B', '#C65D3B')).toBeCloseTo(1, 10);
    expect(contrastRatio('#777', '#777')).toBeCloseTo(1, 10);
  });

  it('expands #rgb shorthand before computing', () => {
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 5);
  });

  it('matches a known mid-contrast pair (white on terracotta accent)', () => {
    // #C65D3B is the brand accent; white-on-it is a well-known ~4.5 pair.
    const ratio = contrastRatio('#FFFFFF', '#C65D3B');
    expect(ratio).toBeGreaterThan(4);
    expect(ratio).toBeLessThan(5);
  });

  it('returns 1 (no contrast claim) for an unparseable input', () => {
    // Defensive: a non-hex token must not throw — it yields the neutral 1.0.
    expect(contrastRatio('rgba(0,0,0,0.5)', '#FFFFFF')).toBe(1);
    expect(contrastRatio(undefined as unknown as string, '#FFFFFF')).toBe(1);
  });

  it('rejects malformed hex that parseInt would PARTIAL-parse (→ neutral 1)', () => {
    // parseInt('1g',16)=1, parseInt('-1',16)=-1, parseInt(' 4',16)=4 — a length-only
    // check would admit these as bogus/negative channels. The strict-hex guard rejects
    // them, so each yields the neutral 1.0 rather than a fabricated contrast ratio.
    expect(contrastRatio('#1g3456', '#FFFFFF')).toBe(1); // 'g' is not a hex digit
    expect(contrastRatio('#-12345', '#FFFFFF')).toBe(1); // '-' → would be a negative channel
    expect(contrastRatio('#12 456', '#FFFFFF')).toBe(1); // embedded whitespace
  });
});

describe('meetsContrast', () => {
  it('passes when the ratio is at or above the minimum', () => {
    expect(meetsContrast('#000000', '#FFFFFF', 7)).toBe(true);
    expect(meetsContrast('#000000', '#FFFFFF', 21)).toBe(true); // exactly the max
  });

  it('fails when the ratio is below the minimum', () => {
    expect(meetsContrast('#FFFFFF', '#C65D3B', 7)).toBe(false);
  });
});
