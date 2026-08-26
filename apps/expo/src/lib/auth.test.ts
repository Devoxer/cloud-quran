/**
 * The auth client's ORDERING and its refusal-to-guess — the parts a screen cannot show you.
 *
 * ⚠️ WHAT THIS FILE IS FOR, AND WHAT IT DELIBERATELY IS NOT. It does not re-test Better Auth. It
 * pins the four decisions in `lib/auth.ts` that are load-bearing, invisible at runtime, and one
 * careless edit from data loss:
 *
 *   1. `signOut` tears the device down BEFORE ending the session, and mints a fresh anonymous one
 *      after. Dropping either leaves a real defect that no screen reveals: the departing user's
 *      playback and caches leaking into the next account, or "signed out" silently meaning "no
 *      identity, every write 401s, until you relaunch".
 *   2. An UNREADABLE session must never be treated as "there is nobody". Both readers act on that
 *      answer, and both then orphan the guest's rows — by minting over them, or by taking the
 *      `signIn.social` path this whole module exists to avoid.
 *   3. **`signIn.social` is used ALWAYS, with the session cookie attached by hand, and
 *      `linkSocial` is never called.** That inversion is the fix for a production defect —
 *      `/link-social` never checks whether the provider's address belongs to another account, so
 *      it forks a second one — and re-adding the old preference is a two-character edit.
 *   4. Requesting a code is not signing in.
 *
 * The client is mocked at the `authClient` boundary — the module under test is the logic around
 * it, and standing up a real Better Auth client would test upstream instead. The upstream
 * behaviours themselves were proven end to end against a real server in the story's spike.
 */

const mockSignInAnonymous = jest.fn();
const mockSignInSocial = jest.fn();
const mockSignInEmailOtp = jest.fn();
const mockLinkSocial = jest.fn();
const mockSendVerificationOtp = jest.fn();
const mockClientSignOut = jest.fn();
const mockDeleteUser = jest.fn();
/** What `checkConnectivity()` answers. `null` on either flag is UNKNOWN, never offline. */
let mockConnectivity: { isConnected: boolean | null; isInternetReachable: boolean | null } = {
  isConnected: true,
  isInternetReachable: true,
};
const mockGetSession = jest.fn();
const mockRefetch = jest.fn();
const mockTeardown = jest.fn();
/** Every call, in the order it happened — the only way to assert an ORDER rather than a set. */
let mockCalls: string[] = [];
/** Swapped per test — a device always produces a UUID; a broken build produces nothing. */
let mockRandomUUID: () => string | undefined = () => 'nonce-11111111-2222-3333-4444-555555555555';
/** The platform the module under test believes it is running on. Reset in `beforeEach`. */
let mockPlatformOS = 'ios';
/** What the SecureStore cookie jar answers. `''` is a caller with genuinely no session. */
let mockCookie = 'better-auth.session_token=guest-token';

jest.mock('@better-auth/expo/client', () => ({
  expoClient: () => ({ id: 'expo' }),
  // The real one merges a Set-Cookie header into the plugin's stored JSON jar. A pass-through
  // keeps the assertion about WHAT was stored rather than about upstream's serialisation.
  getSetCookie: (header: string) => JSON.stringify({ raw: header }),
}));
jest.mock('better-auth/client/plugins', () => ({
  anonymousClient: () => ({ id: 'anonymous' }),
  emailOTPClient: () => ({ id: 'email-otp' }),
}));
jest.mock('better-auth/react', () => ({
  createAuthClient: () => ({
    signIn: {
      anonymous: (...args: unknown[]) => {
        mockCalls.push('signIn.anonymous');
        return mockSignInAnonymous(...args);
      },
      social: (...args: unknown[]) => {
        mockCalls.push('signIn.social');
        return mockSignInSocial(...args);
      },
      emailOtp: (...args: unknown[]) => mockSignInEmailOtp(...args),
    },
    linkSocial: (...args: unknown[]) => {
      mockCalls.push('linkSocial');
      return mockLinkSocial(...args);
    },
    emailOtp: { sendVerificationOtp: (...args: unknown[]) => mockSendVerificationOtp(...args) },
    signOut: (...args: unknown[]) => {
      mockCalls.push('authClient.signOut');
      return mockClientSignOut(...args);
    },
    deleteUser: (...args: unknown[]) => {
      mockCalls.push('authClient.deleteUser');
      return mockDeleteUser(...args);
    },
    getSession: (...args: unknown[]) => mockGetSession(...args),
    useSession: () => ({ data: null }),
    getCookie: async () => mockCookie,
    $store: { atoms: { session: { get: () => ({ refetch: mockRefetch }) } } },
  }),
}));
// `expo-crypto`'s native module is absent under Jest, so the real `randomUUID()` answers
// nothing — which is itself a case worth driving (see the NO_NONCE test below).
jest.mock('expo-crypto', () => ({ randomUUID: () => mockRandomUUID() }));
// `Platform.OS` decides the MECHANISM (native id token vs OAuth redirect), so the suite has to be
// able to move it. Only `OS` is replaced; `select` and the rest of the module stay real.
jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');
  // ⚠️ A PROXY, NOT A SPREAD. `{ ...require('react-native') }` READS every export, and several are
  // deprecation getters that warn (and pull half the list virtualisation stack in) the moment
  // they are touched — the suite fails to load before a single test runs. A proxy forwards
  // lazily, so only `Platform` is ever resolved here.
  return new Proxy(actual, {
    get(target, prop, receiver) {
      if (prop === 'Platform') {
        return new Proxy(target.Platform, {
          get: (p, key) => (key === 'OS' ? mockPlatformOS : Reflect.get(p, key)),
        });
      }
      return Reflect.get(target, prop, receiver);
    },
  });
});
// The cookie jar `finishNativeRedirect` writes when it harvests the session out of the deep link.
const mockSecureStoreSet = jest.fn(async () => {});
jest.mock('@/lib/secureStore', () => ({
  getItem: async () => null,
  setItem: (...args: unknown[]) => mockSecureStoreSet(...(args as [])),
  deleteItem: async () => {},
}));
let mockConnectivityThrows = false;
jest.mock('@/lib/connectivity', () => ({
  checkConnectivity: async () => {
    if (mockConnectivityThrows) throw new Error('netinfo module missing');
    return mockConnectivity;
  },
}));
jest.mock('@/lib/accountTeardown', () => ({
  teardownAccountScopedState: (...args: unknown[]) => {
    mockCalls.push('teardown');
    return mockTeardown(...args);
  },
}));

