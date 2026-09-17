/**
 * useSearchCorpus — the whole Quran, normalised once, held for the life of the process
 * (story 6-7).
 *
 * ⚠️ THE FAILURE IS A VALUE, NOT A THROW — `useSurah.ts` is the precedent and the reason is the
 * same. "The Quran text could not be read" has to become a real surface with a retry; a thrown
 * promise or a rejected Suspense boundary hands it to the router's `ErrorBoundary`, which is a
 * redbox in dev and a blank screen in production.
 *
 * ⚠️ THE MEMO IS MODULE SCOPE, NOT COMPONENT STATE, AND THAT IS WHAT MAKES THE SECOND VISIT FREE.
 * Search is a pushed route: it mounts, the reader picks a verse, it unmounts. Holding the corpus
 * in `useState` would re-read and re-normalise 6,236 rows every single time the magnifier is
 * pressed. At module scope the cost is paid once per app launch, by the first reader who opens
 * search — and never at all by one who does not.
 *
 * ⚠️ AND A FAILED LOAD IS NOT CACHED, for `lib/quranDb.ts`'s reason: the error surface offers a
 * retry, and a retry that replays a stored rejection forever is a decorative button. `inFlight`
 * is cleared on rejection so the next attempt really re-runs — including the asset import, which
 * is the leg most likely to have failed.
 *
 * ⚠️ NOTHING HERE RUNS AT BOOT. `lib/quranDb.ts`'s first open imports a 4.2 MB asset into the
 * SQLite directory, and this hook then walks every row through the normaliser four times. That is
 * a real chunk of work and it belongs to the reader who asked for search, not to every cold
 * launch — the same argument `lib/mushafLayout.ts` makes for lazy-`require`ing its 7.8 MB.
 */

import { useCallback, useEffect, useState } from 'react';
import { captureException } from '@/lib/errors';
import { getAllVersesForSearch } from '@/lib/quranDb';
import { buildCorpus, type SearchVerse } from '../lib/search';

/** The corpus, once loaded. Lives as long as the JS context does. */
let cached: readonly SearchVerse[] | null = null;
/** The in-flight load, so two mounts inside one launch share one read and one normalisation. */
let inFlight: Promise<readonly SearchVerse[]> | null = null;

/** Read every verse and fold it into the corpus `buildCorpus` defines. */
async function loadCorpus(): Promise<readonly SearchVerse[]> {
  return buildCorpus(await getAllVersesForSearch());
}

export interface SearchCorpus {
  /** Every verse, matchable. `[]` while loading and after a failure. */
  verses: readonly SearchVerse[];
  /** True until the first answer — success or failure. */
  loading: boolean;
  /** The failure, if the bundled database could not be read. Never both this and `verses`. */
  error: Error | null;
  /** Try again. Clears `error` and re-runs the read. */
  reload: () => void;
}

const EMPTY: readonly SearchVerse[] = [];

export function useSearchCorpus(): SearchCorpus {
  const [verses, setVerses] = useState<readonly SearchVerse[]>(cached ?? EMPTY);
  const [loading, setLoading] = useState(cached === null);
  const [error, setError] = useState<Error | null>(null);
  const [attempt, setAttempt] = useState(0);

  // ⚠️ `attempt` IS IN THE DEPENDENCIES AND IS DELIBERATELY NOT READ IN THE BODY — it IS the
  // retry trigger, and Biome's "more dependencies than necessary" reads only the body. Taking its
  // suggested fix deletes the retry: `reload()` would bump a counter nothing re-runs on, and the
  // error state's button would go decorative with every test still green except the one that
  // presses it. (`useSurah.ts` carries the identical shape and the identical suppression.)
  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` is the retry trigger (above)
  useEffect(() => {
    if (cached !== null) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    if (inFlight === null) {
      inFlight = loadCorpus().catch((cause: unknown) => {
        // Not cached — see the header. The next press really re-reads.
        inFlight = null;
        throw cause;
      });
    }
    inFlight
      .then((loaded) => {
        cached = loaded;
        if (cancelled) return;
        setVerses(loaded);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        const failure = cause instanceof Error ? cause : new Error(String(cause));
        // Tier 1: the bundled Quran text is unreadable on this device. Nothing the reader can do
        // fixes it, the screen shows a retry, and this is the only way we learn of it in the
        // field — `useSurah`'s judgement, for the same asset.
        captureException(failure, { operation: 'quranDb.searchCorpus' });
        if (cancelled) return;
        setVerses(EMPTY);
        setError(failure);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  return { verses, loading, error, reload };
}

/**
 * Drop the module-scope corpus. **Tests only** — mirrors `__resetQuranDbForTests`, and exists for
 * the same reason: a memo that outlives a test makes the next one assert against the previous
 * one's data.
 */
export function __resetSearchCorpusForTests(): void {
  cached = null;
  inFlight = null;
}
