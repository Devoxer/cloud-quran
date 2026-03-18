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
  transliterationText?: string;
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
    transliteration_text: string | null;
  }>(
    `SELECT v.surah_number, v.verse_number, v.uthmani_text, t.text as translation_text,
            tr.text as transliteration_text
     FROM verses v
     LEFT JOIN translations t ON v.surah_number = t.surah_number
       AND v.verse_number = t.verse_number AND t.language = 'en'
     LEFT JOIN transliterations tr ON v.surah_number = tr.surah_number
       AND v.verse_number = tr.verse_number
     WHERE ${whereClauses.join(' OR ')}`,
    params,
  );
  return rows.map((r) => ({
    surahNumber: r.surah_number,
    verseNumber: r.verse_number,
    uthmaniText: r.uthmani_text,
    translationText: r.translation_text,
    transliterationText: r.transliteration_text ?? undefined,
  }));
}

export type TafsirSource = 'ibn-kathir' | 'al-jalalayn' | 'al-sadi';

export interface TafsirEntry {
  surahNumber: number;
  verseNumber: number;
  source: TafsirSource;
  text: string;
}

export async function getTafsirForVerse(
  surahNumber: number,
  verseNumber: number,
  source: TafsirSource,
): Promise<TafsirEntry | null> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{
    surah_number: number;
    verse_number: number;
    source: string;
    text: string;
  }>(
    `SELECT surah_number, verse_number, source, text
     FROM tafsir_entries
     WHERE surah_number = ? AND verse_number = ? AND source = ?`,
    [surahNumber, verseNumber, source],
  );
  if (!row) return null;
  return {
    surahNumber: row.surah_number,
    verseNumber: row.verse_number,
    source: row.source as TafsirSource,
    text: row.text,
  };
}

export async function getVersesForSurah(surahNumber: number): Promise<VerseWithTranslation[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<{
    surah_number: number;
    verse_number: number;
    uthmani_text: string;
    translation_text: string;
    transliteration_text: string | null;
  }>(
    `SELECT v.surah_number, v.verse_number, v.uthmani_text, t.text as translation_text,
            tr.text as transliteration_text
     FROM verses v
     LEFT JOIN translations t ON v.surah_number = t.surah_number
       AND v.verse_number = t.verse_number AND t.language = 'en'
     LEFT JOIN transliterations tr ON v.surah_number = tr.surah_number
       AND v.verse_number = tr.verse_number
     WHERE v.surah_number = ?
     ORDER BY v.verse_number`,
    [surahNumber],
  );
  return rows.map((r) => ({
    surahNumber: r.surah_number,
    verseNumber: r.verse_number,
    uthmaniText: r.uthmani_text,
    translationText: r.translation_text,
    transliterationText: r.transliteration_text ?? undefined,
  }));
}
