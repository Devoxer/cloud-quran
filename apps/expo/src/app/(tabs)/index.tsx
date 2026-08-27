import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useFocusEffect } from 'expo-router';
import { getFirstVerseForPage, getPageForVerse, SURAH_METADATA, TOTAL_PAGES } from 'quran-data';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWindowDimensions, View, type ViewToken } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { MushafPage, ReadingChrome, useChromeReveal } from '@/features/reading';
import { preloadAdjacentPageFonts } from '@/lib/mushafFonts';
import { type ReadingPositionPair, usePosition } from '@/lib/usePosition';
import { useThemedStyles } from '@/lib/useThemedStyles';

/**
 * MUSHAF MODE — the 604-page facsimile surface (story 6-2), and THE HOME SURFACE since story
 * 6-6: this file is `(tabs)/index.tsx`, so it serves `/` directly — the app opens on the mushaf
 * at the reader's last-read position, with no redirect hop (`app/index.tsx` is deleted, exactly
 * as its own docblock demanded the moment `(tabs)` had an index again).
 *
 * ⚠️ ITS ADDRESS CHANGED IN 6-6 AND ITS IMMERSION DID NOT. The root-sibling `fullScreenModal`
 * registration is gone; "immersive" is a property WE own — the chrome overlays, starts hidden,
 * and the navigator draws no bar and no header of its own. `AppTabBar` is mounted HERE, inside
 * `ReadingChrome`, riding the same reveal driver as the header. This source must never contain
 * the header-visibility option (`custom-chrome.test.ts` scans for it).
 *
 * ── The shapes that are load-bearing here (6-2, plus 6-6's resync) ───────────────────────────
 *
 * 1. **REVERSED DATA, NOT `inverted`.** `PAGE_DATA` is `[604 … 1]`, one strategy on every
 *    platform: page 1 sits at index 603, and advancing a finger left-to-right lands on a LOWER
 *    index = HIGHER page — the RTL page turn. The pre-fork ran `inverted` on native and reversed
 *    data on web because `inverted` broke web scroll/drag.
 *
 * 2. **`initialScrollIndex` IS ALLOWED HERE, AND THE DIFFERENCE FROM `read.tsx` IS THE ITEM.**
 *    A mushaf page is a UNIFORM full-screen item — index × width IS the offset, exactly, so the
 *    restore can be declarative (and the focus resync's `scrollToIndex` exact). The saved
 *    `(surah, verse)` pair is resolved as a pair: `getPageForVerse` answers -1 for any pair not
 *    in the map, and -1 clamps to page 1 — the documented fallback.
 *
 * 3. **ONE POSITION WRITE PER SETTLED PAGE, ZERO WITHIN A PAGE, AND ZERO ON A RESTORE.** The
 *    viewability callback reports the settled page's FIRST verse through `usePosition('mushaf')`,
 *    whose verse-changed comparison is the throttle. The `moved` latch guards the restore: the
 *    target page's own settle is the restore landing, and reporting that page's first verse
 *    would OVERWRITE the saved verse with an earlier one (a reader at 2:255 opens page 42, whose
 *    first verse is 2:253) and spend a write on no movement. ⚠️ Since 6-6 the latch re-arms on a
 *    FOCUS RESYNC too, for the same reason: a jump to where the other renderer moved the pair is
 *    not the reader moving.
 *
 * 4. **THE FOCUS RESYNC — one position, two renderers.** While focused, the reader owns where
 *    they are (a sync arriving mid-read never yanks the page). On focus — a tab switch or the
 *    mode toggle — the saved pair is re-resolved, and if reading mode moved it, this surface
 *    jumps to that verse's page. That is what makes the toggle mean "same place, different
 *    renderer".
 *
 * 5. **THE TAP IS THE SAME RNGH GESTURE AS `read.tsx`**, `.cancelsTouchesInView(false)` and all
 *    — a drag fails the recognizer, which is how a page-turn swipe is distinguished from a
 *    chrome tap. The chrome is a SIBLING of the detector, one driver, no second animation source.
 *
 * 6. **A PAGE THAT FAILS reveals the chrome — on BOTH edges, and only for the page the reader is
 *    LOOKING at.** FlashList renders neighbours off-screen; offline, an uncached neighbour fails
 *    too, and revealing the exit for a page nobody can see would flash the bars mid-read. A page
 *    usually fails while it is still an off-screen neighbour and only becomes visible afterwards
 *    — `failedPages` is what lets the second edge (the page becoming current) ask the question.
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
 * The page this screen targets — the saved pair resolved as a PAIR. A pair the map does not hold
 * answers -1, which clamps to page 1; there is no half-trusted surah or verse for the clamp to
 * miss (the family of defects `read.tsx`'s `openingPosition` documents).
 */
