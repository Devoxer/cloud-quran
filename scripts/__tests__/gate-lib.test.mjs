/**
 * Self-tests for `scripts/gate-lib.mjs` — the primitives every gate shares.
 *
 * Run: `node --test scripts/__tests__/gate-lib.test.mjs` (wired as `pnpm test:gate-lib`, which
 * `pnpm test:gates` chains; `test:gates` enumerates its suites BY NAME, so a new file here is
 * invisible to `pnpm test` until `package.json` names it).
 *
 * Two halves, and the second is the reason this file exists at all:
 *
 *  1. THE LINE INDEX AND THE BLANKERS. The invariant "an offset into a blanked copy is an offset
 *     into the source" is load-bearing for every marker lookup, and it was FALSE: the blankers
 *     turned a `\r`/U+2028/U+2029 inside a string or comment into a space, so the line arrays and
 *     the line counter desynced and an unrelated carve-out suppressed a genuine violation.
 *     Asserted here rather than assumed.
 *
 *  2. THE ENTRYPOINT WIRING, END TO END, FOR ALL SIX SCRIPTS. `isMainModule()` and the
 *     `if (isMainModule()) main()` tail had ZERO tests in every one of the six copies — replacing
 *     either with `return false` left the entire suite green, which is precisely the silent
 *     `exit 0` the realpath comparison exists to prevent. A unit test over the helper cannot close
 *     that (`gates-scanners.md` § "gate the WIRING, not the declaration"): it passes just as
 *     happily after someone deletes the call from a gate's module tail. So the test SPAWNS each
 *     script through a symlinked repo path and asserts its expected line appears. EMPTY OUTPUT IS
 *     THE BUG — that is the invariant, and it is what makes one test meaningful for all six.
 *
 * ⚠️ Never type a literal U+2028/U+2029 here. They are JS line terminators — a literal one ends the
 * statement it lands in. Built from `String.fromCharCode` below for exactly that reason.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  blankCommentsAndStrings,
  blankStrings,
  isMainModule,
  isMarkerLine,
  lineOfIndex,
  splitLines,
} from '../gate-lib.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// Built, never typed. A literal U+2028 in this file would terminate the statement it sits in.
const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);
const CR = String.fromCharCode(0x0d);
const TERMINATOR_CHARS = new Set(['\n', CR, LS, PS]);

// ── The line index ───────────────────────────────────────────────────────────────────────────

test('splitLines / lineOfIndex agree on the full terminator set, CRLF counting once', () => {
  const src = `a\nb${CR}c${LS}d${PS}e\r\nf`;
  assert.deepEqual(splitLines(src), ['a', 'b', 'c', 'd', 'e', 'f']);
  assert.equal(lineOfIndex(src, 0), 1);
  assert.equal(lineOfIndex(src, src.indexOf('c')), 3);
  assert.equal(lineOfIndex(src, src.indexOf('d')), 4);
  assert.equal(lineOfIndex(src, src.indexOf('f')), 6);
});

/**
 * ⚠️ THE INVARIANT THE WHOLE FAMILY RESTS ON, AND IT USED TO BE FALSE.
 *
 * The fixture needs an ACTUAL lone `\r` / U+2028 / U+2029 *inside a string and inside each comment
 * form* — an LF-only fixture passes with every fix reverted, because LF was the one terminator the
 * old blankers preserved.
 *
 * MUTATION RECIPE (three independent reverts, each must red this test):
 *   1. `blankRun` → `m.replace(/[^\n]/g, ' ')`            (the string/template sink)
 *   2. the same, applied to the block-comment replacement
 *   3. `LINE_COMMENT_G` → `/\/\/[^` + `\n]*` + `/g`       (the line-comment sink — note this one is
 *      the MATCH, not the replacement, which is why widening a character class does not fix it and
 *      why a grep for the `[^\n]` shape finds only the other two)
 */
test('the blankers preserve LENGTH and every TERMINATOR POSITION — offsets stay interchangeable', () => {
  const src = [
    `const s = "a${CR}b${LS}c${PS}d";`,
    `/* block${CR}comment${LS}here */`,
    `// line comment with a lone CR${CR}still the same comment`,
    'const t = `tpl',
    'spanning`;',
  ].join('\n');

  for (const [name, blanked] of [
    ['blankStrings', blankStrings(src)],
    ['blankCommentsAndStrings', blankCommentsAndStrings(src)],
  ]) {
    assert.equal(blanked.length, src.length, `${name}: length`);

    // Every terminator sits at the SAME index. This is the assertion; the length check above
    // cannot see a `\r` swapped for a space.
    const positions = (text) =>
      [...text].flatMap((ch, i) => (TERMINATOR_CHARS.has(ch) ? [`${i}:${ch.charCodeAt(0)}`] : []));
    assert.deepEqual(positions(blanked), positions(src), `${name}: terminator positions`);

    // …and therefore the two views agree about which line any offset is on.
    for (let i = 0; i < src.length; i += 1) {
      assert.equal(lineOfIndex(blanked, i), lineOfIndex(src, i), `${name}: line at offset ${i}`);
    }
  }
});

