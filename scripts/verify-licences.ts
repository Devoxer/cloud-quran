// The licence gate for content packs (story 8-2).
// Run: node scripts/verify-licences.ts   (invoked by `pnpm verify`, after the artifact gate)
//
// ⚠️ WHY IT SITS BESIDE THE QURAN HASHES RATHER THAN INSIDE THEM. `verify-quran.ts` and
// `verify-artifacts.ts` answer "did the bundled data change". A pack is not bundled data — it is
// somebody else's text, served from our CDN, under a grant. The question here is different in
// kind: **is every pack we OFFER covered by a recorded licence and a written redistribution
// argument?** It runs in the same command because it protects the same thing the Quran hashes do:
// the claim that what this app ships is what it says it ships.
//
// The repo is mirrored publicly under GPL-3.0. Content data never enters it (architecture §17), so
// there is no file here to hash — but the CATALOGUE is committed, precisely so this gate can run
// offline, in CI, on every push.
//
// ── What it checks ───────────────────────────────────────────────────────────────────────────
//
//   1. The catalogue exists, parses, and offers at least one pack.
//   2. The ledger exists and declares at least one licence entry.
//   3. Every pack names a `licenceId` that the ledger declares.
//   4. Every ledger entry carries all five required fields, each non-empty.
//   5. Every pack carries the facts a reader and a grant need: a title, a source, a stated source
//      version, an attribution line, a digest, a positive row count and a URL on our own CDN.
//
// ⚠️ IT FAILS CLOSED, like every other gate in this repo. A missing catalogue, a missing ledger,
// an empty `packs` array or a ledger with no entries is a FAILURE, not a clean pass. "Nothing to
// check" is how `lint:perms` and the raw-db tripwire both ended their lives reporting OK forever;
// a licence gate that goes quiet the moment the catalogue is deleted is worth nothing.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(import.meta.dirname, '..');

// The same env seams `verify-quran.ts` and `verify-artifacts.ts` use, and for the same reason:
// the failure branches are only testable against a fixture. Nothing in the pipeline sets these.
const CATALOGUE_PATH =
  process.env.CQ_VERIFY_PACK_CATALOGUE ??
  resolve(ROOT, 'packages/quran-data/data/packs/index.json');
const LEDGER_PATH =
  process.env.CQ_VERIFY_PACK_LICENCES ??
  resolve(ROOT, 'packages/quran-data/data/packs/LICENCES.md');

/** Every field a ledger entry must carry, spelled as it appears in the file. */
const REQUIRED_FIELDS = [
  'Upstream',
  'Pinned version',
  'Grant',
  'Conditions we meet, and how',
  'Redistribution argument',
] as const;

/** The CDN a pack may be served from. Anywhere else is a third party learning what people read. */
const ALLOWED_PACK_HOST = 'https://cdn.nobleachievements.com/';

interface CataloguePack {
  id?: unknown;
  packVersion?: unknown;
  type?: unknown;
  language?: unknown;
  title?: unknown;
  source?: unknown;
  sourceVersion?: unknown;
  licenceId?: unknown;
  attribution?: unknown;
  url?: unknown;
  bytes?: unknown;
  rows?: unknown;
  digest?: unknown;
}

/** One ledger entry: its id and the fields it declares, with their text. */
export interface LedgerEntry {
  id: string;
  /** Field name → its text. A field present but blank is ABSENT from this map. */
  fields: Map<string, string>;
}

/**
 * Parse the ledger into entries.
 *
 * An entry is an `### {licenceId}` heading; its fields are the `- **Name:**` bullets beneath it,
 * counted only when something follows the colon on that line or on the lines below it before the
 * next bullet or blank line. Deliberately forgiving about prose and deliberately strict about
 * emptiness: the defect this guards against is a placeholder entry added to silence the gate.
 *
 * ⚠️ **ENTRIES LIVE ABOVE THE FIRST `##` SECTION, AND THE FIRST ONE ENDS THE SCAN OUTRIGHT.** The
 * ledger closes with a "Sources deliberately NOT here" section. Resetting only the CURRENT entry
 * at a `##` was not enough: an `### Al-Mukhtasar` written under that heading — the natural way to
 * record a refusal in detail — became a declared licence id, so a pack could name an EXPLICITLY
 * EXCLUDED source and pass the gate that exists to refuse exactly that. The grant region is the
 * region before the first `##`, and nothing after it can confer rights. (Story 8-2 review, C6.)
 */
