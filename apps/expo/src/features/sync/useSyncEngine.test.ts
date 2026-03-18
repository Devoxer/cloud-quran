// Mock react-native-mmkv
jest.mock('react-native-mmkv', () => ({
  createMMKV: () => ({
    set: jest.fn(),
    getString: jest.fn(() => undefined),
    remove: jest.fn(),
    getBoolean: () => false,
  }),
}));

// Mock react hooks — capture effect callbacks for testing
const mockCapturedEffects: Array<{ fn: () => (() => void) | void; deps: unknown[] }> = [];
jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useEffect: (fn: () => (() => void) | void, deps: unknown[]) => {
    mockCapturedEffects.push({ fn, deps });
  },
  useRef: (val: unknown) => ({ current: val ?? [] }),
}));

// Auth store mock
let mockIsAuthenticated = false;
jest.mock('@/features/auth/useAuthStore', () => {
  const store = (selector: (s: { isAuthenticated: boolean }) => unknown) =>
    selector({ isAuthenticated: mockIsAuthenticated });
  store.getState = () => ({ isAuthenticated: mockIsAuthenticated });
  store.subscribe = jest.fn(() => jest.fn());
  return { useAuthStore: store };
});

// UI store mock
const mockUIState = {
  currentSurah: 2,
  currentVerse: 142,
  currentMode: 'reading' as const,
  lastReadTimestamp: Date.now(),
  fontSize: 30,
  autoFollowAudio: true,
  tapToSeek: false,
};
jest.mock('@/theme/useUIStore', () => {
  const store = (selector: (s: typeof mockUIState) => unknown) => selector(mockUIState);
  store.getState = () => mockUIState;
  store.subscribe = jest.fn(() => jest.fn());
  return { useUIStore: store };
});

// Bookmark store mock
const mockBookmarks = [
  { surahNumber: 1, verseNumber: 1, createdAt: 1000 },
  { surahNumber: 2, verseNumber: 255, createdAt: 2000 },
];
jest.mock('@/features/bookmarks/useBookmarkStore', () => {
  const store = (selector: (s: { bookmarks: typeof mockBookmarks }) => unknown) =>
    selector({ bookmarks: mockBookmarks });
  store.getState = () => ({ bookmarks: mockBookmarks });
  store.subscribe = jest.fn(() => jest.fn());
  return { useBookmarkStore: store };
});

// Audio store mock
const mockAudioState = {
  selectedReciterId: 'alafasy',
  playbackSpeed: 1.0,
  continuousPlayback: true,
};
jest.mock('@/features/audio/stores/useAudioStore', () => {
  const store = (selector: (s: typeof mockAudioState) => unknown) => selector(mockAudioState);
  store.getState = () => mockAudioState;
  store.subscribe = jest.fn(() => jest.fn());
  return { useAudioStore: store };
});

// API mock
const mockPost = jest.fn().mockResolvedValue({ ok: true, status: 200 });
jest.mock('@/services/api', () => ({
  api: {
    api: {
      sync: {
        push: {
          $post: (...args: unknown[]) => mockPost(...args),
        },
      },
    },
  },
}));

import { collectPayload, debouncedSync, syncToCloud, useSyncEngine, setMerging, getLastPushAt } from './useSyncEngine';
import { useUIStore } from '@/theme/useUIStore';
import { useBookmarkStore } from '@/features/bookmarks/useBookmarkStore';
import { useAudioStore } from '@/features/audio/stores/useAudioStore';

describe('useSyncEngine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockIsAuthenticated = false;
    mockCapturedEffects.length = 0;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('collectPayload', () => {
    test('collects data from all stores in correct format', () => {
      const payload = collectPayload();

      expect(payload.position).toEqual({
        currentSurah: 2,
        currentVerse: 142,
        currentMode: 'reading',
        lastReadTimestamp: mockUIState.lastReadTimestamp,
      });
      expect(payload.bookmarks).toEqual(mockBookmarks);
      expect(payload.preferences).toEqual({
        fontSize: 30,
        autoFollowAudio: true,
        tapToSeek: false,
      });
      expect(payload.audio).toEqual({
        selectedReciterId: 'alafasy',
        playbackSpeed: 1.0,
        continuousPlayback: true,
      });
    });
  });

  describe('syncToCloud', () => {
    test('does not call API when not authenticated', async () => {
      mockIsAuthenticated = false;
      await syncToCloud();
      expect(mockPost).not.toHaveBeenCalled();
    });

    test('calls API with payload when authenticated', async () => {
      mockIsAuthenticated = true;
      await syncToCloud();
      expect(mockPost).toHaveBeenCalledWith(
        expect.objectContaining({
          json: expect.objectContaining({
            position: expect.objectContaining({
              currentSurah: 2,
              currentVerse: 142,
            }),
          }),
        }),
      );
    });

    test('does not throw on API failure', async () => {
      mockIsAuthenticated = true;
      mockPost.mockRejectedValueOnce(new Error('Network error'));
      await expect(syncToCloud()).resolves.not.toThrow();
    });

    test('updates lastPushAt on successful push', async () => {
      mockIsAuthenticated = true;
      const before = Date.now();
      await syncToCloud();
      expect(getLastPushAt()).toBeGreaterThanOrEqual(before);
    });
  });

  describe('debouncedSync', () => {
    test('does not trigger when not authenticated', () => {
      mockIsAuthenticated = false;
      debouncedSync();
      jest.advanceTimersByTime(3000);
      expect(mockPost).not.toHaveBeenCalled();
    });

    test('debounces calls by 2 seconds', () => {
      mockIsAuthenticated = true;
      debouncedSync();
      jest.advanceTimersByTime(1000); // Only 1s elapsed
      expect(mockPost).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1500); // Now 2.5s elapsed
      expect(mockPost).toHaveBeenCalledTimes(1);
    });

    test('resets debounce timer on subsequent calls', () => {
      mockIsAuthenticated = true;
      debouncedSync();
      jest.advanceTimersByTime(1500); // 1.5s
      debouncedSync(); // Reset timer
      jest.advanceTimersByTime(1500); // Another 1.5s (3s total, but only 1.5s since reset)
      expect(mockPost).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1000); // Now 2.5s since reset
      expect(mockPost).toHaveBeenCalledTimes(1);
    });

    test('skips sync when isMerging is true', () => {
      mockIsAuthenticated = true;
      setMerging(true);
      debouncedSync();
      jest.advanceTimersByTime(3000);
      expect(mockPost).not.toHaveBeenCalled();
      setMerging(false);
    });
  });

  describe('useSyncEngine hook', () => {
    test('subscribes to all stores when authenticated', () => {
      mockIsAuthenticated = true;
      useSyncEngine();

      // Run captured useEffect
      expect(mockCapturedEffects.length).toBeGreaterThan(0);
      mockCapturedEffects[0].fn();

      expect(useUIStore.subscribe).toHaveBeenCalledWith(expect.any(Function));
      expect(useBookmarkStore.subscribe).toHaveBeenCalledWith(expect.any(Function));
      expect(useAudioStore.subscribe).toHaveBeenCalledWith(expect.any(Function));
    });

    test('does not subscribe when not authenticated', () => {
      mockIsAuthenticated = false;
      useSyncEngine();

      // Run captured useEffect
      expect(mockCapturedEffects.length).toBeGreaterThan(0);
      mockCapturedEffects[0].fn();

      expect(useUIStore.subscribe).not.toHaveBeenCalled();
      expect(useBookmarkStore.subscribe).not.toHaveBeenCalled();
      expect(useAudioStore.subscribe).not.toHaveBeenCalled();
    });
  });
});
