/**
 * Custom chrome — the structural facts of story 6-6, pinned (this file replaces
 * `immersive-route.test.ts`, whose subjects — the root-sibling `fullScreenModal` reading routes —
 * became tab routes in this story).
 *
 * ⚠️ STRUCTURAL, ON PURPOSE, LIKE ITS PREDECESSOR. "No native tab bar and no native stack header
 * anywhere" is mostly a NATIVE fact no Jest renderer can observe; what this file pins is the
 * source shapes that produce it, each a silent regression on its own:
 *
 *   1. `<NativeTabs>` is imported and rendered NOWHERE;
 *   2. no screen or layout turns a native header ON (`headerShown: true` is extinct);
 *   3. the tab navigator paints nothing — a null `tabBar`, headers off — so the ONE tab bar is
 *      ours;
 *   4. the reading surfaces live INSIDE `(tabs)` (index = the mushaf, serving `/`; read), mount
 *      `ReadingChrome`, and never spell the header-visibility option themselves;
 *   5. the settings shell mounts `AppHeader` + `AppTabBar` — the ANTI-VACUITY half: a tabbed
 *      route still gets chrome, OURS, so "no native chrome" cannot decay into "no chrome";
 *   6. the pre-6-6 files (`app/index.tsx`, `app/read.tsx`, `app/mushaf.tsx`) stay deleted — a
 *      resurrected `app/index.tsx` would silently SHADOW the mushaf at `/`, and a resurrected
 *      root-sibling reading route would fork the surface in two.
 *
 * The root stack keeps per-screen `headerShown: false` and no `screenOptions` blanket — the
 * distinction the old anti-vacuity case guarded (per-route decisions, never an app-wide flip)
 * still holds with the polarity it has today.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC_DIR = join(__dirname, '..', '..');
const APP_DIR = join(SRC_DIR, 'app');
const UI_DIR = join(SRC_DIR, 'components', 'ui');

/** Comment-stripped source of one file. */
function code(base: string, ...segments: string[]): string {
  return readFileSync(join(base, ...segments), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

/** Every production source file under a root, comment-stripped and concatenated. */
function allCode(root: string): string {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
        out.push(
          readFileSync(full, 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/^\s*\/\/.*$/gm, '')
        );
      }
    }
  };
  walk(root);
  return out.join('\n');
}

describe('no native chrome renders anywhere', () => {
  it('nothing imports or renders NativeTabs', () => {
    for (const root of [APP_DIR, join(SRC_DIR, 'components'), join(SRC_DIR, 'features')]) {
      const all = allCode(root);
      expect(all).not.toMatch(/unstable-native-tabs/);
      expect(all).not.toMatch(/<NativeTabs\b/);
    }
  });

  it('no route or layout turns a native header ON', () => {
    // MUTATION: one screen adding `headerShown: true` re-creates the native header — and with it
    // the header-slot question the reserved-words gate exists for.
    expect(allCode(APP_DIR)).not.toMatch(/headerShown:\s*true/);
  });

  it('the root Stack hides headers PER SCREEN, never as an app-wide blanket', () => {
    const root = code(APP_DIR, '_layout.tsx');
    expect(root).not.toMatch(/<Stack\s+screenOptions/);
    expect(root).toMatch(/name="\(tabs\)"/);
    // +not-found auto-registers into the root Stack; without this registration it draws the one
    // native header left in the app.
    expect(root).toMatch(/name="\+not-found"/);
  });

  /**
   * Every root-pushed route, by name. ⚠️ THE LIST IS THE TEST: a route added here without an
   * entry is the mutation this case exists for, and story 6-7's `/search` was exactly that —
   * deleting its whole `<Stack.Screen>` block, and separately collapsing its ternary to `'card'`,
   * each left lint and all 2,840 tests green while `surahs` sat pinned one line above.
   */
  const ROOT_PUSHED_ROUTES = ['surahs', 'search'];

  it.each(ROOT_PUSHED_ROUTES)('the %s route is registered on the root Stack at all', (route) => {
    // Registration is not cosmetic: an unregistered route still SERVES, but draws the one
    // native stack header left in the app — the thing `lint:header-controls` cannot see,
    // because the header is installed by the navigator rather than written in our source.
    const rootLayout = code(APP_DIR, '_layout.tsx');
    expect(rootLayout).toMatch(new RegExp(`name="${route}"`));
  });

  it.each(
    ROOT_PUSHED_ROUTES
  )('the %s route is a WEB-CONDITIONAL presentation — a measured data-loss fix', (route) => {
    // ⚠️ THIS TERNARY LOOKS LIKE A STYLE CHOICE AND IS NOT. Measured in WebKit 2026-08-28:
    // with a default card push, popping back from the index left the mushaf pager
    // `display: none` with its scroller reporting offset 0 — so the focus resync's
    // `scrollToIndex` stranded, and the transient page-604 viewability could WRITE 112:1 over
    // the reader's real saved position. Demonstrated during review that collapsing it to plain
    // `'card'` left 310 app/route tests green during 6-3, and again 2,840 during 6-7 — so
    // nothing stopped a later "simplification" from restoring silent position loss.
    //
    // BOTH routes carry it because both are write-then-return surfaces over a tab screen that
    // must survive being covered: the index writes the pair and pops, and `/search` writes the
    // pair and `dismissAll()`s through TWO of these screens at once.
    //
    // A source scan, like its neighbours here: `root-layout-boot.test.tsx` stubs `Stack.Screen`
    // as `() => null`, so no rendered test in this repo can observe a screen's options at all.
    // Weaker than a render, and named as such — but it does catch the exact mutation above.
    const rootLayout = code(APP_DIR, '_layout.tsx');
    // The name and the ternary must be in the SAME `<Stack.Screen>` block: matching them
    // independently over the whole file passes when one route is registered plainly and a
    // different one happens to carry a ternary somewhere below it.
    const block = new RegExp(
      `name="${route}"[^>]*?presentation:\\s*Platform\\.OS === 'web' \\? 'transparentModal' : 'card'`,
      's'
    );
    expect(rootLayout).toMatch(block);
  });

  it('knows about every root-pushed route there is — the list cannot go stale', () => {
    // ⚠️ ANTI-VACUITY, AND THE REASON THE TWO CASES ABOVE ARE `it.each` OVER A LIST RATHER THAN
    // TWO HAND-WRITTEN CASES. A pinned list only pins what is on it; the failure mode is a THIRD
    // root route landing later with no entry, which is precisely how `/search` slipped past the
    // `surahs` case. So the list is checked against the filesystem: every non-group route file
    // beside `(tabs)` is a root-pushed route and must be named above.
    const actual = readdirSync(APP_DIR, { withFileTypes: true })
      .filter((e) => e.isFile() && /\.tsx$/.test(e.name))
      .map((e) => e.name.replace(/\.tsx$/, ''))
      .filter((n) => n !== '_layout' && !n.startsWith('+'));
    expect(actual.sort()).toEqual([...ROOT_PUSHED_ROUTES].sort());
  });

  it('the tab navigator paints nothing of its own', () => {
    const layout = code(APP_DIR, '(tabs)', '_layout.tsx');
    expect(layout).toMatch(/tabBar=\{\(\)\s*=>\s*null\}/);
    expect(layout).toMatch(/headerShown:\s*false/);
    // A tab switch is not history — without this, every non-initial tab draws a phantom back
    // chevron through `AppHeader`'s `canGoBack()` branch.
    expect(layout).toMatch(/backBehavior="none"/);
  });
});

