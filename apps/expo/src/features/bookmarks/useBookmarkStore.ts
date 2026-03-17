import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { mmkvStorage } from '@/services/mmkv';

export interface Bookmark {
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

export const useBookmarkStore = create<BookmarkState>()(
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
