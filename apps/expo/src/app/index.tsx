import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { TABS } from '@/constants/navigation';

/**
 * `/` — the app's entry URL, and nothing else.
 *
 * ⚠️ IT EXISTS BECAUSE STORY 6-0 MOVED THE ROUTE THAT USED TO SERVE `/`. The placeholder that
 * rendered "Reading Mode soon" was `(tabs)/index.tsx`, a hidden trigger in the tab group whose
 * only other job was to give `/` a target. It is now `app/read.tsx`, a root-level sibling, which
 * is the position that escapes the native tab bar — and with it gone, `/` matched nothing:
 * `expo start --web` served `+not-found` at the app's own front door, and a native cold launch
 * starts at `/` too. Deleting a route silently deletes a URL, and nothing in the tree said so —
 * `route-integrity.test.ts` now asserts `/` is served at all.
 *
 * ⚠️ IT POPS RATHER THAN NAVIGATES, AND THE THREE OBVIOUS SPELLINGS ARE ALL WRONG. On a cold load
 * of `/` the root stack is `[(tabs), index]` — the anchor is materialised underneath, which is
 * what makes this screen a stack entry ABOVE the tab shell rather than a replacement for it. So:
 *   - `<Redirect>` (a `router.replace` in a focus effect) leaves `[(tabs), (tabs)+params]`;
 *   - a bare `router.replace(home)` leaves the same;
 *   - `router.navigate(home)` is worse — it PUSHES, leaving three entries.
 * All three land on `/account` with `canGoBack() === true`, so the settings header draws a back
 * chevron on the app's most common entry, while loading `/account` directly draws none. Measured
 * in the browser, all four ways. `dismissAll()` pops back to the anchor and leaves `[(tabs)]`.
 *
 * ⚠️ AND IT IS CALLED UNGUARDED, WHICH LOOKS LIKE THE BUG AND IS THE FIX. `router.canDismiss()`
 * answers **false** in exactly this state — measured — so guarding the call with it silently
 * routes every launch into the fallback, which is the broken path. The `catch` is the real guard:
 * it covers the state where this screen is the only route (nothing to pop), which the anchor makes
 * unreachable today but which a change to the root `unstable_settings` would create.
 *
 * ⚠️ THE FALLBACK TARGET IS READ FROM THE TAB TABLE, NOT WRITTEN HERE. `/` means "open the app",
 * and the app's home is its first tab. Hardcoding `/account` made this file a second, silent
 * source of truth — repointing it at `/read`, which the paragraph below forbids by name, passed
 * every suite in the repo. It must NEVER target the immersive route: that screen is presented over
 * the tabs, and launching into it with nothing beneath is the "cold launch restores an empty
 * player sheet" defect the source app already shipped once. `route-integrity.test.ts` asserts it.
 *
 * **The moment `(tabs)` has its own index again — the Read tab, 6.1 — delete this file rather
 * than repointing it**; a group index serving `/` directly is one hop shorter and cannot go stale.
 */
export default function Index() {
  const router = useRouter();
  // `TABS` is a non-empty literal, but its type is not; the fallback keeps a future empty table
  // redirecting to a real route rather than to `undefined`.
  const home = TABS[0]?.href ?? '/account';

  useEffect(() => {
    try {
      router.dismissAll();
    } catch {
      router.replace(home);
    }
  }, [router, home]);

  return null;
}
