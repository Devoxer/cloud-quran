/**
 * Content-pack pipeline for Cloud Quran (story 8-2).
 *
 * A PACK is one source in one language, as a versioned read-only SQLite file plus a line in a
 * catalogue. It lives on the app's own R2 CDN beside the mushaf fonts and the recitation audio,
 * and it never enters this repo — see `packages/quran-data/data/packs/LICENCES.md` and
 * architecture §17. The repo is mirrored publicly under GPL-3.0; bundling somebody else's
 * translation there would purport to grant redistribution rights we do not hold. The CATALOGUE is
 * metadata about a pack and is committed, because `scripts/verify-licences.ts` has to be able to
 * ask "does every offered pack have a recorded licence?" without a network.
 *
 * ⚠️ THE UPSTREAM VERSION IS PINNED AND THE BUILD REFUSES A DRIFT. QuranEnc's grant requires the
 * version to be STATED, which is only meaningful if the bytes we shipped and the version we
 * printed are the same thing. `/api/v1/translations/list` reports the live version per key; if it
 * has moved past the pin, this script stops and asks for a deliberate bump (a new pack version,
 * a ledger update, a re-upload) rather than silently publishing text under a stale label.
 *
 * ⚠️ THE FILE NAME CARRIES THE VERSION, AND THAT IS WHAT MAKES AN UPDATE ATOMIC ON THE DEVICE.
 * `{id}-v{n}.db` means a new version is a DIFFERENT FILE: it downloads beside the old one,
 * verifies, and only then is the old handle closed and the old file deleted. A same-name
 * overwrite would have to close a live handle before knowing the replacement is good — the shape
 * `importDatabaseFromAssetAsync`'s `forceOverwrite` gets wrong for the bundled Quran database,
 * and part of why packs exist at all.
 *
 * ⚠️ TWO INTEGRITY FACTS PER PACK, BECAUSE THEY CATCH DIFFERENT THINGS. The digest (SHA-256 over
 * the whole file) catches corruption in transit. The row count catches TRUNCATION — a
 * short-but-well-formed build whose digest is minted from the short file and therefore agrees
 * with itself forever. `verify-artifacts.ts:201-210` already encodes this lesson for the bundled
 * artifacts; a pack needs its own copy because it is verified on the DEVICE, at install time.
 *
 * Usage:
 *   node scripts/prepare-packs.ts --skip-upload   # build + catalogue only, nothing leaves the box
 *   node scripts/prepare-packs.ts                 # + idempotent upload to R2 (a second run skips)
 *   node scripts/prepare-packs.ts --force         # re-upload everything, ignoring the HEAD check
 */

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { TOTAL_VERSES } from '../packages/quran-data/src/constants.ts';

const ROOT = resolve(import.meta.dirname, '..');
const PACKS_DIR = resolve(ROOT, 'packages/quran-data/data/packs');
const CATALOGUE_PATH = resolve(PACKS_DIR, 'index.json');
/** Where built `.db` files land. Gitignored — a pack is never committed. */
const BUILD_DIR = resolve(ROOT, 'build/packs');

const BUCKET = 'gp-cdn';
const KEY_PREFIX = 'packs';
const CDN_BASE = 'https://cdn.nobleachievements.com';
/** The one place the app and this script agree on where a pack is served from. */
const PACK_CDN_BASE = `${CDN_BASE}/${KEY_PREFIX}`;

/** Bumped only by a breaking change to the catalogue SHAPE. The app refuses any other value. */
const CATALOGUE_VERSION = 1;

const QURANENC_LIST_URL = 'https://quranenc.com/api/v1/translations/list';
const quranEncDbUrl = (key: string) => `https://quranenc.com/downloads/sqlite/${key}.sqlite`;

const skipUpload = process.argv.includes('--skip-upload');
const force = process.argv.includes('--force');

/**
 * ⚠️ ONE PACK. This story ships the MECHANISM and exactly one pack to prove it end to end;
 * widening this list is story 8-4's job and is the scope creep 8-2 was written to refuse.
 *
 * French, because the pack has to be a translation in a language the app does not already carry —
 * English is bundled in `quran.db` and would prove less — and because `french_rashid` is one of
 * the two QuranEnc keys the 2026-09-16 licensing audit confirmed end to end.
 */
