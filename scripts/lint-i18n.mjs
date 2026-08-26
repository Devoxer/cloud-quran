#!/usr/bin/env node
/**
 * lint:i18n — the CONVERGING localization gate. It asks FOUR questions, not one:
 *
 *   1-6 · IS THIS STRING LITERAL ROUTED THROUGH `t()`?   (Story 20.2 AC 3/11 + the epic-20 boundary)
 *   (a) · IS THIS LOCALE-SENSITIVE FORMATTER INSIDE THE ONE SANCTIONED MODULE?   (Story 24.19)
 *   (b) · DOES A KEY PASSED `count` DECLARE PLURAL VARIANTS?                     (Story 24.19)
 *   (c) · IS THIS STRING WITHIN THE COPY BUDGET, IN EVERY LOCALE?                (2026-08-26)
 *
 * ⚠️ THE FOURTH IS THE ONLY ONE THAT READS THE BUNDLES RATHER THAN THE SOURCE, and the only one
 * that is about how much the app says rather than about whether it can say it in another language.
 * See `COPY_BUDGET` for why it is measured per LOCALE and not on English.
 *
 * ⚠️ THE SECOND AND THIRD EXIST BECAUSE THE FIRST STRUCTURALLY CANNOT SEE THEM. A formatting
 * defect has NO LITERAL — the English is manufactured at runtime by a library's default locale
 * (`formatDistanceToNow(ts)` → "3 days ago" in every language) — and a plural defect has no
 * literal either: the key is present and translated, and the CALL SITE is what makes it plural.
 * Five rounds of the epic-20 boundary fixed SITES of the formatting class while the gate reported
 * OK, because nothing was asking a call-site question. See the docblocks on
 * `LOCALE_SENSITIVE_METHODS` and, below it, sink (b) inside `findViolations`.
 *
 * ── Questions 1-6: the string-extraction gate ─────────────────────────────────────────────────
 *
 * Enforces "no user-facing English string literal reaches a display sink without going
 * through `t(...)`/`i18n.t(...)`". Replaces the grep/pattern sweeps that did NOT converge:
 * across three review rounds, FIVE distinct literal/composition FORMS each escaped a
 * differently-scoped regex (ternary → static shared-const → backtick-template → lookup-table
 * → conditional-helper). Every round found a new SHAPE, not a case the sweep missed by
 * mistake — so a shape-chasing regex can never close the set. This scanner instead parses each
 * file with the TypeScript compiler API (already a dependency — `typescript` in node_modules,
 * NO new package) and asks a shape-independent question at every display SINK: is the value
 * PROVABLY a `t()` call, a pure data binding, or an allow-listed carve-out? A prose string
 * literal that is not — directly OR through one hop of local helper-function / lookup-table
 * indirection — is a violation, whatever syntactic shape hides it.
 *
 * Display SINKS (where user-facing copy surfaces):
 *   1. JSX attributes in TARGET_PROPS (`accessibilityLabel`, `accessibilityHint`, `title`,
 *      `label`, `placeholder`, `message`, `subtitle`, `description`).
 *   2. JSX text nodes (`<Text>Hello</Text>`) and JSX expression children (`<Text>{expr}</Text>`).
 *   3. Object-literal properties whose KEY is in TARGET_PROPS (`showAlert({ title, message })`,
 *      `Stack.Screen` `title:` options, `ConfirmDialog` prop objects, …).
 *   4. DEFAULT VALUES of copy-bearing parameters (`function C({ actionLabel = 'Try Again' })`).
 *   5. The user-message ARGUMENT of a `USER_MESSAGE_CTORS` constructor (`new AppError(code, msg)`).
 *
 * Sinks 4 and 5 were added at the EPIC-20 BOUNDARY, after the gate reported OK on a tree that
 * shipped three live untranslated-copy defects. Both are shapes that sinks 1-3 cannot see even in
 * principle: at the render site each value is a bare identifier, which value resolution correctly
 * classifies as a safe boundary binding ("whoever wrote the literal is flagged at THAT site") —
 * but for a default value and for a constructor argument, THIS site IS the writer, and no sink
 * was looking at it. See the docblocks on `COPY_PARAM_SUFFIX` and `USER_MESSAGE_CTORS`. The
 * lesson generalizes: the sink list, not the value resolver, is where this gate under-matches.
 *
 * A value is PROVABLY SAFE (recursively):
 *   - a `t(...)` / `i18n.t(...)` / `*.t(...)` call (the literal inside is the extraction KEY);
 *   - a non-prose literal (no run of ≥2 letters — punctuation / format / single glyph / number);
 *   - a data binding whose root is NOT a local prose-bearing const (identifier/prop access that
 *     resolves to a param, prop, import, or unknown — the boundary: whoever WROTE the literal is
 *     flagged at THAT site, so nothing escapes tree-wide);
 *   - a call to a local helper whose every `return` is safe (resolves ShuffleRepeatControls'
 *     `i18n.t`-returning helpers → PASS; DurationBadge/PlayButton's literal-returning ones → FAIL);
 *   - an index into a local const object/array whose every value is safe (lookup-table indirection);
 *   - a conditional / `??` / `||` / `&&` / `+` whose operands are all safe;
 *   - anything else the analysis can't follow (a JSX element child, an unknown call) — SAFE by
 *     construction: value resolution flags ONLY provable misses, never guesses (no false positive
 *     from value resolution). Sink SELECTION is intentionally broader — see Known limitations.
 *
 * ── The escape hatch (all sinks) ──────────────────────────────────────────────────────────────
 *
 * A deliberate carve-out takes an inline `// lint-i18n-ok: <reason>` on the sink's own line, or
 * anywhere in the CONTIGUOUS COMMENT BLOCK directly above it (mirrors `// lint-gating-ok` in
 * lint-layers). The block form matters: these markers carry a REASON, and a reason worth writing
 * rarely fits where the marker has to sit — forcing it to would push every carve-out toward a bare
 * marker with no justification, which is the opposite of a per-site deliberate decision. The
 * marker never reaches across a line of code, so one carve-out cannot silently cover the next
 * violation below it, and it must sit at the HEAD of a comment with its `:` reason separator (see
 * `isMarkerLine`) — prose that merely mentions the marker, as this very paragraph does, is not a
 * carve-out.
 *
 * The carve-outs in the tree fall into five SHAPES — pre-init / boot-error copy that must render if
 * i18n itself threw (whole-file, see `I18N_EXEMPT_FILES`), a value formatted for someone else's
 * locale (the store's price), a machine value (`1.50x`), an identifier that is data rather than
 * copy (a language code, an endonym, a query enum), and a diagnostic that is never rendered.
 * `grep -rn 'lint-i18n-ok' apps/expo/src` is the live list; a hand-copied inventory here would be
 * the same stale-claim defect this story's AC-10 was raised for, and the first cut of this sentence
 * already was one — it named three of the nine sites (Story 24.19 Step I).
 *
 * Mirrors `scripts/lint-style.mjs` / `lint-layers.mjs`: pure exported helpers (the `node --test`
 * companion asserts every evasion + safe form without fs fixtures), and FAIL-CLOSED — the gate
 * refuses to pass if the scan root is missing (a renamed/absent root would otherwise pass
 * vacuously; the "don't ship a fail-open gate" rule from the cheat sheet).
 *
 * Known limitations (accepted — documented):
 *   - Symbol resolution is FILE-SCOPE and name-based (no scope tracking, like lint-layers'
 *     gating scan): two same-named locals in one file share a resolution. Follows exactly ONE
 *     structural hop (helper return / lookup value); a literal hidden two indirections deep, or
 *     inside an array that is `.map`-ped into JSX through a boundary binding, is not chased — the
 *     spec scopes this to "simple helper-function / lookup-table indirection", which is the class
 *     that broke the regex. A deeper form would surface at review and extend the hop rule.
 *     (Under-match only — a same-named collision under-flags, never mis-flags real copy.)
 *   - Sink 3 (an object-literal property whose KEY is a target prop) is matched context-free by
 *     the key NAME, so a genuine NON-copy object field named `title`/`label`/`message`/
 *     `description` (a query `order: { title: 'asc' }` clause, a config object) is over-
 *     flagged. This is the FAIL-SAFE direction for a completeness gate — over-flag, never under-
 *     flag — and the deliberate non-copy sink carries an inline `// lint-i18n-ok` (as
 *     `useSearch.ts` does). Value resolution never guesses; sink SELECTION is deliberately broad,
 *     with a handful of allow-listed non-copy obj-keys as the price of never missing real copy.
 *   - Sinks 4 and 6 are NAME-driven and over-flag in the same fail-safe direction, so the same
 *     `// lint-i18n-ok` answer applies. A parameter default (sink 4) or a function return (sink 6)
 *     whose name ends in a copy suffix but whose value is NOT copy will be flagged: a
 *     `sortText = 'title'` default, or a telemetry/enum resolver like `deviceTypeLabel` and an
 *     endonym registry like `uiLanguageLabel` (both real, both carved out in-tree). Sink 6's
 *     marker is additionally honored at the FUNCTION's line, since that sink is function-scoped
 *     and a non-copy resolver is wrong as a whole rather than arm by arm.
 *   - Sink 6 UNDER-matches by name in the other direction: a copy-returning helper whose name
 *     carries no `…Message`/`…Label`/`…Text` signal is not inspected. Widening it to every
 *     string-returning function would flag most of the app; the suffix vocabulary is the same one
 *     sink 4 uses, and a new resolver should be named to match rather than the gate loosened.
 *   - Sink (a) knows the formatters named in `LOCALE_SENSITIVE_METHODS` plus `Intl.*` and any
 *     `date-fns` import. That RULE is scoped to what it names — a locale-sensitive API nobody has
 *     used yet is not covered — but the POPULATION it applies to is not: every non-test file under
 *     `apps/expo/src` is walked, and exactly one path is exempt from THIS sink (`FORMAT_MODULE`,
 *     asserted to exist by `main()`). The `I18N_EXEMPT_FILES` carve-out is scoped to sinks 1-6 and
 *     does NOT switch (a)/(b) off — it exists because a boot-error surface must render if i18n
 *     threw, which is a claim about LITERALS and says nothing about formatting (Story 24.19 Step G;
 *     it used to `continue` the whole file, silently unchecking the app's root layout). The
 *     distinction is the one 24.31 took three rounds to arrive at: a file outside a population is
 *     not partially checked, it is unchecked.
 *   - Sink (a) reads the `Intl` OBJECT by name (`Intl`, `globalThis.Intl`, `globalThis['Intl']`).
 *     A form that RENAMES it first — `const { NumberFormat } = Intl`, `const I = Intl` — needs
 *     scope tracking this file deliberately does not do, and so does a `t` renamed at its binding
 *     (`const { t: tr } = useTranslation()`) or bound with `keyPrefix`. Likewise `String(d)` and
 *     `` `${d}` `` are not method calls, so no callee rule can see them. These are listed rather
 *     than implied: an enumeration of what a scan MISSES ages as badly as one of what it catches
 *     (`stack/gates-scanners.md`), and the previous docblock's "however it is reached" was a claim
 *     the code did not hold. There is no in-tree site for any of them.
 *   - Sink (b) flags only a key it can positively resolve to a plain string in the base bundle. A
 *     dynamic key (`t(someKey, { count })`) cannot be checked, and an ABSENT key is a different
 *     defect owned by the typed-`t()` augmentation and the parity suite. Under-match, deliberate.
 *     A bare key is resolved against the namespaces the FILE binds (`boundNamespacesOf`) for a
 *     destructured `t`, and against `common` for the `i18n.t` singleton (`namespacesForCall`) —
 *     see those functions for the two ways the wrong choice made this sink silently inert. Two
 *     forms it still cannot read: `count` reached through a spread (`t(k, { ...opts })`) or a
 *     non-literal options object.
 *   - Renaming a key's interpolation variable away from `count` silences sink (b) as surely as
 *     declaring the variants does. That is the SANCTIONED fix when the copy does not inflect (a
 *     parenthesised number, an abbreviated unit — see `common:sectionPicker.apply` and the
 *     relative-time keys), and it is the reviewer, not the gate, that tells the two apart.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { blankStrings, isMainModule, isMarkerLine, splitLines } from './gate-lib.mjs';
import { collectSourceFiles, EXPO_SRC, missingRoots } from './lint-layers.mjs';

const repoRoot = resolve(fileURLToPath(import.meta.url), '../..');

// JSX props + object-literal keys that carry user-facing display copy (AC 3 list). A prose
// literal reaching one of these — directly or via local indirection — must go through t().
export const TARGET_PROPS = new Set([
  'accessibilityLabel',
  'accessibilityHint',
  'title',
  'label',
  'placeholder',
  'message',
  'subtitle',
  'description',
]);

/**
 * Sink 4 — parameter names whose DEFAULT VALUE is user-facing copy (epic-20 boundary review).
 *
 * A default parameter value is a display sink that sinks 1-3 structurally cannot see: at the
 * render site the value is a bare parameter identifier, which `isProvablySafe` classifies as a
 * boundary binding ("whoever wrote the literal is flagged at THAT site") — but for a DEFAULT the
 * writer IS this site, so nothing was ever flagged. `ErrorView`'s `actionLabel = 'Try Again'`
 * shipped through the whole of Epic 20 this way, live on three quiz screens.
 *
 * Matched by NAME, not by prose-ness of the value: `isProse` is true for `'error-view'` and
 * `'warning-outline'` too, so flagging every prose default would bury the gate in `testID` and
 * icon-name noise. Suffix-matched so `actionLabel`, `emptyMessage`, `headerTitle` are covered
 * without enumerating every prop in the app.
 *
 * ⚠️ ANCHORED AT A camelCase BOUNDARY, not case-insensitively (Epic-24 boundary). The predecessor
 * was `/(?:…|text)$/i`, which matches `context` — so widening sinks 1/3 to this vocabulary
 * produced false positives on `captureException(err, { context: 'stats' })`, a telemetry key that
 * is never user-facing. The word the suffix names has to START where a word starts: either the
 * whole name is that word (`text`, `label`), or it begins with a capital (`confirmText`,
 * `ctaLabel`). `context` is neither.
 *
 * (The count that used to sit in that sentence is gone rather than corrected: a hand-maintained
 * census in a docblock is a universality claim with a decimal point, nothing maintains it, and it
 * was wrong twice. The argument does not need one.)
 */
