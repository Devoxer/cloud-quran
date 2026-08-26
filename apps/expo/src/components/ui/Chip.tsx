/**
 * Chip - Pill-shaped interactive chip for category/topic selection
 *
 * Story 4.3: Implement Discover Tab with Categories and Topics
 * Epic 4: Book Discovery & Browsing
 *
 * Displays a tappable pill-shaped chip with default and selected states.
 * Used for category and topic filtering in the Discover tab.
 *
 * @example
 * // Default chip
 * <Chip label="Self-Help" onPress={() => handleSelect('Self-Help')} />
 *
 * // Selected chip
 * <Chip label="Psychology" isSelected onPress={() => handleSelect('Psychology')} />
 *
 * // Medium size
 * <Chip label="Habits" size="medium" />
 */

import { Pressable, StyleProp, Text, ViewStyle } from 'react-native';
import { RADII } from '@/constants/radii';
import { SHADOWS } from '@/constants/shadows';
import { SPACING } from '@/constants/spacing';
import { FONT_SIZE, FONT_WEIGHT } from '@/constants/typography';
import { useThemedStyles } from '@/lib/useThemedStyles';

/**
 * Props for Chip component
 */
export interface ChipProps {
  /** Label text to display */
  label: string;
  /** Whether chip is currently selected/active */
  isSelected?: boolean;
  /** Callback when chip is pressed */
  onPress?: () => void;
  /** Size variant */
  size?: 'small' | 'medium';
  /** Optional container style */
  style?: StyleProp<ViewStyle>;
  /** Test ID for testing */
  testID?: string;
}

/**
 * Chip Component
 *
 * Pill-shaped interactive chip for category/topic selection.
 * Features default and selected state styling with press animation.
 */
export function Chip({
  label,
  isSelected = false,
  onPress,
  size = 'small',
  style,
  testID,
}: ChipProps) {
  const styles = useThemedStyles((t) => ({
    chip: {
      borderRadius: RADII.pill, // Pill shape
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      ...SHADOWS.card, // unified soft elevation (matches the cards/buttons app-wide)
    },
    chipSelected: {
      backgroundColor: t.colors.accent.primary,
      borderColor: t.colors.accent.primary,
    },
    chipIdle: {
      backgroundColor: t.colors.background.secondary,
      borderColor: t.colors.border,
    },
    text: {
      fontWeight: FONT_WEIGHT.medium,
    },
    textSelected: {
      color: t.colors.text.onAccent,
    },
    textIdle: {
      color: t.colors.text.primary,
    },
  }));

  // Size-specific (non-theme) values stay inline — driven by the `size` prop.
  const isSmall = size === 'small';
  const sizeStyle = {
    paddingHorizontal: isSmall ? SPACING.sm : SPACING.md,
    paddingVertical: isSmall ? SPACING.xs : SPACING.sm,
  };
  const fontSize = isSmall ? FONT_SIZE.bodySmall : FONT_SIZE.body;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.chip,
        isSelected ? styles.chipSelected : styles.chipIdle,
        sizeStyle,
        { opacity: pressed ? 0.8 : 1 },
        style,
      ]}
      onPress={onPress}
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: isSelected }}
      testID={testID}
    >
      <Text
        style={[styles.text, isSelected ? styles.textSelected : styles.textIdle, { fontSize }]}
        testID={testID ? `${testID}-text` : undefined}
      >
        {label}
      </Text>
    </Pressable>
  );
}
