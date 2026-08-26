/**
 * audioPlayerStore — global audio playback state as a flat Zustand store
 * (Story 19.2; migrated from the ~2,070-LOC `AudioPlayerContext` provider).
 *
 * The store holds the playback snapshot (current track, playback state, position,
 * duration, rate, volume, word-sync, queue) as **flat top-level fields** so a
 * consumer can select exactly the fields it reads — a cold-path consumer that
 * never reads `positionMs` does NOT re-render on the ~4-10/sec position ticks.
 * The former 24 reducer cases are reimplemented here as pure state-transition
 * actions (the shuffle Fisher-Yates / un-shuffle restore / queue bounds logic is
 * preserved byte-for-byte).
 *
 * The imperative engine — the expo-audio player instance, all refs, every effect,
 * and the async actions (`play`/`pause`/`seekTo`/…) that talk to the player — lives
 * in `useAudioPlayerEngine` (a single boot hook). It REGISTERS its async actions
 * into this store once at boot (`registerEngineActions`) so consumers can select
 * stable action references that never re-render on ticks.
 *
 * This is the cheat-sheet's canonical Zustand pattern (§ State boundary), now
 * demonstrated on a large, effect-heavy runtime subsystem. The expo-audio player +
 * effects are the sanctioned external-engine bridge (the boot hook), not
 * "cross-component UI state held in React Context".
 *
 * @example
 * // Hot-path (reads per-tick fields → re-renders on ticks, correct + isolated):
 * const state = usePlayerState();
 * const { seekTo } = usePlayerActions();
 * @example
 * // Cold-path (reads no per-tick field → never re-renders on ticks):
 * const playbackState = useAudioPlayerStore((s) => s.playbackState);
 * const { setQueue, playQueueItem } = usePlayerActions();
 */

import type { BlockRange } from '@cloudquran/shared';
import { create } from 'zustand';
import { useShallow } from 'zustand/shallow';
import { calculateProgress } from '@/lib/audioHelpers';
import { formatSleepRemaining } from '@/lib/formatTime';

export type { BlockRange };

/**
 * Playback state enum
 */
export type PlaybackState = 'idle' | 'loading' | 'playing' | 'paused' | 'buffering' | 'error';

/**
 * Repeat mode for queue playback
 */
export type RepeatMode = 'off' | 'one' | 'all';

/**
 * Queue item - minimal, serializable
 */
export interface QueueItem {
  bookId: string;
  sectionType: string;
}

/**
 * Queue state - all queue metadata
 */
export interface QueueState {
  items: QueueItem[];
  currentIndex: number;
  source: 'book' | 'collection' | 'feed';
  sourceId?: string;
  shuffleEnabled: boolean;
  repeatMode: RepeatMode;
  originalOrder: QueueItem[];
}

/**
 * Audio player state — the flat playback snapshot (the public shape consumers
 * read via `usePlayerState()`; retained field-for-field from the old reducer).
 */
export interface AudioPlayerState {
  // Current track info
  currentBookId: string | null;
  currentSection: string | null;
  currentAudioUrl: string | null;

  // Playback state
  playbackState: PlaybackState;
  positionMs: number;
  durationMs: number;
  playbackRate: number;
  volume: number; // 0-1 range

  // Sync data — exact per-block ranges from the R2 sidecar (Story 22.9). Highlighting
  // is a direct `currentTime → block` lookup; no word index, no estimate, no drift.
  blocks: BlockRange[] | null;

  // Offline playback (Story 11.5)
  isPlayingOffline: boolean;

  // Error handling
  error: string | null;

  // Section completion counter (increments on each PLAYBACK_COMPLETED)
  sectionCompletedCount: number;

  // Queue state (null = single-book mode)
  queue: QueueState | null;
}

/**
 * Offline source for local file playback (Story 11.5)
 */
export interface OfflineSource {
  /** file:// URI for local audio */
  audioUri: string;
  /** Block ranges from offline content JSON (Story 22.9) */
  blocks: BlockRange[];
  /** Duration from offline content */
  durationMs: number;
}

/**
 * Optional book metadata to avoid re-querying for lock screen info.
 * When provided, play() skips the queryOnce for book title/author/coverUrl.
 */
export interface BookMetadata {
  title: string;
  author: string;
  coverUrl?: string;
}

/**
 * Payload for the `playAudio` state transition (the former PLAY_AUDIO action).
 */
export interface PlayAudioPayload {
  bookId: string;
  section: string;
  audioUrl: string;
  blocks?: BlockRange[];
  durationMs: number;
  isOffline?: boolean;
}

