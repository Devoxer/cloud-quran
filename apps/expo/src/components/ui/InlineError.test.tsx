/**
 * Tests for InlineError — contextual inline error message (Story 17.13).
 */

import { fireEvent, render, screen } from '@testing-library/react-native';
import { InlineError } from './InlineError';

jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    colors: {
      semantic: { error: '#C44536', errorBg: '#FCEEED' },
      text: { secondary: '#5C534A' },
    },
    isDark: false,
  }),
}));

jest.mock('./Icon', () => ({
  Icon: () => null,
}));

describe('InlineError', () => {
  it('renders the message', () => {
    render(<InlineError message="Failed to remove." />);
    expect(screen.getByText('Failed to remove.')).toBeTruthy();
    expect(screen.getByTestId('inline-error').props.accessibilityRole).toBe('alert');
  });

  it('does not render a retry button without onRetry', () => {
    render(<InlineError message="Oops" testID="x" />);
    expect(screen.queryByTestId('x-retry')).toBeNull();
  });

  it('renders + fires a retry button when onRetry is provided', () => {
    const onRetry = jest.fn();
    render(<InlineError message="Failed to delete." onRetry={onRetry} testID="x" />);
    fireEvent.press(screen.getByTestId('x-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('supports a custom retry label', () => {
    render(<InlineError message="Nope" onRetry={() => {}} retryLabel="Try again" />);
    expect(screen.getByText('Try again')).toBeTruthy();
  });

  it('blocks the retry press and marks it busy when retryDisabled (Story 26.13)', () => {
    const onRetry = jest.fn();
    render(<InlineError message="Restoring." onRetry={onRetry} retryDisabled testID="x" />);
    const retry = screen.getByTestId('x-retry');
    fireEvent.press(retry);
    expect(onRetry).not.toHaveBeenCalled();
    expect(retry.props.accessibilityState).toMatchObject({ disabled: true, busy: true });
  });
});
