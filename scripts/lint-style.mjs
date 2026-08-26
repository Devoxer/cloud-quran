#!/usr/bin/env node
/**
 * lint:style — enforces the design-token boundary from STACK-CHEAT-SHEET.md § Theme
 * (Story 18.1, AC 1–2, 5–6).
 *
 * Four scans over apps/expo/src production source (tests excluded — they legitimately
 * assert on hex strings and read theme tokens):
 *
 *   1. Literal-color scan — flags `#hex` (3/4/6/8 digits) and `rgb()/rgba()` LITERALS
 *      anywhere OUTSIDE the sanctioned token homes (`src/lib/theme.ts` + every
 *      `src/constants/` module) and the documented exceptions (COLOR_EXCEPTIONS).
 *      Colors must come from `useTheme().colors` / `Colors`, not be inlined.
 *
 *   2. Magic-spacing scan — flags numeric `padding|margin|gap|(padding|margin)(Top|…)`
 *      literals INSIDE `StyleSheet.create({...})` objects (excluding 0 and 1). Spacing
 *      must reference `SPACING.x` from `src/constants/spacing.ts`, never a bare number.
 *
 *   3. useThemedStyles-enforcement scan (Story 18.7) — flags theme-token references
 *      (`colors.*` / `theme.colors.*` / `t.colors.*`) applied INSIDE an inline `style`
 *      prop (`style={{…}}` / `style={[…, {…}]}`). Theme tokens applied to a `style` prop
 *      must live in a `useThemedStyles((t) => …)` factory (the factory's object literal is
 *      NOT a `style` prop, so its `t.colors.*` is correctly ignored). Non-style props that
 *      legitimately take a raw token (`color={colors.x}` on Icon, `tintColor`,
 *      `placeholderTextColor`, gradient `colors={[…]}`) are NOT flagged — the scan targets
 *      the `style` prop only. Documented carve-outs live in THEME_TOKEN_EXCEPTIONS.
 *
 *   4. Template-alpha scan (Story 23.5) — flags a theme-token reference (`colors.*` /
 *      `theme.colors.*` / `t.colors.*`) interpolated into a template literal and
 *      immediately followed by 2 hex alpha digits (`` `${t.colors.x}26` ``). This is the
 *      template-interpolation blind spot Scan 1 cannot see (the token hides inside a
 *      string), so this scan runs on comment-stripped — NOT string-stripped — source.
 *      Use `withAlpha(token, fraction)` from `@/lib/color` instead.
 *
 * Mirrors `scripts/lint-layers.mjs`: pure exported helpers (so the `node --test`
 * companion asserts the evasion cases without fs fixtures), comment-stripping so
 * commented-out / JSDoc literals don't false-positive, and FAIL-CLOSED — the gate
 * refuses to pass if the scan root is missing (a renamed/absent root would otherwise
 * pass vacuously; the "don't ship a fail-open gate" rule from the cheat sheet).
 *
 * Why the regexes are deliberately narrow:
 *   - The rgb/rgba pattern requires a DIGIT (or `.`) right after `(`, so a runtime
 *     helper that BUILDS an rgba string (`rgba(${r}, ${g}, ${b}, ${alpha})` in
 *     GlassBackdrop) is NOT a literal and is correctly ignored.
 *   - The spacing scan strips string contents before paren-matching the
 *     `StyleSheet.create(...)` span, so a `transform: 'translateX(8px)'`-style string
 *     can't unbalance the span or masquerade as a spacing literal.
 *
 * Allowed color homes (AC 1, premise-corrected at Step A): `theme.ts` + the WHOLE
 * `src/constants/` token dir (`Colors.ts`, `shadows.ts`, `opacity.ts`, `radii.ts`,
 * `typography.ts`, `spacing.ts`, `animation.ts`, plus `notifications.ts`'s Android
 * channel ARGB `lightColor` — native platform config, not a UI theme token).
 * Documented non-home exception: `app/+html.tsx` (web static-render CSS, pre-hydration,
 * has no access to the RN theme).
 *
 * Known limitations of the regex (non-AST) approach — latent, no live occurrence in the
 * tree today (verified), so under-match only, never a false positive:
 *   - A regex LITERAL containing an unbalanced `)` inside a `StyleSheet.create({...})`
 *     body (e.g. `re: /a)b/`) can prematurely close the paren-depth span, letting a
 *     trailing spacing literal escape. `stripStringContents` blanks strings/templates but
 *     not regex literals (distinguishing `/` regex-start from division needs a real lexer).
 *   - A string VALUE containing `//` or `/*` (e.g. a URL) has its tail removed by
 *     `stripComments` before the color scan, which could hide a `#hex` after the marker.
 *   - Scan 3 (inline theme tokens): a theme token interpolated INTO a template string
 *     inside a style prop (`backgroundColor: `${t.colors.x}`...`) is blanked by
 *     `stripStringContents` and therefore under-matched by Scan 3 — but Scan 4 (Story 23.5)
 *     now flags the `${token}<hex-alpha>` residue directly (it runs string-UNstripped), so
 *     that case is no longer a blind spot. Scan 3 still targets the lowercase `style` prop
 *     only by design (AC 5), so a camelCase `contentContainerStyle` is intentionally out of
 *     scope.
 *   - Scan 3 ALSO inherits the regex-literal hole above: a `/…/` literal containing `}` or
 *     `]` inside a `style={…}` expression can close the span early and let a trailing token
 *     escape. No live occurrence (verified).
 *   - Scan 3 is LEXICAL within the span: it only sees `colors.*` written literally inside a
 *     `style` prop. A theme token hoisted into a local `const c = isSelected ? colors.a :
 *     colors.b` and then applied via `style={{ color: c }}` is invisible to it (the span
 *     holds only the variable `c`). The migration converts such prop-conditional cases to
 *     factory variant keys (Story 18.7); a future reintroduction via variable-indirection is
 *     the residual blind spot the AST escalation would close.
 * Closing these needs an AST-based scan (a dedicated scanner-hardening pass). Scan 3 was
 * verified false-positive-free against the live tree (Story 18.7 Step E) with the string
 * approach, so the AST escalation Task-1 anticipated was not needed.
 */

