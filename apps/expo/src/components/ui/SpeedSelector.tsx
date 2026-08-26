/**
 * SpeedSelector - Playback speed selector with slider and +/- buttons
 *
 * Story 5.3: Build Full-Screen AudioPlayer Component
 * Epic 5: Core Summary Playback
 *
 * Displays current playback speed with a slider and increment/decrement buttons.
 * Supports speeds from 0.5x to 2x with 0.1x button increments.
 *
 * @example
 * <SpeedSelector
 *   currentSpeed={1}
 *   onSpeedChange={(speed) => setPlaybackRate(speed)}
 * />
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { Slider } from '@/components/ui/Slider';
import { RADII } from '@/constants/radii';
import { SPACING } from '@/constants/spacing';
import { FONT_SIZE, FONT_WEIGHT } from '@/constants/typography';
import { useTheme } from '@/lib/theme';
import { useThemedStyles } from '@/lib/useThemedStyles';
import { Icon } from './Icon';

const INTERACTION_GUARD_MS = 200;

/** Step button size (using SPACING.xxl = 32px) */
const STEP_BUTTON_SIZE = SPACING.xxl;

/** Slider container width - component-specific dimension for compact layout */
const SLIDER_CONTAINER_WIDTH = 220;

/** Minimum playback speed */
const MIN_SPEED = 0.5;

/** Maximum playback speed */
const MAX_SPEED = 2;

/** Speed increment step for slider */
const SPEED_STEP = 0.05;

/** Speed increment step for buttons */
const BUTTON_STEP = 0.1;

/**
 * Props for SpeedSelector component
 */
export interface SpeedSelectorProps {
  /** Current playback speed */
  currentSpeed: number;
  /** Callback when speed is changed */
  onSpeedChange: (speed: number) => void;
  /** Whether the selector is disabled */
  disabled?: boolean;
  /** Test ID for testing */
  testID?: string;
}

/**
 * Format a playback rate for display (1 → "1.00x", 1.05 → "1.05x").
 *
 * ⚠️ EXPORTED because the player's overflow menu renders this same value in its collapsed row
 * header, with the `SpeedSelector` pill open directly beneath it — one screen, one setting. It
 * used to spell it `toFixed(1)` while this spelled it `toFixed(2)`, so at the slider's 0.05
 * granularity a rate of 1.05 read "1.1x" in the header and "1.05x" in the pill at the same moment,
 * and each site's comment asserted they agreed. Two spellings of one value is the defect; one
 * function is the fix (Story 24.19 Step I).
 */
export function formatSpeed(speed: number): string {
  // lint-i18n-ok: a MACHINE VALUE, deliberately not localized (Story 24.19). A playback rate is a
  // multiplier read against the `x` glyph, not prose — and the app's standing rule already forces
  // Western digits on every localized number (`numberingSystem: 'latn'`, Story 20.2 AC-7), so the
  // only thing routing this through `lib/format.ts` would change is `1.50x` → `1,50x` in French.
  // Revisit if a future locale makes the decimal mark visibly wrong rather than merely different.
  return `${speed.toFixed(2)}x`;
}

/**
 * SpeedSelector Component
 *
 * A slider-based speed selector for granular playback speed control.
 * Uses local state during interaction to prevent flash from state round-trip.
 */
