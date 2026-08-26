/**
 * DurationPicker — hours + minutes wheel for choosing an arbitrary duration.
 *
 * Story 19.5: backs the sleep-timer "any duration" picker. Exposes a
 * component-agnostic API (duration in/out as milliseconds) so consumers never
 * touch the underlying wheel library.
 *
 * ⚠️ SWAP POINT — internally uses `@quidone/react-native-wheel-picker` (pure-JS
 * wheel, MIT, New-Architecture-safe, runs on react-native-web). `@expo/ui` has
 * NO universal countdown/duration picker as of SDK 56; when it ships one, swap
 * the internals HERE — the props below are the stable contract, so no consumer
 * changes. (STACK-CHEAT-SHEET § "UI primitives — build vs adopt".)
 */

import WheelPicker from '@quidone/react-native-wheel-picker';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { type StyleProp, Text, View, type ViewStyle } from 'react-native';
import { SPACING } from '@/constants/spacing';
import { FONT_SIZE, FONT_WEIGHT } from '@/constants/typography';
import { withAlpha } from '@/lib/color';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/lib/theme';
import { useThemedStyles } from '@/lib/useThemedStyles';

const MS_PER_HOUR = 3_600_000;
const MS_PER_MINUTE = 60_000;
const WHEEL_WIDTH = 56;
const ITEM_HEIGHT = 36;
const VISIBLE_ITEM_COUNT = 3;

export interface DurationPickerProps {
  /** Current duration in milliseconds. */
  valueMs: number;
  /** Called with the new duration in milliseconds whenever a wheel settles. */
  onChange: (ms: number) => void;
  /** Max selectable hours (inclusive). Default 8. */
  maxHours?: number;
  /** Minute granularity (must divide 60). Default 1. */
  minuteStep?: number;
  /** Accent color for the selected-row overlay (defaults to the theme accent). */
  accentColor?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

interface WheelDatum {
  value: number;
  label: string;
}

/**
 * `memo` is load-bearing, not an optimization: when a sleep timer is ACTIVE the
 * store ticks `sleepRemainingMs` every second, re-rendering the parent (and thus
 * this picker). A controlled wheel re-applies its `value` on each render, which
 * snaps the wheel back to the committed value MID-SCROLL — so the user's new
 * selection never commits (Story 19.5 device smoke: "picked 1 min, got 25 min").
 * With memo + stable props the per-second tick can't re-render the wheel, so a
 * scroll settles cleanly. (wisdom-fruits 19.5.)
 */
export const DurationPicker = memo(function DurationPicker({
  valueMs,
  onChange,
  maxHours = 8,
  minuteStep = 1,
  accentColor,
  testID,
  style,
}: DurationPickerProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useDurationPickerStyles();

  const hours = Math.min(maxHours, Math.max(0, Math.floor(valueMs / MS_PER_HOUR)));
  const minutesRaw = Math.floor((valueMs % MS_PER_HOUR) / MS_PER_MINUTE);
  // Snap the incoming minute value to the nearest step so a wheel datum matches.
  // Clamp to the LAST wheel datum (not a hard 59): for a minuteStep that doesn't
  // divide 60 (e.g. 15 → data 0/15/30/45), rounding 59 up to 60→59 would have no
  // matching datum and the wheel couldn't settle. The default step (1) → max 59.
  const maxMinute = (Math.floor(60 / minuteStep) - 1) * minuteStep;
  const minutes = Math.min(maxMinute, Math.round(minutesRaw / minuteStep) * minuteStep);

  const hourData = useMemo<WheelDatum[]>(
    () => Array.from({ length: maxHours + 1 }, (_, h) => ({ value: h, label: String(h) })),
    [maxHours]
  );
  const minuteData = useMemo<WheelDatum[]>(
    () =>
      Array.from({ length: Math.floor(60 / minuteStep) }, (_, i) => {
        const m = i * minuteStep;
        return { value: m, label: String(m).padStart(2, '0') };
      }),
    [minuteStep]
  );

  // One selection tick + emit per settle (NOT per item flung past — that would
  // fire dozens of times). `onValueChanged` fires once when a wheel stops.
  const emit = (h: number, m: number) => {
    haptics.selection();
    onChange(h * MS_PER_HOUR + m * MS_PER_MINUTE);
  };

  // Non-`style` props (the wheel's own itemTextStyle / overlayItemStyle) carry
  // the theme tokens inline — same exemption as Icon `color` / `contentContainerStyle`.
  const overlayStyle = { backgroundColor: withAlpha(accentColor ?? colors.accent.primary, 0.1) };

  return (
    <View
      style={[styles.row, style]}
      testID={testID}
      // Not `accessibilityRole="adjustable"`: the two wheels are the interactive
      // a11y surface (swipe scroll); the container can't fulfil an adjust action,
      // so claiming the role would offer VoiceOver increment/decrement gestures
      // that do nothing. Keep a descriptive label announcing the current value.
      accessibilityLabel={t('a11y:durationValue', { hours, minutes })}
    >
      <WheelPicker
        data={hourData}
        value={hours}
        itemHeight={ITEM_HEIGHT}
        visibleItemCount={VISIBLE_ITEM_COUNT}
        width={WHEEL_WIDTH}
        itemTextStyle={styles.itemText}
        overlayItemStyle={overlayStyle}
        onValueChanged={({ item }) => emit(item.value, minutes)}
        testID={testID ? `${testID}-hours` : undefined}
      />
      <Text style={styles.unit}>h</Text>
      <WheelPicker
        data={minuteData}
        value={minutes}
        itemHeight={ITEM_HEIGHT}
        visibleItemCount={VISIBLE_ITEM_COUNT}
        width={WHEEL_WIDTH}
        itemTextStyle={styles.itemText}
        overlayItemStyle={overlayStyle}
        onValueChanged={({ item }) => emit(hours, item.value)}
        testID={testID ? `${testID}-minutes` : undefined}
      />
      <Text style={styles.unit}>m</Text>
    </View>
  );
});

const useDurationPickerStyles = () =>
  useThemedStyles((t) => ({
    row: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      gap: SPACING.xs,
    },
    itemText: {
      color: t.colors.text.primary,
      fontSize: FONT_SIZE.h2,
      fontWeight: FONT_WEIGHT.semibold,
    },
    unit: {
      fontSize: FONT_SIZE.body,
      fontWeight: FONT_WEIGHT.semibold,
      color: t.colors.text.secondary,
      marginRight: SPACING.sm,
    },
  }));
