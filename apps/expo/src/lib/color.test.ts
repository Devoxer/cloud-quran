/**
 * Unit coverage for `withAlpha` — the hex→rgba compositor (promoted from
 * `GlassBackdrop.applyAlpha` in Story 23.5; originally Story 17.4 §B, AC 11).
 *
 * Pure, branchy logic worth a unit net — including the L2 crash-guard: a runtime
 * theme-key miss resolves the color to `undefined`, and without the guard
 * `.startsWith` throws and crashes any render that composites a tint.
 */

import { contrastRatio, meetsContrast, withAlpha } from './color';

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
