/**
 * SurahDownloadButton — one surah's offline control, in four states (story 7-5).
 *
 * not kept → a download glyph; press queues it.
 * queued / starting → a spinner; press cancels.
 * downloading → the percentage; press cancels.
 * kept → a filled checkmark in the accent; press removes the file.
 * failed → a warning glyph, whose label NAMES the reason; press retries.
 *
 * ⚠️ ONE CONTROL, NOT A ROW OF THEM. Every state is one tap with one meaning, so there is no
 * moment where two affordances sit side by side and the reader has to work out which is which —
 * and no state in which the control is `disabled`, which on a 114-row list would read as a
 * broken row rather than as a busy one.
 *
 * ⚠️ THE REMOVE HAS NO CONFIRMATION, WHICH IS THIS CODEBASE'S RULE AND NOT AN OVERSIGHT. Story
 * 23.13's standard: red belongs on a confirmation, and a remove that is trivially reversible does
 * not get one. Deleting a download costs the reader one press to get it back, and the file is not
 * their data — it is a copy of a public recitation.
 *
 * ⚠️ IT DOES NOT READ THE READER'S PREFERENCE ITSELF. `reciterId` arrives as a PROP because the
 * index mounts 114 of these: one `usePreferences()` subscription per row would be 114 subscribers
 * to one query, all re-rendering together on a preference change that concerns one label. The
 * screen resolves it once, through `useDownloadReciterId`, and renders nothing until it has.
 */

import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { SPACING } from '@/constants/spacing';
import { FONT_SIZE, FONT_WEIGHT } from '@/constants/typography';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/lib/theme';
import { useThemedStyles } from '@/lib/useThemedStyles';
import { type SurahDownloadStatus, useDownloadEntry } from '@/stores/downloadQueueStore';
import {
  cancelSurahDownload,
  DOWNLOADS_SUPPORTED,
  deleteSurahDownload,
  startSurahDownload,
} from '../lib/audioDownloads';

export interface SurahDownloadButtonProps {
  /** The voice these downloads belong to — downloads are per reciter, never shared. */
  reciterId: string;
  surah: number;
  /** The surah's name, for the label an icon-only control cannot carry. */
  surahName: string;
  testID?: string;
}

/** Every state the control can be in — an absent entry is "nobody has touched this surah". */
type ControlStatus = SurahDownloadStatus | 'absent';

/** The glyph's size — two points over `RowDeleteButton`'s 18, which sits beside a larger row. */
const GLYPH_SIZE = 20;

/**
 * Below this, progress is drawn as a spinner rather than a number.
 *
 * ⚠️ "0%" FOR SEVERAL SECONDS IS THE STUCK LOOK THE SPINNER EXISTS TO PREVENT. A 137 MB surah
 * reports its first few ticks well under one per cent, and the first cut showed the number as
 * soon as any progress arrived — so the large downloads, the ones a reader most wants feedback
 * on, were exactly the ones that sat reading zero. (Story 7-5 review, P17.)
 */
const INDETERMINATE_BELOW = 0.01;

export function SurahDownloadButton({
  reciterId,
  surah,
  surahName,
  testID,
}: SurahDownloadButtonProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useStyles();
  const entry = useDownloadEntry(reciterId, surah);
  const status: ControlStatus = entry?.status ?? 'absent';

  const onPress = () => {
    if (status === 'downloaded') {
      haptics.impact('light');
      deleteSurahDownload(reciterId, surah);
      return;
    }
    if (status === 'queued' || status === 'downloading') {
      haptics.selection();
      cancelSurahDownload(reciterId, surah);
      return;
    }
    haptics.selection();
    startSurahDownload(reciterId, surah);
  };

  const accessibilityLabel =
    status === 'downloaded'
      ? t('player:download.removeA11y', { name: surahName })
      : status === 'queued' || status === 'downloading'
        ? t('player:download.cancelA11y', { name: surahName })
        : status === 'error'
          ? // ⚠️ THE REASON IS SPOKEN. An icon-only control in a 114-row list has nowhere else to
            // put it, and "it failed" without "why" is the state the `error` field exists to end.
            t('player:download.retryA11y', { name: surahName, reason: entry?.error ?? '' })
          : t('player:download.downloadA11y', { name: surahName });

  // After every hook, never before one — `MushafPage`'s recorded crash was an early return above
  // a `useCallback`. See `DOWNLOADS_SUPPORTED` for why web gets nothing rather than a dead glyph.
  if (!DOWNLOADS_SUPPORTED) return null;

  return (
    <Pressable
      onPress={onPress}
      // 10pt of slop around a 28pt visual box clears the 44pt HIG target without moving the
      // glyph, the trade `RowDeleteButton` already made.
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.button, pressed ? styles.pressed : null]}
      testID={testID}
    >
      <Body
        status={status}
        progress={entry?.progress ?? 0}
        colors={colors}
        styles={styles}
        testID={testID}
      />
    </Pressable>
  );
}

/**
 * The glyph for a state.
 *
 * ⚠️ `status` IS THE UNION, NOT `string`. This component's whole job is a four-way map over it,
 * and with the wider type a mistyped comparison falls through to the download glyph — a kept
 * surah offering to download itself, with nothing red anywhere. (Story 7-5 review, P20.)
 */
function Body({
  status,
  progress,
  colors,
  styles,
  testID,
}: {
  status: ControlStatus;
  progress: number;
  colors: ReturnType<typeof useTheme>['colors'];
  styles: ReturnType<typeof useStyles>;
  testID?: string;
}) {
  if (status === 'downloaded') {
    return (
      <Icon
        name="checkmark-circle"
        size={GLYPH_SIZE}
        color={colors.accent.primary}
        accessibilityElementsHidden
        testID={testID ? `${testID}-downloaded` : undefined}
      />
    );
  }
  if (status === 'error') {
    return (
      <Icon
        name="alert-circle-outline"
        size={GLYPH_SIZE}
        color={colors.semantic.error}
        accessibilityElementsHidden
        testID={testID ? `${testID}-error` : undefined}
      />
    );
  }
  if (status === 'downloading' || status === 'queued') {
    if (status === 'queued' || progress < INDETERMINATE_BELOW) {
      return (
        <ActivityIndicator
          size="small"
          color={colors.text.secondary}
          testID={testID ? `${testID}-pending` : undefined}
        />
      );
    }
    return (
      <View style={styles.progressBox} testID={testID ? `${testID}-progress` : undefined}>
        {/* A percentage is a NUMBER, not copy — `lint:i18n`'s non-prose literal. */}
        <Text style={styles.progressText}>{`${Math.round(progress * 100)}%`}</Text>
      </View>
    );
  }
  return (
    <Icon
      name="cloud-download-outline"
      size={GLYPH_SIZE}
      color={colors.text.secondary}
      accessibilityElementsHidden
      testID={testID ? `${testID}-idle` : undefined}
    />
  );
}

const useStyles = () =>
  useThemedStyles((theme) => ({
    button: {
      padding: SPACING.xs,
      minWidth: 36,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    pressed: {
      opacity: 0.6,
    },
    progressBox: {
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    progressText: {
      fontSize: FONT_SIZE.caption,
      fontWeight: FONT_WEIGHT.semibold,
      color: theme.colors.accent.primary,
    },
  }));