/**
 * The imperative async actions the engine (`useAudioPlayerEngine`) registers into
 * the store once at boot. They talk to the expo-audio player + dispatch state
 * transitions. Default to inert no-ops until registered (SSR / pre-boot safe).
 */
export interface EngineActions {
  /** Single-book playback (Story 22.10): the engine builds an `AudioPlaylist` of the
   *  book's accessible sections (offline-first / signed per track) and starts at
   *  `section`. Resolution lives in the engine — callers no longer pre-resolve a URL. */
  play: (
    bookId: string,
    section: string,
    bookMetadata?: BookMetadata,
    shouldAutoPlay?: boolean
  ) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  stop: () => Promise<void>;
  /** Story 24.20: stop playback because the ACCOUNT is going away (sign-out / account
   *  deletion) — the seam `@/lib/accountTeardown` drives, so `lib/` never has to import
   *  `features/player/`. Two things separate it from `stop()`:
   *  1. It **discards** the queued progress save instead of flushing it. `stop()` fires an
   *     immediate save on the way out; here that write would land under the NEXT account
   *     (the debounce callback reads the live user at FIRE time, by then the auto-guest).
   *  2. It clears the **sleep timer** as well as the playback state — `stopAudio()` does not
   *     touch the sleep block, and the engine's countdown outlives the teardown, so an armed
   *     timer would otherwise be inherited by the next account and pause its idle player. */
  abandonPlayback: () => Promise<void>;
  seekTo: (positionMs: number) => Promise<void>;
  setPlaybackRate: (rate: number) => Promise<void>;
  setVolume: (volume: number) => void;
  switchToOfflineSource: (offlineAudioUri: string) => Promise<void>;
  playQueueItem: (item: QueueItem, shouldAutoPlay?: boolean) => Promise<void>;
  nextInQueue: (shouldAutoPlay?: boolean) => Promise<void>;
  previousInQueue: (shouldAutoPlay?: boolean) => Promise<void>;
  /** Story 19.4: single-book section navigation, lifted into the engine so the
   *  lock-screen remote-command handler (which runs with AudioPlayer.tsx
   *  unmounted) AND the on-screen buttons call the same action. No-op at the
   *  first/last available section (no wrap). */
  nextSection: (shouldAutoPlay?: boolean) => Promise<void>;
  previousSection: (shouldAutoPlay?: boolean) => Promise<void>;
}

/**
 * The pure state-transition actions (reducer-equivalent) + the registered engine
 * actions + the public queue actions. Flat — every field/action is top-level.
 */
interface AudioPlayerStore extends AudioPlayerState, EngineActions {
  // ─── Sleep timer (Story 19.5; lifted out of the component-level useSleepTimer) ───
  /** "End of section" flag — read by the engine's auto-advance (kept identical
   *  semantics so `get().sleepEndOfSection` still gates queue advance). */
  sleepEndOfSection: boolean;
  /** Chosen TIMED duration in ms; `null` when off or end-of-section. */
  sleepDurationMs: number | null;
  /** Remaining ms for a timed sleep (ticked once/sec by the engine; 0 otherwise). */
  sleepRemainingMs: number;
  /** True when ANY sleep timer (timed OR end-of-section) is set. */
  sleepActive: boolean;
  /** Monotonic counter bumped on every timed `setSleepTimer` arm. The engine
   *  keys its countdown effect on this so re-arming the SAME duration (e.g.
   *  "+30 more min") re-latches `endTime` — a `sleepDurationMs`-only dep would
   *  not re-run and the timer would fire on the stale end time. (Story 19.5 CR.) */
  sleepEpoch: number;

  // ─── State-transition actions (reducer cases; engine-internal callers) ───
  playAudio: (payload: PlayAudioPayload) => void; // PLAY_AUDIO
  pauseAudio: () => void; // PAUSE_AUDIO
  resumeAudio: () => void; // RESUME_AUDIO
  stopAudio: () => void; // STOP_AUDIO
  setPosition: (positionMs: number) => void; // SEEK_TO + SET_POSITION (identical)
  setRate: (rate: number) => void; // SET_PLAYBACK_RATE
  setVolumeValue: (volume: number) => void; // SET_VOLUME
  setDuration: (durationMs: number) => void; // SET_DURATION
  setPlaybackStateValue: (state: PlaybackState) => void; // SET_PLAYBACK_STATE
  setPlayingOffline: (isPlayingOffline: boolean) => void; // SET_PLAYING_OFFLINE
  setError: (error: string) => void; // SET_ERROR
  clearError: () => void; // CLEAR_ERROR
  playbackCompleted: () => void; // PLAYBACK_COMPLETED
  /** Count a section that finished and the playlist auto-advanced PAST (a non-final
   *  track). Unlike `playbackCompleted` it bumps ONLY the counter — it does NOT pause
   *  or move the position, because the next track is already playing. Drives the
   *  store-review prompt's per-section delta (Story 22.10). */
  markSectionCompleted: () => void;
  setRepeatMode: (mode: RepeatMode) => void; // SET_REPEAT_MODE
  /** Start / replace / cancel a sleep timer. `number` (ms > 0) = timed; `'end'` =
   *  end-of-section; `null` (or ms ≤ 0) = cancel. Pure — the engine owns the clock. */
  setSleepTimer: (arg: number | 'end' | null) => void;
  /** Engine-only: write the latest remaining ms during a timed countdown. */
  setSleepRemaining: (ms: number) => void;
  /** Turn off any sleep timer (timed or end-of-section). */
  clearSleepTimer: () => void;

