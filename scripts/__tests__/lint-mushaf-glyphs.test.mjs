/**
 * Self-tests for `scripts/lint-mushaf-glyphs.mjs` — the mushaf glyph gate.
 *
 * Run: `node --test scripts/__tests__/lint-mushaf-glyphs.test.mjs` (wired as
 * `pnpm test:mushaf-glyphs`, which `pnpm test:gates` chains; `test:gates` enumerates its suites BY
 * NAME, so a new file here is invisible to `pnpm test` until `package.json` names it).
 *
 * ⚠️ EVERY DEFECT ASSERTION HERE DRIVES A POSITIVE HIT. A rule only ever observed passing proves
 * nothing — `lint-header-controls` shipped with its front door open for exactly that reason, and
 * this repo's `lint:layers` spent two stories scanning for a primitive that had been deleted,
 * reporting clean forever. So each of the three defect classes is asserted to FIRE, and the
 * shipped corpus is asserted clean only afterwards.
 *
 * ⚠️ AND TWO OF THE THREE FIRE ON REAL FONT BYTES, NOT ON FIXTURES. Every `QCF_P{NNN}` font
 * carries blank slots and box-shaped filler slots past the end of its page's glyph ladder — that
 * is precisely what the page-254 tofu ran into. A sandbox layout that points at one of those
 * slots is the genuine article: same decoder, same rasteriser, same file the app ships. Only
 * `dropped` needs a fixture, because the six shipped fonts are the repaired copies and no longer
 * contain the shape (its real-bytes evidence is the `--corpus` sweep, which selects exactly six
 * slots out of 88,246 across the unpatched upstream set).
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
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  classifyGlyph,
  findDroppingContours,
  isRectangleContour,
  parseFont,
  patchedPagesOnDisk,
  rasteriseGlyph,
  referencedCodepoints,
  registryProblems,
  runGlyphScan,
} from '../lint-mushaf-glyphs.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PATCHED_DIR = join(REPO_ROOT, 'apps/expo/assets/fonts/qpc-patched');
const LAYOUT_DIR = join(REPO_ROOT, 'packages/quran-data/data/mushaf-layout');

/** The six pages whose upstream font drops a referenced glyph, and the word each one draws. */
const SHIPPED_PATCHES = [
  [154, 0xfbd4, '7:35:8'],
  [161, 0xfb70, '7:84:8'],
  [166, 0xfba4, '7:135:8'],
  [302, 0xfbad, '18:80:9'],
  [472, 0xfbf2, '40:49:4'],
  [566, 0xfb7d, '68:47:5'],
];

const pt = (x, y, onCurve) => ({ x, y, onCurve });
/** A closed axis-aligned rectangle, four on-curve corners — the font's filler shape. */
const rect = (x0, y0, x1, y1) => [
  pt(x0, y0, true),
  pt(x1, y0, true),
  pt(x1, y1, true),
  pt(x0, y1, true),
];
/** A triangle: real, non-rectangular, unambiguously inked. */
const triangle = [pt(0, 0, true), pt(1000, 0, true), pt(500, 900, true)];

// ── the three classes, each asserted to FIRE ─────────────────────────────────

test('BLANK fires on a glyph that encloses no ink — and not on one that does', () => {
  // A degenerate "contour" along a single line: three points, zero enclosed area. Contour and
  // point counts look entirely healthy, which is the whole reason ink is measured rather than
  // counted.
  const flat = { contours: [[pt(0, 0, true), pt(500, 0, true), pt(1000, 0, true)]] };
  const verdict = classifyGlyph(flat, 1000);
  assert.equal(verdict?.kind, 'blank', 'a zero-area outline must be reported blank');
  assert.match(verdict.detail, /no ink/);

  // Anti-vacuity: the same call on a real shape must come back sound, or "blank" would just be
  // this function's opinion of every glyph.
  assert.equal(classifyGlyph({ contours: [triangle] }, 1000), null);
  assert.ok(rasteriseGlyph({ contours: [triangle] }, 1000).ink > 100);
  assert.equal(rasteriseGlyph(flat, 1000).ink, 0);
});

