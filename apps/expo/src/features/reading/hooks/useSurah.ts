/**
 * useSurah — load one surah's verses and metadata from the bundled database (story 6-1).
 *
 * ⚠️ NOT `useQuery`, AND THAT IS THE POINT. `lib/sync.ts`'s query module exists for state the
 * WORKER owns — it seeds from MMKV, coalesces writes and invalidates explicitly, all of which are
 * answers to "the server has a different copy". The Quran text has no server copy: it ships in
 * the bundle, it never changes at runtime, and there is nothing to reconcile. Putting it behind
 * the sync query client would give it a cache key scoped to the USER ID, which is nonsense for a
 * file that is identical for everyone, and would make a purge look like it could delete the Quran.
 *
 * ⚠️ THE ERROR IS A VALUE, NOT A THROW. "Database unreadable — asset missing or corrupt" has to
 * become a real error surface with a retry, never a blank screen; a thrown promise or a rejected
 * Suspense boundary would hand that to the router's `ErrorBoundary`, which is a redbox in dev and
 * a blank screen in production.
 *
 * `reload` clears the error and re-runs. `lib/quranDb.ts` deliberately does not cache a FAILED
 * open, so a retry actually re-attempts the asset import rather than replaying the stored failure.
 */

import type { Surah, Verse } from 'quran-data';
import { useCallback, useEffect, useState } from 'react';
import { captureException } from '@/lib/errors';
import { getSurahMetadata, getSurahVerses } from '@/lib/quranDb';

export interface SurahContent {
  /** The surah being shown. Present even while loading, so chrome can render immediately. */
  surah: number;
  /** Its verses in order, or `[]` while loading or after a failure. */
  verses: Verse[];
  /** Its metadata row, or `null` while loading or after a failure. */
  meta: Surah | null;
  /** True until the first answer — success or failure — for the CURRENT surah. */
  loading: boolean;
  /** The failure, if the database could not be read. Never both this and verses. */
  error: Error | null;
  /** Try again. Clears `error` and re-runs the two reads. */
  reload: () => void;
}

export function useSurah(surah: number): SurahContent {
  const [verses, setVerses] = useState<Verse[]>([]);
  const [meta, setMeta] = useState<Surah | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [attempt, setAttempt] = useState(0);

  // ⚠️ `attempt` IS IN THE DEPENDENCIES AND IS DELIBERATELY NOT READ IN THE BODY — it IS the retry
  // trigger, and Biome's "more dependencies than necessary" reads only the body. Taking its
  // suggested fix deletes the retry: `reload()` would bump a counter nothing re-runs on, and the
  // error state's button would become decorative with every test still green except the one that
  // presses it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` is the retry trigger (above)
  useEffect(() => {
    // ⚠️ THE CANCELLATION IS LOAD-BEARING, NOT HYGIENE. Tapping "next surah" twice quickly starts
    // two reads; without this the slower one lands last and the reader is left on a surah they
    // already moved past, with the chrome naming a different one.
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const [rows, row] = await Promise.all([getSurahVerses(surah), getSurahMetadata(surah)]);
        if (cancelled) return;
        setVerses(rows);
        setMeta(row);
      } catch (cause) {
        if (cancelled) return;
        const failure = cause instanceof Error ? cause : new Error(String(cause));
        // Tier 1: the bundled Quran text is unreadable on this device. Nothing the reader can do
        // fixes it and nothing else in the app will report it — the screen shows a retry, and
        // this is the only way we ever learn the asset import failed in the field.
        captureException(failure, { operation: 'quranDb.readSurah', surah });
        setVerses([]);
        setMeta(null);
        setError(failure);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [surah, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  return { surah, verses, meta, loading, error, reload };
}
