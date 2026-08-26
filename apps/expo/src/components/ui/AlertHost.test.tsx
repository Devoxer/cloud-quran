/**
 * Tests for the <AlertHost /> (Story 19.1; migrated from AlertContext.test.tsx).
 *
 * Mocks the platform `<Dialog>` to a queryable stub (jest-expo resolves to the
 * native swift-ui file otherwise) and drives the REAL alertStore to verify host
 * wiring: nothing renders until showAlert, a default single OK is supplied, each
 * action runs its onPress AND closes the host, dismissal closes, and the
 * try/finally guarantee closes even when an action handler throws.
 */

// This suite tests the REAL store + host; opt out of the global alertStore mock.
jest.unmock('@/stores/alertStore');

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useAlertStore } from '@/stores/alertStore';
import { AlertHost } from './AlertHost';

interface MockAction {
  label: string;
  onPress?: () => void;
}

jest.mock('@/components/ui/Dialog', () => {
  // Required lazily inside the factory — jest.mock is hoisted above imports.
  const { Pressable, Text, View } = require('react-native');
  const { createElement: h } = require('react');
  return {
    Dialog: ({
      open,
      title,
      message,
      actions,
      onCancel,
      testID,
    }: {
      open: boolean;
      title: string;
      message: string;
      actions: MockAction[];
      onCancel: () => void;
      testID: string;
    }) =>
      open
        ? h(
            View,
            { testID },
            h(Text, null, title),
            h(Text, null, message),
            actions.map((a, i) =>
              h(
                Pressable,
                { key: i, testID: `${testID}-btn-${i}`, onPress: a.onPress },
                h(Text, null, a.label)
              )
            ),
            h(
              Pressable,
              { testID: `${testID}-dismiss`, onPress: onCancel },
              h(Text, null, 'dismiss')
            )
          )
        : null,
  };
});

function show(options: Parameters<ReturnType<typeof useAlertStore.getState>['showAlert']>[0]) {
  act(() => useAlertStore.getState().showAlert(options));
}

describe('AlertHost', () => {
  beforeEach(() => {
    act(() => useAlertStore.setState({ options: null }));
  });

  it('renders nothing until showAlert is called', () => {
    render(<AlertHost />);
    expect(screen.queryByTestId('alert')).toBeNull();
  });

  it('shows a single OK button by default (acknowledge-only)', () => {
    render(<AlertHost />);
    show({ title: 'No purchases found', message: 'Nothing to restore.' });
    expect(screen.getByText('No purchases found')).toBeTruthy();
    expect(screen.getByText('OK')).toBeTruthy();
  });

  it('runs an action onPress AND closes the alert', () => {
    const onPress = jest.fn();
    render(<AlertHost />);
    show({
      title: 'Enable notifications',
      message: 'Open Settings to turn on reminders.',
      actions: [
        { label: 'Open Settings', onPress },
        { label: 'Not now', role: 'cancel' },
      ],
    });
    expect(screen.getByTestId('alert')).toBeTruthy();
    fireEvent.press(screen.getByTestId('alert-btn-0'));
    expect(onPress).toHaveBeenCalledTimes(1);
    // Host closes after the action runs.
    expect(screen.queryByTestId('alert')).toBeNull();
  });

  it('closes on dismissal (onCancel)', () => {
    render(<AlertHost />);
    show({ title: 'Heads up', message: 'Done.' });
    fireEvent.press(screen.getByTestId('alert-dismiss'));
    expect(screen.queryByTestId('alert')).toBeNull();
  });

  it('closes even when the action handler throws (try/finally guarantee)', () => {
    const thrower = jest.fn(() => {
      throw new Error('boom');
    });
    render(<AlertHost />);
    show({
      title: 'Risky',
      message: 'Action will throw.',
      actions: [{ label: 'Go', onPress: thrower }],
    });
    expect(screen.getByTestId('alert')).toBeTruthy();
    // The press propagates the throw, but the host's `finally` must still clear
    // the store — otherwise `options` is never reset and every later showAlert
    // silently fails to present (a wedged host). Assert the store-level guarantee
    // (the throw aborts React's synchronous re-render flush, so the DOM node may
    // linger this tick — but the next showAlert presents because options is null).
    expect(() => fireEvent.press(screen.getByTestId('alert-btn-0'))).toThrow('boom');
    expect(thrower).toHaveBeenCalledTimes(1);
    expect(useAlertStore.getState().options).toBeNull();
  });
});
