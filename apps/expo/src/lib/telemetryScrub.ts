/**
 * Client telemetry scrubber — the ONE SDK boundary anything ever leaves this app through.
 *
 * Two different secrets, two different rules, and story 5-7 added the second one:
 *
 * 1. **CREDENTIALS — SCRUBBED UNCONDITIONALLY (story 5-7).** `Authorization`, `Cookie` and
 *    `Set-Cookie` are the session itself: Better Auth's session is a cookie, and a leaked one is
 *    an account takeover for as long as it lives (a year — see `SESSION_EXPIRES_IN_SECONDS`).
 *    ⚠️ `sendDefaultPii: false` DOES NOT STRIP THEM. That option governs whether the SDK ATTACHES
 *    identifying context of its own; it says nothing about a header your own code put in an error
 *    message, a fetch breadcrumb, or a span's request data — which is exactly where a session
 *    lands. This is the single most-repeated misunderstanding about the Sentry SDKs, and the
 *    reason the scrub below is a hook rather than a setting.
 *
 * 2. **CONTENT URLs — SCRUBBED WHEN A CONTENT HOST IS CONFIGURED (Story 32.5, arch §5.2).** A
 *    content URL is a PERMANENT capability token (the opaque `r2Key` in its path is the whole
 *    credential), so it must never come to rest in telemetry. The leak vectors are indirect: a
 *    failed `fetch` throws with the target URL baked into the error message + stack (only
 *    `beforeSend` catches that), the RN fetch instrumentation records a breadcrumb per request
 *    (`beforeBreadcrumb`), and performance spans carry the URL in their description/data
 *    (`beforeSendTransaction`).
 *
 * ⚠️ THE HOOKS ARE RETURNED UNCONDITIONALLY NOW, AND THAT IS THE STORY 5-7 CHANGE THAT MATTERS
 * MOST. `makeClientContentScrubber()` returned `{}` when no content host was configured — dev,
 * test, and any deployment that had not set `EXPO_PUBLIC_CONTENT_URL` — so on those builds NOTHING
 * was scrubbed at all. A credential scrub that switches itself off when an unrelated variable is
 * missing is not a scrub. The content half still no-ops without a host (there is no host to
 * match); the credential half never does.
 *
 * ⚠️ story 5-2: this header used to say the scrub lived at "BOTH SDK boundaries" — Sentry AND
 * PostHog. PostHog is gone (PRD NFR8: zero third-party analytics), so there is exactly ONE
 * boundary, and opt-in Sentry is the only telemetry Cloud Quran emits at all.
 */

import { config } from './config';

/** The replacement marker for a content URL — greppable in Sentry, carries zero key material. */
export const CONTENT_URL_REDACTION = '[redacted-content-url]';

/** The replacement marker for a credential. Distinct from the URL one so a leak can be traced. */
export const CREDENTIAL_REDACTION = '[redacted-credential]';

