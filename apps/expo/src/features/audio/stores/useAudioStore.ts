import { Asset } from 'expo-asset';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { SURAH_COUNT } from 'quran-data';

import { mmkvStorage } from '@/services/mmkv';
import { audioService } from '@/services/audio';
import { audioDownloadService } from '@/services/audio-download';
import { buildAudioUrl } from '@/features/audio/utils/audioUrlBuilder';
import { formatNowPlayingTitle } from '@/features/audio/utils/formatNowPlaying';
import { RECITERS } from '@/features/audio/data/reciters';
import {
  audioTimingService,
  findActiveVerse,
  VerseTiming,
} from '@/services/audio-timing';
import { useUIStore } from '@/theme/useUIStore';
import { useDownloadStore } from '@/features/audio/stores/useDownloadStore';

export function getNextVerseKey(
  currentKey: string,
  timings: VerseTiming[],
): string | null {
  const idx = timings.findIndex((t) => t.verseKey === currentKey);
  if (idx < 0 || idx >= timings.length - 1) return null;
  return timings[idx + 1].verseKey;
}

export function getPreviousVerseKey(
  currentKey: string,
  timings: VerseTiming[],
): string | null {
  const idx = timings.findIndex((t) => t.verseKey === currentKey);
  if (idx <= 0) return null;
  return timings[idx - 1].verseKey;
}

function getReciterName(reciterId: string): string {
  return (
    RECITERS.find((r) => r.id === reciterId)?.nameEnglish ?? reciterId
  );
}

let cachedArtworkUrl: string | undefined | null = null;
function resolveArtworkUrl(): string | undefined {
  if (cachedArtworkUrl !== null) return cachedArtworkUrl;
  try {
    const asset = Asset.fromModule(
      require('../../../../assets/audio-artwork.png'),
    );
    cachedArtworkUrl = asset.uri ?? undefined;
    return cachedArtworkUrl;
  } catch (e) {
    console.warn('Failed to resolve audio artwork:', e);
    cachedArtworkUrl = undefined;
    return undefined;
  }
}

interface AudioState {
  // Playback state (NOT persisted — transient)
  isPlaying: boolean;
  isBuffering: boolean;
  positionMs: number;
  durationMs: number;
  error: string | null;
  // Highlighting state (transient — NOT persisted)
  // activeVerseKey is mode-agnostic: both Reading Mode and Mushaf Mode read from it
  activeVerseKey: string | null;
  verseTimings: VerseTiming[];
  // Interruption recovery (transient — NOT persisted)
  wasInterrupted: boolean;
  interruptedAtMs: number;
  interruptedAtTimestamp: number;
  // Sleep timer state (transient — NOT persisted)
  sleepTimerMinutes: number | 'end-of-surah' | null;
  sleepTimerEndTime: number | null;
  sleepTimerRemainingMs: number | null;
  // Track state (persisted)
  currentSurah: number | null;
  currentVerseKey: string | null;
  selectedReciterId: string;
  playbackSpeed: number;
  continuousPlayback: boolean;
  // Actions
  play: (surah: number, reciterId?: string, startVerseKey?: string) => Promise<void>;
  pause: () => void;
  resume: () => Promise<void>;
  resumePlayback: () => Promise<void>;
  seekToVerse: (verseKey: string) => Promise<void>;
  setReciter: (reciterId: string) => void;
  setSpeed: (speed: number) => void;
  setSleepTimer: (minutes: number | 'end-of-surah') => void;
  clearSleepTimer: () => void;
  stop: () => void;
}

// Track whether pause was explicitly called by the user
let explicitPause = false;
// Sleep timer interval handle (module-level for cleanup)
let sleepTimerInterval: ReturnType<typeof setInterval> | null = null;
// Flag for end-of-surah sleep: pause at natural surah end instead of auto-advancing
let sleepEndOfSurah = false;

