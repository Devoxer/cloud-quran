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

import { clampSpeed, SPEED_DEFAULT } from '@/constants/audio';

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
   * Whether the loaded session began by MOVING the reader — story 7-7's resume answered the saved
   * listening row instead of the verse on screen.
   *
   * ⚠️ IT LIVES ON THE SESSION, NOT ON A SCREEN, AND THAT IS THE POINT. Both reading surfaces
   * write the reading position when playback leaves `playing` (story 7-1: "where you stopped
   * listening is where you resume reading"), which was true of every session that could exist
   * then — audio always started from what was on screen. A resumed session's pair is the AUDIO's,
   * so that write would move the reader somewhere they never went, which 7-7's frozen boundary
   * forbids. The reader can resume from the mushaf's transport and pause on the reading tab, so a
   * per-screen ref would give the other surface the wrong answer. Set once per session start, by
   * `useResumeListening` — the only place that sees both the fallback and the answer — and reset
   * by `clearPlayback` along with the rest of the session, because a session that no longer
   * exists relocated nobody.
   */
  sessionRelocated: boolean;
  /**
   * A translation KEY, never a sentence — the surface renders it.
   *
   * ⚠️ A LITERAL UNION, NOT `string`. The surfaces pass this straight to `t()`, whose key type is
   * generated from the locale files; typing it loosely would let a typo'd key compile and then
   * render as its own raw text to the reader.
   */
  errorKey: PlaybackErrorKey | null;
  /**
   * When the armed sleep timer expires, as an ABSOLUTE wall-clock instant (`Date.now()` ms), or
   * null when no timed sleep is armed.
   *
   * ⚠️ AN INSTANT, NOT A COUNTDOWN, AND THAT IS THE WHOLE DESIGN. A remaining-ms value ticked
   * down by the app stops counting the moment the app is backgrounded — which is precisely when
   * a sleep timer matters, because the reader has put the phone down. A deadline compared
   * against the wall clock survives it: whichever clock notices first (the 100ms status stream
   * that keeps running under background playback, or the 1s interval when nothing is playing)
   * reads the same instant and answers the same way.
   */
  sleepDeadline: number | null;
  /** True when the armed timer is "pause at the end of the CURRENT surah" rather than a duration. */
  sleepEndOfSurah: boolean;
  /**
   * The armed timer's FULL length in ms, or null. Distinct from what is left of it, and both are
   * needed: the countdown renders the remainder, while the control that armed it has to keep
   * showing which option is running — and ten minutes into a 30-minute timer the remainder
   * matches no option at all.
   */
  sleepDurationMs: number | null;
  /**
   * What the countdown label shows, in ms — republished by the engine only when the displayed
   * SECOND moves, never per status tick (`activeVerseKey`'s discipline, same reason: a chrome row
   * that re-rendered ten times a second would be the cost this store exists to avoid).
   */
  sleepRemainingMs: number;
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
  /**
   * The playback rate, 0.5–2.0 (story 7-4).
   *
   * ⚠️ IT IS NOT PART OF `idleState`, AND THAT IS DELIBERATE. Speed is a device preference that
   * outlives every session — a reader who stops the recitation has not asked to go back to 1.0x,
   * and a `clearPlayback` that reset it would leave the store saying 1.0 while MMKV still said
   * 1.5, so the next launch would silently contradict the one before it. The sleep fields ARE in
   * `idleState`, for the opposite reason: a timer armed against a session that no longer exists
   * would fire into the next one.
   */
  speed: number;
  setTrack: (surah: number, reciterId: string, highlightAvailable: boolean) => void;
  setActiveVerse: (verse: number | null) => void;
  setPlaybackState: (state: PlaybackState) => void;
  setError: (errorKey: PlaybackErrorKey | null) => void;
  /** Record how the session about to load began — see `sessionRelocated` (story 7-7). */
  setSessionRelocated: (relocated: boolean) => void;
  /** Set the playback rate. Clamped at the door — see `clampSpeed`. */
  setSpeed: (speed: number) => void;
  /**
   * Arm, replace or cancel the sleep timer. `number` = that many ms from now; `'surah'` = pause
   * at the end of the current surah; `null` = off.
   *
   * ⚠️ ONE SETTER FOR BOTH KINDS, WHICH IS WHAT MAKES A BAD STATE UNREACHABLE. Arming a duration
   * clears end-of-surah and arming end-of-surah clears the deadline, so "30 minutes AND at the
   * end of the surah" — two answers to one question, with no rule for which wins — is not a
   * state the store can be put into by any sequence of presses.
   */
  setSleepTimer: (arg: number | 'surah' | null) => void;
  /** Republish the countdown label's value. The engine's clock owns this; nothing else calls it. */
  setSleepRemaining: (ms: number) => void;
  /** Turn off any sleep timer. `setSleepTimer(null)`, named for the call sites that read better. */
  clearSleepTimer: () => void;
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
  sessionRelocated: false,
  errorKey: null,
  sleepDeadline: null,
  sleepEndOfSurah: false,
  sleepDurationMs: null,
  sleepRemainingMs: 0,
};