interface PackSpec {
  /** Stable pack id. Also the file-name stem, with `-v{n}` appended. */
  id: string;
  /** Bumped when the BYTES change. A new version is a new file; see the header. */
  packVersion: number;
  type: 'translation';
  /** BCP-47 language of the pack's content. */
  language: string;
  /** The language's own name, for a reader who does not read the interface language. */
  languageName: string;
  /** Title as the reader sees it. */
  title: string;
  /** The ledger entry in `LICENCES.md` this pack's rights come from. */
  licenceId: string;
  /**
   * Rendered beside the text wherever the pack is read. The grant requires it.
   *
   * ⚠️ IT IS A TEMPLATE, NOT A LITERAL, AND `{version}` IS SUBSTITUTED FROM THE PIN. A hand-written
   * "(v1.0.3)" is a second copy of a fact the pin already owns, and nothing cross-checked them —
   * so a version bump that updated the pin and forgot the string would publish text CLAIMING a
   * version it is not, which is the one condition of the grant this whole pipeline protects.
   * (Story 8-2 review, C6.)
   */
  attribution: string;
  /** How many rows the finished pack must hold. See `assertPackSize`. */
  expectedRows: number;
  upstream: {
    /** QuranEnc's own key for the edition. */
    key: string;
    /** The upstream version this build is pinned to — stated because the grant requires it. */
    version: string;
  };
}

const PACKS: PackSpec[] = [
  {
    id: 'translation-fr-rashid',
    packVersion: 1,
    type: 'translation',
    language: 'fr',
    languageName: 'Français',
    title: 'Le Noble Coran — Rachid Maach',
    licenceId: 'quranenc-republication',
    attribution: 'Traduction française : Rachid Maach. Source : QuranEnc.com (v{version}).',
    // A complete translation is one row per ayah. ⚠️ NOT a constant of the pipeline — see
    // `assertPackSize`; tafsir and asbab editions are next and are legitimately shorter.
    expectedRows: TOTAL_VERSES,
    upstream: { key: 'french_rashid', version: '1.0.3' },
  },
];

/** What one catalogue line says. The app's `features/packs/lib/catalogue.ts` validates this shape. */
interface CatalogueEntry {
  id: string;
  packVersion: number;
  type: string;
  language: string;
  languageName: string;
  title: string;
  source: string;
  sourceVersion: string;
  licenceId: string;
  attribution: string;
  url: string;
  bytes: number;
  rows: number;
  digest: string;
}

/** The attribution as it ships, with the pinned version substituted in. The single source. */
function resolveAttribution(spec: PackSpec): string {
  return spec.attribution.replaceAll('{version}', spec.upstream.version);
}

/**
 * ⚠️ THE EXPECTED ROW COUNT COMES FROM THE PACK, NOT FROM THE QURAN'S DIMENSION. The first cut
 * threw unless a pack held exactly 6,236 rows, which is right for a complete translation and
 * wrong for every other pack type architecture §17 names — a tafsir dedupes into blocks, an asbab
 * set covers a few hundred ayat, and a partial edition is a legitimate thing to ship. The check
 * that matters is "is this pack the size its SPEC says", which is still a refusal of truncation
 * and is the number the catalogue then publishes for the device to re-check.
 * (Story 8-2 review, C8.)
 */
function assertPackSize(spec: PackSpec, rows: number): void {
  if (rows !== spec.expectedRows) {
    throw new Error(
      `${spec.id}: built ${rows} rows, the spec says ${spec.expectedRows}. Refusing to publish — ` +
        'a digest cannot see truncation, so this is the only place it can be caught.'
    );
  }
}

// ─── Phase 1: the upstream version pin ───────────────────────────────────────

interface QuranEncEdition {
  key: string;
  version: string;
  title: string;
}

async function fetchQuranEncIndex(): Promise<Map<string, QuranEncEdition>> {
  const response = await fetch(QURANENC_LIST_URL);
  if (!response.ok) throw new Error(`QuranEnc list returned HTTP ${response.status}`);
  const body = (await response.json()) as { translations?: QuranEncEdition[] };
  if (!Array.isArray(body.translations) || body.translations.length === 0) {
    throw new Error('QuranEnc list returned no translations');
  }
  return new Map(body.translations.map((entry) => [entry.key, entry]));
}

function assertPinHolds(spec: PackSpec, index: Map<string, QuranEncEdition>): void {
  const live = index.get(spec.upstream.key);
  if (!live) {
    throw new Error(
      `QuranEnc no longer offers "${spec.upstream.key}". Do not fall back to another edition — ` +
        'the ledger names this one.'
    );
  }
  if (live.version !== spec.upstream.version) {
    throw new Error(
      `${spec.id}: upstream ${spec.upstream.key} is now v${live.version}, the pin says ` +
        `v${spec.upstream.version}. The grant requires the version to be STATED, so a drift is a ` +
        'deliberate bump: update the pin AND the attribution, raise `packVersion`, and re-run.'
    );
  }
}