export const useAudioStore = create<AudioState>()(
  persist(
    (set, get) => {
      // Wire up status listener once
      audioService.onStatusUpdate((status) => {
        const state = get();
        const updates: Partial<AudioState> = {
          isPlaying: status.isPlaying,
          isBuffering: status.isBuffering,
          positionMs: status.positionMs,
          durationMs: status.durationMs,
        };

        // Surah end detection: natural track completion triggers auto-advance
        const isNaturalEnd =
          !status.isPlaying &&
          state.isPlaying &&
          !explicitPause &&
          !state.wasInterrupted &&
          status.durationMs > 0 &&
          status.positionMs >= status.durationMs - 500;

        // Cache streamed audio in background after natural surah end
        if (isNaturalEnd && state.currentSurah !== null) {
          const rid = state.selectedReciterId;
          const surah = state.currentSurah;
          audioDownloadService.cacheStreamedAudio(rid, surah).catch(() => {});
          useDownloadStore.getState().markAsCached(rid, surah);
        }

        if (isNaturalEnd && sleepEndOfSurah) {
          // Sleep timer set to "end of surah" — pause instead of auto-advancing
          get().clearSleepTimer();
          return;
        }

        if (isNaturalEnd && state.continuousPlayback && state.currentSurah !== null && state.currentSurah < SURAH_COUNT) {
          const nextSurah = state.currentSurah + 1;
          setTimeout(() => {
            get().play(nextSurah);
            useUIStore.getState().navigateToVerse(nextSurah, 1);
          }, 0);
        }

        // Interruption detection: isPlaying went false but user didn't call pause()
        // Skip marking as interrupted if this is a natural surah end
        if (!status.isPlaying && state.isPlaying && !explicitPause && !isNaturalEnd) {
          updates.wasInterrupted = true;
          updates.interruptedAtMs = status.positionMs;
          updates.interruptedAtTimestamp = Date.now();
        }

        // Interruption recovery: isPlaying resumed after interruption
        if (
          status.isPlaying &&
          !state.isPlaying &&
          state.wasInterrupted
        ) {
          updates.wasInterrupted = false;
          updates.interruptedAtMs = 0;
          updates.interruptedAtTimestamp = 0;
          // Only snap to verse boundary for prolonged interruptions (e.g. phone call),
          // not for quick lock screen pause/resume (< 5s)
          const INTERRUPTION_THRESHOLD_MS = 5000;
          if (
            Date.now() - state.interruptedAtTimestamp >
              INTERRUPTION_THRESHOLD_MS &&
            state.verseTimings.length > 0
          ) {
            const nearestVerse = findActiveVerse(
              state.verseTimings,
              state.interruptedAtMs,
            );
            if (nearestVerse) {
              const timing = state.verseTimings.find(
                (t) => t.verseKey === nearestVerse,
              );
              if (timing) {
                audioService.seekToPosition(timing.timestampFrom);
                updates.activeVerseKey = nearestVerse;
                updates.currentVerseKey = nearestVerse;
              }
            }
          }
        }

        // Reset explicit pause flag when status update is processed
        if (!status.isPlaying) {
          explicitPause = false;
        }

        // Update active verse from timing data when playing
        if (status.isPlaying && state.verseTimings.length > 0) {
          const newVerse = findActiveVerse(
            state.verseTimings,
            status.positionMs,
          );
          if (newVerse && newVerse !== state.activeVerseKey) {
            updates.activeVerseKey = newVerse;
            updates.currentVerseKey = newVerse;
            // Update lock screen metadata with new verse info
            const surah = state.currentSurah;
            if (surah) {
              const reciterName = getReciterName(state.selectedReciterId);
              audioService.updateLockScreenInfo({
                title: formatNowPlayingTitle(surah, newVerse, reciterName),
                artist: reciterName,
                albumTitle: 'Cloud Quran',
                artworkUrl: resolveArtworkUrl(),
              });
            }
          }
        }

        set(updates);
      });

      // Register remote command handler
      audioService.onRemoteCommand((command) => {
        const state = get();
        switch (command) {
          case 'play':
            state.resume();
            break;
          case 'pause':
            state.pause();
            break;
          case 'next': {
            const nextKey = state.activeVerseKey
              ? getNextVerseKey(state.activeVerseKey, state.verseTimings)
              : null;
            if (nextKey) state.seekToVerse(nextKey);
            break;
          }
          case 'previous': {
            const prevKey = state.activeVerseKey
              ? getPreviousVerseKey(
                  state.activeVerseKey,
                  state.verseTimings,
                )
              : null;
            if (prevKey) state.seekToVerse(prevKey);
            break;
          }
        }
      });

      return {
        // Transient state
        isPlaying: false,
        isBuffering: false,
        positionMs: 0,
        durationMs: 0,
        error: null,
        activeVerseKey: null,
        verseTimings: [],
        wasInterrupted: false,
        interruptedAtMs: 0,
        interruptedAtTimestamp: 0,
        // Sleep timer state (transient)
        sleepTimerMinutes: null,
        sleepTimerEndTime: null,
        sleepTimerRemainingMs: null,
        // Persisted state
        currentSurah: null,
        currentVerseKey: null,
        selectedReciterId: 'alafasy',
        playbackSpeed: 1.0,
        continuousPlayback: true,

        play: async (surah, reciterId?, startVerseKey?) => {
          const rid = reciterId ?? get().selectedReciterId;
          // LOCAL-FIRST: Check for downloaded/cached audio before streaming
          const localUri = await audioDownloadService.getLocalAudioUri(rid, surah);
          const url = localUri ?? buildAudioUrl(rid, surah);
          // Pause immediately to stop audio output, then loadTrack() handles
          // removing the old player. Using pause() instead of dispose() avoids
          // the async re-init gap that caused ~2s of overlap on reciter switch.
          audioService.pause();
          set({
            currentSurah: surah,
            currentVerseKey: `${surah}:1`,
            activeVerseKey: null,
            verseTimings: [],
            error: null,
            wasInterrupted: false,
            interruptedAtMs: 0,
            interruptedAtTimestamp: 0,
          });
          try {
            await audioService.loadTrack(url, {
              surahNumber: surah,
              reciterId: rid,
            });
            await audioService.setPlaybackSpeed(get().playbackSpeed);

            const reciterName = getReciterName(rid);
            const artworkUrl = resolveArtworkUrl();
            const displayVerseKey = startVerseKey ?? `${surah}:1`;

            if (startVerseKey) {
              // When starting from a specific verse, fetch timings and seek
              // BEFORE playing to avoid hearing the beginning of the surah
              const timings = await audioTimingService.getVerseTimings(surah, rid);
              set({ verseTimings: timings });
              if (timings.length > 0) {
                const timing = timings.find((t) => t.verseKey === startVerseKey);
                if (timing) {
                  await audioService.seekToPosition(timing.timestampFrom);
                  set({ activeVerseKey: startVerseKey, currentVerseKey: startVerseKey });
                }
              }
            }

            await audioService.play();

            // Activate lock screen controls (non-blocking)
            audioService.setLockScreenActive(true, {
              title: formatNowPlayingTitle(surah, displayVerseKey, reciterName),
              artist: reciterName,
              albumTitle: 'Cloud Quran',
              artworkUrl,
            });

            if (!startVerseKey) {
              // No specific start verse — fetch timings in background
              audioTimingService.getVerseTimings(surah, rid).then((timings) => {
                set({ verseTimings: timings });
              });
            }
          } catch (e) {
            console.error('[Audio] play() failed:', e);
            // When no local file exists, any load failure (network, server, etc.)
            // triggers the offline download toast — the actionable fix is the same
            // regardless of error type. When a local file fails, show the actual error.
            const hasLocalFile = !!localUri;
            const errorMsg = hasLocalFile
              ? (e instanceof Error ? e.message : 'Failed to load audio')
              : 'offline-no-audio';
            set({
              error: errorMsg,
              isPlaying: false,
              isBuffering: false,
              currentSurah: hasLocalFile ? null : surah,
              currentVerseKey: hasLocalFile ? null : `${surah}:1`,
              activeVerseKey: null,
              verseTimings: [],
            });
          }
        },

        pause: () => {
          explicitPause = true;
          audioService.pause();
        },

        resume: async () => {
          await audioService.play();
        },

        resumePlayback: async () => {
          const { currentSurah, currentVerseKey, selectedReciterId } = get();
          if (!currentSurah) return;
          // play() with startVerseKey fetches timings and seeks before playing
          await get().play(currentSurah, selectedReciterId, currentVerseKey ?? undefined);
        },

        seekToVerse: async (verseKey) => {
          const { verseTimings, currentSurah, selectedReciterId } = get();
          const timing = verseTimings.find((t) => t.verseKey === verseKey);
          if (!timing) return;
          await audioService.seekToPosition(timing.timestampFrom);
          set({
            activeVerseKey: verseKey,
            currentVerseKey: verseKey,
          });
          // Update lock screen metadata for the new verse
          if (currentSurah) {
            const reciterName = getReciterName(selectedReciterId);
            audioService.updateLockScreenInfo({
              title: formatNowPlayingTitle(
                currentSurah,
                verseKey,
                reciterName,
              ),
              artist: reciterName,
              albumTitle: 'Cloud Quran',
              artworkUrl: resolveArtworkUrl(),
            });
          }
        },

        setReciter: (reciterId) => {
          const { currentSurah, isPlaying, activeVerseKey, currentVerseKey } = get();
          set({ selectedReciterId: reciterId });
          if (currentSurah && isPlaying) {
            // Preserve current verse position when switching reciters
            const verseKey = activeVerseKey ?? currentVerseKey ?? undefined;
            get().play(currentSurah, reciterId, verseKey).catch(() => {
              // Error state is set inside play()
            });
          }
        },

        setSpeed: (speed) => {
          set({ playbackSpeed: speed });
          if (get().isPlaying) {
            audioService.setPlaybackSpeed(speed);
          }
        },

        setSleepTimer: (minutes) => {
          // Clear any existing timer
          if (sleepTimerInterval) clearInterval(sleepTimerInterval);
          sleepEndOfSurah = false;

          if (minutes === 'end-of-surah') {
            sleepEndOfSurah = true;
            set({
              sleepTimerMinutes: 'end-of-surah',
              sleepTimerEndTime: -1, // Sentinel: active but no countdown
              sleepTimerRemainingMs: null,
            });
            return;
          }

          const endTime = Date.now() + minutes * 60000;
          set({
            sleepTimerMinutes: minutes,
            sleepTimerEndTime: endTime,
            sleepTimerRemainingMs: minutes * 60000,
          });

          sleepTimerInterval = setInterval(() => {
            const remaining = endTime - Date.now();
            if (remaining <= 0) {
              get().clearSleepTimer();
              get().pause();
            } else {
              set({ sleepTimerRemainingMs: remaining });
            }
          }, 1000);
        },

        clearSleepTimer: () => {
          if (sleepTimerInterval) {
            clearInterval(sleepTimerInterval);
            sleepTimerInterval = null;
          }
          sleepEndOfSurah = false;
          set({
            sleepTimerMinutes: null,
            sleepTimerEndTime: null,
            sleepTimerRemainingMs: null,
          });
        },

        stop: () => {
          // Clear sleep timer on stop
          if (sleepTimerInterval) {
            clearInterval(sleepTimerInterval);
            sleepTimerInterval = null;
          }
          sleepEndOfSurah = false;
          // Pause first to stop audio output immediately, then dispose the player
          audioService.pause();
          audioService.dispose();
          set({
            isPlaying: false,
            isBuffering: false,
            positionMs: 0,
            durationMs: 0,
            error: null,
            currentSurah: null,
            currentVerseKey: null,
            activeVerseKey: null,
            verseTimings: [],
            wasInterrupted: false,
            interruptedAtMs: 0,
            interruptedAtTimestamp: 0,
            sleepTimerMinutes: null,
            sleepTimerEndTime: null,
            sleepTimerRemainingMs: null,
          });
        },
      };
    },
    {
      name: 'audio-state',
      storage: createJSONStorage(() => mmkvStorage),
      partialize: (state) => ({
        currentSurah: state.currentSurah,
        currentVerseKey: state.currentVerseKey,
        selectedReciterId: state.selectedReciterId,
        playbackSpeed: state.playbackSpeed,
        continuousPlayback: state.continuousPlayback,
      }),
    },
  ),
);
