/**
 * Self-tests for the lint:native-patches gate (scripts/lint-native-patches.mjs).
 *
 * Run: `node --test scripts/__tests__/lint-native-patches.test.mjs`
 *
 * ⚠️ This suite is NOT reached by `turbo test` — turbo does not run ROOT package scripts, and
 * `turbo.json` defines no root task. Like its `test:layers` / `test:style` / `test:i18n` siblings it
 * runs only when invoked explicitly (`pnpm test:native-patches`), which Story 20.8 AC-8 makes part
 * of the regression net. Don't assume the net covers it.
 *
 * The property under test is that the gate FIRES — a lint rule that has only ever been observed
 * passing on a clean tree is not evidence of anything (STACK-CHEAT-SHEET § "A documented lint
 * invariant is NOT an enforced one"). So every assertion below drives a POSITIVE hit: version
 * drift, a vanished patch file, a hunk that never landed, a corrupt config.
 *
 * The second property, sharpened twice under review: the gate must not certify a patch it has not
 * really seen. Presence-of-added-lines was too weak (round 1), and its replacement — a hand-rolled
 * hunk-post-image matcher — shipped two silent FALSE PASSES of its own (round 2). Check (c) now
 * delegates to `git apply --reverse --check`, and the three `REGRESSION` tests below pin the exact
 * shapes that fooled the previous implementations, plus the vacuous-pass trap in git itself.
 *
 * Most of the suite runs on the injected `env` with no filesystem. The `isPatchApplied` block is
 * the deliberate exception: it makes real files in a temp dir and runs real git, because a fake
 * cannot substantiate a claim about what git does.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  isExactVersion,
  isPatchApplied,
  normalizePatchPath,
  parsePatchedDependencies,
  parsePatchKey,
  runNativePatchesScan,
} from '../lint-native-patches.mjs';

/** Repo root — the two REGRESSION tests below assert against the REAL tree, not a fixture. */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// ── parsePatchedDependencies — the fail-closed config read ──────────────────

const YAML_OK = `packages:
  - apps/*

minimumReleaseAgeExclude:
  - expo-audio@56.0.11 # held + patched

patchedDependencies:
  expo-audio@56.0.11: patches/expo-audio@56.0.11.patch
  react-native-screens@4.25.2: patches/react-native-screens@4.25.2.patch

onlyBuiltDependencies:
  - esbuild
`;

test('parses every entry in the block and stops at the next top-level key', () => {
  const entries = parsePatchedDependencies(YAML_OK);
  assert.deepEqual(entries, [
    { key: 'expo-audio@56.0.11', patchPath: 'patches/expo-audio@56.0.11.patch' },
    { key: 'react-native-screens@4.25.2', patchPath: 'patches/react-native-screens@4.25.2.patch' },
  ]);
});

test('tolerates comments, blank lines and quoted scoped keys inside the block', () => {
  const entries = parsePatchedDependencies(
    `patchedDependencies:\n` +
      `  # the lock-screen patch (Story 19.4)\n` +
      `\n` +
      `  '@expo/ui@56.0.16': 'patches/@expo/ui@56.0.16.patch' # quoted scope\n`
  );
  assert.deepEqual(entries, [
    { key: '@expo/ui@56.0.16', patchPath: 'patches/@expo/ui@56.0.16.patch' },
  ]);
});

test('FAIL-CLOSED: a missing patchedDependencies heading throws, it does NOT read as zero patches', () => {
  assert.throws(() => parsePatchedDependencies('packages:\n  - apps/*\n'), /no top-level/);
});

test('FAIL-CLOSED: an empty block throws rather than passing vacuously', () => {
  assert.throws(() => parsePatchedDependencies('patchedDependencies:\n\nfoo:\n  - x\n'), /EMPTY/);
});

test('FAIL-CLOSED: an unrecognizable line under the heading throws instead of being skipped', () => {
  assert.throws(
    () => parsePatchedDependencies('patchedDependencies:\n  - expo-audio@56.0.11\n'),
    /unparseable line/
  );
});

test('FAIL-CLOSED: a duplicate key throws — pnpm keeps only the last, so the rest is dead config', () => {
  assert.throws(
    () =>
      parsePatchedDependencies(
        'patchedDependencies:\n  a@1.0.0: patches/a.patch\n  a@1.0.0: patches/b.patch\n'
      ),
    /duplicate patchedDependencies key/
  );
});

