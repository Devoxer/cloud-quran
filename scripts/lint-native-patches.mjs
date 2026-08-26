#!/usr/bin/env node
/**
 * lint:native-patches — the fail-closed gate that a `patchedDependencies` patch is STILL APPLIED
 * (Story 20.8, AC 6).
 *
 * Native patches are the one class of change the whole headless regression net is blind to. A patch
 * to a dependency's Kotlin/Swift source compiles into the APK/IPA and nowhere else: tsc, jest-expo,
 * RNTL, Biome and `expo export` never see it. So the failure mode is silent — the patch stops
 * applying, every gate stays green, and the defect it fixed simply comes back on the next native
 * build. Four ways that happens, all of them a routine `pnpm install` away:
 *
 *   1. **The version drifts out from under the key.** `patchedDependencies` keys are
 *      version-qualified (`react-native-screens@4.25.2`). A `~4.25.2` range in the app manifest that
 *      later resolves 4.25.3 makes the key stop matching — pnpm installs the dep UNPATCHED and says
 *      nothing. (This is why AC-2 pins the dep EXACT; this guard is the second line of defence.)
 *   2. **The patch file goes missing** (a bad merge, a `patches/` cleanup) while the entry remains.
 *   3. **The entry lands in the wrong file.** pnpm v10+ reads `patchedDependencies` from
 *      `pnpm-workspace.yaml` ONLY; an entry left in `package.json#pnpm` is read as nothing and the
 *      dep installs unpatched with zero error (STACK-CHEAT-SHEET § Monorepo / pnpm).
 *   4. **The package starts shipping a prebuilt AAR.** pnpm patches the `.kt` faithfully and gradle
 *      links `local-maven-repo/` instead, so the patched source is never compiled
 *      (STACK-CHEAT-SHEET § "Precompiled Expo modules (SDK 56+) SILENTLY IGNORE patchedDependencies").
 *      This is the one failure where all the source-level assertions pass — hence check (d).
 *
 * What it asserts, for EVERY `patchedDependencies` entry:
 *   a. the patch file named by the entry exists, and the key is an EXACT version (a bare or ranged
 *      key silently opts out of drift detection, so it is rejected rather than tolerated);
 *   b. the INSTALLED package's version equals the key's version EXACTLY (catches 1), at the
 *      workspace root AND in any nested `apps/&#42;/node_modules` copy that outranks it for a
 *      platform build;
 *   c. the patch REVERSE-APPLIES cleanly to the installed package — i.e. it is provably already
 *      applied, in full, at the exact positions the patch specifies (catches 2 and 3). Checked in
 *      the root copy AND in every nested copy, since that is the one a build from that app resolves;
 *   d. a package that ships a `local-maven-repo/` prebuilt AAR **at its package root** is declared
 *      to build from source via `expo.autolinking.buildFromSource` in the APP's own manifest —
 *      the only manifest autolinking reads, with entries matched as REGEXES (catches 4).
 * Plus the reverse direction: every file in `patches/` is registered by some entry, so a patch that
 * was cut but never wired up (or orphaned by an entry rename) is caught rather than sitting inert.
 *
 * ── (c) DELEGATES TO `git apply --reverse --check`, AND THAT IS THE WHOLE POINT ──
 *
 * This gate previously hand-rolled a unified-diff parser and asserted that each hunk's post-image
 * appeared as a contiguous run of trimmed lines in the installed source. Every defect it has ever
 * had was a defect in that parser, and two of them were silent FALSE PASSES — the one failure mode
 * a fail-closed gate must never have:
 *
 *   • A hunk body line that is the empty string (a blank context line whose lone trailing space was
 *     stripped by an editor or by `git apply --whitespace=fix`) ended the hunk, silently dropping
 *     every remaining assertion. On stripped copies of the real patches that discarded 100% of the
 *     react-native-screens assertions and 67% of expo-audio's — while `git apply` still applied
 *     both patches perfectly, so pnpm stayed correct and only the GATE went blind.
 *   • A hunk whose removed lines sit at its leading or trailing edge has a post-image that is pure
 *     CONTEXT — which by definition matches the UNPATCHED file just as well as the patched one. The
 *     gate certified a patch as applied against source that still contained the line it deletes.
 *
 * Both are inherent to approximate line-matching, not oversights to patch one more time. `git apply
 * --reverse --check` is the exact question we mean to ask — "is this patch already applied here?" —
 * answered by the same parser pnpm itself uses, with no trimming, no heuristics, and full awareness
 * of removals, renames, mode bits, binary hunks and file creation/deletion. It needs no git
 * repository (the package dir is inside node_modules and gitignored; verified working there and in
 * a bare copy outside any repo), and `git` is already a hard prerequisite of this workspace.
 *
 * A missing or non-executable `git` is a HARD ERROR, never a skip — a gate that quietly stops
 * checking when a tool is absent is the failure it exists to prevent.
 *
 * FAIL-CLOSED, per the cheat sheet's "make every grep-based gate fail closed" rule — and here that
 * rule has teeth, because the natural bug is a gate that passes with ZERO entries scanned precisely
 * when the config it reads has broken. So: a missing `patchedDependencies:` heading, an
 * unparseable line under it, a duplicate key, an empty block, an unusable `git`, or a missing
 * installed package are all ERRORS, never a quiet zero-finding pass. The same reasoning
 * covers the entrypoint check at the bottom: it compares REAL paths, because a lexical comparison
 * turns the whole gate into a silent `exit 0` when it is invoked through a symlinked checkout.
 *
 * The YAML is parsed by a small line scanner, NOT the `yaml` package: `yaml` resolves at the repo
 * root only because `nodeLinker: hoisted` flattens an UNDECLARED transitive there — it is nobody's
 * dependency, so any unrelated dep change can remove it and turn this gate into a hard failure for
 * the wrong reason. `patchedDependencies` is a flat `key: value` block, which needs no YAML engine.
 *
 * Mirrors `scripts/lint-layers.mjs` / `lint-style.mjs` / `lint-i18n.mjs`: pure exported helpers so
 * the `node --test` companion drives most cases on inline strings. Check (c) is the exception —
 * its companion tests build real files in a temp dir and run real git, because a fake cannot
 * substantiate a claim about git's behaviour (and a fake is exactly what let the previous
 * implementation's false passes go unnoticed).
 *
 * Run: `node scripts/lint-native-patches.mjs` (wired into the root `lint` chain).
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainModule } from './gate-lib.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const WORKSPACE_YAML = join(repoRoot, 'pnpm-workspace.yaml');
export const PATCHES_DIR = join(repoRoot, 'patches');

/** Strip an optional YAML trailing comment and surrounding quotes from a scalar. */
function unquote(s) {
  const t = s.trim();
  if ((t.startsWith("'") && t.endsWith("'")) || (t.startsWith('"') && t.endsWith('"'))) {
    return t.slice(1, -1);
  }
  return t;
}

