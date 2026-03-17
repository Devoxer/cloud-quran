// Generates mushaf layout JSON files from offline data sources:
//   - zonetecde/mushaf-layout → word data, line assignments, Arabic text, QPC glyph codes
//   - quran.com-images database → verification against King Fahd Complex authoritative source
//
// Run: bun run scripts/generate-mushaf-layout.ts
//
// Prerequisites: Both repos are auto-cloned to /tmp if not present:
//   git clone --depth 1 https://github.com/quran/quran.com-images.git /tmp/quran.com-images
//   git clone --depth 1 https://github.com/zonetecde/mushaf-layout.git /tmp/mushaf-layout

import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { resolve } from 'path';

import { SURAH_METADATA } from '../packages/quran-data/src/surah-metadata';

const ROOT = resolve(import.meta.dir, '..');
const OUTPUT_DIR = resolve(ROOT, 'packages/quran-data/data/mushaf-layout');
const BUNDLE_PATH = resolve(ROOT, 'apps/expo/src/data/mushaf-layouts.json');
const TOTAL_PAGES = 604;

// External data source paths
const QCI_REPO = '/tmp/quran.com-images';
const ZT_REPO = '/tmp/mushaf-layout';
const QCI_SQL_DUMP = resolve(QCI_REPO, 'sql/02-database.sql');
const ZT_PAGE_DIR = resolve(ZT_REPO, 'src/data/mushaf-layout');
const ZT_QPC_V1 = resolve(ZT_REPO, 'src/data/QPC1/qpc-v1.json');
const ZT_QPC_V2 = resolve(ZT_REPO, 'src/data/QPC2/qpc-v2.json');

// ─── Types ───────────────────────────────────────────────────────────────────

interface OutputWord {
  location: string;
  word: string;
  qpcV2: string;
  qpcV1: string;
}

interface OutputLine {
  line: number;
  type: 'surah-header' | 'basmala' | 'text';
  text?: string;
  surah?: string;
  verseRange?: string;
  words?: OutputWord[];
}

interface OutputPage {
  page: number;
  lines: OutputLine[];
}

interface ZonetecdeWord {
  position: number;
  location: string;
  lineNumber: number;
  text: string;
  audioUrl: string | null;
}

interface ZonetecdeVerse {
  verseKey: string;
  surahNumber: number;
  verseNumber: number;
  words: ZonetecdeWord[];
}

interface ZonePageData {
  pageId: number;
  verses: ZonetecdeVerse[];
}

// ─── Phase 0: Ensure data sources are available ──────────────────────────────

function ensureRepos(): void {
  if (!existsSync(QCI_SQL_DUMP)) {
    console.log('Cloning quran/quran.com-images...');
    try {
      execSync(`git clone --depth 1 https://github.com/quran/quran.com-images.git ${QCI_REPO}`, {
        stdio: 'inherit',
      });
    } catch {
      console.error(`Failed to clone quran.com-images to ${QCI_REPO}. Check network and disk space.`);
      process.exit(1);
    }
  }
  if (!existsSync(ZT_PAGE_DIR)) {
    console.log('Cloning zonetecde/mushaf-layout...');
    try {
      execSync(`git clone --depth 1 https://github.com/zonetecde/mushaf-layout.git ${ZT_REPO}`, {
        stdio: 'inherit',
      });
    } catch {
      console.error(`Failed to clone mushaf-layout to ${ZT_REPO}. Check network and disk space.`);
      process.exit(1);
    }
  }
}

// ─── Phase 1: Build layouts from zonetecde data ─────────────────────────────

