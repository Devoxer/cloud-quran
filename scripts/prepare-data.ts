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

// Tafsir sources configuration
type TafsirSourceKey = 'ibn-kathir' | 'al-jalalayn' | 'al-sadi';

interface TafsirSourceConfig {
  type: 'qurancom' | 'fawazahmed0';
  resourceId?: number;
  edition?: string;
  cacheFile: string;
}

const TAFSIR_SOURCES: Record<TafsirSourceKey, TafsirSourceConfig> = {
  'ibn-kathir': {
    type: 'qurancom',
    resourceId: 14,
    cacheFile: 'tafsir-ibn-kathir.json',
  },
  'al-jalalayn': {
    type: 'fawazahmed0',
    edition: 'ara-jalaladdinalmah',
    cacheFile: 'tafsir-al-jalalayn.json',
  },
  'al-sadi': {
    type: 'qurancom',
    resourceId: 91,
    cacheFile: 'tafsir-al-sadi.json',
  },
};

interface TafsirEntry {
  surah_number: number;
  verse_number: number;
  text: string;
}

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

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

async function downloadQuranComTafsir(
  resourceId: number,
  cacheFile: string,
): Promise<TafsirEntry[]> {
  const filepath = resolve(DATA_DIR, cacheFile);
  if (existsSync(filepath)) {
    console.log(`  Using cached: ${cacheFile}`);
    return JSON.parse(await Bun.file(filepath).text());
  }

  console.log(`  Downloading tafsir (quran.com ID ${resourceId})...`);
  const allEntries: TafsirEntry[] = [];

  for (let chapter = 1; chapter <= 114; chapter++) {
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages) {
      const url = `https://api.quran.com/api/v4/tafsirs/${resourceId}/by_chapter/${chapter}?page=${page}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch tafsir chapter ${chapter} page ${page}: ${response.status}`);
      }
      const data = (await response.json()) as {
        tafsirs: Array<{ verse_key: string; text: string }>;
        pagination: { total_pages: number; current_page: number };
      };

      totalPages = data.pagination.total_pages;

      for (const entry of data.tafsirs) {
        const [surah, verse] = entry.verse_key.split(':').map(Number);
        allEntries.push({
          surah_number: surah,
          verse_number: verse,
          text: stripHtml(entry.text),
        });
      }

      page++;
    }

    if (chapter % 20 === 0) {
      console.log(`    ... chapter ${chapter}/114`);
    }
  }

  writeFileSync(filepath, JSON.stringify(allEntries), 'utf-8');
  console.log(`  Saved: ${cacheFile} (${allEntries.length} entries)`);
  return allEntries;
}

interface TransliterationEntry {
  surah_number: number;
  verse_number: number;
  text: string;
}

async function downloadTransliteration(cacheFile: string): Promise<TransliterationEntry[]> {
  const filepath = resolve(DATA_DIR, cacheFile);
  if (existsSync(filepath)) {
    console.log(`  Using cached: ${cacheFile}`);
    return JSON.parse(await Bun.file(filepath).text());
  }

  console.log('  Downloading transliteration (quran.com resource 57)...');
  const allEntries: TransliterationEntry[] = [];

  for (let chapter = 1; chapter <= 114; chapter++) {
    const url = `https://api.quran.com/api/v4/quran/translations/57?chapter_number=${chapter}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch transliteration chapter ${chapter}: ${response.status}`);
    }
    const data = (await response.json()) as {
      translations: Array<{ resource_id: number; text: string }>;
    };

    // Validate per-chapter verse count matches metadata
    const expectedVerseCount = SURAH_METADATA[chapter - 1].verseCount;
    if (data.translations.length !== expectedVerseCount) {
      throw new Error(
        `Transliteration chapter ${chapter}: expected ${expectedVerseCount} verses, got ${data.translations.length}`,
      );
    }

    // Verses are returned in order (1, 2, 3...) per chapter
    for (let i = 0; i < data.translations.length; i++) {
      allEntries.push({
        surah_number: chapter,
        verse_number: i + 1,
        text: stripHtml(data.translations[i].text),
      });
    }

    if (chapter % 20 === 0) {
      console.log(`    ... chapter ${chapter}/114`);
    }
  }

  writeFileSync(filepath, JSON.stringify(allEntries), 'utf-8');
  console.log(`  Saved: ${cacheFile} (${allEntries.length} entries)`);
  return allEntries;
}

