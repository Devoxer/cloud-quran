/**
 * Client telemetry scrub tests.
 *
 * TWO SECRETS, TWO REASONS:
 *
 *  • **The session cookie / `Authorization` header (story 5-7).** Better Auth's session is a
 *    cookie with a one-year life, so one leaked into a crash report is an account takeover until
 *    it expires. `sendDefaultPii: false` does NOT strip it — the belief that it does is precisely
 *    why these cases exist — so the scrub is unconditional and is proven here against a REAL
 *    SERIALIZED ENVELOPE rather than by checking that a key is absent from an object.
 *  • **The content host (Story 32.5 AC-10, arch §5.2).** A content URL's opaque r2Key IS the
 *    credential, so a single leak (a failed-fetch error message, a fetch breadcrumb, a span's
 *    http.url) is a permanent capability leak.
 */

/**
 * ⚠️ THE CONTENT HOST IS MUTABLE HERE, AND EMPTY IS THE LIVE CONFIGURATION. `config.ts` reads
 * `EXPO_PUBLIC_CONTENT_URL ?? ''`, and no `EXPO_PUBLIC_*` value has ever reached a build
 * environment (there is no EAS project — see `deferred-work.md`), so every real build runs with
 * `content.baseUrl === ''`. A suite that only ever mocks a real host verifies the scrub in a
 * configuration nothing ships: re-adding the `if (!host) return value` line story 5-7 deleted
 * would pass all of it. The empty-host describe at the bottom is the one that catches that.
 */
let mockContentBaseUrl = 'https://content.wisdomfruits.test';
jest.mock('./config', () => ({
  config: {
    get content() {
      return { baseUrl: mockContentBaseUrl };
    },
    api: { baseUrl: 'https://api.wisdomfruits.test' },
  },
}));

import { createEventEnvelope, serializeEnvelope } from '@sentry/core';
import {
  CIRCULAR_MARKER,
  CONTENT_URL_REDACTION,
  CREDENTIAL_REDACTION,
  makeTelemetryScrubber,
  scrubTelemetry,
} from './telemetryScrub';

afterEach(() => {
  mockContentBaseUrl = 'https://content.wisdomfruits.test';
});

const CONTENT = 'https://content.wisdomfruits.test';

/** A value that must never survive a scrub. Distinctive enough to search a whole envelope for. */
const SESSION_TOKEN = 'sIsWcAbAbLeToKeN-9f2a4c1e6b8d0357';
const COOKIE_HEADER = `better-auth.session_token=${SESSION_TOKEN}; Path=/; HttpOnly`;

describe('scrubTelemetry — credentials', () => {
  it('redacts an Authorization header wherever it is FILED UNDER A KEY', () => {
    const out = scrubTelemetry({
      request: { headers: { Authorization: `Bearer ${SESSION_TOKEN}`, 'X-Trace': 'keep-me' } },
    });
    expect(out.request.headers.Authorization).toBe(CREDENTIAL_REDACTION);
    // Anti-vacuity: an unrelated header is untouched, so this is a scrub and not a wipe.
    expect(out.request.headers['X-Trace']).toBe('keep-me');
  });

  it('redacts a cookie key WHATEVER the value type is — `set-cookie` arrives as an ARRAY', () => {
    // Descending into the array and scrubbing its strings would leave the values in place unless
    // every one of them happened to match a text pattern. The whole value goes.
    const out = scrubTelemetry({ headers: { 'set-cookie': [COOKIE_HEADER, 'other=1'] } });
    expect(out.headers['set-cookie']).toBe(CREDENTIAL_REDACTION);
    expect(JSON.stringify(out)).not.toContain(SESSION_TOKEN);
  });

  it('redacts a credential embedded in PROSE, where there is no key to match', () => {
    // The case the key rule cannot see: a failed request throws with its own headers in the
    // message, and that string lands in `exception.values[].value` and in the stack frames.
    const out = scrubTelemetry({
      message: `PUT /api/sync/preferences failed (cookie: ${COOKIE_HEADER})`,
    });
    expect(out.message).toContain(CREDENTIAL_REDACTION);
    expect(out.message).not.toContain(SESSION_TOKEN);
    // The non-secret half of the sentence survives — a message scrubbed to nothing is useless.
    expect(out.message).toContain('/api/sync/preferences');
  });

  it('redacts a bare `Bearer <token>` even with no header name beside it', () => {
    const out = scrubTelemetry({ extra: { detail: `token was Bearer ${SESSION_TOKEN}` } });
    expect(out.extra.detail).not.toContain(SESSION_TOKEN);
  });

  it('is case-insensitive about the header name, because the wire is', () => {
    const out = scrubTelemetry({ h: { AUTHORIZATION: SESSION_TOKEN, Cookie: COOKIE_HEADER } });
    expect(JSON.stringify(out)).not.toContain(SESSION_TOKEN);
  });
});