import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainModule } from './gate-lib.mjs';
import { collectSourceFiles, EXPO_SRC, missingRoots, stripComments } from './lint-layers.mjs';

const repoRoot = resolve(fileURLToPath(import.meta.url), '../..');

// Sanctioned color homes: the theme hook + every constants/ token module. A relFile
// (repo-root-relative, forward slashes) matching one of these may hold color literals.
export const COLOR_HOME_FILE = 'apps/expo/src/lib/theme.ts';
export const COLOR_HOME_DIR = 'apps/expo/src/constants/';

// Documented non-home exceptions — production literals that genuinely cannot use a
// token, each with the reason it's allow-listed (AC 6). No blanket carve-outs.
export const COLOR_EXCEPTIONS = new Map([
  [
    'apps/expo/src/app/+html.tsx',
    'web static-render root CSS (runs in Node pre-hydration; no access to the RN theme)',
  ],
]);

/** True if `relFile` may legitimately contain color literals (token home or exception). */
export function isColorAllowed(relFile) {
  return (
    relFile === COLOR_HOME_FILE ||
    relFile.startsWith(COLOR_HOME_DIR) ||
    COLOR_EXCEPTIONS.has(relFile)
  );
}

// Documented carve-outs for genuinely-irreducible inline theme tokens in a `style` prop
// (AC 6) — each with the reason Task-2's factory-variant pattern can't express it. Target
// zero entries: the migration moved every flagged token into a useThemedStyles factory.
export const THEME_TOKEN_EXCEPTIONS = new Map();

/** True if `relFile` may legitimately apply a theme token inline in a `style` prop. */
export function isInlineThemeTokenAllowed(relFile) {
  return THEME_TOKEN_EXCEPTIONS.has(relFile);
}

/** Replace string/template literal CONTENTS with spaces (length-preserving) so a string
 * can't unbalance paren-matching or masquerade as a spacing literal.
 *
 * `'`/`"` strings are matched LINE-BOUNDED (a JS single/double-quoted string can't hold a
 * raw newline), so a lone apostrophe in JSX text (a contraction like `Couldn't load…`) can
 * NOT open a runaway match that swallows a later `StyleSheet.create` on another line — it
 * just fails to close on its own line and is left intact. Only backticks span newlines. */
