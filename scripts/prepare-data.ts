import { Database } from 'bun:sqlite';
import { XMLParser } from 'fast-xml-parser';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs';
import { resolve } from 'path';

import { SURAH_METADATA } from '../packages/quran-data/src/surah-metadata';

const ROOT = resolve(import.meta.dir, '..');
const DATA_DIR = resolve(ROOT, 'packages/quran-data/data');
const DB_PATH = resolve(ROOT, 'apps/expo/src/data/quran.db');

// Tanzil.net URLs
const URLS = {
  uthmani:
    'https://tanzil.net/pub/download/index.php?quranType=uthmani&outType=xml&marks=true&sajdah=true&agree=true',
  simple: 'https://tanzil.net/pub/download/index.php?quranType=simple&outType=xml&agree=true',
  translation: 'https://tanzil.net/trans/?transID=en.sahih&type=xml',
};

interface TanzilAya {
  index: string;
  text: string;
  bismillah?: string;
}

interface TanzilSura {
  index: string;
  name: string;
  ayas: string;
  aya: TanzilAya | TanzilAya[];
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });

async function downloadFile(url: string, filename: string): Promise<string> {
  const filepath = resolve(DATA_DIR, filename);
  if (existsSync(filepath)) {
    console.log(`  Using cached: ${filename}`);
    return Bun.file(filepath).text();
  }

  console.log(`  Downloading: ${filename}...`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }
  const text = await response.text();
  writeFileSync(filepath, text, 'utf-8');
  console.log(`  Saved: ${filename} (${(text.length / 1024).toFixed(1)} KB)`);
  return text;
}

function parseSuras(xml: string): TanzilSura[] {
  const doc = parser.parse(xml);
  const suras = doc.quran.sura;
  return Array.isArray(suras) ? suras : [suras];
}

function getAyas(sura: TanzilSura): TanzilAya[] {
  return Array.isArray(sura.aya) ? sura.aya : [sura.aya];
}