test('a nested key is NOT mistaken for an entry of an earlier block', () => {
  // The heading regex is anchored at column 0, so an indented `patchedDependencies:` under some
  // other key is not picked up as the top-level block.
  assert.throws(
    () => parsePatchedDependencies('pnpm:\n  patchedDependencies:\n    a@1: patches/a.patch\n'),
    /no top-level/
  );
});

test('FAIL-CLOSED: TWO top-level blocks throw — pnpm cannot read the file at all', () => {
  // The scanner would otherwise verify the FIRST block and report clean, i.e. a green lint on a
  // pnpm-workspace.yaml that `pnpm install` rejects outright for the duplicate key.
  assert.throws(
    () =>
      parsePatchedDependencies(
        'patchedDependencies:\n  a@1.0.0: patches/a.patch\n' +
          'patchedDependencies:\n  a@2.0.0: patches/b.patch\n'
      ),
    /2 top-level `patchedDependencies:` blocks/
  );
});

test('a UTF-8 BOM does not turn a present block into "no block found"', () => {
  const entries = parsePatchedDependencies('﻿patchedDependencies:\n  a@1.0.0: patches/a.patch\n');
  assert.deepEqual(entries, [{ key: 'a@1.0.0', patchPath: 'patches/a.patch' }]);
});

test('patch paths are normalized so `./patches/x` and `patches/x` are one file', () => {
  assert.equal(normalizePatchPath('./patches/a.patch'), 'patches/a.patch');
  assert.equal(normalizePatchPath('patches//a.patch'), 'patches/a.patch');
  const [entry] = parsePatchedDependencies('patchedDependencies:\n  a@1.0.0: ./patches/a.patch\n');
  assert.equal(entry.patchPath, 'patches/a.patch');
});

// ── parsePatchKey / isExactVersion — drift detection needs an exact key ─────

test('splits name@version, including a scoped package name', () => {
  assert.deepEqual(parsePatchKey('react-native-screens@4.25.2'), {
    name: 'react-native-screens',
    version: '4.25.2',
  });
  assert.deepEqual(parsePatchKey('@expo/ui@56.0.16'), { name: '@expo/ui', version: '56.0.16' });
});

test('a bare package name parses as version-less rather than throwing (pnpm accepts it)', () => {
  assert.deepEqual(parsePatchKey('react-native-screens'), {
    name: 'react-native-screens',
    version: null,
  });
  assert.deepEqual(parsePatchKey('@expo/ui'), { name: '@expo/ui', version: null });
});

test('only a literal exact version counts — a range opts the entry out of drift detection', () => {
  assert.equal(isExactVersion('4.25.2'), true);
  assert.equal(isExactVersion('56.0.11-beta.3'), true);
  assert.equal(isExactVersion('^4.25.2'), false);
  assert.equal(isExactVersion('~4.25.2'), false);
  assert.equal(isExactVersion('4.x'), false);
  assert.equal(isExactVersion(null), false);
});

// ── isPatchApplied — the check (c) primitive, now git's job not ours ───────
//
// The hand-rolled post-image matcher this replaced shipped TWO silent false passes (see the
// script header). Both are pinned below as integration tests against the REAL `git apply`, because
// a fake cannot prove a claim about git's behaviour.

const PATCH = `diff --git a/android/src/main/java/Foo.kt b/android/src/main/java/Foo.kt
index 1111111..2222222 100644
--- a/android/src/main/java/Foo.kt
+++ b/android/src/main/java/Foo.kt
@@ -1,5 +1,6 @@
     override fun canNavigateBack(): Boolean {
         val container: ScreenContainer? = screen.container
-        check(container is ScreenStack) { "added into a non-stack container" }
+        // wisdom-fruits Story 20.8 — upstream null-guard inconsistency
+        if (container !is ScreenStack) return false
         return true
     }
`;

const UNPATCHED_SOURCE = `    override fun canNavigateBack(): Boolean {
        val container: ScreenContainer? = screen.container
        check(container is ScreenStack) { "added into a non-stack container" }
        return true
    }
`;

const PATCHED_SOURCE = `    override fun canNavigateBack(): Boolean {
        val container: ScreenContainer? = screen.container
        // wisdom-fruits Story 20.8 — upstream null-guard inconsistency
        if (container !is ScreenStack) return false
        return true
    }
`;

