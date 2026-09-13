/**
 * MushafPageHeader — the strip a printed mushaf runs across the top of every page (story 6-2,
 * adapted from the pre-fork `MushafMode/MushafPageHeader.tsx`).
 *
 * Juz' and Hizb on one side, the surah's name on the other. It is part of the PAGE — it scrolls
 * with it and is always visible — not part of the reveal-on-tap chrome, which overlays it. Both
 * lookups are table reads from `quran-data`; the surah name is a data binding, so only the
 * Juz'/Hizb label is translatable copy.
 *
 * ⚠️ **ONE NAME, IN THE UI LANGUAGE — this strip printed `البقرة · Al-Baqarah` until 2026-09-13.**
 * The chrome title that overlays this same page printed `Al-Baqarah` alone, so one screen carried
 * two disagreeing renderings of one fact, and the Arabic half was only ever there because the
 * interface had no Arabic. Both go through `surahDisplayName` now: `Al-Baqarah` under English,
 * `البقرة` under Arabic. The rule and its one exception (the index, a cross-script picker) are in
 * `lib/surahName.ts`.
 *
 * ⚠️ The Juz'/Hizb numbers are `formatQuranNumber`'d — `الجزء ١ · الحزب ١` sits under a facsimile
 * whose own ayah markers are Arabic-Indic. See `lib/format.ts` for the boundary that keeps
 * durations and byte sizes Western.
 */

import { getHizbForPage, getJuzForPage, SURAH_METADATA } from 'quran-data';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Text } from '@/components/ui';
import { SPACING } from '@/constants/spacing';
import { FONT_SIZE } from '@/constants/typography';
import { formatQuranNumber } from '@/lib/format';
import { surahDisplayName } from '@/lib/surahName';
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
          juz: formatQuranNumber(getJuzForPage(pageNumber)),
          hizb: formatQuranNumber(getHizbForPage(pageNumber)),
        })}
      </Text>
      <Text style={styles.caption}>{surahDisplayName(metadata)}</Text>
    </View>
  );
}

/** Memoized like `VerseRow`, and for the same list-churn reason. */
export const MushafPageHeader = memo(MushafPageHeaderInner);