test('PLACEHOLDER-BOX fires on the nested-rectangle filler — and not on real letterforms', () => {
  const box = { contours: [rect(100, 0, 900, 1000), rect(200, 100, 800, 900)] };
  const verdict = classifyGlyph(box, 1000);
  assert.equal(verdict?.kind, 'placeholder-box');
  assert.match(verdict.detail, /rectangular contour/);
  // ⚠️ It rasterises to PLENTY of ink — which is why the box class cannot be found by measuring
  // ink, and why deleting the shape check would silently pass every tofu the reader sees.
  assert.ok(rasteriseGlyph(box, 1000).ink > 100);

  assert.equal(isRectangleContour(rect(0, 0, 10, 10)), true);
  assert.equal(isRectangleContour(triangle), false, 'a triangle is not a rectangle');
  assert.equal(
    isRectangleContour([pt(0, 0, true), pt(10, 0, false), pt(10, 10, true), pt(0, 10, true)]),
    false,
    'an off-curve corner is a curve, not a box'
  );
  assert.equal(
    isRectangleContour([pt(0, 0, true), pt(10, 1, true), pt(10, 10, true), pt(0, 10, true)]),
    false,
    'skewed corners are not axis-aligned'
  );
  // A glyph that mixes a rectangle with real contours is a letterform, not the filler.
  assert.equal(classifyGlyph({ contours: [rect(100, 0, 900, 1000), triangle] }, 1000), null);
});

test('DROPPED fires on a two-point contour starting off-curve — and not on the shapes near it', () => {
  const dropped = {
    contours: [triangle, [pt(2779, 1339, false), pt(2883, 1346, true)]],
  };
  const verdict = classifyGlyph(dropped, 1000);
  assert.equal(verdict?.kind, 'dropped');
  assert.match(verdict.detail, /2779,1339/, 'the offending points are named so it can be repaired');
  assert.equal(findDroppingContours(dropped).length, 1);

  // ⚠️ THE THREE NEIGHBOURS THAT MUST NOT FIRE. Each was a candidate predicate while the class
  // was being pinned down, and each selects glyphs that render perfectly — a one-point contour
  // alone occurs in 566 of the referenced slots.
  assert.equal(findDroppingContours({ contours: [[pt(1, 1, true)]] }).length, 0, 'one point');
  assert.equal(
    findDroppingContours({ contours: [[pt(1, 1, true), pt(2, 2, false)]] }).length,
    0,
    'two points starting ON-curve'
  );
  assert.equal(
    findDroppingContours({ contours: [[pt(1, 1, false), pt(2, 2, false), pt(3, 1, false)]] })
      .length,
    0,
    'three points, all off-curve'
  );

  // And the repair: prepend an on-curve floor-midpoint, and the glyph is sound again.
  const repaired = {
    contours: [triangle, [pt(2831, 1342, true), pt(2779, 1339, false), pt(2883, 1346, true)]],
  };
  assert.equal(classifyGlyph(repaired, 1000), null);
});

// ── the shipped corpus, asserted clean only AFTER the classes are known to fire ──

test('every shipped patched font actually repairs the glyph it exists for', () => {
  assert.deepEqual(
    patchedPagesOnDisk(),
    SHIPPED_PATCHES.map(([page]) => page),
    'the patched overlay on disk moved'
  );
  for (const [page, cp, location] of SHIPPED_PATCHES) {
    const font = parseFont(readFileSync(join(PATCHED_DIR, `QCF_P${page}.ttf`)));
    const gid = font.cmap.get(cp);
    assert.ok(gid !== undefined, `page ${page}: U+${cp.toString(16)} is not in the font`);
    const glyph = font.glyphs[gid];
    assert.deepEqual(findDroppingContours(glyph), [], `page ${page} (${location}) still drops`);
    assert.equal(
      classifyGlyph(glyph, font.unitsPerEm),
      null,
      `page ${page} (${location}) is not sound`
    );
    assert.ok(
      rasteriseGlyph(glyph, font.unitsPerEm).ink > 0,
      `page ${page} (${location}) has no ink`
    );

    // The layout must still ASK for the codepoint the patch repairs — a patch aimed at a glyph
    // nothing draws is dead weight, and the ladder rewrite moved these assignments once already.
    const refs = referencedCodepoints(
      JSON.parse(readFileSync(join(LAYOUT_DIR, `page-${page}.json`), 'utf8'))
    );
    assert.equal(
      refs.get(cp),
      location,
      `page ${page}: U+${cp.toString(16)} is no longer ${location}`
    );
  }
});

test('the three patched-font registries agree, and the bundled pages scan clean', () => {
  assert.deepEqual(registryProblems(), []);
  const { hits, slots, pages } = runGlyphScan();
  assert.deepEqual(hits, []);
  assert.equal(pages, SHIPPED_PATCHES.length);
  assert.ok(slots > 500, `expected the six pages to reference >500 slots, got ${slots}`);
});

