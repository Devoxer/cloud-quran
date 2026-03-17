import React from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { spacing } from '@/theme/tokens';

interface SurahHeaderProps {
  surahNumber: number;
  nameArabic: string;
  nameEnglish: string;
  verseCount: number;
  revelationType: 'meccan' | 'medinan';
}

const BISMILLAH = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ';

export function SurahHeader({
  surahNumber,
  nameArabic,
  nameEnglish,
  verseCount,
  revelationType,
}: SurahHeaderProps) {
  const showBismillah = surahNumber !== 1 && surahNumber !== 9;

  return (
    <View style={styles.container}>
      <AppText variant="surahTitleArabic">{nameArabic}</AppText>
      <AppText variant="surahTitleEnglish">{nameEnglish}</AppText>
      <AppText variant="uiCaption">
        {verseCount} verses • {revelationType}
      </AppText>
      {showBismillah && (
        <AppText variant="quran" style={styles.bismillah}>
          {BISMILLAH}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing['3xl'],
  },
  bismillah: {
    marginTop: spacing.lg,
    textAlign: 'center',
  },
});
