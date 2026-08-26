import { describe, expect, it } from 'vitest';
import { DAILY_WRITE_CEILING, utcDay } from './write-guard';

describe('the write ceiling', () => {
  it('buckets by UTC day, not by local time — a device cannot shift its own bucket', () => {
    expect(utcDay(Date.UTC(2026, 7, 24, 23, 59, 59))).toBe('2026-08-24');
    expect(utcDay(Date.UTC(2026, 7, 25, 0, 0, 0))).toBe('2026-08-25');
  });

  it('is a bounded fraction of a day of account-wide writes', () => {
    // ~3 rows per applied write (data row + its index entry + the counter row). One runaway
    // client must not be able to take the account down on its own.
    expect(DAILY_WRITE_CEILING * 3).toBeLessThan(100_000 / 5);
  });
});
