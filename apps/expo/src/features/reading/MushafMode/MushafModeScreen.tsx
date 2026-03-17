import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  type LayoutChangeEvent,
  Platform,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';

import { getFirstVerseForPage, getPageForVerse, TOTAL_PAGES } from 'quran-data';

import { Surface } from '@/components/Surface';
import { useAudioStore } from '@/features/audio/stores/useAudioStore';
import { preloadAdjacentFonts } from '@/services/mushaf-fonts';
import { useUIStore } from '@/theme/useUIStore';

import { ReadingChromeOverlay } from '../ReadingChromeOverlay';

import { MushafPage } from './MushafPage';

const IS_WEB = Platform.OS === 'web';

// Dual-page spread breakpoint (web only): show two facing pages when viewport is large enough
const MIN_DUAL_WIDTH = 1100;
const MIN_DUAL_HEIGHT = 700;

// For web: reverse data so page 604 is at index 0 (left), page 1 at index 603 (right)
// This achieves RTL order naturally without inverted (which breaks web scroll/drag)
// For native: normal order with inverted={true} on FlatList
const PAGE_DATA = IS_WEB
  ? Array.from({ length: TOTAL_PAGES }, (_, i) => TOTAL_PAGES - i)
  : Array.from({ length: TOTAL_PAGES }, (_, i) => i + 1);

function pageToIndex(page: number): number {
  return IS_WEB ? TOTAL_PAGES - page : page - 1;
}

/**
 * On Safari/Chrome, CSS scroll-snap (from pagingEnabled) fights programmatic scrollTo.
 * Workaround: temporarily disable scroll-snap on the DOM node, then use FlatList's
 * scrollToIndex. Re-enable snap on next user touch or after a safety timeout.
 * Global timer/listener tracking prevents race conditions from rapid successive calls.
 */
let _snapTimer: ReturnType<typeof setTimeout> | null = null;
let _snapListener: (() => void) | null = null;

function scrollFlatListToIndex(
  flatListRef: React.RefObject<FlatList | null>,
  index: number,
  _screenWidth: number,
) {
  if (!flatListRef.current) return;

  if (IS_WEB) {
    const scrollNode = (flatListRef.current as any).getScrollableNode?.();
    if (scrollNode?.style) {
      // Cancel any previous re-enable timer/listener
      if (_snapTimer) clearTimeout(_snapTimer);
      if (_snapListener) scrollNode.removeEventListener('pointerdown', _snapListener);

      scrollNode.style.scrollSnapType = 'none';

      const reEnableSnap = () => {
        scrollNode.style.scrollSnapType = 'x mandatory';
        scrollNode.removeEventListener('pointerdown', reEnableSnap);
        if (_snapTimer) clearTimeout(_snapTimer);
        _snapTimer = null;
        _snapListener = null;
      };
      _snapListener = reEnableSnap;
      scrollNode.addEventListener('pointerdown', reEnableSnap, { once: true });
      _snapTimer = setTimeout(reEnableSnap, 1000);
    }
  }

  flatListRef.current.scrollToIndex({ index, animated: false });
}

