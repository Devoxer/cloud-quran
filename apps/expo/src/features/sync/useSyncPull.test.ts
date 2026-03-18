// Mock react-native-mmkv
jest.mock('react-native-mmkv', () => ({
  createMMKV: () => ({
    set: jest.fn(),
    getString: jest.fn(() => undefined),
    remove: jest.fn(),
    getBoolean: () => false,
  }),
}));

// Mock react hooks
jest.mock('react', () => ({
  ...jest.requireActual('react'),
}));

// Mock React Query
jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(() => ({ data: null, isLoading: false })),
}));

// Auth store mock
jest.mock('@/features/auth/useAuthStore', () => ({
  useAuthStore: Object.assign(
    (selector: (s: { isAuthenticated: boolean }) => unknown) =>
      selector({ isAuthenticated: true }),
    {
      getState: () => ({ isAuthenticated: true }),
      subscribe: jest.fn(() => jest.fn()),
    },
  ),
}));

// UI store mock — track calls to syncReadingPosition, setFontSize
const mockSyncReadingPosition = jest.fn();
const mockSetFontSize = jest.fn();
let mockLastReadTimestamp = 1000;
jest.mock('@/theme/useUIStore', () => ({
  useUIStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({ lastReadTimestamp: mockLastReadTimestamp }),
    {
      getState: () => ({
        lastReadTimestamp: mockLastReadTimestamp,
        syncReadingPosition: mockSyncReadingPosition,
        setFontSize: mockSetFontSize,
      }),
      subscribe: jest.fn(() => jest.fn()),
    },
  ),
}));

// Bookmark store mock — track addBookmark calls
const mockAddBookmark = jest.fn();
let mockLocalBookmarks: Array<{ surahNumber: number; verseNumber: number }> = [];
jest.mock('@/features/bookmarks/useBookmarkStore', () => ({
  useBookmarkStore: Object.assign(
    (selector: (s: { bookmarks: typeof mockLocalBookmarks }) => unknown) =>
      selector({ bookmarks: mockLocalBookmarks }),
    {
      getState: () => ({
        bookmarks: mockLocalBookmarks,
        addBookmark: mockAddBookmark,
      }),
      subscribe: jest.fn(() => jest.fn()),
    },
  ),
}));

// Audio store mock — track setReciter, setSpeed calls
const mockSetReciter = jest.fn();
const mockSetSpeed = jest.fn();
jest.mock('@/features/audio/stores/useAudioStore', () => ({
  useAudioStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) => selector({}),
    {
      getState: () => ({
        setReciter: mockSetReciter,
        setSpeed: mockSetSpeed,
      }),
      subscribe: jest.fn(() => jest.fn()),
    },
  ),
}));

// API mock
const mockGet = jest.fn();
jest.mock('@/services/api', () => ({
  api: {
    api: {
      sync: {
        pull: {
          $get: (...args: unknown[]) => mockGet(...args),
        },
      },
    },
  },
}));

// Sync engine mocks — control isMerging guard and lastPushAt
let mockLastPushAt = 0;
jest.mock('./useSyncEngine', () => ({
  setMerging: jest.fn(),
  getLastPushAt: () => mockLastPushAt,
}));

import { mergeServerData, type SyncPullData } from './useSyncPull';
import { setMerging } from './useSyncEngine';

