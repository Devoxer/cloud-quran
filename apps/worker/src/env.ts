/** The worker's bindings and vars. One definition, imported by every module that reads `c.env`. */
export type Bindings = {
  /** Cloudflare D1. Bound in wrangler.toml; the app never holds a database credential. */
  DB: D1Database;
  /** "development" | "production" — set from `[vars]` / `[env.production.vars]`. */
  ENVIRONMENT?: string;
  /**
   * ⚠️ THE SESSION SIGNING KEY (story 5-5). Declared in NO env block of wrangler.toml — `[vars]`
   * is plaintext in a committed file. Supplied by `.dev.vars` locally and
   * `wrangler secret put BETTER_AUTH_SECRET --env production` in production.
   * `lib/auth.ts` REFUSES to build an auth instance without it, and `identity.test.ts` asserts
   * the absence of any declaration.
   */
  BETTER_AUTH_SECRET?: string;
  /**
   * The absolute base URL Better Auth builds its callbacks from.
   *
   * ⚠️ SET IN PRODUCTION, UNSET LOCALLY, AND THE OAUTH REDIRECT IS WHY. Derived from the request,
   * it is fine for a native id token (nothing is redirected anywhere) — but the redirect leg
   * sends Apple and Google a `redirect_uri` built from this, and that has to match what is
   * registered in their consoles exactly. A request arriving on a different host would otherwise
   * mint a callback nobody registered, and the provider refuses it. `wrangler dev` leaves it
   * unset so the origin follows whatever port is in use.
   */
  BETTER_AUTH_URL?: string;
  /**
   * The From address for the email OTP.
   *
   * ⚠️ NO LONGER BLOCKED (2026-08-25). `cloudquran.nobleachievements.com` is onboarded to
   * Cloudflare Email Service with all six DNS records live and `status: ready`, so
   * `no-reply@cloudquran.nobleachievements.com` is the address. It is NOT a secret — the
   * recipient reads it in every message — but it lives in the secrets store with the rest of the
   * worker's configuration so one command populates them all.
   *
   * Absent, `lib/mail.ts` still refuses rather than sending from an address that would bounce,
   * and logs the code instead in development. That path is what the integration suite drives.
   */
  MAIL_FROM?: string;
  /**
   * Cloudflare Email Service's send binding (`[[send_email]] name = "EMAIL"`). `wrangler dev`
   * SIMULATES it — locally, mail is logged rather than delivered — so its presence costs nothing
   * in development and in tests.
   */
  EMAIL?: SendEmail;
  /**
   * Comma-separated Google OAuth client ids — WEB, iOS and ANDROID, in any order.
   *
   * ⚠️ THEY ARE THE AUDIENCE, NOT A SECRET. A native Google id token's `aud` is the client id of
   * the platform that minted it, so the worker cannot verify a token without knowing all three,
   * and there is nothing confidential about them (the app ships them too). Absent, `lib/auth.ts`
   * does not register the Google provider at all and a sign-in attempt gets a typed
   * `PROVIDER_NOT_FOUND` — rather than a provider that accepts tokens it cannot check.
   */
  GOOGLE_CLIENT_IDS?: string;
  /**
   * The Google WEB client secret — the OAuth REDIRECT leg used by the Web and Desktop builds
   * (story 5-5 amendment). The native id-token leg does not need it: the client ids above are the
   * audience, and no code exchange happens. So the two legs light up independently, and
   * `/health` reports them separately.
   */
  GOOGLE_CLIENT_SECRET?: string;
  /**
   * Apple WEB sign-in (story 5-5 amendment). The NATIVE path needs NONE of these: an Apple id
   * token's audience is the iOS bundle identifier, which `lib/auth.ts` holds as a constant.
   *
   * ⚠️ APPLE ISSUES NO STATIC CLIENT SECRET. You sign a JWT yourself with a .p8 key, and Apple
   * refuses any assertion claiming more than 6 months. So the worker mints its own from the four
   * values below and nothing ever expires — see `lib/appleSecret.ts`. `APPLE_CLIENT_SECRET` is
   * the fallback for an operator who already holds a generated JWT; its `exp` IS checked, because
   * that input is the one that lapses silently.
   */
  APPLE_SERVICE_ID?: string;
  APPLE_TEAM_ID?: string;
  APPLE_KEY_ID?: string;
  /** The full PEM contents of the .p8, newlines and all. The one true secret in this group. */
  APPLE_PRIVATE_KEY?: string;
  APPLE_CLIENT_SECRET?: string;
  /**
   * Comma-separated origin allowlist for CORS **and** for Better Auth's trusted origins. Absent
   * means NO browser origin is allowed, which is the safe default: native has no preflight and
   * is unaffected, while web/desktop fail loudly rather than silently accepting `*`. Story 5-6
   * sets it when the web client first calls the API.
   *
   * ⚠️ The native app's deep-link scheme (`cloud-quran://`) is NOT read from here — it is a
   * constant in `lib/auth.ts`, because it ships in the binary and cannot vary per environment.
   */
  ALLOWED_ORIGINS?: string;
};

export type AppEnv = { Bindings: Bindings };
