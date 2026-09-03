/**
 * useRecitationEngine — the single boot-level recitation engine (story 7-1).
 *
 * Owns everything imperative about playback: the native `AudioPlaylist`, both of its listeners,
 * the post-seek guard, the lock-screen metadata, and the listening-position writes. It registers
 * its async actions into `audioPlayerStore` once at boot, so every consumer selects a stable
 * function reference and nothing re-renders on a status tick.
 *
 * ── The queue is surahs, and that is what buys three acceptance criteria ─────────────────────
 *
 * `playSurah(n)` builds the playlist as surahs **n…114** — one MP3 per track, at most 114 of
 * them. Three behaviours then fall out of the native player rather than out of code here:
 * auto-advance at the end of a surah, an accurate scrubber, and — because the loop mode is
 * `'none'` and 114 is the last entry — **stopping at the end of An-Nas instead of wrapping round
 * to Al-Fatihah**. Advancing an AYAH is never a track change; it is a `seekTo` inside the
 * current track.
 *
 * ⚠️ THE PLAYLIST IS REBUILT ON EVERY `playSurah`, deliberately. The alternative — one 114-track
 * playlist built once and `skipTo`'d — sounds tidier and is worse: `skipTo` across dozens of
 * tracks makes the native player tear down and re-prepare anyway, and it leaves `currentIndex`
 * meaning something different from "how far past the surah we asked for", which is the mapping
 * every other line here depends on. Sources are URLs; building 114 of them is string work.
 *
 * ── The status tick is where highlighting happens ────────────────────────────────────────────
 *
 * ⚠️ `updateInterval` IS PASSED EXPLICITLY. It defaults to 500ms and the criterion is 100ms — at
 * the default a short ayah could be missed almost entirely. The cost is bounded because the tick
 * publishes the verse key only when it CHANGES (`audioPlayerStore`'s note), so ten ticks a second
 * are ten integer comparisons, not ten re-renders of Al-Baqarah.
 *
 * ⚠️ THE PLAYER SPEAKS SECONDS AND THE MANIFEST SPEAKS MILLISECONDS. The conversion happens on
 * the two lines below that touch `currentTime` and `seekTo`, and nowhere else in the app.
 *
 * ── Why no `useState` anywhere in here ───────────────────────────────────────────────────────
 *
 * Every mutable value is a ref, and the host renders `null`. A hook that re-rendered on playback
 * would re-render whatever mounts it — and this mounts at the app root.
 */

import {
  type AudioPlaylist,
  type AudioPlaylistStatus,
  type AudioSource,
  createAudioPlaylist,
  setAudioModeAsync,
} from 'expo-audio';
import { SURAH_COUNT, SURAH_METADATA } from 'quran-data';
import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus, Platform } from 'react-native';

import {
  LOAD_TIMEOUT_MS,
  PLAYLIST_TICK_MS,
  SEEK_GUARD_TIMEOUT_MS,
  surahAudioUrl,
} from '@/constants/audio';
import { addBreadcrumb, captureException } from '@/lib/errors';
import {
  isSurahTimed,
  loadReciterManifest,
  offsetOfVerse,
  type ReciterManifest,
  verseAtMs,
} from '@/lib/reciterManifest';
import { setAudioPosition } from '@/lib/sync';
import { useAudioPlayerStore } from '@/stores/audioPlayerStore';

/**
 * Background playback and lock-screen transport. Best-effort: the OSStatus failures here happen
 * during app-state transitions when the audio session is momentarily unavailable, and the app
 * still plays without it — so a breadcrumb, not a captured error.
 */
