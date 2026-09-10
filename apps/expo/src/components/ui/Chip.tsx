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

import { Pressable, StyleProp, Text, View, ViewStyle } from 'react-native';
import { RADII } from '@/constants/radii';
import { SHADOWS } from '@/constants/shadows';
import { SPACING } from '@/constants/spacing';
import { FONT_SIZE, FONT_WEIGHT } from '@/constants/typography';
import { useTheme } from '@/lib/theme';
import { useThemedStyles } from '@/lib/useThemedStyles';
import { Icon } from './Icon';
import type { IconName } from './icon-registry';

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
  /**
   * Optional glyph before the label (story 7-4). Decorative — it is hidden from the
   * accessibility tree, because the chip already announces itself by `accessibilityLabel`.
   */
  icon?: IconName;
  /**
   * What a screen reader announces, when that is not simply the label (story 7-4).
   *
   * ⚠️ IT EXISTS BECAUSE A CHIP'S LABEL IS OFTEN A FRAGMENT. "30m" beside three other numbers is
   * a perfectly good visual chip and a useless announcement; the sleep timer needs "Sleep timer
   * 30m". Defaults to `label`, so every existing caller is byte-identical.
   */
  accessibilityLabel?: string;
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
  icon,
  accessibilityLabel,
  style,
  testID,
}: ChipProps) {
  // `Icon` takes its colour as a plain prop, which `lint:style` scan 3 exempts by design.
  const { colors } = useTheme();
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
    /** Icon + label share one row; `gap` only shows when an icon is actually passed. */
    content: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
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
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: isSelected }}
      testID={testID}
    >
      <View style={styles.content}>
        {icon ? (
          <Icon
            name={icon}
            size={fontSize}
            color={isSelected ? colors.text.onAccent : colors.text.primary}
            accessibilityElementsHidden
            testID={testID ? `${testID}-icon` : undefined}
          />
        ) : null}
        <Text
          style={[styles.text, isSelected ? styles.textSelected : styles.textIdle, { fontSize }]}
          testID={testID ? `${testID}-text` : undefined}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}
