#!/usr/bin/env node
/**
 * lint:layers — enforces the one-way layer dependency rules from
 * STACK-CHEAT-SHEET.md § "Layer separation" (Story 16.6, AC #16–19).
 *
 * Dependencies flow one way only:
 *   screens (app/) → components → hooks → lib → (constants/types/@cloudquran/shared)
 *   worker → @cloudquran/shared (types) only, NEVER apps/expo/.
 *
 * Rules (any match → nonzero exit, fails the same gate as Biome):
 *   1. a HOOK (apps/expo/src/hooks/** OR apps/expo/src/features/{x}/hooks/**) must NOT
 *      import from @/app (a hook reaching into a screen).
 *   2. a LIB (apps/expo/src/lib/** OR a feature's own apps/expo/src/features/{x}/lib/**)
 *      must NOT import @/components, @/contexts, @/app, or react-native UI primitives
 *      (View/Text/Pressable/ScrollView/Image/...).
 *   3. apps/worker/src/**      must NOT import from apps/expo/.
 *   4. FEATURE-FIRST isolation (Story 21.3). A file in feature {A} (anything under
 *      apps/expo/src/features/{A}/{components,hooks,lib,stores}/) must NOT deep-import
 *      another feature {B} (`@/features/{B}/File`); use B's PUBLIC BARREL (`@/features/{B}`).
 *      The feature graph (unified across a feature's components+hooks+lib+stores) must stay
 *      ACYCLIC (no A↔B). A file also must NOT import its OWN feature's public barrel
 *      (self-barrel → require cycle; import the sibling directly, e.g. './Name' or the
 *      per-kind path `@/features/{A}/hooks`). The same self-barrel guard covers the shared
 *      ui/ + layout/ layers and the shared hooks/ (top-level + hooks/auth) vs hooks/index.
 *      Barrels are INCLUDED in cross-feature edge/cycle detection (a barrel re-exporting
 *      another feature forms a feature edge) but exempt from the self-barrel check. `auth`
 *      is SHARED infra (apps/expo/src/hooks/auth), never a feature. Story 21.3 — the
 *      "deleting a feature folder must not break the rest" rule, ported to feature-first.
 *   5. SHARED→FEATURE isolation (Story 21.4). A SHARED-layer file (under apps/expo/src/ but
 *      NEITHER a feature NOR a route — lib/, the top-level hooks/ incl. hooks/auth,
 *      components/ui|layout, stores/, contexts/, constants/, types/, and ANY future shared dir)
 *      must NOT import `@/features/{x}` by ANY path (barrel OR deep). This is what makes
 *      `rm -rf features/{x}` safe — the shared layer never depends on a feature. Closes the
 *      rule-4 GAP: rule-4 only fires when the IMPORTING file is itself a feature
 *      (`if (!fromFeature) continue`), so a shared file reaching into a feature slipped through
 *      (true in both kind-first and the feature-first port). Routes (app/) are exempt (a route
 *      mounting a feature screen is the point). The subject set is the COMPLEMENT of
 *      (features ∪ routes), so a new shared dir can't silently re-open the hole. No allowlist —
 *      the tree has zero such edges (21.4 relocated the lone one into its owning feature).
 *
 *   6. API CHOKEPOINT (Story 5-4). `hono/client`'s `hc()` — the constructor for the typed RPC
 *      client that reaches the worker data layer — may be imported and called in EXACTLY ONE
 *      module, `apps/expo/src/lib/api.ts`. This is HALF the enforcement CLAUDE.md's "features
 *      never reach the data layer directly" lacked between stories 5-2 and 5-4: it stops a SECOND
 *      client being minted, and nothing more. It FAILS CLOSED on a missing or hollowed-out
 *      chokepoint; see the scan near the bottom of this file for why that half matters more than
 *      the rule itself.
 *   7. QUERY MODULE CHOKEPOINT (story 5-6). `@/lib/api` — by ANY spelling, including a relative
 *      `./api` and a type-only import — may be imported only by `apps/expo/src/lib/sync.ts`, the
 *      query module that owns the cache, the invalidation and the write outbox. Rule 6 alone left
 *      the open door: its own self-test blesses a feature calling `api.health.$get()` directly, so
 *      until this rule existed a component reaching `api.sync[...]` raw — no cache, no debounce,
 *      no outbox — was green on every gate. The rule ALSO covers `@/lib/syncCache`, the query
 *      module's network-free half, which is importable only by `lib/sync.ts` and by
 *      `lib/accountTeardown.ts` (which cannot go through `lib/sync.ts` without closing a require
 *      cycle) — otherwise it is a second door onto the same cache and query client — and
 *      `@/lib/outbox`, whose exported singleton is a third door: `outbox.enqueue(...)` reaches
 *      the worker with no cache update, no invalidation and no debounce. FAILS CLOSED, on the
 *      same reasoning as rule 6.
 *
 * Why rule-2 is defined precisely this way — and NOT as a blanket "no react-native in lib/":
 * the cheat sheet ITSELF places the theme/animation hooks (useTheme/useThemedStyles) in lib/,
 * and several libs (storage, notifications, connectivity, haptics, secureStore, and the player
 * feature's own features/player/lib/audioMode) legitimately use react-native RUNTIME
 * utilities (Platform, Appearance, Dimensions, NativeModules, StyleSheet). A blanket ban would
 * self-flag the very files this stack prescribes. So rule-2 ALLOWS: `react`, RN runtime utils,
 * and the @/hooks / @/lib / @/constants / @/types layers; it FLAGS only UI-component /
 * higher-UI-layer imports (@/components, @/contexts, @/app) and react-native UI primitives.
 * Rule-2 applies to the shared apps/expo/src/lib/ AND to every feature's own
 * apps/expo/src/features/{x}/lib/ (a feature's lib is still pure logic — no UI).
 *
 * Sanctioned lib/ files (exempt from the RN-primitive rule) are the cheat-sheet-blessed
 * theme/animation hooks (useThemedStyles/animation). Story 16.8 moved useColorScheme into lib/,
 * so lib/theme.ts now imports the sibling @/lib/useColorScheme (not @/components) and was dropped
 * from the exemption set.
 *
 * Fail-closed (Epic-16 review): the gate REFUSES to pass if a required scan root is missing —
 * a scanner that finds zero files in a renamed/absent root would otherwise pass vacuously
 * (the "don't ship a fail-open gate" rule from the cheat sheet). Pure helpers are exported so
 * `scripts/__tests__/lint-layers.test.mjs` can assert the evasion cases without spawning.
 */

import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  blankCommentsAndStrings,
  blankStrings,
  isMainModule,
  isMarkerLine,
  lineOfIndex,
  splitLines,
} from './gate-lib.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const EXPO_SRC = join(repoRoot, 'apps/expo/src');
export const WORKER_SRC = join(repoRoot, 'apps/worker/src');

// Required scan roots — main() fails closed if any is missing (see missingRoots()).
export const SCAN_ROOTS = [
  ['apps/expo/src', EXPO_SRC],
  ['apps/worker/src', WORKER_SRC],
];

// react-native UI primitives — importing these into lib/ is a violation. (Runtime utilities
// like Platform/Appearance/Dimensions/NativeModules/StyleSheet are intentionally NOT here.)
export const RN_UI_PRIMITIVES = new Set([
  'View',
  'Text',
  'Pressable',
  'ScrollView',
  'Image',
  'ImageBackground',
  'FlatList',
  'SectionList',
  'VirtualizedList',
  'TouchableOpacity',
  'TouchableHighlight',
  'TouchableWithoutFeedback',
  'TouchableNativeFeedback',
  'Modal',
  'SafeAreaView',
  'KeyboardAvoidingView',
  'ActivityIndicator',
  'Switch',
  'TextInput',
  'Button',
  'RefreshControl',
  'InputAccessoryView',
  'DrawerLayoutAndroid',
]);

