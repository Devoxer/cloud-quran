/**
 * Self-tests for the lint:i18n AST scanner (scripts/lint-i18n.mjs).
 *
 * Run: `node --test scripts/__tests__/lint-i18n.test.mjs`
 *
 * These assert the CONVERGENCE property that regex sweeps lacked: every syntactic FORM that hides
 * a user-facing literal is caught — including the five that escaped three review rounds (ternary,
 * static shared-const, backtick-template, lookup-table→helper, conditional-helper) — while the
 * provably-safe forms (t()/i18n.t(), data bindings, t()-returning helpers, key-strings, URLs) are
 * NOT flagged. Pure helpers are tested directly on inline code strings (no fs, no subprocess).
 */

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import {
  BASE_LOCALE,
  boundNamespacesOf,
  bundleLeaves,
  COPY_BUDGET,
  COPY_BUDGET_ALLOWLIST,
  declaredNamespaces,
  FORMAT_MODULE,
  findViolations,
  I18N_EXEMPT_FILES,
  indexBundleKeys,
  isFileExempted,
  isLocaleFormattingModule,
  isProse,
  isTranslationCall,
  LOCALE_SENSITIVE_METHODS,
  LOCALES_DIR,
  loadBaseBundleKeys,
  loadLocaleStrings,
  looksLikeI18nKey,
  overBudgetLeaves,
  qualifyKey,
  runCopyBudgetScan,
  runI18nScan,
  TARGET_PROPS,
} from '../lint-i18n.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const scan = (code) => findViolations('apps/expo/src/x.tsx', code);
const kinds = (code) => scan(code).map((v) => v.kind);
const hits = (code) => scan(code).length;

// ── isProse / looksLikeI18nKey ──────────────────────────────────────────────
test('isProse: a ≥2-letter word is prose; punctuation / digits / single glyph / URL is not', () => {
  assert.equal(isProse('About Book'), true);
  assert.equal(isProse('OK'), true);
  assert.equal(isProse('5 min'), true);
  assert.equal(isProse('—'), false);
  assert.equal(isProse(':'), false);
  assert.equal(isProse('1'), false);
  assert.equal(isProse('x'), false); // single letter
  assert.equal(isProse('https://wisdomfruits.com/book/42'), false); // pure URL, not copy
  assert.equal(isProse('mailto:x@y.com'), true); // no `://` → not exempted; a bare mailto is niche
  // A sentence that CONTAINS a link is copy — only a string that is PURELY a URI is exempt.
  assert.equal(isProse('Read more at https://wisdomfruits.com'), true);
  assert.equal(isProse('https://x.com now'), true); // trailing word → not a pure URI
});

test('looksLikeI18nKey: a dotted / namespaced key is already-extracted, not raw copy', () => {
  assert.equal(looksLikeI18nKey('types.streakReminders.label'), true);
  assert.equal(looksLikeI18nKey('notifications:channels.default.description'), true);
  assert.equal(looksLikeI18nKey('common:actions.ok'), true);
  assert.equal(looksLikeI18nKey('About Book'), false); // whitespace → copy
  assert.equal(looksLikeI18nKey('OK'), false); // single segment → copy
  assert.equal(looksLikeI18nKey('FAQ'), false);
  assert.equal(looksLikeI18nKey('asc'), false); // enum, but not key-shaped either
});

test('isTranslationCall: t()/i18n.t()/props.t() are translation calls; other calls are not', () => {
  const call = (code) => {
    let found = false;
    // tiny reuse of the scanner: a JSX attr wrapping the expression tells us if it was safe.
    const v = scan(`const X = () => <A accessibilityLabel={${code}} />;`);
    found = v.length === 0; // safe → no violation → it WAS treated as a t()-call / safe value
    return found;
  };
  assert.equal(call("t('a:b')"), true);
  assert.equal(call("i18n.t('a:b')"), true);
  // sanity on the helper itself is covered structurally by the sink tests below.
  assert.equal(typeof isTranslationCall, 'function');
});

// ── the five escaped FORMS (each MUST flag) ──────────────────────────────────
test('FORM 1 — ternary of raw literals in a target prop is caught', () => {
  assert.equal(hits("const X = () => <A accessibilityLabel={on ? 'Add' : 'Remove'} />;"), 1);
});

test('FORM 2 — a static raw literal in a target prop / object key is caught', () => {
  assert.equal(hits('const X = () => <A title="Quotes" />;'), 1);
  assert.equal(hits("const o = { title: 'Quotes' };"), 1);
});

test('FORM 3 — a backtick-template literal with prose in a target prop is caught', () => {
  assert.equal(hits('const X = () => <A accessibilityLabel={`Remove ${n} filter`} />;'), 1);
});

test('FORM 4 — lookup-table → helper composition is caught (one-hop resolution)', () => {
  const code = `
    const LABELS = { a: '1 min', b: '5 min' };
    function label(k) { return \`\${LABELS[k]} summary\`; }
    const X = () => <A accessibilityLabel={label(k)} />;
  `;
  // TWO reports for ONE defect, and that is the intended behaviour since sink 6 (round 2): the
  // render site (`prop accessibilityLabel`, line 4) says WHERE the copy surfaces, and sink 6
  // (`return from label`, line 3) says WHERE the literal is written — the line you actually edit.
  // The helper is named `label`, so it matches COPY_RETURNING_FN.
  assert.equal(hits(code), 2);
  assert.deepEqual(kinds(code), ['return from label', 'prop accessibilityLabel']);
});

test('FORM 5 — conditional-branch helper function returning raw literals is caught', () => {
  const code = `
    const X = () => {
      const label = () => { if (e) return 'Retry'; return 'Play audio'; };
      return <A accessibilityLabel={label()} />;
    };
  `;
  // Sink 6 reports EACH un-extracted branch at its own line (see FORM 4's note on the pairing) —
  // 'Retry' and 'Play audio' are two separate edits, so two reports, plus the render site.
  assert.equal(hits(code), 3);
  assert.deepEqual(kinds(code), [
    'return from label',
    'return from label',
    'prop accessibilityLabel',
  ]);
});

// ── provably-safe forms (must NOT flag) ──────────────────────────────────────
test('SAFE — a t()/i18n.t() call in a target prop is not flagged', () => {
  assert.equal(hits("const X = () => <A accessibilityLabel={t('a:b')} />;"), 0);
  assert.equal(hits("const X = () => <A accessibilityLabel={i18n.t('a:b')} />;"), 0);
});

test('SAFE — a conditional / ?? of t() calls is not flagged', () => {
  assert.equal(hits("const X = () => <A accessibilityLabel={on ? t('a:b') : t('a:c')} />;"), 0);
  assert.equal(hits("const X = () => <A accessibilityLabel={label ?? t('a:b')} />;"), 0);
});

test('SAFE — a helper whose every return is i18n.t() is not flagged (ShuffleRepeatControls case)', () => {
  const code = `
    function label(m) {
      switch (m) { case 'off': return i18n.t('p:off'); default: return i18n.t('p:on'); }
    }
    const X = () => <A accessibilityLabel={label(m)} />;
  `;
  assert.equal(hits(code), 0);
});

test('SAFE — a pure data binding (prop / member access) is not flagged', () => {
  assert.equal(hits('const X = () => <A title={book.title} />;'), 0);
  assert.equal(hits('const X = ({ label }) => <A accessibilityLabel={label} />;'), 0);
});

test('SAFE — a key-string value (blessed key-table) is not flagged', () => {
  assert.equal(hits("const o = { label: 'types.streakReminders.label' };"), 0);
  assert.equal(hits("const o = { description: 'notifications:channels.x.description' };"), 0);
});

test('SAFE — a URL / deep-link template is not flagged', () => {
  const code = `
    const deepLink = \`https://wisdomfruits.com/book/\${id}\`;
    const msg = t('b:share', { title });
    const o = { message: \`\${msg}\\n\${deepLink}\` };
  `;
  assert.equal(hits(code), 0);
});

test('SAFE — a non-prose literal (digits / punctuation) in a target prop is not flagged', () => {
  assert.equal(hits('const X = () => <A title="12:00" />;'), 0);
  assert.equal(hits('const X = () => <A accessibilityLabel="—" />;'), 0);
});

// ── JSX text + expression children ───────────────────────────────────────────
test('JSX text — prose text nodes are caught; interpolated t()/data is not', () => {
  assert.equal(hits('const X = () => <Text>Something went wrong</Text>;'), 1);
  assert.equal(hits("const X = () => <Text>{t('a:b')}</Text>;"), 0);
  assert.equal(hits('const X = () => <Text>{count}</Text>;'), 0);
});

// ── allow-list ───────────────────────────────────────────────────────────────
test('allow-list — `// lint-i18n-ok` on the line above suppresses the sink', () => {
  const code = [
    'const X = () => (',
    '  // lint-i18n-ok: deliberate',
    '  <A accessibilityLabel="Try again" />',
    ');',
  ].join('\n');
  assert.equal(hits(code), 0);
  // …and without the marker it fires.
  assert.equal(hits('const X = () => <A accessibilityLabel="Try again" />;'), 1);
});

