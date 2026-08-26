/**
 * Self-tests for the lint:style scanner (scripts/lint-style.mjs).
 *
 * Run: `node --test scripts/__tests__/lint-style.test.mjs`
 *
 * These assert the EVASION / edge cases the design-token gate must hold: hex/rgba
 * literals caught, runtime rgba builders NOT caught, token homes + exceptions allowed,
 * spacing literals caught only inside StyleSheet.create, 0/1 allowed, strings can't
 * unbalance the span. Pure helpers are tested directly (no fs fixtures, no subprocess).
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stripComments } from '../lint-layers.mjs';
import {
  COLOR_EXCEPTIONS,
  findColorLiterals,
  findInlineThemeTokens,
  findSpacingLiterals,
  findTemplateAlphaTokens,
  inlineStylePropSpans,
  isColorAllowed,
  isInlineThemeTokenAllowed,
  styleSheetSpans,
  THEME_TOKEN_EXCEPTIONS,
} from '../lint-style.mjs';

// ── color literals ──────────────────────────────────────────────────────────
test('findColorLiterals: catches 3/4/6/8-digit hex and rgb/rgba literals', () => {
  assert.deepEqual(findColorLiterals('color: "#fff"'), ['#fff']);
  assert.deepEqual(findColorLiterals('x: "#FF231F7C"'), ['#FF231F7C']); // 8-digit ARGB
  assert.deepEqual(findColorLiterals('x: "#C65D3B"'), ['#C65D3B']);
  assert.ok(findColorLiterals('bg: "rgba(0, 0, 0, 0.5)"').length === 1);
  assert.ok(findColorLiterals('bg: "rgb(255,255,255)"').length === 1);
});

test('findColorLiterals: a runtime rgba BUILDER (template literal) is NOT a literal', () => {
  // GlassBackdrop.applyAlpha — must not be flagged.
  assert.deepEqual(findColorLiterals('return `rgba(${r}, ${g}, ${b}, ${alpha})`;'), []);
});

test('findColorLiterals: ignores non-color `#` and named colors', () => {
  assert.deepEqual(findColorLiterals("import x from '#region'"), []); // not hex
  assert.deepEqual(findColorLiterals("color: 'transparent'"), []); // named, out of scope
});

test('findColorLiterals: comment-stripping removes commented-out literals (JSDoc rgba)', () => {
  const code = '/** deletes their `<View rgba(0,0,0,0.5)>` scrims */\nconst x = 1;';
  assert.deepEqual(findColorLiterals(stripComments(code)), []);
});

// ── color homes / exceptions ─────────────────────────────────────────────────
test('isColorAllowed: theme.ts, the whole constants/ dir, and exceptions are allowed', () => {
  assert.equal(isColorAllowed('apps/expo/src/lib/theme.ts'), true);
  assert.equal(isColorAllowed('apps/expo/src/constants/Colors.ts'), true);
  assert.equal(isColorAllowed('apps/expo/src/constants/notifications.ts'), true); // ARGB lightColor
  assert.equal(isColorAllowed('apps/expo/src/app/+html.tsx'), true); // documented exception
});

test('isColorAllowed: a component / hook / lib (non-theme) file is NOT allowed', () => {
  assert.equal(isColorAllowed('apps/expo/src/components/ui/ErrorBoundary.tsx'), false);
  assert.equal(isColorAllowed('apps/expo/src/lib/storage.ts'), false);
});

test('COLOR_EXCEPTIONS: every exception carries a non-empty reason', () => {
  for (const [, reason] of COLOR_EXCEPTIONS) assert.ok(reason && reason.length > 0);
});

// ── magic spacing ─────────────────────────────────────────────────────────────
test('findSpacingLiterals: flags numeric padding/margin/gap inside StyleSheet.create', () => {
  const code = 'const s = StyleSheet.create({ chip: { paddingVertical: 2, gap: 8 } });';
  const hits = findSpacingLiterals(code);
  assert.deepEqual(hits.map((h) => `${h.prop}:${h.value}`).sort(), ['gap:8', 'paddingVertical:2']);
});

