/**
 * Feedback Form Screen (CHANGE-022)
 *
 * Category selection (Bug, Suggestion, General) + a multi-line message with a min-length check.
 *
 * ⚠️ story 5-2: SUBMISSION IS INERT, DELIBERATELY. The handler used to `db.transact` a `feedback`
 * row into InstantDB and fire a PostHog event; the vendor is being retired and there is no
 * analytics SDK, so both are gone and there is nowhere to send a message until story 5-4 gives
 * the worker a data API. The screen stays because it is one of the two routes the `(profile)` tab
 * actually has — deleting it would break the tab — and because the form itself is what 5-4 wires
 * up. Submitting validates, keeps the typed message, and says plainly that nothing was sent. It
 * does NOT pretend to succeed, and it does NOT surface an error the user could act on.
 */

import { Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Icon, Text } from '@/components/ui';
import type { IconName } from '@/components/ui/icon-registry';
import { RADII } from '@/constants/radii';
import { SPACING, screenContentStyle } from '@/constants/spacing';
import { FONT_SIZE, FONT_WEIGHT, LINE_HEIGHT } from '@/constants/typography';
import { feedbackMessageSchema } from '@/lib/forms/schemas';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/lib/theme';
import { useThemedStyles } from '@/lib/useThemedStyles';

const FEEDBACK_CATEGORIES = ['bug', 'suggestion', 'general'] as const;
type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

const CATEGORY_ICONS: Record<FeedbackCategory, IconName> = {
  bug: 'bug-outline',
  suggestion: 'bulb-outline',
  general: 'chatbubble-outline',
};

