/**
 * The Apple web client secret — the one credential in this project that expires on its own.
 *
 * ⚠️ EVERY CASE HERE IS ABOUT A FAILURE THAT IS SILENT UNTIL A USER HITS IT. Apple issues no
 * static client secret: you sign a JWT with a .p8 and Apple refuses anything claiming more than
 * six months. A deployment can therefore be green in every other respect and still have one
 * sign-in button that stopped working on a date nobody recorded. The states below are what let
 * `lib/auth.ts` refuse in a way that NAMES the cause, and `/health` report it before anyone does.
 */
import { describe, expect, it } from 'vitest';
import {
  describeAppleWebSecret,
  jwtExpiry,
  mintAppleClientSecret,
  resolveAppleWebSecret,
} from './appleSecret';

/**
 * A throwaway P-256 key in PKCS#8 PEM, generated per run.
 *
 * Generated rather than hard-coded on purpose: a private key checked into a repo is a private key
 * checked into a repo, however inert, and every scanner that finds it is right to complain.
 */
async function throwawayP8(): Promise<string> {
  // ⚠️ The casts are the workers-types signatures, not looseness: `generateKey` is typed as
  // `CryptoKey | CryptoKeyPair` (it returns a pair only for asymmetric algorithms) and
  // `exportKey` as `ArrayBuffer | JsonWebKey` (a JWK only for `'jwk'`). Both are narrowed here by
  // the arguments, which the overloads cannot express.
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  const der = new Uint8Array(
    (await crypto.subtle.exportKey('pkcs8', pair.privateKey)) as ArrayBuffer
  );
  let binary = '';
  for (const byte of der) binary += String.fromCharCode(byte);
  const body = btoa(binary).replace(/(.{64})/g, '$1\n');
  return `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----\n`;
}

