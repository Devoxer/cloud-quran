import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

import { useReminderStore } from './useReminderStore';

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_VALUES = [1, 2, 3, 4, 5, 6, 7];

function formatTime(hour: number, minute: number): string {
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  const displayMinute = minute.toString().padStart(2, '0');
  return `${displayHour}:${displayMinute} ${period}`;
}

export function ReminderSettings() {
  const { tokens } = useTheme();
  const reminderEnabled = useReminderStore((s) => s.reminderEnabled);
  const reminderHour = useReminderStore((s) => s.reminderHour);
  const reminderMinute = useReminderStore((s) => s.reminderMinute);
  const reminderDays = useReminderStore((s) => s.reminderDays);
  const toggleReminder = useReminderStore((s) => s.toggleReminder);
  const setReminderTime = useReminderStore((s) => s.setReminderTime);
  const setReminderDays = useReminderStore((s) => s.setReminderDays);

  const handleToggleDay = (day: number) => {
    const isSelected = reminderDays.includes(day);
    if (isSelected && reminderDays.length === 1) return; // Keep at least one day
    const newDays = isSelected
      ? reminderDays.filter((d) => d !== day)
      : [...reminderDays, day].sort((a, b) => a - b);
    setReminderDays(newDays);
  };

  const handleHourChange = (delta: number) => {
    const newHour = (reminderHour + delta + 24) % 24;
    setReminderTime(newHour, reminderMinute);
  };

  const handleMinuteChange = (delta: number) => {
    const newMinute = (reminderMinute + delta + 60) % 60;
    setReminderTime(reminderHour, newMinute);
  };

  return (
    <View>
      <Pressable
        style={styles.settingRow}
        onPress={toggleReminder}
        accessibilityRole="switch"
        accessibilityLabel="Reading reminder"
        accessibilityState={{ checked: reminderEnabled }}
      >
        <View style={styles.settingTextColumn}>
          <AppText variant="ui" style={{ color: tokens.text.quran }}>
            Reading reminder
          </AppText>
          <AppText variant="uiCaption" style={{ color: tokens.text.ui }}>
            Gentle daily reading reminders
          </AppText>
        </View>
        <Switch
          value={reminderEnabled}
          onValueChange={toggleReminder}
          trackColor={{ true: tokens.accent.audio }}
        />
      </Pressable>

      {reminderEnabled && (
        <>
          <View style={styles.componentSpacer} />

          {/* Time picker */}
          <View style={styles.timeRow}>
            <AppText variant="ui" style={{ color: tokens.text.quran }}>
              Time
            </AppText>
            <View style={styles.timeControls}>
              <Pressable
                onPress={() => handleHourChange(-1)}
                style={[styles.stepperButton, { borderColor: tokens.border }]}
                accessibilityLabel="Decrease hour"
              >
                <AppText variant="ui" style={{ color: tokens.text.ui }}>
                  −
                </AppText>
              </Pressable>
              <AppText
                variant="ui"
                style={[styles.timeDisplay, { color: tokens.text.quran }]}
                accessibilityLabel={`Reminder time ${formatTime(reminderHour, reminderMinute)}`}
              >
                {formatTime(reminderHour, reminderMinute)}
              </AppText>
              <Pressable
                onPress={() => handleHourChange(1)}
                style={[styles.stepperButton, { borderColor: tokens.border }]}
                accessibilityLabel="Increase hour"
              >
                <AppText variant="ui" style={{ color: tokens.text.ui }}>
                  +
                </AppText>
              </Pressable>
              <View style={styles.minuteGap} />
              <Pressable
                onPress={() => handleMinuteChange(-5)}
                style={[styles.stepperButton, { borderColor: tokens.border }]}
                accessibilityLabel="Decrease minute"
              >
                <AppText variant="ui" style={{ color: tokens.text.ui }}>
                  −
                </AppText>
              </Pressable>
              <AppText variant="uiCaption" style={{ color: tokens.text.ui }}>
                min
              </AppText>
              <Pressable
                onPress={() => handleMinuteChange(5)}
                style={[styles.stepperButton, { borderColor: tokens.border }]}
                accessibilityLabel="Increase minute"
              >
                <AppText variant="ui" style={{ color: tokens.text.ui }}>
                  +
                </AppText>
              </Pressable>
            </View>
          </View>

          <View style={styles.componentSpacer} />

          {/* Day selector */}
          <View>
            <AppText variant="ui" style={{ color: tokens.text.quran, marginBottom: spacing.sm }}>
              {reminderDays.length === 7 ? 'Every day' : 'Repeat'}
            </AppText>
            <View style={styles.dayRow}>
              {DAY_VALUES.map((day, index) => {
                const isSelected = reminderDays.includes(day);
                return (
                  <Pressable
                    key={day}
                    onPress={() => handleToggleDay(day)}
                    style={[
                      styles.dayButton,
                      {
                        backgroundColor: isSelected ? tokens.accent.audio : 'transparent',
                        borderColor: isSelected ? tokens.accent.audio : tokens.border,
                      },
                    ]}
                    accessibilityRole="checkbox"
                    accessibilityLabel={['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][index]}
                    accessibilityState={{ checked: isSelected }}
                  >
                    <AppText
                      variant="uiCaption"
                      style={{ color: isSelected ? tokens.surface.primary : tokens.text.ui }}
                    >
                      {DAY_LABELS[index]}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settingTextColumn: {
    flex: 1,
    marginRight: spacing.md,
  },
  componentSpacer: {
    height: spacing.xl,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timeControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  stepperButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeDisplay: {
    minWidth: 80,
    textAlign: 'center',
  },
  minuteGap: {
    width: spacing.sm,
  },
  dayRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  dayButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
