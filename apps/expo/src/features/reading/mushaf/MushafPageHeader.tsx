/**
 * MushafPageHeader — the strip a printed mushaf runs across the top of every page (story 6-2,
 * adapted from the pre-fork `MushafMode/MushafPageHeader.tsx`).
 *
 * Juz' and Hizb on one side, the surah's Arabic name and transliteration on the other. It is part
 * of the PAGE — it scrolls with it and is always visible — not part of the reveal-on-tap chrome,
 * which overlays it. Both lookups are table reads from `quran-data`; the surah names are data
 * bindings, so only the Juz'/Hizb label is translatable copy.
 */

import { getHizbForPage, getJuzForPage, SURAH_METADATA } from 'quran-data';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Text } from '@/components/ui';
import { SPACING } from '@/constants/spacing';
import { FONT_SIZE } from '@/constants/typography';
import { useThemedStyles } from '@/lib/useThemedStyles';

export interface MushafPageHeaderProps {
  /** The page (1–604) — resolves Juz' and Hizb. */
  pageNumber: number;
  /** The surah whose name the strip carries — the page's first surah, derived by the caller. */
  surahNumber: number;
}

function MushafPageHeaderInner({ pageNumber, surahNumber }: MushafPageHeaderProps) {
  const { t } = useTranslation();
  const styles = useThemedStyles((theme) => ({
    container: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.xs,
    },
    caption: {
      color: theme.colors.text.secondary,
      fontSize: FONT_SIZE.caption,
    },
  }));

  const metadata = SURAH_METADATA[surahNumber - 1];
  if (!metadata) return null;

  return (
    <View style={styles.container} testID={`mushaf-page-header-${pageNumber}`}>
      <Text style={styles.caption}>
        {t('common:mushaf.juzHizb', {
          juz: getJuzForPage(pageNumber),
          hizb: getHizbForPage(pageNumber),
        })}
      </Text>
      <Text
        style={styles.caption}
      >{`${metadata.nameArabic} · ${metadata.nameTransliteration}`}</Text>
    </View>
  );
}

/** Memoized like `VerseRow`, and for the same list-churn reason. */
export const MushafPageHeader = memo(MushafPageHeaderInner);