async function main() {
  console.log('=== Quran Data Pipeline ===\n');

  // Ensure directories exist
  mkdirSync(DATA_DIR, { recursive: true });
  mkdirSync(resolve(ROOT, 'apps/expo/src/data'), { recursive: true });

  // Step 1: Download XML data
  console.log('Step 1: Downloading Tanzil XML data...');
  const uthmaniXml = await downloadFile(URLS.uthmani, 'quran-uthmani.xml');
  const simpleXml = await downloadFile(URLS.simple, 'quran-simple.xml');
  const translationXml = await downloadFile(URLS.translation, 'en.sahih.xml');

  // Step 2: Parse XML
  console.log('\nStep 2: Parsing XML data...');
  const uthmaniSuras = parseSuras(uthmaniXml);
  const simpleSuras = parseSuras(simpleXml);
  const translationSuras = parseSuras(translationXml);

  console.log(`  Uthmani suras: ${uthmaniSuras.length}`);
  console.log(`  Simple suras: ${simpleSuras.length}`);
  console.log(`  Translation suras: ${translationSuras.length}`);

  if (
    uthmaniSuras.length !== 114 ||
    simpleSuras.length !== 114 ||
    translationSuras.length !== 114
  ) {
    throw new Error('Expected 114 surahs in each XML file');
  }

  // Step 3: Create SQLite database
  console.log('\nStep 3: Creating SQLite database...');

  // Remove existing database if present
  if (existsSync(DB_PATH)) {
    unlinkSync(DB_PATH);
  }

  const db = new Database(DB_PATH);

  // Enable WAL mode for better performance during writes
  db.exec('PRAGMA journal_mode = WAL');

  // Create tables
  db.exec(`
    CREATE TABLE verses (
      surah_number INTEGER NOT NULL,
      verse_number INTEGER NOT NULL,
      uthmani_text TEXT NOT NULL,
      simple_text TEXT NOT NULL,
      PRIMARY KEY (surah_number, verse_number)
    );

    CREATE TABLE translations (
      surah_number INTEGER NOT NULL,
      verse_number INTEGER NOT NULL,
      language TEXT NOT NULL,
      text TEXT NOT NULL,
      PRIMARY KEY (surah_number, verse_number, language)
    );

    CREATE TABLE surah_metadata (
      surah_number INTEGER PRIMARY KEY,
      name_arabic TEXT NOT NULL,
      name_english TEXT NOT NULL,
      name_transliteration TEXT NOT NULL,
      verse_count INTEGER NOT NULL,
      revelation_type TEXT NOT NULL CHECK(revelation_type IN ('meccan', 'medinan')),
      revelation_order INTEGER NOT NULL
    );
  `);

  // Prepare insert statements
  const insertVerse = db.prepare(
    'INSERT INTO verses (surah_number, verse_number, uthmani_text, simple_text) VALUES (?, ?, ?, ?)',
  );
  const insertTranslation = db.prepare(
    'INSERT INTO translations (surah_number, verse_number, language, text) VALUES (?, ?, ?, ?)',
  );
  const insertMetadata = db.prepare(
    'INSERT INTO surah_metadata (surah_number, name_arabic, name_english, name_transliteration, verse_count, revelation_type, revelation_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );

  // Insert data in a transaction for performance
  db.exec('BEGIN TRANSACTION');
  for (let i = 0; i < 114; i++) {
    const surahNum = i + 1;
    const uthmaniSura = uthmaniSuras[i];
    const simpleSura = simpleSuras[i];
    const translationSura = translationSuras[i];

    const uthmaniAyas = getAyas(uthmaniSura);
    const simpleAyas = getAyas(simpleSura);
    const translationAyas = getAyas(translationSura);

    // Validate per-sura verse counts match across all three XML sources
    if (simpleAyas.length !== uthmaniAyas.length) {
      throw new Error(
        `Sura ${surahNum}: Simple has ${simpleAyas.length} ayas but Uthmani has ${uthmaniAyas.length}`,
      );
    }
    if (translationAyas.length !== uthmaniAyas.length) {
      throw new Error(
        `Sura ${surahNum}: Translation has ${translationAyas.length} ayas but Uthmani has ${uthmaniAyas.length}`,
      );
    }

    // Insert verses
    for (let j = 0; j < uthmaniAyas.length; j++) {
      const verseNum = Number(uthmaniAyas[j].index);
      const uthmaniText = uthmaniAyas[j].text;
      const simpleText = simpleAyas[j].text;
      const translationText = translationAyas[j].text;

      if (!uthmaniText || !simpleText || !translationText) {
        throw new Error(`Empty text found at ${surahNum}:${verseNum}`);
      }

      insertVerse.run(surahNum, verseNum, uthmaniText, simpleText);
      insertTranslation.run(surahNum, verseNum, 'en', translationText);
    }

    // Insert surah metadata from single source of truth (SURAH_METADATA)
    const metadata = SURAH_METADATA[i];
    insertMetadata.run(
      surahNum,
      uthmaniSura.name,
      metadata.nameEnglish,
      metadata.nameTransliteration,
      uthmaniAyas.length,
      metadata.revelationType,
      metadata.order,
    );
  }
  db.exec('COMMIT');

  // Note: explicit indexes on PRIMARY KEY columns are redundant in SQLite —
  // the PRIMARY KEY constraint already creates an equivalent unique index.

  // Switch back to DELETE journal mode for the bundled file
  db.exec('PRAGMA journal_mode = DELETE');

  db.close();

  // Step 4: Validate
  console.log('\nStep 4: Validating database...');
  const validateDb = new Database(DB_PATH, { readonly: true });

  const verseCount = validateDb.query('SELECT COUNT(*) as count FROM verses').get() as {
    count: number;
  };
  const surahCount = validateDb
    .query('SELECT COUNT(DISTINCT surah_number) as count FROM verses')
    .get() as { count: number };
  const translationCount = validateDb.query('SELECT COUNT(*) as count FROM translations').get() as {
    count: number;
  };
  const metadataCount = validateDb.query('SELECT COUNT(*) as count FROM surah_metadata').get() as {
    count: number;
  };
  const emptyUthmani = validateDb
    .query("SELECT COUNT(*) as count FROM verses WHERE uthmani_text = ''")
    .get() as { count: number };
  const emptySimple = validateDb
    .query("SELECT COUNT(*) as count FROM verses WHERE simple_text = ''")
    .get() as { count: number };
  const emptyTranslation = validateDb
    .query("SELECT COUNT(*) as count FROM translations WHERE text = ''")
    .get() as { count: number };

  validateDb.close();

  console.log(`  Total verses: ${verseCount.count}`);
  console.log(`  Total surahs: ${surahCount.count}`);
  console.log(`  Total translations: ${translationCount.count}`);
  console.log(`  Surah metadata entries: ${metadataCount.count}`);

  const errors: string[] = [];
  if (verseCount.count !== 6236) errors.push(`Expected 6236 verses, got ${verseCount.count}`);
  if (surahCount.count !== 114) errors.push(`Expected 114 surahs, got ${surahCount.count}`);
  if (translationCount.count !== 6236)
    errors.push(`Expected 6236 translations, got ${translationCount.count}`);
  if (metadataCount.count !== 114)
    errors.push(`Expected 114 metadata entries, got ${metadataCount.count}`);
  if (emptyUthmani.count > 0) errors.push(`${emptyUthmani.count} empty Uthmani text fields`);
  if (emptySimple.count > 0) errors.push(`${emptySimple.count} empty Simple text fields`);
  if (emptyTranslation.count > 0) errors.push(`${emptyTranslation.count} empty translation fields`);

  if (errors.length > 0) {
    throw new Error(`Validation FAILED:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
  }

  const dbSize = Bun.file(DB_PATH).size;
  console.log(`\n✅ Database created successfully at: ${DB_PATH}`);
  console.log(`   Size: ${(dbSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   Verses: ${verseCount.count} across ${surahCount.count} surahs`);
  console.log(`   Translations: ${translationCount.count}`);
  console.log(`   Metadata: ${metadataCount.count} surahs`);
}

main().catch((err) => {
  console.error('❌ Pipeline failed:', err);
  process.exit(1);
});
