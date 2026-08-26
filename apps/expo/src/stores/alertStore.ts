/**
 * alertStore — imperative `useAlert()` over a Zustand store + a single
 * `<AlertHost />` (Story 19.1; migrated from the `AlertContext` provider).
 *
 * Story 17.13 introduced the imperative alert as a React Context provider that
 * both held the `options` state AND rendered the `<Dialog>`. 19.1 splits that:
 * the cross-component UI state (the pending alert) lives in this Zustand store
 * (cheat-sheet § State boundary — UI/runtime state → Zustand), and a single
 * `<AlertHost />` sibling (not a wrapper) subscribes to it and renders the
 * platform-split `<Dialog>`. There is no `<AlertProvider>` and no
 * "must be used within …" throw — any component can call `useAlert()`.
 *
 * Used for **must-acknowledge** messages (purchase/restore outcomes, "no
 * purchases found", "enable notifications in settings", "already subscribed").
 * Do NOT reintroduce `Alert.alert` (unimplemented on web — STACK-CHEAT-SHEET
 * § Don't / RN).
 *
 * @example
 * const { showAlert } = useAlert();
 * // Acknowledge-only (single OK):
 * showAlert({ title: 'No purchases found', message: 'There was nothing to restore.' });
 * // Multi-action:
 * showAlert({
 *   title: 'Enable notifications',
 *   message: 'Turn them on in Settings to get daily reminders.',
 *   actions: [
 *     { label: 'Open Settings', onPress: openSettings },
 *     { label: 'Not now', role: 'cancel' },
 *   ],
 * });
 */

import { create } from 'zustand';
import type { DialogActionRole } from '@/components/ui/Dialog';

export interface AlertButton {
  /** Button label. */
  label: string;
  /** Called when tapped (the host then closes the alert). */
  onPress?: () => void;
  /** Platform styling role. @default 'default' */
  role?: DialogActionRole;
}

export interface AlertOptions {
  /** Alert title. */
  title: string;
  /** Alert body message. */
  message: string;
  /** Buttons. Omit → a single 'OK' acknowledge button. */
  actions?: AlertButton[];
}

interface AlertStoreState {
  /** The pending alert, or null when nothing is presented. */
  options: AlertOptions | null;
  /** Present a native alert. */
  showAlert: (options: AlertOptions) => void;
  /** Dismiss the current alert. */
  close: () => void;
}

export const useAlertStore = create<AlertStoreState>((set) => ({
  options: null,
  showAlert: (options) => set({ options }),
  close: () => set({ options: null }),
}));

export interface UseAlertReturn {
  /** Present a native alert. */
  showAlert: (options: AlertOptions) => void;
}

/**
 * useAlert — imperative alert hook (same public API as the pre-19.1
 * `AlertContext` hook). Selects only the stable `showAlert` action, so a
 * consumer never re-renders when an alert opens/closes.
 */
export function useAlert(): UseAlertReturn {
  const showAlert = useAlertStore((s) => s.showAlert);
  return { showAlert };
}
