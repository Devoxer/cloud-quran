/**
 * Cloud Quran — D1 schema (story 5-4).
 *
 * Four synced entities, one cost guard. The unit of ownership is `userId`; every query in
 * `queries.ts` is scoped to it and no route ever accepts a user id from the client.
 *
 * ⚠️ RECONCILED AGAINST THE REAL FOUR-ENTITY SHAPE, NOT COPIED FROM STORY 4-0. The D1 schema
 * that story 4-0 built (`76629bc:apps/api/src/db/schema.ts`, reverted by `83b53a9`) had
 * DRIFTED from the entities the app actually syncs, and neither side was a superset. What
 * changed coming back:
 *   • `preferences` — 4-0's `mushafFontSize` / `translationEnabled` / `translationLanguage`
 *     are gone; the real shape is `reciterId` / `readingMode` / `translationId?` /
 *     `speedRate` / `transliteration`.
 *   • `bookmarks.note` → `label` (the real attribute name).
 *   • `reading_positions.reading_mode` (default 'verse') → `mode`, values 'reading' | 'mushaf',
 *     no default — 'verse' was never one of the two modes this app has.
 *   • `audio_positions` loses `position_ms` and `speed_rate`. Neither is in the synced shape;
 *     `speedRate` is a preference, and sub-verse audio offset is device-local.
 *   • `preferences.updatedAt` is ADDED. Without it last-write-wins degrades into
 *     last-writer-observed, silently.
 * What was KEPT from 4-0, deliberately: `userId` as PRIMARY KEY on the three LWW tables (one
 * row per user is the cheapest possible write shape) and the unique index on bookmarks.
 *
 * ⚠️ INDEXES ARE THE WRITE MULTIPLIER. (This said "AND THE BUDGET IS AN AVAILABILITY CLIFF —
 * 100k rows written per day, ACCOUNT-WIDE, returning errors rather than a bill". Wrong: the
 * account is on Workers Paid, where D1 bills rather than errors. Corrected 2026-08-24, story 5-5;
 * every index decision below is unchanged, because a write tax is a write tax either way.)
 * A row with two indexes on written columns costs three rows per write. So:
 *   • the three LWW tables carry `userId` PK and NOTHING else. The old vendor schema indexed
 *     `surah` and `updatedAt` on both position tables, serving no query that exists.
 *   • bookmarks carries exactly ONE index, `uniqueIndex(userId, surah, verse)` — it is the
 *     union-merge dedup key AND, being left-prefixed on `userId`, the index that serves
 *     "list my bookmarks". A separate `bookmarks_user_id_idx` (which 4-0 had) is redundant
 *     with it and pure write tax.
 * The rule is not "index what you might query": it is that no column is indexed for which no
 * query exists, and `queries.ts` is the closed set of queries.
 *
 * ⚠️ NO FOREIGN KEYS FROM THESE FOUR TABLES TO `user`. Story 5-5 landed Better Auth's `user`
 * table at the bottom of this file, so the reference is now POSSIBLE — and it is still not
 * taken. SQLite cannot add a foreign key with `ALTER TABLE`, so it would be a create-copy-swap
 * migration of live data, and it would buy a cascade that story 5-7 (account deletion) has to
 * write out explicitly regardless: the `write_budget` row has no `user` reference either, and an
 * export has to enumerate the tables anyway. `userId` stays an unconstrained TEXT column.
 *
 * SQLite has no native boolean or date type; `integer` with a mode covers both.
 */
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

/**
 * Where the user is READING. One row per user, last-write-wins on `updatedAt`.
 * `page` is denormalized from the verse↔page map so mushaf resume is a zero-computation read.
 */
