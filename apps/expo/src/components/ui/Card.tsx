/**
 * Card — the surface base primitive (Story 23.2).
 *
 * The single owner of the "grouped rounded surface" look: radius `RADII.lg`, a
 * `background.secondary` fill, a 1px `border` hairline, and `SHADOWS.card`. Every
 * settings/forms card composes from this so the border + radius + elevation never
 * drift per-screen (ux-23 AC-4).
 *
 * `padded` controls inner padding: `true` / omitted → `SPACING.lg`; `false` → none
 * (the consumer's rows manage their own padding, e.g. `SettingsGroup`); a spacing
 * key (`'sm' | 'md' | …`) → that value.
 *
 * @example
 * <Card><Text>Content</Text></Card>            // padded SPACING.lg
 * <Card padded={false}>{rows}</Card>           // rows own their padding
 * <Card padded="md"><Form /></Card>            // padded SPACING.md
 */

import type { ReactNode } from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';
import { RADII } from '@/constants/radii';
import { SHADOWS } from '@/constants/shadows';
import { SPACING, type SpacingToken } from '@/constants/spacing';
import { useThemedStyles } from '@/lib/useThemedStyles';

export interface CardProps {
  children: ReactNode;
  /**
   * Inner padding. `true` / omitted → `SPACING.lg`; `false` → none; a spacing key → that value.
   * @default true
   */
  padded?: boolean | SpacingToken;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

function resolvePadding(padded: CardProps['padded']): number {
  if (padded === false) return 0;
  if (padded === undefined || padded === true) return SPACING.lg;
  return SPACING[padded];
}

export function Card({ children, padded, style, testID }: CardProps) {
  const styles = useStyles();
  return (
    <View style={[styles.card, { padding: resolvePadding(padded) }, style]} testID={testID}>
      {children}
    </View>
  );
}

const useStyles = () =>
  useThemedStyles((t) => ({
    card: {
      borderRadius: RADII.lg,
      backgroundColor: t.colors.background.secondary,
      borderWidth: 1,
      borderColor: t.colors.border,
      ...SHADOWS.card,
    },
  }));