export function SpeedSelector({
  currentSpeed,
  onSpeedChange,
  disabled = false,
  testID,
}: SpeedSelectorProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useThemedStyles((t) => ({
    container: {
      width: '100%',
      alignItems: 'center',
    },
    label: {
      fontSize: FONT_SIZE.h3,
      fontWeight: FONT_WEIGHT.semibold,
      marginBottom: SPACING.sm,
      color: t.colors.text.primary,
    },
    sliderContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      width: SLIDER_CONTAINER_WIDTH,
      paddingHorizontal: SPACING.xs,
    },
    slider: {
      flex: 1,
      height: 40,
      marginHorizontal: SPACING.xs,
    },
    stepButton: {
      width: STEP_BUTTON_SIZE,
      height: STEP_BUTTON_SIZE,
      borderRadius: RADII.lg,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.colors.background.tertiary,
    },
    stepButtonDisabled: {
      opacity: 0.5,
    },
  }));

  // Local speed state to prevent flash during interaction.
  // Updated optimistically on user input, synced back from prop when idle.
  const [localSpeed, setLocalSpeed] = useState(currentSpeed);
  const isInteractingRef = useRef(false);

  // The `@expo/ui/community/slider` thumb is effectively uncontrolled — it does
  // NOT reposition when `value` changes from OUTSIDE a drag (e.g. the +/-
  // buttons), so the thumb visually sticks while the number updates. Bumping a
  // `key` on each button press remounts the slider so it picks up the new value;
  // dragging does NOT bump it, so live drags stay smooth. (Story 19.5.)
  const [sliderEpoch, setSliderEpoch] = useState(0);

  // Sync local speed from prop when not actively interacting
  useEffect(() => {
    if (!isInteractingRef.current) {
      setLocalSpeed(currentSpeed);
    }
  }, [currentSpeed]);

  /**
   * Handle slider value change (continuous feedback while dragging).
   *
   * Story 17.3: `@expo/ui/community/slider` does NOT expose a release event
   * (no `onSlidingComplete`), so the `isInteractingRef` clear runs on
   * inactivity — `INTERACTION_GUARD_MS` after the last `onValueChange`.
   * Preserves the original "don't let `currentSpeed` prop overwrite
   * `localSpeed` mid-drag" UX without a release event.
   */
  const interactionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleValueChange = useCallback(
    (value: number) => {
      isInteractingRef.current = true;
      if (interactionTimeoutRef.current) clearTimeout(interactionTimeoutRef.current);
      interactionTimeoutRef.current = setTimeout(() => {
        isInteractingRef.current = false;
        interactionTimeoutRef.current = null;
      }, INTERACTION_GUARD_MS);
      // Round to nearest step for clean values
      const rounded = Math.round(value / SPEED_STEP) * SPEED_STEP;
      // Ensure value is within bounds and has 2 decimal places
      const clamped = Math.max(MIN_SPEED, Math.min(MAX_SPEED, rounded));
      const cleaned = Math.round(clamped * 100) / 100;
      setLocalSpeed(cleaned);
      onSpeedChange(cleaned);
    },
    [onSpeedChange]
  );

  // Cleanup interaction timeout on unmount.
  useEffect(() => {
    return () => {
      if (interactionTimeoutRef.current) clearTimeout(interactionTimeoutRef.current);
    };
  }, []);

  /**
   * Handle decrement button press
   */
  const handleDecrement = useCallback(() => {
    const newSpeed = Math.max(MIN_SPEED, localSpeed - BUTTON_STEP);
    const cleaned = Math.round(newSpeed * 10) / 10;
    setLocalSpeed(cleaned);
    setSliderEpoch((e) => e + 1); // remount the slider so the thumb follows
    onSpeedChange(cleaned);
  }, [localSpeed, onSpeedChange]);

  /**
   * Handle increment button press
   */
  const handleIncrement = useCallback(() => {
    const newSpeed = Math.min(MAX_SPEED, localSpeed + BUTTON_STEP);
    const cleaned = Math.round(newSpeed * 10) / 10;
    setLocalSpeed(cleaned);
    setSliderEpoch((e) => e + 1); // remount the slider so the thumb follows
    onSpeedChange(cleaned);
  }, [localSpeed, onSpeedChange]);

  const isAtMin = localSpeed <= MIN_SPEED;
  const isAtMax = localSpeed >= MAX_SPEED;

  return (
    <View style={styles.container} testID={testID}>
      {/* Speed label */}
      <Text
        style={styles.label}
        accessibilityLabel={t('a11y:playbackSpeedValue', { speed: formatSpeed(localSpeed) })}
      >
        {formatSpeed(localSpeed)}
      </Text>

      {/* Slider with +/- buttons */}
      <View style={styles.sliderContainer}>
        {/* Decrement button */}
        <Pressable
          onPress={handleDecrement}
          disabled={disabled || isAtMin}
          style={({ pressed }) => [
            styles.stepButton,
            (disabled || isAtMin) && styles.stepButtonDisabled,
            pressed && { opacity: 0.7 },
          ]}
          accessibilityLabel={t('a11y:decreaseSpeed')}
          accessibilityRole="button"
          testID={testID ? `${testID}-decrement` : undefined}
        >
          <Icon
            name="remove"
            size={18}
            color={disabled || isAtMin ? colors.text.tertiary : colors.text.primary}
          />
        </Pressable>

        {/* Slider — `key` remounts it on +/- so the native thumb tracks the value. */}
        <Slider
          key={sliderEpoch}
          style={styles.slider}
          minimumValue={MIN_SPEED}
          maximumValue={MAX_SPEED}
          value={localSpeed}
          onValueChange={handleValueChange}
          disabled={disabled}
          minimumTrackTintColor={colors.accent.primary}
          maximumTrackTintColor={colors.accent.secondary}
          thumbTintColor={colors.accent.primary}
          testID={testID ? `${testID}-slider` : undefined}
        />

        {/* Increment button */}
        <Pressable
          onPress={handleIncrement}
          disabled={disabled || isAtMax}
          style={({ pressed }) => [
            styles.stepButton,
            (disabled || isAtMax) && styles.stepButtonDisabled,
            pressed && { opacity: 0.7 },
          ]}
          accessibilityLabel={t('a11y:increaseSpeed')}
          accessibilityRole="button"
          testID={testID ? `${testID}-increment` : undefined}
        >
          <Icon
            name="add"
            size={18}
            color={disabled || isAtMax ? colors.text.tertiary : colors.text.primary}
          />
        </Pressable>
      </View>
    </View>
  );
}