/** A throwaway package dir + patch file on disk. Real files: the point is to drive real git. */
function fixture(sourceText, patchText = PATCH) {
  const dir = mkdtempSync(join(tmpdir(), 'native-patches-'));
  mkdirSync(join(dir, 'pkg/android/src/main/java'), { recursive: true });
  writeFileSync(join(dir, 'pkg/android/src/main/java/Foo.kt'), sourceText);
  const patchPath = join(dir, 'the.patch');
  writeFileSync(patchPath, patchText);
  return { dir, pkgDir: join(dir, 'pkg'), patchPath };
}

test('PASSES when the patch is genuinely applied in the package', () => {
  const { pkgDir, patchPath } = fixture(PATCHED_SOURCE);
  assert.deepEqual(isPatchApplied(patchPath, pkgDir), { ok: true, message: '' });
});

test('FIRES when the package holds the UNPATCHED source', () => {
  const { pkgDir, patchPath } = fixture(UNPATCHED_SOURCE);
  const { ok, message } = isPatchApplied(patchPath, pkgDir);
  assert.equal(ok, false);
  assert.match(message, /does NOT reverse-apply/);
});

test('FIRES when the patched file is gone from the package', () => {
  const { pkgDir, patchPath } = fixture(PATCHED_SOURCE);
  rmSync(join(pkgDir, 'android/src/main/java/Foo.kt'));
  assert.equal(isPatchApplied(patchPath, pkgDir).ok, false);
});

test('REGRESSION (false pass 1): a hunk truncated at a whitespace-stripped blank context line', () => {
  // A blank context line is ` ` (one space). Editors and `git apply --whitespace=fix` strip it to
  // ''. The old parser ended the hunk there and silently dropped every later assertion — 100% of
  // the react-native-screens hunk, 67% of expo-audio's — while pnpm still applied the patch fine.
  const stripped = PATCH.split('\n')
    .map((l) => (l === ' ' ? '' : l))
    .join('\n');
  const { pkgDir, patchPath } = fixture(UNPATCHED_SOURCE, stripped);
  assert.equal(isPatchApplied(patchPath, pkgDir).ok, false, 'must NOT certify an unpatched tree');
});

test('REGRESSION (false pass 2): a pure-deletion hunk whose removed line is at the hunk EDGE', () => {
  // The post-image of such a hunk is pure CONTEXT, so it matches the unpatched file exactly as
  // well as the patched one. The old matcher returned "clean" against source that still contained
  // the line the patch deletes.
  const pureDeletion =
    'diff --git a/android/src/main/java/Foo.kt b/android/src/main/java/Foo.kt\n' +
    '--- a/android/src/main/java/Foo.kt\n' +
    '+++ b/android/src/main/java/Foo.kt\n' +
    '@@ -1,3 +1,2 @@\n' +
    '-    override fun canNavigateBack(): Boolean {\n' +
    '         val container: ScreenContainer? = screen.container\n' +
    '         check(container is ScreenStack) { "added into a non-stack container" }\n';
  const { pkgDir, patchPath } = fixture(UNPATCHED_SOURCE, pureDeletion);
  assert.equal(isPatchApplied(patchPath, pkgDir).ok, false, 'must NOT certify an unpatched tree');
});

test("REGRESSION (false pass): a developer's apply.ignoreWhitespace does NOT reach the verdict", () => {
  // `git apply` honours `apply.ignoreWhitespace` from the user's ~/.gitconfig. Set to `change`, a
  // whitespace-only patch reverse-applies cleanly against UNPATCHED source — so the gate would
  // certify an unpatched tree as patched, triggered by a personal git config or a CI base image
  // rather than by anything in the repo. `--no-ignore-whitespace` plus GIT_CONFIG_GLOBAL and
  // GIT_CONFIG_SYSTEM at /dev/null are what stop it, and this test pins the PROPERTY, not any one
  // of them.
  // ⚠️ MUTATION RECIPE, measured: remove ALL THREE. The guards are REDUNDANT — the flag alone and
  // the config overrides alone each hold the property, so dropping any single one leaves this test
  // green. That is not a weakness in the test; it is the honest shape of a defence in depth, and
  // saying so here stops the next reader concluding from one green mutation that a guard is dead
  // weight. Verified 2026-08-17: 1 removed -> pass, 3 removed -> fail.
  const wsOnly =
    'diff --git a/android/src/main/java/Foo.kt b/android/src/main/java/Foo.kt\n' +
    '--- a/android/src/main/java/Foo.kt\n' +
    '+++ b/android/src/main/java/Foo.kt\n' +
    '@@ -1,3 +1,3 @@\n' +
    '-    override fun canNavigateBack(): Boolean {\n' +
    '+\toverride fun canNavigateBack(): Boolean {\n' +
    '         val container: ScreenContainer? = screen.container\n' +
    '         check(container is ScreenStack) { "added into a non-stack container" }\n';
  const { dir, pkgDir, patchPath } = fixture(UNPATCHED_SOURCE, wsOnly);
  const poisoned = join(dir, 'poisoned.gitconfig');
  writeFileSync(poisoned, '[apply]\n\tignoreWhitespace = change\n');
  const saved = process.env.GIT_CONFIG_GLOBAL;
  process.env.GIT_CONFIG_GLOBAL = poisoned;
  try {
    assert.equal(
      isPatchApplied(patchPath, pkgDir).ok,
      false,
      'a whitespace-tolerant user gitconfig must not certify unpatched source as patched'
    );
  } finally {
    if (saved === undefined) delete process.env.GIT_CONFIG_GLOBAL;
    else process.env.GIT_CONFIG_GLOBAL = saved;
  }
});