/**
 * ⚠️ A LINE COMMENT ENDS AT ANY TERMINATOR, AND THIS IS THE HALF THE POSITION TEST CANNOT SEE.
 *
 * With a terminator-preserving replacement, narrowing the line-comment MATCH back to `[^\n]` still
 * leaves every terminator in place — so the position assertion above stays green while the blanker
 * erases REAL CODE that follows a lone `\r` inside a comment. A rule reading that region then sees
 * spaces: fail-open, invisible to length and to terminator positions alike.
 *
 * MUTATION RECIPE: `LINE_COMMENT_G` → a `[^\n]`-bodied pattern. Only this test reds.
 */
test('a line comment ends at a lone CR — the code after it is NOT blanked', () => {
  const src = `const a = 1; // comment${CR}const setOk = 2;\n`;
  const blanked = blankCommentsAndStrings(src);
  assert.ok(
    blanked.includes('const setOk = 2;'),
    `code after the CR was blanked: ${JSON.stringify(blanked)}`
  );
  assert.ok(!blanked.includes('comment'), 'the comment itself must still be blanked');
  assert.equal(blanked.length, src.length);
});

test('blankCommentsAndStrings: a token inside a string or a comment cannot match', () => {
  const code = 'const x = "setOk(data)"; // setOk(data)\nconst y = 1;';
  const blanked = blankCommentsAndStrings(code);
  assert.equal(blanked.length, code.length);
  assert.ok(!/setOk\(data\)/.test(blanked));
  assert.match(blanked, /const y = 1;/); // real code is untouched
});

test('blankStrings leaves COMMENTS intact — that is the whole difference from its sibling', () => {
  const code = "const D = 'https://x'; // lint-gating-ok: reason";
  const blanked = blankStrings(code);
  assert.ok(!blanked.includes('https://x')); // the string content is gone
  assert.ok(blanked.includes('lint-gating-ok: reason')); // the comment is not
});

// ── The escape-hatch marker ──────────────────────────────────────────────────────────────────

test('isMarkerLine: the marker must be CARRIED at the head of a comment, with its `:` reason', () => {
  const T = 'lint-gating-ok';
  assert.equal(isMarkerLine('// lint-gating-ok: sanctioned wrapper', T), true);
  assert.equal(isMarkerLine('  * lint-gating-ok: in a block comment', T), true);
  assert.equal(isMarkerLine('{/* lint-gating-ok: between JSX children */}', T), true);
  assert.equal(isMarkerLine('const a = 1; // lint-gating-ok: trailing', T), true);

  // MENTIONED, not carried — prose that happens to name the token.
  assert.equal(isMarkerLine('// NOTE: wrappers use lint-gating-ok, see the layers gate', T), false);
  // A bare marker with no reason suppresses nothing: the reason IS the deliberate decision.
  assert.equal(isMarkerLine('// lint-gating-ok', T), false);
  // Not a comment at all.
  assert.equal(isMarkerLine('const lintGatingOk = 1;', T), false);
  assert.equal(isMarkerLine(undefined, T), false);
});

test('isMarkerLine: the token is an ARGUMENT — the two gates cannot cross-suppress', () => {
  assert.equal(isMarkerLine('// lint-i18n-ok: reason', 'lint-i18n-ok'), true);
  assert.equal(isMarkerLine('// lint-i18n-ok: reason', 'lint-gating-ok'), false);
  assert.equal(isMarkerLine('// lint-gating-ok: reason', 'lint-i18n-ok'), false);
});

/**
 * The reason `isMarkerLine` is fed a strings-blanked line rather than the raw source. Both
 * directions were live, and a wider regex closes neither:
 *   - a legitimate carve-out sharing its line with a URL string was NOT recognised (a false RED on
 *     a correct tree — the gate's first `//` was the one inside `'https://…'`);
 *   - a string whose CONTENT spells the marker DID suppress (a fail-open).
 */
