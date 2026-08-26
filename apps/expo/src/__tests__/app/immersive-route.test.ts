/**
 * The immersive slot — where a chromeless screen LIVES, and how it is presented (story 6-0).
 *
 * ⚠️ THIS IS A STRUCTURAL TEST, ON PURPOSE, AND THE DOCBLOCK SAYS SO RATHER THAN IMPLYING MORE.
 * "The tab bar is absent" is a NATIVE fact, and no Jest renderer can observe it: `NativeTabs` is a
 * `react-native-screens` host component that renders as an inert shell under jest-expo, whose
 * visibility says nothing about a device. The device smokes prove the BEHAVIOUR; this file pins the
 * four structural facts that produce it, each a silent regression on its own:
 *
 *   1. the route FILE sits at the root of `src/app/`, not inside `(tabs)` — this is what removes
 *      the tab bar, because the screen is outside the tab navigator entirely;
 *   2. the root layout registers it with `presentation: 'fullScreenModal'` — this is what makes it
 *      immersive rather than a push, and rather than an inset page sheet;
 *   3. …and with `headerShown: false`;
 *   4. the screen does not put the header back itself, and does ship a way out in content.
 *
 * ⚠️ FACTS 1 AND 2 DO DIFFERENT JOBS, AND AN EARLIER VERSION OF THIS FILE CREDITED BOTH TO THE
 * PRESENTATION. On Android `presentation: 'modal'` is documented as equivalent to `push`, so the
 * presentation cannot be what covers the Material NavigationBar there — the position is.
 * wisdom-fruits' evidence (an in-tab modal left the bar visible, a root modal covered it) moved
 * BOTH variables at once and does not separate them; nobody has run the isolating experiment.
 *
 * The anti-vacuity half matters as much: a TABBED route must still get both pieces of chrome. AC 3
 * is "hidden per route, not per app", and the way to break that quietly is a global
 * `headerShown: false` on the root `<Stack>`, or a tab group that stops rendering `NativeTabs`.
 * Both are asserted below, so "chromeless" cannot be achieved by making the whole app chromeless.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const APP_DIR = join(__dirname, '..', '..', 'app');

/** The route file's basename, without extension — the name the root layout registers. */
const IMMERSIVE_ROUTE = 'read';

/** Comment-stripped source, so a docblock that NAMES an option is not read as setting one. */
function code(...segments: string[]): string {
  return readFileSync(join(APP_DIR, ...segments), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

/**
 * Every `<Stack.Screen …>` OPENING TAG in the source, comments already gone.
 *
 * ⚠️ THE TAG BOUNDARY IS SCANNED, NOT PATTERN-MATCHED, AND THE PATTERN THAT USED TO BE HERE WAS
 * WRONG IN A WAY THAT GREW WITH THE FILE. `/<Stack\.Screen\b[\s\S]*?\/>/` matches SELF-CLOSING
 * tags only, so one `<Stack.Screen …>…</Stack.Screen>` earlier in the layout — a perfectly normal
 * shape, and the one a screen with children takes — makes the lazy scan run past it to the NEXT
 * self-closing tag's `/>`. The capture then spans two screens, carries two `name=` attributes, and
 * `options={{` finds the FIRST one, which belongs to the other screen. Every assertion below would
 * then be measuring a route nobody asked about, and passing.
 *
 * So: find each `<Stack.Screen`, then walk to the first `>` that is outside a string and outside a
 * `{…}` expression. That terminates a self-closing tag and a container tag identically, and it
 * cannot be fooled by a `>` inside a JSX expression (`options={{ x: a > b }}`).
 */
function screenTags(source: string): string[] {
  const tags: string[] = [];
  const re = /<Stack\.Screen\b/g;
  let match: RegExpExecArray | null = re.exec(source);
  while (match !== null) {
    let depth = 0;
    let quote: string | null = null;
    for (let i = match.index + match[0].length; i < source.length; i++) {
      const ch = source[i];
      if (quote) {
        if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') quote = ch;
      else if (ch === '{') depth++;
      else if (ch === '}') depth--;
      else if (ch === '>' && depth === 0) {
        tags.push(source.slice(match.index, i + 1));
        re.lastIndex = i + 1;
        break;
      }
    }
    match = re.exec(source);
  }
  return tags;
}

/**
 * The `options={{ … }}` object of ONE `<Stack.Screen name="…">`, comments already gone.
 *
 * ⚠️ TAG FIRST, THEN THE OPTIONS INSIDE IT — both halves close a real hole. Searching forward from
 * `name="…"` reads the NEXT screen's options when the attributes are written in the other order
 * (`<Stack.Screen options={{…}} name="read" />`, which a formatter can produce). And a non-greedy
 * `}}` stops at the first one, so a nested object in the options — `contentStyle: {…}`, which 6.1
 * is likely to add — truncates the capture and silently drops whatever assertions come after it.
 * Brace-count instead of pattern-match.
 */
function screenOptions(source: string, name: string): string {
  const tag = screenTags(source).find((t) => t.includes(`name="${name}"`));
  expect(tag).toBeDefined();
  const text = tag as string;
  const open = text.indexOf('options={{');
  expect(open).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = open + 'options={'.length; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) return text.slice(open + 'options={{'.length, i);
    }
  }
  throw new Error(`unbalanced options object on <Stack.Screen name="${name}">`);
}

