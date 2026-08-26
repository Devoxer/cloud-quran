/**
 * Unit tests for Typography design tokens
 * Verifies font sizes, weights, and line heights match UX spec
 */

import {
  FONT_FAMILY,
  FONT_SIZE,
  FONT_WEIGHT,
  FontSizeToken,
  FontWeightToken,
  LINE_HEIGHT,
  LineHeightToken,
  TYPOGRAPHY,
} from './typography';

describe('FONT_SIZE (UX spec lines 368-388)', () => {
  it('has correct display size (28px)', () => {
    expect(FONT_SIZE.display).toBe(28);
  });

  it('has correct h1 size (22px)', () => {
    expect(FONT_SIZE.h1).toBe(22);
  });

  it('has correct h2 size (18px)', () => {
    expect(FONT_SIZE.h2).toBe(18);
  });

  it('has correct h3 size (16px)', () => {
    expect(FONT_SIZE.h3).toBe(16);
  });

  it('has correct body size (15px)', () => {
    expect(FONT_SIZE.body).toBe(15);
  });

  it('has correct bodySmall size (13px)', () => {
    expect(FONT_SIZE.bodySmall).toBe(13);
  });

  it('has correct caption size (11px)', () => {
    expect(FONT_SIZE.caption).toBe(11);
  });

  it('has correct syncedText size (17px)', () => {
    expect(FONT_SIZE.syncedText).toBe(17);
  });

  it('has sizes in descending order (display > h1 > h2 > h3)', () => {
    expect(FONT_SIZE.display).toBeGreaterThan(FONT_SIZE.h1);
    expect(FONT_SIZE.h1).toBeGreaterThan(FONT_SIZE.h2);
    expect(FONT_SIZE.h2).toBeGreaterThan(FONT_SIZE.h3);
  });
});

describe('FONT_WEIGHT', () => {
  it('has correct regular weight (400)', () => {
    expect(FONT_WEIGHT.regular).toBe('400');
  });

  it('has correct medium weight (500)', () => {
    expect(FONT_WEIGHT.medium).toBe('500');
  });

  it('has correct semibold weight (600)', () => {
    expect(FONT_WEIGHT.semibold).toBe('600');
  });

  it('has correct bold weight (700)', () => {
    expect(FONT_WEIGHT.bold).toBe('700');
  });

  it('weights are strings for React Native compatibility', () => {
    Object.values(FONT_WEIGHT).forEach((weight) => {
      expect(typeof weight).toBe('string');
    });
  });
});

describe('LINE_HEIGHT', () => {
  it('has correct tight value (1.2) for display', () => {
    expect(LINE_HEIGHT.tight).toBe(1.2);
  });

  it('has correct heading1 value (1.25)', () => {
    expect(LINE_HEIGHT.heading1).toBe(1.25);
  });

  it('has correct heading2 value (1.3)', () => {
    expect(LINE_HEIGHT.heading2).toBe(1.3);
  });

  it('has correct heading3 value (1.35)', () => {
    expect(LINE_HEIGHT.heading3).toBe(1.35);
  });

  it('has correct relaxed value (1.4) for bodySmall', () => {
    expect(LINE_HEIGHT.relaxed).toBe(1.4);
  });

  it('has correct body value (1.5)', () => {
    expect(LINE_HEIGHT.body).toBe(1.5);
  });

  it('has correct loose value (1.7) for syncedText', () => {
    expect(LINE_HEIGHT.loose).toBe(1.7);
  });

  it('line heights are numbers (ratios)', () => {
    Object.values(LINE_HEIGHT).forEach((height) => {
      expect(typeof height).toBe('number');
      expect(height).toBeGreaterThan(1);
      expect(height).toBeLessThan(2);
    });
  });
});

describe('FONT_FAMILY', () => {
  it('has sans font stack', () => {
    expect(FONT_FAMILY.sans).toBeDefined();
    expect(FONT_FAMILY.sans).toContain('-apple-system');
    expect(FONT_FAMILY.sans).toContain('BlinkMacSystemFont');
    expect(FONT_FAMILY.sans).toContain('Roboto');
  });
});

describe('TYPOGRAPHY combined constant', () => {
  it('contains all sub-constants', () => {
    expect(TYPOGRAPHY.fontSize).toBe(FONT_SIZE);
    expect(TYPOGRAPHY.fontWeight).toBe(FONT_WEIGHT);
    expect(TYPOGRAPHY.lineHeight).toBe(LINE_HEIGHT);
    expect(TYPOGRAPHY.fontFamily).toBe(FONT_FAMILY);
  });
});

describe('type exports', () => {
  it('FontSizeToken includes expected keys', () => {
    const token: FontSizeToken = 'body';
    expect(Object.keys(FONT_SIZE)).toContain(token);
  });

  it('FontWeightToken includes expected keys', () => {
    const token: FontWeightToken = 'medium';
    expect(Object.keys(FONT_WEIGHT)).toContain(token);
  });

  it('LineHeightToken includes expected keys', () => {
    const token: LineHeightToken = 'body';
    expect(Object.keys(LINE_HEIGHT)).toContain(token);
  });
});
