/**
 * `stores/audioPlayerStore.ts` — the pure state transitions (story 7-1).
 *
 * The imperative half (`playSurah`, `seekToVerse`, …) is the engine's and is covered in
 * `features/audio/hooks/useRecitationEngine.test.tsx`; here the registered slots are only checked
 * for being inert before boot and replaceable after it.
 */

import { act } from '@testing-library/react-native';

import { useAudioPlayerStore } from './audioPlayerStore';

const reset = () =>
  act(() => {
    useAudioPlayerStore.getState().clearPlayback();
  });

describe('audioPlayerStore — idle', () => {
  beforeEach(reset);

  it('starts with nothing playing and nothing highlighted', () => {
    const s = useAudioPlayerStore.getState();
    expect(s.playbackState).toBe('idle');
    expect(s.surah).toBeNull();
    expect(s.activeVerseKey).toBeNull();
    expect(s.highlightAvailable).toBe(false);
    expect(s.errorKey).toBeNull();
  });

  it('has inert engine actions before the engine registers, not missing ones', async () => {
    // A play control pressed in the first frames must be a no-op, never a crash.
    await expect(useAudioPlayerStore.getState().playSurah(1)).resolves.toBeUndefined();
    await expect(useAudioPlayerStore.getState().abandonPlayback()).resolves.toBeUndefined();
  });
});

describe('audioPlayerStore — the active verse key', () => {
  beforeEach(reset);

  it('composes the key from the CURRENT track, so it can never name another surah', () => {
    act(() => useAudioPlayerStore.getState().setTrack(36, 'husary', true));
    act(() => useAudioPlayerStore.getState().setActiveVerse(12));
    expect(useAudioPlayerStore.getState().activeVerseKey).toBe('36:12');
  });

  /**
   * ⚠️ THE REGRESSION THIS PINS: without clearing on a track change, the OLD surah's ayah stays
   * on screen over the NEW surah's text for every frame between `trackChanged` and the first
   * status tick — a highlight confidently pointing at the wrong verse of the wrong surah.
   */
  it('clears the key on a track change rather than carrying it across', () => {
    act(() => useAudioPlayerStore.getState().setTrack(1, 'husary', true));
    act(() => useAudioPlayerStore.getState().setActiveVerse(7));
    expect(useAudioPlayerStore.getState().activeVerseKey).toBe('1:7');

    act(() => useAudioPlayerStore.getState().setTrack(2, 'husary', true));
    expect(useAudioPlayerStore.getState().activeVerseKey).toBeNull();
  });

  /**
   * ⚠️ MEASURED DATA, NOT A HYPOTHETICAL: `alafasy` publishes 1,088 of 6,236 rows without
   * timings. Highlighting off a partial manifest parks the highlight on an early ayah for the
   * whole track — worse than showing none.
   */
  it('publishes no key at all when the surah is not fully timed', () => {
    act(() => useAudioPlayerStore.getState().setTrack(36, 'alafasy', false));
    act(() => useAudioPlayerStore.getState().setActiveVerse(2));
    expect(useAudioPlayerStore.getState().activeVerseKey).toBeNull();
  });

  it('publishes no key before a track exists', () => {
    act(() => useAudioPlayerStore.getState().setActiveVerse(3));
    expect(useAudioPlayerStore.getState().activeVerseKey).toBeNull();
  });

  it('clears the key when the engine reports no verse', () => {
    act(() => useAudioPlayerStore.getState().setTrack(1, 'husary', true));
    act(() => useAudioPlayerStore.getState().setActiveVerse(3));
    act(() => useAudioPlayerStore.getState().setActiveVerse(null));
    expect(useAudioPlayerStore.getState().activeVerseKey).toBeNull();
  });
});

describe('audioPlayerStore — playback state and errors', () => {
  beforeEach(reset);

  it('moves through the playback states the engine reports', () => {
    for (const state of ['loading', 'playing', 'buffering', 'paused'] as const) {
      act(() => useAudioPlayerStore.getState().setPlaybackState(state));
      expect(useAudioPlayerStore.getState().playbackState).toBe(state);
    }
  });

  it('an error keeps the track, because the retry needs to know what failed', () => {
    act(() => useAudioPlayerStore.getState().setTrack(18, 'husary', true));
    act(() => useAudioPlayerStore.getState().setError('player:errors.playFailed'));

    const s = useAudioPlayerStore.getState();
    expect(s.playbackState).toBe('error');
    expect(s.errorKey).toBe('player:errors.playFailed');
    expect(s.surah).toBe(18);
  });

  it('clearing the error returns to idle', () => {
    act(() => useAudioPlayerStore.getState().setError('player:errors.playFailed'));
    act(() => useAudioPlayerStore.getState().setError(null));
    expect(useAudioPlayerStore.getState().playbackState).toBe('idle');
    expect(useAudioPlayerStore.getState().errorKey).toBeNull();
  });

  it('starting a new track clears a previous error', () => {
    act(() => useAudioPlayerStore.getState().setError('player:errors.playFailed'));
    act(() => useAudioPlayerStore.getState().setTrack(1, 'husary', true));
    expect(useAudioPlayerStore.getState().errorKey).toBeNull();
  });
});

describe('audioPlayerStore — engine registration', () => {
  beforeEach(reset);

  it('replaces the inert slots with the engine ones', async () => {
    const playSurah = jest.fn().mockResolvedValue(undefined);
    act(() =>
      useAudioPlayerStore.getState().registerEngineActions({
        playSurah,
        pause: jest.fn().mockResolvedValue(undefined),
        resume: jest.fn().mockResolvedValue(undefined),
        seekToVerse: jest.fn().mockResolvedValue(undefined),
        stop: jest.fn().mockResolvedValue(undefined),
        abandonPlayback: jest.fn().mockResolvedValue(undefined),
      })
    );

    await useAudioPlayerStore.getState().playSurah(114);
    expect(playSurah).toHaveBeenCalledWith(114);
  });

  /**
   * `lib/accountTeardown.ts` reaches playback through this store rather than through the feature
   * — `lib/ → features/` would be a `lint:layers` violation. That seam must keep existing.
   */
  it('exposes abandonPlayback for account teardown', () => {
    expect(typeof useAudioPlayerStore.getState().abandonPlayback).toBe('function');
  });
});
