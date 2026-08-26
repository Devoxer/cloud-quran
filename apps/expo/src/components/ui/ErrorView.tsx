/**
 * ErrorView — the single full-screen / section error-takeover primitive (Story 23.6).
 *
 * The fourth and final state in the canonical async taxonomy: when a screen's
 * PRIMARY data fails to load there is nothing to render, so the body is replaced
 * by a centered icon + title + message + optional action (Retry / Go Back). This
 * promotes the shape ~5 screens hand-rolled (subscription's local `ErrorState`,
 * feed/playlist/book/discover error branches) into one home with `role="alert"`.
 *
 * Sibling of `EmptyState` — same icon+title+description+button skeleton, same CTA
 * styling — but semantically distinct: error tone (`colors.semantic.error` icon),
 * `accessibilityRole="alert"`, default action label `t('common:actions.tryAgain')`.
 *
 * NOT a dialog/overlay: it replaces the screen body inline. Must-acknowledge
 * messages use a native alert; a failed *action* with content still visible uses
 * `InlineError`; a missing entity uses `EmptyState` (+ Go Back), not this.
 *
 * @example
 * // Full-screen error takeover
 * if (error) return <ErrorView title="Unable to load plans" message={error.message} onAction={retry} fullScreen />;
 */

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, type StyleProp, Text, View, type ViewStyle } from 'react-native';
import { RADII } from '@/constants/radii';
import { SPACING } from '@/constants/spacing';
import { FONT_SIZE, FONT_WEIGHT, LINE_HEIGHT } from '@/constants/typography';
import { useTheme } from '@/lib/theme';
import { useThemedStyles } from '@/lib/useThemedStyles';
import { Icon } from './Icon';
import type { IconName } from './icon-registry';

export interface ErrorViewProps {
  /** Main error title (e.g. "Unable to load plans"). */
  title: string;
  /** Optional supporting message under the title. */
  message?: string;
  /** Action button label. @default `t('common:actions.tryAgain')` */
  actionLabel?: string;
  /** Action handler — renders the button only when provided. */
  onAction?: () => void;
  /** Semantic icon name. @default 'warning-outline' */
  icon?: IconName;
  /** Fill the available space and center vertically (screen-level takeover). @default false */
  fullScreen?: boolean;
  /** Optional container style override (margins, min-height for a section). */
  style?: StyleProp<ViewStyle>;
  /**
   * Future-mascot swap point (Story 23.17 AC-9): a custom illustration that renders INSTEAD
   * of the error icon. Omitted today; the deferred mascot story supplies it. Falls back to
   * the bare icon when undefined (zero breakage).
   */
  illustration?: ReactNode;
  /** Test ID. @default 'error-view' */
  testID?: string;
}

export function ErrorView({
  title,
  message,
  actionLabel,
  onAction,
  icon = 'warning-outline',
  fullScreen = false,
  style,
  illustration,
  testID = 'error-view',
}: ErrorViewProps) {
  const { t } = useTranslation();
  // Resolved HERE, not as a default parameter value: a literal default would ship untranslated on
  // every call site that passes `onAction` without `actionLabel` (3 quiz screens did), and
  // `lint-i18n` has no sink for default parameter values so nothing would flag it. Epic-20 boundary.
  const resolvedActionLabel = actionLabel ?? t('common:actions.tryAgain');
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
    message: {
      fontSize: FONT_SIZE.bodySmall,
      fontWeight: FONT_WEIGHT.regular,
      lineHeight: FONT_SIZE.bodySmall * LINE_HEIGHT.relaxed,
      textAlign: 'center',
      marginBottom: SPACING.lg,
      color: t.colors.text.secondary,
    },
    actionButton: {
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.lg,
      borderRadius: RADII.md,
      marginTop: SPACING.sm,
      backgroundColor: t.colors.accent.primary,
    },
    actionButtonPressed: {
      opacity: 0.8,
    },
    actionText: {
      fontSize: FONT_SIZE.body,
      fontWeight: FONT_WEIGHT.semibold,
      color: t.colors.text.onAccent,
    },
  }));

  return (
    <View
      style={[styles.container, fullScreen && styles.fullScreen, style]}
      accessibilityRole="alert"
      testID={testID}
    >
      {/* Future-mascot swap point (Story 23.17 AC-9): an `illustration` renders instead of
          the bare error icon; falls back to the icon when undefined. */}
      {illustration ?? (
        <Icon
          name={icon}
          size={48}
          color={colors.semantic.error}
          style={styles.icon}
          testID="error-view-icon"
        />
      )}
      <Text style={styles.title}>{title}</Text>
      {message && (
        <Text style={styles.message} testID="error-view-message">
          {message}
        </Text>
      )}
      {onAction && (
        <Pressable
          style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={resolvedActionLabel}
          testID="error-view-action"
        >
          <Text style={styles.actionText}>{resolvedActionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}