// Sanctioned theme/animation hooks that the cheat sheet places in lib/ — exempt from the
// RN-primitive rule. Story 16.8 moved useColorScheme into lib/, so lib/theme.ts now imports the
// SIBLING @/lib/useColorScheme instead of @/components/useColorScheme — it no longer reaches into
// @/components and was therefore DROPPED from this set (its only reason for exemption is gone).
// Only files that actually exist AND need the exemption are listed: useThemedStyles.ts imports
// StyleSheet (broad RN). The cheat-sheet also sanctions lib/animation.ts, but it does not exist in
// this app yet — re-add it here (with justification) if/when it lands and genuinely needs rule-2
// relief. We do NOT pre-authorize nonexistent files: a dead exemption silently masks rule-2.
export const SANCTIONED_LIB_FILES = new Set(['apps/expo/src/lib/useThemedStyles.ts']);

// Story 17.8: the worker→apps/expo exception is GONE. The boundary contract lives in
// @cloudquran/shared, which both sides import — there is no remaining worker→expo reach to
// whitelist. The rule-3 scan below is unconditional (no exceptions list). (story 5-2: this
// comment used to name the InstantDB schema as what relocated; that file is deleted, and the
// point about the exception is what mattered.)

// Feature-first (Story 21.3): a feature is exactly a top-level folder under apps/expo/src/features/.
// Everything else under src/ — components/ui, components/layout, lib/, stores/, contexts/, the shared
// hooks/ (top-level + hooks/auth), constants/, types/ — is the SHARED layer (importing it never
// creates a cross-feature edge). The kind-first COMP_SHARED set is obsolete (features left components/).
const FEATURES_BASE = 'apps/expo/src/features/';

/** Required scan roots that are missing or not directories (fail-closed trigger). */
export function missingRoots(roots = SCAN_ROOTS) {
  return roots.filter(([, p]) => !(existsSync(p) && statSync(p).isDirectory())).map(([n]) => n);
}

/**
 * Recursively collect .ts/.tsx source files, skipping tests and build dirs.
 *
 * ⚠️ AN UNREADABLE DIRECTORY THROWS — IT DOES NOT SILENTLY DROP ITS SUBTREE (Epic-24 boundary,
 * MEDIUM). This `catch` swallowed EVERY error and returned an empty array, so one `EACCES` /
 * `EMFILE` / `EIO` / `ELOOP` on `apps/expo/src/features` removed that whole subtree from every gate
 * built on this walker (`lint:layers`, `lint:i18n`, `lint:style`) and each printed OK. The
 * zero-file floors those gates added are CONTAINER-level — they ask "did the whole root come back
 * empty?" — and cannot see a root that came back 90% full, which is the exact shape
 * `gates-scanners.md` warns about for a completeness guard keyed on the container.
 *
 * ENOENT stays soft, and only ENOENT: a caller may legitimately probe a directory that does not
 * exist (the per-root loop below does), and for a NESTED call it means the directory vanished
 * between the `statSync` above and this read. Absence of a required top root is a separate,
 * louder check (`missingRoots()`).
 *
 * ⚠️ EVERY EMITTED PATH IS CANONICAL, AND A SYMLINK IS NEVER FOLLOWED — DIRECTORY *OR* FILE. The
 * walk used to recurse through the ALIAS path, so with `features/alias -> lib` the first route to a
 * directory won and the canonical route was then skipped as already-visited: `lib/deep.ts` was
 * emitted only as `features/alias/deep.ts` and never under its real path. Both consequences are
 * fail-open, and the second is the serious one — layer classification and every exemption match are
 * path-PREFIX tests, so a `lib/` subtree reached through an in-tree symlink under `features/` is
 * classified as a FEATURE and rule 2 never applies to it.
 *
 * ⚠️ THE FILE BRANCH NEEDS THE SAME RULE, AND FOR ONE ROUND IT DID NOT HAVE IT (Story 35.4 Step G,
 * found by all three review layers). `features/alias.ts -> ../lib/real.ts` emitted BOTH paths, so
 * the same file was classified once as a feature and once as `lib/` — the identical fail-open, one
 * granularity down — and an out-of-root file link was pulled in under a fabricated in-root path
 * while the directory branch threw for exactly that case. A universality claim ("every emitted path
 * is canonical") that holds for only one of the two entry kinds is the shape `gates-scanners.md`
 * warns is wrong within two rounds; it was wrong within one.
 *
 * The root is canonicalized once, so inside the recursion `realpathSync(full) !== full` reduces to
 * the one question worth asking: is this entry itself a symlink? (Canonicalizing matters — without
 * it, a walk root reached through a symlinked parent makes EVERY child's realpath differ and the
 * skip below would swallow the whole tree.)
 *
 * `populationRoot` is the directory whose files this SCAN is responsible for, which is not always
 * the directory being walked: `runFeatureIsolationScan` walks one feature root at a time while the
 * population is all of `EXPO_SRC`. The skip-vs-throw rule below asks "does some canonical route in
 * the POPULATION reach this target", so a link from `features/a` into `lib/` must be skipped (the
 * whole-tree walks do reach it) rather than throwing. Defaults to the walk root, which is right for
 * every caller that scans what it walks.
 */
export function collectSourceFiles(dir, { populationRoot = dir } = {}) {
  let root;
  try {
    root = realpathSync(dir);
  } catch (err) {
    if (err?.code === 'ENOENT') return []; // same soft-ENOENT contract as the readdir below
    throw new Error(
      `lint — cannot resolve directory ${dir}: ${err?.code ?? ''} ${err?.message ?? err}`.trim() +
        '. Refusing to scan a partial tree.'
    );
  }
  let population;
  try {
    population = realpathSync(populationRoot);
  } catch {
    population = root; // an unresolvable population root degrades to the strict (throwing) rule
  }
  // ⚠️ THE ROOT ITSELF GETS THE SAME RULE AS EVERY ENTRY BELOW IT, AND FOR ONE ROUND IT DID NOT
  // (Story 35.4 Step I). `root` is canonicalized above before any check runs, so the guard only ever
  // saw links found DURING the walk — and the identical link behaved two opposite ways depending on
  // where it sat: found mid-walk it threw, used AS the walk root it was followed silently. That is
  // the fail-open this whole function exists to close, because the emitted paths then escape
  // `repoRoot` and every layer rule's path-PREFIX test stops matching (`classifyTarget` returns
  // null, so the rules skip the files rather than judging them). Reachable in production shape: the
  // rule-4 loop passes `features`/`hooks`/`components` as walk roots with `EXPO_SRC` as the
  // population, so `apps/expo/src/features -> …` outside is exactly this.
  //
  // ⚠️ RESIDUAL, STATED RATHER THAN IMPLIED: this can only fire when `populationRoot` is passed
  // EXPLICITLY. With the default (`populationRoot = dir`) the population is derived from the same
  // symlink, so `population === root` and the check is trivially satisfied — a symlinked whole-tree
  // root is NOT caught here. That case is benign in this repo for a reason worth writing down:
  // `repoRoot` derives from `import.meta.url`, which Node has already realpathed, so `EXPO_SRC` is
  // canonical by construction and a symlinked checkout does not produce it. Do not read this guard
  // as covering both callers.
  if (!reachedByCanonicalWalk(root, population)) {
    throw outOfPopulation(dir, root, population, 'walk root');
  }
  // Seeded with the root so a link pointing at an ancestor cannot re-enter it. After the
  // refuse-to-descend rule below this set is a BACKSTOP, not the primary defence: a tree of real
  // directories reached by their canonical paths is acyclic, so only a bind mount could hit it.
  return walkSourceFiles(root, new Set([root]), population);
}

/** Directory names the walk refuses to descend, by name, wherever they appear. Named once because
 * the skip-vs-throw rule below has to know about them: a path under one of these is inside the
 * population and yet reached by NO canonical route. */
const EXCLUDED_DIR_NAMES = new Set(['__tests__', 'node_modules', '.expo']);

/** True if `real` is the population root or sits underneath it. */
const inPopulation = (real, population) => real === population || real.startsWith(population + sep);

/** True if any segment of `real` BELOW the population root is a directory the walk excludes by name
 * — so the canonical route to it is refused and `inPopulation` alone overstates reachability. */
const underExcludedDir = (real, population) =>
  real
    .slice(population.length)
    .split(sep)
    .some((seg) => EXCLUDED_DIR_NAMES.has(seg));

