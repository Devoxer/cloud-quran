/**
 * Tests for teardownAccountScopedState — the ONE account-scoped teardown.
 *
 * Story 24.20 regression guard: the playback stop must run, must run FIRST, and must never be
 * able to abort the remaining clears. That guard is the reason this suite exists and it is
 * preserved verbatim in intent below — only the *names* of the later steps changed.
 *
 * ⚠️ Story 5-2 removed four of the original seven steps with their modules (RevenueCat
 * `resetUser`, `clearOfflineLicense`, PostHog `analytics.reset()`, and `clearDailyActivityState`,
 * an InstantDB writer), and both CALLERS went with `db.auth`. The temptation at that point is to
 * delete the ordering assertion because the step it named is gone. Don't — re-anchor it on a
 * surviving step instead. "Playback stops before anything else touches account state" is the
 * invariant; `clearDailyActivityState` was only ever the example that made it observable.
 *
 * The audio store is deliberately NOT mocked — the real `@/stores/audioPlayerStore` is the seam
 * under test, so the "before the engine registers" case exercises the real inert
 * `noopEngineActions` slot rather than a stub of it.
 */

const mockClearPlaySourcesCache = jest.fn();
const mockClearSentryUser = jest.fn();
const mockCaptureException = jest.fn();
const mockClearSyncState = jest.fn();

jest.mock('@/lib/contentRead', () => ({
  clearPlaySourcesCache: () => mockClearPlaySourcesCache(),
}));
// story 5-6. ⚠️ `@/lib/syncCache`, which is the module the teardown actually imports — and it
// imports THAT rather than `@/lib/sync` to stay out of the `auth → accountTeardown → sync → api →
// auth` require cycle. Mocking the wrong one of the two would leave this suite green while the
// real call went unmocked, dragging better-auth's module-scope listeners in behind it.
jest.mock('@/lib/syncCache', () => ({
  clearSyncState: () => mockClearSyncState(),
}));
jest.mock('@/lib/errors', () => ({
  captureException: (error: unknown, context?: Record<string, unknown>) =>
    mockCaptureException(error, context),
  clearSentryUser: () => mockClearSentryUser(),
}));

import { useAudioPlayerStore } from '@/stores/audioPlayerStore';
// Import after mocking.
import { teardownAccountScopedState } from './accountTeardown';

describe('teardownAccountScopedState', () => {
  beforeEach(() => {
    mockClearPlaySourcesCache.mockReset();
    mockClearSentryUser.mockReset();
    mockCaptureException.mockReset();
    mockClearSyncState.mockReset();
    // Drop any engine actions a previous test registered.
    useAudioPlayerStore.setState(useAudioPlayerStore.getInitialState(), true);
  });

  it('invokes the store playback stop', async () => {
    const abandonPlayback = jest.fn().mockResolvedValue(undefined);
    useAudioPlayerStore.setState({ abandonPlayback });

    await teardownAccountScopedState();

    expect(abandonPlayback).toHaveBeenCalledTimes(1);
  });

  it('stops playback BEFORE clearing any account-scoped state', async () => {
    // The engine host never unmounts, so a still-running engine keeps writing playback
    // progress into whichever account is current. Anything cleared before it stops can be
    // re-populated behind the teardown's back.
    const order: string[] = [];
    const abandonPlayback = jest.fn().mockImplementation(async () => {
      order.push('abandonPlayback');
    });
    useAudioPlayerStore.setState({ abandonPlayback });
    mockClearPlaySourcesCache.mockImplementation(() => order.push('clearPlaySourcesCache'));
    mockClearSyncState.mockImplementation(() => order.push('clearSyncState'));
    mockClearSentryUser.mockImplementation(() => order.push('clearSentryUser'));

    await teardownAccountScopedState();

    expect(order).toEqual([
      'abandonPlayback',
      'clearPlaySourcesCache',
      'clearSyncState',
      'clearSentryUser',
    ]);
  });

  it('still completes every remaining clear when the playback stop throws', async () => {
    const failure = new Error('engine exploded');
    useAudioPlayerStore.setState({
      abandonPlayback: jest.fn().mockRejectedValue(failure),
    });

    await expect(teardownAccountScopedState()).resolves.toBeUndefined();

    expect(mockCaptureException).toHaveBeenCalledWith(failure, {
      context: 'accountTeardown.abandonPlayback',
    });
    // The user is leaving: a player failure must never strand account state on the device.
    expect(mockClearPlaySourcesCache).toHaveBeenCalled();
    expect(mockClearSyncState).toHaveBeenCalled();
    expect(mockClearSentryUser).toHaveBeenCalled();
  });

  it('is a silent no-op before the engine has registered its actions', async () => {
    // The initial-state slot holds inert `noopEngineActions`; reaching it must not be reported
    // as an error, and must not stop the rest of the teardown.
    await expect(teardownAccountScopedState()).resolves.toBeUndefined();

    expect(mockCaptureException).not.toHaveBeenCalled();
    expect(mockClearPlaySourcesCache).toHaveBeenCalled();
    expect(mockClearSyncState).toHaveBeenCalled();
    expect(mockClearSentryUser).toHaveBeenCalled();
  });

  it('clears the write OUTBOX and the query cache on the way out (story 5-6)', async () => {
    // ⚠️ THE OUTBOX CLEAR IS ABOUT CORRECTNESS, NOT PRIVACY. Cache keys carry the user id, so the
    // next account cannot be SERVED the previous user's rows — but a queued WRITE carries no
    // identity at all and drains against whatever session is current. Without this step a guest's
    // queued bookmark lands in the next person's account on the same device.
    await teardownAccountScopedState();

    expect(mockClearSyncState).toHaveBeenCalledTimes(1);
  });

  it('a failing sync clear still leaves the Sentry identity cleared', async () => {
    const failure = new Error('mmkv exploded');
    mockClearSyncState.mockImplementation(() => {
      throw failure;
    });

    await expect(teardownAccountScopedState()).resolves.toBeUndefined();

    expect(mockCaptureException).toHaveBeenCalledWith(failure, {
      context: 'accountTeardown.clearSyncState',
    });
    expect(mockClearSentryUser).toHaveBeenCalled();
  });
});
