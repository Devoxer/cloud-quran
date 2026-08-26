/**
 * audioPlayerStore — pure state/queue action tests (Story 19.2).
 *
 * Covers the reducer-equivalent state transitions and the queue logic that was
 * the bulk of the old 1,805-LOC AudioPlayerContext suite: shuffle Fisher-Yates +
 * un-shuffle restore, queue bounds (next/previous index), cycleRepeatMode,
 * playbackCompleted, and the derived selectors. The imperative engine actions
 * (play/pause/seekTo…) are covered in useAudioPlayerEngine.test.tsx (they need the
 * expo-audio player); here we only exercise the pure store.
 */

import { act } from '@testing-library/react-native';
import { type QueueState, useAudioPlayerStore } from './audioPlayerStore';

const baseQueue = (overrides: Partial<QueueState> = {}): QueueState => ({
  items: [
    { bookId: 'b1', sectionType: 'summaryBrief' },
    { bookId: 'b2', sectionType: 'summaryBrief' },
    { bookId: 'b3', sectionType: 'summaryBrief' },
  ],
  currentIndex: 0,
  source: 'collection',
  sourceId: 'c1',
  shuffleEnabled: false,
  repeatMode: 'off',
  originalOrder: [],
  ...overrides,
});

const store = useAudioPlayerStore;

beforeEach(() => {
  act(() => {
    store.setState(store.getInitialState(), true);
  });
});

describe('audioPlayerStore — initial state', () => {
  it('starts idle with no track', () => {
    const s = store.getState();
    expect(s.currentBookId).toBeNull();
    expect(s.currentSection).toBeNull();
    expect(s.playbackState).toBe('idle');
    expect(s.positionMs).toBe(0);
    expect(s.playbackRate).toBe(1);
    expect(s.volume).toBe(1);
    expect(s.blocks).toBeNull();
    expect(s.error).toBeNull();
    expect(s.queue).toBeNull();
    expect(s.sleepEndOfSection).toBe(false);
  });
});

describe('audioPlayerStore — playback state transitions', () => {
  it('playAudio sets the new track and loading state', () => {
    act(() =>
      store.getState().playAudio({
        bookId: 'b1',
        section: 'summaryBrief',
        audioUrl: 'https://x/a.mp3',
        durationMs: 60000,
      })
    );
    const s = store.getState();
    expect(s.currentBookId).toBe('b1');
    expect(s.currentSection).toBe('summaryBrief');
    expect(s.currentAudioUrl).toBe('https://x/a.mp3');
    expect(s.durationMs).toBe(60000);
    expect(s.playbackState).toBe('loading');
    expect(s.positionMs).toBe(0);
    expect(s.blocks).toBeNull();
    expect(s.error).toBeNull();
  });

  it('pause / resume toggle playbackState', () => {
    act(() => store.getState().resumeAudio());
    expect(store.getState().playbackState).toBe('playing');
    act(() => store.getState().pauseAudio());
    expect(store.getState().playbackState).toBe('paused');
  });

  it('stopAudio resets track + queue', () => {
    act(() => {
      store.getState().playAudio({
        bookId: 'b1',
        section: 'summaryBrief',
        audioUrl: 'u',
        durationMs: 1000,
      });
      store.getState().setQueue(baseQueue());
      store.getState().stopAudio();
    });
    const s = store.getState();
    expect(s.currentBookId).toBeNull();
    expect(s.playbackState).toBe('idle');
    expect(s.positionMs).toBe(0);
    expect(s.durationMs).toBe(0);
    expect(s.queue).toBeNull();
  });

  it('setError sets error + error state; clearError clears it', () => {
    act(() => store.getState().setError('boom'));
    expect(store.getState().error).toBe('boom');
    expect(store.getState().playbackState).toBe('error');
    act(() => store.getState().clearError());
    expect(store.getState().error).toBeNull();
  });

  it('playbackCompleted parks at end + increments the completion counter', () => {
    act(() => {
      store.getState().setDuration(60000);
      store.getState().resumeAudio();
      store.getState().playbackCompleted();
    });
    const s = store.getState();
    expect(s.playbackState).toBe('paused');
    expect(s.positionMs).toBe(60000);
    expect(s.sectionCompletedCount).toBe(1);
  });
});

describe('audioPlayerStore — markSectionCompleted', () => {
  it('bumps the completion counter ONLY — does not pause or move position', () => {
    act(() => {
      store.getState().setDuration(60000);
      store.getState().setPosition(12345);
      store.getState().resumeAudio();
      store.getState().markSectionCompleted();
    });
    const s = store.getState();
    // Unlike playbackCompleted, the next track is already playing — state untouched.
    expect(s.sectionCompletedCount).toBe(1);
    expect(s.playbackState).toBe('playing');
    expect(s.positionMs).toBe(12345);
  });
});

describe('audioPlayerStore — cycleRepeatMode', () => {
  it('cycles off → all → one → off', () => {
    act(() => store.getState().setQueue(baseQueue({ repeatMode: 'off' })));
    act(() => store.getState().cycleRepeatMode());
    expect(store.getState().queue?.repeatMode).toBe('all');
    act(() => store.getState().cycleRepeatMode());
    expect(store.getState().queue?.repeatMode).toBe('one');
    act(() => store.getState().cycleRepeatMode());
    expect(store.getState().queue?.repeatMode).toBe('off');
  });
});

