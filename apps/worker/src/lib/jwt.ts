/**
 * Read a JWT's claims WITHOUT verifying it.
 *
 * ⚠️ EVERY CALLER MUST BE ABLE TO SAY WHY UNVERIFIED IS SAFE, AND THERE ARE ONLY TWO REASONS IN
 * THIS WORKER:
 *   • `lib/appleSecret.ts` reads the `exp` of a secret WE minted or an operator supplied. There is
 *     no attacker in that path — the question is about our own clock, and the signature is
 *     Apple's to check when the token is presented to Apple.
 *   • `lib/auth.ts` reads the email out of a provider id token that Better Auth has ALREADY
 *     verified: the native path runs `verifyProviderIdToken` against the provider's JWKS before
 *     an `account` row can exist, and the redirect path receives the token from the provider's
 *     own token endpoint over TLS. By the time a `databaseHooks.account.create.after` hook runs,
 *     the token is as trusted as the account row it arrived with.
 *
 * Anywhere else, this function is the wrong tool. There is deliberately no `verify` alongside it,
 * so nobody can reach for the wrong half.
 */
export function decodeJwtClaims(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const claims: unknown = JSON.parse(atob(padded));
    return typeof claims === 'object' && claims !== null
      ? (claims as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
