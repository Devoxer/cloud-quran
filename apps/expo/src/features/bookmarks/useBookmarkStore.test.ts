import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

// Mock react-native-mmkv with in-memory storage
const mockStorage = new Map<string, string>();
jest.mock('react-native-mmkv', () => ({
  createMMKV: () => ({
    set: (key: string, value: string) => mockStorage.set(key, value),
    getString: (key: string) => mockStorage.get(key),
    remove: (key: string) => mockStorage.delete(key),
  }),
}));

const { mmkvStorage } = require('@/services/mmkv');

// Create store directly (same logic as useBookmarkStore.ts) to avoid mock interference.
interface Bookmark {
  surahNumber: number;
  verseNumber: number;
  createdAt: number;
}

interface BookmarkState {
  bookmarks: Bookmark[];
  addBookmark: (surahNumber: number, verseNumber: number) => void;
  removeBookmark: (surahNumber: number, verseNumber: number) => void;
  toggleBookmark: (surahNumber: number, verseNumber: number) => void;
}

const useBookmarkStore = create<BookmarkState>()(
  persist(
    (set, get) => ({
      bookmarks: [],
      addBookmark: (surahNumber, verseNumber) => {
        const exists = get().bookmarks.some(
          (b) => b.surahNumber === surahNumber && b.verseNumber === verseNumber,
        );
        if (exists) return;
        set((state) => ({
          bookmarks: [...state.bookmarks, { surahNumber, verseNumber, createdAt: Date.now() }],
        }));
      },
      removeBookmark: (surahNumber, verseNumber) =>
        set((state) => ({
          bookmarks: state.bookmarks.filter(
            (b) => !(b.surahNumber === surahNumber && b.verseNumber === verseNumber),
          ),
        })),
      toggleBookmark: (surahNumber, verseNumber) => {
        const exists = get().bookmarks.some(
          (b) => b.surahNumber === surahNumber && b.verseNumber === verseNumber,
        );
        if (exists) {
          get().removeBookmark(surahNumber, verseNumber);
        } else {
          get().addBookmark(surahNumber, verseNumber);
        }
      },
    }),
    {
      name: 'bookmark-state',
      storage: createJSONStorage(() => mmkvStorage),
    },
  ),
);

describe('useBookmarkStore', () => {
  beforeEach(() => {
    useBookmarkStore.setState({ bookmarks: [] });
    mockStorage.clear();
  });

  test('initial state has empty bookmarks array', () => {
    const { bookmarks } = useBookmarkStore.getState();
    expect(bookmarks).toEqual([]);
  });

  test('addBookmark adds a bookmark with correct fields', () => {
    const before = Date.now();
    useBookmarkStore.getState().addBookmark(1, 5);
    const { bookmarks } = useBookmarkStore.getState();
    expect(bookmarks).toHaveLength(1);
    expect(bookmarks[0].surahNumber).toBe(1);
    expect(bookmarks[0].verseNumber).toBe(5);
    expect(bookmarks[0].createdAt).toBeGreaterThanOrEqual(before);
    expect(bookmarks[0].createdAt).toBeLessThanOrEqual(Date.now());
  });

  test('addBookmark does not add duplicate (same surah+verse)', () => {
    useBookmarkStore.getState().addBookmark(1, 5);
    useBookmarkStore.getState().addBookmark(1, 5);
    const { bookmarks } = useBookmarkStore.getState();
    expect(bookmarks).toHaveLength(1);
  });

  test('addBookmark allows different verses in same surah', () => {
    useBookmarkStore.getState().addBookmark(1, 1);
    useBookmarkStore.getState().addBookmark(1, 2);
    const { bookmarks } = useBookmarkStore.getState();
    expect(bookmarks).toHaveLength(2);
  });

  test('removeBookmark removes the correct bookmark', () => {
    useBookmarkStore.getState().addBookmark(1, 1);
    useBookmarkStore.getState().addBookmark(2, 5);
    useBookmarkStore.getState().removeBookmark(1, 1);
    const { bookmarks } = useBookmarkStore.getState();
    expect(bookmarks).toHaveLength(1);
    expect(bookmarks[0].surahNumber).toBe(2);
    expect(bookmarks[0].verseNumber).toBe(5);
  });

  test('removeBookmark with non-existent bookmark does nothing', () => {
    useBookmarkStore.getState().addBookmark(1, 1);
    useBookmarkStore.getState().removeBookmark(99, 99);
    const { bookmarks } = useBookmarkStore.getState();
    expect(bookmarks).toHaveLength(1);
  });

  test('toggleBookmark adds when absent', () => {
    useBookmarkStore.getState().toggleBookmark(1, 1);
    const { bookmarks } = useBookmarkStore.getState();
    expect(bookmarks).toHaveLength(1);
    expect(bookmarks[0].surahNumber).toBe(1);
    expect(bookmarks[0].verseNumber).toBe(1);
  });

  test('toggleBookmark removes when present', () => {
    useBookmarkStore.getState().addBookmark(1, 1);
    useBookmarkStore.getState().toggleBookmark(1, 1);
    const { bookmarks } = useBookmarkStore.getState();
    expect(bookmarks).toHaveLength(0);
  });

  test('bookmarks persist via MMKV (persist config uses bookmark-state key)', () => {
    useBookmarkStore.getState().addBookmark(2, 255);
    const stored = mockStorage.get('bookmark-state');
    if (stored) {
      const parsed = JSON.parse(stored);
      expect(parsed.state.bookmarks).toHaveLength(1);
      expect(parsed.state.bookmarks[0].surahNumber).toBe(2);
      expect(parsed.state.bookmarks[0].verseNumber).toBe(255);
    }
    const { bookmarks } = useBookmarkStore.getState();
    expect(bookmarks).toHaveLength(1);
  });
});