  // ─── Public pure queue actions (selected directly by consumers) ───
  setQueue: (queue: QueueState) => void; // SET_QUEUE
  toggleShuffle: () => void; // TOGGLE_SHUFFLE
  cycleRepeatMode: () => void; // reads queue → SET_REPEAT_MODE
  clearQueue: () => void; // CLEAR_QUEUE
  updateQueueItems: (items: QueueItem[]) => void; // UPDATE_QUEUE_ITEMS

  // ─── Engine action registration (called once at boot) ───
  registerEngineActions: (actions: EngineActions) => void;
}

/**
 * Initial playback state — mirrors the old reducer `initialState` exactly.
 */
const initialState: AudioPlayerState = {
  currentBookId: null,
  currentSection: null,
  currentAudioUrl: null,
  playbackState: 'idle',
  positionMs: 0,
  durationMs: 0,
  playbackRate: 1,
  volume: 1, // Full volume by default
  blocks: null,
  isPlayingOffline: false,
  error: null,
  sectionCompletedCount: 0,
  queue: null,
};

/** Inert no-op engine actions — the store is fully usable (and SSR-safe) before
 *  the boot hook registers the real implementations. */
const noopEngineActions: EngineActions = {
  play: async () => {},
  pause: async () => {},
  resume: async () => {},
  stop: async () => {},
  abandonPlayback: async () => {},
  seekTo: async () => {},
  setPlaybackRate: async () => {},
  setVolume: () => {},
  switchToOfflineSource: async () => {},
  playQueueItem: async () => {},
  nextInQueue: async () => {},
  previousInQueue: async () => {},
  nextSection: async () => {},
  previousSection: async () => {},
};