async function downloadFawazTafsir(edition: string, cacheFile: string): Promise<TafsirEntry[]> {
  const filepath = resolve(DATA_DIR, cacheFile);
  if (existsSync(filepath)) {
    console.log(`  Using cached: ${cacheFile}`);
    return JSON.parse(await Bun.file(filepath).text());
  }

  console.log(`  Downloading tafsir (fawazahmed0: ${edition})...`);
  const allEntries: TafsirEntry[] = [];

  for (let chapter = 1; chapter <= 114; chapter++) {
    const url = `https://raw.githubusercontent.com/fawazahmed0/quran-api/refs/heads/1/editions/${edition}/${chapter}.json`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch tafsir chapter ${chapter}: ${response.status}`);
    }
    const data = (await response.json()) as {
      chapter: Array<{ chapter: number; verse: number; text: string }>;
    };

    for (const entry of data.chapter) {
      allEntries.push({
        surah_number: entry.chapter,
        verse_number: entry.verse,
        text: entry.text,
      });
    }

    if (chapter % 20 === 0) {
      console.log(`    ... chapter ${chapter}/114`);
    }
  }

  writeFileSync(filepath, JSON.stringify(allEntries), 'utf-8');
  console.log(`  Saved: ${cacheFile} (${allEntries.length} entries)`);
  return allEntries;
}

/**
 * Fill gaps in tafsir data where grouped commentary covers multiple verses.
 * For each missing verse, assigns the text from the nearest preceding verse.
 */
function fillTafsirGaps(entries: TafsirEntry[]): TafsirEntry[] {
  // Build a lookup: surah -> verse -> text
  const lookup = new Map<string, string>();
  for (const e of entries) {
    lookup.set(`${e.surah_number}:${e.verse_number}`, e.text);
  }

  const filled: TafsirEntry[] = [];
  for (let s = 0; s < 114; s++) {
    const surahNum = s + 1;
    const verseCount = SURAH_METADATA[s].verseCount;
    // Find the first available text in this surah to use as fallback for leading gaps
    let lastText = '';
    for (let v = 1; v <= verseCount; v++) {
      const firstAvailable = lookup.get(`${surahNum}:${v}`);
      if (firstAvailable) {
        lastText = firstAvailable;
        break;
      }
    }
    for (let v = 1; v <= verseCount; v++) {
      const key = `${surahNum}:${v}`;
      const text = lookup.get(key);
      if (text) {
        lastText = text;
      }
      filled.push({ surah_number: surahNum, verse_number: v, text: lastText });
    }
  }
  return filled;
}

async function downloadTafsir(
  sourceKey: TafsirSourceKey,
  config: TafsirSourceConfig,
): Promise<TafsirEntry[]> {
  let entries: TafsirEntry[];
  if (config.type === 'qurancom') {
    entries = await downloadQuranComTafsir(config.resourceId!, config.cacheFile);
  } else {
    entries = await downloadFawazTafsir(config.edition!, config.cacheFile);
  }

  // Fill gaps for tafsirs that group verses
  if (entries.length < 6236) {
    console.log(`    Filling gaps: ${entries.length} → 6236 entries`);
    entries = fillTafsirGaps(entries);
  }

  return entries;
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

  // Step 2b: Download tafsir data
  console.log('\nStep 2b: Downloading tafsir data...');
  const tafsirData: Record<TafsirSourceKey, TafsirEntry[]> = {} as any;
  for (const [key, config] of Object.entries(TAFSIR_SOURCES) as [
    TafsirSourceKey,
    TafsirSourceConfig,
  ][]) {
    tafsirData[key] = await downloadTafsir(key, config);
    console.log(`  ${key}: ${tafsirData[key].length} entries`);
  }

  // Step 2c: Download transliteration data
  console.log('\nStep 2c: Downloading transliteration data...');
  const transliterationData = await downloadTransliteration('transliteration.json');
  console.log(`  Transliteration: ${transliterationData.length} entries`);

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

    CREATE TABLE tafsir_entries (
      surah_number INTEGER NOT NULL,
      verse_number INTEGER NOT NULL,
      source TEXT NOT NULL CHECK(source IN ('ibn-kathir', 'al-jalalayn', 'al-sadi')),
      text TEXT NOT NULL,
      PRIMARY KEY (surah_number, verse_number, source)
    );

    CREATE INDEX idx_tafsir_verse ON tafsir_entries(surah_number, verse_number);

    CREATE TABLE transliterations (
      surah_number INTEGER NOT NULL,
      verse_number INTEGER NOT NULL,
      text TEXT NOT NULL,
      PRIMARY KEY (surah_number, verse_number)
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
  const insertTafsir = db.prepare(
    'INSERT INTO tafsir_entries (surah_number, verse_number, source, text) VALUES (?, ?, ?, ?)',
  );
  const insertTransliteration = db.prepare(
    'INSERT INTO transliterations (surah_number, verse_number, text) VALUES (?, ?, ?)',
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

  // Insert tafsir data
  for (const [sourceKey, entries] of Object.entries(tafsirData) as [
    TafsirSourceKey,
    TafsirEntry[],
  ][]) {
    for (const entry of entries) {
      insertTafsir.run(entry.surah_number, entry.verse_number, sourceKey, entry.text);
    }
  }

  // Insert transliteration data
  for (const entry of transliterationData) {
    insertTransliteration.run(entry.surah_number, entry.verse_number, entry.text);
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
  const transliterationCount = validateDb
    .query('SELECT COUNT(*) as count FROM transliterations')
    .get() as { count: number };
  const tafsirCount = validateDb.query('SELECT COUNT(*) as count FROM tafsir_entries').get() as {
    count: number;
  };
  const tafsirSourceCounts = validateDb
    .query('SELECT source, COUNT(*) as count FROM tafsir_entries GROUP BY source')
    .all() as Array<{ source: string; count: number }>;
  const emptyTransliteration = validateDb
    .query("SELECT COUNT(*) as count FROM transliterations WHERE text = ''")
    .get() as { count: number };
  const emptyUthmani = validateDb
    .query("SELECT COUNT(*) as count FROM verses WHERE uthmani_text = ''")
    .get() as { count: number };
  const emptySimple = validateDb
    .query("SELECT COUNT(*) as count FROM verses WHERE simple_text = ''")
    .get() as { count: number };
  const emptyTranslation = validateDb
    .query("SELECT COUNT(*) as count FROM translations WHERE text = ''")
    .get() as { count: number };
  const emptyTafsir = validateDb
    .query("SELECT COUNT(*) as count FROM tafsir_entries WHERE text = ''")
    .get() as { count: number };

  validateDb.close();

  console.log(`  Total verses: ${verseCount.count}`);
  console.log(`  Total surahs: ${surahCount.count}`);
  console.log(`  Total translations: ${translationCount.count}`);
  console.log(`  Transliteration entries: ${transliterationCount.count}`);
  console.log(`  Surah metadata entries: ${metadataCount.count}`);
  console.log(`  Total tafsir entries: ${tafsirCount.count}`);
  for (const src of tafsirSourceCounts) {
    console.log(`    ${src.source}: ${src.count}`);
  }

  const errors: string[] = [];
  if (verseCount.count !== 6236) errors.push(`Expected 6236 verses, got ${verseCount.count}`);
  if (surahCount.count !== 114) errors.push(`Expected 114 surahs, got ${surahCount.count}`);
  if (translationCount.count !== 6236)
    errors.push(`Expected 6236 translations, got ${translationCount.count}`);
  if (metadataCount.count !== 114)
    errors.push(`Expected 114 metadata entries, got ${metadataCount.count}`);
  if (transliterationCount.count !== 6236)
    errors.push(`Expected 6236 transliteration entries, got ${transliterationCount.count}`);

  // Validate tafsir: 6236 verses × 3 sources = 18,708 entries
  if (tafsirCount.count !== 18708)
    errors.push(`Expected 18708 tafsir entries (6236×3), got ${tafsirCount.count}`);
  for (const src of tafsirSourceCounts) {
    if (src.count !== 6236) {
      errors.push(`Expected 6236 entries for tafsir source '${src.source}', got ${src.count}`);
    }
  }

  if (emptyTransliteration.count > 0)
    errors.push(`${emptyTransliteration.count} empty transliteration text fields`);
  if (emptyUthmani.count > 0) errors.push(`${emptyUthmani.count} empty Uthmani text fields`);
  if (emptySimple.count > 0) errors.push(`${emptySimple.count} empty Simple text fields`);
  if (emptyTranslation.count > 0) errors.push(`${emptyTranslation.count} empty translation fields`);
  if (emptyTafsir.count > 0) errors.push(`${emptyTafsir.count} empty tafsir text fields`);

  if (errors.length > 0) {
    throw new Error(`Validation FAILED:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
  }

  const dbSize = Bun.file(DB_PATH).size;
  const dbSizeMB = dbSize / 1024 / 1024;

  if (dbSizeMB > 50) {
    throw new Error(`Database size ${dbSizeMB.toFixed(2)} MB exceeds 50 MB limit`);
  }

  console.log(`\n✅ Database created successfully at: ${DB_PATH}`);
  console.log(`   Size: ${dbSizeMB.toFixed(2)} MB`);
  console.log(`   Verses: ${verseCount.count} across ${surahCount.count} surahs`);
  console.log(`   Translations: ${translationCount.count}`);
  console.log(`   Metadata: ${metadataCount.count} surahs`);
  console.log(`   Transliteration: ${transliterationCount.count}`);
  console.log(`   Tafsir: ${tafsirCount.count} entries (3 sources × 6236 verses)`);
}

main().catch((err) => {
  console.error('❌ Pipeline failed:', err);
  process.exit(1);
});
