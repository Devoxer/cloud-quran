/**
 * THE AUTH CLIENT (story 5-5) — the app's one connection to the worker's identity provider.
 *
 * ⚠️ NO JSX, AND NO UI IMPORT. `lint:layers` rule 2 forbids `lib/` from importing
 * `@/components`, `@/app` or a react-native UI primitive. Everything here is plain async
 * functions a screen calls; the screen owns the rendering and the copy.
 *
 * ⚠️ TWO MECHANISMS, ONE FUNCTION PER PROVIDER (story 5-5 amendment). Every platform offers the
 * same three methods; only HOW a method runs differs. iOS and Android present a native sheet and
 * send an ID TOKEN. Web and Desktop have no native sheet, so they use Better Auth's standard
 * OAuth REDIRECT. `signInWithApple` / `signInWithGoogle` each pick the mechanism themselves, so
 * no screen ever learns the difference and no screen can accidentally hide a button by branching
 * on the platform — which is the regression this amendment exists to prevent.
 *
 * ⚠️ THIS MODULE IS NOT THE WORKER RPC CLIENT. `lib/api.ts` is (and `lint:layers` rule 6 keeps it
 * the only one). They are two different transports on purpose: `authClient` owns a cookie jar in
 * SecureStore, `api` owns the typed Hono routes and BORROWS the cookie from here.
 *
 * ── Two upstream behaviours this file is built around, both measured, not assumed ────────────
 *
 * 1. **ONE PATH — `signIn.social`, WITH THE SESSION COOKIE ATTACHED BY HAND. `linkSocial` is
 *    deliberately NOT used, and deleting it is what fixed a production defect.**
 *
 *    `@better-auth/expo@1.7.1`'s fetch plugin attaches the stored session cookie to an id-token
 *    request only when the path ends `/link-social` — a CLIENT-side path check, not a server
 *    constraint. That is the ONLY reason this file used to prefer `linkSocial`: it was the sole
 *    way the guest's session reached the worker at all, and it does keep the same `user.id`.
 *
 *    It also produces DUPLICATE ACCOUNTS, observed in production 2026-08-25. `/link-social`
 *    compares the incoming provider email only against `session.user.email` and never asks
 *    whether that address already belongs to someone else — and `allowDifferentEmails` has to be
 *    on, because a guest's address is a synthetic `temp@`. So a guest signing in with an address
 *    an existing account already holds gets the provider attached to the ANONYMOUS user, and the
 *    reader ends up with two accounts: one reachable by email, one stranded on `temp@`.
 *
 *    `/sign-in/social` resolves by verified email instead (`handleOAuthUserInfo` →
 *    `findUserByEmail` → attach the account to the user that already exists), and it IS in the
 *    `anonymous()` plugin's hook matcher, so `onLinkAccount` fires and the worker's
 *    `reassignUserRows` carries the guest's rows INTO that account. Measured end to end against a
 *    real Better Auth server, guest + pre-existing OTP account on the same address:
 *    `/link-social` forked (two ids, `temp@` kept, hook never fired); `/sign-in/social` with the
 *    cookie landed in the existing account with the real email and fired `guest → existing`.
 *
 *    So the cookie is attached explicitly, exactly as `lib/api.ts` does it. The expo plugin only
 *    ADDS a cookie header when its own path check passes; it never removes one already present
 *    (`options.headers = { ...options.headers, ...(cookie ? { cookie } : {}) }`), so a header set
 *    here survives untouched.
 *
 * 2. **THE SESSION STORE CAN MISS A SIGN-IN (better-auth #10545, open since 2026-07-27).**
 *    `getSessionAtom` registers the `$sessionSignal → refetch` subscription inside nanostores'
 *    `onMount`, so a mount/unmount imbalance leaves the signal unbound and `useSession` never
 *    updates after a successful sign-in. Reproduced in a harness: with the store unmounted, a
 *    sign-in that returns a real user leaves the atom at `data: null` forever; one `refetch()`
 *    fixes it. `refreshSession()` below is that call, and every entry point here ends with it.
 *    Treat it as PERMANENT — it costs one request and it is the difference between a working
 *    sign-in and a screen that never changes.
 *
 * ⚠️ AND THE ORIGIN HEADER. Better Auth refuses any cookie-bearing POST whose `Origin` is not in
 * `trustedOrigins` (`MISSING_OR_NULL_ORIGIN`). The expo plugin sends `expo-origin` — which the
 * worker's expo plugin promotes to `Origin` — on every request EXCEPT the id-token ones, which
 * is exactly the id-token call this module makes on `/sign-in/social`. The default header below
 * closes that gap; without it, Apple and Google sign-in 403 for a reason that names neither.
 * (It used to be `/link-social` that hit this; the route changed, the gap did not — the plugin's
 * rule is about the PRESENCE of `idToken`, not about which path receives it.)
 */
