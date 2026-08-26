/**
 * Notification Type Definitions
 *
 * Story 13.1: Set Up Expo Notifications
 * Story 18.8: Local notifications — end state is ONE type (streak reminders).
 *   The new-book / push-token types were removed with the server-push fan-out.
 *
 * Types for local notification handling and data payloads.
 */

/**
 * Custom data payload for app notifications
 * Included in notification content.data field
 */
export interface NotificationData {
  /** Notification type for analytics and routing */
  type: NotificationType;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Streak reminder notification data (Story 13.2 → generic, opens Discover in 18.8)
 */
export interface StreakReminderNotificationData extends NotificationData {
  type: 'streak_reminder';
}

/**
 * Types of notifications the app can send.
 * Story 18.8: collapsed to the single local reminder type.
 */
export type NotificationType = 'streak_reminder';

/**
 * Permission status for notifications
 */
export type NotificationPermissionStatus = 'granted' | 'denied' | 'undetermined';

/**
 * Result of requesting notification permissions
 */
export interface PermissionResult {
  /** Whether permission was granted */
  granted: boolean;
  /** The current permission status */
  status: NotificationPermissionStatus;
  /** Whether we can ask again (iOS) */
  canAskAgain: boolean;
}