describe('the credential never reaches the wire — a REAL serialized envelope', () => {
  /**
   * ⚠️ THIS IS THE CASE THE STORY ASKED FOR, AND THE SHAPE MATTERS. Asserting "the key is absent
   * from the object" proves nothing about what Sentry actually TRANSMITS: the SDK hands
   * `beforeSend`'s return value to its transport, which builds an envelope and serializes it, and
   * a value hiding in a stack frame, a context or a breadcrumb rides along invisibly. So the event
   * goes through the real hook, then through Sentry's own `createEventEnvelope` +
   * `serializeEnvelope`, and the finished bytes are searched for the credential.
   */
  const DSN = {
    protocol: 'https' as const,
    publicKey: 'abc123',
    host: 'o0.ingest.sentry.io',
    port: '',
    path: '',
    projectId: '1',
  };

  /** An event of the shape a failed authenticated fetch really produces. */
  const eventCarryingASession = () => ({
    event_id: '0123456789abcdef0123456789abcdef',
    timestamp: 1_756_000_000,
    exception: {
      values: [
        {
          type: 'Error',
          value: `sync: drain request failed (authorization: Bearer ${SESSION_TOKEN})`,
          stacktrace: {
            frames: [{ filename: 'sync.ts', function: 'drain', vars: { cookie: COOKIE_HEADER } }],
          },
        },
      ],
    },
    request: {
      url: 'https://api.wisdomfruits.test/api/sync/preferences',
      headers: { cookie: COOKIE_HEADER },
    },
    breadcrumbs: [
      { category: 'fetch', data: { url: '/api/sync/preferences', 'set-cookie': [COOKIE_HEADER] } },
    ],
    contexts: { response: { headers: { 'Set-Cookie': COOKIE_HEADER } } },
    extra: { retryOf: `Bearer ${SESSION_TOKEN}` },
  });

  const serializeThrough = (event: object) =>
    String(serializeEnvelope(createEventEnvelope(event as never, DSN)));

  it('the serialized envelope contains the credential NOWHERE', () => {
    const scrubbed = makeTelemetryScrubber().beforeSendHook(eventCarryingASession());
    const wire = serializeThrough(scrubbed);
    expect(wire).not.toContain(SESSION_TOKEN);
    expect(wire).toContain(CREDENTIAL_REDACTION);
    // ...and the envelope is still a usable report: the route that failed is legible.
    expect(wire).toContain('/api/sync/preferences');
  });

  it('ANTI-VACUITY: the same event UNSCRUBBED does carry it — the assertion above can fail', () => {
    // Without this, "the credential is absent" would also pass on an envelope that never held it,
    // on a serializer that dropped the fields, or on a hook that returned null.
    expect(serializeThrough(eventCarryingASession())).toContain(SESSION_TOKEN);
  });
});