test('referencedCodepoints skips the space and keeps the word each glyph belongs to', () => {
  const refs = referencedCodepoints({
    lines: [{ words: [{ location: '1:1:1', qpcV1: '\u{FB51} \u{FB52}' }] }],
  });
  assert.deepEqual(
    [...refs],
    [
      [0xfb51, '1:1:1'],
      [0xfb52, '1:1:1'],
    ]
  );
  assert.equal(
    referencedCodepoints({ lines: [] }).size,
    0,
    'an empty page yields nothing — main() floors on it'
  );
});

// ── main(): the EXIT CODE, which no output assertion can see ─────────────────

/**
 * A throwaway repo root the gate can be spawned against. `repoRoot` inside the gate derives from
 * `import.meta.url`, so copying the script somewhere else is what moves every scan root — there
 * is no env override, and adding one just to be testable would be a production seam that exists
 * for a test.
 *
 * `page` seeds a real bundled font plus the layout the gate will read for it, so the sandbox
 * exercises the true decode path on true bytes rather than a mock.
 */
const gateSandbox = ({
  page = 154,
  layout = null,
  registries = [154],
  seedFont = true,
  corpus = false,
} = {}) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'mushaf-glyphs-')));
  mkdirSync(join(root, 'scripts'), { recursive: true });
  for (const f of ['gate-lib.mjs', 'lint-mushaf-glyphs.mjs']) {
    copyFileSync(join(REPO_ROOT, 'scripts', f), join(root, 'scripts', f));
  }
  const fontDir = join(root, 'apps/expo/assets/fonts/qpc-patched');
  const layoutDir = join(root, 'packages/quran-data/data/mushaf-layout');
  mkdirSync(fontDir, { recursive: true });
  mkdirSync(layoutDir, { recursive: true });
  mkdirSync(join(root, 'apps/expo/src/lib'), { recursive: true });

  if (seedFont)
    copyFileSync(join(PATCHED_DIR, `QCF_P${page}.ttf`), join(fontDir, `QCF_P${page}.ttf`));
  writeFileSync(
    join(layoutDir, `page-${page}.json`),
    layout === null
      ? readFileSync(join(LAYOUT_DIR, `page-${page}.json`), 'utf8')
      : JSON.stringify(layout)
  );

  const list = registries.join(', ');
  const requires = registries
    .map((p) => `  ${p}: require('@/assets/fonts/qpc-patched/QCF_P${p}.ttf'),`)
    .join('\n');
  writeFileSync(
    join(root, 'apps/expo/src/lib/mushafFonts.ts'),
    `const PATCHED_FONTS: Record<number, number> = {\n${requires}\n};\n` +
      `export const PATCHED_FONT_PAGES = [${list}] as const;\n`
  );
  writeFileSync(
    join(root, 'scripts/prepare-fonts.ts'),
    `const PATCHED_PAGES = new Set([${list}]);\n`
  );

  // An "upstream" corpus holding the REPAIRED copy — i.e. a page whose patch has no reason left.
  if (corpus) {
    mkdirSync(join(root, 'corpus'), { recursive: true });
    // ⚠️ The corpus keeps `.woff2` — it stands in for UPSTREAM, which ships both formats and whose
    // woff2 directory is what `--corpus` sweeps. Only the bundled overlay became TTF (Android
    // cannot parse WOFF2 and `Font.loadAsync` resolves anyway; see `lib/mushafFonts.ts`).
    copyFileSync(
      join(PATCHED_DIR, `QCF_P${page}.woff2`),
      join(root, 'corpus', `QCF_P${page}.woff2`)
    );
  }
  return root;
};

const runGate = (root, args = []) =>
  spawnSync(process.execPath, [join(root, 'scripts', 'lint-mushaf-glyphs.mjs'), ...args], {
    encoding: 'utf8',
    cwd: root,
  });

/** A one-word page whose only glyph is `cp` — the sandbox's way of aiming at a known bad slot. */
const pageReferencing = (cp) => ({
  page: 154,
  lines: [{ line: 1, words: [{ location: '7:35:8', qpcV1: String.fromCodePoint(cp) }] }],
});

