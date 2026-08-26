/**
 * Notification Preferences Constants
 *
 * Story 13.4: Implement Notification Preferences
 * Epic 13: Push Notifications
 *
 * Defines notification types and their configuration for the notification settings UI.
 */

import type { ProfilePreferences } from '@cloudquran/shared';

/**
 * Configuration for a single notification type
 */
export interface NotificationTypeConfig {
  /**
   * Key matching the ProfilePreferences field name
   */
  key: keyof Pick<ProfilePreferences, 'streakReminders'>;

  /**
   * i18n key (in the `notifications` namespace) for the display label, rendered
   * via `t(type.label)` in `notification-settings.tsx` (Story 20.2). A key, not
   * display text — this module evaluates before i18n, so it can't call `t()`.
   */
  label: `types.${'streakReminders'}.label`;

  /**
   * i18n key (in the `notifications` namespace) for the description, rendered via
   * `t(type.description)` in `notification-settings.tsx` (Story 20.2). A key, not
   * display text — this module evaluates before i18n, so it can't call `t()`.
   */
  description: `types.${'streakReminders'}.description`;

  /**
   * Default value when user hasn't set preference
   */
  defaultValue: boolean;

  /**
   * Whether the notification is actually implemented and being sent
   * False = "Coming Soon" badge shown
   */
  implemented: boolean;
}

/**
 * All available notification types
 * Ordered by priority (most important first)
 */
export const NOTIFICATION_TYPES: NotificationTypeConfig[] = [
  {
    key: 'streakReminders',
    label: 'types.streakReminders.label',
    description: 'types.streakReminders.description',
    defaultValue: true,
    implemented: true, // Story 13.2 → local scheduling in Story 18.8
  },
];
