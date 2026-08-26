/**
 * Route-tree integrity — the guard AC2 of story 5-1 asked for, built where it can actually run.
 *
 * AC2 wanted typecheck run "against freshly generated `.expo/types/router.d.ts`" so a link to a
 * deleted route would be a compile error. That protection does not exist and cannot cheaply be
 * made to: `.expo/` is gitignored, nothing in `pnpm typecheck` generates it (only the Metro dev
 * server does), and with the file absent `tsc` has no route union to check against. Proven during
 * the 5-1 review with a control — `<Link href="/this-route-does-not-exist">` gives tsc exit 0 and
 * zero errors, while a plain `const bad: number = "string"` in the same file gives exit 2.
 *
 * So the union is asserted from the filesystem instead. This is deterministic, runs in CI with
 * the normal suite, and does not depend on a generated artifact nobody commits.
 *
 * It also replaces the tab-shell test that upstream had and the seed did not carry across: with
 * `(tabs)/_layout.tsx` rendering `TABS.map(...)` into `<NativeTabs.Trigger name={tab.name}>`,
 * `tab.name` is typed plain `string`, so a tab pointing at a deleted route group typechecks,
 * lints clean, and surfaces only as `expo export` emitting no bundle — which is exactly the
 * failure commit 38db2cb was written to repair.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { TABS } from '@/constants/navigation';

const APP_DIR = join(__dirname, '..', '..', 'app');

/** Every route a file-based router would expose, as `_layout`-relative segment names. */
function routeSegments(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => !e.name.startsWith('+') && !e.name.startsWith('.'))
    .map((e) => (e.isDirectory() ? e.name : e.name.replace(/\.(tsx|ts)$/, '')))
    .filter((n) => n !== '_layout');
}

/** Every `_layout.tsx` in the route tree, root included. */
function allLayouts(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...allLayouts(full));
    else if (entry.name === '_layout.tsx') out.push(full);
  }
  return out;
}

/** Every URL the file-based router serves. Group segments `(x)` do not appear in the path. */
function routeUrls(dir: string, prefix: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('+') || entry.name.startsWith('.')) continue;
    if (entry.isDirectory()) {
      const segment = entry.name.startsWith('(') ? prefix : `${prefix}/${entry.name}`;
      out.push(...routeUrls(join(dir, entry.name), segment));
      continue;
    }
    const base = entry.name.replace(/\.(tsx|ts)$/, '');
    if (base === '_layout') continue;
    out.push(base === 'index' ? prefix || '/' : `${prefix}/${base}`);
  }
  return out;
}

describe('route tree integrity', () => {
  it('registers a Stack.Screen only for routes that exist, in EVERY layout', () => {
    // ⚠️ This originally read only the ROOT `_layout.tsx` and therefore passed while the app
    // logged nine `[Layout children]: No route named …` warnings on every launch — all of them
    // from `(tabs)/(profile)/_layout.tsx`. A guard that inspects one layout in a nested router
    // is a guard that reports clean while the thing it guards is broken. Walk them all.
    const layouts = allLayouts(APP_DIR);
    expect(layouts.length).toBeGreaterThan(1);

    const dangling: string[] = [];
    for (const layoutPath of layouts) {
      const dir = dirname(layoutPath);
      // Every `name=` prop in a layout is a Screen's; the JSX spans lines, so match the prop.
      for (const [, name] of readFileSync(layoutPath, 'utf8').matchAll(/name="([^"]+)"/g)) {
        // A screen name may address a nested path ("quiz/[bookId]", "language-settings/index").
        const target = join(dir, name);
        const exists =
          existsSync(target) || existsSync(`${target}.tsx`) || existsSync(`${target}.ts`);
        if (!exists) dangling.push(`${relative(APP_DIR, layoutPath)} -> ${name}`);
      }
    }
    expect(dangling).toEqual([]);
  });

  it('declares every tab against a real route group', () => {
    const groups = routeSegments(join(APP_DIR, '(tabs)'));
    for (const tab of TABS) {
      expect(groups).toContain(tab.name);
    }
  });

  it('anchors initialRouteName at a segment that exists, in EVERY layout', () => {
    // ⚠️ Widened by the story 5-2 review, for the second time this guard was too narrow. It
    // read only `(tabs)/_layout.tsx` and therefore passed while `(tabs)/(profile)/_layout.tsx`
    // anchored on 'profile', a route deleted with the InstantDB account screen. A missing
    // anchor does not error — expo-router falls back to alphabetical order — so the tab opened
    // privacy-settings instead of feedback, silently. Check every layout that declares one.
    const checked: string[] = [];
    for (const layoutPath of allLayouts(APP_DIR)) {
      const match = readFileSync(layoutPath, 'utf8').match(/initialRouteName:\s*'([^']+)'/);
      if (!match) continue;
      checked.push(relative(APP_DIR, layoutPath));
      expect(routeSegments(dirname(layoutPath))).toContain(match[1]);
    }
    // Anti-vacuity: if nothing declares an anchor this loop asserts nothing at all.
    expect(checked.length).toBeGreaterThan(0);
  });

  it('keeps every tab href pointing at a route that exists', () => {
    // `href` currently has no reader — the layout renders `tab.name`. Asserting it anyway keeps
    // the narrowed `TabRoute` union honest for whoever wires navigation in epic 6.
    const urls = new Set(routeUrls(APP_DIR, ''));
    for (const tab of TABS) {
      expect(urls).toContain(tab.href);
    }
  });

  it('serves `/` at all — the regression story 6-0 caused and then fixed', () => {
    // ⚠️ THE ONLY GUARD OVER THE THING THAT ACTUALLY BROKE. Moving the reading placeholder out of
    // `(tabs)` deleted the route that served `/`, and nothing said so: tsc had no complaint (the
    // generated route union is not part of `pnpm typecheck` — see this file's header), every
    // suite stayed green, and the app served `+not-found` at its own front door on web while a
    // native cold launch, which also starts at `/`, landed there too. `+not-found.tsx` even links
    // "go home" to `/`. One line, over the URL set this file already builds.
    expect(new Set(routeUrls(APP_DIR, ''))).toContain('/');
  });

  it('never points `/` at the immersive route', () => {
    // `/` is a redirect into the tab shell, and its target is the one thing about it that can go
    // wrong silently: repointing it at the immersive route — which its own docblock forbids by
    // name — passed all 96 suites. Launching straight into a screen presented OVER the tabs, with
    // nothing beneath it, is the "cold launch restores an empty player sheet" defect the source
    // app already shipped once. Read the file rather than the URL set, because the target is a
    // value in the redirect, not a route registration.
    const redirect = readFileSync(join(APP_DIR, 'index.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(redirect).not.toMatch(/['"`]\/read['"`]/);
    // …and the target it DOES use resolves to a real URL. It is read from `TABS`, so this also
    // fails if 6.1 repoints the tab table at a route that does not exist yet.
    const urls = new Set(routeUrls(APP_DIR, ''));
    for (const tab of TABS) expect(urls).toContain(tab.href);
    expect(redirect).toMatch(/TABS\[0\]/);
  });

  it('keeps test files out of the route tree', () => {
    // web.output "static" filesystem-scans src/app; Metro's blockList does not filter that scan,
    // so a co-located test becomes a phantom route. Both configs warn about this at length.
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(dir, e.name)) : [e.name]
      );
    expect(walk(APP_DIR).filter((n) => /\.(test|spec)\./.test(n))).toEqual([]);
  });
});
