const mockPlay = jest.fn();
const mockPause = jest.fn();
const mockSeekTo = jest.fn();
const mockReplace = jest.fn();
const mockAddListener = jest.fn();
const mockRemove = jest.fn();
const mockSetActiveForLockScreen = jest.fn();
const mockUpdateLockScreenMetadata = jest.fn();

let mockPlaybackRate = 1;
const mockSetPlaybackRate = jest.fn((val: number) => {
  mockPlaybackRate = val;
});
const mockPlayer = {
  play: mockPlay,
  pause: mockPause,
  seekTo: mockSeekTo,
  replace: mockReplace,
  addListener: mockAddListener,
  remove: mockRemove,
  setActiveForLockScreen: mockSetActiveForLockScreen,
  updateLockScreenMetadata: mockUpdateLockScreenMetadata,
  setPlaybackRate: mockSetPlaybackRate,
  get playbackRate() {
    return mockPlaybackRate;
  },
};

const mockSetAudioModeAsync = jest.fn().mockResolvedValue(undefined);
const mockCreateAudioPlayer = jest.fn(() => mockPlayer);

jest.mock('expo-audio', () => ({
  __esModule: true,
  createAudioPlayer: (...args: unknown[]) => {
      mockCreateAudioPlayer.apply(null, args);
      return mockPlayer;
    },
  setAudioModeAsync: (opts: unknown) => mockSetAudioModeAsync(opts),
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

// audioService is a singleton — import after mock setup
const { audioService } = require('./audio') as typeof import('./audio');

describe('ExpoAudioService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlaybackRate = 1;
    mockSetPlaybackRate.mockImplementation((val: number) => { mockPlaybackRate = val; });
    audioService.dispose();
  });

  describe('init', () => {
    it('configures audio mode with background playback', async () => {
      await audioService.play();
      expect(mockSetAudioModeAsync).toHaveBeenCalledWith({
        playsInSilentMode: true,
        shouldPlayInBackground: true,
        interruptionMode: 'doNotMix',
      });
    });

    it('creates an audio player', async () => {
      await audioService.play();
      expect(mockCreateAudioPlayer).toHaveBeenCalled();
    });

    it('registers a playbackStatusUpdate listener', async () => {
      await audioService.play();
      expect(mockAddListener).toHaveBeenCalledWith(
        'playbackStatusUpdate',
        expect.any(Function),
      );
    });

    it('only initializes once', async () => {
      await audioService.play();
      await audioService.play();
      expect(mockCreateAudioPlayer).toHaveBeenCalledTimes(1);
    });
  });

  describe('play', () => {
    it('calls player.play()', async () => {
      await audioService.play();
      expect(mockPlay).toHaveBeenCalled();
    });
  });

  describe('pause', () => {
    it('calls player.pause()', async () => {
      await audioService.play();
      await audioService.pause();
      expect(mockPause).toHaveBeenCalled();
    });
  });

  describe('seekToPosition', () => {
    it('converts ms to seconds and calls seekTo', async () => {
      await audioService.play();
      await audioService.seekToPosition(5000);
      expect(mockSeekTo).toHaveBeenCalledWith(5);
    });
  });

  describe('loadTrack', () => {
    it('recreates player with the new source uri', async () => {
      await audioService.loadTrack('https://example.com/audio.mp3');
      // Old player removed, new one created with URI
      expect(mockRemove).toHaveBeenCalled();
      expect(mockCreateAudioPlayer).toHaveBeenLastCalledWith('https://example.com/audio.mp3');
    });

    it('re-registers playbackStatusUpdate listener on new player', async () => {
      await audioService.loadTrack('https://example.com/audio.mp3');
      // init() registers once, loadTrack() should register again on the new player
      const listenerCalls = mockAddListener.mock.calls.filter(
        (c: unknown[]) => c[0] === 'playbackStatusUpdate',
      );
      expect(listenerCalls.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('setPlaybackSpeed', () => {
    it('sets player.playbackRate', async () => {
      await audioService.setPlaybackSpeed(1.5);
      expect(mockPlaybackRate).toBe(1.5);
    });
  });

  describe('getCurrentPositionMs', () => {
    it('returns 0 initially', () => {
      expect(audioService.getCurrentPositionMs()).toBe(0);
    });
  });

  describe('status listener', () => {
    it('forwards playback status updates to registered listener', async () => {
      const listener = jest.fn();
      audioService.onStatusUpdate(listener);
      await audioService.play();

      const statusCallback = mockAddListener.mock.calls[0][1];
      statusCallback({
        playing: true,
        isLoaded: true,
        currentTime: 2.5,
        duration: 120,
      });

      expect(listener).toHaveBeenCalledWith({
        isPlaying: true,
        isBuffering: false,
        positionMs: 2500,
        durationMs: 120000,
      });
    });

    it('reports buffering when not loaded', async () => {
      const listener = jest.fn();
      audioService.onStatusUpdate(listener);
      await audioService.play();

      const statusCallback = mockAddListener.mock.calls[0][1];
      statusCallback({
        playing: false,
        isLoaded: false,
        currentTime: 0,
        duration: 0,
      });

      expect(listener).toHaveBeenCalledWith({
        isPlaying: false,
        isBuffering: true,
        positionMs: 0,
        durationMs: 0,
      });
    });

    it('reports buffering when isLoaded is undefined', async () => {
      const listener = jest.fn();
      audioService.onStatusUpdate(listener);
      await audioService.play();

      const statusCallback = mockAddListener.mock.calls[0][1];
      statusCallback({
        playing: false,
        currentTime: 0,
        duration: 0,
      });

      expect(listener).toHaveBeenCalledWith({
        isPlaying: false,
        isBuffering: true,
        positionMs: 0,
        durationMs: 0,
      });
    });

    it('updates currentPositionMs on status update', async () => {
      audioService.onStatusUpdate(jest.fn());
      await audioService.play();

      const statusCallback = mockAddListener.mock.calls[0][1];
      statusCallback({
        playing: true,
        isLoaded: true,
        currentTime: 10,
        duration: 120,
      });

      expect(audioService.getCurrentPositionMs()).toBe(10000);
    });
  });

  describe('setLockScreenActive', () => {
    it('calls player.setActiveForLockScreen with metadata when active', async () => {
      await audioService.play();
      audioService.setLockScreenActive(true, {
        title: 'Surah Al-Fatihah : 1',
        artist: 'Mishary Rashid Al-Afasy',
        albumTitle: 'Cloud Quran',
        artworkUrl: '/artwork.png',
      });
      expect(mockSetActiveForLockScreen).toHaveBeenCalledWith(true, {
        title: 'Surah Al-Fatihah : 1',
        artist: 'Mishary Rashid Al-Afasy',
        albumTitle: 'Cloud Quran',
        artworkUrl: '/artwork.png',
      });
    });

    it('calls player.setActiveForLockScreen(false) when deactivating', async () => {
      await audioService.play();
      audioService.setLockScreenActive(false);
      expect(mockSetActiveForLockScreen).toHaveBeenCalledWith(false);
    });
  });

  describe('updateLockScreenInfo', () => {
    it('calls player.updateLockScreenMetadata when lock screen is active', async () => {
      await audioService.play();
      audioService.setLockScreenActive(true, {
        title: 'Surah Al-Fatihah : 1',
        artist: 'Mishary Rashid Al-Afasy',
      });
      mockUpdateLockScreenMetadata.mockClear();

      audioService.updateLockScreenInfo({
        title: 'Surah Al-Fatihah : 2',
        artist: 'Mishary Rashid Al-Afasy',
      });
      expect(mockUpdateLockScreenMetadata).toHaveBeenCalledWith({
        title: 'Surah Al-Fatihah : 2',
        artist: 'Mishary Rashid Al-Afasy',
        albumTitle: undefined,
        artworkUrl: undefined,
      });
    });

    it('does not update when lock screen is not active', async () => {
      await audioService.play();
      audioService.updateLockScreenInfo({
        title: 'Surah Al-Fatihah : 1',
        artist: 'Mishary Rashid Al-Afasy',
      });
      expect(mockUpdateLockScreenMetadata).not.toHaveBeenCalled();
    });
  });

  describe('onRemoteCommand', () => {
    it('stores the remote command handler without invoking it', () => {
      const handler = jest.fn();
      audioService.onRemoteCommand(handler);
      expect(handler).not.toHaveBeenCalled();
    });

    it('clears remote command handler on dispose', () => {
      const handler = jest.fn();
      audioService.onRemoteCommand(handler);
      audioService.dispose();
      // After dispose, a new handler can be registered
      const newHandler = jest.fn();
      audioService.onRemoteCommand(newHandler);
      expect(newHandler).not.toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    it('removes the player', async () => {
      await audioService.play();
      audioService.dispose();
      expect(mockRemove).toHaveBeenCalled();
    });

    it('resets position to 0', async () => {
      audioService.onStatusUpdate(jest.fn());
      await audioService.play();

      const statusCallback = mockAddListener.mock.calls[0][1];
      statusCallback({
        playing: true,
        isLoaded: true,
        currentTime: 10,
        duration: 120,
      });

      audioService.dispose();
      expect(audioService.getCurrentPositionMs()).toBe(0);
    });

    it('allows re-initialization after dispose', async () => {
      await audioService.play();
      audioService.dispose();
      mockCreateAudioPlayer.mockClear();
      await audioService.play();
      expect(mockCreateAudioPlayer).toHaveBeenCalledTimes(1);
    });

    it('deactivates lock screen on dispose', async () => {
      await audioService.play();
      audioService.setLockScreenActive(true, {
        title: 'test',
        artist: 'test',
      });
      mockSetActiveForLockScreen.mockClear();
      audioService.dispose();
      expect(mockSetActiveForLockScreen).toHaveBeenCalledWith(false);
    });
  });
});

describe('Web MediaSession', () => {
  let webService: any;
  const mockSetActionHandler = jest.fn();
  let storedMetadata: any = null;

  beforeEach(() => {
    jest.resetModules();

    const mockMediaSession = {
      get metadata() {
        return storedMetadata;
      },
      set metadata(val: any) {
        storedMetadata = val;
      },
      setActionHandler: mockSetActionHandler,
    };
    (global as any).navigator = { mediaSession: mockMediaSession };
    (global as any).MediaMetadata = class {
      title: string;
      artist: string;
      album: string;
      artwork: any[];
      constructor(init: any) {
        this.title = init.title;
        this.artist = init.artist;
        this.album = init.album;
        this.artwork = init.artwork;
      }
    };

    jest.doMock('react-native', () => ({ Platform: { OS: 'web' } }));
    jest.doMock('expo-audio', () => ({
      __esModule: true,
      createAudioPlayer: () => ({
        play: jest.fn(),
        pause: jest.fn(),
        seekTo: jest.fn(),
        replace: jest.fn(),
        addListener: jest.fn(),
        remove: jest.fn(),
        playbackRate: 1,
      }),
      setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
    }));

    const mod = require('./audio');
    webService = mod.audioService;
    storedMetadata = null;
    mockSetActionHandler.mockClear();
  });

  afterEach(() => {
    webService.dispose();
    delete (global as any).navigator;
    delete (global as any).MediaMetadata;
  });

  it('sets MediaMetadata when lock screen activated', async () => {
    await webService.play();
    webService.setLockScreenActive(true, {
      title: 'Surah Al-Fatihah : 1',
      artist: 'Mishary Rashid Al-Afasy',
      albumTitle: 'Cloud Quran',
      artworkUrl: '/artwork.png',
    });
    expect(storedMetadata).not.toBeNull();
    expect(storedMetadata.title).toBe('Surah Al-Fatihah : 1');
    expect(storedMetadata.artist).toBe('Mishary Rashid Al-Afasy');
    expect(storedMetadata.album).toBe('Cloud Quran');
  });

  it('clears MediaMetadata when lock screen deactivated', async () => {
    await webService.play();
    webService.setLockScreenActive(true, {
      title: 'Test',
      artist: 'Test',
    });
    webService.setLockScreenActive(false);
    expect(storedMetadata).toBeNull();
  });

  it('updates MediaMetadata on updateLockScreenInfo', async () => {
    await webService.play();
    webService.setLockScreenActive(true, {
      title: 'Surah Al-Fatihah : 1',
      artist: 'Mishary Rashid Al-Afasy',
    });
    webService.updateLockScreenInfo({
      title: 'Surah Al-Fatihah : 2',
      artist: 'Mishary Rashid Al-Afasy',
    });
    expect(storedMetadata.title).toBe('Surah Al-Fatihah : 2');
  });

  it('registers all MediaSession action handlers', () => {
    const handler = jest.fn();
    webService.onRemoteCommand(handler);
    expect(mockSetActionHandler).toHaveBeenCalledWith(
      'play',
      expect.any(Function),
    );
    expect(mockSetActionHandler).toHaveBeenCalledWith(
      'pause',
      expect.any(Function),
    );
    expect(mockSetActionHandler).toHaveBeenCalledWith(
      'nexttrack',
      expect.any(Function),
    );
    expect(mockSetActionHandler).toHaveBeenCalledWith(
      'previoustrack',
      expect.any(Function),
    );
  });

  it('forwards play command to handler', () => {
    const handler = jest.fn();
    webService.onRemoteCommand(handler);
    const playCall = mockSetActionHandler.mock.calls.find(
      (c: any[]) => c[0] === 'play',
    );
    playCall[1]();
    expect(handler).toHaveBeenCalledWith('play');
  });

  it('forwards nexttrack as next command', () => {
    const handler = jest.fn();
    webService.onRemoteCommand(handler);
    const nextCall = mockSetActionHandler.mock.calls.find(
      (c: any[]) => c[0] === 'nexttrack',
    );
    nextCall[1]();
    expect(handler).toHaveBeenCalledWith('next');
  });

  it('forwards previoustrack as previous command', () => {
    const handler = jest.fn();
    webService.onRemoteCommand(handler);
    const prevCall = mockSetActionHandler.mock.calls.find(
      (c: any[]) => c[0] === 'previoustrack',
    );
    prevCall[1]();
    expect(handler).toHaveBeenCalledWith('previous');
  });
});
