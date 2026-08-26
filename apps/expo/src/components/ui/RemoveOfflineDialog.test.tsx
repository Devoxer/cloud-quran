/**
 * Unit tests for RemoveOfflineDialog — a thin shell over the native `<Dialog>`
 * (Story 17.4 §A). The native dialog is OS chrome (not unit-testable in jest),
 * so we mock `../Dialog` with a queryable stub and assert the shell's job:
 * folding bookTitle + freed-size into the message, the destructive variant, and
 * forwarding the confirm/cancel handlers. The queryable contract is covered by
 * Dialog.test.tsx (web) + the iOS/Android visual smoke.
 */

import { fireEvent, render, screen } from '@testing-library/react-native';
import type { DialogProps } from './Dialog';

jest.mock('./Dialog', () => ({
  Dialog: ({
    open,
    title,
    message,
    confirmText,
    cancelText,
    confirmDestructive,
    onConfirm,
    onCancel,
    testID,
  }: DialogProps) => {
    const { Pressable, Text } = require('react-native');
    if (!open) return null;
    return (
      <Pressable testID={`${testID}-stub`} accessibilityState={{ selected: !!confirmDestructive }}>
        <Text>{title}</Text>
        <Text>{message}</Text>
        <Pressable testID={`${testID}-confirm`} onPress={onConfirm}>
          <Text>{confirmText}</Text>
        </Pressable>
        <Pressable testID={`${testID}-cancel`} onPress={onCancel}>
          <Text>{cancelText}</Text>
        </Pressable>
      </Pressable>
    );
  },
}));

import { RemoveOfflineDialog } from './RemoveOfflineDialog';

describe('RemoveOfflineDialog (shell over <Dialog>)', () => {
  const onConfirm = jest.fn();
  const onCancel = jest.fn();
  const baseProps = {
    visible: true,
    bookTitle: 'Atomic Habits',
    sizeFormatted: '12.4 MB',
    isRemoving: false,
    onConfirm,
    onCancel,
  };

  beforeEach(() => {
    onConfirm.mockReset();
    onCancel.mockReset();
  });

  it('folds book title + freed size into the message and uses the destructive variant', () => {
    render(<RemoveOfflineDialog {...baseProps} />);
    expect(screen.getByText('Remove Offline Download?')).toBeTruthy();
    expect(screen.getByText(/Atomic Habits/)).toBeTruthy();
    expect(screen.getByText(/12\.4 MB/)).toBeTruthy();
    expect(screen.getByText('Remove')).toBeTruthy();
    expect(screen.getByTestId('remove-offline-dialog-stub').props.accessibilityState.selected).toBe(
      true
    );
  });

  it('renders nothing when not visible', () => {
    render(<RemoveOfflineDialog {...baseProps} visible={false} />);
    expect(screen.queryByTestId('remove-offline-dialog-stub')).toBeNull();
  });

  it('forwards onConfirm / onCancel', () => {
    render(<RemoveOfflineDialog {...baseProps} />);
    fireEvent.press(screen.getByTestId('remove-offline-dialog-confirm'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByTestId('remove-offline-dialog-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