describe('the reading surfaces are tab routes with OUR chrome', () => {
  it('the mushaf IS the group index — the home surface serves `/` directly', () => {
    expect(existsSync(join(APP_DIR, '(tabs)', 'index.tsx'))).toBe(true);
    expect(code(APP_DIR, '(tabs)', 'index.tsx')).toMatch(/ReadingChrome/);
  });

  it('reading mode lives beside it', () => {
    expect(existsSync(join(APP_DIR, '(tabs)', 'read.tsx'))).toBe(true);
    expect(code(APP_DIR, '(tabs)', 'read.tsx')).toMatch(/ReadingChrome/);
  });

  it('neither reading source spells the header-visibility option', () => {
    // The idiom a screen would naturally reach for (`<Tabs.Screen options={{ headerShown }}>`)
    // is how a native header comes back one surface at a time.
    expect(code(APP_DIR, '(tabs)', 'index.tsx')).not.toMatch(/headerShown/);
    expect(code(APP_DIR, '(tabs)', 'read.tsx')).not.toMatch(/headerShown/);
  });

  it('the pre-6-6 route files stay deleted', () => {
    // `app/index.tsx` would SHADOW the mushaf at `/` (a redirect in front of the home surface);
    // root-sibling `read`/`mushaf` would fork each surface in two.
    expect(existsSync(join(APP_DIR, 'index.tsx'))).toBe(false);
    expect(existsSync(join(APP_DIR, 'read.tsx'))).toBe(false);
    expect(existsSync(join(APP_DIR, 'mushaf.tsx'))).toBe(false);
  });
});

describe('a tabbed route still gets chrome — OURS (the anti-vacuity half)', () => {
  it('the settings shell mounts AppHeader and AppTabBar around its native Stack', () => {
    const shell = code(APP_DIR, '(tabs)', '(profile)', '_layout.tsx');
    expect(shell).toMatch(/<AppHeader\b/);
    expect(shell).toMatch(/<AppTabBar\b/);
    expect(shell).toMatch(/headerShown:\s*false/);
  });

  it('ReadingChrome mounts both chrome components on the reading surfaces', () => {
    const chrome = code(SRC_DIR, 'features', 'reading', 'components', 'ReadingChrome.tsx');
    expect(chrome).toMatch(/<AppHeader\b/);
    expect(chrome).toMatch(/<AppTabBar\b/);
  });

  it('the chrome components exist and name their slots leading/trailing — never the reserved words', () => {
    // `lint:header-controls` owns the reserved-word scan tree-wide; asserted here because these
    // two files are where the temptation now lives (an in-tree header is the likeliest place to
    // write `headerLeft` out of habit).
    const header = code(UI_DIR, 'AppHeader.tsx');
    expect(header).toMatch(/leading/);
    expect(header).toMatch(/trailing/);
    expect(header).not.toMatch(/header(?:Left|Right)/);
    expect(code(UI_DIR, 'AppTabBar.tsx')).not.toMatch(/header(?:Left|Right)/);
  });
});
