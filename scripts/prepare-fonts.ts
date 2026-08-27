/**
 * QPC V1 mushaf font pipeline for Cloud Quran (story 6-2).
 *
 * Phase 1: Clone nuqayah/qpc-fonts at a PINNED commit and verify all 604 page fonts exist.
 * Phase 2: Overlay the 6 bundled PATCHED fonts (pages 154/161/166/302/472/566 — one glyph each
 *          holds a two-point contour starting off-curve, which CoreText and Skia answer by
 *          discarding the whole glyph and leaving a word-shaped hole; the repaired files in
 *          `apps/expo/assets/fonts/qpc-patched/` are canonical). ⚠️ THIS SET IS DERIVED, NOT
 *          REPORTED: `node scripts/lint-mushaf-glyphs.mjs --corpus <clone>/mushaf-woff2`
 *          rasterises every glyph slot the layout references on all 604 pages and selects
 *          exactly these six — and fails if any of them no longer needs its patch. Keep it equal
 *          to `PATCHED_FONT_PAGES` in `apps/expo/src/lib/mushafFonts.ts`; `lint:mushaf-glyphs`
 *          refuses a build where the two disagree. The patched pages are uploaded too so the CDN
 *          set is complete and self-consistent, even though the app prefers its bundled copies
 *          and never fetches them.
 * Phase 3: Upload to R2 `gp-cdn/fonts/qpc-v1/QCF_P{NNN}.woff2` via wrangler, with
 *          `--content-type font/woff2` (wrangler guesses nothing for .woff2).
 *
 * ⚠️ WHY A CDN AT ALL, AND WHY OURS: the PRD prescribes on-demand mushaf assets three times
 * (<50MB initial install), and the app's loader (`apps/expo/src/lib/mushafFonts.ts`) must fetch
 * from `cdn.nobleachievements.com` ONLY — a per-page font fetch discloses which pages a reader
 * opens, and Cloudflare is the only processor the privacy disclosure names. This script is how
 * those bytes get there; the bucket + CORS were provisioned by story 3-6 (`r2-cors.json`).
 *
 * Idempotent: before uploading an object, the public CDN URL is HEAD-checked and the upload is
 * skipped when the remote size already matches the local file — so a re-run after a partial
 * failure uploads only what is missing, and a size mismatch (e.g. an unpatched copy uploaded by
 * hand) is repaired rather than trusted.
 *
 * Usage:
 *   node scripts/prepare-fonts.ts                # full pipeline
 *   node scripts/prepare-fonts.ts --skip-upload  # verify + overlay only, nothing leaves the machine
 *   node scripts/prepare-fonts.ts --force        # re-upload everything, ignoring the HEAD check
 */

