/**
 * DownloadProgress — the running job, as ONE card: what is transferring, how far, and the stop
 * (story 7-5; folded the stop in and took over the queued state on 2026-09-11).
 *
 * ⚠️ IT EXISTS BECAUSE "3 of 114 surahs · 212.9 MB" IS NOT FEEDBACK WHILE AL-BAQARAH DOWNLOADS.
 * That line is the only thing the reciter block showed, and it moves once per completed FILE —
 * so through the book's longest surah, minutes of a working download and minutes of a dead one
 * look identical. The owner's words after a device test: "it may have progressed in the
 * background but we can't know; it isn't granular enough and Al-Baqarah is big." A bar and a
 * byte count are the two things that separate those cases.
 *
 * ⚠️ THE STOP LIVES HERE, NOT IN A ROW ABOVE. It used to be a fourth `SettingsRow` in the
 * reciter block, so a draining queue drew a control saying "Stop downloading · 3 still queued"
 * AND a panel saying the same thing in bytes — the redundancy the owner called out
 * (2026-09-11). One card now carries the state and the only action that state admits.
 *
 * ⚠️ AND IT RENDERS FOR A QUEUE THAT HAS NOT STARTED A TRANSFER YET, which is why it takes
 * `queued` rather than reading `useActiveDownload` alone. Between the confirmation and the first
 * byte there is a real interval with no active row; drawing nothing there is the dead-looking
 * gap this component was built to end, one screen earlier.
 *
 * ⚠️ THE COPY ABOUT BACKGROUNDING IS MEASURED, AND IT IS NOT "DOWNLOADS STOP". On 2026-09-11 the
 * owner started Al-Baqarah alone, backgrounded the app for two minutes, and found the file
 * COMPLETE — exactly what `sessionType: 'background'` promises for the transfer in flight. An
 * earlier device test on a 114-file queue came back at 1 of 114 and only advanced once the app
 * was foregrounded, because the drain loop is JS and a suspended app runs none. Both halves are
 * true and the line says both: the current surah finishes, the rest wait. See
 * `BACKGROUND_TRANSFERS` in `../lib/audioDownloads.ts`.
 *
 * ⚠️ THE BAR IS TWO VIEWS, NOT `components/ui/ProgressBar`. That primitive is the audio
 * scrubber: a `Pressable` with a PanResponder, `accessibilityRole="adjustable"` and a required
 * `onSeek`. Download progress is not seekable, and dropping a pressable in here would also put a
 * `<button>` inside a row on web — the nesting story 7-5 already measured.
 *
 * ⚠️ THE BAR IS THE ONLY PLACE THE FRACTION IS DRAWN. A percentage beside it would be the same
 * number twice, competing for the same job (owner, 2026-09-11); the caption carries BYTES, which
 * the bar cannot say. The per-surah control on the list below is where a number is the whole
 * control, and there it has no bar.
 *
 * ⚠️ `totalBytes === 0` IS "THE SERVER SENT NO CONTENT-LENGTH", AND IT RENDERS DIFFERENTLY RATHER
 * THAN BADLY. The bar stays empty and the caption drops the denominator: a count that rises is
 * still proof of life, while `12.4 MB of 0 B` is the believable-wrong-value family this repo
 * keeps recording.
 */

import { SURAH_METADATA } from 'quran-data';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { Card, Icon, Text } from '@/components/ui';
import { RADII } from '@/constants/radii';
import { SPACING } from '@/constants/spacing';
import { FONT_SIZE, FONT_WEIGHT } from '@/constants/typography';
import { formatBytes } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/lib/theme';
import { useThemedStyles } from '@/lib/useThemedStyles';
import { useActiveDownload, useReciterDownloadSummary } from '@/stores/downloadQueueStore';

export interface DownloadProgressProps {
  /** The voice whose queue this reports on — downloads are per reciter. */
  reciterId: string;
  /** Cancel everything still queued for this voice. Renders the stop control when given. */
  onStop?: () => void;
  /** The voice's name, for the stop control's spoken label. */
  reciterName?: string;
  testID?: string;
}

/** The bar's height. Four points reads as progress; a taller one reads as a control. */
const TRACK_HEIGHT = 4;

/** The stop glyph's size — `SurahDownloadButton`'s, so every control here is one family. */
const GLYPH_SIZE = 20;

export function DownloadProgress({
  reciterId,
  onStop,
  reciterName,
  testID,
}: DownloadProgressProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useStyles();
  const active = useActiveDownload(reciterId);
  const summary = useReciterDownloadSummary(reciterId);

  // Every hook first — `MushafPage`'s recorded crash was an early return above one.
  if (summary.active === 0) return null;

  // No active row yet means the queue is between the confirmation and the first byte. The card
  // still draws: an empty bar under "Starting the download" is a state, a blank screen is not.
  const name =
    active === null
      ? t('player:download.queuedTitle')
      : (SURAH_METADATA[active.surah - 1]?.nameTransliteration ?? String(active.surah));
  const known = active !== null && active.totalBytes > 0;
  const detail =
    active === null
      ? t('player:download.stopValue', { active: summary.active })
      : known
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
    <Card padded="md" style={styles.card} testID={testID}>
      <View style={styles.head}>
        {/* ⚠️ THE ANNOUNCEMENT IS THIS VIEW, NOT THE CARD. `accessible` on a container hides
            every focusable descendant, so wrapping the stop button in it would take the only
            action off the screen for VoiceOver and TalkBack. The bar, the name and the byte
            count are one announcement; the button is its own. */}
        <View
          style={styles.headText}
          accessible
          accessibilityLabel={t('player:download.progressA11y', { name, detail })}
        >
          {/* The surah's name is DATA, not copy — `lint:i18n`'s data-binding boundary. */}
          <Text style={styles.title} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.detail} testID={testID ? `${testID}-detail` : undefined}>
            {detail}
          </Text>
        </View>
        {onStop === undefined ? null : (
          <Pressable
            onPress={() => {
              haptics.selection();
              onStop();
            }}
            // 10pt of slop around a 28pt box clears the 44pt HIG target without moving the glyph.
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={
              reciterName === undefined
                ? t('player:download.stop')
                : t('player:download.reciterStopA11y', { name: reciterName })
            }
            style={({ pressed }) => [styles.stop, pressed ? styles.pressed : null]}
            testID={testID ? `${testID}-stop` : undefined}
          >
            <Icon name="close" size={GLYPH_SIZE} color={colors.text.secondary} />
          </Pressable>
        )}
      </View>
      <View style={styles.track} testID={testID ? `${testID}-track` : undefined}>
        <View
          style={[styles.fill, { width: `${Math.round((active?.progress ?? 0) * 100)}%` }]}
          testID={testID ? `${testID}-fill` : undefined}
        />
      </View>
      <Text style={styles.note}>{t('player:download.foregroundOnly')}</Text>
    </Card>
  );
}

const useStyles = () =>
  useThemedStyles((theme) => ({
    card: {
      gap: SPACING.sm,
    },
    head: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: SPACING.sm,
    },
    headText: {
      flex: 1,
    },
    stop: {
      padding: SPACING.xs,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    pressed: {
      opacity: 0.6,
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
      fontSize: FONT_SIZE.body,
      fontWeight: FONT_WEIGHT.semibold,
      color: theme.colors.text.primary,
    },
    detail: {
      fontSize: FONT_SIZE.bodySmall,
      color: theme.colors.text.secondary,
    },
    note: {
      fontSize: FONT_SIZE.caption,
      color: theme.colors.text.tertiary,
    },
  }));
