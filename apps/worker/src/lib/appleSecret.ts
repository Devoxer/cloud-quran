/**
 * THE APPLE WEB CLIENT SECRET (story 5-5 amendment) — a JWT the worker mints, not a static value.
 *
 * ⚠️ THIS IS THE ONE CREDENTIAL IN THE PROJECT THAT EXPIRES ON ITS OWN. Apple does not issue a
 * client secret; you sign one yourself with a .p8 key, and Apple REFUSES any assertion whose
 * lifetime exceeds 6 months. Treating it as a static secret therefore means a sign-in method that
 * works for months and then stops, on a date nobody wrote down, with a 500 on the one path a
 * locked-out user needs. So the worker mints a SHORT-LIVED one per use from the .p8 and there is
 * no rotation date at all.
 *
 * ⚠️ NATIVE APPLE SIGN-IN NEEDS NONE OF THIS. An id token from the iOS sheet is verified against
 * Apple's JWKS with the BUNDLE IDENTIFIER as its audience — no Services ID, no key, no secret.
 * Everything here exists for the WEB and DESKTOP redirect only, which is why its absence must
 * degrade one button on two platforms rather than break the provider.
 *
 * ⚠️ NO NEW DEPENDENCY. `jose` would do this in three lines and is already in the tree as a
 * transitive dependency of better-auth — but depending on someone else's transitive dependency is
 * how a minor bump becomes an outage, and the spec fences off dependencies beyond the four it
 * names. WebCrypto signs ES256 natively in workerd, and a JWS signature for ES256 is exactly the
 * raw `r||s` that `crypto.subtle.sign` returns, so there is no DER unwrapping to get wrong.
 */

import { decodeJwtClaims } from './jwt';

/** Apple's hard cap. A JWT claiming longer is rejected outright, so stay well inside it. */
export const APPLE_SECRET_MAX_LIFETIME_SECONDS = 15_777_000; // 6 months, Apple's documented cap.

/**
 * How long a minted secret claims. Deliberately SHORT: it is re-minted per isolate as needed, it
 * never leaves the worker, and a small window bounds the damage if one is ever captured in a log.
 */
const MINTED_LIFETIME_SECONDS = 30 * 60;

/** Re-mint this long before expiry, so a request never picks up a token about to lapse. */
const REFRESH_MARGIN_SECONDS = 5 * 60;

/** Where a usable Apple web secret can come from, and why it is not usable when it is not. */
export type AppleWebSecret =
  | { state: 'ready'; clientSecret: string; serviceId: string; expiresAt: Date }
  /** No Services ID, or no way to produce a secret. The web button is dark; native is unaffected. */
  | { state: 'not-configured'; reason: string }
  /** A pre-generated JWT was supplied and its `exp` has passed. This is the one that surprises. */
  | { state: 'expired'; expiredAt: Date }
  /** The .p8 could not be parsed or signed with. A typo in the secret store, most likely. */
  | { state: 'invalid'; reason: string };

const encoder = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlJson(value: unknown): string {
  return base64url(encoder.encode(JSON.stringify(value)));
}

/**
 * Read the `exp` of a JWT WITHOUT verifying it.
 *
 * ⚠️ Verification is not the question here and would need Apple's key, which we do not have — the
 * signature is Apple's to check when the token is presented. What this answers is "will Apple
 * reject this for being stale", which is a claim about our own clock and is exactly the failure
 * an operator needs told about BEFORE a user hits it.
 */
export function jwtExpiry(token: string): Date | null {
  const exp = decodeJwtClaims(token)?.exp;
  return typeof exp === 'number' ? new Date(exp * 1000) : null;
}

