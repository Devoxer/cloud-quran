/**
 * Device-local notification state (MMKV, synchronous — Story 18.1 replaced AsyncStorage).
 *
 * Storage-only: imports just constants + the MMKV factory (NOT the InstantDB client), so
 * consumers like `useNotificationPermission` can read the "asked before" flag without
 * transitively pulling in `lib/instantdb`. The `lib/notifications` service re-uses these.
 */

import { NOTIFICATION_STORAGE_KEYS } from '@/constants/notifications';
import { createAppMMKV } from '@/lib/mmkv';

const storage = createAppMMKV('notifications');

/** Whether the notification permission has ever been requested. */
export function getNotificationPermissionRequested(): boolean {
  return storage.getBoolean(NOTIFICATION_STORAGE_KEYS.permissionRequested) === true;
}

/** Mark that the notification permission has been requested. */
export function markNotificationPermissionRequested(): void {
  storage.set(NOTIFICATION_STORAGE_KEYS.permissionRequested, true);
}

/** True only if permission has never been requested before. */
export function shouldRequestNotificationPermission(): boolean {
  return !getNotificationPermissionRequested();
}
