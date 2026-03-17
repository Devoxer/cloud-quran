import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import type { HizbMetadata } from 'quran-data';
import { getHizbForPage, getPageForVerse, HIZB_METADATA, SURAH_METADATA } from 'quran-data';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { useUIStore } from '@/theme/useUIStore';

export const ROW_HEIGHT = 64;
const MAX_CONTENT_WIDTH = 680;

export function HizbList() {
  const router = useRouter();
  const navigateToVerse = useUIStore((s) => s.navigateToVerse);
  const currentSurah = useUIStore((s) => s.currentSurah);
  const currentVerse = useUIStore((s) => s.currentVerse);
  const { tokens } = useTheme();
  const flashListRef = useRef<FlashListRef<HizbMetadata>>(null);

  const currentHizb = useMemo(() => {
    const page = getPageForVerse(currentSurah, currentVerse);
    return getHizbForPage(page);
  }, [currentSurah, currentVerse]);

  useEffect(() => {
    flashListRef.current?.scrollToIndex({
      index: currentHizb - 1,
      animated: false,
      viewPosition: 0.3,
    });
  }, [currentHizb]);

  const handlePress = useCallback(
    (hizb: HizbMetadata) => {
      navigateToVerse(hizb.startSurah, hizb.startVerse);
      router.navigate('/');
    },
    [navigateToVerse, router],
  );

  const renderItem = useCallback(
    ({ item }: { item: HizbMetadata }) => {
      const surahName = SURAH_METADATA[item.startSurah - 1]?.nameTransliteration ?? '';
      const isSelected = item.number === currentHizb;
      return (
        <Pressable
          onPress={() => handlePress(item)}
          style={({ pressed }) => [
            styles.row,
            isSelected && { backgroundColor: tokens.accent.highlight },
            pressed && { opacity: 0.7 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Hizb ${item.number}, Juz ${item.juz}, starts at ${surahName}`}
        >
          {isSelected && (
            <View style={[styles.selectedIndicator, { backgroundColor: tokens.accent.bookmark }]} />
          )}
          <View style={[styles.numberBadge, { borderColor: tokens.border }]}>
            <AppText variant="ui">{item.number}</AppText>
          </View>
          <View style={styles.info}>
            <AppText variant="surahTitleEnglish">Hizb {item.number}</AppText>
            <AppText variant="uiCaption">
              Juz' {item.juz} · {surahName} · Page {item.startPage}
            </AppText>
          </View>
        </Pressable>
      );
    },
    [handlePress, tokens.border, tokens.accent.highlight, tokens.accent.bookmark, currentHizb],
  );

  const keyExtractor = useCallback((item: HizbMetadata) => `hizb-${item.number}`, []);

  const separator = useCallback(
    () => <View style={[styles.separator, { backgroundColor: tokens.border }]} />,
    [tokens.border],
  );

  return (
    <FlashList
      ref={flashListRef}
      data={HIZB_METADATA}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      ItemSeparatorComponent={separator}
      contentContainerStyle={styles.content}
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