import { expoClient, getSetCookie } from '@better-auth/expo/client';
import { anonymousClient, emailOTPClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import { teardownAccountScopedState } from './accountTeardown';
import { config } from './config';
import { checkConnectivity } from './connectivity';
import * as secureStore from './secureStore';

/**
 * The deep-link scheme, and the origin the worker trusts. Must match `app.json`'s `scheme` and
 * `apps/worker/src/lib/auth.ts`'s `APP_SCHEME_ORIGIN` — three copies of one string, because it
 * is a wire constant on both sides of a network boundary.
 */
const APP_SCHEME = 'cloud-quran';
const APP_ORIGIN = `${APP_SCHEME}://`;

/**
 * The in-app path a provider redirect returns to. Sent as-is to the worker (the expo client
 * rewrites a leading-slash `callbackURL` through `Linking.createURL`), and expanded with the SAME
 * call for the browser's return URL — one constant, so the two cannot drift.
 */
const NATIVE_CALLBACK_PATH = '/account';

/**
 * The key `@better-auth/expo` keeps its cookie jar under: `${storagePrefix}_cookie`, and the
 * prefix defaults to `better-auth`. Hard-coded because the plugin does not export it, and read by
 * `finishNativeRedirect` when it harvests the session out of the deep link.
 */
const COOKIE_STORAGE_KEY = 'better-auth_cookie';

/**
 * Is this address one the SERVER invented rather than one the user gave us?
 *
 * ⚠️ A WIRE CONSTANT, like the scheme above. Better Auth's `anonymous()` plugin has to put
 * something in the mandatory `user.email` column, and its default is `temp@<random>.com`. That
 * address is never shown, never mailed and never typed.
 *
 * ⚠️ IT IS A DISPLAY GUARD NOW, NOT A CORRECTION. It existed because `/link-social` deliberately
 * never overwrote `email`, so an Apple or Google user carried the synthetic one forever. Since
 * amendment (b) upstream sets the real address on `/sign-in/social`, so a signed-in user should
 * never have one — this is what keeps the account row from displaying `temp@…` if that ever
 * stops being true, and it is what distinguishes a guest from an account elsewhere.
 *
 * Matches `getAnonUserEmail` in `better-auth/plugins/anonymous`; if that default ever changes,
 * this is the line that has to change with it.
 */
export function isPlaceholderEmail(email: string | null | undefined): boolean {
  return typeof email === 'string' && /^temp(-[^@]+)?@/i.test(email);
}

/**
 * `@better-auth/expo`'s storage contract. `lib/secureStore.ts` already wraps Keychain/Keystore
 * with a documented `localStorage` fallback on web; this adapts its async-only API to the
 * sync+async pair the plugin asks for. The SYNC reads intentionally answer `null`: the plugin
 * only uses them opportunistically and always has an async path, and inventing a synchronous
 * cache here would be a second place a stale cookie could live.
 */
const storage = {
  getItem: () => null,
  setItem: () => {},
  getItemAsync: (key: string) => secureStore.getItem(key),
  setItemAsync: (key: string, value: string) => secureStore.setItem(key, value),
};

export const authClient = createAuthClient({
  baseURL: `${config.api.baseUrl}/api/auth`,
  fetchOptions: {
    // See the ORIGIN note in the header. Survives the expo plugin's own header spread.
    //
    // ⚠️ NATIVE ONLY, AND THE WEB SMOKE IS WHAT PROVED IT. A browser sets `Origin` itself and
    // cannot be made to lie about it, so this header buys nothing on web — and it costs
    // everything: it is not a CORS-safelisted header, so its presence makes the preflight demand
    // `expo-origin` in `Access-Control-Allow-Headers`, and without that every single auth request
    // from the web build is blocked before it is sent. Observed exactly that
    // ("Request header field expo-origin is not allowed by Access-Control-Allow-Headers"), with
    // the worker's own CORS middleware answering 204 to the preflight and never seeing the call.
    // Widening the worker's allowHeaders would also work; not sending a pointless header is the
    // smaller change and leaves the browser surface narrower.
    headers: Platform.OS === 'web' ? {} : { 'expo-origin': APP_ORIGIN },
  },
  plugins: [expoClient({ scheme: APP_SCHEME, storage }), anonymousClient(), emailOTPClient()],
});

/**
 * The live session, as a React hook.
 *
 * ⚠️ `better-auth/react`'s client, not `better-auth/client`'s. The vanilla client exposes
 * `useSession` as a nanostores ATOM, which a component cannot call — reaching for it there gives
 * a "not a function" at render. The react entry wraps every plugin atom in a real hook and ships
 * its own `useStore`, so no extra dependency is involved.
 *
 * `data` is `null` for a signed-out caller AND during the first read; `isPending` separates them.
 * Nothing in this app may gate its first frame on either — see `app/_layout.tsx`.
 */
export function useSession() {
  return authClient.useSession();
}

/**
 * Force the session store to re-read from the server. The #10545 workaround — see the header.
 *
 * Optional-chained the whole way down: on a cold path the atom may not exist yet, and a sign-in
 * must never fail because its follow-up refresh could not run.
 */
export async function refreshSession({ bypassCache = false } = {}): Promise<void> {
  // ⚠️ `bypassCache` IS REQUIRED AFTER ANYTHING THAT MUTATES THE USER ROW, and its absence is a
  // bug two of this story's own decisions created between them. The worker runs with
  // `session.cookieCache` ENABLED — a signed cookie carrying a snapshot of the session, so a
  // returning reader costs no D1 read. A social sign-in then changes which USER the caller is
  // WITHOUT the app noticing, so that snapshot goes on claiming `isAnonymous: true` until it
  // expires. A plain `refetch()` is answered from it, so the app still believes the reader is a
  // guest: the account screen renders the "Sign In" row, and a successful Apple or Google
  // sign-in is indistinguishable from being bounced back to the sign-in screen. Reported from a
  // real device on 2026-08-25 — the link had SUCCEEDED, with the account row written and
  // `is_anonymous` already 0 in production.
  //
  // ⚠️ STILL REQUIRED AFTER THE MOVE TO `/sign-in/social`, for a DIFFERENT reason. That route
  // does mint a new session — but the cookie cache is keyed per session token and the client's
  // `getSession` may still be answered from the previous one within the same tick. Bypassing is
  // one request and removes the question.
  //
  // Email OTP is unaffected: it mints a NEW session whose cookie is fresh by construction, which
  // is exactly why that flow worked while both social flows looked broken.
  //
  // ⚠️ THE WHOLE BODY IS GUARDED, BECAUSE ITS DOCBLOCK PROMISES SOMETHING THE CODE DID NOT DO.
  // `atoms.session?.get()` was optional-chained on the ATOM but not on `get()`, and every call
  // site `await`s this outside a `try` — so one failed request turned a sign-in that had already
  // succeeded into a visible "Sign-in didn't work". A refresh is a best-effort re-read: the
  // worst honest outcome is a stale screen the next `useSession` tick fixes, never a failure
  // reported for something that worked.
  try {
    if (bypassCache) await authClient.getSession({ query: { disableCookieCache: true } });
    await authClient.$store.atoms.session?.get?.()?.refetch?.();
  } catch (error) {
    if (__DEV__) console.warn('[auth] session refresh failed; the screen may lag a tick', error);
  }
}

/**
 * Is the device DEFINITELY offline?
 *
 * ⚠️ ONLY AN EXPLICIT `false`, AND A THROWING PROBE ANSWERS "NO". `checkConnectivity()` reports
 * `null` on either flag while netinfo's reachability probe is still in flight, and it can reject
 * outright — and this predicate gates account DELETION, the one flow Apple guideline 5.1.1(v)
 * requires to always be reachable. Letting an unusable probe answer "offline" would block a
 * deletion on a perfectly connected device, which is strictly worse than letting the request
 * itself discover there is no network.
 */
async function isDefinitelyOffline(): Promise<boolean> {
  try {
    const { isConnected, isInternetReachable } = await checkConnectivity();
    return isConnected === false || isInternetReachable === false;
  } catch {
    return false;
  }
}

/** Better Auth's user, as much of it as this module cares about. */
type SessionUser = { id: string; isAnonymous?: boolean | null; email?: string | null };

/**
 * The answer to "who is calling", with **"could not tell" kept distinct from "nobody"**.
 *
 * ⚠️ THIS DISTINCTION IS THE WHOLE POINT OF THE TYPE, AND COLLAPSING IT COSTS DATA. An earlier
 * revision destructured only `data` and discarded `error`, so a network blip or a 5xx read
 * identically to "there is no session" — and `ensureAnonymousSession` would then mint a
 * BRAND-NEW anonymous user over the existing guest, stranding their bookmarks and reading
 * position on an id the device has just forgotten. It refuses to act on `unknown` instead.
 *
 * It has ONE caller now. It used to have two: `attachProvider` read the session to choose between
 * `linkSocial` and `signIn.social`, and that choice is gone — there is one route, and the worker
 * resolves the account. Kept because minting a guest is still a decision that must not be made on
 * a guess.
 */
type SessionRead =
  | { state: 'user'; user: SessionUser }
  | { state: 'none' }
  /** The server could not be reached, or answered an error. We do NOT know that there is no user. */
  | { state: 'unknown' };

/**
 * @param bypassCache Ask the DATABASE rather than the signed cookie snapshot.
 *
 * ⚠️ THE DEFAULT IS THE CACHED READ, AND EXACTLY ONE CALLER MUST NOT TAKE IT. The worker runs with
 * `session.cookieCache` enabled, so an ordinary `getSession()` can be answered from a 15-minute-old
 * copy — which is the right trade for `ensureAnonymousSession`, whose question is "is there a
 * guest at all". It is the wrong trade for `deleteAccount`, which asks the same function whether an
 * ACCOUNT still exists after a lost response: a stale snapshot answers about a session that may
 * already be gone from the store. The 5-7 production defect was this exact split in the other
 * direction — the cache kept a DELETED user's session working for its whole lifetime.
 */
async function readSession({ bypassCache = false } = {}): Promise<SessionRead> {
  try {
    const { data, error } = await authClient.getSession(
      bypassCache ? { query: { disableCookieCache: true } } : undefined
    );
    if (error) return { state: 'unknown' };
    return data?.user ? { state: 'user', user: data.user } : { state: 'none' };
  } catch {
    return { state: 'unknown' };
  }
}

/**
 * Mint an anonymous session if there is none.
 *
 * ⚠️ FIRE-AND-FORGET, AND NOTHING WAITS FOR IT. Cloud Quran paints `(tabs)` on the first frame
 * with no session at all — the reading surfaces are local-first and need no identity. A failure
 * here (offline, worker down) is therefore not an error state: the app is fully usable and the
 * next launch tries again. That is why this returns `void` and swallows.
 */
export async function ensureAnonymousSession({ force = false } = {}): Promise<void> {
  try {
    // ⚠️ ONLY on a definite `none` — UNLESS the caller knows there is nothing to protect. On
    // `unknown` (offline, worker down, a 500) doing nothing is the correct move at BOOT: minting
    // would replace a guest who still exists server-side with a fresh empty one, which is data
    // loss dressed up as a retry.
    //
    // ⚠️ `force` EXISTS FOR EXACTLY ONE CALLER, AND WITHOUT IT THAT CALLER'S BUG COMES BACK.
    // `signOut` has just destroyed the session on purpose; there is no guest left to overwrite,
    // so refusing on an unreadable read leaves the app with NO identity until the next cold
    // launch — which is the precise failure the re-mint was added to prevent. The guard is about
    // protecting an EXISTING session, and after a sign-out there is none.
    if (!force && (await readSession()).state !== 'none') return;
    await authClient.signIn.anonymous();
    await refreshSession();
  } catch {
    // Offline first launch. Nothing to report and nothing to retry right now.
  }
}

/**
 * The two lazily-required native modules, typed. Aliases exist so the `require` call sites stay on
 * one line — see the note in `signInWithApple`.
 */
type AppleAuthModule = typeof import('expo-apple-authentication');
type GoogleSignInModule = typeof import('@react-native-google-signin/google-signin');
type WebBrowserModule = typeof import('expo-web-browser');

/** What every sign-in entry point answers. `cancelled` is a user action, not a failure. */
export type SignInResult =
  | { status: 'signed-in' }
  | { status: 'cancelled' }
  /**
   * The browser is being sent to the provider. Web and Desktop only — the page is about to be
   * replaced, so there is no "afterwards" in this JS context. Never treat it as success.
   */
  | { status: 'redirecting' }
  | { status: 'failed'; code?: string };

/**
 * Where the provider should send the browser back to, after the worker's callback.
 *
 * ⚠️ ELECTRON IS NOT A BROWSER TAB, AND `Platform.OS` CANNOT TELL YOU THAT. The desktop build is
 * the Expo WEB export inside a renderer, so it reports `web` — but its window has no address bar
 * to land on and the app is not served from an origin the provider can redirect to. The preload
 * sets `window.cloudQuran.platform = 'desktop'`, and the main process registers the
 * `cloud-quran://` protocol so the OS hands the callback back to the app
 * (`apps/desktop/src/authCallback.ts`). A plain browser gets its own origin instead.
 */
function redirectCallbackURL(): string {
  const bridge = (globalThis as { cloudQuran?: { platform?: string } }).cloudQuran;
  if (bridge?.platform === 'desktop') return `${APP_ORIGIN}auth-callback`;

  // ⚠️ NATIVE SENDS A PATH AND LETS THE PLUGIN EXPAND IT. This is the documented Expo shape, and
  // hand-building the deep link here is what broke Apple-on-Android. `@better-auth/expo`'s client
  // rewrites ONLY a `callbackURL` that starts with `/`, through `Linking.createURL` — which knows
  // what the app is actually running as. That matters: a DEV CLIENT is reached over
  // `exp+cloud-quran://…`, a standalone build over `cloud-quran:///…`, and Expo Go over
  // `exp://<ip>:8081/--/…`. A literal string written here is right for at most one of those.
  //
  // ⚠️ AND THE BRANCH IS `Platform.OS`, NOT A `globalThis.location` SNIFF. The previous revision
  // preferred `location.origin` when present and fell back to the scheme otherwise, which is a
  // guess about the runtime rather than a statement of it — and it is invisible to the suite,
  // because `auth.test.ts` defines `globalThis.location` for every case, so the Android test
  // silently exercised the WEB branch. `Platform.OS` is authoritative on every platform.
  //
  // Web keeps a full absolute URL: the expo plugin is inert there, and a bare path would be
  // resolved against the API's base URL — sending the reader to the worker's host, not the app's.
  if (Platform.OS !== 'web') return NATIVE_CALLBACK_PATH;
  const origin = (globalThis as { location?: { origin?: string } }).location?.origin;
  return `${origin ?? APP_ORIGIN}${NATIVE_CALLBACK_PATH}`;
}

/**
 * Finish a NATIVE redirect: the in-app browser has closed and handed control back.
 *
 * ⚠️ THE RESULT USED TO BE DISCARDED, AND THAT LEFT ANDROID SIGN-IN VISIBLY BROKEN. The function
 * returned `redirecting`, which the sign-in screen deliberately ignores because on WEB the page is
 * about to be replaced — but native has no navigation: the browser closes, this promise resolves,
 * and the user is looking at the sign-in screen with a spinning button. The sign-in had SUCCEEDED
 * server-side. Nothing refreshed the session and nothing navigated.
 *
 * ⚠️ AND `success` IS NOT ENOUGH ON ITS OWN — THE SESSION ARRIVES IN THE URL. There is no shared
 * cookie jar on native, so the worker's `@better-auth/expo` server plugin appends the `Set-Cookie`
 * value as a `cookie` query parameter on the deep link (verified in its `after` hook on
 * `/callback/*`). The plugin's own client hook would harvest it — but only inside the browser call
 * it makes itself, which never fired on Android, which is why this module opens the browser. So
 * this reads the parameter and writes the jar the same way, through the plugin's own exported
 * `getSetCookie` rather than a second parser.
 */
async function finishNativeRedirect(
  result: Awaited<ReturnType<WebBrowserModule['openAuthSessionAsync']>>
): Promise<SignInResult> {
  // `cancel` = the user dismissed it; `dismiss` = the app closed it. Neither is a failure, and
  // painting an error for a deliberate back-tap is the thing the I/O matrix forbids.
  if (result.type === 'cancel' || result.type === 'dismiss') return { status: 'cancelled' };
  if (result.type !== 'success') {
    // `locked` (another auth session already open) and anything upstream adds later. Not silent.
    if (__DEV__) console.error('[auth] redirect ended without success', result.type);
    return { status: 'failed', code: result.type };
  }

  try {
    const cookie = new URL(result.url).searchParams.get('cookie');
    if (cookie) {
      const previous = await secureStore.getItem(COOKIE_STORAGE_KEY);
      await secureStore.setItem(COOKIE_STORAGE_KEY, getSetCookie(cookie, previous ?? undefined));
    } else if (__DEV__) {
      // The worker only appends it when the deep link is a TRUSTED origin. A dev client is
      // reached over `exp+cloud-quran://`, which is not in `trustedOrigins`, so this is the
      // expected shape there — and the reason social redirect must be smoked on a real build.
      console.warn('[auth] redirect returned no cookie parameter', result.url);
    }
  } catch (error) {
    // A malformed return URL is not worth failing a completed sign-in over: the refresh below
    // still asks the server who we are, and answers honestly if the answer is nobody.
    //
    // ⚠️ IT IS LOGGED, THOUGH. A silent catch here turns "the session could not be stored" into
    // "you are somehow still signed out", which is indistinguishable from a wrong password and
    // impossible to diagnose from a device. The test suite found this the hard way: a mock
    // missing `getSetCookie` made this branch throw, and the only symptom was an assertion about
    // a call that never happened.
    if (__DEV__) console.error('[auth] could not store the returned session cookie', error);
  }

  await refreshSession({ bypassCache: true });
  return { status: 'signed-in' };
}

/**
 * Start the OAuth REDIRECT for web and desktop.
 *
 * ⚠️ ON WEB IT CANNOT RETURN A SIGNED-IN RESULT. Better Auth's client sets `window.location.href`,
 * so the continuation is a whole new page load — the session is established when the app comes
 * back, not when this promise settles. Reporting `signed-in` there would be a lie the sign-in
 * screen acts on; `redirecting` is the honest answer and the screen leaves the button busy.
 * NATIVE is the opposite: see `finishNativeRedirect` above.
 *
 * ⚠️ THE SAME ROUTE THE NATIVE LEG USES, AND FOR THE SAME REASON. `/link-social` would forfeit
 * the resolve-by-verified-email that makes one human one account (see behaviour 1 in the header).
 * The browser sends its own cookie, so the guest's session is visible without any help — and the
 * `anonymous()` plugin's `before` hook on `/sign-in/social` stashes the guest's id in the OAuth
 * state, which is what lets the callback find them again if the cookie does not survive the round
 * trip. That hook matches `/sign-in/social` and nothing else, so this is the only route on which
 * a guest's rows can follow them through a redirect at all.
 */
async function redirectToProvider(provider: 'apple' | 'google'): Promise<SignInResult> {
  const callbackURL = redirectCallbackURL();
  const { data, error } = await authClient.signIn.social({ provider, callbackURL });
  // ⚠️ OPEN THE BROWSER OURSELVES ON NATIVE. `@better-auth/expo`'s client is supposed to do this
  // in an after-hook when the response carries `redirect: true` — and the response DOES
  // (`{ url, redirect: true }`, verified against the deployed worker). On Android it never
  // launched: no CustomTabs intent in logcat, focus never left MainActivity, no error surfaced,
  // and the user simply saw nothing happen. Rather than keep reverse-engineering a hook whose
  // internals are not observable from here, the call is explicit: it is one line, it is testable,
  // and "nothing happened" is the worst failure mode a sign-in button can have.
  //
  // Web is untouched — the browser navigates itself there, and `Platform.OS === 'web'` never
  // reaches this branch with a URL to open.
  if (!error && Platform.OS !== 'web' && data?.url) {
    // biome-ignore lint/style/noCommonJs: lazy platform module — see `signInWithApple`.
    const browser: WebBrowserModule = require('expo-web-browser');
    // ⚠️ THE RETURN URL MUST BE THE **EXPANDED** CALLBACK, NOT THE BARE SCHEME. `openAuthSessionAsync`
    // watches for this exact URL to know the flow is over, and `@better-auth/expo` rewrites the
    // `/account` we sent through `Linking.createURL` — so the browser is actually redirected to
    // `cloud-quran:///account` (or `exp+cloud-quran://…` under a dev client). Passing `APP_ORIGIN`
    // relied on prefix matching to save it. Computing it with the SAME call the plugin makes means
    // the two agree by construction rather than by luck.
    const returnUrl = Linking.createURL(NATIVE_CALLBACK_PATH);
    const result = await browser.openAuthSessionAsync(data.url, returnUrl);
    return finishNativeRedirect(result);
  }
  if (error) {
    // ⚠️ LOG THE RETURNED ERROR, NOT JUST A THROWN ONE. Better Auth's client RESOLVES with
    // `{ error }` rather than raising, so a `catch` at the call site never sees this — which is
    // how Apple-for-Android stayed undiagnosed across three attempts: no exception, no request in
    // `wrangler tail` when the client fails before sending, and a screen that says "try again".
    // The code and message are the only things that name the cause.
    if (__DEV__) console.error('[auth] redirect failed', provider, callbackURL, error);
    return { status: 'failed', code: error.code };
  }
  return { status: 'redirecting' };
}

/**
 * Sign in with a native provider id token.
 *
 * ⚠️ THE USER ID MAY CHANGE HERE, AND THAT IS NOW CORRECT. `/sign-in/social` resolves the caller
 * to whichever account owns the verified address — an existing one, or a fresh one when nobody
 * holds it — so the principal afterwards is frequently NOT the guest. That is exactly what makes
 * one human one account, and it is safe because the worker's `onLinkAccount` → `reassignUserRows`
 * merges the guest's rows into the destination before the anonymous user is deleted. The old
 * `linkSocial` path preserved the id and forked the account instead.
 */
async function attachProvider(
  provider: 'apple' | 'google',
  token: string,
  nonce?: string
): Promise<SignInResult> {
  const idToken = nonce ? { token, nonce } : { token };
  // ⚠️ THE COOKIE IS THE POINT OF THIS CALL, AND THE EXPO PLUGIN WILL NOT SEND IT ON THIS PATH.
  // Without it the worker sees no guest: `onLinkAccount` never fires, `reassignUserRows` never
  // runs, and the reader's bookmarks and reading position stay on an anonymous user that is then
  // deleted. Read at call time — the same way `lib/api.ts` does — so a session minted moments ago
  // is already in it. An EMPTY jar is not an error: a caller with genuinely no session is just
  // signing in, which this same route handles.
  const cookie = await authClient.getCookie();
  const { error } = await authClient.signIn.social({
    provider,
    idToken,
    fetchOptions: cookie ? { headers: { cookie } } : undefined,
  });
  if (error) return { status: 'failed', code: error.code };
  await refreshSession({ bypassCache: true });
  return { status: 'signed-in' };
}

/**
 * Sign in with Apple, natively.
 *
 * ⚠️ THE NONCE IS `expo-crypto`, NOT `Math.random()`. Story 4-2's review found exactly that here
 * and called it a security fix: the nonce is what binds Apple's id token to THIS request, so a
 * predictable one lets a token captured elsewhere be replayed. `AppleAuthentication` hashes the
 * `nonce` it is given with SHA-256 before sending it, and Better Auth's apple provider compares
 * `exact-or-sha256`, so the RAW value is what goes to the worker.
 *
 * The module is imported lazily because `expo-apple-authentication` is iOS-only and the screen
 * that calls this is not.
 */
export async function signInWithApple(): Promise<SignInResult> {
  // ⚠️ THE PLATFORM PICKS THE MECHANISM HERE, AND NOWHERE ELSE. A screen calling this must not
  // know which one it got — see the header. `redirectCallbackURL` tells the browser and the
  // Electron renderer apart.
  //
  // ⚠️ `!== 'ios'`, NOT `=== 'web'`, AND THE DIFFERENCE IS ANDROID. This read `=== 'web'`, so
  // ANDROID fell through to the native branch below — `expo-apple-authentication`, which is
  // iOS-only and has no Android implementation at all. Apple on Android was broken by
  // construction: the button rendered, the tap threw inside a module that cannot run there, and
  // the screen said "Sign-in didn't work. Please try again." Reported from the emulator
  // 2026-08-25. Android has no native Apple sheet, so the redirect IS its mechanism — which is
  // exactly what the parity rule says: a platform may change HOW a method runs, never whether it
  // is offered. Only iOS has a sheet; everything else redirects.
  if (Platform.OS !== 'ios') return redirectToProvider('apple');
  // `require`, not `await import()` — the convention `lib/language.ts:440` documents, for the same
  // reason: Jest's CJS runtime cannot execute a dynamic import without --experimental-vm-modules,
  // so an `await import()` here makes this whole function unreachable from a test. The laziness is
  // what matters (the module is iOS-only and the calling screen is not), and `require` keeps it.
  //
  // ⚠️ The type annotation is a named alias rather than an inline `as typeof import(...)` so the
  // call fits on ONE line. A `biome-ignore` only suppresses the line directly beneath it, and the
  // inline cast pushes `require(` onto a wrapped second line — where the suppression misses it and
  // biome then reports BOTH the unsuppressed rule and the now-unused suppression.
  // biome-ignore lint/style/noCommonJs: lazy platform module — see above.
  const AppleAuthentication: AppleAuthModule = require('expo-apple-authentication');
  const nonce = Crypto.randomUUID();
  // ⚠️ FAIL RATHER THAN SEND AN UNBOUND TOKEN. The nonce is the ONLY thing tying Apple's id token
  // to this request; without it a token captured elsewhere replays cleanly. `attachProvider`
  // omits the field entirely when the value is falsy, so a `randomUUID()` that answers nothing —
  // an unlinked native module, a stripped build — would silently downgrade every Apple sign-in
  // from bound to replayable, with no error and no visible difference. Story 4-2's review called
  // the predictable-nonce version of this a security fix; the absent-nonce version is worse.
  if (!nonce) return { status: 'failed', code: 'NO_NONCE' };
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce,
    });
    if (!credential.identityToken) return { status: 'failed', code: 'NO_IDENTITY_TOKEN' };
    return await attachProvider('apple', credential.identityToken, nonce);
  } catch (error) {
    // Apple reports a dismissed sheet as a thrown ERR_REQUEST_CANCELED, not a null result.
    if ((error as { code?: string })?.code === 'ERR_REQUEST_CANCELED') {
      return { status: 'cancelled' };
    }
    return { status: 'failed' };
  }
}

