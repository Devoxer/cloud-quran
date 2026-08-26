import * as Linking from 'expo-linking';
import type { NativeIntent } from 'expo-router';

/**
 * Cold-launch path rewrites (Story 17.3.5 follow-up #4).
 *
 * `redirectSystemPath` runs on the URL returned by `Linking.getInitialURL()`
 * (cold-launch deep link from push notifications, universal links, share
 * extensions, etc.). For a stale deep link, landing on a dead route isn't what the
 * user wants — rewrite to the default tab.
 *
 * `initial: false` (post-launch navigation, e.g. deep link arriving while
 * the app is already open) is left untouched.
 *
 * **Note on cold-launch URL state restoration:** Expo Router's persisted
 * navigation state restoration runs through a SEPARATE pipeline that does
 * NOT invoke `redirectSystemPath` (verified empirically at follow-ups
 * #5/#6). That case is handled by the `resolvedBookId === null`
 * dismiss-back useEffect in the root-modal `app/player.tsx` (Story 19.6).
 * Treat this file as the deep-link safety net; the dismiss-back useEffect is
 * the state-restoration safety net.
 *
 * **Native only.** Expo Router does NOT run `redirectSystemPath` on
 * Web — the native-intent pipeline is part of the iOS/Android runtime.
 *
 * **Path shape:** `path` is the raw URL returned by Linking on native —
 * it KEEPS the scheme prefix (e.g. `cloud-quran://some/path`),
 * so a bare `path === '/player'` check would never match a real
 * cold-launch deep link. Parse with `Linking.parse()` and compare the
 * normalized path. Bare-path inputs (defensive — should never happen on
 * native) are matched as a fallback. (Round 3 MED-3 fix.)
 */
export const redirectSystemPath: NativeIntent['redirectSystemPath'] = ({ path, initial }) => {
  if (!initial) return path;
  let normalized: string;
  try {
    const parsed = Linking.parse(path);
    // `parsed.path` strips scheme + host + query; e.g. `player` (cold-launch bare
    // `/player` — the root modal route as of Story 19.6).
    normalized = parsed.path ? `/${parsed.path.replace(/^\/+/, '')}` : path;
  } catch {
    // `Linking.parse` shouldn't throw on a string, but if it does,
    // fall back to the raw path (older `path === '/player'` form).
    normalized = path;
  }
  // ⚠️ story 5-2 review: this rewrote `/player` to `/discover`. BOTH routes are gone —
  // `/player` with the audio feature in 5-1, `/discover` with the wisdom-fruits domain — so it
  // swapped one dead route for another and a cold-launch deep link hit `+not-found` either way.
  // It was unreachable in principle too: the scheme is `cloud-quran`, so a `wisdomfruits://`
  // link never arrives here at all.
  //
  // Cloud Quran publishes no deep links yet, so anything arriving is unknown, and `+not-found`
  // is the honest answer — a real screen, not a silent failure. Epic 6 adds the first real
  // mapping (a verse/surah link); add it HERE and pin it in `route-integrity.test.ts`, which
  // skips `+`-prefixed files by design — which is why this drifted across two stories unseen.
  void normalized;
  return path;
};
