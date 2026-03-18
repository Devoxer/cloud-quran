import * as Notifications from 'expo-notifications';

const REMINDER_CONTENT: Notifications.NotificationContentInput = {
  title: 'Your Quran time',
  body: 'A moment of peace awaits you.',
  data: { type: 'reading-reminder' },
};

export async function requestNotificationPermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function scheduleReadingReminder(
  hour: number,
  minute: number,
  days: number[],
): Promise<void> {
  await cancelAllReminders();

  if (days.length === 7) {
    await Notifications.scheduleNotificationAsync({
      content: REMINDER_CONTENT,
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
      },
    });
  } else {
    for (const weekday of days) {
      await Notifications.scheduleNotificationAsync({
        content: REMINDER_CONTENT,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday,
          hour,
          minute,
        },
      });
    }
  }
}

export async function cancelAllReminders(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

export function setupNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: false,
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: false,
      shouldShowList: false,
    }),
  });
}
