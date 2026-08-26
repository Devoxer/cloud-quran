/**
 * accountTeardown — the ONE account-scoped local-state teardown.
 *
 * A divergent second copy is exactly how a signed-out / deleted user's play-source URLs and
 * still-running playback leak into the next account on the same JS session (epic-23 boundary
 * audit — `deleteAccountAndSignOut` had silently dropped two of these clears; cheat-sheet
 * "ONE canonical teardown, no divergent copy"). Keep it that way when a caller returns.
 *
 * ⚠️ story 5-2 left this module WITHOUT A CALLER, deliberately. Its two callers were
 * `lib/signOut.ts` and `useAuth.deleteAccountAndSignOut`, both of which were InstantDB's
 * `db.auth` and went with it. Everything it does is device-local and survives the vendor
 * change, so story 5-5 re-points Better Auth's sign-out and account-deletion flows at it
 * rather than writing a second one. Four of its seven steps went with their modules:
 * RevenueCat `resetUser`, `clearOfflineLicense`, `analytics.reset()` (PostHog) and
 * `clearDailyActivityState` (an InstantDB writer). The remaining steps are unchanged in
 * ORDER — playback first, caches, then the Sentry identity. Story 5-6 inserted ONE new step
 * (the write outbox + query cache) into the caches band, ahead of the Sentry clear.
 *
 * Reaches the audio engine through `@/stores/audioPlayerStore` — the shared-layer
 * seam the engine registers its imperative actions into. `lib/ → stores/` is a
 * shared→shared import; a `lib/ → features/player` one would be a `lint:layers` HIGH
 * (Story 24.20).
 */

import { clearPlaySourcesCache } from '@/lib/contentRead';
import { captureException, clearSentryUser } from '@/lib/errors';
// ⚠️ `@/lib/syncCache`, NOT `@/lib/sync`. They are the same teardown — `lib/sync.ts` re-exports
// this very function — but importing it through `lib/sync.ts` closes a require cycle:
// `auth → accountTeardown → sync → api → auth`, because `lib/api.ts` reads the session cookie
// from `lib/auth.ts` and `lib/auth.ts` calls this module on sign-out. Metro warned about exactly
// that on the first device launch of story 5-6. There is ONE definition; only the path differs.
import { clearSyncState } from '@/lib/syncCache';
import { useAudioPlayerStore } from '@/stores/audioPlayerStore';

/**
 * Tear down ALL account-scoped local state so the next account on this device /
 * JS session can't inherit the previous user's state. The caller ends the session
 * afterwards.
 */
export async function teardownAccountScopedState(): Promise<void> {
  // 1. Playback — the engine host never unmounts, so without this the native playlist
  //    (and its lock-screen controls) survives sign-out and keeps saving progress into
  //    whichever account is current.
  //    Best-effort — a failure here must never abort the remaining clears or fail the
  //    sign-out, and must not raise a user-facing player error: the user is leaving.
  try {
    await useAudioPlayerStore.getState().abandonPlayback();
  } catch (error) {
    captureException(error, { context: 'accountTeardown.abandonPlayback' });
  }
  // 2. The in-memory play-source URL cache. The content cache is NOT cleared: since story 5-2
  //    collapsed its tiering it holds only free, immutable public text, so dropping it for the
  //    next account would be pure re-fetch waste.
  // Each remaining step is individually guarded. Step 1 already is, and the same reasoning
  // applies here: the user is LEAVING, so a failure in one clear must never strand the ones
  // after it. Unguarded, a throwing cache clear would skip the Sentry identity clear below and
  // carry the departing user's id into the next account on this device.
  try {
    clearPlaySourcesCache();
  } catch (error) {
    captureException(error, { context: 'accountTeardown.clearPlaySourcesCache' });
  }
  // 3. The synced-data layer: the write OUTBOX, the query cache and the sync MMKV cache
  //    (story 5-6). ⚠️ THE OUTBOX IS THE ONE THAT IS ABOUT CORRECTNESS, NOT PRIVACY. Cache keys
  //    already carry the user id, so the next account cannot be SERVED the previous user's rows
  //    by accident — but a queued WRITE carries no identity at all: it is drained against
  //    whatever session is current, which after a sign-out is the next account on this device.
  //    A guest's queued bookmark landing in a stranger's account is the failure this prevents.
  //    Guarded like its siblings — the user is leaving, and a failure here must not strand the
  //    Sentry clear below.
  try {
    clearSyncState();
  } catch (error) {
    captureException(error, { context: 'accountTeardown.clearSyncState' });
  }
  // 4. Sentry identity. LAST, deliberately — it is the one clear whose failure would be
  //    invisible, so nothing may run after it and swallow its error.
  try {
    clearSentryUser();
  } catch (error) {
    captureException(error, { context: 'accountTeardown.clearSentryUser' });
  }
}