/**
 * Sign in with Google, natively — no browser hop.
 *
 * `@react-native-google-signin` returns the id token from the native SDK; the worker verifies it
 * against Google's JWKS with the platform client ids as the audience. They are NOT secrets (they
 * ship in the binary); the worker holds the same list as `GOOGLE_CLIENT_IDS`. Read through
 * `lib/config.ts` rather than `process.env` — see the note there on build-time inlining.
 */
export async function signInWithGoogle(): Promise<SignInResult> {
  // Same rule as Apple: web and desktop redirect, native uses the platform's own sheet.
  if (Platform.OS === 'web') return redirectToProvider('google');
  // `require` for the same reason as `signInWithApple` above, one line for the same reason too.
  // biome-ignore lint/style/noCommonJs: lazy platform module — see above.
  const google: GoogleSignInModule = require('@react-native-google-signin/google-signin');
  const { GoogleSignin, statusCodes } = google;
  try {
    GoogleSignin.configure({
      webClientId: config.google.webClientId || undefined,
      iosClientId: config.google.iosClientId || undefined,
    });
    await GoogleSignin.hasPlayServices();
    const response = await GoogleSignin.signIn();
    if (response.type === 'cancelled') return { status: 'cancelled' };
    const token = response.data?.idToken;
    if (!token) return { status: 'failed', code: 'NO_IDENTITY_TOKEN' };
    return await attachProvider('google', token);
  } catch (error) {
    // ⚠️ OPTIONAL-CHAINED, AND THE CODE MUST BE PRESENT. A bare `statusCodes.SIGN_IN_CANCELLED`
    // throws a TypeError when the module shape differs from what is expected — and it throws
    // INSIDE the catch block, so it escapes this function entirely and surfaces as an unhandled
    // rejection instead of a result. But optional-chaining ALONE swaps one silent failure for
    // another: with `statusCodes` absent, both sides evaluate to `undefined` and every ordinary
    // error — Play Services missing, no network — is reported as "the user cancelled", so the
    // button appears inert and nothing is ever shown. Requiring a real code closes both.
    const code = (error as { code?: string })?.code;
    if (code !== undefined && code === statusCodes?.SIGN_IN_CANCELLED) {
      return { status: 'cancelled' };
    }
    return { status: 'failed' };
  }
}

