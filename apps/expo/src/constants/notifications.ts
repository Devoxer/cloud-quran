/**
 * Notification Constants
 *
 * Story 13.1: Set Up Expo Notifications
 * Epic 13: Push Notifications
 *
 * Defines channel IDs, permission states, and configuration for push notifications.
 */

import { AndroidImportance } from 'expo-notifications';

/** Notification channel configurations for Android 8.0+ */
export const NOTIFICATION_CHANNELS = {
  // `name` / `description` are i18n keys (notifications namespace), NOT display text —
  // this module evaluates before i18n, so the channel-creation sites resolve them via
  // i18n.t(channel.name) (Story 20.2). These are the OS-settings channel labels shown to
  // the user, and they DO follow a language change (Story 20.7): `createNotificationChannels()`
  // re-writes the same channel id with freshly-resolved strings, which Android applies in
  // place, and `useLocalizedNotificationChannels` fires that on every i18next language change
  // (boot already covered it — `initializeNotifications()` runs after `initI18n()`).
  // ⚠️ name/description are the only FREELY mutable fields. `vibrationPattern` and
  // `lightColor` are frozen once a channel exists, so changing either means a NEW channel id
  // — which would discard the user's per-channel settings and is deliberately out of scope.
  // `importance` is the subtle one: a HIGHER value is ignored, but a LOWER one APPLIES (and
  // cannot be raised back), so lowering it here silently one-way-downgrades existing installs.
  //
  // Story 20.7 also DELETED the unused `default` channel (zero consumers — a leftover from the
  // push-token plumbing 18.8 removed). We simply stopped creating it rather than calling
  // `deleteNotificationChannelAsync`, because Android counts deleted channels in the app's
  // notification-settings screen. ⚠️ ACCEPTED CONSEQUENCE: a device that already registered
  // `default` under an earlier build keeps it forever, frozen in whatever language it was
  // created in, and no code path can ever relabel it — a stale row on the very settings screen
  // 20.7 exists to fix. Accepted because the app is UNRELEASED (no install base; clean-cutover
  // rule), so the only devices affected are dev handsets — clear app data or reinstall. If this
  // ever ships with an install base, the fix is a one-shot guarded `deleteNotificationChannelAsync`,
  // NOT a revival of the channel. The `expo-notifications` plugin's `defaultChannel: "default"`
  // in app.json was removed in the same story — it was a dangling manifest reference to this id.
  streaks: {
    id: 'streaks',
    name: 'notifications:channels.streaks.name',
    importance: AndroidImportance.HIGH,
    description: 'notifications:channels.streaks.description',
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#FF231F7C',
  },
} as const;

/** MMKV keys for notification state */
export const NOTIFICATION_STORAGE_KEYS = {
  /** Flag indicating if permission has been requested */
  permissionRequested: 'notification_permission_requested',
} as const;
