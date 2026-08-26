/**
 * Tests for lib/notifications.ts
 *
 * Story 13.1: Set Up Expo Notifications
 * Story 18.8: Local notifications — push-token plumbing removed; the streak reminder
 *   is now a LOCAL scheduled notification (scheduleStreakReminder / cancelStreakReminder).
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { NOTIFICATION_STORAGE_KEYS } from '@/constants/notifications';
import { createAppMMKV } from '@/lib/mmkv';
import {
  cancelStreakReminder,
  createNotificationChannels,
  initializeNotifications,
  markNotificationPermissionRequested,
  parseNotificationData,
  requestNotificationPermissionOnFirstCompletion,
  STREAK_REMINDER_IDENTIFIER,
  scheduleStreakReminder,
  shouldRequestNotificationPermission,
} from './notifications';

// Mock expo-notifications
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
  // Present ONLY so "we never delete a channel" (Story 20.7) is a real assertion rather
  // than a vacuous one against an absent mock key. Nothing in the app may call it:
  // Android counts deleted channels in the app's notification-settings screen.
  deleteNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponseAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  cancelAllScheduledNotificationsAsync: jest.fn(),
  AndroidImportance: { MAX: 5, HIGH: 4, DEFAULT: 3 },
  SchedulableTriggerInputTypes: { CALENDAR: 'calendar', DATE: 'date' },
}));

// Mock react-native Platform
jest.mock('react-native', () => ({
  Platform: {
    OS: 'ios',
  },
}));

const mockSetNotificationHandler = Notifications.setNotificationHandler as jest.Mock;
const mockSetNotificationChannelAsync = Notifications.setNotificationChannelAsync as jest.Mock;
const mockDeleteNotificationChannelAsync = (
  Notifications as unknown as { deleteNotificationChannelAsync: jest.Mock }
).deleteNotificationChannelAsync;
const mockGetPermissionsAsync = Notifications.getPermissionsAsync as jest.Mock;
const mockRequestPermissionsAsync = Notifications.requestPermissionsAsync as jest.Mock;
const mockScheduleNotificationAsync = Notifications.scheduleNotificationAsync as jest.Mock;
const mockCancelScheduledNotificationAsync =
  Notifications.cancelScheduledNotificationAsync as jest.Mock;

// Same id as lib/notificationStorage → same underlying store in the MMKV jest mock.
const storage = createAppMMKV('notifications');

// In-memory fake of the OS scheduled-notification store, so we can prove the
// cancel-then-schedule de-dup (AC2) results in EXACTLY ONE scheduled reminder.
let scheduledStore: Array<{ identifier: string }> = [];

describe('notifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    storage.clearAll();
    (Platform as { OS: string }).OS = 'ios';

    scheduledStore = [];
    mockScheduleNotificationAsync.mockImplementation(async (req: { identifier?: string }) => {
      const id = req.identifier ?? `auto-${scheduledStore.length}`;
      scheduledStore = scheduledStore.filter((s) => s.identifier !== id);
      scheduledStore.push({ identifier: id });
      return id;
    });
    mockCancelScheduledNotificationAsync.mockImplementation(async (id: string) => {
      scheduledStore = scheduledStore.filter((s) => s.identifier !== id);
    });
    // Default: permission granted (override per-test).
    mockGetPermissionsAsync.mockResolvedValue({ status: 'granted' });
  });

  describe('initializeNotifications', () => {
    it('sets notification handler', () => {
      initializeNotifications();
      expect(mockSetNotificationHandler).toHaveBeenCalledTimes(1);
      expect(mockSetNotificationHandler).toHaveBeenCalledWith({
        handleNotification: expect.any(Function),
      });
    });

    it('creates notification channels on Android', () => {
      (Platform as { OS: string }).OS = 'android';
      initializeNotifications();
      expect(mockSetNotificationChannelAsync).toHaveBeenCalled();
    });

    it('does not create notification channels on iOS', () => {
      (Platform as { OS: string }).OS = 'ios';
      initializeNotifications();
      expect(mockSetNotificationChannelAsync).not.toHaveBeenCalled();
    });
  });

  // Story 20.7 — the exported channel writer, which is also the LANGUAGE refresh path.
  describe('createNotificationChannels', () => {
    it('writes the streaks channel on Android — and NO `default` channel', async () => {
      (Platform as { OS: string }).OS = 'android';
      await createNotificationChannels();

      // The `default` channel was deleted in Story 20.7 (zero consumers). Exactly one
      // channel is written, and it is `streaks`.
      expect(mockSetNotificationChannelAsync).toHaveBeenCalledTimes(1);
      expect(mockSetNotificationChannelAsync.mock.calls[0][0]).toBe('streaks');
      const writtenIds = mockSetNotificationChannelAsync.mock.calls.map((c) => c[0]);
      expect(writtenIds).not.toContain('default');
    });

    it('resolves name/description through i18n.t — never the raw key', async () => {
      (Platform as { OS: string }).OS = 'android';
      await createNotificationChannels();

      const [, config] = mockSetNotificationChannelAsync.mock.calls[0];
      // The constants hold i18n KEYS (the module evaluates before i18n); what reaches the
      // OS must be display text. jest.setup.js initializes the real `en` bundles.
      expect(config.name).toBe('Streak Reminders');
      expect(config.description).toBe('Daily learning streak reminders');
      expect(config.name).not.toContain('notifications:');
    });

    it('is a no-op on iOS and on web', async () => {
      (Platform as { OS: string }).OS = 'ios';
      await createNotificationChannels();
      (Platform as { OS: string }).OS = 'web';
      await createNotificationChannels();

      expect(mockSetNotificationChannelAsync).not.toHaveBeenCalled();
    });

    it('never rejects when the OS refuses a channel write', async () => {
      (Platform as { OS: string }).OS = 'android';
      mockSetNotificationChannelAsync.mockRejectedValueOnce(new Error('OS refused'));

      // A rejection here would fail a language switch or a permission request (AC-1).
      await expect(createNotificationChannels()).resolves.toBeUndefined();
    });

    it('NEVER deletes a channel (Android counts deleted channels against the app)', async () => {
      (Platform as { OS: string }).OS = 'android';
      await createNotificationChannels();
      await createNotificationChannels();

      expect(mockDeleteNotificationChannelAsync).not.toHaveBeenCalled();
    });
  });

  describe('scheduleStreakReminder', () => {
    it('schedules a one-shot DATE reminder at the next 09:00 on the streaks channel when granted', async () => {
      await scheduleStreakReminder();

      expect(mockScheduleNotificationAsync).toHaveBeenCalledTimes(1);
      const req = mockScheduleNotificationAsync.mock.calls[0][0];
      expect(req.identifier).toBe(STREAK_REMINDER_IDENTIFIER);
      expect(req.content.data).toEqual({ type: 'streak_reminder' });
      // DATE trigger (cross-platform; CALENDAR is iOS-only) at the next 09:00 local.
      expect(req.trigger.type).toBe('date');
      expect(req.trigger.channelId).toBe('streaks');
      expect(req.trigger.date).toBeInstanceOf(Date);
      expect(req.trigger.date.getHours()).toBe(9);
      expect(req.trigger.date.getMinutes()).toBe(0);
      // Always in the future (today if 09:00 is still ahead, else tomorrow).
      expect(req.trigger.date.getTime()).toBeGreaterThan(Date.now());
    });

    it('uses the provided hour/minute in the DATE trigger (Story 18.8 configurable time)', async () => {
      await scheduleStreakReminder({ hour: 21, minute: 30 });

      const req = mockScheduleNotificationAsync.mock.calls[0][0];
      expect(req.trigger.type).toBe('date');
      expect(req.trigger.date.getHours()).toBe(21);
      expect(req.trigger.date.getMinutes()).toBe(30);
      expect(req.trigger.date.getTime()).toBeGreaterThan(Date.now());
    });

    it('clamps an out-of-range/NaN hour to a valid DATE trigger instead of silently failing', async () => {
      // A bad hour reaching setHours would yield an Invalid Date; `Invalid <= now` is
      // false so the tomorrow-fallback is skipped and scheduleNotificationAsync would
      // get an Invalid Date and never fire. The service-boundary clamp prevents that.
      await scheduleStreakReminder({ hour: Number.NaN, minute: 99 });

      const req = mockScheduleNotificationAsync.mock.calls[0][0];
      expect(req.trigger.date).toBeInstanceOf(Date);
      expect(Number.isNaN(req.trigger.date.getTime())).toBe(false);
      expect(req.trigger.date.getHours()).toBe(9); // NaN hour → default 9
      expect(req.trigger.date.getMinutes()).toBe(59); // 99 → clamped to 59
      expect(req.trigger.date.getTime()).toBeGreaterThan(Date.now());
    });

    it('uses generic, no-emoji copy and a type-only payload (Story 18.8 — opens Discover)', async () => {
      await scheduleStreakReminder();

      const req = mockScheduleNotificationAsync.mock.calls[0][0];
      expect(req.content.title.length).toBeGreaterThan(0);
      // No per-book deep-link → payload carries only the type (no lastBookId/bookId).
      expect(req.content.data).toEqual({ type: 'streak_reminder' });
      // Copy is book-agnostic (no quoted title) and emoji-free.
      expect(req.content.body).not.toContain('"');
      expect(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(req.content.title)).toBe(false);
    });

    it('does not schedule when reminders are disabled, but DOES cancel (reconcile)', async () => {
      await scheduleStreakReminder({ enabled: false });
      expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
      // Reconcile: a disabled state must tear down any stale armed reminder
      // (e.g. a cross-device pref-disable sync), not just skip scheduling.
      expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith(STREAK_REMINDER_IDENTIFIER);
    });

    it('does not schedule when permission is not granted, but DOES cancel (reconcile)', async () => {
      mockGetPermissionsAsync.mockResolvedValue({ status: 'denied' });
      await scheduleStreakReminder();
      expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
      // Reconcile: permission revoked externally must cancel the stale reminder.
      expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith(STREAK_REMINDER_IDENTIFIER);
    });

    it('is a no-op on web', async () => {
      (Platform as { OS: string }).OS = 'web';
      await scheduleStreakReminder();
      expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
    });

    it('cancels-then-schedules → exactly ONE reminder after two calls (AC2 de-dup)', async () => {
      await scheduleStreakReminder();
      await scheduleStreakReminder();

      const streakReminders = scheduledStore.filter(
        (s) => s.identifier === STREAK_REMINDER_IDENTIFIER
      );
      expect(streakReminders).toHaveLength(1);
      // cancel runs before each schedule (cancel-then-schedule).
      expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith(STREAK_REMINDER_IDENTIFIER);
    });
  });

  describe('cancelStreakReminder', () => {
    it('cancels by the stable identifier', async () => {
      await cancelStreakReminder();
      expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith(STREAK_REMINDER_IDENTIFIER);
    });

    it('is a no-op on web', async () => {
      (Platform as { OS: string }).OS = 'web';
      await cancelStreakReminder();
      expect(mockCancelScheduledNotificationAsync).not.toHaveBeenCalled();
    });
  });

  describe('parseNotificationData', () => {
    it('parses a streak reminder to its type (no per-book deep-link payload — Story 18.8)', () => {
      const response = {
        actionIdentifier: 'default',
        notification: {
          request: { content: { data: { type: 'streak_reminder' } } },
        },
      } as unknown as Notifications.NotificationResponse;
      expect(parseNotificationData(response)).toEqual({
        type: 'streak_reminder',
        metadata: undefined,
      });
    });

    it('returns null for invalid notification data', () => {
      const response = {
        actionIdentifier: 'default',
        notification: { request: { content: { data: {} } } },
      } as unknown as Notifications.NotificationResponse;
      expect(parseNotificationData(response)).toBeNull();
    });

    it('returns null for missing data', () => {
      const response = {
        actionIdentifier: 'default',
        notification: { request: { content: { data: null } } },
      } as unknown as Notifications.NotificationResponse;
      expect(parseNotificationData(response)).toBeNull();
    });
  });

  describe('shouldRequestNotificationPermission', () => {
    it('returns true when permission has not been requested', () => {
      expect(shouldRequestNotificationPermission()).toBe(true);
    });

    it('returns false when permission has been requested', () => {
      storage.set(NOTIFICATION_STORAGE_KEYS.permissionRequested, true);
      expect(shouldRequestNotificationPermission()).toBe(false);
    });
  });

  describe('markNotificationPermissionRequested', () => {
    it('sets the MMKV flag', () => {
      markNotificationPermissionRequested();
      expect(storage.getBoolean(NOTIFICATION_STORAGE_KEYS.permissionRequested)).toBe(true);
    });
  });

  describe('requestNotificationPermissionOnFirstCompletion', () => {
    beforeEach(() => {
      mockRequestPermissionsAsync.mockResolvedValue({ status: 'granted' });
    });

    it('returns false if permission was already requested', async () => {
      storage.set(NOTIFICATION_STORAGE_KEYS.permissionRequested, true);
      const result = await requestNotificationPermissionOnFirstCompletion('profile-123');
      expect(result).toBe(false);
      expect(mockRequestPermissionsAsync).not.toHaveBeenCalled();
    });

    it('requests permission and SCHEDULES the streak reminder when granted (AC5)', async () => {
      const result = await requestNotificationPermissionOnFirstCompletion('profile-123');
      expect(result).toBe(true);
      expect(mockRequestPermissionsAsync).toHaveBeenCalled();
      expect(storage.getBoolean(NOTIFICATION_STORAGE_KEYS.permissionRequested)).toBe(true);
      // Schedules locally (no token saved).
      expect(mockScheduleNotificationAsync).toHaveBeenCalledTimes(1);
      expect(mockScheduleNotificationAsync.mock.calls[0][0].identifier).toBe(
        STREAK_REMINDER_IDENTIFIER
      );
    });

    it('marks permission as requested and does NOT schedule when denied', async () => {
      mockRequestPermissionsAsync.mockResolvedValue({ status: 'denied' });
      const result = await requestNotificationPermissionOnFirstCompletion('profile-123');
      expect(result).toBe(false);
      expect(storage.getBoolean(NOTIFICATION_STORAGE_KEYS.permissionRequested)).toBe(true);
      expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
    });

    it('schedules on grant even when profileId is null (no server identity needed)', async () => {
      const result = await requestNotificationPermissionOnFirstCompletion(null);
      expect(result).toBe(true);
      expect(mockScheduleNotificationAsync).toHaveBeenCalledTimes(1);
    });

    it('grants permission but does NOT schedule when reminders are opted out (enabled:false)', async () => {
      const result = await requestNotificationPermissionOnFirstCompletion('profile-123', {
        enabled: false,
      });
      // Permission is still requested (the first-completion ask), but we must not
      // schedule a reminder the user explicitly turned off.
      expect(result).toBe(true);
      expect(mockRequestPermissionsAsync).toHaveBeenCalled();
      expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
    });

    it('forwards the chosen hour/minute to the scheduled reminder (Story 18.8)', async () => {
      const result = await requestNotificationPermissionOnFirstCompletion('profile-123', {
        enabled: true,
        hour: 7,
        minute: 15,
      });
      expect(result).toBe(true);
      const { date } = mockScheduleNotificationAsync.mock.calls[0][0].trigger;
      expect(date.getHours()).toBe(7);
      expect(date.getMinutes()).toBe(15);
    });

    it('handles errors gracefully and marks as requested', async () => {
      mockRequestPermissionsAsync.mockRejectedValue(new Error('Permission error'));
      const result = await requestNotificationPermissionOnFirstCompletion('profile-123');
      expect(result).toBe(false);
      expect(storage.getBoolean(NOTIFICATION_STORAGE_KEYS.permissionRequested)).toBe(true);
    });
  });
});
