import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { HOME_HREF } from '@/constants/navigation';

/**
 * How long the front door waits for its own `POP_TO_TOP` to land before falling back.
 *
 * The pop is queued, not applied: `router.dismissAll()` pushes `{ type: 'POP_TO_TOP' }` onto
 * expo-router's `routingQueue`, which is drained on a later React commit. When it lands this
 * screen is popped off the stack and UNMOUNTS, which cancels the timer below — so the fallback
 * fires only when the pop did nothing at all. One React commit is a few milliseconds; the margin
 * is for a cold launch on a slow device, and it is the whole cost of the broken case.
 */
const POP_SETTLE_MS = 300;

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
 *   - a bare `router.replace(HOME_HREF)` leaves the same;
 *   - `router.navigate(HOME_HREF)` is worse — it PUSHES, leaving three entries.
 * All three land on `/account` with `canGoBack() === true`, so the settings header draws a back
 * chevron on the app's most common entry, while loading `/account` directly draws none. Measured
 * in the browser, all four ways. `dismissAll()` pops back to the anchor and leaves `[(tabs)]`.
 *
 * ⚠️ THE FALLBACK IS A TIMER, NOT A `catch`, BECAUSE `dismissAll()` CANNOT THROW. It is
 * implemented as `routingQueue.add({ type: 'POP_TO_TOP' })` — no `assertIsReady()` (unlike
 * `goBack()`), and the dispatch happens later, in `routingQueue.run`, outside any `try` here. A
 * `try`/`catch` around it was DEAD CODE, and it was dead in exactly the state its own comment
 * named as its reason for existing: with this screen the only route there is nothing to pop, the
 * queued action is dropped as unhandled, and a screen that renders `null` becomes a permanently
 * blank front door with no recovery. What IS observable is the outcome: a landed pop unmounts this
 * component, and the effect's cleanup cancels the timer. Still mounted a tick later means the pop
 * did nothing, and only then does the fallback run. ⚠️ NOT `router.canDismiss()` either — it
 * answers **false** in this state (measured), so guarding on it routes every launch into the
 * fallback, which is the path with the phantom back chevron.
 *
 * ⚠️ THE TARGET IS `HOME_HREF`, WHICH READS THE TAB TABLE. `/` means "open the app", and the
 * app's home is its first tab. Hardcoding `/account` made this file a second, silent source of
 * truth — repointing it at `/read`, which this paragraph forbids by name, passed every suite in
 * the repo. It must NEVER target the immersive route: that screen is presented over the tabs, and
 * launching into it with nothing beneath is the "cold launch restores an empty player sheet"
 * defect the source app already shipped once. `route-integrity.test.ts` asserts it.
 *
 * ⚠️ THE EFFECT RUNS ON EVERY MOUNT OF `/`, NOT ONLY ON A COLD LAUNCH, AND THAT IS THE INTENDED
 * READING. Browser Back into `/`, and a deep link that arrives while the immersive route is open,
 * each fire another `POP_TO_TOP` — which is what "go to `/`" should do: return to the tab shell.
 * What it does NOT do is reset the tab stack, because `POP_TO_TOP` pops the ROOT stack only. The
 * one in-app caller that needed a reset was `+not-found.tsx`, whose "go home" link pointed here
 * and therefore landed the reader back on whatever pushed settings screen they had been on; it now
 * links to `HOME_HREF` directly, which navigates INSIDE the tab navigator and pops that stack too.
 * Every remaining entry to `/` is the platform opening the app, where resuming the tab you left is
 * the native behaviour, not a bug.
 *
 * ⚠️ IT PAINTS NOTHING, DELIBERATELY, AND ON THE STATIC WEB EXPORT THAT IS A BLANK PAGE UNTIL THE
 * BUNDLE LOADS — measured, and the mechanism is not the obvious one. `expo export --platform web`
 * DOES prerender the destination into `index.html`: the document carries the whole tab shell,
 * 7.7 KB of markup byte-comparable to `account.html`'s, because the anchor materialises underneath
 * this screen. Every text node in it sits inside a subtree the navigator marks
 * `display:none` / `aria-hidden="true"`, since `index` is the TOP of the root stack and this
 * component renders `null`. `account.html` prerenders the identical markup visible. So `/` is the
 * one route on the export whose prerender shows nothing, and no `return` value can change that for
 * the anchor — only content of its OWN would paint.
 *
 * That content would be WRONG content. The palette and the light/dark override are device-local
 * MMKV values, so a static prerender can only ever emit the terracotta-light default and would
 * flash it at the five other palettes and at every dark-mode reader. The pre-hydration paint
 * belongs to `+html.tsx`'s `responsiveBackground`, which answers the one signal that IS available
 * before JS (`prefers-color-scheme`) and exists for exactly this. The window is one 4.9 MB bundle
 * long, it is web-only (native has no prerender and no such gap), and this route dies in 6.1.
 *
 * **The moment `(tabs)` has its own index again — the Read tab, 6.1 — delete this file rather
 * than repointing it**; a group index serving `/` directly is one hop shorter and cannot go stale.
 */
export default function Index() {
  const router = useRouter();

  useEffect(() => {
    router.dismissAll();
    const settle = setTimeout(() => router.replace(HOME_HREF), POP_SETTLE_MS);
    return () => clearTimeout(settle);
  }, [router]);

  return null;
}
