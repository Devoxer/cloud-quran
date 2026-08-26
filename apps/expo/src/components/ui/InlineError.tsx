/**
 * InlineError — contextual inline error message (Story 17.13).
 *
 * Replaces error toasts for failures that have an on-screen home (a form, a list
 * row, a sheet): the message renders in place, next to the action that failed,
 * instead of a banner that obstructs the UI and may vanish before it's read.
 * Themed soft-error background + error icon; an optional "Retry" affordance for
 * recoverable actions ("Failed to delete. Tap to retry.").
 *
 * @example
 * {error && <InlineError message={error} onRetry={retry} testID="x-error" />}
 */

import { useTranslation } from 'react-i18next';
import { Pressable, type StyleProp, Text, View, type ViewStyle } from 'react-native';
import { RADII } from '@/constants/radii';
import { SPACING } from '@/constants/spacing';
import { FONT_SIZE, FONT_WEIGHT, LINE_HEIGHT } from '@/constants/typography';
import { useTheme } from '@/lib/theme';
import { useThemedStyles } from '@/lib/useThemedStyles';
import { Icon } from './Icon';

export interface InlineErrorProps {
  /** Error message to display. */
  message: string;
  /** Optional retry handler — renders a "Retry" button when provided. */
  onRetry?: () => void;
  /** Retry button label. @default 'Retry' */
  retryLabel?: string;
  /**
   * Disables the retry affordance while its action is in flight — blocks re-taps and marks
   * the control busy for assistive tech. No effect when `onRetry` is absent.
   */
  retryDisabled?: boolean;
  /** Optional container style override (margins, alignment per screen). */
  style?: StyleProp<ViewStyle>;
  /** Test ID. @default 'inline-error' */
  testID?: string;
}

export function InlineError({
  message,
  onRetry,
  retryLabel,
  retryDisabled = false,
  style,
  testID = 'inline-error',
}: InlineErrorProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useThemedStyles((t) => ({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.md,
      borderRadius: RADII.md,
      backgroundColor: t.colors.semantic.errorBg,
    },
    message: {
      flex: 1,
      fontSize: FONT_SIZE.bodySmall,
      fontWeight: FONT_WEIGHT.medium,
      lineHeight: FONT_SIZE.bodySmall * LINE_HEIGHT.body,
      color: t.colors.semantic.error,
    },
    retry: {
      fontSize: FONT_SIZE.bodySmall,
      fontWeight: FONT_WEIGHT.semibold,
      color: t.colors.semantic.error,
    },
    retryDisabled: {
      opacity: 0.5,
    },
  }));

  return (
    <View style={[styles.container, style]} accessibilityRole="alert" testID={testID}>
      <Icon name="alert-circle-outline" size={18} color={colors.semantic.error} />
      <Text style={styles.message}>{message}</Text>
      {onRetry && (
        <Pressable
          onPress={onRetry}
          disabled={retryDisabled}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={retryLabel ?? t('actions.retry')}
          accessibilityState={{ disabled: retryDisabled, busy: retryDisabled }}
          style={retryDisabled && styles.retryDisabled}
          testID={`${testID}-retry`}
        >
          <Text style={styles.retry}>{retryLabel ?? t('actions.retry')}</Text>
        </Pressable>
      )}
    </View>
  );
}
