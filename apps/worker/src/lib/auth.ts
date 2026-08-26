/**
 * BETTER AUTH ON THE WORKER (story 5-5) — the identity provider behind `lib/identity.ts`.
 *
 * ⚠️ BUILT PER REQUEST, FROM `c.env`. Never hoist this to module scope. A Worker isolate is
 * reused across requests and outlives any one of them, so a hoisted instance pins whichever
 * secret and binding the FIRST request happened to carry — and a binding-only redeploy (rotating
 * `BETTER_AUTH_SECRET`, say) would then keep serving the old key from warm isolates, with no
 * error anywhere. Same rule, same reason, as `db/index.ts`.
 *
 * ⚠️ `better-auth/minimal`, NOT `better-auth`. Minimal drops Kysely, which `drizzleAdapter` never
 * uses; the only other thing it gives up is `runMigrations`, which this project must never call
 * (drizzle-kit owns the schema and the committed migration file is the artifact). Smaller bundle, and one
 * fewer way to end up with two migrators.
 *
 * ⚠️ ONE HUMAN, ONE ACCOUNT — AND `/link-social` CANNOT DELIVER THAT, WHICH IS WHY NOTHING HERE
 * USES IT ANY MORE (amended 2026-08-25 after a production defect).
 *
 * `/link-social` compares the incoming provider email only against `session.user.email`; it never
 * asks whether that address already belongs to somebody else. Its one cross-user guard is
 * `findAccountByKey(issuer + accountId)`, which fires only if the OTHER user has already linked
 * that exact provider identity. And it had to run with `allowDifferentEmails: true`, because a
 * guest's address is a synthetic `temp@` that matches nothing — so a guest signing in with an
 * address an existing account holds attached the provider to the ANONYMOUS user. Observed: one
 * reader, two accounts, one of them stranded on `temp@`. (That flag is now off, see below: the
 * route is unused but still mounted, and off is the safer state for it.)
 *
 * `/sign-in/social` is the route that resolves identity: `handleOAuthUserInfo` looks the verified
 * email up (`findUserByEmail`) and attaches the account to the user that already exists, keeping
 * THEIR id. It is also in the `anonymous()` plugin's hook matcher, so `onLinkAccount` fires with
 * `newUser` = that pre-existing user, and `reassignUserRows` merges the guest's rows into it.
 * `/link-social` is in neither. Measured end to end before this was written.
 *
 * The client's only reason for preferring `/link-social` was that `@better-auth/expo`'s fetch
 * plugin attaches the stored cookie solely on paths ending `/link-social` — a CLIENT-side path
 * check, not a server constraint. `apps/expo/src/lib/auth.ts` now attaches the cookie itself and
 * posts to `/sign-in/social`, so ONE route serves native, web and desktop.
 *
 * Email OTP works the same way and always did: `/sign-in/email-otp` finds or mints the user, and
 * the same `onLinkAccount` carries the guest's rows across.
 */
import { expo } from '@better-auth/expo';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { betterAuth } from 'better-auth/minimal';
import { anonymous } from 'better-auth/plugins/anonymous';
import { emailOTP } from 'better-auth/plugins/email-otp';
import { createDb } from '../db';
import { purgeUserData, reassignUserRows } from '../db/queries';
import { account, rateLimit, session, user, verification } from '../db/schema';
import type { Bindings } from '../env';
import { describeAppleWebSecret, resolveAppleWebSecret } from './appleSecret';
import { MailerNotConfiguredError, OTP_TTL_MINUTES, sendOtpEmail } from './mail';

/**
 * The app's deep-link scheme, as a trusted origin.
 *
 * ⚠️ A CONSTANT, NOT AN ENV VAR. It ships inside the binary (`apps/expo/app.json` → `scheme`), so
 * it cannot differ per environment, and reading it from config would only create a way for the
 * two to drift. `@better-auth/expo`'s server half promotes the client's `expo-origin` header into
 * `origin`, and Better Auth then rejects any cookie-bearing POST whose origin is not trusted —
 * which is how the spike's `/link-social` call earned a 403 before this was here.
 */