import {
  deleteAccount,
  ensureAnonymousSession,
  isPlaceholderEmail,
  refreshSession,
  requestEmailCode,
  signOut,
} from '@/lib/auth';

/** The shape `authClient.getSession()` answers with. */
const sessionOk = (user: Record<string, unknown> | null) => ({
  data: user ? { user } : null,
  error: null,
});
const sessionErr = () => ({ data: null, error: { status: 503, code: 'UNAVAILABLE' } });

beforeEach(() => {
  jest.clearAllMocks();
  mockCalls = [];
  mockSignInAnonymous.mockResolvedValue({ data: {}, error: null });
  mockClientSignOut.mockResolvedValue({ data: {}, error: null });
  mockDeleteUser.mockResolvedValue({ data: { success: true }, error: null });
  mockConnectivity = { isConnected: true, isInternetReachable: true };
  mockConnectivityThrows = false;
  mockTeardown.mockResolvedValue(undefined);
  mockRefetch.mockResolvedValue(undefined);
  mockRandomUUID = () => 'nonce-11111111-2222-3333-4444-555555555555';
  mockPlatformOS = 'ios';
  mockCookie = 'better-auth.session_token=guest-token';
});

describe('signOut', () => {
  it('tears the device down BEFORE ending the session, then re-mints a guest', async () => {
    mockGetSession.mockResolvedValue(sessionOk(null));
    await signOut();

    // ⚠️ THE ORDER IS THE ASSERTION. Ending the session first leaves the audio engine briefly
    // writing progress against a session that is already gone — and the teardown is the ONE
    // account-scoped clear (playback, caches, the Sentry identity), whose absence is how a
    // departing user's state leaked into the next account on the same JS session last time.
    expect(mockCalls).toEqual(['teardown', 'authClient.signOut', 'signIn.anonymous']);
  });

  it('re-mints EVEN WHEN the session read fails — nothing is left to protect', async () => {
    // ⚠️ THE GUARD IN `ensureAnonymousSession` WOULD OTHERWISE DEFEAT THE RE-MINT. It refuses on
    // an `unknown` read so it cannot overwrite a guest it merely could not see — correct at boot,
    // wrong here: `signOut` has just destroyed the session on purpose. A transient read error
    // would leave the app with NO identity until the next cold launch, which is the exact failure
    // the re-mint was added to prevent.
    mockGetSession.mockResolvedValue(sessionErr());
    await signOut();
    expect(mockSignInAnonymous).toHaveBeenCalledTimes(1);
  });

  it('re-mints an anonymous session — "signed out" must not mean "no identity"', async () => {
    // Without this the app has NO session until the next cold launch, because the boot effect
    // runs on mount and nothing else calls it. Every scoped write would 401 in between. This was
    // observed on the real web build before it was fixed, and it is invisible to typecheck.
    mockGetSession.mockResolvedValue(sessionOk(null));
    await signOut();
    expect(mockSignInAnonymous).toHaveBeenCalledTimes(1);
  });
});