// ─── Phase 2: build the pack ─────────────────────────────────────────────────

interface UpstreamRow {
  sura: number;
  aya: number;
  translation: string;
  footnotes: string | null;
}

/** Download the upstream SQLite once per run, into the build directory. */
async function fetchUpstreamDatabase(spec: PackSpec): Promise<string> {
  const target = resolve(BUILD_DIR, `upstream-${spec.upstream.key}.sqlite`);
  const response = await fetch(quranEncDbUrl(spec.upstream.key));
  if (!response.ok) {
    throw new Error(`Upstream database for ${spec.upstream.key} returned HTTP ${response.status}`);
  }
  // ⚠️ NOT jsDelivr, and not any mirror: above its package limit jsDelivr answers HTTP 200 with a
  // plain-text error body, so a naive fetcher stores garbage under a correct name. QuranEnc serves
  // its own downloads; the row assertions below are the second half of the check.
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 1024 || bytes.subarray(0, 15).toString('latin1') !== 'SQLite format 3') {
    throw new Error(
      `Upstream download for ${spec.upstream.key} is not a SQLite file (${bytes.length} bytes). ` +
        'A 200 with an error body is the failure this check exists for.'
    );
  }
  writeFileSync(target, bytes);
  return target;
}

function readUpstreamRows(path: string): UpstreamRow[] {
  // ⚠️ camelCase `readOnly`. `node:sqlite` SILENTLY IGNORES an unknown constructor option, so
  // Bun's `{ readonly: true }` opens read-WRITE — the trap story 5-3's port recorded.
  const db = new DatabaseSync(path, { readOnly: true });
  const rows = db
    .prepare('SELECT sura, aya, translation, footnotes FROM translations ORDER BY sura, aya')
    .all() as unknown as UpstreamRow[];
  db.close();
  return rows;
}

/**
 * Build `{id}-v{n}.db` from the upstream rows.
 *
 * ⚠️ THE TEXT IS COPIED VERBATIM. The grant permits republication WITHOUT modification, so this
 * re-containers the rows and changes not one character of them. The footnote column is carried
 * too: it is part of the edition, and dropping it would be a modification by subtraction.
 */
function buildPack(spec: PackSpec, rows: UpstreamRow[]): string {
  const outPath = resolve(BUILD_DIR, `${spec.id}-v${spec.packVersion}.db`);
  rmSync(outPath, { force: true });

  const db = new DatabaseSync(outPath);
  // ⚠️ NEVER WAL FOR A DISTRIBUTED FILE. A WAL database is not one file, and a reader opening it
  // has to be able to create `-wal`/`-shm` beside it. `DELETE` keeps the pack a single artifact.
  db.exec('PRAGMA journal_mode = DELETE');
  // Zero freed page space, the determinism pragma `prepare-data.ts:127-132` records: without it
  // stale bytes sit in the free list and the same inputs produce a different digest.
  db.exec('PRAGMA secure_delete = FAST');
  db.exec(`
    CREATE TABLE pack_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE entries (
      surah_number INTEGER NOT NULL,
      verse_number INTEGER NOT NULL,
      text TEXT NOT NULL,
      footnotes TEXT,
      PRIMARY KEY (surah_number, verse_number)
    );
  `);

  const insertMeta = db.prepare('INSERT INTO pack_meta (key, value) VALUES (?, ?)');
  const insertEntry = db.prepare(
    'INSERT INTO entries (surah_number, verse_number, text, footnotes) VALUES (?, ?, ?, ?)'
  );

  db.exec('BEGIN TRANSACTION');
  for (const [key, value] of [
    ['id', spec.id],
    ['packVersion', String(spec.packVersion)],
    ['type', spec.type],
    ['language', spec.language],
    // ⚠️ THE LANGUAGE'S OWN NAME, NOT JUST ITS CODE. Offline the catalogue is unreachable and a
    // pack describes itself from `pack_meta`; without this the shelf falls back to rendering the
    // BCP-47 code at a reader ("fr · 1.4 MB"), which is a machine value in a sentence of copy.
    // Measured on the emulator, 2026-09-18.
    ['languageName', spec.languageName],
    ['title', spec.title],
    ['source', 'QuranEnc'],
    ['sourceVersion', spec.upstream.version],
    ['licenceId', spec.licenceId],
    ['attribution', resolveAttribution(spec)],
  ]) {
    insertMeta.run(key, value);
  }
  // Ordered inserts — the rows arrive ordered and are written in that order, so the file's
  // physical layout is a function of the data rather than of insertion whim.
  for (const row of rows) {
    insertEntry.run(row.sura, row.aya, row.translation, row.footnotes ?? null);
  }
  db.exec('COMMIT');
  // Compacts the file and rewrites its pages in key order. Deterministic, and it is what keeps a
  // rebuilt pack byte-comparable to the one that shipped.
  db.exec('VACUUM');
  db.close();

  return outPath;
}

