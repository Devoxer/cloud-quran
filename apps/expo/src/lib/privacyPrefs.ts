/**
 * Device-local privacy preferences (Story 19.3).
 *
 * A privacy choice is a DEVICE choice, not synced account data — it must work with no identity at
 * all and never leaves the device (contrast notification prefs, which persist to a profile).
 * Stored in a dedicated MMKV instance so it's isolated from playback/theme prefs and trivially
 * clearable.
 *
 * ⚠️ story 5-2 DELETED THE OPT-OUT HALF. This module used to carry `ANALYTICS_ENABLED_KEY`,
 * `getAnalyticsEnabled`, `setAnalyticsEnabledPref` and `useAnalyticsEnabled` — an opt-OUT pref
 * defaulting to ON, wearing wisdom-fruits' legitimate-interest basis. Cloud Quran ships zero
 * third-party analytics, advertising or tracking SDKs (PRD NFR8/NFR28), so the toggle was removed
 * rather than switched off, along with PostHog itself.
 *
 * `TELEMETRY_ENABLED_KEY` is opt-IN, defaulting to OFF, and covers the single sanctioned exception
 * — PII-scrubbed Sentry crash reporting. `SYNC_ENABLED_KEY` (story 5-7) is the other shape and
 * the other default: opt-OUT, ON, because sync is a feature the reader asked for by signing in.
 * The two defaults differ because the questions do; see each one's note.
 */

import * as Sentry from '@sentry/react-native';
import { useMMKVBoolean } from 'react-native-mmkv';
import { createAppMMKV } from './mmkv';

/** Dedicated store for device-local privacy choices. */
export const privacyStore = createAppMMKV('privacy-prefs');

/**
 * MMKV key for opt-IN crash reporting (Sentry). Unset reads as `false`.
 *
 * Story 5-1 review: `initErrorTracking()` used to run unconditionally at module load in
 * `app/_layout.tsx`, gated only on a DSN being present. A configured DSN is not consent, and
 * Sentry is the ONE telemetry exception Cloud Quran allows — on an opt-in basis.
 */
export const TELEMETRY_ENABLED_KEY = 'telemetryEnabled';

/**
 * Whether the user has opted IN to crash reporting. Default OFF.
 * Synchronous (MMKV) — safe to call at module scope, before React mounts.
 */
export function isTelemetryEnabled(): boolean {
  return privacyStore.getBoolean(TELEMETRY_ENABLED_KEY) ?? false;
}

/**
 * Persist the crash-reporting opt-in (device-local, never synced).
 *
 * Turning it OFF also SHUTS SENTRY DOWN for the rest of this session. Story 5-2 review: without
 * that, withdrawing consent only took effect at the next launch — `initErrorTracking()` runs once
 * at module scope — so a user who opted out watched the toggle move while crash reports kept
 * leaving the device until they killed the app. Consent withdrawal has to be immediate.
 *
 * Turning it ON still needs a relaunch: `Sentry.init` and the `withSentry` root wrap both run at
 * module scope, and re-initializing mid-tree would not re-wrap the already-mounted root. The
 * screen says so. Erring this direction is deliberate — the failure mode is "reports start one
 * launch late", not "reports keep flowing after you said stop".
 */
export function setTelemetryEnabled(enabled: boolean): void {
  privacyStore.set(TELEMETRY_ENABLED_KEY, enabled);
  if (!enabled) {
    // Best-effort and fire-and-forget: `close()` flushes then disables the client. A failure
    // here must not surface as "failed to update setting" — the PREFERENCE write above is what
    // the user asked for and it has already landed.
    void Sentry.close().catch(() => {});
  }
}

/**
 * Reactive read of the crash-reporting opt-in for UI. Re-renders on change.
 * `useMMKVBoolean` returns `undefined` when unset → callers treat that as OFF.
 *
 * The setter delegates to `setTelemetryEnabled`, so turning the pref OFF shuts Sentry down for
 * the rest of the session. Turning it ON takes effect at the next launch — `initErrorTracking()`
 * and `withSentry()` both run once at module scope in `app/_layout.tsx`, and re-initializing
 * mid-tree would not re-wrap the already-mounted root. The screen's footnote says exactly this.
 */
export function useTelemetryEnabled(): [boolean, (v: boolean) => void] {
  const [value] = useMMKVBoolean(TELEMETRY_ENABLED_KEY, privacyStore);
  // ⚠️ The setter DELEGATES to `setTelemetryEnabled` — it must not be `useMMKVBoolean`'s raw
  // `setValue`. It was, and that made the Sentry shutdown above dead code on the only path a
  // user can actually reach: the toggle wrote the key directly, `setTelemetryEnabled` had zero
  // production callers, and the test that "proved" immediate withdrawal called it directly —
  // exercising a path the app never takes. Caught by the story 5-2 code review.
  //
  // `useMMKVBoolean` is still what makes the READ reactive, so the Switch re-renders on change;
  // the write goes through the one function that owns the side effect.
  return [value ?? false, setTelemetryEnabled];
}