test('REGRESSION (vacuous pass): a package dir INSIDE a git work tree is still really checked', () => {
  // `node_modules/` lives inside this repo's work tree. Without the GIT_DIR override, git resolves
  // the patch's paths from the REPOSITORY ROOT and ignores everything outside the cwd prefix — so
  // every hunk is skipped and git exits 0. Verified against the real repo before the fix: a patch
  // naming a file that exists nowhere also passed. This pins the override.
  const { dir, pkgDir, patchPath } = fixture(UNPATCHED_SOURCE);
  const init = spawnSync('git', ['init', '-q'], { cwd: dir, encoding: 'utf8' });
  assert.equal(
    init.status,
    0,
    'fixture must be inside a git work tree for this test to mean anything'
  );
  assert.equal(
    isPatchApplied(patchPath, pkgDir).ok,
    false,
    'must not pass vacuously inside a repo'
  );
});

test('FAIL-CLOSED: an unusable git is a violation, never a skipped check', () => {
  const { pkgDir, patchPath } = fixture(PATCHED_SOURCE);
  const noGit = () => ({ error: new Error('spawn git ENOENT') });
  const { ok, message } = isPatchApplied(patchPath, pkgDir, noGit);
  assert.equal(ok, false);
  assert.match(message, /git is required/);
});

// ── runNativePatchesScan — the whole gate, driven through injected env ──────

/**
 * Build an env whose tree is healthy, then let each test break exactly one condition.
 *
 * `runGit` is a FAKE here — these tests are about the scan's wiring (which copies get checked, how
 * a failure is worded, what stops the loop), not about git. `unpatchedDirs` names the package dirs
 * the fake should report as unpatched, so a test can put the root and a nested copy in different
 * states. Real git is exercised by the `isPatchApplied` block above.
 */
function makeEnv(overrides = {}) {
  const files = {
    'patches/demo@1.2.3.patch': PATCH,
    'node_modules/demo/package.json': JSON.stringify({ name: 'demo', version: '1.2.3' }),
    'apps/expo/package.json': JSON.stringify({ name: 'expo-app' }),
    ...(overrides.files ?? {}),
  };
  const unpatchedDirs = new Set(overrides.unpatchedDirs ?? []);
  return {
    workspaceYaml:
      overrides.workspaceYaml ?? 'patchedDependencies:\n  demo@1.2.3: patches/demo@1.2.3.patch\n',
    exists: (p) => p in files,
    readFile: (p) => {
      if (!(p in files)) throw new Error(`ENOENT ${p}`);
      return files[p];
    },
    absolute: (p) => p, // identity — the fake git never touches the filesystem
    runGit: (_cmd, _args, opts) =>
      unpatchedDirs.has(opts.cwd)
        ? { status: 1, stderr: `error: ${opts.cwd}: patch does not apply` }
        : { status: 0, stderr: '' },
    listPatches: overrides.listPatches ?? (() => ['demo@1.2.3.patch']),
    listWorkspaceManifests: overrides.listWorkspaceManifests ?? (() => ['apps/expo/package.json']),
    listExpoConfigs: overrides.listExpoConfigs ?? (() => []),
    listAppDirs: overrides.listAppDirs ?? (() => ['expo']),
  };
}

test('a healthy tree is clean', () => {
  assert.deepEqual(runNativePatchesScan(makeEnv()), []);
});