export const COPY_PARAM_SUFFIX =
  /^(?:label|message|title|subtitle|description|placeholder|hint|text)$|(?:Label|Message|Title|Subtitle|Description|Placeholder|Hint|Text)$/;

/**
 * ⚠️ AN EVENT-HANDLER NAME IS NEVER A DISPLAY SINK — `on` followed by a capital.
 *
 * `COPY_PARAM_SUFFIX` ends in `Text$`, so `onChangeText` classified as user-facing copy wherever it
 * appears. Those sites passed only because a function VALUE is provably safe — i.e. the gate was
 * asking a question it has no business asking and getting away with it by accident, the shape that
 * produces a false positive the first time someone writes an inline arrow the resolver cannot see
 * through. Fixed as a SHAPE, not by special-casing the one word that broke: a name beginning `on` +
 * a capital does not read as display copy. (`onboardingTitle` is unaffected — the character after
 * `on` must be uppercase.)
 *
 * ⚠️ SCOPE, STATED RATHER THAN CLAIMED UNIVERSALLY (Story 35.4 Step I). This guard lives in
 * `isCopyParamName`, so it reaches sinks 1/3/4/5 — every sink asking "is this NAME a display
 * sink?" — and **not** sink 6, which tests a function's own name through `COPY_RETURNING_FN`
 * below. An earlier version of this paragraph said "nothing whose name begins `on` + a capital
 * carries display copy" without qualification, which a review layer correctly read as covering all
 * four predicates and it covers three. Sink 6 is deliberately left strict: its failure direction is
 * a false POSITIVE (loud, and no such function exists in this tree), whereas extending an exemption
 * is the fail-OPEN direction, and a gate does not widen an exemption to make a sentence true.
 *
 * ⚠️ WHAT THIS GUARD COSTS, ALSO STATED. It is a NAME test standing in for a VALUE question, so a
 * compound name that is genuinely both — `onConfirmLabel`, `onErrorMessage` — is exempted along
 * with `onChangeText`. Two layers surfaced that in round 1 and again in round 2 with sharper cases
 * (JSX attributes and object keys, not just parameter defaults). It is declined deliberately and
 * for a reason no rewording changes: no NAME shape separates `onChangeText` (17 live sites) from
 * `onConfirmLabel` (zero, synthetic) — both are handler-prefixed AND copy-suffixed. Only the VALUE
 * kind separates them, and asking the value is exactly the question AC-6 deleted, because the
 * resolver cannot see through an inline arrow. Re-open this only WITH a real `onXLabel` string
 * writer in the tree to point at.
 */
const HANDLER_NAME_RE = /^on[A-Z]/;

/** True if a parameter/binding name is one whose default value would be user-facing copy. */
export function isCopyParamName(name) {
  if (HANDLER_NAME_RE.test(name)) return false;
  return TARGET_PROPS.has(name) || COPY_PARAM_SUFFIX.test(name);
}

/**
 * ⚠️ THE SAME VOCABULARY FOR SINKS 1 AND 3 (Epic-24 boundary, HIGH).
 *
 * Sinks 1 (JSX attribute) and 3 (object-literal key) matched the 8-name EXACT set while sinks 4/5/6
 * trusted the SUFFIX vocabulary — so a suffix-named copy prop belonged to no sink at all. Measured:
 * `<EmptyState ctaLabel="Get started" actionLabel="Try Again" confirmText="Delete forever"
 * emptyTitle="Nothing here" retryLabel="Retry now" />` produced NO violations, while the control
 * `<Text title="Hello world" />` fired correctly. All five of those are live JSX attributes in this
 * tree. A component declaring such a prop with NO default (so sink 4 never fires) plus a call site
 * passing a raw literal was completely unowned — the exact class sinks 4/5/6 each exist to close,
 * alive in a fourth shape.
 *
 * ⚠️ THE `alt` / `aria-label` ENTRY IS GONE, AND ITS RE-ADOPT TRIGGER IS: a real `alt=` or
 * `aria-label=` JSX writer landing in `apps/expo/src`. It was added for copy-bearing WEB
 * attributes on the reasoning that the app ships an `+html.tsx` surface — but that surface is a
 * web/Astro-shaped argument, not this RN one, and the tree has NO writer for either: zero `alt=`
 * attributes, and the only two `aria-label` occurrences are a CSS selector string and a comment,
 * both inside `+html.tsx` itself. An allowlist entry with no writer you can point at in the tree
 * is speculative, and it waives (or here, polices) something nothing creates. Add it back with the
 * writer, in the same commit.
 *
 * With that entry deleted, a JSX attribute / object key and a parameter name ask the SAME question,
 * so there is no longer a second predicate: `isCopyParamName` is it. The former `isCopySinkName`
 * wrapper was left behind as `return isCopyParamName(name)` — two exported names for one function,
 * with three call sites that had no basis for choosing between them. Deleted (Story 35.4 Step G);
 * re-introduce a distinct sink predicate only when the two questions genuinely diverge again.
 */

/**
 * Sink 5 — constructors that carry a user-facing message argument (epic-20 boundary review).
 *
 * `new AppError(code, userMessage)` renders `userMessage` straight into `ErrorView`/`InlineError`
 * on the play, read, quiz and account-deletion paths, but a string ARGUMENT to a non-`t` call was
 * not a sink in any of 1-3. Ten sites in `lib/contentRead.ts` + `lib/accountApi.ts` shipped raw
 * English through Epic 20 while `lint:i18n` reported OK. Maps constructor name → 0-based index of
 * the message argument.
 */
export const USER_MESSAGE_CTORS = new Map([['AppError', 1]]);

