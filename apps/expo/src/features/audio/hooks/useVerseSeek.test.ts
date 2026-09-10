/**
 * `useVerseSeek` — the one seek-or-start rule, now shared by both reading surfaces (story 7-6).
 *
 * ⚠️ WHY THIS FILE EXISTS AT ALL. The branch is four lines, and it was four lines inside
 * `read.tsx` until this story gave the mushaf the same press. A second copy would be two places
 * for the `idle`/`error` guard to drift — and the failure mode of a drifted guard is silent:
 * `seekToVerse` is a documented NO-OP for any surah other than the loaded track, so the reader
 * presses an ayah, nothing plays, and no error is raised anywhere.
 *
 * ⚠️ THE STORE IS DRIVEN THROUGH ITS OWN API, NOT THROUGH `setState`. An earlier cut of this file
 * poked `surah` and `playbackState` in directly, which pins the hook against a shape a TEST
 * invented — so a change to what `setTrack`/`clearPlayback`/`setError` actually write would sail
 * through green. `registerEngineActions` is what the engine host calls at boot, and `setTrack` +
 * `setPlaybackState` are what the engine calls per track, so a case that uses them is asserting
 * against the states the app can really be in.
 */

import { act, renderHook } from '@testing-library/react-native';
import { useAudioPlayerStore } from '@/stores/audioPlayerStore';
import { useVerseSeek } from './useVerseSeek';

const playSurah = jest.fn(async () => {});
const seekToVerse = jest.fn(async () => {});

const store = () => useAudioPlayerStore.getState();

/** A surah loaded as the current track, in a given playback state — the engine's own path. */
function loadTrack(surah: number, playbackState: 'playing' | 'paused') {
  act(() => {
    store().setTrack(surah, 'husary', true);
    store().setPlaybackState(playbackState);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  act(() => {
    store().clearPlayback();
    // Exactly what `RecitationEngineHost` does at boot; before it the actions are inert.
    store().registerEngineActions({
      playSurah,
      seekToVerse,
      pause: async () => {},
      resume: async () => {},
      stop: async () => {},
      abandonPlayback: async () => {},
    });
  });
});

afterEach(() => act(() => store().clearPlayback()));

describe('seek vs start', () => {
  it('SEEKS inside the loaded track when the pressed ayah is in that surah', () => {
    loadTrack(2, 'playing');
    const { result } = renderHook(() => useVerseSeek());
    result.current(2, 255);
    expect(seekToVerse).toHaveBeenCalledWith(255);
    expect(playSurah).not.toHaveBeenCalled();
  });

  it('seeks from PAUSED too — a paused track is still the loaded one', () => {
    loadTrack(2, 'paused');
    const { result } = renderHook(() => useVerseSeek());
    result.current(2, 10);
    expect(seekToVerse).toHaveBeenCalledWith(10);
    expect(playSurah).not.toHaveBeenCalled();
  });

  it('STARTS the other surah rather than seeking into it', () => {
    // MUTATION: drop the surah comparison. `seekToVerse` is a no-op for another surah, so the
    // press would do nothing at all and report no error.
    loadTrack(3, 'playing');
    const { result } = renderHook(() => useVerseSeek());
    result.current(2, 255);
    expect(playSurah).toHaveBeenCalledWith(2, 255);
    expect(seekToVerse).not.toHaveBeenCalled();
  });

  it('starts from idle — nothing has ever played', () => {
    // `clearPlayback()` in `beforeEach` IS the idle state, written by the store itself.
    const { result } = renderHook(() => useVerseSeek());
    result.current(36, 1);
    expect(playSurah).toHaveBeenCalledWith(36, 1);
    expect(seekToVerse).not.toHaveBeenCalled();
  });

  it('starts rather than seeks when the SAME surah is in `idle`', () => {
    // MUTATION: guard on the surah alone. ⚠️ `clearPlayback()` is how the engine returns to idle
    // after a stop, and it drops the track — so this pins that the guard survives the state the
    // store really produces, not one a test invented.
    loadTrack(2, 'playing');
    act(() => store().clearPlayback());
    const { result } = renderHook(() => useVerseSeek());
    result.current(2, 255);
    expect(playSurah).toHaveBeenCalledWith(2, 255);
    expect(seekToVerse).not.toHaveBeenCalled();
  });

  it('starts rather than seeks when the SAME surah is in `error` — the retry path', () => {
    // MUTATION: guard on `idle` only. ⚠️ `setError` KEEPS the track (`surah: 2`) by design, so an
    // errored press would seek into a track that failed to load and the reader would have no way
    // to retry by tapping. Driven through `setError` so that design stays the thing under test.
    loadTrack(2, 'playing');
    act(() => store().setError('player:errors.playFailed'));
    expect(store().surah).toBe(2);
    const { result } = renderHook(() => useVerseSeek());
    result.current(2, 255);
    expect(playSurah).toHaveBeenCalledWith(2, 255);
    expect(seekToVerse).not.toHaveBeenCalled();
  });
});

describe('identity', () => {
  it('is stable across a playback status change — the memo both surfaces depend on', () => {
    // ⚠️ LOAD-BEARING. The callback goes to every `VerseRow` (whose `memo` keeps an ayah change
    // from re-rendering all 286 rows of Al-Baqarah) and into the mushaf's `renderPage`.
    // Subscribing to the status instead of reading it at press time would mint a new callback
    // per status change and defeat both.
    loadTrack(2, 'paused');
    const { result, rerender } = renderHook(() => useVerseSeek());
    const first = result.current;
    act(() => store().setPlaybackState('playing'));
    rerender({});
    expect(result.current).toBe(first);
  });

  it('…and the stable callback still sees the CURRENT status', () => {
    // Anti-vacuity for the case above: a callback frozen with a stale status would also be
    // "stable", and would seek into a track that is no longer loaded.
    loadTrack(2, 'playing');
    const { result, rerender } = renderHook(() => useVerseSeek());
    loadTrack(5, 'playing');
    rerender({});
    result.current(2, 255);
    expect(playSurah).toHaveBeenCalledWith(2, 255);
    expect(seekToVerse).not.toHaveBeenCalled();
  });
});
