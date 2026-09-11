/**
 * ReciterSurahDownloads — one reciter's book, surah by surah, with a control on every row
 * (2026-09-11).
 *
 * ⚠️ IT IS WHERE THE PER-SURAH CONTROL SHOULD HAVE BEEN ALL ALONG. Story 7-5 put it on the Quran
 * index, which is the only surface that lists 114 rows — a sound reason and the wrong screen:
 * the index is about choosing a surah to READ, it shows exactly one voice (whichever the reader
 * has chosen), and managing Al-Husary's downloads from it means switching voice first. The
 * index's control stays, because a reader already there should not have to leave; this is the
 * screen the reciter picker's chevron opens, and the one that can name the voice it is about.
 *
 * ⚠️ THE ROW SHAPE IS THE INDEX'S, DELIBERATELY IDENTICAL — `ListRow` with the control as its
 * SIBLING, never in the `trailing` slot. `trailing` renders inside the row's own `Pressable`,
 * which react-native-web turns into a real `<button>`; a control there is a `<button>` in a
 * `<button>`, invalid HTML that React reports as a hydration error and that no native surface
 * can catch. (Story 7-5, measured in Safari.)
 *
 * ⚠️ A ROW PRESS DOES NOTHING, AND THAT IS THE HONEST ANSWER RATHER THAN A MISSING FEATURE. This
 * is a downloads surface for a voice that may not be the reader's chosen one, so a tap that
 * jumped the reader into reading would either silently change their reciter or play the wrong
 * one. The control is the whole interaction; `ListRow` without `onPress` renders a plain View,
 * which is also what keeps the row out of the web nesting problem entirely.
 *
 * ⚠️ THE RECITER IS RESOLVED, NEVER MERELY READ. A link carrying an id the catalogue no longer
 * offers (`abdulkareem`, withdrawn 2026-09-08) would otherwise open a screen that downloads into
 * a directory nothing can play from — `resolveReciterId`'s whole job, and the same guard the
 * picker applies to a stored preference.
 */

import { FlashList } from '@shopify/flash-list';
import { SURAH_METADATA } from 'quran-data';
import { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ListRow, Text } from '@/components/ui';
import { SPACING } from '@/constants/spacing';
import { FONT_SIZE, FONT_WEIGHT } from '@/constants/typography';
import { useThemedStyles } from '@/lib/useThemedStyles';
import { RECITERS, resolveReciterId } from '../data/reciters';
import { DOWNLOADS_SUPPORTED, hydrateDownloadState } from '../lib/audioDownloads';
import { DownloadKeepAwake } from './DownloadKeepAwake';
import { ReciterDownloads } from './ReciterDownloads';
import { SurahDownloadButton } from './SurahDownloadButton';

export interface ReciterSurahDownloadsProps {
  /** The reciter id from the route — resolved before anything is written under it. */
  reciterId: string;
}

type SurahRow = (typeof SURAH_METADATA)[number];

export function ReciterSurahDownloads({ reciterId }: ReciterSurahDownloadsProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const resolved = resolveReciterId(reciterId);
  const reciter = RECITERS.find((entry) => entry.id === resolved);

  // The queue store mirrors the disk, so a surface that shows download state seeds it on arrival.
  useEffect(() => {
    hydrateDownloadState(resolved);
  }, [resolved]);

  const renderRow = useCallback(
    ({ item }: { item: SurahRow }) => (
      <View style={styles.row}>
        <ListRow
          leading={<Text style={styles.number}>{item.number}</Text>}
          title={item.nameTransliteration}
          subtitle={item.nameEnglish}
          trailing={<Text style={styles.arabicName}>{item.nameArabic}</Text>}
          style={styles.rowFlex}
          testID={`reciter-surah-row-${item.number}`}
        />
        <SurahDownloadButton
          reciterId={resolved}
          surah={item.number}
          surahName={item.nameTransliteration}
          testID={`reciter-surah-download-${item.number}`}
        />
      </View>
    ),
    [resolved, styles]
  );

  return (
    <View style={styles.screen} testID="reciter-downloads-screen">
      {/* The per-surah percentages here are live progress the reader is watching — the one
          condition `DownloadKeepAwake`'s docblock accepts for holding a wake lock. */}
      <DownloadKeepAwake reciterId={resolved} />
      <FlashList
        data={SURAH_METADATA}
        renderItem={renderRow}
        keyExtractor={(item) => String(item.number)}
        ListHeaderComponent={
          <View>
            {/* The reciter's name is DATA, not copy — the header above says what the screen is. */}
            <Text style={styles.voice}>{reciter?.nameEnglish ?? resolved}</Text>
            <ReciterDownloads reciterId={resolved} testIDPrefix="reciter-downloads" />
            {DOWNLOADS_SUPPORTED ? (
              <Text style={styles.listLabel}>{t('player:download.perSurahLabel')}</Text>
            ) : null}
          </View>
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + SPACING.xl }}
        testID="reciter-downloads-list"
      />
    </View>
  );
}

const useStyles = () =>
  useThemedStyles((theme) => ({
    screen: {
      flex: 1,
      backgroundColor: theme.colors.background.primary,
    },
    voice: {
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.md,
      paddingBottom: SPACING.sm,
      fontSize: FONT_SIZE.h2,
      fontWeight: FONT_WEIGHT.semibold,
      color: theme.colors.text.primary,
    },
    listLabel: {
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.md,
      paddingBottom: SPACING.xs,
      fontSize: FONT_SIZE.caption,
      fontWeight: FONT_WEIGHT.semibold,
      textTransform: 'uppercase' as const,
      letterSpacing: 1,
      color: theme.colors.text.tertiary,
    },
    // The row and its control, side by side — see the docblock for why the control is not in
    // the row's `trailing` slot.
    row: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      paddingRight: DOWNLOADS_SUPPORTED ? SPACING.md : 0,
    },
    rowFlex: {
      flex: 1,
    },
    number: {
      width: 32,
      textAlign: 'center' as const,
      color: theme.colors.text.tertiary,
      fontSize: FONT_SIZE.bodySmall,
    },
    // The Arabic NAME is metadata, not Quran text — the system font is correct here.
    arabicName: {
      color: theme.colors.text.primary,
      fontSize: FONT_SIZE.h2,
    },
  }));
