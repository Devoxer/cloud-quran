import { calculateProgress, formatDuration, PLAYBACK_RATES } from './audioHelpers';

// Story 22.2: the word-level sync helpers (findWordAtPosition, findWordIndexAtPosition,
// calculateDrift, getDriftTier) were removed — sentence highlighting is now a direct
// `currentTime → block` lookup over the R2 block sidecar (see packages/shared/blocks.ts
// + its unit test). audioHelpers now only holds playback formatting.

describe('audioHelpers', () => {
  describe('formatDuration', () => {
    it('formats 0ms as "0:00"', () => {
      expect(formatDuration(0)).toBe('0:00');
    });

    it('formats 1000ms as "0:01"', () => {
      expect(formatDuration(1000)).toBe('0:01');
    });

    it('formats 60000ms as "1:00"', () => {
      expect(formatDuration(60000)).toBe('1:00');
    });

    it('formats 61000ms as "1:01"', () => {
      expect(formatDuration(61000)).toBe('1:01');
    });

    it('formats 3600000ms as "1:00:00"', () => {
      expect(formatDuration(3600000)).toBe('1:00:00');
    });

    it('formats 3661000ms as "1:01:01"', () => {
      expect(formatDuration(3661000)).toBe('1:01:01');
    });

    it('handles negative values gracefully by returning "0:00"', () => {
      expect(formatDuration(-1000)).toBe('0:00');
    });

    it('handles NaN gracefully by returning "0:00"', () => {
      expect(formatDuration(NaN)).toBe('0:00');
    });
  });

  describe('calculateProgress', () => {
    it('returns 0 when position is 0', () => {
      expect(calculateProgress(0, 60000)).toBe(0);
    });

    it('returns 50 when position is half of duration', () => {
      expect(calculateProgress(30000, 60000)).toBe(50);
    });

    it('returns 100 when position equals duration', () => {
      expect(calculateProgress(60000, 60000)).toBe(100);
    });

    it('caps at 100 when position exceeds duration', () => {
      expect(calculateProgress(70000, 60000)).toBe(100);
    });

    it('returns 0 when duration is 0', () => {
      expect(calculateProgress(1000, 0)).toBe(0);
    });

    it('returns 0 when both position and duration are 0', () => {
      expect(calculateProgress(0, 0)).toBe(0);
    });

    it('handles negative position by returning 0', () => {
      expect(calculateProgress(-1000, 60000)).toBe(0);
    });
  });

  describe('PLAYBACK_RATES', () => {
    it('contains the standard playback rates', () => {
      expect(PLAYBACK_RATES).toEqual([0.5, 0.75, 1, 1.25, 1.5, 2]);
    });

    it('has 6 rate options', () => {
      expect(PLAYBACK_RATES).toHaveLength(6);
    });

    it('includes 1x (normal speed)', () => {
      expect(PLAYBACK_RATES).toContain(1);
    });
  });
});