/** The pack's own row count, read back from the built file — never from the input array. */
function countPackRows(path: string): number {
  const db = new DatabaseSync(path, { readOnly: true });
  const row = db.prepare('SELECT COUNT(*) AS count FROM entries').get() as unknown as {
    count: number;
  };
  db.close();
  return row.count;
}

const sha256OfFile = (path: string): string =>
  createHash('sha256').update(readFileSync(path)).digest('hex');

// ─── Phase 3: upload ─────────────────────────────────────────────────────────

/** Run a child process, draining stdout/stderr as they arrive (see `prepare-fonts.ts`). */
async function run(argv: string[]): Promise<{ exitCode: number; stderr: string }> {
  const [command, ...args] = argv;
  const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  const stderrChunks: Buffer[] = [];
  child.stdout.on('data', () => {});
  child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));
  const exitCode = await new Promise<number>((resolvePromise, rejectPromise) => {
    child.once('error', rejectPromise);
    child.once('close', (code, signal) => resolvePromise(code ?? (signal ? 1 : 0)));
  });
  return { exitCode, stderr: Buffer.concat(stderrChunks).toString('utf-8') };
}

/**
 * The SHA-256 of what the CDN actually serves at `key`, or `null` when it is absent/unreachable.
 *
 * ⚠️ THE DIGEST, NOT THE SIZE, AND THE DIFFERENCE IS A FAILURE NO READER CAN RECOVER FROM. The
 * device verifies by digest; a pipeline that verified by CONTENT-LENGTH would publish a
 * same-length corrupt object green and every install would then fail with `digest` — behind a
 * retry button that can never succeed, because retrying re-fetches the same bad bytes. The two
 * ends have to ask the same question. It is also what makes the skip safe: a same-name object
 * whose CONTENT changed without a version bump is caught here rather than shipped.
 * (Story 8-2 review, C7.)
 */
async function remoteDigest(key: string): Promise<string | null> {
  try {
    const response = await fetch(`${CDN_BASE}/${key}`, {
      // Bust any edge cache: this is a verification, and verifying a cached copy of the object we
      // just replaced is the check answering about the wrong bytes.
      headers: { 'cache-control': 'no-cache' },
    });
    if (!response.ok) return null;
    return createHash('sha256')
      .update(Buffer.from(await response.arrayBuffer()))
      .digest('hex');
  } catch {
    return null;
  }
}

async function putObject(key: string, localPath: string, contentType: string): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { exitCode, stderr } = await run([
      'npx',
      'wrangler',
      'r2',
      'object',
      'put',
      `${BUCKET}/${key}`,
      '--file',
      localPath,
      '--content-type',
      contentType,
      '--remote',
    ]);
    if (exitCode === 0) return;
    if (attempt === 3) throw new Error(`Upload failed for ${key}: ${stderr}`);
    await new Promise((r) => setTimeout(r, attempt * 5000));
  }
}

/**
 * Upload one pack, skipping it only when the CDN already serves EXACTLY these bytes.
 *
 * ⚠️ THE SKIP IS KEYED ON THE DIGEST, NOT ON THE SIZE. A pack's name carries its version, so in
 * the ordinary case the same key holds the same build and the skip is about a re-run after a
 * partial failure. The case that matters is the other one: an object whose CONTENT changed
 * without a version bump — which this story itself did, re-uploading v1 in place after a defect.
 * A size-equal skip would have left the stale object in front of a new catalogue digest and every
 * install would fail. (Story 8-2 review, C7.)
 */