/** Match an http(s) URL token (up to the next whitespace/quote). */
const URL_RE = /https?:\/\/[^\s"'<>]+/g;

/**
 * Payload KEYS whose value is a credential, whatever it looks like.
 *
 * Sentry files request headers under `event.request.headers`, fetch breadcrumbs under
 * `breadcrumb.data`, and span attributes under `span.data` — all plain objects with the name as
 * the key, which is what makes a key-based rule cover every one of them at once. Compared
 * lowercased, because a header name is case-insensitive on the wire and arrives however the
 * instrumentation happened to spell it.
 *
 * ⚠️ THE LIST HAS TO KNOW **THIS APP'S OWN** CREDENTIALS, NOT JUST THE FAMOUS HTTP HEADERS. The
 * first draft covered `authorization` / `cookie` / `x-api-key` and missed every credential Cloud
 * Quran actually handles: `idToken` is what native Apple and Google sign-in POST to
 * `/sign-in/social`, and `accessToken` / `refreshToken` / `password` are three of the four columns
 * `exportUserData` goes out of its way to keep out of a shared document — which would be a strange
 * thing to protect there and hand to a crash reporter here. `otp` is the email sign-in code.
 */
const CREDENTIAL_KEYS = new Set([
  // The HTTP headers.
  'authorization',
  'proxy-authorization',
  'cookie',
  'cookies',
  'set-cookie',
  'x-auth-token',
  'x-api-key',
  // This app's own, including the `account` table's credential columns.
  'idtoken',
  'id_token',
  'accesstoken',
  'access_token',
  'refreshtoken',
  'refresh_token',
  'sessiontoken',
  'session_token',
  'password',
  'secret',
  'otp',
  'onetimecode',
  'verificationcode',
]);

/**
 * `code` and `token` are SOMETIMES credentials and usually are not, so they are decided on the
 * VALUE rather than on the key.
 *
 * ⚠️ THIS IS NOT SQUEAMISHNESS ABOUT OVER-REDACTING. `code` is the key this app uses for its TYPED
 * REFUSALS — `APPLE_WEB_SIGN_IN_UNAVAILABLE`, `PROVIDER_NOT_FOUND`, `SESSION_EXPIRED` — which
 * `lib/auth.ts` and `sign-in.tsx` capture deliberately, because a code is frequently the ONLY
 * thing that names why a native sign-in failed (nothing reaches the worker, so there is no server
 * log to consult). Blanket-redacting the key would delete the one diagnostic this app pays for.
 * But `code` is ALSO the sign-in screen's state variable for the 6-digit email OTP, and `token`
 * appears on both sides too. A digits-only or long-opaque value is the secret and a
 * SCREAMING_SNAKE refusal code is not, so the value decides and both survive.
 */
const AMBIGUOUS_CREDENTIAL_KEYS = new Set(['code', 'token']);
/** A short all-digits value (the OTP) or a long opaque one (a token). */
const LOOKS_LIKE_A_SECRET = /^[0-9]{4,10}$|^[A-Za-z0-9._~+/-]{20,}={0,2}$/;
/**
 * A SCREAMING_SNAKE identifier is a refusal code, never a credential.
 *
 * ⚠️ IT HAS TO BE EXCLUDED EXPLICITLY, BECAUSE THE LENGTH RULE ALONE CATCHES IT.
 * `APPLE_WEB_SIGN_IN_UNAVAILABLE` is 29 characters of the token alphabet, so "long and opaque"
 * calls it a secret and deletes the single most useful line in a native sign-in report. A real
 * token of that length is base64url and effectively never all-caps.
 */
const LOOKS_LIKE_AN_IDENTIFIER = /^[A-Z][A-Z0-9_]*$/;

/**
 * A credential embedded in PROSE rather than filed under a key.
 *
 * ⚠️ THE KEY RULE ALONE IS NOT ENOUGH, AND THIS IS THE CASE IT MISSES. A failed request throws
 * with its own description — `Error: request failed (authorization: Bearer eyJhbGci…)` — and that
 * string reaches Sentry as `exception.values[].value` and inside the stack frames, where there is
 * no key to match.
 *
 * ⚠️ IT DOES **NOT** TERMINATE ON A COMMA, AND TERMINATING ON ONE LEAKED THE SESSION. A
 * `Set-Cookie` header carries several cookies separated by commas and this app's session token is
 * rarely the first of them — so a rule that stopped at the first comma redacted the decoy and
 * published `better-auth.session_token=…` intact. It runs to the end of the line instead, and
 * stops at a closing quote or bracket so a JSON-shaped payload loses only the value.
 *
 * ⚠️ THE LABEL ACCEPTS A QUOTE ON EITHER SIDE OF THE SEPARATOR, because the common shape is a
 * SERIALIZED object — `{"authorization":"Bearer …"}` — where an unquoted `name: value` matcher
 * finds nothing at all.
 */
const CREDENTIAL_IN_TEXT_RE =
  /((?:authorization|proxy-authorization|set-cookie|cookie|x-auth-token|x-api-key|id_?token|access_?token|refresh_?token|password|otp)["']?\s*[:=]\s*["']?)[^\n"'}\]]+/gi;

/** A bare `Bearer <token>` — a credential whether or not the header name survived beside it. */
const BEARER_RE = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi;

/**
 * THE SESSION COOKIE, BY ITS OWN NAME.
 *
 * ⚠️ WITHOUT THIS THE ONE CREDENTIAL THIS APP ACTUALLY HAS COULD TRAVEL UNLABELLED. A cookie
 * VALUE — `better-auth.session_token=abc123` — carries its own name and needs no header beside it
 * to be a complete, replayable session: `lib/auth.ts` reads exactly that string out of a deep-link
 * query parameter, and `lib/api.ts` passes it around as a bare value. Neither the key rule (there
 * is no key) nor the prose rule (there is no header label) touches it. Better Auth's session lives
 * a YEAR here, so one leak is an account takeover until it expires.
 */
const SESSION_COOKIE_RE =
  /(?:__Secure-|__Host-)?[\w.-]*(?:better-auth|session[_-]?(?:token|data))[\w.-]*=[^\s;,"']+/gi;

/** Marker for a value already on the current recursion path — see the cycle note in `scrub`. */
export const CIRCULAR_MARKER = '[circular]';

/** Extract the host of a URL string, or undefined if it isn't a parseable absolute URL. */
function hostOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}

/** The content host to redact (undefined when the base isn't configured — dev/test). */
function contentHost(): string | undefined {
  return hostOf(config.content.baseUrl);
}