describe('the immersive route is a ROOT SIBLING of (tabs)', () => {
  it('lives at the root of the route tree', () => {
    expect(existsSync(join(APP_DIR, `${IMMERSIVE_ROUTE}.tsx`))).toBe(true);
  });

  it('does NOT live inside the tab group', () => {
    // MUTATION 1. A route pushed inside the tab navigator deliberately KEEPS the native tab bar
    // and the iPad sidebar — that is the navigator working as designed, not a styling problem.
    // Moving the file back here is invisible to tsc, Biome and every render test.
    expect(existsSync(join(APP_DIR, '(tabs)', `${IMMERSIVE_ROUTE}.tsx`))).toBe(false);
  });

  it('is registered in the ROOT layout, beside (tabs)', () => {
    const root = code('_layout.tsx');
    expect(root).toMatch(new RegExp(`name="${IMMERSIVE_ROUTE}"`));
    expect(root).toMatch(/name="\(tabs\)"/);
  });

  it('and the options below are read from THAT registration alone', () => {
    // The self-check for `screenTags` — see its docblock. A tag that spans two `<Stack.Screen>`s
    // carries two `name=` attributes and hands every case below the wrong screen's options, while
    // passing. Anti-vacuity: there must be more than one registration for the scan to get wrong.
    const tags = screenTags(code('_layout.tsx'));
    expect(tags.length).toBeGreaterThan(1);
    const tag = tags.find((t) => t.includes(`name="${IMMERSIVE_ROUTE}"`)) ?? '';
    expect(tag.match(/name="/g)).toHaveLength(1);
  });
});

describe('…presented as a modal, with no header', () => {
  it('carries presentation: fullScreenModal — not `modal`, and not a push', () => {
    // ⚠️ WHAT THIS PINS IS IMMERSION, NOT THE ABSENCE OF THE TAB BAR — the earlier version of this
    // case claimed the latter, and it was wrong. On Android `presentation: 'modal'` is documented
    // as equivalent to `push`, so a presentation cannot be what covers the Material NavigationBar
    // there; the root-sibling position is (the cases above). What a presentation decides is
    // whether the screen COVERS or pushes.
    //
    // `fullScreenModal` rather than `modal`, because on iOS 13+ react-native-screens maps `modal`
    // to `UIModalPresentationAutomatic` — an inset card with rounded corners and the tab screen
    // visible behind it. That satisfies "no chrome in layout" and fails "immersive", which is the
    // wrong trade for a Quran reader. Both wrong values typecheck and lint clean.
    expect(screenOptions(code('_layout.tsx'), IMMERSIVE_ROUTE)).toMatch(
      /presentation:\s*'fullScreenModal'/
    );
  });

  it('carries headerShown: false', () => {
    // MUTATION 2. Without it the modal renders a native header — which would also drag in the
    // header-control question this story exists to sidestep.
    expect(screenOptions(code('_layout.tsx'), IMMERSIVE_ROUTE)).toMatch(/headerShown:\s*false/);
  });

  it('the screen itself never re-adds a header', () => {
    // ⚠️ THE HOLE THE OTHER CASES LEAVE OPEN, AND THE ONE 6.1 IS MOST LIKELY TO WALK INTO. The
    // registration hides the header, but the SCREEN can put it straight back with a local
    // `<Stack.Screen options={{ headerShown: true, title }} />` — the exact idiom the four sibling
    // profile screens use, and the natural way to answer "the reader needs a way out".
    // Demonstrated: adding it left this file green, the whole app suite green, every gate OK.
    expect(code(`${IMMERSIVE_ROUTE}.tsx`)).not.toMatch(/headerShown/);
  });

  it('installs no control into a native header slot', () => {
    // `lint:header-controls` owns this tree-wide; asserted here because THIS route is the one
    // that imports the temptation — both wisdom-fruits root modals ship a header close button.
    const source = code(`${IMMERSIVE_ROUTE}.tsx`);
    expect(source).not.toMatch(/header(?:Left|Right)/);
    expect(source).not.toMatch(/setOptions/);
  });

  it('gives the reader a way out, and it lives in CONTENT', () => {
    // `fullScreenModal` has no dismiss gesture, and web never had one — a reader who arrives by
    // URL or deep link would otherwise be stuck with no way out on any platform. The empty room is
    // this story's point; a room with no door is not. `canGoBack()` is checked because a direct
    // load has no history to pop.
    const source = code(`${IMMERSIVE_ROUTE}.tsx`);
    expect(source).toMatch(/canGoBack\(\)/);
    expect(source).toMatch(/accessibilityRole="button"/);
  });
});

describe('chrome is hidden PER ROUTE, not per app', () => {
  it('the root Stack sets no app-wide headerShown', () => {
    // The quiet way to pass every case above while breaking AC 3: hide the chrome globally. The
    // profile stack's native headers are supposed to stay.
    const root = code('_layout.tsx');
    expect(root).not.toMatch(/<Stack\s+screenOptions/);
  });

  it('a tabbed route still gets a native tab bar', () => {
    expect(code('(tabs)', '_layout.tsx')).toMatch(/<NativeTabs\b/);
  });

  it('a pushed settings screen still gets a native header', () => {
    expect(code('(tabs)', '(profile)', '_layout.tsx')).toMatch(/headerShown:\s*true/);
  });
});