describe('useSyncPull', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLastReadTimestamp = 1000;
    mockLastPushAt = 0;
    mockLocalBookmarks = [];
  });

  describe('mergeServerData', () => {
    test('wraps merge in setMerging guard to prevent feedback loop', () => {
      const data: SyncPullData = {
        position: null,
        bookmarks: [],
        preferences: null,
        audio: null,
      };

      mergeServerData(data);
      expect(setMerging).toHaveBeenCalledWith(true);
      expect(setMerging).toHaveBeenCalledWith(false);
    });

    test('updates reading position when server is newer (LWW)', () => {
      const data: SyncPullData = {
        position: {
          currentSurah: 5,
          currentVerse: 10,
          currentMode: 'reading',
          lastReadTimestamp: 2000, // newer than local 1000
        },
        bookmarks: [],
        preferences: null,
        audio: null,
      };

      mergeServerData(data);
      expect(mockSyncReadingPosition).toHaveBeenCalledWith(5, 10);
    });

    test('does NOT update reading position when local is newer (LWW)', () => {
      mockLastReadTimestamp = 5000;
      const data: SyncPullData = {
        position: {
          currentSurah: 5,
          currentVerse: 10,
          currentMode: 'reading',
          lastReadTimestamp: 2000, // older than local 5000
        },
        bookmarks: [],
        preferences: null,
        audio: null,
      };

      mergeServerData(data);
      expect(mockSyncReadingPosition).not.toHaveBeenCalled();
    });

    test('skips position update when server position is null', () => {
      const data: SyncPullData = {
        position: null,
        bookmarks: [],
        preferences: null,
        audio: null,
      };

      mergeServerData(data);
      expect(mockSyncReadingPosition).not.toHaveBeenCalled();
    });

    test('union-merges bookmarks — adds missing, keeps existing', () => {
      mockLocalBookmarks = [{ surahNumber: 1, verseNumber: 1 }];
      const data: SyncPullData = {
        position: null,
        bookmarks: [
          { surahNumber: 1, verseNumber: 1, createdAt: 1000 }, // already local
          { surahNumber: 2, verseNumber: 255, createdAt: 2000 }, // new
          { surahNumber: 3, verseNumber: 1, createdAt: 3000 }, // new
        ],
        preferences: null,
        audio: null,
      };

      mergeServerData(data);
      // Should only add the 2 new bookmarks, not the existing one
      expect(mockAddBookmark).toHaveBeenCalledTimes(2);
      expect(mockAddBookmark).toHaveBeenCalledWith(2, 255);
      expect(mockAddBookmark).toHaveBeenCalledWith(3, 1);
    });

    test('does not add bookmarks that already exist locally', () => {
      mockLocalBookmarks = [
        { surahNumber: 1, verseNumber: 1 },
        { surahNumber: 2, verseNumber: 255 },
      ];
      const data: SyncPullData = {
        position: null,
        bookmarks: [
          { surahNumber: 1, verseNumber: 1, createdAt: 1000 },
          { surahNumber: 2, verseNumber: 255, createdAt: 2000 },
        ],
        preferences: null,
        audio: null,
      };

      mergeServerData(data);
      expect(mockAddBookmark).not.toHaveBeenCalled();
    });

    test('updates preferences when server is newer than last push (LWW)', () => {
      mockLastPushAt = 1000;
      const data: SyncPullData = {
        position: null,
        bookmarks: [],
        preferences: {
          fontSize: 36,
          updatedAt: 2000, // newer than lastPushAt 1000
        },
        audio: null,
      };

      mergeServerData(data);
      expect(mockSetFontSize).toHaveBeenCalledWith(36);
    });

    test('does NOT update preferences when server is older than last push', () => {
      mockLastPushAt = 5000;
      const data: SyncPullData = {
        position: null,
        bookmarks: [],
        preferences: {
          fontSize: 36,
          updatedAt: 2000, // older than lastPushAt 5000
        },
        audio: null,
      };

      mergeServerData(data);
      expect(mockSetFontSize).not.toHaveBeenCalled();
    });

    test('updates audio settings when server is newer than last push (LWW)', () => {
      mockLastPushAt = 1000;
      const data: SyncPullData = {
        position: null,
        bookmarks: [],
        preferences: null,
        audio: {
          selectedReciterId: 'husary',
          playbackSpeed: 1.5,
          updatedAt: 2000, // newer than lastPushAt 1000
        },
      };

      mergeServerData(data);
      expect(mockSetReciter).toHaveBeenCalledWith('husary');
      expect(mockSetSpeed).toHaveBeenCalledWith(1.5);
    });

    test('does NOT update audio when server is older than last push', () => {
      mockLastPushAt = 5000;
      const data: SyncPullData = {
        position: null,
        bookmarks: [],
        preferences: null,
        audio: {
          selectedReciterId: 'husary',
          playbackSpeed: 1.5,
          updatedAt: 2000, // older than lastPushAt 5000
        },
      };

      mergeServerData(data);
      expect(mockSetReciter).not.toHaveBeenCalled();
      expect(mockSetSpeed).not.toHaveBeenCalled();
    });
  });
});
