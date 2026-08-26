/**
 * Schema shape assertions.
 *
 * The one that matters is the INDEX assertion. Every index on a written table multiplies one
 * logical write into several rows against a budget that ERRORS when exhausted, so "no column is
 * indexed that no query uses" is an acceptance criterion, not a preference — and it is exactly
 * the kind of rule that decays silently when someone adds a `.indexed()` out of habit, the way
 * the retired vendor schema indexed `surah` and `updatedAt` on both position tables for no query.
 */
import { getTableColumns, getTableName } from 'drizzle-orm';
import { getTableConfig, type SQLiteTable } from 'drizzle-orm/sqlite-core';
import { describe, expect, it } from 'vitest';
import { audioPositions, bookmarks, preferences, readingPositions, writeBudget } from './schema';

const column = (table: SQLiteTable) => Object.keys(getTableColumns(table));

describe('D1 schema — the four synced entities', () => {
  it('reading_positions: userId PK, the real five fields, LWW timestamp', () => {
    expect(getTableName(readingPositions)).toBe('reading_positions');
    expect(column(readingPositions).sort()).toEqual(
      ['mode', 'page', 'surah', 'updatedAt', 'userId', 'verse'].sort()
    );
    expect(getTableColumns(readingPositions).userId.primary).toBe(true);
  });

  it('bookmarks: the real `label` field (4-0 called it `note`)', () => {
    expect(getTableName(bookmarks)).toBe('bookmarks');
    expect(column(bookmarks).sort()).toEqual(
      ['createdAt', 'id', 'label', 'surah', 'userId', 'verse'].sort()
    );
  });

  it('preferences: the real shape, and it CARRIES updatedAt', () => {
    expect(getTableName(preferences)).toBe('preferences');
    expect(column(preferences).sort()).toEqual(
      [
        'fontSize',
        'readingMode',
        'reciterId',
        'speedRate',
        'theme',
        'transliteration',
        'translationId',
        'updatedAt',
        'userId',
      ].sort()
    );
    // Without this, last-write-wins silently degrades to last-writer-observed.
    expect(column(preferences)).toContain('updatedAt');
    expect(getTableColumns(preferences).userId.primary).toBe(true);
    // 4-0's drifted fields must NOT have come back.
    expect(column(preferences)).not.toContain('mushafFontSize');
    expect(column(preferences)).not.toContain('translationEnabled');
    expect(column(preferences)).not.toContain('translationLanguage');
  });

  it('audio_positions: userId PK, and none of 4-0s extra columns', () => {
    expect(getTableName(audioPositions)).toBe('audio_positions');
    expect(column(audioPositions).sort()).toEqual(
      ['reciterId', 'surah', 'updatedAt', 'userId', 'verse'].sort()
    );
    expect(getTableColumns(audioPositions).userId.primary).toBe(true);
    expect(column(audioPositions)).not.toContain('positionMs');
    expect(column(audioPositions)).not.toContain('speedRate');
  });

  it('every table carries a userId column — the unit of ownership', () => {
    for (const table of [readingPositions, bookmarks, preferences, audioPositions, writeBudget]) {
      expect(column(table)).toContain('userId');
    }
  });
});

describe('D1 schema — indexes are the write multiplier', () => {
  it('the three LWW tables carry NO secondary index at all (userId PK only)', () => {
    for (const table of [readingPositions, preferences, audioPositions]) {
      expect(getTableConfig(table).indexes).toEqual([]);
    }
  });

  it('bookmarks carries EXACTLY ONE index: the union-merge dedup key', () => {
    const indexes = getTableConfig(bookmarks).indexes;
    expect(indexes.map((i) => i.config.name)).toEqual(['bookmarks_user_surah_verse_idx']);
    const [dedup] = indexes;
    expect(dedup.config.unique).toBe(true);
    // Left-prefixed on user_id, which is why "list my bookmarks" needs no index of its own.
    expect(dedup.config.columns.map((c) => (c as { name: string }).name)).toEqual([
      'user_id',
      'surah',
      'verse',
    ]);
  });

  it('write_budget carries no secondary index — its PK is the whole lookup', () => {
    expect(getTableConfig(writeBudget).indexes).toEqual([]);
  });
});