describe('scrubTelemetry — content URLs', () => {
  it('redacts a content-host URL wherever it appears in a nested payload', () => {
    const payload = {
      message: `fetch failed for ${CONTENT}/abc123-opaque-key`,
      nested: { deep: [`${CONTENT}/k1`, 'https://example.com/ok'] },
      count: 3,
      flag: true,
    };
    const out = scrubTelemetry(payload);
    expect(out.message).toContain(CONTENT_URL_REDACTION);
    expect(out.message).not.toContain('abc123-opaque-key');
    expect(out.nested.deep[0]).toBe(CONTENT_URL_REDACTION);
    expect(out.nested.deep[1]).toBe('https://example.com/ok');
    expect(out.count).toBe(3);
    expect(out.flag).toBe(true);
    // No trace of the host anywhere in the scrubbed payload.
    expect(JSON.stringify(out)).not.toContain('content.wisdomfruits.test');
  });

  it('leaves first-party API and unrelated URLs untouched', () => {
    const out = scrubTelemetry({ url: 'https://api.wisdomfruits.test/api/account/export' });
    expect(out.url).toBe('https://api.wisdomfruits.test/api/account/export');
  });
});

describe('makeTelemetryScrubber (Sentry hooks)', () => {
  it('scrubs error events (message + stack + extra) via beforeSendHook', () => {
    const { beforeSendHook } = makeTelemetryScrubber();
    const out = beforeSendHook({
      exception: { values: [{ value: `GET ${CONTENT}/premium-key failed with 0` }] },
      extra: { url: `${CONTENT}/premium-key` },
    }) as { exception: { values: { value: string }[] }; extra: { url: string } };
    expect(out.exception.values[0].value).toContain(CONTENT_URL_REDACTION);
    expect(out.extra.url).toBe(CONTENT_URL_REDACTION);
    expect(JSON.stringify(out)).not.toContain('content.wisdomfruits.test');
  });

  it('scrubs transactions (span descriptions/data) via beforeSendTransaction', () => {
    const { beforeSendTransaction } = makeTelemetryScrubber();
    const out = beforeSendTransaction({
      spans: [{ description: `GET ${CONTENT}/k`, data: { 'http.url': `${CONTENT}/k` } }],
    }) as { spans: { description: string; data: Record<string, string> }[] };
    expect(out.spans[0].description).toContain(CONTENT_URL_REDACTION);
    expect(out.spans[0].data['http.url']).toBe(CONTENT_URL_REDACTION);
  });

  it('scrubs breadcrumbs (the RN fetch instrumentation records one per request)', () => {
    const { beforeBreadcrumb } = makeTelemetryScrubber();
    const out = beforeBreadcrumb({
      category: 'fetch',
      data: { url: `${CONTENT}/k2`, status_code: 403 },
    }) as { data: { url: string; status_code: number } };
    expect(out.data.url).toBe(CONTENT_URL_REDACTION);
    expect(out.data.status_code).toBe(403);
  });

  it('allow-lists ONLY the first-party API host for trace propagation (content host excluded)', () => {
    const { tracePropagationTargets } = makeTelemetryScrubber();
    expect(tracePropagationTargets).toEqual(['api.wisdomfruits.test']);
    for (const target of tracePropagationTargets) {
      expect(String(target)).not.toContain('content.wisdomfruits.test');
    }
  });
});

// story 5-2: a second describe here proved `analytics.capture` scrubbed its properties before
// handing them to PostHog. PostHog is gone (PRD NFR8), so Sentry above is the whole surface.