export default function FeedbackScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useStyles();

  const [category, setCategory] = useState<FeedbackCategory>('general');
  const [message, setMessage] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  // Story 17.13: the confirmation is inline on the form (it replaced a toast that fired after
  // navigating away). story 5-2 turned it from "sent" into "not sent, and here is why".
  const [showUnavailable, setShowUnavailable] = useState(false);

  const handleSubmit = () => {
    setValidationError(null);
    setShowUnavailable(false);

    // Validate message via zod — issues[0] gives the empty-vs-too-short message. The validation
    // is real and stays: it is the part of this form story 5-4 keeps.
    const result = feedbackMessageSchema.safeParse(message);
    if (!result.success) {
      setValidationError(result.error.issues[0].message);
      return;
    }

    // No transport. The message is deliberately NOT cleared — clearing it would destroy something
    // the user typed in exchange for nothing.
    haptics.warning();
    setShowUnavailable(true);
  };

  return (
    <KeyboardAwareScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      // iPhone smoke pass 5: lets iOS 26 auto-inset content below the
      // floating Liquid Glass nav so the "Category" label + chips start
      // BELOW the floating capsules instead of being hidden behind them.
      contentInsetAdjustmentBehavior="automatic"
      // Story 17.6 follow-up: `mode="layout"` (default is "insets", which
      // extends the scroll area via iOS `contentInset`). On this short form,
      // insets-mode's contentInset writes collide with the header's
      // `contentInsetAdjustmentBehavior="automatic"` top inset — after the
      // keyboard hides, the restore strands the content scrolled-up under the
      // header (chips hidden) with no way to settle back. Layout mode appends
      // a spacer view instead and never touches `contentInset`, so the auto
      // top-inset is the sole owner and the resting position is preserved.
      mode="layout"
    >
      {/* Story 17.3 (bucket-b polish): drop the redundant custom
            headerLeft + headerStyle/headerTintColor — native Stack header
            (profile/_layout sets headerShown:true; the navigation theme
            in app/_layout.tsx provides the colors) supplies the back
            button automatically. */}
      <Stack.Screen options={{ title: t('profile:feedback.title') }} />

      {/* Category Selection */}
      <Text style={styles.label}>{t('profile:feedback.categoryLabel')}</Text>
      <View style={styles.categoryRow} testID="category-chips">
        {FEEDBACK_CATEGORIES.map((cat) => {
          const isSelected = category === cat;
          return (
            <Pressable
              key={cat}
              style={[
                styles.categoryChip,
                isSelected ? styles.categoryChipActive : styles.categoryChipInactive,
              ]}
              onPress={() => {
                // Clear the stale notice: it refers to a submission the user has since
                // changed the category of, so leaving it up reports on an attempt that
                // no longer describes what they are about to send.
                setCategory(cat);
                setShowUnavailable(false);
              }}
              testID={`category-chip-${cat}`}
              accessibilityRole="radio"
              accessibilityLabel={t(`profile:feedback.category.${cat}`)}
              accessibilityState={{ checked: isSelected }}
            >
              <Icon
                name={CATEGORY_ICONS[cat]}
                size={18}
                color={isSelected ? colors.text.onAccent : colors.text.primary}
              />
              <Text
                style={[
                  styles.categoryChipText,
                  isSelected ? styles.categoryChipTextActive : styles.categoryChipTextInactive,
                ]}
              >
                {t(`profile:feedback.category.${cat}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Message Input */}
      <Text style={styles.label}>{t('profile:feedback.messageLabel')}</Text>
      <TextInput
        style={[
          styles.messageInput,
          validationError ? styles.messageInputError : styles.messageInputDefault,
        ]}
        placeholder={t('profile:feedback.messagePlaceholder')}
        placeholderTextColor={colors.text.tertiary}
        multiline
        numberOfLines={6}
        textAlignVertical="top"
        value={message}
        onChangeText={(text) => {
          setMessage(text);
          if (validationError) setValidationError(null);
          if (showUnavailable) setShowUnavailable(false);
        }}
        testID="feedback-message-input"
        accessibilityLabel={t('profile:a11y.feedbackMessage')}
      />
      {validationError && (
        <Text style={styles.validationError} testID="validation-error">
          {validationError}
        </Text>
      )}

      {/* Inert-submission notice — inline on the form, in place of the old success/error pair. */}
      {showUnavailable && (
        <View style={styles.noticeContainer} testID="submit-unavailable">
          <Icon name="information-circle-outline" size={20} color={colors.text.secondary} />
          <Text style={styles.noticeText}>{t('profile:feedback.unavailable')}</Text>
        </View>
      )}

      {/* Submit Button */}
      <Pressable
        style={({ pressed }) => [styles.submitButton, pressed && styles.buttonPressed]}
        onPress={handleSubmit}
        testID="submit-feedback-button"
        accessibilityRole="button"
        accessibilityLabel={t('profile:a11y.submitFeedback')}
      >
        <Text style={styles.submitButtonText}>{t('profile:feedback.submit')}</Text>
      </Pressable>
    </KeyboardAwareScrollView>
  );
}

const MESSAGE_INPUT_MIN_HEIGHT = 140;
const SUBMIT_BUTTON_MIN_HEIGHT = 48;

const useStyles = () =>
  useThemedStyles((t) => ({
    container: {
      flex: 1,
      backgroundColor: t.colors.background.primary,
    },
    scrollContent: {
      // Story 23.25: wide-screen cap (form column → content:640). story 6-0 dropped "+ web
      // mini-player bottom clearance" from this line: that clearance went with the mini-player in
      // story 5-1. The generous `xxxl` bottom is for the keyboard, and stays.
      ...screenContentStyle('content'),
      padding: SPACING.xl,
      paddingBottom: SPACING.xxxl,
    },
    // Story 23.2: unified to the SettingsGroup label treatment (caption tokens) so the
    // form's section labels match the other settings screens. The form fields stay form
    // elements (primitives don't fit form controls — see story Dev Notes "feedback scope").
    label: {
      fontSize: FONT_SIZE.caption,
      fontWeight: FONT_WEIGHT.semibold,
      textTransform: 'uppercase',
      letterSpacing: 1.0,
      marginBottom: SPACING.sm,
      marginTop: SPACING.lg,
      color: t.colors.text.tertiary,
    },
    categoryRow: {
      flexDirection: 'row',
      gap: SPACING.sm,
    },
    categoryChip: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.xs,
      paddingVertical: SPACING.md,
      borderRadius: RADII.md,
      borderWidth: 1,
    },
    categoryChipActive: {
      backgroundColor: t.colors.accent.primary,
      borderColor: t.colors.accent.primary,
    },
    categoryChipInactive: {
      backgroundColor: t.colors.background.secondary,
      borderColor: t.colors.border,
    },
    categoryChipText: {
      fontSize: FONT_SIZE.bodySmall,
      fontWeight: FONT_WEIGHT.medium,
    },
    categoryChipTextActive: {
      color: t.colors.text.onAccent,
    },
    categoryChipTextInactive: {
      color: t.colors.text.primary,
    },
    messageInput: {
      minHeight: MESSAGE_INPUT_MIN_HEIGHT,
      borderWidth: 1,
      borderRadius: RADII.md,
      padding: SPACING.md,
      fontSize: FONT_SIZE.body,
      fontWeight: FONT_WEIGHT.regular,
      lineHeight: FONT_SIZE.body * LINE_HEIGHT.body,
      backgroundColor: t.colors.background.secondary,
      color: t.colors.text.primary,
    },
    messageInputDefault: {
      borderColor: t.colors.border,
    },
    messageInputError: {
      borderColor: t.colors.semantic.error,
    },
    validationError: {
      fontSize: FONT_SIZE.bodySmall,
      fontWeight: FONT_WEIGHT.regular,
      marginTop: SPACING.xs,
      color: t.colors.semantic.error,
    },
    noticeContainer: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: SPACING.sm,
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.md,
      borderRadius: RADII.sm,
      marginTop: SPACING.lg,
      backgroundColor: t.colors.background.secondary,
    },
    noticeText: {
      flex: 1,
      fontSize: FONT_SIZE.bodySmall,
      fontWeight: FONT_WEIGHT.regular,
      lineHeight: FONT_SIZE.bodySmall * LINE_HEIGHT.body,
      color: t.colors.text.secondary,
    },
    submitButton: {
      paddingVertical: SPACING.md,
      borderRadius: RADII.md,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: SPACING.xl,
      minHeight: SUBMIT_BUTTON_MIN_HEIGHT,
      backgroundColor: t.colors.accent.primary,
    },
    submitButtonText: {
      fontSize: FONT_SIZE.body,
      fontWeight: FONT_WEIGHT.semibold,
      color: t.colors.text.onAccent,
    },
    buttonPressed: {
      opacity: 0.7,
    },
  }));
