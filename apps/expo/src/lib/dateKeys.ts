/**
 * Local-calendar date helpers (Story 23.9) — pure, no deps, so both the activity-log
 * writer (`lib/dailyActivity.ts`) and the stats derivation (`features/stats`) share one
 * definition of "what day is this".
 *
 * A "day number" is an integer that increments by 1 each LOCAL calendar day (DST-safe,
 * because it's rebuilt from the local Y/M/D rather than dividing the raw timestamp).
 * Two timestamps on the same local day map to the same number; consecutive days differ
 * by exactly 1 — so streak/consecutive-day math is plain integer arithmetic.
 */

const MS_PER_DAY = 86_400_000;

/** 'YYYY-MM-DD' for an epoch-ms timestamp in the device's local timezone. */
export function localDateKey(ms: number): string {
  const d = new Date(ms);
  const month = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/** Local-calendar day number for an epoch-ms timestamp. */
export function localDayNumber(ms: number): number {
  const d = new Date(ms);
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / MS_PER_DAY);
}

/** Local-calendar day number for a 'YYYY-MM-DD' key (the inverse of localDateKey). */
export function dayNumberFromDateKey(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}
