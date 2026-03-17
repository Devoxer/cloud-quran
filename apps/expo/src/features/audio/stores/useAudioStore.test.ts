jest.mock('@/services/audio', () => ({
  audioService: {
    play: jest.fn().mockResolvedValue(undefined),
    pause: jest.fn(),
    loadTrack: jest.fn().mockResolvedValue(undefined),
    setPlaybackSpeed: jest.fn().mockResolvedValue(undefined),
    dispose: jest.fn(),
    onStatusUpdate: jest.fn(),
    getCurrentPositionMs: jest.fn(() => 0),
    seekToPosition: jest.fn().mockResolvedValue(undefined),
    setLockScreenActive: jest.fn(),
    updateLockScreenInfo: jest.fn(),
    onRemoteCommand: jest.fn(),
  },
}));

jest.mock('@/services/mmkv', () => ({
  mmkvStorage: {
    setItem: jest.fn(),
    getItem: jest.fn(() => null),
    removeItem: jest.fn(),
  },
}));

jest.mock('@/services/audio-timing', () => ({
  audioTimingService: {
    getVerseTimings: jest.fn().mockResolvedValue([]),
  },
  findActiveVerse: jest.fn(() => null),
  VerseTiming: {},
}));

const mockGetLocalAudioUri = jest.fn().mockResolvedValue(null);
const mockCacheStreamedAudio = jest.fn().mockResolvedValue(undefined);
jest.mock('@/services/audio-download', () => ({
  audioDownloadService: {
    getLocalAudioUri: (...args: unknown[]) => mockGetLocalAudioUri(...args),
    cacheStreamedAudio: (...args: unknown[]) => mockCacheStreamedAudio(...args),
    isDownloaded: jest.fn().mockResolvedValue(false),
    downloadSurah: jest.fn().mockResolvedValue(null),
    deleteSurah: jest.fn().mockResolvedValue(undefined),
    deleteReciter: jest.fn().mockResolvedValue(undefined),
    ensureDirectoryExists: jest.fn().mockResolvedValue(undefined),
    getStorageUsage: jest.fn().mockResolvedValue(0),
  },
}));

const mockMarkAsCached = jest.fn();
jest.mock('@/features/audio/stores/useDownloadStore', () => ({
  useDownloadStore: {
    getState: () => ({
      markAsCached: mockMarkAsCached,
    }),
  },
}));

jest.mock('expo-asset', () => ({
  Asset: {
    fromModule: jest.fn(() => ({ uri: 'file:///mock-artwork.png' })),
  },
}));

const mockNavigateToVerse = jest.fn();
jest.mock('@/theme/useUIStore', () => ({
  useUIStore: {
    getState: () => ({
      navigateToVerse: mockNavigateToVerse,
    }),
  },
}));

import {
  useAudioStore,
  getNextVerseKey,
  getPreviousVerseKey,
} from './useAudioStore';
import { audioService } from '@/services/audio';
import { audioTimingService, findActiveVerse } from '@/services/audio-timing';

const mockedAudioService = audioService as jest.Mocked<typeof audioService>;
const mockedTimingService = audioTimingService as jest.Mocked<typeof audioTimingService>;
const mockedFindActiveVerse = findActiveVerse as jest.MockedFunction<typeof findActiveVerse>;

// Capture the status callback registered during store creation (before clearAllMocks)
const statusCallback = (mockedAudioService as any).onStatusUpdate.mock.calls[0]?.[0] as
  | ((s: { isPlaying: boolean; isBuffering: boolean; positionMs: number; durationMs: number }) => void)
  | undefined;

// Capture the remote command handler registered during store creation
const remoteCommandHandler = (mockedAudioService as any).onRemoteCommand.mock.calls[0]?.[0] as
  | ((command: 'play' | 'pause' | 'next' | 'previous') => void)
  | undefined;

