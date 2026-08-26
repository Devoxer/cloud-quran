/**
 * The identity seam's CONFIGURATION, and the absences that keep it safe.
 *
 * ⚠️ THE BEHAVIOUR OF `getUserId` IS NOT TESTED HERE, AND THAT IS THE DESIGN. Story 5-5 replaced
 * its body with Better Auth's session resolver, so exercising it means a real session, a real
 * cookie and a real database — which is precisely what `__tests__/sync.integration.test.ts` does,
 * against a booted worker, with two distinct identities. A unit test here could only assert
 * against a mocked Better Auth, and the failure this project has already lived through was an
 * authorization rule that nothing ever executed. A rule nothing exercises is not a rule.
 *
 * What lives here is what no runtime test can see: which script ships what, and which variables
 * are DECLARED in the committed config. Absences are what nobody notices going missing.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const workerRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const toml = readFileSync(join(workerRoot, 'wrangler.toml'), 'utf8');
const pkg = JSON.parse(readFileSync(join(workerRoot, 'package.json'), 'utf8'));

describe('the deploy path cannot ship the development block', () => {
  // ⚠️ TOML VALIDITY IS NOT ASSERTED HERE, DELIBERATELY — and it is not unguarded either.
  // A config edit during the 5-4 review produced a file wrangler refused to load ("Invalid TOML
  // document") while every text-scanning assertion below still passed. What caught it was the
  // integration suite: it runs `wrangler d1 migrations apply --local`, which loads this config
  // and failed loudly. That is the gate. Adding a TOML parser here would buy a second, weaker
  // copy of a check that already exists, at the cost of a dependency the spec fences off.
  it('deploys production EXPLICITLY', () => {
    // A bare `wrangler deploy` publishes the TOP-LEVEL block, which carries the live database_id.
    expect(pkg.scripts.deploy).toContain('--env production');
  });

  it('offers NO script that publishes the development block', () => {
    // `deploy:dev` existed briefly. It would have put a second worker on the real production
    // database. Local development is `wrangler dev`, which deploys nothing.
    expect(pkg.scripts['deploy:dev']).toBeUndefined();
  });

  it('gives the two environments different worker names', () => {
    // They were both `cloud-quran-api`, so a bare deploy overwrote production with the dev block.
    // Matched textually rather than parsed — see the note above on why no parser lives here.
    //
    // ⚠️ SECTION-AWARE, because `name` is not a worker-only key. Story 5-5 added
    // `[[send_email]] name = "EMAIL"` to both blocks, and a flat `^name = ` scan then read four
    // names with a duplicate and reported the two environments as colliding — a gate failing on
    // a correct file. Only the WORKER name matters, and it lives at the root of the file and of
    // each `[env.x]` table, never inside a `[[array]]` one.
    const workerNames: string[] = [];
    let inArrayTable = false;
    for (const line of toml.split(/\r?\n/)) {
      if (/^\[\[/.test(line)) inArrayTable = true;
      else if (/^\[/.test(line)) inArrayTable = false;
      const match = /^name = "([^"]+)"/.exec(line);
      if (match && !inArrayTable) workerNames.push(match[1]);
    }
    expect(workerNames.length).toBeGreaterThan(1);
    expect(new Set(workerNames).size).toBe(workerNames.length);
  });
});

describe('wrangler.toml never declares a signing key', () => {
  // Comment lines are stripped, so the paragraph in wrangler.toml that EXPLAINS this rule cannot
  // satisfy it — a scan that its own documentation passes is a scan that checks nothing.
  const declarations = toml
    .split(/\r?\n/)
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');

  it('strips comments but keeps real declarations (the scan is not vacuous)', () => {
    expect(declarations).toContain('ENVIRONMENT = "production"');
    expect(declarations).not.toContain('DELIBERATELY DECLARED NOWHERE');
  });

  it('declares BETTER_AUTH_SECRET in NO env block', () => {
    // `[vars]` is plaintext in a committed file, and this key signs every real session. It comes
    // from `.dev.vars` locally and `wrangler secret put` in production.
    expect(declarations).not.toContain('BETTER_AUTH_SECRET');
  });

  it('still declares no DEV_AUTH_SECRET either — the 5-4 key went with its issuer', () => {
    expect(declarations).not.toContain('DEV_AUTH_SECRET');
  });

  it('pins a compatibility_date that is not story 4-0s stale 2024-01-01', () => {
    expect(declarations).toContain('compatibility_date');
    expect(declarations).not.toContain('2024-01-01');
  });

  it('enables nodejs_compat wherever compatibility_flags is declared', () => {
    // Better Auth reaches `node:async_hooks` at IMPORT time, so a block whose flags omit this
    // fails the whole isolate — every route, `/health` included.
    //
    // ⚠️ IT DOES NOT ASSERT A COUNT, AND AN EARLIER VERSION DID. `compatibility_flags` IS
    // inheritable in wrangler's config schema (unlike `vars` / `d1_databases` / `send_email`,
    // which the schema marks as not inherited), so a correct file may declare it once and let
    // `[env.production]` inherit. `toHaveLength(2)` would red-fail exactly that file — a gate
    // failing on a correct config, which is worse than not checking. What must hold is that
    // every declaration present enables the flag, and that at least one exists.
    const flagLines = [...declarations.matchAll(/^compatibility_flags = \[([^\]]*)\]/gm)];
    expect(flagLines.length).toBeGreaterThan(0);
    for (const [, value] of flagLines) expect(value).toContain('nodejs_compat');
  });
});

describe('the dev token issuer is DELETED, not disabled', () => {
  // The 5-4 seam verified a dev-only HMAC bearer token gated on an env var. Story 5-5 removed the
  // issuer, the verifier and the route. "Gated" decays — a gate can be flipped by a stray var —
  // whereas "absent" cannot, so the absence is what is asserted.
  const identity = readFileSync(join(workerRoot, 'src', 'lib', 'identity.ts'), 'utf8');
  const app = readFileSync(join(workerRoot, 'src', 'app.ts'), 'utf8');
  /**
   * ⚠️ IT ONLY STRIPS COMMENTS THAT START A LINE, AND THE NAIVE VERSION WAS A LATENT BUG STORY
   * 5-7 TRIPPED. It used to be one unanchored block-comment regex with no idea what a string is.
   * `app.ts` is full of route paths ending in a star — `'/api/x'` with a `*` for the last segment
   * — and each of those contains, character for character, a comment OPENER. The regex happily
   * opened a "comment" inside a STRING LITERAL and closed it at the next real comment terminator,
   * swallowing whatever code sat between. Whether that mattered depended on the PARITY of openers
   * in the file, so it passed for two stories and then red-failed on an edit that added only
   * comments, reporting that the auth router was not mounted when it plainly is.
   *
   * A line-anchored strip cannot make that mistake: a route path never begins a line, and the only
   * thing this helper protects against is a deleted symbol surviving in prose.
   */
  const stripComments = (code: string) =>
    code
      .replace(/^\s*\/\*[\s\S]*?\*\//gm, '')
      .replace(/^\s*\*.*$/gm, '')
      .replace(/^\s*\/\/.*$/gm, '');

  it('the seam carries no token issuer or verifier', () => {
    const source = stripComments(identity);
    expect(source).not.toMatch(/issueDevToken/);
    expect(source).not.toMatch(/verifyDevToken/);
    expect(source).not.toMatch(/DEV_AUTH_SECRET/);
  });

  it('the seam still exists and resolves through Better Auth (anti-vacuity)', () => {
    const source = stripComments(identity);
    expect(source).toMatch(/export async function getUserId/);
    expect(source).toMatch(/getSession/);
  });

  it('`POST /api/dev/token` is gone and /api/auth/* is mounted in its place', () => {
    const source = stripComments(app);
    expect(source).not.toContain('/api/dev/token');
    expect(source).toContain("'/api/auth/*'");
  });
});

