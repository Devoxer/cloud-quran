/**
 * PlaybackOptions — speed and the sleep timer, as a plain block of controls (story 7-4).
 *
 * ⚠️ IT IS SEPARATE FROM THE SHEET BECAUSE IT HAS TWO HOSTS, and the second one is a fix rather
 * than a flourish (story 7-4 review, P9). The sheet opens from the mini player, which needs a
 * LOADED TRACK — yet the whole argument for persisting the rate is that it is "still 1.5 before
 * the first press", which a reader with nothing playing could not express. So the same block also
 * mounts on `(tabs)/(profile)/recitation.tsx`, the settings surface story 7-2 built for exactly
 * this class of choice. One component, two hosts: a second copy would be a second place for the
 * bad-state rules to drift.
 *
 * ⚠️ IT REUSES `SpeedSelector` RATHER THAN DRAWING A SPEED CONTROL. The component is already in
 * `components/ui`, already covers 0.5–2.0 with a slider plus ±0.1 steppers, already has its own
 * suite, and already owns `formatSpeed` — the one function the app spells a rate with. A second
 * speed control would be a second spelling of one setting, the recorded defect that made
 * `formatSpeed` exported in the first place.
 *
 * ⚠️ THE SLEEP OPTIONS ARE CHIPS, NOT THE INHERITED DURATION WHEEL. The wheel (`DurationPicker`)
 * needs a working value plus a "Set" press to commit it — two states and a two-step interaction
 * for a choice whose real answer set is four numbers. Chips are single-select and single-tap, so
 * the bad state the wheel needs a guard for (a committed 0, a pending value the reader thinks is
 * armed) is not reachable: every press is a complete answer, and arming one kind of timer is what
 * cancels the other (`setSleepTimer`, one setter for both).
 *
 * ⚠️ AND THEY ARE THE SHARED `Chip`, NOT A PRIVATE ONE (story 7-4 review, P17). The first cut
 * shipped a local chip differing from `components/ui/Chip` only by an optional icon — a second
 * selection idiom two directories from the first. The icon and a distinct `accessibilityLabel`
 * are now props on the shared component, which every existing caller ignores.
 */

import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { Chip, SpeedSelector } from '@/components/ui';
import { SPACING } from '@/constants/spacing';
import { FONT_SIZE, FONT_WEIGHT } from '@/constants/typography';
import { formatSleepRemaining } from '@/lib/formatTime';
import { useThemedStyles } from '@/lib/useThemedStyles';
import {
  usePlaybackOptionActions,
  usePlaybackSpeed,
  useSleepTimer,
} from '@/stores/audioPlayerStore';

const MS_PER_MINUTE = 60_000;

/**
 * The durations offered, in minutes.
 *
 * ⚠️ FOUR, NOT A CONTINUUM. A sleep timer is answered in round numbers — nobody wants 23 minutes
 * — and a wheel that can express 23 minutes is what forces a separate "Set" press to commit it.
 */
export const SLEEP_MINUTES = [15, 30, 45, 60] as const;

export interface PlaybackOptionsProps {
  /** Prefix for every control's testID, so two hosts do not collide in one tree. */
  testIDPrefix: string;
}

export function PlaybackOptions({ testIDPrefix }: PlaybackOptionsProps) {
  const { t } = useTranslation();
  const styles = useStyles();
  const speed = usePlaybackSpeed();
  const sleep = useSleepTimer();
  const { setSpeed, setSleepTimer, clearSleepTimer } = usePlaybackOptionActions();

  /**
   * Which duration chip reads as selected.
   *
   * ⚠️ IT IS THE ARMED DURATION, NOT WHAT IS LEFT OF IT — the reason `sleepDurationMs` exists
   * beside the deadline. Ten minutes into a 30-minute timer the remainder is "20m", which matches
   * no chip at all; a reader reopening this would see four unselected options under a running
   * countdown, i.e. a timer nothing claims to have set.
   */
  const armedMinutes =
    sleep.durationMs === null ? null : Math.round(sleep.durationMs / MS_PER_MINUTE);

  return (
    <View style={styles.body} testID={`${testIDPrefix}-body`}>
      <Text style={styles.sectionLabel}>{t('player:overflow.playbackSpeed')}</Text>
      {/* ⚠️ NEVER `disabled`. The epic names "speed applied only while playing" as the defect to
          fix, and a control greyed out over a paused recitation is that defect wearing a different
          face — the engine applies the rate to a paused player, and to no player at all. */}
      <SpeedSelector
        currentSpeed={speed}
        onSpeedChange={setSpeed}
        testID={`${testIDPrefix}-speed`}
      />

      <Text style={styles.sectionLabel}>{t('player:overflow.sleepTimer')}</Text>
      <View style={styles.chips}>
        {SLEEP_MINUTES.map((minutes) => {
          const ms = minutes * MS_PER_MINUTE;
          /* ⚠️ THE SAME FORMATTER AS THE COUNTDOWN BENEATH IT (story 7-4 review, P12). Spelling
             the chip `{{minutes}}m` made 60 read "60m" while the armed label under it read
             "1h 0m" — two spellings of one duration, on one screen, at the same moment. */
          const label = formatSleepRemaining(ms, false);
          return (
            <Chip
              key={minutes}
              label={label}
              isSelected={armedMinutes === minutes}
              accessibilityLabel={t('player:a11y.sleepTimerLabel', { label })}
              onPress={() => setSleepTimer(ms)}
              testID={`${testIDPrefix}-sleep-${minutes}`}
            />
          );
        })}
      </View>
      <View style={styles.chips}>
        <Chip
          icon="moon-outline"
          label={t('player:overflow.endOfSurah')}
          isSelected={sleep.endOfSurah}
          accessibilityLabel={t('player:a11y.sleepEndOfSurah')}
          onPress={() => setSleepTimer('surah')}
          testID={`${testIDPrefix}-sleep-surah`}
        />
        {/* ⚠️ ONLY WHILE SOMETHING IS ARMED. An always-present "Turn Off" beside four durations
            reads as a fifth duration, and pressing it when nothing is set is a control whose whole
            effect is the state the store is already in. */}
        {sleep.active ? (
          <Chip
            label={t('player:overflow.turnOff')}
            accessibilityLabel={t('player:a11y.turnOffSleepTimer')}
            onPress={clearSleepTimer}
            testID={`${testIDPrefix}-sleep-off`}
          />
        ) : null}
      </View>
      {sleep.active ? (
        <Text style={styles.armed} testID={`${testIDPrefix}-sleep-armed`}>
          {formatSleepRemaining(sleep.remainingMs, sleep.endOfSurah)}
        </Text>
      ) : null}
    </View>
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
    armed: {
      fontSize: FONT_SIZE.bodySmall,
      fontWeight: FONT_WEIGHT.semibold,
      color: theme.colors.accent.primary,
    },
  }));