export function MushafModeScreen() {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const syncReadingPosition = useUIStore((s) => s.syncReadingPosition);
  const scrollVersion = useUIStore((s) => s.scrollVersion);
  const toggleChrome = useUIStore((s) => s.toggleChrome);
  const hideChrome = useUIStore((s) => s.hideChrome);
  const isChromeVisible = useUIStore((s) => s.isChromeVisible);

  const activeVerseKey = useAudioStore((s) => s.activeVerseKey);
  const isAudioPlaying = useAudioStore((s) => s.isPlaying);
  const autoFollowAudio = useUIStore((s) => s.autoFollowAudio);

  const flatListRef = useRef<FlatList>(null);
  const isScrolling = useRef(false);
  const autoHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const positionDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentPageRef = useRef(0);
  const hasScrolledToInitial = useRef(false);
  const lastScrollVersion = useRef(scrollVersion);

  // Derive initial page from reading position (read once, don't subscribe)
  const [currentPage, setCurrentPage] = useState(() => {
    const { currentSurah, currentVerse } = useUIStore.getState();
    return Math.max(1, getPageForVerse(currentSurah, currentVerse));
  });

  // Web-only: measure actual container height (browser chrome reduces available height)
  // Native: always use screenHeight to avoid re-render layout flash that breaks justify-between
  const [webContainerHeight, setWebContainerHeight] = useState(screenHeight);
  const pageHeight = IS_WEB ? webContainerHeight : screenHeight;

  // Dual-page spread mode for wide web viewports
  const isDualPage = IS_WEB && screenWidth >= MIN_DUAL_WIDTH && pageHeight >= MIN_DUAL_HEIGHT;
  const isDualPageRef = useRef(isDualPage);
  isDualPageRef.current = isDualPage;

  // Keep ref in sync for flush-on-unmount
  currentPageRef.current = currentPage;

  // Auto-hide chrome after 3 seconds
  useEffect(() => {
    if (isChromeVisible) {
      autoHideTimer.current = setTimeout(() => hideChrome(), 3000);
    }
    return () => {
      if (autoHideTimer.current) clearTimeout(autoHideTimer.current);
    };
  }, [isChromeVisible, hideChrome]);

  // Preload adjacent fonts when page changes
  useEffect(() => {
    preloadAdjacentFonts(currentPage);
  }, [currentPage]);

  // Auto-advance page when audio highlighting crosses a page boundary
  useEffect(() => {
    if (!activeVerseKey || !isAudioPlaying || !autoFollowAudio) return;
    if (isScrolling.current) return;

    const [surahStr, verseStr] = activeVerseKey.split(':');
    const surah = parseInt(surahStr, 10);
    const verse = parseInt(verseStr, 10);
    if (isNaN(surah) || isNaN(verse)) return;

    const targetPage = getPageForVerse(surah, verse);
    if (targetPage <= 0 || targetPage === currentPageRef.current) return;

    if (positionDebounce.current) {
      clearTimeout(positionDebounce.current);
      positionDebounce.current = null;
    }
    currentPageRef.current = targetPage;
    setCurrentPage(targetPage);

    if (isDualPageRef.current) {
      syncReadingPosition(surah, verse);
    } else {
      scrollFlatListToIndex(flatListRef, pageToIndex(targetPage), screenWidth);
    }
  }, [activeVerseKey, isAudioPlaying, autoFollowAudio, screenWidth, syncReadingPosition]);

  // Flush pending position on unmount (fixes stale position on mode switch)
  useEffect(() => {
    return () => {
      if (positionDebounce.current) {
        clearTimeout(positionDebounce.current);
        positionDebounce.current = null;
        const { surah, verse } = getFirstVerseForPage(currentPageRef.current);
        syncReadingPosition(surah, verse);
      }
    };
  }, [syncReadingPosition]);

  // React to external navigation (e.g. surah index selecting a surah)
  // Only triggers when scrollVersion changes (from navigateToVerse), not from
  // internal scroll-tracking (syncReadingPosition) which doesn't bump scrollVersion
  useEffect(() => {
    if (scrollVersion === lastScrollVersion.current) return;
    lastScrollVersion.current = scrollVersion;
    const { currentSurah: surah, currentVerse: verse } = useUIStore.getState();
    const targetPage = getPageForVerse(surah, verse);
    if (targetPage > 0 && targetPage !== currentPageRef.current) {
      // Cancel pending debounced position update to prevent stale scroll-back
      if (positionDebounce.current) {
        clearTimeout(positionDebounce.current);
        positionDebounce.current = null;
      }
      currentPageRef.current = targetPage;
      setCurrentPage(targetPage);
      if (!isDualPageRef.current) {
        scrollFlatListToIndex(flatListRef, pageToIndex(targetPage), screenWidth);
      }
    }
  }, [scrollVersion, screenWidth]);

  // Web keyboard navigation (left/right arrow keys)
  useEffect(() => {
    if (!IS_WEB) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const step = isDualPageRef.current ? 2 : 1;
      let targetPage: number | null = null;
      if (e.key === 'ArrowLeft') {
        targetPage = Math.min(TOTAL_PAGES, currentPageRef.current + step);
      } else if (e.key === 'ArrowRight') {
        targetPage = Math.max(1, currentPageRef.current - step);
      }
      if (targetPage !== null && targetPage !== currentPageRef.current) {
        if (positionDebounce.current) {
          clearTimeout(positionDebounce.current);
          positionDebounce.current = null;
        }
        currentPageRef.current = targetPage;
        setCurrentPage(targetPage);
        if (!isDualPageRef.current) {
          scrollFlatListToIndex(flatListRef, pageToIndex(targetPage), screenWidth);
        } else {
          // In dual mode, sync position immediately (no FlatList viewability callback)
          const { surah, verse } = getFirstVerseForPage(targetPage);
          syncReadingPosition(surah, verse);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [screenWidth, syncReadingPosition]);

  // Fix resize auto-navigation: re-scroll to current page when screen width changes
  const prevScreenWidth = useRef(screenWidth);
  useEffect(() => {
    if (!IS_WEB || isDualPageRef.current) return;
    if (prevScreenWidth.current !== screenWidth) {
      prevScreenWidth.current = screenWidth;
      if (positionDebounce.current) {
        clearTimeout(positionDebounce.current);
        positionDebounce.current = null;
      }
      requestAnimationFrame(() => {
        scrollFlatListToIndex(flatListRef, pageToIndex(currentPageRef.current), screenWidth);
      });
    }
  }, [screenWidth]);

  // Measure container height (shared by single-page FlatList and dual-page spread)
  const handleContainerLayout = useCallback((e: LayoutChangeEvent) => {
    if (IS_WEB) {
      const { height } = e.nativeEvent.layout;
      if (height > 0) setWebContainerHeight(height);
    }
  }, []);

  const handleFlatListLayout = useCallback(
    (e: LayoutChangeEvent) => {
      handleContainerLayout(e);

      // Fix web scroll jump-back: scroll to initial position after layout
      if (!hasScrolledToInitial.current && IS_WEB) {
        hasScrolledToInitial.current = true;
        requestAnimationFrame(() => {
          scrollFlatListToIndex(flatListRef, pageToIndex(currentPage), screenWidth);
        });
      }
    },
    [currentPage, screenWidth, handleContainerLayout],
  );

  // Safety net: if scrollToIndex fails, fall back to scrollToOffset
  const handleScrollToIndexFailed = useCallback(
    (info: { index: number; averageItemLength: number }) => {
      flatListRef.current?.scrollToOffset({
        offset: info.index * screenWidth,
        animated: false,
      });
    },
    [screenWidth],
  );

  // getItemLayout for O(1) scroll positioning
  const getItemLayout = useCallback(
    (_: any, index: number) => ({
      length: screenWidth,
      offset: screenWidth * index,
      index,
    }),
    [screenWidth],
  );

  // Track current page from scroll position (debounced position update)
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ item: number }> }) => {
      if (viewableItems.length > 0) {
        const page = viewableItems[0].item;
        setCurrentPage(page);

        // Debounce store update to avoid spamming on fast swipes
        // Uses syncReadingPosition (no scrollVersion bump) to avoid
        // re-triggering the external navigation effect
        if (positionDebounce.current) clearTimeout(positionDebounce.current);
        positionDebounce.current = setTimeout(() => {
          const { surah, verse } = getFirstVerseForPage(page);
          syncReadingPosition(surah, verse);
          useUIStore.getState().setFirstVisibleVerse(`${surah}:${verse}`);
        }, 300);
      }
    },
  ).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  }).current;

  const handleTap = useCallback(() => {
    if (!isScrolling.current) {
      toggleChrome();
    }
  }, [toggleChrome]);

  // Use ref for isChromeVisible to avoid recreating callback on chrome toggle
  const isChromeVisibleRef = useRef(isChromeVisible);
  isChromeVisibleRef.current = isChromeVisible;

  const handleScrollBeginDrag = useCallback(() => {
    isScrolling.current = true;
    if (isChromeVisibleRef.current) hideChrome();
  }, [hideChrome]);

  const handleScrollEnd = useCallback(() => {
    isScrolling.current = false;
  }, []);

  const pageStyle = useMemo(
    () => ({ width: screenWidth, height: pageHeight }),
    [screenWidth, pageHeight],
  );

  const renderPage = useCallback(
    ({ item: pageNumber }: { item: number }) => {
      const content = <MushafPage pageNumber={pageNumber} onTap={handleTap} />;
      return (
        <View style={pageStyle}>
          {IS_WEB ? <View style={styles.webPageInner}>{content}</View> : content}
        </View>
      );
    },
    [pageStyle, handleTap],
  );

  const keyExtractor = useCallback((item: number) => `page-${item}`, []);

  // Content width for font sizing in dual-page mode (each page column width)
  // Cap by height: 15 lines × fontSize(0.059w) × 1.4 lineHeight = w × 1.239
  // Using pageHeight/1.75 ensures text uses ≤72% of height, leaving room for
  // header, page number, padding, surah headers, and space-evenly gaps
  const dualContentWidth = isDualPage
    ? Math.min(Math.floor(screenWidth / 2), Math.floor(pageHeight / 1.75))
    : undefined;

  // --- DUAL-PAGE SPREAD MODE (web only, wide viewport) ---
  if (isDualPage) {
    // Odd page on right (read first in RTL), even page on left
    const rightPage = currentPage % 2 === 1 ? currentPage : currentPage - 1;
    const leftPage = rightPage + 1 <= TOTAL_PAGES ? rightPage + 1 : null;

    return (
      <Surface>
        <View style={styles.container} onLayout={handleContainerLayout}>
          <View style={styles.spreadContainer}>
            <View style={styles.spreadPage}>
              {leftPage ? (
                <MushafPage
                  pageNumber={leftPage}
                  onTap={handleTap}
                  contentWidth={dualContentWidth}
                />
              ) : (
                <View style={styles.spreadPage} />
              )}
            </View>
            <View style={styles.spreadPage}>
              <MushafPage
                pageNumber={rightPage}
                onTap={handleTap}
                contentWidth={dualContentWidth}
              />
            </View>
          </View>
        </View>
        <ReadingChromeOverlay />
      </Surface>
    );
  }

  // --- SINGLE-PAGE MODE (native + narrow web) ---
  return (
    <Surface>
      <View style={styles.container}>
        <FlatList
          ref={flatListRef}
          data={PAGE_DATA}
          renderItem={renderPage}
          keyExtractor={keyExtractor}
          horizontal
          pagingEnabled
          inverted={!IS_WEB}
          showsHorizontalScrollIndicator={false}
          getItemLayout={getItemLayout}
          initialScrollIndex={pageToIndex(currentPage)}
          onLayout={handleFlatListLayout}
          onScrollToIndexFailed={handleScrollToIndexFailed}
          onScrollBeginDrag={handleScrollBeginDrag}
          onScrollEndDrag={handleScrollEnd}
          onMomentumScrollEnd={handleScrollEnd}
          viewabilityConfig={viewabilityConfig}
          onViewableItemsChanged={onViewableItemsChanged}
          windowSize={3}
          maxToRenderPerBatch={2}
          removeClippedSubviews
        />
      </View>
      <ReadingChromeOverlay />
    </Surface>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webPageInner: {
    flex: 1,
    maxWidth: 700,
    width: '100%',
    alignSelf: 'center',
  },
  spreadContainer: {
    flex: 1,
    flexDirection: 'row',
  },
  spreadPage: {
    flex: 1,
  },
});
