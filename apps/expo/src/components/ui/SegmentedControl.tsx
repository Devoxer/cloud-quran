/**
 * SegmentedControl — a custom accent-filled segmented ("multichoice") control.
 *
 * Story 28.2 (follow-up): replaced the `@expo/ui/community/segmented-control` wrapper. The community
 * control couldn't render the app's ACCENT as the selected-segment fill consistently — iOS 13+ uses
 * the fixed system appearance (a white pill on gray, `tintColor` ignored) and the web vendored
 * control rendered a fixed navy pill regardless of `tintColor`. So the selected segment never tracked
 * the palette, diverging from the app's other toggles. This custom control is a `View` of `Pressable`
 * segments with an `accent.primary` active fill + `text.onAccent` label on every platform, matching
 * `BookViewModeToggle` (the icon toggle) and the accent-selector convention (primitives.md § Color).
 *
 * Drop-in for the prior wrapper's used surface: `values` / `selectedIndex` / `onValueChange` /
 * `enabled` / `style` / `testID`. `tintColor` overrides the active fill; `appearance` is accepted for
 * back-compat and ignored (this control is theme-aware via `useTheme`). `text.onAccent` on
 * `accent.primary` is contrast-gated for every palette × scheme (`constants/palettes.contrast.test.ts`).
 */

import {
  type ColorValue,
  Pressable,
  type StyleProp,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { RADII } from '@/constants/radii';
import { SPACING } from '@/constants/spacing';
import { FONT_SIZE, FONT_WEIGHT } from '@/constants/typography';
import { useThemedStyles } from '@/lib/useThemedStyles';

export interface SegmentedControlProps {
  /** The labels for the control's segment buttons, in order. */
  values?: string[];
  /** The index of the selected segment. */
  selectedIndex?: number;
  /** Called when the user taps a segment; receives the segment's string value. */
  onValueChange?: (value: string) => void;
  /** Native-event form (back-compat with `@react-native-segmented-control`) — carries the index + value. */
  onChange?: (event: { nativeEvent: { selectedSegmentIndex: number; value: string } }) => void;
  /** If `false`, the control is non-interactive + dimmed. @default true */
  enabled?: boolean;
  /** Active-segment fill. Defaults to `accent.primary`. */
  tintColor?: ColorValue;
  /** Accepted for back-compat with the prior native wrapper; ignored (theme-aware by default). */
  appearance?: 'light' | 'dark';
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function SegmentedControl({
  values = [],
  selectedIndex = 0,
  onValueChange,
  onChange,
  enabled = true,
  tintColor,
  style,
  testID,
}: SegmentedControlProps) {
  const styles = useStyles();

  // Clamp so an out-of-range index (e.g. -1 or >= length) still highlights a real segment rather
  // than leaving the control with no active selection (the native control it replaced clamped too).
  const activeIndex =
    values.length === 0 ? -1 : Math.min(Math.max(selectedIndex, 0), values.length - 1);

  return (
    <View style={[styles.track, !enabled && styles.disabled, style]} testID={testID}>
      {values.map((value, i) => {
        const active = i === activeIndex;
        return (
          <Pressable
            // Key by index too — labels aren't guaranteed unique (a caller could pass a duplicate).
            key={`${value}-${i}`}
            onPress={() => {
              if (!enabled) return;
              onValueChange?.(value);
              onChange?.({ nativeEvent: { selectedSegmentIndex: i, value } });
            }}
            disabled={!enabled}
            style={[
              styles.segment,
              active && (tintColor ? { backgroundColor: tintColor } : styles.segmentActive),
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: active, disabled: !enabled }}
            accessibilityLabel={value}
            testID={testID ? `${testID}-${i}` : undefined}
          >
            <Text
              style={[styles.label, active && styles.labelActive]}
              numberOfLines={1}
              // Keep the active label readable on the accent fill even if the caller tints it.
              // (Inactive labels stay muted.)
            >
              {value}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = () =>
  useThemedStyles((t) => ({
    track: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      backgroundColor: t.colors.background.tertiary,
      borderRadius: RADII.md,
      padding: 3,
      gap: 3,
    },
    disabled: {
      opacity: 0.5,
    },
    segment: {
      flex: 1,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      paddingVertical: SPACING.xs + 2, // ~6
      paddingHorizontal: SPACING.sm,
      borderRadius: RADII.sm,
    },
    segmentActive: {
      backgroundColor: t.colors.accent.primary,
    },
    label: {
      fontSize: FONT_SIZE.bodySmall,
      fontWeight: FONT_WEIGHT.semibold,
      color: t.colors.text.secondary,
    },
    labelActive: {
      color: t.colors.text.onAccent,
    },
  }));
