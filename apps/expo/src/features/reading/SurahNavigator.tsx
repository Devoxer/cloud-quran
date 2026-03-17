import { SURAH_METADATA } from 'quran-data';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

interface SurahNavigatorProps {
  currentSurah: number;
  onNavigate: (surahNumber: number) => void;
}

export const SurahNavigator = React.memo(function SurahNavigator({
  currentSurah,
  onNavigate,
}: SurahNavigatorProps) {
  const { tokens } = useTheme();

  const prevSurah = currentSurah === 1 ? 114 : currentSurah - 1;
  const nextSurah = currentSurah === 114 ? 1 : currentSurah + 1;

  const prevMetadata = SURAH_METADATA[prevSurah - 1];
  const nextMetadata = SURAH_METADATA[nextSurah - 1];

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Previous surah: ${prevMetadata.nameEnglish}`}
        onPress={() => onNavigate(prevSurah)}
        style={({ pressed }) => [
          styles.button,
          { borderColor: tokens.border },
          pressed && { opacity: 0.7 },
        ]}
      >
        <AppText variant="uiCaption">Previous</AppText>
        <AppText variant="surahTitleEnglish" style={{ color: tokens.accent.audio }}>
          {prevMetadata.nameEnglish}
        </AppText>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Next surah: ${nextMetadata.nameEnglish}`}
        onPress={() => onNavigate(nextSurah)}
        style={({ pressed }) => [
          styles.button,
          { borderColor: tokens.border },
          pressed && { opacity: 0.7 },
        ]}
      >
        <AppText variant="uiCaption">Next</AppText>
        <AppText variant="surahTitleEnglish" style={{ color: tokens.accent.audio }}>
          {nextMetadata.nameEnglish}
        </AppText>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing['3xl'],
    gap: spacing.md,
  },
  button: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.xs,
  },
});