export const useAudioPlayerStore = create<RecitationStore>((set) => ({
  ...idleState,
  ...inertEngineActions,
  // See the field's docblock: NOT in `idleState`, so a stop cannot reset the reader's rate.
  speed: SPEED_DEFAULT,

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

  setSessionRelocated: (sessionRelocated) => set({ sessionRelocated }),

  setSpeed: (speed) => set({ speed: clampSpeed(speed) }),

  setSleepTimer: (arg) =>
    set(() => {
      if (arg === 'surah') {
        return {
          sleepEndOfSurah: true,
          sleepDeadline: null,
          sleepDurationMs: null,
          sleepRemainingMs: 0,
        };
      }
      // A non-positive duration is "off", not "already expired": a zero-length timer that armed
      // and then fired would pause the recitation the instant the reader asked for it.
      if (typeof arg === 'number' && arg > 0) {
        // The countdown is seeded HERE rather than waiting for the first clock tick — otherwise
        // the row reads "" for up to a second after a press that was supposed to arm something.
        return {
          sleepEndOfSurah: false,
          sleepDeadline: Date.now() + arg,
          sleepDurationMs: arg,
          sleepRemainingMs: arg,
        };
      }
      return {
        sleepEndOfSurah: false,
        sleepDeadline: null,
        sleepDurationMs: null,
        sleepRemainingMs: 0,
      };
    }),

  setSleepRemaining: (ms) => set({ sleepRemainingMs: Math.max(0, ms) }),

  clearSleepTimer: () =>
    set({
      sleepEndOfSurah: false,
      sleepDeadline: null,
      sleepDurationMs: null,
      sleepRemainingMs: 0,
    }),

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

/**
 * Playback status for a control that draws play vs pause. Never includes the per-tick key.
 *
 * ⚠️ `reciterId` IS THE LOADED TRACK'S VOICE, AND IT IS NOT `preferences.reciterId` (story 7-8's
 * review). The preference is what the NEXT track will use; this is what is playing NOW, and the
 * two disagree for the whole of any track that outlives a preference change — so a mini player
 * reading the preference labels the recitation with a voice nobody is hearing. Same wrong-source
 * class 7-2's review recorded on the picker's same-value guard.
 */
export function usePlaybackStatus() {
  return useAudioPlayerStore(
    useShallow((s) => ({
      playbackState: s.playbackState,
      surah: s.surah,
      reciterId: s.reciterId,
      errorKey: s.errorKey,
    }))
  );
}

/**
 * The playback rate, for the control that sets it and nothing else (story 7-4).
 *
 * ⚠️ THE ENGINE DOES NOT READ IT THROUGH A HOOK. It subscribes to the store imperatively, so a
 * rate change costs one native property assignment and ZERO re-renders of the app root — see
 * `useRecitationEngine`'s "no useState anywhere in here" note.
 */
export function usePlaybackSpeed(): number {
  return useAudioPlayerStore((s) => s.speed);
}

/** What a sleep-timer indicator or control needs. `active` is either kind of timer. */
export interface SleepTimerView {
  active: boolean;
  endOfSurah: boolean;
  /** The armed timer's full length — what a control shows as chosen. Null for end-of-surah. */
  durationMs: number | null;
  /** What is left of it — what a countdown shows. */
  remainingMs: number;
}

/**
 * The sleep-timer subscription — deliberately narrow, and deliberately NOT carrying the deadline.
 *
 * A consumer re-renders on an arm, a cancel and once per second while a duration counts down;
 * never on the ten-per-second position ticks. Handing out `sleepDeadline` as well would add a
 * field that changes at exactly the same moments and tempt a surface into doing its own
 * arithmetic against `Date.now()` — a second clock, disagreeing with the engine's by a frame.
 */
export function useSleepTimer(): SleepTimerView {
  return useAudioPlayerStore(
    useShallow((s) => ({
      active: s.sleepDeadline !== null || s.sleepEndOfSurah,
      endOfSurah: s.sleepEndOfSurah,
      durationMs: s.sleepDurationMs,
      remainingMs: s.sleepRemainingMs,
    }))
  );
}

/** Stable action references for the playback-options sheet (story 7-4). */
export function usePlaybackOptionActions() {
  return useAudioPlayerStore(
    useShallow((s) => ({
      setSpeed: s.setSpeed,
      setSleepTimer: s.setSleepTimer,
      clearSleepTimer: s.clearSleepTimer,
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