/**
 * Sink 6 — functions whose NAME says they RETURN user-facing copy (epic-20 boundary, round 2).
 *
 * Round 1 added sinks 4 and 5 for exactly this defect class and its own docblock predicted the
 * next miss: "the sink list, not the value resolver, is where this gate under-matches." Round 2
 * then found the class alive in a THIRD shape — a plain `return 'literal'` from a resolver helper:
 *   - `lib/authErrors.ts` `getAuthErrorMessage` — 13 English sentences into the sign-in error
 *     banner, on every platform, live for the whole epic.
 *   - `lib/purchases-web.ts` `getWebErrorMessage` — 10 more, whose NATIVE twin 20.2 had extracted.
 *
 * Neither is visible to sinks 1-5: inside the helper there is no JSX, no object literal, no
 * copy-bearing parameter default and no `new AppError`; at the RENDER site the value is a boundary
 * binding from an imported call, which `isProvablySafe` (correctly, as a rule) treats as safe.
 * Nobody owned the literal. This sink puts the owner back at the site that writes it.
 *
 * Matched by name suffix, same vocabulary as `COPY_PARAM_SUFFIX` — `getAuthErrorMessage`,
 * `getWebErrorMessage`, `getErrorMessage`, `…Label`, `…Title`, `…Text` all qualify. Covers
 * `function f()`, `const f = () =>`, object methods and class methods. Nested functions are NOT
 * attributed to the outer name (`functionReturnExprs` already stops at a nested function).
 *
 * A deliberate non-copy return (a dev-only diagnostic, a testID builder) takes `// lint-i18n-ok`.
 */
export const COPY_RETURNING_FN = COPY_PARAM_SUFFIX;

/** True if a function name says its return value is user-facing copy. */
export function isCopyReturningFnName(name) {
  return COPY_RETURNING_FN.test(name);
}

/** The declared NAME of a function-like node, or undefined for a genuine anonymous. Covers
 * `function f(){}`, `const f = () => {}`, `{ f() {} }` / `{ f: () => {} }`, and class methods. */
export function functionOwnName(node) {
  if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) {
    return node.name && ts.isIdentifier(node.name) ? node.name.text : undefined;
  }
  const p = node.parent;
  if (!p) return undefined;
  if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return p.name.text;
  if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name)) return p.name.text;
  if (ts.isPropertyDeclaration(p) && ts.isIdentifier(p.name)) return p.name.text;
  return undefined;
}

// Whole-file carve-outs — the EXACT two files AC6 enumerates as the deliberately-hardcoded
// pre-init / boot-error set: they render before or independently of a healthy i18n and MUST NOT
// depend on t(). This map IS the machine encoding of AC6 (mirrors lint-style's COLOR_EXCEPTIONS).
export const I18N_EXEMPT_FILES = new Map([
  [
    'apps/expo/src/components/ui/ErrorBoundary.tsx',
    'AC6: class error boundary — must render even if i18n itself threw',
  ],
  [
    'apps/expo/src/app/_layout.tsx',
    'AC6: AuthErrorView is the earliest pre-auth surface, rendered before <Stack> mounts',
  ],
]);

/**
 * Does `I18N_EXEMPT_FILES` suppress this violation? Only for the STRING sinks (1-6).
 *
 * ⚠️ THE CARVE-OUT IS A CLAIM ABOUT LITERALS, NOT A FILE-LEVEL OFF SWITCH (Story 24.19 Step G).
 * These files are exempt because they must render if i18n itself threw, so their English literals
 * are deliberate. That reason says nothing about FORMATTING or PLURALS: a `date-fns` import or a
 * `toFixed` is the same defect in the root layout as anywhere else. The scan used to `continue` the
 * whole file, which silently unchecked `app/_layout.tsx` — the app's ROOT layout — for both new
 * sinks, while the module docblock claimed exactly one path was exempt. Keep the population, narrow
 * the rule (`stack/gates-scanners.md`: every entry in a skip list is a hole).
 */
export function isFileExempted(relFile, kind) {
  if (!I18N_EXEMPT_FILES.has(relFile)) return false;
  // Matched on the FAMILY prefix (`plural-`), not on each kind by name (Epic-24 boundary): the
  // second plural sink, `plural-no-count`, would otherwise have inherited the string-sink carve-out
  // on day one — a new rule silently born exempt in the app's root layout. Any future `plural-*`
  // kind is covered by construction.
  return !/^(locale-format|plural-)/.test(kind);
}

/**
 * Sink (a) — LOCALE-SENSITIVE FORMATTING, which sinks 1-6 structurally CANNOT see (Story 24.19).
 *
 * Sinks 1-6 all ask ONE question: *is this string literal routed through `t()`?* A formatting
 * defect has **no literal**. The English is manufactured at runtime by a library's default locale:
 *
 *   formatDistanceToNow(ts, { addSuffix: true })   → "3 days ago", in every language
 *   format(date, 'MMMM d, yyyy')                   → "January 15, 2026" inside French chrome
 *   `${parseFloat(x.toFixed(1))} ${units[i]}`      → "245.3 MB" where French reads "245,3 Mo"
 *
 * Five rounds of the epic-20 boundary each fixed SITES of this class; none closed the CLASS. This
 * sink asks a CALL-SITE question instead of a literal question: a locale-sensitive formatter used
 * anywhere in `apps/expo/src` outside the one sanctioned format module is a violation.
 *
 * ⚠️ ANCHORED ON THE AST, NEVER ON SOURCE TEXT OR A SOURCE LINE (`stack/gates-scanners.md` § "a
 * gate that scans SOURCE TEXT is re-openable by definition"). Two consequences worth stating,
 * because both are load-bearing:
 *
 *  • The formatter is matched by CALL-EXPRESSION CALLEE, so `x?.toFixed(1)` and `x['toFixed'](1)`
 *    are the same node shape and cannot slip past a spelling.
 *  • `date-fns` is matched by its IMPORT SPECIFIER, never by the call spelling. An alias
 *    (`import { format as fmt }`), a namespace import (`import * as df`) or a dynamic
 *    `import('date-fns')` all defeat a call-name scan, while a binding cannot be USED without
 *    being NAMED at its import. This is the same durable anchor 24.31 had to arrive at after
 *    three rounds of widening a spelling list.
 *
 * And because a comment is not a node, the ~100-line comment-and-string blanker that a text-based
 * version of this rule inevitably grows — wrong twice in 24.29, each time certifying a real
 * violation as clean — never has to exist here.
 */
export const LOCALE_SENSITIVE_METHODS = new Set([
  'toFixed',
  'toLocaleString',
  'toLocaleDateString',
  'toLocaleTimeString',
  // COLLATION is locale-sensitive rendering too — `localeCompare` with no locale argument sorts by
  // the DEVICE's locale, so a list whose labels were resolved in the app language comes back in
  // another language's order (French `É` collates differently). Added at Story 24.19 Step G after
  // two live sites shipped past the first cut of this list, which named only the formatters the
  // story's inventory happened to contain. `toLocaleUpperCase`/`toLocaleLowerCase` are here for
  // the same reason (the Turkish dotless-ı class), before a site exists rather than after.
  'localeCompare',
  'toLocaleUpperCase',
  'toLocaleLowerCase',
  // `Date`'s own English-manufacturing methods. `d.toDateString()` renders "Mon Aug 04 2026" —
  // an English weekday and month name, produced at runtime with no literal for any string gate to
  // see, which is the whole class this sink exists for. There is no in-tree site; they are named
  // here for the same reason `toLocaleUpperCase` is, BEFORE one exists rather than after (Story
  // 24.19 Step I). Deliberately NOT `toString`: every object has one, and `String(d)` / `` `${d}` ``
  // are not method calls at all — see § Known limitations.
  'toDateString',
  'toTimeString',
  'toUTCString',
]);

/**
 * Module specifiers whose every import is a locale-sensitive date formatter.
 *
 * The whole `date-fns` FAMILY, not just the package the app happened to depend on: `date-fns-tz`
 * is a separate package that re-exports the same locale-defaulting `format`, and `@date-fns/tz` is
 * its scoped successor. Matching only `date-fns` would have let a one-word dependency swap re-open
 * the class this story closed (Story 24.19 Step I).
 */
export function isLocaleFormattingModule(spec) {
  // Matched on the package BOUNDARY, so `date-fns-tz` and `@date-fns/tz` are in while `date-fnsy`
  // — a different package that merely starts with the same letters — is out.
  return /^@?date-fns([-/]|$)/.test(spec);
}

/**
 * A member read off the `Intl` OBJECT — `Intl.X`, `Intl['X']`, `globalThis.Intl.X`,
 * `globalThis['Intl'].X` — or `undefined`. Anchored on the ACCESS node so a construction, a call
 * and a bare binding are one rule.
 *
 * ⚠️ What this does NOT reach: a form that renames the object before using it —
 * `const { NumberFormat } = Intl`, `const I = Intl`. Those need scope tracking this file
 * deliberately does not do (§ Known limitations, where they are listed rather than implied). The
 * earlier version of this docblock claimed "however it is spelled" while three forms walked past
 * it; a claim a gate cannot hold is the defect, so this one is scoped to what it enumerates
 * (Story 24.19 Step I).
 */
export function intlMemberName(node) {
  const isIntlName = (e) => ts.isIdentifier(e) && (e.text === 'globalThis' || e.text === 'global');
  const isIntlRef = (e) =>
    (ts.isIdentifier(e) && e.text === 'Intl') ||
    (ts.isPropertyAccessExpression(e) && e.name.text === 'Intl' && isIntlName(e.expression)) ||
    (ts.isElementAccessExpression(e) &&
      e.argumentExpression &&
      (ts.isStringLiteral(e.argumentExpression) ||
        ts.isNoSubstitutionTemplateLiteral(e.argumentExpression)) &&
      e.argumentExpression.text === 'Intl' &&
      isIntlName(e.expression));
  if (ts.isPropertyAccessExpression(node) && isIntlRef(node.expression)) return node.name.text;
  if (
    ts.isElementAccessExpression(node) &&
    isIntlRef(node.expression) &&
    node.argumentExpression &&
    (ts.isStringLiteral(node.argumentExpression) ||
      ts.isNoSubstitutionTemplateLiteral(node.argumentExpression))
  ) {
    return node.argumentExpression.text;
  }
  return undefined;
}