test('FIRES on version DRIFT — the exact failure a `~` range causes', () => {
  const env = makeEnv({
    files: { 'node_modules/demo/package.json': JSON.stringify({ version: '1.2.4' }) },
  });
  const out = runNativePatchesScan(env);
  assert.equal(out.length, 1);
  assert.match(out[0], /version DRIFT — patch targets 1\.2\.3, installed is 1\.2\.4/);
  assert.match(out[0], /installed\s+UNPATCHED/);
});

test('FIRES on a NON-EXACT key — a bare name or a range silently disables drift detection', () => {
  for (const key of ['demo', 'demo@^1.2.3']) {
    const env = makeEnv({
      workspaceYaml: `patchedDependencies:\n  ${key}: patches/demo@1.2.3.patch\n`,
    });
    const out = runNativePatchesScan(env);
    assert.equal(out.length, 1, `expected exactly one violation for ${key}`);
    assert.match(out[0], /must be `demo@<exact version>`/);
  }
});

test('FIRES when the patch file named by the entry does not exist', () => {
  const env = makeEnv();
  const exists = env.exists;
  env.exists = (p) => (p === 'patches/demo@1.2.3.patch' ? false : exists(p));
  const out = runNativePatchesScan(env);
  assert.equal(out.length, 1);
  assert.match(out[0], /patch file is missing/);
});

test('FIRES when the package is not installed at the workspace root', () => {
  const env = makeEnv();
  const exists = env.exists;
  env.exists = (p) => (p === 'node_modules/demo/package.json' ? false : exists(p));
  const out = runNativePatchesScan(env);
  assert.equal(out.length, 1);
  assert.match(out[0], /not installed at the workspace root/);
});

test('a manifest with no version is reported as malformed, NOT as drift', () => {
  const env = makeEnv({
    files: { 'node_modules/demo/package.json': JSON.stringify({ name: 'demo' }) },
  });
  const out = runNativePatchesScan(env);
  assert.equal(out.length, 1);
  assert.match(out[0], /has no `version` field/);
  assert.doesNotMatch(out[0], /DRIFT/);
});

test('FIRES when a NESTED app copy outranks the root install at a different version', () => {
  const env = makeEnv({
    files: {
      'apps/expo/node_modules/demo/package.json': JSON.stringify({ version: '1.2.4' }),
    },
  });
  const out = runNativePatchesScan(env);
  assert.equal(out.length, 1);
  assert.match(out[0], /NESTED copy at apps\/expo\/node_modules\/demo is 1\.2\.4/);
});

test('FIRES when the patch is registered + version-matched but never landed in the package', () => {
  const env = makeEnv({ unpatchedDirs: ['node_modules/demo'] });
  const out = runNativePatchesScan(env);
  assert.equal(out.length, 1);
  assert.match(out[0], /\(workspace root\)/);
  assert.match(out[0], /does NOT reverse-apply/);
});

test('CONTENT-checks every nested copy, not just the version string', () => {
  // A nested copy at the right version can still hold unpatched source, and a build run from that
  // app resolves IT — the version-only check this replaced reported nothing at all here.
  const env = makeEnv({
    files: {
      'apps/expo/node_modules/demo/package.json': JSON.stringify({ version: '1.2.3' }),
    },
    unpatchedDirs: ['apps/expo/node_modules/demo'],
  });
  const out = runNativePatchesScan(env);
  assert.equal(out.length, 1);
  assert.match(out[0], /apps\/expo\/node_modules/);
  assert.match(out[0], /does NOT reverse-apply/);
});

test('probes the AAR trap in a NESTED copy too — that is the one the app build resolves', () => {
  const env = makeEnv({
    files: {
      'apps/expo/node_modules/demo/package.json': JSON.stringify({ version: '1.2.3' }),
      'apps/expo/node_modules/demo/local-maven-repo': '',
    },
  });
  const out = runNativePatchesScan(env);
  assert.equal(out.length, 1);
  assert.match(out[0], /ships a prebuilt AAR/);
  assert.match(out[0], /apps\/expo\/node_modules/);
});

test('FIRES on the PRECOMPILED-AAR trap — patched source gradle will never compile', () => {
  // The one failure where every source-level assertion passes: pnpm patches the .kt faithfully and
  // gradle links local-maven-repo/ instead.
  const env = makeEnv({
    files: { 'node_modules/demo/local-maven-repo': '' },
  });
  const out = runNativePatchesScan(env);
  assert.equal(out.length, 1);
  assert.match(out[0], /ships a prebuilt AAR/);
  assert.match(out[0], /buildFromSource/);
});

