const mockGetPermissionsAsync = jest.fn();
const mockRequestPermissionsAsync = jest.fn();
const mockScheduleNotificationAsync = jest.fn();
const mockCancelAllScheduledNotificationsAsync = jest.fn();
const mockSetNotificationHandler = jest.fn();

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: (...args: unknown[]) => mockGetPermissionsAsync(...args),
  requestPermissionsAsync: (...args: unknown[]) => mockRequestPermissionsAsync(...args),
  scheduleNotificationAsync: (...args: unknown[]) => mockScheduleNotificationAsync(...args),
  cancelAllScheduledNotificationsAsync: (...args: unknown[]) =>
    mockCancelAllScheduledNotificationsAsync(...args),
  setNotificationHandler: (...args: unknown[]) => mockSetNotificationHandler(...args),
  SchedulableTriggerInputTypes: {
    DAILY: 'daily',
    WEEKLY: 'weekly',
  },
}));

import {
  requestNotificationPermission,
  scheduleReadingReminder,
  cancelAllReminders,
  setupNotificationHandler,
} from './notifications';

describe('notifications service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockScheduleNotificationAsync.mockResolvedValue('notification-id');
    mockCancelAllScheduledNotificationsAsync.mockResolvedValue(undefined);
  });

  describe('requestNotificationPermission', () => {
    test('returns true when permission already granted', async () => {
      mockGetPermissionsAsync.mockResolvedValue({ status: 'granted' });
      const result = await requestNotificationPermission();
      expect(result).toBe(true);
      expect(mockRequestPermissionsAsync).not.toHaveBeenCalled();
    });

    test('requests permission when not yet granted', async () => {
      mockGetPermissionsAsync.mockResolvedValue({ status: 'undetermined' });
      mockRequestPermissionsAsync.mockResolvedValue({ status: 'granted' });
      const result = await requestNotificationPermission();
      expect(result).toBe(true);
      expect(mockRequestPermissionsAsync).toHaveBeenCalled();
    });

    test('returns false when permission denied', async () => {
      mockGetPermissionsAsync.mockResolvedValue({ status: 'undetermined' });
      mockRequestPermissionsAsync.mockResolvedValue({ status: 'denied' });
      const result = await requestNotificationPermission();
      expect(result).toBe(false);
    });
  });

  describe('scheduleReadingReminder', () => {
    test('schedules daily notification when all 7 days selected', async () => {
      await scheduleReadingReminder(8, 30, [1, 2, 3, 4, 5, 6, 7]);
      expect(mockCancelAllScheduledNotificationsAsync).toHaveBeenCalled();
      expect(mockScheduleNotificationAsync).toHaveBeenCalledTimes(1);
      expect(mockScheduleNotificationAsync).toHaveBeenCalledWith({
        content: {
          title: 'Your Quran time',
          body: 'A moment of peace awaits you.',
          data: { type: 'reading-reminder' },
        },
        trigger: {
          type: 'daily',
          hour: 8,
          minute: 30,
        },
      });
    });

    test('schedules weekly notifications for specific days', async () => {
      await scheduleReadingReminder(9, 0, [1, 4]); // Sunday, Wednesday
      expect(mockCancelAllScheduledNotificationsAsync).toHaveBeenCalled();
      expect(mockScheduleNotificationAsync).toHaveBeenCalledTimes(2);
      expect(mockScheduleNotificationAsync).toHaveBeenCalledWith({
        content: {
          title: 'Your Quran time',
          body: 'A moment of peace awaits you.',
          data: { type: 'reading-reminder' },
        },
        trigger: {
          type: 'weekly',
          weekday: 1,
          hour: 9,
          minute: 0,
        },
      });
      expect(mockScheduleNotificationAsync).toHaveBeenCalledWith({
        content: expect.any(Object),
        trigger: {
          type: 'weekly',
          weekday: 4,
          hour: 9,
          minute: 0,
        },
      });
    });

    test('cancels existing reminders before scheduling new ones', async () => {
      const callOrder: string[] = [];
      mockCancelAllScheduledNotificationsAsync.mockImplementation(async () => {
        callOrder.push('cancel');
      });
      mockScheduleNotificationAsync.mockImplementation(async () => {
        callOrder.push('schedule');
        return 'id';
      });
      await scheduleReadingReminder(7, 0, [1, 2, 3, 4, 5, 6, 7]);
      expect(callOrder[0]).toBe('cancel');
      expect(callOrder[1]).toBe('schedule');
    });
  });

  describe('cancelAllReminders', () => {
    test('calls cancelAllScheduledNotificationsAsync', async () => {
      await cancelAllReminders();
      expect(mockCancelAllScheduledNotificationsAsync).toHaveBeenCalled();
    });
  });

  describe('setupNotificationHandler', () => {
    test('sets notification handler with shouldShowAlert false', () => {
      setupNotificationHandler();
      expect(mockSetNotificationHandler).toHaveBeenCalledWith({
        handleNotification: expect.any(Function),
      });
    });

    test('handler returns correct config', async () => {
      setupNotificationHandler();
      const handler = mockSetNotificationHandler.mock.calls[0][0].handleNotification;
      const result = await handler();
      expect(result).toEqual({
        shouldShowAlert: false,
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: false,
        shouldShowList: false,
      });
    });
  });
});