/**
 * What asking for a code can answer.
 *
 * ⚠️ ITS OWN TYPE, NOT `SignInResult`. Sending a code creates no session, and an earlier revision
 * returned `{ status: 'signed-in' }` here — a value whose name contradicts the state it
 * describes, one careless `finish(result)` away from navigating a signed-out user to a screen
 * that claims otherwise.
 */
export type CodeRequestResult = { status: 'code-sent' } | { status: 'failed'; code?: string };

/** Ask the worker to email a 6-digit code. No session exists yet when this succeeds. */
export async function requestEmailCode(email: string): Promise<CodeRequestResult> {
  const { error } = await authClient.emailOtp.sendVerificationOtp({ email, type: 'sign-in' });
  if (error) return { status: 'failed', code: error.code };
  return { status: 'code-sent' };
}

/**
 * Exchange a 6-digit code for a session.
 *
 * Unlike the social paths this DOES mint a new user id — Better Auth has no "link an email to
 * the current user" flow. The worker's `onLinkAccount` hook moves the guest's rows across before
 * the anonymous user is deleted, which is what makes that safe. See
 * `apps/worker/src/db/queries.ts` → `reassignUserRows`.
 */
export async function verifyEmailCode(email: string, otp: string): Promise<SignInResult> {
  const { error } = await authClient.signIn.emailOtp({ email, otp });
  if (error) return { status: 'failed', code: error.code };
  await refreshSession();
  return { status: 'signed-in' };
}