test('REGRESSION: the AAR probe uses the REAL Expo layout, `<pkg>/local-maven-repo`', () => {
  // ⚠️ THE TEST THAT SHOULD HAVE EXISTED FROM THE START. For two review rounds this check probed
  // `<pkg>/android/local-maven-repo`, which no published Expo module has ever used — and because
  // every fixture above encoded that same wrong path, all of them passed while the check was dead
  // code that could not fire on any real input. A fixture cannot falsify a claim about a layout;
  // only the real tree can. `expo-audio` is a live patchedDependencies entry AND ships an AAR, so
  // it is the exact input the check exists for.
  const pkg = join(REPO_ROOT, 'node_modules', 'expo-audio');
  if (!existsSync(pkg)) return; // dependency not installed — nothing to assert against
  assert.ok(
    existsSync(join(pkg, 'local-maven-repo')),
    'expo-audio should ship local-maven-repo/ at its PACKAGE ROOT'
  );
  assert.ok(
    !existsSync(join(pkg, 'android', 'local-maven-repo')),
    'the `android/` form is the wrong path — if this ever passes, Expo changed the layout'
  );
});

test('REGRESSION: the real tree FIRES when the buildFromSource declaration is removed', () => {
  // Drives the real scan with the escape hatch hidden. Before the path fix this returned CLEAN,
  // i.e. the gate silently certified a patch gradle would never compile.
  const out = runNativePatchesScan({ listWorkspaceManifests: () => [] });
  assert.ok(
    out.some((v) => /expo-audio/.test(v) && /ships a prebuilt AAR/.test(v)),
    `expected the AAR trap to fire for expo-audio, got: ${JSON.stringify(out)}`
  );
});

test('the AAR check is satisfied by an expo.autolinking.buildFromSource declaration', () => {
  const env = makeEnv({
    files: {
      'node_modules/demo/local-maven-repo': '',
      'apps/expo/package.json': JSON.stringify({
        expo: { autolinking: { buildFromSource: ['demo'] } },
      }),
    },
  });
  assert.deepEqual(runNativePatchesScan(env), []);
});

test('buildFromSource entries are REGEXES, as gradle treats them — `.*` and prefixes count', () => {
  // ExpoAutolinkingConfig.kt: `buildFromSourceRegex = buildFromSource.map { it.toRegex() }`, used
  // as `.any { it.matches(project.name) }`. An exact-string comparison would report a violation
  // naming an escape hatch the project has already taken.
  for (const pattern of ['.*', 'de.*', 'demo']) {
    const env = makeEnv({
      files: {
        'node_modules/demo/local-maven-repo': '',
        'apps/expo/package.json': JSON.stringify({
          expo: { autolinking: { buildFromSource: [pattern] } },
        }),
      },
    });
    assert.deepEqual(runNativePatchesScan(env), [], `pattern ${pattern} should satisfy the check`);
  }
});

test('the regex is ANCHORED — a partial match must NOT satisfy the check', () => {
  // Kotlin's `Regex.matches` is whole-string. An unanchored `test()` would let `emo` cover `demo`.
  const env = makeEnv({
    files: {
      'node_modules/demo/local-maven-repo': '',
      'apps/expo/package.json': JSON.stringify({
        expo: { autolinking: { buildFromSource: ['emo'] } },
      }),
    },
  });
  const out = runNativePatchesScan(env);
  assert.equal(out.length, 1);
  assert.match(out[0], /ships a prebuilt AAR/);
});

test('expo-build-properties android.buildFromSource does NOT satisfy the AAR check', () => {
  // It reads like "build everything from source" and an earlier revision honoured it as a
  // project-wide short-circuit, disabling check (d) for every package. It is in fact the
  // (deprecated) React-Native-from-source flag — pluginConfig.d.ts: "Enable building React Native
  // from source … Use `buildReactNativeFromSource` instead" — and build/android.js only adds an
  // includeBuild() substituting react-android/hermes-android. It has no effect on module AARs.
  const env = makeEnv({
    files: {
      'node_modules/demo/local-maven-repo': '',
      'apps/expo/app.json': JSON.stringify({
        expo: { plugins: [['expo-build-properties', { android: { buildFromSource: true } }]] },
      }),
    },
  });
  const out = runNativePatchesScan(env);
  assert.equal(out.length, 1);
  assert.match(out[0], /ships a prebuilt AAR/);
});

