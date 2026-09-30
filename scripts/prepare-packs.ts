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
 * ⚠️ THE EDITIONS ARE GENERATED, NOT LISTED (story 8-4). Every edition QuranEnc's list API offers
 * becomes a pack; the committed decision is the per-edition PIN in `LICENCES.md`, and an edition
 * with no pin, or whose live version is not its pin, stops the build. See `scripts/quranenc.ts`.
 *
 * ⚠️ `packVersion` IS DERIVED FROM THE BYTES, NOT TYPED. A pack is first built at the version the
 * committed catalogue already publishes; if the result is not byte-identical to what that version
 * shipped, it is rebuilt at the next version. So a corrected upstream edition, a new `pack_meta`
 * field, or anything else that moves the digest becomes a NEW FILE NAME on its own — the one thing
 * the atomic-update design above needs — and nothing can overwrite a published object in place.
 *
 * Usage:
 *   node scripts/prepare-packs.ts --skip-upload           # build + catalogue only, nothing leaves the box
 *   node scripts/prepare-packs.ts                         # + idempotent upload to R2 (a second run skips)
 *   node scripts/prepare-packs.ts --force                 # re-upload everything, ignoring the digest check
 *   node scripts/prepare-packs.ts --pack french_rashid    # rebuild ONE edition (key or pack id)
 *   node scripts/prepare-packs.ts --language ur           # rebuild one language's editions
 *
 * With a filter, every other edition is carried forward from the committed catalogue unchanged —
 * rebuilding 75 packs to fix one is the cost the filter exists to avoid.
 */

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { TOTAL_VERSES } from '../packages/quran-data/src/constants.ts';
import {
  assertPinned,
  attributionOf,
  fetchQuranEncEditions,
  fetchUpstreamDatabase,
  languageNameOf,
  ledgerPins,
  packIdOf,
  type QuranEncEdition,
  readUpstreamRows,
  type UpstreamRow,
} from './quranenc.ts';

const ROOT = resolve(import.meta.dirname, '..');
const PACKS_DIR = resolve(ROOT, 'packages/quran-data/data/packs');
const CATALOGUE_PATH = resolve(PACKS_DIR, 'index.json');
const LEDGER_PATH = resolve(PACKS_DIR, 'LICENCES.md');
/** The ledger entry every QuranEnc pack's rights, and its per-edition pin, come from. */
const QURANENC_LICENCE_ID = 'quranenc-republication';
/** Written into `pack_meta` and the catalogue — the grant's "credit QuranEnc", as data. */
const QURANENC_SOURCE = 'QuranEnc';
/** Where built `.db` files land. Gitignored — a pack is never committed. */
const BUILD_DIR = resolve(ROOT, 'build/packs');

const BUCKET = 'gp-cdn';
const KEY_PREFIX = 'packs';
const CDN_BASE = 'https://cdn.nobleachievements.com';
/** The one place the app and this script agree on where a pack is served from. */
const PACK_CDN_BASE = `${CDN_BASE}/${KEY_PREFIX}`;

/** Bumped only by a breaking change to the catalogue SHAPE. The app refuses any other value. */
const CATALOGUE_VERSION = 1;

const skipUpload = process.argv.includes('--skip-upload');
const force = process.argv.includes('--force');

/** `--name=value` or `--name value`, the `prepare-audio.ts --reciter` parsing. */
function flag(name: string): string | null {
  const inline = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 ? (process.argv[at + 1] ?? null) : null;
}
const packFilter = flag('pack');
const languageFilter = flag('language');

/** One edition to build, generated from the list API. See the header. */
interface PackSpec {
  /** Stable pack id. Also the file-name stem, with `-v{n}` appended. */
  id: string;
  type: 'translation';
  /** The edition's language code, as QuranEnc gives it. */
  language: string;
  /** The language's own name, for a reader who does not read the interface language. */
  languageName: string;
  /** The same language's English name — a search alias on the device, never a heading. */
  languageNameEnglish: string;
  /** Content direction, from the list API. The app renders from this, never from a list. */
  direction: 'ltr' | 'rtl';
  /** The publisher's own title, in the edition's language when QuranEnc localizes into it. */
  title: string;
  /** The ledger entry in `LICENCES.md` this pack's rights come from. */
  licenceId: string;
  /** How many rows the finished pack must hold. See `assertPackSize`. */
  expectedRows: number;
  upstream: {
    /** QuranEnc's own key for the edition. */
    key: string;
    /** The pinned upstream version — equal to the live one, or the build has already stopped. */
    version: string;
  };
}