export const useAudioPlayerStore = create<AudioPlayerStore>((set, get) => ({
  ...initialState,
  ...noopEngineActions,
  sleepEndOfSection: false,
  sleepDurationMs: null,
  sleepRemainingMs: 0,
  sleepActive: false,
  sleepEpoch: 0,

  // ─── State transitions (ported 1:1 from audioPlayerReducer) ───
  playAudio: (payload) =>
    set({
      currentBookId: payload.bookId,
      currentSection: payload.section,
      currentAudioUrl: payload.audioUrl,
      blocks: payload.blocks ?? null,
      durationMs: payload.durationMs,
      isPlayingOffline: payload.isOffline ?? false,
      playbackState: 'loading',
      positionMs: 0,
      error: null,
    }),
  pauseAudio: () => set({ playbackState: 'paused' }),
  resumeAudio: () => set({ playbackState: 'playing' }),
  stopAudio: () =>
    set({
      currentBookId: null,
      currentSection: null,
      currentAudioUrl: null,
      blocks: null,
      playbackState: 'idle',
      positionMs: 0,
      durationMs: 0,
      isPlayingOffline: false,
      queue: null,
    }),
  setPosition: (positionMs) => set({ positionMs }),
  setRate: (rate) => set({ playbackRate: rate }),
  setVolumeValue: (volume) => set({ volume }),
  setDuration: (durationMs) => set({ durationMs }),
  setPlaybackStateValue: (state) => set({ playbackState: state }),
  setPlayingOffline: (isPlayingOffline) => set({ isPlayingOffline }),
  setError: (error) => set({ error, playbackState: 'error' }),
  clearError: () => set({ error: null }),
  playbackCompleted: () =>
    set((s) => ({
      playbackState: 'paused',
      positionMs: s.durationMs,
      sectionCompletedCount: s.sectionCompletedCount + 1,
    })),
  markSectionCompleted: () => set((s) => ({ sectionCompletedCount: s.sectionCompletedCount + 1 })),
  setRepeatMode: (mode) =>
    set((s) => {
      if (!s.queue) return s;
      return { queue: { ...s.queue, repeatMode: mode } };
    }),
  setSleepTimer: (arg) =>
    set((s) => {
      if (arg === 'end') {
        return {
          sleepEndOfSection: true,
          sleepActive: true,
          sleepDurationMs: null,
          sleepRemainingMs: 0,
        };
      }
      if (typeof arg === 'number' && arg > 0) {
        return {
          sleepEndOfSection: false,
          sleepActive: true,
          sleepDurationMs: arg,
          sleepRemainingMs: arg,
          // Bump the epoch so the engine re-latches `endTime` even when `arg`
          // equals the current `sleepDurationMs` (re-arming the same duration).
          sleepEpoch: s.sleepEpoch + 1,
        };
      }
      // null or non-positive → cancel
      return {
        sleepEndOfSection: false,
        sleepActive: false,
        sleepDurationMs: null,
        sleepRemainingMs: 0,
      };
    }),
  setSleepRemaining: (ms) => set({ sleepRemainingMs: Math.max(0, ms) }),
  clearSleepTimer: () =>
    set({
      sleepEndOfSection: false,
      sleepActive: false,
      sleepDurationMs: null,
      sleepRemainingMs: 0,
    }),

  // ─── Public pure queue actions ───
  setQueue: (queue) => set({ queue }),
  toggleShuffle: () =>
    set((s) => {
      if (!s.queue) return s;
      if (!s.queue.shuffleEnabled) {
        // Enable shuffle: Fisher-Yates on remaining items, current stays at index 0
        const currentItem = s.queue.items[s.queue.currentIndex];
        const rest = s.queue.items.filter((_, i) => i !== s.queue!.currentIndex);
        const shuffled = [...rest];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return {
          queue: {
            ...s.queue,
            shuffleEnabled: true,
            originalOrder: s.queue.items,
            items: [currentItem, ...shuffled],
            currentIndex: 0,
          },
        };
      }
      // Disable shuffle: restore original order
      const currentItem = s.queue.items[s.queue.currentIndex];
      const originalIndex = s.queue.originalOrder.findIndex(
        (item) => item.bookId === currentItem.bookId && item.sectionType === currentItem.sectionType
      );
      return {
        queue: {
          ...s.queue,
          shuffleEnabled: false,
          items: s.queue.originalOrder,
          originalOrder: [],
          currentIndex: originalIndex >= 0 ? originalIndex : 0,
        },
      };
    }),
  cycleRepeatMode: () => {
    const q = get().queue;
    if (!q) return;
    const nextMode: Record<RepeatMode, RepeatMode> = { off: 'all', all: 'one', one: 'off' };
    set({ queue: { ...q, repeatMode: nextMode[q.repeatMode] } });
  },
  clearQueue: () => set({ queue: null }),
  updateQueueItems: (items) =>
    set((s) => {
      if (!s.queue) return s;
      return { queue: { ...s.queue, items, originalOrder: items } };
    }),

  // ─── Engine registration ───
  registerEngineActions: (actions) => set(actions),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Selector hooks — the public consumer API. Each selects narrowly so a consumer
// re-renders ONLY when a field it reads changes (cold-path consumers read no
// per-tick field → no re-render on the ~4-10/sec position ticks).
// ─────────────────────────────────────────────────────────────────────────────

const STATE_KEYS: (keyof AudioPlayerState)[] = [
  'currentBookId',
  'currentSection',
  'currentAudioUrl',
  'playbackState',
  'positionMs',
  'durationMs',
  'playbackRate',
  'volume',
  'blocks',
  'isPlayingOffline',
  'error',
  'sectionCompletedCount',
  'queue',
];

/**
 * usePlayerState — the full flat playback snapshot (the old `state` object).
 *
 * Re-renders whenever ANY playback field changes (incl. per-tick `positionMs`).
 * Use it in HOT-path consumers that legitimately read per-tick fields
 * (AudioPlayer / MiniPlayer / SyncedTextViewer). Cold-path consumers must select
 * narrowly instead (e.g. `useAudioPlayerStore((s) => s.playbackState)`), or they
 * will re-render on every tick.
 */
export function usePlayerState(): AudioPlayerState {
  return useAudioPlayerStore(
    useShallow((s) => {
      const snapshot = {} as AudioPlayerState;
      for (const k of STATE_KEYS) {
        // @ts-expect-error indexed assignment across the union of field types
        snapshot[k] = s[k];
      }
      return snapshot;
    })
  );
}

/**
 * The public action bag — every action a consumer can call. All references are
 * stable (created once by `create()`; the engine actions flip from no-op → real
 * exactly once at boot), so selecting actions never re-renders on ticks.
 */
export interface PlayerActions {
  play: EngineActions['play'];
  pause: EngineActions['pause'];
  resume: EngineActions['resume'];
  stop: EngineActions['stop'];
  seekTo: EngineActions['seekTo'];
  setPlaybackRate: EngineActions['setPlaybackRate'];
  setVolume: EngineActions['setVolume'];
  switchToOfflineSource: EngineActions['switchToOfflineSource'];
  setQueue: (queue: QueueState) => void;
  playQueueItem: EngineActions['playQueueItem'];
  nextInQueue: EngineActions['nextInQueue'];
  previousInQueue: EngineActions['previousInQueue'];
  nextSection: EngineActions['nextSection'];
  previousSection: EngineActions['previousSection'];
  toggleShuffle: () => void;
  cycleRepeatMode: () => void;
  clearQueue: () => void;
  updateQueueItems: (items: QueueItem[]) => void;
}

/**
 * usePlayerActions — the stable action bag. Never re-renders on position ticks
 * (actions are stable references). Safe in cold-path consumers.
 */
export function usePlayerActions(): PlayerActions {
  return useAudioPlayerStore(
    useShallow((s) => ({
      play: s.play,
      pause: s.pause,
      resume: s.resume,
      stop: s.stop,
      seekTo: s.seekTo,
      setPlaybackRate: s.setPlaybackRate,
      setVolume: s.setVolume,
      switchToOfflineSource: s.switchToOfflineSource,
      setQueue: s.setQueue,
      playQueueItem: s.playQueueItem,
      nextInQueue: s.nextInQueue,
      previousInQueue: s.previousInQueue,
      nextSection: s.nextSection,
      previousSection: s.previousSection,
      toggleShuffle: s.toggleShuffle,
      cycleRepeatMode: s.cycleRepeatMode,
      clearQueue: s.clearQueue,
      updateQueueItems: s.updateQueueItems,
    }))
  );
}

// ─── Derived selector helpers (computed, not stored) ───

/** True when actively playing. Cold-path safe (re-renders only on playbackState change). */
export const useIsPlaying = (): boolean =>
  useAudioPlayerStore((s) => s.playbackState === 'playing');

/** True when paused. Cold-path safe. */
export const useIsPaused = (): boolean => useAudioPlayerStore((s) => s.playbackState === 'paused');

/** True when loading or buffering. Cold-path safe. */
export const useIsLoading = (): boolean =>
  useAudioPlayerStore((s) => s.playbackState === 'loading' || s.playbackState === 'buffering');

/** True when a queue is active (non-null + has items). Cold-path safe. */
export const useIsQueueActive = (): boolean =>
  useAudioPlayerStore((s) => s.queue !== null && s.queue.items.length > 0);

/** The current queue (or null). Re-renders only on queue change, not on ticks. */
export const useQueue = (): QueueState | null => useAudioPlayerStore((s) => s.queue);

/** Playback progress 0-1. HOT — re-renders on every position tick. */
export const useProgress = (): number =>
  useAudioPlayerStore((s) => calculateProgress(s.positionMs, s.durationMs));

// ─── Sleep timer (Story 19.5) ───

/** The sleep-timer view a consumer renders (full player pill / MiniPlayer badge /
 *  overflow row). `label` is the formatted countdown ("12m" / "End" / ""). */
export interface SleepTimerView {
  active: boolean;
  remainingMs: number;
  durationMs: number | null;
  endOfSection: boolean;
  label: string;
}

/**
 * useSleepTimerState — narrow sleep selector. A consumer re-renders ONLY on the
 * 1/sec sleep tick (or a start/cancel), never on the ~10/sec position ticks — so
 * the MiniPlayer / full player can show a live countdown without coupling to the
 * hot playback snapshot.
 */
export function useSleepTimerState(): SleepTimerView {
  const s = useAudioPlayerStore(
    useShallow((st) => ({
      active: st.sleepActive,
      remainingMs: st.sleepRemainingMs,
      durationMs: st.sleepDurationMs,
      endOfSection: st.sleepEndOfSection,
    }))
  );
  return { ...s, label: formatSleepRemaining(s.remainingMs, s.endOfSection) };
}

export interface SleepTimerActions {
  setSleepTimer: (arg: number | 'end' | null) => void;
  clearSleepTimer: () => void;
}

/** useSleepTimerActions — stable sleep action bag (start/replace/cancel). */
export function useSleepTimerActions(): SleepTimerActions {
  return useAudioPlayerStore(
    useShallow((s) => ({ setSleepTimer: s.setSleepTimer, clearSleepTimer: s.clearSleepTimer }))
  );
}