/**
 * The ONE file allowed to call a locale-sensitive formatter. Every other site must route through
 * it, which is what makes "the app formats dates and numbers in the app's language" a property
 * a gate can hold rather than a rule one person remembers.
 */
export const FORMAT_MODULE = 'apps/expo/src/lib/format.ts';

/** Namespace i18next resolves a bare (un-prefixed) key against. Mirrors `i18n/resources.ts`. */
export const DEFAULT_NS = 'common';

/** The CLDR plural suffixes i18next appends. `_other` is the one EVERY locale has. */
const PLURAL_SUFFIX_RE = /_(zero|one|two|few|many|other)$/;

/**
 * Flatten one locale's bundles into the two sets sink (b) needs.
 *
 * `plural` holds every stem that declares an `_other` variant — `_other` is the exact
 * discriminator (`stack/i18n.md`): every locale's CLDR set contains it, so a genuine i18next
 * plural always has one, while a key that merely ENDS in a CLDR word (`onboarding.step_one`,
 * `tier_one`) does not and is correctly left out.
 *
 * `plain` holds every non-plural leaf. Sink (b) flags only a key that is positively KNOWN to be a
 * plain string — an unresolvable or absent key is left alone, because "this key does not exist" is
 * a different defect that the typed-`t()` augmentation and the parity suite already own.
 */
/**
 * Every leaf of a `{ ns: tree }` map as `[ 'ns:dotted.path', value ]`, in file order.
 *
 * The ONE walker both bundle-reading sinks use: (b) needs the key names, (c) needs the values.
 * Two walkers would be two definitions of what a leaf IS, and the first divergence — an array, an
 * empty object — would silently take a key out of one sink's population while the other kept it.
 */
export function bundleLeaves(namespaces) {
  const leaves = [];
  const walk = (ns, prefix, node) => {
    for (const [k, v] of Object.entries(node)) {
      const path = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) walk(ns, path, v);
      else leaves.push([`${ns}:${path}`, v]);
    }
  };
  for (const [ns, tree] of Object.entries(namespaces)) walk(ns, '', tree);
  return leaves;
}

export function indexBundleKeys(namespaces) {
  const leaves = bundleLeaves(namespaces).map(([key]) => key);

  // Pass 1 — the plural STEMS, keyed on `_other` and nothing else.
  const plural = new Set();
  for (const key of leaves) {
    const m = PLURAL_SUFFIX_RE.exec(key);
    if (m && m[1] === 'other') plural.add(key.slice(0, m.index));
  }
  // Pass 2 — everything that is not a variant OF a real plural group is a plain key, including a
  // key that merely ENDS in a CLDR word (`onboarding.step_one`, `tier_one`). Two passes rather
  // than one because the `_other` sibling can appear after its `_one` in insertion order, and
  // classifying on the fly would then mis-file whichever came first.
  const plain = new Set();
  for (const key of leaves) {
    const m = PLURAL_SUFFIX_RE.exec(key);
    if (m && plural.has(key.slice(0, m.index))) continue;
    plain.add(key);
  }
  return { plain, plural };
}

/**
 * Every `ns:path` spelling a `t()` key could resolve to, given the namespaces the FILE binds.
 *
 * ⚠️ A BARE KEY DOES NOT ALWAYS MEAN `common:` — that assumption made sink (b) inert in 14 files
 * (Story 24.19 Step G). `useTranslation('library')` binds `t` to `library`, so `t('offline.x')`
 * there resolves against `library`, not the default namespace. Qualifying every bare key with
 * `common:` produced a name that is in NEITHER the plain nor the plural set, so the sink returned
 * "no violation" for the exact defect it exists to catch — `t('offline.deleteAllTitle', {count})`
 * written the idiomatic way in a namespaced file. This is the gates-scanners class "a gate whose
 * population derives from a scanned token is blind to the file reaching the same resource by
 * another route": the rule was right and the NAME it asked about was wrong.
 *
 * Returns every candidate rather than one guess; the caller flags only when they AGREE, so a file
 * binding several namespaces cannot manufacture a false positive.
 */
export function qualifyKey(key, namespaces = [DEFAULT_NS]) {
  if (key.includes(':')) return [key];
  const ns = namespaces.length ? namespaces : [DEFAULT_NS];
  return ns.map((n) => `${n}:${key}`);
}

/**
 * The namespaces a file binds `t` to — every string-literal argument of `useTranslation(…)` /
 * `getFixedT(…)` in it, defaulting to `common` when the call is bare. Both the `'ns'` and the
 * `['a','b']` argument forms are read; a non-literal argument is skipped (unresolvable, and the
 * `qualifyKey` agreement rule keeps that from over-flagging).
 */
export function boundNamespacesOf(sourceFile) {
  const found = new Set();
  const addFrom = (arg) => {
    if (!arg) return found.add(DEFAULT_NS);
    if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))
      return found.add(arg.text);
    if (ts.isArrayLiteralExpression(arg)) {
      for (const el of arg.elements) {
        if (ts.isStringLiteral(el) || ts.isNoSubstitutionTemplateLiteral(el)) found.add(el.text);
      }
    }
  };
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const callee = ts.isIdentifier(node.expression)
        ? node.expression.text
        : ts.isPropertyAccessExpression(node.expression)
          ? node.expression.name.text
          : undefined;
      if (callee === 'useTranslation' || callee === 'getFixedT') addFrom(node.arguments?.[0]);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  // A file that never binds `t` (a plain `i18n.t('…')` caller) still resolves against the default.
  if (!found.size) found.add(DEFAULT_NS);
  return [...found];
}

/** True if `s` contains a "word" — a run of ≥2 Unicode letters. Punctuation, single glyphs,
 * numbers, format strings ("—", ":", " ", "1") are NOT prose and never need extraction. A URI
 * (anything containing `://`, e.g. a deep-link `https://…`) is not translatable copy either. */
export function isProse(s) {
  // A string that is PURELY a URI (`scheme://…` with no surrounding words) is not translatable
  // copy — but a sentence that merely CONTAINS a link ("Read more at https://…") IS copy, so match
  // the WHOLE string, not just a `://` substring (the old `/:\/\//` test wrongly exempted any
  // string containing a URL, letting a user-facing sentence with an inline link escape the gate).
  if (/^\s*[a-zA-Z][a-zA-Z0-9+.-]*:\/\/\S+\s*$/.test(s)) return false;
  return /\p{L}{2,}/u.test(s);
}

/** True if `s` is itself an i18next resource KEY — a dotted path, optionally namespaced
 * (`ns:a.b.c` or `a.b.c`), with no whitespace. Such a value is ALREADY extracted (the object
 * stores the key; a consumer resolves it via `t(item.label)` — the blessed "key-table" pattern,
 * e.g. `constants/notifications.ts`), so a literal that IS a key is not un-extracted copy. */
export function looksLikeI18nKey(s) {
  return !/\s/.test(s) && /^[A-Za-z0-9_-]+([.:][A-Za-z0-9_-]+)+$/.test(s);
}

/** True if `node` is a `t(...)` / `i18n.t(...)` / `props.t(...)` call — the literal argument is
 * the extraction KEY, not user copy, so the whole call is a safe sink value. */
export function isTranslationCall(node) {
  if (!node || !ts.isCallExpression(node)) return false;
  const e = node.expression;
  if (ts.isIdentifier(e)) return e.text === 't';
  if (ts.isPropertyAccessExpression(e)) return e.name.text === 't';
  return false;
}

/**
 * The namespaces a BARE key in this particular call resolves against.
 *
 * ⚠️ Two `t`s exist in this codebase and they resolve a bare key DIFFERENTLY. A destructured
 * `const { t } = useTranslation('library')` resolves against the file's bound namespaces; the
 * module singleton `i18n.t(...)` — 205 call sites, and the shape the Story 24.19 `err.message`
 * sweep put in every hook — is bound to `defaultNS` and resolves against `common` no matter what
 * the file around it binds. Handing the file-level namespace list to both made `i18n.t('a.b', {
 * count })` in a namespaced file resolve to a name in neither the plain nor the plural set, so
 * sink (b) returned "no violation" — the same name-RESOLUTION assumption that made the whole sink
 * inert one round earlier (§ AC-10d), one call form over (Story 24.19 Step I).
 */
export function namespacesForCall(node, boundNamespaces) {
  return ts.isPropertyAccessExpression(node.expression) ? [DEFAULT_NS] : boundNamespaces;
}

/** True for function-like nodes we can resolve a helper call into. */
function isFunctionLike(node) {
  return (
    node &&
    (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node))
  );
}

/**
 * Build the file-scope symbol table used for one-hop resolution:
 *   funcs: name → function-like node (for `foo()` helper-call resolution — `function foo`,
 *          `const foo = () => …`, `const foo = function …`)
 *   vals:  name → initializer node (for bare-identifier / `OBJ[key]` resolution)
 * Name-based across the whole file (documented limitation). Walks every scope so a helper's
 * function-local `const` is resolvable too (the DurationBadge `label` case).
 */
