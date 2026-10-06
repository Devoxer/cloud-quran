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
 * ⚠️ FOUR PACK TYPES, TWO SHAPES, ONE CATALOGUE (story 8-5). A `translation` pack is one row per
 * ayah, from QuranEnc. A `tafsir`, `irab` or `meanings` pack is one row per PASSAGE — a text
 * written once over several ayat — with the passage's last ayah in `last_verse`, from QUL
 * (`scripts/qul.ts`, every resource it lists as tafsir) and from QuranEnc's browse pages
 * (`scripts/quranenc-saadi.ts`, As-Saadi in Swahili). Both shapes keep the table name `entries`,
 * so the device's row-count check is the same query for every pack. The file itself is written by
 * `scripts/pack-writer.ts`; the translation build is byte-for-byte what story 8-4 published.
 *
 * Usage:
 *   node scripts/prepare-packs.ts --skip-upload           # build + catalogue only, nothing leaves the box
 *   node scripts/prepare-packs.ts                         # + idempotent upload to R2 (a second run skips)
 *   node scripts/prepare-packs.ts --force                 # re-upload everything, ignoring the digest check
 *   node scripts/prepare-packs.ts --pack french_rashid    # rebuild ONE edition (key or pack id)
 *   node scripts/prepare-packs.ts --language ur           # rebuild one language's editions
 *   node scripts/prepare-packs.ts --type tafsir,irab      # some pack types (translation, tafsir, irab, meanings)
 *   node scripts/prepare-packs.ts --refresh-qul           # re-read QUL's listing, not the cached meta.json
 *
 * With a filter, every other edition is carried forward from the committed catalogue unchanged —
 * rebuilding 75 packs to fix one is the cost the filter exists to avoid. `--type tafsir` never
 * touches QuranEnc's translation list at all: the translations are carried forward as committed.
 */

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TOTAL_VERSES } from '../packages/quran-data/src/constants.ts';
import {
  assertDirection,
  assertNoMarkup,
  countPackRows,
  type PackInput,
  sha256OfFile,
  writePack,
} from './pack-writer.ts';
import {
  countSourcePassages,
  directionOf,
  ensureQulDatabase,
  loadQulListing,
  QUL_TAFSIRS,
  type QulWork,
  qulAttributionOf,
  qulKeyOf,
  qulPackIdOf,
  qulRawTextLength,
  qulTypeOf,
  readQulPassages,
} from './qul.ts';
import {
  assertPinned,
  attributionOf,
  fetchQuranEncEditions,
  fetchUpstreamDatabase,
  fetchUpstreamRowsViaApi,
  isMissingDownload,
  languageNameOf,
  ledgerPins,
  packIdOf,
  type QuranEncEdition,
  readUpstreamRows,
} from './quranenc.ts';
import {
  countSwahiliSaadiPassages,
  mirrorSwahiliSaadi,
  readSwahiliSaadiPassages,
  SWAHILI_SAADI_KEY,
} from './quranenc-saadi.ts';

const ROOT = resolve(import.meta.dirname, '..');
const PACKS_DIR = resolve(ROOT, 'packages/quran-data/data/packs');
const CATALOGUE_PATH = resolve(PACKS_DIR, 'index.json');
const LEDGER_PATH = resolve(PACKS_DIR, 'LICENCES.md');
/** The ledger entry every QuranEnc pack's rights, and its per-edition pin, come from. */
const QURANENC_LICENCE_ID = 'quranenc-republication';
/** Written into `pack_meta` and the catalogue — the grant's "credit QuranEnc", as data. */
const QURANENC_SOURCE = 'QuranEnc';
/** The ledger entry for every QUL resource, with one pin per resource (`qul_{id}`). */
const QUL_LICENCE_ID = 'qul-tafsir';
const QUL_SOURCE = 'QUL';
/** The ledger entry for As-Saadi mirrored from QuranEnc's browse pages. */
const QURANENC_SAADI_LICENCE_ID = 'quranenc-saadi';
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
/** Re-read QUL's listing rather than trusting the cached `meta.json`. */
const refreshQul = process.argv.includes('--refresh-qul');

/** `--name=value` or `--name value`, the `prepare-audio.ts --reciter` parsing. */
function flag(name: string): string | null {
  const inline = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 ? (process.argv[at + 1] ?? null) : null;
}
const packFilter = flag('pack');
const languageFilter = flag('language');
/**
 * Every pack type the catalogue carries. `irab` and `meanings` are QUL works the owner moved off
 * the tafsir row on 2026-10-05 (`scripts/qul.ts` § `QUL_TAFSIRS`).
 */
