/**
 * Dialog (Android) — wraps `@expo/ui/jetpack-compose` `AlertDialog` → a true
 * Material 3 dialog. Slot-based: `.Title` / `.Text` (body) / `.ConfirmButton` /
 * `.DismissButton`. Presents while mounted (Compose model), so we conditionally
 * render on `open`; `onDismissRequest` (backdrop tap / back button) → dismiss.
 *
 * Android has no destructive button *role* — destructive is conveyed via the
 * M3 error color on the confirm button's text.
 *
 * Story 17.4.2 Thread H (legibility bugs found in the 17.4 Android smoke):
 * - H1: actions use `TextButton` (M3 borderless text buttons), NOT the filled
 *   `Button`. A filled container made the destructive red label read red-on-blue;
 *   text buttons let the color read on the dialog surface.
 * - H2: the dialog + its text are explicitly theme-synced to the app's
 *   `useColorScheme()`-driven palette (`AlertDialog.colors` + explicit `Text`
 *   `color`). Compose's own `MaterialTheme` is not wired to the app scheme.
 *
 * Story 17.13: configurable button set. M3 `AlertDialog` has only a confirm +
 * optional dismiss slot, so we render the PRIMARY (first non-cancel) action in
 * the confirm slot and the cancel-role action in the dismiss slot — at most two.
 * Every real rehomed message is 1-OK or 2-button, so this covers the surface.
 */

import { AlertDialog, Host, Text, TextButton } from '@expo/ui/jetpack-compose';
import { useTheme } from '@/lib/theme';
import { type DialogProps, resolveDialogActions, resolveDialogDismiss } from './types';

export function Dialog(props: DialogProps) {
  const { open, title, message } = props;
  const { colors } = useTheme();

  if (!open) return null;

  const actions = resolveDialogActions(props);
  const onDismiss = resolveDialogDismiss(props);
  const cancelAction = actions.find((a) => a.role === 'cancel');
  const primaryAction = actions.find((a) => a.role !== 'cancel') ?? actions[0];
  const primaryColor =
    primaryAction.role === 'destructive' ? colors.semantic.error : colors.accent.primary;

  return (
    <Host style={{ position: 'absolute' }}>
      {/* Wrap text in jetpack Text — raw string children inside the Compose
          host mount as unregistered Fabric text nodes. Colors are set explicitly
          (H2) so legibility does not depend on Compose's own MaterialTheme. */}
      <AlertDialog
        onDismissRequest={onDismiss}
        colors={{
          containerColor: colors.background.primary,
          titleContentColor: colors.text.primary,
          textContentColor: colors.text.secondary,
        }}
      >
        <AlertDialog.Title>
          <Text color={colors.text.primary}>{title}</Text>
        </AlertDialog.Title>
        <AlertDialog.Text>
          <Text color={colors.text.secondary}>{message}</Text>
        </AlertDialog.Text>
        <AlertDialog.ConfirmButton>
          <TextButton onClick={primaryAction.onPress} colors={{ contentColor: primaryColor }}>
            <Text color={primaryColor}>{primaryAction.label}</Text>
          </TextButton>
        </AlertDialog.ConfirmButton>
        {cancelAction && (
          <AlertDialog.DismissButton>
            <TextButton
              onClick={cancelAction.onPress}
              colors={{ contentColor: colors.text.secondary }}
            >
              <Text color={colors.text.secondary}>{cancelAction.label}</Text>
            </TextButton>
          </AlertDialog.DismissButton>
        )}
      </AlertDialog>
    </Host>
  );
}
