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

describe('HEADER_CONTENT_CLEARANCE', () => {
  // ⚠️ Re-derived a THIRD time in story 6-6, and the platform split died with the native header:
  // the old iOS-0 branch was a measurement of a transparent large-title header that no longer
  // renders anywhere. `components/ui/AppHeader` is opaque and identical on every platform, so
  // the breathing room below it is one token everywhere — a platform branch reappearing here
  // would be a claim about a native header this app no longer has.
  it('is one platform-independent token (SPACING.xl) under our own header', () => {
    expect(HEADER_CONTENT_CLEARANCE).toBe(SPACING.xl);
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
