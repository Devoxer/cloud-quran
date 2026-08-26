/**
 * Self-tests for the lint:layers scanner (scripts/lint-layers.mjs).
 *
 * Run: `node --test scripts/__tests__/lint-layers.test.mjs`
 *
 * These assert the EVASION cases the Epic-16 review hardened against — the scanner is the
 * template's architecture gate, so a regression here silently lets layer violations through.
 * Pure helpers are tested directly (no fs fixtures, no subprocess).
 */

import assert from 'node:assert/strict';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  API_CHOKEPOINT,
  API_MODULE,
  chokepointHolds,
  classifyTarget,
  collectSourceFiles,
  extractImports,
  fileFeature,
  findApiClientUses,
  findApiModuleImports,
  findCycle,
  findGatingAntiPattern,
  hasBroadRnImport,
  isHookFile,
  isLibFile,
  isSharedFeatureViolation,
  isSharedLayerFile,
  missingRoots,
  OUTBOX_MODULE,
  ownBarrel,
  QUERY_CACHE_MODULE,
  QUERY_MODULE,
  queryModuleHolds,
  RN_UI_PRIMITIVES,
  RPC_CLIENT_MODULE,
  runApiChokepointScan,
  runGatingScan,
  runLayerScan,
  runQueryModuleChokepointScan,
} from '../lint-layers.mjs';

// ── gap (a): fail-closed on a missing scan root ─────────────────────────────
test('missingRoots: flags a non-existent root (fail-closed trigger)', () => {
  assert.deepEqual(missingRoots([['ghost', '/no/such/dir/xyz']]), ['ghost']);
});

test('missingRoots: real scan roots all exist (gate passes today)', () => {
  assert.deepEqual(missingRoots(), []);
});

// ── Epic-24 boundary: an UNREADABLE subtree must fail the walk, not vanish from it ──────────
//
// `collectSourceFiles` used to `catch {}` every readdir error and return an empty array, so one
// EACCES on `apps/expo/src/features` dropped that whole subtree from `lint:layers`, `lint:i18n`
// and `lint:style`, all of which then printed OK. The zero-file floors those gates carry are
// CONTAINER-level — they ask whether the WHOLE root came back empty — and cannot see a root that
// came back 90% full.
test('collectSourceFiles: an unreadable subdirectory THROWS rather than dropping its subtree', () => {
  // `realpathSync` because the walker canonicalizes its root and every emitted path — on macOS
  // `mkdtemp` hands back `/var/...`, a symlink to `/private/var/...`, so the raw prefix no longer
  // strips. That is the fix working, not an accident of this test.
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'lint-walk-')));
  const locked = join(root, 'locked');
  try {
    writeFileSync(join(root, 'a.ts'), 'export const a = 1;');
    mkdirSync(locked);
    writeFileSync(join(locked, 'b.ts'), 'export const b = 2;');

    // Sanity FIRST, so a chmod that silently fails (a permissive filesystem, a root-ish CI user)
    // shows up as this assertion rather than as a vacuously-passing throws() below.
    assert.deepEqual(
      collectSourceFiles(root)
        .map((f) => f.replace(`${root}/`, ''))
        .sort(),
      ['a.ts', 'locked/b.ts']
    );

    chmodSync(locked, 0o000);
    let result = null;
    let error = null;
    try {
      result = collectSourceFiles(root);
    } catch (err) {
      error = err;
    }

    // ⚠️ The skip condition is "the walker STILL SAW the locked file", not "it did not throw".
    // Skipping on the latter is what makes this test unfailable: the defect's whole signature is
    // returning normally with the subtree missing, which is exactly what a "did not throw" escape
    // hatch waves through. (Caught by mutation-testing the restored `catch {}` — it passed.)
    if (error === null && result.some((f) => f.endsWith('b.ts'))) {
      return; // the filesystem/user ignores the mode bits — there is nothing to observe here
    }

    assert.ok(error, 'the walker returned normally with an unreadable subtree silently dropped');
    assert.match(String(error.message), /cannot read directory/);
  } finally {
    try {
      chmodSync(locked, 0o755);
    } catch {
      /* already restored or never created */
    }
    rmSync(root, { recursive: true, force: true });
  }
});