const PACK_TYPES = ['translation', 'tafsir', 'irab', 'meanings'] as const;
type PackType = (typeof PACK_TYPES)[number];
const typeFilter = flag('type');
/** `--type tafsir` or `--type tafsir,irab,meanings`. The pack types this run regenerates. */
const runTypes: readonly PackType[] =
  typeFilter === null
    ? PACK_TYPES
    : typeFilter.split(',').map((type) => {
        if (!(PACK_TYPES as readonly string[]).includes(type)) {
          throw new Error(`--type takes ${PACK_TYPES.join(', ')} (comma-separated), not "${type}"`);
        }
        return type as PackType;
      });

/** One edition to build, resolved from its upstream. See the header. */
interface PackSpec {
  /** Stable pack id. Also the file-name stem, with `-v{n}` appended. */
  id: string;
  type: PackType;
  /** The content's ISO 639 language code (QuranEnc's own code for a translation). */
  language: string;
  /** The language's own name, for a reader who does not read the interface language. */
  languageName: string;
  /** The same language's English name — a search alias on the device, never a heading. */
  languageNameEnglish: string;
  /** Content direction: QuranEnc's list API, or the QUL language table. Checked against the text. */
  direction: 'ltr' | 'rtl';
  /** The publisher's title (QuranEnc's, localized where it can be) or the committed QUL title. */
  title: string;
  /** The ledger entry in `LICENCES.md` this pack's rights come from. */
  licenceId: string;
  /** Who the text came from, as `pack_meta.source` and the catalogue state it. */
  source: string;
  /** The credit line, BUILT from the pinned version, never typed (story 8-2 review, C6). */
  attribution: string;
  upstream: {
    /** The upstream's own key for the edition (`qul_{id}` for QUL). What the ledger pins. */
    key: string;
    /** The pinned upstream version — equal to the live one, or the build has already stopped. */
    version: string;
  };
  /** Read (and, for a translation, download) the rows. */
  load: () => Promise<PackInput>;
  /**
   * How many rows the finished pack must hold, counted INDEPENDENTLY of `load` — see
   * `assertPackSize`.
   */
  expectedRows: (input: PackInput) => number;
}

/**
 * An edition this run COULD build, known by id before anything is prepared.
 *
 * ⚠️ `resolve` IS WHERE THE WORK IS, AND ONLY SELECTED CANDIDATES REACH IT (story 8-5 review).
 * Resolving a QUL work unzips and measures every export of it; resolving Swahili As-Saadi mirrors
 * 114 pages. `--pack tafsir-ar-tabari` must not do either for the 104 packs it did not ask for.
 */
interface Candidate {
  id: string;
  type: PackType;
  language: string;
  /** Every upstream key the candidate answers to under `--pack`. */
  keys: string[];
  resolve: () => Promise<PackSpec>;
}

/**
 * Candidates for the editions QuranEnc's list offers.
 *
 * ⚠️ THE TITLE IS QURANENC'S OWN, IN THE EDITION'S LANGUAGE WHERE QURANENC HAS ONE. The English
 * list says "Urdu Translation - …"; asked with `localization=ur` it answers "اردو ترجمہ - …", which
 * is what an Urdu reader expects to find and is still the publisher's text rather than ours. A
 * language QuranEnc does not localize into answers the English title, which is fine for the same
 * reason.
 */