describe('deleteAccount — Apple 5.1.1(v), in-app and complete', () => {
  it('asks the SERVER first, and only then tears the device down and re-mints a guest', async () => {
    // ⚠️ THE OPPOSITE ORDER FROM `signOut`, AND THE ONE PLACE THE TWO DIVERGE ON PURPOSE.
    // `signOut` tears down first so the engine cannot write against a session about to end.
    // Deletion cannot afford that: the teardown clears the durable write OUTBOX, so tearing down
    // before a delete that then fails would discard queued writes belonging to an account that
    // still exists — and the I/O matrix requires a failure to leave the reader untouched.
    mockGetSession.mockResolvedValue(sessionOk(null));

    await expect(deleteAccount()).resolves.toEqual({ status: 'deleted' });

    expect(mockCalls).toEqual(['authClient.deleteUser', 'teardown', 'signIn.anonymous']);
  });

  it('REFUSES while offline, before anything local is touched', async () => {
    // A local-only delete would leave the device saying "gone" and the server saying otherwise —
    // the divergence the matrix forbids outright.
    mockConnectivity = { isConnected: false, isInternetReachable: false };

    await expect(deleteAccount()).resolves.toEqual({ status: 'offline' });

    expect(mockDeleteUser).not.toHaveBeenCalled();
    expect(mockTeardown).not.toHaveBeenCalled();
  });

  it('does NOT treat an UNKNOWN reachability probe as offline', async () => {
    // ⚠️ netinfo answers `null` until its probe finishes. Refusing on `null` would refuse a delete
    // on a perfectly connected device for the first seconds after launch — and "you appear to be
    // offline" is an answer nobody can act on when they are not.
    mockConnectivity = { isConnected: true, isInternetReachable: null };
    mockGetSession.mockResolvedValue(sessionOk(null));

    await expect(deleteAccount()).resolves.toEqual({ status: 'deleted' });
  });

  it('leaves the reader SIGNED IN and untouched when the server refuses — WITH NO SESSION', async () => {
    // ⚠️ THIS CASE USED TO MOCK A COMBINATION THE SERVER CANNOT PRODUCE, AND THAT IS WHY IT PASSED
    // OVER A REAL DEFECT. It paired `SESSION_EXPIRED` with a getSession that still returned a
    // valid user — but an expired session is exactly what makes `/delete-user` refuse, so the
    // honest pairing is a refusal AND no user. Under the old code that fell straight through to
    // teardown and `{status:'deleted'}`: a reader whose session had lapsed was told their account
    // was gone while it survived, with their outbox already cleared. `{ error }` from
    // `better-fetch` means the server ANSWERED, so no session read can improve on it.
    mockDeleteUser.mockResolvedValue({
      data: null,
      error: { code: 'SESSION_EXPIRED', status: 401 },
    });
    mockGetSession.mockResolvedValue(sessionOk(null));

    await expect(deleteAccount()).resolves.toEqual({ status: 'failed', code: 'SESSION_EXPIRED' });

    // Nothing local was destroyed — no teardown, no re-mint, no cleared outbox.
    expect(mockTeardown).not.toHaveBeenCalled();
    expect(mockSignInAnonymous).not.toHaveBeenCalled();
  });

  it('does not even ASK about the session on a refusal — the server already answered', async () => {
    // Anti-vacuity for the case above: the refusal must be believed on its own, not re-litigated
    // against a read whose `none` is ambiguous between "deleted" and "signed out".
    mockDeleteUser.mockResolvedValue({ data: null, error: { code: 'FAILED_TO_DELETE_USER' } });
    mockGetSession.mockClear();

    await deleteAccount();

    expect(mockGetSession).not.toHaveBeenCalled();
  });

  it('proceeds when the connectivity PROBE ITSELF throws — never blocked by its own guard', async () => {
    // ⚠️ THE GUARD MUST NOT BE ABLE TO TAKE THE PATH DOWN. `checkConnectivity()` can reject (an
    // unlinked native module, a platform without netinfo), and an unhandled rejection there threw
    // straight out of `deleteAccount` — blocking account deletion on a perfectly connected device,
    // on the one flow Apple guideline 5.1.1(v) requires to always be available. An unusable probe
    // means "let the request decide", never "refuse".
    mockConnectivityThrows = true;
    mockGetSession.mockResolvedValue(sessionOk(null));

    await expect(deleteAccount()).resolves.toEqual({ status: 'deleted' });
    expect(mockDeleteUser).toHaveBeenCalledTimes(1);
  });

  it('treats a LOST RESPONSE as the deletion it was — the server may have committed', async () => {
    // ⚠️ THE FAILURE THAT LIES IN THE WORSE DIRECTION, AND IT ARRIVES AS A THROW. `better-fetch`
    // REJECTS when the transport fails and returns `{ error }` only when the server answered — so
    // a rejection is the one shape that means "no answer arrived". The connection can drop after
    // the server deleted the user; reporting "nothing was changed" there leaves the device holding
    // the caches and the outbox of an account that no longer exists.
    mockDeleteUser.mockRejectedValue(new Error('Network request failed'));
    mockGetSession.mockResolvedValue(sessionOk(null));

    await expect(deleteAccount()).resolves.toEqual({ status: 'deleted' });
    expect(mockTeardown).toHaveBeenCalledTimes(1);
  });

  it('asks the DATABASE on that re-check, not the 15-minute cookie snapshot', async () => {
    // ⚠️ THE CACHE IS WHY THE 5-7 PRODUCTION DEFECT EXISTED AT ALL — a deleted user's session kept
    // working for the cache's whole lifetime. A plain `getSession()` here would describe a session
    // the store may no longer have, which is the opposite of the question being asked.
    mockDeleteUser.mockRejectedValue(new Error('Network request failed'));
    mockGetSession.mockResolvedValue(sessionOk(null));

    await deleteAccount();

    expect(mockGetSession).toHaveBeenCalledWith({ query: { disableCookieCache: true } });
  });

  it('does NOT overturn a lost response on an UNREADABLE session — only a definite "nobody"', async () => {
    // Anti-vacuity for the case above, in the direction that matters: a session read that failed
    // is not evidence the account is gone, and treating it as such would tear the device down over
    // a network blip on an account that still exists.
    mockDeleteUser.mockRejectedValue(new Error('Network request failed'));
    mockGetSession.mockResolvedValue(sessionErr());

    await expect(deleteAccount()).resolves.toEqual({ status: 'failed' });
    expect(mockTeardown).not.toHaveBeenCalled();
  });

  it('still reports `deleted` when the LOCAL cleanup throws — the account is already gone', async () => {
    // ⚠️ THE IRREVERSIBLE HALF HAS SUCCEEDED BY THEN. A throwing teardown escaping into
    // `data.tsx`'s catch would paint "Your account was not deleted, and nothing was changed" over
    // a completed deletion — the one message the reader can do nothing about, because there is no
    // account left to try again with.
    mockGetSession.mockResolvedValue(sessionOk(null));
    mockTeardown.mockRejectedValueOnce(new Error('mmkv unwritable'));

    await expect(deleteAccount()).resolves.toEqual({ status: 'deleted' });
  });

  it('re-mints a guest — anonymous-first means there is always an identity, even after deleting', async () => {
    mockGetSession.mockResolvedValue(sessionErr());
    await deleteAccount();
    // `force`, for the same reason `signOut` needs it: the session was just deliberately
    // destroyed, so an unreadable read has nothing left to protect.
    expect(mockSignInAnonymous).toHaveBeenCalledTimes(1);
  });
});

describe('refreshSession never fails a sign-in that worked', () => {
  it('swallows a refetch that throws, rather than reporting failure', async () => {
    // ⚠️ ITS DOCBLOCK PROMISED THIS AND THE CODE DID NOT DELIVER: `get()` was not optional-chained
    // and every call site awaits it OUTSIDE a try, so one failed request turned a completed
    // sign-in into "Sign-in didn't work". A refresh is best-effort — the worst honest outcome is
    // a screen one tick stale.
    mockRefetch.mockRejectedValueOnce(new Error('network'));
    await expect(refreshSession()).resolves.toBeUndefined();
  });

  it('swallows a bypass read that throws too', async () => {
    mockGetSession.mockResolvedValue(sessionOk({ id: 'guest-1', isAnonymous: true }));
    mockGetSession.mockRejectedValueOnce(new Error('network'));
    await expect(refreshSession({ bypassCache: true })).resolves.toBeUndefined();
  });
});

