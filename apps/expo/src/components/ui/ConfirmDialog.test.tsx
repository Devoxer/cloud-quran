/**
 * Unit tests for ConfirmDialog — a thin shell over the native `<Dialog>`
 * primitive (Story 17.4 §A).
 *
 * The native `<Dialog>` is OS chrome (UIAlertController / M3 AlertDialog / web
 * modal) — its internals aren't unit-testable in jest (the swift-ui Alert mock
 * renders host views, not queryable RN buttons). So this suite mocks `../Dialog`
 * with a queryable stub and asserts the shell's only real job: mapping the
 * `visible` / `confirmStyle` call-site API onto the `<Dialog>` contract. The
 * queryable contract is covered by `Dialog.test.tsx` (web impl) + the iOS/Android
 * visual smoke (Step E/K).
 */

import { fireEvent, render, screen } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';
import type { DialogProps } from './Dialog';

// Queryable stub for the native <Dialog> — exposes the mapped props.
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
    const { Pressable: P, Text: T } = require('react-native');
    if (!open) return null;
    return (
      <P testID={`${testID}-stub`} accessibilityState={{ selected: !!confirmDestructive }}>
        <T>{title}</T>
        <T>{message}</T>
        <P testID={`${testID}-confirm`} accessibilityLabel={confirmText} onPress={onConfirm}>
          <T>{confirmText}</T>
        </P>
        <P testID={`${testID}-cancel`} accessibilityLabel={cancelText} onPress={onCancel}>
          <T>{cancelText}</T>
        </P>
      </P>
    );
  },
}));

import { ConfirmDialog } from './ConfirmDialog';

// Silence unused-import lint for the RN primitives referenced only inside the mock factory.
void Pressable;
void Text;

describe('ConfirmDialog (shell over <Dialog>)', () => {
  const mockOnConfirm = jest.fn();
  const mockOnCancel = jest.fn();

  const defaultProps = {
    visible: true,
    title: 'Test Title',
    message: 'Test message content',
    onConfirm: mockOnConfirm,
    onCancel: mockOnCancel,
  };

  beforeEach(() => {
    mockOnConfirm.mockReset();
    mockOnCancel.mockReset();
  });

  describe('rendering + prop mapping', () => {
    it('forwards title + message + default button text when visible', () => {
      render(<ConfirmDialog {...defaultProps} />);

      expect(screen.getByTestId('confirm-dialog-stub')).toBeTruthy();
      expect(screen.getByText('Test Title')).toBeTruthy();
      expect(screen.getByText('Test message content')).toBeTruthy();
      expect(screen.getByText('Cancel')).toBeTruthy();
      expect(screen.getByText('Confirm')).toBeTruthy();
    });

    it('maps visible=false to open=false (renders nothing)', () => {
      render(<ConfirmDialog {...defaultProps} visible={false} />);
      expect(screen.queryByTestId('confirm-dialog-stub')).toBeNull();
    });

    it('forwards custom button text', () => {
      render(<ConfirmDialog {...defaultProps} cancelText="Go Back" confirmText="Delete" />);
      expect(screen.getByText('Go Back')).toBeTruthy();
      expect(screen.getByText('Delete')).toBeTruthy();
    });
  });

  describe('interactions', () => {
    it('calls onCancel when the cancel action fires', () => {
      render(<ConfirmDialog {...defaultProps} />);
      fireEvent.press(screen.getByTestId('confirm-dialog-cancel'));
      expect(mockOnCancel).toHaveBeenCalledTimes(1);
      expect(mockOnConfirm).not.toHaveBeenCalled();
    });

    it('calls onConfirm when the confirm action fires', () => {
      render(<ConfirmDialog {...defaultProps} />);
      fireEvent.press(screen.getByTestId('confirm-dialog-confirm'));
      expect(mockOnConfirm).toHaveBeenCalledTimes(1);
      expect(mockOnCancel).not.toHaveBeenCalled();
    });
  });

  describe('confirmStyle → confirmDestructive mapping', () => {
    it('maps confirmStyle="default" to confirmDestructive=false', () => {
      render(<ConfirmDialog {...defaultProps} confirmStyle="default" />);
      expect(screen.getByTestId('confirm-dialog-stub').props.accessibilityState.selected).toBe(
        false
      );
    });

    it('maps confirmStyle="destructive" to confirmDestructive=true', () => {
      render(<ConfirmDialog {...defaultProps} confirmStyle="destructive" />);
      expect(screen.getByTestId('confirm-dialog-stub').props.accessibilityState.selected).toBe(
        true
      );
    });
  });

  describe('accessibility', () => {
    it('forwards confirm/cancel labels (default)', () => {
      render(<ConfirmDialog {...defaultProps} />);
      expect(screen.getByTestId('confirm-dialog-cancel').props.accessibilityLabel).toBe('Cancel');
      expect(screen.getByTestId('confirm-dialog-confirm').props.accessibilityLabel).toBe('Confirm');
    });

    it('forwards custom labels', () => {
      render(<ConfirmDialog {...defaultProps} cancelText="Go Back" confirmText="Delete" />);
      expect(screen.getByTestId('confirm-dialog-cancel').props.accessibilityLabel).toBe('Go Back');
      expect(screen.getByTestId('confirm-dialog-confirm').props.accessibilityLabel).toBe('Delete');
    });
  });
});
