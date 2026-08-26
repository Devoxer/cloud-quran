/**
 * THE SINGLE QUERY MODULE. Every D1 access in the worker goes through here.
 *
 * ⚠️ EVERY QUERY IS SCOPED TO `userId`, AND NO ROUTE EVER ACCEPTS A USER ID FROM THE CLIENT.
 * `userId` arrives from `lib/identity.ts` and nowhere else, so cross-user access is not "denied
 * by a rule" — it is unrepresentable in the SQL these functions emit. That is the whole point of
 * authorization-as-code, and it is what the previous layer failed at: its ownership rule bound
 * `isOwner` to an attribute (`data.creator`) that neither the schema nor any write ever set, so
 * every create was denied for the life of the project and nothing noticed.
 *
 * ⚠️ `userId` GOES LAST IN EVERY `.values()` SPREAD. Three of these read `{ userId, ...input }`
 * until the 5-4 review: a parser that ever gains a `userId` key would then override the
 * server-scoped id with a client-supplied one, letting the caller name the row's owner. That is
 * precisely the bug class this whole story replaces — InstantDB's rule trusted a `creator` field
 * the client controlled, and it was wrong for the project's entire life. Ordering is the fix that
 * cannot be forgotten at a call site.
 *
 * ⚠️ NO RAW SQL. Not one `sql` template tag — that is a boundary, not a style preference: the
 * Drizzle query builder is what makes a move to Postgres a driver swap rather than a rewrite.
 * Note in particular that the LWW guard is expressed as `setWhere: lt(table.updatedAt, incoming)`
 * rather than the textbook `WHERE excluded.updated_at > table.updated_at`. They are the same
 * predicate — `excluded.updated_at` IS the incoming value, which we already hold in JS — and the
 * builder form keeps the escape hatch. `git grep -n "sql\`" apps/worker/src` must stay empty.
 *
 * Every write returns whether it CHANGED anything, because `middleware/write-guard.ts` records
 * only applied writes: an LWW no-op must not spend budget.
 */
import { and, eq, lt } from 'drizzle-orm';
import type {
  AudioPositionInput,
  BookmarkInput,
  PreferencesInput,
  ReadingPositionInput,
} from '../lib/validate';
import type { Database } from './index';
import {
  account,
  audioPositions,
  bookmarks,
  preferences,
  readingPositions,
  user,
  writeBudget,
} from './schema';

/** One entry of a `db.batch()` call — whatever Drizzle's D1 batch accepts. */
type BatchStatement = Parameters<Database['batch']>[0][number];

export type ReadingPositionRow = typeof readingPositions.$inferSelect;
export type PreferencesRow = typeof preferences.$inferSelect;
export type AudioPositionRow = typeof audioPositions.$inferSelect;
export type BookmarkRow = typeof bookmarks.$inferSelect;

// ── reading position (LWW, one row per user) ──────────────────────────────────────────────────

