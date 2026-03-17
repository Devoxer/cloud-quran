import { useCallback, useEffect, useState } from 'react';

import { getVersesByPositions } from '@/services/sqlite';

import { useBookmarkStore } from '../useBookmarkStore';

export interface BookmarkedVerse {
  surahNumber: number;
  verseNumber: number;
  createdAt: number;
  uthmaniText: string;
  translationText: string;
}

export function useBookmarkedVerses() {
  const bookmarks = useBookmarkStore((s) => s.bookmarks);
  const [verses, setVerses] = useState<BookmarkedVerse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadVerses = useCallback(async () => {
    if (bookmarks.length === 0) {
      setVerses([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const verseData = await getVersesByPositions(bookmarks);
      const merged = bookmarks
        .map((b) => {
          const verse = verseData.find(
            (v) => v.surahNumber === b.surahNumber && v.verseNumber === b.verseNumber,
          );
          return verse
            ? { ...b, uthmaniText: verse.uthmaniText, translationText: verse.translationText }
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
  }, [bookmarks]);

  useEffect(() => {
    loadVerses();
  }, [loadVerses]);

  return { verses, isLoading, error };
}
