/**
 * TimePicker — cross-platform reminder-time control over `@expo/ui/community/datetime-picker`.
 *
 * Each platform follows its OWN native time-entry convention (one `@expo/ui` dep, no
 * code-file split — we branch on `Platform.OS` because both platforms import the same
 * component, just present it differently):
 *
 * - **iOS:** the SwiftUI `DatePicker` in `compact` mode — an inline tappable chip that
 *   opens a wheel. A definite `width` is forwarded (see below).
 * - **Android:** Material has NO inline time chip — time entry is a modal dialog by
 *   convention. The community Android picker presents as `presentation='dialog'` (default),
 *   a dialog that **opens on mount** (the caller unmounts in response). So we render a
 *   tappable row value (the formatted time) and **conditionally mount the dialog only while
 *   open**, unmounting it on confirm/dismiss. Mounting-on-open IS the "show the dialog";
 *   `onValueChange` fires on confirm, `onDismiss` on cancel.
 * - **Web:** the community impl renders `null` (no native time UI); the settings screen
 *   gates this off web anyway (`scheduleStreakReminder` no-ops on web).
 *
 * **iOS definite width is mandatory.** The community picker hosts the SwiftUI view with
 * `matchContents={{ vertical: true }}` (hugs content vertically only), so in a flex row
 * with no width Yoga gives the Host ~0pt and the compact chip draws outside its box —
 * visible but unclickable, clipped by any ancestor `overflow: 'hidden'`. We pass an
 * explicit `width` (fits "12:00 PM"). (wisdom-fruits 18.8 — device smoke caught it.)
 *
 * Story 18.8 — configurable streak-reminder time (cross-platform).
 * Source: STACK-CHEAT-SHEET.md § "Expo UI — wrapper layer + native chrome".
 */

import DateTimePicker from '@expo/ui/community/datetime-picker';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Platform,
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  type ViewStyle,
} from 'react-native';
import { SPACING } from '@/constants/spacing';
import { formatClockTime } from '@/lib/format';

/** Width that comfortably fits a compact 12-hour time chip ("12:00 PM"). */
const DEFAULT_PICKER_WIDTH = 104;

export interface TimePickerProps {
  /** Hour to display/select (0–23, local). */
  hour: number;
  /** Minute to display/select (0–59). */
  minute: number;
  /** Called with the newly selected hour + minute. */
  onChange: (hour: number, minute: number) => void;
  /** Accent/tint color (iOS chip tint / Android dialog accent + the row value color). */
  accentColor?: string;
  /** Disable interaction. */
  disabled?: boolean;
  /**
   * Style forwarded to the iOS picker's SwiftUI Host. A definite `width` is applied by
   * default (see file header) — override here only if a call site needs a different
   * footprint. (Unused on the Android row.)
   */
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

// The local 12-hour `formatTime(hour, minute, amLabel, pmLabel)` that used to live here was
// REMOVED at the epic-20 boundary (round 2). It hardcoded `${h12}:${mm} ${period}` and took the
// AM/PM markers as t()-resolved arguments, which satisfied the string gate while still rendering
// "9:00 PM" for a 21:00 reminder in French — a language with no AM/PM convention, whose own
// Material dialog (one tap away, on this very row) shows "21:00". Clock format is a LOCALE
// convention; `lib/format.ts` § formatClockTime asks `Intl` instead of a translation key.

export function TimePicker({
  hour,
  minute,
  onChange,
  accentColor,
  disabled,
  style,
  testID,
}: TimePickerProps) {
  // ⚠️ SUBSCRIPTION, NOT A TRANSLATION. Nothing in this component calls `t()` any more, but this
  // hook is what re-renders the row when the language changes — `formatClockTime` reads
  // `i18n.language` at CALL time, so without a subscriber the Android row would keep rendering the
  // previous locale's clock format until some unrelated state change happened to refresh it.
  useTranslation();
  // The community picker is `Date`-valued; build a stable Date from the parts.
  const value = useMemo(() => {
    const d = new Date();
    d.setHours(hour, minute, 0, 0);
    return d;
  }, [hour, minute]);

  // Android: tappable row value → opens the native time dialog only while mounted.
  const [open, setOpen] = useState(false);

  // If reminders get disabled while the dialog is open (e.g. a cross-device pref-sync
  // turns the master/streak toggle off — the only way `disabled` can flip mid-open,
  // since the Pressable blocks opening when disabled), tear the dialog down rather than
  // leave an interactive modal floating over the dimmed row. Forcing `open=false` here
  // (not just `open && !disabled` in render) also prevents a stale `open` from re-popping
  // the dialog when reminders are re-enabled.
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  if (Platform.OS === 'android') {
    return (
      <>
        <Pressable
          onPress={() => setOpen(true)}
          disabled={disabled}
          testID={testID}
          accessibilityRole="button"
          accessibilityState={{ disabled: !!disabled }}
          style={({ pressed }) => [styles.androidChip, pressed && styles.androidChipPressed]}
        >
          <Text style={[styles.androidChipText, { color: accentColor }]}>
            {formatClockTime(hour, minute)}
          </Text>
        </Pressable>
        {open && (
          <DateTimePicker
            mode="time"
            value={value}
            accentColor={accentColor}
            onValueChange={(_event, date) => {
              onChange(date.getHours(), date.getMinutes());
              setOpen(false); // confirm → apply + unmount the dialog
            }}
            onDismiss={() => setOpen(false)} // cancel → just unmount
          />
        )}
      </>
    );
  }

  // iOS (and the web no-op): inline compact chip.
  return (
    <DateTimePicker
      mode="time"
      display="compact"
      value={value}
      accentColor={accentColor}
      disabled={disabled}
      testID={testID}
      // Definite width so the SwiftUI compact chip is sized + tappable (see header).
      style={[{ width: DEFAULT_PICKER_WIDTH }, style]}
      onValueChange={(_event, date) => onChange(date.getHours(), date.getMinutes())}
    />
  );
}

const styles = StyleSheet.create({
  androidChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 8,
  },
  androidChipPressed: {
    opacity: 0.6,
  },
  androidChipText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
