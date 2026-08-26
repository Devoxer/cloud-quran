/**
 * Tests for the alertStore + useAlert hook (Story 19.1).
 *
 * Verifies the Zustand store actions (showAlert/close) and that useAlert exposes
 * the stable showAlert action. The host wiring (Dialog render, close-on-throw) is
 * covered by AlertHost.test.tsx.
 */

// jest.setup.js globally mocks @/stores/alertStore for consumer tests; this suite
// tests the REAL store, so opt out of that global mock here.
jest.unmock('@/stores/alertStore');

import { act, renderHook } from '@testing-library/react-native';
import { useAlert, useAlertStore } from './alertStore';

describe('alertStore', () => {
  beforeEach(() => {
    act(() => useAlertStore.setState({ options: null }));
  });

  it('starts with no pending alert', () => {
    expect(useAlertStore.getState().options).toBeNull();
  });

  it('showAlert sets the pending options', () => {
    act(() => {
      useAlertStore.getState().showAlert({ title: 'Hi', message: 'There' });
    });
    expect(useAlertStore.getState().options).toEqual({ title: 'Hi', message: 'There' });
  });

  it('close clears the pending options', () => {
    act(() => {
      useAlertStore.getState().showAlert({ title: 'Hi', message: 'There' });
      useAlertStore.getState().close();
    });
    expect(useAlertStore.getState().options).toBeNull();
  });

  describe('useAlert', () => {
    it('exposes a stable showAlert that drives the store', () => {
      const { result, rerender } = renderHook(() => useAlert());
      const firstShowAlert = result.current.showAlert;

      act(() => {
        result.current.showAlert({ title: 'Restore', message: 'Nothing to restore.' });
      });
      expect(useAlertStore.getState().options).toEqual({
        title: 'Restore',
        message: 'Nothing to restore.',
      });

      // showAlert identity is stable across renders (selector over a store action).
      rerender(undefined);
      expect(result.current.showAlert).toBe(firstShowAlert);
    });
  });
});