/**
 * Normalize a patch path so the entry side and the `patches/` listing side compare as equals.
 * `./patches/x.patch`, `patches//x.patch`, `patches/./x.patch`, `patches/../patches/x.patch` and
 * `patches/x.patch` are all the same file to pnpm, and a gate that reports one of them as an orphan
 * while its entry passes is a self-contradiction — which is exactly how a team learns to ignore a
 * gate. Purely lexical (no filesystem access), which is correct here: these are repo-relative
 * literals from a config file, not paths to resolve through symlinks.
 */
export function normalizePatchPath(p) {
  const parts = p.trim().replace(/\\/g, '/').split('/');
  const out = [];
  for (const seg of parts) {
    if (seg === '' || seg === '.') continue; // `patches//x`, `./patches/./x`
    if (seg === '..' && out.length > 0 && out[out.length - 1] !== '..') {
      out.pop(); // `patches/../patches/x` === `patches/x`
      continue;
    }
    out.push(seg);
  }
  return out.join('/');
}

/**
 * Parse the ONE `patchedDependencies:` block out of `pnpm-workspace.yaml` text.
 * Returns `[{ key, patchPath }]`. THROWS (fail-closed) when the block is absent, empty, holds a
 * duplicate key, or holds a line this scanner does not recognize — an unreadable config must never
 * read as "no patches".
 */