export const APP_SCHEME_ORIGIN = 'cloud-quran://';

/** The iOS bundle id. It is the `aud` of a native Apple id token — see the apple provider below. */
const APPLE_BUNDLE_ID = 'com.nobleachievements.cloudquran';

/**
 * Session lifetime, sized against the WRITE budget rather than against a security intuition.
 *
 * Better Auth's defaults are a 7-day session refreshed every 1 day, which is one session-table
 * write per user per day, plus its index entry — a standing cost for every user who so much as
 * opens the app. `updateAge` is what governs that write; `expiresIn` only decides when a dormant
 * user has to sign in again. A reading app has no reason to log people out, so: a year of
 * validity, refreshed monthly. One write per user per month.
 */
const SESSION_EXPIRES_IN_SECONDS = 365 * 24 * 60 * 60;
const SESSION_UPDATE_AGE_SECONDS = 30 * 24 * 60 * 60;
/**
 * The cookie cache carries a signed copy of the session, so most requests resolve an identity
 * with NO database read at all. Fifteen minutes is the window in which a server-side revocation
 * is not yet visible — short enough to be honest, long enough to remove the per-request read.
 */
const SESSION_COOKIE_CACHE_SECONDS = 15 * 60;

/**
 * ⚠️ SESSION FRESHNESS IS OFF, AND IT HAS TO BE — READ THIS BEFORE TURNING IT BACK ON.
 *
 * Better Auth guards `/delete-user` with a freshness check: without a password in the body, a
 * session older than `freshAge` (default 24h) is refused with `SESSION_EXPIRED`. The intent is
 * sound — re-prove who you are before destroying an account — but it assumes a password exists to
 * re-prove it WITH. **This app has none.** Every account here is Apple, Google, an email code, or
 * anonymous, so there is no credential `/delete-user` can accept, and the default would mean:
 * anyone signed in for more than a day can never delete their account from inside the app. That
 * is exactly the state Apple guideline 5.1.1(v) forbids — deletion must be in-app and complete,
 * with no support contact — and for a GUEST it would be unreachable by construction, since a
 * guest cannot re-authenticate at all.
 *
 * ⚠️ IT IS A SESSION-WIDE SETTING, NOT A `/delete-user` ONE, AND THIS BLOCK USED TO READ AS IF IT
 * WERE SCOPED TO THAT ONE ROUTE (so did `architecture.md` and `CLAUDE.md`). `session.freshAge`
 * feeds upstream's `freshSessionMiddleware`, which in this version gates THREE routes:
 * `/delete-user`, `/unlink-account` and `/list-sessions`. Only the first is reachable from this
 * app today — nothing calls the other two, and `linkSocial`/`unlinkAccount` are forbidden here by
 * the one-account rule — but the setting does not know that, so any route upstream adds to that
 * middleware in a later version arrives with freshness already disabled. That is the cost of the
 * line, stated where the line is: re-read this list on every Better Auth upgrade.
 *
 * What is given up is bounded: the caller must still present a VALID session, and
 * `sensitiveSessionMiddleware` resolves it AUTHORITATIVELY (a database read, not the signed
 * cookie cache), so a revoked session cannot delete anything even inside the 15-minute cache
 * window above. The screen puts the action behind an explicit confirmation.
 *
 * ⚠️ THAT LAST SENTENCE IS TRUE OF `/delete-user` AND OF NOTHING ELSE — IT USED TO READ AS IF IT
 * COVERED THE WHOLE WORKER, AND A PRODUCTION DEFECT CAME OF IT. `sensitiveSessionMiddleware` is
 * upstream's, mounted on upstream's routes; this app's own routes resolve identity through
 * `lib/identity.ts`, which had no such thing. Measured against production on 2026-08-26: after
 * `/delete-user` answered `{"success":true}`, the same cookie kept authorizing `/api/sync/*` for
 * the length of the cache window, and a write in that window created a row on a deleted user.
 * `getUserId` now resolves authoritatively by default and only GETs opt back into the cache; see
 * the header of `lib/identity.ts`.
 *
 * If a password provider is ever added, this is the line to revisit — and the answer then is a
 * password prompt on the delete path, not a freshness window nobody can satisfy.
 */
