/**
 * PlaybackOptionsSheet — speed and the sleep timer, in the chrome's second sheet (story 7-4).
 *
 * ⚠️ IT REUSES `SpeedSelector` RATHER THAN DRAWING A SPEED CONTROL. The component is already in
 * `components/ui`, already covers 0.5–2.0 with a slider plus ±0.1 steppers, already has its own
 * suite, and already owns `formatSpeed` — the one function the app spells a rate with. A second
 * speed control would be a second spelling of one setting, which is the recorded defect that
 * made `formatSpeed` exported in the first place.
 *
 * ⚠️ THE SLEEP OPTIONS ARE CHIPS, NOT THE INHERITED DURATION WHEEL. The wheel (`DurationPicker`)
 * needs a working value plus a "Set" press to commit it — two states and a two-step interaction
 * for a choice whose real answer set is four numbers. Chips are single-select and single-tap, so
 * the "bad state" the wheel needs a guard for (a committed 0, a pending value the reader thinks
 * is armed) is not reachable: every press is a complete answer, and arming one kind of timer is
 * what cancels the other (`setSleepTimer`, one setter for both).
 *
 * ⚠️ THE SHEET IS NOT MOUNTED BY THE ROW THAT OPENS IT. `ReadingChrome` owns it, outside both
 * animated bars — a sheet inside the footer inherits the reveal's opacity, so the 5-second dwell
 * would fade the reader's open sheet away mid-choice. `ReciterSheet` records the same rule.
 *
 * ⚠️ AND THE BODY CARRIES AN EXPLICIT HEIGHT, FOR `ReciterSheet`'s REASON — `snapPoints` IS
 * IGNORED AT ≥768pt, where `BottomSheet` renders a centered dialog card instead of the native
 * sheet. Here the content is intrinsically sized rather than a `flex: 1` list, so what the bound
 * buys is different: a MAXIMUM, so the sheet cannot grow past the detent on a phone, with the
 * content free to be shorter. Copy the shape; do not rediscover it.
 */

import { useTranslation } from 'react-i18next';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';

import { BottomSheet, Icon, SpeedSelector } from '@/components/ui';
import { RADII } from '@/constants/radii';
import { SPACING } from '@/constants/spacing';
import { FONT_SIZE, FONT_WEIGHT } from '@/constants/typography';
import { withAlpha } from '@/lib/color';
import { formatSleepRemaining } from '@/lib/formatTime';
import { useTheme } from '@/lib/theme';
import { useThemedStyles } from '@/lib/useThemedStyles';
import {
  usePlaybackOptionActions,
  usePlaybackSpeed,
  useSleepTimer,
} from '@/stores/audioPlayerStore';

/** Tall enough for the speed control and both sleep rows without covering the whole app. */
const SHEET_SNAP_POINTS = ['58%'];
const SHEET_BODY_RATIO = 0.5;
const SHEET_BODY_MAX = 420;
const CHIP_ICON_SIZE = 16;
const MS_PER_MINUTE = 60_000;

/**
 * The durations offered, in minutes.
 *
 * ⚠️ FOUR, NOT A CONTINUUM. A sleep timer is answered in round numbers — nobody wants 23 minutes
 * — and a wheel that can express 23 minutes is what forces a separate "Set" press to commit it.
 * `formatSleepRemaining` labels them, so a chip and the countdown it arms read identically.
 */
const SLEEP_MINUTES = [15, 30, 45, 60] as const;

export interface PlaybackOptionsSheetProps {
  open: boolean;
  onClose: () => void;
}

