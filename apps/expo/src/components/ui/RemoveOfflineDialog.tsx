/**
 * RemoveOfflineDialog — thin shell over the native cross-platform `<Dialog>`.
 *
 * Story 17.4 §A: migrated off RN `<Modal>` to `<Dialog>` (true UIAlertController /
 * M3 AlertDialog / web modal). The existing call-site API (`visible`, `bookTitle`,
 * `sizeFormatted`, `isRemoving`, `onConfirm`, `onCancel`) is preserved.
 *
 * Native-chrome regression (accepted): the inline "Removing…" spinner on the
 * Remove button is dropped — a native alert dismisses on tap, so the async
 * removal proceeds after dismissal (the caller reflects progress in the list
 * row). `isRemoving` is retained for API compatibility but no longer drives an
 * inline spinner. The book title + freed-size + "download again" note fold into
 * the alert message (native alerts have no custom body slot).
 *
 * Story 11.4: Implement Offline Library Management.
 */

import { useTranslation } from 'react-i18next';

import { Dialog } from './Dialog';

/** Props for RemoveOfflineDialog component */
export interface RemoveOfflineDialogProps {
  /** Whether the dialog is visible */
  visible: boolean;
  /** Title of the book being removed */
  bookTitle: string;
  /** Formatted storage size that will be freed (e.g., "12.4 MB") */
  sizeFormatted: string;
  /**
   * Whether a remove operation is in progress.
   * @remarks Retained for API compatibility — the native alert dismisses on tap,
   * so it no longer drives an inline spinner (Story 17.4 native-chrome migration).
   */
  isRemoving: boolean;
  /** Called when user confirms removal */
  onConfirm: () => void;
  /** Called when user cancels removal */
  onCancel: () => void;
  /** Test ID for testing */
  testID?: string;
}

export function RemoveOfflineDialog({
  visible,
  bookTitle,
  sizeFormatted,
  onConfirm,
  onCancel,
  testID = 'remove-offline-dialog',
}: RemoveOfflineDialogProps) {
  const { t } = useTranslation('common');
  return (
    <Dialog
      open={visible}
      title={t('dialogs.removeOffline.title')}
      message={t('dialogs.removeOffline.message', { title: bookTitle, size: sizeFormatted })}
      confirmText={t('actions.remove')}
      cancelText={t('actions.cancel')}
      confirmDestructive
      onConfirm={onConfirm}
      onCancel={onCancel}
      testID={testID}
    />
  );
}
