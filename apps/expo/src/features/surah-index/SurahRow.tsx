import type { SurahMetadata } from 'quran-data';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { DownloadButton } from '@/features/audio/components/DownloadButton';
import { useAudioStore } from '@/features/audio/stores/useAudioStore';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

interface SurahRowProps {
  surah: SurahMetadata;
  onPress: (surahNumber: number) => void;
  isSelected?: boolean;
}

const ROW_HEIGHT = 72;

export const SurahRow = React.memo(function SurahRow({
  surah,
  onPress,
  isSelected,
}: SurahRowProps) {
  const { tokens } = useTheme();
  const selectedReciterId = useAudioStore((s) => s.selectedReciterId);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${surah.nameEnglish}, ${surah.nameArabic}, ${surah.verseCount} verses`}
      onPress={() => onPress(surah.number)}
      style={({ pressed }) => [
        styles.container,
        isSelected && { backgroundColor: tokens.accent.highlight },
        pressed && { opacity: 0.7 },
      ]}
    >
      {isSelected && (
        <View style={[styles.selectedIndicator, { backgroundColor: tokens.accent.bookmark }]} />
      )}

      <View style={[styles.numberBadge, { borderColor: tokens.border }]}>
        <AppText variant="ui">{surah.number}</AppText>
      </View>

      <View style={styles.info}>
        <AppText variant="surahTitleEnglish">{surah.nameEnglish}</AppText>
        <AppText variant="uiCaption">
          {surah.revelationType === 'meccan' ? 'Meccan' : 'Medinan'} · {surah.verseCount} verses
        </AppText>
      </View>

      <AppText variant="surahTitleArabic">{surah.nameArabic}</AppText>

      <DownloadButton reciterId={selectedReciterId} surahNumber={surah.number} size={20} />
    </Pressable>
  );
});

export { ROW_HEIGHT };

const styles = StyleSheet.create({
  container: {
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
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
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
});