export const readingPositions = sqliteTable('reading_positions', {
  userId: text('user_id').primaryKey(),
  surah: integer('surah').notNull(),
  verse: integer('verse').notNull(),
  page: integer('page').notNull(),
  /** 'reading' | 'mushaf' */
  mode: text('mode').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

/**
 * Bookmarks. Many rows per user, union-merge on reconnect.
 *
 * The dedup key is the UNIQUE INDEX, not client logic: two devices that bookmark the same ayah
 * offline converge on one row because the second insert conflicts and does nothing.
 */
export const bookmarks = sqliteTable(
  'bookmarks',
  {
    /** Client-minted, so an offline create keeps its identity through the outbox drain. */
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    surah: integer('surah').notNull(),
    verse: integer('verse').notNull(),
    label: text('label'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('bookmarks_user_surah_verse_idx').on(table.userId, table.surah, table.verse),
  ]
);

/** Reader preferences. One row per user, last-write-wins on `updatedAt`. */
export const preferences = sqliteTable('preferences', {
  userId: text('user_id').primaryKey(),
  /** 'light' | 'sepia' | 'dark' */
  theme: text('theme').notNull(),
  /** 20–44 */
  fontSize: integer('font_size').notNull(),
  reciterId: text('reciter_id').notNull(),
  /** 'reading' | 'mushaf' */
  readingMode: text('reading_mode').notNull(),
  translationId: text('translation_id'),
  /** 0.5–2.0 */
  speedRate: real('speed_rate').notNull(),
  transliteration: integer('transliteration', { mode: 'boolean' }).notNull(),
  /** ⚠️ Required. Without it LWW degrades to last-writer-observed. */
  updatedAt: integer('updated_at').notNull(),
});

/**
 * Where the user is LISTENING. One row per user, last-write-wins on `updatedAt`.
 * Deliberately distinct from `reading_positions` — listening position is not reading position.
 */
export const audioPositions = sqliteTable('audio_positions', {
  userId: text('user_id').primaryKey(),
  surah: integer('surah').notNull(),
  verse: integer('verse').notNull(),
  reciterId: text('reciter_id').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

/**
 * The per-user daily write ceiling — NOT a synced entity, and never exposed to the client.
 *
 * One row per user, forever: `day` is overwritten when the UTC day rolls over rather than a new
 * row being appended, so the table has no unbounded growth and needs no cleanup job (which
 * would be a cron trigger — which does NOT require the paid plan, contrary to what this file
 * used to say; it is simply standing cost nobody has to pay here).
 *
 * ⚠️ THE COUNTER IS ITSELF A WRITE — that is the whole reason `write-guard.ts` records only
 * writes that actually CHANGED a row, and rejects over-ceiling requests before touching
 * anything. See that file for the arithmetic.
 */
export const writeBudget = sqliteTable(
  'write_budget',
  {
    userId: text('user_id').notNull(),
    /** UTC calendar day, `YYYY-MM-DD`. */
    day: text('day').notNull(),
    writes: integer('writes').notNull(),
  },
  // The PK is the only index, and it is exactly the lookup: WHERE user_id = ?.
  (table) => [primaryKey({ columns: [table.userId] })]
);

// ──────────────────────────────────────────────────────────────────────────────────────────────
// BETTER AUTH (story 5-5). Four tables, hand-landed and migrated by drizzle-kit.
//
// ⚠️ HAND-LANDED ON PURPOSE, AND `npx auth migrate` MUST NEVER RUN. Better Auth ships its own
// migrator; using it would give the project TWO tools that both own the schema and no committed
// migration file for half of it. These definitions are transcribed from
// `@better-auth/core/dist/db/get-tables.mjs` (the runtime source of truth, 1.7.1) plus the one
// field `anonymous()` adds, and `pnpm generate` emits the migration the project owns.
//
// ⚠️ THE PROPERTY KEY IS THE CONTRACT, NOT THE COLUMN NAME. `@better-auth/drizzle-adapter`
// resolves a field as `schemaModel[field]` — the DRIZZLE PROPERTY — so every property below must
// be spelled exactly as Better Auth spells the field (camelCase). The SQL column name is free,
// and stays snake_case like the rest of this file. Renaming a property to match its column is a
// runtime "field does not exist in the schema" throw that typechecks fine.
//
// ⚠️ DATES ARE `timestamp_ms`. Plain `timestamp` stores SECONDS; Better Auth compares against
// `Date.now()` milliseconds, so every session would read as expired ~1970 and nobody could ever
// stay signed in — with no error anywhere.
//
// ⚠️ SIX INDEXES ARRIVE WITH THESE TABLES and every one is a write multiplier (see the block at
// the top of this file, including its correction). They are upstream's own, each serving a query Better Auth actually
// makes: `user.email` (sign-in lookup), `session.token` (every authenticated request),
// `session.userId` (list/revoke), `account (issuer, accountId)` (the 1.7 identity key) and
// `account.userId`, `verification.identifier` (OTP lookup). The mitigation is in `lib/auth.ts`:
// the session cookie cache is ON and the session lifetime is long, so a returning user costs no
// session write per day.
//
// ⚠️ NO FOREIGN KEY FROM THE FOUR SYNCED TABLES TO `user`, DELIBERATELY — reversing nothing, but
// answering the question the block at the top of this file left to this story. SQLite cannot add
// a foreign key with `ALTER TABLE`, so it would be a create-copy-swap migration of live data for
// a cascade that story 5-7 (account deletion) has to write explicitly anyway, since it must also
// delete the write-budget row and honour an export. `userId` stays an unconstrained TEXT column.

/** Better Auth's user. `isAnonymous` is the ONE field the `anonymous()` plugin adds. */
export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  /**
   * `input: false` upstream — a client cannot set or clear this, by design.
   *
   * ⚠️ NOTHING CLEARS IT ANY MORE, AND THAT IS CORRECT. An earlier revision of this comment said
   * the worker cleared it in `lib/auth.ts`'s account-create hook; amendment (b) deleted that hook
   * along with `/link-social`, because upgrading a guest IN PLACE was the design that forked
   * accounts. The guest is now resolved to whichever user owns the verified address, its rows are
   * carried over by `onLinkAccount` → `reassignUserRows`, and the anonymous row is DELETED — so
   * the flag is never flipped, it simply stops describing the current user.
   */
  isAnonymous: integer('is_anonymous', { mode: 'boolean' }).default(false),
});

/** A session. `token` is what the cookie carries; `expiresAt` is enforced server-side. */
export const session = sqliteTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [index('session_user_id_idx').on(table.userId)]
);

/**
 * A linked provider identity.
 *
 * ⚠️ `issuer` IS NEW IN 1.7 and the unique key is `(issuer, accountId)`, not `(providerId,
 * accountId)`. Tutorials written against 1.6 omit the column entirely; without it every account
 * insert fails on a NOT NULL that no example mentions.
 */
export const account = sqliteTable(
  'account',
  {
    id: text('id').primaryKey(),
    issuer: text('issuer').notNull(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp_ms' }),
    refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp_ms' }),
    scope: text('scope'),
    password: text('password'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    uniqueIndex('account_issuer_account_id_idx').on(table.issuer, table.accountId),
    index('account_user_id_idx').on(table.userId),
  ]
);

/** Short-lived verification values — where the hashed email OTP lives. No plugin table needed. */
export const verification = sqliteTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)]
);

/**
 * Better Auth's rate-limit counter — `rateLimit.storage: 'database'` in `lib/auth.ts`.
 *
 * ⚠️ THE DEFAULT (`'memory'`) IS NOT A NO-OP — IT IS PER-ISOLATE. Better Auth's memory backend is
 * a module-scope `Map`, so the per-request auth instance does not reset it; what does not survive
 * is the isolate, and a Worker runs across many isolates that Cloudflare evicts at will. That
 * makes an in-memory ceiling a multiple of the configured one, resetting unpredictably — which is
 * not something to defend an UNAUTHENTICATED `POST /api/auth/email-otp/send-verification-otp`
 * with, since that path mails arbitrary addresses from this project's own domain once
 * `MAIL_FROM` is set. This table is one shared counter instead.
 *
 * One row per (ip, path) key. Rows accumulate and are not swept — Better Auth overwrites a key
 * when its window rolls, so the table's size is bounded by distinct keys rather than by request
 * count, and there is no cleanup job to write.
 */
export const rateLimit = sqliteTable('rate_limit', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  count: integer('count').notNull(),
  lastRequest: integer('last_request').notNull(),
});