/**
 * The question the skip-vs-throw rule actually needs answered: **does some canonical route in the
 * scanned population reach this target?** Only then does skipping an alias lose nothing.
 *
 * ⚠️ THIS WAS `inPopulation` ALONE FOR ONE ROUND, AND THE TWO ARE NOT THE SAME QUESTION (Story 35.4
 * Step I, found independently by two layers, which then disagreed on its severity). A path under
 * `__tests__/`, `node_modules/` or `.expo/` passes the prefix test and is skipped as "covered by the
 * canonical route" — while the canonical route is skipped by NAME eight lines below. So
 * `features/vendored -> ../node_modules/vendored` was reached by nothing at all: the alias skipped
 * as in-population, the real path skipped as excluded, no throw, no output, gate prints OK. That is
 * the silently-narrowed population the sibling throw exists to refuse, arriving through the
 * predicate that decides when NOT to throw. Reproduced for both entry kinds and all three names.
 */
const reachedByCanonicalWalk = (real, population) =>
  inPopulation(real, population) && !underExcludedDir(real, population);

/** The shared refusal for a link no canonical route reaches. Both entry kinds use it: for a
 * directory, descending would emit non-canonical paths; for a file, pushing it would do the same —
 * and skipping either would drop files nothing else scans. The two reasons are reported distinctly
 * because they need different remedies. */
function outOfPopulation(full, real, population, kind) {
  const why = inPopulation(real, population)
    ? `which is inside the scanned population ${population} but under a directory this walk excludes ` +
      `by name (${[...EXCLUDED_DIR_NAMES].join(', ')}), so NO canonical route reaches it`
    : `which is OUTSIDE the scanned population ${population}`;
  return new Error(
    `lint — ${full} is a symlink to ${real}, ${why}. ` +
      `Refusing to scan a partial tree: taking this ${kind} would emit non-canonical paths (every ` +
      'layer rule and exemption is a path-PREFIX test), and skipping it would drop files no other ' +
      'route reaches. Move the target inside the root, or delete the link.'
  );
}

function walkSourceFiles(dir, visited, population) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch (err) {
    if (err?.code === 'ENOENT') return out;
    throw new Error(
      `lint — cannot read directory ${dir}: ${err?.code ?? ''} ${err?.message ?? err}`.trim() +
        '. Refusing to scan a partial tree: silently dropping this subtree would make every gate ' +
        'built on this walker report OK for files it never opened.'
    );
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    // ⚠️ `statSync` WAS OUTSIDE THE GUARD, and it FOLLOWS symlinks (Epic-24 boundary round 2, LOW).
    // Two residuals of the throw above: a dangling symlink raised a bare `ENOENT: … stat '…'`,
    // contradicting the stated "ENOENT stays soft" policy and losing the refusing-to-scan reason;
    // and a symlinked DIRECTORY is `isDirectory()`, so the walk recursed it with no realpath guard
    // and a cycle spun until `readdirSync` threw `ELOOP` — loud, but with an unrelated-looking
    // error. `gates-scanners.md` names the realpath cycle guard for exactly this shape.
    let st;
    try {
      st = statSync(full);
    } catch (err) {
      if (err?.code === 'ENOENT') continue; // a dangling symlink or a race — nothing to scan
      throw new Error(
        `lint — cannot stat ${full}: ${err?.code ?? ''} ${err?.message ?? err}`.trim() +
          '. Refusing to scan a partial tree.'
      );
    }
    if (st.isDirectory()) {
      if (EXCLUDED_DIR_NAMES.has(entry)) continue;
      const real = realpathSync(full);
      if (real !== full) {
        // ⚠️ A SILENT `continue` HERE WOULD TRADE ONE FAIL-OPEN FOR ANOTHER, so discriminate.
        // Skipping is only safe when the target is INSIDE the scanned population, because then the
        // canonical route reaches those files — which is the entire point of the fix. A link
        // whose target falls OUTSIDE has no canonical route: those files were scanned before
        // (under the alias) and would be scanned by nothing after, i.e. a silently narrowed
        // population in a fail-closed gate. That is exactly what this function's own error text
        // refuses, so it gets the same treatment: throw.
        if (reachedByCanonicalWalk(real, population)) continue;
        throw outOfPopulation(full, real, population, 'directory');
      }
      if (visited.has(real)) continue;
      visited.add(real);
      out.push(...walkSourceFiles(full, visited, population));
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.(test|spec)\.(ts|tsx)$/.test(entry)) {
      // The SAME rule as the directory branch above — see the ⚠️ in this function's docblock. A
      // symlinked file emitted under its alias is classified by the alias's path prefix, which is
      // the fail-open the directory fix closes; and an out-of-root target has no canonical route.
      const real = realpathSync(full);
      if (real !== full) {
        if (reachedByCanonicalWalk(real, population)) continue;
        throw outOfPopulation(full, real, population, 'file');
      }
      out.push(full);
    }
  }
  return out;
}

/**
 * Strip block + line comments so commented-out imports aren't scanned (false positives).
 * The layer rules (1-5) deliberately use THIS, not blankCommentsAndStrings: extractImports must
 * read the literal module specifier (`from '@/features/x'`), and blankCommentsAndStrings blanks
 * string CONTENTS (keeping the quotes) → the specifier becomes spaces → resolveTarget returns null
 * → the scan catches zero imports (a silent false-NEGATIVE). The tradeoff is a rare false-POSITIVE
 * if a string literal itself contains `from "@/..."`-shaped text; that's the lesser evil for an
 * import-graph scan and has never fired on this tree. (blankCommentsAndStrings is for the call-
 * pattern scans — gating / raw-db — which match tokens, not specifiers, so blanking strings is safe.)
 */
export function stripComments(content) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, '') // /* ... */ block comments
    .replace(/(?<!:)\/\/.*$/gm, ''); // // line comments — keep protocol-relative `://`
}

/**
 * True if `code` has a namespace (`import * as X`) / default (`import X`) / call-form
 * (`require('react-native')` / `import('react-native')`) react-native import. All pull in the
 * ENTIRE react-native surface (incl. View/Text/...), so a named-primitive scan alone would let
 * `import * as RN from 'react-native'; RN.View` OR `const RN = require('react-native')` evade
 * rule-2. A named runtime-util import (`import { Platform } from 'react-native'`) starts with `{`
 * and a type-only import (`import type { View }`) has `{` after `type` — neither matches.
 */
export function hasBroadRnImport(code) {
  return (
    /\bimport\s+(?:\*\s+as\s+\w+|\w+)\s*(?:,\s*\{[^}]*\})?\s+from\s+['"]react-native['"]/.test(
      code
    ) || /\b(?:require|import)\s*\(\s*['"]react-native['"]\s*\)/.test(code)
  );
}

/**
 * Extract every import/require/dynamic-import spec from a source file. `named` contains only
 * RUNTIME named imports — whole `import type {…}` statements yield [], and inline `type X`
 * specifiers are dropped (both are runtime-erased, so they create no layer coupling and must
 * not trip the rule-2 RN-primitive check).
 */
export function extractImports(content) {
  const imports = [];
  // import ... from 'x'  /  export ... from 'x'
  const fromRe = /(?:import|export)\b([^;]*?)\bfrom\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = fromRe.exec(content)) !== null) {
    const clause = m[1];
    const typeOnly = /^\s*type\b/.test(clause); // `import type {…}` / `export type {…}`
    const named = typeOnly
      ? []
      : [...clause.matchAll(/[{,]\s*(type\s+)?([A-Za-z0-9_$]+)/g)]
          .filter((x) => !x[1]) // drop inline `type X` specifiers (runtime-erased)
          .map((x) => x[2]);
    imports.push({ source: m[2], named });
  }
  // require('x')  /  import('x')
  const callRe = /(?:require|import)\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = callRe.exec(content)) !== null) {
    imports.push({ source: m[1], named: [] });
  }
  return imports;
}

/** Resolve an import spec to a repo-root-relative target path, or null if external/unknown. */
export function resolveTarget(spec, fileDir) {
  if (spec.startsWith('@/')) {
    return relative(repoRoot, join(EXPO_SRC, spec.slice(2)));
  }
  if (spec.startsWith('.')) {
    return relative(repoRoot, resolve(fileDir, spec));
  }
  return null; // bare package (react, react-native, @cloudquran/shared, etc.)
}