test('allow-list — a trailing-comment marker suppresses ONLY its own sink, not the next line', () => {
  // The marker sits at the END of the first sink's line (suppresses it), but the SECOND sink one
  // line below is unrelated and MUST still fire — a `lint-i18n-ok` line must not leak downward.
  const code = [
    'const X = () => (',
    '  <>',
    '    <A title="First one" /> {/* lint-i18n-ok: deliberate */}',
    '    <A title="Second one" />',
    '  </>',
    ');',
  ].join('\n');
  assert.equal(hits(code), 1); // only the SECOND sink; the first is suppressed on its own line
  // A comment-only marker line above a sink still suppresses that sink (ergonomics preserved).
  const above = [
    'const X = () => (',
    '  // lint-i18n-ok: deliberate',
    '  <A title="Only one" />',
    ');',
  ].join('\n');
  assert.equal(hits(above), 0);
});

// ── config surfaces ──────────────────────────────────────────────────────────
test('TARGET_PROPS covers the AC3 display-prop list', () => {
  for (const p of [
    'accessibilityLabel',
    'accessibilityHint',
    'title',
    'label',
    'placeholder',
    'message',
    'subtitle',
    'description',
  ]) {
    assert.ok(TARGET_PROPS.has(p), `expected TARGET_PROPS to include ${p}`);
  }
});

test('I18N_EXEMPT_FILES names exactly the two AC6 pre-init carve-out files', () => {
  assert.equal(I18N_EXEMPT_FILES.size, 2);
  assert.ok(I18N_EXEMPT_FILES.has('apps/expo/src/components/ui/ErrorBoundary.tsx'));
  assert.ok(I18N_EXEMPT_FILES.has('apps/expo/src/app/_layout.tsx'));
});

/**
 * ⚠️ THE CARVE-OUT IS SCOPED TO THE STRING SINKS — it is NOT a file-level off switch (Step G).
 * It used to `continue` the whole file before `findViolations` ran, so the two formatting sinks
 * were silently dead in the app's ROOT layout, while the module docblock asserted that exactly one
 * path was exempt. A file outside a population is not partially checked, it is unchecked.
 */
test('isFileExempted: an exempt file is exempt from the STRING sinks only, never (a)/(b)', () => {
  const exempt = 'apps/expo/src/app/_layout.tsx';
  // Its deliberate pre-init English literals stay suppressed…
  assert.equal(isFileExempted(exempt, 'jsx-text'), true);
  assert.equal(isFileExempted(exempt, 'prop title'), true);
  assert.equal(isFileExempted(exempt, 'obj-key message'), true);
  // …and a formatting or plural defect in the same file is still a violation.
  assert.equal(isFileExempted(exempt, 'locale-format toFixed'), false);
  assert.equal(isFileExempted(exempt, "locale-format import 'date-fns'"), false);
  assert.equal(isFileExempted(exempt, 'plural-missing library:offline.deleteAllTitle'), false);
  // A non-exempt file is never suppressed by this rule at all.
  assert.equal(isFileExempted('apps/expo/src/x.tsx', 'jsx-text'), false);
});

test('kind labels identify the sink type (prop / jsx-text / obj-key)', () => {
  assert.deepEqual(kinds('const X = () => <A title="Quotes" />;'), ['prop title']);
  assert.deepEqual(kinds('const X = () => <Text>Hello there</Text>;'), ['jsx-text']);
  assert.deepEqual(kinds("const o = { message: 'Hello there' };"), ['obj-key message']);
});

// ── Sink 4: default parameter values (epic-20 boundary) ─────────────────────
// REGRESSION. `ErrorView`'s `actionLabel = 'Try Again'` shipped live on three quiz screens for
// the whole of Epic 20: at the render site the value is a bare parameter identifier, which
// value-resolution correctly calls a safe boundary binding — but for a DEFAULT the writer IS
// this site, so no sink ever looked at it. Both these cases were RED before sink 4 existed.
test('FORM 6 — a raw literal DEFAULT for a copy-bearing param is caught (destructured)', () => {
  assert.deepEqual(
    kinds("function C({ actionLabel = 'Try Again' }) { return <A label={actionLabel} />; }"),
    ['default actionLabel']
  );
});

test('FORM 6 — the same default as a plain (non-destructured) parameter is caught', () => {
  assert.deepEqual(kinds("function f(message = 'Sign up to continue') { return message; }"), [
    'default message',
  ]);
});

test('SAFE — a t()-resolved default is not flagged', () => {
  assert.deepEqual(
    hits("function C({ actionLabel = t('common:actions.tryAgain') }) { return actionLabel; }"),
    0
  );
});

test('SAFE — a non-copy param name keeps its prose-looking default (testID / icon are not copy)', () => {
  // `isProse` is true for both of these, so matching on prose-ness alone would bury the gate in
  // noise. Sink 4 matches on the NAME — this is the case that makes that necessary.
  assert.deepEqual(
    hits(
      "function C({ testID = 'error-view', icon = 'warning-outline' }) { return testID + icon; }"
    ),
    0
  );
});

test('sink 4 matches copy-bearing names by suffix, not by an enumerated prop list', () => {
  for (const name of [
    'actionLabel',
    'emptyMessage',
    'headerTitle',
    'helperText',
    'inputPlaceholder',
  ]) {
    assert.deepEqual(
      hits(`function C({ ${name} = 'Some real copy' }) { return ${name}; }`),
      1,
      `expected ${name} to be treated as copy-bearing`
    );
  }
});

// ── Sink 5: user-message constructor arguments (epic-20 boundary) ───────────
// REGRESSION. Ten `new AppError(code, 'raw English')` sites in lib/contentRead.ts and
// lib/accountApi.ts rendered straight into the play / read / quiz / delete-account error UI while
// `lint:i18n` reported OK — a string ARGUMENT to a non-`t` call was not a sink in any of 1-3.
test('FORM 7 — a raw literal user message in `new AppError(code, msg)` is caught', () => {
  assert.deepEqual(kinds("throw new AppError('NETWORK', 'Could not reach the server.');"), [
    'AppError message',
  ]);
});

test('SAFE — an i18n.t() user message in `new AppError` is not flagged', () => {
  assert.deepEqual(hits("throw new AppError('NETWORK', i18n.t('common:errors.network'), err);"), 0);
});

test('sink 5 reads the MESSAGE argument, not the error code', () => {
  // The code is arg 0 and is an identifier-ish literal, never copy — flagging it would make the
  // gate unusable. Only arg 1 is a display sink.
  assert.deepEqual(
    hits("throw new AppError('PREMIUM_REQUIRED', i18n.t('book:errors.premiumRequired'));"),
    0
  );
});

// ── Sink 6: copy-returning helper functions (epic-20 boundary, review ROUND 2) ───────────
// REGRESSION, and the second recurrence of one defect class. Round 1 added sinks 4 and 5 for
// "a literal nobody owns at the render site" and its own docblock predicted where the gate would
// next under-match. Round 2 found the class alive in a third shape: `lib/authErrors.ts`
// (13 English sentences into the sign-in error banner, every platform, live the whole epic) and
// `lib/purchases-web.ts` (10 more, whose NATIVE twin 20.2 had already extracted). Inside the
// helper there is no JSX, no object literal, no copy-bearing default and no `new AppError`; at the
// render site the value is a boundary binding from an imported call. No sink owned the literal.

test('FORM 8 — a raw literal returned from a `…Message` helper is caught', () => {
  assert.deepEqual(
    kinds("function getAuthErrorMessage(e) { return 'Too many attempts. Please wait a moment.'; }"),
    ['return from getAuthErrorMessage']
  );
});

test('FORM 8 — the arrow / `const` form is caught too', () => {
  assert.deepEqual(
    hits("const getWebErrorMessage = (c) => { return 'Network error. Please try again.'; };"),
    1
  );
});

test('FORM 8 — an expression-bodied arrow is caught', () => {
  assert.deepEqual(hits("const getFooterText = () => 'All rights reserved.';"), 1);
});

test('FORM 8 — an object / class method is caught', () => {
  assert.deepEqual(hits("const o = { getFooterText() { return 'All rights reserved.'; } };"), 1);
});

test('SAFE — a t()-resolved return from a copy-named helper is not flagged', () => {
  assert.deepEqual(
    hits("function getAuthErrorMessage(e) { return i18n.t('auth:errors.unknown'); }"),
    0
  );
});

test('SAFE — every arm of a t()-resolved switch is clean', () => {
  assert.deepEqual(
    hits(`function getErrorMessage(c) {
      switch (c) {
        case 1: return i18n.t('subscription:errors.network');
        default: return i18n.t('subscription:errors.purchaseFailed');
      }
    }`),
    0
  );
});

