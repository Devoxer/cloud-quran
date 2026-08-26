/**
 * Error handling and Sentry integration
 * Provides AppError class and error capture utilities
 */

import * as Sentry from '@sentry/react-native';
import { config } from './config';
import { getDeviceContext } from './deviceContext';
import { makeTelemetryScrubber } from './telemetryScrub';

/**
 * Initializes Sentry error tracking
 * Should be called early in app initialization, before any other code
 *
 * ⚠️ story 5-7 DELETED THE TRANSIENT-ERROR FILTER THAT USED TO WRAP `beforeSend`. It matched two
 * literal InstantDB SDK strings ("Error performing request…"), and that SDK was removed in story
 * 5-2 — so the filter had been comparing every real error against two phrases nothing could ever
 * produce. Its only remaining effect was to make `beforeSend` look like it did something other
 * than scrub.
 */
export function initErrorTracking(): void {
  if (!config.sentry.dsn) {
    if (__DEV__) {
      console.warn('Sentry DSN not configured');
    }
    return;
  }

  // The scrubber: credentials unconditionally (story 5-7), content URLs where a content host is
  // configured (Story 32.5, arch §5.2). Every payload class goes through it — error events,
  // transactions and breadcrumbs — and trace headers are allow-listed to the first-party API host
  // only. See lib/telemetryScrub.ts, whose header explains why `sendDefaultPii` is not the answer.
  const scrubber = makeTelemetryScrubber();

  Sentry.init({
    dsn: config.sentry.dsn,
    // Disable in development
    enabled: !__DEV__,
    /**
     * ⚠️ SET EXPLICITLY, EVEN THOUGH IT IS THE DEFAULT — and it is NOT what protects the session.
     * `false` keeps the SDK from attaching identifying context of its own (IP address, request
     * headers it collects, user data). It does NOT strip an `Authorization` or `Cookie` header out
     * of an error message, a fetch breadcrumb or a span your own code produced; the widely-held
     * belief that it does is why the scrub hooks below exist and are unconditional. Leaving a
     * privacy decision to a default is also how it changes underneath you.
     */
    sendDefaultPii: false,
    // Sample 20% of transactions for performance monitoring (cost/perf optimization)
    tracesSampleRate: 0.2,
    // Sample 20% of profiled transactions (relative to tracesSampleRate)
    // Moved from _experiments to root level as per Sentry v6+ recommendation
    profilesSampleRate: 0.2,
    // ⚠️ SPREAD UNCONDITIONALLY NOW. These were each wrapped in a `scrubber.x ? … : {}` ternary,
    // which was not defensive: the scrubber genuinely returned `{}` whenever no content host was
    // configured, so those builds sent every payload class unscrubbed. The scrubber always
    // returns all four members today, and the conditional went with the hole.
    beforeSendTransaction: scrubber.beforeSendTransaction,
    beforeBreadcrumb: scrubber.beforeBreadcrumb,
    tracePropagationTargets: scrubber.tracePropagationTargets,
    beforeSend: scrubber.beforeSendHook,
  });
}

/**
 * Attaches additive device/app context to Sentry (Story 17.9).
 *
 * Call once after {@link initErrorTracking}. Sets `is_physical_device` +
 * `device_type` as tags (filterable in Sentry) and the full additive object as
 * a `device_extra` context. Additive only — @sentry/react-native already auto-
 * captures app version, OS, and device model, so those are NOT duplicated here.
 * Never throws: device context is best-effort and must not block boot.
 */
export async function setSentryDeviceContext(): Promise<void> {
  try {
    const ctx = await getDeviceContext();
    Sentry.setTag('is_physical_device', String(ctx.is_physical_device));
    Sentry.setTag('device_type', ctx.device_type);
    // ctx is a fixed-shape, string-keyed object — widen to Sentry's generic
    // context record (the precise DeviceContext type lacks an index signature).
    Sentry.setContext('device_extra', ctx as unknown as Record<string, unknown>);
  } catch {
    // best-effort; never block boot on context tagging
  }
}

/**
 * AppError - Structured application error class
 *
 * Use for expected, recoverable errors that should be displayed to users.
 * Automatically logs to Sentry in production.
 *
 * @example
 * throw new AppError('AUTH_FAILED', 'Unable to sign in. Please try again.', originalError);
 */
export class AppError extends Error {
  constructor(
    public code: string,
    public userMessage: string,
    public originalError?: unknown
  ) {
    super(userMessage);
    this.name = 'AppError';

    // Log to Sentry if not development
    if (!__DEV__ && originalError) {
      Sentry.captureException(originalError, {
        extra: { code, userMessage },
      });
    }
  }
}