export function PlaybackOptionsSheet({ open, onClose }: PlaybackOptionsSheetProps) {
  const { t } = useTranslation();
  const styles = useStyles();
  const { height } = useWindowDimensions();
  const speed = usePlaybackSpeed();
  const sleep = useSleepTimer();
  const { setSpeed, setSleepTimer, clearSleepTimer } = usePlaybackOptionActions();

  // Geometry, not theme, so it lives inline (`lint:style` scan 3 targets theme tokens).
  const bodyStyle = { maxHeight: Math.min(height * SHEET_BODY_RATIO, SHEET_BODY_MAX) };

  /**
   * Which duration chip reads as selected.
   *
   * ⚠️ IT IS THE ARMED DURATION, NOT WHAT IS LEFT OF IT — the reason `sleepDurationMs` exists
   * beside the deadline. Ten minutes into a 30-minute timer the remainder is "20m", which
   * matches no chip at all; a reader reopening the sheet would see four unselected options and
   * a countdown, i.e. a timer that nothing claims to have set.
   */
  const armedMinutes =
    sleep.durationMs === null ? null : Math.round(sleep.durationMs / MS_PER_MINUTE);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t('player:options.sheetTitle')}
      snapPoints={SHEET_SNAP_POINTS}
      closeTestID="playback-options-close"
      testID="playback-options-sheet"
    >
      <View style={[styles.body, bodyStyle]} testID="playback-options-body">
        <Text style={styles.sectionLabel}>{t('player:overflow.playbackSpeed')}</Text>
        {/* ⚠️ NEVER `disabled`. The epic names "speed applied only while playing" as the defect
            to fix, and a control greyed out over a paused recitation is that defect wearing a
            different face — the engine applies the rate to a paused player perfectly well. */}
        <SpeedSelector
          currentSpeed={speed}
          onSpeedChange={setSpeed}
          testID="playback-options-speed"
        />

        <Text style={styles.sectionLabel}>{t('player:overflow.sleepTimer')}</Text>
        <View style={styles.chips}>
          {SLEEP_MINUTES.map((minutes) => {
            const selected = armedMinutes === minutes;
            const label = t('player:sleep.minutes', { minutes });
            return (
              <Chip
                key={minutes}
                label={label}
                selected={selected}
                accessibilityLabel={t('player:a11y.sleepTimerLabel', { label })}
                onPress={() => setSleepTimer(minutes * MS_PER_MINUTE)}
                testID={`playback-options-sleep-${minutes}`}
              />
            );
          })}
        </View>
        <View style={styles.chips}>
          <Chip
            icon="moon-outline"
            label={t('player:overflow.endOfSurah')}
            selected={sleep.endOfSurah}
            accessibilityLabel={t('player:a11y.sleepEndOfSurah')}
            onPress={() => setSleepTimer('surah')}
            testID="playback-options-sleep-surah"
          />
          {/* ⚠️ ONLY WHILE SOMETHING IS ARMED. An always-present "Turn Off" beside four durations
              reads as a fifth duration, and pressing it when nothing is set is a control that
              does nothing — the state it would leave the store in is the state it is already in. */}
          {sleep.active ? (
            <Chip
              label={t('player:overflow.turnOff')}
              selected={false}
              accessibilityLabel={t('player:a11y.turnOffSleepTimer')}
              onPress={clearSleepTimer}
              testID="playback-options-sleep-off"
            />
          ) : null}
        </View>
        {/* The armed timer, spelled by the SAME formatter the chrome row's indicator uses — two
            spellings of one countdown is the `formatSpeed` defect in another place. */}
        {sleep.active ? (
          <Text style={styles.armed} testID="playback-options-sleep-armed">
            {formatSleepRemaining(sleep.remainingMs, sleep.endOfSurah)}
          </Text>
        ) : null}
      </View>
    </BottomSheet>
  );
}

interface ChipProps {
  label: string;
  selected: boolean;
  accessibilityLabel: string;
  onPress: () => void;
  icon?: 'moon-outline';
  testID: string;
}

/** One sleep option. Single-select by construction: the store's setter answers both kinds. */
function Chip({ label, selected, accessibilityLabel, onPress, icon, testID }: ChipProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.chip,
        selected ? styles.chipSelected : styles.chipIdle,
        pressed && styles.pressed,
      ]}
      testID={testID}
    >
      {icon ? (
        <Icon
          name={icon}
          size={CHIP_ICON_SIZE}
          color={selected ? colors.accent.primary : colors.text.secondary}
          accessibilityElementsHidden
        />
      ) : null}
      <Text style={[styles.chipText, selected ? styles.chipTextSelected : styles.chipTextIdle]}>
        {label}
      </Text>
    </Pressable>
  );
}

const useStyles = () =>
  useThemedStyles((theme) => ({
    body: {
      gap: SPACING.sm,
      paddingHorizontal: SPACING.md,
      paddingBottom: SPACING.md,
    },
    sectionLabel: {
      fontSize: FONT_SIZE.bodySmall,
      fontWeight: FONT_WEIGHT.semibold,
      color: theme.colors.text.secondary,
    },
    chips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.md,
      borderRadius: RADII.md,
    },
    /** The selection tint the app already uses for a chosen row — `AppTabBar`'s indicator idiom. */
    chipSelected: {
      backgroundColor: withAlpha(theme.colors.accent.primary, 0.13),
    },
    chipIdle: {
      backgroundColor: theme.colors.background.tertiary,
    },
    chipText: {
      fontSize: FONT_SIZE.body,
      fontWeight: FONT_WEIGHT.medium,
    },
    chipTextSelected: {
      color: theme.colors.accent.primary,
    },
    chipTextIdle: {
      color: theme.colors.text.primary,
    },
    pressed: {
      opacity: 0.7,
    },
    armed: {
      fontSize: FONT_SIZE.bodySmall,
      fontWeight: FONT_WEIGHT.semibold,
      color: theme.colors.accent.primary,
    },
  }));
