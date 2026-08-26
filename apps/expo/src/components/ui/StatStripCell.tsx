/**
 * StatStripCell — one cell of a tappable summary "stat strip" (an accent icon + a big value +
 * a small caption), the summary half of the app's summary-strip → detail-page idiom.
 *
 * Extracted from the Profile account-hero strip (Story 23.9) to a shared primitive in Story 25.5
 * once a 2nd consumer appeared (the Quizzes hub stats strip) — a route cannot import another
 * route's private component. The five style keys it owned (`statCell` / `statCellDivider` /
 * `statTop` / `statValue` / `statLabel`) migrated here with it, so it is self-contained and both
 * consumers render pixel-identically. Pure/presentational; the parent Pressable owns the tap.
 */

import { View } from 'react-native';
import { SPACING } from '@/constants/spacing';
import { FONT_SIZE, FONT_WEIGHT } from '@/constants/typography';
import { useTheme } from '@/lib/theme';
import { useThemedStyles } from '@/lib/useThemedStyles';
import { Icon } from './Icon';
import type { IconName } from './icon-registry';
import { Text } from './Themed';

export interface StatStripCellProps {
  /** Accent-tinted leading icon. */
  icon: IconName;
  /** The prominent value (already formatted — e.g. `"7"`, `"90%"`). */
  value: string;
  /** The caption beneath the value. */
  label: string;
  /** Draw a left hairline divider (every cell after the first). */
  divider?: boolean;
}

export function StatStripCell({ icon, value, label, divider }: StatStripCellProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={[styles.statCell, divider && styles.statCellDivider]}>
      <View style={styles.statTop}>
        <Icon name={icon} size={15} color={colors.accent.primary} />
        <Text style={styles.statValue}>{value}</Text>
      </View>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const useStyles = () =>
  useThemedStyles((t) => ({
    statCell: {
      flex: 1,
      alignItems: 'center' as const,
    },
    statCellDivider: {
      borderLeftWidth: 1,
      borderLeftColor: t.colors.separator,
    },
    statTop: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: SPACING.xs,
    },
    statValue: {
      fontSize: FONT_SIZE.h2,
      fontWeight: FONT_WEIGHT.bold,
      color: t.colors.text.primary,
    },
    statLabel: {
      fontSize: FONT_SIZE.caption,
      fontWeight: FONT_WEIGHT.regular,
      marginTop: SPACING.xs,
      color: t.colors.text.secondary,
    },
  }));