test('main() EXITS NON-ZERO on every fail branch — the residual nothing else covers', () => {
  // ⚠️ DELETE `process.exitCode = 1` FROM ANY FAIL BRANCH AND EVERY OTHER TEST STAYS GREEN. The
  // whole FAIL block still prints, and `gate-lib.test.mjs`'s entrypoint door asserts only that the
  // output contains the label — never `r.status`. `pnpm lint` would then go green over a tree the
  // gate had just refused, which is one step worse than the fail-closed floors themselves guard.
  const cases = [
    [
      'missing scan roots',
      () => {
        const root = realpathSync(mkdtempSync(join(tmpdir(), 'mushaf-glyphs-bare-')));
        mkdirSync(join(root, 'scripts'), { recursive: true });
        for (const f of ['gate-lib.mjs', 'lint-mushaf-glyphs.mjs']) {
          copyFileSync(join(REPO_ROOT, 'scripts', f), join(root, 'scripts', f));
        }
        return root;
      },
      [],
      /required scan root\(s\) missing/,
    ],
    [
      'zero-file population',
      () => gateSandbox({ seedFont: false, registries: [154] }),
      [],
      /zero patched page fonts/,
    ],
    [
      'a patched font wired to nothing',
      () => gateSandbox({ registries: [161] }),
      [],
      /registries disagree/,
    ],
    [
      'a registry declaration that moved',
      () => {
        const root = gateSandbox();
        writeFileSync(join(root, 'apps/expo/src/lib/mushafFonts.ts'), '// the map was renamed\n');
        return root;
      },
      [],
      /declaration moved/,
    ],
    // ⚠️ REAL FONT BYTES, REAL DEFECT. U+FC19 and U+FC17 sit past page 154's glyph ladder: the
    // first is the font's box-shaped filler (the page-254 tofu), the second is blank. A layout
    // that points at either is exactly the bug this gate exists to refuse.
    [
      'a layout that runs into the box filler',
      () => gateSandbox({ layout: pageReferencing(0xfc19) }),
      [],
      /placeholder-box/,
    ],
    [
      'a layout that points at a blank slot',
      () => gateSandbox({ layout: pageReferencing(0xfc17) }),
      [],
      /blank/,
    ],
    [
      // ⚠️ NOT a Latin letter: these fonts keep a legacy Latin cmap alongside the presentation
      // forms (`U+FBD4` and `U+00A4` are the same glyph), so `A` is mapped and would have made
      // this case pass for the wrong reason. U+3042 is outside every subtable.
      'a codepoint the font does not map',
      () => gateSandbox({ layout: pageReferencing(0x3042) }),
      [],
      /unmapped/,
    ],
    [
      'a layout that references no glyphs at all',
      () => gateSandbox({ layout: { page: 154, lines: [] } }),
      [],
      /references zero glyphs/,
    ],
    [
      '--corpus pointed at nothing',
      () => gateSandbox(),
      ['--corpus', '/no/such/dir'],
      /--corpus needs a directory/,
    ],
    ['--corpus with no argument', () => gateSandbox(), ['--corpus'], /--corpus needs a directory/],
  ];

  for (const [name, make, args, expected] of cases) {
    const root = make();
    try {
      const r = runGate(root, args);
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

test('a patch whose upstream copy is already sound is REPORTED, not kept quietly', () => {
  // ⚠️ THE ONE BRANCH THE REAL CORPUS CANNOT DRIVE, BECAUSE ALL SIX PATCHES ARE STILL NEEDED. A
  // check that has only ever answered "no" is a check nobody has seen work — and this one guards
  // against carrying a private fork of a Quran font for a defect upstream has since repaired.
  // Driven through `runGlyphScan` rather than `main()`, because `--corpus` sweeps all 604 pages
  // and a sandbox holds one.
  const root = gateSandbox({ corpus: true });
  try {
    const sound = runGlyphScan({ root, pages: [154], corpusDir: join(root, 'corpus') });
    assert.deepEqual(sound.hits, []);
    assert.deepEqual(sound.unnecessaryPatches, [154], 'a redundant patch must be named');

    // Anti-vacuity: against the corpus this repo actually ships against, every patch is needed.
    assert.deepEqual(runGlyphScan({ pages: [154] }).unnecessaryPatches, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('main() EXITS ZERO on a sound tree — so the assertion above is not vacuous', () => {
  const root = gateSandbox();
  try {
    const r = runGate(root);
    assert.equal(r.status, 0, `expected exit 0, got ${r.status}\n${r.stdout}${r.stderr}`);
    assert.match(r.stdout, /lint:mushaf-glyphs — OK/);
    assert.match(r.stdout, /referenced glyph slot/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
