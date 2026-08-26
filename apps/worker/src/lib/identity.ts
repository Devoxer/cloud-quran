/**
 * THE IDENTITY SEAM (story 5-4, filled in by story 5-5).
 *
 * `getUserId(c)` is the ONE place the worker learns who is calling. Story 5-4 built it around a
 * dev-only HMAC bearer token and promised that 5-5 would replace the BODY without moving a single
 * call site. That is what happened: the call sites in `app.ts` came through 5-5 byte-identical,
 * and the adversarial authorization suite written against dev tokens now re-runs against real
 * Better Auth sessions with only its token minting changed. (They stopped being identical in
 * 2026-08-26's cookie-cache fix, which is the second ⚠️ below — the seam still resolves identity
 * the same way for all of them; what they now choose is how STALE an answer they will accept.)
 *
 * ⚠️ THE DEV TOKEN IS GONE — ISSUER, VERIFIER AND ROUTE. `POST /api/dev/token`,
 * `issueDevToken`, `verifyDevToken`, `devTokenIssuerEnabled` and `DEV_AUTH_SECRET` were all
 * deleted, not disabled. A 5-4 token presented to this worker is now refused for the plainest
 * possible reason: there is no code left that could accept it. Sessions are cookies, not bearer
 * tokens, so even the header it arrived in is no longer read.
 *
 * ⚠️ AND STILL NO THROW. `null` is the app's NORMAL state — Cloud Quran is anonymous-first and a
 * caller with no session is a caller with no session, not an error. Callers turn `null` into a
 * 401. A throw here would turn every anonymous request into a 500 and take the app down for
 * everyone; `auth.api.getSession` is therefore wrapped, because a forged or truncated cookie is
 * an input, not an incident.
 *
 * ⚠️ WRITES RESOLVE AUTHORITATIVELY; READS MAY USE THE COOKIE CACHE. This is not a preference —
 * it closes a measured production defect. `session.cookieCache` (15 minutes, `lib/auth.ts`)
 * carries a SIGNED COPY of the session, and `getSession` will happily answer from it without ever
 * touching the database. So for 15 minutes after `POST /api/auth/delete-user` succeeded, the same
 * cookie still resolved a user id here — and a write made in that window created a row whose
 * `userId` names a user that no longer exists. That is precisely the orphan the `beforeDelete`
 * hook exists to prevent, re-entering through the front door: the hook purges the rows, then the
 * same caller writes new ones that no route can ever reach and nothing can ever collect.
 * Measured against the production worker and real D1 on 2026-08-26, in this order: delete-user →
 * `{"success":true}`, then `GET /api/sync/bookmarks` → 200, then `POST /api/sync/bookmarks` → a
 * created row on a deleted user.
 *
 * A stale READ costs nothing: the deleted user's rows are already gone, so the cached identity
 * reads back an empty document. A stale WRITE is permanent. Hence the split, and hence the
 * DEFAULT is the safe one — a new route that forgets to say which it is pays one D1 read, not a
 * hole. The cost the cache was enabled for survives, because reads are the frequent case.
 * (`GET /api/account/export` opts back IN to the authoritative read anyway: it is rare, and it is
 * the one read that emits a complete copy of the account's personal data.)
 */
import type { Context } from 'hono';
import type { AppEnv } from '../env';
import { createAuth } from './auth';

/** How much staleness the caller can afford. See the header — the default is the safe one. */
type IdentityOptions = {
  /**
   * Accept a session resolved from the signed cookie cache instead of the database.
   *
   * ⚠️ READ PATHS ONLY. It saves a D1 read per request at the cost of a window (15 minutes) in
   * which a revoked or DELETED session still resolves. Never set it on anything that writes.
   */
  allowCookieCache?: boolean;
};

/**
 * THE SEAM. Resolve the calling user, or `null` when there is no valid identity.
 *
 * The auth instance is built HERE, per request, from `c.env` — never hoisted. See `lib/auth.ts`.
 */
export async function getUserId(
  c: Context<AppEnv>,
  { allowCookieCache = false }: IdentityOptions = {}
): Promise<string | null> {
  // ⚠️ OUTSIDE the try, deliberately. `createAuth` throws only when the deployment is
  // MISCONFIGURED (no signing key), and swallowing that would turn a broken deployment into a
  // silent "everybody is anonymous" — 401 everywhere, with nothing in the logs saying why.
  // That one is a 500 and should look like one.
  const auth = createAuth(c.env);
  try {
    // `disableCookieCache` is upstream's own lever — the same one `sensitiveSessionMiddleware`
    // pulls for `/delete-user`. It forces the session store read; nothing else about the
    // resolution changes.
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
      query: { disableCookieCache: !allowCookieCache },
    });
    return session?.user?.id ?? null;
  } catch {
    // A tampered cookie, an expired signature, a database blip mid-lookup: all of them mean "we
    // do not know who this is", which is 401. Never 500 — see the note above.
    return null;
  }
}
