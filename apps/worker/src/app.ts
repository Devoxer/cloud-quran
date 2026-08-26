/**
 * Cloud Quran API — the worker data layer (stories 5-1, 5-4).
 *
 * ⚠️ THE WORKER IS ON THE DATA PATH. `sprint-change-proposal-2026-08-20` reversed the original
 * "the client talks to the vendor directly; this worker is deliberately NOT on the sync path".
 * Story 5-4 (here) makes it the D1 + Drizzle data API; story 5-5 makes it the identity provider.
 *
 * ⚠️ Every router MUST stay chained onto ONE expression. Splitting it into separate
 * statements drops the route types from `typeof app` and the RPC client silently goes
 * untyped — which typechecks fine and fails at runtime.
 *
 * ⚠️ Set the status with `c.status()`, NOT as `c.json(body, 401)`.
 *
 * Passing the status to `c.json` makes Hono infer it as a LITERAL into the RPC type, so the
 * client sees `status: 401` and every caller comparison (`res.status === 200`, `case 401:`)
 * becomes a compile error about non-overlapping types. Setting it separately leaves the RPC
 * status as the broad `ContentfulStatusCode` (compare the /health route, which does the same),
 * so call sites compile against handlers whose failure modes they do not enumerate.
 *
 * ⚠️ AUTHORIZATION IS THE SHAPE OF THE QUERIES, NOT A CHECK BOLTED ON TOP. `getUserId(c)` is the
 * only source of a user id in this file — no route reads one from a path, a query string or a
 * body — so `db/queries.ts` cannot emit a statement that touches another user's rows. The
 * failure this replaces was the opposite: a rule that looked like a check and matched nothing.
 */
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { Database } from './db';
import { createDb } from './db';
import {
  createBookmark,
  deleteBookmark,
  exportUserData,
  getAudioPosition,
  getPreferences,
  getReadingPosition,
  listBookmarks,
  purgeUserData,
  putAudioPosition,
  putPreferences,
  putReadingPosition,
} from './db/queries';
import type { AppEnv } from './env';
import { describeAppleWebSecret, resolveAppleWebSecret } from './lib/appleSecret';
import { APP_SCHEME_ORIGIN, createAuth, googleClientIds } from './lib/auth';
import { getUserId } from './lib/identity';
import { mailerState } from './lib/mail';
import type { Result } from './lib/validate';
import {
  parseAudioPosition,
  parseBookmark,
  parsePreferences,
  parseReadingPosition,
} from './lib/validate';
import { readWriteBudget, recordWrites } from './middleware/write-guard';

const UNAUTHORIZED: ContentfulStatusCode = 401;
const FORBIDDEN: ContentfulStatusCode = 403;
const CONFLICT: ContentfulStatusCode = 409;
// The same bound `validate.ts` applies to a created bookmark id. The delete path had none.
const MAX_BOOKMARK_ID = 64;
const UNPROCESSABLE: ContentfulStatusCode = 422;
const TOO_MANY_REQUESTS: ContentfulStatusCode = 429;

type Failure = { ok: false; status: ContentfulStatusCode; error: string };
type WriteOk = { ok: true; applied: boolean };

/**
 * Resolve the identity, or the 401 that anonymous callers get. Never throws — anonymous is normal.
 *
 * ⚠️ THE DEFAULT IS THE AUTHORITATIVE READ, AND ONLY GETs MAY OPT OUT. See `lib/identity.ts`: a
 * session resolved from the 15-minute cookie cache outlives `POST /api/auth/delete-user`, so a
 * write authorized by one lands a row on a user who no longer exists — permanently orphaned,
 * unreachable by every route here, uncollectable. `readOnly` below is the opt-out, and it is
 * written out at each of the four sync GETs rather than defaulted, so a write route added later
 * cannot inherit it by accident. `GET /api/account/export` deliberately does not take it — see
 * the note there.
 */
async function identify(
  c: Parameters<typeof getUserId>[0],
  options?: Parameters<typeof getUserId>[1]
): Promise<{ ok: true; userId: string; db: Database } | Failure> {
  const userId = await getUserId(c, options);
  if (!userId) return { ok: false, status: UNAUTHORIZED, error: 'unauthorized' };
  // ⚠️ Per request, from c.env.DB. Never hoisted to module scope — see db/index.ts.
  return { ok: true, userId, db: createDb(c.env.DB) };
}