describe('the deployed hostnames, which live in three files and must agree', () => {
  // ⚠️ BOTH BROWSER-ONLY OUTAGES THIS STORY SHIPPED CAME FROM THIS DRIFT. The app's CSP names the
  // worker in `connect-src`, the worker names itself in `BETTER_AUTH_URL` (which builds every
  // OAuth `redirect_uri`), and it names the app in `ALLOWED_ORIGINS` (which is BOTH the CORS
  // allowlist and Better Auth's `trustedOrigins`). Change one and the other two keep working
  // perfectly on native — which is exactly why nobody notices until a browser is opened.
  const headers = readFileSync(join(workerRoot, '..', 'expo', 'public', '_headers'), 'utf8');
  const csp = /Content-Security-Policy:.*/.exec(headers)?.[0] ?? '';
  const varOf = (key: string) =>
    [...toml.matchAll(new RegExp(`^${key} = "([^"]*)"`, 'gm'))].map((m) => m[1]);
  /** The body of one TOML table, up to the next `[header]`. */
  const sectionOf = (header: string) => {
    const start = toml.indexOf(header);
    expect(start, `${header} is missing from wrangler.toml`).toBeGreaterThan(-1);
    const rest = toml.slice(start + header.length);
    const next = rest.search(/^\[/m);
    return next === -1 ? rest : rest.slice(0, next);
  };
  const withoutComments = (block: string) =>
    block
      .split(/\r?\n/)
      .filter((line) => !/^\s*#/.test(line))
      .join('\n');

  it('the CSP lets the app reach the worker BETTER_AUTH_URL names', () => {
    const authUrl = varOf('BETTER_AUTH_URL').at(-1) ?? '';
    expect(authUrl).toMatch(/^https:\/\//);
    // A `connect-src` missing this host blocks every request the app makes, before it is sent.
    expect(csp).toContain(`connect-src`);
    expect(csp).toContain(authUrl);
  });

  it('the worker trusts the origin the app is actually served from', () => {
    // The app's own origin has to be in ALLOWED_ORIGINS or the preflight answers 204 with no
    // `access-control-allow-origin` and the browser drops the call.
    const production = varOf('ALLOWED_ORIGINS').at(-1) ?? '';
    expect(production.split(',').some((o) => o.startsWith('https://'))).toBe(true);
    // ...and that origin must be one the CSP would let the page talk from — same document.
    for (const origin of production.split(',')) {
      expect(origin.trim()).toMatch(/^https:\/\/[^/]+$/);
    }
  });

  it('PRODUCTION trusts no localhost origin', () => {
    // ⚠️ THIS LIST IS NOT ONLY CORS — `lib/auth.ts` feeds it to `trustedOrigins`, so a `localhost`
    // entry means the LIVE worker accepts credentialed cross-origin requests from any page on any
    // developer's machine, and will redirect an OAuth callback there. Three were added during
    // story 5-5 for local convenience and shipped in the production block.
    //
    // Comment lines are stripped first — the paragraph in `wrangler.toml` explaining this rule
    // says "localhost" itself, and a scan its own documentation fails is a scan nobody can keep.
    const productionVars = withoutComments(sectionOf('[env.production.vars]'));
    expect(productionVars).toContain('ALLOWED_ORIGINS');
    expect(productionVars).not.toMatch(/localhost|127\.0\.0\.1|0\.0\.0\.0/);
  });

  it('DEVELOPMENT still has them — the fix must not break local web work', () => {
    // Anti-vacuity, and a real regression guard: without these the Expo web build cannot reach a
    // LOCAL worker at all, because `app.ts` answers no `access-control-allow-origin` for an
    // origin it was not told about.
    expect(withoutComments(sectionOf('[vars]'))).toContain('http://localhost:8082');
  });
});
