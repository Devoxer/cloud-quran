import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { mmkvStorage } from '@/services/mmkv';
import {
  cancelAllReminders,
  requestNotificationPermission,
  scheduleReadingReminder,
} from '@/services/notifications';

interface ReminderState {
  reminderEnabled: boolean;
  reminderHour: number;
  reminderMinute: number;
  reminderDays: number[];
  toggleReminder: () => Promise<void>;
  setReminderTime: (hour: number, minute: number) => Promise<void>;
  setReminderDays: (days: number[]) => Promise<void>;
}

export const useReminderStore = create<ReminderState>()(
  persist(
    (set, get) => ({
      reminderEnabled: false,
      reminderHour: 8,
      reminderMinute: 0,
      reminderDays: [1, 2, 3, 4, 5, 6, 7],

      toggleReminder: async () => {
        const current = get().reminderEnabled;
        if (!current) {
          const granted = await requestNotificationPermission();
          if (!granted) return;
          const { reminderHour, reminderMinute, reminderDays } = get();
          await scheduleReadingReminder(reminderHour, reminderMinute, reminderDays);
        } else {
          await cancelAllReminders();
        }
        set({ reminderEnabled: !current });
      },

      setReminderTime: async (hour, minute) => {
        set({ reminderHour: hour, reminderMinute: minute });
        if (get().reminderEnabled) {
          await scheduleReadingReminder(hour, minute, get().reminderDays);
        }
      },

      setReminderDays: async (days) => {
        set({ reminderDays: days });
        if (get().reminderEnabled) {
          const { reminderHour, reminderMinute } = get();
          await scheduleReadingReminder(reminderHour, reminderMinute, days);
        }
      },
    }),
    {
      name: 'reminder-state',
      storage: createJSONStorage(() => mmkvStorage),
      partialize: (state) => ({
        reminderEnabled: state.reminderEnabled,
        reminderHour: state.reminderHour,
        reminderMinute: state.reminderMinute,
        reminderDays: state.reminderDays,
      }),
    },
  ),
);
