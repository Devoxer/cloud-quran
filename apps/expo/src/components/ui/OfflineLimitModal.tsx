/**
 * OfflineLimitModal — thin shell over the native cross-platform `<Dialog>`.
 *
 * Story 17.4 §A: migrated off RN `<Modal>` to `<Dialog>` (true UIAlertController /
 * M3 AlertDialog / web modal). The existing call-site API (`visible`, `onDismiss`,
 * `onManageOffline`, `currentCount`) is preserved.
 *
 * Native-chrome regression (accepted): the decorative warning icon + the count
 * badge styling are dropped (native alerts have no custom body slot) — the
 * count folds into the alert message. Primary action ("Manage Offline Books")
 * maps to the confirm button; "Dismiss" maps to cancel.
 *
 * Story 11.3: Implement Offline Book Limit Enforcement.
 */

import { useTranslation } from 'react-i18next';

import { OFFLINE_BOOKS_LIMIT } from '@/constants/offline';
import { Dialog } from './Dialog';

export interface OfflineLimitModalProps {
  /** Whether the modal is visible */
  visible: boolean;
  /** Called when user dismisses the modal */
  onDismiss: () => void;
  /** Called when user wants to manage offline books */
  onManageOffline: () => void;
  /** Current count of offline books */
  currentCount: number;
}

export function OfflineLimitModal({
  visible,
  onDismiss,
  onManageOffline,
  currentCount,
}: OfflineLimitModalProps) {
  const { t } = useTranslation('common');
  return (
    <Dialog
      open={visible}
      title={t('dialogs.offlineLimit.title')}
      message={t('dialogs.offlineLimit.message', {
        saved: currentCount,
        limit: OFFLINE_BOOKS_LIMIT,
      })}
      confirmText={t('actions.manageOfflineBooks')}
      cancelText={t('actions.dismiss')}
      onConfirm={onManageOffline}
      onCancel={onDismiss}
      testID="offline-limit-modal"
    />
  );
}