/**
 * End the session, tearing the device down first.
 *
 * ⚠️ `teardownAccountScopedState()` IS CALLED HERE, NOT BY THE SCREEN. It is the ONE
 * account-scoped local teardown — playback, caches, the Sentry identity — and the failure it
 * exists to prevent is a departing user's state leaking into the next account on the same JS
 * session. Putting the call at the button would let the next sign-out surface forget it, which
 * is exactly how the second copy appeared last time. One caller, no second copy.
 *
 * ORDER: tear down, then end the session. The reverse leaves the engine briefly writing progress
 * against a session that is already gone.
 */
export async function signOut(): Promise<void> {
  await teardownAccountScopedState();
  await authClient.signOut();
  // ⚠️ ANONYMOUS-FIRST MEANS THERE IS ALWAYS AN IDENTITY, INCLUDING AFTER SIGNING OUT. Without
  // this the app is left with NO session until the next cold launch (the boot effect runs on
  // mount and nothing else calls it), so every scoped write would 401 in the meantime — "signed
  // out" would quietly mean "sync broken until you restart". Observed in the web smoke. The cost
  // is one user row per explicit sign-out, which is negligible next to the unauthenticated
  // minting hole already recorded in deferred-work.md.
  //
  // ⚠️ `force`, BECAUSE THE ORDINARY GUARD WOULD DEFEAT THIS. `ensureAnonymousSession` refuses
  // when the session read answers `unknown`, to avoid minting over a guest it merely could not
  // see — but the session was just deliberately destroyed, so there is nothing to protect and a
  // transient read error would leave the app with no identity at all.
  await ensureAnonymousSession({ force: true });
  await refreshSession();
}

