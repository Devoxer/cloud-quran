import { importDatabaseFromAssetAsync, openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

let db: SQLiteDatabase | null = null;
const DB_NAME = 'quran.db';

export async function getDatabase(): Promise<SQLiteDatabase> {
  if (db) return db;
  await importDatabaseFromAssetAsync(DB_NAME, {
    assetId: require('@/data/quran.db'),
  });
  db = await openDatabaseAsync(DB_NAME);
  return db;
}

export interface VerseWithTranslation {
  surahNumber: number;
  verseNumber: number;
  uthmaniText: string;
  translationText: string;
}

export async function getVersesByPositions(
  positions: Array<{ surahNumber: number; verseNumber: number }>,
): Promise<VerseWithTranslation[]> {
  if (positions.length === 0) return [];
  const database = await getDatabase();
  const whereClauses = positions.map(() => '(v.surah_number = ? AND v.verse_number = ?)');
  const params = positions.flatMap((p) => [p.surahNumber, p.verseNumber]);
  const rows = await database.getAllAsync<{
    surah_number: number;
    verse_number: number;
    uthmani_text: string;
    translation_text: string;
  }>(
    `SELECT v.surah_number, v.verse_number, v.uthmani_text, t.text as translation_text
     FROM verses v
     LEFT JOIN translations t ON v.surah_number = t.surah_number
       AND v.verse_number = t.verse_number AND t.language = 'en'
     WHERE ${whereClauses.join(' OR ')}`,
    params,
  );
  return rows.map((r) => ({
    surahNumber: r.surah_number,
    verseNumber: r.verse_number,
    uthmaniText: r.uthmani_text,
    translationText: r.translation_text,
  }));
}

export async function getVersesForSurah(surahNumber: number): Promise<VerseWithTranslation[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<{
    surah_number: number;
    verse_number: number;
    uthmani_text: string;
    translation_text: string;
  }>(
    `SELECT v.surah_number, v.verse_number, v.uthmani_text, t.text as translation_text
     FROM verses v
     LEFT JOIN translations t ON v.surah_number = t.surah_number
       AND v.verse_number = t.verse_number AND t.language = 'en'
     WHERE v.surah_number = ?
     ORDER BY v.verse_number`,
    [surahNumber],
  );
  return rows.map((r) => ({
    surahNumber: r.surah_number,
    verseNumber: r.verse_number,
    uthmaniText: r.uthmani_text,
    translationText: r.translation_text,
  }));
}