export function buildSymbolTable(sourceFile) {
  const funcs = new Map();
  const vals = new Map();
  const visit = (node) => {
    if (ts.isFunctionDeclaration(node) && node.name) {
      funcs.set(node.name.text, node);
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      vals.set(node.name.text, node.initializer);
      if (isFunctionLike(node.initializer)) funcs.set(node.name.text, node.initializer);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return { funcs, vals };
}

/** Return-value expressions of a function-like node (its own `return`s + an expression-bodied
 * arrow), WITHOUT descending into nested functions (their returns aren't this function's). */
export function functionReturnExprs(fnNode) {
  const out = [];
  if (isFunctionLike(fnNode) && fnNode.body && !ts.isBlock(fnNode.body)) {
    out.push(fnNode.body); // `() => expr`
    return out;
  }
  const body = fnNode.body;
  if (!body) return out;
  const walk = (node) => {
    if (isFunctionLike(node)) return; // don't cross into a nested function
    if (ts.isReturnStatement(node) && node.expression) out.push(node.expression);
    ts.forEachChild(node, walk);
  };
  ts.forEachChild(body, walk);
  return out;
}

/** Prose literal chunks of a template: its head + each span's literal text. */
function templateProseChunks(node) {
  if (ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
  const chunks = [node.head.text];
  for (const span of node.templateSpans) chunks.push(span.literal.text);
  return chunks;
}

/**
 * Is `node` a PROVABLY-SAFE sink value? Recursive; `seen` guards against helper/const cycles.
 * Returns true when we can PROVE the value carries no un-extracted prose (t() call, non-prose
 * literal, boundary binding, or an all-safe helper/lookup/conditional). Anything we cannot
 * follow is treated as safe — the scanner flags only provable misses (zero false positives).
 */
export function isProvablySafe(node, symtab, seen = new Set()) {
  if (!node) return true;

  // Unwrap wrappers.
  if (ts.isParenthesizedExpression(node)) return isProvablySafe(node.expression, symtab, seen);
  if (ts.isJsxExpression(node)) return isProvablySafe(node.expression, symtab, seen);
  if (
    ts.isAsExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isTypeAssertionExpression?.(node)
  ) {
    return isProvablySafe(node.expression, symtab, seen);
  }

  // Literals.
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return !isProse(node.text) || looksLikeI18nKey(node.text);
  }
  if (ts.isTemplateExpression(node)) {
    if (templateProseChunks(node).some(isProse)) return false;
    return node.templateSpans.every((s) => isProvablySafe(s.expression, symtab, seen));
  }

  // t()/i18n.t() — the whole call is safe (the literal inside is the key).
  if (isTranslationCall(node)) return true;

  // Conditionals / logical / concatenation — every operand must be safe.
  if (ts.isConditionalExpression(node)) {
    return (
      isProvablySafe(node.whenTrue, symtab, seen) && isProvablySafe(node.whenFalse, symtab, seen)
    );
  }
  if (ts.isBinaryExpression(node)) {
    const k = node.operatorToken.kind;
    if (
      k === ts.SyntaxKind.QuestionQuestionToken ||
      k === ts.SyntaxKind.BarBarToken ||
      k === ts.SyntaxKind.AmpersandAmpersandToken ||
      k === ts.SyntaxKind.PlusToken
    ) {
      return isProvablySafe(node.left, symtab, seen) && isProvablySafe(node.right, symtab, seen);
    }
    return true; // other binary ops don't produce user copy
  }

  // Helper call — resolve a LOCAL function and check every return.
  if (ts.isCallExpression(node)) {
    const callee = node.expression;
    if (ts.isIdentifier(callee) && symtab.funcs.has(callee.text)) {
      if (seen.has(`fn:${callee.text}`)) return true; // recursion guard
      seen.add(`fn:${callee.text}`);
      return functionReturnExprs(symtab.funcs.get(callee.text)).every((r) =>
        isProvablySafe(r, symtab, seen)
      );
    }
    return true; // imported / method / unknown call — boundary
  }

  // Bare identifier — resolve a LOCAL const initializer; else it's a param/prop/import → boundary.
  if (ts.isIdentifier(node)) {
    if (symtab.vals.has(node.text)) {
      if (seen.has(`id:${node.text}`)) return true;
      seen.add(`id:${node.text}`);
      const init = symtab.vals.get(node.text);
      if (isFunctionLike(init)) return true; // a function reference, not a value
      return isProvablySafe(init, symtab, seen);
    }
    return true;
  }

  // OBJ[key] — resolve a LOCAL const object/array and check every value (dynamic index).
  if (ts.isElementAccessExpression(node)) {
    const obj = node.expression;
    if (ts.isIdentifier(obj) && symtab.vals.has(obj.text)) {
      if (seen.has(`el:${obj.text}`)) return true;
      seen.add(`el:${obj.text}`);
      const init = symtab.vals.get(obj.text);
      if (ts.isObjectLiteralExpression(init)) {
        return init.properties.every((p) =>
          ts.isPropertyAssignment(p) ? isProvablySafe(p.initializer, symtab, seen) : true
        );
      }
      if (ts.isArrayLiteralExpression(init)) {
        return init.elements.every((el) => isProvablySafe(el, symtab, seen));
      }
    }
    return true; // unknown object — boundary
  }

  // Property access (`book.title`, `styles.x`) and everything else — boundary (data, not copy).
  return true;
}

/** Line of a node's start (1-based), for reporting + inline allow-listing. */
function lineOf(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

/** Compact one-line source snippet for a violation message. */
function snippet(sourceFile, node) {
  const text = node.getText(sourceFile).replace(/\s+/g, ' ').trim();
  return text.length > 80 ? `${text.slice(0, 77)}…` : text;
}

/**
 * The callee NAME of a call expression, when the callee is a property access — covering the
 * optional-chained form (`x?.toFixed()`) and the computed form (`x['toFixed']()`) as the same
 * question, because at the AST level they are one node shape with two spellings of the name.
 * Returns undefined for a bare `f()` or anything dynamic.
 */
export function calleeMemberName(node) {
  if (!ts.isCallExpression(node)) return undefined;
  const e = node.expression;
  if (ts.isPropertyAccessExpression(e)) return e.name.text;
  if (ts.isElementAccessExpression(e)) {
    const arg = e.argumentExpression;
    if (arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)))
      return arg.text;
  }
  return undefined;
}

/**
 * The module specifier of any node that IMPORTS — a static `import`/`export … from`, a dynamic
 * `import(...)`, or a `require(...)`. Undefined for everything else. Anchoring the `date-fns` rule
 * here rather than on the call spelling is what makes an alias, a namespace import and a dynamic
 * import all answer the same question (`stack/gates-scanners.md`).
 */
export function importedModuleSpecifier(node) {
  if (
    (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
    node.moduleSpecifier &&
    ts.isStringLiteral(node.moduleSpecifier)
  ) {
    return node.moduleSpecifier.text;
  }
  if (ts.isCallExpression(node)) {
    const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
    const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';
    const arg = node.arguments?.[0];
    if ((isDynamicImport || isRequire) && arg && ts.isStringLiteral(arg)) return arg.text;
  }
  return undefined;
}

/**
 * Whether a `t(key, …)` call passes `count`, as a THREE-VALUED answer.
 *
 * ⚠️ THE THIRD VALUE IS THE WHOLE POINT (Epic-24 boundary round 2, MEDIUM — found independently by
 * two review layers). This used to return the `count` property or `undefined`, and sink (b) used
 * that as a truthiness test. That was safe there because sink (b) flags on `count` PRESENT, so
 * "options I cannot read" behaved as an under-match — its docblock says so: a false positive on a
 * correct plural is worse than the under-match.
 *
 * Sink (c) inverts the polarity: it flags on count ABSENT. Feeding it the same two-valued answer
 * turned that safe blind spot into a fail-closed FALSE POSITIVE on correct code — `t(k, opts)`,
 * `t(k, {...opts})` and `t(k, { count } satisfies X)` are all perfectly good call sites whose
 * options are not an inline object literal, and all three were reported as `plural-no-count`.
 * Reproduced against the real bundle on `quotes:quoteCount`. Nothing in the tree writes those forms
 * today, so the gate was green — and would have broken the build on the first refactor that
 * forwarded or spread an options object.
 *
 * @returns `'present'` — `count` is definitely passed.
 *          `'absent'`  — definitely NOT passed (no second argument, or a literal without it and
 *                        without a spread that could carry one).
 *          `'unknown'` — an options value this cannot read. Only a sink that flags on `'present'`
 *                        may treat it as absent; a sink that flags on absence must stay SILENT.
 */
function countOptionKind(node) {
  const opts = node.arguments?.[1];
  if (opts === undefined) return 'absent';
  if (!ts.isObjectLiteralExpression(opts)) return 'unknown';
  let sawSpread = false;
  for (const p of opts.properties) {
    if (ts.isSpreadAssignment(p)) {
      sawSpread = true;
      continue;
    }
    const n = p.name;
    const key = n && (ts.isIdentifier(n) || ts.isStringLiteral(n)) ? n.text : undefined;
    if (key === 'count') return 'present';
    // A computed key (`[k]: v`) could BE 'count' — unreadable, same class as a spread.
    if (n && ts.isComputedPropertyName(n)) sawSpread = true;
  }
  // A spread (or a computed key) may carry `count` from somewhere this cannot see.
  return sawSpread ? 'unknown' : 'absent';
}

// The escape-hatch marker test lives in `./gate-lib.mjs` — ONE implementation, ONE docblock, the
// token as an argument. The two copies (this one and `lint-layers.mjs`'s) differed only in their
// token and in which residuals each docblock admitted, while both claimed the marker "must be
// CARRIED, not MENTIONED" — so a fix landing in one left the other open. It is called below on a
// STRINGS-BLANKED line, which is what closes the last residual the copy here documented but could
// not fix (a string whose CONTENT spells the marker) and, in the other direction, stops the gate
// reddening a legitimate carve-out written beside a URL.

/**
 * Find every un-extracted display-sink violation in one file's source.
 * Returns `[{ line, kind, snippet }]`, already with `// lint-i18n-ok`-allow-listed sinks removed.
 * Pure (parse only, no fs / no Program) so the `node --test` companion asserts it directly.
 *
 * `bundleKeys` ({ plain, plural }) drives sink (b); omit it and sink (b) is inert, which is why
 * `runI18nScan` loads it fail-closed rather than tolerating an absent bundle.
 */
export function findViolations(fileName, code, bundleKeys) {
  const sourceFile = ts.createSourceFile(
    fileName,
    code,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    /\.tsx$/.test(fileName) ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const symtab = buildSymbolTable(sourceFile);
  const boundNamespaces = boundNamespacesOf(sourceFile);
  // ⚠️ SPLIT ON THE FULL JS TERMINATOR SET, NOT JUST `\n` (Epic-24 boundary, HIGH — found by both
  // gate review layers). `lineOf()` derives its numbers from TypeScript's line map, which counts a
  // lone `\r`, U+2028 and U+2029 as line terminators; `split('\n')` does not. One such character
  // anywhere above a sink shifts every later `lineOf()` ahead of this array's index, so
  // `allowedAt()` inspects the WRONG line — and the failure is fail-OPEN: a marker sitting BELOW a
  // violation suppressed it. The tree is clean of these today, which is exactly why it was
  // invisible: a paste from a browser, a PDF or a JSON round-trip introduces one routinely.
  //
  // `splitLines` and TS's line map now agree BY CONSTRUCTION rather than by two hand-written
  // regexes that happen to match: `gate-lib.mjs` derives its split from one terminator definition,
  // and TS counts the same set. (Do NOT "align" this to `lint-layers.mjs`'s form, which counts
  // terminators itself — check which side of a pair is right per file; here TS's map is.)
  //
  // Blanked STRINGS, not raw lines: the marker must be CARRIED in a comment, so a string whose
  // CONTENT spells it must not suppress, and a real carve-out sharing its line with a URL string
  // must still be found. `blankStrings` is length- AND terminator-preserving, so every index here
  // still lines up with `lineOf()`.
  const markerLines = splitLines(blankStrings(code));
  // A `// lint-i18n-ok` suppresses the sink on its OWN line (a trailing comment) or a sink directly
  // below the CONTIGUOUS COMMENT BLOCK it sits in — but never through a line of code. That last
  // restriction is what stops a trailing-comment marker on one sink's line from ALSO suppressing an
  // unrelated sink on the NEXT line (the marker line would be "the line above" for it), silently
  // hiding a real violation.
  //
  // The block form (rather than just the single line above) exists because these markers carry a
  // REASON, and a reason worth writing rarely fits on the line where the marker has to sit. Forcing
  // it to would push every carve-out toward "// lint-i18n-ok" with no justification at all, which
  // is the opposite of what a per-site deliberate decision is for. Every line walked here is
  // comment-only, so the block cannot reach across code.
  // `{/* … */}` counts: it is the ONLY way to write a comment between JSX children, so excluding it
  // made the documented block form silently inert in exactly the files that need it most — the tree
  // already carries one such marker (`LanguageChip.tsx`) that suppresses nothing (Story 24.19 Step I).
  const isCommentOnlyLine = (l) => /^\s*(\{\s*)?(\/\/|\/\*|\*)/.test(l);
  const allowedAt = (line) => {
    if (isMarkerLine(markerLines[line - 1] ?? '', 'lint-i18n-ok')) return true;
    for (let i = line - 2; i >= 0; i--) {
      const l = markerLines[i] ?? '';
      if (!isCommentOnlyLine(l)) return false; // hit code (or a blank) — the block ended
      if (isMarkerLine(l, 'lint-i18n-ok')) return true;
    }
    return false;
  };

  const violations = [];
  const flag = (node, kind) => {
    const line = lineOf(sourceFile, node);
    if (allowedAt(line)) return;
    violations.push({ line, kind, snippet: snippet(sourceFile, node) });
  };

  const visit = (node) => {
    // Sink 1 — JSX attribute whose NAME reads as display copy. Uses the same vocabulary as sinks
    // 4/5/6 (`isCopyParamName`), not the 8-name exact set: a suffix-named prop (`ctaLabel`,
    // `retryLabel`, `confirmText`, `emptyTitle`) previously belonged to no sink at all.
    // `node.name` is an Identifier for a plain attribute (`title`) and a `JsxNamespacedName` for a
    // hyphenated one, so read the text off either form. (The example that used to sit here was
    // `aria-label` — no longer a sink since Story 35.4 deleted `EXTRA_COPY_ATTRS`. The branch stays
    // because the namespaced form is a property of JSX, not of that one attribute.)
    if (ts.isJsxAttribute(node)) {
      const attrName = ts.isIdentifier(node.name) ? node.name.text : node.name.getText(sourceFile);
      if (attrName && isCopyParamName(attrName)) {
        const v = node.initializer;
        if (v && !isProvablySafe(v, symtab)) flag(node, `prop ${attrName}`);
      }
    }

    // Sink 2 — JSX text + JSX expression children (visible copy).
    if (ts.isJsxText(node)) {
      if (isProse(node.text)) flag(node, 'jsx-text');
    }
    if (
      ts.isJsxExpression(node) &&
      node.parent &&
      (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent)) &&
      node.expression &&
      !isProvablySafe(node, symtab)
    ) {
      flag(node, 'jsx-child');
    }

    // Sink 3 — object-literal property whose key is a target prop.
    if (ts.isPropertyAssignment(node)) {
      const name = node.name;
      const key = ts.isIdentifier(name)
        ? name.text
        : ts.isStringLiteral(name)
          ? name.text
          : undefined;
      // Same vocabulary widening as sink 1 — an object-literal key is the non-JSX spelling of the
      // identical question (`showAlert({ retryLabel: 'Try again' })`).
      if (key && isCopyParamName(key) && !isProvablySafe(node.initializer, symtab)) {
        flag(node, `obj-key ${key}`);
      }
    }

    // Sink 4 — a DEFAULT VALUE for a copy-bearing parameter. Covers both the destructured form
    // (`function C({ actionLabel = 'Try Again' })`) and a plain parameter (`f(label = 'Retry')`).
    if (
      (ts.isBindingElement(node) || ts.isParameter(node)) &&
      node.initializer &&
      ts.isIdentifier(node.name) &&
      isCopyParamName(node.name.text) &&
      !isProvablySafe(node.initializer, symtab)
    ) {
      flag(node, `default ${node.name.text}`);
    }

    // Sink 5 — the user-message argument of a known error constructor (`new AppError(code, msg)`).
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression)) {
      const idx = USER_MESSAGE_CTORS.get(node.expression.text);
      const arg = idx === undefined ? undefined : node.arguments?.[idx];
      if (arg && !isProvablySafe(arg, symtab)) {
        flag(node, `${node.expression.text} message`);
      }
    }

    // Sink 6 — a RETURN of un-extracted copy from a function whose name says it produces copy.
    // Flags the `return` expression itself, not the function, so the reported line is the literal.
    //
    // Unlike sinks 1-5, this sink is FUNCTION-scoped, so `// lint-i18n-ok` is honored at the
    // FUNCTION's line too (not just per-return). A name-matched non-copy function — a telemetry
    // token table, an endonym registry — is wrong as a WHOLE, and making the author repeat the
    // marker on all five arms of its switch would bury the reason it is exempt.
    if (isFunctionLike(node) || ts.isMethodDeclaration(node)) {
      const fnName = functionOwnName(node);
      if (fnName && isCopyReturningFnName(fnName) && !allowedAt(lineOf(sourceFile, node))) {
        for (const expr of functionReturnExprs(node)) {
          if (!isProvablySafe(expr, symtab)) flag(expr, `return from ${fnName}`);
        }
      }
    }

    // ── Sink (a) — a LOCALE-SENSITIVE FORMATTER outside the one sanctioned format module. ──
    // See the LOCALE_SENSITIVE_METHODS docblock: matched on the AST (callee / import specifier),
    // never on the call spelling, so an alias, a namespace import, optional chaining, a computed
    // member and a line break are all handled by construction.
    if (fileName !== FORMAT_MODULE) {
      const method = calleeMemberName(node);
      if (method && LOCALE_SENSITIVE_METHODS.has(method)) {
        flag(node, `locale-format ${method}`);
      }
      // `Intl.*` — flagged at the ACCESS itself, so `new Intl.NumberFormat(…)`,
      // `Intl.DateTimeFormat(…)` and a bare `const F = Intl.NumberFormat` are one rule. Both
      // member forms count (`Intl.NumberFormat` and `Intl['NumberFormat']`), and `globalThis.Intl`
      // is the same object by another name — the docblock claimed "however it is reached" while
      // three spellings walked past it (Story 24.19 Step G).
      const intlMember = intlMemberName(node);
      if (intlMember) flag(node, `locale-format Intl.${intlMember}`);
      const spec = importedModuleSpecifier(node);
      if (spec && isLocaleFormattingModule(spec)) {
        flag(node, `locale-format import '${spec}'`);
      }
    }

    // ── Sink (b) — `t(key, { count })` whose key declares no plural variants. ──
    // A key is plural because the CALL SITE passes `count`, and NOTHING else can see that
    // correspondence: the parity harness checks completeness only for stems already plural in the
    // base or the target, and a key that declares no variants is in neither set. So at exactly
    // one item, *"Remove all 1 books from offline storage?"* shipped green in every locale
    // (`stack/i18n.md`, epic-20 boundary R3).
    if (bundleKeys && isTranslationCall(node)) {
      const keyArg = node.arguments?.[0];
      const candidates =
        keyArg && (ts.isStringLiteral(keyArg) || ts.isNoSubstitutionTemplateLiteral(keyArg))
          ? qualifyKey(keyArg.text, namespacesForCall(node, boundNamespaces))
          : [];
      // Flag only a key we KNOW is a plain string. An unresolvable key (a variable), or one
      // absent from the base bundle, is a different defect owned by the typed-`t()` augmentation
      // and the parity suite — guessing here would just add noise they already cover.
      // With several candidate namespaces (a file binding more than one), flag only when the ones
      // that EXIST all agree the key is plain — disagreement means we cannot tell which `t` this
      // call site holds, and a false positive on a correct plural is worse than the under-match.
      const known = candidates.filter((k) => bundleKeys.plain.has(k) || bundleKeys.plural.has(k));
      // Sink (b) flags on count PRESENT, so it may treat `'unknown'` as not-present (under-match,
      // the safe direction). Sink (c) flags on count ABSENT and must therefore require `'absent'`
      // exactly — see `countOptionKind`.
      const countKind = countOptionKind(node);
      if (
        known.length &&
        countKind === 'present' &&
        known.every((k) => bundleKeys.plain.has(k) && !bundleKeys.plural.has(k))
      ) {
        flag(node, `plural-missing ${known[0]}`);
      }
      // ── Sink (c) — the INVERSE: a key that declares plural variants, called with NO `count`. ──
      // Sink (b) above checks one direction of the same correspondence and this one was never
      // written (Epic-24 boundary, MEDIUM). i18next resolves `t('k')` by looking up `k` itself —
      // it does NOT fall back to `k_other` — so for a stem that declares `_one`/`_other` and no
      // bare sibling, a call site that forgets `count` renders the RAW KEY on screen
      // (`library:removeAll`), in every locale, with no literal for the string sink to see and
      // nothing for the parity harness to notice (the stem is complete in every locale — it is the
      // CALL that is wrong). The `!plain.has(k)` half is load-bearing: a stem may legitimately
      // carry a bare variant alongside its plural ones, and there `t('k')` resolves fine.
      //
      // ⚠️ `=== 'absent'`, NEVER `!== 'present'` (Epic-24 boundary round 2, MEDIUM — two layers
      // found this independently). An options value the scan cannot read (`t(k, opts)`,
      // `t(k, {...opts})`, a computed key) is `'unknown'`, and because THIS sink flags on absence,
      // treating unknown as absent reports correct code. Sink (b) above may take that liberty; this
      // one may not. The asymmetry is the same one `gates-scanners.md` names for a differential
      // guard: flipping the polarity does not break it, it INVERTS it.
      if (
        known.length &&
        countKind === 'absent' &&
        known.every((k) => bundleKeys.plural.has(k) && !bundleKeys.plain.has(k))
      ) {
        flag(node, `plural-no-count ${known[0]}`);
      }
    }

    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return violations;
}

/** The base locale whose bundle defines what a key IS (`fallbackLng` in `i18n/index.ts`). */
export const BASE_LOCALE = 'en';
/** Locale bundle root — the base namespaces sink (b) resolves keys against. */
export const BASE_LOCALE_DIR = join(EXPO_SRC, 'i18n/locales', BASE_LOCALE);

/**
 * Load + index the base bundle, FAIL-CLOSED. A renamed locale directory, or one that has been
 * emptied, must be an ERROR — the natural bug in a gate like this is that it reports success with
 * zero keys indexed precisely when the data it reads has broken, at which point sink (b) passes
 * vacuously on every call site in the app (`stack/gates-scanners.md`).
 */
/** Where the app declares which namespaces it loads — the source of truth for the check below. */
export const RESOURCES_MODULE = join(EXPO_SRC, 'i18n/resources.ts');

/**
 * The namespaces the APP loads, read from `i18n/resources.ts`'s base-locale imports.
 *
 * Derived rather than hardcoded: a list maintained by hand here would go stale the first time a
 * namespace is added, and a stale expectation is how a completeness check quietly stops checking
 * (`stack/gates-scanners.md` — a population may not be scoped to known spellings).
 */
export function declaredNamespaces(file = RESOURCES_MODULE) {
  if (!existsSync(file)) {
    throw new Error(`lint:i18n — i18n resources module missing: ${relative(repoRoot, file)}`);
  }
  const src = readFileSync(file, 'utf8');
  const found = new Set();
  const re = new RegExp(String.raw`\./locales/${BASE_LOCALE}/([\w-]+)\.json`, 'g');
  for (const m of src.matchAll(re)) found.add(m[1]);
  if (!found.size) {
    throw new Error(
      `lint:i18n — no ${BASE_LOCALE} namespace imports found in ${relative(repoRoot, file)}; the ` +
        `resource module moved or changed shape, and this check would pass vacuously.`
    );
  }
  return [...found];
}

export function loadBaseBundleKeys(dir = BASE_LOCALE_DIR) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    throw new Error(`lint:i18n — base locale directory missing: ${relative(repoRoot, dir)}`);
  }
  const namespaces = {};
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith('.json')) continue;
    namespaces[entry.slice(0, -'.json'.length)] = JSON.parse(
      readFileSync(join(dir, entry), 'utf8')
    );
  }
  if (Object.keys(namespaces).length === 0) {
    throw new Error(`lint:i18n — base locale directory holds no namespaces: ${dir}`);
  }
  // ⚠️ FAIL CLOSED ON A MISSING *NAMESPACE*, NOT JUST A MISSING DIRECTORY (Story 24.19 Step G).
  // The three guards around this one all key on the directory as a whole, so deleting or renaming a
  // single namespace file left `namespaces` non-empty and the key count healthy — while every key
  // in that namespace became unresolvable and sink (b) stopped checking it, silently, with the gate
  // still printing OK. That is the exact shape `stack/gates-scanners.md` warns about: the natural
  // bug in a gate is reporting success when the data it reads has broken. The expected set is
  // DERIVED from what the app actually loads, so it cannot go stale on its own.
  const declared = declaredNamespaces();
  const missing = declared.filter((ns) => !(ns in namespaces));
  if (missing.length) {
    throw new Error(
      `lint:i18n — base bundle is missing ${missing.length} namespace(s) the app loads: ` +
        `${missing.join(', ')} (expected ${relative(repoRoot, dir)}/<ns>.json)`
    );
  }
  // ⚠️ AND ON AN *EMPTIED* NAMESPACE, NOT ONLY A MISSING ONE (Story 24.19 Step I). The guard above
  // asks whether the file EXISTS; a `library.json` holding `{}` — a botched translation-generation
  // run, a merge resolution that kept the wrong side — answers yes, and the whole-bundle key count
  // below stays healthy on the other namespaces while every `library:*` key silently becomes
  // unresolvable and sink (b) stops asking about that namespace at all. Same shape as the missing
  // file, one level in: a completeness guard keyed on the CONTAINER cannot see an empty MEMBER.
  const empty = Object.entries(namespaces)
    .filter(([, v]) => !v || typeof v !== 'object' || Object.keys(v).length === 0)
    .map(([ns]) => ns);
  if (empty.length) {
    throw new Error(
      `lint:i18n — base bundle namespace(s) hold no keys: ${empty.join(', ')} ` +
        `(${relative(repoRoot, dir)}/<ns>.json). Every key in them would resolve to nothing and ` +
        'the plural sink would pass vacuously.'
    );
  }
  const indexed = indexBundleKeys(namespaces);
  if (indexed.plain.size === 0) {
    throw new Error(`lint:i18n — base bundle indexed zero keys: ${dir}`);
  }
  return indexed;
}