async function configureAudioMode(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
    });
  } catch (error) {
    addBreadcrumb('ui', 'configureAudioMode failed; background audio unavailable', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** The tracks for "play from surah n to the end of the book". */
function buildSources(reciterId: string, startSurah: number): AudioSource[] {
  const sources: AudioSource[] = [];
  for (let surah = startSurah; surah <= SURAH_COUNT; surah++) {
    sources.push({
      uri: surahAudioUrl(reciterId, surah),
      // The lock screen reads this per track; the ayah is refreshed separately, mid-track.
      name: SURAH_METADATA[surah - 1]?.nameTransliteration ?? String(surah),
    });
  }
  return sources;
}

/**
 * The post-seek guard.
 *
 * `seekTo` resolves before the native status stream catches up, so the very next tick can still
 * carry the PRE-seek position — which would drag the highlight backwards for one frame, exactly
 * the snap the criterion forbids. Hold the target and drop earlier ticks until one lands at or
 * after it.
 *
 * ⚠️ IT RELEASES ON A TIMER TOO, AND THAT IS NOT BELT-AND-BRACES. If the native side refuses a
 * seek (a track still preparing, a file that never loaded), no qualifying tick ever arrives and
 * an un-released guard would freeze highlighting for the rest of the session — a worse failure
 * than the snap it exists to prevent.
 */
class SeekGuard {
  private targetMs: number | null = null;
  private armedAt = 0;

  arm(targetMs: number, now: number): void {
    this.targetMs = targetMs;
    this.armedAt = now;
  }

  clear(): void {
    this.targetMs = null;
  }

  /** True when this tick is stale and must be ignored. */
  blocks(ms: number, now: number): boolean {
    if (this.targetMs === null) return false;
    if (now - this.armedAt >= SEEK_GUARD_TIMEOUT_MS) {
      this.targetMs = null;
      return false;
    }
    // A small tolerance: the player lands NEAR the requested offset, not exactly on it.
    if (ms + PLAYLIST_TICK_MS >= this.targetMs) {
      this.targetMs = null;
      return false;
    }
    return true;
  }
}

/**
 * @param selectedReciterId The reader's chosen reciter, from their synced preferences. It arrives
 *   as a PARAMETER and is mirrored into a ref rather than into the effect's deps: re-running the
 *   effect on a preference change would rebuild the playlist and re-register the engine actions
 *   in the middle of a listen. Switching voices mid-playback is story 7.2's, and it will drive it
 *   through `playSurah`, not through a remount.
 */
export function useRecitationEngine(selectedReciterId: string): void {
  const playlist = useRef<AudioPlaylist | null>(null);
  const manifest = useRef<ReciterManifest | null>(null);
  const reciterId = useRef<string | null>(selectedReciterId);
  /** The surah at playlist index 0 — `currentIndex + startSurah` is the surah being played. */
  const startSurah = useRef(1);
  const currentSurah = useRef<number | null>(null);
  /** The last ayah the tick derived — what a position write records. */
  const currentVerse = useRef<number | null>(null);
  const guard = useRef(new SeekGuard());
  /** When the playlist last reported progress — the load watchdog's clock. */
  const lastLoadedAt = useRef(0);

  useEffect(() => {
    // SSR / web prerender: `createAudioPlaylist` reaches for `Audio`, which does not exist in
    // Node. Nothing here may run at module scope for the same reason.
    if (typeof window === 'undefined') return;

    const store = useAudioPlayerStore;

    /**
     * Write where the listener got to. NEVER per tick — see this function's callers.
     *
     * ⚠️ AN UNTIMED SURAH SAVES AYAH 1, NOT THE LOOKUP'S ANSWER. `verseAtMs` answers truthfully
     * over whatever windows a partial manifest holds, which for Ya-Sin under `alafasy` (81 of 83
     * rows missing) means "ayah 2" for fifteen minutes. Storing that would make a RESUME land in
     * the wrong place, so the same rule the highlight follows applies here: no confident wrong
     * answer. The surah is known, so "this surah, from the top" is the honest claim.
     */
    const savePosition = () => {
      const surah = currentSurah.current;
      const reciter = reciterId.current;
      if (surah === null || reciter === null) return;
      const timed = store.getState().highlightAvailable;
      const verse = timed ? currentVerse.current : 1;
      if (verse === null) return;
      setAudioPosition({ surah, verse, reciterId: reciter });
    };

    /** Point the store, and the lock screen, at the track the playlist just moved to. */
    const adoptTrack = (index: number) => {
      const surah = startSurah.current + index;
      const reciter = reciterId.current;
      if (!reciter || surah < 1 || surah > SURAH_COUNT) return;
      currentSurah.current = surah;
      currentVerse.current = null;
      guard.current.clear();
      store
        .getState()
        .setTrack(surah, reciter, manifest.current ? isSurahTimed(manifest.current, surah) : false);
    };

    const onStatus = (status: AudioPlaylistStatus) => {
      const player = playlist.current;
      if (!player) return;
      const state = store.getState();

      /**
       * ⚠️ THE END OF THE BOOK, WHICH NO `trackChanged` EVER ANNOUNCES. `loop` is `'none'` and
       * An-Nas is the last entry, so the final track finishing produces a `didJustFinish` and
       * then silence — no track change, no further ticks worth reading. Without this branch the
       * criterion "playback stops and the position is saved — it does not loop to Surah 1" was
       * only half true: it did stop, and it saved nothing.
       */
      if (status.didJustFinish) {
        if (status.currentIndex >= status.trackCount - 1) {
          savePosition();
          state.setPlaybackState('paused');
        }
        /**
         * ⚠️ MID-QUEUE, THE STATE IS LEFT ALONE. A finished track reports `playing: false` for the
         * tick or two before the native player auto-advances and `trackChanged` fires — letting
         * that fall through to the pause branch below flashed a pause glyph on the transport at
         * every single surah boundary.
         */
        return;
      }

      if (status.playing) {
        lastLoadedAt.current = Date.now();
        if (state.playbackState !== 'playing') state.setPlaybackState('playing');
      } else if (state.playbackState === 'playing') {
        state.setPlaybackState(status.isBuffering ? 'buffering' : 'paused');
      } else if (state.playbackState === 'loading' || state.playbackState === 'buffering') {
        /**
         * ⚠️ A TRACK THAT NEVER LOADS HAS NO EVENT OF ITS OWN. `AudioPlaylistStatus` carries no
         * error field, so a 404 or an unplayable file is indistinguishable from a slow network
         * except by how long it lasts. Without this watchdog the store sat at `loading` forever:
         * no error, no retry, and a play button that had visibly done nothing.
         */
        if (status.isLoaded) lastLoadedAt.current = Date.now();
        else if (Date.now() - lastLoadedAt.current > LOAD_TIMEOUT_MS) {
          state.setError('player:errors.playFailed');
          return;
        }
      }

      const surah = currentSurah.current;
      const timings = manifest.current;
      if (surah === null || !timings) return;

      // ⚠️ SECONDS → MILLISECONDS. The only other place this conversion happens is `seekToVerse`.
      const ms = status.currentTime * 1000;
      if (guard.current.blocks(ms, Date.now())) return;

      const verse = verseAtMs(timings, surah, ms);
      if (verse === null || verse === currentVerse.current) return;
      currentVerse.current = verse;
      // THE comparison above is why a 100ms tick is affordable. Below it, once per ayah:
      store.getState().setActiveVerse(verse);
      // ⚠️ MID-TRACK, WHICH IS THE ADAPTATION THE FORKED ENGINE DID NOT HAVE. A conventional
      // player refreshes the lock screen on track change; here the ayah changes many times
      // inside one surah, so the refresh is driven by the timing lookup instead.
      player.updateLockScreenMetadata({
        title: `${SURAH_METADATA[surah - 1]?.nameTransliteration ?? surah} · ${verse}`,
      });
    };

    const onTrackChanged = ({ currentIndex }: { previousIndex: number; currentIndex: number }) => {
      // Save where the FINISHED track got to before adopting the new one — this is one of the
      // four moments a listening position is written.
      savePosition();
      adoptTrack(currentIndex);
    };

    const teardown = () => {
      const player = playlist.current;
      playlist.current = null;
      if (!player) return;
      try {
        player.pause();
        player.clearLockScreenControls();
        player.destroy();
      } catch (error) {
        // The user is leaving or the track is already gone; never let this throw upward.
        addBreadcrumb('ui', 'recitation teardown failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };

    const ensureManifest = async (reciter: string): Promise<ReciterManifest> => {
      if (manifest.current && reciterId.current === reciter) return manifest.current;
      const loaded = await loadReciterManifest(reciter);
      manifest.current = loaded;
      return loaded;
    };

    const actions = {
      playSurah: async (surah: number, verse?: number) => {
        const reciter = reciterId.current;
        if (!reciter) return;
        // A surah outside the book would build an EMPTY source list and hand the store a track
        // that does not exist. `playSurah` is reached from a row press and a page lookup, both of
        // which can be wrong before their own guards run.
        if (!Number.isInteger(surah) || surah < 1 || surah > SURAH_COUNT) return;
        const store_ = store.getState();
        // ⚠️ A SECOND PRESS WHILE THE FIRST IS STILL LOADING WOULD TEAR THE PLAYLIST DOWN AND
        // REBUILD IT — the surah audibly restarts, and the reader's own impatience is what
        // caused it. `loading` is a state a press must bounce off, not one it can re-enter.
        if (store_.playbackState === 'loading') return;
        store_.setPlaybackState('loading');
        lastLoadedAt.current = Date.now();
        try {
          const timings = await ensureManifest(reciter);
          teardown();

          startSurah.current = surah;
          const player = createAudioPlaylist({
            sources: buildSources(reciter, surah),
            updateInterval: PLAYLIST_TICK_MS,
            loop: 'none',
          });
          playlist.current = player;
          player.addListener('playlistStatusUpdate', onStatus);
          player.addListener('trackChanged', onTrackChanged);
          player.setActiveForLockScreen(true);

          currentSurah.current = surah;
          currentVerse.current = null;
          store.getState().setTrack(surah, reciter, isSurahTimed(timings, surah));

          if (verse !== undefined && verse > 1) {
            const offset = offsetOfVerse(timings, surah, verse);
            if (offset !== null) {
              guard.current.arm(offset, Date.now());
              await player.seekTo(offset / 1000);
            }
          }
          player.play();
        } catch (error) {
          captureException(error, { context: 'recitation.playSurah', surah });
          store.getState().setError('player:errors.playFailed');
        }
      },

      pause: async () => {
        playlist.current?.pause();
        store.getState().setPlaybackState('paused');
        savePosition();
      },

      resume: async () => {
        // No track means nothing to resume — reporting `playing` would draw a pause button over
        // silence, which is the one state a transport must never show.
        if (!playlist.current) return;
        playlist.current.play();
        store.getState().setPlaybackState('playing');
      },

      seekToVerse: async (verse: number) => {
        const player = playlist.current;
        const timings = manifest.current;
        const surah = currentSurah.current;
        if (!player || !timings || surah === null) return;
        const offset = offsetOfVerse(timings, surah, verse);
        // An ayah with no window in this reciter's manifest: no seek, playback continues. A seek
        // to 0 "because we could not find it" would restart the surah under the reader.
        if (offset === null) return;
        guard.current.arm(offset, Date.now());
        // The highlight moves NOW rather than on the next qualifying tick — a tap that takes
        // 300ms to show anything reads as a tap that did not register.
        currentVerse.current = verse;
        store.getState().setActiveVerse(verse);
        try {
          await player.seekTo(offset / 1000);
          // ⚠️ AND PLAY, WHICH THE FIRST CUT DID NOT. The criterion is "playback RESUMES at that
          // verse's offset"; a reader who pauses, then taps a different ayah, was getting a moved
          // highlight and silence — a tap that looks like it half-worked.
          if (store.getState().playbackState !== 'playing') {
            player.play();
            store.getState().setPlaybackState('playing');
          }
        } catch (error) {
          guard.current.clear();
          captureException(error, { context: 'recitation.seekToVerse', surah, verse });
        }
      },

      stop: async () => {
        savePosition();
        teardown();
        currentSurah.current = null;
        currentVerse.current = null;
        store.getState().clearPlayback();
      },

      abandonPlayback: async () => {
        teardown();
        currentSurah.current = null;
        currentVerse.current = null;
        /**
         * ⚠️ THE RECITER AND ITS MANIFEST SURVIVE, AND THE FIRST CUT KILLED BOTH. Nulling
         * `reciterId` here made recitation permanently dead after a sign-out: the only writer is
         * the preference effect below, which early-returns unless the preference VALUE moves — and
         * with one shipped default it never does — so every later `playSurah` hit `if (!reciter)`
         * and returned silently until the app was relaunched. Neither is account-scoped anyway: a
         * manifest is public immutable data, and the reciter is re-supplied by the host on the
         * next render.
         */
        store.getState().clearPlayback();
      },
    };

    store.getState().registerEngineActions(actions);
    void configureAudioMode();

    // Backgrounding is the fourth moment a position is written: a listener who swipes the app
    // away never presses pause, and the process can be killed without another event.
    const onAppState = (next: AppStateStatus) => {
      if (next !== 'active') savePosition();
    };
    const subscription = AppState.addEventListener('change', onAppState);

    return () => {
      subscription.remove();
      teardown();
    };
  }, []);

  /**
   * The preference can resolve after boot (a first launch that then syncs) or change later. The
   * cached manifest goes with it — it belongs to the old voice.
   *
   * ⚠️ AND ANY PLAYING TRACK IS STOPPED, because this is not always a user action. The value comes
   * from `usePreferences()`, so a background sync pull can move it mid-listen; dropping the
   * manifest alone left the OLD reciter's audio playing with highlighting silently dead (the tick
   * returns early on `!timings`) until the next `playSurah`. Stopping is honest and saves the
   * position on the way out. Switching voices mid-playback while KEEPING the position is story
   * 7.2's, and it will drive it through `playSurah`.
   */
  useEffect(() => {
    if (reciterId.current === selectedReciterId) return;
    reciterId.current = selectedReciterId;
    manifest.current = null;
    if (useAudioPlayerStore.getState().surah !== null) {
      void useAudioPlayerStore.getState().stop();
    }
  }, [selectedReciterId]);
}
