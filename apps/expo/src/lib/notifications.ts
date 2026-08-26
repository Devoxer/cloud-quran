/**
 * Notification Service Module
 *
 * Story 13.1: Set Up Expo Notifications
 * Story 18.8: Local notifications — replaced the server-push streak/new-book crons
 *   with on-device scheduled reminders. All push-token plumbing (getExpoPushToken,
 *   savePushToken, clearPushToken, registerPushToken, isPushNotificationsAvailable,
 *   addPushTokenListener) is gone; the only delivery path is now a LOCAL scheduled
 *   notification (`scheduleStreakReminder`).
 *
 * Core notification functions for initializing handlers, creating channels,
 * scheduling the local streak reminder, and managing notification listeners.
 */

import type * as NotificationsType from 'expo-notifications';
import { Platform } from 'react-native';
import { NOTIFICATION_CHANNELS } from '@/constants/notifications';
import i18n from '@/i18n';
import {
  markNotificationPermissionRequested,
  shouldRequestNotificationPermission,
} from '@/lib/notificationStorage';
import type { NotificationData } from '@/types/notifications';

// Notification permission flag lives in lib/notificationStorage (MMKV, no InstantDB
// import). Re-export the permission helpers so existing importers of these from
// '@/lib/notifications' keep working.
export { markNotificationPermissionRequested, shouldRequestNotificationPermission };

// Lazy-load expo-notifications to avoid crashing when native module is missing
// (e.g. running simulator without a native build that includes the module)
let Notifications: typeof NotificationsType | null = null;
try {
  Notifications = require('expo-notifications');
} catch {
  if (__DEV__) {
    console.warn(
      '[Notifications] expo-notifications native module not available — notifications disabled'
    );
  }
}

/**
 * Stable identifier for the single streak reminder. Reusing it on every schedule
 * means re-scheduling REPLACES rather than stacks — the structural fix for the
 * old "3 notifications at once" duplication (Story 18.8 AC2).
 */
export const STREAK_REMINDER_IDENTIFIER = 'streak-reminder';

/** Reminder copy — generic, no-emoji, positive (non-guilt) messaging. A random
 *  variant is picked per schedule. The tap opens Discover (no per-book deep-link),
 *  so the copy stays book-agnostic. (Story 18.8.) */
// i18n keys (notifications namespace), resolved via i18n.t at schedule time (Story
// 20.2) — this is a non-hook module. The reminder fires later, so it's translated
// when scheduled (the current UI language), not at module load.
const REMINDER_MESSAGES = [
  {
    titleKey: 'notifications:reminders.streak.title',
    bodyKey: 'notifications:reminders.streak.body',
  },
  {
    titleKey: 'notifications:reminders.summary.title',
    bodyKey: 'notifications:reminders.summary.body',
  },
] as const;

/**
 * Initialize notifications - set up handler and create Android channels.
 * Call this early in app startup, before any notifications can be received.
 */
export function initializeNotifications(): void {
  if (Platform.OS === 'web' || !Notifications) return;

  // Set notification handler for foreground display
  setNotificationHandler();

  // Create Android notification channels (required for Android 8.0+). The platform
  // + native-module gating lives INSIDE createNotificationChannels (Story 20.7), so
  // this is a no-op everywhere else. Deliberately not awaited — boot must not block
  // on an OS write, and the function never rejects.
  void createNotificationChannels();
}

/**
 * Configure how notifications are displayed when app is in foreground.
 * Must be called before any notifications are received.
 */