async function uploadPack(
  entry: CatalogueEntry,
  localPath: string
): Promise<'uploaded' | 'skipped'> {
  const key = `${KEY_PREFIX}/${entry.id}-v${entry.packVersion}.db`;
  if (!force) {
    const served = await remoteDigest(key);
    if (served !== null && served === entry.digest) return 'skipped';
  }
  await putObject(key, localPath, 'application/vnd.sqlite3');
  return 'uploaded';
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('Cloud Quran content-pack pipeline');
  console.log(`  Target: r2://${BUCKET}/${KEY_PREFIX}/ (${PACK_CDN_BASE})`);
  mkdirSync(BUILD_DIR, { recursive: true });
  mkdirSync(PACKS_DIR, { recursive: true });

  console.log('\n=== Phase 1: upstream version pin ===');
  const index = await fetchQuranEncIndex();
  for (const spec of PACKS) {
    assertPinHolds(spec, index);
    console.log(`  ✓ ${spec.id} ← ${spec.upstream.key} v${spec.upstream.version}`);
  }

  console.log('\n=== Phase 2: build ===');
  const built: { entry: CatalogueEntry; path: string }[] = [];
  for (const spec of PACKS) {
    const upstreamPath = await fetchUpstreamDatabase(spec);
    const rows = readUpstreamRows(upstreamPath);
    const packPath = buildPack(spec, rows);
    const packRows = countPackRows(packPath);
    // ⚠️ THE POPULATION CHECK, ON THE BUILD PATH. A digest minted from a truncated pack agrees
    // with itself forever, so the only place truncation can be caught is here.
    assertPackSize(spec, packRows);
    const bytes = statSync(packPath).size;
    const digest = sha256OfFile(packPath);
    built.push({
      path: packPath,
      entry: {
        id: spec.id,
        packVersion: spec.packVersion,
        type: spec.type,
        language: spec.language,
        languageName: spec.languageName,
        title: spec.title,
        source: 'QuranEnc',
        sourceVersion: spec.upstream.version,
        licenceId: spec.licenceId,
        attribution: resolveAttribution(spec),
        url: `${PACK_CDN_BASE}/${spec.id}-v${spec.packVersion}.db`,
        bytes,
        rows: packRows,
        digest,
      },
    });
    console.log(
      `  ✓ ${spec.id}-v${spec.packVersion}.db  ${packRows} rows  ` +
        `${(bytes / 1024 / 1024).toFixed(2)} MB  ${digest.slice(0, 16)}…`
    );
  }

  /**
   * ⚠️ NO BUILD TIMESTAMP. `generated: new Date()` rewrote this committed, gate-checked file on
   * every run, so `git status` could not tell "the catalogue changed" from "somebody ran the
   * script" — and a diff that is always dirty is a diff nobody reads. Every pack line already
   * carries a digest, which identifies the content exactly and changes only when it should.
   * (Story 8-2 review, S8.)
   */
  const catalogue = {
    catalogueVersion: CATALOGUE_VERSION,
    packs: built.map(({ entry }) => entry),
  };
  writeFileSync(CATALOGUE_PATH, `${JSON.stringify(catalogue, null, 2)}\n`, 'utf-8');
  console.log(`  ✓ catalogue written to ${CATALOGUE_PATH}`);

  if (skipUpload) {
    console.log('\n⏭️  Skipping Phase 3 (upload) — nothing left this machine');
    return;
  }

  console.log('\n=== Phase 3: upload to R2 ===');
  for (const { entry, path } of built) {
    const result = await uploadPack(entry, path);
    console.log(`  ${result === 'uploaded' ? '↑' : '·'} ${entry.id}-v${entry.packVersion}.db`);
  }
  // ⚠️ THE CATALOGUE IS ALWAYS RE-UPLOADED. It is the one object whose CONTENT changes under a
  // stable key, so a size-equal HEAD check would happily leave a stale index in front of a new
  // pack — the exact failure the per-pack check is safe from because a pack key is versioned.
  await putObject(`${KEY_PREFIX}/index.json`, CATALOGUE_PATH, 'application/json');
  console.log('  ↑ index.json');

  // The corners that matter: the catalogue resolves, and every pack it offers is actually served
  // at the size it claims. A catalogue pointing at a 404 is the one failure that would reach a
  // reader as "install failed" with nothing to retry.
  for (const { entry } of built) {
    const served = await remoteDigest(`${KEY_PREFIX}/${entry.id}-v${entry.packVersion}.db`);
    if (served !== entry.digest) {
      console.error(
        `❌ CDN check failed for ${entry.id}: served ${served ?? 'nothing'}, catalogue says ` +
          `${entry.digest}. Every reader's install would fail with an unrecoverable \`digest\`.`
      );
      process.exit(1);
    }
  }
  console.log(`  ✓ CDN serves ${built.length} pack(s) at the catalogue's digest, and the index`);
  console.log('\n✅ Pack pipeline complete');
}

main().catch((err) => {
  console.error('\n❌ Pack pipeline failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
