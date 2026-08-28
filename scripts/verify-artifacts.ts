// Integrity coverage for everything `verify-quran.ts` does NOT hash.
// Run: node scripts/verify-artifacts.ts   (invoked by `pnpm verify`, after the ayah gate)
//
// ⚠️ WHY THIS FILE EXISTS AT ALL. `verify-quran.ts` hashes `verses.uthmani_text` and nothing
// else, and the repo's own non-negotiable says there is no room for error in the Quran. Everything
// below shipped with NO baseline, so a mutation of any of it passed every gate clean:
//
//   • `verses.simple_text`   — 6,236 rows, the search/compare text
//   • `translations`         — 6,236 rows of rendered meaning
//   • `surah_metadata`       — 114 rows; names, counts and revelation order the whole UI reads
//   • the mushaf layouts     — 604 files, ~18 MB, which decide what glyph sits where on the page
//   • the verse↔page map     — the file story 6-3 proved a whole COLUMN of had silently drifted
//
// ⚠️ AND THE LAST ENTRY IS THE ARGUMENT FOR THE OTHER FOUR. Story 6-3 found 565 committed lines
// of `verseRange` that disagreed with reality, and story 6-2 found a glyph map that skipped a
// codepoint — both in this exact class of generated data, both invisible to every gate, both
// found by a human noticing something looked wrong. This gate is what makes the next one loud.
//
// ── Why ARTIFACT digests rather than per-row hashes ─────────────────────────────────────────
// `hashes.ts` is already 484 KB for one column. Four more per-row maps would add megabytes to
// every clone and every context window to buy precision this gate does not need: a build gate has
// to answer "did the generated data change", and the answer is acted on by regenerating or by
// investigating, never by patching one row. So each artifact gets ONE SHA-256 over a canonical
// serialization, and a mismatch names the artifact.
//
// ⚠️ THE SERIALIZATION IS ORDERED AND EXPLICIT, because a digest over an unordered query is a
// digest over SQLite's whim: the same bytes could hash differently after a VACUUM and cry wolf
// forever. Every query carries an ORDER BY over a unique key, and the layout files are sorted by
// name before reading.

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { SURAH_COUNT, TOTAL_PAGES, TOTAL_VERSES } from '../packages/quran-data/src/constants.ts';

const ROOT = resolve(import.meta.dirname, '..');
// Same seam as `verify-quran.ts`, and for the same reason: the failure branches below are only
// testable against a fixture. Nothing in the pipeline sets these.
const DB_PATH = process.env.CQ_VERIFY_DB ?? resolve(ROOT, 'apps/expo/src/data/quran.db');
const LAYOUT_DIR =
  process.env.CQ_VERIFY_LAYOUTS ?? resolve(ROOT, 'packages/quran-data/data/mushaf-layout');
const PAGE_MAP_PATH =
  process.env.CQ_VERIFY_PAGE_MAP ?? resolve(ROOT, 'packages/quran-data/src/verse-page-map.ts');
const DIGESTS_PATH =
  process.env.CQ_VERIFY_DIGESTS ?? resolve(ROOT, 'packages/quran-data/src/artifact-digests.ts');

const ALLOW_GENERATE = process.argv.includes('--generate-digests');

/** One artifact's digest plus the population it covers — the count is half the guarantee. */
interface Digest {
  digest: string;
  rows: number;
}

const sha = (input: string): string => createHash('sha256').update(input).digest('hex');

/**
 * ⚠️ EVERY ARTIFACT DECLARES THE SIZE IT MUST BE, and that is not belt-and-braces. A digest alone
 * cannot see truncation: an empty table hashes to a perfectly stable value, and a baseline minted
 * from it would agree with itself forever. These are the Quran's fixed, known dimensions, so
 * there is an exact number to insist on rather than a heuristic.
 */
const EXPECTED_ROWS: Record<string, number> = {
  'verses.simple_text': TOTAL_VERSES,
  translations: TOTAL_VERSES,
  surah_metadata: SURAH_COUNT,
  'mushaf-layout': TOTAL_PAGES,
  'verse-page-map': 1,
};

