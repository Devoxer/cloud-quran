/**
 * ConfirmDialog — thin shell over the native cross-platform `<Dialog>` primitive.
 *
 * Story 17.4 §A: migrated off RN `<Modal>` to `<Dialog>` (true `UIAlertController`
 * on iOS, Material 3 `AlertDialog` on Android, focus-trapped modal on web). The
 * existing `visible` / `confirmStyle` call-site API is preserved unchanged — this
 * shell maps it onto the `<Dialog>` contract so no consumer edits are needed.
 *
 * @example
 * <ConfirmDialog
 *   visible={showConfirm}
 *   title="Delete Item"
 *   message="Are you sure?"
 *   confirmText="Delete"
 *   confirmStyle="destructive"
 *   onConfirm={handleDelete}
 *   onCancel={() => setShowConfirm(false)}
 * />
 */

import { useTranslation } from 'react-i18next';

import { Dialog } from './Dialog';

export interface ConfirmDialogProps {
  /** Whether the dialog is visible */
  visible: boolean;
  /** Dialog title */
  title: string;
  /** Dialog message */
  message: string;
  /** Text for cancel button */
  cancelText?: string;
  /** Text for confirm button */
  confirmText?: string;
  /** Style of confirm button: 'default' or 'destructive' */
  confirmStyle?: 'default' | 'destructive';
  /** Called when user confirms */
  onConfirm: () => void;
  /** Called when user cancels */
  onCancel: () => void;
}

export function ConfirmDialog({
  visible,
  title,
  message,
  cancelText,
  confirmText,
  confirmStyle = 'default',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useTranslation('common');
  return (
    <Dialog
      open={visible}
      title={title}
      message={message}
      cancelText={cancelText ?? t('actions.cancel')}
      confirmText={confirmText ?? t('actions.confirm')}
      confirmDestructive={confirmStyle === 'destructive'}
      onConfirm={onConfirm}
      onCancel={onCancel}
      testID="confirm-dialog"
    />
  );
}