describe('ensureAnonymousSession', () => {
  it('mints when the server says there is genuinely nobody', async () => {
    mockGetSession.mockResolvedValue(sessionOk(null));
    await ensureAnonymousSession();
    expect(mockSignInAnonymous).toHaveBeenCalledTimes(1);
  });

  it('does nothing when a guest already exists', async () => {
    mockGetSession.mockResolvedValue(sessionOk({ id: 'guest-1', isAnonymous: true }));
    await ensureAnonymousSession();
    expect(mockSignInAnonymous).not.toHaveBeenCalled();
  });

  it('does NOT mint when the session could not be READ — that is data loss', async () => {
    // ⚠️ The failure this pins: a version that destructured only `data` read a 5xx or a dropped
    // connection identically to "there is no session", and minted a brand-new anonymous user over
    // a guest who still existed server-side — stranding their bookmarks and reading position on
    // an id the device had just forgotten.
    mockGetSession.mockResolvedValue(sessionErr());
    await ensureAnonymousSession();
    expect(mockSignInAnonymous).not.toHaveBeenCalled();
  });

  it('does not mint when the read THROWS either', async () => {
    mockGetSession.mockRejectedValue(new Error('offline'));
    await expect(ensureAnonymousSession()).resolves.toBeUndefined();
    expect(mockSignInAnonymous).not.toHaveBeenCalled();
  });
});

describe('attaching a provider — ONE route, and the cookie sent by hand', () => {
  // Driven through `signInWithApple`, whose native module is mocked to return a fixed token, so
  // the branch under test is reached the same way the app reaches it.
  const appleToken = 'apple.id.token';

  /**
   * ⚠️ `resetModules()` BEFORE `doMock`, EVERY TIME. `signInWithApple` requires its native module
   * LAZILY, but Jest still caches that module after the first require — so a `doMock` registered
   * later is simply ignored, and every case after the first silently runs against the FIRST
   * case's fixture. That is how a cancel test can report "signed-in": nothing is broken, the mock
   * just never took. Resetting first, then mocking, then re-requiring `@/lib/auth` is what makes
   * each case independent.
   */
  const runApple = async (signInAsync = async () => ({ identityToken: appleToken })) => {
    jest.resetModules();
    jest.doMock('expo-apple-authentication', () => ({
      signInAsync,
      AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
    }));
    const { signInWithApple } = require('@/lib/auth');
    return signInWithApple();
  };

  it('NEVER calls linkSocial — that route forks a second account', async () => {
    // ⚠️ THE REGRESSION GUARD FOR A PRODUCTION DEFECT. `/link-social` compares the provider email
    // only against `session.user.email` and never asks whether it belongs to someone else, so a
    // guest signing in with an address an existing account holds gets the provider attached to
    // the ANONYMOUS user — one reader, two accounts, one stranded on `temp@`. Observed
    // 2026-08-25. `/sign-in/social` resolves by verified email instead.
    mockGetSession.mockResolvedValue(sessionOk({ id: 'guest-1', isAnonymous: true }));
    mockSignInSocial.mockResolvedValue({ data: {}, error: null });

    await expect(runApple()).resolves.toEqual({ status: 'signed-in' });
    expect(mockCalls).toContain('signIn.social');
    expect(mockCalls).not.toContain('linkSocial');
    expect(mockLinkSocial).not.toHaveBeenCalled();
  });

  it('attaches the session cookie EXPLICITLY — the expo plugin will not send it', async () => {
    // ⚠️ THE OTHER HALF, AND WITHOUT IT THE FIX LOSES DATA. `@better-auth/expo` attaches the
    // stored cookie to an id-token request only on a path ending `/link-social`, so on
    // `/sign-in/social` the worker sees no guest at all: `onLinkAccount` never fires,
    // `reassignUserRows` never runs, and the reader's bookmarks stay on an anonymous user that
    // is then deleted. Dropping this header trades a duplicate account for silent data loss.
    mockGetSession.mockResolvedValue(sessionOk({ id: 'guest-1', isAnonymous: true }));
    mockSignInSocial.mockResolvedValue({ data: {}, error: null });

    await runApple();

    expect(mockSignInSocial).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'apple',
        idToken: expect.objectContaining({ token: appleToken }),
        fetchOptions: { headers: { cookie: 'better-auth.session_token=guest-token' } },
      })
    );
  });

  it('sends NO cookie header when the jar is empty — that caller is simply signing in', async () => {
    // An empty jar is not an error and must not become one: the same route handles a first-ever
    // sign-in. Sending `cookie: ''` would be a header the worker has to interpret for no reason.
    mockCookie = '';
    mockGetSession.mockResolvedValue(sessionOk(null));
    mockSignInSocial.mockResolvedValue({ data: {}, error: null });

    await expect(runApple()).resolves.toEqual({ status: 'signed-in' });
    expect(mockSignInSocial.mock.calls[0][0].fetchOptions).toBeUndefined();
  });

  it('refetches the session afterwards — the #10545 workaround, on every entry point', async () => {
    // ⚠️ WITHOUT THIS, A SUCCESSFUL SIGN-IN CHANGES NOTHING ON SCREEN. `getSessionAtom` registers
    // its `$sessionSignal → refetch` subscription inside nanostores' `onMount`, so a
    // mount/unmount imbalance leaves the signal unbound and `useSession` never updates
    // (better-auth #10545, open). Reproduced against a real server in the story's spike: the atom
    // stays at `data: null` forever, and one `refetch()` fixes it.
    mockGetSession.mockResolvedValue(sessionOk({ id: 'guest-1', isAnonymous: true }));
    mockSignInSocial.mockResolvedValue({ data: {}, error: null });
    await runApple();
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('re-reads the session with the cookie cache DISABLED after signing in', async () => {
    // ⚠️ THE BUG A REAL DEVICE FOUND, AND THE SUITE COULD NOT. The worker runs with
    // `session.cookieCache` enabled so a returning reader costs no D1 read. A social sign-in
    // changes WHICH USER the caller is, and the cached snapshot goes on reporting the old one —
    // the account screen derives "signed in" from `!isAnonymous`, so it renders the guest
    // "Sign In" row and a sign-in that SUCCEEDED looks exactly like being bounced back to the
    // sign-in screen. Confirmed in production on 2026-08-25: account row written,
    // `is_anonymous` already 0, screen still guest.
    //
    // Email OTP never showed it, because a new session means a fresh cookie by construction —
    // which is why the one flow that worked was the one that could not exhibit the bug.
    mockGetSession.mockResolvedValue(sessionOk({ id: 'guest-1', isAnonymous: true }));
    mockSignInSocial.mockResolvedValue({ data: {}, error: null });

    await runApple();

    expect(mockGetSession).toHaveBeenCalledWith({ query: { disableCookieCache: true } });
  });

  it('does NOT refetch when the sign-in failed — nothing changed to observe', async () => {
    mockGetSession.mockResolvedValue(sessionOk({ id: 'guest-1', isAnonymous: true }));
    mockSignInSocial.mockResolvedValue({ data: null, error: { code: 'OAUTH_LINK_ERROR' } });
    await expect(runApple()).resolves.toEqual({ status: 'failed', code: 'OAUTH_LINK_ERROR' });
    expect(mockRefetch).not.toHaveBeenCalled();
  });

  it('sends a NONCE with the token — a predictable one makes replay possible', async () => {
    mockGetSession.mockResolvedValue(sessionOk({ id: 'guest-1', isAnonymous: true }));
    mockSignInSocial.mockResolvedValue({ data: {}, error: null });
    await runApple();
    const { idToken } = mockSignInSocial.mock.calls[0][0];
    expect(typeof idToken.nonce).toBe('string');
    expect(idToken.nonce.length).toBeGreaterThan(16);
  });

  it('refuses outright when no nonce can be produced — an unbound token is replayable', async () => {
    // The nonce is the only thing binding Apple's token to THIS request. `attachProvider` drops
    // the field when it is falsy, so without this guard a build whose crypto module is missing
    // would sign people in with a replayable token and look completely normal doing it.
    mockRandomUUID = () => undefined;
    mockGetSession.mockResolvedValue(sessionOk({ id: 'guest-1', isAnonymous: true }));
    await expect(runApple()).resolves.toEqual({ status: 'failed', code: 'NO_NONCE' });
    expect(mockSignInSocial).not.toHaveBeenCalled();
    expect(mockLinkSocial).not.toHaveBeenCalled();
  });

  it('a cancelled Apple sheet reaches the worker at all — and is not a failure', async () => {
    // Apple reports a dismissed sheet as a THROWN `ERR_REQUEST_CANCELED`, not a null result, so a
    // handler that only inspects the return value turns "the user changed their mind" into an
    // error banner. Nothing may be sent to the worker either.
    mockGetSession.mockResolvedValue(sessionOk({ id: 'guest-1', isAnonymous: true }));
    const cancelled = async () => {
      throw Object.assign(new Error('cancelled'), { code: 'ERR_REQUEST_CANCELED' });
    };
    await expect(runApple(cancelled as never)).resolves.toEqual({ status: 'cancelled' });
    expect(mockSignInSocial).not.toHaveBeenCalled();
    expect(mockLinkSocial).not.toHaveBeenCalled();
  });
});

