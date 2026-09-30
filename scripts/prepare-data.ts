// Builds apps/expo/src/data/quran.db from the tracked Tanzil Quran XML and QuranEnc's English.
// Run: node scripts/prepare-data.ts   (pnpm prepare-data)
//
// ⚠️ THE ARABIC AND THE ENGLISH HAVE DIFFERENT SOURCES AND DIFFERENT RULES (story 8-4).
//   • The Quran text (`verses`) comes from the COMMITTED Tanzil XML in packages/quran-data/data and
//     is guarded ayah by ayah by `pnpm verify`. It does not change.
//   • The bundled English (`translations`) comes from QuranEnc's `english_rwwad`, under the written
//     republication grant recorded as `quranenc-bundled-english` in
//     packages/quran-data/data/packs/LICENCES.md. It replaced Tanzil's `en.sahih`, whose status we
//     could not document. The upstream version is PINNED in that ledger entry: a live version that
//     is not the pin stops the build, because the grant requires the version to be STATED.
//     `translation` and `footnotes` are copied verbatim, markers and all.
//
// ⚠️ A NEW quran.db DOES NOT REACH AN EXISTING INSTALL BY ITSELF. `importDatabaseFromAssetAsync`
// copies the asset once per install and never again; `apps/expo/src/lib/quranDb.ts` versions the
// DATABASE NAME for exactly that reason. A rebuild that changes the file's content must bump
// `QURAN_DATABASE_NAME` there (and move the old name into the superseded list), or every reader
// who already has the app keeps the old text forever while a fresh simulator looks correct.
//
// The owner's 2026-08-24 note about a one-byte SQLite version stamp difference (header offset 99)
// still describes a rebuild on a different Node than the committed file's. `pnpm verify` compares
// CONTENT, never the file's bytes, and is the authority on whether the text is intact.

import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { XMLParser } from 'fast-xml-parser';

import { SURAH_METADATA } from '../packages/quran-data/src/surah-metadata.ts';
import {
  assertPinned,
  attributionOf,
  fetchQuranEncEditions,
  fetchUpstreamDatabase,
  ledgerPins,
  readUpstreamRows,
} from './quranenc.ts';

const ROOT = resolve(import.meta.dirname, '..');
const DATA_DIR = resolve(ROOT, 'packages/quran-data/data');
const LEDGER_PATH = resolve(DATA_DIR, 'packs/LICENCES.md');
/** Where the upstream English is downloaded to. Gitignored: the repo keeps the built db only. */
const BUILD_DIR = resolve(ROOT, 'build/data');
const BUNDLED_RECORD_PATH = resolve(ROOT, 'packages/quran-data/src/bundled-translation.ts');

/** The edition the bundled English is built from, and the ledger entry that grants it. */
const BUNDLED_KEY = 'english_rwwad';
const BUNDLED_LICENCE_ID = 'quranenc-bundled-english';

const DB_PATH = resolve(ROOT, 'apps/expo/src/data/quran.db');

