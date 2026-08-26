/**
 * Profile Preferences Type Definitions
 *
 * Story 13.3: Implement New Book Notifications
 * Epic 13: Push Notifications
 *
 * Type definitions for the JSON preferences field in profiles entity.
 * The preferences field is stored as i.json().optional() in instant.schema.ts
 */

/**
 * User profile preferences stored in profiles.preferences JSON field
 *
 * This interface documents the expected structure of the preferences JSON.
 * All fields are optional to maintain backward compatibility.
 */
export interface ProfilePreferences {
  /**
   * Theme preference
   * @default 'auto' - Follows system theme
   */
  theme?: 'light' | 'dark' | 'auto';

  /**
   * Karaoke mode for word-level highlighting during audio playback
   * Story 5.6: Build SyncedTextViewer Component
   * @default true - Word-level highlighting enabled
   */
  karaokeMode?: boolean;

  /**
   * Streak reminder notifications (Story 13.2 → local scheduling in Story 18.8)
   * When enabled, the app schedules a daily local reminder if the user is inactive.
   * @default true - Reminders enabled (opt-out model)
   */
  streakReminders?: boolean;

  /**
   * Hour (0–23, local time) at which the daily streak reminder fires (Story 18.8 —
   * configurable reminder time). Read via `getReminderTime`, which clamps + defaults.
   * @default 9
   */
  reminderHour?: number;

  /**
   * Minute (0–59) at which the daily streak reminder fires (Story 18.8).
   * @default 0
   */
  reminderMinute?: number;

  /**
   * Feed section preference — which sections to play in the feed queue
   * Independent from collection preference.
   * @default ['summaryBrief']
   */
  feedSectionPreference?: string[];

  /**
   * Collection section preference — which sections to play in collection queues
   * Independent from feed preference.
   * @default ['summaryBrief']
   */
  collectionSectionPreference?: string[];

  /**
   * Additional preferences can be added here as needed
   * The JSON field allows for flexible schema evolution
   */
  [key: string]: unknown;
}

/**
 * Helper type for category following
 */
export type BookCategory = string;

/**
 * Default notification preferences (Story 13.4)
 * Used when user has not explicitly set preferences
 */
export const DEFAULT_NOTIFICATION_PREFERENCES = {
  streakReminders: true,
} as const;

/** Default daily streak-reminder fire time (local), used when unset (Story 18.8). */
export const DEFAULT_REMINDER_HOUR = 9;
export const DEFAULT_REMINDER_MINUTE = 0;

/**
 * Clamp a stored preference value to a valid integer in [min, max], falling back to
 * `fallback` for anything non-finite / out of range (defends against corrupt JSON).
 */
function clampTimePart(value: unknown, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const i = Math.trunc(value);
  return i >= 0 && i <= max ? i : fallback;
}

/**
 * Resolve the daily streak-reminder fire time from a profile's preferences JSON,
 * defaulting to 09:00 local and clamping out-of-range/corrupt values (Story 18.8).
 * Shared by the scheduling hook, the settings screen, and the first-completion flow
 * so the stored time and the scheduled time can never drift.
 */
export function getReminderTime(profile: { preferences?: unknown } | null | undefined): {
  hour: number;
  minute: number;
} {
  const prefs = (profile?.preferences as ProfilePreferences) ?? {};
  return {
    hour: clampTimePart(prefs.reminderHour, 23, DEFAULT_REMINDER_HOUR),
    minute: clampTimePart(prefs.reminderMinute, 59, DEFAULT_REMINDER_MINUTE),
  };
}

/**
 * Combined "streak reminders enabled" gate: master toggle (default ON) &&
 * streakReminders preference (default ON) — the opt-out-default model (Story 18.8).
 *
 * Centralizes the computation shared by the foreground reschedule hook
 * (`useStreakReminder`) and the first-narration-completion permission flow
 * (`AudioPlayerContext` → `requestNotificationPermissionOnFirstCompletion`) so the
 * two paths can never drift — both must respect an explicit user opt-out before
 * scheduling a local reminder.
 */
export function streakRemindersEnabled(
  profile: { notificationsEnabled?: boolean | null; preferences?: unknown } | null | undefined
): boolean {
  const masterOn = profile?.notificationsEnabled !== false;
  const prefs = (profile?.preferences as ProfilePreferences) ?? {};
  const streakOn = prefs.streakReminders ?? DEFAULT_NOTIFICATION_PREFERENCES.streakReminders;
  return masterOn && streakOn;
}