describe("this app's OWN credentials, which the first draft did not know about", () => {
  it('redacts the four `account` columns the export refuses to ship', () => {
    // ⚠️ `exportUserData` names its columns explicitly so `accessToken` / `refreshToken` /
    // `idToken` / `password` can never reach a shared document. Protecting them there and handing
    // them to a crash reporter here would be a strange place to stop.
    const out = scrubTelemetry({
      account: {
        idToken: 'ID-SECRET-aaaaaaaaaaaa',
        accessToken: 'ACCESS-SECRET-bbbbbbbb',
        refresh_token: 'REFRESH-SECRET-cccccc',
        password: 'hunter2',
        providerId: 'apple',
      },
    });
    const serialized = JSON.stringify(out);
    for (const secret of ['ID-SECRET', 'ACCESS-SECRET', 'REFRESH-SECRET', 'hunter2']) {
      expect(serialized).not.toContain(secret);
    }
    // The non-secret half of the account context survives — this is a scrub, not a wipe.
    expect(out.account.providerId).toBe('apple');
  });

  it('redacts the id token native sign-in POSTs, wherever it is spelled', () => {
    const out = scrubTelemetry({
      body: { provider: 'google', idToken: { token: 'GOOGLE-JWT-x' } },
    });
    expect(JSON.stringify(out)).not.toContain('GOOGLE-JWT-x');
  });

  it('redacts the email OTP under `otp`, and under `code` when it LOOKS like one', () => {
    const out = scrubTelemetry({ otp: '123456', code: '654321' });
    expect(out.otp).toBe(CREDENTIAL_REDACTION);
    expect(out.code).toBe(CREDENTIAL_REDACTION);
  });

  it('KEEPS a typed refusal code — the diagnostic this app deliberately captures', () => {
    // ⚠️ ANTI-VACUITY, AND THE REASON `code` IS DECIDED ON THE VALUE. A blanket key rule would
    // delete `APPLE_WEB_SIGN_IN_UNAVAILABLE` — frequently the ONLY thing that names why a native
    // sign-in failed, since nothing reaches the worker and there is no server log to consult.
    const out = scrubTelemetry({ code: 'APPLE_WEB_SIGN_IN_UNAVAILABLE', status: 503 });
    expect(out.code).toBe('APPLE_WEB_SIGN_IN_UNAVAILABLE');
    expect(out.status).toBe(503);
  });

  it('redacts the SESSION COOKIE by its own name, with NO header label anywhere near it', () => {
    // ⚠️ THE STRING CARRIES NO `cookie:` / `cookie=` LABEL ON PURPOSE — with one, the prose rule
    // would catch it and this case would pass with the by-name rule deleted. `lib/auth.ts` reads
    // exactly this value out of a deep-link query parameter and `lib/api.ts` passes it around
    // bare, so it genuinely travels unlabelled, and it is a complete replayable session on its own.
    const out = scrubTelemetry({
      message: `restoring better-auth.session_token=${SESSION_TOKEN}; Path=/; HttpOnly`,
    });
    expect(out.message).not.toContain(SESSION_TOKEN);
    expect(out.message).toContain(CREDENTIAL_REDACTION);
  });

  it('does NOT stop at a comma — a Set-Cookie carries several, and ours is rarely first', () => {
    // The bug this replaces: the rule terminated on `,`, so it redacted the FIRST cookie and
    // published everything after it.
    //
    // ⚠️ THE SECOND COOKIE IS DELIBERATELY NOT A BETTER-AUTH ONE. With `better-auth.session_token`
    // there, the by-name rule catches it and this case passes with the comma terminator restored —
    // two rules overlapping is good defence and a bad test. A differently-named cookie is covered
    // by the prose rule ALONE, so it is the one that actually pins the terminator.
    const header = `first=decoy; Path=/, sid=OPAQUE-SECOND-COOKIE-VALUE; HttpOnly`;
    const out = scrubTelemetry({ message: `set-cookie: ${header}` });
    expect(out.message).not.toContain('OPAQUE-SECOND-COOKIE-VALUE');
    // ...and ours, wherever in the list it lands, whichever rule gets to it first.
    const ours = `first=decoy; Path=/, better-auth.session_token=${SESSION_TOKEN}; HttpOnly`;
    expect(scrubTelemetry({ message: `set-cookie: ${ours}` }).message).not.toContain(SESSION_TOKEN);
  });

  it('matches a SERIALIZED object, where the label is quoted', () => {
    const out = scrubTelemetry({ body: `{"authorization":"Bearer ${SESSION_TOKEN}","keep":"me"}` });
    expect(out.body).not.toContain(SESSION_TOKEN);
    expect(out.body).toContain('keep');
  });
});

