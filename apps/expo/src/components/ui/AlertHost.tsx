/**
 * AlertHost — the single mounted host for the imperative `useAlert()` alert
 * (Story 19.1; migrated from `AlertContext`'s in-provider render).
 *
 * Subscribes to the `alertStore` and renders the platform-split `<Dialog>` when
 * an alert is pending. Mounted ONCE in `app/_layout.tsx` as a sibling (not a
 * wrapper) of the navigator. Replaces the `<Dialog>` that used to live inside
 * `<AlertProvider>`.
 *
 * Preserves the 17.13 behaviors: the `DEFAULT_OK` single-OK fallback, the
 * `try { onPress() } finally { close() }` guarantee (close runs even if an
 * action handler throws — never wedge the host), `onCancel`/`open` semantics,
 * and `testID="alert"`.
 */

import { useTranslation } from 'react-i18next';
import { Dialog } from '@/components/ui/Dialog';
import { type AlertButton, useAlertStore } from '@/stores/alertStore';

export function AlertHost() {
  const { t } = useTranslation();
  const options = useAlertStore((s) => s.options);
  const close = useAlertStore((s) => s.close);

  if (!options) {
    return null;
  }

  // Default single-OK fallback. Built inside the component (NOT a module const) so the label
  // resolves via t() at render — never at module load — and re-localizes on a language change.
  const buttons: AlertButton[] = options.actions ?? [
    { label: t('common:actions.ok'), role: 'default' },
  ];

  return (
    <Dialog
      open
      title={options.title}
      message={options.message}
      onCancel={close}
      actions={buttons.map((b) => ({
        label: b.label,
        role: b.role,
        onPress: () => {
          // close() MUST run even if the action handler throws — otherwise
          // `options` is never cleared, the host stays mounted, and every later
          // showAlert silently fails to present (a wedged host).
          try {
            b.onPress?.();
          } finally {
            close();
          }
        },
      }))}
      testID="alert"
    />
  );
}