function computeDigests(): Record<string, Digest> {
  const db = new DatabaseSync(DB_PATH, { readOnly: true });
  const out: Record<string, Digest> = {};

  // `simple_text` — the sibling column the ayah gate does not touch.
  const simple = db
    .prepare(
      'SELECT surah_number, verse_number, simple_text FROM verses ORDER BY surah_number, verse_number'
    )
    .all() as unknown as { surah_number: number; verse_number: number; simple_text: string }[];
  out['verses.simple_text'] = {
    rows: simple.length,
    digest: sha(
      simple.map((r) => `${r.surah_number}:${r.verse_number}:${r.simple_text}`).join('\n')
    ),
  };

  // Translations — ordered by the full key, language included, so a second language cannot
  // reorder the digest.
  const translations = db
    .prepare(
      'SELECT surah_number, verse_number, language, text FROM translations ORDER BY language, surah_number, verse_number'
    )
    .all() as unknown as {
    surah_number: number;
    verse_number: number;
    language: string;
    text: string;
  }[];
  out.translations = {
    rows: translations.length,
    digest: sha(
      translations
        .map((r) => `${r.language}:${r.surah_number}:${r.verse_number}:${r.text}`)
        .join('\n')
    ),
  };

  // Surah metadata — every column, because a wrong `verse_count` or `revelation_order` is as
  // wrong as a wrong name and nothing else checks them.
  const meta = db
    .prepare(
      'SELECT surah_number, name_arabic, name_english, name_transliteration, verse_count, revelation_type, revelation_order FROM surah_metadata ORDER BY surah_number'
    )
    .all() as unknown as Record<string, string | number>[];
  out.surah_metadata = {
    rows: meta.length,
    digest: sha(
      meta
        .map((r) =>
          [
            r.surah_number,
            r.name_arabic,
            r.name_english,
            r.name_transliteration,
            r.verse_count,
            r.revelation_type,
            r.revelation_order,
          ].join(':')
        )
        .join('\n')
    ),
  };

  db.close();

  // The 604 layout files, sorted by NAME — readdir order is filesystem-dependent and would make
  // the digest machine-specific.
  const layoutFiles = readdirSync(LAYOUT_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();
  out['mushaf-layout'] = {
    rows: layoutFiles.length,
    digest: sha(
      layoutFiles.map((f) => `${f}:${readFileSync(join(LAYOUT_DIR, f), 'utf8')}`).join('\n')
    ),
  };

  // The generated verse→page map, as bytes. Story 6-3 regenerated this file after finding a
  // drifted column in its sibling; from here on a change has to be deliberate.
  out['verse-page-map'] = { rows: 1, digest: sha(readFileSync(PAGE_MAP_PATH, 'utf8')) };

  return out;
}

function writeDigestsFile(digests: Record<string, Digest>): void {
  const entries = Object.entries(digests)
    .map(([key, d]) => `  '${key}': { digest: '${d.digest}', rows: ${d.rows} },`)
    .join('\n');
  const content = `// Auto-generated by scripts/verify-artifacts.ts — DO NOT EDIT
// SHA-256 over the generated Quran artifacts the per-ayah gate does not cover.
// Each entry is one artifact: a canonical, ORDERED serialization hashed whole, plus the row
// count it was minted from (a digest cannot see truncation; the count can).

export interface ArtifactDigest {
  digest: string;
  rows: number;
}

export const ARTIFACT_DIGESTS: Record<string, ArtifactDigest> = {
${entries}
};
`;
  writeFileSync(DIGESTS_PATH, content, 'utf-8');
}

async function main(): Promise<void> {
  console.log('=== Quran Artifact Integrity ===\n');

  for (const [label, path] of [
    ['database', DB_PATH],
    ['layout directory', LAYOUT_DIR],
    ['verse-page map', PAGE_MAP_PATH],
  ] as const) {
    if (!existsSync(path)) {
      console.error(`❌ Missing ${label}: ${path}`);
      process.exit(1);
    }
  }

  const current = computeDigests();
  for (const [name, d] of Object.entries(current)) {
    console.log(`  ${name.padEnd(20)} ${d.rows} row(s)  ${d.digest.slice(0, 16)}…`);
  }

  // ⚠️ THE POPULATION CHECK RUNS ON BOTH PATHS — mint and verify. On mint it stops a truncated
  // artifact being baked in; on verify it catches a baseline that was minted before this guard
  // existed, where a short artifact and a short baseline would agree with each other forever.
  const wrongSize = Object.entries(current).filter(
    ([name, d]) => EXPECTED_ROWS[name] !== undefined && d.rows !== EXPECTED_ROWS[name]
  );
  if (wrongSize.length > 0) {
    console.error('\n❌ Refusing: an artifact is not the size the Quran fixes it at.');
    for (const [name, d] of wrongSize) {
      console.error(`   ${name}: found ${d.rows}, expected ${EXPECTED_ROWS[name]}`);
    }
    process.exit(1);
  }

  if (!existsSync(DIGESTS_PATH)) {
    if (!ALLOW_GENERATE) {
      console.error('\n❌ FAILED — no stored digests to verify against.');
      console.error(`   Expected: ${DIGESTS_PATH}`);
      console.error('   Restore it from git. If a new baseline is genuinely intended,');
      console.error('   re-run with --generate-digests; that generates, it does not verify.');
      process.exit(1);
    }
    console.log('\n--generate-digests — minting a NEW baseline (nothing is verified)...');
    writeDigestsFile(current);
    console.log(`  Written to: ${DIGESTS_PATH}`);
    process.exit(0);
  }

  if (ALLOW_GENERATE) {
    console.error(`\n❌ --generate-digests refused: ${DIGESTS_PATH} already exists.`);
    console.error('   Overwriting it would turn this gate into a rubber stamp.');
    process.exit(1);
  }

  const stored = (await import(pathToFileURL(DIGESTS_PATH).href)).ARTIFACT_DIGESTS as
    | Record<string, Digest>
    | undefined;
  if (!stored || typeof stored !== 'object') {
    console.error(`\n❌ Invalid digests file: ARTIFACT_DIGESTS not exported from ${DIGESTS_PATH}`);
    process.exit(1);
  }

  // Compared in BOTH directions: a stored artifact that stopped being computed is a silently
  // dropped guarantee, which is exactly how the chokepoint gates failed open before.
  const changed = Object.keys(current).filter(
    (k) => !stored[k] || stored[k].digest !== current[k].digest
  );
  const dropped = Object.keys(stored).filter((k) => !current[k]);

  if (changed.length === 0 && dropped.length === 0) {
    console.log(`\n✅ Artifact integrity PASSED — ${Object.keys(current).length} artifacts match`);
    process.exit(0);
  }

  console.error('\n❌ Artifact integrity FAILED');
  for (const k of changed) {
    console.error(
      stored[k]
        ? `   ${k} CHANGED (${stored[k].rows} → ${current[k].rows} rows)`
        : `   ${k} is NEW — not in the baseline`
    );
  }
  for (const k of dropped) {
    console.error(`   ${k} is no longer computed — a guarantee was dropped, not a file`);
  }
  console.error('\n   If the change is intended, regenerate the artifact and re-mint the');
  console.error('   baseline deliberately (delete the file, then --generate-digests).');
  process.exit(1);
}

main().catch((err) => {
  console.error('❌ Artifact verification failed:', err);
  process.exit(1);
});
