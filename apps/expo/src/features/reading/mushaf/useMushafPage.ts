/**
 * useMushafPage — load one page's layout AND its font, as a value (story 6-2).
 *
 * Mirrors `useSurah`'s shape for the same reasons its header gives: the mushaf data has no server
 * copy so the sync client is the wrong door, and the ERROR IS A VALUE — an uncached font in
 * airplane mode is the EXPECTED failure here, and it must become a page-level retry surface,
 * never a thrown promise into the router's ErrorBoundary and never a blank page.
 *
 * Both halves load together because neither is renderable alone: layout without the font draws
 * tofu in a fallback face, the font without layout draws nothing. A failure of either is one
 * error with one retry.
 *
 * ⚠️ THE FAILED HALF IS NOT CACHED ANYWHERE. `loadPageFont` caches only a SUCCESSFUL download
 * (and `Font.isLoaded` only a successful registration), so `reload` genuinely re-attempts —
 * the airplane-mode row of the I/O matrix ("recovers when back online") depends on that.
 *
 * ⚠️ HOOKS HERE ARE UNCONDITIONAL AND THE CONSUMER'S MUST BE TOO. This story exists because the
 * pre-fork `MushafPage` called a hook after two early returns and crashed on every page load
 * (`mushaf-page-crash`); pushing the whole async lifecycle into this hook is what leaves the
 * component with nothing to call conditionally.
 */

import type { MushafPageLayout } from 'quran-data';
import { useCallback, useEffect, useState } from 'react';
import { getPageFontFamily, loadPageFont } from '@/lib/mushafFonts';
import { getPageLayout } from '@/lib/mushafLayout';

export interface MushafPageContent {
  /** The page's layout, or `null` while loading or after a failure. */
  layout: MushafPageLayout | null;
  /** The registered `QCF_P{NNN}` family, or `null` while loading or after a failure. */
  fontFamily: string | null;
  /** True until the first answer — success or failure — for the CURRENT page. */
  loading: boolean;
  /** The failure, if the layout or the font could not be loaded. Never both this and `layout`. */
  error: Error | null;
  /** Try again. Clears `error` and re-runs both loads. */
  reload: () => void;
}

export function useMushafPage(page: number): MushafPageContent {
  const [layout, setLayout] = useState<MushafPageLayout | null>(null);
  const [fontFamily, setFontFamily] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [attempt, setAttempt] = useState(0);

  // ⚠️ `attempt` IS THE RETRY TRIGGER and is deliberately unread in the body — same shape, same
  // Biome carve-out, and same trap as `useSurah`: taking the lint's suggested fix deletes the
  // retry while every test stays green except the one that presses the button.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` is the retry trigger (above)
  useEffect(() => {
    // Cancellation matters here for the same measured reason as `useSurah`: a fast swipe starts
    // several loads, and the slower page's answer must not land on the page the reader is on.
    let cancelled = false;
    setLoading(true);
    setError(null);
    // The OLD page's content must not survive into the new page's loading window — recycled
    // FlashList items would otherwise paint page N's lines under page M's number for a frame.
    setLayout(null);
    setFontFamily(null);
    (async () => {
      try {
        const [pageLayout] = await Promise.all([getPageLayout(page), loadPageFont(page)]);
        if (cancelled) return;
        setLayout(pageLayout);
        setFontFamily(getPageFontFamily(page));
      } catch (cause) {
        if (cancelled) return;
        const failure = cause instanceof Error ? cause : new Error(String(cause));
        // Not sent to Sentry: the dominant instance is "offline and this page's font is not
        // cached yet", which is the documented offline behaviour, not a defect. The layout half
        // failing would be one, but it cannot be told apart here without inspecting the error,
        // and a wrong guess spams the reader's opt-in quota with airplane mode.
        setLayout(null);
        setFontFamily(null);
        setError(failure);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [page, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  return { layout, fontFamily, loading, error, reload };
}
