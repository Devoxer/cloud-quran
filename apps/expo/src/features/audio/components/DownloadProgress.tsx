/**
 * DownloadProgress — what the current transfer is actually doing, in bytes (2026-09-11).
 *
 * ⚠️ IT EXISTS BECAUSE "3 of 114 surahs · 212.9 MB" IS NOT FEEDBACK WHILE AL-BAQARAH DOWNLOADS.
 * That line is the only thing the reciter block showed, and it moves once per completed FILE —
 * so through the book's longest surah, minutes of a working download and minutes of a dead one
 * look identical. The owner's words after a device test: "it may have progressed in the
 * background but we can't know; it isn't granular enough and Al-Baqarah is big." A bar and a
 * byte count are the two things that separate those cases.
 *
 * ⚠️ AND IT IS WHERE THE APP SAYS THE THING THE FEATURE'S COPY OTHERWISE IMPLIES THE OPPOSITE OF:
 * the queue advances only while the app is open. One transfer — the one in flight — survives
 * suspension on iOS; the loop that starts the next one is JS and a suspended app runs none. See
 * `BACKGROUND_TRANSFERS` in `../lib/audioDownloads.ts` for the SDK source that establishes it.
 * This line is shown exactly while a queue is draining, which is the moment a reader is deciding
 * whether they can put the phone down.
 *
 * ⚠️ THE BAR IS TWO VIEWS, NOT `components/ui/ProgressBar`. That primitive is the audio
 * scrubber: a `Pressable` with a PanResponder, `accessibilityRole="adjustable"` and a required
 * `onSeek`. Download progress is not seekable, and dropping a pressable in here would also put a
 * `<button>` inside a row on web — the nesting story 7-5 already measured.
 *
 * ⚠️ `totalBytes === 0` IS "THE SERVER SENT NO CONTENT-LENGTH", AND IT RENDERS DIFFERENTLY RATHER
 * THAN BADLY. The bar stays empty and the caption drops the denominator: a count that rises is
 * still proof of life, while `12.4 MB of 0 B` is the believable-wrong-value family this repo
 * keeps recording.
 */

import { SURAH_METADATA } from 'quran-data';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Text } from '@/components/ui';
import { RADII } from '@/constants/radii';
import { SPACING } from '@/constants/spacing';
import { FONT_SIZE, FONT_WEIGHT } from '@/constants/typography';
import { formatBytes } from '@/lib/format';
import { useThemedStyles } from '@/lib/useThemedStyles';
import { useActiveDownload, useReciterDownloadSummary } from '@/stores/downloadQueueStore';

export interface DownloadProgressProps {
  /** The voice whose queue this reports on — downloads are per reciter. */
  reciterId: string;
  testID?: string;
}

/** The bar's height. Four points reads as progress; a taller one reads as a control. */
const TRACK_HEIGHT = 4;

export function DownloadProgress({ reciterId, testID }: DownloadProgressProps) {
  const { t } = useTranslation();
  const styles = useStyles();
  const active = useActiveDownload(reciterId);
  const summary = useReciterDownloadSummary(reciterId);

  // Every hook first — `MushafPage`'s recorded crash was an early return above one.
  if (active === null) return null;

  const name = SURAH_METADATA[active.surah - 1]?.nameTransliteration ?? String(active.surah);
  const known = active.totalBytes > 0;
  const detail = known
    ? t('player:download.progressValue', {
        done: formatBytes(active.bytesWritten),
        size: formatBytes(active.totalBytes),
        active: summary.active,
      })
    : t('player:download.progressUnknown', {
        done: formatBytes(active.bytesWritten),
        active: summary.active,
      });

  return (
    <View
      style={styles.block}
      // The whole panel is one announcement: a bar, a name and a byte count read out as three
      // separate nodes is three interruptions per progress tick.
      accessible
      accessibilityLabel={t('player:download.progressA11y', { name, detail })}
      testID={testID}
    >
      <View style={styles.track} testID={testID ? `${testID}-track` : undefined}>
        <View
          style={[styles.fill, { width: `${Math.round(active.progress * 100)}%` }]}
          testID={testID ? `${testID}-fill` : undefined}
        />
      </View>
      {/* The surah's name is DATA, not copy — `lint:i18n`'s data-binding boundary. */}
      <Text style={styles.title}>{name}</Text>
      <Text style={styles.detail} testID={testID ? `${testID}-detail` : undefined}>
        {detail}
      </Text>
      <Text style={styles.note}>{t('player:download.foregroundOnly')}</Text>
    </View>
  );
}

const useStyles = () =>
  useThemedStyles((theme) => ({
    block: {
      paddingHorizontal: SPACING.md,
      paddingTop: SPACING.sm,
      paddingBottom: SPACING.md,
      gap: SPACING.xs,
    },
    track: {
      height: TRACK_HEIGHT,
      borderRadius: RADII.sm,
      overflow: 'hidden' as const,
      backgroundColor: theme.colors.background.secondary,
    },
    fill: {
      height: '100%' as const,
      borderRadius: RADII.sm,
      backgroundColor: theme.colors.accent.primary,
    },
    title: {
      fontSize: FONT_SIZE.bodySmall,
      fontWeight: FONT_WEIGHT.semibold,
      color: theme.colors.text.primary,
    },
    detail: {
      fontSize: FONT_SIZE.caption,
      color: theme.colors.text.secondary,
    },
    note: {
      fontSize: FONT_SIZE.caption,
      color: theme.colors.text.tertiary,
    },
  }));