/** A JWT with the given `exp`. The signature is not read — see `lib/jwt.ts`. */
function jwtWithExpiry(expSeconds: number): string {
  const b64 = (value: unknown) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64({ alg: 'ES256' })}.${b64({ exp: expSeconds })}.sig`;
}

const NOW = Date.UTC(2026, 7, 25);

describe('minting from a .p8', () => {
  it('signs an assertion Apple would accept, with the claims Apple requires', async () => {
    const { token, expiresAt } = await mintAppleClientSecret(
      {
        serviceId: 'com.nobleachievements.cloudquran.auth',
        teamId: 'MA2HBUUNVP',
        keyId: 'ABC1234567',
        privateKeyPem: await throwawayP8(),
      },
      NOW
    );

    // base64URL → base64 before decoding: the token is deliberately free of `+`, `/` and `=`.
    const decode = (part: string) => JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
    // Only the first two: the third is the signature and is not JSON. `.map` over all three
    // evaluates it even though the destructuring ignores it.
    const [headerPart, payloadPart] = token.split('.');
    const header = decode(headerPart);
    const payload = decode(payloadPart);
    expect(header).toMatchObject({ alg: 'ES256', kid: 'ABC1234567' });
    // ⚠️ `aud` IS APPLE'S TOKEN ENDPOINT, NOT OUR OWN BASE URL. The natural-looking mistake
    // (`aud: baseURL`) is rejected with an opaque `invalid_client` that names nothing.
    expect(payload.aud).toBe('https://appleid.apple.com');
    expect(payload.iss).toBe('MA2HBUUNVP');
    expect(payload.sub).toBe('com.nobleachievements.cloudquran.auth');
    // Well inside Apple's six-month cap, which it rejects outright rather than truncating.
    expect(payload.exp - payload.iat).toBeLessThan(15_777_000);
    expect(payload.exp).toBeGreaterThan(payload.iat);
    expect(expiresAt.getTime()).toBe(payload.exp * 1000);
    // Three segments, base64url — a JWS ES256 signature is the raw r||s WebCrypto returns.
    expect(token.split('.')).toHaveLength(3);
    expect(token).not.toMatch(/[+/=]/);
  });

  it('throws a message naming the variable when the key is not a PEM', async () => {
    await expect(
      mintAppleClientSecret({
        serviceId: 's',
        teamId: 't',
        keyId: 'k',
        privateKeyPem: 'obviously not a key',
      })
    ).rejects.toThrow(/APPLE_PRIVATE_KEY/);
  });
});

describe('resolveAppleWebSecret', () => {
  it('is not-configured with no Services ID, and says which variable is missing', async () => {
    const result = await resolveAppleWebSecret({}, NOW);
    expect(result.state).toBe('not-configured');
    expect(describeAppleWebSecret(result)).toContain('APPLE_SERVICE_ID');
  });

  it('is not-configured with a Services ID but no way to produce a secret', async () => {
    // Half-configured must refuse, not send an empty client secret to Apple's token endpoint.
    const result = await resolveAppleWebSecret({ APPLE_SERVICE_ID: 'com.example.web' }, NOW);
    expect(result.state).toBe('not-configured');
    expect(describeAppleWebSecret(result)).toMatch(/APPLE_PRIVATE_KEY|APPLE_CLIENT_SECRET/);
  });

  it('mints from the .p8 when the four values are present', async () => {
    const result = await resolveAppleWebSecret(
      {
        APPLE_SERVICE_ID: 'com.example.web',
        APPLE_TEAM_ID: 'MA2HBUUNVP',
        APPLE_KEY_ID: 'ABC1234567',
        APPLE_PRIVATE_KEY: await throwawayP8(),
      },
      NOW
    );
    expect(result.state).toBe('ready');
    if (result.state !== 'ready') return;
    expect(result.serviceId).toBe('com.example.web');
    expect(result.expiresAt.getTime()).toBeGreaterThan(NOW);
  });

  it('accepts a PEM whose newlines arrived as literal backslash-n', async () => {
    // ⚠️ THE SHAPE THAT ACTUALLY SHIPPED. Every transport between the sops store and the Worker is
    // single-line: `sops -d --output-type dotenv` turns the PEM's newlines into the two characters
    // backslash-n, and `wrangler secret bulk` stores that verbatim. On 2026-08-25 the push reported
    // eight secrets created and `/health` then answered "APPLE_PRIVATE_KEY is not a PEM-encoded
    // PKCS#8 key" — a green deploy and a dead sign-in leg. Nothing else in the suite can see it,
    // because every other fixture hands over a real multi-line string.
    const escaped = (await throwawayP8()).replace(/\n/g, String.raw`\n`);
    expect(escaped).not.toContain('\n');

    const result = await resolveAppleWebSecret(
      {
        APPLE_SERVICE_ID: 'com.example.web',
        APPLE_TEAM_ID: 'MA2HBUUNVP',
        APPLE_KEY_ID: 'ABC1234567',
        APPLE_PRIVATE_KEY: escaped,
      },
      NOW
    );

    expect(result.state).toBe('ready');
  });

  it('prefers the .p8 over a supplied JWT, even an expired one', async () => {
    // The whole point of holding the key is that nothing expires. An operator who left a stale
    // `APPLE_CLIENT_SECRET` behind while adding the .p8 must not be broken by the leftover.
    const result = await resolveAppleWebSecret(
      {
        APPLE_SERVICE_ID: 'com.example.web',
        APPLE_TEAM_ID: 'MA2HBUUNVP',
        APPLE_KEY_ID: 'ABC1234567',
        APPLE_PRIVATE_KEY: await throwawayP8(),
        APPLE_CLIENT_SECRET: jwtWithExpiry(Math.floor(NOW / 1000) - 1),
      },
      NOW
    );
    expect(result.state).toBe('ready');
  });

  it('accepts a supplied JWT that is still valid', async () => {
    const expSeconds = Math.floor(NOW / 1000) + 3600;
    const result = await resolveAppleWebSecret(
      { APPLE_SERVICE_ID: 'com.example.web', APPLE_CLIENT_SECRET: jwtWithExpiry(expSeconds) },
      NOW
    );
    expect(result.state).toBe('ready');
    if (result.state !== 'ready') return;
    expect(result.expiresAt.getTime()).toBe(expSeconds * 1000);
  });

  it('reports EXPIRED — with the date — for a lapsed supplied JWT', async () => {
    // ⚠️ THE CASE THIS FILE EXISTS FOR. Six months after someone pasted a secret in, this is what
    // the deployment looks like, and "the failure names the cause" is a story acceptance
    // criterion. A bare 500 here is a locked-out user and an operator with nothing to go on.
    const expiredAt = Math.floor(NOW / 1000) - 60;
    const result = await resolveAppleWebSecret(
      { APPLE_SERVICE_ID: 'com.example.web', APPLE_CLIENT_SECRET: jwtWithExpiry(expiredAt) },
      NOW
    );
    expect(result.state).toBe('expired');
    const described = describeAppleWebSecret(result);
    expect(described).toContain(new Date(expiredAt * 1000).toISOString());
    expect(described).toMatch(/6 months|re-generate/i);
  });

  it("refuses a supplied secret that outlives Apple's six-month cap", async () => {
    // ⚠️ `APPLE_SECRET_MAX_LIFETIME_SECONDS` was DOCUMENTED and never enforced. Apple rejects any
    // assertion claiming longer, so the worker reported `ready`, `/health` agreed, and every
    // sign-in failed with an opaque `invalid_client` — a green readiness endpoint in front of a
    // dead button. A year is the natural mistake to make by hand.
    const oneYear = Math.floor(NOW / 1000) + 365 * 24 * 60 * 60;
    const result = await resolveAppleWebSecret(
      { APPLE_SERVICE_ID: 'com.example.web', APPLE_CLIENT_SECRET: jwtWithExpiry(oneYear) },
      NOW
    );
    expect(result.state).toBe('invalid');
    expect(describeAppleWebSecret(result)).toMatch(/6 months/);
  });

  it('accepts one just inside the cap — anti-vacuity for the case above', async () => {
    const almostSixMonths = Math.floor(NOW / 1000) + 15_000_000;
    const result = await resolveAppleWebSecret(
      { APPLE_SERVICE_ID: 'com.example.web', APPLE_CLIENT_SECRET: jwtWithExpiry(almostSixMonths) },
      NOW
    );
    expect(result.state).toBe('ready');
  });

  it('reports INVALID for an unreadable supplied secret rather than passing it on', async () => {
    const result = await resolveAppleWebSecret(
      { APPLE_SERVICE_ID: 'com.example.web', APPLE_CLIENT_SECRET: 'not-a-jwt' },
      NOW
    );
    expect(result.state).toBe('invalid');
  });

  it('reports INVALID for an unusable .p8 — a paste error, not a crash', async () => {
    const result = await resolveAppleWebSecret(
      {
        APPLE_SERVICE_ID: 'com.example.web',
        APPLE_TEAM_ID: 'MA2HBUUNVP',
        APPLE_KEY_ID: 'ABC1234567',
        APPLE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\nnot base64!!\n-----END PRIVATE KEY-----',
      },
      NOW
    );
    expect(result.state).toBe('invalid');
  });

  it('re-mints when the credential material changes — the cache cannot serve a rotated key', async () => {
    // ⚠️ The module-scope cache is the shape `lib/auth.ts` warns about, so its key is derived
    // from the credential itself. Two different keys must never share an entry, or a rotation
    // would keep serving the old assertion from a warm isolate.
    const base = {
      APPLE_SERVICE_ID: 'com.example.web',
      APPLE_TEAM_ID: 'MA2HBUUNVP',
      APPLE_KEY_ID: 'ABC1234567',
    };
    const first = await resolveAppleWebSecret({ ...base, APPLE_PRIVATE_KEY: await throwawayP8() });
    const second = await resolveAppleWebSecret({ ...base, APPLE_PRIVATE_KEY: await throwawayP8() });
    expect(first.state).toBe('ready');
    expect(second.state).toBe('ready');
    if (first.state !== 'ready' || second.state !== 'ready') return;
    expect(first.clientSecret).not.toBe(second.clientSecret);
  });
});

describe('jwtExpiry', () => {
  it('reads exp without verifying, and answers null for anything unreadable', () => {
    expect(jwtExpiry(jwtWithExpiry(1_800_000_000))?.getTime()).toBe(1_800_000_000_000);
    expect(jwtExpiry('a.b')).toBeNull();
    expect(jwtExpiry('not-a-jwt')).toBeNull();
  });
});
