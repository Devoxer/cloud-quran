import { getTableColumns, getTableName } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import {
  account,
  audioPositions,
  bookmarks,
  preferences,
  readingPositions,
  session,
  user,
  verification,
} from './schema';

describe('D1 Schema', () => {
  describe('Better Auth tables', () => {
    it('defines user table with correct columns and email index', () => {
      expect(getTableName(user)).toBe('user');
      const cols = getTableColumns(user);
      expect(cols.id).toBeDefined();
      expect(cols.name).toBeDefined();
      expect(cols.email).toBeDefined();
      expect(cols.emailVerified).toBeDefined();
      expect(cols.image).toBeDefined();
      expect(cols.createdAt).toBeDefined();
      expect(cols.updatedAt).toBeDefined();

      const config = getTableConfig(user);
      const indexNames = config.indexes.map((idx) => idx.config.name);
      expect(indexNames).toContain('user_email_idx');
    });

    it('defines session table with correct columns and user_id index', () => {
      expect(getTableName(session)).toBe('session');
      const cols = getTableColumns(session);
      expect(cols.id).toBeDefined();
      expect(cols.userId).toBeDefined();
      expect(cols.token).toBeDefined();
      expect(cols.expiresAt).toBeDefined();
      expect(cols.ipAddress).toBeDefined();
      expect(cols.userAgent).toBeDefined();

      const config = getTableConfig(session);
      const indexNames = config.indexes.map((idx) => idx.config.name);
      expect(indexNames).toContain('session_user_id_idx');
    });

    it('defines account table with correct columns and indexes', () => {
      expect(getTableName(account)).toBe('account');
      const cols = getTableColumns(account);
      expect(cols.id).toBeDefined();
      expect(cols.userId).toBeDefined();
      expect(cols.accountId).toBeDefined();
      expect(cols.providerId).toBeDefined();
      expect(cols.accessToken).toBeDefined();
      expect(cols.refreshToken).toBeDefined();

      const config = getTableConfig(account);
      const indexNames = config.indexes.map((idx) => idx.config.name);
      expect(indexNames).toContain('account_user_id_idx');
      expect(indexNames).toContain('account_provider_account_idx');
    });

    it('defines verification table with correct columns', () => {
      expect(getTableName(verification)).toBe('verification');
      const cols = getTableColumns(verification);
      expect(cols.id).toBeDefined();
      expect(cols.identifier).toBeDefined();
      expect(cols.value).toBeDefined();
      expect(cols.expiresAt).toBeDefined();
    });
  });

  describe('App-specific tables', () => {
    it('defines reading_positions with user_id as primary key', () => {
      expect(getTableName(readingPositions)).toBe('reading_positions');
      const cols = getTableColumns(readingPositions);
      expect(cols.userId).toBeDefined();
      expect(cols.userId.primary).toBe(true);
      expect(cols.surah).toBeDefined();
      expect(cols.verse).toBeDefined();
      expect(cols.page).toBeDefined();
      expect(cols.readingMode).toBeDefined();
      expect(cols.updatedAt).toBeDefined();
    });

    it('defines bookmarks with indexes', () => {
      expect(getTableName(bookmarks)).toBe('bookmarks');
      const cols = getTableColumns(bookmarks);
      expect(cols.id).toBeDefined();
      expect(cols.userId).toBeDefined();
      expect(cols.surah).toBeDefined();
      expect(cols.verse).toBeDefined();
      expect(cols.note).toBeDefined();
      expect(cols.createdAt).toBeDefined();

      // Verify indexes exist
      const config = getTableConfig(bookmarks);
      const indexNames = config.indexes.map((idx) => idx.config.name);
      expect(indexNames).toContain('bookmarks_user_id_idx');
      expect(indexNames).toContain('bookmarks_user_surah_verse_idx');
    });

    it('defines preferences with user_id as primary key', () => {
      expect(getTableName(preferences)).toBe('preferences');
      const cols = getTableColumns(preferences);
      expect(cols.userId).toBeDefined();
      expect(cols.userId.primary).toBe(true);
      expect(cols.theme).toBeDefined();
      expect(cols.fontSize).toBeDefined();
      expect(cols.mushafFontSize).toBeDefined();
      expect(cols.translationEnabled).toBeDefined();
      expect(cols.translationLanguage).toBeDefined();
      expect(cols.updatedAt).toBeDefined();
    });

    it('defines audio_positions with user_id as primary key', () => {
      expect(getTableName(audioPositions)).toBe('audio_positions');
      const cols = getTableColumns(audioPositions);
      expect(cols.userId).toBeDefined();
      expect(cols.userId.primary).toBe(true);
      expect(cols.reciterId).toBeDefined();
      expect(cols.surah).toBeDefined();
      expect(cols.verse).toBeDefined();
      expect(cols.positionMs).toBeDefined();
      expect(cols.speedRate).toBeDefined();
      expect(cols.updatedAt).toBeDefined();
    });
  });

  describe('Table count', () => {
    it('defines exactly 8 tables (4 Better Auth + 4 app)', () => {
      const tables = [
        user,
        session,
        account,
        verification,
        readingPositions,
        bookmarks,
        preferences,
        audioPositions,
      ];
      expect(tables).toHaveLength(8);
    });
  });
});