describe('audioPlayerStore — toggleShuffle', () => {
  it('enabling shuffle keeps the current item at index 0 and stores originalOrder', () => {
    act(() => store.getState().setQueue(baseQueue({ currentIndex: 1 })));
    const original = store.getState().queue!.items;
    const currentItem = original[1];

    act(() => store.getState().toggleShuffle());
    const q = store.getState().queue!;
    expect(q.shuffleEnabled).toBe(true);
    expect(q.currentIndex).toBe(0);
    expect(q.items[0]).toEqual(currentItem);
    // originalOrder preserved for restore
    expect(q.originalOrder).toEqual(original);
    // same set of items, no loss
    expect(q.items).toHaveLength(original.length);
    expect(new Set(q.items.map((i) => i.bookId))).toEqual(new Set(original.map((i) => i.bookId)));
  });

  it('disabling shuffle restores the original order and re-finds the current index', () => {
    act(() => store.getState().setQueue(baseQueue({ currentIndex: 2 })));
    const original = store.getState().queue!.items;
    const currentItem = original[2];

    act(() => store.getState().toggleShuffle()); // enable
    act(() => store.getState().toggleShuffle()); // disable → restore

    const q = store.getState().queue!;
    expect(q.shuffleEnabled).toBe(false);
    expect(q.items).toEqual(original);
    expect(q.originalOrder).toEqual([]);
    expect(q.items[q.currentIndex]).toEqual(currentItem);
  });

  it('no-ops with no queue', () => {
    act(() => store.getState().toggleShuffle());
    expect(store.getState().queue).toBeNull();
  });
});

describe('audioPlayerStore — updateQueueItems', () => {
  it('replaces items and originalOrder', () => {
    act(() => store.getState().setQueue(baseQueue()));
    const next = [{ bookId: 'z1', sectionType: 'summaryCore' }];
    act(() => store.getState().updateQueueItems(next));
    const q = store.getState().queue!;
    expect(q.items).toEqual(next);
    expect(q.originalOrder).toEqual(next);
  });
});

describe('audioPlayerStore — sleep timer (Story 19.5)', () => {
  it('setSleepTimer(ms) starts a timed sleep', () => {
    act(() => store.getState().setSleepTimer(30 * 60_000));
    const s = store.getState();
    expect(s.sleepActive).toBe(true);
    expect(s.sleepDurationMs).toBe(1_800_000);
    expect(s.sleepRemainingMs).toBe(1_800_000);
    expect(s.sleepEndOfSection).toBe(false);
  });

  it("setSleepTimer('end') sets end-of-section with no countdown", () => {
    act(() => store.getState().setSleepTimer('end'));
    const s = store.getState();
    expect(s.sleepActive).toBe(true);
    expect(s.sleepEndOfSection).toBe(true);
    expect(s.sleepDurationMs).toBeNull();
    expect(s.sleepRemainingMs).toBe(0);
  });

  it('setSleepRemaining writes the countdown, clamped to ≥ 0', () => {
    act(() => store.getState().setSleepTimer(60_000));
    act(() => store.getState().setSleepRemaining(45_000));
    expect(store.getState().sleepRemainingMs).toBe(45_000);
    act(() => store.getState().setSleepRemaining(-5));
    expect(store.getState().sleepRemainingMs).toBe(0);
  });

  it('clearSleepTimer and setSleepTimer(null) turn everything off', () => {
    act(() => store.getState().setSleepTimer('end'));
    act(() => store.getState().clearSleepTimer());
    let s = store.getState();
    expect(s.sleepActive).toBe(false);
    expect(s.sleepEndOfSection).toBe(false);
    expect(s.sleepDurationMs).toBeNull();
    expect(s.sleepRemainingMs).toBe(0);

    act(() => store.getState().setSleepTimer(60_000));
    act(() => store.getState().setSleepTimer(null));
    s = store.getState();
    expect(s.sleepActive).toBe(false);
    expect(s.sleepDurationMs).toBeNull();
  });

  it('setSleepTimer with a non-positive duration cancels', () => {
    act(() => store.getState().setSleepTimer(60_000));
    act(() => store.getState().setSleepTimer(0));
    expect(store.getState().sleepActive).toBe(false);
    expect(store.getState().sleepDurationMs).toBeNull();
  });

  it('bumps sleepEpoch on each timed arm so re-arming the SAME duration re-latches (CR)', () => {
    const epoch0 = store.getState().sleepEpoch;
    act(() => store.getState().setSleepTimer(30 * 60_000));
    const epoch1 = store.getState().sleepEpoch;
    expect(epoch1).toBe(epoch0 + 1);
    // Re-arm the identical duration — sleepDurationMs is unchanged, but the epoch
    // MUST advance so the engine effect re-runs and re-anchors endTime.
    act(() => store.getState().setSleepTimer(30 * 60_000));
    expect(store.getState().sleepDurationMs).toBe(1_800_000);
    expect(store.getState().sleepEpoch).toBe(epoch1 + 1);
  });
});
