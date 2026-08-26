#!/usr/bin/env node
/**
 * lint:header-controls — nothing in this app installs a control into the NATIVE stack header.
 *
 * ⚠️ WHY THIS IS A GATE AND NOT A CONVENTION. On an Apple-silicon Mac running the iPhone build
 * ("Designed for iPad"), a control installed into the native stack header — `headerLeft` /
 * `headerRight` — is DRAWN CORRECTLY AND NEVER RECEIVES A MOUSE CLICK. The same control inside the
 * React Native view tree clicks fine. Nothing in `Platform` distinguishes that runtime from an iPad
 * (it reports `systemName: 'iPadOS'`, `interfaceIdiom: 'pad'`, `isMacCatalyst: false`), no test
 * environment reproduces it, and a screenshot looks perfect. tsc, jest, RNTL and Biome are all
 * blind to it. In the source app it shipped broken on SEVEN screens at once — including a paywall
 * whose close button was the only way out, and a note editor's Save and Cancel with text typed and
 * no way to leave. Each was written months apart by someone doing the obvious thing.
 *
 * The only runtime signal that sees it is `expo-device`'s `deviceType === DESKTOP` —
 * `apps/expo/src/lib/useIsIosAppOnDesktop.ts`, whose docblock carries the measurement.
 *
 * ## The rule is "never", not "route it"
 *
 * There is deliberately NO `useHeaderControlSlots` shim to port. A shim ROUTES a control out of the
 * native header; a prohibition means one is never written there at all. Adding one would
 * re-legitimise native header controls, which is the thing this gate exists to prevent.
 *
 * ⚠️ THE ARCHITECTURE UNDER THIS GATE WAS REVERSED ON 2026-08-26, AND THE REVERSAL MAKES THE GATE
 * MORE LOAD-BEARING, NOT LESS. §9 used to say Cloud Quran would draw its own header inside the RN
 * view tree, which would have deleted the defect class outright — this docblock called that "a
 * destination, not today's tree" and named Epic 6 as the owner of the `headerShown` flip. **That
 * flip is cancelled. No story owns one.** The app keeps `NativeTabs` and native stack headers,
 * because the claim the custom-chrome decision rested on — that web is the weakest native-chrome
 * rendering — was disproven against a running wisdom-fruits web build.
 *
 * So a native header now exists on every pushed screen, permanently, and the defect is LIVE rather
 * than hypothetical. This prohibition is the only thing standing between it and a shipped screen —
 * which is what makes keeping native chrome a safe trade rather than a re-run of the
 * seven-screens-at-once failure the source app managed.
 *
 * What the tree needs today: nothing. The profile stack's headers carry a title and the system back
 * button only, and there are zero `headerLeft` / `headerRight` / `setOptions` call sites anywhere in
 * `apps/expo/src`. The first screen that genuinely wants a header control is the trigger — put the
 * control in content, or bring the shim across as a documented one-time decision with an
 * `EXCEPTIONS` entry that argues it. ⚠️ The system back button's own behaviour on that Mac runtime
 * was never measured (see `deferred-work.md`), and it now sits on the live path.
 *
 * ## The slot has four names and one JSX component — and the rule is SHAPE, not a list
 *
 * ⚠️ **THREE ROUNDS OF REVIEW BROKE THIS GATE THE SAME WAY, AND THE ROOT CAUSE IS ONE HABIT.**
 * Round 1 matched `headerRight\s*:` only, and `setOptions({ headerRight })` — ES shorthand, THE
 * React Navigation idiom — walked through while the self-test asserted that shape as correct.
 * Round 2 matched the identifier and missed the SDK 56 idiom entirely. Round 3 missed a backtick
 * key, a spread, and any toolbar tag whose attributes contained a `>`. Every one was the same
 * mistake: **enumerating the spellings someone had thought of.**
 *
 * So where a spelling can be described by a SHAPE, it is:
 *   • the option name is `(?:unstable_)?header(?:Left|Right)(?:Items)?` — one pattern, not four
 *     literals;
 *   • a quoted key's delimiter class is ``['"`]``, which is the COMPLETE set of JavaScript string
 *     delimiters and therefore cannot acquire a fourth member;
 *   • the toolbar is judged by INVERSION — it fails unless the scan can positively read a shape
 *     proving it never reaches a header slot (see `findToolbarHeaderSlots`).
 *
 * Everything below reaches the same two native slots, verified in the INSTALLED expo-router 56:
 *   • `headerLeft` / `headerRight` — the navigation option, in every syntax:
 *       - `headerRight: () => <Save/>`           object property
 *       - `setOptions({ headerRight })`          ES shorthand (the React Navigation idiom)
 *       - `opts.headerRight = renderSave`        assignment, incl. `??=` / `||=`
 *       - `{ 'headerRight': fn }`, `o["headerRight"] = fn`, ``{ [`headerRight`]: fn }``  quoted key
 *   • `unstable_headerLeftItems` / `unstable_headerRightItems` — what `Stack.Toolbar` becomes on
 *     iOS (`expo-router/build/layouts/stack-utils/toolbar/processHeaderItemsForPlatform.ios.js:91`).
 *     ⚠️ `\b` does NOT catch these from a `headerRight` pattern: `_` and `I` are word characters,
 *     so `\bheaderRight\b` simply does not match inside `unstable_headerRightItems`.
 *   • `<Stack.Toolbar placement="left"|"right">` — a first-class typed export
 *     (`StackClient.d.ts:167`) that compiles to `headerShown: true` plus `headerLeft`/`headerRight`
 *     (`StackToolbarClient.js:131,138`). **This is the SDK 56 idiom for header buttons**, so from
 *     here on it is the likeliest spelling of the defect.
 *
 * `placement="bottom"` — the DEFAULT — is a bottom toolbar, a different native surface that the
 * 2026-08-20 measurement never covered, and it passes. So does a tag with no `placement` at all.
 * Nothing else does: a `{...spread}`, a `placement={p}`, and a tag whose attributes this scan
 * could not read to the end are all violations, because an unjudged placement is not a judged one
 * and the remedy is one keystroke (`placement="bottom"`).
 *
 * ⚠️ **ONE MISS IS INHERENT AND IS NOT CHASED.** `const K = 'headerRight'; opts[K] = fn` is
 * invisible to any lexical scan — resolving `K` needs a type checker, not a regex. It is excluded
 * DELIBERATELY rather than pursued with a longer pattern: chasing it is how the enumeration habit
 * above returns, and the shape is not one anyone writes by accident. If it ever appears, the answer
 * is an AST pass for the whole gate family, not another literal here.
 *
 * ## The names are RESERVED, and that is the deliberate answer to the false positive
 *
 * This is an identifier match, not a navigator-aware one, so it will also fire on a prop named
 * `headerLeft` / `headerRight` on the app's OWN in-tree header component — which Epic 6 builds.
 * **Do not answer that with a file exemption**: an exemption blinds the gate to the WHOLE file,
 * including a real native-slot assignment added to it later. The answer is that these names are
 * reserved words in this codebase. Name our own header props something else — `leading` /
 * `trailing`, `startAction` / `endAction` — which also stops a reader from mistaking an in-tree
 * header for the native one.
 *
 * ⚠️ **AND WHEN THE PROP IS SOMEBODY ELSE'S, "rename it" IS NOT AVAILABLE.**
 * `<Header headerLeft={…} />` from `@react-navigation/elements` fires here, and that component
 * draws a header INSIDE the RN view tree — architecture §9's destination, clickable on the Mac,
 * the opposite of the defect. Neither remedy above fits: the prop name is upstream's, and
 * exempting the screen is forbidden. So the rule has a third branch, and it is narrow on purpose:
 *
 *   Write ONE adapter module under `components/ui/` whose entire job is to translate our
 *   `leading` / `trailing` into upstream's prop names, and give THAT MODULE an `EXCEPTIONS` entry
 *   arguing the case — "this prop reaches an in-tree header, not the native navigator; it takes a
 *   mouse click". Every screen then imports the adapter and no screen names the reserved words.
 *
 * That is exactly what the exemption map was built for and why each entry must argue that the
 * control "is unreachable by mouse and still correct" — here the argument is that it IS reachable,
 * because the header is not the native one. The blast radius is a file that does nothing else, and
 * `exemptionProblems()` still requires it to exist, to be in the scan population, and to really
 * contain a slot. **Never exempt a screen; exempt an adapter, once, with the reason written down.**
 *
 * ## Scope, stated so it is not misread
 *
 * The two header slots and the two names they answer to. `headerTitle` and
 * `headerSearchBarOptions` are NOT scanned — they are DIFFERENT slots, neither has bitten here, and
 * a scan widened on speculation is a rule every later reader pays to understand for nothing.
 * (`unstable_header*Items` and `Stack.Toolbar` are not a widening by the same test: they ARE the
 * slot, under other names.) Widen it the first time one of the others costs something real.
 *
 * ## Fail-closed, in four directions
 *
 * A prohibition has no chokepoint to stand on the way `lint:layers` rules 6 and 7 do, so its only
 * vacuity is "scanned nothing":
 *   1. a missing / non-directory scan root;
 *   2. a ZERO-FILE population — the root exists and holds no source. Not theoretical: the retired
 *      `db.useQuery` scan reported clean forever once its primitive was deleted;
 *   3. an exemption whose reason is missing or blank — indistinguishable from the defect;
 *   4. an exemption that no longer suppresses anything — a path that does not exist, one that
 *      cannot be read, or a file that sets no slot. `lint-layers.mjs` states the family rule: "We
 *      do NOT pre-authorize nonexistent files: a dead exemption silently masks rule-2." A dead
 *      entry here is worse than useless — it is a standing blindfold over a whole file, waiting for
 *      the next control someone adds to it.
 *
 * ## The error goes BOTH ways, and the second direction is this gate's own
 *
 * ⚠️ `blankCommentsAndStrings` is a LEXICAL APPROXIMATION whose documented error is a silent
 * fail-OPEN (measured; see the category note in `gate-lib.mjs`). Inherited deliberately, not
 * re-litigated here.
 *
 * ⚠️ BUT THIS GATE ALSO FAILS **CLOSED** ON A SHAPE NOBODY CAN SATISFY, and inheriting only the
 * fail-open half of the caveat would have hidden it. The blanker family does not blank REGEX
 * LITERALS — telling `/x/` from division needs a parser — so `const re = /headerRight:/;` is
 * reported, and there is no way to write it that the gate accepts. It is pinned by a test rather
 * than fixed: the fix is the shared lexer (`gate-lib.mjs`'s Story 35.10), and the cost of the
 * false positive is near zero because these two names are reserved words here anyway — a regex
 * matching one has nothing legitimate to match in this codebase.
 */

import { readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { blankCommentsAndStrings, isMainModule, lineOfIndex } from './gate-lib.mjs';
import { collectSourceFiles, EXPO_SRC, missingRoots } from './lint-layers.mjs';

const repoRoot = resolve(fileURLToPath(import.meta.url), '../..');

/**
 * Files that legitimately set a native header slot, keyed by REPO-ROOT-relative path (the same
 * spelling `COLOR_EXCEPTIONS` in `lint-style.mjs` uses, so one convention covers the gate family).
 *
 * ⚠️ IT SHIPS EMPTY AND ADDING AN ENTRY IS AN OWNER DECISION. An entry has to argue why that
 * particular control is unreachable by mouse and still correct — the source app's one defensible
 * case was a ticking `<Text>` timer that does nothing on tap. It is NOT the answer to the reserved
 * names above: renaming a prop costs one edit, an exemption costs the file's coverage forever.
 * `exemptionProblems()` refuses a blank reason, a path that does not exist or cannot be read, and
 * a file that suppresses nothing.
 */
export const EXCEPTIONS = new Map();

/**
 * The slot identifier and the two names `Stack.Toolbar` compiles to on iOS. One pattern rather
 * than an alternation of four literals, so `unstable_headerRightItems` cannot be the spelling that
 * was forgotten. Word-bounded, so `headerRightGap` / `HEADER_RIGHT` do not match.
 */
const HEADER_SLOT_ID_RE = /\b((?:unstable_)?header(?:Left|Right)(?:Items)?)\b/g;

/**
 * A quoted property key or computed member: `{ 'headerRight': fn }`, `o["headerRight"] = fn`,
 * ``{ [`headerRight`]: fn }``.
 *
 * Matched against the RAW source, because the rules view blanks string CONTENTS — which is right
 * for prose in a string and wrong for a key, the one place a string literal IS code.
 *
 * ⚠️ THE DELIMITER CLASS IS `['"\`]` BECAUSE THAT IS THE WHOLE SET, not because three spellings
 * came to mind. It shipped as `['"]` and a backtick key walked straight through — the same
 * enumerate-what-you-thought-of failure as the colon-only matcher and the missing
 * `unstable_header*Items`. JavaScript has exactly three string delimiters, so this class is
 * exhaustive by construction and cannot acquire a fourth.
 *
 * BOTH assertions are load-bearing, and the suffix alone is not enough. The lookahead says a key
 * carries `:`, `]:` or `] =`; the LOOKBEHIND says it sits where a key can sit — after `{`, `,`, `[`
 * or a line start. Without the second, the ternary `x ? 'headerRight' : 'y'` matches the suffix and
 * the gate reds a correct tree over a string that is plainly a value.
 */
const QUOTED_SLOT_KEY_RE =
  /(?<=(?:^|[{,[])\s*)(['"`])((?:unstable_)?header(?:Left|Right)(?:Items)?)\1(?=\s*(?:\]\s*)?(?::|(?:\?\?|\|\|)?=))/gm;

/**
 * What may follow the identifier and still carry a VALUE this gate can judge: a property colon, a
 * computed-member close plus an assignment, or a plain assignment. `=(?![=>])` keeps `===`, `==`
 * and an arrow param out of the value branch — they are still violations, just ones with no value
 * to allow.
 *
 * ⚠️ THE `]` ALTERNATIVE IS NOT DECORATION. Without it `opts['headerRight'] = undefined` had no
 * operator at all, so the value was unjudgeable and the one documented allowance could never apply
 * to the bracket form — a shape the docblock promised was always allowed.
 */
const VALUE_OP_RE = /^(?:\]\s*)?(?::|(?:\?\?|\|\|)?=(?![=>]))/;

/**
 * `undefined` followed by a real value boundary — a separator, a closer, or the end of input.
 *
 * The BOUNDARY is what keeps `undefinedRenderer` and `undefined ?? renderSave` out of the
 * allowance; `;` and `)` are in the set because `opts.headerLeft = undefined;` and
 * `setOptions({ headerRight: undefined })` are the two shapes a screen actually writes.
 *
 * ⚠️ The leading `\s*` spans LINE TERMINATORS on purpose. Read line-scoped, `headerRight:\n
 * undefined,` — what a formatter produces the moment the line grows past the print width — was
 * reported as a violation, i.e. the gate reddening a tree that had done exactly what it asked.
 */
const UNDEFINED_VALUE_RE = /^\s*undefined\s*(?:[,;)}\]]|$)/;

/** To the end of the line under the FULL JS line-terminator set — never `[^\n]`, because a lone
 * `\r` or U+2028 ends a line for the language and for `lineOfIndex`, and swallowing one reports
 * the wrong line and an absurd snippet. */
const REST_OF_LINE_RE = /^[^\n\r\u2028\u2029]*/;

/** `<Stack.Toolbar …>` / `<StackToolbar …>`. `(?![.\w])` keeps the CHILDREN out
 * (`<Stack.Toolbar.Button>` is not the toolbar), and the `\s*` after `<` never matches the `/` of
 * a closing tag. */
const STACK_TOOLBAR_RE = /<\s*(?:Stack\.Toolbar|StackToolbar)(?![.\w])/g;
/** The ONLY two shapes that prove a toolbar never reaches a header slot: an explicit `bottom`, or
 * no `placement` at all (the documented default). Everything else fails — see the inversion note
 * on `findToolbarHeaderSlots`. */
const BOTTOM_PLACEMENT_RE = /\bplacement\s*=\s*\{?\s*['"`]bottom['"`]/;
const ANY_PLACEMENT_RE = /\bplacement\s*=/;
/** A readable header placement, so the failure can name it. */
const HEADER_PLACEMENT_RE = /\bplacement\s*=\s*\{?\s*['"`](left|right)['"`]/;

/**
 * The end of a JSX opening tag: the first `>` at brace depth ZERO, or -1 when the tag never closes.
 *
 * ⚠️ "THE FIRST `>`" WAS A FAIL-OPEN, MEASURED TWICE. `<Stack.Toolbar onPress={() => save()}
 * placement="right">` and `<Stack.Toolbar visible={a > b} placement="right" />` both truncated the
 * attribute span at the `>` inside the expression container — and a truncated span holds no
 * `placement`, which the old judging read as the benign `bottom` DEFAULT. So the two tags most
 * likely to carry a real header control were the two the scan waved through, in the direction the
 * docblock promised was impossible.
 *
 * Depth is counted on the RULES view, where string contents are already blanked, so a brace inside
 * a string attribute cannot unbalance it.
 */
export function jsxTagEnd(rules, from) {
  let depth = 0;
  for (let i = from; i < rules.length; i++) {
    const ch = rules[i];
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    else if (ch === '>' && depth === 0) return i;
  }
  return -1;
}

/**
 * `<Stack.Toolbar>` openings that are NOT PROVABLY harmless, as `{ slot, snippet, line }`.
 *
 * ⚠️ THE POLARITY IS THE FIX, AND IT IS THE THIRD ROUND OF THE SAME ROOT CAUSE. Twice before, this
 * gate enumerated the spellings someone had thought of — the colon form, then the four identifier
 * forms — and twice a spelling nobody listed walked through. So this does not ask "is it one of the
 * bad shapes"; it asks **"can I positively read a shape that proves this never reaches a header
 * slot?"** and fails otherwise. A truncated span, a `{...spread}` that could carry any placement, a
 * `placement={p}` — all unreadable, all violations. Only two things pass: a literal `bottom`, and
 * no `placement` attribute at all in a tag that closed cleanly.
 *
 * The remedy for a false positive is one keystroke — write `placement="bottom"` explicitly — which
 * is the right price for a defect that is invisible in tests, in types and in a screenshot.
 */
export function findToolbarHeaderSlots(rules, source) {
  const hits = [];
  STACK_TOOLBAR_RE.lastIndex = 0;
  let match = STACK_TOOLBAR_RE.exec(rules);
  while (match !== null) {
    const end = jsxTagEnd(rules, STACK_TOOLBAR_RE.lastIndex);
    const attrsRules = end === -1 ? rules.slice(match.index) : rules.slice(match.index, end);
    const attrs = end === -1 ? source.slice(match.index) : source.slice(match.index, end);
    const placement = HEADER_PLACEMENT_RE.exec(attrs);

    let why = null;
    if (end === -1) why = 'Stack.Toolbar (unclosed tag — placement unreadable)';
    else if (/\{\s*\.\.\./.test(attrsRules)) why = 'Stack.Toolbar (spread — placement unreadable)';
    else if (placement) why = `Stack.Toolbar placement="${placement[1]}"`;
    else if (BOTTOM_PLACEMENT_RE.test(attrs) || !ANY_PLACEMENT_RE.test(attrs)) why = null;
    else why = 'Stack.Toolbar (placement unreadable)';

    if (why) {
      hits.push({
        slot: why,
        snippet: attrs.replace(/\s+/g, ' ').trim().slice(0, 80),
        line: lineOfIndex(source, match.index),
      });
    }
    match = STACK_TOOLBAR_RE.exec(rules);
  }
  return hits;
}

/**
 * Splice quoted slot KEYS back into the rules view, length-preservingly (`'headerRight'` →
 * `· headerRight ·`), so one identifier scan sees every spelling.
 *
 * A key is restored only when its opening quote SURVIVED comment-blanking at the same offset — the
 * blanker family is length-preserving, which is what makes `rules[i]` answerable from a raw-source
 * match index. A `'headerRight':` written inside a docblock has a space there and is left blanked.
 */
export function restoreQuotedSlotKeys(rules, source) {
  let out = rules;
  QUOTED_SLOT_KEY_RE.lastIndex = 0;
  for (const m of source.matchAll(QUOTED_SLOT_KEY_RE)) {
    if (out[m.index] !== m[1]) continue; // the quote was inside a comment
    out = `${out.slice(0, m.index)} ${m[2]} ${out.slice(m.index + m[0].length)}`;
  }
  return out;
}

/**
 * Every offending header-slot occurrence in `source`, as `{ slot, snippet, line }`. Exported so the
 * `node --test` companion drives the positive hits directly, with no fs fixtures — the whole point,
 * since this defect is invisible to every other check and the gate is green on arrival.
 *
 * Reads the comment- and string-blanked view (with quoted keys restored above), so the words in
 * prose — this repo has `headerRight` inside five docblocks — are not code. The snippet is sliced
 * from the RAW source at the same offsets, the blankers being length-preserving, so a string inside
 * the offending expression stays readable in the failure message.
 *
 * The identifier match consumes only the identifier, and the value is read through a LOOKAHEAD, so
 * two slots on ONE line report twice. The first cut consumed the rest of the line as the value and
 * reported the first slot only.
 */
export function findRawHeaderSlots(source) {
  const rules = restoreQuotedSlotKeys(blankCommentsAndStrings(source), source);
  const offenders = [];

  HEADER_SLOT_ID_RE.lastIndex = 0;
  let match = HEADER_SLOT_ID_RE.exec(rules);
  while (match !== null) {
    const slot = match[1];
    const tail = rules.slice(HEADER_SLOT_ID_RE.lastIndex);
    const gap = /^\s*/.exec(tail)[0].length;
    const op = VALUE_OP_RE.exec(tail.slice(gap));

    // With an operator the value is judgeable, so `undefined` may excuse it. Without one — ES
    // shorthand, a prop, a param, a `const` of the reserved name — there is nothing to excuse.
    const excused = op
      ? UNDEFINED_VALUE_RE.test(rules.slice(HEADER_SLOT_ID_RE.lastIndex + gap + op[0].length))
      : false;
    if (!excused) {
      const snippet = source.slice(
        match.index,
        match.index + REST_OF_LINE_RE.exec(rules.slice(match.index))[0].length
      );
      offenders.push({
        slot,
        snippet: snippet.trim().slice(0, 80),
        line: lineOfIndex(source, match.index),
      });
    }
    match = HEADER_SLOT_ID_RE.exec(rules);
  }

  return [...offenders, ...findToolbarHeaderSlots(rules, source)];
}

/**
 * Exemption entries that cannot be trusted: a missing or blank reason, a path that does not exist
 * or cannot be read, or a file the gate finds nothing to suppress in. Returns the problems as
 * strings, empty when the map is sound (which includes the empty map it ships as).
 *
 * The reason is one safeguard — a bare path is a native header control the gate was told to ignore
 * for no stated cause, which is what the defect looks like. LIVENESS is the other, and it is the
 * one `lint-layers.mjs:139` already states for its own sanctioned-file set: a dead exemption is not
 * merely inert, it is a standing blindfold over a whole file that silently absorbs the next control
 * added to it — while still being counted in this gate's OK line.
 *
 * ⚠️ AND LIVENESS IS TWO QUESTIONS, NOT ONE. "Does this file set a slot" says nothing about
 * whether the SCAN WOULD EVER REACH IT: a key outside `apps/expo/src`, or one the walker skips by
 * rule (`*.test.tsx`, `__tests__/`), passed as sound while exempting a file from a rule that was
 * never going to apply to it — an entry that reads as coverage and is not. `population` is the set
 * of `root`-relative paths the scan actually collects; it is a parameter only so a fixture can
 * supply its own.
 *
 * ⚠️ THE READ IS GUARDED. A key naming a DIRECTORY throws `EISDIR` and an unreadable file throws
 * `EACCES`; uncaught, either replaced the gate's whole output with a stack trace and the scan never
 * ran at all — a fail-closed check turned into a crash, which is not the same thing.
 */
export function exemptionProblems(exceptions = EXCEPTIONS, root = repoRoot, population = null) {
  const scanned =
    population ??
    new Set(collectSourceFiles(EXPO_SRC).map((f) => relative(root, f).split('\\').join('/')));
  const problems = [];
  for (const [file, reason] of exceptions) {
    if (typeof reason !== 'string' || reason.trim() === '') {
      problems.push(
        `${file} — exemption has no reason. An exemption without one is indistinguishable ` +
          'from the defect; state why that control is unreachable by mouse and still correct.'
      );
      continue;
    }
    let body;
    try {
      body = readFileSync(join(root, file), 'utf8');
    } catch (err) {
      problems.push(
        `${file} — exemption names a path this gate cannot read (${err?.code ?? err?.message ?? err}). ` +
          'A dead exemption silently masks the rule for whatever takes that path next; delete it ' +
          'or fix the path.'
      );
      continue;
    }
    if (!scanned.has(file)) {
      problems.push(
        `${file} — exemption names a path the scan never visits (outside apps/expo/src, or a ` +
          'file the walker skips such as `*.test.tsx`). It exempts nothing from a rule that was ' +
          'never going to apply, and reads as coverage. Delete it.'
      );
      continue;
    }
    if (findRawHeaderSlots(body).length === 0) {
      problems.push(
        `${file} — exemption suppresses nothing: the file sets no header slot. It is not inert, ` +
          'it is a blindfold over the whole file for the next control added to it. Delete it.'
      );
    }
  }
  return problems;
}

/**
 * Scan the app source and return the violation strings.
 *
 * `base` is what an exemption KEY is relative to, and it is a parameter for one reason: production
 * keys files against `repoRoot` while a fixture root lives in `/tmp`, so without it the suppressing
 * path could not be driven end to end and the only coverage of the exemption skip was a mutation
 * that inverted it. A gate whose carve-out has never been observed working is a carve-out on trust.
 *
 * ⚠️ THROWS ON A ZERO-FILE POPULATION rather than returning `[]`. `main()`'s root check asks only
 * whether the directory EXISTS; an existing-but-empty root — a partial checkout, a moved source
 * tree, a walker that threw and swallowed it — scans nothing and would print OK having asked
 * nothing.
 */
export function runHeaderControlsScan(
  root = EXPO_SRC,
  { exceptions = EXCEPTIONS, base = repoRoot } = {}
) {
  const files = collectSourceFiles(root);
  if (files.length === 0) {
    throw new Error(
      `lint:header-controls — scanned zero source files under ${relative(repoRoot, root)}. ` +
        'A prohibition that scans nothing reports OK having checked nothing (fail-closed).'
    );
  }
  const violations = [];
  for (const file of files) {
    const relFile = relative(base, file).split('\\').join('/');
    if (exceptions.has(relFile)) continue;
    for (const { slot, snippet, line } of findRawHeaderSlots(readFileSync(file, 'utf8'))) {
      violations.push(`${relFile}:${line} — ${slot} — ${snippet}`);
    }
  }
  return violations;
}

function main() {
  const missing = missingRoots([['apps/expo/src', EXPO_SRC]]);
  if (missing.length > 0) {
    console.error(
      `lint:header-controls — FAIL: required scan root(s) missing: ${missing.join(', ')}.\n` +
        'The gate refuses to pass when the source root cannot be scanned (fail-closed).'
    );
    // ⚠️ `process.exitCode` + `return`, NEVER `process.exit()` — Node's stderr is asynchronous for
    // a pipe on POSIX and `process.exit()` does not drain it, so under `turbo` the violation list
    // is truncated exactly on the run with the most output. ⚠️ And every one of these four
    // assignments is load-bearing on its own: with any single one deleted the gate prints its whole
    // FAIL block and exits 0, which no output assertion can see. `lint-header-controls.test.mjs`
    // spawns the script and asserts `status`.
    process.exitCode = 1;
    return;
  }

  const badExemptions = exemptionProblems();
  if (badExemptions.length > 0) {
    console.error(`lint:header-controls — FAIL: ${badExemptions.length} unusable exemption(s):\n`);
    for (const p of badExemptions) console.error(`  ${p}`);
    process.exitCode = 1;
    return;
  }

  let violations;
  try {
    violations = runHeaderControlsScan();
  } catch (err) {
    // The zero-file floor above, and `collectSourceFiles`' own refusals (an unreadable subtree, a
    // symlink no canonical route reaches). Every one of them means the population is narrower than
    // it claims, which is the failure this gate exists to refuse — reported as a message rather
    // than a stack, and still exit 1.
    console.error(`lint:header-controls — FAIL: ${err?.message ?? err}`);
    process.exitCode = 1;
    return;
  }

  if (violations.length > 0) {
    console.error(
      'lint:header-controls — FAIL: these reach a NATIVE stack header slot. On an Apple-silicon\n' +
        'Mac running the iPhone build such a control is drawn and never receives a mouse click.\n' +
        '`headerLeft` and `headerRight` are RESERVED here: never pass one to a navigator, never\n' +
        'use `Stack.Toolbar placement="left"|"right"`, and do not reuse the names for the app\'s\n' +
        'own in-tree header props (use leading/trailing). To turn a slot off, write `undefined`:\n'
    );
    for (const v of violations) console.error(`  ${v}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `lint:header-controls — OK (no native header controls; ${EXCEPTIONS.size} documented exception(s))`
  );
}

// `onUnknown: 'run'` — an offline gate with no side effects: the unsafe outcome is skipping
// SILENTLY (a fail-closed gate reporting success having checked nothing), so warn loudly and run.
if (isMainModule({ url: import.meta.url, onUnknown: 'run', label: 'lint:header-controls' })) main();