function setNotificationHandler(): void {
  Notifications!.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

/**
 * Create — or RE-APPLY — every Android notification channel (Android 8.0+).
 * Channels define the user-controllable notification categories.
 *
 * Also the LANGUAGE refresh path (Story 20.7). Writing an existing channel id again
 * updates its `name`/`description` **in place**, which is the documented Android
 * affordance for localization: *"you can still change a channel's name and
 * description"*, and *"recreating an existing notification channel with its original
 * values performs no operation"*. Every other field in the config object
 * (`importance`, `vibrationPattern`, `lightColor`) is ignored once the channel
 * exists — which is why one code path serves both first creation and re-localization.
 * ⚠️ One precise exception, in the dangerous direction: `importance` is ignored only when
 * the new value is HIGHER than the current one. A LOWER value DOES apply (unless the user
 * has customized the channel), and re-raising it afterwards is then ignored — so lowering
 * `streaks.importance` is a silent, one-way downgrade of every existing install, not the
 * inert write this comment would otherwise imply. Sound and vibration are genuinely frozen;
 * changing those requires a NEW channel id, not this call.
 * There is deliberately no `deleteNotificationChannelAsync` anywhere: Android counts
 * deleted channels in the app's notification-settings screen as a spam signal.
 *
 * ⚠️ NEVER REJECTS — callers rely on it (Story 20.7 AC-1). A per-channel OS failure is
 * swallowed (and `__DEV__`-logged) and the loop continues, so neither a language switch
 * nor a permission request can fail because the OS refused a channel write. It is a
 * no-op on web, on iOS, and when the `expo-notifications` native module is unavailable —
 * that gating lives HERE so every caller inherits it instead of re-implementing it.
 */
export async function createNotificationChannels(): Promise<void> {
  if (Platform.OS !== 'android' || !Notifications) return;

  for (const channel of Object.values(NOTIFICATION_CHANNELS)) {
    try {
      await Notifications.setNotificationChannelAsync(channel.id, {
        // i18n keys, resolved HERE (Story 20.2) — the constants module evaluates before
        // i18n. Re-resolved on every call, which is what re-localizes the labels.
        name: i18n.t(channel.name),
        importance: channel.importance,
        description: i18n.t(channel.description),
        vibrationPattern: [...channel.vibrationPattern], // Convert readonly to mutable
        lightColor: channel.lightColor,
      });
    } catch (error) {
      if (__DEV__) {
        console.warn(`[Notifications] Failed to write channel "${channel.id}":`, error);
      }
    }
  }
}

/**
 * Schedule the daily streak reminder as a LOCAL notification (Story 18.8).
 *
 * Cancel-then-schedule using a single stable identifier so re-running this never
 * stacks reminders (AC2). Fires at the next occurrence of the user's chosen local
 * time (`hour`/`minute`, default 09:00) via a one-shot DATE trigger (cross-platform —
 * CALENDAR is iOS-only and throws on Android). Paired with the
 * reminder forward, so it only ever fires after ~a day of inactivity — faithfully
 * replicating the retired "inactive 24h+" cron, fully on-device.
 *
 * Guarded no-op unless BOTH (a) reminders are enabled (`enabled`, the combined
 * master-toggle + streakReminders preference computed by the caller — opt-out
 * default true) AND (b) OS notification permission is granted. Also a no-op on
 * web or when the native module is unavailable.
 *
 * @param options.enabled - Whether reminders are enabled (master toggle && pref). Default true.
 * @param options.hour - Local hour (0–23) to fire at. Default 9. Resolve via `getReminderTime`.
 * @param options.minute - Minute (0–59) to fire at. Default 0.
 */
export async function scheduleStreakReminder(options?: {
  enabled?: boolean;
  hour?: number;
  minute?: number;
}): Promise<void> {
  if (Platform.OS === 'web' || !Notifications) return;

  // Reconcile, not just de-dup: ALWAYS cancel any existing reminder first. This
  // makes the function tear down a stale reminder when reminders are disabled or
  // permission was revoked — not only when re-scheduling. Without it, a reminder
  // armed while enabled+granted would survive a later cross-device pref-disable
  // sync or an OS-level permission revocation (both reach here via the foreground
  // reschedule with enabled:false / status!=='granted', which return below). It is
  // also the cancel-then-schedule de-dup for the happy path (AC2).
  await cancelStreakReminder();

  // Preference gate (master toggle && streakReminders pref) — opt-out default.
  if (options?.enabled === false) return;

  // Permission gate — never schedule without OS permission.
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return;

  const message = REMINDER_MESSAGES[Math.floor(Math.random() * REMINDER_MESSAGES.length)];

  // Fire at the NEXT occurrence of hour:minute in local time, as a one-shot DATE
  // trigger. We deliberately do NOT use the CALENDAR trigger: it is iOS-only
  // (`@platform ios`) and throws "Trigger of type: calendar is not supported on
  // Android" on Android. A DATE trigger at the computed next occurrence is the
  // cross-platform equivalent and preserves the spec's one-shot `repeats:false`
  // semantics exactly (DATE delivers once; paired with the reschedule-on-foreground
  // hook it reproduces the retired "inactive 24h+" behavior identically on both
  // platforms). (Story 18.8 — Android device smoke caught the CALENDAR crash.)
  // Clamp hour/minute at the service boundary (defense-in-depth). Callers SHOULD resolve
  // via getReminderTime (which clamps), but an out-of-range/NaN value reaching setHours
  // here would yield an Invalid Date — and `Invalid <= Date.now()` is false, so the
  // tomorrow-fallback is skipped and scheduleNotificationAsync silently never fires.
  const safeHour = Number.isFinite(options?.hour)
    ? Math.min(23, Math.max(0, options?.hour ?? 9))
    : 9;
  const safeMinute = Number.isFinite(options?.minute)
    ? Math.min(59, Math.max(0, options?.minute ?? 0))
    : 0;

  const fireDate = new Date();
  fireDate.setHours(safeHour, safeMinute, 0, 0);
  if (fireDate.getTime() <= Date.now()) {
    // The time already passed today → schedule for the same time tomorrow.
    fireDate.setDate(fireDate.getDate() + 1);
  }

  await Notifications.scheduleNotificationAsync({
    identifier: STREAK_REMINDER_IDENTIFIER,
    content: {
      title: i18n.t(message.titleKey),
      body: i18n.t(message.bodyKey),
      sound: 'default',
      // The tap opens Discover (no per-book deep-link), so the payload only carries
      // the type for the _layout.tsx tap handler (Story 18.8).
      data: { type: 'streak_reminder' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: fireDate,
      channelId: NOTIFICATION_CHANNELS.streaks.id,
    },
  });
}

/**
 * Cancel the scheduled streak reminder (Story 18.8). Safe to call when none exists.
 */
export async function cancelStreakReminder(): Promise<void> {
  if (Platform.OS === 'web' || !Notifications) return;
  await Notifications.cancelScheduledNotificationAsync(STREAK_REMINDER_IDENTIFIER);
}

/**
 * Set up listener for incoming notifications (while app is running).
 *
 * @param callback - Function called when a notification is received
 * @returns Subscription object with remove() method
 */
export function addNotificationReceivedListener(
  callback: (notification: NotificationsType.Notification) => void
): NotificationsType.Subscription {
  if (Platform.OS === 'web' || !Notifications)
    return { remove: () => {} } as NotificationsType.Subscription;
  return Notifications.addNotificationReceivedListener(callback);
}

/**
 * Set up listener for notification tap/response.
 *
 * @param callback - Function called when user interacts with a notification
 * @returns Subscription object with remove() method
 */
export function addNotificationResponseListener(
  callback: (response: NotificationsType.NotificationResponse) => void
): NotificationsType.Subscription {
  if (Platform.OS === 'web' || !Notifications)
    return { remove: () => {} } as NotificationsType.Subscription;
  return Notifications.addNotificationResponseReceivedListener(callback);
}

/**
 * Get the notification response that launched the app (from killed state).
 *
 * @returns The notification response if app was opened from notification, null otherwise
 */
export async function getLastNotificationResponse(): Promise<NotificationsType.NotificationResponse | null> {
  if (Platform.OS === 'web' || !Notifications) return null;
  return await Notifications.getLastNotificationResponseAsync();
}

/**
 * Parse notification data from a notification response.
 *
 * @param response - The notification response from user interaction
 * @returns Parsed NotificationData or null if invalid
 */
export function parseNotificationData(
  response: NotificationsType.NotificationResponse
): NotificationData | null {
  const data = response.notification.request.content.data;

  if (!data || typeof data.type !== 'string') {
    return null;
  }

  return {
    type: data.type as NotificationData['type'],
    metadata:
      typeof data.metadata === 'object' ? (data.metadata as Record<string, unknown>) : undefined,
  };
}

/**
 * Request notification permission on first narration completion, scheduling the
 * local streak reminder if granted (Story 18.8 — replaced the push-token save).
 * Only requests if permission hasn't been requested before.
 *
 * @param _profileId - Retained for call-site compatibility; local scheduling reads
 *   OS permission + local preference, not a server identity, so it's unused here.
 * @param options.enabled - The caller's combined master+streak reminder gate
 *   (`streakRemindersEnabled(profile)`). When `false`, permission is still requested
 *   (the first-completion ask UX) but NO reminder is scheduled — we must not schedule
 *   against an explicit opt-out just because OS permission was granted. Default true.
 * @param options.hour - The user's chosen reminder hour (via `getReminderTime`). Default 9.
 * @param options.minute - The user's chosen reminder minute. Default 0.
 * @returns Whether permission was granted
 */
export async function requestNotificationPermissionOnFirstCompletion(
  _profileId: string | null,
  options?: { enabled?: boolean; hour?: number; minute?: number }
): Promise<boolean> {
  if (Platform.OS === 'web' || !Notifications) return false;

  // Only ask once.
  if (!shouldRequestNotificationPermission()) {
    return false;
  }

  try {
    const { status } = await Notifications.requestPermissionsAsync();

    // Mark as requested regardless of outcome.
    markNotificationPermissionRequested();

    if (status === 'granted') {
      // Schedule the local streak reminder — but respect the user's reminder
      // preference; scheduleStreakReminder no-ops (and cancels) when enabled:false.
      await scheduleStreakReminder({
        enabled: options?.enabled,
        hour: options?.hour,
        minute: options?.minute,
      });
      return true;
    }

    return false;
  } catch (error) {
    if (__DEV__) {
      console.error('[Notifications] Permission request failed:', error);
    }
    // Mark as requested even on error to avoid repeated failures.
    markNotificationPermissionRequested();
    return false;
  }
}
