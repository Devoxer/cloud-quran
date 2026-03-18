const mockRequestNotificationPermission = jest.fn();
const mockScheduleReadingReminder = jest.fn();
const mockCancelAllReminders = jest.fn();

jest.mock('@/services/notifications', () => ({
  requestNotificationPermission: (...args: unknown[]) =>
    mockRequestNotificationPermission(...args),
  scheduleReadingReminder: (...args: unknown[]) => mockScheduleReadingReminder(...args),
  cancelAllReminders: (...args: unknown[]) => mockCancelAllReminders(...args),
}));

jest.mock('react-native-mmkv', () => ({
  createMMKV: () => ({
    set: jest.fn(),
    getString: jest.fn(),
    getBoolean: jest.fn(() => false),
    remove: jest.fn(),
  }),
}));

import { useReminderStore } from './useReminderStore';

describe('useReminderStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequestNotificationPermission.mockResolvedValue(true);
    mockScheduleReadingReminder.mockResolvedValue(undefined);
    mockCancelAllReminders.mockResolvedValue(undefined);
    // Reset store to defaults
    useReminderStore.setState({
      reminderEnabled: false,
      reminderHour: 8,
      reminderMinute: 0,
      reminderDays: [1, 2, 3, 4, 5, 6, 7],
    });
  });

  test('has correct default state', () => {
    const state = useReminderStore.getState();
    expect(state.reminderEnabled).toBe(false);
    expect(state.reminderHour).toBe(8);
    expect(state.reminderMinute).toBe(0);
    expect(state.reminderDays).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  describe('toggleReminder', () => {
    test('enables reminder when currently disabled', async () => {
      await useReminderStore.getState().toggleReminder();
      expect(mockRequestNotificationPermission).toHaveBeenCalled();
      expect(mockScheduleReadingReminder).toHaveBeenCalledWith(8, 0, [1, 2, 3, 4, 5, 6, 7]);
      expect(useReminderStore.getState().reminderEnabled).toBe(true);
    });

    test('does not enable if permission denied', async () => {
      mockRequestNotificationPermission.mockResolvedValue(false);
      await useReminderStore.getState().toggleReminder();
      expect(useReminderStore.getState().reminderEnabled).toBe(false);
      expect(mockScheduleReadingReminder).not.toHaveBeenCalled();
    });

    test('disables reminder and cancels notifications when currently enabled', async () => {
      useReminderStore.setState({ reminderEnabled: true });
      await useReminderStore.getState().toggleReminder();
      expect(mockCancelAllReminders).toHaveBeenCalled();
      expect(useReminderStore.getState().reminderEnabled).toBe(false);
    });
  });

  describe('setReminderTime', () => {
    test('updates hour and minute', async () => {
      await useReminderStore.getState().setReminderTime(14, 30);
      expect(useReminderStore.getState().reminderHour).toBe(14);
      expect(useReminderStore.getState().reminderMinute).toBe(30);
    });

    test('reschedules notifications when enabled', async () => {
      useReminderStore.setState({ reminderEnabled: true });
      await useReminderStore.getState().setReminderTime(14, 30);
      expect(mockScheduleReadingReminder).toHaveBeenCalledWith(14, 30, [1, 2, 3, 4, 5, 6, 7]);
    });

    test('does not schedule when disabled', async () => {
      await useReminderStore.getState().setReminderTime(14, 30);
      expect(mockScheduleReadingReminder).not.toHaveBeenCalled();
    });
  });

  describe('setReminderDays', () => {
    test('updates days array', async () => {
      await useReminderStore.getState().setReminderDays([1, 4, 7]);
      expect(useReminderStore.getState().reminderDays).toEqual([1, 4, 7]);
    });

    test('reschedules notifications when enabled', async () => {
      useReminderStore.setState({ reminderEnabled: true });
      await useReminderStore.getState().setReminderDays([2, 3]);
      expect(mockScheduleReadingReminder).toHaveBeenCalledWith(8, 0, [2, 3]);
    });

    test('does not schedule when disabled', async () => {
      await useReminderStore.getState().setReminderDays([2, 3]);
      expect(mockScheduleReadingReminder).not.toHaveBeenCalled();
    });
  });
});