/** What deleting an account can answer. `offline` is a refusal, not a failure — nothing was tried. */
export type DeleteAccountResult =
  | { status: 'deleted' }
  /** The device is definitely offline. Nothing was sent and nothing local was touched. */
  | { status: 'offline' }
  | { status: 'failed'; code?: string };

/**
 * Delete the account and everything in it, in one in-app action (story 5-7, FR28a).
 *
 * ⚠️ APPLE GUIDELINE 5.1.1(v) IS WHY THIS IS A FUNCTION AND NOT A SUPPORT EMAIL. Deletion has to
 * be initiated AND completed inside the app, with no web form and no contact address. The server
 * half is Better Auth's `/delete-user`, whose `beforeDelete` hook purges the four synced tables
 * and the write-budget row before upstream takes the user, its sessions and its provider links —
 * see `apps/worker/src/lib/auth.ts`. There is deliberately no second route: the worker's 501
 * `POST /api/account/delete` stub was DELETED rather than filled.
 *
 * ⚠️ THE ORDER IS THE REVERSE OF `signOut`'s, ON PURPOSE, AND THIS IS THE ONE PLACE THE TWO
 * DIVERGE. `signOut` above tears the device down FIRST so the audio engine cannot write progress
 * against a session that is about to end. Deletion cannot afford that ordering: the I/O matrix
 * requires that a failure leave the reader signed in with NOTHING destroyed locally, and a
 * teardown clears the durable write outbox — so tearing down before a delete that then fails would
 * discard queued writes belonging to an account that still exists. The server is therefore asked
 * first, and the device is only torn down once the account is genuinely gone. The window this
 * trades away is one request wide and belongs to a user who no longer exists.
 *
 * ⚠️ REFUSED WHILE OFFLINE, BEFORE ANYTHING IS TOUCHED — BUT NEVER BLOCKED BY THE PROBE ITSELF.
 * A local-only delete would leave the device saying "gone" and the server saying otherwise, which
 * the matrix forbids outright. Only an EXPLICIT `false` counts: netinfo reports `null` while its
 * reachability probe is still running, and a probe that THROWS must not take the deletion path
 * down with it — this is the one flow Apple requires to always be available, so an unusable
 * connectivity check means "proceed and let the request decide", never "refuse".
 *
 * ⚠️ A REFUSAL AND A LOST RESPONSE ARE DIFFERENT ANSWERS, AND TELLING THEM APART IS WHAT THIS
 * FUNCTION GETS WRONG IF IT IS WRITTEN THE OBVIOUS WAY. It used to re-check the session after ANY
 * error and treat "no user" as proof the deletion had landed — but `readSession()` answers `none`
 * whenever `data.user` is absent, which is precisely what an EXPIRED OR REVOKED session produces,
 * and that is the most likely reason `/delete-user` refuses in the first place. So a reader whose
 * session had lapsed was told "your account and its data are gone" while the account survived,
 * with their outbox already cleared. The discriminator is `better-fetch`'s own contract:
 *   • `{ error }` means the SERVER ANSWERED. It refused; nothing was deleted; report `failed` and
 *     touch nothing local. No session read can improve on that, and one can only make it wrong.
 *   • A THROW means no answer arrived at all — the transport failed. The server may have committed
 *     before the connection dropped, so this is the only case where the session is worth asking
 *     about, and it is asked AUTHORITATIVELY (`bypassCache`), because the cookie cache would
 *     happily describe a session the store no longer has. Only a definite "there is nobody"
 *     overturns it; an unreadable read is not evidence and leaves the reader signed in.
 */