/**
 * A HOOK file (rule-1 subject): the SHARED hooks/ layer OR a feature's own features/{x}/hooks/.
 * Both obey "a hook never imports a route" (Story 21.3 generalized this beyond the shared layer).
 */
export function isHookFile(relFile) {
  return (
    relFile.startsWith('apps/expo/src/hooks/') ||
    /^apps\/expo\/src\/features\/[^/]+\/hooks\//.test(relFile)
  );
}

/**
 * A LIB file (rule-2 subject): the SHARED lib/ layer OR a feature's own features/{x}/lib/.
 * Both obey "a lib is pure logic — no UI components / RN UI primitives".
 */
export function isLibFile(relFile) {
  return (
    relFile.startsWith('apps/expo/src/lib/') ||
    /^apps\/expo\/src\/features\/[^/]+\/lib\//.test(relFile)
  );
}

/** Feature name for a SOURCE file under apps/expo/src/features/{x}/, or null if shared/route/top-level. */
export function fileFeature(relFile) {
  if (!relFile.startsWith(FEATURES_BASE)) return null;
  const rest = relFile.slice(FEATURES_BASE.length).split('/');
  return rest.length >= 2 ? rest[0] : null; // features/{x}/... — the {x} segment; a stray file in features/ root is not a feature
}

/**
 * A SHARED-LAYER file (rule-5 subject): under apps/expo/src/ but NEITHER a feature (features/**)
 * NOR a route (app/**). I.e. lib/, the top-level hooks/ (incl. hooks/auth), components/ui|layout,
 * stores/, contexts/, constants/, types/ — and any FUTURE shared dir (config/, services/, …).
 * Defined as the COMPLEMENT of (features ∪ routes), NOT an enumerated whitelist: a whitelist would
 * silently miss a new shared dir and re-open the rule-5 hole; the complement is closure-complete.
 * Routes are excluded because a route mounting a feature screen is the point of the app layer.
 */
export function isSharedLayerFile(relFile) {
  return (
    relFile.startsWith('apps/expo/src/') &&
    !relFile.startsWith(FEATURES_BASE) &&
    !relFile.startsWith('apps/expo/src/app/')
  );
}

/**
 * Classify a resolved TARGET into the feature it lands in. A feature spans all of its
 * sub-kinds (components/hooks/lib/stores), so any deep path INTO features/{B}/... is a deep
 * import of feature B unless it resolves to B's PUBLIC BARREL (`features/{B}` or `features/{B}/index`).
 * Returns { feature, deep } or null (target not under features/ → shared/route → always allowed).
 */
export function classifyTarget(target) {
  if (!target || !target.startsWith(FEATURES_BASE)) return null;
  const rest = target.slice(FEATURES_BASE.length).split('/');
  const seg = rest[0];
  // The public barrel resolves to the feature folder itself (`.../{B}`) or its `.../{B}/index`.
  const deep = rest.length > 1 && rest[1] !== 'index';
  return { feature: seg, deep };
}

/**
 * rule-5 decision (Story 21.4): does a SHARED-layer file importing `target` (a resolved
 * repo-relative path) violate "shared never imports a feature"? True when the importing file is
 * shared (isSharedLayerFile) AND `target` lands in a feature by ANY path — barrel OR deep
 * (classifyTarget non-null). Contrast rule-4, which ALLOWS the feature→feature barrel edge: a
 * SHARED file must not depend on a feature at all. Pure (no fs) so the test companion asserts it
 * directly, like findGatingAntiPattern.
 */
export function isSharedFeatureViolation(relFile, target) {
  return isSharedLayerFile(relFile) && classifyTarget(target) !== null;
}

/**
 * The own-barrel a file must NOT import (would create a require cycle), or null:
 *   - a FEATURE file (features/{x}/...) → its public barrel `features/{x}`
 *   - a shared hooks file (hooks/{sub}/... e.g. hooks/auth) → `hooks/{sub}`; a top-level hook → `hooks`
 *   - a shared ui/layout file (components/{sub}/...) → `components/{sub}`
 * Barrels (index.ts) are exempt by the caller (re-exporting members is their job).
 */
export function ownBarrel(relFile) {
  if (relFile.startsWith(FEATURES_BASE)) {
    const seg = relFile.slice(FEATURES_BASE.length).split('/')[0];
    return seg ? `${FEATURES_BASE}${seg}` : null;
  }
  let base = 'apps/expo/src/hooks/';
  if (relFile.startsWith(base)) {
    const rest = relFile.slice(base.length).split('/');
    return rest.length >= 2 ? `apps/expo/src/hooks/${rest[0]}` : 'apps/expo/src/hooks';
  }
  base = 'apps/expo/src/components/';
  if (relFile.startsWith(base)) {
    const rest = relFile.slice(base.length).split('/');
    return rest.length >= 2 ? `apps/expo/src/components/${rest[0]}` : null;
  }
  return null;
}

/** Return a cycle path [a, …, a] in a directed graph, or null. */
export function findCycle(edges) {
  const WHITE = 0,
    GRAY = 1,
    BLACK = 2;
  const color = new Map();
  const stack = [];
  let found = null;
  function dfs(u) {
    color.set(u, GRAY);
    stack.push(u);
    for (const v of edges.get(u) || []) {
      if (found) return;
      const c = color.get(v) || WHITE;
      if (c === GRAY) {
        found = stack.slice(stack.indexOf(v)).concat(v);
        return;
      }
      if (c === WHITE) dfs(v);
    }
    color.set(u, BLACK);
    stack.pop();
  }
  for (const u of edges.keys()) {
    if (!found && (color.get(u) || WHITE) === WHITE) dfs(u);
  }
  return found;
}