import { execSync, spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const PATCHED_DIR = resolve(ROOT, 'apps/expo/assets/fonts/qpc-patched');

// Upstream: the same repo the pre-fork loader fetched from at runtime — build-time only now.
// Pinned so a regenerated upload is comparable to this one; verified 2026-08-27 (605 woff2
// files: QCF_P001–QCF_P604 + QCF_BSML, which the app does not use).
const QPC_REPO_URL = 'https://github.com/nuqayah/qpc-fonts.git';
const QPC_REPO = '/tmp/qpc-fonts';
const QPC_PIN = '8a4f39d563ea69c994416a1692827e38156c548d';
const QPC_WOFF2_DIR = resolve(QPC_REPO, 'mushaf-woff2');

const TOTAL_PAGES = 604;
const PATCHED_PAGES = new Set([154, 161, 166, 302, 472, 566]);

const BUCKET = 'gp-cdn';
const KEY_PREFIX = 'fonts/qpc-v1';
const CDN_BASE = 'https://cdn.nobleachievements.com';
const CONTENT_TYPE = 'font/woff2';
const UPLOAD_WORKERS = 4;

const skipUpload = process.argv.includes('--skip-upload');
const force = process.argv.includes('--force');

function fontName(page: number): string {
  return `QCF_P${String(page).padStart(3, '0')}.woff2`;
}

/** Local source of truth for one page: the patched copy when one exists, upstream otherwise. */
function localPathFor(page: number): string {
  return PATCHED_PAGES.has(page)
    ? resolve(PATCHED_DIR, fontName(page))
    : resolve(QPC_WOFF2_DIR, fontName(page));
}

// ─── Phase 1: pinned clone (same shape as generate-mushaf-layout.ts) ─────────

function ensureRepo(): void {
  if (!existsSync(QPC_WOFF2_DIR)) {
    console.log('Cloning nuqayah/qpc-fonts...');
    // --filter=blob:none, NOT --depth 1: a shallow clone cannot check out an arbitrary commit.
    execSync(`git clone --filter=blob:none ${QPC_REPO_URL} ${QPC_REPO}`, { stdio: 'inherit' });
  }
  const hasCommit = (): boolean => {
    try {
      execSync(`git -C ${QPC_REPO} cat-file -e ${QPC_PIN}^{commit}`, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  };
  if (!hasCommit()) {
    try {
      execSync(`git -C ${QPC_REPO} fetch --quiet origin`, { stdio: 'ignore' });
    } catch {
      // Offline — the check below reports it precisely.
    }
  }
  if (!hasCommit()) {
    console.error(`Pinned commit ${QPC_PIN} is not in ${QPC_REPO} and could not be fetched.`);
    console.error('Do NOT fall back to HEAD: fonts from different upstream bytes are not');
    console.error(`comparable to the verified set. Delete ${QPC_REPO} and re-run online.`);
    process.exit(1);
  }
  execSync(`git -C ${QPC_REPO} checkout --quiet ${QPC_PIN}`, { stdio: 'inherit' });
}

function verifyLocalSet(): void {
  const missing: string[] = [];
  for (let page = 1; page <= TOTAL_PAGES; page++) {
    const path = localPathFor(page);
    if (!existsSync(path) || statSync(path).size === 0) missing.push(fontName(page));
  }
  if (missing.length > 0) {
    console.error(`❌ ${missing.length} font file(s) missing or empty locally:`);
    for (const name of missing.slice(0, 10)) console.error(`  - ${name}`);
    process.exit(1);
  }
  console.log(
    `  ✓ All ${TOTAL_PAGES} page fonts present (${PATCHED_PAGES.size} from the patched overlay)`
  );
}

// ─── Phase 3: upload ─────────────────────────────────────────────────────────

/** Run a child process, draining stdout/stderr as they arrive (see prepare-audio.ts). */
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

/** The CDN's size for an object, or null when it is absent/unreachable. */
async function remoteSize(key: string): Promise<number | null> {
  try {
    const response = await fetch(`${CDN_BASE}/${key}`, { method: 'HEAD' });
    if (!response.ok) return null;
    const length = response.headers.get('content-length');
    return length === null ? null : Number(length);
  } catch {
    return null;
  }
}

async function uploadOne(page: number): Promise<'uploaded' | 'skipped'> {
  const key = `${KEY_PREFIX}/${fontName(page)}`;
  const localPath = localPathFor(page);
  if (!force) {
    const size = await remoteSize(key);
    if (size !== null && size === statSync(localPath).size) return 'skipped';
  }
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
      CONTENT_TYPE,
      '--remote',
    ]);
    if (exitCode === 0) return 'uploaded';
    if (attempt === 3) throw new Error(`Upload failed for ${key}: ${stderr}`);
    await new Promise((r) => setTimeout(r, attempt * 5000));
  }
  return 'uploaded';
}

async function phase3Upload(): Promise<void> {
  console.log('\n=== Phase 3: Upload to R2 ===');
  let uploaded = 0;
  let skipped = 0;
  const pages = Array.from({ length: TOTAL_PAGES }, (_, i) => i + 1);
  for (let i = 0; i < pages.length; i += UPLOAD_WORKERS) {
    const batch = pages.slice(i, i + UPLOAD_WORKERS);
    const results = await Promise.all(batch.map((page) => uploadOne(page)));
    for (const result of results) {
      if (result === 'uploaded') uploaded++;
      else skipped++;
    }
    const done = uploaded + skipped;
    if (done % 100 < UPLOAD_WORKERS || done === TOTAL_PAGES) {
      console.log(`  ${done}/${TOTAL_PAGES} (${uploaded} uploaded, ${skipped} already current)`);
    }
  }
  console.log(`  ✓ ${uploaded} uploaded, ${skipped} already current`);
}

async function verifyCdn(): Promise<void> {
  // The four corners that matter: an ordinary page, both ends, and a patched page — whose size
  // must match the PATCHED file, proving the overlay actually won.
  const checks: number[] = [1, 2, 154, 604];
  for (const page of checks) {
    const key = `${KEY_PREFIX}/${fontName(page)}`;
    const size = await remoteSize(key);
    const expected = statSync(localPathFor(page)).size;
    if (size !== expected) {
      console.error(`❌ CDN check failed for ${key}: remote=${size}, local=${expected}`);
      process.exit(1);
    }
  }
  console.log(`  ✓ CDN serves the uploaded set (${checks.map(fontName).join(', ')})`);
}

async function main(): Promise<void> {
  console.log('Cloud Quran QPC font pipeline');
  console.log(`  Upstream: nuqayah/qpc-fonts @ ${QPC_PIN.slice(0, 8)}`);
  console.log(`  Target: r2://${BUCKET}/${KEY_PREFIX}/ (${CDN_BASE})`);

  console.log('\n=== Phase 1: Pinned upstream ===');
  ensureRepo();
  console.log('\n=== Phase 2: Verify + patched overlay ===');
  verifyLocalSet();

  if (skipUpload) {
    console.log('\n⏭️  Skipping Phase 3 (upload) — nothing left this machine');
    return;
  }
  await phase3Upload();
  await verifyCdn();
  console.log('\n✅ Font pipeline complete');
}

main().catch((err) => {
  console.error('\n❌ Font pipeline failed:', err);
  process.exit(1);
});
