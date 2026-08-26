/**
 * THE PER-USER DAILY WRITE CEILING — enforced here, never trusted from the client.
 *
 * ⚠️ WHY THIS EXISTS — AND THE PREMISE IT WAS BUILT ON IS WRONG, CORRECTED 2026-08-24 (story
 * 5-5). This said "D1's free tier allows 100k rows written per day ACCOUNT-WIDE, and exceeding it
 * returns ERRORS. Sync stops for everyone; it does not merely cost money." The account has been
 * on **Workers Paid since ~2026-07** (owner-confirmed), where D1 allows 50M rows written per
 * month and **bills** beyond it. So the failure is a bill, not an outage.
 *
 * THE CEILING STAYS, AND SO DOES ITS SIZE. A render-storm defect in a sibling app once produced a
 * write per scroll tick and one user exhausted a whole account in 4.6 hours; on Paid the same
 * defect is an invoice instead, which is not much better and arrives with no warning. A
 * client-side debounce is the first line and it is exactly the thing that breaks; this is the
 * line that cannot be broken from outside. What changed is only what the number may VETO.
 *
 * ⚠️ THE COUNTER IS ITSELF A WRITE, so its cost is designed around:
 *   • An OVER-CEILING request is rejected BEFORE anything is written — a runaway client past
 *     its ceiling costs zero rows, not one row per rejection.
 *   • A write that CHANGED NOTHING is not recorded. The LWW upserts are guarded by
 *     `setWhere: lt(table.updatedAt, incoming)`, so re-sending an older — or identical —
 *     timestamp updates no row and returns no row, and the counter is not touched either. A
 *     position write burst that keeps re-sending the same instant therefore costs one write in
 *     total, not one per request.
 *   • The counter is ONE ROW PER USER, FOREVER: the day is overwritten on rollover instead of a
 *     new row appended, so there is nothing to clean up — which is worth having on its own
 *     terms. (The old reason given here, "a cron trigger alone flips the account onto the paid
 *     tier", is wrong twice over: Cron Triggers are available on the free plan, and this account
 *     is on Paid regardless. Corrected 2026-08-24, story 5-5.)
 *
 * The arithmetic behind the ceiling: at `DAILY_WRITE_CEILING` applied writes, one user costs at
 * most ~3 rows per write (the data row, its one index entry, and the counter row) — call it
 * 6k rows, 6% of the account's day. A dozen users at full tilt is survivable; a runaway client
 * is bounded instead of unbounded, which is the actual failure this prevents. It is also
 * roughly eleven hours of reading at one write per verse change, so no real reader meets it.
 *
 * ⚠️ Read-then-write is not atomic and D1 has no interactive transactions, so two concurrent
 * requests from one user can both see the same `used` and undercount by one. That is accepted:
 * this is a COST ceiling, not a security boundary, and the bound it needs to hold is
 * order-of-magnitude. Do not "fix" it with a lock — there is nothing to lock with.
 */
import { eq } from 'drizzle-orm';
import type { Database } from '../db';
import { writeBudget } from '../db/schema';

/** Applied writes allowed per user per UTC day. See the arithmetic above before changing it. */
export const DAILY_WRITE_CEILING = 2000;

/** The UTC calendar day a timestamp falls in, `YYYY-MM-DD`. UTC so it cannot shift with a device. */
export function utcDay(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export type WriteBudgetState = {
  /** Applied writes already recorded for this user today. */
  used: number;
  /** Whether one more write is permitted. */
  allowed: boolean;
  limit: number;
  day: string;
};

/** Read the user's budget for today. A read, not a write — costs rows scanned, not rows written. */
export async function readWriteBudget(
  db: Database,
  userId: string,
  nowMs: number
): Promise<WriteBudgetState> {
  const day = utcDay(nowMs);
  const rows = await db
    .select({ day: writeBudget.day, writes: writeBudget.writes })
    .from(writeBudget)
    .where(eq(writeBudget.userId, userId))
    .limit(1);
  // A row from a PREVIOUS day is a zeroed counter, not a carried-over one.
  const used = rows.length > 0 && rows[0].day === day ? rows[0].writes : 0;
  return { used, allowed: used < DAILY_WRITE_CEILING, limit: DAILY_WRITE_CEILING, day };
}

/**
 * Record `count` APPLIED writes. Call this only after a statement that actually changed a row —
 * see the no-op note above.
 */
export async function recordWrites(
  db: Database,
  userId: string,
  state: WriteBudgetState,
  count: number
): Promise<void> {
  if (count <= 0) return;
  const writes = state.used + count;
  await db
    .insert(writeBudget)
    .values({ userId, day: state.day, writes })
    .onConflictDoUpdate({
      target: writeBudget.userId,
      set: { day: state.day, writes },
    });
}