const SESSION_FRESH_AGE_SECONDS = 0;

/**
 * The fallback ceiling, per (IP, path), for auth routes upstream has no special rule for.
 * Upstream's own numbers, restated so they are visible next to the storage decision below.
 */
const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX_REQUESTS = 100;

/** Split `ALLOWED_ORIGINS` into a list, dropping blanks. Shared with the CORS middleware's intent. */
function configuredOrigins(env: Pick<Bindings, 'ALLOWED_ORIGINS'>): string[] {
  return (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

/**
 * The social providers this deployment can actually verify.
 *
 * ⚠️ TWO MECHANISMS PER PROVIDER, AND THEY NEED DIFFERENT CREDENTIALS. iOS and Android present a
 * native sheet and send an ID TOKEN, whose audience is a client id the platform already knows.
 * Web and Desktop have no native sheet, so they use the standard OAuth REDIRECT, which needs a
 * client id AND a client secret for the code exchange. A provider can be live for one and dark
 * for the other, which is why the registration below is per-credential rather than per-provider.
 *
 * ⚠️ APPLE IS ALWAYS REGISTERED, because its NATIVE leg needs nothing from a console: a native
 * Apple id token's audience is the BUNDLE IDENTIFIER, and `com.nobleachievements.cloudquran` already
 * carries the Sign In with Apple capability (verified 2026-08-20, recorded in app.json). Its WEB
 * leg needs a Services ID and a .p8-signed secret — see `lib/appleSecret.ts` — and when those are
 * absent the redirect is refused by the hook below with a TYPED error naming the cause, rather
 * than by Better Auth throwing `CLIENT_ID_AND_SECRET_REQUIRED` into a 500. De-registering Apple
 * to express that would take the working native leg down with it.
 *
 * Google is the opposite shape: a native Google id token's audience is the OAuth CLIENT ID minted
 * in the Google console, so there is no way to verify one without knowing it. The provider is
 * registered only when `GOOGLE_CLIENT_IDS` is set, and a sign-in attempt before that returns a
 * typed `PROVIDER_NOT_FOUND` rather than accepting a token nothing checked. The WEB leg
 * additionally needs `GOOGLE_CLIENT_SECRET`; the client ids alone light the native one.
 */
export function googleClientIds(env: Pick<Bindings, 'GOOGLE_CLIENT_IDS'>): string[] {
  return (env.GOOGLE_CLIENT_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

function socialProviders(env: Bindings) {
  const googleIds = googleClientIds(env);

  return {
    /**
     * ⚠️ A FUNCTION, NOT AN OBJECT — AND THAT IS WHAT KEEPS `createAuth` SYNCHRONOUS. Apple's web
     * client secret is a JWT the worker has to SIGN (Apple issues no static secret), and signing
     * is `crypto.subtle`, which is async. Better Auth resolves a provider through
     * `getAwaitableValue` at the moment it is used, so the signature happens on Apple requests
     * only — not on every session read this worker performs. Making `createAuth` async instead
     * would have put an ECDSA sign, or at least an await, in front of every route.
     */
    apple: async () => {
      const appleWeb = await resolveAppleWebSecret(env);
      return {
        /**
         * ⚠️ THE SERVICES ID WHEN THERE IS ONE, THE BUNDLE ID OTHERWISE — and
         * `appBundleIdentifier` carries the native audience either way. Apple's redirect flow
         * authenticates as the SERVICES ID (a bundle id is rejected at the token endpoint),
         * while a native id token's `aud` is the bundle id. `appBundleIdentifier` is what
         * upstream checks first for the id token, so setting `clientId` to the Services ID
         * cannot break the native leg.
         */
        clientId: appleWeb.state === 'ready' ? appleWeb.serviceId : APPLE_BUNDLE_ID,
        clientSecret: appleWeb.state === 'ready' ? appleWeb.clientSecret : '',
        appBundleIdentifier: APPLE_BUNDLE_ID,
      };
    },
    ...(googleIds.length > 0
      ? {
          google: {
            clientId: googleIds,
            clientSecret: env.GOOGLE_CLIENT_SECRET ?? '',
          },
        }
      : {}),
  };
}

/** Is a request body asking for the REDIRECT leg rather than the native id-token one? */
function isRedirectSignIn(body: unknown): boolean {
  return (
    typeof body === 'object' &&
    body !== null &&
    (body as { idToken?: unknown }).idToken === undefined
  );
}

/**
 * Build the auth instance for THIS request's environment.
 *
 * Throws when `BETTER_AUTH_SECRET` is absent, deliberately: an auth server with no signing key
 * would happily mint sessions nobody can trust. `app.ts` turns the throw into the worker's
 * standard `{ ok: false, error: 'internal' }` 500, which is the correct shape for "this
 * deployment is misconfigured" — as opposed to `getUserId` returning `null`, which means "this
 * caller is anonymous" and is the app's normal state.
 */
export function createAuth(env: Bindings) {
  const secret = env.BETTER_AUTH_SECRET;
  if (!secret) {
    throw new Error(
      'BETTER_AUTH_SECRET is not set. Supply it in .dev.vars locally, or with ' +
        '`wrangler secret put BETTER_AUTH_SECRET --env production`.'
    );
  }

  const db = createDb(env.DB);

  return betterAuth({
    secret,
    // Absent, Better Auth derives the base URL from the request — see env.ts.
    ...(env.BETTER_AUTH_URL ? { baseURL: env.BETTER_AUTH_URL } : {}),
    basePath: '/api/auth',
    /**
     * ⚠️ `transaction: false` IS NOT A PREFERENCE. D1 has no interactive transactions, so the
     * adapter's default multi-statement transaction would throw at runtime. Sequential execution
     * is the only correct setting here; where atomicity is genuinely needed the worker uses
     * `db.batch()` (see `db/queries.ts`).
     *
     * The explicit `schema` map exists so the drizzle exports can keep readable names: the
     * adapter resolves a field as `schema[model][field]`, so the KEYS here must be Better Auth's
     * model names even though the tables are declared as `user` / `session` / `account` /
     * `verification` in `db/schema.ts`.
     */
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      transaction: false,
      schema: { user, session, account, verification, rateLimit },
    }),
    /**
     * Explicit, never inferred. The native app is a deep-link scheme rather than an http origin,
     * and the web/desktop builds arrive on whatever `ALLOWED_ORIGINS` names — the same list the
     * CORS middleware uses, so the two cannot disagree.
     */
    // ⚠️ `https://appleid.apple.com` IS REQUIRED BY THE `state` COOKIE FIX, not by Apple itself.
    // Apple's provider is hardcoded to `response_mode=form_post`, so its callback is a cross-site
    // POST. Better Auth 1.7 answers that with a 302 into a top-level GET, which is why the tail
    // shows a GET — but once the `state` cookie is `SameSite=None` it now RIDES that POST, and a
    // request carrying a Cookie header makes `originCheckMiddleware` engage where it previously
    // returned early. Without Apple on this list the fix trades `state_mismatch` for a 403
    // `INVALID_ORIGIN`, which looks like a different bug entirely.
    trustedOrigins: [APP_SCHEME_ORIGIN, 'https://appleid.apple.com', ...configuredOrigins(env)],
    session: {
      expiresIn: SESSION_EXPIRES_IN_SECONDS,
      updateAge: SESSION_UPDATE_AGE_SECONDS,
      cookieCache: { enabled: true, maxAge: SESSION_COOKIE_CACHE_SECONDS },
      // See the constant — a freshness window this app can never satisfy would make in-app
      // account deletion impossible, which Apple 5.1.1(v) forbids. Session-WIDE: it disables
      // upstream's freshness gate on `/unlink-account` and `/list-sessions` too, neither of which
      // this app calls.
      freshAge: SESSION_FRESH_AGE_SECONDS,
    },
    /**
     * ACCOUNT DELETION (story 5-7, FR28a + Apple guideline 5.1.1(v)).
     *
     * ⚠️ UPSTREAM'S ROUTE, NOT ONE OF OURS, AND THE 501 STUB IN `app.ts` WAS DELETED RATHER THAN
     * FILLED. Deleting the app's own rows is the easy half; invalidating every session and taking
     * the `session`, `account` and `verification` rows with the user is the half that is easy to
     * get subtly wrong, and `internalAdapter.deleteUser` + `deleteUserSessions` already do it.
     * Two doors onto deletion is the `linkSocial` lesson repeated — one route, and it is this one.
     *
     * ⚠️ `beforeDelete` IS THE ONLY PLACE THE APP ROWS CAN GO. There is no foreign key from the
     * four synced tables (or `write_budget`) to `user` — see the note in `db/schema.ts` — so
     * nothing cascades, and a user deleted without this hook leaves every bookmark, position and
     * preference orphaned on an id that no longer exists: invisible to every route, uncollectable,
     * billed forever. It shares `purgeUserData` with FR28's "delete my data", so the two promises
     * cannot drift apart.
     *
     * ⚠️ IT IS NOT METERED, DELIBERATELY. Every other write path checks the per-user daily ceiling
     * first; this one must not, because a user who spent their budget would then be unable to
     * delete their account until tomorrow — a cost guard standing in front of a legal right.
     * The bound is elsewhere: an account can only be deleted once.
     *
     * A throw here aborts the deletion, which is the correct direction: the user row survives and
     * the client reports failure, rather than reporting success over surviving rows.
     */
    user: {
      deleteUser: {
        enabled: true,
        beforeDelete: async (deleting) => {
          await purgeUserData(db, deleting.id, 'account');
        },
      },
    },
    /**
     * ⚠️ `enabled: true` IS THE HALF THAT CLOSES A REAL HOLE. Upstream enables rate limiting on
     * PRODUCTION ONLY, so every non-production deployment of this worker had no ceiling at all on
     * the unauthenticated `/email-otp/send-verification-otp` — which, once `MAIL_FROM` is set,
     * mails arbitrary addresses from this project's own domain. It is also what makes the limiter
     * testable: a ceiling that exists only where it cannot be exercised is the same class of thing
     * as an authorization rule nothing executes, which is the failure this epic replaced.
     * `__tests__/sync.integration.test.ts` drives it from one address.
     *
     * ⚠️ `storage: 'database'` — AND THE OBVIOUS REASON FOR IT IS WRONG, so it is written down.
     * The tempting argument is "this file builds a fresh auth instance per request, so an
     * in-memory counter never survives a call". That is FALSE and a mutation test disproved it:
     * better-auth's memory backend is a `const memory = new Map()` at MODULE scope, which the
     * per-request instance does not reset. What it does not survive is the ISOLATE. A Worker runs
     * across many isolates and Cloudflare evicts them freely, so a memory counter is per-isolate
     * and non-durable: one caller spread across isolates gets some multiple of the configured
     * ceiling, and an eviction silently resets it to zero. For a path that sends mail from your
     * own domain, "roughly N times the limit, resetting unpredictably" is not a ceiling anyone can
     * reason about. Database storage is one shared counter, at the cost of the `rate_limit` table.
     *
     * ⚠️ NOTHING IN THE SUITE PINS THAT CHOICE, and it cannot: a local `wrangler dev` is a single
     * isolate, where the two backends behave identically. The integration test pins `enabled`, not
     * `storage`. Recorded in `deferred-work.md` rather than left looking covered.
     *
     * ⚠️ THE CEILINGS THEMSELVES ARE UPSTREAM'S, DELIBERATELY UNCHANGED. Better Auth already
     * applies 3-per-10s to every `/sign-in*` path and 3-per-60s to
     * `/email-otp/send-verification-otp` — both tighter than anything worth hand-writing here, and
     * the key is per-(ip, path), so they do not interfere with each other. `customRules` is
     * therefore EMPTY on purpose: adding a rule for those paths could only loosen them. The
     * `window`/`max` below are the fallback for every OTHER auth path.
     */
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: RATE_LIMIT_WINDOW_SECONDS,
      max: RATE_LIMIT_MAX_REQUESTS,
    },
    /**
     * ⚠️ `cf-connecting-ip`, NOT THE DEFAULT `x-forwarded-for`. Upstream's default header is
     * CLIENT-SUPPLIED: anyone can send a fresh `X-Forwarded-For` per request, which changes the
     * rate-limit key every time and defeats the limiter entirely — a ceiling that anybody can opt
     * out of. `cf-connecting-ip` is written by the Cloudflare edge and cannot be set by the
     * caller. This is the "un-spoofable connecting IP" `architecture.md` § "Cost safety"
     * prescribes. When the header is absent (a local `wrangler dev`, a direct hit) Better Auth
     * falls back to ONE SHARED bucket per path — tighter, not looser, which is the right way for
     * this to fail.
     */
    advanced: {
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] },
      /**
       * ⚠️ THE OAUTH `state` COOKIE MUST BE `SameSite=None`, AND ONLY THAT COOKIE.
       *
       * The web redirect leg died with `state_mismatch` against production, and the tail named
       * the variant: "State mismatch: State not persisted correctly" — the cookie never came
       * back. It was never STORED. The web build runs on its own origin and this worker on
       * another, so `/sign-in/social` is a CROSS-SITE XHR, and a browser discards a `SameSite=Lax`
       * `Set-Cookie` from a cross-site response outright. Nothing arrives to send back.
       *
       * ⚠️ NOT APPLE-SPECIFIC, despite Apple being where it surfaced. Apple is simply the first
       * redirect leg that was driven to completion; Google's would fail identically. The native
       * legs are unaffected because an id token carries no state at all — which is exactly why
       * iOS looked healthy while this was broken. And the earlier local smoke passed only
       * because `localhost:8082 → localhost:8787` is SAME-site.
       *
       * Loosening this one cookie is cheap: it is a random single-use nonce with a 5-minute life,
       * still `httpOnly` and `Secure`, and its CSRF value was never `SameSite` — it is that an
       * attacker cannot guess it. The session cookie deliberately keeps `Lax`; see the note on
       * `trustedOrigins` above for the origin check this turns on.
       *
       * Do NOT reach for `advanced.defaultCookieAttributes` here — the widely-quoted fix for this
       * error — because that loosens the SESSION cookie too, which is the one that matters.
       */
      cookies: { state: { attributes: { sameSite: 'none', secure: true } } },
    },
    /**
     * ⚠️ `allowDifferentEmails` IS DELIBERATELY ABSENT — IT DEFAULTS TO FALSE, AND THAT IS NOW A
     * GUARD RATHER THAN A GAP. It was `true` because `/link-social` compares the incoming address
     * against `session.user.email`, and a guest's is a synthetic `temp@`, so every guest upgrade
     * would have been refused. Amendment (b) stopped using that route, and upstream reads the
     * flag in exactly two places — `account.mjs`'s `/link-social` and `callback.mjs`'s
     * linked-redirect branch — neither of which this app can reach. Leaving it `true` was dead
     * config.
     *
     * Turning it OFF is worth more than deleting it. `/link-social` is still MOUNTED, and the
     * duplicate-account defect was precisely a guest linking an address someone else held: with
     * the default, that call now fails closed. The route this app no longer uses cannot re-open
     * the bug it was removed for.
     *
     * `trustedProviders` below is untouched and still live — `handleOAuthUserInfo` consults it on
     * the routes this app DOES use, so that a provider asserting a verified address can attach to
     * an existing account at all.
     */
    account: {
      /**
       * ⚠️ THE STATE COOKIE CHECK IS ON, AND THAT IS A REVERSAL — read this before turning it off
       * again. `skipStateCookieCheck: true` was set here on 2026-08-25 to get the web redirect
       * leg working, with the justification that "the web build and this worker are on different
       * registrable domains … the web app has no home yet". That stopped being true in the SAME
       * commit: `apps/expo/wrangler.toml` serves the web export at
       * `cloudquran.nobleachievements.com`, same registrable domain as `api.…`, so the cookie is
       * first-party and arrives. The flag was load-bearing for about an hour and then was not.
       *
       * What it costs to leave off is real: better-auth binds an OAuth `state` twice — a
       * `verification` ROW and a signed `state` COOKIE — and the cookie is the factor that stops
       * an attacker completing THEIR OAuth flow in your browser. The row alone does not.
       *
       * The remaining cross-site case is Electron, which loads from a custom protocol and is
       * cross-site to any API. It has no shell yet (Epic 6), and `advanced.cookies.state` below
       * keeps `SameSite=None` so the cookie can still ride a cross-site callback when it does.
       * If desktop later proves the cookie genuinely cannot arrive, turn this back on for THAT
       * reason and record the cost — do not restore it because a local dev origin is cross-site,
       * which is what `pnpm dev` on the worker is for.
       */
      accountLinking: {
        enabled: true,
        trustedProviders: ['apple', 'google'],
        /**
         * ⚠️ SET DELIBERATELY, EVEN THOUGH IT MATCHES THE DEFAULT. This is the one line that
         * decides whether a provider may attach to an account that already exists, and leaving a
         * security decision to a default is how it changes underneath you.
         *
         * It gates on the LOCAL row: `/sign-in/social` will not link Apple or Google onto a
         * stored user whose own address was never proven. **No such row can exist in this app**,
         * because every path that writes a real address is itself a proof of it:
         *   • email OTP creates with `emailVerified: true` — the code proves inbox control, and
         *     an older unverified row is promoted before a session is issued;
         *   • Apple and Google assert a verified address in the id token, and both are in
         *     `trustedProviders` above, so the INCOMING half never blocks either;
         *   • an anonymous guest's `temp@<random>.com` is a placeholder nobody can claim, so it
         *     is never the destination of an email match.
         * The only way to hit the refusal is a provider that reports `email_verified: false`
         * (Apple at Work & School can), whose row is then the destination of a second provider.
         * Refusing there is right: the alternative is merging into an account nobody proved.
         */
        requireLocalEmailVerified: true,
      },
    },
    socialProviders: socialProviders(env),
    /**
     * ⚠️ THE TYPED REFUSAL FOR APPLE ON THE WEB. Without this, a redirect sign-in against an
     * unconfigured or lapsed Apple credential reaches `createAuthorizationURL`, which throws
     * `CLIENT_ID_AND_SECRET_REQUIRED` — a `BetterAuthError` that surfaces as an untyped 500 on the
     * one path a locked-out user needs, naming nothing. Refusing BEFORE the handler turns that
     * into a `SERVICE_UNAVAILABLE` carrying `APPLE_WEB_SIGN_IN_UNAVAILABLE` and a message an
     * operator can act on, including the expiry date when there is one.
     *
     * ⚠️ IT MUST NOT TOUCH THE NATIVE LEG. `isRedirectSignIn` looks for the ABSENCE of `idToken`
     * in the body: an iOS or Android sign-in carries one and is verified against the bundle
     * identifier, which needs none of these credentials. Matching on the provider alone would
     * take working native sign-in down whenever the web credentials were missing — which, today,
     * is always.
     *
     * `/link-social` stays in the path check even though this app no longer calls it: the route
     * is still mounted, and a refusal that names the cause beats a 500 whoever reaches it.
     */
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== '/sign-in/social' && ctx.path !== '/link-social') return;
        const body = ctx.body as { provider?: unknown } | undefined;
        // The NATIVE leg carries an id token and is verified against a client id or the bundle
        // identifier — it needs none of the redirect credentials, so it must never be refused
        // here. Matching on the provider alone would take working mobile sign-in down whenever
        // the web half was unconfigured, which today is the normal state for Apple.
        if (!isRedirectSignIn(body)) return;

        if (body?.provider === 'apple') {
          const appleWeb = await resolveAppleWebSecret(env);
          if (appleWeb.state === 'ready') return;
          throw new APIError('SERVICE_UNAVAILABLE', {
            code: 'APPLE_WEB_SIGN_IN_UNAVAILABLE',
            message: describeAppleWebSecret(appleWeb),
          });
        }

        if (body?.provider === 'google') {
          /**
           * ⚠️ GOOGLE NEEDS THE SAME REFUSAL, AND NOT HAVING IT LEFT THE EXACT FAILURE THE APPLE
           * GUARD EXISTS TO ELIMINATE. The client ids alone light the NATIVE leg, so a deployment
           * can have them and no `GOOGLE_CLIENT_SECRET` — the button renders (its gate is the
           * client ids), the redirect reaches `createAuthorizationURL`, and the code exchange
           * fails untyped. The screen says "please try again", forever, and nothing names the
           * cause. The provider is registered here precisely BECAUSE its native half works, so
           * de-registering it is not the answer either.
           */
          const clientIds = googleClientIds(env);
          const secret = (env.GOOGLE_CLIENT_SECRET ?? '').trim();
          if (clientIds.length > 0 && secret.length > 0) return;
          throw new APIError('SERVICE_UNAVAILABLE', {
            code: 'GOOGLE_WEB_SIGN_IN_UNAVAILABLE',
            message:
              clientIds.length === 0
                ? 'Google sign-in is not configured: GOOGLE_CLIENT_IDS is not set'
                : 'Google web sign-in is not configured: GOOGLE_CLIENT_SECRET is not set (the ' +
                  'client ids alone cover the native id-token flow, not the OAuth redirect)',
          });
        }
      }),
    },
    plugins: [
      expo(),
      anonymous({
        /**
         * ⚠️ FIRES FOR **EVERY** UPGRADE, INCLUDING APPLE AND GOOGLE. This docblock used to say the
         * opposite — "Apple and Google go through `/link-social` … and never reach here" — which
         * was true only while that route was in use, and it sat directly above the call it
         * describes. A reader trusting it would conclude the social paths need no merge and
         * delete the line below, orphaning every social guest's rows.
         *
         * Since amendment (b) every sign-in uses `/sign-in/social` or `/sign-in/email-otp`, both
         * of which resolve the caller to whichever account owns the verified address — so the
         * user id CHANGES, and this hook is the only thing that carries the guest's rows across.
         * Immediately after it returns the plugin DELETES the anonymous user, so anything not
         * moved now is orphaned for good.
         */
        onLinkAccount: async ({ anonymousUser, newUser }) => {
          await reassignUserRows(db, anonymousUser.user.id, newUser.user.id);
        },
      }),
      /**
       * ⚠️ OTP, NOT `magicLink`. A magic link verifies through a GET redirect, and on native
       * `@better-auth/expo` makes that work by appending the `set-cookie` value as a QUERY
       * PARAMETER on the deep link — a browser hop with a session token in a URL. `emailOTP` is a
       * plain `POST /sign-in/email-otp` that answers with `Set-Cookie`: no redirect, no browser,
       * no deep link, and nothing to leak into a history entry.
       *
       * `storeOTP: 'hashed'` means a database read cannot reveal a live code.
       */
      emailOTP({
        otpLength: 6,
        storeOTP: 'hashed',
        expiresIn: OTP_TTL_MINUTES * 60,
        // One line of delivery, on purpose — the copy and the "can we send at all" decision both
        // live in lib/mail.ts. The translation below is the only thing added here.
        sendVerificationOTP: async ({ email, otp }) => {
          try {
            await sendOtpEmail(env, email, otp);
          } catch (error) {
            // ⚠️ A TYPED REFUSAL, NOT A 500. "No sending domain is configured" is the deployment's
            // KNOWN state until a domain is onboarded, so letting it fall through as an unhandled
            // throw would fill production logs with 500s for something nobody can act on from the
            // logs — and hand the client an untyped failure. Anything else still throws.
            if (error instanceof MailerNotConfiguredError) {
              throw new APIError('SERVICE_UNAVAILABLE', {
                message: error.message,
                code: error.code,
              });
            }
            throw error;
          }
        },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
