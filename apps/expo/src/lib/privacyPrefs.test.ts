/**
 * Tests for privacyPrefs — the two device-local privacy choices, and their opposite defaults.
 *
 * ⚠️ THIS IS THE NFR8 HINGE, AND IT HAD NO TEST AT ALL UNTIL THE STORY 5-2 REVIEW.
 *
 * Cloud Quran ships zero third-party analytics, advertising or tracking SDKs. PII-scrubbed Sentry
 * is the single sanctioned exception, and only on an opt-in basis. The whole of that guarantee
 * rests on two `?? false` defaults in this module — one read at module scope by
 * `app/_layout.tsx` (`if (isTelemetryEnabled()) initErrorTracking()` and the `withSentry` wrap),
 * one by the toggle that shows the user their own consent state.
 *
 * Flip either default to `?? true` and nothing in the suite reddens: the app initializes Sentry on
 * first launch with no consent given, or the screen reads ON while `isTelemetryEnabled()` still
 * returns false and the switch lies about what is happening. Both are silent. These cases exist so
 * they are not.
 */

import * as Sentry from '@sentry/react-native';
import { act, renderHook } from '@testing-library/react-native';
import {
  isSyncEnabled,
  isTelemetryEnabled,
  privacyStore,
  SYNC_ENABLED_KEY,
  setSyncEnabled,
  setTelemetryEnabled,
  TELEMETRY_ENABLED_KEY,
  useSyncEnabled,
  useTelemetryEnabled,
} from './privacyPrefs';

beforeEach(() => {
  privacyStore.clearAll();
  jest.clearAllMocks();
});

describe('isTelemetryEnabled — the module-scope read', () => {
  it('defaults to OFF when the user has never chosen', () => {
    // The default IS the privacy guarantee. A fresh install must not send crash reports.
    expect(isTelemetryEnabled()).toBe(false);
  });

  it('reads back an explicit opt-in', () => {
    setTelemetryEnabled(true);
    expect(isTelemetryEnabled()).toBe(true);
  });

  it('reads back an explicit opt-out, distinctly from never-chosen', () => {
    setTelemetryEnabled(false);
    expect(privacyStore.getBoolean(TELEMETRY_ENABLED_KEY)).toBe(false);
    expect(isTelemetryEnabled()).toBe(false);
  });

  it('SHUTS SENTRY DOWN when consent is withdrawn, not at the next launch', () => {
    // The whole point of an opt-out. `initErrorTracking()` runs once at module scope, so without
    // this a user who toggled off kept sending crash reports until they killed the app.
    setTelemetryEnabled(true);
    (Sentry.close as jest.Mock).mockClear();

    setTelemetryEnabled(false);

    expect(Sentry.close).toHaveBeenCalledTimes(1);
  });

  it('does NOT close Sentry when consent is granted', () => {
    // Turning it ON needs a relaunch (the root wrap already ran); closing here would be wrong.
    setTelemetryEnabled(true);

    expect(Sentry.close).not.toHaveBeenCalled();
  });

  it('survives a close() rejection — the preference write is what the user asked for', () => {
    (Sentry.close as jest.Mock).mockRejectedValueOnce(new Error('flush failed'));

    expect(() => setTelemetryEnabled(false)).not.toThrow();
    expect(isTelemetryEnabled()).toBe(false);
  });

  it('is synchronous — app/_layout.tsx calls it at module scope, before React mounts', () => {
    // If this ever becomes async, the boot gate silently becomes "always false" (a Promise is
    // truthy, but the `if` would be reading one, not a boolean) — assert the shape.
    expect(typeof isTelemetryEnabled()).toBe('boolean');
  });

  it('stores the pref in the dedicated privacy MMKV instance, not a shared one', () => {
    // Isolation is why the store exists: a "clear my privacy choices" action must not take
    // playback or theme prefs with it.
    setTelemetryEnabled(true);
    expect(privacyStore.getBoolean(TELEMETRY_ENABLED_KEY)).toBe(true);
  });
});