test('isMarkerLine on a STRINGS-BLANKED line: a URL carve-out counts, a mentioned-in-a-string does not', () => {
  const T = 'lint-gating-ok';
  const withUrl = "const DOCS = 'https://example.com'; // lint-gating-ok: sanctioned SDK wrapper";
  const mentioned = "const DOC = '// lint-gating-ok: x';";

  assert.equal(isMarkerLine(splitLines(blankStrings(withUrl))[0], T), true);
  assert.equal(isMarkerLine(splitLines(blankStrings(mentioned))[0], T), false);

  // And the raw-line form is what got both wrong — pinned so the blanking is not "simplified" away.
  assert.equal(isMarkerLine(withUrl, T), false);
  assert.equal(isMarkerLine(mentioned, T), true);
});

test('isMarkerLine: a marker following prose INSIDE the same comment stays unmatched, by rule', () => {
  // Deliberate, not a residual: the head anchor is the entire mechanism that stops prose from
  // switching a gate off.
  assert.equal(isMarkerLine('// see https://x — lint-gating-ok: r', 'lint-gating-ok'), false);
});

test('isMarkerLine: a missing token is a TypeError, not a silent false', () => {
  assert.throws(() => isMarkerLine('// x', undefined), TypeError);
  assert.throws(() => isMarkerLine('// x', ''), TypeError);
});

// ── isMainModule: argument validation ────────────────────────────────────────────────────────

test('isMainModule: onUnknown is REQUIRED — no default may decide the safe direction', () => {
  assert.throws(
    () => isMainModule({ url: import.meta.url, label: 'x' }),
    /onUnknown must be 'run' or 'skip'/
  );
  assert.throws(
    () => isMainModule({ url: import.meta.url, onUnknown: true, label: 'x' }),
    /onUnknown must be 'run' or 'skip'/
  );
  assert.throws(
    () => isMainModule({ url: '/not/a/url', onUnknown: 'run', label: 'x' }),
    /must be a file:\/\/ URL/
  );
  // ⚠️ A ROOT-ONLY `file:` URL must THROW, not answer quietly. Every spelling below passes a `file:`
  // prefix test and resolves to `'/'`, which realpaths fine and compares false — a SILENT `false`
  // that never reaches either unknown-answer door, i.e. the exact quiet skip this helper exists to
  // make impossible, arriving through its own argument validation.
  //
  // ⚠️ THE SLASH RUNS ARE THE POINT, AND THEY ARE WHY THIS LOOP IS NOT TWO CASES. The first version
  // of this guard was proved against exactly `['file:', 'file://']` and shipped; `file:////` then
  // walked through the very next review round, because its pathname is `//` — length 2, so the
  // `> 1` test passed — while `fileURLToPath` still yields a path realpathing to `/`. Closing a
  // family by enumerating its members buys one round. `pathOf` now collapses runs of `/` first, so
  // the case below that a member-by-member fix cannot survive is `'file://///'`.
  // MUTATION RECIPE: drop the `.replace(/\/{2,}/g, '/')` from `pathOf` — the two-slash cases stay
  // green (they were the enumerated ones) and every case from `'file:///'` down reds.
  for (const url of ['file:', 'file://', 'file:///', 'file:////', 'file://///']) {
    assert.throws(
      () => isMainModule({ url, onUnknown: 'run', label: 'x' }),
      /must be a file:\/\/ URL with a path/,
      url
    );
  }
  // The converse, so the collapse cannot be "fixed" into rejecting real paths: a URL whose pathname
  // merely CONTAINS a slash run is a legitimate path and must still be answered, not thrown at.
  assert.equal(
    typeof isMainModule({ url: 'file:////tmp/x.mjs', onUnknown: 'run', label: 'x' }),
    'boolean'
  );
  assert.throws(
    () => isMainModule({ url: import.meta.url, onUnknown: 'run' }),
    /label must be a non-empty string/
  );
});

test('isMainModule: an imported module is not the entrypoint, and neither door opens', () => {
  // Both paths resolve (argv[1] is this test file; the url is a real script), so no unknown-answer
  // door is reached — the answer comes from the comparison itself and nothing is printed.
  const other = pathToFileURL(join(REPO_ROOT, 'scripts', 'lint-layers.mjs')).href;
  const errs = [];
  const realError = console.error;
  console.error = (...a) => errs.push(a.join(' '));
  try {
    assert.equal(isMainModule({ url: other, onUnknown: 'run', label: 'probe' }), false);
    assert.equal(isMainModule({ url: other, onUnknown: 'skip', label: 'probe' }), false);
  } finally {
    console.error = realError;
  }
  assert.deepEqual(errs, [], 'a resolvable comparison must not warn');

  // And the positive half, which is what makes the negative one mean something: pointed at THIS
  // file — the process entrypoint under `node --test <file>` — it answers true.
  assert.equal(isMainModule({ url: import.meta.url, onUnknown: 'run', label: 'probe' }), true);
});