test('sink 6 does NOT attribute a NESTED function’s return to the outer copy-named one', () => {
  // `functionReturnExprs` stops at a nested function: the inner literal belongs to `pick`, whose
  // own name carries no copy signal. Attributing it outward would flag every callback in the file.
  assert.deepEqual(
    hits("function getBannerText() { const pick = () => 'internal-token'; return i18n.t('a:b'); }"),
    0
  );
});

test('sink 6 ignores a function whose name carries no copy signal', () => {
  // Documented limitation: this sink is NAME-driven. `unrelatedHelper` returning prose is not
  // flagged — the trade is deliberate (see COPY_RETURNING_FN), since flagging every string-
  // returning function in the app would bury the gate.
  assert.deepEqual(hits("function unrelatedHelper() { return 'This is prose.'; }"), 0);
});

test('sink 6 honors `// lint-i18n-ok` at the FUNCTION line, not just per-return', () => {
  // This sink is function-scoped, so a name-matched non-copy function (a telemetry-token table
  // like `deviceTypeLabel`, an endonym registry like `uiLanguageLabel`) is exempt as a WHOLE.
  // Requiring the marker on all five arms of its switch would bury the reason it is exempt.
  assert.deepEqual(
    hits(
      '// lint-i18n-ok: analytics dimension, never rendered\n' +
        "function deviceTypeLabel() { return 'phone'; }"
    ),
    0
  );
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// Sink (a) — LOCALE-SENSITIVE FORMATTING outside the one sanctioned format module (Story 24.19).
//
// The class sinks 1-6 structurally cannot see: there is no literal, because the English is
// manufactured at runtime by a library's default locale. Every case here is anchored on the AST
// (callee / import specifier), which is what makes the evasions below fail BY CONSTRUCTION rather
// than by a spelling list that has to be widened every review round.
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('sink a: every locale-sensitive method is flagged outside the format module', () => {
  for (const m of LOCALE_SENSITIVE_METHODS) {
    assert.deepEqual(hits(`export const a = (x) => x.${m}(1);`), 1, m);
  }
});

/**
 * ⚠️ THE LOOP ABOVE CANNOT CATCH A DELETION FROM THE SET — it derives its cases FROM the thing
 * under test, so removing `localeCompare` removes its own assertion and the suite stays green with
 * one test fewer (`stack/gates-scanners.md` § "a coverage assertion whose reference set derives
 * from the thing under test is a tautology"). `localeCompare` is in this set precisely because the
 * first cut omitted it and two live sites shipped; the test written to memorialize that miss could
 * not have caught it a second time. This pins the CONTENTS (Story 24.19 Step I).
 */
test('sink a: the method set is pinned by name, so a deletion reds the suite', () => {
  assert.deepEqual([...LOCALE_SENSITIVE_METHODS].sort(), [
    'localeCompare',
    'toDateString',
    'toFixed',
    'toLocaleDateString',
    'toLocaleLowerCase',
    'toLocaleString',
    'toLocaleTimeString',
    'toLocaleUpperCase',
    'toTimeString',
    'toUTCString',
  ]);
});

/**
 * `Date`'s own English-manufacturing methods. `d.toDateString()` → "Mon Aug 04 2026": an English
 * weekday and month name produced at runtime with no literal, which is the whole class sink (a)
 * exists for. Named before an in-tree site exists rather than after, the same call `localeCompare`
 * had to be added for (Story 24.19 Step I).
 */
test('sink a: Date’s toDateString / toTimeString / toUTCString manufacture English too', () => {
  assert.deepEqual(hits('export const a = (d) => d.toDateString();'), 1);
  assert.deepEqual(hits('export const b = (d) => d.toTimeString();'), 1);
  assert.deepEqual(hits('export const c = (d) => d.toUTCString();'), 1);
  // …and the sanctioned home is still the only exemption.
  assert.equal(
    findViolations(FORMAT_MODULE, 'export const a = (d) => d.toDateString();').length,
    0
  );
});

test('sink a: the format module ITSELF is exempt — it is where these belong', () => {
  const inModule = (code) => findViolations(FORMAT_MODULE, code).length;
  assert.equal(inModule('export const a = (x) => x.toFixed(1);'), 0);
  assert.equal(inModule("export const b = (d) => d.toLocaleDateString('fr');"), 0);
  assert.equal(inModule("export const c = new Intl.NumberFormat('fr');"), 0);
  assert.equal(inModule("import { format } from 'date-fns';"), 0);
  // …and the exemption is by PATH, so a look-alike elsewhere is still caught.
  assert.equal(
    findViolations('apps/expo/src/lib/format2.ts', 'export const a = (x) => x.toFixed(1);').length,
    1
  );
});

test('sink a: OPTIONAL CHAINING and a COMPUTED member are the same node shape, not two spellings', () => {
  // `x?.toFixed(1)` and `x['toFixed'](1)` each defeat a source-text scan for `.toFixed(`.
  assert.deepEqual(hits('export const a = (x) => x?.toFixed(1);'), 1);
  assert.deepEqual(hits("export const b = (x) => x['toFixed'](1);"), 1);
});

test('sink a: Intl.* is flagged however it is reached', () => {
  assert.deepEqual(hits("export const a = new Intl.NumberFormat('en');"), 1);
  assert.deepEqual(hits("export const b = Intl.DateTimeFormat('en').format(d);"), 1);
  // Not called at all — a captured reference is the same escape one hop later.
  assert.deepEqual(hits('export const C = Intl.NumberFormat;'), 1);
  // ⚠️ Three spellings the claim "however it is reached" did NOT cover until Step G — the rule
  // matched only a property access on the bare identifier `Intl`, while it already handled the
  // computed-member form for METHODS. A gate that applies its own doctrine inconsistently is one
  // find-and-replace away from being wrong, and the docblock asserted the coverage either way.
  assert.deepEqual(hits("export const d = new Intl['NumberFormat']('fr');"), 1);
  assert.deepEqual(hits("export const e = new globalThis.Intl.NumberFormat('fr');"), 1);
  assert.deepEqual(hits("export const f = globalThis.Intl['DateTimeFormat']('fr');"), 1);
  // The same doctrine one level out: the OBJECT reached by computed member, not just the member.
  // Handling `Intl['X']` while missing `globalThis['Intl'].X` is the inconsistency this rule keeps
  // being caught by (Story 24.19 Step I).
  assert.deepEqual(hits("export const g = new globalThis['Intl'].NumberFormat('fr');"), 1);
});

/**
 * ⚠️ THE FORMS THIS RULE DOES NOT REACH, ASSERTED AS THE LIMITATION THEY ARE. Renaming the object
 * before use needs scope tracking this scanner deliberately does not do. They are pinned here so
 * the behaviour is a recorded decision rather than a surprise, and so the docblock's Known-
 * limitations bullet cannot drift from the code: the previous docblock claimed "however it is
 * reached" while these walked past it, which is the re-openable-claim defect, not the gap itself
 * (Story 24.19 Step I). There is no in-tree site for either.
 */
test('sink a: a RENAMED Intl is a documented limitation, not a claimed catch', () => {
  assert.deepEqual(
    hits("const { NumberFormat } = Intl; export const a = new NumberFormat('en');"),
    0
  );
  assert.deepEqual(hits("const I = Intl; export const b = new I.NumberFormat('en');"), 0);
});

/**
 * ⚠️ COLLATION IS LOCALE-SENSITIVE RENDERING (Story 24.19 Step G). Two live sites shipped past the
 * first cut of `LOCALE_SENSITIVE_METHODS`, which named only the formatters the story's inventory
 * happened to contain: both resolved their labels in the APP language and then ordered them with a
 * bare `localeCompare()`, i.e. the DEVICE's locale. Same class as the rest — no literal to see, the
 * wrong locale supplied by a default.
 */
test('sink a: a bare localeCompare / toLocale{Upper,Lower}Case is flagged like any other formatter', () => {
  assert.deepEqual(hits('export const a = (x, y) => x.localeCompare(y);'), 1);
  assert.deepEqual(hits('export const b = (s) => s.toLocaleUpperCase();'), 1);
  assert.deepEqual(hits('export const c = (s) => s.toLocaleLowerCase();'), 1);
  // The sanctioned home is still the only exemption.
  assert.equal(
    findViolations(FORMAT_MODULE, 'export const a = (x, y) => x.localeCompare(y);').length,
    0
  );
});

test('sink a: `date-fns` is anchored on the IMPORT SPECIFIER, so every binding form is caught', () => {
  // ⚠️ THE POINT OF THE ANCHOR. Each of these defeats a scan for the call spelling `format(`;
  // none can defeat the import, because a binding cannot be USED without being NAMED there.
  assert.deepEqual(hits("import { format } from 'date-fns';"), 1);
  assert.deepEqual(hits("import { format as fmt } from 'date-fns';"), 1);
  assert.deepEqual(hits("import * as df from 'date-fns';"), 1);
  assert.deepEqual(hits("import 'date-fns';"), 1);
  assert.deepEqual(hits("export { format } from 'date-fns';"), 1);
  assert.deepEqual(hits("const { format } = await import('date-fns');"), 1);
  assert.deepEqual(hits("const df = require('date-fns');"), 1);
  // Sub-path imports too — `date-fns/locale/fr` is the shape a "just add the locale" fix reaches for.
  assert.deepEqual(hits("import { fr } from 'date-fns/locale';"), 1);
  assert.equal(isLocaleFormattingModule('date-fns'), true);
  assert.equal(isLocaleFormattingModule('date-fns/locale/fr'), true);
  // ⚠️ The FAMILY, not the one package the app happened to depend on: `date-fns-tz` re-exports the
  // same locale-defaulting `format`, and `@date-fns/tz` is its scoped successor. Matching only
  // `date-fns` would let a one-word dependency swap re-open the class (Story 24.19 Step I).
  assert.equal(isLocaleFormattingModule('date-fns-tz'), true);
  assert.equal(isLocaleFormattingModule('@date-fns/tz'), true);
  assert.deepEqual(hits("import { formatInTimeZone } from 'date-fns-tz';"), 1);
  // An unrelated module that merely starts with the same letters is NOT a match — the rule is
  // anchored on the package boundary, not on a prefix.
  assert.equal(isLocaleFormattingModule('date-fnsy'), false);
  assert.equal(isLocaleFormattingModule('@/lib/format'), false);
});

test('sink a: ordinary code is untouched — no false positive from a same-named property', () => {
  // `toFixed` is matched as a CALLEE, so a property merely named that is not a call.
  assert.deepEqual(hits('export const a = { toFixed: 1 };'), 0);
  assert.deepEqual(hits('export const b = (x) => x.toFixedWidth(1);'), 0);
  assert.deepEqual(hits('export const c = (x) => Math.round(x * 100) / 100;'), 0);
  assert.deepEqual(hits("export const d = (x) => x.padStart(2, '0');"), 0);
  // A local identifier called `Intl` is not the global — but flagging it is the FAIL-SAFE
  // direction and takes the same inline marker, so it is deliberately not special-cased.
});

test('sink a: an inline `// lint-i18n-ok` carves out a deliberate non-localized value', () => {
  assert.deepEqual(hits('export const a = (x) => x.toFixed(1); // lint-i18n-ok: machine value'), 0);
  assert.deepEqual(
    hits('// lint-i18n-ok: machine value\nexport const a = (x) => x.toFixed(1);'),
    0
  );
});

test('the marker is honored anywhere in the CONTIGUOUS comment block above, never through code', () => {
  // A carve-out carries a REASON, and a reason worth writing rarely fits on one line. Every line
  // walked is comment-only, so the block cannot reach across a line of code.
  assert.deepEqual(
    hits(
      '// lint-i18n-ok: the store formats this price, not the app.\n' +
        '// Routing it through the format module would render "3,33 €" beside a "$39.99" price.\n' +
        'export const a = (x) => x.toFixed(2);'
    ),
    0
  );
  // ⚠️ THE NEGATIVE CASE. A marker separated from the sink by real code must NOT suppress it —
  // otherwise one carve-out silently covers every violation written below it.
  assert.deepEqual(
    hits(
      '// lint-i18n-ok: this one is fine\n' +
        'export const a = (x) => x.toFixed(2);\n' +
        'export const b = (y) => y.toFixed(3);'
    ),
    1
  );
  // …and a blank line ends the block, so a stale marker cannot drift onto later code.
  assert.deepEqual(hits('// lint-i18n-ok: stale\n\nexport const a = (x) => x.toFixed(2);'), 1);
});

/**
 * ⚠️ PROSE THAT MENTIONS THE MARKER IS NOT A CARVE-OUT (Story 24.19 Step I). The predecessor tested
 * the raw line for `/lint-i18n-ok/` with no anchoring, so a docblock EXPLAINING the convention
 * switched the gate off for whatever it sat above — and this repo writes exactly that sentence in
 * `lib/format.ts` and in the scanner's own header. A gate whose off switch can be typed by accident
 * in prose is not fail-closed. The marker must sit at the head of a comment and carry its `:`,
 * which also makes the reason mandatory rather than merely encouraged.
 */
test('the marker must CARRY the escape hatch, not merely mention it', () => {
  const explains =
    '/**\n * Deliberate carve-outs are marked with `// lint-i18n-ok: <reason>`.\n */\n' +
    'export const a = (x) => x.toFixed(1);';
  assert.deepEqual(hits(explains), 1);
  // ⚠️ THE FIXTURE THAT ACTUALLY REDS THE ROUND-1 IMPLEMENTATION (Epic-24 boundary, HIGH).
  // Both cases above are forms the round-1 regex already rejected: the first backtick-quotes the
  // marker (a backtick is not in its `(?:^|\s|\{)` prefix class) and the second has no comment
  // opener immediately before the token. Neither is the shape that defeated it — an UN-BACKTICKED
  // prose mention, where the space before `//` satisfies the prefix class. That form suppressed a
  // real violation below it, so this test named a guarantee it could not check. The in-tree
  // mentions survived only by the accident of being backtick-quoted.
  const unquoted =
    '/**\n * Deliberate carve-outs use // lint-i18n-ok: reason\n */\n' +
    'export const a = (x) => x.toFixed(1);';
  assert.deepEqual(hits(unquoted), 1);
  // The same prose inside a LINE comment, which has no leading `*` to anchor on.
  assert.deepEqual(
    hits('// Carve-outs use // lint-i18n-ok: reason\nexport const a = (x) => x.toFixed(1);'),
    1
  );
  // A sentence that names the marker mid-line is prose too, however it is punctuated.
  assert.deepEqual(hits('// see lint-i18n-ok: below\nexport const a = (x) => x.toFixed(1);'), 1);
  // A bare marker with no reason no longer suppresses — the reason IS the deliberate decision.
  assert.deepEqual(hits('export const a = (x) => x.toFixed(1); // lint-i18n-ok'), 1);
  // The real forms all still work, including the block-comment and JSX spellings in the tree.
  assert.deepEqual(hits('/* lint-i18n-ok: reason */\nexport const a = (x) => x.toFixed(1);'), 0);
  assert.deepEqual(
    hits('/**\n * lint-i18n-ok: reason\n */\nexport const a = (x) => x.toFixed(1);'),
    0
  );
  assert.deepEqual(
    hits(
      'export const A = () => (\n  <T>\n    {/* lint-i18n-ok: reason */}\n    {x.toFixed(1)}\n  </T>\n);'
    ),
    0
  );
});

/**
 * ⚠️ THE MARKER LOOKUP AND THE LINE NUMBERS MUST USE ONE TERMINATOR SET (Epic-24 boundary, HIGH).
 *
 * `lineOf()` derives its numbers from TypeScript's line map, which counts a lone `\r`, U+2028 and
 * U+2029 as line terminators. The raw-line array was built with `split('\n')`, which does not — so
 * one such character anywhere above a sink shifted every later violation's computed line by one and
 * `allowedAt()` inspected the WRONG raw line. The direction that matters is fail-OPEN: a carve-out
 * sitting BELOW a violation silently suppressed it.
 *
 * These characters must be written as `\u` escapes: a literal U+2028 terminates the JS statement it
 * lands in, which is also why a file carrying one is easy to introduce and hard to see.
 */
test('a U+2028 above a sink does not let a marker BELOW it suppress the violation', () => {
  const LS = '\u2028';
  const withSeparator =
    `export const s = "a${LS}b";\n` +
    'export const a = (x) => x.toFixed(1);\n' +
    '// lint-i18n-ok: an unrelated carve-out, BELOW the violation';
  const control =
    'export const s = "ab";\n' +
    'export const a = (x) => x.toFixed(1);\n' +
    '// lint-i18n-ok: an unrelated carve-out, BELOW the violation';

  // The separator must not change the verdict — that equality IS the property.
  assert.deepEqual(hits(withSeparator), hits(control));
  assert.deepEqual(hits(withSeparator), 1);
});

test('a genuine carve-out still suppresses when a U+2028 sits earlier in the file', () => {
  const LS = '\u2028';
  const code =
    `export const s = "a${LS}b";\n` +
    '// lint-i18n-ok: deliberate\n' +
    'export const a = (x) => x.toFixed(1);';
  assert.deepEqual(hits(code), 0);
});

/**
 * ⚠️ SINKS 1 AND 3 USE THE SAME VOCABULARY AS SINKS 4/5/6 (Epic-24 boundary, HIGH).
 *
 * They matched the 8-name EXACT set while the later sinks trusted the SUFFIX vocabulary, so a
 * suffix-named copy prop belonged to no sink at all. All five names below are live JSX attributes
 * in this tree, and a component declaring one with no default (so sink 4 never fires) plus a call
 * site passing a raw literal was completely unowned.
 */
test('a suffix-named JSX copy prop is a display sink', () => {
  for (const prop of ['ctaLabel', 'actionLabel', 'confirmText', 'emptyTitle', 'retryLabel']) {
    assert.deepEqual(hits(`export const A = () => <EmptyState ${prop}="Get started" />;`), 1, prop);
  }
});

/**
 * ⚠️ AN EVENT-HANDLER NAME IS NEVER A DISPLAY SINK, AND THIS IS A SHAPE, NOT A WORD LIST.
 *
 * `COPY_PARAM_SUFFIX` ends in `Text$`, so `onChangeText` classified as user-facing copy across 15
 * files. Those passed only because a function VALUE is provably safe — the gate was asking a
 * question it has no business asking and getting away with it by accident. The negative case is
 * the point: `onChangeText` must be 0 while a real sink is still 1, and `onboardingTitle` proves
 * the guard is anchored on `on` + a CAPITAL rather than on the two letters.
 *
 * MUTATION RECIPE: delete the `HANDLER_NAME_RE` early return in `isCopyParamName`. The first
 * assertion reds; the rest stay green, which is why they are in the same test.
 */
test('an event-handler name is not a display sink, but a real sink still is', () => {
  // ⚠️ The value must be PROSE. `"x"` is a single letter, so `isProse` is false and the case
  // passes with the guard deleted — the fixture, not the guard, would be doing the work.
  assert.deepEqual(
    hits('export const A = () => <TextInput onChangeText="Type your name here" />;'),
    0
  );
  assert.deepEqual(
    hits('export const A = () => <EmptyState ctaLabel="Type your name here" />;'),
    1
  );
  assert.deepEqual(
    hits('export const A = () => <Onboarding onboardingTitle="Welcome aboard" />;'),
    1
  );
});

/**
 * The `alt` / `aria-label` entry is DELETED, and this pins the deletion so a future round does not
 * re-add it on the same speculative reasoning. It policed copy-bearing WEB attributes on the
 * grounds that the app ships an `+html.tsx` surface — but the tree has no writer for either (zero
 * `alt=` attributes; the only two `aria-label` occurrences are a CSS selector string and a comment,
 * both inside `+html.tsx` itself).
 *
 * RE-ADOPT TRIGGER: a real `alt=` or `aria-label=` JSX writer landing in `apps/expo/src`. Add the
 * entry back in the same commit as the writer, and replace this test with the positive one.
 */
test('alt / aria-label are NOT sinks — the entry had no writer in the tree', () => {
  assert.deepEqual(hits('export const A = () => <img alt="A picture of a book" />;'), 0);
  assert.deepEqual(hits('export const A = () => <button aria-label="Close dialog" />;'), 0);
});

/**
 * The carve-out marker is read from a STRINGS-BLANKED line — the same shared helper the layers
 * gate uses, with the token as an argument. Both directions were live here too.
 *
 * MUTATION RECIPE: `splitLines(blankStrings(code))` → `splitLines(code)` in `findViolations`.
 * Both assertions red.
 */
test('a carve-out beside a URL counts; one spelled inside a string does not', () => {
  // Direction 1 — a legitimate carve-out whose line also holds a `//` inside a string. The raw
  // form took THAT as the line's comment opener and reddened a correctly-carved-out tree.
  assert.deepEqual(
    hits(
      'export const A = () => <Text title="Read at https://x.com now" />; // lint-i18n-ok: link copy'
    ),
    0
  );
  // Direction 2 — the fail-open mirror: a string whose CONTENT spells the marker suppressed a
  // real violation on the same line.
  assert.deepEqual(
    hits(`export const A = () => <Text title="Hello world" id={'// lint-i18n-ok: x'} />;`),
    1
  );
});

test('a suffix-named OBJECT KEY is the same sink in non-JSX spelling', () => {
  assert.deepEqual(hits("export const x = showAlert({ retryLabel: 'Try again' });"), 1);
});

/**
 * ⚠️ THE WIDENING'S OWN TRAP. `COPY_PARAM_SUFFIX` was case-INSENSITIVE, so `text$` matched
 * `context` — and `captureException(err, { context: 'stats' })` is a telemetry key that is never
 * user-facing. Widening sinks 1/3 to that vocabulary turned every occurrence into a false
 * positive. The suffix now has to start where a word starts. (No count: a hand-maintained census
 * in a docblock is a universality claim with a decimal point, and nothing maintains it.)
 */
test('a name that merely CONTAINS a copy word is not a sink', () => {
  for (const key of ['context', 'subtext', 'contextual']) {
    assert.deepEqual(hits(`export const x = captureException(e, { ${key}: 'stats' });`), 0, key);
  }
  // …while the whole-word and camelCase forms still are.
  assert.deepEqual(hits("export const x = f({ text: 'Hello there' });"), 1);
  assert.deepEqual(hits("export const x = f({ confirmText: 'Delete forever' });"), 1);
});

test('a non-copy prop is still not a sink', () => {
  assert.deepEqual(hits('export const A = () => <Text testID="book-row" />;'), 0);
});

test('a lone CR is treated as a terminator by both halves', () => {
  const code =
    'export const s = "a\rb";\n' +
    'export const a = (x) => x.toFixed(1);\n' +
    '// lint-i18n-ok: below, not a carve-out for the line above';
  assert.deepEqual(hits(code), 1);
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// Sink (b) — `t(key, { count })` whose key declares no plural variants in the base bundle.
//
// A key is plural because the CALL SITE passes `count`, and nothing else in the toolchain can see
// that correspondence: the parity harness checks completeness only for stems already plural in
// the base OR the target, and a key declaring no variants is in neither set. So at exactly one
// item, *"Remove all 1 books from offline storage?"* shipped green in every locale.
// ══════════════════════════════════════════════════════════════════════════════════════════════

const BUNDLE = indexBundleKeys({
  // `items` is a real plural group under the DEFAULT namespace — the control for the `i18n.t`
  // resolution case below, which needs both a plain and a plural key under `common`.
  common: {
    plain: 'Hello',
    nested: { greet: 'Hi' },
    items_one: '1 item',
    items_other: '{{count}}',
  },
  library: {
    offline: {
      countSummary_one: '{{count}} book',
      countSummary_other: '{{count}} books',
      deleteAllMessage: 'Remove all {{count}} books',
    },
  },
  // A key that merely ENDS in a CLDR word is NOT a plural group — it has no `_other` sibling.
  onboarding: { step_one: 'First', step_two: 'Second' },
  // Sink (c)'s fixtures. `badge` is plural-ONLY (no bare sibling) — the shape where a count-free
  // call renders the raw key. `hybrid` carries a bare variant ALONGSIDE its plural ones, which is
  // legitimate and must stay silent. A separate namespace so the sink-(b) cases above are untouched.
  notes: {
    badge_one: '1 note',
    badge_other: '{{count}} notes',
    hybrid: 'Notes',
    hybrid_one: '1 note',
    hybrid_other: '{{count}} notes',
  },
});
const scanB = (code) => findViolations('apps/expo/src/x.tsx', code, BUNDLE);

test('indexBundleKeys: `_other` is the discriminator for a real plural group', () => {
  assert.equal(BUNDLE.plural.has('library:offline.countSummary'), true);
  assert.equal(BUNDLE.plain.has('library:offline.deleteAllMessage'), true);
  assert.equal(BUNDLE.plain.has('common:nested.greet'), true);
  // `step_one`/`step_two` have no `_other`, so they are ordinary keys, not a plural group —
  // treating them as one is how a per-locale expander silently drops `step_two`.
  assert.equal(BUNDLE.plural.has('onboarding:step'), false);
  assert.equal(BUNDLE.plain.has('onboarding:step_one'), true);
});

test('qualifyKey: a bare key resolves against the namespaces the FILE binds, not always `common`', () => {
  assert.deepEqual(qualifyKey('nested.greet'), ['common:nested.greet']);
  assert.deepEqual(qualifyKey('library:offline.x'), ['library:offline.x']);
  // The bug this signature exists for: `useTranslation('library')` binds `t` to `library`.
  assert.deepEqual(qualifyKey('offline.x', ['library']), ['library:offline.x']);
  // A prefixed key is never re-qualified, whatever the file binds.
  assert.deepEqual(qualifyKey('a11y:close', ['library']), ['a11y:close']);
  assert.deepEqual(qualifyKey('x', ['library', 'common']), ['library:x', 'common:x']);
});

test('boundNamespacesOf: reads every useTranslation/getFixedT binding in the file', () => {
  const ns = (code) =>
    boundNamespacesOf(
      ts.createSourceFile('x.tsx', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    );
  assert.deepEqual(ns("const { t } = useTranslation('library');"), ['library']);
  assert.deepEqual(ns('const { t } = useTranslation();'), ['common']);
  assert.deepEqual(ns("const { t } = useTranslation(['library', 'a11y']);"), ['library', 'a11y']);
  // A file that never binds `t` (it calls `i18n.t('ns:key')`) still resolves bare keys as i18next
  // does — against the default namespace.
  assert.deepEqual(ns('const x = 1;'), ['common']);
  // Two hooks in one file → both namespaces are candidates.
  assert.deepEqual(ns("useTranslation('library'); useTranslation('a11y');"), ['library', 'a11y']);
});

/**
 * ⚠️ THE HOLE THAT MADE SINK (b) INERT IN 14 FILES (Story 24.19 Step G, found by two layers).
 * Qualifying every bare key with `common:` produced a name in NEITHER the plain nor the plural set,
 * so the sink answered "no violation" — for the exact defect it was built to catch, written the
 * idiomatic way. The gate reported OK; the "Remove all 1 books" class was re-openable at will.
 */
test('sink b: a bare key in a NAMESPACED-useTranslation file is resolved against that namespace', () => {
  const code = `
    const { t } = useTranslation('library');
    export const A = () => <Text>{t('offline.deleteAllMessage', { count: n })}</Text>;`;
  assert.deepEqual(
    scanB(code).map((v) => v.kind),
    ['plural-missing library:offline.deleteAllMessage']
  );
  // The control: the SAME source in a file that binds the default namespace resolves elsewhere and
  // is (correctly) not flagged — proving the fix reads the binding rather than flagging everything.
  const defaulted = code.replace("useTranslation('library')", 'useTranslation()');
  assert.deepEqual(scanB(defaulted), []);
});

/**
 * ⚠️ THE SAME NAME-RESOLUTION MISTAKE, ONE CALL FORM OVER (Story 24.19 Step I). Two `t`s exist in
 * this codebase and they resolve a bare key differently: a destructured `useTranslation('library')`
 * `t` resolves against `library`, while the module singleton `i18n.t` — 205 call sites, the shape
 * the `err.message` sweep put in every hook — is bound to `defaultNS` and resolves against `common`
 * no matter what the file around it binds. Handing the file's namespace list to BOTH resolved
 * `i18n.t('offline.deleteAllMessage', { count })` to a name in neither the plain nor the plural set,
 * so the sink went quiet — the same way the `common:`-for-everything assumption made it inert one
 * round earlier.
 */
test('sink b: `i18n.t` resolves a bare key against `common`, not the file’s bound namespace', () => {
  // `common:plain` is a plain string in BUNDLE; the file binds `library` for its hook `t`.
  const code = `
    const { t } = useTranslation('library');
    export const A = () => { toast(i18n.t('plain', { count: n })); };`;
  assert.deepEqual(
    scanB(code).map((v) => v.kind),
    ['plural-missing common:plain']
  );
  // The control, so this is not "flag every i18n.t": the same call on a key that IS a plural group
  // under `common` is silent.
  const pluralKey = code.replace("i18n.t('plain'", "i18n.t('items'");
  assert.deepEqual(scanB(pluralKey), []);
});

test('sink b: with several candidate namespaces, a key that is plural in ANY of them is not flagged', () => {
  // `countSummary` IS a plural group under `library`. A file binding both namespaces cannot be
  // proven to hold the `library` `t`, so flagging would be a false positive on correct code.
  const code = `
    const { t } = useTranslation(['common', 'library']);
    export const A = () => <Text>{t('offline.countSummary', { count: n })}</Text>;`;
  assert.deepEqual(scanB(code), []);
});

test('sink b: a `count` passed to a key with no plural variants is flagged', () => {
  assert.deepEqual(
    scanB("const s = t('library:offline.deleteAllMessage', { count: n, size: s });").map(
      (v) => v.kind
    ),
    ['plural-missing library:offline.deleteAllMessage']
  );
  // …and through the bare/default-namespace spelling too.
  assert.deepEqual(scanB("const s = t('plain', { count: n });").length, 1);
  assert.deepEqual(scanB("const s = i18n.t('nested.greet', { count: n });").length, 1);
});

test('sink b: a key that DOES declare variants is silent', () => {
  assert.deepEqual(scanB("const s = t('library:offline.countSummary', { count: n });").length, 0);
});

test('sink b: no `count` → no question to ask (this is the relative-time keys’ answer)', () => {
  // The relative-time keys interpolate `{{days}}`/`{{weeks}}`, deliberately not `count`: the unit
  // is an abbreviation that does not inflect, so declaring five keys × every locale's full
  // category set would buy nothing. Silence here is the CORRECT answer, not a gap.
  assert.deepEqual(
    scanB("const s = t('library:offline.deleteAllMessage', { days: n });").length,
    0
  );
  assert.deepEqual(scanB("const s = t('library:offline.deleteAllMessage');").length, 0);
});

test('sink b: an unresolvable or unknown key is left alone', () => {
  // A dynamic key cannot be checked; an ABSENT key is a different defect, owned by the typed-t()
  // augmentation and the parity suite. Guessing here would only add noise they already cover.
  assert.deepEqual(scanB('const s = t(someKey, { count: n });').length, 0);
  assert.deepEqual(scanB("const s = t('library:does.not.exist', { count: n });").length, 0);
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// Sink (c) — the INVERSE of (b): a key that DECLARES plural variants, called with no `count`.
//
// Sink (b) shipped one direction of the correspondence and this one was never written (Epic-24
// boundary). i18next resolves `t('k')` by looking up `k` itself — it does NOT fall back to
// `k_other` — so a plural-only stem called without `count` renders the RAW KEY on screen, in every
// locale, with no literal for the string sink and nothing for the parity harness to see (the stem
// is complete everywhere; it is the CALL that is wrong).
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('sink c: a plural-only key called with NO count is flagged', () => {
  assert.deepEqual(
    scanB("const s = t('notes:badge');").map((v) => v.kind),
    ['plural-no-count notes:badge']
  );
  // The control that makes the flag mean something: the SAME key WITH `count` is silent.
  assert.deepEqual(scanB("const s = t('notes:badge', { count: n });"), []);
});

test('sink c: a stem with a BARE variant alongside its plural ones is silent', () => {
  // `t('notes:hybrid')` resolves to the bare value — legitimate, and the reason the rule needs
  // `!plain.has(k)`. Dropping that half turns every such call site into a false positive.
  assert.deepEqual(scanB("const s = t('notes:hybrid');"), []);
  assert.deepEqual(scanB("const s = t('notes:hybrid', { count: n });"), []);
});

test('sink c: a plain key with no count is silent (that is just an ordinary call)', () => {
  assert.deepEqual(scanB("const s = t('library:offline.deleteAllMessage');"), []);
  assert.deepEqual(scanB("const s = t('plain');"), []);
});

test('sink c: a bare key resolves against the file’s bound namespace, like sink (b)', () => {
  const code = `
    const { t } = useTranslation('notes');
    export const A = () => <Text>{t('badge')}</Text>;`;
  assert.deepEqual(
    scanB(code).map((v) => v.kind),
    ['plural-no-count notes:badge']
  );
  // Same source under the default namespace resolves elsewhere and is correctly silent.
  assert.deepEqual(scanB(code.replace("useTranslation('notes')", 'useTranslation()')), []);
});

test('sink c: with several candidate namespaces, disagreement means silence', () => {
  // `badge` is plural-only under `notes` but does not exist under `common`. We cannot prove which
  // `t` this call site holds, and a false positive on correct code is worse than the under-match —
  // the same asymmetry sink (b) applies.
  const code = `
    const { t } = useTranslation(['common', 'notes']);
    export const A = () => <Text>{t('hybrid')}</Text>;`;
  assert.deepEqual(scanB(code), []);
});

test('sink c: an unresolvable or unknown key is left alone', () => {
  assert.deepEqual(scanB('const s = t(someKey);'), []);
  assert.deepEqual(scanB("const s = t('notes:does.not.exist');"), []);
});

/**
 * ⚠️ AN OPTIONS OBJECT THIS CANNOT READ MUST NOT BE READ AS "no count" (Epic-24 boundary round 2).
 *
 * `countOptionKind` is three-valued for exactly this: sink (b) flags on count PRESENT, so an
 * unreadable options value behaves as a safe under-match there; sink (c) flags on count ABSENT, so
 * the same input would be a fail-closed FALSE POSITIVE on correct code. Each of these forms is a
 * perfectly good call site, and each was reported as `plural-no-count` before the fix.
 */
test('sink c: stays SILENT when the options argument is not a readable literal', () => {
  for (const call of [
    "const s = t('notes:badge', opts);", // forwarded object
    "const s = t('notes:badge', { ...opts });", // spread may carry count
    "const s = t('notes:badge', { ...base, other: 1 });", // spread + unrelated keys
    "const s = t('notes:badge', { [k]: 1 });", // computed key could BE 'count'
    "const s = t('notes:badge', makeOpts());", // call result
  ]) {
    assert.deepEqual(scanB(call), [], `must not flag: ${call}`);
  }
});

test('sink c: a literal WITHOUT count and without a spread is still flagged', () => {
  // The anti-vacuity twin — the fix must not have silenced the sink for every 2-argument call.
  assert.deepEqual(
    scanB("const s = t('notes:badge', { other: 1 });").map((v) => v.kind),
    ['plural-no-count notes:badge']
  );
});

test('sink b: still flags a readable count, and is unaffected by the three-valued split', () => {
  assert.deepEqual(
    scanB("const s = t('library:offline.deleteAllMessage', { count: n });").map((v) => v.kind),
    ['plural-missing library:offline.deleteAllMessage']
  );
  // ...and an unreadable options object remains a silent UNDER-match there (the safe direction).
  assert.deepEqual(scanB("const s = t('library:offline.deleteAllMessage', opts);"), []);
});

test('sink c is reported and exempted as a PLURAL kind, not as a hardcoded string', () => {
  // The family-prefix sweep: a new `plural-*` kind must inherit the plural tag and must NOT
  // inherit the boot-error files' string-sink carve-out.
  const exempt = [...I18N_EXEMPT_FILES][0];
  assert.equal(isFileExempted(exempt, 'plural-no-count notes:badge'), false);
});

test('sink b is INERT without a bundle — which is why runI18nScan loads one fail-closed', () => {
  // Stated as a test so the coupling is visible: `findViolations` stays pure, and the fail-closed
  // load lives in `loadBaseBundleKeys`, which throws rather than indexing zero keys.
  assert.deepEqual(
    scan("const s = t('library:offline.deleteAllMessage', { count: n });").length,
    0
  );
});

test('loadBaseBundleKeys FAILS CLOSED on a missing or empty locale directory', () => {
  assert.throws(() => loadBaseBundleKeys('/definitely/not/a/locale/dir'), /missing/);
  const empty = mkdtempSync(join(tmpdir(), 'lint-i18n-'));
  // ⚠️ The EXISTING-but-empty directory is the probe that reaches the assertion. A NONEXISTENT
  // one throws earlier, proving only that a bad path throws (`stack/gates-scanners.md`).
  assert.throws(() => loadBaseBundleKeys(empty), /no namespaces/);
  rmSync(empty, { recursive: true });
});

/**
 * ⚠️ A MISSING *NAMESPACE* IS A MISSING BUNDLE, AND IT USED TO PASS (Step G). The directory guards
 * all key on the directory as a whole, so deleting one namespace file left the count healthy while
 * every key in it became unresolvable — sink (b) stopped checking that whole namespace and the gate
 * still printed OK. The probe has to be a directory that EXISTS and holds SOME namespaces, which is
 * why the empty-directory case above cannot reach this assertion.
 */
test('loadBaseBundleKeys FAILS CLOSED when a namespace the app loads is absent', () => {
  const partial = mkdtempSync(join(tmpdir(), 'lint-i18n-ns-'));
  // One real namespace present, the rest missing — a healthy-looking, non-empty bundle.
  writeFileSync(join(partial, 'common.json'), JSON.stringify({ hello: 'Hi' }));
  assert.throws(() => loadBaseBundleKeys(partial), /missing \d+ namespace/);
  rmSync(partial, { recursive: true });
});

/**
 * ⚠️ AND ON AN *EMPTIED* NAMESPACE, WHICH THE MISSING-FILE GUARD ABOVE WALKS STRAIGHT PAST
 * (Story 24.19 Step I). `library.json` holding `{}` answers "yes" to every container question —
 * the directory exists, the namespace is declared, the whole-bundle key count is healthy on the
 * other namespaces — while every `library:*` key becomes unresolvable and sink (b) stops asking
 * about that namespace at all. Same shape as the missing file, one level in: a completeness guard
 * keyed on the CONTAINER cannot see an empty MEMBER.
 */
test('loadBaseBundleKeys FAILS CLOSED when a namespace file is present but EMPTY', () => {
  const emptied = mkdtempSync(join(tmpdir(), 'lint-i18n-empty-ns-'));
  for (const ns of declaredNamespaces()) {
    writeFileSync(join(emptied, `${ns}.json`), JSON.stringify(ns === 'library' ? {} : { k: 'v' }));
  }
  assert.throws(() => loadBaseBundleKeys(emptied), /hold no keys: library/);
  // The control: the identical tree with that one namespace populated indexes fine, so the throw
  // is the empty member and not the fixture.
  writeFileSync(join(emptied, 'library.json'), JSON.stringify({ k: 'v' }));
  assert.ok(loadBaseBundleKeys(emptied).plain.size > 0);
  rmSync(emptied, { recursive: true });
});

test('declaredNamespaces reads the namespaces the APP loads, and fails closed if it cannot', () => {
  const declared = declaredNamespaces();
  // Anti-vacuity against the real tree: a narrowed or mis-parsed read would return a short list.
  assert.ok(declared.length >= 10, `expected the app's namespaces, got ${declared.join(',')}`);
  assert.ok(declared.includes('common') && declared.includes('library'));
  // A resources module that moved, or whose shape changed, must THROW rather than silently
  // returning nothing — an empty expectation is what turns the check above into a no-op.
  assert.throws(() => declaredNamespaces('/definitely/not/a/module.ts'), /missing/);
  const decoy = join(mkdtempSync(join(tmpdir(), 'lint-i18n-res-')), 'resources.ts');
  writeFileSync(decoy, 'export const resources = {};\n');
  assert.throws(() => declaredNamespaces(decoy), /pass vacuously/);
});

test('loadBaseBundleKeys indexes the REAL base bundle, and it is not empty', () => {
  // Anti-vacuity: assert against the real tree, not a fixture. A fixture cannot falsify a claim
  // about where the bundle lives, and a silently-narrowed root would otherwise read as a pass.
  const real = loadBaseBundleKeys();
  assert.ok(real.plain.size > 100, `expected a populated base bundle, got ${real.plain.size}`);
  assert.ok(real.plural.size > 0, 'expected at least one plural stem in the base bundle');
  assert.equal(real.plural.has('library:offline.deleteAllMessage'), true);
});

/**
 * ⚠️ A WALK THAT RETURNS NOTHING IS NOT A CLEAN RUN (Story 24.19 Step I). `main()`'s root check
 * asks only whether the directory EXISTS, so an existing-but-empty root — a partial checkout, a
 * source tree moved elsewhere — walked zero files and printed OK having asked nothing. Note the
 * asymmetry that made it easy to miss: the BUNDLE side of this gate already had exactly this floor
 * (`indexed.plain.size === 0`); the SOURCE side did not. The probe must be the EXISTING-but-empty
 * directory — a nonexistent one is a different code path.
 */
test('runI18nScan FAILS CLOSED when the source root walks zero files', () => {
  const emptyRoot = mkdtempSync(join(tmpdir(), 'lint-i18n-src-'));
  assert.throws(() => runI18nScan(emptyRoot), /scanned zero source files/);
  // A root holding a file the walk does not collect (not .ts/.tsx) is still zero — the floor is
  // on what was SCANNED, not on what the directory happens to contain.
  writeFileSync(join(emptyRoot, 'README.md'), '# not source');
  assert.throws(() => runI18nScan(emptyRoot), /scanned zero source files/);
  rmSync(emptyRoot, { recursive: true });
  // …and the DEFAULT argument — the one production actually runs — clears the floor on the real
  // tree, so the guard cannot be passing only because the suite always overrides it.
  assert.ok(Array.isArray(runI18nScan()));
});

test('FORMAT_MODULE names a file that actually exists', () => {
  // The sink-(a) exemption is by PATH. A stale constant would exempt nothing and mis-report the
  // real module — an assertion no other check makes.
  assert.equal(existsSync(join(REPO_ROOT, FORMAT_MODULE)), true, FORMAT_MODULE);
});

// ── Sink (c): the copy budget ───────────────────────────────────────────────
//
// The property under test is NOT "English is short". It is "no locale is long": the gate exists
// because a translation overflows a layout that English fit, with nothing in tsc, lint or the
// parity suite to see it. Every case below is written from a locale other than the base wherever
// the two can differ, because a budget that only ever reads `en` is the bug, not the fix.

/** A locale tree on disk: `{ [locale]: { [ns]: tree } }` → a temp `locales/` root. */
const makeLocales = (tree) => {
  const root = mkdtempSync(join(tmpdir(), 'lint-i18n-budget-'));
  for (const [locale, namespaces] of Object.entries(tree)) {
    mkdirSync(join(root, locale));
    for (const [ns, body] of Object.entries(namespaces)) {
      writeFileSync(
        join(root, locale, `${ns}.json`),
        typeof body === 'string' ? body : JSON.stringify(body)
      );
    }
  }
  return root;
};

/** A prose string of exactly `n` characters. */
const chars = (n) => 'a'.repeat(n);

test('bundleLeaves is the ONE walker both bundle sinks read', () => {
  // Sink (b) needs the names and sink (c) needs the values; two walkers would be two definitions
  // of what a leaf is, and the first divergence takes a key out of one population silently.
  assert.deepEqual(bundleLeaves({ common: { a: 'x', deep: { b: 'y' } } }), [
    ['common:a', 'x'],
    ['common:deep.b', 'y'],
  ]);
  // An ARRAY is a leaf, not a container — same call the plural index has always made, so the two
  // sinks cannot disagree about whether `slides` is one key or three.
  assert.deepEqual(bundleLeaves({ book: { slides: ['a', 'b'] } }), [['book:slides', ['a', 'b']]]);
  // And the key index still derives from it, so a change here cannot quietly re-shape sink (b).
  assert.equal(indexBundleKeys({ common: { deep: { b: 'y' } } }).plain.has('common:deep.b'), true);
});

test('overBudgetLeaves is a > test, not a >= one — the budget is a length that FITS', () => {
  const at = [['common:a', chars(COPY_BUDGET)]];
  const over = [['common:a', chars(COPY_BUDGET + 1)]];
  assert.deepEqual(overBudgetLeaves(at), []);
  assert.deepEqual(
    overBudgetLeaves(over).map((v) => [v.key, v.length]),
    [['common:a', COPY_BUDGET + 1]]
  );
  // The count is CHARACTERS of the raw string, interpolation tokens included: `{{title}}` renders
  // as an unbounded book title, so counting the token is the conservative direction.
  assert.equal(overBudgetLeaves([['common:a', `{{title}} ${chars(COPY_BUDGET)}`]]).length, 1);
});

test('the budget is measured in EVERY locale — a translation over budget is flagged', () => {
  // ⚠️ THE WHOLE REASON THE GATE READS EVERY BUNDLE. `en` fits with room to spare and `fr` does
  // not, which is the shape measured on this tree when the budget was introduced (French runs
  // 1.20x English on average, 1.59x at the worst key). A gate that checked the authored language
  // would report OK on exactly this fixture.
  const root = makeLocales({
    en: { common: { footnote: chars(90) } },
    fr: { common: { footnote: chars(COPY_BUDGET + 1) } },
  });
  const out = runCopyBudgetScan(root);
  assert.equal(out.length, 1, out.join('\n'));
  assert.match(out[0], /locales\/fr\/common\.json/);
  assert.match(out[0], /`footnote` is 121 characters/);
  // Anti-vacuity: the identical tree with `fr` inside the budget is clean, so the hit above is the
  // length and not the fixture.
  writeFileSync(join(root, 'fr/common.json'), JSON.stringify({ footnote: chars(COPY_BUDGET) }));
  assert.deepEqual(runCopyBudgetScan(root), []);
  rmSync(root, { recursive: true });
});

test('a nested key is reported by its full path, in the namespace file that holds it', () => {
  const root = makeLocales({
    en: { profile: { data: { purgeDialog: { message: chars(200) } } } },
  });
  const [hit] = runCopyBudgetScan(root);
  assert.match(hit, /locales\/en\/profile\.json — `data\.purgeDialog\.message` is 200 characters/);
  rmSync(root, { recursive: true });
});

test('COPY_BUDGET_ALLOWLIST exempts by KEY, in every locale at once', () => {
  const root = makeLocales({
    en: { common: { legal: chars(200), chatter: chars(200) } },
    fr: { common: { legal: chars(300), chatter: chars(200) } },
  });
  assert.equal(runCopyBudgetScan(root).length, 4);
  COPY_BUDGET_ALLOWLIST.set('common:legal', 'test: the length is the point');
  try {
    const out = runCopyBudgetScan(root);
    // Both locales' `legal` are exempt — a string whose length earns its place earns it in every
    // language, so a per-locale carve-out would license a translator's padding.
    assert.equal(out.length, 2, out.join('\n'));
    assert.ok(
      out.every((v) => /`chatter`/.test(v)),
      out.join('\n')
    );
  } finally {
    COPY_BUDGET_ALLOWLIST.delete('common:legal');
  }
  rmSync(root, { recursive: true });
});

test('a STALE allowlist entry is an error, not a silent no-op', () => {
  // Mirrors the FORMAT_MODULE existence assertion: a carve-out naming a key that has since been
  // renamed exempts nothing while reading, to the next person, as a decision somebody made.
  const root = makeLocales({ en: { common: { a: 'x' } } });
  COPY_BUDGET_ALLOWLIST.set('common:gone', 'test: names nothing');
  try {
    assert.throws(() => runCopyBudgetScan(root), /names 1 key\(s\) no locale defines: common:gone/);
  } finally {
    COPY_BUDGET_ALLOWLIST.delete('common:gone');
  }
  rmSync(root, { recursive: true });
});

test('COPY_BUDGET_ALLOWLIST ships EMPTY, and every entry carries its reason', () => {
  // ⚠️ THE ENTRY HAS TO ARGUE THAT THE LENGTH IS DOING WORK. Empty is the honest state — the sweep
  // that introduced the budget rewrote all 19 over-budget strings and none needed the room — and
  // this case is what makes the next addition a deliberate act rather than the easy way past a red
  // gate. If you are here because it failed: either cut the string, or change this assertion in
  // the same commit that adds the entry, with the argument in the reason.
  assert.equal(COPY_BUDGET_ALLOWLIST.size, 0, [...COPY_BUDGET_ALLOWLIST.keys()].join(', '));
  for (const [key, reason] of COPY_BUDGET_ALLOWLIST) {
    assert.match(key, /^[\w-]+:/, `allowlist keys are ns-qualified: ${key}`);
    assert.ok(reason.length > 20, `an allowlist entry must argue its length: ${key}`);
  }
});

test('loadLocaleStrings FAILS CLOSED on every shape that empties the population', () => {
  // A missing root — the gate would otherwise measure nothing and print OK.
  assert.throws(() => loadLocaleStrings('/definitely/not/a/locales/root'), /locales root missing/);

  // A root that EXISTS and holds no locale directory. The distinct case from the one above, and
  // the one a rename or a partial checkout actually produces.
  const bare = mkdtempSync(join(tmpdir(), 'lint-i18n-bare-'));
  assert.throws(() => loadLocaleStrings(bare), /holds no locale directories/);
  writeFileSync(join(bare, 'notes.md'), '# not a locale');
  assert.throws(() => loadLocaleStrings(bare), /holds no locale directories/);
  rmSync(bare, { recursive: true });

  // The base locale gone: "discovered nothing" and "there is nothing" read the same to a caller,
  // and only one of them is a clean run.
  const noBase = makeLocales({ fr: { common: { a: 'x' } } });
  assert.throws(() => loadLocaleStrings(noBase), /base locale 'en' is absent/);
  rmSync(noBase, { recursive: true });

  // A locale directory holding no namespaces at all.
  const emptyLocale = makeLocales({ en: { common: { a: 'x' } } });
  mkdirSync(join(emptyLocale, 'fr'));
  assert.throws(() => loadLocaleStrings(emptyLocale), /locale 'fr' holds no namespaces/);
  rmSync(emptyLocale, { recursive: true });

  // A locale whose namespaces parse but yield no STRINGS — a botched generation run leaving `{}`.
  // The file count is healthy, which is exactly why the floor cannot live on the file count.
  const noStrings = makeLocales({ en: { common: { a: 'x' } }, fr: { common: {} } });
  assert.throws(() => loadLocaleStrings(noStrings), /locale 'fr' yielded zero strings/);
  rmSync(noStrings, { recursive: true });

  // An unparseable bundle is a FAILURE, never a skipped file: swallowing it would drop that
  // namespace out of the measured population on the very run that broke it.
  const broken = makeLocales({ en: { common: { a: 'x' }, profile: '{ "a": ' } });
  assert.throws(() => loadLocaleStrings(broken), /could not parse .*en\/profile\.json/);
  rmSync(broken, { recursive: true });
});

test('a non-string leaf is left to parity.test.ts, but cannot empty the population', () => {
  // Sink (c) measures copy. A `null` or a number is a different defect with a different owner —
  // but a locale of nothing BUT those is this gate reading a broken tree, and that is caught above.
  const root = makeLocales({ en: { common: { n: 42, ok: chars(200) } } });
  const out = runCopyBudgetScan(root);
  assert.equal(out.length, 1);
  assert.match(out[0], /`ok`/);
  rmSync(root, { recursive: true });
});

test('the REAL locale tree is measured, is populous, and is inside the budget', () => {
  // Anti-vacuity against the shipped bundles rather than a fixture: a fixture cannot falsify a
  // claim about where the bundles live, and a silently-narrowed root would read as a pass.
  const real = loadLocaleStrings();
  assert.ok(Object.keys(real).length >= 2, `expected several locales, got ${Object.keys(real)}`);
  assert.ok(real[BASE_LOCALE].length > 500, `expected a populated base bundle`);
  for (const [locale, strings] of Object.entries(real)) {
    assert.ok(strings.length > 500, `${locale} indexed only ${strings.length} strings`);
  }
  assert.deepEqual(runCopyBudgetScan(), []);
  assert.ok(existsSync(LOCALES_DIR), LOCALES_DIR);
});
