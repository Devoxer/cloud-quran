import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

// ============================================================
// Better Auth tables (managed by Better Auth, defined here for
// Drizzle schema awareness and migration generation)
// ============================================================

export const user = sqliteTable(
  'user',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
    image: text('image'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [uniqueIndex('user_email_idx').on(table.email)],
);

export const session = sqliteTable(
  'session',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [index('session_user_id_idx').on(table.userId)],
);

export const account = sqliteTable(
  'account',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp' }),
    refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp' }),
    scope: text('scope'),
    password: text('password'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    index('account_user_id_idx').on(table.userId),
    uniqueIndex('account_provider_account_idx').on(table.providerId, table.accountId),
  ],
);

export const verification = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// ============================================================
// App-specific tables
// ============================================================

/**
 * reading_positions: LWW sync, one row per user.
 * Tracks the user's last reading position across devices.
 */
export const readingPositions = sqliteTable('reading_positions', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  surah: integer('surah').notNull(), // 1-114
  verse: integer('verse').notNull(),
  page: integer('page').notNull(), // 1-604
  readingMode: text('reading_mode').notNull().default('verse'), // 'verse' | 'mushaf'
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

/**
 * bookmarks: union-merge sync.
 * UNIQUE(user_id, surah, verse) for deduplication.
 */
export const bookmarks = sqliteTable(
  'bookmarks',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    surah: integer('surah').notNull(),
    verse: integer('verse').notNull(),
    note: text('note'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    index('bookmarks_user_id_idx').on(table.userId),
    uniqueIndex('bookmarks_user_surah_verse_idx').on(table.userId, table.surah, table.verse),
  ],
);

/**
 * preferences: LWW sync, one row per user.
 * Stores user UI preferences (theme, font size, etc.).
 */
export const preferences = sqliteTable('preferences', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  theme: text('theme').notNull().default('light'),
  fontSize: integer('font_size').notNull().default(28),
  mushafFontSize: integer('mushaf_font_size').notNull().default(32),
  translationEnabled: integer('translation_enabled', { mode: 'boolean' }).notNull().default(false),
  translationLanguage: text('translation_language').notNull().default('en'),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

/**
 * audio_positions: LWW sync, one row per user.
 * Tracks the user's last audio playback state across devices.
 */
export const audioPositions = sqliteTable('audio_positions', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  reciterId: text('reciter_id').notNull(),
  surah: integer('surah').notNull(),
  verse: integer('verse').notNull(),
  positionMs: integer('position_ms').notNull().default(0),
  speedRate: real('speed_rate').notNull().default(1.0),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});