describe('useAudioStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAudioStore.setState({
      isPlaying: false,
      isBuffering: false,
      positionMs: 0,
      durationMs: 0,
      error: null,
      currentSurah: null,
      currentVerseKey: null,
      selectedReciterId: 'alafasy',
      playbackSpeed: 1.0,
      continuousPlayback: true,
      activeVerseKey: null,
      verseTimings: [],
      wasInterrupted: false,
      interruptedAtMs: 0,
      interruptedAtTimestamp: 0,
      sleepTimerMinutes: null,
      sleepTimerEndTime: null,
      sleepTimerRemainingMs: null,
    });
  });

  describe('initial state', () => {
    it('has correct default values', () => {
      const state = useAudioStore.getState();
      expect(state.isPlaying).toBe(false);
      expect(state.isBuffering).toBe(false);
      expect(state.positionMs).toBe(0);
      expect(state.durationMs).toBe(0);
      expect(state.currentSurah).toBeNull();
      expect(state.currentVerseKey).toBeNull();
      expect(state.selectedReciterId).toBe('alafasy');
      expect(state.playbackSpeed).toBe(1.0);
      expect(state.error).toBeNull();
      expect(state.continuousPlayback).toBe(true);
      expect(state.activeVerseKey).toBeNull();
      expect(state.verseTimings).toEqual([]);
      expect(state.wasInterrupted).toBe(false);
      expect(state.interruptedAtMs).toBe(0);
      expect(state.interruptedAtTimestamp).toBe(0);
    });
  });

  describe('play', () => {
    it('loads track and starts playback', async () => {
      await useAudioStore.getState().play(1);
      expect(mockedAudioService.loadTrack).toHaveBeenCalledWith(
        'https://cdn.nobleachievements.com/audio/alafasy/001.mp3',
        { surahNumber: 1, reciterId: 'alafasy' },
      );
      expect(mockedAudioService.play).toHaveBeenCalled();
    });

    it('sets currentSurah and currentVerseKey', async () => {
      await useAudioStore.getState().play(36);
      const state = useAudioStore.getState();
      expect(state.currentSurah).toBe(36);
      expect(state.currentVerseKey).toBe('36:1');
    });

    it('uses provided reciterId over default', async () => {
      await useAudioStore.getState().play(1, 'sudais');
      expect(mockedAudioService.loadTrack).toHaveBeenCalledWith(
        'https://cdn.nobleachievements.com/audio/sudais/001.mp3',
        { surahNumber: 1, reciterId: 'sudais' },
      );
    });

    it('sets playback speed after loading', async () => {
      useAudioStore.setState({ playbackSpeed: 1.5 });
      await useAudioStore.getState().play(1);
      expect(mockedAudioService.setPlaybackSpeed).toHaveBeenCalledWith(1.5);
    });

    it('sets offline-no-audio error when streaming fails without local file (preserves surah)', async () => {
      (mockedAudioService.loadTrack as jest.Mock).mockRejectedValueOnce(new Error('Network error'));
      await useAudioStore.getState().play(1);
      const state = useAudioStore.getState();
      expect(state.error).toBe('offline-no-audio');
      expect(state.currentSurah).toBe(1);
      expect(state.currentVerseKey).toBe('1:1');
      expect(state.isPlaying).toBe(false);
    });

    it('clears error on successful play', async () => {
      useAudioStore.setState({ error: 'Previous error' });
      await useAudioStore.getState().play(1);
      expect(useAudioStore.getState().error).toBeNull();
    });

    it('activates lock screen with metadata after play', async () => {
      await useAudioStore.getState().play(1);
      expect(mockedAudioService.setLockScreenActive).toHaveBeenCalledWith(
        true,
        expect.objectContaining({
          title: expect.stringContaining('Surah Al-Fatihah'),
          artist: 'Mishary Rashid Al-Afasy',
          albumTitle: 'Cloud Quran',
        }),
      );
    });

    it('pauses previous audio before loading new track', async () => {
      const callOrder: string[] = [];
      (mockedAudioService.pause as jest.Mock).mockImplementation(() => {
        callOrder.push('pause');
      });
      (mockedAudioService.loadTrack as jest.Mock).mockImplementation(() => {
        callOrder.push('loadTrack');
        return Promise.resolve();
      });

      await useAudioStore.getState().play(1);

      expect(mockedAudioService.pause).toHaveBeenCalled();
      expect(callOrder.indexOf('pause')).toBeLessThan(callOrder.indexOf('loadTrack'));
    });

    it('seeks to startVerseKey after timings load', async () => {
      const sampleTimings = [
        { verseKey: '1:1', timestampFrom: 0, timestampTo: 5000 },
        { verseKey: '1:4', timestampFrom: 15000, timestampTo: 20000 },
        { verseKey: '1:7', timestampFrom: 30000, timestampTo: 35000 },
      ];
      mockedTimingService.getVerseTimings.mockResolvedValueOnce(sampleTimings);

      await useAudioStore.getState().play(1, undefined, '1:4');

      // Flush fire-and-forget timing promise
      await Promise.resolve();

      expect(mockedAudioService.seekToPosition).toHaveBeenCalledWith(15000);
      expect(useAudioStore.getState().activeVerseKey).toBe('1:4');
    });

    it('does not seek when startVerseKey is not provided', async () => {
      const sampleTimings = [
        { verseKey: '1:1', timestampFrom: 0, timestampTo: 5000 },
      ];
      mockedTimingService.getVerseTimings.mockResolvedValueOnce(sampleTimings);

      await useAudioStore.getState().play(1);

      await Promise.resolve();

      expect(mockedAudioService.seekToPosition).not.toHaveBeenCalled();
    });

    it('clears wasInterrupted on play start', async () => {
      useAudioStore.setState({ wasInterrupted: true, interruptedAtMs: 5000 });
      await useAudioStore.getState().play(1);
      const state = useAudioStore.getState();
      expect(state.wasInterrupted).toBe(false);
      expect(state.interruptedAtMs).toBe(0);
    });
  });

  describe('pause', () => {
    it('calls audioService.pause', () => {
      useAudioStore.getState().pause();
      expect(mockedAudioService.pause).toHaveBeenCalled();
    });
  });

  describe('resume', () => {
    it('calls audioService.play', async () => {
      await useAudioStore.getState().resume();
      expect(mockedAudioService.play).toHaveBeenCalled();
    });
  });

  describe('seekToVerse', () => {
    const sampleTimings = [
      { verseKey: '1:1', timestampFrom: 0, timestampTo: 5000 },
      { verseKey: '1:2', timestampFrom: 5000, timestampTo: 12000 },
      { verseKey: '1:3', timestampFrom: 12000, timestampTo: 16000 },
    ];

    it('seeks to the verse timing position', async () => {
      useAudioStore.setState({ verseTimings: sampleTimings });
      await useAudioStore.getState().seekToVerse('1:2');
      expect(mockedAudioService.seekToPosition).toHaveBeenCalledWith(5000);
      const state = useAudioStore.getState();
      expect(state.activeVerseKey).toBe('1:2');
      expect(state.currentVerseKey).toBe('1:2');
    });

    it('does nothing when verse is not found in timings', async () => {
      useAudioStore.setState({ verseTimings: sampleTimings });
      await useAudioStore.getState().seekToVerse('99:1');
      expect(mockedAudioService.seekToPosition).not.toHaveBeenCalled();
    });

    it('does nothing when timings are empty', async () => {
      useAudioStore.setState({ verseTimings: [] });
      await useAudioStore.getState().seekToVerse('1:1');
      expect(mockedAudioService.seekToPosition).not.toHaveBeenCalled();
    });

    it('updates lock screen metadata after seeking', async () => {
      useAudioStore.setState({
        verseTimings: sampleTimings,
        currentSurah: 1,
        selectedReciterId: 'alafasy',
      });
      await useAudioStore.getState().seekToVerse('1:2');
      expect(mockedAudioService.updateLockScreenInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining('Al-Fatihah'),
          artist: 'Mishary Rashid Al-Afasy',
          albumTitle: 'Cloud Quran',
        }),
      );
    });
  });

  describe('setReciter', () => {
    it('updates selectedReciterId', () => {
      useAudioStore.getState().setReciter('sudais');
      expect(useAudioStore.getState().selectedReciterId).toBe('sudais');
    });

    it('restarts playback if audio is playing', async () => {
      useAudioStore.setState({ currentSurah: 2, isPlaying: true });
      (mockedAudioService.loadTrack as jest.Mock).mockClear();
      useAudioStore.getState().setReciter('sudais');
      // play() is async — flush promise chain for getLocalAudioUri + loadTrack
      await Promise.resolve();
      await Promise.resolve();
      expect(mockedAudioService.loadTrack).toHaveBeenCalledWith(
        'https://cdn.nobleachievements.com/audio/sudais/002.mp3',
        { surahNumber: 2, reciterId: 'sudais' },
      );
    });

    it('pauses previous audio before starting new audio on reciter switch', async () => {
      useAudioStore.setState({ currentSurah: 2, isPlaying: true });
      const callOrder: string[] = [];
      (mockedAudioService.pause as jest.Mock).mockImplementation(() => {
        callOrder.push('pause');
      });
      (mockedAudioService.loadTrack as jest.Mock).mockImplementation(() => {
        callOrder.push('loadTrack');
        return Promise.resolve();
      });

      useAudioStore.getState().setReciter('sudais');
      // Flush async play() chain
      await Promise.resolve();
      await Promise.resolve();

      expect(mockedAudioService.pause).toHaveBeenCalled();
      expect(callOrder.indexOf('pause')).toBeLessThan(callOrder.indexOf('loadTrack'));
    });

    it('does not restart if not playing', () => {
      useAudioStore.setState({ currentSurah: 2, isPlaying: false });
      (mockedAudioService.loadTrack as jest.Mock).mockClear();
      useAudioStore.getState().setReciter('sudais');
      expect(mockedAudioService.loadTrack).not.toHaveBeenCalled();
    });
  });

  describe('setSpeed', () => {
    it('updates playbackSpeed state', () => {
      useAudioStore.getState().setSpeed(1.5);
      expect(useAudioStore.getState().playbackSpeed).toBe(1.5);
    });

    it('applies speed immediately if playing', () => {
      useAudioStore.setState({ isPlaying: true });
      useAudioStore.getState().setSpeed(2.0);
      expect(mockedAudioService.setPlaybackSpeed).toHaveBeenCalledWith(2.0);
    });

    it('does not apply speed immediately if not playing', () => {
      useAudioStore.setState({ isPlaying: false });
      (mockedAudioService.setPlaybackSpeed as jest.Mock).mockClear();
      useAudioStore.getState().setSpeed(2.0);
      expect(mockedAudioService.setPlaybackSpeed).not.toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    it('disposes audio service and resets state including highlighting', () => {
      useAudioStore.setState({
        isPlaying: true,
        currentSurah: 5,
        currentVerseKey: '5:10',
        activeVerseKey: '5:10',
        verseTimings: [{ verseKey: '5:1', timestampFrom: 0, timestampTo: 5000 }],
        positionMs: 5000,
        durationMs: 60000,
        wasInterrupted: true,
        interruptedAtMs: 3000,
      });
      useAudioStore.getState().stop();
      expect(mockedAudioService.dispose).toHaveBeenCalled();
      const state = useAudioStore.getState();
      expect(state.isPlaying).toBe(false);
      expect(state.isBuffering).toBe(false);
      expect(state.positionMs).toBe(0);
      expect(state.durationMs).toBe(0);
      expect(state.currentSurah).toBeNull();
      expect(state.currentVerseKey).toBeNull();
      expect(state.activeVerseKey).toBeNull();
      expect(state.verseTimings).toEqual([]);
      expect(state.error).toBeNull();
      expect(state.wasInterrupted).toBe(false);
      expect(state.interruptedAtMs).toBe(0);
      expect(state.interruptedAtTimestamp).toBe(0);
    });
  });

  describe('status listener', () => {
    it('registers onStatusUpdate listener on creation', () => {
      expect(statusCallback).toBeDefined();
    });

    it('status listener updates transient state', () => {
      statusCallback!({
        isPlaying: true,
        isBuffering: false,
        positionMs: 5000,
        durationMs: 120000,
      });
      const state = useAudioStore.getState();
      expect(state.isPlaying).toBe(true);
      expect(state.positionMs).toBe(5000);
      expect(state.durationMs).toBe(120000);
    });
  });

  describe('verse highlighting', () => {
    const sampleTimings = [
      { verseKey: '1:1', timestampFrom: 0, timestampTo: 5000 },
      { verseKey: '1:2', timestampFrom: 5000, timestampTo: 12000 },
      { verseKey: '1:3', timestampFrom: 12000, timestampTo: 16000 },
    ];

    it('fetches verse timings on play (non-blocking)', async () => {
      mockedTimingService.getVerseTimings.mockResolvedValueOnce(sampleTimings);
      await useAudioStore.getState().play(1);
      // Audio plays before timing fetch — verify play was called
      expect(mockedAudioService.play).toHaveBeenCalled();
      expect(mockedTimingService.getVerseTimings).toHaveBeenCalledWith(1, 'alafasy');
      // Flush fire-and-forget timing promise
      await Promise.resolve();
      expect(useAudioStore.getState().verseTimings).toEqual(sampleTimings);
    });

    it('clears activeVerseKey and verseTimings on play start', async () => {
      useAudioStore.setState({ activeVerseKey: '2:5', verseTimings: sampleTimings });
      mockedTimingService.getVerseTimings.mockResolvedValueOnce([]);
      await useAudioStore.getState().play(1);
      expect(useAudioStore.getState().activeVerseKey).toBeNull();
    });

    it('updates activeVerseKey when status listener fires with matching position', () => {
      useAudioStore.setState({
        verseTimings: sampleTimings,
        isPlaying: true,
        currentSurah: 1,
      });
      mockedFindActiveVerse.mockReturnValueOnce('1:2');

      statusCallback!({
        isPlaying: true,
        isBuffering: false,
        positionMs: 7000,
        durationMs: 16000,
      });

      const state = useAudioStore.getState();
      expect(state.activeVerseKey).toBe('1:2');
      expect(state.currentVerseKey).toBe('1:2');
    });

    it('updates lock screen metadata when verse changes', () => {
      useAudioStore.setState({
        verseTimings: sampleTimings,
        isPlaying: true,
        currentSurah: 1,
        activeVerseKey: '1:1',
        selectedReciterId: 'alafasy',
      });
      mockedFindActiveVerse.mockReturnValueOnce('1:2');

      statusCallback!({
        isPlaying: true,
        isBuffering: false,
        positionMs: 7000,
        durationMs: 16000,
      });

      expect(mockedAudioService.updateLockScreenInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining('Al-Fatihah'),
          artist: 'Mishary Rashid Al-Afasy',
          albumTitle: 'Cloud Quran',
        }),
      );
    });

    it('does not update activeVerseKey when same verse is active', () => {
      useAudioStore.setState({
        verseTimings: sampleTimings,
        isPlaying: true,
        activeVerseKey: '1:2',
        currentVerseKey: '1:2',
      });
      mockedFindActiveVerse.mockReturnValueOnce('1:2');

      statusCallback!({
        isPlaying: true,
        isBuffering: false,
        positionMs: 8000,
        durationMs: 16000,
      });

      // activeVerseKey should remain '1:2' — no unnecessary update
      expect(useAudioStore.getState().activeVerseKey).toBe('1:2');
    });

    it('does not update activeVerseKey when not playing', () => {
      useAudioStore.setState({
        verseTimings: sampleTimings,
        isPlaying: false,
      });

      statusCallback!({
        isPlaying: false,
        isBuffering: false,
        positionMs: 7000,
        durationMs: 16000,
      });

      expect(mockedFindActiveVerse).not.toHaveBeenCalled();
      expect(useAudioStore.getState().activeVerseKey).toBeNull();
    });

    it('does not update activeVerseKey when verseTimings is empty', () => {
      useAudioStore.setState({
        verseTimings: [],
        isPlaying: true,
      });

      statusCallback!({
        isPlaying: true,
        isBuffering: false,
        positionMs: 7000,
        durationMs: 16000,
      });

      expect(mockedFindActiveVerse).not.toHaveBeenCalled();
      expect(useAudioStore.getState().activeVerseKey).toBeNull();
    });

    it('clears highlighting state on error during play', async () => {
      (mockedAudioService.loadTrack as jest.Mock).mockRejectedValueOnce(new Error('fail'));
      await useAudioStore.getState().play(1);
      const state = useAudioStore.getState();
      expect(state.activeVerseKey).toBeNull();
      expect(state.verseTimings).toEqual([]);
    });
  });

  describe('interruption handling', () => {
    const sampleTimings = [
      { verseKey: '1:1', timestampFrom: 0, timestampTo: 5000 },
      { verseKey: '1:2', timestampFrom: 5000, timestampTo: 12000 },
      { verseKey: '1:3', timestampFrom: 12000, timestampTo: 16000 },
    ];

    it('sets wasInterrupted when playback stops without explicit pause', () => {
      const now = 1000000;
      jest.spyOn(Date, 'now').mockReturnValue(now);

      useAudioStore.setState({
        isPlaying: true,
        positionMs: 7000,
      });

      // External interruption (e.g., phone call) — isPlaying goes false without user calling pause()
      statusCallback!({
        isPlaying: false,
        isBuffering: false,
        positionMs: 7000,
        durationMs: 16000,
      });

      const state = useAudioStore.getState();
      expect(state.wasInterrupted).toBe(true);
      expect(state.interruptedAtMs).toBe(7000);
      expect(state.interruptedAtTimestamp).toBe(now);
      jest.restoreAllMocks();
    });

    it('does NOT set wasInterrupted when user explicitly pauses', () => {
      useAudioStore.setState({
        isPlaying: true,
        positionMs: 7000,
      });

      // User explicitly pauses
      useAudioStore.getState().pause();

      statusCallback!({
        isPlaying: false,
        isBuffering: false,
        positionMs: 7000,
        durationMs: 16000,
      });

      expect(useAudioStore.getState().wasInterrupted).toBe(false);
    });

    it('snaps to verse boundary on resume after prolonged interruption', () => {
      const interruptTime = 1000000;
      jest.spyOn(Date, 'now').mockReturnValue(interruptTime + 10000);

      useAudioStore.setState({
        isPlaying: false,
        wasInterrupted: true,
        interruptedAtMs: 7000,
        interruptedAtTimestamp: interruptTime,
        verseTimings: sampleTimings,
      });
      mockedFindActiveVerse.mockReturnValueOnce('1:2');

      // Audio resumes (OS returns focus after phone call)
      statusCallback!({
        isPlaying: true,
        isBuffering: false,
        positionMs: 7000,
        durationMs: 16000,
      });

      expect(mockedAudioService.seekToPosition).toHaveBeenCalledWith(5000);
      const state = useAudioStore.getState();
      expect(state.wasInterrupted).toBe(false);
      expect(state.interruptedAtMs).toBe(0);
      jest.restoreAllMocks();
    });

    it('does NOT snap to verse boundary on resume after short interruption', () => {
      const interruptTime = 1000000;
      jest.spyOn(Date, 'now').mockReturnValue(interruptTime + 2000);

      useAudioStore.setState({
        isPlaying: false,
        wasInterrupted: true,
        interruptedAtMs: 7000,
        interruptedAtTimestamp: interruptTime,
        verseTimings: sampleTimings,
      });

      statusCallback!({
        isPlaying: true,
        isBuffering: false,
        positionMs: 7000,
        durationMs: 16000,
      });

      expect(mockedAudioService.seekToPosition).not.toHaveBeenCalled();
      const state = useAudioStore.getState();
      expect(state.wasInterrupted).toBe(false);
      jest.restoreAllMocks();
    });
  });

  describe('continuous playback', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('has continuousPlayback enabled by default', () => {
      expect(useAudioStore.getState().continuousPlayback).toBe(true);
    });

    it('auto-advances to next surah when current surah ends naturally', async () => {
      useAudioStore.setState({
        isPlaying: true,
        currentSurah: 1,
        currentVerseKey: '1:7',
        continuousPlayback: true,
        wasInterrupted: false,
      });

      // Simulate natural end: position at duration, isPlaying goes false
      statusCallback!({
        isPlaying: false,
        isBuffering: false,
        positionMs: 40000,
        durationMs: 40000,
      });

      // The auto-advance is in setTimeout(0), play() is async
      await jest.runAllTimersAsync();

      expect(mockedAudioService.loadTrack).toHaveBeenCalled();
      expect(mockNavigateToVerse).toHaveBeenCalledWith(2, 1);
    });

    it('does NOT auto-advance when at surah 114', () => {
      useAudioStore.setState({
        isPlaying: true,
        currentSurah: 114,
        currentVerseKey: '114:6',
        continuousPlayback: true,
        wasInterrupted: false,
      });

      statusCallback!({
        isPlaying: false,
        isBuffering: false,
        positionMs: 20000,
        durationMs: 20000,
      });

      jest.runAllTimers();

      expect(mockedAudioService.loadTrack).not.toHaveBeenCalled();
      expect(mockNavigateToVerse).not.toHaveBeenCalled();
    });

    it('does NOT auto-advance when user explicitly paused', () => {
      useAudioStore.setState({
        isPlaying: true,
        currentSurah: 1,
        currentVerseKey: '1:7',
        continuousPlayback: true,
      });

      // User explicitly pauses
      useAudioStore.getState().pause();

      statusCallback!({
        isPlaying: false,
        isBuffering: false,
        positionMs: 40000,
        durationMs: 40000,
      });

      jest.runAllTimers();

      // loadTrack should not have been called for auto-advance
      // (pause calls audioService.pause, not loadTrack)
      expect(mockedAudioService.loadTrack).not.toHaveBeenCalled();
    });

    it('does NOT auto-advance when wasInterrupted is true', () => {
      useAudioStore.setState({
        isPlaying: true,
        currentSurah: 1,
        currentVerseKey: '1:7',
        continuousPlayback: true,
        wasInterrupted: true,
      });

      statusCallback!({
        isPlaying: false,
        isBuffering: false,
        positionMs: 40000,
        durationMs: 40000,
      });

      jest.runAllTimers();

      expect(mockedAudioService.loadTrack).not.toHaveBeenCalled();
    });

    it('does NOT auto-advance when continuousPlayback is false', () => {
      useAudioStore.setState({
        isPlaying: true,
        currentSurah: 1,
        currentVerseKey: '1:7',
        continuousPlayback: false,
        wasInterrupted: false,
      });

      statusCallback!({
        isPlaying: false,
        isBuffering: false,
        positionMs: 40000,
        durationMs: 40000,
      });

      jest.runAllTimers();

      expect(mockedAudioService.loadTrack).not.toHaveBeenCalled();
    });

    it('does NOT auto-advance when position is far from duration (mid-track stop)', () => {
      useAudioStore.setState({
        isPlaying: true,
        currentSurah: 1,
        currentVerseKey: '1:3',
        continuousPlayback: true,
        wasInterrupted: false,
      });

      // Position is only at 7000ms out of 40000ms — not near end
      statusCallback!({
        isPlaying: false,
        isBuffering: false,
        positionMs: 7000,
        durationMs: 40000,
      });

      jest.runAllTimers();

      expect(mockedAudioService.loadTrack).not.toHaveBeenCalled();
    });
  });

  describe('resumePlayback', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('resumes from persisted surah and seeks to persisted verse', async () => {
      const sampleTimings = [
        { verseKey: '2:1', timestampFrom: 0, timestampTo: 5000 },
        { verseKey: '2:142', timestampFrom: 50000, timestampTo: 55000 },
      ];
      mockedTimingService.getVerseTimings.mockResolvedValueOnce(sampleTimings);

      useAudioStore.setState({
        currentSurah: 2,
        currentVerseKey: '2:142',
        selectedReciterId: 'alafasy',
      });

      await useAudioStore.getState().resumePlayback();

      expect(mockedAudioService.loadTrack).toHaveBeenCalledWith(
        'https://cdn.nobleachievements.com/audio/alafasy/002.mp3',
        { surahNumber: 2, reciterId: 'alafasy' },
      );
      expect(mockedAudioService.play).toHaveBeenCalled();

      // Flush the fire-and-forget timing promise so verseTimings are set
      await Promise.resolve();

      // Run the checkTimings polling timer
      jest.runAllTimers();

      // Now seekToPosition should have been called for verse 2:142
      expect(mockedAudioService.seekToPosition).toHaveBeenCalledWith(50000);
    });

    it('does nothing when currentSurah is null', async () => {
      useAudioStore.setState({ currentSurah: null });
      await useAudioStore.getState().resumePlayback();
      expect(mockedAudioService.loadTrack).not.toHaveBeenCalled();
    });

    it('does not seek when already at verse 1', async () => {
      mockedTimingService.getVerseTimings.mockResolvedValueOnce([]);
      useAudioStore.setState({
        currentSurah: 1,
        currentVerseKey: '1:1',
        selectedReciterId: 'alafasy',
      });

      await useAudioStore.getState().resumePlayback();

      // play was called but no seek since we're at verse 1
      expect(mockedAudioService.play).toHaveBeenCalled();
      expect(mockedAudioService.seekToPosition).not.toHaveBeenCalled();
    });
  });

  describe('remote commands', () => {
    it('registers onRemoteCommand handler on creation', () => {
      expect(remoteCommandHandler).toBeDefined();
    });

    it('play command calls resume', () => {
      remoteCommandHandler!('play');
      expect(mockedAudioService.play).toHaveBeenCalled();
    });

    it('pause command calls pause', () => {
      remoteCommandHandler!('pause');
      expect(mockedAudioService.pause).toHaveBeenCalled();
    });

    it('next command seeks to next verse', () => {
      useAudioStore.setState({
        activeVerseKey: '1:1',
        verseTimings: [
          { verseKey: '1:1', timestampFrom: 0, timestampTo: 5000 },
          { verseKey: '1:2', timestampFrom: 5000, timestampTo: 12000 },
        ],
      });

      remoteCommandHandler!('next');
      expect(mockedAudioService.seekToPosition).toHaveBeenCalledWith(5000);
    });

    it('previous command seeks to previous verse', () => {
      useAudioStore.setState({
        activeVerseKey: '1:2',
        verseTimings: [
          { verseKey: '1:1', timestampFrom: 0, timestampTo: 5000 },
          { verseKey: '1:2', timestampFrom: 5000, timestampTo: 12000 },
        ],
      });

      remoteCommandHandler!('previous');
      expect(mockedAudioService.seekToPosition).toHaveBeenCalledWith(0);
    });

    it('next command does nothing at last verse', () => {
      useAudioStore.setState({
        activeVerseKey: '1:2',
        verseTimings: [
          { verseKey: '1:1', timestampFrom: 0, timestampTo: 5000 },
          { verseKey: '1:2', timestampFrom: 5000, timestampTo: 12000 },
        ],
      });

      remoteCommandHandler!('next');
      expect(mockedAudioService.seekToPosition).not.toHaveBeenCalled();
    });

    it('previous command does nothing at first verse', () => {
      useAudioStore.setState({
        activeVerseKey: '1:1',
        verseTimings: [
          { verseKey: '1:1', timestampFrom: 0, timestampTo: 5000 },
          { verseKey: '1:2', timestampFrom: 5000, timestampTo: 12000 },
        ],
      });

      remoteCommandHandler!('previous');
      expect(mockedAudioService.seekToPosition).not.toHaveBeenCalled();
    });
  });

  describe('local-first playback', () => {
    it('uses local URI when downloaded audio exists', async () => {
      mockGetLocalAudioUri.mockResolvedValueOnce('file:///local/audio/alafasy/001.mp3');
      await useAudioStore.getState().play(1);
      expect(mockedAudioService.loadTrack).toHaveBeenCalledWith(
        'file:///local/audio/alafasy/001.mp3',
        { surahNumber: 1, reciterId: 'alafasy' },
      );
    });

    it('falls back to CDN URL when no local file exists', async () => {
      mockGetLocalAudioUri.mockResolvedValueOnce(null);
      await useAudioStore.getState().play(1);
      expect(mockedAudioService.loadTrack).toHaveBeenCalledWith(
        'https://cdn.nobleachievements.com/audio/alafasy/001.mp3',
        { surahNumber: 1, reciterId: 'alafasy' },
      );
    });

    it('sets offline-no-audio error when stream fails without local file', async () => {
      mockGetLocalAudioUri.mockResolvedValueOnce(null);
      (mockedAudioService.loadTrack as jest.Mock).mockRejectedValueOnce(new Error('Network error'));
      await useAudioStore.getState().play(1);
      expect(useAudioStore.getState().error).toBe('offline-no-audio');
    });

    it('sets original error message when local file load fails', async () => {
      mockGetLocalAudioUri.mockResolvedValueOnce('file:///local/audio/alafasy/001.mp3');
      (mockedAudioService.loadTrack as jest.Mock).mockRejectedValueOnce(new Error('Corrupt file'));
      await useAudioStore.getState().play(1);
      expect(useAudioStore.getState().error).toBe('Corrupt file');
    });
  });

  describe('stream caching', () => {
    it('caches audio after natural surah end', () => {
      // Reset module-level explicitPause flag from previous tests
      statusCallback!({ isPlaying: false, isBuffering: false, positionMs: 0, durationMs: 0 });
      jest.clearAllMocks();

      useAudioStore.setState({
        isPlaying: true,
        currentSurah: 1,
        selectedReciterId: 'alafasy',
        continuousPlayback: false,
        wasInterrupted: false,
      });

      statusCallback!({
        isPlaying: false,
        isBuffering: false,
        positionMs: 40000,
        durationMs: 40000,
      });

      expect(mockCacheStreamedAudio).toHaveBeenCalledWith('alafasy', 1);
      expect(mockMarkAsCached).toHaveBeenCalledWith('alafasy', 1);
    });

    it('does NOT cache when user explicitly pauses', () => {
      useAudioStore.setState({
        isPlaying: true,
        currentSurah: 1,
        selectedReciterId: 'alafasy',
      });

      useAudioStore.getState().pause();

      statusCallback!({
        isPlaying: false,
        isBuffering: false,
        positionMs: 20000,
        durationMs: 40000,
      });

      expect(mockCacheStreamedAudio).not.toHaveBeenCalled();
    });
  });

  describe('sleep timer', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
      // Ensure sleep timer is cleaned up
      useAudioStore.getState().clearSleepTimer();
    });

    it('sets sleep timer with countdown', () => {
      useAudioStore.getState().setSleepTimer(15);
      const state = useAudioStore.getState();
      expect(state.sleepTimerMinutes).toBe(15);
      expect(state.sleepTimerEndTime).toBeGreaterThan(0);
      expect(state.sleepTimerRemainingMs).toBe(15 * 60000);
    });

    it('decrements remaining time each second', () => {
      useAudioStore.getState().setSleepTimer(15);
      jest.advanceTimersByTime(1000);
      const state = useAudioStore.getState();
      expect(state.sleepTimerRemainingMs).toBeLessThan(15 * 60000);
    });

    it('pauses playback when timer expires', () => {
      useAudioStore.getState().setSleepTimer(1); // 1 minute
      jest.advanceTimersByTime(61000); // past 1 minute
      expect(mockedAudioService.pause).toHaveBeenCalled();
      const state = useAudioStore.getState();
      expect(state.sleepTimerMinutes).toBeNull();
      expect(state.sleepTimerEndTime).toBeNull();
    });

    it('clears sleep timer', () => {
      useAudioStore.getState().setSleepTimer(15);
      useAudioStore.getState().clearSleepTimer();
      const state = useAudioStore.getState();
      expect(state.sleepTimerMinutes).toBeNull();
      expect(state.sleepTimerEndTime).toBeNull();
      expect(state.sleepTimerRemainingMs).toBeNull();
    });

    it('sets end-of-surah sleep mode', () => {
      useAudioStore.getState().setSleepTimer('end-of-surah');
      const state = useAudioStore.getState();
      expect(state.sleepTimerMinutes).toBe('end-of-surah');
      expect(state.sleepTimerEndTime).toBe(-1); // sentinel
    });

    it('clears sleep timer on stop', () => {
      useAudioStore.getState().setSleepTimer(15);
      useAudioStore.getState().stop();
      const state = useAudioStore.getState();
      expect(state.sleepTimerMinutes).toBeNull();
      expect(state.sleepTimerEndTime).toBeNull();
    });
  });
});