/** Run all layer rules and return the list of violation strings. */
export function runLayerScan() {
  const violations = [];

  // ── apps/expo/src — rules 1 & 2 (hooks→app, lib→UI) ───────────────────────
  // A "hook" / "lib" is identified by location: the SHARED hooks//lib/ layers OR a feature's
  // own features/{x}/hooks/ // features/{x}/lib/ (Story 21.3 — a feature's hooks/lib obey the
  // same layer rules as the shared ones: a hook never imports a route, a lib never imports UI).
  for (const file of collectSourceFiles(EXPO_SRC)) {
    const relFile = relative(repoRoot, file);
    const fileDir = dirname(file);
    const inHooks = isHookFile(relFile);
    const inLib = isLibFile(relFile);
    if (!inHooks && !inLib) continue;

    const content = stripComments(readFileSync(file, 'utf8'));
    const libExempt = SANCTIONED_LIB_FILES.has(relFile);

    // Rule 2 (broad import) — a namespace/default/call react-native import in lib/ exposes the
    // whole UI surface, evading the per-name primitive check below. Checked once per file.
    if (inLib && !libExempt && hasBroadRnImport(content)) {
      violations.push(
        `[rule-2 lib→RN-UI] ${relFile} uses a namespace/default/require 'react-native' import (exposes UI primitives)`
      );
    }

    for (const { source, named } of extractImports(content)) {
      const target = resolveTarget(source, fileDir);

      // Rule 1 — hooks/ must not import from app/
      if (inHooks && target && target.startsWith('apps/expo/src/app/')) {
        violations.push(`[rule-1 hooks→app] ${relFile} imports "${source}"`);
      }

      // Rule 2 — lib/ must not import UI components / higher UI layers or RN UI primitives
      if (inLib && !libExempt) {
        if (
          target &&
          (target.startsWith('apps/expo/src/components/') ||
            target.startsWith('apps/expo/src/contexts/') ||
            target.startsWith('apps/expo/src/app/'))
        ) {
          violations.push(`[rule-2 lib→UI] ${relFile} imports "${source}"`);
        }
        if (source === 'react-native') {
          const ui = named.filter((n) => RN_UI_PRIMITIVES.has(n));
          if (ui.length > 0) {
            violations.push(
              `[rule-2 lib→RN-UI] ${relFile} imports { ${ui.join(', ')} } from 'react-native'`
            );
          }
        }
      }
    }
  }

  // ── apps/worker/src — rule 3 (worker → apps/expo) ─────────────────────────
  for (const file of collectSourceFiles(WORKER_SRC)) {
    const relFile = relative(repoRoot, file);
    const fileDir = dirname(file);
    const content = stripComments(readFileSync(file, 'utf8'));
    for (const { source } of extractImports(content)) {
      const target = resolveTarget(source, fileDir);
      const targetsExpo =
        (target && target.startsWith('apps/expo/')) || source.includes('apps/expo/');
      if (!targetsExpo) continue;
      // Story 17.8: no exceptions — the worker imports the shared contract, never apps/expo.
      violations.push(`[rule-3 worker→expo] ${relFile} imports "${source}"`);
    }
  }

  // ── rule-4: feature-folder isolation (Story 21.3, feature-first) ────────────────────────────
  // A file in feature {A} (anything under features/{A}/{components,hooks,lib,stores}/) may import
  // another feature {B} ONLY through B's PUBLIC BARREL (`@/features/{B}`), never a deep path INSIDE
  // B. The feature graph (unified across a feature's sub-kinds) must be ACYCLIC. Barrels participate
  // in edge/cycle detection (a barrel re-exporting another feature forms an edge) but are exempt
  // from the self-barrel check. The shared layers — components/ui|layout, the shared hooks/ (top-
  // level + hooks/auth) — are not features; they only get the self-barrel guard. Routes (app/) and
  // the rest of the shared layer (lib/stores/contexts/...) have no own-barrel and import features
  // freely (a route mounting a feature screen is the point). Tests are out of scope (skipped).
  const featureEdges = new Map();

  // Scan the three roots that carry feature OR own-barrel semantics: features/ (cross-feature +
  // self-barrel), hooks/ (shared top-level + auth self-barrel), components/ (ui/layout self-barrel).
  for (const root of ['features', 'hooks', 'components']) {
    // ⚠️ `populationRoot` — this loop walks ONE root at a time but the population it is responsible
    // for is all of `EXPO_SRC`. Without it, a link from `features/a` into `lib/` throws here while
    // the whole-tree walks above correctly skip it: the gate would red a tree it can fully scan.
    for (const file of collectSourceFiles(join(EXPO_SRC, root), { populationRoot: EXPO_SRC })) {
      const relFile = relative(repoRoot, file);
      const isBarrel = /(^|\/)index\.ts$/.test(relFile);
      const fileDir = dirname(file);
      const content = stripComments(readFileSync(file, 'utf8'));
      const ownB = isBarrel ? null : ownBarrel(relFile); // a barrel re-exporting members is its job
      const fromFeature = fileFeature(relFile);

      for (const { source } of extractImports(content)) {
        const target = resolveTarget(source, fileDir);

        // Self-barrel — a NON-barrel file importing its OWN barrel makes a require cycle
        // (barrel → file → barrel). Applies to a feature's public barrel, the shared ui/layout
        // layers, and a top-level/auth hook vs its hooks barrel. Fix: import the sibling directly
        // (`./Name`) or the OTHER kind's per-kind path (`@/features/{A}/hooks`).
        if (ownB && target && (target === ownB || target === `${ownB}/index`)) {
          violations.push(
            `[rule-4 self-barrel] ${relFile} imports "${source}" (do not import your own folder's barrel — import the sibling directly, e.g. './Name'; this causes a require cycle)`
          );
          continue;
        }

        if (!fromFeature) continue; // shared layer / route — not subject to the cross-feature rule
        const tf = classifyTarget(target);
        if (!tf) continue; // not into a feature → allowed
        if (tf.feature === fromFeature) continue; // same feature (any sub-kind) → allowed
        if (tf.deep) {
          violations.push(
            `[rule-4 cross-feature-bypass] ${relFile} imports "${source}" (deep into feature "${tf.feature}" — use its public barrel @/features/${tf.feature})`
          );
        } else {
          // barrel import into a sibling feature — allowed, but record the edge for cycle detection
          if (!featureEdges.has(fromFeature)) featureEdges.set(fromFeature, new Set());
          featureEdges.get(fromFeature).add(tf.feature);
        }
      }
    }
  }

  const cycle = findCycle(featureEdges);
  if (cycle) {
    violations.push(
      `[rule-4 cycle] features: ${cycle.join(' → ')} (feature dependencies must be acyclic — unified across components, hooks, lib, stores)`
    );
  }

  // ── rule-5: the SHARED layer must not import a FEATURE (Story 21.4) ──────────────────────────
  // Closes the rule-4 gap (above): rule-4 does `if (!fromFeature) continue`, so it only flags a
  // FEATURE importing another feature — a SHARED file (lib/, the top-level hooks/ incl. hooks/auth,
  // components/ui|layout, stores/, contexts/, constants/, types/, …) reaching into `@/features/{x}`
  // slipped through. "Shared never imports a feature" is what keeps `rm -rf features/{x}` from
  // breaking shared infra. A shared file must not depend on a feature by ANY path (barrel OR deep) —
  // contrast rule-4, which ALLOWS the feature→feature barrel edge. The subject set is the COMPLEMENT
  // of (features ∪ routes), so a future shared dir is covered without re-opening the hole.
  for (const file of collectSourceFiles(EXPO_SRC)) {
    const relFile = relative(repoRoot, file);
    if (!isSharedLayerFile(relFile)) continue;
    const fileDir = dirname(file);
    const content = stripComments(readFileSync(file, 'utf8'));
    for (const { source } of extractImports(content)) {
      const target = resolveTarget(source, fileDir);
      if (isSharedFeatureViolation(relFile, target)) {
        violations.push(
          `[rule-5 shared→feature] ${relFile} imports "${source}" (a shared-layer file must not ` +
            `depend on feature "${classifyTarget(target).feature}" — relocate the code into its ` +
            'owning feature; see STACK-CHEAT-SHEET § "Layer separation")'
        );
      }
    }
  }

  return violations;
}

// ── First-frame gating anti-pattern scan (Story 18.6) ──────────────────────────────────────
// Regression tripwire for the cheat-sheet § State boundary race: a boolean `useState(false|true)`
// gating var whose setter is later called with a value DERIVED from a reactive remote/SDK source
// (`useQuery`/`db.useQuery`, `useAuth`/`db.useAuth`, or a RevenueCat `addCustomerInfoUpdateListener`
// callback) — i.e. "default to false/unlocked → wait for the remote result → paint the wrong state
// for the resolution window." The compliant shapes do NOT match: theme/onboarding read MMKV
// SYNCHRONOUSLY (no boolean-from-remote setter), and the auth/entitlement Context wrappers DERIVE
// the gate directly from the SDK value (no boolean `useState` seeded false-then-reconciled). The
// sanctioned exception (a thin Context/hook wrapper over external reactive SDK state) is allow-
// listed inline with `// lint-gating-ok: <reason>` on the useState line, the setter-call line, or
// the line directly above either.
//
// LEXICAL by design — the spec drops this rather than ship an AST monster. Its discriminator (the
// setter argument must REFERENCE a reactive-source binding, not just be a literal `true`/`false`)
// is what keeps the tree's dozens of imperative operation flags (`setIsLoading(true)` around an
// `await`) from matching. Verified to report ZERO on the live tree (Story 18.6 Step E); its only
// value is catching a future clone/component that reintroduces the race.
//
// KNOWN LIMITATION (accepted — closing it needs the AST the spec forbids): scope is the whole FILE,
// not the component. A reactive binding name (`data`, `user`, `info`) destructured in one component
// can collide with an unrelated same-named local in a *different* component in the same file, so a
// future clone could see a false positive — silence it with the `// lint-gating-ok` allow-list.

// The blanker family lives in `./gate-lib.mjs` — one terminator definition shared with the line
// index below, so `lineOf` and the raw-line array cannot disagree about where a line ends.

