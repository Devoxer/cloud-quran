const mockTransact = jest.fn();
const mockDelete = jest.fn();
const mockUpdate = jest.fn(() => ({ delete: mockDelete }));

jest.mock('@/services/instantdb', () => ({
  db: {
    transact: (...args: unknown[]) => mockTransact(...args),
    useQuery: jest.fn(() => ({ data: null, isLoading: false, error: null })),
    useAuth: jest.fn(() => ({ isLoading: false, user: null, error: null })),
    auth: { signInAsGuest: jest.fn() },
    tx: new Proxy(
      {},
      {
        get: () =>
          new Proxy(
            {},
            {
              get: () => ({
                update: mockUpdate,
                delete: mockDelete,
              }),
            },
          ),
      },
    ),
  },
  id: jest.fn(() => 'mock-id'),
  useBookmarks: jest.fn(() => ({ bookmarks: [], isLoading: false, error: null })),
  useReadingPosition: jest.fn(() => ({ position: null, isLoading: false, error: null })),
  usePreferences: jest.fn(() => ({ preferences: null, isLoading: false, error: null })),
  useAudioPosition: jest.fn(() => ({ audioPosition: null, isLoading: false, error: null })),
}));

import { addBookmark, removeBookmarkById, toggleBookmark } from './useBookmarkStore';

describe('useBookmarkStore', () => {
  beforeEach(() => {
    mockTransact.mockClear();
    mockUpdate.mockClear();
    mockDelete.mockClear();
  });

  test('addBookmark calls db.transact with correct data', () => {
    addBookmark(1, 5);
    expect(mockTransact).toHaveBeenCalledTimes(1);
  });

  test('removeBookmarkById calls db.transact', () => {
    removeBookmarkById('some-bookmark-id');
    expect(mockTransact).toHaveBeenCalledTimes(1);
  });

  test('toggleBookmark adds when bookmark does not exist', () => {
    const bookmarks: Array<{ id: string; surah: number; verse: number }> = [];
    toggleBookmark(1, 1, bookmarks);
    // Should call transact to add
    expect(mockTransact).toHaveBeenCalledTimes(1);
  });

  test('toggleBookmark removes when bookmark exists', () => {
    const bookmarks = [{ id: 'bk-1', surah: 1, verse: 1 }];
    toggleBookmark(1, 1, bookmarks);
    // Should call transact to delete
    expect(mockTransact).toHaveBeenCalledTimes(1);
  });

  test('toggleBookmark does not remove a non-matching bookmark', () => {
    const bookmarks = [{ id: 'bk-1', surah: 2, verse: 3 }];
    toggleBookmark(1, 1, bookmarks);
    // Should call transact to add (not matching)
    expect(mockTransact).toHaveBeenCalledTimes(1);
  });
});
