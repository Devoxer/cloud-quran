/**
 * ReciterDownloadButton — "keep this whole voice", on the picker's own row (2026-09-11).
 *
 * ⚠️ IT IS THE PER-SURAH CONTROL'S SIBLING, ONE LEVEL UP, AND IT EXISTS BECAUSE THE ONLY PLACE A
 * READER COULD MANAGE A RECITER'S DOWNLOADS WAS THE QURAN INDEX. That surface is about choosing
 * a surah to READ; the voice a download is filed under is chosen here, two screens away, and a
 * reader who wanted Al-Husary's book offline had to switch voice first and then leave. Owner's
 * call: a control on each reciter row, and a chevron beside it into that reciter's own list.
 *
 * ⚠️ ITS "IS ANYTHING KEPT" ANSWER COMES FROM DISK, VIA A PROP, NEVER FROM THE QUEUE STORE. The
 * store mirrors ONE reciter at a time — whichever surface hydrated it last — so a summary read
 * for the other 38 answers zero, and a control drawn from it would offer to download a book the
 * device already has. The picker does one walk of `{document}/audio` for all 39
 * (`reciterDownloadCounts`) and hands each row its number.
 *
 * ⚠️ THE STORE IS STILL THE RIGHT SOURCE FOR "IS IT MOVING", which is why both are read. Only
 * one reciter can have an active queue (the drain is serial and module-level), and that reciter
 * is by construction the hydrated one.
 *
 * ⚠️ THE COMPLETE STATE IS NOT PRESSABLE, AND THAT IS DELIBERATE RATHER THAN A MISSING HANDLER.
 * Remove-all confirms — a whole book is an hour of network to get back, which is exactly story
 * 23.13's "not trivially reversible" test — and a confirmation belongs on the surface that can
 * also say how many megabytes it is about to free, not on a 39-row list. The chevron beside this
 * control is one tap from it.
 *
 * ⚠️ NOT INSIDE THE ROW'S `trailing` SLOT — a sibling of it, like the index's per-surah control.
 * `trailing` renders inside the row's own `Pressable`, and react-native-web turns every
 * `accessibilityRole="button"` Pressable into a real `<button>`: a control in that slot is a
 * `<button>` in a `<button>`, invalid HTML that React reports as a hydration error and that no
 * native surface can catch. (Story 7-5, measured in Safari.)
 */

import { SURAH_COUNT } from 'quran-data';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { Icon } from '@/components/ui';
import { SPACING } from '@/constants/spacing';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/lib/theme';
import { useThemedStyles } from '@/lib/useThemedStyles';
import { useReciterDownloadSummary } from '@/stores/downloadQueueStore';
import { cancelReciterDownloads, DOWNLOADS_SUPPORTED } from '../lib/audioDownloads';

export interface ReciterDownloadButtonProps {
  reciterId: string;
  /** The reciter's name, for the label an icon-only control cannot carry. */
  reciterName: string;
  /** How many of this reciter's surahs are on disk — read from the filesystem by the list. */
  keptCount: number;
  /** Whether this row's estimate is being computed, i.e. the press has been taken. */
  estimating: boolean;
  /** Start the estimate-then-confirm gate. Never queues anything by itself. */
  onDownloadAll: () => void;
  testID?: string;
}

/** The glyph's size — `SurahDownloadButton`'s, so the two controls read as one family. */
const GLYPH_SIZE = 20;

export function ReciterDownloadButton({
  reciterId,
  reciterName,
  keptCount,
  estimating,
  onDownloadAll,
  testID,
}: ReciterDownloadButtonProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useStyles();
  const summary = useReciterDownloadSummary(reciterId);

  // After every hook — see `SurahDownloadButton` for why web gets nothing rather than a dead glyph.
  if (!DOWNLOADS_SUPPORTED) return null;

  const running = summary.active > 0;
  const complete = keptCount >= SURAH_COUNT;

  if (complete && !running) {
    return (
      <View style={styles.button} testID={testID}>
        <Icon
          name="checkmark-circle"
          size={GLYPH_SIZE}
          color={colors.accent.primary}
          accessibilityLabel={t('player:download.reciterKeptA11y', { name: reciterName })}
          testID={testID ? `${testID}-complete` : undefined}
        />
      </View>
    );
  }

  const onPress = () => {
    haptics.selection();
    if (running) {
      cancelReciterDownloads(reciterId);
      return;
    }
    onDownloadAll();
  };

  return (
    <Pressable
      onPress={onPress}
      // 10pt of slop around a 28pt box clears the 44pt HIG target without moving the glyph.
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={
        running
          ? t('player:download.reciterStopA11y', { name: reciterName })
          : keptCount > 0
            ? t('player:download.reciterRestA11y', { name: reciterName })
            : t('player:download.reciterAllA11y', { name: reciterName })
      }
      style={({ pressed }) => [styles.button, pressed ? styles.pressed : null]}
      testID={testID}
    >
      {running || estimating ? (
        <ActivityIndicator
          size="small"
          color={colors.text.secondary}
          testID={testID ? `${testID}-pending` : undefined}
        />
      ) : (
        <Icon
          name="cloud-download-outline"
          size={GLYPH_SIZE}
          // ⚠️ THE TINT IS THE "SOMETHING IS KEPT" MARK story 7-5 drew as a separate glyph in the
          // row's trailing slot. One control carrying both facts beats two glyphs competing for
          // the same 40 points beside a checkmark that means something else entirely.
          color={keptCount > 0 ? colors.accent.primary : colors.text.secondary}
          accessibilityElementsHidden
          testID={testID ? `${testID}-idle` : undefined}
        />
      )}
    </Pressable>
  );
}

const useStyles = () =>
  useThemedStyles(() => ({
    button: {
      padding: SPACING.xs,
      minWidth: 36,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    pressed: {
      opacity: 0.6,
    },
  }));