// ── The shared END-TO-END entrypoint test (all five gates) ───────────────────────────────────

/**
 * One record per script. The expected line is PER-SCRIPT on purpose — it is the script's own
 * LABEL, never its OK line (see the symlink test's docblock for why).
 *
 * ⚠️ story 5-2 REMOVED TWO RECORDS AND THE MACHINERY THAT EXISTED FOR ONE OF THEM. The population
 * was six: these four offline gates plus `lint-instant-perms.mjs` and `perms-verify.mjs`. Both are
 * deleted — the vendor whose authorization rules they compared is being retired, and authorization
 * becomes code in the worker, deployed atomically with the app, so there is no committed-vs-live
 * pair left to drift.
 *
 * With `perms-verify.mjs` went the only record that carried `deleteEnv` / `expectArgvless` /
 * `expectArgvlessTail`, and the reason they existed: that script decrypted a production admin token
 * and made one authenticated request with it, so a naive "assert the OK line" here would have made
 * `pnpm test` call production on any machine where the credentials happened to be exported. Every
 * remaining script is an offline gate whose safe direction is to RUN, which is why the argv-less
 * test below now asserts one direction rather than two.
 *
 * `isMainModule`'s `'skip'` direction is deliberately still supported in `gate-lib.mjs` — it is a
 * per-script judgement, not a house constant, and story 5-5 brings a credential-bearing script
 * back. What is gone is a script that needs it TODAY; do not re-add a test for a caller that does
 * not exist.
 */
const SCRIPTS = [
  { script: 'lint-layers.mjs', expect: 'lint:layers —' },
  { script: 'lint-style.mjs', expect: 'lint:style —' },
  { script: 'lint-i18n.mjs', expect: 'lint:i18n —' },
  { script: 'lint-native-patches.mjs', expect: 'lint:native-patches —' },
  { script: 'lint-header-controls.mjs', expect: 'lint:header-controls —' },
];

/**
 * ⚠️ THE POPULATION IS DERIVED, NOT HAND-KEPT. A `SCRIPTS.length >= N` floor closes the DELETION
 * direction only: a further script with an `isMainModule` tail is silently uncovered and the floor
 * still passes. That is the same anti-pattern this very story deleted from a `lint-i18n.mjs`
 * docblock ("a hand-maintained census … nothing maintains it").
 *
 * Anchored on the IMPORT SPECIFIER, not on a call-shaped token: `gate-lib.mjs` DECLARES
 * `isMainModule({ … })`, so a token scan for the call shape matches the definer too (it did, on the
 * first run of this test). "Who consumes this binding" is a question the import answers exactly,
 * and it is the anchor `gates-scanners.md` names for precisely this confusion.
 *
 * ⚠️ AND THE SPECIFIER IS MATCHED IN EVERY IMPORT FORM, BECAUSE THE FIRST VERSION OF THIS TEST
 * RECOGNISED ONE (Story 35.4 Step I, found independently by two layers). It required a braced named
 * import with a SINGLE-quoted `'./gate-lib.mjs'`, so a namespace import, a double-quoted specifier,
 * a dynamic `await import(…)` and a consumer one directory down were all invisible — while the
 * `>= 6` floor stayed satisfied, because it was already saturated by the six known consumers. A
 * form-specific population with a floor it cannot fall below is a coverage claim with nothing behind
 * it, which is the shape `gates-scanners.md` names: a RULE may be scoped to known spellings, a
 * POPULATION may not. The specifier is now matched independently of the import syntax around it, and
 * the walk recurses rather than waiving every future subdirectory.
 */
