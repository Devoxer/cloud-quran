import { useCallback, useEffect, useState } from 'react';

import type { VerseWithTranslation } from '@/services/sqlite';
import { getVersesForSurah } from '@/services/sqlite';

interface UseVersesResult {
  verses: VerseWithTranslation[];
  isLoading: boolean;
  error: Error | null;
  retry: () => void;
}

export function useVerses(surahNumber: number): UseVersesResult {
  const [verses, setVerses] = useState<VerseWithTranslation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadVerses = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getVersesForSurah(surahNumber);
      setVerses(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load verses'));
    } finally {
      setIsLoading(false);
    }
  }, [surahNumber]);

  useEffect(() => {
    loadVerses();
  }, [loadVerses]);

  return { verses, isLoading, error, retry: loadVerses };
}