test('findSpacingLiterals: flags rowGap/columnGap (axis variants of gap)', () => {
  const code = 'const s = StyleSheet.create({ grid: { rowGap: 7, columnGap: 9 } });';
  assert.deepEqual(
    findSpacingLiterals(code)
      .map((h) => `${h.prop}:${h.value}`)
      .sort(),
    ['columnGap:9', 'rowGap:7']
  );
});

test('findSpacingLiterals: 0 and 1 are allowed (no-op / hairline)', () => {
  const code = 'const s = StyleSheet.create({ x: { padding: 0, marginTop: 1, gap: 2 } });';
  assert.deepEqual(
    findSpacingLiterals(code).map((h) => h.value),
    [2]
  );
});

test('findSpacingLiterals: SPACING token references are NOT literals', () => {
  const code = 'const s = StyleSheet.create({ x: { padding: SPACING.md, gap: SPACING.xs } });';
  assert.deepEqual(findSpacingLiterals(code), []);
});

test('findSpacingLiterals: spacing numbers OUTSIDE StyleSheet.create are ignored (AC scope)', () => {
  const code = 'const props = { padding: 16 };\n<View style={{ margin: 8 }} />;';
  assert.deepEqual(findSpacingLiterals(code), []);
});

test('findSpacingLiterals: a string with parens cannot unbalance the span', () => {
  const code =
    "const s = StyleSheet.create({ a: { fontFamily: 'Foo (Bold)', gap: 8 } });\nconst margin = 4;";
  // gap:8 inside the span is caught; the trailing `const margin = 4` (outside) is not.
  assert.deepEqual(
    findSpacingLiterals(code).map((h) => `${h.prop}:${h.value}`),
    ['gap:8']
  );
});

test('findSpacingLiterals: a JSX-text apostrophe does NOT blank a later StyleSheet.create', () => {
  // Regression (CR round 1): a lone apostrophe in JSX text (`Couldn't`) used to open a
  // runaway multiline string match that swallowed the StyleSheet.create span below it, so
  // the file's spacing scan silently returned [] and a real `gap: 2` escaped the gate.
  const code = [
    "<Text>Couldn't load your feed. Tap below to try again.</Text>;",
    "const mode = 'listen';",
    'const s = StyleSheet.create({ rowText: { flex: 1, gap: 2 } });',
  ].join('\n');
  assert.deepEqual(
    findSpacingLiterals(code).map((h) => `${h.prop}:${h.value}`),
    ['gap:2']
  );
});

test('styleSheetSpans: extracts multiple StyleSheet.create blocks', () => {
  const code = 'StyleSheet.create({ a: 1 });\nStyleSheet.create({ b: 2 });';
  assert.equal(styleSheetSpans(code).length, 2);
});

// ── inline theme tokens in a style prop (Story 18.7, scan 3) ──────────────────
test('findInlineThemeTokens: flags a token in an inline object style prop', () => {
  assert.deepEqual(findInlineThemeTokens('<Text style={{ color: colors.text.primary }} />'), [
    'colors.text.primary',
  ]);
});

test('findInlineThemeTokens: flags a token in a style ARRAY prop', () => {
  const code = '<View style={[s.a, { backgroundColor: colors.accent.primary }]} />';
  assert.deepEqual(findInlineThemeTokens(code), ['colors.accent.primary']);
});

test('findInlineThemeTokens: flags theme.colors.* and t.colors.* forms', () => {
  assert.deepEqual(findInlineThemeTokens('<V style={{ color: theme.colors.text.x }} />'), [
    'theme.colors.text.x',
  ]);
  assert.deepEqual(findInlineThemeTokens('<V style={[s.a, { color: t.colors.y }]} />'), [
    't.colors.y',
  ]);
});

test('findInlineThemeTokens: a token in a useThemedStyles factory is NOT a style prop → not flagged', () => {
  const code = 'const s = useThemedStyles((t) => ({ x: { color: t.colors.text.primary } }));';
  assert.deepEqual(findInlineThemeTokens(code), []);
});

test('findInlineThemeTokens: a token on a NON-style prop (color=, tintColor=) is not flagged', () => {
  assert.deepEqual(findInlineThemeTokens('<Icon color={colors.text.primary} />'), []);
  assert.deepEqual(findInlineThemeTokens('<Spinner tintColor={colors.accent.primary} />'), []);
});