test('the entrypoint suite covers every script that imports the entrypoint check', () => {
  const dir = join(REPO_ROOT, 'scripts');
  // Two independent conditions, so neither the import SYNTAX nor the quote style can hide a
  // consumer: the file must name the module (in any import form) and must name the binding.
  const NAMES_MODULE = /['"][^'"]*\bgate-lib\.mjs['"]/;
  const NAMES_BINDING = /\bisMainModule\b/;
  const walk = (d) =>
    readdirSync(d, { withFileTypes: true }).flatMap((e) => {
      if (e.isDirectory()) {
        return e.name === '__tests__' || e.name === 'node_modules' ? [] : walk(join(d, e.name));
      }
      return e.isFile() && e.name.endsWith('.mjs') ? [join(d, e.name)] : [];
    });
  const consumers = walk(dir)
    .filter((f) => {
      const src = readFileSync(f, 'utf8');
      return NAMES_MODULE.test(src) && NAMES_BINDING.test(src);
    })
    .map((f) => relative(dir, f))
    .sort();
  // Anti-vacuity: a regex that stopped matching would otherwise report an empty population as full
  // coverage — the "reports OK having checked nothing" shape this whole suite exists to refuse.
  // story 5-2 took the population from six to four (lint-instant-perms + perms-verify deleted);
  // story 5-8 brings it back to five with `lint-header-controls.mjs`.
  assert.ok(consumers.length >= 5, `expected ≥5 importers, found ${consumers.length}`);
  const covered = SCRIPTS.map((s) => s.script).sort();
  assert.deepEqual(
    consumers.filter((f) => !covered.includes(f)),
    [],
    'scripts importing isMainModule with no entrypoint-test record'
  );
});

/**
 * ⚠️ AND THE CENSUS ABOVE STILL DOES NOT ASK WHETHER ANY OF THEM IS RUN.
 *
 * Drop `&& pnpm lint:header-controls` from the root `lint` script and every one of this repo's
 * gate suites stays green, both entrypoint doors below included, along with the whole jest/vitest
 * net — the gate simply leaves the build. That is the same shape as `lint:layers` scanning for a
 * primitive that had been deleted and reporting clean for two stories: the check is fine, nothing
 * reaches it. This file's own docblock has named the hazard in prose since story 5-1
 * ("`test:gates` enumerates its suites BY NAME, so a new file here is invisible to `pnpm test`
 * until `package.json` names it") and checked nothing.
 *
 * The population is DERIVED from the filesystem on both sides — every `scripts/lint-*.mjs` and
 * every `scripts/__tests__/*.test.mjs` — so it covers all six gates, not the new one, and a
 * seventh added tomorrow is covered on arrival. The chains are EXPANDED first: `lint` names
 * `pnpm lint:layers`, whose body names the file, and `test:gates` names `pnpm test:gate-lib`,
 * whose body names its suite. Matching the raw `lint` string alone would see none of them.
 */
const expandScript = (scripts, name, seen = new Set()) => {
  if (seen.has(name) || !(name in scripts)) return '';
  seen.add(name);
  return scripts[name].replace(/\bpnpm\s+([\w:-]+)/g, (whole, ref) =>
    ref in scripts ? ` ${expandScript(scripts, ref, seen)} ` : whole
  );
};

test('every gate script is RUN by `pnpm lint`, and every gate suite by `pnpm test`', () => {
  const { scripts } = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
  const lintChain = expandScript(scripts, 'lint');
  // ⚠️ EXPAND `test`, NOT `test:gates` — THE ROOT OF THE CHAIN, NOT A LINK IN IT. Checking
  // `test:gates` proves its members are wired to IT and asks nothing about whether IT is wired to
  // anything: dropping `pnpm test:gates &&` from `test` removes all seven gate suites from local
  // runs AND from CI (`gates.yml` runs `pnpm test`), and nothing reds. Verifying a chain from a
  // link is the same mistake as a gate asserting its own rule instead of its reachability.
  const testChain = expandScript(scripts, 'test');

  const gates = readdirSync(join(REPO_ROOT, 'scripts'))
    .filter((f) => f.startsWith('lint-') && f.endsWith('.mjs'))
    .sort();
  const suites = readdirSync(join(REPO_ROOT, 'scripts', '__tests__'))
    .filter((f) => f.endsWith('.test.mjs'))
    .sort();

  // Anti-vacuity on both populations: a filter that stopped matching would report "all covered"
  // over nothing at all, which is the failure this test exists to refuse.
  assert.ok(gates.length >= 5, `expected ≥5 gate scripts, found ${gates.length}`);
  assert.ok(suites.length >= 6, `expected ≥6 gate suites, found ${suites.length}`);

  assert.deepEqual(
    gates.filter((f) => !lintChain.includes(`scripts/${f}`)),
    [],
    'gate scripts that `pnpm lint` does not run — the gate has left the build'
  );
  assert.deepEqual(
    suites.filter((f) => !testChain.includes(`scripts/__tests__/${f}`)),
    [],
    'gate suites that `pnpm test` does not run — the self-test has left the build'
  );

  // ⚠️ AND THE ONE GATE THAT IS NOT A `lint-*.mjs`. `scripts/verify-quran.ts` is the project's
  // single stated non-negotiable — SHA-256 per ayah of the shipped Quran text — and a
  // `lint-*`-shaped population excludes it by construction. It is also the gate with the worst
  // track record in this repo: it shipped DEAD for a whole story, guarding the most important
  // invariant here by waiting for a human to type its name. It runs from `test`, not from `lint`.
  assert.ok(
    testChain.includes('scripts/verify-quran.ts'),
    '`pnpm test` does not run the Quran integrity gate (scripts/verify-quran.ts)'
  );
  assert.ok(
    testChain.includes('scripts/__tests__/verify-quran.test.mjs'),
    "`pnpm test` does not run the integrity gate's own self-test"
  );
});