export function parseLedger(markdown: string): LedgerEntry[] {
  const entries: LedgerEntry[] = [];
  let current: LedgerEntry | null = null;
  let closed = false;
  let pendingField: string | null = null;
  let pendingText: string[] = [];

  const closePending = () => {
    const text = pendingText.join(' ').trim();
    if (current && pendingField && text.length > 0) current.fields.set(pendingField, text);
    pendingField = null;
    pendingText = [];
  };

  for (const line of markdown.split('\n')) {
    if (/^##\s+/.test(line)) {
      closePending();
      current = null;
      closed = true;
      continue;
    }
    const h3 = /^###\s+(\S.*?)\s*$/.exec(line);
    if (h3) {
      closePending();
      if (closed) {
        current = null;
        continue;
      }
      current = { id: h3[1], fields: new Map() };
      entries.push(current);
      continue;
    }
    if (!current) continue;

    // ⚠️ A BLANK LINE ENDS THE FIELD, AND THAT IS WHAT MAKES "EMPTY" DETECTABLE. Without it the
    // `---` rule two lines below an emptied bullet counts as its text, and a placeholder entry
    // added to silence this gate passes it — which is the one failure the gate exists to refuse.
    if (line.trim().length === 0) {
      closePending();
      continue;
    }

    const bullet = /^-\s+\*\*(.+?):?\*\*\s*(.*)$/.exec(line);
    if (bullet) {
      closePending();
      pendingField = bullet[1].replace(/:$/, '');
      if (bullet[2].trim().length > 0) pendingText.push(bullet[2].trim());
      continue;
    }
    if (pendingField) pendingText.push(line.trim());
  }
  closePending();
  return entries;
}

/**
 * Pure: every reason this catalogue + ledger pair should be refused. Empty means compliant.
 *
 * Exported so `scripts/__tests__/verify-licences.test.mjs` can assert the fail-closed cases
 * without a fixture tree, the way every lint gate in this repo is tested.
 */
