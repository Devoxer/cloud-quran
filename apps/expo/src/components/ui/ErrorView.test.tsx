/**
 * Tests for ErrorView — the full-screen / section error-takeover primitive (Story 23.6).
 *
 * Verifies title + message + icon render, the action button fires `onAction` only
 * when provided, the alert accessibility role, the fullScreen flex:1 variant, and
 * custom testID passthrough.
 */

import { fireEvent, render, screen } from '@testing-library/react-native';
import { ErrorView } from './ErrorView';

jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    colors: {
      text: {
        primary: '#000000',
        secondary: '#666666',
        onAccent: '#FFFFFF',
      },
      accent: { primary: '#007AFF' },
      semantic: { error: '#D7263D' },
    },
  }),
}));

function flatten(style: unknown) {
  return Array.isArray(style)
    ? style.reduce((acc: Record<string, unknown>, s) => ({ ...acc, ...s }), {})
    : (style as Record<string, unknown>);
}

describe('ErrorView', () => {
  it('renders title, message and icon', () => {
    render(<ErrorView title="Unable to load plans" message="Check your connection." />);
    expect(screen.getByText('Unable to load plans')).toBeTruthy();
    expect(screen.getByText('Check your connection.')).toBeTruthy();
    expect(screen.getByTestId('error-view-icon')).toBeTruthy();
  });

  it('does not render the message when not provided', () => {
    render(<ErrorView title="Something went wrong" />);
    expect(screen.queryByTestId('error-view-message')).toBeNull();
  });

  it('renders the action button and fires onAction on press only when provided', () => {
    const onAction = jest.fn();
    render(<ErrorView title="Failed" onAction={onAction} />);
    fireEvent.press(screen.getByTestId('error-view-action'));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('omits the action button when onAction is not provided', () => {
    render(<ErrorView title="Failed" />);
    expect(screen.queryByTestId('error-view-action')).toBeNull();
  });

  it('defaults the action label to "Try Again" and accepts an override', () => {
    const onAction = jest.fn();
    const { rerender } = render(<ErrorView title="Failed" onAction={onAction} />);
    expect(screen.getByText('Try Again')).toBeTruthy();
    rerender(<ErrorView title="Failed" actionLabel="Go Back" onAction={onAction} />);
    expect(screen.getByText('Go Back')).toBeTruthy();
  });

  it('exposes an alert accessibility role', () => {
    render(<ErrorView title="Failed" />);
    expect(screen.getByTestId('error-view').props.accessibilityRole).toBe('alert');
  });

  it('adds flex:1 in fullScreen mode', () => {
    render(<ErrorView title="Failed" fullScreen />);
    const style = flatten(screen.getByTestId('error-view').props.style);
    expect(style.flex).toBe(1);
  });

  it('applies a custom testID', () => {
    render(<ErrorView title="Failed" testID="subscription-error" />);
    expect(screen.getByTestId('subscription-error')).toBeTruthy();
  });
});
