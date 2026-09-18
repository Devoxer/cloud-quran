/**
 * Self-test for the content-pack licence gate — `scripts/verify-licences.ts`.
 *
 * ⚠️ WHY THIS EXISTS. The gate's whole value is that it FAILS CLOSED: a deleted catalogue, an
 * empty ledger or a pack naming a licence nobody recorded must all be exit 1. Every one of those
 * is a control-flow property, which typecheck and Biome cannot see — and this repo has twice shipped
 * a gate that reported clean having checked nothing (`lint:perms` after its vendor left, and the
 * raw-db tripwire after its primitive was deleted). So the outcomes are asserted as PROCESS EXIT
 * CODES, which is the only thing a caller ever sees.
 *
 *   ledger + catalogue, matching        → 0
 *   catalogue file ABSENT               → 1  (must not pass vacuously)
 *   ledger file ABSENT                  → 1
 *   ledger with NO entries              → 1
 *   catalogue with NO packs             → 1
 *   pack naming an unrecorded licence   → 1
 *   ledger entry missing a field        → 1
 *   pack with no digest / no row count  → 1
 *
 * Everything runs against FIXTURES in a temp dir via `CQ_VERIFY_PACK_CATALOGUE` /
 * `CQ_VERIFY_PACK_LICENCES`. The committed ledger is never written.
 */

import { strictEqual } from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, describe, it } from 'node:test';

const SCRIPT = resolve(import.meta.dirname, '..', 'verify-licences.ts');

const workdirs = [];
after(() => {
  for (const dir of workdirs) rmSync(dir, { recursive: true, force: true });
});

const GOOD_LEDGER = `# Content pack licences

Prose the gate ignores.

### quranenc-republication

- **Upstream:** QuranEnc — https://quranenc.com
- **Pinned version:** french_rashid v1.0.3
- **Grant:** Republication permitted under stated conditions.
- **Conditions we meet, and how:**
  - No modification: the text is copied verbatim.
- **Redistribution argument:** QuranEnc publishes these expressly for republication and we meet
  every stated condition.

---

## Sources deliberately NOT here

- **Al-Mukhtasar:** all rights reserved.
`;

const GOOD_PACK = {
  id: 'translation-fr-rashid',
  packVersion: 1,
  type: 'translation',
  language: 'fr',
  languageName: 'Français',
  title: 'Le Noble Coran — Rachid Maach',
  source: 'QuranEnc',
  sourceVersion: '1.0.3',
  licenceId: 'quranenc-republication',
  attribution: 'Traduction française : Rachid Maach. Source : QuranEnc.com (v1.0.3).',
  url: 'https://cdn.nobleachievements.com/packs/translation-fr-rashid-v1.db',
  bytes: 1425408,
  rows: 6236,
  digest: '142dedef190bb94180bbbba6f78f86d70077396732d9df130bf27505a3b4b37c',
};

/** Write a fixture pair and run the gate over it. `null` for either path means "absent". */
function run({ ledger = GOOD_LEDGER, catalogue = { packs: [GOOD_PACK] } } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'cq-licences-'));
  workdirs.push(dir);
  const ledgerPath = join(dir, 'LICENCES.md');
  const cataloguePath = join(dir, 'index.json');
  if (ledger !== null) writeFileSync(ledgerPath, ledger, 'utf8');
  if (catalogue !== null) writeFileSync(cataloguePath, JSON.stringify(catalogue, null, 2), 'utf8');
  const result = spawnSync(process.execPath, [SCRIPT], {
    env: {
      ...process.env,
      CQ_VERIFY_PACK_CATALOGUE: cataloguePath,
      CQ_VERIFY_PACK_LICENCES: ledgerPath,
    },
    encoding: 'utf8',
  });
  return { code: result.status, out: `${result.stdout}${result.stderr}` };
}

