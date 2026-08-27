import { FlashList } from '@shopify/flash-list';
import { getFirstVerseForPage, getPageForVerse, SURAH_METADATA, TOTAL_PAGES } from 'quran-data';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWindowDimensions, View, type ViewToken } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { MushafPage, ReadingChrome, useChromeReveal } from '@/features/reading';
import { preloadAdjacentPageFonts } from '@/lib/mushafFonts';
import { type ReadingPositionPair, usePosition } from '@/lib/usePosition';
import { useThemedStyles } from '@/lib/useThemedStyles';

/**
 * MUSHAF MODE — the 604-page facsimile surface (story 6-2, the second occupant of the immersive
 * slot story 6-0 built; `read.tsx` is the sibling whose contract this file mirrors).
 *
 * Same address rules as the reader: this file sits at the ROOT of `src/app/`, registered as a
 * `fullScreenModal` with the native header off — the POSITION removes the tab bar, the
 * PRESENTATION makes it immersive, and this source must never spell the header-visibility option
 * (`immersive-route.test.ts` scans for it; the way out is a control in CONTENT, `ReadingChrome`'s
 * close button, exactly as on `/read`).
 *
 * ── The four shapes that are load-bearing here ───────────────────────────────────────────────
 *
 * 1. **REVERSED DATA, NOT `inverted`.** `PAGE_DATA` is `[604 … 1]`, one strategy on every
 *    platform: page 1 sits at index 603, and advancing a finger left-to-right lands on a LOWER
 *    index = HIGHER page — the RTL page turn. The pre-fork ran `inverted` on native and reversed
 *    data on web because `inverted` broke web scroll/drag; one reversed array needs no platform
 *    branch and does not bet on FlashList v2 keeping v1's `inverted` semantics.
 *
 * 2. **`initialScrollIndex` IS ALLOWED HERE, AND THE DIFFERENCE FROM `read.tsx` IS THE ITEM.**
 *    6-1 banned it because verse rows have VARIABLE height and a predicted offset accumulates
 *    error over 286 verses. A mushaf page is a UNIFORM full-screen item — index × width IS the
 *    offset, exactly, so the restore can be declarative instead of an imperative post-mount
 *    scroll. The saved `(surah, verse)` pair is read ONCE and resolved as a pair:
 *    `getPageForVerse` answers -1 for any pair not in the map (corrupt, out of range, from a
 *    newer build), and -1 clamps to page 1 — the documented fallback.
 *
 * 3. **ONE POSITION WRITE PER SETTLED PAGE, ZERO WITHIN A PAGE, AND ZERO ON OPEN.** The
 *    viewability callback reports the settled page's FIRST verse (`getFirstVerseForPage`)
 *    through `usePosition('mushaf')`, whose verse-changed comparison is the throttle — jitter on
 *    one page repeats one pair, which never writes. Nothing is wired to a scroll handler. The
 *    `moved` latch below is the one screen-side guard, and it is a RESTORE latch like `read.tsx`'s
 *    `restored`, not a comparison: the OPENING page's own settle is the restore landing, and
 *    reporting that page's first verse would OVERWRITE the saved verse with an earlier one (a
 *    reader at 2:255 opens page 42, whose first verse is 2:253) and spend a write on no movement.
 *
 * 4. **THE TAP IS THE SAME RNGH GESTURE AS `read.tsx`**, `.cancelsTouchesInView(false)` and all —
 *    a drag fails the recognizer, which is the whole way a page-turn swipe is distinguished from
 *    a chrome tap. The pre-fork's `Pressable` + `isScrolling` discrimination is the shape 6-1
 *    measured as broken and is not ported. The chrome is a SIBLING of the detector, one driver
 *    (`useChromeReveal`), no second animation source in the feature.
 *
 * 5. **A PAGE THAT FAILS reveals the chrome — on BOTH edges, and only for the page the reader is
 *    LOOKING at.** FlashList renders neighbours off-screen; offline, an uncached neighbour fails
 *    too, and revealing the exit for a page nobody can see would flash the bars mid-read. ⚠️ THE
 *    FIRST VERSION OF THIS CHECKED ONE EDGE — "this page just failed, is it the current one?" —
 *    AND THAT IS THE COMMON CASE INVERTED: the page the reader swipes to has already rendered,
 *    already failed and already reported it before the viewability callback makes it current, so
 *    the reveal never fired and the reader landed on an error surface with the exit hidden.
 *    Measured on the simulator with the font host unreachable; the unit case missed it because it
 *    drove the callback after the screen already knew which page was current. `failedPages` below
 *    is the state that lets the OTHER edge — the page becoming current — ask the same question.
 *
 * ⚠️ THE ONLY IN-APP ENTRY IS THE TEMPORARY SETTINGS ROW (`mushaf-mode-row`), same as `/read`'s —
 * story 6.3 ships the real navigation and removes both rows.
 */

/** Module scope — FlashList refuses a changing viewabilityConfig (see `read.tsx`). */
const VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 50 } as const;

/** All 604 pages, REVERSED — see shape 1 in the header. Index i holds page 604 − i. */
const PAGE_DATA: number[] = Array.from({ length: TOTAL_PAGES }, (_, i) => TOTAL_PAGES - i);

