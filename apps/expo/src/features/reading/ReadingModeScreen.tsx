import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SURAH_METADATA } from 'quran-data';

import { AppText } from '@/components/AppText';
import { Surface } from '@/components/Surface';
import type { VerseWithTranslation } from '@/services/sqlite';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { useUIStore } from '@/theme/useUIStore';

import { useAudioStore } from '@/features/audio/stores/useAudioStore';

import { useVerses } from './hooks/useVerses';
import { ReadingChromeOverlay } from './ReadingChromeOverlay';
import { SurahHeader } from './SurahHeader';
import { SurahNavigator } from './SurahNavigator';
import { VerseJumpModal } from './VerseJumpModal';
import { VerseRow } from './VerseRow';
import { WelcomeBackBanner } from './WelcomeBackBanner';

// Pressable on web (onTouchEnd doesn't fire for mouse clicks),
// View on native (Pressable interferes with FlatList scroll gestures)
const TapContainer = Platform.OS === 'web' ? Pressable : View;
const FooterGuard = Platform.OS === 'web' ? Pressable : View;

function ItemSeparator() {
  return <View style={styles.separator} />;
}

export function ReadingModeScreen() {
  const surahNumber = useUIStore((s) => s.currentSurah);
  const currentVerse = useUIStore((s) => s.currentVerse);
  const setCurrentSurah = useUIStore((s) => s.setCurrentSurah);
  const setCurrentVerse = useUIStore((s) => s.setCurrentVerse);
  const toggleChrome = useUIStore((s) => s.toggleChrome);
  const hideChrome = useUIStore((s) => s.hideChrome);
  const isChromeVisible = useUIStore((s) => s.isChromeVisible);
  const scrollVersion = useUIStore((s) => s.scrollVersion);
  const activeVerseKey = useAudioStore((s) => s.activeVerseKey);
  const activeVerseKeyRef = useRef(activeVerseKey);
  activeVerseKeyRef.current = activeVerseKey;
  const autoFollowAudio = useUIStore((s) => s.autoFollowAudio);
  const { verses, isLoading, error, retry } = useVerses(surahNumber);
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const metadata = SURAH_METADATA[surahNumber - 1];
  const [isVerseJumpVisible, setIsVerseJumpVisible] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [isPositionReady, setIsPositionReady] = useState(currentVerse <= 1);
  const isAudioPlaying = useAudioStore((s) => s.isPlaying);
  const flatListRef = useRef<FlatList>(null);
  const isScrolling = useRef(false);
  const scrollCooldownUntil = useRef(0);
  const autoHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialVerse = useRef(currentVerse);
  const hasMounted = useRef(false);
  const lastScrollVersion = useRef(scrollVersion);
  // Render enough items upfront so scrollToIndex succeeds without cascading retries
  const initialRenderCount = useRef(Math.max(20, currentVerse + 5)).current;
  const scrollViewOffset = insets.top + spacing.lg;
  const contentStyle = useMemo(
    () => [styles.content, { paddingTop: scrollViewOffset }],
    [scrollViewOffset],
  );

  // CRITICAL: These must be useRef to remain stable — FlatList throws if they change after mount
  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
    minimumViewTime: 500,
  }).current;

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ item: VerseWithTranslation }> }) => {
      if (viewableItems.length > 0) {
        const item = viewableItems[0].item;
        setCurrentVerse(item.verseNumber);
        useUIStore.getState().setFirstVisibleVerse(`${item.surahNumber}:${item.verseNumber}`);
      }
    },
  ).current;

  const onScrollToIndexFailed = useCallback(
    (info: { index: number; averageItemLength: number }) => {
      const offset = info.averageItemLength * info.index;
      flatListRef.current?.scrollToOffset({ offset, animated: false });
      setTimeout(() => {
        flatListRef.current?.scrollToIndex({
          index: info.index,
          animated: false,
          viewPosition: 0,
          viewOffset: scrollViewOffset,
        });
        setIsPositionReady(true);
      }, 100);
    },
    [scrollViewOffset],
  );

  // On initial mount, scroll to saved verse position. On surah change, scroll to top.
  useEffect(() => {
    if (!hasMounted.current) {
      if (verses.length === 0) return; // Wait for async data before considering "mounted"
      hasMounted.current = true;
      if (initialVerse.current > 1) {
        const index = Math.min(initialVerse.current - 1, verses.length - 1);
        const timer = setTimeout(() => {
          flatListRef.current?.scrollToIndex({
            index,
            animated: false,
            viewPosition: 0,
            viewOffset: scrollViewOffset,
          });
          setIsPositionReady(true);
        }, 100);
        return () => clearTimeout(timer);
      }
      return;
    }
    // Surah change: scroll to top
    flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [surahNumber, verses.length]);

  // Scroll to target verse when navigating from bookmarks (or other external navigation)
  useEffect(() => {
    if (scrollVersion === lastScrollVersion.current) return;
    if (verses.length === 0) return; // Wait for data before scrolling
    lastScrollVersion.current = scrollVersion;
    const targetVerse = useUIStore.getState().currentVerse;
    const index = Math.min(targetVerse - 1, verses.length - 1);
    if (index <= 0) {
      flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
    } else {
      setTimeout(() => {
        flatListRef.current?.scrollToIndex({
          index,
          animated: false,
          viewPosition: 0,
          viewOffset: scrollViewOffset,
        });
      }, 100);
    }
  }, [scrollVersion, scrollViewOffset, verses.length]);

  // Auto-hide chrome after 3 seconds
  useEffect(() => {
    if (isChromeVisible) {
      autoHideTimer.current = setTimeout(() => {
        hideChrome();
      }, 3000);
    }
    return () => {
      if (autoHideTimer.current) clearTimeout(autoHideTimer.current);
    };
  }, [isChromeVisible, hideChrome]);

  // Auto-scroll to highlighted verse during audio playback
  useEffect(() => {
    if (!activeVerseKey || !isAudioPlaying || !autoFollowAudio || verses.length === 0) return;
    if (isScrolling.current) return;
    if (Date.now() < scrollCooldownUntil.current) return;

    const [, verseStr] = activeVerseKey.split(':');
    const verseNum = parseInt(verseStr, 10);
    if (isNaN(verseNum)) return;

    const index = verseNum - 1;
    if (index < 0 || index >= verses.length) return;

    flatListRef.current?.scrollToIndex({
      index,
      animated: true,
      viewPosition: 0.3,
    });
  }, [activeVerseKey, isAudioPlaying, autoFollowAudio, verses.length]);

  const handleVerseJump = useCallback(
    (verseNumber: number) => {
      const index = verseNumber - 1;
      flatListRef.current?.scrollToIndex({
        index,
        animated: true,
        viewPosition: 0,
        viewOffset: scrollViewOffset,
      });
      setIsVerseJumpVisible(false);
      hideChrome();
    },
    [hideChrome, scrollViewOffset],
  );

  const handleScrollBeginDrag = useCallback(() => {
    isScrolling.current = true;
    if (isChromeVisible) hideChrome();
    setBannerDismissed(true);
  }, [isChromeVisible, hideChrome]);

  // Native: View + onTouchEnd (doesn't interfere with FlatList scroll gestures)
  // Web: Pressable + onPress (onTouchEnd doesn't fire for mouse clicks)
  const handleTouchEnd = useCallback(() => {
    if (!isScrolling.current) {
      toggleChrome();
    }
    isScrolling.current = false;
  }, [toggleChrome]);

  const handleScrollEnd = useCallback(() => {
    isScrolling.current = false;
    scrollCooldownUntil.current = Date.now() + 500;
  }, []);

  const tapContainerProps =
    Platform.OS === 'web' ? { onPress: handleTouchEnd } : { onTouchEnd: handleTouchEnd };

  const keyExtractor = useCallback(
    (item: VerseWithTranslation) => `${item.surahNumber}:${item.verseNumber}`,
    [],
  );

  const renderItem = useCallback(
    ({ item }: { item: VerseWithTranslation }) => (
      <VerseRow
        surahNumber={item.surahNumber}
        verseNumber={item.verseNumber}
        uthmaniText={item.uthmaniText}
        translationText={item.translationText}
        isHighlighted={`${item.surahNumber}:${item.verseNumber}` === activeVerseKeyRef.current}
      />
    ),
    [],
  );

  const renderHeader = useCallback(
    () => (
      <SurahHeader
        surahNumber={metadata.number}
        nameArabic={metadata.nameArabic}
        nameEnglish={metadata.nameEnglish}
        verseCount={metadata.verseCount}
        revelationType={metadata.revelationType}
      />
    ),
    [metadata],
  );

  const footerGuardProps =
    Platform.OS === 'web'
      ? { onPress: (e: { stopPropagation: () => void }) => e.stopPropagation() }
      : { onTouchEnd: (e: { stopPropagation: () => void }) => e.stopPropagation() };

  const renderFooter = useCallback(
    () => (
      <FooterGuard {...(footerGuardProps as any)}>
        <SurahNavigator currentSurah={surahNumber} onNavigate={setCurrentSurah} />
      </FooterGuard>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [surahNumber, setCurrentSurah],
  );

  if (isLoading) {
    return (
      <Surface style={styles.centered}>
        <ActivityIndicator size="large" color={tokens.accent.audio} />
      </Surface>
    );
  }

  if (error) {
    return (
      <Surface style={styles.centered}>
        <AppText variant="ui">Failed to load verses</AppText>
        <AppText variant="uiCaption">{error.message}</AppText>
        <View style={styles.retryButton}>
          <AppText variant="ui" onPress={retry}>
            Retry
          </AppText>
        </View>
      </Surface>
    );
  }

  return (
    <Surface>
      {!isPositionReady && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={tokens.accent.audio} />
        </View>
      )}
      <TapContainer
        style={[styles.flex, !isPositionReady && styles.hidden]}
        {...(tapContainerProps as any)}
      >
        <FlatList
          ref={flatListRef}
          data={verses}
          extraData={activeVerseKey}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          ListHeaderComponent={renderHeader}
          ListFooterComponent={renderFooter}
          ItemSeparatorComponent={ItemSeparator}
          contentContainerStyle={contentStyle}
          onScrollBeginDrag={handleScrollBeginDrag}
          onScrollEndDrag={handleScrollEnd}
          onMomentumScrollEnd={handleScrollEnd}
          viewabilityConfig={viewabilityConfig}
          onViewableItemsChanged={onViewableItemsChanged}
          onScrollToIndexFailed={onScrollToIndexFailed}
          scrollEventThrottle={16}
          initialNumToRender={initialRenderCount}
          maxToRenderPerBatch={10}
          windowSize={5}
        />
      </TapContainer>
      {isPositionReady && (
        <>
          <ReadingChromeOverlay onVerseJumpPress={() => setIsVerseJumpVisible(true)} />
          <WelcomeBackBanner
            onDismiss={() => setBannerDismissed(true)}
            dismissed={bannerDismissed}
          />
          <VerseJumpModal
            visible={isVerseJumpVisible}
            verseCount={metadata.verseCount}
            onJump={handleVerseJump}
            onClose={() => setIsVerseJumpVisible(false)}
          />
        </>
      )}
    </Surface>
  );
}

const MAX_CONTENT_WIDTH = 680;

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    maxWidth: MAX_CONTENT_WIDTH,
    width: '100%',
    alignSelf: 'center',
  },
  separator: {
    height: spacing.xl,
  },
  hidden: {
    opacity: 0,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  retryButton: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
  },
});