export async function getReadingPosition(
  db: Database,
  userId: string
): Promise<ReadingPositionRow | null> {
  const rows = await db
    .select()
    .from(readingPositions)
    .where(eq(readingPositions.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

/** @returns true when a row was written; false when the stored row was newer (a no-op). */
export async function putReadingPosition(
  db: Database,
  userId: string,
  input: ReadingPositionInput
): Promise<boolean> {
  const applied = await db
    .insert(readingPositions)
    .values({ ...input, userId }) // userId LAST — see the note at the top of this file
    .onConflictDoUpdate({
      target: readingPositions.userId,
      set: {
        surah: input.surah,
        verse: input.verse,
        page: input.page,
        mode: input.mode,
        updatedAt: input.updatedAt,
      },
      setWhere: lt(readingPositions.updatedAt, input.updatedAt),
    })
    .returning({ userId: readingPositions.userId });
  return applied.length > 0;
}

// ── preferences (LWW, one row per user) ───────────────────────────────────────────────────────

export async function getPreferences(db: Database, userId: string): Promise<PreferencesRow | null> {
  const rows = await db.select().from(preferences).where(eq(preferences.userId, userId)).limit(1);
  return rows[0] ?? null;
}

/** @returns true when a row was written; false when the stored row was newer (a no-op). */
export async function putPreferences(
  db: Database,
  userId: string,
  input: PreferencesInput
): Promise<boolean> {
  const applied = await db
    .insert(preferences)
    .values({ ...input, userId }) // userId LAST — see the note at the top of this file
    .onConflictDoUpdate({
      target: preferences.userId,
      set: {
        theme: input.theme,
        fontSize: input.fontSize,
        reciterId: input.reciterId,
        readingMode: input.readingMode,
        translationId: input.translationId,
        speedRate: input.speedRate,
        transliteration: input.transliteration,
        updatedAt: input.updatedAt,
      },
      setWhere: lt(preferences.updatedAt, input.updatedAt),
    })
    .returning({ userId: preferences.userId });
  return applied.length > 0;
}

// ── audio position (LWW, one row per user) ────────────────────────────────────────────────────

export async function getAudioPosition(
  db: Database,
  userId: string
): Promise<AudioPositionRow | null> {
  const rows = await db
    .select()
    .from(audioPositions)
    .where(eq(audioPositions.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

/** @returns true when a row was written; false when the stored row was newer (a no-op). */
export async function putAudioPosition(
  db: Database,
  userId: string,
  input: AudioPositionInput
): Promise<boolean> {
  const applied = await db
    .insert(audioPositions)
    .values({ ...input, userId }) // userId LAST — see the note at the top of this file
    .onConflictDoUpdate({
      target: audioPositions.userId,
      set: {
        surah: input.surah,
        verse: input.verse,
        reciterId: input.reciterId,
        updatedAt: input.updatedAt,
      },
      setWhere: lt(audioPositions.updatedAt, input.updatedAt),
    })
    .returning({ userId: audioPositions.userId });
  return applied.length > 0;
}

// ── bookmarks (union-merge, many rows per user) ───────────────────────────────────────────────

export async function listBookmarks(db: Database, userId: string): Promise<BookmarkRow[]> {
  // Served by `bookmarks_user_surah_verse_idx`, which is left-prefixed on user_id — which is why
  // there is no separate index on user_id alone.
  return db.select().from(bookmarks).where(eq(bookmarks.userId, userId));
}

export type BookmarkWriteResult =
  /** Inserted a new row. */
  | { status: 'created'; bookmark: BookmarkRow }
  /** The same (user, surah, verse) was already bookmarked — idempotent, nothing written. */
  | { status: 'exists'; bookmark: BookmarkRow }
  /** The supplied id is already in use, and not by this user. Nothing written, nothing leaked. */
  | { status: 'id-taken' };

/**
 * Create a bookmark, idempotently.
 *
 * ⚠️ `onConflictDoNothing()` takes NO target on purpose, so it absorbs BOTH conflicts: the
 * `(user_id, surah, verse)` unique index (the union-merge dedup key — the second device to
 * bookmark the same ayah offline must converge, not error) AND the `id` primary key. The second
 * case is a cross-user probe: an id minted by another user swallows the insert, and this returns
 * `id-taken` WITHOUT reading the other user's row, so nothing about it is disclosed.
 */
export async function createBookmark(
  db: Database,
  userId: string,
  input: BookmarkInput
): Promise<BookmarkWriteResult> {
  const inserted = await db
    .insert(bookmarks)
    .values({ ...input, userId })
    .onConflictDoNothing()
    .returning();
  if (inserted.length > 0) return { status: 'created', bookmark: inserted[0] };

  const existing = await db
    .select()
    .from(bookmarks)
    .where(
      and(
        eq(bookmarks.userId, userId),
        eq(bookmarks.surah, input.surah),
        eq(bookmarks.verse, input.verse)
      )
    )
    .limit(1);
  return existing.length > 0 ? { status: 'exists', bookmark: existing[0] } : { status: 'id-taken' };
}

/**
 * Delete one bookmark by id.
 *
 * ⚠️ The `userId` half of the predicate is the authorization. Deleting on `id` alone would let
 * any identity delete any row it could guess — this is the route the cross-user write test
 * targets, because it is the only one where a client names a row rather than owning it by
 * construction.
 *
 * @returns true when a row was deleted; false when there was nothing of THIS user's to delete.
 */
export async function deleteBookmark(db: Database, userId: string, id: string): Promise<boolean> {
  const deleted = await db
    .delete(bookmarks)
    .where(and(eq(bookmarks.userId, userId), eq(bookmarks.id, id)))
    .returning({ id: bookmarks.id });
  return deleted.length > 0;
}

// ── the anonymous → signed-in re-stamp (story 5-5) ────────────────────────────────────────────

/**
 * Move every synced row from one user id to another, idempotently.
 *
 * ⚠️ IT RUNS FOR **EVERY** UPGRADE — APPLE, GOOGLE AND EMAIL ALIKE. This paragraph used to say
 * Apple and Google kept their `user.id` and never called it: true of the `/link-social` route
 * amendment (b) deleted, and dangerously wrong now. Every sign-in goes through `/sign-in/social`
 * or `/sign-in/email-otp`, both of which resolve the caller to whichever account owns the
 * verified address — so the user id CHANGES, Better Auth's `anonymous()` plugin fires
 * `onLinkAccount`, and then DELETES the anonymous user. Without this the guest's reading
 * position, bookmarks and preferences are orphaned on a user that no longer exists.
 *
 * ⚠️ `db.batch()` IS THE TRANSACTION. D1 has no interactive transactions — `db.transaction()`
 * would silently give none — but a batch is executed as one atomic unit. Every statement below
 * is also safely re-runnable on its own, because a retried sign-in must not double-apply.
 *
 * The conflict rules are the ones the rest of the worker already uses, not new ones:
 *   • the three LWW tables: the DESTINATION wins when it is newer. Implemented as insert-select?
 *     No — as a read of the source row followed by the same guarded upsert every write path uses,
 *     so there is exactly one definition of "newer" in this file.
 *   • bookmarks: union-merge. A guest bookmark for an ayah the destination already has is
 *     DROPPED (the destination's row, with its label, is the survivor); the rest are re-stamped.
 *     Dropping first is what keeps the `(user_id, surah, verse)` unique index from failing the
 *     whole batch.
 *   • `write_budget`: the guest's counter row is deleted, not merged. Carrying it would penalise
 *     a user for signing in, and the ceiling it feeds is a cost guard, not a security boundary.
 *
 * @returns the number of bookmarks carried over — enough for a test to tell a real move from a
 *          silent no-op, which is the only failure mode worth distinguishing here.
 */
export async function reassignUserRows(
  db: Database,
  fromUserId: string,
  toUserId: string
): Promise<{ bookmarksMoved: number }> {
  if (fromUserId === toUserId) return { bookmarksMoved: 0 };

  const [reading, prefs, audio, guestBookmarks, ownBookmarks] = await Promise.all([
    getReadingPosition(db, fromUserId),
    getPreferences(db, fromUserId),
    getAudioPosition(db, fromUserId),
    listBookmarks(db, fromUserId),
    listBookmarks(db, toUserId),
  ]);

  const taken = new Set(ownBookmarks.map((b) => `${b.surah}:${b.verse}`));
  const movable = guestBookmarks.filter((b) => !taken.has(`${b.surah}:${b.verse}`));

  // Drizzle types `batch` as a non-empty TUPLE of statements, which a dynamically built list
  // cannot satisfy. Every entry is a real query builder; the cast at the call site is the one
  // place that shape is asserted.
  const statements: BatchStatement[] = [];

  if (reading) {
    statements.push(
      db
        .insert(readingPositions)
        .values({
          surah: reading.surah,
          verse: reading.verse,
          page: reading.page,
          mode: reading.mode,
          updatedAt: reading.updatedAt,
          userId: toUserId,
        })
        .onConflictDoUpdate({
          target: readingPositions.userId,
          set: {
            surah: reading.surah,
            verse: reading.verse,
            page: reading.page,
            mode: reading.mode,
            updatedAt: reading.updatedAt,
          },
          setWhere: lt(readingPositions.updatedAt, reading.updatedAt),
        })
    );
  }
  if (prefs) {
    statements.push(
      db
        .insert(preferences)
        .values({
          theme: prefs.theme,
          fontSize: prefs.fontSize,
          reciterId: prefs.reciterId,
          readingMode: prefs.readingMode,
          translationId: prefs.translationId,
          speedRate: prefs.speedRate,
          transliteration: prefs.transliteration,
          updatedAt: prefs.updatedAt,
          userId: toUserId,
        })
        .onConflictDoUpdate({
          target: preferences.userId,
          set: {
            theme: prefs.theme,
            fontSize: prefs.fontSize,
            reciterId: prefs.reciterId,
            readingMode: prefs.readingMode,
            translationId: prefs.translationId,
            speedRate: prefs.speedRate,
            transliteration: prefs.transliteration,
            updatedAt: prefs.updatedAt,
          },
          setWhere: lt(preferences.updatedAt, prefs.updatedAt),
        })
    );
  }
  if (audio) {
    statements.push(
      db
        .insert(audioPositions)
        .values({
          surah: audio.surah,
          verse: audio.verse,
          reciterId: audio.reciterId,
          updatedAt: audio.updatedAt,
          userId: toUserId,
        })
        .onConflictDoUpdate({
          target: audioPositions.userId,
          set: {
            surah: audio.surah,
            verse: audio.verse,
            reciterId: audio.reciterId,
            updatedAt: audio.updatedAt,
          },
          setWhere: lt(audioPositions.updatedAt, audio.updatedAt),
        })
    );
  }

  // ⚠️ THE DUPLICATES ARE DELETED, NOT SKIPPED, AND THE REASON IS NOT WHAT IT LOOKS LIKE. An
  // earlier comment here claimed the DELETE prevents a unique-index collision — it does not:
  // `movable` already excludes every colliding row, so the re-stamp below can never hit the
  // index. What the DELETE actually prevents is an ORPHAN. A guest bookmark the destination
  // already has is not moved, so without this it stays on the guest — who the `anonymous()`
  // plugin deletes moments later — and becomes a row owned by nobody: invisible to every route,
  // uncollectable (there is no foreign key from `bookmarks` to `user`), and billed for forever.
  // A mutation removing these two lines passed the whole suite until the integration test began
  // counting rows in the table rather than in the account's list.
  for (const duplicate of guestBookmarks.filter((b) => taken.has(`${b.surah}:${b.verse}`))) {
    statements.push(db.delete(bookmarks).where(eq(bookmarks.id, duplicate.id)));
  }
  for (const moving of movable) {
    statements.push(
      db.update(bookmarks).set({ userId: toUserId }).where(eq(bookmarks.id, moving.id))
    );
  }

  statements.push(db.delete(readingPositions).where(eq(readingPositions.userId, fromUserId)));
  statements.push(db.delete(preferences).where(eq(preferences.userId, fromUserId)));
  statements.push(db.delete(audioPositions).where(eq(audioPositions.userId, fromUserId)));
  statements.push(db.delete(writeBudget).where(eq(writeBudget.userId, fromUserId)));

  // `db.batch` demands a non-empty tuple; there is always at least the four deletes above.
  await db.batch(statements as [BatchStatement, ...BatchStatement[]]);
  return { bookmarksMoved: movable.length };
}

// ── the data lifecycle: purge and export (story 5-7) ──────────────────────────────────────────

/**
 * What a purge is for. **A REQUIRED ARGUMENT, NOT AN OPTION WITH A DEFAULT** — the two callers
 * want genuinely different things and neither answer is safe as a default.
 *
 *  • `'account'` — the user is going (FR28a / Apple 5.1.1(v)). The `write_budget` row goes WITH
 *    them: there is no foreign key from it to `user` (see schema.ts), so a row left behind is
 *    owned by nobody, invisible to every route, and billed forever. This is the half a test can
 *    see, and `sync.integration.test.ts` counts the row after a deletion.
 *  • `'data'` — "delete my synced data", the account survives (FR28). The counter is LEFT ALONE,
 *    because a purge is not a budget reset: the ceiling is a cost guard against amplification, and
 *    "destroy your rows to buy another 2,000 writes" is exactly the amplification it guards.
 *
 * ⚠️ AND THE SECOND BULLET IS NOT INDEPENDENTLY OBSERVABLE TODAY — WRITTEN DOWN RATHER THAN
 * OVERCLAIMED, BECAUSE A MUTATION TEST DISPROVED THE FIRST DRAFT OF THIS COMMENT. It said deleting
 * the counter here "would hand the caller a fresh ceiling for the price of one request". It would
 * not, *as the route is ordered right now*: `POST /api/account/data` reads the budget, purges, and
 * only then calls `recordWrites`, which writes the ABSOLUTE value `used + 1` derived from the
 * pre-purge read — so a deleted row is immediately re-created with the same count, and switching
 * this scope to `'data'` passes the whole suite.
 *
 * What keeping the row actually buys is that the bound does not DEPEND on that ordering. Move
 * `recordWrites` above the purge — a natural-looking "meter first, then act" refactor — and a
 * counter-deleting purge silently becomes the amplification loop. The property belongs in the
 * purge, not in the sequence of two statements in a route handler.
 */
export type PurgeScope = 'data' | 'account';

/**
 * Destroy every synced row belonging to `userId`.
 *
 * ⚠️ ONE `db.batch()`, FOR THE REASON `reassignUserRows` STATES ABOVE: D1 has no interactive
 * transactions, and a batch is executed as one atomic unit. Either every table is emptied or none
 * is — which is what makes "no silent partial delete" a property of the database rather than a
 * promise in a comment. Every statement is also independently replayable, so a retried purge is a
 * no-op rather than an error.
 *
 * ⚠️ IT THROWS ON FAILURE AND MUST KEEP THROWING. The route reports failure to the reader from
 * that throw; swallowing it here would report success over surviving rows, which the story's
 * boundaries call worse than an error.
 */
export async function purgeUserData(
  db: Database,
  userId: string,
  scope: PurgeScope
): Promise<void> {
  const statements: BatchStatement[] = [
    db.delete(readingPositions).where(eq(readingPositions.userId, userId)),
    db.delete(preferences).where(eq(preferences.userId, userId)),
    db.delete(audioPositions).where(eq(audioPositions.userId, userId)),
    db.delete(bookmarks).where(eq(bookmarks.userId, userId)),
  ];
  // See `PurgeScope` — the counter survives a data purge on purpose and dies with the account.
  if (scope === 'account') {
    statements.push(db.delete(writeBudget).where(eq(writeBudget.userId, userId)));
  }
  await db.batch(statements as [BatchStatement, ...BatchStatement[]]);
}

/**
 * Everything this project holds about one person, in one machine-readable document (FR29).
 *
 * ⚠️ THE ENVELOPE IS BUILT HERE, NOT ON THE CLIENT. The file a reader keeps has to say what it is
 * without the app that produced it — a bare `{bookmarks: […]}` blob is not a data export, it is a
 * fragment. `format` and `version` are what let a later shape change be read rather than guessed.
 *
 * ⚠️ NO PROVIDER CREDENTIAL EVER APPEARS HERE. The `account` table also stores `accessToken`,
 * `refreshToken`, `idToken` and `password`; those are credentials the app holds ON BEHALF of a
 * provider, not personal data the reader is owed, and handing them to a share sheet would be a
 * capability leak. The columns are named explicitly below rather than `select()`-ed wholesale,
 * so a column added upstream cannot join the export by accident.
 *
 * Dates are emitted as ISO-8601 strings. Better Auth's columns are `timestamp_ms`, so Drizzle
 * hands back `Date` objects; serializing them by hand keeps the wire shape stable rather than
 * leaving it to whatever `JSON.stringify` does to a `Date` this year.
 *
 * ⚠️ THE BOOKMARK READ IS THE ONE UNBOUNDED THING IN THIS DOCUMENT, SO IT IS BOUNDED. D1 bills
 * rows SCANNED, and bookmarks is the only table here with unbounded cardinality —
 * `EXPORT_BOOKMARK_LIMIT` caps what one export can cost. The cap is far past any real reader (the
 * client's outbox holds at most 500 pending bookmark writes), and `bookmarksTruncated` ships in
 * the document so a bounded export never silently claims to be a complete one: a right of access
 * answered with a truncated file that says it is truncated is honest; one that does not is not.
 */
export const EXPORT_BOOKMARK_LIMIT = 10_000;

export type UserDataExport = {
  format: 'cloud-quran-export';
  version: 1;
  /** ISO-8601, server clock. */
  exportedAt: string;
  account: {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    /** True while the reader is a guest — the account was minted by the app, not claimed. */
    isAnonymous: boolean;
    createdAt: string;
  } | null;
  /** Which sign-in methods are attached, and when. Never the tokens behind them. */
  providers: { providerId: string; linkedAt: string }[];
  /** True when `bookmarks` hit `EXPORT_BOOKMARK_LIMIT` and is therefore NOT the whole set. */
  bookmarksTruncated: boolean;
  readingPosition: ReadingPositionRow | null;
  preferences: PreferencesRow | null;
  audioPosition: AudioPositionRow | null;
  bookmarks: BookmarkRow[];
};

export async function exportUserData(db: Database, userId: string): Promise<UserDataExport> {
  // One batch, six statements — the same round-trip argument as the purge, applied to reads.
  const [accounts, providers, reading, prefs, audio, marks] = await db.batch([
    db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        isAnonymous: user.isAnonymous,
        createdAt: user.createdAt,
      })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1),
    db
      .select({ providerId: account.providerId, createdAt: account.createdAt })
      .from(account)
      .where(eq(account.userId, userId)),
    db.select().from(readingPositions).where(eq(readingPositions.userId, userId)).limit(1),
    db.select().from(preferences).where(eq(preferences.userId, userId)).limit(1),
    db.select().from(audioPositions).where(eq(audioPositions.userId, userId)).limit(1),
    db
      .select()
      .from(bookmarks)
      .where(eq(bookmarks.userId, userId))
      // One row over the cap, so "was there more" is answerable without a second COUNT query.
      .limit(EXPORT_BOOKMARK_LIMIT + 1),
  ]);
  const bookmarksTruncated = marks.length > EXPORT_BOOKMARK_LIMIT;

  const row = accounts[0];
  return {
    format: 'cloud-quran-export',
    version: 1,
    exportedAt: new Date().toISOString(),
    account: row
      ? {
          id: row.id,
          name: row.name,
          email: row.email,
          emailVerified: row.emailVerified,
          // The column is nullable (`anonymous()` adds it with a default), and "no flag" means
          // "not a guest" — the same reading `lib/auth.ts` and the account screen take.
          isAnonymous: row.isAnonymous === true,
          createdAt: row.createdAt.toISOString(),
        }
      : null,
    providers: providers.map((p) => ({
      providerId: p.providerId,
      linkedAt: p.createdAt.toISOString(),
    })),
    bookmarksTruncated,
    readingPosition: reading[0] ?? null,
    preferences: prefs[0] ?? null,
    audioPosition: audio[0] ?? null,
    bookmarks: bookmarksTruncated ? marks.slice(0, EXPORT_BOOKMARK_LIMIT) : marks,
  };
}