// ── the sync opt-out (story 5-7, FR30) ────────────────────────────────────────────────────────
//
// ⚠️ THIS REPLACED A CONSENT SCREEN, AND THE REASON IS THAT THE SCREEN GATED THE WRONG THING.
// Until 2026-08-26 there was a full-screen consent step in front of sign-in, recorded here with a
// policy version. Four review layers found the same hole independently: sync ALREADY RAN for the
// anonymous guest the root layout mints at boot — `SyncIdentityBridge` calls `setSyncUserId` and
// `prefetchSyncReads()` for ANY resolved session — and nothing in `lib/sync.ts`, `lib/outbox.ts`
// or the root layout ever read the consent record. So the screen interrupted the one reader who
// had decided to sign in, while four authenticated GETs left every other device unasked. Its copy
// said "we ask before any of it leaves this device", which was false, and the settings row that
// promised to "stop syncing" signed the reader out — after which the bridge immediately re-keyed
// and re-prefetched under a fresh guest.
//
// ⚠️ WHAT REPLACED IT, AND WHY IT IS STRICTLY MORE HONEST. The disclosure moved INLINE into
// `sign-in.tsx`, above the provider buttons — pressing Apple, Google or Email is then the informed
// affirmative act, with one fewer tap than before. And the control below is the real thing the old
// one only claimed to be: a device-local switch, default ON, that `lib/sync.ts` actually consults
// before it reads or drains. Turning it off stops sync; it does not sign anybody out, delete
// anything, or interrupt anybody. Owner's decision, 2026-08-26: "i prefer the option existing for
// him to opt out since it opt in automatically rather than interupt him."
//
// ⚠️ DEFAULT ON, AND THAT IS THE PART TO THINK ABOUT BEFORE CHANGING IT. Cloud Quran syncs four
// things and sells none of them; the sign-in screen names them in a line before anybody presses a
// provider, the screen this switch lives on itemises them and names both processors, and the
// reader can stop it in one tap from Settings. A default of OFF would mean a reader who
// signs in specifically to move their bookmarks to a new phone gets nothing until they find a
// second switch — an opt-in for a feature nobody opts into is a feature that does not work.

/** MMKV key for the device-local sync opt-out. Unset reads as ON — see below. */
export const SYNC_ENABLED_KEY = 'syncEnabled';

/**
 * May this device sync to the account? Default **ON**.
 *
 * ⚠️ SYNCHRONOUS, BECAUSE `lib/sync.ts` READS IT OUTSIDE REACT. `prefetchSyncReads()` runs from an
 * effect in the root layout and `drainNow()` runs from timers and from `onlineManager` callbacks —
 * neither has a hook available, and an asynchronous read there would let a drain start before the
 * answer arrived. MMKV is synchronous, so there is nothing to wait for.
 */
export function isSyncEnabled(): boolean {
  return privacyStore.getBoolean(SYNC_ENABLED_KEY) ?? true;
}

/**
 * Persist the sync opt-out (device-local, never synced).
 *
 * ⚠️ IT DESTROYS NOTHING AND SIGNS NOBODY OUT, WHICH IS THE WHOLE DIFFERENCE FROM THE ROW IT
 * REPLACED. Turning sync off leaves the account, the session and every row already on the server
 * exactly where they are — `data.tsx` still offers erasure and deletion as their own actions, and
 * conflating "stop sending" with "destroy what was sent" is how the previous design ended up with
 * a row that promised one and did the other.
 *
 * Queued writes stay queued: the outbox is durable and capped, so a device left off for a month
 * holds at most `MAX_OUTBOX_ENTRIES` and drains them if the reader turns sync back on. Discarding
 * them here would make the switch destructive in the one way its label denies.
 */
export function setSyncEnabled(enabled: boolean): void {
  privacyStore.set(SYNC_ENABLED_KEY, enabled);
}

/**
 * Reactive read of the sync opt-out, for UI and for `useSyncQuery`'s `enabled`.
 * `useMMKVBoolean` returns `undefined` when unset → that is the ON default, not OFF.
 */
export function useSyncEnabled(): [boolean, (v: boolean) => void] {
  const [value] = useMMKVBoolean(SYNC_ENABLED_KEY, privacyStore);
  // Same rule as `useTelemetryEnabled`: the WRITE goes through the one exported function, so a
  // side effect added there can never be dead code on the only path a user reaches.
  return [value ?? true, setSyncEnabled];
}