// Tanzil.net URLs — used only when the committed XML is absent (it never is in a checkout).
const URLS = {
  uthmani:
    'https://tanzil.net/pub/download/index.php?quranType=uthmani&outType=xml&marks=true&sajdah=true&agree=true',
  simple: 'https://tanzil.net/pub/download/index.php?quranType=simple&outType=xml&agree=true',
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
    return readFileSync(filepath, 'utf-8');
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

/**
 * The bundled English, verbatim, keyed `surah:verse` — after refusing an unpinned upstream.
 * Also answers what the credit line has to say, which `writeBundledRecord` commits.
 */
async function readBundledEnglish(): Promise<{
  rows: Map<string, { text: string; footnotes: string | null }>;
  version: string;
  title: string;
}> {
  const pins = ledgerPins(readFileSync(LEDGER_PATH, 'utf-8'), BUNDLED_LICENCE_ID);
  // The English title from the English list: this edition's language IS English.
  const edition = (await fetchQuranEncEditions('en')).find((e) => e.key === BUNDLED_KEY);
  if (!edition) {
    throw new Error(`QuranEnc no longer offers ${BUNDLED_KEY}. The ledger names this edition.`);
  }
  assertPinned(edition, pins, BUNDLED_LICENCE_ID);
  mkdirSync(BUILD_DIR, { recursive: true });
  const path = resolve(BUILD_DIR, `upstream-${BUNDLED_KEY}.sqlite`);
  await fetchUpstreamDatabase(BUNDLED_KEY, path);
  const rows = new Map<string, { text: string; footnotes: string | null }>();
  for (const row of readUpstreamRows(path)) {
    // Verbatim, `''` included: QuranEnc writes an empty string for "no footnote" on 4,021 rows,
    // and a row is copied, not tidied. Every reader treats `''` and NULL alike.
    rows.set(`${row.sura}:${row.aya}`, { text: row.translation, footnotes: row.footnotes });
  }
  return { rows, version: edition.version, title: edition.title };
}

/** A single-quoted TypeScript string literal — the repo's Biome style, so the output lints clean. */
const tsString = (value: string): string =>
  `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;

/**
 * Commit what the bundled English was built from — the app renders its credit from this file, and
 * `verify-licences.ts` checks its version against the ledger pin.
 */
function writeBundledRecord(version: string, title: string): void {
  const content = `// Auto-generated by scripts/prepare-data.ts — DO NOT EDIT
// What apps/expo/src/data/quran.db's bundled translation was built from (story 8-4). The app
// renders \`attribution\` beside the text; \`pnpm verify\` checks \`sourceVersion\` against the
// ledger's pin for \`sourceKey\` (packages/quran-data/data/packs/LICENCES.md, "${BUNDLED_LICENCE_ID}").

export interface BundledTranslationRecord {
  licenceId: string;
  source: string;
  sourceKey: string;
  sourceVersion: string;
  language: string;
  direction: 'ltr' | 'rtl';
  title: string;
  attribution: string;
}

export const BUNDLED_TRANSLATION: BundledTranslationRecord = {
  licenceId: '${BUNDLED_LICENCE_ID}',
  source: 'QuranEnc',
  sourceKey: '${BUNDLED_KEY}',
  sourceVersion: '${version}',
  language: 'en',
  direction: 'ltr',
  title: ${tsString(title)},
  attribution: ${tsString(attributionOf(title, version))},
};
`;
  writeFileSync(BUNDLED_RECORD_PATH, content, 'utf-8');
}

async function main() {
  console.log('=== Quran Data Pipeline ===\n');

  // Ensure directories exist
  mkdirSync(DATA_DIR, { recursive: true });
  mkdirSync(resolve(ROOT, 'apps/expo/src/data'), { recursive: true });

  // Step 1: Read the committed Quran XML, and fetch the pinned English
  console.log('Step 1: Reading Tanzil XML and fetching QuranEnc english_rwwad...');
  const uthmaniXml = await downloadFile(URLS.uthmani, 'quran-uthmani.xml');
  const simpleXml = await downloadFile(URLS.simple, 'quran-simple.xml');
  const english = await readBundledEnglish();
  console.log(`  ${BUNDLED_KEY} v${english.version}: ${english.rows.size} rows`);

  // Step 2: Parse XML
  console.log('\nStep 2: Parsing XML data...');
  const uthmaniSuras = parseSuras(uthmaniXml);
  const simpleSuras = parseSuras(simpleXml);

  console.log(`  Uthmani suras: ${uthmaniSuras.length}`);
  console.log(`  Simple suras: ${simpleSuras.length}`);

  if (uthmaniSuras.length !== 114 || simpleSuras.length !== 114) {
    throw new Error('Expected 114 surahs in each XML file');
  }
  if (english.rows.size !== 6236) {
    throw new Error(`Expected 6236 English rows from ${BUNDLED_KEY}, got ${english.rows.size}`);
  }

  // Step 3: Create SQLite database
  console.log('\nStep 3: Creating SQLite database...');

  // Remove existing database if present
  if (existsSync(DB_PATH)) {
    unlinkSync(DB_PATH);
  }

  const db = new DatabaseSync(DB_PATH);

  // Enable WAL mode for better performance during writes
  db.exec('PRAGMA journal_mode = WAL');
  // Zero out freed page space. Bun's bundled SQLite was compiled with
  // secure_delete=FAST; Node's is 0, which leaves ~33 KB of stale bytes in the
  // free space of a shipped, hash-verified file and makes the build
  // non-deterministic. With this on, the Node build reproduces the Bun-era
  // quran.db to within a single byte (the SQLite version stamp at header
  // offset 96-99).
  db.exec('PRAGMA secure_delete = FAST');

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
      footnotes TEXT,
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
    'INSERT INTO verses (surah_number, verse_number, uthmani_text, simple_text) VALUES (?, ?, ?, ?)'
  );
  const insertTranslation = db.prepare(
    'INSERT INTO translations (surah_number, verse_number, language, text, footnotes) VALUES (?, ?, ?, ?, ?)'
  );
  const insertMetadata = db.prepare(
    'INSERT INTO surah_metadata (surah_number, name_arabic, name_english, name_transliteration, verse_count, revelation_type, revelation_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );

  // Insert data in a transaction for performance
  db.exec('BEGIN TRANSACTION');
  for (let i = 0; i < 114; i++) {
    const surahNum = i + 1;
    const uthmaniSura = uthmaniSuras[i];
    const simpleSura = simpleSuras[i];

    const uthmaniAyas = getAyas(uthmaniSura);
    const simpleAyas = getAyas(simpleSura);

    // Validate per-sura verse counts match across all three XML sources
    if (simpleAyas.length !== uthmaniAyas.length) {
      throw new Error(
        `Sura ${surahNum}: Simple has ${simpleAyas.length} ayas but Uthmani has ${uthmaniAyas.length}`
      );
    }

    // Insert verses
    for (let j = 0; j < uthmaniAyas.length; j++) {
      const verseNum = Number(uthmaniAyas[j].index);
      const uthmaniText = uthmaniAyas[j].text;
      const simpleText = simpleAyas[j].text;
      // Keyed by the Arabic's own (surah, verse), so a missing English row is a loud error below
      // rather than a silent shift of every later translation by one ayah.
      const translation = english.rows.get(`${surahNum}:${verseNum}`);

      if (!uthmaniText || !simpleText || !translation?.text) {
        throw new Error(`Empty text found at ${surahNum}:${verseNum}`);
      }

      insertVerse.run(surahNum, verseNum, uthmaniText, simpleText);
      insertTranslation.run(surahNum, verseNum, 'en', translation.text, translation.footnotes);
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
      metadata.order
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
  // ⚠️ camelCase `readOnly`. node:sqlite silently IGNORES unknown constructor
  // options, so Bun's `{ readonly: true }` would open the freshly built Quran
  // database read-WRITE without an error.
  const validateDb = new DatabaseSync(DB_PATH, { readOnly: true });

  const verseCount = validateDb.prepare('SELECT COUNT(*) as count FROM verses').get() as {
    count: number;
  };
  const surahCount = validateDb
    .prepare('SELECT COUNT(DISTINCT surah_number) as count FROM verses')
    .get() as { count: number };
  const translationCount = validateDb
    .prepare('SELECT COUNT(*) as count FROM translations')
    .get() as {
    count: number;
  };
  const metadataCount = validateDb
    .prepare('SELECT COUNT(*) as count FROM surah_metadata')
    .get() as {
    count: number;
  };
  const emptyUthmani = validateDb
    .prepare("SELECT COUNT(*) as count FROM verses WHERE uthmani_text = ''")
    .get() as { count: number };
  const emptySimple = validateDb
    .prepare("SELECT COUNT(*) as count FROM verses WHERE simple_text = ''")
    .get() as { count: number };
  const emptyTranslation = validateDb
    .prepare("SELECT COUNT(*) as count FROM translations WHERE text = ''")
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

  const dbSize = statSync(DB_PATH).size;
  console.log(`\n✅ Database created successfully at: ${DB_PATH}`);
  console.log(`   Size: ${(dbSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   Verses: ${verseCount.count} across ${surahCount.count} surahs`);
  console.log(`   Translations: ${translationCount.count}`);
  console.log(`   Metadata: ${metadataCount.count} surahs`);

  writeBundledRecord(english.version, english.title);
  console.log(`   Bundled translation record: ${BUNDLED_RECORD_PATH}`);
}

main().catch((err) => {
  console.error('❌ Pipeline failed:', err);
  process.exit(1);
});