describe('useTelemetryEnabled — what the toggle shows the user', () => {
  it('shows OFF when the user has never chosen', () => {
    // Must agree with isTelemetryEnabled(). A screen reading ON while the module-scope gate
    // reads false would tell the user their crash reports are being sent when they are not —
    // or, with the defaults swapped, the reverse.
    const { result } = renderHook(() => useTelemetryEnabled());

    expect(result.current[0]).toBe(false);
  });

  it('agrees with isTelemetryEnabled in every state', () => {
    const { result, rerender } = renderHook(() => useTelemetryEnabled());
    expect(result.current[0]).toBe(isTelemetryEnabled());

    act(() => result.current[1](true));
    rerender({});
    expect(result.current[0]).toBe(isTelemetryEnabled());

    act(() => result.current[1](false));
    rerender({});
    expect(result.current[0]).toBe(isTelemetryEnabled());
  });

  it('THE HOOK SETTER SHUTS SENTRY DOWN — not just the standalone function', () => {
    // ⚠️ THIS IS THE CASE THAT WAS MISSING, AND ITS ABSENCE HID A REAL BUG.
    // The suite proved `setTelemetryEnabled(false)` closes Sentry, but the toggle did not call
    // it — `useTelemetryEnabled` returned `useMMKVBoolean`'s raw `setValue`, which writes the key
    // and nothing else. So the standalone function had ZERO production callers, the shutdown was
    // dead code on the only path a user can reach, and the green test was proof of a path the
    // app never took. Assert through the hook, which is what the screen actually holds.
    const { result } = renderHook(() => useTelemetryEnabled());
    act(() => result.current[1](true));
    (Sentry.close as jest.Mock).mockClear();

    act(() => result.current[1](false));

    expect(Sentry.close).toHaveBeenCalledTimes(1);
  });

  it('persists the choice so the next launch sees it', () => {
    const { result } = renderHook(() => useTelemetryEnabled());

    act(() => result.current[1](true));

    // The next cold start reads through isTelemetryEnabled(), not the hook.
    expect(isTelemetryEnabled()).toBe(true);
  });
});

describe('isSyncEnabled — the device-local sync opt-out (story 5-7)', () => {
  it('defaults to ON, because a reader who signs in wants their rows to follow them', () => {
    // ⚠️ THE OPPOSITE DEFAULT TO TELEMETRY, ON PURPOSE. Crash reporting is something the app wants
    // and the reader does not, so it defaults OFF. Sync is the thing the reader signed in FOR, and
    // an opt-in nobody opts into is a feature that does not work. Owner's call, 2026-08-26.
    expect(isSyncEnabled()).toBe(true);
  });

  it('reads back an explicit opt-out, distinctly from never-chosen', () => {
    setSyncEnabled(false);
    expect(privacyStore.getBoolean(SYNC_ENABLED_KEY)).toBe(false);
    expect(isSyncEnabled()).toBe(false);
  });

  it('reads back an explicit opt-in after an opt-out — the switch is reversible', () => {
    setSyncEnabled(false);
    setSyncEnabled(true);
    expect(isSyncEnabled()).toBe(true);
  });

  it('is synchronous — `drainNow` and `prefetchSyncReads` read it outside React', () => {
    // Both callers run from timers, manager callbacks or a boot effect, where there is no hook and
    // nothing to await. A Promise here would be truthy and the gate would never refuse.
    expect(typeof isSyncEnabled()).toBe('boolean');
  });

  it('destroys nothing and touches no other choice', () => {
    // ⚠️ THE ROW THIS REPLACED SIGNED THE READER OUT. Turning sync off must leave the account, the
    // session and the telemetry choice exactly as they were — it is a preference, not an action.
    setTelemetryEnabled(true);
    setSyncEnabled(false);
    expect(isTelemetryEnabled()).toBe(true);
  });
});

describe('useSyncEnabled — what the switch shows the reader', () => {
  it('shows ON when the reader has never chosen', () => {
    const { result } = renderHook(() => useSyncEnabled());
    expect(result.current[0]).toBe(true);
  });

  it('agrees with isSyncEnabled in every state', () => {
    // A switch reading ON while `lib/sync.ts` reads false would be the exact defect this whole
    // change exists to remove: a control that says one thing while the data layer does another.
    const { result, rerender } = renderHook(() => useSyncEnabled());
    expect(result.current[0]).toBe(isSyncEnabled());

    act(() => result.current[1](false));
    rerender({});
    expect(result.current[0]).toBe(isSyncEnabled());

    act(() => result.current[1](true));
    rerender({});
    expect(result.current[0]).toBe(isSyncEnabled());
  });

  it('persists the choice so the next launch sees it', () => {
    const { result } = renderHook(() => useSyncEnabled());

    act(() => result.current[1](false));

    // The next cold start reads through `isSyncEnabled()`, not the hook.
    expect(isSyncEnabled()).toBe(false);
  });
});