function openingPage(saved: ReadingPositionPair | null): number {
  if (!saved) return 1;
  const page = getPageForVerse(saved.surah, saved.verse);
  return page >= 1 && page <= TOTAL_PAGES ? page : 1;
}

export default function Mushaf() {
  const reveal = useChromeReveal();
  const { saved, reportVerse } = usePosition('mushaf');
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  // Resolved once per focus — the reader owns where they are in between (see `read.tsx`).
  const [opening] = useState(() => openingPage(saved));
  const [currentPage, setCurrentPage] = useState(opening);
  // Mirrored into a ref so the error callback can ask "is that the visible page?" without
  // changing identity per page turn (identity-stable handlers are what FlashList requires).
  const currentPageRef = useRef(opening);
  // The restore latch — shape 3 in the header. One-shot per RESTORE TARGET, never a comparison.
  const moved = useRef(false);
  // Where the current restore is headed: the opening page on mount, a fresh page on focus resync.
  const restoreTarget = useRef(opening);
  // The saved row at focus time, without re-creating the focus callback per render.
  const savedRef = useRef(saved);
  savedRef.current = saved;
  const listRef = useRef<FlashListRef<number>>(null);
  /**
   * Which pages are currently in a failed state — shape 6 in the header. A SET rather than
   * "the page that just failed", because the reveal has TWO edges: a page can fail while it is
   * still an off-screen neighbour, and then become the page the reader is looking at. Kept
   * honest in both directions (a successful retry removes the entry) so returning to a page
   * that has since loaded does not flash the bars.
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

  /** The focus resync — shape 4 in the header. A no-op on first mount and on any focus where
   * the saved pair still resolves to the page already under the reader. */
  useFocusEffect(
    useCallback(() => {
      const fresh = openingPage(savedRef.current);
      if (fresh === currentPageRef.current) return;
      restoreTarget.current = fresh;
      moved.current = false;
      currentPageRef.current = fresh;
      setCurrentPage(fresh);
      listRef.current?.scrollToIndex({ index: pageToIndex(fresh), animated: false });
    }, [])
  );

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
        if (page === restoreTarget.current) return; // a restore settling is not a move
        moved.current = true;
      }
      const first = getFirstVerseForPage(page);
      if (first.surah === 0) return; // out-of-range answer — nothing true to write
      // Reported every time. `usePosition` decides whether it is a write.
      reportVerse(first.surah, first.verse);
    },
    [reportVerse, show]
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

  // What the chrome names: the settled page's surah. The page number is not repeated — the
  // facsimile page draws its own (story 6-6's intent: the header carries controls).
  const surahNumber = getFirstVerseForPage(currentPage).surah;
  const title = SURAH_METADATA[surahNumber - 1]?.nameTransliteration ?? null;

  return (
    <View style={styles.screen} testID="mushaf-surface">
      <GestureDetector gesture={surfaceTap}>
        <View style={styles.surface} testID="mushaf-tap-surface">
          <FlashList
            ref={listRef}
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
      <ReadingChrome reveal={reveal} title={title} mode="mushaf" />
    </View>
  );
}