export function stripStringContents(code) {
  return code.replace(
    /`(?:\\.|[^\\`])*`|'(?:\\.|[^\\'\n])*'|"(?:\\.|[^\\"\n])*"/g,
    (m) => m[0] + ' '.repeat(m.length - 2) + m[0]
  );
}

const HEX_RE = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b/g;
// rgb()/rgba() with a literal numeric first arg — a template (`rgba(${r}`) has `$` after
// `(` and is intentionally NOT matched (it's a runtime builder, not a literal).
const RGB_RE = /rgba?\(\s*[\d.]/gi;

/** Every `#hex` / `rgb(a)` LITERAL in already-comment-stripped code. */
export function findColorLiterals(strippedCode) {
  return [...(strippedCode.match(HEX_RE) ?? []), ...(strippedCode.match(RGB_RE) ?? [])];
}

// A theme token interpolated into a template literal then immediately followed by 2 hex
// alpha digits — `${t.colors.x}26` / `${accentColor ?? colors.accent.primary}1A`. The
// `${…}` body may hold arbitrary non-brace content as long as it references a theme token
// (the `\b` keeps `foocolors` from matching); `(?![0-9a-fA-F])` bounds it to the 2-digit
// alpha byte. Scan 4 runs this on comment-stripped (NOT string-stripped) code so it can
// see inside the backticks — the residue Scan 1's literal pass cannot.
const TEMPLATE_ALPHA_RE =
  /\$\{[^{}]*\b(?:t\.colors|theme\.colors|colors)(?:\.[A-Za-z_$][\w$]*)+[^{}]*\}[0-9a-fA-F]{2}(?![0-9a-fA-F])/g;

/** Every `${…theme-token…}<hex-alpha>` template interpolation in already-comment-stripped
 * (NOT string-stripped) code — the blind spot the `#hex` literal scan can't see. */
export function findTemplateAlphaTokens(strippedCode) {
  return [...(strippedCode.match(TEMPLATE_ALPHA_RE) ?? [])];
}

/** Extract each `StyleSheet.create( … )` argument span from comment+string-stripped code. */
export function styleSheetSpans(strippedNoStrings) {
  const spans = [];
  const re = /StyleSheet\.create\s*\(/g;
  let m;
  while ((m = re.exec(strippedNoStrings)) !== null) {
    let i = re.lastIndex;
    let depth = 1;
    while (i < strippedNoStrings.length && depth > 0) {
      const ch = strippedNoStrings[i];
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      i++;
    }
    spans.push(strippedNoStrings.slice(re.lastIndex, i - 1));
    re.lastIndex = i;
  }
  return spans;
}

const SPACING_PROP =
  'padding|margin|gap|rowGap|columnGap|paddingTop|paddingBottom|paddingLeft|paddingRight|paddingHorizontal|paddingVertical|marginTop|marginBottom|marginLeft|marginRight|marginHorizontal|marginVertical';
const SPACING_LITERAL_RE = new RegExp(`\\b(${SPACING_PROP})\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`, 'g');

/** Magic-spacing literals inside StyleSheet.create spans. Excludes 0 and 1 (|v| ≤ 1):
 * sub-unit hairline values and no-ops. Returns `{ prop, value }[]`. */
export function findSpacingLiterals(code) {
  const stripped = stripStringContents(stripComments(code));
  const out = [];
  for (const span of styleSheetSpans(stripped)) {
    let m;
    SPACING_LITERAL_RE.lastIndex = 0;
    while ((m = SPACING_LITERAL_RE.exec(span)) !== null) {
      const value = Number(m[2]);
      if (Math.abs(value) <= 1) continue; // 0 / 1 / -1 allowed
      out.push({ prop: m[1], value });
    }
  }
  return out;
}

// Inline `style` prop opener: lowercase `style` (word-bounded so camelCase
// `contentContainerStyle` does NOT match — AC 5 scope) immediately followed by the JSX
// `={`. The trailing `{` is the JSX expression container; span balancing starts after it.
const STYLE_PROP_RE = /\bstyle\s*=\s*\{/g;

/** Extract each inline `style={ … }` prop's expression span from comment+string-stripped
 * code, by brace/bracket-balancing from the JSX `{` (mirrors `styleSheetSpans`). Handles
 * `style={{…}}` (object) and `style={[…]}` (array). Strings are pre-blanked by the caller
 * so a `{`/`}`/`[`/`]` inside a string value can't unbalance the span. */
export function inlineStylePropSpans(strippedNoStrings) {
  const spans = [];
  const re = new RegExp(STYLE_PROP_RE.source, 'g');
  let m;
  while ((m = re.exec(strippedNoStrings)) !== null) {
    let i = re.lastIndex; // char after the JSX `{`
    let depth = 1;
    while (i < strippedNoStrings.length && depth > 0) {
      const ch = strippedNoStrings[i];
      if (ch === '{' || ch === '[') depth++;
      else if (ch === '}' || ch === ']') depth--;
      i++;
    }
    spans.push(strippedNoStrings.slice(re.lastIndex, i - 1));
    re.lastIndex = i;
  }
  return spans;
}

// A theme-token reference: `colors.x` / `theme.colors.x` / `t.colors.x` (the `t`/`theme`
// forms are the factory param, included defensively). Word-bounded so `themeColors.`,
// `accentColors.`, `Colors.` (the constants module, uppercase) do NOT match. Requires at
// least one `.prop` so a bare `{...colors}` spread isn't reported.
const THEME_TOKEN_RE = /\b(?:t\.colors|theme\.colors|colors)(?:\.[A-Za-z_$][\w$]*)+/g;

/** Theme-token references applied inside an inline `style` prop in `code`. Strips comments
 * + string contents first (so commented-out / string-embedded `colors.` don't false-fire),
 * then scans only the `style={…}` spans. Returns the offending dotted refs (e.g.
 * `colors.text.primary`). Tokens inside a `useThemedStyles((t) => …)` factory are NOT in a
 * `style` prop, so they are correctly absent from the result. */
export function findInlineThemeTokens(code) {
  const stripped = stripStringContents(stripComments(code));
  const out = [];
  for (const span of inlineStylePropSpans(stripped)) {
    THEME_TOKEN_RE.lastIndex = 0;
    let m;
    while ((m = THEME_TOKEN_RE.exec(span)) !== null) out.push(m[0]);
  }
  return out;
}

/** Run all three scans and return the list of violation strings. */
export function runStyleScan() {
  const violations = [];
  for (const file of collectSourceFiles(EXPO_SRC)) {
    const relFile = relative(repoRoot, file).split('\\').join('/');
    const raw = readFileSync(file, 'utf8');
    const stripped = stripComments(raw);

    // Scan 1 — color literals (skip the sanctioned homes + documented exceptions).
    if (!isColorAllowed(relFile)) {
      for (const lit of findColorLiterals(stripped)) {
        violations.push(
          `[color-literal] ${relFile} contains "${lit}" — use useTheme().colors / Colors token`
        );
      }
    }

    // Scan 2 — magic spacing inside StyleSheet.create (every file, no home exemption).
    for (const { prop, value } of findSpacingLiterals(raw)) {
      violations.push(
        `[magic-spacing] ${relFile} has ${prop}: ${value} in StyleSheet.create — use SPACING.x`
      );
    }

    // Scan 3 — theme tokens applied inline in a `style` prop (Story 18.7). They belong in a
    // useThemedStyles((t) => …) factory. Skip documented carve-outs (AC 6).
    if (!isInlineThemeTokenAllowed(relFile)) {
      for (const ref of findInlineThemeTokens(raw)) {
        violations.push(
          `[inline-theme-token] ${relFile} applies "${ref}" inside an inline style={…} prop — move it into a useThemedStyles((t) => …) factory (STACK-CHEAT-SHEET § Theme)`
        );
      }
    }

    // Scan 4 — a theme token interpolated into a template literal then a 2-digit hex alpha
    // (`${t.colors.x}26`) — the residue Scan 1 can't see (Story 23.5). Runs on the
    // comment-stripped (NOT string-stripped) source so it can read inside the backticks. No
    // home exemption: a token home defines raw literals, never `${token}` interpolations.
    for (const ref of findTemplateAlphaTokens(stripped)) {
      violations.push(
        `[template-alpha-token] ${relFile} interpolates a theme token then a hex alpha in "${ref}" — use withAlpha(token, fraction) from @/lib/color (STACK-CHEAT-SHEET § Theme)`
      );
    }
  }
  return violations;
}

function main() {
  const missing = missingRoots([['apps/expo/src', EXPO_SRC]]);
  if (missing.length > 0) {
    console.error(
      `lint:style — FAIL: required scan root(s) missing: ${missing.join(', ')}.\n` +
        'The gate refuses to pass when the source root cannot be scanned (fail-closed).'
    );
    // ⚠️ `process.exitCode` + `return`, NEVER `process.exit()` — Node's stderr is asynchronous
    // for a pipe on POSIX and `process.exit()` does not drain it, so under `turbo`/`| tee` the
    // violation list is truncated exactly on the run with the most output.
    process.exitCode = 1;
    return;
  }

  const violations = runStyleScan();
  if (violations.length > 0) {
    console.error(`lint:style — ${violations.length} style-token violation(s):\n`);
    for (const v of violations) console.error(`  ${v}`);
    console.error(
      '\nSee STACK-CHEAT-SHEET.md § Theme. Move colors to Colors/useTheme tokens and spacing to SPACING.'
    );
    process.exitCode = 1;
    return;
  }

  console.log('lint:style — OK (no style-token violations)');
}

// `onUnknown: 'run'` — an offline gate with no side effects: the unsafe outcome is skipping
// SILENTLY (a fail-closed gate reporting success having checked nothing), so warn loudly and run.
// (`'skip'` is the OTHER direction, for a script whose RUN has a cost — story 5-2 deleted the
// only caller that took it; `gate-lib.mjs` still supports it and explains when it is right.)
if (isMainModule({ url: import.meta.url, onUnknown: 'run', label: 'lint:style' })) main();
