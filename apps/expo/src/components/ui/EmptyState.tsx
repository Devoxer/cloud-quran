/**
 * EmptyState - Reusable empty state component
 *
 * Story 8.2: Implement Library Tab Screen
 * Epic 8: User Library & Collections
 *
 * Displays an empty state with optional icon, title, description, and CTA button.
 *
 * @example
 * // Basic usage
 * <EmptyState title="No books found" />
 *
 * // With description and CTA
 * <EmptyState
 *   icon="library-outline"
 *   title="Start listening"
 *   description="Your progress will appear here"
 *   ctaLabel="Discover Books"
 *   onCtaPress={() => router.push('/discover')}
 * />
 */

import type { ReactNode } from 'react';
import { Pressable, type StyleProp, Text, View, type ViewStyle } from 'react-native';
import { RADII } from '@/constants/radii';
import { SHADOWS } from '@/constants/shadows';
import { SPACING } from '@/constants/spacing';
import { FONT_SIZE, FONT_WEIGHT, LINE_HEIGHT } from '@/constants/typography';
import { useTheme } from '@/lib/theme';
import { useThemedStyles } from '@/lib/useThemedStyles';
import { Icon } from './Icon';
import type { IconName } from './icon-registry';

export interface EmptyStateProps {
  /** Optional semantic icon name */
  icon?: IconName;
  /** Main title text */
  title: string;
  /** Optional description text */
  description?: string;
  /** Optional CTA button label */
  ctaLabel?: string;
  /** Called when CTA button is pressed */
  onCtaPress?: () => void;
  /** Fill the available band and center vertically (mirrors ErrorView). @default false */
  fullScreen?: boolean;
  /**
   * Surface treatment. `'plain'` (default) sits bare on the background; `'card'` wraps the
   * content in the shared {@link Card} look (radius + `background.secondary` + hairline border
   * + shadow + side margin) so a section-level empty state reads as a grouped card — used on
   * the Library home so the empty sections match the sign-up banner + settings cards
   * (Story 26.8). Ignored when `fullScreen`.
   */
  variant?: 'plain' | 'card';
  /**
   * Future-mascot swap point (Story 23.17 AC-9): a custom illustration that renders INSTEAD
   * of the icon. Omitted today; the deferred mascot story supplies it. Falls back to the
   * bare icon when undefined (zero breakage).
   */
  illustration?: ReactNode;
  /** Optional container style override (mirrors ErrorView) — lets a section-level empty
   *  state be given min-height / margins by the caller. */
  style?: StyleProp<ViewStyle>;
  /** Test ID for testing */
  testID?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  ctaLabel,
  onCtaPress,
  fullScreen = false,
  variant = 'plain',
  illustration,
  style,
  testID,
}: EmptyStateProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles((t) => ({
    container: {
      alignItems: 'center',
      paddingVertical: SPACING.xl,
      paddingHorizontal: SPACING.lg,
    },
    fullScreen: {
      flex: 1,
      justifyContent: 'center',
    },
    card: {
      borderRadius: RADII.lg,
      backgroundColor: t.colors.background.secondary,
      borderWidth: 1,
      borderColor: t.colors.border,
      marginHorizontal: SPACING.lg,
      ...SHADOWS.card,
    },
    icon: {
      marginBottom: SPACING.md,
    },
    title: {
      fontSize: FONT_SIZE.body,
      fontWeight: FONT_WEIGHT.medium,
      lineHeight: FONT_SIZE.body * LINE_HEIGHT.body,
      textAlign: 'center',
      marginBottom: SPACING.xs,
      color: t.colors.text.primary,
    },
    description: {
      fontSize: FONT_SIZE.bodySmall,
      fontWeight: FONT_WEIGHT.regular,
      lineHeight: FONT_SIZE.bodySmall * LINE_HEIGHT.relaxed,
      textAlign: 'center',
      marginBottom: SPACING.lg,
      color: t.colors.text.secondary,
    },
    ctaButton: {
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.lg,
      borderRadius: RADII.md,
      marginTop: SPACING.sm,
      backgroundColor: t.colors.accent.primary,
    },
    ctaButtonPressed: {
      opacity: 0.8,
    },
    ctaText: {
      fontSize: FONT_SIZE.body,
      fontWeight: FONT_WEIGHT.semibold,
      color: t.colors.text.onAccent,
    },
  }));

  return (
    <View
      style={[
        styles.container,
        fullScreen && styles.fullScreen,
        variant === 'card' && !fullScreen && styles.card,
        style,
      ]}
      testID={testID}
    >
      {/* Future-mascot swap point (Story 23.17 AC-9): an `illustration` renders instead of
          the bare icon; falls back to the icon when undefined (nullish, mirrors ErrorView). */}
      {illustration ??
        (icon && (
          <Icon
            name={icon}
            size={48}
            color={colors.text.secondary}
            style={styles.icon}
            testID="empty-state-icon"
          />
        ))}
      <Text style={styles.title}>{title}</Text>
      {description && (
        <Text style={styles.description} testID="empty-state-description">
          {description}
        </Text>
      )}
      {ctaLabel && onCtaPress && (
        <Pressable
          style={({ pressed }) => [styles.ctaButton, pressed && styles.ctaButtonPressed]}
          onPress={onCtaPress}
          accessibilityRole="button"
          accessibilityLabel={ctaLabel}
          testID="empty-state-cta"
        >
          <Text style={styles.ctaText}>{ctaLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}