describe('requestEmailCode', () => {
  it('answers `code-sent`, never `signed-in` — no session exists yet', async () => {
    // A value whose name contradicts the state it describes is one careless `finish(result)` away
    // from navigating a signed-out user to a screen that claims otherwise.
    mockSendVerificationOtp.mockResolvedValue({ data: {}, error: null });
    await expect(requestEmailCode('reader@example.com')).resolves.toEqual({ status: 'code-sent' });
  });

  it('reports a typed failure', async () => {
    mockSendVerificationOtp.mockResolvedValue({ data: null, error: { code: 'RATE_LIMITED' } });
    await expect(requestEmailCode('reader@example.com')).resolves.toEqual({
      status: 'failed',
      code: 'RATE_LIMITED',
    });
  });
});

describe('isPlaceholderEmail', () => {
  it('recognises the address the anonymous plugin invents', () => {
    // `/link-social` never replaces it, so an Apple or Google user carries it forever. Showing it
    // would tell a signed-in reader their account is under an address that does not exist.
    expect(isPlaceholderEmail('temp@abc123.com')).toBe(true);
    expect(isPlaceholderEmail('temp-abc123@example.org')).toBe(true);
  });

  it('leaves a real address alone', () => {
    expect(isPlaceholderEmail('reader@example.com')).toBe(false);
    expect(isPlaceholderEmail('attempt@example.com')).toBe(false);
    expect(isPlaceholderEmail(null)).toBe(false);
    expect(isPlaceholderEmail(undefined)).toBe(false);
  });
});