test('findInlineThemeTokens: camelCase contentContainerStyle is out of scope (lowercase `style` only)', () => {
  assert.deepEqual(
    findInlineThemeTokens('<List contentContainerStyle={{ backgroundColor: colors.bg }} />'),
    []
  );
});

test('findInlineThemeTokens: commented-out / string `colors.` does not false-fire', () => {
  assert.deepEqual(
    findInlineThemeTokens('// style={{ color: colors.text.primary }}\nconst x=1;'),
    []
  );
  assert.deepEqual(findInlineThemeTokens('<Text style={{ fontFamily: "colors.fake" }} />'), []);
});

test('findInlineThemeTokens: a dynamic non-theme value in a style prop is not flagged', () => {
  const code = '<View style={[s.bar, { opacity: disabled ? 0.5 : 1, width: `${pct}%` }]} />';
  assert.deepEqual(findInlineThemeTokens(code), []);
});

test('findInlineThemeTokens: a string with braces cannot unbalance the style-prop span', () => {
  // The string `"a{b}"` is blanked before span-balancing; the real token after it is still caught.
  const code = '<V style={{ fontFamily: "a{b}c", color: colors.text.primary }} />';
  assert.deepEqual(findInlineThemeTokens(code), ['colors.text.primary']);
});

test('inlineStylePropSpans: extracts object and array style-prop spans', () => {
  const spans = inlineStylePropSpans('<V style={{ a: 1 }} /><W style={[x, { b: 2 }]} />');
  assert.equal(spans.length, 2);
  assert.ok(spans[1].includes('[x, { b: 2 }]'));
});

test('isInlineThemeTokenAllowed / THEME_TOKEN_EXCEPTIONS: empty by default; entries carry a reason', () => {
  assert.equal(isInlineThemeTokenAllowed('apps/expo/src/components/ui/ProgressBar.tsx'), false);
  for (const [, reason] of THEME_TOKEN_EXCEPTIONS) assert.ok(reason && reason.length > 0);
});

// ── template-alpha residue (Story 23.5, scan 4) ───────────────────────────────
test('findTemplateAlphaTokens: FIRES on a theme token interpolated then a 2-digit hex alpha', () => {
  // Positive: the documented blind spot — `#hex` literal scan can't see the token inside
  // the template string, so this scan must catch the `${token}<hex>` residue directly.
  assert.deepEqual(findTemplateAlphaTokens('indicatorColor: `${colors.accent.primary}26`'), [
    '${colors.accent.primary}26',
  ]);
  assert.deepEqual(findTemplateAlphaTokens('bg: `${t.colors.background.secondary}CC`'), [
    '${t.colors.background.secondary}CC',
  ]);
  assert.deepEqual(findTemplateAlphaTokens('x: `${theme.colors.x}1A`'), ['${theme.colors.x}1A']);
});

test('findTemplateAlphaTokens: FIRES when the token is behind a `??` fallback in the expression', () => {
  assert.deepEqual(findTemplateAlphaTokens('bg: `${accentColor ?? colors.accent.primary}1A`'), [
    '${accentColor ?? colors.accent.primary}1A',
  ]);
});

test('findTemplateAlphaTokens: does NOT fire on a non-color interpolation (`${count}10`)', () => {
  // Negative: a non-theme-token value followed by digits is not an alpha residue.
  assert.deepEqual(findTemplateAlphaTokens('label: `${count}10 items`'), []);
  assert.deepEqual(findTemplateAlphaTokens('w: `${pct}50%`'), []);
});

test('findTemplateAlphaTokens: does NOT fire on the withAlpha() replacement (no template)', () => {
  // The migration target: a real function call, not a `${token}<hex>` string.
  assert.deepEqual(findTemplateAlphaTokens('bg: withAlpha(colors.accent.primary, 0.15)'), []);
});

test('findTemplateAlphaTokens: comment-stripping removes a commented-out residue', () => {
  // Scan 4 runs on comment-stripped (but NOT string-stripped) source, so a commented
  // example must not false-fire while a real one in code still does.
  assert.deepEqual(
    findTemplateAlphaTokens(stripComments('// old: `${t.colors.x}26`\nconst y=1;')),
    []
  );
});
