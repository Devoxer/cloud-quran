import { db, id, useBookmarks } from '@/services/instantdb';

export interface Bookmark {
  id: string;
  surah: number;
  verse: number;
  createdAt: number;
}

/**
 * Add a bookmark via InstantDB transaction.
 * No-op if the bookmark already exists (caller should check via useBookmarks).
 */
export function addBookmark(surahNumber: number, verseNumber: number) {
  db.transact(
    db.tx.bookmarks[id()].update({
      surah: surahNumber,
      verse: verseNumber,
      createdAt: Date.now(),
    }),
  );
}

/**
 * Remove a bookmark by its InstantDB entity ID.
 */
export function removeBookmarkById(bookmarkId: string) {
  db.transact(db.tx.bookmarks[bookmarkId].delete());
}

/**
 * Remove a bookmark by surah+verse. Finds the matching bookmark and deletes it.
 */
export function removeBookmark(
  surahNumber: number,
  verseNumber: number,
  bookmarks: Array<{ id: string; surah: number; verse: number }>,
) {
  const match = bookmarks.find(
    (b) => b.surah === surahNumber && b.verse === verseNumber,
  );
  if (match) {
    db.transact(db.tx.bookmarks[match.id].delete());
  }
}

/**
 * Toggle bookmark for a given surah+verse.
 */
export function toggleBookmark(
  surahNumber: number,
  verseNumber: number,
  bookmarks: Array<{ id: string; surah: number; verse: number }>,
) {
  const exists = bookmarks.find(
    (b) => b.surah === surahNumber && b.verse === verseNumber,
  );
  if (exists) {
    db.transact(db.tx.bookmarks[exists.id].delete());
  } else {
    addBookmark(surahNumber, verseNumber);
  }
}

// Re-export the hook for convenience
export { useBookmarks };