/**
 * Specs for the editions this run builds, from the live list.
 *
 * ⚠️ THE TITLE IS QURANENC'S OWN, IN THE EDITION'S LANGUAGE WHERE QURANENC HAS ONE. The English
 * list says "Urdu Translation - …"; asked with `localization=ur` it answers "اردو ترجمہ - …", which
 * is what an Urdu reader expects to find and is still the publisher's text rather than ours. A
 * language QuranEnc does not localize into answers the English title, which is fine for the same
 * reason.
 */
async function generateSpecs(
  editions: QuranEncEdition[],
  pins: ReadonlyMap<string, string>
): Promise<PackSpec[]> {
  const titles = new Map<string, string>();
  for (const language of [...new Set(editions.map((e) => e.language_iso_code))]) {
    for (const localized of await fetchQuranEncEditions(language)) {
      if (localized.language_iso_code === language) titles.set(localized.key, localized.title);
    }
  }
  const specs = editions.map((edition): PackSpec => {
    assertPinned(edition, pins, QURANENC_LICENCE_ID);
    const names = languageNameOf(edition.language_iso_code);
    return {
      id: packIdOf(edition),
      type: 'translation',
      language: edition.language_iso_code,
      languageName: names.native,
      languageNameEnglish: names.english,
      direction: edition.direction,
      title: titles.get(edition.key) ?? edition.title,
      licenceId: QURANENC_LICENCE_ID,
      // A complete translation is one row per ayah. ⚠️ NOT a constant of the pipeline — see
      // `assertPackSize`; tafsir and asbab editions are next and are legitimately shorter.
      expectedRows: TOTAL_VERSES,
      upstream: { key: edition.key, version: edition.version },
    };
  });
  const ids = new Set<string>();
  for (const spec of specs) {
    if (ids.has(spec.id)) throw new Error(`Two editions derive the same pack id "${spec.id}"`);
    ids.add(spec.id);
  }
  return specs;
}

/** What one catalogue line says. The app's `features/packs/lib/catalogue.ts` validates this shape. */
interface CatalogueEntry {
  id: string;
  packVersion: number;
  type: string;
  language: string;
  languageName: string;
  languageNameEnglish: string;
  direction: 'ltr' | 'rtl';
  title: string;
  source: string;
  /** The upstream edition key — what the ledger's per-edition pin is keyed by. */
  sourceKey: string;
  sourceVersion: string;
  licenceId: string;
  attribution: string;
  url: string;
  bytes: number;
  rows: number;
  digest: string;
}

/**
 * The attribution as it ships, built from the pinned version. The single source.
 *
 * ⚠️ BUILT, NEVER HAND-WRITTEN (story 8-2 review, C6). A hand-written "(v1.0.3)" is a second copy
 * of a fact the pin already owns, and a bump that moved one and not the other would publish text
 * CLAIMING a version it is not.
 */
