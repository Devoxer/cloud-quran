/**
 * DurationBadge - Displays summary duration in a pill-shaped badge
 *
 * Story 4.2: Build DurationBadge Component
 * Epic 4: Book Discovery & Browsing
 *
 * Shows duration (1, 5, or 15 minutes) with optional lock icon
 * for premium content and selected state for tier selection.
 *
 * @example
 * // Default badge
 * <DurationBadge duration="5min" />
 *
 * // Locked premium content
 * <DurationBadge duration="15min" isLocked />
 *
 * // Selected in tier selection UI
 * <DurationBadge duration="1min" isSelected />
 */

import { useTranslation } from 'react-i18next';
import { StyleProp, Text, View, ViewStyle } from 'react-native';
import { RADII } from '@/constants/radii';
import { SPACING, spacing } from '@/constants/spacing';
import { FONT_SIZE, FONT_WEIGHT } from '@/constants/typography';
import { useTheme } from '@/lib/theme';
import { useThemedStyles } from '@/lib/useThemedStyles';
import { Icon } from './Icon';

/**
 * Duration value type
 */
export type DurationValue = '1min' | '5min' | '15min';

/**
 * Props for DurationBadge component
 */
export interface DurationBadgeProps {
  /** Duration to display */
  duration: DurationValue;
  /** Whether this is premium content (shows lock icon) */
  isLocked?: boolean;
  /** Whether this badge is currently selected (for tier selection UI) */
  isSelected?: boolean;
  /** Size variant */
  size?: 'small' | 'medium';
  /** Optional container style override */
  style?: StyleProp<ViewStyle>;
  /** Test ID for testing */
  testID?: string;
}

/**
 * DurationBadge Component
 *
 * Displays summary duration in a pill-shaped badge with optional
 * lock icon for premium content and selected state styling.
 */
export function DurationBadge({
  duration,
  isLocked = false,
  isSelected = false,
  size = 'small',
  style,
  testID,
}: DurationBadgeProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();

  // Visible tier label ("1 min" / "5 min" / "15 min") + the composed a11y label, both via t().
  const durationLabel = t(`common:durationBadge.${duration}`);
  const accessibilityLabel = isLocked
    ? t('a11y:durationSummaryLocked', { duration: durationLabel })
    : t('a11y:durationSummary', { duration: durationLabel });

  // Lock-icon color is applied to a non-style `color=` prop (no StyleSheet home) — stays inline per AC5.
  const iconColor = isSelected ? colors.text.onAccent : colors.text.tertiary;

  const styles = useThemedStyles((t) => ({
    badge: {
      borderRadius: RADII.pill, // Pill shape
      flexDirection: 'row',
      alignItems: 'center',
    },
    badgeSelected: {
      backgroundColor: t.colors.accent.primary,
    },
    badgeIdle: {
      backgroundColor: t.colors.background.tertiary,
    },
    text: {
      fontWeight: FONT_WEIGHT.medium,
    },
    textSelected: {
      color: t.colors.text.onAccent,
    },
    textIdle: {
      color: t.colors.text.secondary,
    },
    lockIcon: {
      marginLeft: SPACING.xs, // 4px gap after text
    },
  }));

  // Size-specific (non-theme) values stay inline — driven by the `size` prop.
  const isSmall = size === 'small';
  const sizeStyle = {
    paddingHorizontal: isSmall ? SPACING.sm : SPACING.md,
    // 6px vertical padding for medium variant per UX spec (not in standard scale, but spec-compliant)
    paddingVertical: isSmall ? SPACING.xs : spacing(1.5),
  };
  const fontSize = isSmall ? FONT_SIZE.caption : FONT_SIZE.bodySmall;
  // Icon sizes: 10px small, 12px medium per UX spec
  const iconSize = isSmall ? spacing(2.5) : SPACING.md;

  return (
    <View
      style={[styles.badge, isSelected ? styles.badgeSelected : styles.badgeIdle, sizeStyle, style]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      <Text
        style={[styles.text, isSelected ? styles.textSelected : styles.textIdle, { fontSize }]}
        testID={testID ? `${testID}-text` : undefined}
      >
        {durationLabel}
      </Text>
      {isLocked && (
        <Icon
          name="lock-closed"
          size={iconSize}
          color={iconColor}
          style={styles.lockIcon}
          testID={testID ? `${testID}-lock-icon` : undefined}
        />
      )}
    </View>
  );
}
