/**
 * Unit tests for Border Radius design tokens
 * Verifies radii values match the Epic 23 locked scale (tokens.ts)
 */

import { RADII, RadiiToken, RadiiValue } from './radii';

describe('RADII (Epic 23 locked scale)', () => {
  describe('scale values', () => {
    it('has correct sm value (8px) for small elements, badges', () => {
      expect(RADII.sm).toBe(8);
    });

    it('has correct md value (12px) for buttons, inputs, chips', () => {
      expect(RADII.md).toBe(12);
    });

    it('has correct lg value (16px) for grouped card surfaces', () => {
      expect(RADII.lg).toBe(16);
    });

    it('has correct xl value (20px) for large cards, modals', () => {
      expect(RADII.xl).toBe(20);
    });

    it('has correct pill value (999px) for pills, circular', () => {
      expect(RADII.pill).toBe(999);
    });

    it('has correct cover value (10px) for book covers', () => {
      expect(RADII.cover).toBe(10);
    });
  });

  describe('scale progression', () => {
    it('values increase in order (excluding pill)', () => {
      expect(RADII.sm).toBeLessThan(RADII.md);
      expect(RADII.md).toBeLessThan(RADII.lg);
      expect(RADII.lg).toBeLessThan(RADII.xl);
    });

    it('cover sits between sm and md', () => {
      expect(RADII.cover).toBeGreaterThan(RADII.sm);
      expect(RADII.cover).toBeLessThan(RADII.md);
    });

    it('pill is significantly larger than xl for circular effect', () => {
      expect(RADII.pill).toBeGreaterThan(RADII.xl * 10);
    });
  });

  describe('dropped legacy keys', () => {
    it('no longer exposes the removed `none` / `full` keys', () => {
      expect(Object.keys(RADII)).not.toContain('none');
      expect(Object.keys(RADII)).not.toContain('full');
    });
  });
});

describe('type exports', () => {
  it('RadiiToken includes all keys', () => {
    const tokens: RadiiToken[] = ['sm', 'md', 'lg', 'xl', 'pill', 'cover'];
    tokens.forEach((token) => {
      expect(Object.keys(RADII)).toContain(token);
    });
  });

  it('RadiiValue is a number', () => {
    const value: RadiiValue = RADII.lg;
    expect(typeof value).toBe('number');
  });
});