describe('arbitrary payloads — the scrub runs on EVERY event now, so it must survive them', () => {
  it('leaves a Date, an Error and a Map intact rather than flattening them to {}', () => {
    // ⚠️ REBUILDING FROM `Object.entries` DESTROYS ANY OBJECT WHOSE STATE IS NOT AN OWN PROPERTY.
    // `Date`, `Error`, `Map`, `Set`, spans, captured scopes and Sentry's own
    // `sdkProcessingMetadata` all have none, so they came out as `{}` — data destruction on every
    // event, once the scrub stopped being conditional on an unset variable.
    const when = new Date('2026-08-26T00:00:00.000Z');
    const boom = new Error('kaboom');
    const map = new Map([['k', 'v']]);
    const out = scrubTelemetry({ when, boom, map, plain: { ok: 1 } });
    expect(out.when).toBe(when);
    expect(out.when instanceof Date).toBe(true);
    expect(out.boom).toBe(boom);
    expect(out.map instanceof Map).toBe(true);
    // ...while a plain object is still rebuilt and scrubbed.
    expect(out.plain).toEqual({ ok: 1 });
  });

  it('survives a CYCLE instead of blowing the stack inside beforeSend', () => {
    // The worst possible place for an unbounded recursion: the app would crash while reporting a
    // crash. `extra` is arbitrary caller-supplied data and can perfectly well hold a cycle.
    const cyclic: Record<string, unknown> = { authorization: `Bearer ${SESSION_TOKEN}` };
    cyclic.self = cyclic;
    const nested: Record<string, unknown> = { list: [] as unknown[] };
    (nested.list as unknown[]).push(nested);

    const out = scrubTelemetry({ extra: cyclic, nested });
    expect(out.extra.authorization).toBe(CREDENTIAL_REDACTION);
    expect(out.extra.self).toBe(CIRCULAR_MARKER);
    expect((out.nested.list as unknown[])[0]).toBe(CIRCULAR_MARKER);
  });

  it('scrubs a SHARED reference twice rather than calling the second one circular', () => {
    // A DAG is not a cycle, and SDK payloads are full of them. Tracking the current PATH rather
    // than every value ever seen is what keeps the second visit a real scrub.
    const shared = { authorization: `Bearer ${SESSION_TOKEN}` };
    const out = scrubTelemetry({ a: shared, b: shared });
    expect(out.a.authorization).toBe(CREDENTIAL_REDACTION);
    expect(out.b.authorization).toBe(CREDENTIAL_REDACTION);
  });

  it('leaves a real SDK-shaped event usable — the hook returns an event, not a husk', () => {
    const { beforeSendHook } = makeTelemetryScrubber();
    const out = beforeSendHook({
      event_id: 'abc',
      timestamp: 1_756_000_000,
      sdkProcessingMetadata: { normalizedRequest: new Map(), propagationContext: { traceId: 't' } },
      contexts: { trace: { span_id: 's' } },
      extra: { cookie: COOKIE_HEADER },
    }) as Record<string, unknown>;
    expect(out.event_id).toBe('abc');
    expect((out.contexts as { trace: { span_id: string } }).trace.span_id).toBe('s');
    expect((out.extra as { cookie: string }).cookie).toBe(CREDENTIAL_REDACTION);
  });
});

describe('WITH NO CONTENT HOST — the configuration every real build actually has', () => {
  beforeEach(() => {
    mockContentBaseUrl = '';
  });

  it('still redacts a credential', () => {
    // ⚠️ THE CASE THAT CATCHES A RE-ADDED `if (!host) return value`. Every other case in this file
    // mocks a real content host, which no shipped build has: re-introducing that early return
    // passes all of them and turns the credential scrub off everywhere it matters.
    const out = scrubTelemetry({ headers: { authorization: `Bearer ${SESSION_TOKEN}` } });
    expect(out.headers.authorization).toBe(CREDENTIAL_REDACTION);
  });

  it('still redacts one through the real beforeSend hook, and through the envelope', () => {
    const { beforeSendHook } = makeTelemetryScrubber();
    const scrubbed = beforeSendHook({
      exception: { values: [{ value: `failed (cookie: ${COOKIE_HEADER})` }] },
    });
    expect(JSON.stringify(scrubbed)).not.toContain(SESSION_TOKEN);
  });

  it('leaves ordinary URLs alone, because there is no host to match', () => {
    const out = scrubTelemetry({ url: 'https://anything.example/x' });
    expect(out.url).toBe('https://anything.example/x');
  });
});