function resolveAttribution(spec: PackSpec): string {
  return attributionOf(spec.title, spec.upstream.version);
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

// ─── Phase 2: build the pack ─────────────────────────────────────────────────

/**
 * Build `{id}-v{n}.db` from the upstream rows.
 *
 * ⚠️ THE TEXT IS COPIED VERBATIM. The grant permits republication WITHOUT modification, so this
 * re-containers the rows and changes not one character of them. The footnote column is carried
 * too: it is part of the edition, and dropping it would be a modification by subtraction.
 */
function buildPack(spec: PackSpec, packVersion: number, rows: UpstreamRow[]): string {
  const outPath = resolve(BUILD_DIR, `${spec.id}-v${packVersion}.db`);
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
    ['packVersion', String(packVersion)],
    ['type', spec.type],
    ['language', spec.language],
    // ⚠️ THE DIRECTION TRAVELS WITH THE BYTES (story 8-4). Offline the catalogue is unreachable
    // and an installed pack describes itself from here — without it an Urdu pack read on a plane
    // would fall back to `ltr` and range every paragraph the wrong way.
    ['direction', spec.direction],
    // ⚠️ THE LANGUAGE'S OWN NAME, NOT JUST ITS CODE. Offline the catalogue is unreachable and a
    // pack describes itself from `pack_meta`; without this the shelf falls back to rendering the
    // BCP-47 code at a reader ("fr · 1.4 MB"), which is a machine value in a sentence of copy.
    // Measured on the emulator, 2026-09-18.
    ['languageName', spec.languageName],
    ['languageNameEnglish', spec.languageNameEnglish],
    ['title', spec.title],
    ['source', QURANENC_SOURCE],
    ['sourceKey', spec.upstream.key],
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
  // ⚠️ AN EXISTING KEY IS NEVER OVERWRITTEN WITH DIFFERENT BYTES. `packVersion` is derived from the
  // digest (see the header), so the only way a served object can disagree with the catalogue at
  // the same key is a failed or partial earlier upload — which is exactly what the re-put repairs.
  if (!force) {
    const served = await remoteDigest(key);
    if (served !== null && served === entry.digest) return 'skipped';
  }
  await putObject(key, localPath, 'application/vnd.sqlite3');
  return 'uploaded';
}

// ─── main ────────────────────────────────────────────────────────────────────

/** The committed catalogue, by id — what each pack's `packVersion` is derived from. */
function readPreviousCatalogue(): Map<string, CatalogueEntry> {
  if (!existsSync(CATALOGUE_PATH)) return new Map();
  const body = JSON.parse(readFileSync(CATALOGUE_PATH, 'utf-8')) as { packs?: CatalogueEntry[] };
  return new Map((body.packs ?? []).map((entry) => [entry.id, entry]));
}

/** Whether `--pack` / `--language` select this edition. No filter selects everything. */
function selected(spec: PackSpec): boolean {
  if (packFilter !== null && packFilter !== spec.id && packFilter !== spec.upstream.key) {
    return false;
  }
  if (languageFilter !== null && languageFilter !== spec.language) return false;
  return true;
}

/**
 * Build one edition and decide its `packVersion` — see the header.
 *
 * Built first at the version the committed catalogue publishes. Identical bytes keep that version
 * (the upload then skips); different bytes are rebuilt one version up, so a changed pack is always
 * a new file name.
 */
function buildEdition(
  spec: PackSpec,
  rows: UpstreamRow[],
  previous: CatalogueEntry | undefined
): { entry: CatalogueEntry; path: string } {
  let packVersion = previous?.packVersion ?? 1;
  let path = buildPack(spec, packVersion, rows);
  if (previous && sha256OfFile(path) !== previous.digest) {
    rmSync(path, { force: true });
    packVersion += 1;
    path = buildPack(spec, packVersion, rows);
  }
  const packRows = countPackRows(path);
  // ⚠️ THE POPULATION CHECK, ON THE BUILD PATH. A digest minted from a truncated pack agrees with
  // itself forever, so the only place truncation can be caught is here.
  assertPackSize(spec, packRows);
  return {
    path,
    entry: {
      id: spec.id,
      packVersion,
      type: spec.type,
      language: spec.language,
      languageName: spec.languageName,
      languageNameEnglish: spec.languageNameEnglish,
      direction: spec.direction,
      title: spec.title,
      source: QURANENC_SOURCE,
      sourceKey: spec.upstream.key,
      sourceVersion: spec.upstream.version,
      licenceId: spec.licenceId,
      attribution: resolveAttribution(spec),
      url: `${PACK_CDN_BASE}/${spec.id}-v${packVersion}.db`,
      bytes: statSync(path).size,
      rows: packRows,
      digest: sha256OfFile(path),
    },
  };
}

async function main(): Promise<void> {
  console.log('Cloud Quran content-pack pipeline');
  console.log(`  Target: r2://${BUCKET}/${KEY_PREFIX}/ (${PACK_CDN_BASE})`);
  if (packFilter !== null) console.log(`  Filter: --pack ${packFilter}`);
  if (languageFilter !== null) console.log(`  Filter: --language ${languageFilter}`);
  mkdirSync(BUILD_DIR, { recursive: true });
  mkdirSync(PACKS_DIR, { recursive: true });

  console.log('\n=== Phase 1: editions and their per-edition pins ===');
  const pins = ledgerPins(readFileSync(LEDGER_PATH, 'utf-8'), QURANENC_LICENCE_ID);
  const editions = await fetchQuranEncEditions();
  // Every edition is checked against its pin even when a filter narrows the BUILD: a catalogue
  // written by this run must not carry forward an edition whose upstream has moved under it.
  const specs = await generateSpecs(editions, pins);
  const targets = specs.filter(selected);
  if (targets.length === 0) {
    throw new Error(
      `No edition matches --pack ${packFilter ?? '*'} --language ${languageFilter ?? '*'}`
    );
  }
  for (const spec of targets) {
    console.log(
      `  ✓ ${spec.id} ← ${spec.upstream.key} v${spec.upstream.version} (${spec.direction})`
    );
  }
  const stale = [...pins.keys()].filter((key) => !editions.some((e) => e.key === key));
  if (stale.length > 0) {
    // Not fatal: QuranEnc withdrawing an edition is not a reason to stop publishing the others.
    // It IS a reason for a human to look, and for the ledger to stop pinning it.
    console.warn(`  ⚠️  pinned in LICENCES.md but no longer offered upstream: ${stale.join(', ')}`);
  }

  console.log('\n=== Phase 2: build ===');
  const previous = readPreviousCatalogue();
  const built: { entry: CatalogueEntry; path: string }[] = [];
  for (const spec of targets) {
    const upstreamPath = resolve(BUILD_DIR, `upstream-${spec.upstream.key}.sqlite`);
    await fetchUpstreamDatabase(spec.upstream.key, upstreamPath);
    const result = buildEdition(spec, readUpstreamRows(upstreamPath), previous.get(spec.id));
    built.push(result);
    const { entry } = result;
    const bumped =
      previous.has(entry.id) && previous.get(entry.id)?.packVersion !== entry.packVersion;
    console.log(
      `  ✓ ${entry.id}-v${entry.packVersion}.db  ${entry.rows} rows  ` +
        `${(entry.bytes / 1024 / 1024).toFixed(2)} MB  ${entry.digest.slice(0, 16)}…` +
        (bumped ? '  (new version: the bytes changed)' : '')
    );
  }

  /**
   * ⚠️ NO BUILD TIMESTAMP. `generated: new Date()` rewrote this committed, gate-checked file on
   * every run, so `git status` could not tell "the catalogue changed" from "somebody ran the
   * script" — and a diff that is always dirty is a diff nobody reads. Every pack line already
   * carries a digest, which identifies the content exactly and changes only when it should.
   * (Story 8-2 review, S8.)
   *
   * ⚠️ A FILTERED RUN CARRIES EVERY OTHER EDITION FORWARD, and only editions the live list still
   * offers: the catalogue is always the whole shelf, never the slice this run happened to build.
   */
  const rebuilt = new Map(built.map(({ entry }) => [entry.id, entry]));
  const packs = specs
    .map((spec) => rebuilt.get(spec.id) ?? previous.get(spec.id))
    .filter((entry): entry is CatalogueEntry => entry !== undefined)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const catalogue = { catalogueVersion: CATALOGUE_VERSION, packs };
  writeFileSync(CATALOGUE_PATH, `${JSON.stringify(catalogue, null, 2)}\n`, 'utf-8');
  console.log(`  ✓ catalogue written to ${CATALOGUE_PATH} (${packs.length} packs)`);

  if (skipUpload) {
    console.log('\n⏭️  Skipping Phase 3 (upload) — nothing left this machine');
    return;
  }

  /**
   * ── COST, WRITTEN DOWN BEFORE IT RUNS (AGENTS.md § Cost safety) ─────────────────────────────
   *
   * A full run is 75 pack objects + 1 catalogue = 76 R2 Class A writes at most (a re-run skips
   * every pack whose served digest already matches, so it is 1 write), and 76 + 75 GETs of our
   * own CDN for the digest checks, which R2 does not bill as egress. Upstream: 75 SQLite GETs +
   * 57 list GETs to QuranEnc, not billed to us. Stored: 75 packs × ~1–3 MB ≈ 0.15 GB ≈ $0.002/month.
   * Together with the 13 narration voices (`prepare-audio.ts`) the story's ceiling is ~1,600
   * Class A writes — inside R2's free 1M/month — and ~15 GB stored ≈ $0.23/month. It runs only
   * when a human types it; nothing here loops or polls.
   *
   * The upload stays on `wrangler r2 object put`; moving to the `cf` CLI is its own change
   * (`_bmad-output/implementation-artifacts/deferred-work.md`).
   */
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
  // at the digest it claims. A catalogue pointing at a 404 is the one failure that would reach a
  // reader as "install failed" with nothing to retry. EVERY pack, not only the rebuilt ones: a
  // carried-forward entry is as much a promise as a fresh one.
  for (const entry of packs) {
    const served = await remoteDigest(`${KEY_PREFIX}/${entry.id}-v${entry.packVersion}.db`);
    if (served !== entry.digest) {
      console.error(
        `❌ CDN check failed for ${entry.id}: served ${served ?? 'nothing'}, catalogue says ` +
          `${entry.digest}. Every reader's install would fail with an unrecoverable \`digest\`.`
      );
      process.exit(1);
    }
  }
  console.log(`  ✓ CDN serves ${packs.length} pack(s) at the catalogue's digest, and the index`);
  console.log('\n✅ Pack pipeline complete');
}

main().catch((err) => {
  console.error('\n❌ Pack pipeline failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
