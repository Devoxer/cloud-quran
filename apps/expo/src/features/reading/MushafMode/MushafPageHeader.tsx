import { getHizbForPage, getJuzForPage, SURAH_METADATA } from 'quran-data';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

interface MushafPageHeaderProps {
  pageNumber: number;
  surahNumber: number;
}

export const MushafPageHeader = React.memo(function MushafPageHeader({
  pageNumber,
  surahNumber,
}: MushafPageHeaderProps) {
  const { tokens } = useTheme();
  const metadata = SURAH_METADATA[surahNumber - 1];
  const juz = getJuzForPage(pageNumber);
  const hizb = getHizbForPage(pageNumber);

  if (!metadata) return null;

  return (
    <View style={styles.container}>
      <AppText variant="uiCaption" style={{ color: tokens.text.ui }}>
        Juz' {juz} - Hizb {hizb}
      </AppText>
      <AppText variant="uiCaption" style={{ color: tokens.text.ui }}>
        {metadata.nameArabic} · {metadata.nameTransliteration}
      </AppText>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  },
});
