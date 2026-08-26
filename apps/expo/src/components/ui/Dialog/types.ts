/**
 * Dialog — shared cross-platform confirm/alert contract (Story 17.4 §A, AC 3;
 * extended Story 17.13 for a configurable button set).
 *
 * The canonical native, platform-split confirm/alert primitive. Implementations:
 *   - `index.ios.tsx`     → `@expo/ui/swift-ui` `Alert` (true `UIAlertController`).
 *   - `index.android.tsx` → `@expo/ui/jetpack-compose` `AlertDialog` (true M3 dialog).
 *   - `index.web.tsx`     → custom focus-trapped centered modal (web has no native
 *                            alert primitive that round-trips button callbacks —
 *                            `window.confirm` is sync-blocking + drops callbacks).
 *   - `index.tsx`         → TS-resolved entry; re-exports the web impl as the
 *                            default/fallback + this shared `DialogProps` type.
 *
 * No root `<DialogHost>` overlay is needed — native alerts present at the OS
 * window level (above the routed Liquid Glass header / NativeTabs chrome) and
 * the web modal is self-contained. Native chrome is intentionally NOT
 * customizable — anything needing a custom body (e.g. a confirmation TextInput)
 * uses `<BottomSheet>`, not `<Dialog>`.
 *
 * The swift-ui / jetpack-compose imports are confined to the `.ios`/`.android`
 * platform files — Metro never bundles them into the web build (the
 * platform-extension safety invariant; see architecture.md § "UI primitives — build vs adopt").
 *
 * ## Two modes (Story 17.13)
 * 1. **Legacy confirm/cancel** (unchanged): pass `onConfirm`/`onCancel` (+ optional
 *    `confirmText`/`cancelText`/`confirmDestructive`). Renders the fixed two-button
 *    pair. All pre-17.13 consumers (`ConfirmDialog`, `RemoveOfflineDialog`, …) use
 *    this and are untouched.
 * 2. **Configurable `actions`** (new): pass `actions: DialogAction[]` for a 1-button
 *    OK alert or an N-action set (e.g. Open-Settings / Cancel). This just exposes
 *    what the native primitives already do — swift-ui `Alert.Actions` accepts an
 *    arbitrary button set, web renders N buttons. **Android's M3 `AlertDialog` has
 *    only a confirm + optional dismiss slot, so it renders the primary (first
 *    non-cancel) action + the cancel-role action — at most two.** Every real
 *    rehomed message is 1-OK or 2-button, so this covers the surface; document any
 *    >2 case before relying on it.
 *
 * **Controlled-presentation invariant (AC-4b):** the buttons are the SOLE source of
 * semantic intent. `index.ios.tsx` mirrors `open`→local `presented` and lets the
 * SwiftUI binding sync presentation only — never wire `onIsPresentedChange` to an
 * action callback (SwiftUI auto-flips `isPresented=false` on ANY tap → double-fire).
 */

import i18n from '@/i18n';

/** Button role — drives platform styling (destructive red, cancel emphasis). */
export type DialogActionRole = 'default' | 'cancel' | 'destructive';

/** A single dialog button (configurable-`actions` mode). */
export interface DialogAction {
  /** Button label. */
  label: string;
  /** Called when the button is tapped. */
  onPress?: () => void;
  /** Platform styling role. @default 'default' */
  role?: DialogActionRole;
}

export interface DialogProps {
  /** Whether the dialog is presented. */
  open: boolean;
  /** Dialog title. */
  title: string;
  /** Dialog body message. */
  message: string;
  /**
   * Configurable button set (Story 17.13). When provided + non-empty, replaces
   * the legacy confirm/cancel pair. Use for 1-button OK alerts and N-action sets.
   */
  actions?: DialogAction[];
  /** (Legacy mode) Confirm button label. @default 'Confirm' */
  confirmText?: string;
  /** (Legacy mode) Cancel button label. @default 'Cancel' */
  cancelText?: string;
  /** (Legacy mode) Render the confirm action with the platform's destructive styling. */
  confirmDestructive?: boolean;
  /** (Legacy mode) Called when the user confirms. */
  onConfirm?: () => void;
  /**
   * Called when the user cancels / dismisses (backdrop tap, Escape, back button).
   * In `actions` mode this is the dismissal/close handler.
   */
  onCancel?: () => void;
  testID?: string;
}

/** A resolved button — fully-populated, ready to render. */
export interface ResolvedDialogAction {
  label: string;
  onPress: () => void;
  role: DialogActionRole;
  /** testID suffix: 'confirm'/'cancel' for the legacy pair, 'action-N' otherwise. */
  testIdSuffix: string;
}

const noop = () => {};

/**
 * Resolve the button list from either `actions` (new) or the legacy
 * confirm/cancel props. Single source of truth shared by all three platform files.
 */
export function resolveDialogActions(props: DialogProps): ResolvedDialogAction[] {
  if (props.actions && props.actions.length > 0) {
    return props.actions.map((a, i) => ({
      label: a.label,
      onPress: a.onPress ?? noop,
      role: a.role ?? 'default',
      testIdSuffix: a.role === 'cancel' ? 'cancel' : `action-${i}`,
    }));
  }
  // Legacy two-button confirm/cancel pair (back-compat — unchanged rendering).
  return [
    {
      label: props.cancelText ?? i18n.t('common:actions.cancel'),
      onPress: props.onCancel ?? noop,
      role: 'cancel',
      testIdSuffix: 'cancel',
    },
    {
      label: props.confirmText ?? i18n.t('common:actions.confirm'),
      onPress: props.onConfirm ?? noop,
      role: props.confirmDestructive ? 'destructive' : 'default',
      testIdSuffix: 'confirm',
    },
  ];
}

/**
 * The dismissal handler (backdrop / Escape / back / Android `onDismissRequest`):
 * `onCancel` if given, else the cancel-role action's `onPress`, else no-op.
 */
export function resolveDialogDismiss(props: DialogProps): () => void {
  if (props.onCancel) return props.onCancel;
  const cancelAction = props.actions?.find((a) => a.role === 'cancel');
  return cancelAction?.onPress ?? noop;
}