/**
 * True when `error` is InstantDB's device-offline failure — e.g. a `queryOnce`
 * while disconnected throws "We can't run `queryOnce`, because the device is
 * offline." Offline is an expected state on downloaded/cached flows, so call
 * sites use this to skip Sentry reporting (NOT to skip user-facing handling).
 *
 * Matched on the SDK's distinctive "device is offline" phrase — deliberately
 * NOT a bare 'offline' substring, which would swallow unrelated errors that
 * merely mention the word (e.g. a server-side "storage node offline"). This is
 * the single home for the match; don't re-derive it per catch block.
 */
export function isDeviceOfflineError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.toLowerCase().includes('device is offline');
}

/**
 * Captures an exception to Sentry with optional context
 *
 * Use for unexpected errors that shouldn't be shown to users.
 * In development, logs to console instead.
 *
 * ── Capture policy (Story 26.11 — the rule for every catch block) ────────────────
 * Decide capture vs breadcrumb vs swallow BEFORE reaching for this function:
 *  1. ACTIONABLE DEFECT → captureException (with an `operation`/context tag). A failed
 *     critical write (delete-account, CRUD that corrupts state), an SDK init failure, an
 *     unexpected throw on a should-not-throw path.
 *  2. EXPECTED / TRANSIENT / USER-or-DEVICE STATE → skip, or {@link addBreadcrumb}. Self-
 *     healing connectivity ({@link isDeviceOfflineError}), a torn-down/replaced player racing
 *     a native call. Early-return before capture; add a breadcrumb only when it's useful
 *     context for a LATER real capture (don't spam).
 *     (story 5-2: the third example here was `isBenignBillingError` — RevenueCat read/logout
 *     codes that were expected rather than defects. It went with the SDK.)
 *  3. BEST-EFFORT UI NICETY → bare swallow OK. Cache reads/writes (MMKV, content cache),
 *     haptics, date/JSON formatting, recent-searches, teardown/cleanup. A one-line comment
 *     justifying the swallow is enough; do NOT add capture here (it re-introduces noise).
 * Full rule + rationale: STACK-CHEAT-SHEET.md § "Sentry capture policy". Adding a
 * capture to a tier-3 path or leaving a tier-1 critical write bare are BOTH bugs.
 * ─────────────────────────────────────────────────────────────────────────────────
 *
 * @param error - The error to capture
 * @param context - Optional additional context
 *
 * @example
 * try {
 *   await riskyOperation();
 * } catch (error) {
 *   captureException(error, { operation: 'riskyOperation', userId });
 * }
 */
export function captureException(error: unknown, context?: Record<string, unknown>): void {
  if (__DEV__) {
    console.error('Error:', error, context);
  } else {
    Sentry.captureException(error, { extra: context });
  }
}

/**
 * Wraps a React component with Sentry error boundary
 * Re-exported from @sentry/react-native for convenience
 */
export const withSentry = Sentry.wrap;

/**
 * Sets user context for Sentry error tracking
 * Called when user authenticates (guest or full)
 *
 * Privacy: Only user ID is set (no email or PII)
 * Uses account_type tag to distinguish guest vs authenticated users
 *
 * @param userId - InstantDB user ID
 * @param isGuest - Whether user is a guest
 */
export function setSentryUser(userId: string, isGuest: boolean): void {
  Sentry.setUser({
    id: userId,
    // Do NOT include email (privacy)
  });
  Sentry.setTag('account_type', isGuest ? 'guest' : 'authenticated');
}

/**
 * Clears user context from Sentry
 * Called on sign out before the actual sign out
 *
 * Subsequent errors will be anonymous
 */
export function clearSentryUser(): void {
  Sentry.setUser(null);
  Sentry.setTag('account_type', undefined);
}

/**
 * Adds a breadcrumb to Sentry for debugging context
 * Breadcrumbs are captured with errors to show user actions leading up to the error
 *
 * @param category - Category of breadcrumb (navigation, http, user, ui)
 * @param message - Human-readable description
 * @param data - Optional additional data
 * @param level - Severity level (default: info)
 */
export function addBreadcrumb(
  category: 'navigation' | 'http' | 'user' | 'ui',
  message: string,
  data?: Record<string, unknown>,
  level: 'info' | 'warning' | 'error' = 'info'
): void {
  Sentry.addBreadcrumb({
    category,
    message,
    data,
    level,
  });
}