/**
 * ⚠️ THIS IS THE SLOW HALF OF `pnpm test:gates`, AND THAT IS THE TRADE, STATED.
 *
 * Every record is spawned once per door, and each spawn walks `apps/expo/src` — for `lint-i18n.mjs`
 * parsing every file with the TypeScript compiler. No timing number is quoted here on purpose: a
 * measured duration in a docblock is a run artifact of one machine on one day, which is the class
 * this story deleted from four other docblocks. Sampling would defeat the point regardless of the
 * cost: the invariant is per-script wiring, and the copy that gets deleted is the one you did not
 * spawn. If it ever has to be cut, cut the argv-less door before the symlink door — the symlink one
 * is the failure that actually shipped.
 *
 * ⚠️ The assertion is the script's own LABEL, not its OK line. Asserting `— OK` coupled `pnpm test`
 * to tree cleanliness: a legitimately-red gate failed here with the message "expected 'lint:style —
 * OK' … got: lint:style — 204 style-token violation(s)", i.e. a diagnosis that says the gate no-op'd
 * when it did the opposite. The wiring invariant needs only that the tail FIRED — empty output is
 * the bug — and any line the script prints proves that.
 */
test('every script RUNS when reached through a SYMLINKED repo path (empty output is the bug)', () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'gate-entry-')));
  const link = join(tmp, 'repo-link');
  try {
    symlinkSync(REPO_ROOT, link);
    for (const { script, expect } of SCRIPTS) {
      const r = spawnSync(process.execPath, [join(link, 'scripts', script)], {
        encoding: 'utf8',
        cwd: REPO_ROOT,
      });
      const out = `${r.stdout}${r.stderr}`;
      assert.ok(
        out.includes(expect),
        `${script}: expected ${JSON.stringify(expect)} through a symlink, got:\n${out || "(EMPTY — the gate no-op'd, which is the defect)"}`
      );
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

/**
 * The second unknown-answer door: `process.argv[1]` is absent under `node --import <script> -e ''`
 * (and under `node -e`, and a piped stdin). Every copy answered it `false` — a silent skip reached
 * without any symlink — while answering the realpath-failure door `true` eight lines below.
 *
 * ⚠️ story 5-2: this test used to assert BOTH directions, because `perms-verify.mjs` had to REFUSE
 * (its unsafe outcome was one authenticated request to production) while the offline gates had to
 * RUN. That script is deleted, so only the RUN direction has a subject left. If a
 * credential-bearing script ever returns — story 5-5's Better Auth secret work is the candidate —
 * the refusal half comes back WITH it, asserting the message TAIL and not the shared prefix:
 * `unknown()` opens identically whichever way it answers, so a prefix assertion cannot tell a
 * refusal from a run, and that is exactly the mutation that once left this test green.
 */
test('the argv-less door: every gate runs rather than skipping silently', () => {
  for (const { script, expect } of SCRIPTS) {
    const r = spawnSync(
      process.execPath,
      ['--import', join(REPO_ROOT, 'scripts', script), '-e', ''],
      { encoding: 'utf8', cwd: REPO_ROOT }
    );
    const out = `${r.stdout}${r.stderr}`;
    assert.ok(
      out.includes(expect),
      `${script}: expected ${JSON.stringify(expect)} with no argv[1], got:\n${out || '(EMPTY — the silent exit 0 this door exists to close)'}`
    );
  }
});

// story 5-2: one more test stood here — `perms-verify: an unresolvable argv[1] + a bare import
// does no live work`, the mirror of the door above for the one script where refusing was the safe
// answer. It went with the script.