// Reactive remote/SDK bindings: `const {…}|x = [db.]useQuery(` / `[db.]useAuth(`.
const REACTIVE_HOOK_RE =
  /\b(?:const|let|var)\s+(\{[^}]*\}|[A-Za-z0-9_$]+)\s*=\s*(?:[A-Za-z0-9_$]+\.)?(?:useQuery|useAuth)\s*\(/g;
// RevenueCat customer-info listener callback param — its `info` is a reactive SDK result.
const CUSTOMER_LISTENER_RE =
  /addCustomerInfoUpdateListener\s*\(\s*(?:async\s*)?\(?\s*([A-Za-z0-9_$]+)/g;
// Boolean gating state: `const [x, setX] = useState(false|true)` (optionally `useState<boolean>`),
// including the lazy-literal form `useState(() => false)`. The optional `() =>` matches ONLY when a
// bare literal follows — a cache seed (`useState(() => cache.getBoolean(K) ?? false)`) returns a
// non-literal expression, so it never matches and stays correctly unflagged.
const BOOL_STATE_RE =
  /\b(?:const|let)\s*\[\s*([A-Za-z0-9_$]+)\s*,\s*([A-Za-z0-9_$]+)\s*\]\s*=\s*useState\s*(?:<[^>]*>)?\s*\(\s*(?:\(\s*\)\s*=>\s*)?(true|false)\s*\)/g;

/** Names bound from a reactive remote/SDK source in `blanked` code (for the gating scan). */
function reactiveBindings(blanked) {
  const names = new Set();
  let m;
  REACTIVE_HOOK_RE.lastIndex = 0;
  while ((m = REACTIVE_HOOK_RE.exec(blanked)) !== null) {
    const lhs = m[1];
    if (lhs.startsWith('{')) {
      // destructure: take the BOUND name (after `:` if renamed, else the key); skip rest/defaults.
      for (const part of lhs.slice(1, -1).split(',')) {
        const seg = part.split('=')[0].trim();
        if (!seg || seg.startsWith('...')) continue;
        const bound = (seg.includes(':') ? seg.split(':')[1] : seg).trim();
        const idMatch = bound.match(/^[A-Za-z0-9_$]+/);
        if (idMatch) names.add(idMatch[0]);
      }
    } else {
      names.add(lhs);
    }
  }
  CUSTOMER_LISTENER_RE.lastIndex = 0;
  while ((m = CUSTOMER_LISTENER_RE.exec(blanked)) !== null) names.add(m[1]);
  return names;
}

/** Extract the balanced argument string of the call starting at `openParenIdx` (the `(`). */
function balancedArg(code, openParenIdx) {
  let depth = 1;
  let i = openParenIdx + 1;
  for (; i < code.length && depth > 0; i++) {
    const ch = code[i];
    if (ch === '(' || ch === '{' || ch === '[') depth++;
    else if (ch === ')' || ch === '}' || ch === ']') depth--;
  }
  return code.slice(openParenIdx + 1, i - 1);
}

/**
 * Find the first-frame gating anti-pattern in one module's source. Returns
 * `[{ state, setter, line }]` (line = 1-based line of the offending setter call), already with
 * `// lint-gating-ok` allow-listed entries removed. Pure (no fs) so the test companion can assert
 * the positive, negative, and allow-list cases directly.
 */
export function findGatingAntiPattern(code) {
  const blanked = blankCommentsAndStrings(code);
  const reactive = reactiveBindings(blanked);
  if (reactive.size === 0) return []; // no reactive source → no race possible

  // 1-based, counting the FULL JS terminator set. `blanked` is length- and terminator-preserving,
  // so an offset into it is an offset into `code` and both agree with `markerLines` below.
  const lineOf = (idx) => lineOfIndex(blanked, idx);

  // Boolean gating states keyed by setter name → { state, declLine (of the useState site) }.
  const setters = new Map();
  let m;
  BOOL_STATE_RE.lastIndex = 0;
  while ((m = BOOL_STATE_RE.exec(blanked)) !== null)
    setters.set(m[2], { state: m[1], declLine: lineOf(m.index) });
  if (setters.size === 0) return [];

  // ⚠️ THE MARKER MUST BE CARRIED, NOT MENTIONED, AND THE LINE IT IS READ FROM IS STRINGS-BLANKED.
  //
  // Two opposite failures met here, and one blanker closes both:
  //   - A bare `/lint-gating-ok/` over the RAW line made the off switch typable in prose — and the
  //     blast radius is worse than the i18n twin's, because the allow-list is consulted at FOUR
  //     lines (the setter call, the `useState` decl, and the line above each), so one sentence
  //     above a `useState` disabled the rule for every setter call on that state, file-wide.
  //     Measured: a component with two genuine violations reported both; adding `// NOTE:
  //     sanctioned wrappers use lint-gating-ok, see the layers gate` above the `useState` reported
  //     zero. The head anchor plus the mandatory `:` reason in `isMarkerLine` closes that.
  //   - Taking the line's first `//` from the RAW text finds one inside a STRING, so a legitimate
  //     carve-out beside a URL (`const D = 'https://x'; // lint-gating-ok: r`) was not recognised
  //     and the gate reddened a correct tree — while the mirror, a string whose CONTENT spells the
  //     marker (`const D = '// lint-gating-ok: x';`), DID suppress. Both are gone once the
  //     question is asked of a strings-blanked VALUE instead of raw source text.
  //
  // `blankCommentsAndStrings` is unusable here — it blanks comments too, so the marker would never
  // match at all. That is precisely why the strings-only sibling exists.
  //
  // The blanker is length- AND terminator-preserving, so this array's indices line up with
  // `lineOf` by construction rather than by two regexes that happen to agree today. That is what
  // fixes the desync: one lone `\r`, U+2028 or U+2029 anywhere above a violation used to shift
  // every later line number off this array, and an UNRELATED carve-out then suppressed the
  // violation — fail-open, in the gate whose whole contract is failing closed.
  const markerLines = splitLines(blankStrings(code));
  const hasAllowAt = (line) =>
    line >= 1 &&
    line <= markerLines.length &&
    isMarkerLine(markerLines[line - 1], 'lint-gating-ok');
  // Honored on the useState line, the setter-call line, or the line directly above either.
  const allowedAt = (callLine, declLine) =>
    hasAllowAt(callLine) ||
    hasAllowAt(callLine - 1) ||
    hasAllowAt(declLine) ||
    hasAllowAt(declLine - 1);
  // Identifier-boundary alternation: `\b` mishandles `$`/`_`-prefixed names, so bound with
  // explicit non-identifier-char lookarounds (identifier chars are `[A-Za-z0-9_$]`). Escape each
  // name — `$` is a regex metacharacter, so an unescaped `$d` would corrupt the alternation.
  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const reactiveRe = new RegExp(
    `(?<![A-Za-z0-9_$])(?:${[...reactive].map(escapeRe).join('|')})(?![A-Za-z0-9_$])`
  );

  const violations = [];
  for (const [setter, { state, declLine }] of setters) {
    const callRe = new RegExp(`\\b${setter}\\s*\\(`, 'g');
    while ((m = callRe.exec(blanked)) !== null) {
      const arg = balancedArg(blanked, m.index + m[0].length - 1).trim();
      if (!arg) continue;
      if (/^!?\s*(true|false)$/.test(arg)) continue; // pure literal — an imperative operation flag
      if (!reactiveRe.test(arg)) continue; // arg not derived from a reactive source — not the race
      const line = lineOf(m.index);
      if (allowedAt(line, declLine)) continue; // sanctioned wrapper, inline-allowlisted
      violations.push({ state, setter, line });
    }
  }
  return violations;
}

/** Run the gating scan over apps/expo/src and return violation strings. */
export function runGatingScan() {
  const violations = [];
  for (const file of collectSourceFiles(EXPO_SRC)) {
    const relFile = relative(repoRoot, file).split('\\').join('/');
    for (const { state, setter, line } of findGatingAntiPattern(readFileSync(file, 'utf8'))) {
      violations.push(
        `[gating-first-frame] ${relFile}:${line} — \`${setter}\` sets the boolean gating state ` +
          `\`${state}\` from a reactive remote/SDK result. Seed it from the synchronous MMKV cache ` +
          `and reconcile after first paint (STACK-CHEAT-SHEET § State boundary), or allow-list a ` +
          `sanctioned SDK-wrapper with \`// lint-gating-ok: <reason>\`.`
      );
    }
  }
  return violations;
}

// ── The API CHOKEPOINT scan (Story 5-4) ───────────────────────────────────────────────────────
//
// story 5-2: the RAW-DB-QUERY TRIPWIRE lived here (Story 18.9) — `DB_HOOKS_MODULE`,
// `RAW_DB_QUERY_RE`, `findRawDbQueryCalls` and `runRawDbQueryScan`. It forbade raw
// `db.useQuery` / `db.useInfiniteQuery` / `db.queryOnce` anywhere except the one wrapper module,
// so the vendor SDK's non-configurable ~5s receive timeout could not be sidestepped. The SDK and
// its wrapper are both deleted, so the rule had no subject: a tripwire whose primitive does not
// exist can only ever report clean. It left the question of a replacement to story 5-4.
//
// STORY 5-4 ANSWERS IT: YES — written against the NEW primitive, not a resurrection of the old.
// The worker is now the data layer (D1 + Drizzle behind Hono), so `hc()` from `hono/client` — the
// constructor for the typed RPC client that reaches it — is what "the data layer" means on the app
// side. Until 5-4 there was nothing to guard: CLAUDE.md's "features never reach the data layer
// directly" survived in PROSE ONLY, because `apps/expo/src/lib/api.ts` had zero runtime callers
// and a rule with no subject cannot fire.
//
// THE RULE: `hono/client` may be imported, and `hc(` may be called, in EXACTLY ONE module —
// `apps/expo/src/lib/api.ts`. Everything else reaches the worker through that client. Nobody mints
// a second one against a different base URL or different headers, bypassing the per-request auth
// header that client carries — a second client would silently opt out of it and typecheck fine.
//
// ⚠️ WHAT THIS RULE DOES NOT DO, CORRECTED BY story 5-6. The paragraph here used to say story 5-6
// would put "the query cache and the write outbox" in the chokepoint too, so that a second client
// opted out of all three. It did not, and could not: the cache and the outbox live in
// `lib/sync.ts`, one layer ABOVE this module, precisely so that `api.ts` stays a dumb transport.
// This rule therefore stops a second CLIENT and nothing else — its own self-test blesses a feature
// calling `api.health.$get()` directly. RULE 7 below is what closes that door, and the two are
// separate because they guard different primitives.
//
// ⚠️ FAIL-CLOSED, AND THIS HALF IS THE IMPORTANT HALF. If the chokepoint module disappears or
// stops constructing a client — renamed, deleted, refactored into something else — then "nobody
// else imports hono/client" becomes trivially true and the scan reports OK having checked nothing.
// That is precisely how the tripwire above ended its life, reporting clean over a deleted SDK. So
// the scan asserts the chokepoint EXISTS and still HOLDS the primitive, and fails if it does not.
// Per the fail-closed convention at the top of this file, the pure helpers are exported so the
// self-test can assert the positive, the negative and the evasions without spawning.

/** The one module allowed to construct the worker RPC client. */
export const API_CHOKEPOINT = 'apps/expo/src/lib/api.ts';

/** The primitive. Importing it anywhere else is minting a second data-layer entrypoint. */
export const RPC_CLIENT_MODULE = 'hono/client';

// `hc(` or `hc<AppType>(`. The lookbehind excludes an identifier char AND a dot, so `x.hc(` (a
// method named hc on something else) and `myhc(` do not match — the subject is the BARE binding.
const HC_CALL_RE = /(?<![A-Za-z0-9_$.])hc\s*[(<]/;

/**
 * Pure: the ways `code` (a NON-chokepoint module) reaches the worker RPC client directly.
 * Returns a list of reason fragments; empty means compliant.
 *
 * Two detectors, because either alone is evadable: the IMPORT catches the normal case in all its
 * forms (`import`, `require`, dynamic `import()` — `extractImports` handles them), and the CALL
 * catches a client minted from a binding that arrived some other way (a re-export, a barrel, a
 * helper that hands `hc` back). The call test runs over comment- AND string-blanked source, so
 * `hc(` written in prose or inside a string literal is not a hit.
 */
export function findApiClientUses(relFile, code) {
  const rel = relFile.split('\\').join('/');
  if (rel === API_CHOKEPOINT) return []; // the chokepoint is where this is supposed to happen
  const uses = [];
  for (const { source } of extractImports(stripComments(code))) {
    if (source === RPC_CLIENT_MODULE || source.startsWith(`${RPC_CLIENT_MODULE}/`)) {
      uses.push(`imports "${source}"`);
    }
  }
  if (HC_CALL_RE.test(blankCommentsAndStrings(code))) {
    uses.push('calls `hc(` — it mints its own worker RPC client');
  }
  return uses;
}

/**
 * Pure: is `code` still a real chokepoint? It must both IMPORT the primitive and CONSTRUCT with
 * it. `null`/absent source answers false — that is the missing-file case, and it must not pass.
 */
export function chokepointHolds(code) {
  if (typeof code !== 'string' || code.length === 0) return false;
  const importsClient = extractImports(stripComments(code)).some(
    ({ source }) => source === RPC_CLIENT_MODULE
  );
  return importsClient && HC_CALL_RE.test(blankCommentsAndStrings(code));
}

/** Run the API-chokepoint scan over apps/expo/src and return violation strings. */
export function runApiChokepointScan() {
  const violations = [];

  // Fail-closed floor FIRST: without a live chokepoint the rest of this scan is vacuous.
  const chokepointPath = join(repoRoot, API_CHOKEPOINT);
  const chokepointSource = existsSync(chokepointPath) ? readFileSync(chokepointPath, 'utf8') : null;
  if (!chokepointHolds(chokepointSource)) {
    violations.push(
      `[api-chokepoint VACUOUS] ${API_CHOKEPOINT} does not exist, or no longer imports ` +
        `'${RPC_CLIENT_MODULE}' and constructs with \`hc(\`. With no chokepoint the rule below ` +
        'is trivially satisfied and this gate would pass having checked nothing — which is exactly ' +
        'how the raw-db tripwire it replaces ended its life. Restore the module, or move this scan ' +
        'to whatever module now owns the worker RPC client.'
    );
  }

  for (const file of collectSourceFiles(EXPO_SRC)) {
    const relFile = relative(repoRoot, file).split('\\').join('/');
    for (const use of findApiClientUses(relFile, readFileSync(file, 'utf8'))) {
      violations.push(
        `[api-chokepoint] ${relFile} ${use}. The worker RPC client is constructed in exactly one ` +
          `module (${API_CHOKEPOINT}) — import \`api\` from there instead. See CLAUDE.md ` +
          '§ "Features never reach the data layer directly".'
      );
    }
  }

  return violations;
}

// ── The QUERY MODULE CHOKEPOINT scan (story 5-6) ──────────────────────────────────────────────
//
// Rule 6 guards the CONSTRUCTOR. This guards the CLIENT.
//
// The gap it closes was recorded in `deferred-work.md` at the 5-4 review and left open on purpose:
// "[the chokepoint scan] enforces that `hc()` is CONSTRUCTED in one module — not that features go
// through one query module. Its own self-test blesses a feature calling `api.health.$get()`
// directly. CLAUDE.md and architecture.md both say `lint:layers` enforces 'features never reach
// the data layer directly', which overstates it." Story 5-6 builds the thing that claim was always
// about — `lib/sync.ts`, which owns the query cache, the explicit invalidation and the durable
// write outbox — so the claim can finally be made true rather than narrowed.
//
// THE RULE: `apps/expo/src/lib/api.ts` may be imported by EXACTLY ONE module,
// `apps/expo/src/lib/sync.ts`. Any spelling counts: `@/lib/api`, a relative `./api` or
// `../../lib/api`, an `export … from`, a `require()`, a dynamic `import()`, and — unlike rule 6 —
// `import type`. Type-only is included deliberately: reaching for the client's TYPES outside the
// query module is how a caller starts shaping itself around raw responses, and the erasure that
// makes it harmless at runtime is exactly what makes it invisible in review.
//
// ⚠️ FAIL-CLOSED, VERBATIM FROM RULE 6, AND FOR THE SAME REASON. If `lib/sync.ts` disappears or
// stops using the client, "nobody else imports @/lib/api" becomes trivially true and this scan
// reports OK having checked nothing. So it asserts the query module EXISTS and still HOLDS the
// client (imports it AND references `api.`), and fails if it does not.

/** The one module allowed to import the worker RPC client, and the floor this scan stands on. */
export const QUERY_MODULE = 'apps/expo/src/lib/sync.ts';

/**
 * The query module's own network-free half. It holds the device cache, the query client and the
 * user-id mirror; `lib/accountTeardown.ts` imports it directly, because routing that through
 * `lib/sync.ts` would close the `auth → accountTeardown → sync → api → auth` require cycle that
 * split it out in the first place.
 *
 * ⚠️ IT IS A SECOND DOOR AND THIS RULE GUARDS IT TOO. `syncCache.ts` exports `queryClient`,
 * `readCache`, `writeCache` and `syncStore` — enough for a feature to read and write server state
 * without ever touching a hook, which is precisely what rule 7 exists to prevent. It is listed as
 * a SUBJECT of the rule (nobody but `sync.ts` and the teardown may import it), not as a hole.
 */
export const QUERY_CACHE_MODULE = 'apps/expo/src/lib/syncCache';

/** The modules allowed to import `QUERY_CACHE_MODULE`. Everything else goes through the hooks. */
export const QUERY_CACHE_IMPORTERS = new Set([
  QUERY_MODULE,
  'apps/expo/src/lib/accountTeardown.ts',
]);

/**
 * The durable write outbox — the third door onto the worker, and the last one this rule was
 * missing.
 *
 * ⚠️ IT EXPORTS A SINGLETON. `outbox.enqueue({ kind: 'bookmark-create', … })` from a feature
 * reaches the worker with no local cache update, no `INVALIDATED_BY` entry and no debounce — the
 * three things `lib/sync.ts`'s mutations exist to carry — and it typechecks, because the queue is
 * transport-agnostic by design. That is the same symmetry argument that made `syncCache` a
 * subject: a chokepoint with a second entrance is not a chokepoint.
 */
export const OUTBOX_MODULE = 'apps/expo/src/lib/outbox';

/** The modules allowed to import `OUTBOX_MODULE`. */
export const OUTBOX_IMPORTERS = new Set([QUERY_MODULE, `${QUERY_CACHE_MODULE}.ts`]);

/** The module every worker call must go through, extension-stripped for comparison. */
export const API_MODULE = 'apps/expo/src/lib/api';

/** A member access on the `api` binding — `api.sync…`. The lookbehind excludes `x.api.` etc. */
const API_USE_RE = /(?<![A-Za-z0-9_$.])api\s*\./;

/** Repo-relative, forward-slashed, extension- and `/index`-stripped. */
function normalizeModulePath(target) {
  return target
    .split('\\')
    .join('/')
    .replace(/\.(tsx?|jsx?|mjs|cjs)$/, '')
    .replace(/\/index$/, '');
}

/**
 * Pure: every spelling by which `code` (living at `relFile`) imports the RPC client module.
 * Returns the raw specifiers; empty means compliant.
 *
 * Resolution goes through `resolveTarget`, the same helper rules 1–5 use, so `@/lib/api`,
 * `./api` and `../../lib/api` are one comparison rather than three regexes that drift apart.
 */
export function findApiModuleImports(relFile, code) {
  const rel = relFile.split('\\').join('/');
  // A guarded module never flags its OWN specifier — it cannot import itself, and treating a
  // subject as a violator would make the rule unreadable.
  if (normalizeModulePath(rel) === API_MODULE) return [];
  const fileDir = join(repoRoot, dirname(rel));
  const hits = [];
  for (const { source } of extractImports(stripComments(code))) {
    const target = resolveTarget(source, fileDir);
    if (target === null) continue; // bare package — not this module
    const normalized = normalizeModulePath(target);
    // The RPC client: only the query module may reach it.
    if (normalized === API_MODULE && rel !== QUERY_MODULE) {
      hits.push(source);
      continue;
    }
    // The query module's cache half: the query module and the account teardown, nobody else.
    // Without this, `@/lib/syncCache` is a second door onto `queryClient` + `readCache` +
    // `writeCache` + `syncStore` that bypasses every hook rule 7 exists to funnel through.
    if (normalized === QUERY_CACHE_MODULE && !QUERY_CACHE_IMPORTERS.has(rel)) {
      hits.push(source);
      continue;
    }
    // The write outbox: the query module owns the mutations, and `syncCache` clears it on
    // sign-out. A feature enqueueing directly writes to the worker with no cache update, no
    // invalidation and no debounce.
    if (normalized === OUTBOX_MODULE && !OUTBOX_IMPORTERS.has(rel)) hits.push(source);
  }
  return hits;
}

/**
 * Pure: is `code` still a real query module? It must both IMPORT the client and USE it.
 * `null`/absent source answers false — that is the missing-file case, and it must not pass.
 */
export function queryModuleHolds(code) {
  if (typeof code !== 'string' || code.length === 0) return false;
  const fileDir = join(repoRoot, dirname(QUERY_MODULE));
  const importsClient = extractImports(stripComments(code)).some(({ source }) => {
    const target = resolveTarget(source, fileDir);
    return target !== null && normalizeModulePath(target) === API_MODULE;
  });
  return importsClient && API_USE_RE.test(blankCommentsAndStrings(code));
}

/** Run the query-module chokepoint scan over apps/expo/src and return violation strings. */
export function runQueryModuleChokepointScan() {
  const violations = [];

  // Fail-closed floor FIRST: without a live query module the rest of this scan is vacuous.
  const queryModulePath = join(repoRoot, QUERY_MODULE);
  const queryModuleSource = existsSync(queryModulePath)
    ? readFileSync(queryModulePath, 'utf8')
    : null;
  if (!queryModuleHolds(queryModuleSource)) {
    violations.push(
      `[query-chokepoint VACUOUS] ${QUERY_MODULE} does not exist, or no longer imports ` +
        `'${API_MODULE}' and calls through it. With no query module the rule below is trivially ` +
        'satisfied and this gate would pass having checked nothing — which is exactly how the ' +
        'raw-db tripwire rule 6 replaces ended its life. Restore the module, or move this scan ' +
        'to whatever module now owns the query cache and the write outbox.'
    );
  }

  for (const file of collectSourceFiles(EXPO_SRC)) {
    const relFile = relative(repoRoot, file).split('\\').join('/');
    for (const spec of findApiModuleImports(relFile, readFileSync(file, 'utf8'))) {
      violations.push(
        `[query-chokepoint] ${relFile} imports "${spec}". Every worker read and write goes ` +
          `through the query module (${QUERY_MODULE}), which owns the cache, the explicit ` +
          'invalidation and the durable write outbox — a raw call has none of the three, and ' +
          `reaching ${QUERY_CACHE_MODULE} or ${OUTBOX_MODULE} directly skips the hooks and the ` +
          'mutations that carry them. Import the hooks and the write functions from ' +
          '"@/lib/sync". See CLAUDE.md § "Features never reach the data layer directly".'
      );
    }
  }

  return violations;
}

function main() {
  // Fail-closed: a missing scan root means the scanner would find zero files and pass vacuously.
  const missing = missingRoots();
  if (missing.length > 0) {
    console.error(
      `lint:layers — FAIL: required scan root(s) missing: ${missing.join(', ')}.\n` +
        'The gate refuses to pass when a layer root cannot be scanned (fail-closed).'
    );
    // ⚠️ `process.exitCode` + `return`, NEVER `process.exit()` — Node's stderr is asynchronous
    // for a pipe on POSIX and `process.exit()` does not drain it, so under `turbo`/`| tee` the
    // violation list is truncated exactly on the run with the most output.
    process.exitCode = 1;
    return;
  }

  const violations = [
    ...runLayerScan(),
    ...runGatingScan(),
    ...runApiChokepointScan(),
    ...runQueryModuleChokepointScan(),
  ];
  if (violations.length > 0) {
    console.error(`lint:layers — ${violations.length} violation(s):\n`);
    for (const v of violations) console.error(`  ${v}`);
    console.error(
      '\nSee STACK-CHEAT-SHEET.md § "Layer separation" / § "State boundary". Fix the structure, not the import.'
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    'lint:layers — OK (no layer / first-frame-gating / api-chokepoint / query-chokepoint violations)'
  );
}

// Only run when invoked directly (`node scripts/lint-layers.mjs`), not when imported by tests.
// `onUnknown: 'run'` — this is an offline gate with no side effects, so the unsafe outcome is
// skipping SILENTLY (a fail-closed gate reporting success having checked nothing). Warn and run.
if (isMainModule({ url: import.meta.url, onUnknown: 'run', label: 'lint:layers' })) main();