export function findLicenceViolations(catalogue: unknown, ledgerMarkdown: string): string[] {
  const violations: string[] = [];

  const entries = parseLedger(ledgerMarkdown);
  if (entries.length === 0) {
    violations.push(
      'the licence ledger declares no entries. A gate with an empty population reports clean ' +
        'having checked nothing — this is the fail-closed floor.'
    );
  }
  for (const entry of entries) {
    for (const field of REQUIRED_FIELDS) {
      if (!entry.fields.has(field)) {
        violations.push(`ledger entry "${entry.id}" is missing a non-empty "${field}" field.`);
      }
    }
  }
  const byId = new Map(entries.map((entry) => [entry.id, entry]));

  const packs = (catalogue as { packs?: unknown } | null)?.packs;
  if (!Array.isArray(packs) || packs.length === 0) {
    violations.push(
      'the pack catalogue offers no packs. An empty catalogue makes every check below vacuous, ' +
        'so it is refused rather than passed.'
    );
    return violations;
  }

  for (const raw of packs as CataloguePack[]) {
    const id = typeof raw.id === 'string' && raw.id.length > 0 ? raw.id : '<unnamed pack>';
    const text = (field: keyof CataloguePack) =>
      typeof raw[field] === 'string' && (raw[field] as string).trim().length > 0;

    for (const field of [
      'id',
      'type',
      'language',
      'title',
      'source',
      'sourceVersion',
      'licenceId',
      'attribution',
      'digest',
    ] as const) {
      if (!text(field)) violations.push(`pack "${id}" has no ${field}.`);
    }
    if (typeof raw.packVersion !== 'number' || !Number.isInteger(raw.packVersion)) {
      violations.push(`pack "${id}" has no integer packVersion — the file name carries it.`);
    }
    if (typeof raw.rows !== 'number' || raw.rows <= 0) {
      violations.push(
        `pack "${id}" declares no positive row count. A digest cannot see truncation; the count is ` +
          'the half of the integrity check that can.'
      );
    }
    if (typeof raw.bytes !== 'number' || raw.bytes <= 0) {
      violations.push(`pack "${id}" declares no positive size.`);
    }
    if (typeof raw.url !== 'string' || !raw.url.startsWith(ALLOWED_PACK_HOST)) {
      violations.push(
        `pack "${id}" is served from somewhere other than ${ALLOWED_PACK_HOST} — a per-pack fetch ` +
          'discloses what a reader studies, and Cloudflare is the only processor the privacy ' +
          'disclosure names.'
      );
    }
    const ledger = typeof raw.licenceId === 'string' ? byId.get(raw.licenceId) : undefined;
    if (typeof raw.licenceId === 'string' && !ledger) {
      violations.push(
        `pack "${id}" names licence "${raw.licenceId}", which the ledger does not declare (an ` +
          'entry under "Sources deliberately NOT here" is an EXCLUSION, never a grant). Record ' +
          'the grant and the redistribution argument BEFORE the pack ships.'
      );
    }

    /**
     * ⚠️ **"STATE THE VERSION PUBLISHED" IS THE GRANT CONDITION THIS WHOLE GATE PROTECTS, SO THE
     * VERSION IS COMPARED RATHER THAN MERELY REQUIRED.** Checking `sourceVersion` and
     * `attribution` for non-emptiness lets a catalogue claim `9.9.9`, and lets an `attribution`
     * still read `(v1.0.3)` after a bump — both of which SAY a version, neither of which states
     * the one that shipped. The ledger's pinned version is the single source; the other two are
     * checked against it. (Story 8-2 review, C6.)
     */
    if (ledger && typeof raw.sourceVersion === 'string' && raw.sourceVersion.length > 0) {
      const pinned = ledger.fields.get('Pinned version') ?? '';
      if (!pinned.includes(raw.sourceVersion)) {
        violations.push(
          `pack "${id}" publishes source version "${raw.sourceVersion}", which the ledger entry ` +
            `"${raw.licenceId}" does not pin. The version STATED and the version PINNED have to ` +
            'be the same string, or the grant condition is not met.'
        );
      }
      if (typeof raw.attribution === 'string' && !raw.attribution.includes(raw.sourceVersion)) {
        violations.push(
          `pack "${id}" carries an attribution that does not state version ` +
            `"${raw.sourceVersion}". The attribution is where a reader is told which edition this ` +
            'is; a stale one is worse than none.'
        );
      }
    }
  }

  return violations;
}

function main(): void {
  console.log('=== Content Pack Licences ===\n');

  for (const [label, path] of [
    ['pack catalogue', CATALOGUE_PATH],
    ['licence ledger', LEDGER_PATH],
  ] as const) {
    if (!existsSync(path)) {
      console.error(`❌ Missing ${label}: ${path}`);
      console.error('   Refusing: with it absent this gate would pass having checked nothing.');
      process.exit(1);
    }
  }

  let catalogue: unknown;
  try {
    catalogue = JSON.parse(readFileSync(CATALOGUE_PATH, 'utf8'));
  } catch (error) {
    console.error(`❌ Pack catalogue is not valid JSON: ${CATALOGUE_PATH}`);
    console.error(`   ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  const violations = findLicenceViolations(catalogue, readFileSync(LEDGER_PATH, 'utf8'));
  if (violations.length > 0) {
    console.error('❌ Licence ledger FAILED\n');
    for (const violation of violations) console.error(`   ${violation}`);
    console.error(`\n   The ledger is ${LEDGER_PATH}`);
    process.exit(1);
  }

  const packs = (catalogue as { packs: CataloguePack[] }).packs;
  for (const pack of packs) {
    console.log(`  ${String(pack.id).padEnd(26)} ${pack.licenceId}  (${pack.rows} rows)`);
  }
  console.log(`\n✅ Licence ledger PASSED — ${packs.length} offered pack(s) covered`);
}

// Only when RUN, never when imported: the pure helpers above are the unit under test and an
// import that also executed `main()` would exit the test process.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