// ── The walk emits CANONICAL paths, and never descends a symlinked directory ────────────────
//
// The recursion used to pass the ALIAS path, so with `features/alias -> lib` the first route to a
// directory won and the canonical route was then skipped as already-visited: the file was emitted
// ONLY under the alias. Both consequences are fail-open, and the second is the serious one —
// layer classification and every exemption match are path-PREFIX tests, so a `lib/` subtree
// reached through an in-tree symlink under `features/` classifies as a FEATURE and rule 2 stops
// applying to it.
//
// MUTATION RECIPE (all three cases): remove the `real !== full` block from **BOTH** the directory
// and the file branch of `walkSourceFiles`, with `visited` defaulted rather than seeded. Verified
// at Step I: that reds all three (`pass 2 fail 6`).
//
// ⚠️ THIS RECIPE HAS NOW BEEN WRONG TWICE, IN OPPOSITE DIRECTIONS, AND THE SECOND TIME WAS SELF-
// INFLICTED. Round 1 corrected it from "case 2 stays green" to "reds ALL THREE" — and the same
// round's file-branch guard then made the corrected version false, in the same commit. Mutating the
// DIRECTORY branch alone now leaves cases 2 and 3 GREEN, because the file guard catches them by the
// other kind: `sub/back/top.ts` is skipped by the file rule and `away/far.ts` throws the file-kind
// refusal. A recipe naming one branch of a two-branch guard is a claim about coverage the other
// branch quietly satisfies, which is why the per-kind recipe below is scoped to its own branch and
// this one says BOTH. Re-run a recipe after any round that touches the guard it names — a stale
// recipe misdirects the next round's proof, and reads as more authoritative for being specific.
test('collectSourceFiles: a symlinked directory INSIDE the root is skipped, and the canonical route still emits', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'lint-walk-alias-')));
  try {
    mkdirSync(join(root, 'sub'));
    writeFileSync(join(root, 'top.ts'), 'export const a = 1;');
    writeFileSync(join(root, 'sub/deep.ts'), 'export const b = 2;');
    symlinkSync('sub', join(root, 'alias'));

    const seen = collectSourceFiles(root)
      .map((f) => f.replace(`${root}/`, ''))
      .sort();
    // The canonical path is present and the alias path is absent — NOT merely "the file appears
    // once", which the defect also satisfied.
    assert.deepEqual(seen, ['sub/deep.ts', 'top.ts']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('collectSourceFiles: a link pointing at an ANCESTOR does not scan the root twice', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'lint-walk-loop-')));
  try {
    mkdirSync(join(root, 'sub'));
    writeFileSync(join(root, 'top.ts'), 'export const a = 1;');
    writeFileSync(join(root, 'sub/deep.ts'), 'export const b = 2;');
    symlinkSync('..', join(root, 'sub/back')); // sub/back -> root

    const seen = collectSourceFiles(root)
      .map((f) => f.replace(`${root}/`, ''))
      .sort();
    assert.deepEqual(seen, ['sub/deep.ts', 'top.ts']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('collectSourceFiles: a link whose target is OUTSIDE the root THROWS — it must not be skipped', () => {
  // ⚠️ This is the case a blanket `continue` would get wrong. Skipping an in-root link is safe
  // because the canonical route reaches those files; an out-of-root target has NO canonical route,
  // so skipping it silently narrows the population of a fail-closed gate — the same failure the
  // walker's own "refusing to scan a partial tree" error exists to refuse.
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'lint-walk-out-')));
  const root = join(base, 'root');
  try {
    mkdirSync(root);
    mkdirSync(join(base, 'outside'));
    writeFileSync(join(root, 'top.ts'), 'export const a = 1;');
    writeFileSync(join(base, 'outside/far.ts'), 'export const c = 3;');
    symlinkSync('../outside', join(root, 'away'));

    assert.throws(() => collectSourceFiles(root), /OUTSIDE the scanned population/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

/**
 * ⚠️ THE SAME RULE FOR A SYMLINKED **FILE** — the half the first round left open (Story 35.4 Step G,
 * found independently by all three review layers). `features/alias.ts -> ../lib/real.ts` emitted
 * BOTH paths, so one file was classified once as a feature and once as `lib/`, and an out-of-root
 * file link was pulled in under a fabricated in-root path while the directory branch threw for
 * exactly that case. The docblock claimed "EVERY EMITTED PATH IS CANONICAL" throughout.
 *
 * MUTATION RECIPE: delete the `real !== full` block from the FILE branch of `walkSourceFiles`
 * (leaving the directory one intact). Both assertions below red; every directory test stays green,
 * which is the point — a per-kind guard needs a per-kind fixture.
 */
test('collectSourceFiles: a symlinked FILE is skipped, and only its canonical path is emitted', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'lint-walk-file-')));
  try {
    mkdirSync(join(root, 'lib'));
    mkdirSync(join(root, 'features'));
    writeFileSync(join(root, 'lib/real.ts'), 'export const a = 1;');
    symlinkSync('../lib/real.ts', join(root, 'features/alias.ts'));

    const seen = collectSourceFiles(root)
      .map((f) => f.replace(`${root}/`, ''))
      .sort();
    assert.deepEqual(seen, ['lib/real.ts']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('collectSourceFiles: a FILE link whose target is OUTSIDE the population THROWS', () => {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'lint-walk-file-out-')));
  const root = join(base, 'root');
  try {
    mkdirSync(root);
    mkdirSync(join(base, 'outside'));
    writeFileSync(join(root, 'top.ts'), 'export const a = 1;');
    writeFileSync(join(base, 'outside/far.ts'), 'export const c = 3;');
    symlinkSync('../outside/far.ts', join(root, 'away.ts'));

    assert.throws(() => collectSourceFiles(root), /OUTSIDE the scanned population/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

/**
 * ⚠️ THE THROW IS ABOUT THE SCANNED POPULATION, NOT THE DIRECTORY BEING WALKED.
 *
 * `runLayerScan`'s rule-4 loop walks `features/`, `hooks/` and `components/` one at a time while
 * the population it is responsible for is all of `EXPO_SRC`. Keyed on the WALK root, a link from
 * `features/a` into `lib/` threw there while the whole-tree walks correctly skipped it — the gate
 * refusing a tree it can fully scan, which is the "reds CI on correct code" class this story exists
 * to remove. `populationRoot` is what makes the two agree.
 *
 * MUTATION RECIPE: drop the `{ populationRoot }` option from `collectSourceFiles` — the second
 * assertion throws. ⚠️ Deleting the `populationRoot: EXPO_SRC` ARGUMENT at the rule-4 call site is
 * NOT covered: no test reds, because the tree contains no symlink for it to matter to. That is the
 * declaration-vs-wiring gap, stated rather than papered over — the option is proved, its one live
 * call site is not. Its failure direction is fail-CLOSED (a loud false refusal), which is why it is
 * accepted here instead of buying a fixture repo to pin it.
 */
test('collectSourceFiles: an in-POPULATION link is skipped even when the walk root is narrower', () => {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'lint-walk-pop-')));
  try {
    mkdirSync(join(base, 'lib'));
    mkdirSync(join(base, 'features'));
    writeFileSync(join(base, 'lib/x.ts'), 'export const a = 1;');
    symlinkSync('../lib', join(base, 'features/alias'));

    // Whole-tree walk: the link is inside the root, so it is skipped and `lib/x.ts` still emits.
    assert.deepEqual(
      collectSourceFiles(base).map((f) => f.replace(`${base}/`, '')),
      ['lib/x.ts']
    );
    // Narrower walk root, same population — must NOT throw, and emits nothing of its own.
    assert.deepEqual(
      collectSourceFiles(join(base, 'features'), { populationRoot: base }),
      [],
      'a link the population reaches by its canonical route must be skipped, not refused'
    );
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

/**
 * ⚠️ IN-POPULATION IS NOT THE SAME QUESTION AS REACHED-BY-A-CANONICAL-ROUTE (Story 35.4 Step I,
 * found independently by two layers that then disagreed on its severity).
 *
 * The skip rule's whole justification is "the canonical route reaches those files". That is false
 * when the canonical route runs through a directory the walk excludes BY NAME: the alias is skipped
 * as in-population and the real path is skipped as excluded, so the files are scanned by NOTHING —
 * no throw, no output, `lint:layers — OK`. Reproduced for both entry kinds and all three names.
 *
 * MUTATION RECIPE: change `reachedByCanonicalWalk` back to `inPopulation` alone (equivalently,
 * delete the `underExcludedDir` term). Both assertions below red; every other walk test stays
 * green, which is what makes this a distinct guard rather than a restatement of the out-of-root one.
 */
test('collectSourceFiles: a link into an EXCLUDED directory throws — in-population is not reachable', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'lint-walk-excluded-')));
  try {
    mkdirSync(join(root, 'node_modules/vendored'), { recursive: true });
    mkdirSync(join(root, '__tests__'), { recursive: true });
    mkdirSync(join(root, 'features'), { recursive: true });
    writeFileSync(join(root, 'features/real.ts'), 'export const a = 1;');
    writeFileSync(join(root, 'node_modules/vendored/bad.ts'), 'export const b = 2;');
    writeFileSync(join(root, '__tests__/helper.ts'), 'export const c = 3;');

    // A DIRECTORY link into an excluded tree.
    symlinkSync('../node_modules/vendored', join(root, 'features/vendored'));
    assert.throws(() => collectSourceFiles(root), /NO canonical route reaches it/);
    rmSync(join(root, 'features/vendored'));

    // The SAME rule for a FILE link — a per-kind guard needs a per-kind fixture.
    symlinkSync('../__tests__/helper.ts', join(root, 'features/helper.ts'));
    assert.throws(() => collectSourceFiles(root), /NO canonical route reaches it/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/**
 * ⚠️ THE WALK ROOT GETS THE SAME RULE AS EVERY ENTRY BELOW IT (Story 35.4 Step I).
 *
 * `collectSourceFiles` canonicalizes its root before any check runs, so the guard only ever saw
 * links found DURING the walk — and the IDENTICAL link behaved two opposite ways depending on where
 * it sat: found mid-walk it threw, used AS the walk root it was followed silently, emitting paths
 * outside `repoRoot` where every layer rule's path-PREFIX test stops matching (`classifyTarget`
 * returns null, so the rules skip those files rather than judging them).
 *
 * The second assertion is the one that must NOT throw, and it is why the fix is a population test
 * rather than "the root must not be a symlink": rule 4 walks `features`/`hooks`/`components` one at
 * a time against the whole-tree population, and round 1 fixed a throw that fired there on a CORRECT
 * tree. Pinning both directions is what stops this guard re-breaking that one.
 *
 * MUTATION RECIPE: delete the `reachedByCanonicalWalk(root, population)` check in
 * `collectSourceFiles`. The first assertion reds; the second stays green.
 */
test('collectSourceFiles: a walk ROOT pointing outside its population throws', () => {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'lint-walk-root-')));
  const pop = join(base, 'src');
  try {
    mkdirSync(join(pop, 'features'), { recursive: true });
    mkdirSync(join(base, 'elsewhere'), { recursive: true });
    writeFileSync(join(pop, 'features/a.ts'), 'export const a = 1;');
    writeFileSync(join(base, 'elsewhere/far.ts'), 'export const c = 3;');
    symlinkSync('../elsewhere', join(pop, 'escaped'));

    assert.throws(
      () => collectSourceFiles(join(pop, 'escaped'), { populationRoot: pop }),
      /OUTSIDE the scanned population/
    );
    // A sub-root genuinely inside the population is walked normally — the rule-4 shape.
    assert.deepEqual(
      collectSourceFiles(join(pop, 'features'), { populationRoot: pop }).map((f) =>
        f.replace(`${pop}/`, '')
      ),
      ['features/a.ts']
    );
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('collectSourceFiles: a directory that does not exist stays SOFT (callers probe optional roots)', () => {
  // ENOENT is the one error that must not throw: the per-root loop in `runLayerScan` probes
  // directories that legitimately may not be there.
  assert.deepEqual(collectSourceFiles('/no/such/dir/xyz'), []);
});

// ── gap (d): require('react-native') + dynamic import evade the named scan ───
test('hasBroadRnImport: namespace / default / require / dynamic-import all caught', () => {
  assert.equal(hasBroadRnImport("import * as RN from 'react-native'"), true);
  assert.equal(hasBroadRnImport("import RN from 'react-native'"), true);
  assert.equal(hasBroadRnImport("const RN = require('react-native')"), true);
  assert.equal(hasBroadRnImport("const RN = await import('react-native')"), true);
});

test('hasBroadRnImport: a named runtime-util import is NOT broad', () => {
  assert.equal(hasBroadRnImport("import { Platform } from 'react-native'"), false);
  assert.equal(hasBroadRnImport("import type { View } from 'react-native'"), false);
});

// ── gap (d): type-only specifiers are runtime-erased → not layer coupling ────
test('extractImports: whole `import type {…}` yields no runtime named imports', () => {
  const [imp] = extractImports("import type { View, Text } from 'react-native'");
  assert.deepEqual(imp.named, []);
});

test('extractImports: inline `type X` specifiers are dropped, runtime ones kept', () => {
  const [imp] = extractImports("import { Platform, type ViewStyle, View } from 'react-native'");
  // `type ViewStyle` dropped; Platform + View kept — and View (a UI primitive) is now correctly seen
  assert.deepEqual(imp.named, ['Platform', 'View']);
  assert.ok(
    imp.named.some((n) => RN_UI_PRIMITIVES.has(n)),
    'View must be detected as a primitive'
  );
});

test('extractImports: `{ type View }` (the old mis-parse) no longer leaks as the bare word "type"', () => {
  const [imp] = extractImports("import { type View } from 'react-native'");
  assert.deepEqual(imp.named, []); // type-only → erased; previously parsed as ['type']
});

test('extractImports: require() and dynamic import() specs are captured', () => {
  const specs = extractImports("const a = require('react-native'); const b = import('@/x');").map(
    (i) => i.source
  );
  assert.ok(specs.includes('react-native'));
  assert.ok(specs.includes('@/x'));
});

// ── feature-first classification (Story 21.3) ───────────────────────────────
test('classifyTarget: a deep import INTO a feature is `deep`; the public barrel is not', () => {
  // A deep path into another feature = a bypass trigger; the bare/`/index` barrel = an allowed edge.
  assert.deepEqual(
    classifyTarget('apps/expo/src/features/collection/components/CollectionPickerSheet'),
    {
      feature: 'collection',
      deep: true,
    }
  );
  assert.deepEqual(classifyTarget('apps/expo/src/features/collection/hooks/useCreateCollection'), {
    feature: 'collection',
    deep: true,
  });
  assert.deepEqual(classifyTarget('apps/expo/src/features/collection'), {
    feature: 'collection',
    deep: false,
  });
  assert.deepEqual(classifyTarget('apps/expo/src/features/collection/index'), {
    feature: 'collection',
    deep: false,
  });
});

test('classifyTarget: shared layers (components/ui|layout, lib, hooks/auth) are NOT features → null', () => {
  assert.equal(classifyTarget('apps/expo/src/components/ui/ModeToggle'), null);
  assert.equal(classifyTarget('apps/expo/src/components/layout/ContentContainer'), null);
  assert.equal(classifyTarget('apps/expo/src/hooks/auth'), null); // auth = shared infra, not a feature
  assert.equal(classifyTarget('apps/expo/src/lib/theme'), null);
  assert.equal(classifyTarget(null), null);
});

test('fileFeature: derives the feature of a source file under features/{x}/ across all sub-kinds', () => {
  assert.equal(fileFeature('apps/expo/src/features/library/components/Foo.tsx'), 'library');
  assert.equal(fileFeature('apps/expo/src/features/feed/hooks/useFeed.ts'), 'feed');
  assert.equal(fileFeature('apps/expo/src/features/player/lib/audioMode.ts'), 'player');
  assert.equal(fileFeature('apps/expo/src/hooks/useGuestGate.ts'), null); // shared top-level hook
  assert.equal(fileFeature('apps/expo/src/hooks/auth/useAuth.ts'), null); // auth = shared infra
  assert.equal(fileFeature('apps/expo/src/components/ui/Chip.tsx'), null); // shared layer
});

// ── cross-feature bypass: deep into a SIBLING feature is forbidden (barrel only) ─────────────
test('cross-feature bypass scenario: a feature file deep-importing a SIBLING is flagged-shaped', () => {
  const from = fileFeature('apps/expo/src/features/player/components/AudioPlayer.tsx'); // player
  const deepIntoSibling = classifyTarget(
    'apps/expo/src/features/collection/hooks/useCreateCollection'
  );
  assert.equal(from, 'player');
  assert.ok(deepIntoSibling.deep && deepIntoSibling.feature !== from); // deep into a DIFFERENT feature = bypass
  // …whereas the sibling PUBLIC BARREL is an allowed edge (recorded for cycle detection, not flagged).
  const viaBarrel = classifyTarget('apps/expo/src/features/collection');
  assert.equal(viaBarrel.deep, false);
  assert.notEqual(viaBarrel.feature, from);
});

test('same-feature deep import is allowed (own sub-kind path, not a bypass)', () => {
  const from = fileFeature('apps/expo/src/features/player/components/AudioPlayer.tsx'); // player
  const ownHooks = classifyTarget('apps/expo/src/features/player/hooks/usePlaybackMode'); // {player, deep}
  assert.equal(ownHooks.feature, from); // same feature → runLayerScan `continue`s (allowed)
});

// ── unified cycle detection (the feature graph must be a DAG) ────────────────
test('findCycle: detects a feature cycle unified across sub-kinds (A→B and B→A)', () => {
  const edges = new Map([
    ['library', new Set(['book'])],
    ['book', new Set(['library'])],
  ]);
  const cycle = findCycle(edges);
  assert.ok(cycle, 'an A↔B cycle must be detected');
  assert.equal(cycle[0], cycle[cycle.length - 1]); // closed loop
});

test('findCycle: the actual residual feature edges (player→…, library→book, discover→book) are an acyclic DAG', () => {
  const edges = new Map([
    ['player', new Set(['collection', 'library', 'notes'])],
    ['library', new Set(['book'])],
    ['discover', new Set(['book'])],
  ]);
  assert.equal(findCycle(edges), null);
});

// ── self-barrel detection (require-cycle guard) ─────────────────────────────
test('ownBarrel: feature → its public barrel; auth/top-level hooks + ui/layout → their barrels', () => {
  assert.equal(
    ownBarrel('apps/expo/src/features/library/components/Foo.tsx'),
    'apps/expo/src/features/library' // importing @/features/library from here = self-barrel cycle
  );
  assert.equal(
    ownBarrel('apps/expo/src/features/player/lib/audioMode.ts'),
    'apps/expo/src/features/player'
  );
  assert.equal(ownBarrel('apps/expo/src/hooks/auth/useAuth.ts'), 'apps/expo/src/hooks/auth');
  assert.equal(ownBarrel('apps/expo/src/hooks/useGuestGate.ts'), 'apps/expo/src/hooks');
  assert.equal(ownBarrel('apps/expo/src/components/ui/Button.tsx'), 'apps/expo/src/components/ui');
  assert.equal(ownBarrel('apps/expo/src/lib/theme.ts'), null); // flat lib has no barrel
});

// ── rule-1 / rule-2 generalize to a feature's OWN hooks/ // lib/ (Story 21.3) ────────────────
test('isHookFile: a feature own hook is a rule-1 subject, like the shared hooks', () => {
  assert.equal(isHookFile('apps/expo/src/features/feed/hooks/useFeedQueue.ts'), true);
  assert.equal(isHookFile('apps/expo/src/hooks/useGuestGate.ts'), true);
  assert.equal(isHookFile('apps/expo/src/features/player/components/AudioPlayer.tsx'), false);
});

test('isLibFile: a feature own lib is a rule-2 subject, like the shared lib', () => {
  assert.equal(isLibFile('apps/expo/src/features/player/lib/audioMode.ts'), true);
  assert.equal(isLibFile('apps/expo/src/lib/theme.ts'), true);
  assert.equal(isLibFile('apps/expo/src/features/player/components/AudioPlayer.tsx'), false);
});

// ── rule-5: the SHARED layer must not import a FEATURE (Story 21.4) ──────────
// Building block: the shared-layer subject set is the COMPLEMENT of (features ∪ routes).
test('isSharedLayerFile: every shared kind is a subject; features/ and app/ are NOT', () => {
  // Shared layers (rule-5 subjects) — incl. dirs that don't exist yet (closure-complete).
  for (const f of [
    'apps/expo/src/lib/theme.ts',
    'apps/expo/src/hooks/useGuestGate.ts',
    'apps/expo/src/hooks/auth/useAuth.ts', // auth = shared infra
    'apps/expo/src/components/ui/Button.tsx',
    'apps/expo/src/components/layout/ContentContainer.tsx',
    'apps/expo/src/stores/audioPlayerStore.ts',
    'apps/expo/src/contexts/AmbientContext.tsx',
    'apps/expo/src/constants/spacing.ts',
    'apps/expo/src/types/models.ts',
    'apps/expo/src/config/flags.ts', // a future shared dir — still covered (complement defn)
  ]) {
    assert.equal(isSharedLayerFile(f), true, `${f} must be a shared-layer subject`);
  }
  // NOT subjects: a feature file (rule-4's domain) and a route (mounting a feature is the point).
  assert.equal(
    isSharedLayerFile('apps/expo/src/features/player/hooks/useNetworkFallback.ts'),
    false
  );
  assert.equal(isSharedLayerFile('apps/expo/src/app/(tabs)/library.tsx'), false);
  assert.equal(isSharedLayerFile('apps/worker/src/index.ts'), false); // outside expo src
});

test('isSharedFeatureViolation (a) positive: a shared file importing a feature IS flagged', () => {
  // A lib/ AND a top-level hooks/ file reaching into a feature — both reported by rule-5.
  assert.equal(
    isSharedFeatureViolation('apps/expo/src/lib/foo.ts', 'apps/expo/src/features/library'),
    true
  );
  assert.equal(
    isSharedFeatureViolation('apps/expo/src/hooks/useFoo.ts', 'apps/expo/src/features/player'),
    true
  );
});

test('isSharedFeatureViolation (b) negative route: app/ importing a feature is NOT flagged', () => {
  // Routes mount feature screens — exempt from rule-5.
  assert.equal(
    isSharedFeatureViolation(
      'apps/expo/src/app/(tabs)/library.tsx',
      'apps/expo/src/features/library'
    ),
    false
  );
});

test('isSharedFeatureViolation (c) negative feature: a feature→feature barrel edge is NOT rule-5', () => {
  // The cross-feature barrel edge stays governed by rule-4 (allowed + cycle-checked), not rule-5.
  assert.equal(
    isSharedFeatureViolation(
      'apps/expo/src/features/player/components/AudioPlayer.tsx',
      'apps/expo/src/features/library'
    ),
    false
  );
});

test('isSharedFeatureViolation (d) barrel-vs-deep parity: a shared file is flagged either way', () => {
  // A shared file must not reach a feature by ANY path — both the public barrel and a deep module.
  const barrel = isSharedFeatureViolation(
    'apps/expo/src/lib/foo.ts',
    'apps/expo/src/features/library'
  );
  const deep = isSharedFeatureViolation(
    'apps/expo/src/lib/foo.ts',
    'apps/expo/src/features/library/hooks/useOfflineBooks'
  );
  assert.equal(barrel, true);
  assert.equal(deep, true);
});

test('isSharedFeatureViolation: a shared→shared import (no feature target) is NOT flagged', () => {
  // classifyTarget returns null for a non-feature target → no violation.
  assert.equal(
    isSharedFeatureViolation('apps/expo/src/lib/theme.ts', 'apps/expo/src/lib/useColorScheme'),
    false
  );
  assert.equal(
    isSharedFeatureViolation('apps/expo/src/hooks/useGuestGate.ts', 'apps/expo/src/lib/storage'),
    false
  );
});

// ── end-to-end: the whole scan is green on the real feature-first tree ───────
test('runLayerScan: reports ZERO on the live feature-first tree (all of rule-1/2/3/4/5 green)', () => {
  // Proves the ported scan handles the new layout with no false positives — incl. the residual
  // cross-feature barrel edges (a DAG), `auth` treated as shared, the player feature's own lib
  // (features/player/lib/audioMode uses RN runtime utils, correctly NOT flagged by rule-2), and
  // rule-5: after 21.4 relocated useNetworkFallback into features/player, the shared layer has
  // ZERO feature edges (the relocated hook's `@/features/library` import is now a feature→feature
  // barrel edge, governed by rule-4, not rule-5).
  assert.deepEqual(runLayerScan(), []);
});

// ── first-frame gating anti-pattern scan (Story 18.6) ───────────────────────
// The tripwire for the cheat-sheet § State boundary race: a boolean useState gating var whose
// setter is fed a value derived from a reactive remote/SDK source. Verified zero on the live tree.

test('findGatingAntiPattern: flags the naive useQuery-derived gate (the race)', () => {
  const code = `function C() {
    const [ok, setOk] = useState(false);
    const { data } = db.useQuery({ x: {} });
    useEffect(() => setOk(!!data?.x), [data]);
    return ok ? <Premium/> : <Locked/>;
  }`;
  const v = findGatingAntiPattern(code);
  assert.equal(v.length, 1);
  assert.equal(v[0].setter, 'setOk');
  assert.equal(v[0].state, 'ok');
});

test('findGatingAntiPattern: flags useAuth- and customer-info-listener-derived gates', () => {
  const authCase =
    'const { user } = useAuth(); const [g,setG]=useState(true); useEffect(()=>setG(!user),[user]);';
  assert.equal(findGatingAntiPattern(authCase).length, 1);
  const listenerCase =
    'const [s,setS]=useState(false); addCustomerInfoUpdateListener((info)=>setS(info.entitlements.active.premium!==undefined));';
  assert.equal(findGatingAntiPattern(listenerCase).length, 1);
});

test('findGatingAntiPattern: imperative operation flag (literal setters) is NOT the race', () => {
  // setIsLoading(true/false) around an await — the dominant shape in the tree; must not match.
  const code =
    'const { data } = useQuery({x:{}}); const [isLoading,setIsLoading]=useState(false); async function go(){ setIsLoading(true); await x(); setIsLoading(false); }';
  assert.equal(findGatingAntiPattern(code).length, 0);
});

test('findGatingAntiPattern: MMKV-first-frame seed (no reactive source) is compliant', () => {
  const code =
    'const [v,setV]=useState(()=>cache.getBoolean(K) ?? false); useEffect(()=>setV(cache.getBoolean(K)??false),[]);';
  assert.equal(findGatingAntiPattern(code).length, 0);
});

test('findGatingAntiPattern: a setter fed a NON-reactive local is not flagged', () => {
  const code =
    'const { data } = useQuery({x:{}}); const [a,setA]=useState(false); const local = Math.random() > 0.5; setA(local);';
  assert.equal(findGatingAntiPattern(code).length, 0);
});

test('findGatingAntiPattern: `// lint-gating-ok` allow-lists same-line and line-above', () => {
  const sameLine =
    'const { data } = db.useQuery({x:{}}); const [ok,setOk]=useState(false); useEffect(()=>setOk(!!data?.x)); // lint-gating-ok: thin SDK wrapper';
  assert.equal(findGatingAntiPattern(sameLine).length, 0);
  const lineAbove =
    'const { data } = db.useQuery({x:{}});\n const [ok,setOk]=useState(false);\n // lint-gating-ok: sanctioned\n useEffect(()=>setOk(!!data?.x));';
  assert.equal(findGatingAntiPattern(lineAbove).length, 0);
});

/**
 * ⚠️ THE MARKER MUST BE CARRIED, NOT MENTIONED (Epic-24 boundary, HIGH).
 *
 * This was a bare `/lint-gating-ok/` over the raw line, so prose merely NAMING the marker switched
 * the rule off. The blast radius is bigger than the i18n twin's: the allow-list is consulted at
 * four lines (setter call, useState decl, and the line above each), so one sentence above a
 * `useState` disabled the rule for every setter call on that state, file-wide.
 */
test('findGatingAntiPattern: prose MENTIONING lint-gating-ok is not a carve-out', () => {
  const violation =
    'const { data } = db.useQuery({x:{}});\n const [ok,setOk]=useState(false);\n useEffect(()=>setOk(!!data?.x));';
  // Anti-vacuity: the fixture really is a violation without any comment.
  assert.equal(findGatingAntiPattern(violation).length, 1);

  // A sentence naming the marker, above the useState — the shape that defeated the predecessor.
  const prose =
    'const { data } = db.useQuery({x:{}});\n // NOTE: sanctioned wrappers use lint-gating-ok, see the layers gate\n const [ok,setOk]=useState(false);\n useEffect(()=>setOk(!!data?.x));';
  assert.equal(findGatingAntiPattern(prose).length, 1);

  // The same mention inside a block comment's prose.
  const blockProse =
    'const { data } = db.useQuery({x:{}});\n /**\n  * Carve-outs use // lint-gating-ok: reason\n  */\n const [ok,setOk]=useState(false);\n useEffect(()=>setOk(!!data?.x));';
  assert.equal(findGatingAntiPattern(blockProse).length, 1);

  // And a bare marker with no `:` reason no longer suppresses — the reason IS the decision.
  const noReason =
    'const { data } = db.useQuery({x:{}});\n // lint-gating-ok\n const [ok,setOk]=useState(false);\n useEffect(()=>setOk(!!data?.x));';
  assert.equal(findGatingAntiPattern(noReason).length, 1);
});

// The blanker family moved to `scripts/gate-lib.mjs`; its length/terminator-preservation tests
// live in `gate-lib.test.mjs`, next to the line index that depends on that invariant.

test('findGatingAntiPattern: `// lint-gating-ok` on the useState line (separated from the setter) allow-lists', () => {
  // The setter call is several lines below the useState site — the allow-list must be honored on the
  // useState line itself (and the line above it), not only relative to the setter call.
  const onDecl =
    'const { data } = db.useQuery({x:{}});\n const [ok,setOk]=useState(false); // lint-gating-ok: wrapper\n const a=1;\n const b=2;\n useEffect(()=>setOk(!!data?.x));';
  assert.equal(findGatingAntiPattern(onDecl).length, 0);
  const aboveDecl =
    'const { data } = db.useQuery({x:{}});\n // lint-gating-ok: sanctioned\n const [ok,setOk]=useState(false);\n const a=1;\n useEffect(()=>setOk(!!data?.x));';
  assert.equal(findGatingAntiPattern(aboveDecl).length, 0);
});

test('findGatingAntiPattern: lazy-literal `useState(() => false)` fed from a reactive source is the race', () => {
  const code =
    'const { data } = useQuery({x:{}}); const [gated,setGated]=useState(() => false); useEffect(()=>setGated(data.x));';
  assert.equal(findGatingAntiPattern(code).length, 1);
});

test('findGatingAntiPattern: lazy CACHE seed stays compliant even with a reactive source present', () => {
  // `useState(() => cache.get() ?? false)` returns a non-literal, so it is not a boolean gate seed.
  const code =
    'const { data } = useQuery({x:{}}); const [v,setV]=useState(() => cache.getBoolean(K) ?? false); useEffect(()=>setV(cache.getBoolean(K) ?? false),[]);';
  assert.equal(findGatingAntiPattern(code).length, 0);
});

test('findGatingAntiPattern: a `$`-prefixed reactive binding is still matched (identifier boundary)', () => {
  const code =
    'const { data: $d } = db.useQuery({x:{}}); const [ok,setOk]=useState(false); useEffect(()=>setOk(!!$d?.x));';
  assert.equal(findGatingAntiPattern(code).length, 1);
});

/**
 * ⚠️ THE FAIL-OPEN THAT MOTIVATED THE SHARED LINE INDEX, END TO END.
 *
 * The allow-list array was split on the full terminator set while `lineOf` counted only `\n`, so
 * ONE lone `\r` / U+2028 / U+2029 anywhere above a violation shifted every later line number off
 * the array — and an UNRELATED carve-out two lines above the `useState` then suppressed a genuine
 * violation. The blankers made it worse by turning such a character inside a string or comment
 * into a space, so even a correct counter drifted.
 *
 * ⚠️ The fixture needs an ACTUAL lone terminator: an LF-only version passes with every fix
 * reverted, which is the whole reason this class survived a review round. They are BUILT from
 * `String.fromCharCode`, never typed — a literal U+2028 terminates the statement it lands in.
 *
 * MUTATION RECIPE: `markerLines` → `code.split('\n')`, or `lineOfIndex` → a `\n` count. Each reds
 * the three exotic cases and leaves the LF control green.
 */
test('findGatingAntiPattern: a lone CR / U+2028 / U+2029 cannot make an unrelated carve-out suppress', () => {
  const LS = String.fromCharCode(0x2028);
  const PS = String.fromCharCode(0x2029);
  const CR = String.fromCharCode(0x0d);

  // The marker is TWO lines above the useState, so it must never suppress. The separator goes
  // mid-line — a `\r` immediately before a `\n` is CRLF, i.e. one terminator, and desyncs nothing.
  const src = (sep) =>
    [
      `const { data } = useQuery({x:{}});${sep} // trailing`,
      '// lint-gating-ok: something unrelated',
      'const dummy = 1;',
      'const [ok,setOk]=useState(false);',
      'useEffect(()=>setOk(!!data?.x));',
    ].join('\n');

  for (const [name, sep] of [
    ['LF only', ''],
    ['LF control above', '\n'],
    ['lone CR', CR],
    ['U+2028', LS],
    ['U+2029', PS],
  ]) {
    assert.equal(findGatingAntiPattern(src(sep)).length, 1, name);
  }
});

/**
 * The marker is read from a STRINGS-BLANKED line, which closes both directions at once.
 * MUTATION RECIPE: `splitLines(blankStrings(code))` → `splitLines(code)`. Both halves red.
 */
test('findGatingAntiPattern: a carve-out beside a URL counts; one spelled inside a string does not', () => {
  // Direction 1 — a legitimate carve-out sharing its line with a URL string. Taking the line's
  // first `//` from raw text finds the one inside `'https://…'`, so this reddened a correct tree.
  const besideUrl = [
    'const { data } = useQuery({x:{}});',
    "const DOCS = 'https://example.com'; // lint-gating-ok: sanctioned SDK wrapper",
    'const [ok,setOk]=useState(false);',
    'useEffect(()=>setOk(!!data?.x));',
  ].join('\n');
  assert.equal(findGatingAntiPattern(besideUrl).length, 0);

  // Direction 2 — the mirror fail-open: a string whose CONTENT spells the marker suppressed.
  const mentionedInString = [
    'const { data } = useQuery({x:{}});',
    "const DOC = '// lint-gating-ok: x';",
    'const [ok,setOk]=useState(false);',
    'useEffect(()=>setOk(!!data?.x));',
  ].join('\n');
  assert.equal(findGatingAntiPattern(mentionedInString).length, 1);
});

test('blankCommentsAndStrings: a `//` comment after a ternary colon is blanked (no false match)', () => {
  // A `: //comment` must be treated as a comment, not protected as a `://` URL.
  const code =
    'const { data } = useQuery({x:{}});\n const [ok,setOk]=useState(false);\n const z = cond ? a : // setOk(data)\n b;';
  assert.equal(findGatingAntiPattern(code).length, 0);
});

test('runGatingScan: reports ZERO on the live tree (real gating lives in allow-listed wrappers)', () => {
  assert.deepEqual(runGatingScan(), []);
});

// story 5-2: four tests covered the raw-db-query tripwire — the three evasion/positive cases on
// `findRawDbQueryCalls` and the zero-on-the-live-tree assertion from `runRawDbQueryScan`. Both
// exports went with the vendor SDK the rule policed (see the note at the same place in
// lint-layers.mjs). Nothing FAIL-CLOSED was removed: `missingRoots` and the zero-file-floor cases
// above are untouched, and the gating scan just above still fails on a `useQuery`/`useAuth`-derived
// boolean gate — which is exactly the shape Better Auth's `useSession` will have in story 5-5.

// ── Story 5-4: the API CHOKEPOINT scan ────────────────────────────────────────────────────────
//
// The worker became the data layer in 5-4, so `hc()` from 'hono/client' is the primitive that
// "features never reach the data layer directly" is actually about. Between 5-2 and 5-4 that rule
// had NO enforcement at all — the vendor tripwire that used to live here was scanning for a
// primitive that no longer existed, and reported clean forever. These assert the three shapes the
// convention at the top of lint-layers.mjs asks for: a POSITIVE hit, a NEGATIVE that must stay
// quiet, and the EVASIONS — including the fail-closed one, which is the reason the scan exists in
// this form rather than as a bare "nobody imports hono/client".

test('api-chokepoint (positive): a feature importing hono/client is flagged', () => {
  const uses = findApiClientUses(
    'apps/expo/src/features/reader/hooks/useSync.ts',
    "import { hc } from 'hono/client';\nexport const x = 1;"
  );
  assert.equal(uses.length, 1);
  assert.match(uses[0], /imports "hono\/client"/);
});

test('api-chokepoint (positive): minting a client WITHOUT the import is still flagged', () => {
  // The import can arrive by re-export, barrel or helper; the CALL is the second detector, and
  // either alone is evadable.
  const uses = findApiClientUses(
    'apps/expo/src/features/reader/lib/sync.ts',
    "import { hc } from '@/lib/rpcShim';\nexport const client = hc('https://example.test');"
  );
  assert.equal(uses.length, 1);
  assert.match(uses[0], /mints its own worker RPC client/);
});

test('api-chokepoint (evasion): require() and dynamic import() of hono/client are caught', () => {
  // A static-`import`-only scan would miss both of these.
  const required = findApiClientUses(
    'apps/expo/src/stores/sync.ts',
    "const { hc } = require('hono/client');"
  );
  assert.equal(required.length, 1);
  assert.match(required[0], /imports "hono\/client"/);

  const dynamic = findApiClientUses(
    'apps/expo/src/stores/sync.ts',
    "export const load = async () => (await import('hono/client')).hc;"
  );
  assert.equal(dynamic.length, 1);
  assert.match(dynamic[0], /imports "hono\/client"/);
});

test('api-chokepoint (evasion): a hono/client SUBPATH is caught, not just the bare specifier', () => {
  const uses = findApiClientUses(
    'apps/expo/src/app/reader.tsx',
    "const mod = await import('hono/client/websocket');"
  );
  assert.equal(uses.length, 1);
  assert.match(uses[0], /hono\/client\/websocket/);
});

test('api-chokepoint (negative): the chokepoint module itself is exempt', () => {
  const uses = findApiClientUses(
    API_CHOKEPOINT,
    "import { hc } from 'hono/client';\nexport const api = hc(base);"
  );
  assert.deepEqual(uses, []);
});

test('api-chokepoint (negative): going THROUGH the chokepoint is the compliant shape', () => {
  const uses = findApiClientUses(
    'apps/expo/src/features/reader/hooks/useSync.ts',
    "import { api } from '@/lib/api';\nexport const get = () => api.health.$get();"
  );
  assert.deepEqual(uses, []);
});

test('api-chokepoint (evasion): `hc(` in a comment or a string is NOT a hit', () => {
  const uses = findApiClientUses(
    'apps/expo/src/features/reader/lib/notes.ts',
    [
      '// Never call hc( here — go through @/lib/api.',
      "const doc = 'call hc(url) only in lib/api.ts';",
      '/* hc<AppType>(base) is the chokepoint pattern */',
      'export const n = 1;',
    ].join('\n')
  );
  assert.deepEqual(uses, []);
});

test('api-chokepoint (evasion): a METHOD named hc on some other object is not a hit', () => {
  const uses = findApiClientUses(
    'apps/expo/src/lib/metrics.ts',
    'export const send = (t) => t.hc(1) + myhc(2);'
  );
  assert.deepEqual(uses, []);
});

// ⚠️ The fail-closed half. A scan for "who else imports hono/client" is trivially satisfied the
// moment the chokepoint stops existing — which is exactly how the tripwire this replaces spent its
// last months reporting OK over a deleted SDK.
test('api-chokepoint (fail-closed): a missing or hollowed-out chokepoint does NOT hold', () => {
  assert.equal(chokepointHolds(null), false, 'absent file');
  assert.equal(chokepointHolds(''), false, 'empty file');
  assert.equal(
    chokepointHolds("import { api } from './somewhere';\nexport { api };"),
    false,
    're-export shell that no longer constructs a client'
  );
  assert.equal(
    chokepointHolds("import { hc } from 'hono/client';\nexport type C = typeof hc;"),
    false,
    'imports the primitive but never constructs with it'
  );
  assert.equal(
    chokepointHolds("import { hc } from 'hono/client';\nexport const api = hc<AppType>(base);"),
    true,
    'the real shape'
  );
});

test('api-chokepoint: the LIVE chokepoint holds, and the tree reports ZERO', () => {
  // Both halves together: the floor is genuinely satisfied (not merely absent), and no other
  // module in the app reaches the worker directly.
  assert.equal(RPC_CLIENT_MODULE, 'hono/client');
  assert.deepEqual(runApiChokepointScan(), []);
});

// ── story 5-6: the QUERY MODULE CHOKEPOINT scan ───────────────────────────────────────────────
//
// Rule 6 guards the CONSTRUCTOR (`hc()`); this guards the CLIENT (`@/lib/api`). The gap between
// them is not hypothetical — it is written down in `deferred-work.md` from the 5-4 review, and the
// rule-6 self-test two blocks above still asserts that a feature calling `api.health.$get()`
// directly is compliant. It is compliant WITH RULE 6. Rule 7 is what makes it a violation.
//
// Same three shapes the convention at the top of lint-layers.mjs asks for: a POSITIVE hit, a
// NEGATIVE that must stay quiet, and the EVASIONS — including the fail-closed one.

test('query-chokepoint (positive): a route importing @/lib/api is flagged', () => {
  const specs = findApiModuleImports(
    'apps/expo/src/app/(tabs)/index.tsx',
    "import { api } from '@/lib/api';\nexport default function Screen() { return null; }"
  );
  assert.deepEqual(specs, ['@/lib/api']);
});

test('query-chokepoint (positive): the exact shape rule 6 blesses is caught here', () => {
  // ⚠️ THE WHOLE REASON THIS RULE EXISTS. `findApiClientUses` returns [] for this file — its own
  // self-test asserts so, a few blocks above — because nothing here constructs a client. Without
  // rule 7 a feature reaching the worker with no cache, no debounce and no outbox is green.
  const source = "import { api } from '@/lib/api';\nexport const get = () => api.health.$get();";
  assert.deepEqual(findApiClientUses('apps/expo/src/features/reader/hooks/useSync.ts', source), []);
  assert.deepEqual(findApiModuleImports('apps/expo/src/features/reader/hooks/useSync.ts', source), [
    '@/lib/api',
  ]);
});

test('query-chokepoint (evasion): a RELATIVE import of the same module is caught', () => {
  // `@/lib/api` and `./api` are the same file. A specifier-string match would see two rules.
  const sibling = findApiModuleImports(
    'apps/expo/src/lib/bookmarks.ts',
    "import { api } from './api';"
  );
  assert.deepEqual(sibling, ['./api']);

  const deep = findApiModuleImports(
    'apps/expo/src/features/reader/lib/read.ts',
    "import { api } from '../../../lib/api';"
  );
  assert.deepEqual(deep, ['../../../lib/api']);

  const extensioned = findApiModuleImports(
    'apps/expo/src/stores/syncStore.ts',
    "import { api } from '@/lib/api.ts';"
  );
  assert.deepEqual(extensioned, ['@/lib/api.ts']);
});

test('query-chokepoint (evasion): an ALIASED RE-EXPORT is caught at the re-exporting module', () => {
  // The shim itself is the violation, so the chain is broken where it starts rather than chased
  // through every consumer. (`export … from` is an import for `extractImports`' purposes.)
  const shim = findApiModuleImports(
    'apps/expo/src/lib/apiShim.ts',
    "export { api as client } from '@/lib/api';"
  );
  assert.deepEqual(shim, ['@/lib/api']);

  const renamed = findApiModuleImports(
    'apps/expo/src/lib/apiShim.ts',
    "import { api as client } from './api';\nexport const c = client;"
  );
  assert.deepEqual(renamed, ['./api']);
});

test('query-chokepoint (evasion): require() and dynamic import() are caught', () => {
  assert.deepEqual(
    findApiModuleImports('apps/expo/src/stores/sync.ts', "const { api } = require('@/lib/api');"),
    ['@/lib/api']
  );
  assert.deepEqual(
    findApiModuleImports(
      'apps/expo/src/stores/sync.ts',
      "export const load = async () => (await import('@/lib/api')).api;"
    ),
    ['@/lib/api']
  );
});

test('query-chokepoint (evasion): a TYPE-ONLY import is caught too — unlike rule 6', () => {
  // Deliberately stricter than the constructor rule. Type-only erases at runtime, which is what
  // makes reaching for the client's shapes outside the query module invisible in review — and
  // shaping a caller around raw response types is how the raw call arrives next.
  assert.deepEqual(
    findApiModuleImports(
      'apps/expo/src/features/reader/lib/types.ts',
      "import type { api } from '@/lib/api';\nexport type C = typeof api;"
    ),
    ['@/lib/api']
  );
});

// ⚠️ `syncCache.ts` IS A SECOND DOOR ONTO THE SAME STATE, and the require cycle that created it
// is not a licence for it. It exports `queryClient`, `readCache`, `writeCache` and `syncStore` —
// everything a feature would need to read and write server state without touching a hook, which
// is exactly what rule 7 exists to prevent. Two importers are legitimate and no more.
test('query-chokepoint (positive): a feature importing @/lib/syncCache is flagged', () => {
  const specs = findApiModuleImports(
    'apps/expo/src/features/reader/hooks/useRows.ts',
    "import { readCache, queryClient } from '@/lib/syncCache';"
  );
  assert.deepEqual(specs, ['@/lib/syncCache']);
});

test('query-chokepoint (evasion): a RELATIVE import of the cache half is caught too', () => {
  assert.deepEqual(
    findApiModuleImports(
      'apps/expo/src/lib/bookmarks.ts',
      "import { syncStore } from './syncCache';"
    ),
    ['./syncCache']
  );
  assert.deepEqual(
    findApiModuleImports(
      'apps/expo/src/stores/reader.ts',
      "import { writeCache } from '../lib/syncCache';"
    ),
    ['../lib/syncCache']
  );
});

test('query-chokepoint (negative): the two sanctioned importers of the cache half are exempt', () => {
  // The query module re-exports it; the account teardown reaches it DIRECTLY, because going
  // through `lib/sync.ts` would close the `auth → accountTeardown → sync → api → auth` cycle
  // that split the module in two to begin with.
  assert.deepEqual(
    findApiModuleImports(QUERY_MODULE, "import { readCache } from './syncCache';"),
    []
  );
  assert.deepEqual(
    findApiModuleImports(
      'apps/expo/src/lib/accountTeardown.ts',
      "import { clearSyncState } from '@/lib/syncCache';"
    ),
    []
  );
  assert.equal(QUERY_CACHE_MODULE, 'apps/expo/src/lib/syncCache');
});

test('query-chokepoint (negative): the cache module may import whatever it likes', () => {
  // It is a subject of the rule, not a violator of it — and it must not flag itself.
  assert.deepEqual(
    findApiModuleImports(`${QUERY_CACHE_MODULE}.ts`, "import { outbox } from './outbox';"),
    []
  );
});

test('query-chokepoint (negative): the query module itself is exempt, and so is api.ts', () => {
  assert.deepEqual(findApiModuleImports(QUERY_MODULE, "import { api } from './api';"), []);
  assert.deepEqual(
    findApiModuleImports(`${API_MODULE}.ts`, "import { hc } from 'hono/client';"),
    []
  );
});

test('query-chokepoint (negative): going through the query module is the compliant shape', () => {
  assert.deepEqual(
    findApiModuleImports(
      'apps/expo/src/features/reader/hooks/useReader.ts',
      "import { useBookmarks } from '@/lib/sync';\nexport const use = () => useBookmarks();"
    ),
    []
  );
});

test('query-chokepoint (negative): a COMMENTED-OUT import is not a hit', () => {
  assert.deepEqual(
    findApiModuleImports(
      'apps/expo/src/features/reader/lib/notes.ts',
      "// import { api } from '@/lib/api';\n/* import { api } from './api'; */\nexport const n = 1;"
    ),
    []
  );
});

test('query-chokepoint (negative): a different module whose path merely starts the same', () => {
  // ⚠️ THE SUBJECT HAS TO BE A GUARDED MODULE, OR THE CASE PROVES NOTHING. This asserted against
  // `@/lib/apiKeys` — a module that is not a subject of the rule at all, so it would come back
  // empty however the comparison were written. The near-miss worth pinning is one that differs
  // from a REAL subject by a suffix, which is exactly what a `startsWith` comparison would flag.
  assert.deepEqual(
    findApiModuleImports(
      'apps/expo/src/features/reader/lib/keys.ts',
      "import { KEYS } from '@/lib/apiKeys';\nimport { c } from '@/lib/syncCacheKeys';\nimport { o } from '@/lib/outboxUtils';"
    ),
    []
  );
});

// ⚠️ THE THIRD DOOR. `outbox.ts` exports a SINGLETON, so `outbox.enqueue(...)` from a feature
// reaches the worker with no local cache update, no `INVALIDATED_BY` entry and no debounce — the
// three things the query module's mutations exist to carry — and it typechecks, because the queue
// is transport-agnostic on purpose. Same symmetry argument as `syncCache`.
test('query-chokepoint (positive): a feature importing @/lib/outbox is flagged', () => {
  assert.deepEqual(
    findApiModuleImports(
      'apps/expo/src/features/reader/hooks/useBookmark.ts',
      "import { outbox } from '@/lib/outbox';\nexport const add = () => outbox.enqueue(op);"
    ),
    ['@/lib/outbox']
  );
});

test('query-chokepoint (evasion): a relative or type-only import of the outbox is caught', () => {
  assert.deepEqual(
    findApiModuleImports('apps/expo/src/lib/bookmarks.ts', "import { outbox } from './outbox';"),
    ['./outbox']
  );
  assert.deepEqual(
    findApiModuleImports(
      'apps/expo/src/features/reader/lib/t.ts',
      "import type { OutboxEntry } from '../../../lib/outbox';"
    ),
    ['../../../lib/outbox']
  );
});

test('query-chokepoint (negative): the two sanctioned importers of the outbox are exempt', () => {
  // The query module owns the mutations; `syncCache` clears the queue on sign-out, which it does
  // instead of `lib/sync.ts` for the same require-cycle reason that split it out.
  assert.deepEqual(findApiModuleImports(QUERY_MODULE, "import { outbox } from './outbox';"), []);
  assert.deepEqual(
    findApiModuleImports(`${QUERY_CACHE_MODULE}.ts`, "import { outbox } from './outbox';"),
    []
  );
  assert.equal(OUTBOX_MODULE, 'apps/expo/src/lib/outbox');
});

test('query-chokepoint (negative): the outbox module does not flag itself', () => {
  assert.deepEqual(
    findApiModuleImports(`${OUTBOX_MODULE}.ts`, "import { createAppMMKV } from './mmkv';"),
    []
  );
});

// ⚠️ The fail-closed half, verbatim in spirit from rule 6's. A scan for "who else imports
// @/lib/api" is trivially satisfied the moment the query module stops existing.
test('query-chokepoint (fail-closed): a missing or hollowed-out query module does NOT hold', () => {
  assert.equal(queryModuleHolds(null), false, 'absent file');
  assert.equal(queryModuleHolds(''), false, 'empty file');
  assert.equal(
    queryModuleHolds("import { outbox } from './outbox';\nexport const q = outbox;"),
    false,
    'no longer imports the client'
  );
  assert.equal(
    queryModuleHolds("import { api } from './api';\nexport type Client = typeof api;"),
    false,
    'imports the client but never calls through it'
  );
  assert.equal(
    queryModuleHolds("import { api } from './api';\nexport const g = () => api.health.$get();"),
    true,
    'the real shape'
  );
});

test('query-chokepoint: the LIVE query module holds, and the tree reports ZERO', () => {
  // Both halves together: the floor is genuinely satisfied (not merely absent), and no other
  // module in the app reaches the RPC client directly.
  assert.equal(QUERY_MODULE, 'apps/expo/src/lib/sync.ts');
  assert.deepEqual(runQueryModuleChokepointScan(), []);
});