describe('verify-licences', () => {
  it('passes when every offered pack has a complete ledger entry', () => {
    const { code, out } = run();
    strictEqual(code, 0, out);
  });

  it('fails closed when the catalogue file is absent', () => {
    const { code, out } = run({ catalogue: null });
    strictEqual(code, 1);
    strictEqual(/Missing pack catalogue/.test(out), true, out);
  });

  it('fails closed when the ledger file is absent', () => {
    const { code, out } = run({ ledger: null });
    strictEqual(code, 1);
    strictEqual(/Missing licence ledger/.test(out), true, out);
  });

  it('fails closed on a ledger with no entries', () => {
    const { code, out } = run({ ledger: '# Content pack licences\n\nNothing here yet.\n' });
    strictEqual(code, 1);
    strictEqual(/declares no entries/.test(out), true, out);
  });

  it('fails closed on a catalogue that offers nothing', () => {
    const { code, out } = run({ catalogue: { packs: [] } });
    strictEqual(code, 1);
    strictEqual(/offers no packs/.test(out), true, out);
  });

  it('refuses a pack whose licence the ledger does not declare', () => {
    const { code, out } = run({
      catalogue: { packs: [{ ...GOOD_PACK, licenceId: 'someone-elses-tafsir' }] },
    });
    strictEqual(code, 1);
    strictEqual(/the ledger does not declare/.test(out), true, out);
  });

  it('refuses a ledger entry that names no redistribution argument', () => {
    const { code, out } = run({
      ledger: GOOD_LEDGER.replace(
        /- \*\*Redistribution argument:\*\*[\s\S]*?\n\n/,
        '- **Redistribution argument:**\n\n'
      ),
    });
    strictEqual(code, 1);
    strictEqual(/Redistribution argument/.test(out), true, out);
  });

  it('refuses a pack with no digest and one with no row count', () => {
    strictEqual(run({ catalogue: { packs: [{ ...GOOD_PACK, digest: '' }] } }).code, 1);
    strictEqual(run({ catalogue: { packs: [{ ...GOOD_PACK, rows: 0 }] } }).code, 1);
  });

  it("refuses a pack served from somewhere other than the app's own CDN", () => {
    const { code, out } = run({
      catalogue: { packs: [{ ...GOOD_PACK, url: 'https://cdn.jsdelivr.net/packs/fr.db' }] },
    });
    strictEqual(code, 1);
    strictEqual(/served from somewhere other than/.test(out), true, out);
  });

  it('refuses a pack whose STATED version the ledger does not pin', () => {
    // ⚠️ "State the version published" is the QuranEnc grant condition this gate exists for.
    // Requiring the field to be NON-EMPTY let a catalogue claim 9.9.9 and pass clean.
    // (Story 8-2 review, C6.)
    const { code, out } = run({
      catalogue: { packs: [{ ...GOOD_PACK, sourceVersion: '9.9.9' }] },
    });
    strictEqual(code, 1);
    strictEqual(/does not pin/.test(out), true, out);
  });

  it('refuses an attribution that states a DIFFERENT version from the one shipping', () => {
    // The stale-after-a-bump case: the pin moved, the credit line did not.
    const { code, out } = run({
      catalogue: {
        packs: [
          {
            ...GOOD_PACK,
            attribution: 'Traduction française : Rachid Maach. Source : QuranEnc.com (v1.0.2).',
          },
        ],
      },
    });
    strictEqual(code, 1);
    strictEqual(/does not state version/.test(out), true, out);
  });

  it('never lets an EXCLUDED source under "Sources deliberately NOT here" confer rights', () => {
    // ⚠️ The one thing this file must never do. An `### Al-Mukhtasar` written under the
    // exclusions heading — the natural way to record a refusal in detail — used to parse as a
    // declared licence id. (Story 8-2 review, C6.)
    const ledger = `${GOOD_LEDGER}
### al-mukhtasar

- **Upstream:** Tafsir Center
- **Pinned version:** 1.0.3
- **Grant:** none — all rights reserved.
- **Conditions we meet, and how:** none.
- **Redistribution argument:** there is none; this is a record of a refusal.
`;
    const { code, out } = run({
      ledger,
      catalogue: { packs: [{ ...GOOD_PACK, licenceId: 'al-mukhtasar' }] },
    });
    strictEqual(code, 1);
    strictEqual(/the ledger does not declare/.test(out), true, out);
  });

  it('refuses a catalogue that is not valid JSON', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cq-licences-'));
    workdirs.push(dir);
    const ledgerPath = join(dir, 'LICENCES.md');
    const cataloguePath = join(dir, 'index.json');
    writeFileSync(ledgerPath, GOOD_LEDGER, 'utf8');
    // The jsDelivr shape: an HTTP 200 whose body is a plain-text error, saved to disk.
    writeFileSync(cataloguePath, 'Package size exceeded the configured limit', 'utf8');
    const result = spawnSync(process.execPath, [SCRIPT], {
      env: {
        ...process.env,
        CQ_VERIFY_PACK_CATALOGUE: cataloguePath,
        CQ_VERIFY_PACK_LICENCES: ledgerPath,
      },
      encoding: 'utf8',
    });
    strictEqual(result.status, 1);
    strictEqual(/not valid JSON/.test(`${result.stdout}${result.stderr}`), true);
  });
});