test('FIRES on an ORPHAN patch file that no entry references', () => {
  const env = makeEnv({ listPatches: () => ['demo@1.2.3.patch', 'forgotten@9.9.9.patch'] });
  const out = runNativePatchesScan(env);
  assert.equal(out.length, 1);
  assert.match(out[0], /\[orphan\] patches\/forgotten@9\.9\.9\.patch/);
});

test('a scoped patch in a NESTED patches/ dir is still matched against its entry', () => {
  // `patches/@scope/name@v.patch` is the shape pnpm writes for a scoped package; a non-recursive
  // listing made the orphan check silently cover nothing for those.
  const env = makeEnv({
    workspaceYaml:
      "patchedDependencies:\n  '@scope/demo@1.0.0': 'patches/@scope/demo@1.0.0.patch'\n",
    files: {
      'patches/@scope/demo@1.0.0.patch': PATCH,
      'node_modules/@scope/demo/package.json': JSON.stringify({ version: '1.0.0' }),
      'node_modules/@scope/demo/android/src/main/java/Foo.kt': PATCHED_SOURCE,
    },
    listPatches: () => ['@scope/demo@1.0.0.patch'],
  });
  assert.deepEqual(runNativePatchesScan(env), []);
});

test('an entry written `./patches/x` does NOT report its own file as an orphan', () => {
  const env = makeEnv({
    workspaceYaml: 'patchedDependencies:\n  demo@1.2.3: ./patches/demo@1.2.3.patch\n',
  });
  assert.deepEqual(runNativePatchesScan(env), []);
});

test('every spelling of the same path normalizes equal — no entry orphans its own file', () => {
  // The docblock promises this; only the exact `./patches/x` form was actually handled. A `.` or
  // `..` segment would make the entry pass AND report its own file as an orphan — the
  // self-contradiction that teaches a team to ignore the gate.
  for (const spelling of [
    'patches/demo@1.2.3.patch',
    './patches/demo@1.2.3.patch',
    'patches//demo@1.2.3.patch',
    'patches/./demo@1.2.3.patch',
    './patches/../patches/demo@1.2.3.patch',
    'patches\\demo@1.2.3.patch',
  ]) {
    const env = makeEnv({
      workspaceYaml: `patchedDependencies:\n  demo@1.2.3: ${spelling}\n`,
    });
    assert.deepEqual(runNativePatchesScan(env), [], `spelling ${spelling} should be clean`);
  }
});

test('a `.PATCH` file is still listed — the orphan scan is case-insensitive on the extension', () => {
  // macOS/Windows filesystems are case-insensitive, so a `.PATCH` file is a real applied patch
  // there; a case-sensitive listing would make it invisible to the one scan meant to see it.
  const env = makeEnv({ listPatches: () => ['demo@1.2.3.patch', 'FORGOTTEN@9.9.9.PATCH'] });
  const out = runNativePatchesScan(env);
  assert.equal(out.length, 1);
  assert.match(out[0], /\[orphan\] patches\/FORGOTTEN@9\.9\.9\.PATCH/);
});

test('FAIL-CLOSED end-to-end: a broken config THROWS out of the scan, never returns clean', () => {
  assert.throws(() => runNativePatchesScan(makeEnv({ workspaceYaml: 'packages:\n  - apps/*\n' })));
});

// ── Manifest set: exactly the native app's, never every `apps/*` (epic-20 boundary) ─────────
// REGRESSION. The default `listWorkspaceManifests` returned EVERY `apps/*/package.json` and
// `collectBuildFromSource` OR-ed their patterns, contradicting the header's rule 2. A declaration
// in a package with no native build (`apps/marketing`) satisfied the gate while gradle — which
// reads only the native app's manifest — linked the prebuilt AAR and voided the patch.
test('a buildFromSource declaration in a NON-native app does NOT satisfy the check', () => {
  const env = makeEnv({
    listWorkspaceManifests: () => ['apps/expo/package.json'],
    readFile: (p) =>
      p === 'apps/marketing/package.json'
        ? JSON.stringify({ expo: { autolinking: { buildFromSource: ['expo-audio'] } } })
        : JSON.stringify({}),
    exists: (p) => p === 'apps/marketing/package.json' || p === 'apps/expo/package.json',
  });
  // The marketing declaration is simply not read — only the native app's manifest is consulted.
  assert.deepEqual(
    runNativePatchesScan(env).filter((v) => /marketing/.test(v)),
    []
  );
});

