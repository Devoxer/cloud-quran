/**
 * Tests for profile preferences helpers (Story 18.8 — configurable reminder time)
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REMINDER_HOUR,
  DEFAULT_REMINDER_MINUTE,
  getReminderTime,
  streakRemindersEnabled,
} from './profile';

describe('getReminderTime', () => {
  it('defaults to 09:00 when unset / no profile', () => {
    expect(getReminderTime(null)).toEqual({ hour: 9, minute: 0 });
    expect(getReminderTime(undefined)).toEqual({ hour: 9, minute: 0 });
    expect(getReminderTime({})).toEqual({
      hour: DEFAULT_REMINDER_HOUR,
      minute: DEFAULT_REMINDER_MINUTE,
    });
    expect(getReminderTime({ preferences: {} })).toEqual({ hour: 9, minute: 0 });
  });

  it('reads a stored valid time', () => {
    expect(getReminderTime({ preferences: { reminderHour: 21, reminderMinute: 30 } })).toEqual({
      hour: 21,
      minute: 30,
    });
    expect(getReminderTime({ preferences: { reminderHour: 0, reminderMinute: 0 } })).toEqual({
      hour: 0,
      minute: 0,
    });
  });

  it('falls back to the default for out-of-range / non-finite / non-number values', () => {
    expect(getReminderTime({ preferences: { reminderHour: 24, reminderMinute: 60 } })).toEqual({
      hour: 9,
      minute: 0,
    });
    expect(getReminderTime({ preferences: { reminderHour: -1, reminderMinute: -5 } })).toEqual({
      hour: 9,
      minute: 0,
    });
    expect(
      getReminderTime({ preferences: { reminderHour: Number.NaN, reminderMinute: '8' } })
    ).toEqual({ hour: 9, minute: 0 });
  });

  it('truncates fractional values into range', () => {
    expect(getReminderTime({ preferences: { reminderHour: 8.9, reminderMinute: 45.6 } })).toEqual({
      hour: 8,
      minute: 45,
    });
  });

  it('resolves each part independently (one corrupt, one valid)', () => {
    expect(getReminderTime({ preferences: { reminderHour: 99, reminderMinute: 15 } })).toEqual({
      hour: 9,
      minute: 15,
    });
  });
});

describe('streakRemindersEnabled (unchanged by 18.8 time work)', () => {
  it('is opt-out: true by default', () => {
    expect(streakRemindersEnabled(null)).toBe(true);
    expect(streakRemindersEnabled({})).toBe(true);
  });

  it('respects an explicit master-off / streak-off', () => {
    expect(streakRemindersEnabled({ notificationsEnabled: false })).toBe(false);
    expect(streakRemindersEnabled({ preferences: { streakReminders: false } })).toBe(false);
  });
});