/**
 * Is this request's `Origin` one we trust? CSRF, for the one route of ours that destroys data.
 *
 * ⚠️ THIS ROUTE'S ONLY PROTECTION USED TO BE THE SESSION COOKIE'S IMPLICIT `SameSite` DEFAULT, in
 * a file that already tunes `advanced.cookies` per-cookie — so the guarantee rested on a default
 * nobody had written down, one line away from being overridden. `POST /api/account/data` is
 * irreversible, cookie-authenticated, and takes NO BODY, which makes it a CORS "simple request":
 * a cross-site `fetch(url, {method:'POST', credentials:'include'})` fires no preflight, so the
 * CORS middleware above blocks the attacker from READING the answer and does nothing to stop the
 * erasure. Upstream's `/delete-user`, mounted in the same worker, refuses exactly this shape.
 *
 * ⚠️ A MISSING `Origin` IS ALLOWED, AND THAT IS THE DELIBERATE DIFFERENCE FROM UPSTREAM. React
 * Native's fetch sends no `Origin` at all, and this route is reached by `lib/api.ts`'s plain RPC
 * client — not by `@better-auth/expo`, which is what promotes the native `expo-origin` header for
 * the auth routes only. Refusing a missing origin here would break in-app erasure on iOS and
 * Android while closing nothing: the attack this guards against is a BROWSER one, and every
 * cross-site browser request carries an `Origin`. `expo-origin` is honoured too, so a native
 * client that grows one is not refused for volunteering it.
 */