/** Strip the PEM armour off a .p8 and return its DER bytes. */
function pkcs8Der(pem: string): Uint8Array | null {
  const body = pem
    .replace(/-----BEGIN [A-Z ]+-----/g, '')
    .replace(/-----END [A-Z ]+-----/g, '')
    .replace(/\s+/g, '');
  if (body.length === 0) return null;
  try {
    const binary = atob(body);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

type AppleKeyInputs = {
  serviceId: string;
  teamId: string;
  keyId: string;
  privateKeyPem: string;
};

/** Sign one client-secret assertion. Exported so a test can read its claims back. */
export async function mintAppleClientSecret(
  { serviceId, teamId, keyId, privateKeyPem }: AppleKeyInputs,
  nowMs: number = Date.now()
): Promise<{ token: string; expiresAt: Date }> {
  const der = pkcs8Der(privateKeyPem);
  if (!der) throw new Error('APPLE_PRIVATE_KEY is not a PEM-encoded PKCS#8 key');

  // ⚠️ WRAPPED SO THE MESSAGE NAMES THE VARIABLE. WebCrypto's own failure is `Invalid keyData`,
  // which tells an operator nothing about WHICH of this worker's secrets they pasted wrong — and
  // this message is what `describeAppleWebSecret` puts in front of them.
  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey(
      'pkcs8',
      der,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign']
    );
  } catch (error) {
    throw new Error(
      `APPLE_PRIVATE_KEY is not a usable P-256 signing key (${(error as Error).message})`
    );
  }

  const issuedAt = Math.floor(nowMs / 1000);
  const expiresAt = issuedAt + MINTED_LIFETIME_SECONDS;
  const header = base64urlJson({ alg: 'ES256', kid: keyId, typ: 'JWT' });
  const payload = base64urlJson({
    iss: teamId,
    iat: issuedAt,
    exp: expiresAt,
    // ⚠️ ALWAYS this literal. Apple's token endpoint is the audience of the assertion, NOT your
    // own worker — a natural-looking `aud: baseURL` is rejected with an opaque `invalid_client`.
    aud: 'https://appleid.apple.com',
    sub: serviceId,
  });
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      encoder.encode(`${header}.${payload}`)
    )
  );
  return {
    token: `${header}.${payload}.${base64url(signature)}`,
    expiresAt: new Date(expiresAt * 1000),
  };
}

/**
 * Cache of minted secrets, keyed on a fingerprint of the INPUTS.
 *
 * ⚠️ THIS IS NOT THE HOISTING TRAP `lib/auth.ts` warns about, and the key is why. That trap is
 * about module scope pinning whichever secret the FIRST request carried, so a rotated credential
 * keeps serving stale from a warm isolate. Here the cache key IS derived from the credential
 * material, so a rotated .p8, key id, team id or Services ID cannot hit the existing entry — it
 * misses and mints afresh. What is cached is a derived value, not the binding.
 *
 * Without it every request to the worker would import a key and compute an ECDSA signature, which
 * is CPU this project bills for on a path most requests never use.
 */
const mintedCache = new Map<string, { token: string; expiresAt: Date }>();

/**
 * A fingerprint of the credential material, for the cache key.
 *
 * ⚠️ A HASH, BECAUSE THE OBVIOUS CHEAP VERSION WAS WRONG AND A TEST CAUGHT IT. The first cut used
 * the PEM's LENGTH plus its last 24 characters — but the tail of a PEM is `-END PRIVATE KEY-----`,
 * identical for every key, and two P-256 keys are the same length. So every .p8 fingerprinted
 * identically, and a rotated key kept serving the OLD assertion out of a warm isolate: precisely
 * the staleness this cache was designed not to have. SHA-256 costs microseconds, runs only on the
 * Apple path, and cannot collide by construction.
 */
async function cacheKey({
  serviceId,
  teamId,
  keyId,
  privateKeyPem,
}: AppleKeyInputs): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode([serviceId, teamId, keyId, privateKeyPem].join('\u0000'))
  );
  return base64url(new Uint8Array(digest));
}

type AppleEnv = {
  APPLE_SERVICE_ID?: string;
  APPLE_TEAM_ID?: string;
  APPLE_KEY_ID?: string;
  APPLE_PRIVATE_KEY?: string;
  APPLE_CLIENT_SECRET?: string;
};

/**
 * Resolve the Apple WEB credentials for this deployment.
 *
 * Two inputs, one answer, in preference order:
 *   1. `.p8` + key id + team id + Services ID — the worker mints its own, so nothing expires and
 *      there is no rotation date to forget. This is the intended configuration.
 *   2. A pre-generated `APPLE_CLIENT_SECRET` JWT, for an operator who already has one. Its `exp`
 *      IS checked, because this is the input that lapses silently.
 * Anything else answers a state the caller can turn into a typed refusal — never a throw, because
 * "Apple web is not set up" is a configuration fact about one button, not a request failure.
 */