export function parsePatchedDependencies(yamlText) {
  // A UTF-8 BOM would defeat the column-0 anchor below and produce "no block found" for a file
  // whose block is on line 1 — a true statement about the regex, a false one about the config.
  const lines = yamlText.replace(/^﻿/, '').split('\n');
  const headingIdxs = lines.flatMap((l, i) =>
    /^patchedDependencies:\s*(#.*)?$/.test(l) ? [i] : []
  );
  if (headingIdxs.length === 0) {
    throw new Error(
      'no top-level `patchedDependencies:` block found in pnpm-workspace.yaml. If every native ' +
        'patch was intentionally removed, delete this gate in the same change; an absent block is ' +
        'NOT treated as "zero patches" (that is the exact failure this gate exists to catch).'
    );
  }
  // Two blocks: `pnpm install` fails outright (YAML rejects the duplicate key), but this scanner
  // would happily verify the FIRST and report clean — green lint on a file pnpm cannot even read.
  if (headingIdxs.length > 1) {
    throw new Error(
      `pnpm-workspace.yaml has ${headingIdxs.length} top-level \`patchedDependencies:\` blocks ` +
        `(lines ${headingIdxs.map((i) => i + 1).join(', ')}). YAML forbids the duplicate key, so ` +
        'pnpm cannot read this file at all — merge them into one block.'
    );
  }
  const headingIdx = headingIdxs[0];

  const entries = [];
  const seen = new Map();
  for (let i = headingIdx + 1; i < lines.length; i++) {
    const raw = lines[i];
    if (/^\s*$/.test(raw)) continue; // blank lines are legal inside a block
    if (/^\s*#/.test(raw)) continue; // comment line (the expo-audio entry documents itself)
    // A non-indented, non-comment line ends the block (the next top-level key).
    if (!/^\s/.test(raw)) break;

    // `  <pkg>@<version>: <path>` — keys and values may be quoted (a scoped package must be).
    const m = raw.match(/^\s+('[^']+'|"[^"]+"|[^\s:#]+)\s*:\s*('[^']+'|"[^"]+"|[^\s#]+)\s*(#.*)?$/);
    if (!m) {
      throw new Error(
        `unparseable line ${i + 1} inside the patchedDependencies block: ${JSON.stringify(raw)}. ` +
          'The gate refuses to guess — fix the line, or extend this scanner deliberately.'
      );
    }
    const key = unquote(m[1]);
    // YAML lets a duplicate key parse; pnpm keeps only the LAST. A gate that verified the first one
    // would certify a patch pnpm never applies.
    if (seen.has(key)) {
      throw new Error(
        `duplicate patchedDependencies key ${JSON.stringify(key)} (lines ${seen.get(key)} and ` +
          `${i + 1}). pnpm silently keeps only the last one, so the others are dead config.`
      );
    }
    seen.set(key, i + 1);
    entries.push({ key, patchPath: normalizePatchPath(unquote(m[2])) });
  }

  if (entries.length === 0) {
    throw new Error(
      'the `patchedDependencies:` block is present but EMPTY. Remove the block and this gate ' +
        'together if that is intended; an empty block passing silently would hide a dropped patch.'
    );
  }
  return entries;
}

/**
 * Split a `patchedDependencies` key into `{ name, version }`.
 * The version separator is the LAST `@`, so a scoped name (`@expo/audio@1.2.3`) parses correctly.
 *
 * `version` is `null` for a bare package name — a form pnpm accepts (patch every resolved version).
 * That is a legal config, so this does NOT throw; the caller reports it, because a key with no exact
 * version silently opts out of drift detection, which is half of what this gate is for.
 */
export function parsePatchKey(key) {
  const at = key.lastIndexOf('@');
  // `@scope/name` has its only `@` at index 0 — that is a bare scoped name, not a version.
  if (at <= 0) return { name: key, version: null };
  const name = key.slice(0, at);
  const version = key.slice(at + 1);
  if (!name || !version) throw new Error(`patchedDependencies key ${JSON.stringify(key)} is empty`);
  return { name, version };
}

/** An exact version — no range operator, no wildcard, no whitespace. */
export function isExactVersion(version) {
  return (
    typeof version === 'string' && /^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)
  );
}

/**
 * Is `patchPath` already applied inside `packageDir`?
 *
 * Delegates to `git apply --reverse --check`: if the patch reverse-applies cleanly, the tree
 * already contains exactly what the patch produces — every added line at its real position, every
 * removed line genuinely gone, every rename/mode/binary section accounted for. That is a strictly
 * stronger statement than any line-presence heuristic can make, and it is git's parser rather than
 * ours (see the header for the two silent false passes the hand-rolled one shipped with).
 *
 * `--whitespace=nowarn` suppresses git's advisory whitespace chatter only; it does not relax
 * matching. `--` terminates option parsing so a patch filename can never be read as a flag.
 *
 * ⚠️ `GIT_DIR` IS LOAD-BEARING — WITHOUT IT THIS CHECK PASSES VACUOUSLY.
 * `node_modules/` sits INSIDE this repository's work tree (gitignored, but inside it). Run there,
 * `git apply` resolves the patch's paths against the REPOSITORY ROOT and then, per its documented
 * behaviour, "patched paths outside the directory are ignored" — so `android/src/…` resolves to
 * `<repoRoot>/android/src/…`, falls outside `node_modules/<pkg>/`, and is skipped. Every hunk is
 * ignored and git exits 0: a total false pass. Verified directly — a patch naming a file that does
 * not exist anywhere also exits 0 in that mode.
 * Pointing `GIT_DIR` at a path that does not exist makes git treat the cwd as being outside any
 * repository, which is the mode we actually want: paths resolve relative to `cwd` and nothing is
 * skipped. `GIT_CEILING_DIRECTORIES` was tried first and REJECTED — it discriminated correctly
 * only when set to the exact repo root and passed vacuously when set one level higher, so it
 * depends on knowledge the caller cannot reliably have. Do not "simplify" this env away: the
 * companion suite pins it with a patch that must FAIL, which is the only shape of test that can
 * catch this regressing.
 *
 * Returns `{ ok, message }`. A missing/unusable `git` returns `ok: false` with a message saying so
 * — the caller surfaces it as a violation, so the gate fails CLOSED rather than skipping the check.
 */
export function isPatchApplied(patchPath, packageDir, run = spawnSync) {
  const r = run(
    'git',
    [
      'apply',
      '--reverse',
      '--check',
      '--whitespace=nowarn',
      // ⚠️ HERMETIC, DELIBERATELY. `git apply` honours `apply.ignoreWhitespace` from the user's
      // ~/.gitconfig, and with it set to `change` this check certifies UNPATCHED source as
      // patched — a silent false pass whose trigger is a developer's personal git config or a CI
      // base image. Verified: whitespace-only patch, unpatched tree, `apply.ignoreWhitespace=change`
      // → exit 0. The flag and the two config overrides below make the verdict depend on the tree
      // alone, which is the only thing this gate is entitled to have an opinion about.
      '--no-ignore-whitespace',
      '--',
      patchPath,
    ],
    {
      cwd: packageDir,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_DIR: join(packageDir, '.git-not-a-repo-see-isPatchApplied'),
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_SYSTEM: '/dev/null',
      },
    }
  );

  if (r.error) {
    return {
      ok: false,
      message:
        `could not run \`git apply\` (${r.error.message}). git is required to verify native ` +
        'patches; this gate fails closed rather than skipping the check.',
    };
  }
  if (r.status === 0) return { ok: true, message: '' };

  const detail = `${r.stderr ?? ''}`.trim().split('\n').slice(0, 4).join('; ');
  // Exit 1 = "the patch does not apply here" (a real verdict about the tree). Exit 128 = git could
  // not read the patch at all (corrupt hunk header, truncated hunk, binary section with no index).
  // Both are violations — this gate fails closed either way — but they send the reader to
  // completely different fixes, so do not report a corrupt patch file as "the patch is not applied".
  if (r.status !== 1) {
    return {
      ok: false,
      message:
        `git could not evaluate the patch (exit ${r.status}) — this usually means the PATCH FILE ` +
        `is malformed, not that the package is unpatched. git said: ${detail || '(no output)'}`,
    };
  }
  return {
    ok: false,
    message:
      'the patch does NOT reverse-apply to the installed package — it is not applied (or only ' +
      `partly applied) there. git said: ${detail || `exit ${r.status}`}`,
  };
}
/**
 * The ONE mechanism that makes gradle build an Expo module from source instead of linking its
 * prebuilt AAR: `expo.autolinking.buildFromSource` in the APP's own `package.json`.
 *
 * ⚠️ TWO THINGS HERE WERE WRONG FOR THREE REVIEW ROUNDS — both made check (d) pass when it should
 * have failed. Neither is a nit; read before "simplifying" this.
 *
 * 1. **`expo-build-properties` `android.buildFromSource: true` is NOT an escape hatch for this,
 *    and must NOT be honoured.** It reads like "build everything from source", and an earlier
 *    revision of this gate treated it as a project-wide short-circuit that disabled check (d)
 *    entirely. It is in fact the **React-Native**-from-source flag —
 *    `expo-build-properties/build/pluginConfig.d.ts`: *"Enable building React Native from source …
 *    @deprecated Use `buildReactNativeFromSource` instead"* — and `build/android.js` does nothing
 *    but add an `includeBuild(expoAutolinking.reactNative)` substituting
 *    `com.facebook.react:react-android`/`hermes-android`. It has ZERO effect on whether an Expo
 *    module is consumed as an AAR. Honouring it waved every package through.
 *    The project-wide form of THIS setting is `expo.autolinking.buildFromSource: [".*"]`.
 *
 * 2. **Only the APP's manifest counts — not the root, not `packages/*`.** Autolinking reads a
 *    single manifest: `expo-modules-autolinking/src/commands/autolinkingOptions.ts`
 *    → `findPackageJsonPathAsync` walks UP from the command root and returns the FIRST
 *    `package.json` it finds (`apps/expo/package.json`), with no merge upward. A declaration at
 *    the repo root satisfies a gate that scans "any workspace manifest" and does nothing at all
 *    for gradle. (Root is used only as the fallback when there is no `apps/*` at all.)
 *
 * Entries are **regexes**, not literal names — `ExpoAutolinkingConfig.kt:63` builds
 * `buildFromSourceRegex = buildFromSource.map { it.toRegex() }` and `SettingsManager.kt:71` does
 * `.any { it.matches(project.name) }`. So `[".*"]` and `["expo-.*"]` are legal and must satisfy
 * this check, or the gate reports a violation naming an escape hatch already taken.
 *
 * Returns a predicate `(name) => boolean`.
 */
function collectBuildFromSource(readFile, exists, manifestPaths) {
  const patterns = [];

  for (const p of manifestPaths) {
    if (!exists(p)) continue;
    try {
      const list = JSON.parse(readFile(p))?.expo?.autolinking?.buildFromSource;
      if (!Array.isArray(list)) continue;
      for (const e of list) {
        if (typeof e !== 'string') continue;
        try {
          // Anchored, matching Kotlin's `Regex.matches` (whole-string), not `find`.
          patterns.push(new RegExp(`^(?:${e})$`));
        } catch {
          // An invalid regex would throw in gradle too; not this gate's error to own.
        }
      }
    } catch {
      // A manifest we cannot parse is not this gate's problem — biome/tsc own that.
    }
  }

  return (name) => patterns.some((re) => re.test(name));
}

/**
 * Run the full scan. Returns violation strings (empty = clean).
 *
 * `env` is injectable for the companion test:
 * `{ workspaceYaml, readFile, exists, absolute, runGit, listPatches, listWorkspaceManifests,
 *    listAppDirs }`.
 *
 * `runGit` is the `spawnSync` seam for check (c): the test drives the decision table on a fake
 * without shelling out, and a separate integration test exercises the REAL `git apply` against
 * temp fixtures, so neither the wiring nor the primitive goes unverified.
 */
export function runNativePatchesScan(env = {}) {
  const readFile = env.readFile ?? ((p) => readFileSync(join(repoRoot, p), 'utf8'));
  const exists = env.exists ?? ((p) => existsSync(join(repoRoot, p)));
  const absolute = env.absolute ?? ((p) => join(repoRoot, p));
  const runGit = env.runGit ?? spawnSync;
  const workspaceYaml = env.workspaceYaml ?? readFileSync(WORKSPACE_YAML, 'utf8');
  const dirsUnder = (d) => (existsSync(join(repoRoot, d)) ? readdirSync(join(repoRoot, d)) : []);
  // Declared BEFORE `listWorkspaceManifests` because that resolver USES it — which is what makes
  // the resolver drivable from a test without touching the real filesystem.
  const listAppDirs = env.listAppDirs ?? (() => dirsUnder('apps'));
  // ONLY the app manifests — autolinking reads the nearest `package.json` walking up from the
  // build root and never merges upward, so a declaration at the repo root or in `packages/*` is
  // read by nobody. Root is the fallback only when there is no `apps/*` (single-package repo).
  // ⚠️ EXACTLY ONE manifest, not every `apps/*` (epic-20 boundary review). Returning all of them
  // and OR-ing their patterns contradicted rule 2 directly above: a `buildFromSource` declaration
  // in `apps/marketing/package.json` — a package with no native build at all — would have
  // satisfied the gate while gradle, which reads only the native app's manifest, linked the
  // prebuilt AAR and compiled the patch into nothing. The native app is identified by DEPENDING
  // ON `expo` rather than by being named `expo`, so a rename does not silently re-open the hole;
  // if no `apps/*` qualifies we fall back to the root (single-package repo), never to "all".
  // ⚠️ Uses the INJECTED `exists`/`readFile` seams, not `existsSync`/`readFileSync` directly
  // (epic-20 boundary, round 2). Every other primitive in this function is injectable, and this
  // resolver was the one that reached past them — which made it untestable, so the behavioural
  // test passed `listWorkspaceManifests` explicitly and never executed this code at all. The
  // only thing asserting it was a regex over the scanner's own SOURCE TEXT.
  //
  // ⚠️ ALL qualifying manifests, then FAIL on more than one — never `.find()`. Silently taking
  // whichever `readdirSync` returned first is the same shape as the bug this resolver replaced:
  // today exactly one `apps/*` depends on `expo`, but `apps/desktop` (Electron wrapping the Expo
  // web export) sorts BEFORE `apps/expo` and would capture the gate the day it adds the dep, with
  // no error. An ambiguous answer here must stop the build, not pick one.
  const listWorkspaceManifests =
    env.listWorkspaceManifests ??
    (() => {
      const nativeApps = listAppDirs()
        .map((d) => `apps/${d}/package.json`)
        .filter((p) => {
          // NB: `exists`/`readFile` take REPO-RELATIVE paths (they join `repoRoot` themselves).
          if (!exists(p)) return false;
          try {
            const pkg = JSON.parse(readFile(p));
            return Boolean(pkg?.dependencies?.expo ?? pkg?.devDependencies?.expo);
          } catch {
            return false;
          }
        });
      if (nativeApps.length > 1) {
        throw new Error(
          `lint:native-patches — AMBIGUOUS native app: ${nativeApps.length} manifests under ` +
            `apps/* depend on \`expo\` (${nativeApps.join(', ')}). This check reads exactly one ` +
            `manifest, because gradle reads exactly one. Name the native app explicitly rather ` +
            `than letting directory order decide which one gates the build.`
        );
      }
      return nativeApps.length === 1 ? nativeApps : ['package.json'];
    });

  const out = [];
  const entries = parsePatchedDependencies(workspaceYaml); // throws → fail-closed, by design
  const registered = new Set();
  const buildsFromSource = collectBuildFromSource(readFile, exists, listWorkspaceManifests());

  for (const { key, patchPath } of entries) {
    const { name, version } = parsePatchKey(key);
    registered.add(patchPath);

    // (a) the patch file exists.
    if (!exists(patchPath)) {
      out.push(`[${key}] patch file is missing: ${patchPath}`);
      continue;
    }

    // (a) the key carries an EXACT version. A bare name or a range is legal pnpm config but it
    // opts the entry out of drift detection — the very failure this gate's check (b) exists for.
    if (!isExactVersion(version)) {
      out.push(
        `[${key}] the key must be \`${name}@<exact version>\` — ` +
          (version === null
            ? 'a bare package name patches whatever version resolves'
            : `\`${version}\` is a range or wildcard`) +
          ', so an upstream bump would be silently patched (or silently not) with no drift error. ' +
          'Pin the dependency exact and qualify the key with that version.'
      );
      continue;
    }

    // (b) the installed version matches the key EXACTLY. `nodeLinker: hoisted` puts the real
    // install at the WORKSPACE ROOT node_modules, not apps/expo/node_modules.
    const manifestPath = `node_modules/${name}/package.json`;
    if (!exists(manifestPath)) {
      out.push(`[${key}] package is not installed at the workspace root (${manifestPath})`);
      continue;
    }
    let installed;
    try {
      installed = JSON.parse(readFile(manifestPath)).version;
    } catch (err) {
      out.push(`[${key}] could not read ${manifestPath}: ${err.message}`);
      continue;
    }
    if (typeof installed !== 'string') {
      out.push(
        `[${key}] ${manifestPath} has no \`version\` field — the install is malformed. Re-run ` +
          '`pnpm install`; do NOT re-cut the patch on the strength of this message.'
      );
      continue;
    }
    if (installed !== version) {
      out.push(
        `[${key}] version DRIFT — patch targets ${version}, installed is ${installed}. pnpm ` +
          `matches patchedDependencies keys by exact version, so ${name} is currently installed ` +
          'UNPATCHED. Pin the dependency exact (no ^/~) and re-cut the patch for the new version.'
      );
      continue;
    }

    // Every install location that a build could resolve. `nodeLinker: hoisted` puts the real
    // install at the workspace root, but that is an assumption, not a law: a nested copy under an
    // app outranks the root one for a build run FROM that app, so each one is checked in full.
    const copies = [{ label: 'workspace root', dir: `node_modules/${name}` }];
    for (const app of listAppDirs()) {
      const nestedDir = `apps/${app}/node_modules/${name}`;
      if (exists(`${nestedDir}/package.json`)) {
        copies.push({ label: `apps/${app}/node_modules`, dir: nestedDir, nested: true });
      }
    }

    for (const copy of copies) {
      // (b, continued) a nested copy must be the same version.
      if (copy.nested) {
        let nestedVersion;
        try {
          nestedVersion = JSON.parse(readFile(`${copy.dir}/package.json`)).version;
        } catch {
          nestedVersion = undefined;
        }
        if (nestedVersion !== version) {
          out.push(
            `[${key}] a NESTED copy at ${copy.dir} is ${nestedVersion}, not ${version}. A native ` +
              `build run from ${copy.label} resolves that copy, which pnpm did not patch.`
          );
          continue; // version is wrong — the reverse-apply message would only be noise
        }
      }

      // (c) the patch is provably applied THERE. Checked per copy, not just at the root: a nested
      // copy at the right version can still hold unpatched source.
      const { ok, message } = isPatchApplied(absolute(patchPath), absolute(copy.dir), runGit);
      if (!ok) out.push(`[${key}] (${copy.label}) ${message}`);

      // (d) the precompiled-AAR trap: patched source that gradle never compiles. Probed per copy
      // for the same reason — the AAR that matters is the one in the copy the build resolves.
      //
      // ⚠️ THE PATH IS `<pkg>/local-maven-repo/`, AT THE PACKAGE ROOT. An earlier revision probed
      // `<pkg>/android/local-maven-repo/`, which does not exist in any published Expo module: 22
      // packages in this very tree ship the directory and NOT ONE has it under `android/`. So this
      // check could never evaluate true — it passed on every input, including the real
      // `expo-audio` patch it exists to protect, and its unit tests encoded the same wrong path so
      // they passed too. Verify a change here against real `node_modules`, not a fixture.
      const aarDirs = [`${copy.dir}/local-maven-repo`, `${copy.dir}/android/local-maven-repo`];
      const aarDir = aarDirs.find((d) => exists(d));
      if (aarDir && !buildsFromSource(name)) {
        out.push(
          `[${key}] (${copy.label}) ${name} ships a prebuilt AAR (${aarDir.slice(copy.dir.length + 1)}/) ` +
            "but is not declared to build from source in the app's `package.json` " +
            '`expo.autolinking.buildFromSource` list (entries are REGEXES; `".*"` covers all). ' +
            'pnpm patched the source and gradle will link the AAR instead — the patch compiles ' +
            'into nothing. NOTE: `expo-build-properties` `android.buildFromSource` does NOT help ' +
            'here — that is the deprecated React-Native-from-source flag, unrelated to module ' +
            'AARs. See STACK-CHEAT-SHEET § "Precompiled Expo modules (SDK 56+) SILENTLY IGNORE ' +
            'patchedDependencies".'
        );
      }
    }
  }

  // Reverse direction — an unregistered patch file is inert; catch it rather than let it rot.
  // Recursive by one level, because a scoped package's patch lives at `patches/@scope/name@v.patch`.
  const listPatches =
    env.listPatches ??
    (() => {
      if (!existsSync(PATCHES_DIR)) return [];
      // Case-INSENSITIVE on the extension: macOS and Windows filesystems are case-insensitive, so
      // a `.PATCH` file is a real, applied patch there while a case-sensitive listing would call it
      // invisible — and the whole point of this scan is that nothing in `patches/` goes unnoticed.
      const isPatch = (f) => f.toLowerCase().endsWith('.patch');
      const found = [];
      for (const e of readdirSync(PATCHES_DIR, { withFileTypes: true })) {
        if (e.isDirectory()) {
          for (const f of readdirSync(join(PATCHES_DIR, e.name))) {
            if (isPatch(f)) found.push(`${e.name}/${f}`);
          }
        } else if (isPatch(e.name)) {
          found.push(e.name);
        }
      }
      return found;
    });
  for (const f of listPatches()) {
    const rel = normalizePatchPath(`patches/${f}`);
    if (!registered.has(rel)) {
      out.push(
        `[orphan] ${rel} exists but no patchedDependencies entry references it — it is NOT ` +
          'applied. Register it in pnpm-workspace.yaml, or delete the file.'
      );
    }
  }

  return out;
}

function main() {
  let violations;
  try {
    violations = runNativePatchesScan();
  } catch (err) {
    console.error(`lint:native-patches — FAIL (fail-closed): ${err.message}`);
    // ⚠️ `process.exitCode` + `return`, NEVER `process.exit()` — Node's stderr is asynchronous
    // for a pipe on POSIX and `process.exit()` does not drain it, so under `turbo`/`| tee` the
    // violation list is truncated exactly on the run with the most output.
    process.exitCode = 1;
    return;
  }

  if (violations.length > 0) {
    console.error(`lint:native-patches — ${violations.length} problem(s):\n`);
    for (const v of violations) console.error(`  ${v}`);
    console.error(
      '\nA native patch that stops applying is invisible to tsc / jest / expo export — the only ' +
        'symptom is the original defect returning on the next native build. See ' +
        'STACK-CHEAT-SHEET.md § "Precompiled Expo modules … SILENTLY IGNORE patchedDependencies".'
    );
    process.exitCode = 1;
    return;
  }

  console.log('lint:native-patches — OK (every patchedDependencies patch is applied in-tree)');
}

// `onUnknown: 'run'` — an offline gate with no side effects: the unsafe outcome is skipping
// SILENTLY (a fail-closed gate reporting success having checked nothing), so warn loudly and run.
// (`'skip'` is the OTHER direction, for a script whose RUN has a cost — story 5-2 deleted the
// only caller that took it; `gate-lib.mjs` still supports it and explains when it is right.)
if (isMainModule({ url: import.meta.url, onUnknown: 'run', label: 'lint:native-patches' })) main();