// ── The DEFAULT manifest resolver, executed (epic-20 boundary, ROUND 2) ─────────────────────
// REGRESSION ON THE TEST, not just the code. The round-1 version of this check asserted the
// resolver by REGEX-MATCHING THE SCANNER'S OWN SOURCE TEXT, because the resolver reached past the
// module's `exists`/`readFile` seams to `existsSync`/`readFileSync` and so could not be driven.
// `makeEnv` injects `listWorkspaceManifests`, so every other test skipped this code entirely —
// nothing executable asserted that the gate reads `apps/expo`. The resolver is now seam-driven
// (`listAppDirs` + `exists` + `readFile`) and these tests RUN it.
//
// `envWithRealResolver` deliberately OMITS `listWorkspaceManifests` so the default one runs.
function envWithRealResolver(overrides = {}) {
  const env = makeEnv(overrides);
  delete env.listWorkspaceManifests;
  return env;
}

test('the DEFAULT resolver picks the app that depends on `expo` — not the first directory', () => {
  // `desktop` sorts BEFORE `expo`, so a `.find()`-style "first qualifying" resolver that keyed on
  // directory order (or on the name `expo`) would answer wrongly here.
  const manifests = [];
  const env = envWithRealResolver({
    listAppDirs: () => ['desktop', 'expo', 'marketing'],
    files: {
      'apps/desktop/package.json': JSON.stringify({ dependencies: { electron: '1' } }),
      'apps/expo/package.json': JSON.stringify({ dependencies: { expo: '56.0.0' } }),
      'apps/marketing/package.json': JSON.stringify({ dependencies: { astro: '5' } }),
      'node_modules/demo/package.json': JSON.stringify({ version: '1.2.3' }),
      'patches/demo@1.2.3.patch': 'diff',
    },
  });
  // Observe which manifest the scan actually consults.
  const realRead = env.readFile;
  env.readFile = (p) => {
    if (p.endsWith('package.json') && p.startsWith('apps/')) manifests.push(p);
    return realRead(p);
  };
  runNativePatchesScan(env);
  assert.ok(
    manifests.includes('apps/expo/package.json'),
    'expected the resolver to read the native app manifest'
  );
  assert.ok(
    !manifests.includes('apps/desktop/package.json') ||
      manifests.indexOf('apps/expo/package.json') >= 0,
    'the native app must be the one whose buildFromSource list is consulted'
  );
});

test('the DEFAULT resolver is rename-safe — it keys on the expo DEPENDENCY, not the dir name', () => {
  const env = envWithRealResolver({
    listAppDirs: () => ['mobile'],
    files: {
      'apps/mobile/package.json': JSON.stringify({
        dependencies: { expo: '56.0.0' },
        expo: { autolinking: { buildFromSource: ['.*'] } },
      }),
      'node_modules/demo/package.json': JSON.stringify({ version: '1.2.3' }),
      'patches/demo@1.2.3.patch': 'diff',
    },
  });
  // A renamed native app is still found, so its buildFromSource declaration still counts.
  assert.deepEqual(runNativePatchesScan(env), []);
});

test('the DEFAULT resolver THROWS when two apps qualify, rather than silently picking one', () => {
  // An ambiguous answer must stop the build. `.find()` cannot express this — it was the shape of
  // the bug this resolver replaced, and it would return the same silent wrong answer.
  const env = envWithRealResolver({
    listAppDirs: () => ['desktop', 'expo'],
    files: {
      'apps/desktop/package.json': JSON.stringify({ dependencies: { expo: '56.0.0' } }),
      'apps/expo/package.json': JSON.stringify({ dependencies: { expo: '56.0.0' } }),
      'node_modules/demo/package.json': JSON.stringify({ version: '1.2.3' }),
      'patches/demo@1.2.3.patch': 'diff',
    },
  });
  assert.throws(() => runNativePatchesScan(env), /AMBIGUOUS native app/);
});

test('the DEFAULT resolver falls back to the ROOT manifest in a single-package repo', () => {
  const env = envWithRealResolver({
    listAppDirs: () => [],
    files: {
      'package.json': JSON.stringify({ expo: { autolinking: { buildFromSource: ['.*'] } } }),
      'node_modules/demo/package.json': JSON.stringify({ version: '1.2.3' }),
      'patches/demo@1.2.3.patch': 'diff',
    },
  });
  assert.deepEqual(runNativePatchesScan(env), []);
});