function buildAllPages(
  qpcV1Map: Record<string, string>,
  qpcV2Map: Record<string, string>,
): Map<number, OutputPage> {
  const pages = new Map<number, OutputPage>();

  for (let pageNum = 1; pageNum <= TOTAL_PAGES; pageNum++) {
    const filePath = resolve(ZT_PAGE_DIR, `page-${pageNum}.json`);
    const data = JSON.parse(readFileSync(filePath, 'utf-8')) as ZonePageData;

    // Collect words grouped by line number
    const lineWords = new Map<number, { location: string; text: string; isEndMarker: boolean; surah: number; verse: number }[]>();

    for (const verse of data.verses) {
      for (const word of verse.words) {
        const ln = word.lineNumber;
        if (!lineWords.has(ln)) lineWords.set(ln, []);
        lineWords.get(ln)!.push({
          location: word.location,
          text: word.text,
          // zonetecde sets audioUrl=null for verse-end number markers (e.g. ١, ٢, ٣)
          // while actual words always have an audioUrl string
          isEndMarker: word.audioUrl === null,
          surah: verse.surahNumber,
          verse: verse.verseNumber,
        });
      }
    }

    // Detect which surahs start on this page
    const surahStarts = new Set<number>();
    for (const verse of data.verses) {
      if (verse.verseNumber === 1) {
        surahStarts.add(verse.surahNumber);
      }
    }

    // Find the first text line for each surah start
    const surahFirstLine = new Map<number, number>();
    for (const surahNum of surahStarts) {
      let minLine = Infinity;
      for (const verse of data.verses) {
        if (verse.surahNumber === surahNum && verse.verseNumber === 1) {
          for (const w of verse.words) {
            minLine = Math.min(minLine, w.lineNumber);
          }
        }
      }
      surahFirstLine.set(surahNum, minLine);
    }

    // Determine max line number
    let maxLine = 0;
    for (const ln of lineWords.keys()) {
      maxLine = Math.max(maxLine, ln);
    }

    // Find gap lines (no word data)
    const gapLines = new Set<number>();
    for (let ln = 1; ln <= maxLine; ln++) {
      if (!lineWords.has(ln)) gapLines.add(ln);
    }

    // Assign gap lines to surah headers/basmalas
    const assignedGaps = new Map<number, { type: 'surah-header' | 'basmala'; surahNum: number }>();
    for (const [surahNum, firstTextLine] of surahFirstLine) {
      const needsBasmala = surahNum !== 1 && surahNum !== 9;
      const gapBefore: number[] = [];
      for (let ln = firstTextLine - 1; ln >= 1 && gapLines.has(ln); ln--) {
        gapBefore.unshift(ln);
      }

      if (gapBefore.length >= 2 && needsBasmala) {
        // 2+ gaps: header + basmala both on this page
        assignedGaps.set(gapBefore[gapBefore.length - 2], { type: 'surah-header', surahNum });
        assignedGaps.set(gapBefore[gapBefore.length - 1], { type: 'basmala', surahNum });
      } else if (gapBefore.length >= 1 && needsBasmala) {
        // 1 gap + basmala needed: gap = basmala (header is on previous page)
        assignedGaps.set(gapBefore[gapBefore.length - 1], { type: 'basmala', surahNum });
      } else if (gapBefore.length >= 1) {
        // 1 gap, no basmala (surah 1 or 9): gap = header
        assignedGaps.set(gapBefore[gapBefore.length - 1], { type: 'surah-header', surahNum });
      }
    }

    // Build output lines
    const lines: OutputLine[] = [];

    for (let ln = 1; ln <= maxLine; ln++) {
      const assigned = assignedGaps.get(ln);

      if (assigned) {
        if (assigned.type === 'surah-header') {
          const metadata = SURAH_METADATA[assigned.surahNum - 1];
          lines.push({
            line: 0,
            type: 'surah-header',
            text: metadata.nameArabic,
            surah: String(assigned.surahNum).padStart(3, '0'),
          });
        } else {
          lines.push({ line: 0, type: 'basmala' });
        }
      } else if (lineWords.has(ln)) {
        const words = lineWords.get(ln)!;
        const outputWords: OutputWord[] = [];

        for (const w of words) {
          const v1 = qpcV1Map[w.location];
          const v2 = qpcV2Map[w.location];
          if (!v1 || !v2) {
            console.warn(`  ⚠️  Missing QPC glyph for word ${w.location} on page ${pageNum} (v1=${!!v1}, v2=${!!v2}) — skipping`);
            continue;
          }

          if (w.isEndMarker && outputWords.length > 0) {
            // Merge verse-end marker with preceding word
            const prev = outputWords[outputWords.length - 1];
            prev.word += ' ' + w.text;
            prev.qpcV1 += ' ' + v1;
            prev.qpcV2 += ' ' + v2;
          } else {
            outputWords.push({
              location: w.location,
              word: w.text,
              qpcV1: v1,
              qpcV2: v2,
            });
          }
        }

        if (outputWords.length === 0) continue;

        // Compute verse range (include end markers — they visually appear on this line)
        const verseLocs = new Set<string>();
        for (const w of words) {
          verseLocs.add(`${w.surah}:${w.verse}`);
        }
        const sortedLocs = [...verseLocs].sort((a, b) => {
          const [as, av] = a.split(':').map(Number);
          const [bs, bv] = b.split(':').map(Number);
          return as !== bs ? as - bs : av - bv;
        });
        const verseRange =
          sortedLocs.length === 1
            ? `${sortedLocs[0]}-${sortedLocs[0]}`
            : `${sortedLocs[0]}-${sortedLocs[sortedLocs.length - 1]}`;

        const text = outputWords.map((w) => w.word).join(' ');
        lines.push({ line: 0, type: 'text', text, verseRange, words: outputWords });
      }
    }

    // Detect surah header/basmala at the BOTTOM of the page.
    // This happens when a surah ends on this page and the next surah's header
    // falls on the remaining lines, but the next surah's first verse is on the next page.
    if (pageNum >= 3 && lines.length < 15) {
      // Find the last verse on this page
      let lastSurah = 0;
      let lastVerse = 0;
      for (const verse of data.verses) {
        if (
          verse.surahNumber > lastSurah ||
          (verse.surahNumber === lastSurah && verse.verseNumber > lastVerse)
        ) {
          lastSurah = verse.surahNumber;
          lastVerse = verse.verseNumber;
        }
      }

      // Check if this is the last verse of the surah
      if (lastSurah > 0 && lastSurah <= 114) {
        const surahMeta = SURAH_METADATA[lastSurah - 1];
        if (lastVerse === surahMeta.verseCount && lastSurah < 114) {
          const nextSurah = lastSurah + 1;
          const needsBasmala = nextSurah !== 1 && nextSurah !== 9;
          const remaining = 15 - lines.length;

          // Add surah header
          if (remaining >= 1) {
            const nextMeta = SURAH_METADATA[nextSurah - 1];
            lines.push({
              line: 0,
              type: 'surah-header',
              text: nextMeta.nameArabic,
              surah: String(nextSurah).padStart(3, '0'),
            });
          }
          // Add basmala if room and needed
          if (remaining >= 2 && needsBasmala) {
            lines.push({ line: 0, type: 'basmala' });
          }
        }
      }
    }

    // Renumber lines sequentially (1-based)
    for (let i = 0; i < lines.length; i++) {
      lines[i].line = i + 1;
    }

    pages.set(pageNum, { page: pageNum, lines });
  }

  return pages;
}