/* ── Sink (c): THE COPY BUDGET ───────────────────────────────────────────────────────────────
 *
 * ⚠️ MEASURED IN EVERY LOCALE, NOT IN ENGLISH. Checking the authored language alone is what lets a
 * translation overflow with nothing to see it: measured on this tree at the budget's introduction,
 * French runs 1.20× English on average and 1.59× at the worst key, so English that only just fits
 * is French that does not. One number applied to every locale is what makes the English author
 * leave the translator room — it lands English near 90-100 without a second rule to remember.
 *
 * ⚠️ ONE BUDGET FOR EVERY STRING — no separate, laxer number for footnotes or dialog messages.
 * A budget that body copy alone has to meet is a budget body copy is exempt from the moment
 * somebody renames the key, and the split immediately becomes an argument about which bucket a
 * string is in. Titles, labels and buttons are far under it already and cost nothing to include;
 * long copy is the only thing the number ever bites, which is the whole point.
 *
 * Measured on the RAW string, interpolation tokens included: `{{title}}` is 11 characters here and
 * an unbounded book title on screen, so counting the token is the conservative direction.
 */

/**
 * The per-string ceiling, in characters. 120 is roughly three lines of a footnote on the narrowest
 * phone this app supports — the point past which a reader skims instead of reading.
 */
