/**
 * Typed Hono RPC client — THE ONE WORKER ENTRY POINT (Story 17.1, story 5-4, story 5-5).
 *
 * `hc<AppType>` gives a fully typed client over the worker's routes — request inputs
 * (`$post({ json })` / `$get({ query, param })`) and response bodies are inferred from
 * the worker's `AppType`, so nothing is hand-written. `AppType` comes from the
 * `cloud-quran-api` package's emitted declaration (its natural home — it is
 * `typeof app`); the boundary zod schemas live in `@cloudquran/shared`.
 *
 * Base URL = the existing `config.api.baseUrl` (EXPO_PUBLIC_API_URL), which is wired
 * into EAS — NOT renamed to the cheat-sheet's illustrative EXPO_PUBLIC_WORKER_URL.
 *
 * ⚠️ `hc()` HAS NO COOKIE JAR, AND THE WORKER'S SESSION IS A COOKIE (story 5-5) — SO THE TWO
 * PLATFORMS NEED OPPOSITE FIXES, AND GIVING EITHER ONE THE OTHER'S IS THE SAME AS GIVING IT NONE.
 *
 *   • **Native** has no cookie store at all: `@better-auth/expo` keeps the session in SecureStore
 *     and hand-injects it on its OWN requests, which does nothing for this client. So the header
 *     is set explicitly, read at REQUEST time rather than at module load, so a sign-in mid-session
 *     is picked up without rebuilding the client.
 *   • **Web** must not be sent that header and cannot use it anyway. `Cookie` is a FORBIDDEN
 *     REQUEST HEADER — `fetch` silently drops it, no error — and `@better-auth/expo`'s client is
 *     inert in a browser (`if (isWeb) return`), so `getCookie()` answers `''` regardless. The
 *     browser has the real cookie in its own jar and will attach it to a cross-origin request
 *     only with `credentials: 'include'`, which is what web gets instead. The worker's CORS
 *     middleware carries the matching `credentials: true`; both halves are required.
 *
 * Getting this wrong is invisible to typecheck, to lint and to a native smoke: the web build
 * simply never authenticates, and every scoped route answers 401 as though the user were
 * anonymous. An earlier revision of this file did exactly that, and its comment described the
 * empty jar as "the app's normal state, not an error".
 *
 * ⚠️ THIS FILE IS THE CHOKEPOINT `lint:layers` RULE 6 GUARDS, and the gate FAILS CLOSED if it
 * stops importing `hono/client` or stops calling `hc(`. That is deliberate: a second client
 * minted elsewhere would silently opt out of the cookie handling above while typechecking
 * perfectly.
 *
 * ⚠️ RULE 6 IS ONLY HALF THE ENFORCEMENT, AND THIS PARAGRAPH USED TO CLAIM OTHERWISE. It said a
 * second client would also opt out of "the query cache and the write outbox" — those live one
 * layer ABOVE this module, in `lib/sync.ts`, precisely so that this file stays a dumb transport
 * that knows about a base URL and a cookie and nothing else. Rule 6 stops a second CLIENT; what
 * stops a feature calling THIS one directly, with no cache, no debounce and no outbox, is
 * **rule 7**: `@/lib/api` may be imported only by `apps/expo/src/lib/sync.ts`.
 *
 * ⚠️ AND IT HAS A RUNTIME CONSUMER NOW (story 5-6), which this header also used to deny — "the RN
 * app runtime still makes zero worker calls … no runtime consumer yet". `lib/sync.ts` reads the
 * four synced entities through it and drains every queued write through it, on a real device
 * against a real worker. The cookie handling above is exercised, not merely typecheck-covered.
 */

import type { AppType } from 'cloud-quran-api';
import { hc } from 'hono/client';
import { Platform } from 'react-native';
import { authClient } from './auth';
import { config } from './config';

export const api = hc<AppType>(
  config.api.baseUrl,
  Platform.OS === 'web'
    ? { init: { credentials: 'include' } }
    : { headers: async () => ({ cookie: await authClient.getCookie() }) }
);
