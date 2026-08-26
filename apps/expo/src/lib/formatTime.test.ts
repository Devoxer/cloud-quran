/**
 * formatTime Tests
 *
 * Story 5.3: Build Full-Screen AudioPlayer Component
 * Epic 5: Core Summary Playback
 */

import i18n from '@/i18n';
import { formatSleepRemaining, formatTime } from './formatTime';

describe('formatTime', () => {
  describe('valid inputs', () => {
    it('formats 0ms as "0:00"', () => {
      expect(formatTime(0)).toBe('0:00');
    });

    it('formats 1000ms as "0:01"', () => {
      expect(formatTime(1000)).toBe('0:01');
    });

    it('formats 45000ms as "0:45"', () => {
      expect(formatTime(45000)).toBe('0:45');
    });

    it('formats 60000ms as "1:00"', () => {
      expect(formatTime(60000)).toBe('1:00');
    });

    it('formats 61000ms as "1:01"', () => {
      expect(formatTime(61000)).toBe('1:01');
    });

    it('formats 180000ms (3 minutes) as "3:00"', () => {
      expect(formatTime(180000)).toBe('3:00');
    });

    it('formats 204000ms as "3:24"', () => {
      expect(formatTime(204000)).toBe('3:24');
    });

    it('formats 599000ms as "9:59"', () => {
      expect(formatTime(599000)).toBe('9:59');
    });

    it('formats 3599000ms (59:59) correctly', () => {
      expect(formatTime(3599000)).toBe('59:59');
    });

    it('handles times over an hour', () => {
      // 1 hour, 5 minutes, 30 seconds
      expect(formatTime(3930000)).toBe('65:30');
    });
  });

  describe('edge cases', () => {
    it('handles negative values gracefully by returning "0:00"', () => {
      expect(formatTime(-1000)).toBe('0:00');
      expect(formatTime(-100)).toBe('0:00');
    });

    it('handles NaN gracefully by returning "0:00"', () => {
      expect(formatTime(NaN)).toBe('0:00');
    });

    it('handles Infinity gracefully by returning "0:00"', () => {
      expect(formatTime(Infinity)).toBe('0:00');
      expect(formatTime(-Infinity)).toBe('0:00');
    });

    it('rounds down milliseconds (floors to nearest second)', () => {
      expect(formatTime(1999)).toBe('0:01'); // 1.999 seconds -> 1 second
      expect(formatTime(59999)).toBe('0:59'); // 59.999 seconds -> 59 seconds
    });
  });

  describe('formatting', () => {
    it('pads single-digit seconds with leading zero', () => {
      expect(formatTime(5000)).toBe('0:05');
      expect(formatTime(65000)).toBe('1:05');
    });

    it('does not pad minutes with leading zero', () => {
      expect(formatTime(60000)).toBe('1:00');
      expect(formatTime(540000)).toBe('9:00');
    });
  });
});

describe('formatSleepRemaining (Story 19.5)', () => {
  it('returns "End" for end-of-section regardless of ms', () => {
    expect(formatSleepRemaining(0, true)).toBe('End');
    expect(formatSleepRemaining(720000, true)).toBe('End');
  });

  it('returns "" when inactive (no remaining)', () => {
    expect(formatSleepRemaining(0, false)).toBe('');
    expect(formatSleepRemaining(-5, false)).toBe('');
  });

  it('formats sub-minute as seconds (ceil)', () => {
    expect(formatSleepRemaining(45000, false)).toBe('45s');
    expect(formatSleepRemaining(1, false)).toBe('1s');
    expect(formatSleepRemaining(59999, false)).toBe('60s');
  });

  it('formats minutes (ceil) under an hour', () => {
    expect(formatSleepRemaining(720000, false)).toBe('12m'); // 12 min
    expect(formatSleepRemaining(60000, false)).toBe('1m');
    expect(formatSleepRemaining(90000, false)).toBe('2m'); // 1.5 min → ceil 2
  });

  it('formats hours + minutes at/over an hour', () => {
    expect(formatSleepRemaining(3600000, false)).toBe('1h 0m');
    expect(formatSleepRemaining(3900000, false)).toBe('1h 5m'); // 1h05m
    expect(formatSleepRemaining(7200000, false)).toBe('2h 0m');
  });

  it('carries a ceil-to-60 minute remainder instead of showing "60m" (Story 19.5 CR)', () => {
    // Last minute below an hour: ceil(remainder/60000) === 60 → must read as the next hour.
    expect(formatSleepRemaining(3570000, false)).toBe('1h 0m'); // 59m30s, not "60m"
    expect(formatSleepRemaining(3599000, false)).toBe('1h 0m'); // 59m59s, not "60m"
    // Last minute below 2h: must read "2h 0m", not "1h 60m".
    expect(formatSleepRemaining(7170000, false)).toBe('2h 0m'); // 1h59m30s
    expect(formatSleepRemaining(7199000, false)).toBe('2h 0m'); // 1h59m59s
  });
});

/**
 * ⚠️ THE NON-VACUOUS HALF (epic-20 boundary, review round 2).
 *
 * Every `formatSleepRemaining` assertion above runs under the default `en` init — which is exactly
 * why all 22 stayed byte-identical when round 1 converted the unit suffixes from hardcoded
 * literals to `player:sleep.*` keys. That made the change provably safe, and it also means those
 * tests cannot detect an `fr`-specific regression: French uses a NON-BREAKING-space-separated
 * "1 h 5 min" / "45 s", not "1h 5m" / "45s", and a wrong interpolation or a dropped space there
 * would leave every assertion above green.
 */
describe('formatSleepRemaining — localization (fr)', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('uses the French unit abbreviations and spacing', async () => {
    await i18n.changeLanguage('fr');
    expect(formatSleepRemaining(45000, false)).toBe('45 s');
    expect(formatSleepRemaining(720000, false)).toBe('12 min');
    expect(formatSleepRemaining(3900000, false)).toBe('1 h 5 min');
  });

  it('translates the end-of-section label', async () => {
    await i18n.changeLanguage('fr');
    expect(formatSleepRemaining(0, true)).toBe('Fin');
  });

  it('keeps the ceil-to-60 carry correct in fr (the round-1 CR case, re-checked per locale)', async () => {
    await i18n.changeLanguage('fr');
    expect(formatSleepRemaining(3570000, false)).toBe('1 h 0 min');
    expect(formatSleepRemaining(7170000, false)).toBe('2 h 0 min');
  });

  it('still returns the empty string when inactive, in any language', async () => {
    await i18n.changeLanguage('fr');
    expect(formatSleepRemaining(0, false)).toBe('');
  });
});
