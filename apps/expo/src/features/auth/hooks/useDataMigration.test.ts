// Mock react-native-mmkv
const mockStorage = new Map<string, string>();
jest.mock('react-native-mmkv', () => ({
  createMMKV: () => ({
    set: (key: string, value: string) => mockStorage.set(key, value),
    getString: (key: string) => mockStorage.get(key),
    remove: (key: string) => mockStorage.delete(key),
    getBoolean: () => false,
  }),
}));

// Mock react hooks
let capturedCallback: ((...args: unknown[]) => unknown) | null = null;
jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useState: (initial: unknown) => [
    typeof initial === 'function' ? (initial as () => unknown)() : initial,
    jest.fn(),
  ],
  useCallback: (fn: (...args: unknown[]) => unknown) => {
    capturedCallback = fn;
    return fn;
  },
}));

// Mock stores
const mockUIState = {
  currentSurah: 2,
  currentVerse: 142,
  currentMode: 'reading' as const,
  lastReadTimestamp: 1234567890,
  fontSize: 30,
  autoFollowAudio: true,
  tapToSeek: false,
};

jest.mock('@/theme/useUIStore', () => ({
  useUIStore: Object.assign(
    (selector: (s: typeof mockUIState) => unknown) => selector(mockUIState),
    { getState: () => mockUIState, setState: () => {}, subscribe: () => () => {} },
  ),
}));

const mockBookmarks = [
  { surahNumber: 1, verseNumber: 1, createdAt: 1000 },
  { surahNumber: 2, verseNumber: 255, createdAt: 2000 },
];

jest.mock('@/features/bookmarks/useBookmarkStore', () => ({
  useBookmarkStore: Object.assign(
    (selector: (s: { bookmarks: typeof mockBookmarks }) => unknown) =>
      selector({ bookmarks: mockBookmarks }),
    {
      getState: () => ({ bookmarks: mockBookmarks }),
      setState: () => {},
      subscribe: () => () => {},
    },
  ),
}));

const mockAudioState = {
  selectedReciterId: 'alafasy',
  playbackSpeed: 1.0,
  continuousPlayback: true,
};

jest.mock('@/features/audio/stores/useAudioStore', () => ({
  useAudioStore: Object.assign(
    (selector: (s: typeof mockAudioState) => unknown) => selector(mockAudioState),
    { getState: () => mockAudioState, setState: () => {}, subscribe: () => () => {} },
  ),
}));

// Mock API client
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

require('./useDataMigration');

describe('useDataMigration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStorage.clear();
    capturedCallback = null;
    // Re-import to get fresh callback
    jest.isolateModules(() => {
      require('./useDataMigration');
    });
  });

  test('migrateData calls sync/push with correct payload', async () => {
    // Get the actual hook
    const { useDataMigration } = require('./useDataMigration');
    const result = useDataMigration();

    await result.migrateData();

    expect(mockPost).toHaveBeenCalledWith(
      expect.objectContaining({
        json: expect.objectContaining({
          position: expect.objectContaining({
            currentSurah: 2,
            currentVerse: 142,
          }),
          bookmarks: mockBookmarks,
          preferences: expect.objectContaining({
            fontSize: 30,
          }),
          audio: expect.objectContaining({
            selectedReciterId: 'alafasy',
          }),
        }),
      }),
    );
  });

  test('migrateData handles 501 gracefully (sync not yet implemented)', async () => {
    mockPost.mockResolvedValue({ ok: false, status: 501 });
    const { useDataMigration } = require('./useDataMigration');
    const result = useDataMigration();

    // Should not throw
    await expect(result.migrateData()).resolves.not.toThrow();
  });

  test('migrateData handles network errors gracefully', async () => {
    mockPost.mockRejectedValue(new Error('Network error'));
    const { useDataMigration } = require('./useDataMigration');
    const result = useDataMigration();

    // Should not throw
    await expect(result.migrateData()).resolves.not.toThrow();
  });
});
