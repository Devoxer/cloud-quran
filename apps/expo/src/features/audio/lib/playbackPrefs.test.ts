/**
 * The device-local playback rate (story 7-4).
 *
 * ⚠️ THE MMKV INSTANCE IS FAKED AT ITS FACTORY, NOT MOCKED AWAY. What is under test is what this
 * module does with what storage HANDS BACK — an old build's string, a `NaN`, a rate from a future
 * version with wider bounds — and none of those can be produced through the real instance's typed
 * setter. The fake is a plain map, so the round-trip case still exercises a real write and read.
 */

const mockStore: { value: unknown; throwOnRead: boolean; throwOnWrite: boolean } = {
  value: undefined,
  throwOnRead: false,
  throwOnWrite: false,
};

jest.mock('@/lib/mmkv', () => ({
  createAppMMKV: () => ({
    getNumber: () => {
      if (mockStore.throwOnRead) throw new Error('storage unavailable');
      return mockStore.value;
    },
    set: (_key: string, value: number) => {
      if (mockStore.throwOnWrite) throw new Error('storage unavailable');
      mockStore.value = value;
    },
  }),
}));

import { SPEED_DEFAULT, SPEED_MAX, SPEED_MIN } from '@/constants/audio';
import { readStoredSpeed, writeStoredSpeed } from './playbackPrefs';

beforeEach(() => {
  mockStore.value = undefined;
  mockStore.throwOnRead = false;
  mockStore.throwOnWrite = false;
});

describe('the default', () => {
  it('is 1.0 when nothing has ever been stored', () => {
    expect(readStoredSpeed()).toBe(1);
    expect(SPEED_DEFAULT).toBe(1);
  });

  it('is 1.0 when the device refuses the read outright', () => {
    // A reader whose speed preference cannot be read still wants their Quran to play.
    mockStore.throwOnRead = true;
    expect(readStoredSpeed()).toBe(1);
  });
});

describe('persistence', () => {
  it('round-trips a rate the reader chose', () => {
    writeStoredSpeed(1.5);
    expect(readStoredSpeed()).toBe(1.5);
  });

  it('a write the device refuses is not a crash — this session simply keeps the rate', () => {
    mockStore.throwOnWrite = true;
    expect(() => writeStoredSpeed(1.5)).not.toThrow();
  });
});

describe('the clamp — what comes back off a device is not a number, it is a hope', () => {
  /**
   * ⚠️ THE `NaN` CASE IS THE ONE THAT MATTERS, and it is why `clampSpeed` takes `unknown`. Both
   * `NaN < 0.5` and `NaN > 2` are FALSE, so a naive `if (v < min || v > max)` guard passes it
   * straight through to the native player — which answers a `NaN` rate with silence, not an
   * error. MUTATION: replace the `Number.isFinite` check with those two comparisons; this reddens
   * and nothing else does.
   */
  it.each([
    ['a NaN', Number.NaN],
    ['an Infinity', Number.POSITIVE_INFINITY],
    ['a string an older build wrote', '1.5'],
    ['a null', null],
    ['an object', { rate: 1.5 }],
  ])('resolves %s to 1.0', (_label, stored) => {
    mockStore.value = stored;
    expect(readStoredSpeed()).toBe(1);
  });

  it.each([
    ['below the floor', 0.1, SPEED_MIN],
    ['above the ceiling', 4, SPEED_MAX],
    ['exactly the floor', 0.5, 0.5],
    ['exactly the ceiling', 2, 2],
  ])('clamps %s', (_label, stored, expected) => {
    mockStore.value = stored;
    expect(readStoredSpeed()).toBe(expected);
  });

  it('clamps on the way IN as well, so a written value always reads back unchanged', () => {
    // Otherwise storage holds a rate this module would then clamp on every read — the value the
    // reader sees and the value on disk would disagree forever.
    writeStoredSpeed(9);
    expect(mockStore.value).toBe(SPEED_MAX);
    expect(readStoredSpeed()).toBe(SPEED_MAX);
  });

  it('rounds to two decimals, so a stepped rate round-trips as itself', () => {
    // 0.1 increments in binary floating point reach 1.7999999999999998, which renders "1.80x"
    // and never compares equal to the 1.8 the next press computes.
    writeStoredSpeed(1.7999999999999998);
    expect(readStoredSpeed()).toBe(1.8);
  });
});
