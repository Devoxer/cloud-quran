/**
 * Self-tests for the lint:header-controls gate (scripts/lint-header-controls.mjs).
 *
 * Run: `node --test scripts/__tests__/lint-header-controls.test.mjs` (or `pnpm test:header-controls`).
 *
 * ⚠️ NOT reached by `turbo test` — turbo does not run ROOT package scripts. Like its
 * `test:layers` / `test:style` siblings it runs only via `pnpm test:gates`. Don't assume the net
 * covers it.
 *
 * ⚠️ THE PROPERTY UNDER TEST IS THAT THE GATE FIRES. `apps/expo/src` names no header slot today, so
 * the gate is green on arrival and would stay green if it were broken — and the defect it guards is
 * invisible in every other check and in a screenshot (the control is drawn; it simply never
 * receives a mouse click). So every rule assertion below drives a POSITIVE hit.
 *
 * ⚠️ AND THAT IS NOT ENOUGH ON ITS OWN, WHICH IS WHY THE FIXTURE TREE IS HERE. The first cut of
 * this suite exercised `runHeaderControlsScan()` against empty and missing roots only. Inverting
 * the exemption skip to `if (!EXCEPTIONS.has(relFile)) continue;` — which, with an empty map, skips
 * EVERY file — left all twelve tests green: a scan that returned nothing looked identical to a
 * clean tree. `findRawHeaderSlots` unit cases cannot see that, because the bug is in the loop
 * around them.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  EXCEPTIONS,
  exemptionProblems,
  findRawHeaderSlots,
  runHeaderControlsScan,
} from '../lint-header-controls.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

const slotsOf = (src) => findRawHeaderSlots(src).map((h) => h.slot);

// ── the four spellings ───────────────────────────────────────────────────────
test('FIRES on ES object SHORTHAND — the React Navigation idiom, and the hole that shipped', () => {
  // ⚠️ THE CASE THAT MATTERED. `headerRight` here is a local `useCallback` renderer; this is how
  // the defect is most likely to be written in this tree, and the colon-only first cut returned
  // zero hits for it while its own self-test asserted the shape as PASSING.
  assert.deepEqual(slotsOf('navigation.setOptions({ headerRight });'), ['headerRight']);
  assert.deepEqual(slotsOf('options={{ title, headerLeft,\n headerRight, }}'), [
    'headerLeft',
    'headerRight',
  ]);
  assert.deepEqual(slotsOf('const opts = { title, headerRight };'), ['headerRight']);
});

test('FIRES on the colon form — an inline arrow, a named renderer, a conditional', () => {
  const inline = findRawHeaderSlots(`
    navigation.setOptions({
      headerRight: () => <HeaderActionButton onPress={handleSave} />,
    });
  `);
  assert.equal(inline.length, 1);
  assert.equal(inline[0].line, 3);
  assert.match(inline[0].snippet, /headerRight: \(\) => <HeaderActionButton/);
  // ⚠️ Hoisting the JSX into `renderBack` LOOKS like a fix and changes nothing — the control still
  // lands in the native header, where it takes no click.
  assert.deepEqual(slotsOf('headerLeft: renderBack,'), ['headerLeft']);
  assert.deepEqual(slotsOf('headerRight: showSave ? () => <Save /> : undefined,'), ['headerRight']);
});

test('FIRES on ASSIGNMENT, including the logical forms', () => {
  assert.deepEqual(slotsOf('opts.headerRight = renderSave;'), ['headerRight']);
  assert.deepEqual(slotsOf('options.headerRight ??= renderSave;'), ['headerRight']);
  assert.deepEqual(slotsOf('options.headerLeft ||= renderBack;'), ['headerLeft']);
});

test('FIRES on a QUOTED key in all three delimiters, and on a computed key', () => {
  // The rules view blanks string CONTENTS, so a quoted key would vanish. It is spliced back in
  // length-preservingly before the scan — the one place a string literal really is code.
  //
  // ⚠️ THE DELIMITER CLASS SHIPPED AS `['"]` AND A BACKTICK KEY WALKED THROUGH — the same
  // enumerate-what-you-thought-of failure as the colon-only matcher. JavaScript has exactly three
  // string delimiters, so covering all three is exhaustive by construction, not by listing.
  assert.deepEqual(slotsOf("const o = { 'headerRight': () => <Save/> };"), ['headerRight']);
  assert.deepEqual(slotsOf('o["headerLeft"] = renderBack;'), ['headerLeft']);
  assert.deepEqual(slotsOf('opts[`headerRight`] = renderSave;'), ['headerRight']);
  // The COMPUTED key form — `]` then `:`, which the value-operator pattern did not accept either.
  assert.deepEqual(slotsOf('({ [`headerRight`]: renderSave })'), ['headerRight']);
  assert.deepEqual(slotsOf("({ ['headerLeft']: renderBack })"), ['headerLeft']);
  assert.deepEqual(slotsOf("options={{\n  'headerLeft': () => <A/>,\n}}"), ['headerLeft']);
  // …and the allowance still reaches every one of them.
  assert.deepEqual(findRawHeaderSlots('opts[`headerRight`] = undefined;'), []);
  assert.deepEqual(findRawHeaderSlots('({ [`headerRight`]: undefined })'), []);
});

test('FIRES once per slot when a file names both — including on ONE line', () => {
  assert.deepEqual(
    slotsOf(`
      headerLeft: () => <Cancel />,
      headerRight: () => <Save />,
    `),
    ['headerLeft', 'headerRight']
  );
  // ⚠️ The lookahead value capture is what makes this work. Consuming the rest of the line as the
  // value moved `lastIndex` past the second slot, and it reported ONE offender.
  assert.deepEqual(
    slotsOf('<Stack.Screen options={{ headerLeft: () => <A/>, headerRight: () => <B/> }} />'),
    ['headerLeft', 'headerRight']
  );
});

test('FIRES on the bare identifier — there is NO destructured-hook allowance here', () => {
  // ⚠️ In wisdom-fruits `headerRight: headerRight` meant "destructured from
  // `useHeaderControlSlots`". That hook is forbidden by this story, so the same shape can only be a
  // local renderer going into the native slot. Inheriting the allowance is what opened the door.
  assert.ok(
    findRawHeaderSlots('navigation.setOptions({ title, headerRight: headerRight });').length > 0
  );
  assert.ok(findRawHeaderSlots('headerLeft: headerLeft,').length > 0);
});

test('FIRES on `unstable_header*Items` — what Stack.Toolbar becomes on iOS', () => {
  // ⚠️ `\b` DOES NOT CATCH THESE FROM A `headerRight` PATTERN. `_` and `I` are word characters, so
  // `\bheaderRight\b` does not match inside `unstable_headerRightItems` — the identifier scan that
  // closed the shorthand hole still returned [] for the SDK 56 idiom. Verified in the installed
  // expo-router 56: `processHeaderItemsForPlatform.ios.js:91` emits exactly these two options.
  assert.deepEqual(slotsOf('options={{ unstable_headerRightItems: items }}'), [
    'unstable_headerRightItems',
  ]);
  assert.deepEqual(slotsOf('setOptions({ unstable_headerLeftItems });'), [
    'unstable_headerLeftItems',
  ]);
});

test('FIRES on <Stack.Toolbar> whose placement reaches the header — the SDK 56 idiom', () => {
  // `StackToolbarClient.js:131,138`: placement left/right compiles to `headerShown: true` plus
  // `headerLeft`/`headerRight`. `Stack.Toolbar` is a first-class typed export (StackClient.d.ts:167),
  // so from here on this is the likeliest spelling of the defect.
  assert.deepEqual(
    slotsOf(
      '<Stack.Toolbar placement="right"><Stack.Toolbar.Button title="Save" /></Stack.Toolbar>'
    ),
    ['Stack.Toolbar placement="right"']
  );
  assert.deepEqual(slotsOf('<Stack.Toolbar placement={"left"} />'), [
    'Stack.Toolbar placement="left"',
  ]);
});

test('FIRES on a toolbar whose attributes contain a `>` — a truncated span is UNJUDGED', () => {
  // ⚠️ THE FAIL-OPEN THIS INVERSION EXISTS FOR, MEASURED TWICE. Ending the attribute span at the
  // first `>` truncated it inside the expression container — and a truncated span holds no
  // `placement`, which the old judging read as the benign `bottom` DEFAULT. So the two tags most
  // likely to carry a real header control were the two waved through, in the direction the
  // docblock promised was impossible. The end is now the first `>` at brace depth zero.
  assert.deepEqual(slotsOf('<Stack.Toolbar onPress={() => save()} placement="right">'), [
    'Stack.Toolbar placement="right"',
  ]);
  assert.deepEqual(slotsOf('<Stack.Toolbar visible={a > b} placement="right" />'), [
    'Stack.Toolbar placement="right"',
  ]);
  // A tag that never closes is unreadable, therefore unjudged, therefore a violation.
  assert.deepEqual(slotsOf('<Stack.Toolbar placement="bottom"'), [
    'Stack.Toolbar (unclosed tag — placement unreadable)',
  ]);
});

test('FIRES on a toolbar whose placement is UNREADABLE — spread or variable', () => {
  // ⚠️ A spread can carry any placement, so it is by definition unreadable — and it must fail the
  // same way `placement={p}` does. It passed. The polarity is the fix: the scan asks "can I read a
  // shape that PROVES this is harmless", never "is it one of the bad shapes".
  assert.deepEqual(slotsOf('<Stack.Toolbar {...toolbarProps} />'), [
    'Stack.Toolbar (spread — placement unreadable)',
  ]);
  // Even with an explicit bottom: JSX order decides which wins, and that is not a question a
  // lexical scan should answer. The remedy is one keystroke — drop the spread, or write it out.
  assert.deepEqual(slotsOf('<Stack.Toolbar {...rest} placement="bottom" />'), [
    'Stack.Toolbar (spread — placement unreadable)',
  ]);
  assert.deepEqual(slotsOf('<Stack.Toolbar placement={p}>x</Stack.Toolbar>'), [
    'Stack.Toolbar (placement unreadable)',
  ]);
});

test('PASSES <Stack.Toolbar> that never reaches a header slot', () => {
  // `bottom` is the DEFAULT and a different native surface — a bottom toolbar. The 2026-08-20
  // measurement covered header slots only, so flagging it would be a claim nobody has evidence for
  // (it is recorded in `deferred-work.md` as unmeasured instead).
  assert.deepEqual(findRawHeaderSlots('<Stack.Toolbar placement="bottom">x</Stack.Toolbar>'), []);
  assert.deepEqual(findRawHeaderSlots('<Stack.Toolbar>x</Stack.Toolbar>'), []);
  // The CHILDREN are not the toolbar.
  assert.deepEqual(findRawHeaderSlots('<Stack.Toolbar.Button title="Save" />'), []);
  // A `>` inside a string attribute must not end the tag early (it is blanked on the rules view),
  // and neither must one inside an expression container.
  assert.deepEqual(findRawHeaderSlots('<Stack.Toolbar title="a > b" placement="bottom" />'), []);
  assert.deepEqual(
    findRawHeaderSlots('<Stack.Toolbar onPress={() => s()} placement="bottom">x</Stack.Toolbar>'),
    []
  );
});

test("FIRES on the app's OWN header prop — the names are reserved, not exempted", () => {
  // The documented false positive, asserted as intended behaviour: Epic 6 builds an in-tree header,
  // and if it reuses these prop names the gate reds. The answer is to rename the prop
  // (leading/trailing), never to exempt the file — an exemption blinds the whole file.
  //
  // ⚠️ And when the prop is UPSTREAM's — `<Header headerLeft={…} />` from
  // `@react-navigation/elements`, which draws an in-tree header that DOES take a mouse click —
  // renaming is not available and exempting the screen is still forbidden. The docblock's third
  // branch applies: one adapter module under `components/ui/` translating leading/trailing, and an
  // EXCEPTIONS entry for that adapter alone.
  assert.deepEqual(slotsOf('<AppHeader headerRight={<Save />} />'), ['headerRight']);
  assert.deepEqual(slotsOf('<Header headerLeft={() => <Back/>} />'), ['headerLeft']);
  assert.deepEqual(slotsOf('export interface HeaderProps { headerLeft?: ReactNode }'), [
    'headerLeft',
  ]);
});

test('does NOT fire on a word that merely starts with a slot name', () => {
  assert.deepEqual(findRawHeaderSlots('const headerRightGap = 8; const HEADER_LEFT = 1;'), []);
});

// ── the one allowance ────────────────────────────────────────────────────────
test('PASSES an explicit undefined — a screen turning the slot off is the goal', () => {
  assert.deepEqual(
    findRawHeaderSlots("target.setOptions({ title: '', headerRight: undefined });"),
    []
  );
  assert.deepEqual(findRawHeaderSlots('opts.headerLeft = undefined;'), []);
  assert.deepEqual(findRawHeaderSlots('headerRight: undefined'), []); // end of input, no comma
  assert.deepEqual(findRawHeaderSlots("({ 'headerRight': undefined })"), []);
  // ⚠️ THE BRACKET FORM HAD NO ALLOWANCE AT ALL. After the quoted key is restored the tail is
  // `] = …`, which the value-operator pattern did not match, so the value was unjudgeable and the
  // one documented allowance could never apply — while the docblock promised it always did.
  assert.deepEqual(findRawHeaderSlots('opts["headerRight"] = undefined;'), []);
  assert.deepEqual(slotsOf('opts["headerRight"] = renderSave;'), ['headerRight']);
});

test('PASSES an undefined the FORMATTER WRAPPED — the allowance is not line-scoped', () => {
  // ⚠️ Read line-scoped, this is a violation: the value on the `headerRight:` line is empty. It is
  // what prettier/biome produce the moment the line grows past the print width, so a line-scoped
  // allowance reds a tree that did exactly what the gate asked.
  assert.deepEqual(findRawHeaderSlots('options={{\n  headerRight:\n    undefined,\n}}'), []);
  assert.deepEqual(findRawHeaderSlots('opts.headerLeft =\n  undefined;'), []);
});

test('the undefined allowance needs a real value BOUNDARY', () => {
  // The source gate's `[,}]?` made the boundary optional, so any identifier with that prefix walked
  // through — and `undefined ?? renderSave` installs a live control.
  assert.deepEqual(slotsOf('headerRight: undefinedRenderer,'), ['headerRight']);
  assert.deepEqual(slotsOf('headerRight: undefined ?? renderSave,'), ['headerRight']);
});

// ── prose is not code ────────────────────────────────────────────────────────
test('does NOT fire on the words in prose — comments and strings are blanked first', () => {
  // All five live mentions in `apps/expo/src` today are of this shape, backticks included.
  const source = `
    // The section picker lives in \`headerRight\`: () => <Thing />
    /** Sets title/headerRight via setOptions — headerLeft: () => <Back /> */
    const doc = 'headerRight: () => <Save />';
    const key = flag ? 'headerRight' : 'other';
    navigation.setOptions({ headerRight: undefined });
  `;
  assert.deepEqual(findRawHeaderSlots(source), []);
});

test('does NOT fire on a QUOTED KEY written inside a comment — the restore is guarded', () => {
  // ⚠️ PINS `restoreQuotedSlotKeys`' one-line comment guard. Delete
  // `if (out[m.index] !== m[1]) continue;` and every other test stays green — while a docblock
  // showing the forbidden idiom starts reddening the tree with no spelling that satisfies the gate.
  // This codebase's docblocks quote that idiom routinely (this gate's own does), so the guard is
  // load-bearing prose-handling, not a nicety.
  assert.deepEqual(
    findRawHeaderSlots("// never write { 'headerRight': () => <Save/> }\nconst a = 1;"),
    []
  );
  assert.deepEqual(
    findRawHeaderSlots('/** Bad: { "headerLeft": fn } and o[`headerRight`] = fn */\nconst b = 2;'),
    []
  );
  // …while the same text as CODE on the next line still fires, so the case is not vacuous.
  assert.equal(
    findRawHeaderSlots("// { 'headerRight': fn }\nconst o = { 'headerRight': fn };").length,
    1
  );
});

// ── the populated fixture tree ───────────────────────────────────────────────
/** A throwaway source tree; returns its realpath (the walker canonicalizes, and macOS `mkdtemp`
 * hands back `/var/…`, a symlink to `/private/var/…`). */
const fixture = (files) => {
  // ⚠️ `realpathSync`, and it is load-bearing rather than tidy. On macOS `mkdtemp` hands back
  // `/var/…`, a symlink to `/private/var/…`, while `collectSourceFiles` canonicalizes every path it
  // emits — so an un-realpathed root makes `relative(base, file)` produce `../../../…` and no
  // injected exemption key can ever match. The same trap `lint-layers.test.mjs` documents.
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'header-controls-')));
  for (const [rel, body] of Object.entries(files)) {
    const full = join(root, rel);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, body);
  }
  return root;
};

test('runHeaderControlsScan reports through the FILE LOOP, not just the matcher', () => {
  // ⚠️ THE TEST THAT CATCHES AN INVERTED EXEMPTION SKIP. `if (!EXCEPTIONS.has(relFile)) continue;`
  // skips every file when the map is empty, so the scan returns [] and every empty-root floor and
  // every `findRawHeaderSlots` unit case stays green. Only a populated tree can tell the two apart.
  const root = fixture({
    'app/broken.tsx': 'export const S = () => {\n  nav.setOptions({ headerRight });\n};\n',
    'app/clean.tsx': 'export const C = () => nav.setOptions({ headerRight: undefined });\n',
    'app/broken.test.tsx': 'nav.setOptions({ headerLeft: () => <X /> });\n',
  });
  try {
    const violations = runHeaderControlsScan(root);
    assert.equal(
      violations.length,
      1,
      `expected exactly one violation, got:\n${violations.join('\n')}`
    );
    assert.match(violations[0], /broken\.tsx:2 — headerRight — /);
    // The walker skips `*.test.*`, so the third file is deliberately not in the population.
    assert.doesNotMatch(violations.join('\n'), /headerLeft/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('runHeaderControlsScan clears its own floor on the REAL tree, with the default argument', () => {
  // …so the guard cannot be passing only because every other case overrides the root
  // (`lint-i18n.test.mjs` sets the precedent). The tree is clean today, hence `[]`.
  assert.deepEqual(runHeaderControlsScan(), []);
});

// ── fail-closed floor 1: the population ──────────────────────────────────────
test('FAILS CLOSED on a zero-file population — an empty root is not a clean run', () => {
  const empty = mkdtempSync(join(tmpdir(), 'header-controls-'));
  try {
    assert.throws(() => runHeaderControlsScan(empty), /scanned zero source files/);
    // A root holding a file the walk does not collect is still zero — the floor is on what was
    // SCANNED, not on what the directory happens to contain.
    writeFileSync(join(empty, 'README.md'), '# not source');
    assert.throws(() => runHeaderControlsScan(empty), /scanned zero source files/);
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
});

test('FAILS CLOSED on a scan root that does not exist', () => {
  // `collectSourceFiles` treats ENOENT as an empty walk, so absence arrives here as the same
  // vacuity — and `main()` also refuses it earlier, via `missingRoots`.
  assert.throws(
    () => runHeaderControlsScan(join(tmpdir(), 'header-controls-does-not-exist')),
    /scanned zero source files/
  );
});

// ── fail-closed floor 2: the exemption map ───────────────────────────────────
test('FAILS CLOSED on an exemption whose reason is blank or missing', () => {
  const root = fixture({ 'x.tsx': 'nav.setOptions({ headerRight });\n' });
  const pop = new Set(['x.tsx']);
  try {
    assert.equal(exemptionProblems(new Map([['x.tsx', '']]), root, pop).length, 1);
    assert.match(
      exemptionProblems(new Map([['x.tsx', '   ']]), root, pop)[0],
      /exemption has no reason/
    );
    assert.equal(exemptionProblems(new Map([['x.tsx', undefined]]), root, pop).length, 1);
    assert.deepEqual(exemptionProblems(new Map([['x.tsx', 'a stated reason']]), root, pop), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('FAILS CLOSED on a DEAD exemption — a stale path, or a file that sets no slot', () => {
  // ⚠️ A dead entry is not inert. It is a standing blindfold over a whole file, waiting for the
  // next control someone adds to it — while still being counted in the gate's OK line.
  // `lint-layers.mjs` states the same rule for its sanctioned-file set.
  const root = fixture({
    'live.tsx': 'nav.setOptions({ headerRight });\n',
    'quiet.tsx': 'export const q = 1;\n',
  });
  const pop = new Set(['live.tsx', 'quiet.tsx']);
  try {
    assert.match(
      exemptionProblems(new Map([['gone.tsx', 'a stated reason']]), root, pop)[0],
      /cannot read \(ENOENT\)/
    );
    assert.match(
      exemptionProblems(new Map([['quiet.tsx', 'a stated reason']]), root, pop)[0],
      /suppresses nothing/
    );
    assert.deepEqual(exemptionProblems(new Map([['live.tsx', 'a stated reason']]), root, pop), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('FAILS CLOSED on an exemption the SCAN NEVER VISITS — liveness is two questions', () => {
  // ⚠️ "Does this file set a slot" says nothing about whether the scan would ever reach it. A key
  // outside `apps/expo/src`, or one the walker skips by rule (`*.test.tsx`), passed as sound while
  // exempting a file from a rule that was never going to apply — an entry that reads as coverage
  // and is not.
  const root = fixture({
    'in.tsx': 'nav.setOptions({ headerRight });\n',
    'out.test.tsx': 'nav.setOptions({ headerRight });\n',
    'far/away.tsx': 'nav.setOptions({ headerRight });\n',
  });
  // The real walker's population for this fixture: `*.test.*` is skipped, so it is absent here too.
  const pop = new Set(['in.tsx', 'far/away.tsx']);
  try {
    assert.match(
      exemptionProblems(new Map([['out.test.tsx', 'a stated reason']]), root, pop)[0],
      /never visits/
    );
    assert.match(
      exemptionProblems(new Map([['elsewhere/thing.tsx', 'a stated reason']]), root, pop)[0],
      /cannot read \(ENOENT\)/
    );
    assert.deepEqual(exemptionProblems(new Map([['in.tsx', 'a stated reason']]), root, pop), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('an exemption naming a DIRECTORY is a problem, not an uncaught EISDIR', () => {
  // ⚠️ Uncaught, this replaced the gate's whole output with a stack trace and the scan never ran —
  // a fail-closed check turned into a crash, which is not the same thing. `existsSync` says yes to
  // a directory, so the guard has to be on the READ.
  const root = fixture({ 'pkg/thing.tsx': 'export const t = 1;\n' });
  try {
    const problems = exemptionProblems(
      new Map([['pkg', 'a stated reason']]),
      root,
      new Set(['pkg'])
    );
    assert.equal(problems.length, 1);
    assert.match(problems[0], /cannot read \(EISDIR\)/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a LIVE exemption really suppresses — the carve-out is observed, not trusted', () => {
  // ⚠️ Until `runHeaderControlsScan` took a `base`, this could not be written: production keys files
  // against `repoRoot` while a fixture root lives in /tmp, so an injected key never matched and the
  // ONLY coverage of the skip was a mutation that inverted it. A carve-out whose working state has
  // never been observed is a carve-out on trust.
  const root = fixture({
    'a.tsx': 'nav.setOptions({ headerRight });\n',
    'b.tsx': 'nav.setOptions({ headerLeft });\n',
  });
  try {
    const all = runHeaderControlsScan(root, { exceptions: new Map(), base: root });
    assert.equal(all.length, 2, all.join('\n'));
    const exempted = runHeaderControlsScan(root, {
      exceptions: new Map([['a.tsx', 'a stated reason']]),
      base: root,
    });
    assert.equal(exempted.length, 1, exempted.join('\n'));
    assert.match(exempted[0], /^b\.tsx:1 — headerLeft — /);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the DEFAULT population is the real scan — not a set the suite always supplies', () => {
  // The `lint-i18n.test.mjs` precedent: a guard that is only ever exercised with an injected
  // argument is a guard on the injection. With the shipped (empty) map this is trivially [], so the
  // assertion that matters is that a bogus key is refused against the REAL collected population.
  assert.deepEqual(exemptionProblems(), []);
  assert.match(
    exemptionProblems(new Map([['apps/expo/src/lib/theme.ts', 'a stated reason']]))[0],
    /suppresses nothing/
  );
  assert.match(
    exemptionProblems(new Map([['apps/expo/src/lib/auth.test.ts', 'a stated reason']]))[0],
    /never visits/
  );
});

// ── the error that goes the OTHER way ────────────────────────────────────────
test('PINNED false positive: a regex literal naming a slot is reported', () => {
  // ⚠️ The gate-lib blanker caveat is documented as a silent fail-OPEN, and inheriting only that
  // half hides this one. The family does not blank REGEX LITERALS — telling `/x/` from division
  // needs a parser — so this is reported and there is no spelling that satisfies the gate. Pinned
  // rather than fixed: the fix is the shared lexer, and the cost here is near zero because these
  // names are reserved words in this codebase anyway. If this test ever fails, the lexer landed —
  // delete the test, do not re-open the hole.
  assert.equal(findRawHeaderSlots('const re = /headerRight:/;').length, 1);
});

// ── main(): the EXIT CODE, which no output assertion can see ─────────────────

/**
 * A throwaway repo root holding a COPY of the three scripts, so `main()` can be spawned against a
 * tree this test controls. `repoRoot` inside the gate derives from `import.meta.url`, so copying
 * the script somewhere else is what moves `apps/expo/src` — there is no env override, and adding
 * one just to be testable would be a production seam that exists for a test.
 */
const gateSandbox = (files = {}, { exceptions = null } = {}) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'header-controls-main-')));
  mkdirSync(join(root, 'scripts'));
  for (const f of ['gate-lib.mjs', 'lint-layers.mjs', 'lint-header-controls.mjs']) {
    copyFileSync(join(REPO_ROOT, 'scripts', f), join(root, 'scripts', f));
  }
  // The shipped map is empty by design, so the unusable-exemption branch is unreachable without
  // rewriting it — and it is the branch whose exit code was uncovered. Rewriting the COPY keeps the
  // real map empty and needs no production seam.
  if (exceptions) {
    const gate = join(root, 'scripts', 'lint-header-controls.mjs');
    const src = readFileSync(gate, 'utf8');
    const marker = 'export const EXCEPTIONS = new Map();';
    assert.ok(src.includes(marker), 'the EXCEPTIONS declaration moved — update this sandbox');
    writeFileSync(gate, src.replace(marker, `export const EXCEPTIONS = new Map(${exceptions});`));
  }
  for (const [rel, body] of Object.entries(files)) {
    const full = join(root, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, body);
  }
  return root;
};

const runGate = (root) =>
  spawnSync(process.execPath, [join(root, 'scripts', 'lint-header-controls.mjs')], {
    encoding: 'utf8',
    cwd: root,
  });

test('main() EXITS NON-ZERO on every fail branch — the residual nothing else covers', () => {
  // ⚠️ DELETE `process.exitCode = 1` FROM ANY FAIL BRANCH AND EVERY OTHER TEST STAYS GREEN. The
  // whole FAIL block still prints, and `gate-lib.test.mjs`'s two entrypoint doors assert only that
  // the output contains the label — never `r.status`. `pnpm lint` would then go green over a tree
  // the gate had just refused, which is the exact shape ("reports OK having checked nothing", one
  // step further on) that the three fail-closed floors exist to prevent.
  const live = { 'apps/expo/src/x.tsx': 'nav.setOptions({ headerRight });\n' };
  const cases = [
    ['missing scan root', {}, /required scan root\(s\) missing/, null],
    ['zero-file population', { 'apps/expo/src/.keep': '' }, /scanned zero source files/, null],
    ['a real violation', live, /headerRight/, null],
    // ⚠️ THE FOURTH BRANCH, WHICH THE DOCBLOCK CLAIMED WAS COVERED AND WAS NOT. Deleting
    // `process.exitCode = 1` from the unusable-exemption branch left every test in the repo green
    // — so the first exemption someone adds without a reason ships under a green `pnpm lint`,
    // which is the precise failure that branch exists to prevent.
    ['a blank exemption reason', live, /exemption has no reason/, "[['apps/expo/src/x.tsx', '']]"],
    ['a dead exemption', live, /suppresses nothing/, "[['apps/expo/src/y.tsx', 'a reason']]"],
  ];
  for (const [name, files, expected, exceptions] of cases) {
    const root = gateSandbox(
      exceptions ? { ...files, 'apps/expo/src/y.tsx': 'export const y = 1;\n' } : files,
      { exceptions }
    );
    try {
      const r = runGate(root);
      assert.equal(
        r.status,
        1,
        `${name}: expected exit 1, got ${r.status}\n${r.stdout}${r.stderr}`
      );
      assert.match(r.stderr, expected, name);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test('main() EXITS ZERO on a clean tree — so the assertion above is not vacuous', () => {
  const root = gateSandbox({
    'apps/expo/src/x.tsx': 'nav.setOptions({ headerRight: undefined });\n',
  });
  try {
    const r = runGate(root);
    assert.equal(r.status, 0, `expected exit 0, got ${r.status}\n${r.stdout}${r.stderr}`);
    assert.match(r.stdout, /lint:header-controls — OK/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the shipped exemption map is empty and sound', () => {
  assert.equal(EXCEPTIONS.size, 0);
  assert.deepEqual(exemptionProblems(), []);
});