describe('the Google leg makes the SAME choice — it is a second call site, not a copy', () => {
  // ⚠️ ASSERTED SEPARATELY BECAUSE IT IS SEPARATE CODE. `signInWithGoogle` has its own module
  // require, its own cancel handling and its own path into `attachProvider`; a suite that drove
  // only Apple would leave the whole Google branch free to call `signIn.social` — the orphaning
  // bug — with everything green. Its cancel path is also where a real defect lived: reading
  // `statusCodes.SIGN_IN_CANCELLED` off a module that does not carry `statusCodes` throws a
  // TypeError INSIDE the catch block, escaping the function as an unhandled rejection.

  const googleToken = 'google.id.token';

  /** Same reset-then-mock-then-require discipline as `runApple` — see the note there. */
  const runGoogle = async (
    overrides: Record<string, unknown> = {},
    { withStatusCodes = true } = {}
  ) => {
    jest.resetModules();
    jest.doMock('@react-native-google-signin/google-signin', () => ({
      GoogleSignin: {
        configure: () => {},
        hasPlayServices: async () => true,
        signIn: async () => ({ type: 'success', data: { idToken: googleToken } }),
        ...overrides,
      },
      ...(withStatusCodes ? { statusCodes: { SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED' } } : {}),
    }));
    const { signInWithGoogle } = require('@/lib/auth');
    return signInWithGoogle();
  };

  it('takes the same ONE route, with the cookie attached by hand', async () => {
    mockGetSession.mockResolvedValue(sessionOk({ id: 'guest-1', isAnonymous: true }));
    mockSignInSocial.mockResolvedValue({ data: {}, error: null });
    await expect(runGoogle()).resolves.toEqual({ status: 'signed-in' });
    expect(mockCalls).toContain('signIn.social');
    expect(mockCalls).not.toContain('linkSocial');
    expect(mockSignInSocial.mock.calls[0][0].fetchOptions).toEqual({
      headers: { cookie: 'better-auth.session_token=guest-token' },
    });
  });

  it('takes that same route with no session at all', async () => {
    mockGetSession.mockResolvedValue(sessionOk(null));
    mockSignInSocial.mockResolvedValue({ data: {}, error: null });
    await expect(runGoogle()).resolves.toEqual({ status: 'signed-in' });
    expect(mockCalls).toContain('signIn.social');
    expect(mockCalls).not.toContain('linkSocial');
  });

  it('sends NO nonce — Google binds its token differently from Apple', async () => {
    // Apple's provider compares the nonce `exact-or-sha256`; Google's native SDK does not take
    // one from us at all. Inventing one here would fail verification on the worker.
    mockGetSession.mockResolvedValue(sessionOk({ id: 'guest-1', isAnonymous: true }));
    mockSignInSocial.mockResolvedValue({ data: {}, error: null });
    await runGoogle();
    expect(mockSignInSocial.mock.calls[0][0].idToken).toEqual({ token: googleToken });
  });

  it('a cancelled picker reaches neither call', async () => {
    mockGetSession.mockResolvedValue(sessionOk({ id: 'guest-1', isAnonymous: true }));
    await expect(runGoogle({ signIn: async () => ({ type: 'cancelled' }) })).resolves.toEqual({
      status: 'cancelled',
    });
    expect(mockLinkSocial).not.toHaveBeenCalled();
    expect(mockSignInSocial).not.toHaveBeenCalled();
  });

  it('a THROWN cancel is also a cancel, not a failure', async () => {
    mockGetSession.mockResolvedValue(sessionOk({ id: 'guest-1', isAnonymous: true }));
    const thrownCancel = {
      signIn: async () => {
        throw Object.assign(new Error('cancelled'), { code: 'SIGN_IN_CANCELLED' });
      },
    };
    await expect(runGoogle(thrownCancel)).resolves.toEqual({ status: 'cancelled' });
  });

  it('survives a module with NO `statusCodes` — the catch must not throw its own error', async () => {
    // ⚠️ The exact shape that used to escape: `statusCodes.SIGN_IN_CANCELLED` on an undefined
    // `statusCodes`, evaluated INSIDE the catch block. The function must still answer a result.
    mockGetSession.mockResolvedValue(sessionOk({ id: 'guest-1', isAnonymous: true }));
    const noStatusCodes = {
      signIn: async () => {
        throw new Error('play services missing');
      },
    };
    await expect(runGoogle(noStatusCodes, { withStatusCodes: false })).resolves.toEqual({
      status: 'failed',
    });
  });
});

describe('the mechanism is chosen by PLATFORM, and only the mechanism', () => {
  // ⚠️ THE AMENDED SPEC'S CENTRAL RULE: every platform offers all three methods; a `Platform.OS`
  // branch may change HOW a method runs, never whether it is offered. These cases pin the
  // choice on both sides, because swapping them is a two-line edit that typechecks perfectly and
  // breaks a different platform than the one anyone is looking at.

  const withWeb = (fn: () => Promise<unknown>) => {
    mockPlatformOS = 'web';
    return fn();
  };

  /**
   * What the in-app browser answers, and what it was asked to open.
   *
   * ⚠️ WITHOUT THIS MOCK NOTHING ENTERED THE BROWSER BRANCH AT ALL. The Android cases resolved
   * `signIn.social` with `{ data: {} }`, so `data?.url` was undefined, the
   * `require('expo-web-browser')` line never ran, and deleting the whole branch kept every test
   * green — on the one platform this repo cannot smoke.
   */
  let mockAuthSessionResult: { type: string; url?: string } = {
    type: 'success',
    url: 'cloud-quran:///account?cookie=better-auth.session_token%3Dfresh%3B%20Path%3D%2F',
  };
  const openAuthSessionAsync = jest.fn(async () => mockAuthSessionResult);

  const load = () => {
    jest.resetModules();
    jest.doMock('expo-apple-authentication', () => ({
      signInAsync: async () => ({ identityToken: 'apple.id.token' }),
      AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
    }));
    jest.doMock('@react-native-google-signin/google-signin', () => ({
      GoogleSignin: {
        configure: () => {},
        hasPlayServices: async () => true,
        signIn: async () => ({ type: 'success', data: { idToken: 'google.id.token' } }),
      },
      statusCodes: { SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED' },
    }));
    jest.doMock('expo-web-browser', () => ({ openAuthSessionAsync }));
    jest.doMock('expo-linking', () => ({
      // The real `Linking.createURL` is what `@better-auth/expo` uses to expand the `/account`
      // path, so the return URL and the callbackURL agree by construction. Mirrored here.
      createURL: (path: string) => `cloud-quran://${path}`,
    }));
    return require('@/lib/auth');
  };

  beforeEach(() => {
    // A browser-shaped global, so `redirectCallbackURL()` has an origin to build from.
    (globalThis as { location?: unknown }).location = { origin: 'https://app.example' };
    (globalThis as { cloudQuran?: unknown }).cloudQuran = undefined;
    openAuthSessionAsync.mockClear();
    mockSecureStoreSet.mockClear();
    mockAuthSessionResult = {
      type: 'success',
      url: 'cloud-quran:///account?cookie=better-auth.session_token%3Dfresh%3B%20Path%3D%2F',
    };
  });

  it('WEB Apple takes the redirect, and never touches the native module', async () => {
    mockGetSession.mockResolvedValue(sessionOk({ id: 'guest-1', isAnonymous: true }));
    mockSignInSocial.mockResolvedValue({ data: {}, error: null });
    const { signInWithApple } = load();
    await expect(withWeb(() => signInWithApple())).resolves.toEqual({ status: 'redirecting' });
    // No `idToken` in the payload: that is what makes the worker treat it as the redirect leg.
    expect(mockSignInSocial).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'apple', callbackURL: 'https://app.example/account' })
    );
    expect(mockSignInSocial.mock.calls[0][0].idToken).toBeUndefined();
  });

  it('WEB Google takes the redirect too', async () => {
    mockGetSession.mockResolvedValue(sessionOk({ id: 'guest-1', isAnonymous: true }));
    mockSignInSocial.mockResolvedValue({ data: {}, error: null });
    const { signInWithGoogle } = load();
    await expect(withWeb(() => signInWithGoogle())).resolves.toEqual({ status: 'redirecting' });
    expect(mockSignInSocial.mock.calls[0][0]).toMatchObject({ provider: 'google' });
    expect(mockSignInSocial.mock.calls[0][0].idToken).toBeUndefined();
  });

  it('iOS Apple takes the NATIVE id token, and never redirects', async () => {
    mockGetSession.mockResolvedValue(sessionOk({ id: 'guest-1', isAnonymous: true }));
    mockSignInSocial.mockResolvedValue({ data: {}, error: null });
    const { signInWithApple } = load();
    await expect(signInWithApple()).resolves.toEqual({ status: 'signed-in' });
    const payload = mockSignInSocial.mock.calls[0][0];
    expect(payload.idToken).toMatchObject({ token: 'apple.id.token' });
    expect(payload.callbackURL).toBeUndefined();
  });

  it('ANDROID Google takes the NATIVE id token — a redirect there is the regression', async () => {
    mockPlatformOS = 'android';
    mockGetSession.mockResolvedValue(sessionOk({ id: 'guest-1', isAnonymous: true }));
    mockSignInSocial.mockResolvedValue({ data: {}, error: null });
    const { signInWithGoogle } = load();
    await expect(signInWithGoogle()).resolves.toEqual({ status: 'signed-in' });
    expect(mockSignInSocial.mock.calls[0][0].idToken).toMatchObject({ token: 'google.id.token' });
  });

  it('ANDROID Apple REDIRECTS — there is no native Apple sheet on Android', async () => {
    // ⚠️ THE CASE THE MATRIX WAS MISSING, AND IT SHIPPED BROKEN BECAUSE OF IT. iOS Apple is pinned
    // above, Android Google is pinned above, web is pinned below — and Apple-on-Android, the one
    // combination nothing covered, was the one that was wrong. `signInWithApple` branched on
    // `Platform.OS === 'web'`, so Android fell through to `expo-apple-authentication`, an iOS-only
    // module with no Android implementation: the button rendered, the tap threw inside it, and the
    // user got "Sign-in didn't work. Please try again." Found on a real emulator, not here.
    //
    // Android must take the REDIRECT, which is the parity rule working as intended — a platform
    // changes HOW a method runs, never whether it is offered.
    mockPlatformOS = 'android';
    mockGetSession.mockResolvedValue(sessionOk({ id: 'guest-1', isAnonymous: true }));
    mockSignInSocial.mockResolvedValue({ data: {}, error: null });

    mockSignInSocial.mockResolvedValue({
      data: { url: 'https://appleid.apple.com/auth/authorize?x=1', redirect: true },
      error: null,
    });

    const { signInWithApple } = load();
    // ⚠️ `signed-in`, NOT `redirecting`. On native the in-app browser CLOSES and hands control
    // back — there is no page replacement to wait for. Returning `redirecting` here is what left
    // Android users staring at a spinning button after a sign-in that had already succeeded.
    await expect(signInWithApple()).resolves.toEqual({ status: 'signed-in' });

    const payload = mockSignInSocial.mock.calls[0][0];
    expect(payload).toMatchObject({ provider: 'apple' });
    // A redirect, not an id token: the native sheet cannot produce one here.
    expect(payload.idToken).toBeUndefined();
    // ⚠️ A PATH, NOT A DEEP LINK, AND `toBeDefined()` WAS WHY THIS SHIPPED WRONG. This suite
    // defines `globalThis.location` for every case, so the previous implementation's
    // `location.origin` sniff made Android silently produce `https://app.example/account` here —
    // an assertion that something is "defined" cannot see that. `@better-auth/expo` rewrites only
    // a callbackURL starting with `/`, expanding it through `Linking.createURL`, which is the one
    // thing that knows whether the app is a dev client, a standalone build or Expo Go. Sending an
    // absolute URL from native skips that expansion and the worker refuses it.
    expect(payload.callbackURL).toBe('/account');
  });

  it('opens the in-app browser on native, with a return URL matching the callback', async () => {
    // ⚠️ THE BROWSER OPEN IS THE WHOLE REDIRECT ON NATIVE, and nothing exercised it: with
    // `data: {}` the branch was unreachable and deleting it kept the suite green. The return URL
    // must be the EXPANDED callback — `openAuthSessionAsync` watches for that exact URL to know
    // the flow is over, and `@better-auth/expo` rewrites the `/account` we send through
    // `Linking.createURL`. Passing the bare scheme relied on prefix matching to save it.
    mockPlatformOS = 'android';
    mockGetSession.mockResolvedValue(sessionOk({ id: 'guest-1', isAnonymous: true }));
    mockSignInSocial.mockResolvedValue({
      data: { url: 'https://accounts.google.com/o/oauth2/v2/auth?x=1', redirect: true },
      error: null,
    });

    const { signInWithApple } = load();
    await signInWithApple();

    expect(openAuthSessionAsync).toHaveBeenCalledWith(
      'https://accounts.google.com/o/oauth2/v2/auth?x=1',
      'cloud-quran:///account'
    );
    // ...and it is the SAME path the worker was told to redirect to.
    expect(mockSignInSocial.mock.calls[0][0].callbackURL).toBe('/account');
  });

  it('harvests the session cookie out of the return URL', async () => {
    // ⚠️ `success` ALONE ESTABLISHES NOTHING ON NATIVE. There is no shared cookie jar, so the
    // worker's expo server plugin appends the `Set-Cookie` value as a `cookie` query parameter on
    // the deep link. The plugin's own client hook would harvest it — but only inside the browser
    // call IT makes, which never fired on Android, which is why this module opens the browser.
    // Without this the refresh below asks the server who we are and is told: nobody.
    mockPlatformOS = 'android';
    mockGetSession.mockResolvedValue(sessionOk({ id: 'guest-1', isAnonymous: true }));
    mockSignInSocial.mockResolvedValue({
      data: { url: 'https://p/auth', redirect: true },
      error: null,
    });
    mockAuthSessionResult = {
      type: 'success',
      url: 'cloud-quran:///account?cookie=better-auth.session_token%3Dfresh-token%3B%20Path%3D%2F',
    };

    const { signInWithApple } = load();
    await expect(signInWithApple()).resolves.toEqual({ status: 'signed-in' });

    expect(mockSecureStoreSet).toHaveBeenCalledWith(
      'better-auth_cookie',
      expect.stringContaining('fresh-token')
    );
    // And the cookie cache is bypassed, for the same reason the id-token path bypasses it.
    expect(mockGetSession).toHaveBeenCalledWith({ query: { disableCookieCache: true } });
  });

  it('a CANCELLED in-app browser is a cancel, not a sign-in and not a failure', async () => {
    // The user tapped back. Reporting `signed-in` would navigate them into an account they are
    // not in; reporting `failed` would paint an error for a deliberate action.
    mockPlatformOS = 'android';
    mockGetSession.mockResolvedValue(sessionOk({ id: 'guest-1', isAnonymous: true }));
    mockSignInSocial.mockResolvedValue({
      data: { url: 'https://p/auth', redirect: true },
      error: null,
    });
    mockAuthSessionResult = { type: 'cancel' };

    const { signInWithApple } = load();
    await expect(signInWithApple()).resolves.toEqual({ status: 'cancelled' });
    expect(mockSecureStoreSet).not.toHaveBeenCalledWith('better-auth_cookie', expect.anything());
  });

  it('a DISMISSED browser is a cancel too — the app closed it, the user did not fail', async () => {
    mockPlatformOS = 'android';
    mockGetSession.mockResolvedValue(sessionOk({ id: 'guest-1', isAnonymous: true }));
    mockSignInSocial.mockResolvedValue({
      data: { url: 'https://p/auth', redirect: true },
      error: null,
    });
    mockAuthSessionResult = { type: 'dismiss' };
    const { signInWithApple } = load();
    await expect(signInWithApple()).resolves.toEqual({ status: 'cancelled' });
  });

  it('does NOT open a browser on web — the page navigates itself', async () => {
    // Anti-vacuity for the four cases above: if the branch ran everywhere, they would prove
    // nothing about `Platform.OS`. On web `redirectPlugin` sets `window.location.href`.
    mockGetSession.mockResolvedValue(sessionOk(null));
    mockSignInSocial.mockResolvedValue({
      data: { url: 'https://p/auth', redirect: true },
      error: null,
    });
    const { signInWithApple } = load();
    await expect(withWeb(() => signInWithApple())).resolves.toEqual({ status: 'redirecting' });
    expect(openAuthSessionAsync).not.toHaveBeenCalled();
  });

  it('the redirect uses signIn.social too — one route on every platform', async () => {
    // ⚠️ `/link-social` is wrong HERE for the same reason it is wrong on native: it never checks
    // whether the provider's address belongs to another account. `/sign-in/social` also has the
    // `anonymous()` plugin's `before` hook, which stashes the guest's id in the OAuth state — the
    // only thing that lets a guest's rows follow them through a redirect at all.
    mockGetSession.mockResolvedValue(sessionOk({ id: 'guest-1', isAnonymous: true }));
    mockSignInSocial.mockResolvedValue({ data: {}, error: null });
    const { signInWithApple } = load();
    await withWeb(() => signInWithApple());
    expect(mockLinkSocial).not.toHaveBeenCalled();
    expect(mockSignInSocial).toHaveBeenCalled();
  });

  it('the redirect falls back to signIn.social with no session at all', async () => {
    mockGetSession.mockResolvedValue(sessionOk(null));
    mockSignInSocial.mockResolvedValue({ data: {}, error: null });
    const { signInWithApple } = load();
    await expect(withWeb(() => signInWithApple())).resolves.toEqual({ status: 'redirecting' });
    expect(mockLinkSocial).not.toHaveBeenCalled();
  });

  it('the redirect does not need to READ the session first — the browser sends its own', async () => {
    // The old code read the session to choose between `linkSocial` and `signIn.social`. With one
    // route there is nothing to choose, so an unreadable session is no longer a reason to refuse
    // a sign-in the browser could have completed.
    mockGetSession.mockResolvedValue(sessionErr());
    mockSignInSocial.mockResolvedValue({ data: {}, error: null });
    const { signInWithApple } = load();
    await expect(withWeb(() => signInWithApple())).resolves.toEqual({ status: 'redirecting' });
  });

  it('reports `redirecting`, NEVER `signed-in` — the page is about to be replaced', async () => {
    // Better Auth's client sets `window.location.href`, so this call has no continuation in this
    // JS context. Claiming success would have the screen navigate a signed-OUT user onward.
    mockGetSession.mockResolvedValue(sessionOk(null));
    mockSignInSocial.mockResolvedValue({ data: {}, error: null });
    const { signInWithGoogle } = load();
    const result = await withWeb(() => signInWithGoogle());
    expect(result).not.toMatchObject({ status: 'signed-in' });
  });

  it('DESKTOP returns to the app scheme, not to a web origin', async () => {
    // ⚠️ Electron reports `Platform.OS === 'web'` — it IS the web export — but its window has no
    // origin a provider can redirect to. The preload's bridge is the only thing that can tell the
    // two apart, and `apps/desktop/src/authCallback.ts` is what catches the result.
    (globalThis as { cloudQuran?: unknown }).cloudQuran = { platform: 'desktop' };
    mockGetSession.mockResolvedValue(sessionOk(null));
    mockSignInSocial.mockResolvedValue({ data: {}, error: null });
    const { signInWithApple } = load();
    await withWeb(() => signInWithApple());
    expect(mockSignInSocial.mock.calls[0][0].callbackURL).toBe('cloud-quran://auth-callback');
  });
});