export const COPY_BUDGET = 120;

/** Every locale bundle the app ships. The population sink (c) measures. */
export const LOCALES_DIR = join(EXPO_SRC, 'i18n/locales');

/**
 * Keys allowed past `COPY_BUDGET`, each with the argument for its length.
 *
 * ⚠️ THE ENTRY HAS TO ARGUE THAT THE LENGTH IS DOING WORK — "rewriting it is awkward" is the
 * failure mode this list exists to be embarrassing about, and every entry is a hole in the budget
 * (`stack/gates-scanners.md`). Keyed by `ns:key` and NOT by locale: a string whose length earns its
 * place earns it in every language, and a per-locale entry would license a translator's padding.
 *
 * It ships EMPTY, which is the honest result and not an oversight: the sweep that introduced the
 * budget rewrote all 19 over-budget strings and found none whose length was carrying meaning the
 * short version lost. `runCopyBudgetScan` THROWS on an entry that matches no key, so a stale one
 * cannot sit here quietly exempting nothing.
 */
export const COPY_BUDGET_ALLOWLIST = new Map([]);

/**
 * Load every locale's string leaves, FAIL-CLOSED at each level a population can quietly empty.
 *
 * Returns `{ [locale]: [[ 'ns:key', value ], …] }`. The locale set is DISCOVERED, not listed —
 * a hardcoded list is how a gate stops checking the locale somebody added last week — but the
 * BASE locale is asserted present, because "discovered nothing" and "there is nothing" read the
 * same to a caller and only one of them is a clean run.
 */
export function loadLocaleStrings(dir = LOCALES_DIR) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    throw new Error(`lint:i18n — locales root missing: ${relative(repoRoot, dir)}`);
  }
  const locales = readdirSync(dir).filter((e) => statSync(join(dir, e)).isDirectory());
  if (locales.length === 0) {
    throw new Error(
      `lint:i18n — locales root holds no locale directories: ${relative(repoRoot, dir)}. The ` +
        'copy budget would measure nothing and pass vacuously (fail-closed).'
    );
  }
  if (!locales.includes(BASE_LOCALE)) {
    throw new Error(
      `lint:i18n — the base locale '${BASE_LOCALE}' is absent from ${relative(repoRoot, dir)} ` +
        `(found: ${locales.join(', ')}). The bundle root moved or was renamed.`
    );
  }
  const out = {};
  for (const locale of locales) {
    const localeDir = join(dir, locale);
    const files = readdirSync(localeDir).filter((e) => e.endsWith('.json'));
    if (files.length === 0) {
      throw new Error(`lint:i18n — locale '${locale}' holds no namespaces: ${localeDir}`);
    }
    const namespaces = {};
    for (const file of files) {
      const path = join(localeDir, file);
      try {
        namespaces[file.slice(0, -'.json'.length)] = JSON.parse(readFileSync(path, 'utf8'));
      } catch (cause) {
        // ⚠️ AN UNPARSEABLE BUNDLE IS A FAILURE, NEVER A SKIPPED FILE. Swallowing it would drop
        // that namespace out of the measured population — the exact shape where a gate reports OK
        // on the run that broke the data it reads.
        throw new Error(
          `lint:i18n — could not parse ${relative(repoRoot, path)}: ${cause.message}`,
          { cause }
        );
      }
    }
    // Only STRING leaves are copy. A non-string leaf is a different defect and `parity.test.ts`
    // owns it — but a locale that yields NO strings is this gate reading a broken tree, so the
    // floor is here rather than on the file count above.
    const strings = bundleLeaves(namespaces).filter(([, v]) => typeof v === 'string');
    if (strings.length === 0) {
      throw new Error(
        `lint:i18n — locale '${locale}' yielded zero strings from ${files.length} namespace(s). ` +
          'Every key in it would be under budget by default (fail-closed).'
      );
    }
    out[locale] = strings;
  }
  return out;
}

