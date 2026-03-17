import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { useRouter } from 'expo-router';

import { getJuzForPage, getPageForVerse, JUZ_METADATA, SURAH_METADATA } from 'quran-data';
import type { JuzMetadata } from 'quran-data';

import { AppText } from '@/components/AppText';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { useUIStore } from '@/theme/useUIStore';

export const ROW_HEIGHT = 64;
const MAX_CONTENT_WIDTH = 680;

export function JuzList() {
  const router = useRouter();
  const navigateToVerse = useUIStore((s) => s.navigateToVerse);
  const currentSurah = useUIStore((s) => s.currentSurah);
  const currentVerse = useUIStore((s) => s.currentVerse);
  const { tokens } = useTheme();
  const flatListRef = useRef<FlatList>(null);

  const currentJuz = useMemo(() => {
    const page = getPageForVerse(currentSurah, currentVerse);
    return getJuzForPage(page);
  }, [currentSurah, currentVerse]);

  useEffect(() => {
    flatListRef.current?.scrollToIndex({
      index: currentJuz - 1,
      animated: false,
      viewPosition: 0.3,
    });
  }, [currentJuz]);

  const handlePress = useCallback(
    (juz: JuzMetadata) => {
      navigateToVerse(juz.startSurah, juz.startVerse);
      router.navigate('/');
    },
    [navigateToVerse, router],
  );

  const renderItem = useCallback(
    ({ item }: { item: JuzMetadata }) => {
      const surahName = SURAH_METADATA[item.startSurah - 1]?.nameTransliteration ?? '';
      const isSelected = item.number === currentJuz;
      return (
        <Pressable
          onPress={() => handlePress(item)}
          style={({ pressed }) => [
            styles.row,
            isSelected && { backgroundColor: tokens.accent.highlight },
            pressed && { opacity: 0.7 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Juz ${item.number}, starts at ${surahName}`}
        >
          {isSelected && (
            <View
              style={[styles.selectedIndicator, { backgroundColor: tokens.accent.bookmark }]}
            />
          )}
          <View style={[styles.numberBadge, { borderColor: tokens.border }]}>
            <AppText variant="ui">{item.number}</AppText>
          </View>
          <View style={styles.info}>
            <AppText variant="surahTitleEnglish">Juz' {item.number}</AppText>
            <AppText variant="uiCaption">
              Starts: {surahName} · Page {item.startPage}
            </AppText>
          </View>
        </Pressable>
      );
    },
    [handlePress, tokens.border, tokens.accent.highlight, tokens.accent.bookmark, currentJuz],
  );

  const keyExtractor = useCallback((item: JuzMetadata) => `juz-${item.number}`, []);

  const getItemLayout = useCallback(
    (_data: unknown, index: number) => ({
      length: ROW_HEIGHT + StyleSheet.hairlineWidth,
      offset: (ROW_HEIGHT + StyleSheet.hairlineWidth) * index,
      index,
    }),
    [],
  );

  const separator = useCallback(
    () => <View style={[styles.separator, { backgroundColor: tokens.border }]} />,
    [tokens.border],
  );

  return (
    <FlatList
      ref={flatListRef}
      data={JUZ_METADATA}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      getItemLayout={getItemLayout}
      ItemSeparatorComponent={separator}
      contentContainerStyle={styles.content}
      initialNumToRender={20}
      maxToRenderPerBatch={15}
    />
  );
}

const styles = StyleSheet.create({
  content: {
    maxWidth: MAX_CONTENT_WIDTH,
    width: '100%',
    alignSelf: 'center' as const,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: ROW_HEIGHT,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  selectedIndicator: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  numberBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  info: {
    flex: 1,
    gap: spacing.xs,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: spacing.lg + 36 + spacing.md,
  },
});