/** The list index a page sits at, under the reversed data. */
function pageToIndex(page: number): number {
  return TOTAL_PAGES - page;
}

/**
 * The page this screen OPENS at — the saved pair resolved as a PAIR, once. A pair the map does
 * not hold answers -1, which clamps to page 1; there is no half-trusted surah or verse for the
 * clamp to miss (the family of defects `read.tsx`'s `openingPosition` documents).
 */
function openingPage(saved: ReadingPositionPair | null): number {
  if (!saved) return 1;
  const page = getPageForVerse(saved.surah, saved.verse);
  return page >= 1 && page <= TOTAL_PAGES ? page : 1;
}

export default function Mushaf() {
  const { t } = useTranslation();
  const reveal = useChromeReveal();
  const { saved, reportVerse } = usePosition('mushaf');
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  // Read once, on the first render — the reader owns where they are after that (see `read.tsx`).
  const [opening] = useState(() => openingPage(saved));
  const [currentPage, setCurrentPage] = useState(opening);
  // Mirrored into a ref so the error callback can ask "is that the visible page?" without
  // changing identity per page turn (identity-stable handlers are what FlashList requires).
  const currentPageRef = useRef(opening);
  // The restore latch — shape 3 in the header. One-shot, never a per-report comparison.
  const moved = useRef(false);
  /**
   * Which pages are currently in a failed state — shape 5 in the header. A SET rather than a
   * "the page that just failed", because the reveal has TWO edges and only one of them was
   * wired: a page can fail while it is still an off-screen neighbour, and then become the page
   * the reader is looking at. Kept honest in both directions (a successful retry removes the
   * entry) so returning to a page that has since loaded does not flash the bars.
   */
  const failedPages = useRef(new Set<number>());
  const { show } = reveal;

  const styles = useThemedStyles((theme) => ({
    screen: {
      flex: 1,
      backgroundColor: theme.colors.background.primary,
    },
    surface: {
      flex: 1,
    },
  }));

  // ±2 neighbour fonts, re-aimed on every settled page (and at the opening page on mount).
  // Fire-and-forget: `preloadAdjacentPageFonts` never throws; a miss becomes that page's own
  // retry surface if the reader ever arrives on it.
  useEffect(() => {
    void preloadAdjacentPageFonts(currentPage);
  }, [currentPage]);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken<number>[] }) => {
      const page = viewableItems[0]?.item;
      if (typeof page !== 'number') return;
      currentPageRef.current = page;
      setCurrentPage(page);
      // The OTHER edge of the failure reveal — see `failedPages` above for why one is not enough.
      if (failedPages.current.has(page)) show();
      if (!moved.current) {
        if (page === opening) return; // the restore settling under the reader is not a move
        moved.current = true;
      }
      const first = getFirstVerseForPage(page);
      if (first.surah === 0) return; // out-of-range answer — nothing true to write
      // Reported every time. `usePosition` decides whether it is a write.
      reportVerse(first.surah, first.verse);
    },
    [opening, reportVerse, show]
  );

  // Reveal the exit when the VISIBLE page fails — see the header for why not every page.
  const onPageErrorChange = useCallback(
    (page: number, failed: boolean) => {
      if (failed) failedPages.current.add(page);
      else failedPages.current.delete(page);
      if (failed && page === currentPageRef.current) show();
    },
    [show]
  );

  /** One tap gesture for the whole surface — `read.tsx`'s shape, verbatim, for its reasons. */
  const { toggle } = reveal;
  const surfaceTap = useMemo(
    () =>
      Gesture.Tap()
        .cancelsTouchesInView(false)
        .runOnJS(true)
        .onEnd(() => toggle()),
    [toggle]
  );

  // Every item is exactly one screen — which is what makes `pagingEnabled` page cleanly and
  // `initialScrollIndex` exact (shape 2). Geometry, not theme, so it lives inline.
  const pageStyle = useMemo(
    () => ({ width: screenWidth, height: screenHeight }),
    [screenWidth, screenHeight]
  );

  const renderPage = useCallback(
    ({ item }: { item: number }) => (
      <View style={pageStyle}>
        <MushafPage pageNumber={item} onErrorChange={onPageErrorChange} />
      </View>
    ),
    [pageStyle, onPageErrorChange]
  );

  const keyExtractor = useCallback((item: number) => `page-${item}`, []);

  // What the chrome names: the settled page's surah, and the page number.
  const surahNumber = getFirstVerseForPage(currentPage).surah;
  const title = SURAH_METADATA[surahNumber - 1]?.nameTransliteration ?? null;
  const footnote = t('common:mushaf.footnote', { page: currentPage });

  return (
    <View style={styles.screen} testID="mushaf-surface">
      <GestureDetector gesture={surfaceTap}>
        <View style={styles.surface} testID="mushaf-tap-surface">
          <FlashList
            data={PAGE_DATA}
            renderItem={renderPage}
            keyExtractor={keyExtractor}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={pageToIndex(opening)}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={VIEWABILITY_CONFIG}
            testID="mushaf-list"
          />
        </View>
      </GestureDetector>
      <ReadingChrome reveal={reveal} title={title} footnote={footnote} />
    </View>
  );
}