/**
 * Is this a bag of data we may safely rebuild, or an OBJECT with behaviour and identity?
 *
 * ⚠️ REBUILDING EVERYTHING FROM `Object.entries` IS A DATA-DESTROYING BUG, and making the scrub
 * unconditional is what turned it from theoretical into certain. `Date`, `Error`, `Map`, `Set`,
 * `RegExp` and every class instance have their state in internal slots or on a prototype, so
 * `Object.entries` sees NOTHING and the rebuilt value is `{}` — a timestamp, an error, a captured
 * scope, a span, Sentry's own `sdkProcessingMetadata`, all flattened to an empty object on the way
 * out. Before story 5-7 this code only ran where `EXPO_PUBLIC_CONTENT_URL` was set, which is
 * nowhere; now it runs on every event. Anything that is not a plain object or array is handed back
 * untouched — a narrower scrub than a destroyed payload.
 */
function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Recursively replace every credential — and every content-host URL, when one is configured — in
 * `value` with a redaction marker. Non-content URLs and ordinary values pass through untouched.
 *
 * ⚠️ A CREDENTIAL KEY IS REDACTED WHATEVER ITS VALUE'S TYPE. `set-cookie` arrives as an ARRAY of
 * strings, and a `cookie` value could be an object in a hand-built payload — descending into
 * either and scrubbing the strings would leave the structure, and therefore the values, in place.
 * The whole value is replaced by the marker instead.
 *
 * ⚠️ CYCLES ARE SURVIVED, AND A STACK OVERFLOW HERE IS THE WORST PLACE IN THE APP FOR ONE. This
 * runs INSIDE `beforeSend`, so an unbounded recursion crashes the app while it is reporting a
 * crash — and `extra` is arbitrary caller-supplied data that can perfectly well hold a cycle. The
 * guard tracks the current PATH rather than every value ever seen, so a DAG (the same object
 * referenced twice, which SDK payloads are full of) is scrubbed twice rather than falsely reported
 * as circular.
 */
export function scrubTelemetry<T>(value: T): T {
  const host = contentHost();
  const path = new Set<object>();

  const redactString = (s: string): string => {
    let out = s
      .replace(CREDENTIAL_IN_TEXT_RE, (_match, label: string) => `${label}${CREDENTIAL_REDACTION}`)
      .replace(SESSION_COOKIE_RE, CREDENTIAL_REDACTION)
      .replace(BEARER_RE, CREDENTIAL_REDACTION);
    if (host) {
      out = out.replace(URL_RE, (match) => (match.includes(host) ? CONTENT_URL_REDACTION : match));
    }
    return out;
  };

  const isCredentialEntry = (key: string, val: unknown): boolean => {
    const lower = key.toLowerCase();
    if (CREDENTIAL_KEYS.has(lower)) return true;
    return (
      AMBIGUOUS_CREDENTIAL_KEYS.has(lower) &&
      typeof val === 'string' &&
      LOOKS_LIKE_A_SECRET.test(val) &&
      !LOOKS_LIKE_AN_IDENTIFIER.test(val)
    );
  };

  const scrub = (v: unknown): unknown => {
    if (typeof v === 'string') return redactString(v);
    if (!v || typeof v !== 'object') return v;
    if (path.has(v)) return CIRCULAR_MARKER;
    if (Array.isArray(v)) {
      path.add(v);
      const out = v.map(scrub);
      path.delete(v);
      return out;
    }
    if (!isPlainObject(v)) return v;
    path.add(v);
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = isCredentialEntry(k, val) ? CREDENTIAL_REDACTION : scrub(val);
    }
    path.delete(v);
    return out;
  };

  return scrub(value) as T;
}

/**
 * Build the Sentry scrub hooks for the client.
 *
 * ⚠️ ALWAYS RETURNS ALL THREE HOOKS. See the header: returning `{}` when no content host is
 * configured used to disable the credential scrub on every build that had not set an unrelated
 * variable. `tracePropagationTargets` is the one member that stays conditional in effect — with no
 * first-party API host it is an EMPTY allow-list, which propagates trace headers to nothing, and
 * that is the correct failure direction for a zero-tracking app.
 *
 * Generic identity signatures (event in → same type out) so no Sentry types are imported here.
 */
export function makeTelemetryScrubber(): {
  beforeSendHook: <T>(event: T) => T;
  beforeSendTransaction: <T>(event: T) => T;
  beforeBreadcrumb: <T>(breadcrumb: T) => T;
  tracePropagationTargets: (string | RegExp)[];
} {
  return {
    beforeSendHook: <T>(event: T): T => scrubTelemetry(event),
    beforeSendTransaction: <T>(event: T): T => scrubTelemetry(event),
    beforeBreadcrumb: <T>(breadcrumb: T): T => scrubTelemetry(breadcrumb),
    // Sentry supports only an ALLOW-list — "exclude the content host" = allow only the
    // first-party API host, so trace headers never reach the content host.
    // Story 5-1 review: the fallback was 'api.wisdomfruits.com'. A misconfigured baseUrl would
    // then attach trace headers to another product's domain. An empty allow-list propagates
    // to nothing, which is the correct failure direction for a zero-tracking app.
    tracePropagationTargets: hostOf(config.api.baseUrl)
      ? [hostOf(config.api.baseUrl) as string]
      : [],
  };
}