async function translationCandidates(
  editions: QuranEncEdition[],
  pins: ReadonlyMap<string, string>
): Promise<Candidate[]> {
  const titles = new Map<string, string>();
  for (const language of [...new Set(editions.map((e) => e.language_iso_code))]) {
    for (const localized of await fetchQuranEncEditions(language)) {
      if (localized.language_iso_code === language) titles.set(localized.key, localized.title);
    }
  }
  return editions.map((edition): Candidate => {
    // Every edition is checked against its pin even when a filter narrows the BUILD: a catalogue
    // written by this run must not carry forward an edition whose upstream has moved under it.
    assertPinned(edition, pins, QURANENC_LICENCE_ID);
    const names = languageNameOf(edition.language_iso_code);
    const title = titles.get(edition.key) ?? edition.title;
    const spec: PackSpec = {
      id: packIdOf(edition),
      type: 'translation',
      language: edition.language_iso_code,
      languageName: names.native,
      languageNameEnglish: names.english,
      direction: edition.direction,
      title,
      licenceId: QURANENC_LICENCE_ID,
      source: QURANENC_SOURCE,
      attribution: attributionOf(title, edition.version),
      upstream: { key: edition.key, version: edition.version },
      load: async () => {
        const upstreamPath = resolve(BUILD_DIR, `upstream-${edition.key}.sqlite`);
        try {
          await fetchUpstreamDatabase(edition.key, upstreamPath);
        } catch (error) {
          // An edition QuranEnc publishes without a SQLite build (`oromo_rwwad`) is read from its
          // sura API instead — the same fields, verbatim. Any other failure stops the build.
          if (!isMissingDownload(error)) throw error;
          console.log(`    ${edition.key}: no SQLite build upstream; reading the sura API`);
          return { shape: 'ayah', rows: await fetchUpstreamRowsViaApi(edition.key) };
        }
        return { shape: 'ayah', rows: readUpstreamRows(upstreamPath) };
      },
      // A complete translation is one row per ayah — the Quran's own dimension.
      expectedRows: () => TOTAL_VERSES,
    };
    return {
      id: spec.id,
      type: 'translation',
      language: spec.language,
      keys: [edition.key],
      resolve: async () => spec,
    };
  });
}

/**
 * Candidates for every QUL work in `QUL_TAFSIRS` (tafsir, i'rab, meanings), and As-Saadi in
 * Swahili.
 *
 * ⚠️ ONE PACK PER (type, language, work). QUL lists As-Saadi in Arabic three times (once under
 * another work's title) and in Russian twice; the resource with the most upstream text — over its
 * rows deduplicated by ayah — is the one built, the spec's rule. A resource QUL lists that the
 * table does not name stops the build — a new source is a decision, not a default.
 */
async function passageCandidates(
  qulPins: ReadonlyMap<string, string>,
  saadiPins: ReadonlyMap<string, string>
): Promise<Candidate[]> {
  const listing = await loadQulListing({ refresh: refreshQul });
  const unknown = [...listing.keys()].filter((id) => QUL_TAFSIRS[id] === undefined);
  if (unknown.length > 0) {
    throw new Error(
      `QUL lists tafsir resource(s) ${unknown.join(', ')} that scripts/qul.ts QUL_TAFSIRS does ` +
        'not name. Add each one (or a `skip` with its reason) — a new source is a decision.'
    );
  }
  const withdrawn = Object.keys(QUL_TAFSIRS)
    .map(Number)
    .filter((id) => !listing.has(id));
  if (withdrawn.length > 0) console.warn(`  ⚠️  no longer listed by QUL: ${withdrawn.join(', ')}`);

  const works = new Map<string, number[]>();
  for (const qulId of [...listing.keys()].sort((a, b) => a - b)) {
    const work = QUL_TAFSIRS[qulId];
    if (work === undefined || 'skip' in work) {
      console.log(`  · qul ${qulId} not published: ${work && 'skip' in work ? work.skip : ''}`);
      continue;
    }
    const id = qulPackIdOf(work);
    works.set(id, [...(works.get(id) ?? []), qulId]);
  }

  const candidates: Candidate[] = [];
  for (const [id, members] of works) {
    const work = QUL_TAFSIRS[members[0]] as QulWork;
    candidates.push({
      id,
      type: qulTypeOf(work),
      language: work.language,
      keys: members.map(qulKeyOf),
      resolve: async () => {
        let chosen: { qulId: number; path: string; version: string; size: number } | null = null;
        for (const qulId of members) {
          const { path, version } = await ensureQulDatabase(qulId, listing.get(qulId));
          const size = qulRawTextLength(path);
          // The larger text wins; on a tie (250 and 308 are the same bytes) the later resource.
          if (chosen === null || size >= chosen.size) {
            if (chosen)
              console.log(`  · qul ${chosen.qulId} is a smaller copy of ${id}; not published`);
            chosen = { qulId, path, version, size };
          } else {
            console.log(`  · qul ${qulId} is a smaller copy of ${id}; not published`);
          }
        }
        if (chosen === null) throw new Error(`${id}: no QUL resource to build from`);
        const { qulId, path, version } = chosen;
        const key = qulKeyOf(qulId);
        assertPinned({ key, version }, qulPins, QUL_LICENCE_ID);
        const names = languageNameOf(work.language);
        return {
          id,
          type: qulTypeOf(work),
          language: work.language,
          languageName: names.native,
          languageNameEnglish: names.english,
          direction: directionOf(work.language),
          title: work.title,
          licenceId: QUL_LICENCE_ID,
          source: QUL_SOURCE,
          attribution: qulAttributionOf(work.title, version),
          upstream: { key, version },
          load: async () => ({ shape: 'passage', rows: readQulPassages(path) }),
          expectedRows: () => countSourcePassages(path),
        };
      },
    });
  }

  candidates.push({
    id: 'tafsir-sw-saadi',
    type: 'tafsir',
    language: 'sw',
    keys: [SWAHILI_SAADI_KEY],
    resolve: async () => {
      const version = await mirrorSwahiliSaadi();
      assertPinned({ key: SWAHILI_SAADI_KEY, version }, saadiPins, QURANENC_SAADI_LICENCE_ID);
      const swahili = languageNameOf('sw');
      const title = 'Tafsir As-Saadi';
      return {
        id: 'tafsir-sw-saadi',
        type: 'tafsir',
        language: 'sw',
        languageName: swahili.native,
        languageNameEnglish: swahili.english,
        direction: 'ltr',
        title,
        licenceId: QURANENC_SAADI_LICENCE_ID,
        source: QURANENC_SOURCE,
        attribution: attributionOf(title, version),
        upstream: { key: SWAHILI_SAADI_KEY, version },
        load: async () => ({ shape: 'passage', rows: readSwahiliSaadiPassages() }),
        expectedRows: () => countSwahiliSaadiPassages(),
      };
    },
  });
  return candidates.filter((candidate) => runTypes.includes(candidate.type));
}