describe('getNextVerseKey', () => {
  const timings = [
    { verseKey: '1:1', timestampFrom: 0, timestampTo: 5000 },
    { verseKey: '1:2', timestampFrom: 5000, timestampTo: 12000 },
    { verseKey: '1:3', timestampFrom: 12000, timestampTo: 16000 },
  ];

  it('returns next verse key', () => {
    expect(getNextVerseKey('1:1', timings)).toBe('1:2');
    expect(getNextVerseKey('1:2', timings)).toBe('1:3');
  });

  it('returns null at last verse', () => {
    expect(getNextVerseKey('1:3', timings)).toBeNull();
  });

  it('returns null for unknown verse key', () => {
    expect(getNextVerseKey('99:1', timings)).toBeNull();
  });
});

describe('getPreviousVerseKey', () => {
  const timings = [
    { verseKey: '1:1', timestampFrom: 0, timestampTo: 5000 },
    { verseKey: '1:2', timestampFrom: 5000, timestampTo: 12000 },
    { verseKey: '1:3', timestampFrom: 12000, timestampTo: 16000 },
  ];

  it('returns previous verse key', () => {
    expect(getPreviousVerseKey('1:2', timings)).toBe('1:1');
    expect(getPreviousVerseKey('1:3', timings)).toBe('1:2');
  });

  it('returns null at first verse', () => {
    expect(getPreviousVerseKey('1:1', timings)).toBeNull();
  });

  it('returns null for unknown verse key', () => {
    expect(getPreviousVerseKey('99:1', timings)).toBeNull();
  });
});
