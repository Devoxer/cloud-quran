/**
 * Unit tests for Shadow design tokens
 * Verifies the Epic 23 locked elevation set (tokens.ts)
 */

import { SHADOWS, ShadowToken } from './shadows';

describe('SHADOWS', () => {
  describe('cover preset (book covers)', () => {
    it('has correct offset', () => {
      expect(SHADOWS.cover.shadowOffset).toEqual({ width: 0, height: 6 });
    });

    it('has correct opacity (0.4)', () => {
      expect(SHADOWS.cover.shadowOpacity).toBe(0.4);
    });

    it('has correct radius (14)', () => {
      expect(SHADOWS.cover.shadowRadius).toBe(14);
    });

    it('has Android elevation (4)', () => {
      expect(SHADOWS.cover.elevation).toBe(4);
    });
  });

  describe('card preset (grouped surfaces)', () => {
    it('has correct offset', () => {
      expect(SHADOWS.card.shadowOffset).toEqual({ width: 0, height: 2 });
    });

    it('has correct opacity (0.14)', () => {
      expect(SHADOWS.card.shadowOpacity).toBe(0.14);
    });

    it('has correct radius (6)', () => {
      expect(SHADOWS.card.shadowRadius).toBe(6);
    });

    it('has Android elevation (2)', () => {
      expect(SHADOWS.card.elevation).toBe(2);
    });
  });

  describe('floating preset (chrome)', () => {
    it('has correct offset', () => {
      expect(SHADOWS.floating.shadowOffset).toEqual({ width: 0, height: 12 });
    });

    it('has correct opacity (0.5)', () => {
      expect(SHADOWS.floating.shadowOpacity).toBe(0.5);
    });

    it('has correct radius (34)', () => {
      expect(SHADOWS.floating.shadowRadius).toBe(34);
    });

    it('has Android elevation (12)', () => {
      expect(SHADOWS.floating.elevation).toBe(12);
    });
  });

  describe('sheet preset (bottom sheets, modals)', () => {
    it('has correct offset (negative height — lifts upward)', () => {
      expect(SHADOWS.sheet.shadowOffset).toEqual({ width: 0, height: -20 });
    });

    it('has correct opacity (0.5)', () => {
      expect(SHADOWS.sheet.shadowOpacity).toBe(0.5);
    });

    it('has correct radius (50)', () => {
      expect(SHADOWS.sheet.shadowRadius).toBe(50);
    });

    it('has Android elevation (16)', () => {
      expect(SHADOWS.sheet.elevation).toBe(16);
    });
  });

  describe('base color', () => {
    it('all presets use a neutral black base (#000)', () => {
      Object.values(SHADOWS).forEach((shadow) => {
        expect(shadow.shadowColor).toBe('#000');
      });
    });
  });

  describe('React Native compatibility', () => {
    it('all presets have required shadow properties', () => {
      const requiredProps = [
        'shadowColor',
        'shadowOffset',
        'shadowOpacity',
        'shadowRadius',
        'elevation',
      ];

      Object.values(SHADOWS).forEach((shadow) => {
        requiredProps.forEach((prop) => {
          expect(shadow).toHaveProperty(prop);
        });
      });
    });

    it('shadowOffset has width and height', () => {
      Object.values(SHADOWS).forEach((shadow) => {
        expect(shadow.shadowOffset).toHaveProperty('width');
        expect(shadow.shadowOffset).toHaveProperty('height');
      });
    });
  });

  describe('dropped legacy keys', () => {
    it('no longer exposes the removed none/sm/md/lg keys', () => {
      const keys = Object.keys(SHADOWS);
      expect(keys).not.toContain('none');
      expect(keys).not.toContain('sm');
      expect(keys).not.toContain('md');
      expect(keys).not.toContain('lg');
    });
  });
});

describe('type exports', () => {
  it('ShadowToken includes all presets', () => {
    const tokens: ShadowToken[] = ['cover', 'card', 'floating', 'sheet'];
    tokens.forEach((token) => {
      expect(Object.keys(SHADOWS)).toContain(token);
    });
  });
});