/** Refuse two candidates that derive one pack id — they would install into the same file. */
function assertUniqueIds(candidates: readonly Candidate[]): void {
  const ids = new Set<string>();
  for (const candidate of candidates) {
    if (ids.has(candidate.id)) {
      throw new Error(`Two editions derive the same pack id "${candidate.id}"`);
    }
    ids.add(candidate.id);
  }
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
 * ⚠️ THE EXPECTED ROW COUNT COMES FROM THE PACK, NOT FROM THE QURAN'S DIMENSION. The first cut
 * threw unless a pack held exactly 6,236 rows, which is right for a complete translation and
 * wrong for every other pack type architecture §17 names — a tafsir dedupes into blocks, an asbab
 * set covers a few hundred ayat, and a partial edition is a legitimate thing to ship. The check
 * that matters is "is this pack the size its SPEC says", which is still a refusal of truncation
 * and is the number the catalogue then publishes for the device to re-check.
 * (Story 8-2 review, C8.)
 */
function assertPackSize(spec: PackSpec, rows: number, expectedRows: number): void {
  if (rows !== expectedRows) {
    throw new Error(
      `${spec.id}: built ${rows} rows, the spec says ${expectedRows}. Refusing to publish — ` +
        'a digest cannot see truncation, so this is the only place it can be caught.'
    );
  }
}

// ─── Phase 2: build the pack ─────────────────────────────────────────────────

/** Write `{id}-v{n}.db` through the pack writer (`scripts/pack-writer.ts`). */
function buildPack(spec: PackSpec, packVersion: number, input: PackInput): string {
  const outPath = resolve(BUILD_DIR, `${spec.id}-v${packVersion}.db`);
  writePack(
    outPath,
    {
      id: spec.id,
      type: spec.type,
      language: spec.language,
      direction: spec.direction,
      languageName: spec.languageName,
      languageNameEnglish: spec.languageNameEnglish,
      title: spec.title,
      source: spec.source,
      sourceKey: spec.upstream.key,
      sourceVersion: spec.upstream.version,
      licenceId: spec.licenceId,
      attribution: spec.attribution,
    },
    packVersion,
    input
  );
  return outPath;
}

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
      'pnpm',
      'exec',
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
function selected(candidate: Candidate): boolean {
  // `--type` decided which candidates exist at all; this narrows within them.
  if (packFilter !== null && packFilter !== candidate.id && !candidate.keys.includes(packFilter)) {
    return false;
  }
  if (languageFilter !== null && languageFilter !== candidate.language) return false;
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
  input: PackInput,
  previous: CatalogueEntry | undefined
): { entry: CatalogueEntry; path: string } {
  // ⚠️ THE TEXT IS CHECKED BEFORE A BYTE IS WRITTEN: no markup a reader would see printed, and a
  // declared direction its own letters agree with.
  assertNoMarkup(spec.id, input);
  assertDirection(spec.id, spec.direction, input);
  let packVersion = previous?.packVersion ?? 1;
  let path = buildPack(spec, packVersion, input);
  if (previous && sha256OfFile(path) !== previous.digest) {
    rmSync(path, { force: true });
    packVersion += 1;
    path = buildPack(spec, packVersion, input);
  }
  const packRows = countPackRows(path);
  // ⚠️ THE POPULATION CHECK, ON THE BUILD PATH. A digest minted from a truncated pack agrees with
  // itself forever, so the only place truncation can be caught is here.
  assertPackSize(spec, packRows, spec.expectedRows(input));
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
      source: spec.source,
      sourceKey: spec.upstream.key,
      sourceVersion: spec.upstream.version,
      licenceId: spec.licenceId,
      attribution: spec.attribution,
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
  if (typeFilter !== null) console.log(`  Filter: --type ${typeFilter}`);
  mkdirSync(BUILD_DIR, { recursive: true });
  mkdirSync(PACKS_DIR, { recursive: true });

  console.log('\n=== Phase 1: editions and their per-edition pins ===');
  const ledger = readFileSync(LEDGER_PATH, 'utf-8');
  const candidates: Candidate[] = [];
  if (runTypes.includes('translation')) {
    const pins = ledgerPins(ledger, QURANENC_LICENCE_ID);
    const editions = await fetchQuranEncEditions();
    candidates.push(...(await translationCandidates(editions, pins)));
    const stale = [...pins.keys()].filter((key) => !editions.some((e) => e.key === key));
    if (stale.length > 0) {
      // Not fatal: QuranEnc withdrawing an edition is not a reason to stop publishing the others.
      // It IS a reason for a human to look, and for the ledger to stop pinning it.
      console.warn(
        `  ⚠️  pinned in LICENCES.md but no longer offered upstream: ${stale.join(', ')}`
      );
    }
  }
  if (runTypes.some((type) => type !== 'translation')) {
    candidates.push(
      ...(await passageCandidates(
        ledgerPins(ledger, QUL_LICENCE_ID),
        ledgerPins(ledger, QURANENC_SAADI_LICENCE_ID)
      ))
    );
  }
  assertUniqueIds(candidates);
  const targets: PackSpec[] = [];
  for (const candidate of candidates.filter(selected)) targets.push(await candidate.resolve());
  if (targets.length === 0) {
    throw new Error(
      `No edition matches --pack ${packFilter ?? '*'} --language ${languageFilter ?? '*'} ` +
        `--type ${typeFilter ?? '*'}`
    );
  }
  for (const spec of targets) {
    console.log(
      `  ✓ ${spec.id} ← ${spec.upstream.key} v${spec.upstream.version} (${spec.direction})`
    );
  }

  console.log('\n=== Phase 2: build ===');
  const previous = readPreviousCatalogue();
  const built: { entry: CatalogueEntry; path: string }[] = [];
  for (const spec of targets) {
    const result = buildEdition(spec, await spec.load(), previous.get(spec.id));
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
   * A TYPE this run did not generate (`--type tafsir` leaves the translations alone) is carried
   * forward exactly as committed — dropping it because it has no spec here would empty the shelf
   * of every other type (story 8-5).
   */
  const rebuilt = new Map(built.map(({ entry }) => [entry.id, entry]));
  const carried = [...previous.values()].filter(
    (entry) => !(runTypes as readonly string[]).includes(entry.type)
  );
  const packs = [
    ...carried,
    ...candidates
      .map((candidate) => rebuilt.get(candidate.id) ?? previous.get(candidate.id))
      .filter((entry): entry is CatalogueEntry => entry !== undefined),
  ].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
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
   * A full run is 76 translation + 103 passage pack objects + 1 catalogue = 180 R2 Class A writes
   * before retries (each upload has at most 3 attempts: 540 PUT attempts per full run).
   * A re-run skips matching packs: 1 catalogue write, at most 3 attempts. Digest verification
   * makes at most 179 + 179 pack GETs and 1 catalogue GET from our CDN per full run.
   * Upstream: 75 SQLite GETs + 114 Oromo API GETs + 57 list GETs to QuranEnc; the tafsir sources are read from
   * `build/qul-cache/` and `build/quranenc-cache/` and touch the network only for what is not
   * cached (at most ~110 QUL and 114 QuranEnc GETs, throttled) — none of it billed to us. Stored:
   * 76 translations × ~1–3 MB ≈ 0.15 GB, plus 103 tafsirs ≈ 1.25 GB (measured 2026-10-05; the
   * largest, al-Alusi, is 54 MB). It runs only when a human types it; no unattended runs.
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
