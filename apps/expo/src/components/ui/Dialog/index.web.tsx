/**
 * Dialog (Web) — custom centered modal overlay. Web has no native alert
 * primitive that round-trips button callbacks (`window.confirm` is sync-blocking
 * AND drops the callback chain on iOS Safari). Implemented as a fixed-position
 * overlay (NOT a React Native `<Modal>`, so the zero-`<Modal>` invariant in
 * AC 5 holds app-wide) + a centered dialog card.
 *
 * Dismissal parity with native: backdrop tap → dismiss, Escape key → dismiss.
 * Carries `accessibilityRole="alert"` + ≥44px touch targets + the warm scrim
 * (`colors.overlay.dark`) and destructive color from the theme (carried project
 * rules — STACK-CHEAT-SHEET.md § Style boundary: no literal colors in components).
 * (Full keyboard focus-trap / focus-restoration is a secondary-web-platform
 * polish item — the app is mobile-first; tracked for a future web-a11y pass.)
 *
 * Story 17.13: configurable button set — renders N buttons (`resolveDialogActions`
 * maps the new `actions` prop or the legacy confirm/cancel pair). ≤2 buttons lay
 * out in a row; >2 stack vertically.
 */

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { RADII } from '@/constants/radii';
import { SPACING } from '@/constants/spacing';
import { FONT_SIZE, FONT_WEIGHT, LINE_HEIGHT } from '@/constants/typography';
import { useThemedStyles } from '@/lib/useThemedStyles';
import {
  type DialogProps,
  type ResolvedDialogAction,
  resolveDialogActions,
  resolveDialogDismiss,
} from './types';

// `position: 'fixed'` covers the viewport on web (react-native-web supports it;
// RN's ViewStyle type does not include it).
const fixedOverlay = { position: 'fixed' } as unknown as ViewStyle;

export function Dialog(props: DialogProps) {
  const { t } = useTranslation();
  const { open, title, message, testID = 'dialog' } = props;
  const styles = useStyles();
  const actions = resolveDialogActions(props);
  const onDismiss = resolveDialogDismiss(props);

  // Escape-to-dismiss — web parity with the native back/escape dismissal.
  // Listener is attached only while presented. Guarded for non-DOM contexts
  // (static web export / test env) where `window.addEventListener` is absent.
  useEffect(() => {
    if (!open || typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onDismiss]);

  if (!open) return null;

  const stacked = actions.length > 2;

  const renderButton = (action: ResolvedDialogAction) => {
    const isCancel = action.role === 'cancel';

    return (
      <Pressable
        key={action.testIdSuffix}
        style={({ pressed }) => [
          styles.button,
          stacked && styles.buttonStacked,
          isCancel
            ? styles.cancelButton
            : action.role === 'destructive'
              ? styles.fillDestructive
              : styles.fillPrimary,
          pressed && styles.buttonPressed,
        ]}
        onPress={action.onPress}
        testID={`${testID}-${action.testIdSuffix}`}
        accessibilityRole="button"
        accessibilityLabel={action.label}
      >
        <Text style={isCancel ? styles.cancelButtonText : styles.fillButtonText}>
          {action.label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View
      style={[styles.overlay, fixedOverlay]}
      testID={`${testID}-overlay`}
      accessibilityRole="alert"
      accessibilityViewIsModal
    >
      {/* Backdrop tap → dismiss */}
      <Pressable
        style={[StyleSheet.absoluteFill, fixedOverlay]}
        onPress={onDismiss}
        accessibilityLabel={t('a11y:dismissDialog')}
      />
      <View style={styles.dialog} testID={testID}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>

        <View style={[styles.buttons, stacked && styles.buttonsStacked]}>
          {actions.map(renderButton)}
        </View>
      </View>
    </View>
  );
}

const useStyles = () =>
  useThemedStyles((t) => ({
    overlay: {
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 1000,
      backgroundColor: t.colors.overlay.dark, // warm scrim
      justifyContent: 'center',
      alignItems: 'center',
      padding: SPACING.xl,
    },
    dialog: {
      width: '100%',
      maxWidth: 320,
      borderRadius: RADII.lg,
      padding: SPACING.xl,
      backgroundColor: t.colors.background.primary,
    },
    title: {
      fontSize: FONT_SIZE.h3,
      fontWeight: FONT_WEIGHT.semibold,
      lineHeight: FONT_SIZE.h3 * LINE_HEIGHT.heading2,
      marginBottom: SPACING.sm,
      textAlign: 'center',
      color: t.colors.text.primary,
    },
    message: {
      fontSize: FONT_SIZE.body,
      fontWeight: FONT_WEIGHT.regular,
      lineHeight: FONT_SIZE.body * LINE_HEIGHT.body,
      marginBottom: SPACING.xl,
      textAlign: 'center',
      color: t.colors.text.secondary,
    },
    buttons: {
      flexDirection: 'row',
      gap: SPACING.md,
    },
    buttonsStacked: {
      flexDirection: 'column',
    },
    button: {
      flex: 1,
      paddingVertical: SPACING.md,
      borderRadius: RADII.md,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 44,
    },
    buttonStacked: {
      flex: 0,
      width: '100%',
    },
    cancelButton: {
      borderWidth: 1,
      borderColor: t.colors.border,
    },
    fillPrimary: {
      backgroundColor: t.colors.accent.primary,
    },
    fillDestructive: {
      backgroundColor: t.colors.semantic.error,
    },
    cancelButtonText: {
      fontSize: FONT_SIZE.body,
      fontWeight: FONT_WEIGHT.medium,
      color: t.colors.text.secondary,
    },
    fillButtonText: {
      fontSize: FONT_SIZE.body,
      fontWeight: FONT_WEIGHT.semibold,
      color: t.colors.text.onAccent,
    },
    buttonPressed: {
      opacity: 0.7,
    },
  }));