export async function deleteAccount(): Promise<DeleteAccountResult> {
  if (await isDefinitelyOffline()) return { status: 'offline' };

  let refusal: { code?: string } | null;
  try {
    refusal = (await authClient.deleteUser()).error;
  } catch (cause) {
    // No answer. See the note above — this is the ONE case where the session is worth asking.
    if (__DEV__) console.error('[auth] delete-user never answered', cause);
    if ((await readSession({ bypassCache: true })).state !== 'none') return { status: 'failed' };
    return finishDeletion();
  }
  if (refusal) {
    if (__DEV__) console.error('[auth] delete-user was refused', refusal);
    return { status: 'failed', code: refusal.code };
  }
  return finishDeletion();
}

/**
 * The device half, once the account is genuinely gone. Same shape as `signOut`: tear the device
 * down, then put an anonymous identity back, because anonymous-first means there is always one.
 *
 * ⚠️ IT SWALLOWS ITS OWN FAILURES, BECAUSE THE IRREVERSIBLE HALF HAS ALREADY SUCCEEDED. The
 * account is destroyed by the time this runs; a throwing MMKV clear or a re-mint that cannot reach
 * the worker would otherwise escape into `data.tsx`'s catch and paint "Your account was not
 * deleted, and nothing was changed" over a completed deletion — the one message that is
 * unrecoverably wrong, since there is no account left to try again with. Local state left behind
 * is keyed by a user id that no longer exists and is dropped by the next teardown.
 */
async function finishDeletion(): Promise<DeleteAccountResult> {
  try {
    await teardownAccountScopedState();
    await ensureAnonymousSession({ force: true });
    await refreshSession();
  } catch (cause) {
    if (__DEV__) console.error('[auth] the account is gone; local cleanup did not finish', cause);
  }
  return { status: 'deleted' };
}
