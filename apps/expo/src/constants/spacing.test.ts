/**
 * Unit tests for Spacing design tokens
 * Verifies spacing scale matches UX spec (4px base unit)
 */

import {
  HEADER_CONTENT_CLEARANCE,
  LAYOUT,
  SPACING,
  SpacingToken,
  SpacingValue,
  screenContentStyle,
  spacing,
  TAB_BAR_HEIGHT,
} from './spacing';

describe('SPACING', () => {
  describe('scale values (UX spec lines 389-405)', () => {
    it('has correct xs value (4px)', () => {
      expect(SPACING.xs).toBe(4);
    });

    it('has correct sm value (8px)', () => {
      expect(SPACING.sm).toBe(8);
    });

    it('has correct md value (12px)', () => {
      expect(SPACING.md).toBe(12);
    });

    it('has correct lg value (16px)', () => {
      expect(SPACING.lg).toBe(16);
    });

    it('has correct xl value (24px)', () => {
      expect(SPACING.xl).toBe(24);
    });

    it('has correct xxl value (32px)', () => {
      expect(SPACING.xxl).toBe(32);
    });

    it('has correct xxxl value (48px)', () => {
      expect(SPACING.xxxl).toBe(48);
    });
  });

  describe('scale progression', () => {
    it('follows 4px base unit pattern', () => {
      // All values should be divisible by 4
      Object.values(SPACING).forEach((value) => {
        expect(value % 4).toBe(0);
      });
    });

    it('values increase in order', () => {
      expect(SPACING.xs).toBeLessThan(SPACING.sm);
      expect(SPACING.sm).toBeLessThan(SPACING.md);
      expect(SPACING.md).toBeLessThan(SPACING.lg);
      expect(SPACING.lg).toBeLessThan(SPACING.xl);
      expect(SPACING.xl).toBeLessThan(SPACING.xxl);
      expect(SPACING.xxl).toBeLessThan(SPACING.xxxl);
    });
  });
});

describe('spacing() helper function', () => {
  it('returns correct value for multiplier 1', () => {
    expect(spacing(1)).toBe(4);
  });

  it('returns correct value for multiplier 2', () => {
    expect(spacing(2)).toBe(8);
  });

  it('returns correct value for multiplier 3', () => {
    expect(spacing(3)).toBe(12);
  });

  it('handles decimal multipliers', () => {
    expect(spacing(1.5)).toBe(6);
    expect(spacing(2.5)).toBe(10);
  });

  it('handles zero', () => {
    expect(spacing(0)).toBe(0);
  });

  it('handles large multipliers', () => {
    expect(spacing(10)).toBe(40);
    expect(spacing(100)).toBe(400);
  });
});

describe('screenContentStyle() — wide-screen cap helper (Story 23.25)', () => {
  it('defaults to the main (768) token', () => {
    expect(screenContentStyle()).toEqual({
      width: '100%',
      maxWidth: LAYOUT.maxWidth.main,
      alignSelf: 'center',
    });
  });

  it('returns the requested token width (content / form)', () => {
    expect(screenContentStyle('content')).toMatchObject({ maxWidth: LAYOUT.maxWidth.content });
    expect(screenContentStyle('form')).toMatchObject({ maxWidth: LAYOUT.maxWidth.form });
  });

  it('always centers + self-caps (no-op below the token via width:100%)', () => {
    const s = screenContentStyle('main');
    expect(s.width).toBe('100%');
    expect(s.alignSelf).toBe('center');
  });
});

describe('TAB_BAR_HEIGHT (story 6-0)', () => {
  // jest-expo runs the iPhone iOS preset (`Platform.OS === 'ios'`, `Platform.isPad` falsy), so the
  // constant resolves to its iPhone branch at import. The Android (80dp), iPad (0 on iPadOS 18+,
  // 49 below it) and web (0) branches are not import-time-observable under this preset — resetting
  // modules and mocking `Platform` to read them back is the pattern the sibling blocks deliberately
  // avoided — so they are exercised by the platform smokes and argued in the docblock's provenance.
  //
  // ⚠️ The constant is a bare NUMBER rather than a hook on purpose: `useBottomTabBarHeight()`
  // belongs to the JS bottom-tabs navigator and THROWS under `<NativeTabs>`, which mounts no
  // `BottomTabBarHeightContext`. That reasoning lives in the docblock, where it is read; asserting
  // `typeof … === 'number'` here pinned nothing the case below does not already pin.
  it('is the 49pt iOS UITabBar height — NOT 84, which double-counts the home indicator', () => {
    // 84 ≈ 49 + ~34: the previous value summed the home indicator that `insets.bottom` already
    // supplies, so a consumer adding `TAB_BAR_HEIGHT + insets.bottom` floated ~34pt too high.
    expect(TAB_BAR_HEIGHT).toBe(49);
  });
});

describe('HEADER_CONTENT_CLEARANCE', () => {
  // jest-expo runs the iPhone iOS preset, so the constant resolves to its iOS branch — 0 — at
  // import. This is the load-bearing invariant: iOS already gets its top breathing room from the
  // large-title inset (`contentInsetAdjustmentBehavior`), so it MUST be 0 there or summing it into
  // a paddingTop double-spaces. The web and Android `SPACING.xl` branches are not
  // import-time-observable under this preset and are exercised by those platform smokes.
  //
  // ⚠️ story 6-0 deleted this constant and its test, then restored both: the 2026-08-26 chrome
  // reversal makes an opaque native header live again on every pushed screen, which is the exact
  // condition the non-zero branches were measured against, and 6.1 is the first screen to meet it.
  it('is 0 on iOS (large-title inset provides the top room — no double-spacing)', () => {
    expect(HEADER_CONTENT_CLEARANCE).toBe(0);
  });
});

describe('type exports', () => {
  it('SpacingToken includes all keys', () => {
    const token: SpacingToken = 'md';
    expect(Object.keys(SPACING)).toContain(token);
  });

  it('SpacingValue is a number', () => {
    const value: SpacingValue = SPACING.lg;
    expect(typeof value).toBe('number');
  });
});
