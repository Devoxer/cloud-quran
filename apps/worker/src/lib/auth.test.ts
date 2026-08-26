/**
 * The auth instance's CONFIGURATION — the decisions no request in the integration suite reaches.
 *
 * ⚠️ WHY THIS FILE IS A UNIT TEST AND THE AUTHORIZATION SUITE IS NOT. Everything asserted here is
 * unreachable from `__tests__/sync.integration.test.ts` for one reason: it only fires on a SOCIAL
 * sign-in, and an Apple or Google id token is signed by Apple or Google. No local harness can
 * mint one, and adding a stub verifier to the worker would be exactly the kind of test-only door
 * this story deleted along with the dev token. So the config is asserted directly, and the hook
 * is INVOKED against a fake D1 that records the SQL it is handed — which is the difference
 * between "the block is present" and "the block does what it says".
 *
 * Every assertion below was mutation-checked: deleting the thing it describes reddens it.
 */
import { describe, expect, it } from 'vitest';
import { createAuth } from './auth';

/** Enough of a D1 binding for Drizzle to build and "run" a statement. Records what it is given. */
function recordingD1(selectResults: Record<string, unknown>[][] = []) {
  const statements: { sql: string; params: unknown[] }[] = [];
  // Queued answers for successive SELECTs, so the email-adoption path can be driven through its
  // real branches ("what does this user have" / "does anyone else hold this address").
  const queue = [...selectResults];
  const binding = {
    prepare(sql: string) {
      const entry = { sql, params: [] as unknown[] };
      statements.push(entry);
      // Taken ONCE per prepared statement: drizzle reaches for `raw()` or `all()` depending on
      // whether the select names fields, and shifting the queue in both would desynchronise it.
      let rows: Record<string, unknown>[] | undefined;
      const results = () => {
        if (rows === undefined) rows = /^\s*select/i.test(sql) ? (queue.shift() ?? []) : [];
        return rows;
      };
      const stmt = {
        bind(...params: unknown[]) {
          entry.params = params;
          return stmt;
        },
        async run() {
          return { success: true, results: results(), meta: { changes: 1 } };
        },
        async all() {
          return { success: true, results: results(), meta: { changes: 0 } };
        },
        async first() {
          return results()[0] ?? null;
        },
        /**
         * ⚠️ NOT A STUB — DRIZZLE USES THIS FOR ANY SELECT THAT NAMES ITS COLUMNS. `db.select({
         * email: user.email })` goes through `values()` → `raw()`, so a `raw()` that answers `[]`
         * makes every such query read as "no rows" and silently skips the branch under test.
         * Values are positional; the queued objects must list their keys in the select's order,
         * which every call here does (they are single-column).
         */
        async raw() {
          return results().map((row) => Object.values(row));
        },
      };
      return stmt;
    },
    async batch() {
      return [];
    },
    async exec() {
      return { count: 0, duration: 0 };
    },
  };
  return { binding: binding as unknown as D1Database, statements };
}

