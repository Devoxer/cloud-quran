/**
 * Unit tests for OfflineLimitModal — a thin shell over the native `<Dialog>`
 * (Story 17.4 §A). The native dialog is OS chrome (not unit-testable in jest),
 * so we mock `../Dialog` with a queryable stub and assert the shell's job:
 * folding the count into the message and mapping the primary action (Manage) →
 * confirm and Dismiss → cancel. The queryable contract is covered by
 * Dialog.test.tsx (web) + the iOS/Android visual smoke.
 */

import { fireEvent, render, screen } from '@testing-library/react-native';
import { OFFLINE_BOOKS_LIMIT } from '@/constants/offline';
import type { DialogProps } from './Dialog';

jest.mock('./Dialog', () => ({
  Dialog: ({
    open,
    title,
    message,
    confirmText,
    cancelText,
    onConfirm,
    onCancel,
    testID,
  }: DialogProps) => {
    const { Pressable, Text } = require('react-native');
    if (!open) return null;
    return (
      <Pressable testID={`${testID}-stub`}>
        <Text>{title}</Text>
        <Text>{message}</Text>
        <Pressable
          testID={`${testID}-confirm`}
          accessibilityLabel={confirmText}
          onPress={onConfirm}
        >
          <Text>{confirmText}</Text>
        </Pressable>
        <Pressable testID={`${testID}-cancel`} accessibilityLabel={cancelText} onPress={onCancel}>
          <Text>{cancelText}</Text>
        </Pressable>
      </Pressable>
    );
  },
}));

import { OfflineLimitModal } from './OfflineLimitModal';

describe('OfflineLimitModal (shell over <Dialog>)', () => {
  const onDismiss = jest.fn();
  const onManageOffline = jest.fn();
  const baseProps = {
    visible: true,
    onDismiss,
    onManageOffline,
    currentCount: OFFLINE_BOOKS_LIMIT,
  };

  beforeEach(() => {
    onDismiss.mockReset();
    onManageOffline.mockReset();
  });

  it('renders the title + count message + both actions', () => {
    render(<OfflineLimitModal {...baseProps} />);
    expect(screen.getByText('Offline Limit Reached')).toBeTruthy();
    expect(
      screen.getByText(new RegExp(`${OFFLINE_BOOKS_LIMIT}/${OFFLINE_BOOKS_LIMIT}`))
    ).toBeTruthy();
    expect(screen.getByText('Manage Offline Books')).toBeTruthy();
    expect(screen.getByText('Dismiss')).toBeTruthy();
  });

  it('renders nothing when not visible', () => {
    render(<OfflineLimitModal {...baseProps} visible={false} />);
    expect(screen.queryByTestId('offline-limit-modal-stub')).toBeNull();
  });

  it('maps the primary action to onManageOffline and dismiss to onDismiss', () => {
    render(<OfflineLimitModal {...baseProps} />);
    fireEvent.press(screen.getByTestId('offline-limit-modal-confirm'));
    expect(onManageOffline).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByTestId('offline-limit-modal-cancel'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
