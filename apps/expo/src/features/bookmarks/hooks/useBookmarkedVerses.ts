import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getVersesByPositions } from '@/services/sqlite';

import { useBookmarks } from '../useBookmarkStore';

export interface BookmarkedVerse {
  surahNumber: number;
  verseNumber: number;
  createdAt: number;
  uthmaniText: string;
  translationText: string;
  bookmarkId: string;
}

export function useBookmarkedVerses() {
  const { bookmarks, isLoading: bookmarksLoading } = useBookmarks();
  const [verses, setVerses] = useState<BookmarkedVerse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Stabilize bookmarks reference — only change when IDs actually differ
  const bookmarksKey = useMemo(
    () => bookmarks.map((b) => b.id).join(','),
    [bookmarks],
  );
  const stableBookmarks = useRef(bookmarks);
  if (bookmarksKey !== stableBookmarks.current.map((b) => b.id).join(',')) {
    stableBookmarks.current = bookmarks;
  }

  const loadVerses = useCallback(async () => {
    const bks = stableBookmarks.current;
    if (bks.length === 0) {
      setVerses([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const positions = bks.map((b) => ({
        surahNumber: b.surah,
        verseNumber: b.verse,
      }));
      const verseData = await getVersesByPositions(positions);
      const merged = bks
        .map((b) => {
          const verse = verseData.find(
            (v) => v.surahNumber === b.surah && v.verseNumber === b.verse,
          );
          return verse
            ? {
                surahNumber: b.surah,
                verseNumber: b.verse,
                createdAt: b.createdAt,
                uthmaniText: verse.uthmaniText,
                translationText: verse.translationText,
                bookmarkId: b.id,
              }
            : null;
        })
        .filter((v): v is BookmarkedVerse => v !== null)
        .sort((a, b) => b.createdAt - a.createdAt);
      setVerses(merged);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load bookmarked verses'));
    } finally {
      setIsLoading(false);
    }
  }, [bookmarksKey]);

  useEffect(() => {
    loadVerses();
  }, [loadVerses]);

  return { verses, isLoading: isLoading || bookmarksLoading, error };
}