/** A client-secret JWT that has not expired, for the "Apple web is live" case. */
function futureJwt(): string {
  const b64 = (value: unknown) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64({ alg: 'ES256' })}.${b64({ exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
}

const env = (extra: Record<string, string> = {}) => ({
  DB: recordingD1().binding,
  BETTER_AUTH_SECRET: 'unit-test-secret-unit-test-secret-unit-test',
  ENVIRONMENT: 'development',
  ...extra,
});

describe('createAuth refuses to exist without a signing key', () => {
  it('throws rather than serving unsigned sessions', () => {
    // A 500 is the correct answer to "this deployment is misconfigured". The alternative — an
    // auth server that quietly mints sessions nobody can verify — is worse than being down.
    expect(() => createAuth({ DB: recordingD1().binding })).toThrow(/BETTER_AUTH_SECRET/);
  });
});

describe('the linking policy that makes a guest upgrade possible at all', () => {
  it('does NOT allow different emails — the default, kept deliberately as a guard', async () => {
    // ⚠️ THIS ASSERTED `true` UNTIL THE CODE REVIEW. Upstream reads the flag in exactly two
    // places — `/link-social` and the linked-redirect callback — neither of which this app can
    // reach since amendment (b), so `true` was dead config. But `/link-social` is still MOUNTED,
    // and the duplicate-account defect was precisely a guest linking an address someone else
    // held: with the default, that call fails closed instead of forking a second account.
    const auth = createAuth(env());
    const linking = auth.options.account?.accountLinking as
      | { allowDifferentEmails?: boolean; enabled?: boolean }
      | undefined;
    expect(linking?.allowDifferentEmails).toBeUndefined();
    expect(linking?.enabled).toBe(true);
  });

  it('trusts exactly the two providers the app can present', async () => {
    const auth = createAuth(env());
    expect(auth.options.account?.accountLinking?.trustedProviders).toEqual(['apple', 'google']);
  });
});

describe('the OAuth state binding', () => {
  it('does NOT skip the state cookie check — that is the login-CSRF factor', async () => {
    // ⚠️ THIS WAS ON FOR ABOUT AN HOUR AND THE REASON EXPIRED WITH IT. `skipStateCookieCheck` was
    // set to get the web redirect working, justified by the web build being on a different
    // registrable domain — which the SAME commit fixed by serving it from
    // `cloudquran.nobleachievements.com`, same site as `api.…`. Better Auth binds an OAuth state
    // twice, a `verification` row and a signed cookie; the cookie is the half that stops an
    // attacker completing THEIR flow in your browser, and the row alone does not.
    // Asserted as ABSENCE, not as a falsy value: when the flag is unset the key does not exist on
    // the options type at all, so `toBeFalsy()` does not typecheck. This still reddens if anyone
    // sets it — mutation-checked.
    const auth = createAuth(env());
    expect(Object.keys(auth.options.account ?? {})).not.toContain('skipStateCookieCheck');
  });

  it('keeps the state cookie SameSite=None, for the cross-site callback', async () => {
    // Apple's provider is hardcoded to `response_mode=form_post`, so its callback is cross-site,
    // and Electron will be cross-site to any API once it has a shell. `Lax` would drop the cookie
    // on exactly those legs. Only THIS cookie loosens — the session cookie keeps its default.
    const auth = createAuth(env());
    expect(auth.options.advanced?.cookies?.state?.attributes).toMatchObject({
      sameSite: 'none',
      secure: true,
    });
  });
});

describe('trusted origins', () => {
  it('always includes the native scheme, whatever the browser allowlist says', async () => {
    // The app's deep-link origin is not an http origin and cannot come from ALLOWED_ORIGINS.
    // Without it, every cookie-bearing native POST — i.e. `/link-social` — 403s on the origin
    // check with a message that names neither the header nor the config.
    expect(createAuth(env()).options.trustedOrigins).toContain('cloud-quran://');
  });

  it("trusts Apple's own origin — the state cookie fix turns the origin check ON", async () => {
    // ⚠️ NOT COSMETIC, AND NOT ABOUT APPLE BEING SPECIAL. Apple's provider is hardcoded to
    // `response_mode=form_post`, so its callback is a cross-site POST. That POST used to carry no
    // Cookie header, and `originCheckMiddleware` returns EARLY when there is none — so the check
    // never ran. Making the `state` cookie `SameSite=None` (without which web sign-in cannot work
    // at all) means the cookie now rides that POST, the middleware engages, and an untrusted
    // Apple origin turns `state_mismatch` into a 403 INVALID_ORIGIN that looks like a different
    // bug. The two changes are one change; this asserts the half that is easy to drop.
    expect(createAuth(env()).options.trustedOrigins).toContain('https://appleid.apple.com');
  });

  it('adds the configured browser origins, and nothing when there are none', async () => {
    const configured = createAuth(env({ ALLOWED_ORIGINS: 'https://a.example, https://b.example' }));
    expect(configured.options.trustedOrigins).toEqual([
      'cloud-quran://',
      'https://appleid.apple.com',
      'https://a.example',
      'https://b.example',
    ]);
    // Absent means NO browser origin — never a wildcard, and never an empty string that would
    // match a request with no Origin at all. Apple's is not a browser origin: it is the provider
    // posting back, and it is present regardless of configuration.
    expect(createAuth(env()).options.trustedOrigins).toEqual([
      'cloud-quran://',
      'https://appleid.apple.com',
    ]);
  });
});

describe('the social providers this deployment can verify', () => {
  it('registers Apple unconditionally, with the bundle id as the native audience', async () => {
    // A native Apple id token's `aud` IS the bundle identifier, whose Sign in with Apple
    // capability is already registered — so the NATIVE leg needs no Services ID and no client
    // secret, and gating the whole provider on one would leave a working flow switched off.
    //
    // ⚠️ It is a FUNCTION, deliberately: Better Auth resolves a provider awaitably at use time,
    // which is what lets the Apple web secret be signed on Apple requests only rather than on
    // every route. Resolving it here is also the assertion that the factory works at all.
    const factory = createAuth(env()).options.socialProviders?.apple;
    expect(factory).toBeTypeOf('function');
    const apple = await (factory as () => Promise<Record<string, unknown>>)();
    expect(apple.appBundleIdentifier).toBe('com.nobleachievements.cloudquran');
    // With no Services ID configured the web half is dark, and `clientSecret` is empty rather
    // than a placeholder that would reach Apple's token endpoint and fail opaquely.
    expect(apple.clientSecret).toBe('');
  });

  it('does NOT register Google until its client ids exist', async () => {
    // Google's audience is an OAuth client id from a console. Registering the provider without
    // one would mean accepting tokens the worker cannot check; absent, a sign-in attempt gets a
    // typed PROVIDER_NOT_FOUND instead.
    expect(createAuth(env()).options.socialProviders?.google).toBeUndefined();
  });

  it('registers Google, with every id as an accepted audience, once they do', async () => {
    const withIds = createAuth(env({ GOOGLE_CLIENT_IDS: 'web.apps, ios.apps , android.apps' }));
    const google = withIds.options.socialProviders?.google as { clientId: string[] } | undefined;
    expect(google?.clientId).toEqual(['web.apps', 'ios.apps', 'android.apps']);
  });
});

describe('the write-budget guards that are configuration, not code', () => {
  it('keeps the session cookie cache on — a per-request session READ otherwise', async () => {
    const auth = createAuth(env());
    expect(auth.options.session?.cookieCache?.enabled).toBe(true);
  });

  it('refreshes sessions monthly, not daily', async () => {
    const auth = createAuth(env());
    // `updateAge` is what governs the session WRITE. Upstream's 1-day default is one row (plus
    // its index entry) per user per day, forever, for every user who opens the app.
    const day = 24 * 60 * 60;
    expect(auth.options.session?.updateAge).toBeGreaterThanOrEqual(28 * day);
    expect(auth.options.session?.expiresIn).toBeGreaterThan(auth.options.session?.updateAge ?? 0);
  });

  it('rate limits outside production, and keys on the un-spoofable header', async () => {
    const auth = createAuth(env());
    // Upstream enables the limiter in production only; `x-forwarded-for`, its default key source,
    // is client-supplied and can be varied per request to defeat it entirely.
    expect(auth.options.rateLimit?.enabled).toBe(true);
    expect(auth.options.rateLimit?.storage).toBe('database');
    expect(auth.options.advanced?.ipAddress?.ipAddressHeaders).toEqual(['cf-connecting-ip']);
  });
});

describe('the Apple WEB leg refuses loudly when its credential is unusable', () => {
  // ⚠️ WITHOUT THE `hooks.before` GUARD THIS IS A 500. A redirect sign-in against an unconfigured
  // or lapsed Apple credential reaches `createAuthorizationURL`, which throws
  // `CLIENT_ID_AND_SECRET_REQUIRED` — untyped, on the one path a locked-out user needs, naming
  // nothing. Story acceptance: the failure is typed and names the cause.

  const runBefore = async (body: Record<string, unknown>, path = '/sign-in/social') => {
    const auth = createAuth(env());
    const before = auth.options.hooks?.before;
    expect(before).toBeTypeOf('function');
    return (before as (ctx: unknown) => Promise<unknown>)({ path, body });
  };

  it('refuses an Apple REDIRECT with a typed code and an actionable message', async () => {
    await expect(runBefore({ provider: 'apple' })).rejects.toMatchObject({
      body: { code: 'APPLE_WEB_SIGN_IN_UNAVAILABLE' },
    });
    await expect(runBefore({ provider: 'apple' })).rejects.toMatchObject({
      body: { message: expect.stringContaining('APPLE_SERVICE_ID') },
    });
  });

  it('refuses on /link-social too — the guest-upgrade path uses that one', async () => {
    await expect(runBefore({ provider: 'apple' }, '/link-social')).rejects.toMatchObject({
      body: { code: 'APPLE_WEB_SIGN_IN_UNAVAILABLE' },
    });
  });

  it('LEAVES THE NATIVE LEG ALONE — it needs none of those credentials', async () => {
    // ⚠️ The whole reason the guard keys on the ABSENCE of `idToken`. A native Apple id token is
    // verified against the bundle identifier, which is a constant — matching on the provider
    // alone would take working iOS sign-in down whenever the web credentials were missing, which
    // today is always.
    await expect(
      runBefore({ provider: 'apple', idToken: { token: 'apple.id.token' } })
    ).resolves.toBeUndefined();
  });

  it('ignores every other path', async () => {
    await expect(runBefore({ provider: 'apple' }, '/get-session')).resolves.toBeUndefined();
  });

  it('allows the redirect once the credential resolves', async () => {
    const auth = createAuth(
      env({
        APPLE_SERVICE_ID: 'com.example.web',
        APPLE_CLIENT_SECRET: futureJwt(),
      })
    );
    const before = auth.options.hooks?.before as (ctx: unknown) => Promise<unknown>;
    await expect(
      before({ path: '/sign-in/social', body: { provider: 'apple' } })
    ).resolves.toBeUndefined();
  });
});

describe('the Google WEB leg refuses loudly too', () => {
  // ⚠️ THE SAME FAILURE THE APPLE GUARD EXISTS TO ELIMINATE, ON THE OTHER PROVIDER. The client ids
  // alone light the NATIVE leg, so a deployment can have them and no `GOOGLE_CLIENT_SECRET`: the
  // button renders (its gate is the client ids), the redirect reaches `createAuthorizationURL`,
  // the code exchange fails untyped, and the screen says "please try again" forever.

  const runBefore = async (
    body: Record<string, unknown>,
    extraEnv: Record<string, string> = {}
  ) => {
    const auth = createAuth(env(extraEnv));
    const before = auth.options.hooks?.before as (ctx: unknown) => Promise<unknown>;
    return before({ path: '/sign-in/social', body });
  };

  it('refuses a Google redirect when the client ids are missing', async () => {
    await expect(runBefore({ provider: 'google' })).rejects.toMatchObject({
      body: { code: 'GOOGLE_WEB_SIGN_IN_UNAVAILABLE' },
    });
  });

  it('refuses when the ids exist but the SECRET does not — the half-configured case', async () => {
    await expect(
      runBefore({ provider: 'google' }, { GOOGLE_CLIENT_IDS: 'web.apps,ios.apps' })
    ).rejects.toMatchObject({
      body: { message: expect.stringContaining('GOOGLE_CLIENT_SECRET') },
    });
  });

  it('allows the redirect once both are present', async () => {
    await expect(
      runBefore(
        { provider: 'google' },
        { GOOGLE_CLIENT_IDS: 'web.apps', GOOGLE_CLIENT_SECRET: 'GOCSPX-test' }
      )
    ).resolves.toBeUndefined();
  });

  it('LEAVES THE NATIVE LEG ALONE — the client ids alone are enough for an id token', async () => {
    // Anti-vacuity and the regression that matters: a guard keyed on the provider rather than on
    // the absence of `idToken` would break working mobile Google sign-in on every deployment that
    // has no web secret.
    await expect(
      runBefore(
        { provider: 'google', idToken: { token: 'google.id.token' } },
        { GOOGLE_CLIENT_IDS: 'web.apps' }
      )
    ).resolves.toBeUndefined();
  });
});