// ─── Phase 3: Verify against quran.com-images ────────────────────────────────

function verifyAgainstAuthority(pages: Map<number, OutputPage>): number {
  console.log('\nPhase 3: Verifying against quran.com-images (King Fahd Complex)...');

  const sqlDump = readFileSync(QCI_SQL_DUMP, 'utf-8');
  const db = new Database(':memory:');

  db.run(`CREATE TABLE glyph (
    glyph_id INTEGER PRIMARY KEY, font_file TEXT, glyph_code INTEGER,
    page_number INTEGER, glyph_type_id INTEGER, glyph_type_meta INTEGER, description TEXT
  )`);
  db.run(`CREATE TABLE glyph_ayah (
    glyph_ayah_id INTEGER PRIMARY KEY, glyph_id INTEGER,
    sura_number INTEGER, ayah_number INTEGER, position INTEGER
  )`);
  db.run(`CREATE TABLE glyph_page_line (
    glyph_page_line_id INTEGER PRIMARY KEY, glyph_id INTEGER,
    page_number INTEGER, line_number INTEGER, position INTEGER, line_type TEXT
  )`);

  function loadTable(table: string): void {
    const regex = new RegExp(`INSERT INTO \`${table}\` VALUES\\s*(.+?);`, 'g');
    let match;
    const rows: string[][] = [];
    while ((match = regex.exec(sqlDump)) !== null) {
      const tuples = match[1].split('),(');
      for (let t of tuples) {
        t = t.replace(/^\(/, '').replace(/\)$/, '');
        const vals: string[] = [];
        let current = '';
        let inQuote = false;
        for (let i = 0; i < t.length; i++) {
          const c = t[i];
          if (c === "'" && !inQuote) { inQuote = true; continue; }
          if (c === "'" && inQuote) { inQuote = false; continue; }
          if (c === ',' && !inQuote) { vals.push(current); current = ''; continue; }
          current += c;
        }
        vals.push(current);
        rows.push(vals);
      }
    }
    const colCount = table === 'glyph' ? 7 : table === 'glyph_ayah' ? 5 : 6;
    const placeholders = Array(colCount).fill('?').join(',');
    const stmt = db.prepare(`INSERT INTO ${table} VALUES (${placeholders})`);
    db.transaction(() => {
      for (const r of rows) {
        stmt.run(...r.map((v) => (v === 'NULL' ? null : isNaN(Number(v)) ? v : Number(v))));
      }
    })();
  }

  loadTable('glyph');
  loadTable('glyph_ayah');
  loadTable('glyph_page_line');
  db.run('CREATE INDEX idx_gpl_page ON glyph_page_line(page_number)');
  db.run('CREATE INDEX idx_ga_glyph ON glyph_ayah(glyph_id)');

  // Verify: for each page, check that the verse locations on each line match
  let verifiedPages = 0;
  const mismatches: string[] = [];

  for (let pageNum = 3; pageNum <= TOTAL_PAGES; pageNum++) {
    const layout = pages.get(pageNum)!;

    // Get quran.com-images line structure (verse locations per line)
    const qciRows = db.query(`
      SELECT gpl.line_number, ga.sura_number, ga.ayah_number
      FROM glyph_page_line gpl
      JOIN glyph g ON gpl.glyph_id = g.glyph_id
      LEFT JOIN glyph_ayah ga ON gpl.glyph_id = ga.glyph_id
      WHERE gpl.page_number = ? AND gpl.line_type = 'ayah' AND ga.sura_number IS NOT NULL
      ORDER BY gpl.line_number, gpl.position
    `).all(pageNum) as { line_number: number; sura_number: number; ayah_number: number }[];

    // Build set of unique verses per line (quran.com-images)
    const qciLineVerses = new Map<number, Set<string>>();
    for (const r of qciRows) {
      if (!qciLineVerses.has(r.line_number)) qciLineVerses.set(r.line_number, new Set());
      qciLineVerses.get(r.line_number)!.add(`${r.sura_number}:${r.ayah_number}`);
    }

    // Build set of unique verses per output line (our generated data)
    // Map output line index to verse set
    const outTextLines = layout.lines.filter((l) => l.type === 'text' && l.words);
    const qciTextLines = [...qciLineVerses.entries()].sort((a, b) => a[0] - b[0]);

    if (outTextLines.length !== qciTextLines.length) {
      mismatches.push(
        `Page ${pageNum}: text line count differs: ours=${outTextLines.length}, qci=${qciTextLines.length}`,
      );
      continue;
    }

    // Compare verse sets per line (order-matched)
    let pageMatch = true;
    for (let i = 0; i < outTextLines.length; i++) {
      const outLine = outTextLines[i];
      const [, qciVerses] = qciTextLines[i];

      const outVerses = new Set<string>();
      for (const w of outLine.words!) {
        const [s, v] = w.location.split(':');
        outVerses.add(`${s}:${v}`);
      }

      // Check that the same verses appear on each line
      for (const v of qciVerses) {
        if (!outVerses.has(v)) {
          pageMatch = false;
          mismatches.push(`Page ${pageNum} line ${i + 1}: verse ${v} in qci but not in output`);
          break;
        }
      }
      for (const v of outVerses) {
        if (!qciVerses.has(v)) {
          pageMatch = false;
          mismatches.push(`Page ${pageNum} line ${i + 1}: verse ${v} in output but not in qci`);
          break;
        }
      }
    }

    if (pageMatch) verifiedPages++;
  }

  db.close();

  console.log(`  Verified ${verifiedPages}/${TOTAL_PAGES - 2} pages (3-604) match quran.com-images`);
  if (mismatches.length > 0) {
    console.warn(`  ⚠️  ${mismatches.length} mismatches (showing first 10):`);
    for (const m of mismatches.slice(0, 10)) {
      console.warn(`    ${m}`);
    }
  } else {
    console.log('  ✓ All pages verified against authoritative source');
  }

  return mismatches.length;
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  console.log('=== Generating Mushaf Layout ===');
  console.log('  Data source: zonetecde/mushaf-layout (QPC glyphs + Arabic text)');
  console.log('  Verification: quran.com-images (King Fahd Complex)\n');

  // Phase 0: Ensure repos
  ensureRepos();

  // Load QPC mappings
  console.log('Phase 1: Loading QPC glyph mappings...');
  const qpcV1Map = JSON.parse(readFileSync(ZT_QPC_V1, 'utf-8')) as Record<string, string>;
  const qpcV2Map = JSON.parse(readFileSync(ZT_QPC_V2, 'utf-8')) as Record<string, string>;
  console.log(`  QPC V1 entries: ${Object.keys(qpcV1Map).length}`);
  console.log(`  QPC V2 entries: ${Object.keys(qpcV2Map).length}`);

  // Phase 1: Build layouts
  console.log('\nPhase 2: Building layout JSON files from zonetecde data...');
  const pages = buildAllPages(qpcV1Map, qpcV2Map);

  // Write individual page files and bundle
  mkdirSync(OUTPUT_DIR, { recursive: true });

  let totalLines = 0;
  let totalWords = 0;
  let headerCount = 0;
  let basmalaCount = 0;
  const nonStandardPages: { page: number; lines: number }[] = [];
  const allLayouts: Record<string, OutputPage> = {};

  for (let pageNum = 1; pageNum <= TOTAL_PAGES; pageNum++) {
    const layout = pages.get(pageNum)!;
    const fileName = `page-${String(pageNum).padStart(3, '0')}.json`;
    writeFileSync(resolve(OUTPUT_DIR, fileName), JSON.stringify(layout, null, 2) + '\n', 'utf-8');
    allLayouts[String(pageNum)] = layout;

    totalLines += layout.lines.length;
    for (const line of layout.lines) {
      if (line.type === 'text' && line.words) totalWords += line.words.length;
      if (line.type === 'surah-header') headerCount++;
      if (line.type === 'basmala') basmalaCount++;
    }
    if (pageNum >= 3 && layout.lines.length !== 15) {
      nonStandardPages.push({ page: pageNum, lines: layout.lines.length });
    }
  }

  // Write bundle
  writeFileSync(BUNDLE_PATH, JSON.stringify(allLayouts), 'utf-8');
  const bundleSize = (Bun.file(BUNDLE_PATH).size / 1024 / 1024).toFixed(2);
  console.log(`  Bundle: ${BUNDLE_PATH} (${bundleSize} MB)`);

  // Collect all unique verses
  const allVerses = new Set<string>();
  for (const layout of Object.values(allLayouts)) {
    for (const line of layout.lines) {
      if (line.words) {
        for (const w of line.words) {
          const [s, v] = w.location.split(':');
          allVerses.add(`${s}:${v}`);
        }
      }
    }
  }

  // Phase 3: Verify against quran.com-images
  const mismatchCount = verifyAgainstAuthority(pages);

  // ─── Final Validation ──────────────────────────────────────────────────
  console.log('\n=== Generation Complete ===');
  console.log(`  Pages: ${TOTAL_PAGES}`);
  console.log(`  Total lines: ${totalLines}`);
  console.log(`  Total words: ${totalWords}`);
  console.log(`  Unique verses: ${allVerses.size} (expected: 6236)`);
  console.log(`  Surah headers: ${headerCount} (expected: 114)`);
  console.log(`  Basmalas: ${basmalaCount} (expected: ≤112)`);
  console.log(`  Output: ${OUTPUT_DIR}/`);

  const errors: string[] = [];
  if (mismatchCount > 0) errors.push(`${mismatchCount} page(s) failed verification against quran.com-images`);
  if (headerCount !== 114) errors.push(`Expected 114 surah headers, got ${headerCount}`);
  if (allVerses.size !== 6236) errors.push(`Expected 6236 verses, got ${allVerses.size}`);
  if (nonStandardPages.length > 0) {
    errors.push(
      `Pages with non-15 line count: ${nonStandardPages.map((p) => `${p.page}(${p.lines})`).join(', ')}`,
    );
  }

  if (errors.length > 0) {
    console.error('\n❌ Validation errors:');
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  console.log('\n  ✓ All pages 3-604 have exactly 15 lines');
  console.log('  ✓ All 6236 verses covered');
  console.log('  ✓ All 114 surah headers present');
  console.log('\n✅ Mushaf layout generation complete');
}

main();
