/**
 * audioPlayerStore — recitation playback state, as a flat Zustand store (story 7-1).
 *
 * ⚠️ THIS FILE WAS REWRITTEN, NOT EXTENDED. What stood here until 7-1 was the forked app's store,
 * still speaking its domain — `bookId`, `sectionType`, `BlockRange` sidecars, shuffle, repeat,
 * a sliding feed window — with a `registerEngineActions` slot that **nothing ever called**,
 * because story 5-1 deleted the engine that used to fill it. It was a shell, and keeping it
 * beside a Quran-shaped store would have meant two audio stores for one player.
 *
 * ── The shape of a Quran queue ───────────────────────────────────────────────────────────────
 *
 * A track is a SURAH — one MP3, at most 114 of them, never 6,236. Advancing an ayah is a SEEK
 * inside the current track; advancing a surah is a track change. So the store holds `surah` (the
 * track) and `activeVerseKey` (where inside it we are), and those are different kinds of thing:
 * the first changes on `trackChanged`, the second up to ten times a second.
 *
 * ⚠️ `activeVerseKey` IS STORED, NOT DERIVED PER RENDER. The engine ticks at 100ms, computes the
 * key from the timing manifest, compares, and calls `setActiveVerse` only when it actually moved.
 * That comparison is the whole reason the reading list is not re-rendered ten times a second —
 * the same discipline `lib/usePosition.ts` applies to position writes, for the same reason. A
 * selector that rebuilt the string per render would hand every subscriber a new value each tick
 * and defeat it.
 *
 * ⚠️ THE IMPERATIVE HALF IS NOT HERE. The playlist instance, the listeners, the seek guard and
 * every `await` live in `features/audio/hooks/useRecitationEngine.tsx`, which registers its
 * actions into this store once at boot. Consumers select stable action references and therefore
 * never re-render on ticks. `lib/accountTeardown.ts` reaches playback through this store for the
 * same reason — `lib/ → stores/` is a legal shared-to-shared import, `lib/ → features/` is not.
 */

import { create } from 'zustand';
import { useShallow } from 'zustand/shallow';

/** Where playback is. `error` is a state a surface can offer a retry from, not a thrown thing. */
export type PlaybackState = 'idle' | 'loading' | 'playing' | 'paused' | 'buffering' | 'error';

/** Every failure the engine can report, as the i18n key the chrome renders. */
export type PlaybackErrorKey = 'player:errors.playFailed';

export interface RecitationState {
  /** The reciter whose audio and timings are loaded, or null before anything has played. */
  reciterId: string | null;
  /** The surah the current track is — the queue position, in Quran terms. */
  surah: number | null;
  /**
   * `"{surah}:{verse}"` for the ayah being recited, or null when nothing is playing **or when
   * this surah's timings are incomplete**. Both surfaces read exactly this one field.
   */
  activeVerseKey: string | null;
  /**
   * Whether the current surah's timings cover every ayah. False means playback works and
   * highlighting is off — see `isSurahTimed` for why a partial manifest must not highlight.
   */
  highlightAvailable: boolean;
  playbackState: PlaybackState;
  /**
   * A translation KEY, never a sentence — the surface renders it.
   *
   * ⚠️ A LITERAL UNION, NOT `string`. The surfaces pass this straight to `t()`, whose key type is
   * generated from the locale files; typing it loosely would let a typo'd key compile and then
   * render as its own raw text to the reader.
   */
  errorKey: PlaybackErrorKey | null;
}

/**
 * The imperative actions the engine registers at boot. Before registration they are inert, so a
 * control pressed during the first frames is a no-op rather than a crash.
 */
export interface EngineActions {
  /** Start (or restart) a surah, optionally at a given ayah. */
  playSurah: (surah: number, verse?: number) => Promise<void>;
  /** Pause where we are, keeping the track loaded. */
  pause: () => Promise<void>;
  /** Resume a paused track. */
  resume: () => Promise<void>;
  /** Seek within the CURRENT track to an ayah's offset. A no-op for another surah. */
  seekToVerse: (verse: number) => Promise<void>;
  /** Stop, save the listening position, and release the track. */
  stop: () => Promise<void>;
  /**
   * Sign-out teardown (`lib/accountTeardown.ts`). Destroys the playlist and clears the
   * lock-screen controls — the engine host never unmounts, so without this the native player and
   * its now-playing card survive a sign-out and keep saving progress into the NEXT account.
   */
  abandonPlayback: () => Promise<void>;
}

interface RecitationStore extends RecitationState, EngineActions {
  setTrack: (surah: number, reciterId: string, highlightAvailable: boolean) => void;
  setActiveVerse: (verse: number | null) => void;
  setPlaybackState: (state: PlaybackState) => void;
  setError: (errorKey: PlaybackErrorKey | null) => void;
  /** Back to idle, keeping nothing. The engine calls this after `stop`. */
  clearPlayback: () => void;
  registerEngineActions: (actions: EngineActions) => void;
}

const inertEngineActions: EngineActions = {
  playSurah: async () => {},
  pause: async () => {},
  resume: async () => {},
  seekToVerse: async () => {},
  stop: async () => {},
  abandonPlayback: async () => {},
};

const idleState: RecitationState = {
  reciterId: null,
  surah: null,
  activeVerseKey: null,
  highlightAvailable: false,
  playbackState: 'idle',
  errorKey: null,
};

export const useAudioPlayerStore = create<RecitationStore>((set) => ({
  ...idleState,
  ...inertEngineActions,

  setTrack: (surah, reciterId, highlightAvailable) =>
    // The key is cleared on a track change: the previous surah's ayah must never linger over the
    // new one's text for the frames before the first tick of the new track arrives.
    set({ surah, reciterId, highlightAvailable, activeVerseKey: null, errorKey: null }),

  setActiveVerse: (verse) =>
    set((s) => ({
      activeVerseKey:
        verse === null || s.surah === null || !s.highlightAvailable ? null : `${s.surah}:${verse}`,
    })),

  setPlaybackState: (playbackState) => set({ playbackState }),

  // An error state keeps the track: the retry the surface offers needs to know what failed.
  setError: (errorKey) => set({ errorKey, playbackState: errorKey ? 'error' : 'idle' }),

  clearPlayback: () => set({ ...idleState }),

  registerEngineActions: (actions) => set(actions),
}));

/**
 * The highlight subscription — the ONE field both reading surfaces read, so a tick that does not
 * change the ayah re-renders nothing anywhere.
 */
export function useActiveVerseKey(): string | null {
  return useAudioPlayerStore((s) => s.activeVerseKey);
}

/** Playback status for a control that draws play vs pause. Never includes the per-tick key. */
export function usePlaybackStatus() {
  return useAudioPlayerStore(
    useShallow((s) => ({
      playbackState: s.playbackState,
      surah: s.surah,
      errorKey: s.errorKey,
    }))
  );
}

/** Stable action references — selecting these never re-renders on a tick. */
export function usePlaybackControls() {
  return useAudioPlayerStore(
    useShallow((s) => ({
      playSurah: s.playSurah,
      pause: s.pause,
      resume: s.resume,
      seekToVerse: s.seekToVerse,
      stop: s.stop,
    }))
  );
}
