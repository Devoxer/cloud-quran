/**
 * Self-test for the Quran integrity gate — `scripts/verify-quran.ts`.
 *
 * ⚠️ WHY THIS EXISTS. Story 5-3 closed a fail-open in that gate: a missing `hashes.ts` used to be
 * minted on the spot and reported as "✅ Verification PASSED", so a deleted baseline plus a
 * corrupted database passed. That fix was the story's headline deliverable, and it was verified
 * exactly once, by hand, by a human deleting the real baseline and reading an exit code.
 *
 * The review that followed pointed out the obvious: restore the fail-open with one edit and every
 * automated check in this repo still passes. `scripts/tsconfig.json` — added by the same story —
 * cannot see it, because a control-flow change compiles clean. That is the 5-1 failure exactly: a
 * dead integrity gate indistinguishable from a working one.
 *
 * So this asserts the four outcomes as PROCESS EXIT CODES, which is the only thing callers see:
 *
 *   baseline present, matching        → 0
 *   baseline present, tampered row    → 1   (and names the verse)
 *   baseline ABSENT, no flag          → 1   (the fail-open; must NOT mint)
 *   --generate-hashes over a baseline → 1   (refuses to overwrite)
 *   --generate-hashes, short database → 1   (refuses to bake in a broken build)
 *   --generate-hashes, none present   → 0   (the one legitimate mint)
 *
 * Everything runs against a FIXTURE database in a temp dir via CQ_VERIFY_DB / CQ_VERIFY_HASHES.
 * The committed `quran.db` is never opened, never mind written — this suite exists to protect it.
 */

import { deepStrictEqual, match, strictEqual } from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, describe, it } from 'node:test';

const SCRIPT = resolve(import.meta.dirname, '..', 'verify-quran.ts');
const TOTAL_VERSES = 6236; // mirrors packages/quran-data; the gate's own guard uses the real constant

const workdirs = [];
after(() => {
  for (const d of workdirs) rmSync(d, { recursive: true, force: true });
});

/** A fixture database with `rows` verses. Real schema, tiny data — never the shipped file. */
function makeFixture({ rows = TOTAL_VERSES, tamper = null } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'cq-verify-'));
  workdirs.push(dir);
  const dbPath = join(dir, 'fixture.db');
  const db = new DatabaseSync(dbPath);
  db.exec(
    'CREATE TABLE verses (surah_number INTEGER, verse_number INTEGER, uthmani_text TEXT, simple_text TEXT)'
  );
  const insert = db.prepare(
    'INSERT INTO verses (surah_number, verse_number, uthmani_text, simple_text) VALUES (?, ?, ?, ?)'
  );
  db.exec('BEGIN');
  for (let i = 1; i <= rows; i++) {
    const text = tamper === i ? 'TAMPERED' : `ayah-${i}`;
    insert.run(1, i, text, text);
  }
  db.exec('COMMIT');
  db.close();
  return { dir, dbPath, hashesPath: join(dir, 'hashes.ts') };
}

function runGate({ dbPath, hashesPath }, args = []) {
  const r = spawnSync('node', [SCRIPT, ...args], {
    env: { ...process.env, CQ_VERIFY_DB: dbPath, CQ_VERIFY_HASHES: hashesPath },
    encoding: 'utf8',
  });
  return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

describe('verify-quran: the fail-open is closed', () => {
  it('EXITS 1 when the baseline is absent — it must not mint one and call that a pass', () => {
    // THE REGRESSION THIS FILE EXISTS FOR. Before story 5-3 this minted hashes.ts from whatever
    // the database happened to contain and printed "PASSED (initial hash generation)", so a
    // corrupt database with a deleted baseline verified clean.
    const fx = makeFixture();
    const { status, out } = runGate(fx);

    strictEqual(status, 1);
    match(out, /FAILED/);
    strictEqual(existsSync(fx.hashesPath), false, 'must not have written a baseline');
  });

  it('mints a baseline ONLY when asked explicitly, and says it verified nothing', () => {
    const fx = makeFixture();
    const { status, out } = runGate(fx, ['--generate-hashes']);

    strictEqual(status, 0);
    strictEqual(existsSync(fx.hashesPath), true);
    match(out, /NOT a verification/i);
  });

  it('REFUSES to mint over an existing baseline', () => {
    // Overwriting is how a tampered database gets a fresh, self-consistent baseline — the gate
    // would then pass forever against corrupted text.
    const fx = makeFixture();
    runGate(fx, ['--generate-hashes']);
    const before = readFileSync(fx.hashesPath, 'utf8');

    const { status, out } = runGate(fx, ['--generate-hashes']);

    strictEqual(status, 1);
    match(out, /already exists|refused/i);
    strictEqual(readFileSync(fx.hashesPath, 'utf8'), before, 'baseline must be untouched');
  });

  it('REFUSES to mint from a short database', () => {
    // A baseline minted from a truncated build bakes the truncation in and passes ever after.
    const fx = makeFixture({ rows: 10 });

    const { status, out } = runGate(fx, ['--generate-hashes']);

    strictEqual(status, 1);
    match(out, /10/);
    strictEqual(existsSync(fx.hashesPath), false);
  });
});

describe('verify-quran: it actually verifies', () => {
  it('EXITS 0 on an intact database', () => {
    const fx = makeFixture();
    runGate(fx, ['--generate-hashes']);

    const { status, out } = runGate(fx);

    strictEqual(status, 0);
    match(out, /PASSED/);
  });

  it('EXITS 1 and names the verse when one ayah is tampered with', () => {
    // Anti-vacuity for the case above: without this, a gate that passes everything would look
    // identical to a gate that works.
    const fx = makeFixture();
    runGate(fx, ['--generate-hashes']);

    // Rewrite one ayah in place, leaving the row count intact so only the HASH can catch it.
    const db = new DatabaseSync(fx.dbPath);
    db.prepare('UPDATE verses SET uthmani_text = ? WHERE verse_number = ?').run('TAMPERED', 42);
    db.close();

    const { status, out } = runGate(fx);

    strictEqual(status, 1);
    match(out, /mismatch/i);
    match(out, /1:42/, 'must name which verse failed');
  });

  it('EXITS 1 on a truncated database even when the baseline agrees with it', () => {
    // The case hash comparison structurally cannot catch: mint a baseline from a short database,
    // then verify it. Every hash present matches, so without a count check the gate reports
    // PASSED over a Quran that is missing verses.
    const fx = makeFixture({ rows: 10 });
    // Mint by hand — the mint path deliberately refuses a short database, which is the point.
    const rows = [];
    for (let i = 1; i <= 10; i++) rows.push(`  '1:${i}': 'x',`);
    writeFileSync(fx.hashesPath, `export const VERSE_HASHES = {\n${rows.join('\n')}\n};\n`);

    const { status, out } = runGate(fx);

    strictEqual(status, 1);
    match(out, /10|verses/i);
  });

  it('never writes to the database it is verifying', () => {
    // The gate opens with { readOnly: true }. node:sqlite SILENTLY IGNORES unknown constructor
    // options, so Bun's lowercase { readonly: true } would give it a WRITABLE handle on the
    // shipped Quran text — a trap this project has already walked into once.
    const fx = makeFixture();
    runGate(fx, ['--generate-hashes']);
    const before = readFileSync(fx.dbPath);

    runGate(fx);

    deepStrictEqual(
      readFileSync(fx.dbPath),
      before,
      'the database must be byte-identical after a verify'
    );
  });
});