function originTrusted(c: Parameters<typeof getUserId>[0]): boolean {
  const origin = c.req.header('origin') ?? c.req.header('expo-origin');
  if (!origin) return true;
  const configured = (c.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((entry: string) => entry.trim())
    .filter((entry: string) => entry.length > 0);
  return origin === APP_SCHEME_ORIGIN || configured.includes(origin);
}

/**
 * The read-path opt-out: a cached identity is good enough when nothing is written.
 *
 * A deleted user's rows are already gone, so the worst a stale read can produce is an empty
 * document handed to a client whose session is about to stop working anyway. That is what pays
 * for `session.cookieCache` — reads are the frequent case, and this keeps them free of a D1
 * session read.
 */
const readOnly = { allowCookieCache: true } as const;

/**
 * The shared write path: identify → check the daily ceiling → validate → apply → record.
 *
 * ⚠️ THE ORDER IS THE COST DESIGN. The ceiling is checked BEFORE anything is written, so a
 * runaway client past its limit costs zero rows rather than one row per rejection; and
 * `recordWrites` runs only when `apply` reports it changed something, so an LWW no-op spends
 * no budget at all. See middleware/write-guard.ts.
 */
async function runWrite<T>(
  c: Parameters<typeof getUserId>[0],
  parse: (body: unknown) => Result<T>,
  apply: (db: Database, userId: string, input: T) => Promise<boolean>
): Promise<WriteOk | Failure> {
  const who = await identify(c);
  if (!who.ok) return who;

  const budget = await readWriteBudget(who.db, who.userId, Date.now());
  if (!budget.allowed) {
    return { ok: false, status: TOO_MANY_REQUESTS, error: 'daily-write-ceiling-reached' };
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return { ok: false, status: UNPROCESSABLE, error: 'body must be JSON' };
  }
  const parsed = parse(body);
  if (!parsed.ok) return { ok: false, status: UNPROCESSABLE, error: parsed.error };

  const applied = await apply(who.db, who.userId, parsed.value);
  if (applied) await recordWrites(who.db, who.userId, budget, 1);
  return { ok: true, applied };
}

/**
 * Max request body. Every route here posts a handful of small scalars; the largest realistic body
 * is a bookmark with a 200-char label. `architecture.md` requires body limits on every public
 * route, and unbounded `c.req.json()` on a Worker isolate is a cheap way to burn CPU and memory.
 */
const MAX_BODY_BYTES = 16 * 1024;
const PAYLOAD_TOO_LARGE = 413;
const INTERNAL_ERROR = 500;

const app = new Hono<AppEnv>()
  // ⚠️ CORS is not optional here. Cloud Quran ships Expo **Web** and an Electron desktop wrapping
  // the web export — two of its four target platforms are browsers. Without this, every route
  // 404s at the preflight and sync is simply unreachable from them, which would surface in story
  // 5-6 as a mystery rather than as a decision. Native (iOS/Android) sends no preflight, which is
  // exactly why this gap can ship looking fine.
  .use(
    '/api/*',
    cors({
      origin: (origin, c) => {
        const allowed = (c.env.ALLOWED_ORIGINS ?? '').split(',').map((o: string) => o.trim());
        return allowed.includes(origin) ? origin : null;
      },
      // ⚠️ `credentials: true` IS THE WEB BUILD'S WHOLE SESSION, AND IT IS THE ONLY LINE HERE
      // DOING THAT WORK (story 5-5). A Better Auth session is a COOKIE, and a browser sends no
      // cookie on a cross-origin request — and stores no `Set-Cookie` from one — unless the
      // response says so. Native is unaffected: it sends no preflight at all and
      // `@better-auth/expo` hand-injects the cookie from secure storage, which is exactly why
      // this gap would ship looking fine on the platform we smoke. Safe only because `origin`
      // above is an explicit allowlist that never returns `*`; the two must stay together, and
      // `__tests__/sync.integration.test.ts` drives both halves through a real preflight.
      credentials: true,
      // ⚠️ `cookie` AND `set-cookie` ARE NOT LISTED, DELIBERATELY — LISTING THEM IS THEATRE.
      // Both are FORBIDDEN HEADER NAMES: the browser sets `Cookie` itself from its jar and no
      // preflight ever asks permission for it, and `Set-Cookie` cannot be surfaced through
      // `Access-Control-Expose-Headers` at all. An earlier revision named both here, which read
      // as "this is what makes cookies work" and would have survived the deletion of the one
      // line that does. `authorization` stays for a future bearer caller.
      allowHeaders: ['authorization', 'content-type'],
      allowMethods: ['GET', 'PUT', 'POST', 'DELETE', 'OPTIONS'],
      maxAge: 86_400,
    })
  )
  .use(
    '/api/*',
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) => {
        c.status(PAYLOAD_TOO_LARGE);
        return c.json({ ok: false as const, error: 'body-too-large' as const });
      },
    })
  )
  // ⚠️ Every RPC call site does `res.json()` unconditionally. Hono's default handler returns
  // text/plain "Internal Server Error", so an unexpected D1 throw breaks the client contract at
  // exactly the wrong moment — including when the account-wide write cliff this story is built
  // around starts erroring. Keep the `{ ok, error }` shape on every path out of this worker.
  .onError((err, c) => {
    console.error('unhandled', err);
    c.status(INTERNAL_ERROR);
    return c.json({ ok: false as const, error: 'internal' as const });
  })
  .notFound((c) => {
    c.status(404);
    return c.json({ ok: false as const, error: 'not-found' as const });
  })
  /**
   * ⚠️ `/health` REPORTS WHICH SIGN-IN LEGS ARE LIVE, AND THAT IS THE POINT (story 5-5
   * amendment). Apple's web client secret is a JWT that Apple caps at six months, so a
   * deployment can be perfectly healthy and still have one button that stopped working on a date
   * nobody wrote down. An operator needs somewhere to SEE that, and a readiness endpoint is where
   * they already look — a comment in a config file is not.
   *
   * Nothing secret is disclosed: which providers are configured is discoverable by pressing the
   * button, and an expiry date is not a credential. No id, key or secret appears here.
   */
  .get('/health', async (c) => {
    const appleWeb = await resolveAppleWebSecret(c.env);
    return c.json({
      ok: true,
      service: 'cloud-quran-api',
      signIn: {
        // Native Apple needs no console credential at all — it is live wherever the app is.
        appleNative: 'ready' as const,
        appleWeb: appleWeb.state,
        appleWebDetail: describeAppleWebSecret(appleWeb),
        googleNative:
          googleClientIds(c.env).length > 0 ? ('ready' as const) : ('not-configured' as const),
        googleWeb:
          googleClientIds(c.env).length > 0 && (c.env.GOOGLE_CLIENT_SECRET ?? '').length > 0
            ? ('ready' as const)
            : ('not-configured' as const),
        emailOtp: mailerState(c.env),
      },
    });
  })

  // ── identity: Better Auth owns every /api/auth/* path (story 5-5) ───────────────────────────
  // ⚠️ THIS REPLACES `POST /api/dev/token`, WHICH IS DELETED — issuer, verifier and secret. A
  // 5-4 dev bearer token is now refused because nothing exists that could accept it.
  //
  // ⚠️ `app.all(...)` INSIDE THE CHAIN, and it deliberately contributes NOTHING to the RPC type.
  // Better Auth's handler is a plain `(Request) => Promise<Response>`; the app never calls these
  // paths through `hc()` — it uses `authClient`, which owns the cookie jar — so there is no
  // typed surface to lose. What the chain position DOES buy is the CORS and body-limit
  // middleware above, which a separately-mounted router would silently skip.
  .all('/api/auth/*', (c) => createAuth(c.env).handler(c.req.raw))

  // ── reading position (LWW) ──────────────────────────────────────────────────────────────────
  .get('/api/sync/reading-position', async (c) => {
    const who = await identify(c, readOnly);
    if (!who.ok) {
      c.status(who.status);
      return c.json({ ok: false as const, error: who.error });
    }
    return c.json({ ok: true as const, position: await getReadingPosition(who.db, who.userId) });
  })
  .put('/api/sync/reading-position', async (c) => {
    const result = await runWrite(c, parseReadingPosition, putReadingPosition);
    if (!result.ok) {
      c.status(result.status);
      return c.json({ ok: false as const, error: result.error });
    }
    return c.json({ ok: true as const, applied: result.applied });
  })

  // ── preferences (LWW) ───────────────────────────────────────────────────────────────────────
  .get('/api/sync/preferences', async (c) => {
    const who = await identify(c, readOnly);
    if (!who.ok) {
      c.status(who.status);
      return c.json({ ok: false as const, error: who.error });
    }
    return c.json({ ok: true as const, preferences: await getPreferences(who.db, who.userId) });
  })
  .put('/api/sync/preferences', async (c) => {
    const result = await runWrite(c, parsePreferences, putPreferences);
    if (!result.ok) {
      c.status(result.status);
      return c.json({ ok: false as const, error: result.error });
    }
    return c.json({ ok: true as const, applied: result.applied });
  })

  // ── audio position (LWW) ────────────────────────────────────────────────────────────────────
  .get('/api/sync/audio-position', async (c) => {
    const who = await identify(c, readOnly);
    if (!who.ok) {
      c.status(who.status);
      return c.json({ ok: false as const, error: who.error });
    }
    return c.json({ ok: true as const, audioPosition: await getAudioPosition(who.db, who.userId) });
  })
  .put('/api/sync/audio-position', async (c) => {
    const result = await runWrite(c, parseAudioPosition, putAudioPosition);
    if (!result.ok) {
      c.status(result.status);
      return c.json({ ok: false as const, error: result.error });
    }
    return c.json({ ok: true as const, applied: result.applied });
  })

  // ── bookmarks (union-merge) ─────────────────────────────────────────────────────────────────
  .get('/api/sync/bookmarks', async (c) => {
    const who = await identify(c, readOnly);
    if (!who.ok) {
      c.status(who.status);
      return c.json({ ok: false as const, error: who.error });
    }
    return c.json({ ok: true as const, bookmarks: await listBookmarks(who.db, who.userId) });
  })
  .post('/api/sync/bookmarks', async (c) => {
    const who = await identify(c);
    if (!who.ok) {
      c.status(who.status);
      return c.json({ ok: false as const, error: who.error });
    }
    const budget = await readWriteBudget(who.db, who.userId, Date.now());
    if (!budget.allowed) {
      c.status(TOO_MANY_REQUESTS);
      return c.json({ ok: false as const, error: 'daily-write-ceiling-reached' });
    }
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      body = null;
    }
    const parsed = parseBookmark(body);
    if (!parsed.ok) {
      c.status(UNPROCESSABLE);
      return c.json({ ok: false as const, error: parsed.error });
    }
    const written = await createBookmark(who.db, who.userId, parsed.value);
    if (written.status === 'id-taken') {
      // The id belongs to somebody else. Nothing written, and nothing about their row disclosed.
      c.status(CONFLICT);
      return c.json({ ok: false as const, error: 'bookmark id already in use' });
    }
    if (written.status === 'created') await recordWrites(who.db, who.userId, budget, 1);
    return c.json({
      ok: true as const,
      created: written.status === 'created',
      bookmark: written.bookmark,
    });
  })
  .delete('/api/sync/bookmarks/:id', async (c) => {
    const who = await identify(c);
    if (!who.ok) {
      c.status(who.status);
      return c.json({ ok: false as const, error: who.error });
    }
    // ⚠️ A DELETE IS A WRITE. This was unmetered on the comment "a delete frees a row rather
    // than writing one", which is false: Cloudflare counts INSERT, UPDATE *and* DELETE toward
    // rows written, and the unique-index entry goes with it. A user who created N bookmarks
    // under the ceiling could spend ~2N more rows deleting them entirely off-budget, on the
    // one table with unbounded cardinality.
    const id = c.req.param('id');
    if (typeof id !== 'string' || id.length === 0 || id.length > MAX_BOOKMARK_ID) {
      // The create path bounds this id; the delete path did not. Asymmetric validation on
      // the same column is how an unbounded value reaches D1 through the quieter door.
      c.status(UNPROCESSABLE);
      return c.json({ ok: false as const, error: 'id must be a 1-64 character string' as const });
    }
    const budget = await readWriteBudget(who.db, who.userId, Date.now());
    if (!budget.allowed) {
      c.status(TOO_MANY_REQUESTS);
      return c.json({ ok: false as const, error: 'daily-write-ceiling-reached' as const });
    }
    const deleted = await deleteBookmark(who.db, who.userId, id);
    // Metered only when a row actually went — a delete matching nothing costs nothing.
    if (deleted) await recordWrites(who.db, who.userId, budget, 1);
    return c.json({ ok: true as const, deleted });
  })

  // ── the data lifecycle (story 5-7) ──────────────────────────────────────────────────────────
  //
  // ⚠️ `POST /api/account/delete` WAS A 501 STUB AND IS DELETED, NOT FILLED. Account deletion is
  // Better Auth's `POST /api/auth/delete-user`, whose `beforeDelete` hook purges these same rows
  // (`lib/auth.ts`) — upstream owns session invalidation and its own tables, and a hand-rolled
  // route here would have to re-derive both. Leaving the stub would have left two doors onto
  // deletion, which is the `linkSocial` lesson verbatim.
  //
  // What is left here is the half upstream has no opinion about: destroying the reader's SYNCED
  // DATA while keeping their account (FR28), and handing them a copy of it (FR29).

  /**
   * "Delete my synced data" — every synced row goes, the account and the session survive.
   *
   * ⚠️ IT IS METERED AND **NEVER REFUSED**, AND THE FIRST DRAFT OF THIS ROUTE GOT THAT BACKWARDS.
   * It checked the per-user daily ceiling first and answered 429 — so a reader who had spent their
   * writes could not erase their data until the next UTC day, with no queued retry and no copy
   * telling them to come back tomorrow. That is a COST GUARD STANDING IN FRONT OF A LEGAL RIGHT,
   * which is the exact thing `lib/auth.ts` refuses to do three lines into `beforeDelete`, for the
   * exact same reason: FR28 erasure and FR28a deletion are the same right, and neither may be
   * rationed. The budget is READ so the cost can still be recorded, and nothing branches on it.
   *
   * ⚠️ RECORDED AS **ONE** UNIT RATHER THAN AS THE ROWS IT DESTROYS. A delete IS a billed write in
   * D1 (rows written counts DELETE), so an entirely unrecorded purge is a free amplification path.
   * But metering by row count would make a reader who purges 2,000 bookmarks lose sync for the
   * rest of the day for exercising a right — punishing the erasure instead of accounting for it.
   * One unit accounts for it, and what bounds the loop is that a second purge has nothing left to
   * destroy: the first one costs rows, every one after it costs a handful of no-op DELETEs.
   *
   * ⚠️ `recordWrites` RUNS AFTER THE PURGE, AND ITS FAILURE MUST NOT REACH THE READER. It writes
   * the ABSOLUTE value `used + 1` from the read taken above, so a purge cannot lower the counter
   * even if it touched the counter's table — but a throw there would reach `onError` as a 500 over
   * rows that are ALREADY GONE, and the screen would paint "Nothing was deleted" about a completed
   * erasure. The meter is guarded; the erasure is not. Losing one unit of accounting is a rounding
   * error against telling someone their data survived when it did not.
   *
   * ⚠️ A FAILING PURGE STILL THROWS AND IS ANSWERED BY `onError` AS A 500 `{ ok: false }`. That
   * one must never be swallowed: `db.batch()` is atomic, so a failure means every row is still
   * there, and a reader told "deleted" over surviving rows is worse than one told "that failed".
   */
  .post('/api/account/data', async (c) => {
    // ⚠️ BEFORE THE IDENTITY, DELIBERATELY. A forged cross-site request carries a REAL session
    // cookie — that is the whole shape of CSRF — so identifying first would answer "yes, this is
    // Alice" and prove nothing. See `originTrusted`.
    if (!originTrusted(c)) {
      c.status(FORBIDDEN);
      return c.json({ ok: false as const, error: 'untrusted-origin' });
    }
    const who = await identify(c);
    if (!who.ok) {
      c.status(who.status);
      return c.json({ ok: false as const, error: who.error });
    }
    // Read for the RECORD, never for a verdict — see above. No branch may be added here.
    const budget = await readWriteBudget(who.db, who.userId, Date.now());
    await purgeUserData(who.db, who.userId, 'data');
    try {
      await recordWrites(who.db, who.userId, budget, 1);
    } catch (error) {
      // The rows are gone. An accounting failure is not the reader's problem and must not become
      // their error message.
      console.error('account-data purge: could not record the write', error);
    }
    return c.json({ ok: true as const, purged: true as const });
  })

  /**
   * "Give me my data" (FR29 / GDPR Art. 15 + 20) — the four entities plus the account metadata,
   * as one self-describing JSON document. Reads only, so it spends no write budget.
   *
   * Scoped by `identify()` like every other route: there is no user id in the path, the query or
   * a body, so "export somebody else's data" is not a request this worker can express.
   *
   * ⚠️ THE BOOKMARK READ IS BOUNDED, AND IT IS THE ONLY ROUTE HERE THAT NEEDED SAYING SO. Every
   * other read is one row per user by construction; this one scans the whole bookmark table for a
   * user, D1 BILLS ROWS SCANNED, and unlike the purge (one metered action) or deletion (once per
   * account) an export can be repeated. `EXPORT_BOOKMARK_LIMIT` bounds what a single request can
   * cost, and `bookmarksTruncated` is in the document so a bounded export can never quietly claim
   * to be a complete one. What this does NOT bound is the LOOP — nothing in this worker does, for
   * any route; that is the pre-auth volumetric tier `architecture.md` prescribes and
   * `deferred-work.md` still carries.
   */
  .get('/api/account/export', async (c) => {
    // ⚠️ THE ONE GET THAT DOES **NOT** TAKE `readOnly`. Every other read answers with rows a
    // deleted user no longer has; this one emits their COMPLETE personal data in one document, so
    // the 15-minute window would let a session revoked on another device extract the lot. It is
    // also user-initiated and rare, so the D1 session read it costs is unmeasurable — the cache
    // exists for the frequent sync GETs above, not for this.
    const who = await identify(c);
    if (!who.ok) {
      c.status(who.status);
      return c.json({ ok: false as const, error: who.error });
    }
    return c.json({ ok: true as const, export: await exportUserData(who.db, who.userId) });
  });

// story 5-2: `/api/account/entitlement/recheck` was removed. It existed so the client could ask
// RevenueCat for a fresh entitlement verdict; Cloud Quran has no entitlement concept. Its only
// caller (`lib/entitlementMirror.ts`) was deleted first, so the RPC types never dangled.

export type AppType = typeof app;
export default app;
