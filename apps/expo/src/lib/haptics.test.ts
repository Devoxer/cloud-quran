/**
 * Tests for the haptics helper (Story 17.13).
 *
 * Verifies it maps to the right NotificationFeedbackType and no-ops on web.
 */

// jest.setup.js globally mocks @/lib/haptics for consumer tests; this suite
// tests the REAL implementation, so opt out of that global mock here.
jest.unmock('@/lib/haptics');

import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { haptics } from './haptics';

jest.mock('expo-haptics', () => ({
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  notificationAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
}));

describe('haptics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Platform.OS = 'ios';
  });

  it('fires Success feedback on success()', () => {
    haptics.success();
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('success');
  });

  it('fires Warning feedback on warning()', () => {
    haptics.warning();
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('warning');
  });

  it('fires Error feedback on error()', () => {
    haptics.error();
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('error');
  });

  it('fires a Light impact by default on impact()', () => {
    haptics.impact();
    expect(Haptics.impactAsync).toHaveBeenCalledWith('light');
  });

  it('maps the impact style to the expo-haptics enum', () => {
    haptics.impact('medium');
    expect(Haptics.impactAsync).toHaveBeenCalledWith('medium');
    haptics.impact('heavy');
    expect(Haptics.impactAsync).toHaveBeenCalledWith('heavy');
  });

  it('no-ops on web', () => {
    Platform.OS = 'web';
    haptics.success();
    haptics.impact('light');
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
  });
});