/**
 * The over-budget leaves of ONE locale, as `{ key, length, value }`. Pure — no fs, no allowlist.
 */
export function overBudgetLeaves(strings, budget = COPY_BUDGET) {
  return strings
    .filter(([, value]) => value.length > budget)
    .map(([key, value]) => ({ key, length: value.length, value }));
}

/** Run sink (c) over every locale bundle and return violation strings. */
export function runCopyBudgetScan(dir = LOCALES_DIR) {
  const byLocale = loadLocaleStrings(dir);

  // ⚠️ A STALE ALLOWLIST ENTRY EXEMPTS NOTHING AND SAYS IT EXEMPTS SOMETHING. Mirrors the
  // `FORMAT_MODULE` existence assertion in `main()`: a carve-out naming a key that has since been
  // renamed or deleted is a claim nothing checks, and the next reader budgets around it.
  const known = new Set(Object.values(byLocale).flatMap((s) => s.map(([key]) => key)));
  const stale = [...COPY_BUDGET_ALLOWLIST.keys()].filter((key) => !known.has(key));
  if (stale.length) {
    throw new Error(
      `lint:i18n — COPY_BUDGET_ALLOWLIST names ${stale.length} key(s) no locale defines: ` +
        `${stale.join(', ')}. Remove them — a carve-out for a key that no longer exists exempts ` +
        'nothing while reading as a decision somebody made.'
    );
  }

  const out = [];
  for (const [locale, strings] of Object.entries(byLocale)) {
    for (const { key, length, value } of overBudgetLeaves(strings)) {
      if (COPY_BUDGET_ALLOWLIST.has(key)) continue;
      const [ns, path] = key.split(/:(.*)/s);
      out.push(
        `[i18n-copy-budget] apps/expo/src/i18n/locales/${locale}/${ns}.json — \`${path}\` is ` +
          `${length} characters, over the ${COPY_BUDGET}-character copy budget. Cut it to the ` +
          `point (or move the detail behind an affordance the reader can choose): ` +
          `\`${value.slice(0, 72)}${value.length > 72 ? '…' : ''}\``
      );
    }
  }
  return out;
}

/** Run the scan over apps/expo/src and return violation strings. */
export function runI18nScan(root = EXPO_SRC) {
  const out = [];
  const bundleKeys = loadBaseBundleKeys();
  const files = collectSourceFiles(root);
  // ⚠️ A WALK THAT RETURNS NOTHING IS NOT A CLEAN RUN (Story 24.19 Step I). `main()`'s root check
  // asks only whether the directory EXISTS; an existing-but-empty root — a partial checkout, a
  // source tree moved under a different path, a walker that threw and swallowed it — walks zero
  // files and reports "OK" having asked nothing. The BUNDLE side of this gate already had exactly
  // this floor (`indexed.plain.size === 0`); the SOURCE side did not.
  if (files.length === 0) {
    throw new Error(
      `lint:i18n — scanned zero source files under ${relative(repoRoot, root)}. The root ` +
        'exists but holds no .ts/.tsx, so every sink would pass vacuously (fail-closed).'
    );
  }
  for (const file of files) {
    const relFile = relative(repoRoot, file).split('\\').join('/');
    // ⚠️ THE AC-6 CARVE-OUT IS FOR THE STRING SINKS ONLY — IT IS NOT A FILE-LEVEL OFF SWITCH
    // (Story 24.19 Step G). These files are exempt because they must render if i18n itself threw,
    // so their English literals are deliberate. That reason says nothing about FORMATTING: a
    // `date-fns` import or a `toFixed` in the root layout is the same defect there as anywhere,
    // and `continue`-ing the file switched the two new sinks off in the app's root layout without
    // anything recording it. A file outside a population is not partially checked, it is
    // unchecked — so keep the population and narrow the RULE.
    for (const v of findViolations(relFile, readFileSync(file, 'utf8'), bundleKeys)) {
      if (isFileExempted(relFile, v.kind)) continue;
      out.push(`[${tagFor(v.kind)}] ${relFile}:${v.line} — ${adviceFor(v.kind)}: \`${v.snippet}\``);
    }
  }
  return out;
}

/**
 * Report tag by sink FAMILY — the three families ask different questions and take different fixes.
 * Keyed on the `plural-` prefix, not on each kind: `plural-no-count` would otherwise have been
 * tagged `i18n-hardcoded` and sent the reader to the extraction fix (Epic-24 boundary).
 */
function tagFor(kind) {
  if (kind.startsWith('locale-format')) return 'i18n-locale-format';
  if (kind.startsWith('plural-')) return 'i18n-plural';
  return 'i18n-hardcoded';
}

function adviceFor(kind) {
  if (kind.startsWith('locale-format')) {
    return (
      `a locale-sensitive formatter (${kind.slice('locale-format '.length)}) is used outside ` +
      `\`${FORMAT_MODULE}\`. It renders the DEFAULT locale's output — English numerals, month ` +
      'names and units under translated chrome, with no literal for the string gate to see. ' +
      `Route it through \`${FORMAT_MODULE}\` (or, for a deliberate non-localized value such as a ` +
      'machine speed indicator, add `// lint-i18n-ok: <reason>`)'
    );
  }
  if (kind.startsWith('plural-missing')) {
    const key = kind.slice('plural-missing '.length);
    return (
      `\`${key}\` is passed \`count\` but declares no plural variants in the base bundle, so it ` +
      'renders the same sentence at one item as at ten ("Remove all 1 books…"). Add `_one`/' +
      '`_other` to every locale (a locale may need more — French has three cardinal categories)'
    );
  }
  if (kind.startsWith('plural-no-count')) {
    const key = kind.slice('plural-no-count '.length);
    return (
      `\`${key}\` declares plural variants (\`_one\`/\`_other\`) and no bare variant, but this ` +
      'call passes no `count` — i18next looks up the bare key, does not find it, and renders the ' +
      `RAW KEY (\`${key}\`) on screen in every locale. Pass \`{ count }\`, or add a bare \`${key}\` ` +
      'to every locale if this call site really is count-free'
    );
  }
  return (
    `un-extracted user-facing string reaches a display sink (${kind}). Render it via ` +
    "t('ns:key') / i18n.t (or, for a deliberate pre-init/boot-error carve-out, add " +
    '`// lint-i18n-ok: <reason>`)'
  );
}

function main() {
  const missing = missingRoots([['apps/expo/src', EXPO_SRC]]);
  if (missing.length > 0) {
    console.error(
      `lint:i18n — FAIL: required scan root(s) missing: ${missing.join(', ')}.\n` +
        'The gate refuses to pass when the source root cannot be scanned (fail-closed).'
    );
    // ⚠️ `process.exitCode` + `return`, NEVER `process.exit()` — Node's stderr is asynchronous
    // for a pipe on POSIX and `process.exit()` does not drain it, so under `turbo`/`| tee` the
    // violation list is truncated exactly on the run with the most output.
    process.exitCode = 1;
    return;
  }

  // Sink (a) exempts exactly one file by PATH. If that path goes stale (the module is renamed or
  // moved) the exemption silently applies to nothing — so assert the file it names is really
  // there, rather than trusting a constant no other check reads.
  if (!existsSync(join(repoRoot, FORMAT_MODULE))) {
    console.error(
      `lint:i18n — FAIL: the sanctioned format module ${FORMAT_MODULE} does not exist.\n` +
        'Sink (a) exempts that exact path; a stale constant would exempt nothing and mis-report ' +
        'the real module. Update FORMAT_MODULE in scripts/lint-i18n.mjs.'
    );
    process.exitCode = 1;
    return;
  }

  // Both scans run before either is reported, so one command names every problem rather than the
  // first family it meets — a source fix and a copy cut are different edits by different reasoning
  // and there is no reason to make them two runs.
  const violations = [...runI18nScan(), ...runCopyBudgetScan()];
  if (violations.length > 0) {
    console.error(`lint:i18n — ${violations.length} violation(s):\n`);
    for (const v of violations) console.error(`  ${v}`);
    console.error(
      '\nSee `stack/i18n.md`. Every user-facing string renders via t(); every locale-sensitive ' +
        `format goes through ${FORMAT_MODULE}; a key passed \`count\` declares plural variants; ` +
        `every string in every locale fits ${COPY_BUDGET} characters. Deliberate carve-outs are ` +
        'inline-allow-listed with `// lint-i18n-ok: <reason>`, or (for length) in ' +
        '`COPY_BUDGET_ALLOWLIST` with the argument for the length.'
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    'lint:i18n — OK (strings extracted · formats localized · plurals declared · copy in budget)'
  );
}

// Only run when invoked directly, not when imported by the companion test suite.
// `onUnknown: 'run'` — an offline gate with no side effects: the unsafe outcome is skipping
// SILENTLY, so warn loudly and run. (`'skip'` is the other direction — story 5-2 deleted its
// only caller; see `gate-lib.mjs` for when it is the right one.)
if (isMainModule({ url: import.meta.url, onUnknown: 'run', label: 'lint:i18n' })) main();