export async function resolveAppleWebSecret(
  env: AppleEnv,
  nowMs: number = Date.now()
): Promise<AppleWebSecret> {
  const serviceId = env.APPLE_SERVICE_ID?.trim();
  if (!serviceId) {
    return {
      state: 'not-configured',
      reason: 'APPLE_SERVICE_ID is not set (the Services ID from the Apple developer console)',
    };
  }

  const teamId = env.APPLE_TEAM_ID?.trim();
  const keyId = env.APPLE_KEY_ID?.trim();
  // ⚠️ UN-ESCAPE `\n` FIRST. A PKCS#8 PEM is multi-line, and every transport this value crosses is
  // single-line: `sops -d --output-type dotenv` emits the newlines as the two characters
  // backslash-n, `wrangler secret bulk` stores exactly what dotenv gave it, and `.dev.vars` has
  // the same shape. Without this the Worker receives one long line and the PEM parser rejects it
  // — which is precisely what shipped on 2026-08-25: `secrets:push:worker` reported eight secrets
  // created and `/health` then said "APPLE_PRIVATE_KEY is not a PEM-encoded PKCS#8 key". A real
  // multi-line value that arrives intact is unaffected, since it contains no literal backslash-n.
  const privateKeyPem = env.APPLE_PRIVATE_KEY?.replace(/\\n/g, '\n').trim();

  if (teamId && keyId && privateKeyPem) {
    const inputs = { serviceId, teamId, keyId, privateKeyPem };
    const key = await cacheKey(inputs);
    const cached = mintedCache.get(key);
    if (cached && cached.expiresAt.getTime() - nowMs > REFRESH_MARGIN_SECONDS * 1000) {
      return { state: 'ready', clientSecret: cached.token, serviceId, expiresAt: cached.expiresAt };
    }
    try {
      const minted = await mintAppleClientSecret(inputs, nowMs);
      mintedCache.set(key, minted);
      return {
        state: 'ready',
        clientSecret: minted.token,
        serviceId,
        expiresAt: minted.expiresAt,
      };
    } catch (error) {
      return { state: 'invalid', reason: (error as Error).message };
    }
  }

  const supplied = env.APPLE_CLIENT_SECRET?.trim();
  if (supplied) {
    const expiresAt = jwtExpiry(supplied);
    if (!expiresAt)
      return { state: 'invalid', reason: 'APPLE_CLIENT_SECRET is not a readable JWT' };
    if (expiresAt.getTime() <= nowMs) return { state: 'expired', expiredAt: expiresAt };
    /**
     * ⚠️ THE SIX-MONTH CAP IS APPLE'S, AND IT WAS DOCUMENTED HERE WITHOUT BEING ENFORCED. A
     * supplied assertion claiming a longer lifetime is REJECTED BY APPLE on every use — so the
     * worker would report `ready`, `/health` would agree, and every sign-in would fail with an
     * opaque `invalid_client`. Refusing it here names the cause instead, in the one place an
     * operator is already looking. `mintAppleClientSecret` cannot trip this; a hand-generated
     * secret with a year-long `exp` is exactly the mistake it catches.
     */
    if ((expiresAt.getTime() - nowMs) / 1000 > APPLE_SECRET_MAX_LIFETIME_SECONDS) {
      return {
        state: 'invalid',
        reason:
          `APPLE_CLIENT_SECRET expires ${expiresAt.toISOString()}, which is more than the ` +
          '6 months Apple allows — Apple rejects the assertion outright. Re-generate it with a ' +
          'shorter lifetime, or set APPLE_PRIVATE_KEY and let the worker mint its own.',
      };
    }
    return { state: 'ready', clientSecret: supplied, serviceId, expiresAt };
  }

  return {
    state: 'not-configured',
    reason:
      'no Apple signing key (set APPLE_TEAM_ID, APPLE_KEY_ID and APPLE_PRIVATE_KEY, ' +
      'or supply a pre-generated APPLE_CLIENT_SECRET)',
  };
}

/** One sentence an operator can act on, for a health payload or a typed refusal. */
export function describeAppleWebSecret(secret: AppleWebSecret): string {
  switch (secret.state) {
    case 'ready':
      return `ready (this assertion expires ${secret.expiresAt.toISOString()})`;
    case 'expired':
      return `the Apple client secret expired ${secret.expiredAt.toISOString()} — Apple caps it at 6 months; re-generate it, or switch to APPLE_PRIVATE_KEY so the worker mints its own`;
    case 'invalid':
      return `the Apple credentials are unusable: ${secret.reason}`;
    default:
      return `Apple web sign-in is not configured: ${secret.reason}`;
  }
}
