/**
 * Render-smoke for the web Dialog implementation (Story 17.4 §A, AC 9).
 *
 * The native `Dialog` (iOS swift-ui Alert / Android M3 AlertDialog) is OS chrome
 * verified on simulators; the queryable, testable implementation is the web
 * modal (`index.web.tsx`), which we import directly here (jest-expo defaults to
 * the iOS platform resolution, so `../Dialog` would resolve to the native file).
 * This covers the contract: title/message render, confirm/cancel fire, closed
 * renders nothing, destructive variant renders.
 */

import { fireEvent, render, screen } from '@testing-library/react-native';
import { Dialog } from './Dialog/index.web';

const mockUseTheme = jest.fn();
jest.mock('@/lib/theme', () => ({
  useTheme: () => mockUseTheme(),
}));

describe('Dialog (web impl)', () => {
  const onConfirm = jest.fn();
  const onCancel = jest.fn();
  const baseProps = {
    open: true,
    title: 'Delete item?',
    message: 'This cannot be undone.',
    onConfirm,
    onCancel,
  };

  beforeEach(() => {
    onConfirm.mockReset();
    onCancel.mockReset();
    mockUseTheme.mockReturnValue({
      colors: {
        background: { primary: '#FFFFFF' },
        text: { primary: '#1A1612', secondary: '#5C534A', onAccent: '#FFFFFF' },
        border: '#E8E2DB',
        accent: { primary: '#7B6F5E' },
        semantic: { error: '#C45D4D' },
        overlay: { dark: 'rgba(26, 22, 18, 0.5)' },
      },
    });
  });

  it('renders title + message + default buttons when open', () => {
    render(<Dialog {...baseProps} />);
    expect(screen.getByText('Delete item?')).toBeTruthy();
    expect(screen.getByText('This cannot be undone.')).toBeTruthy();
    expect(screen.getByText('Confirm')).toBeTruthy();
    expect(screen.getByText('Cancel')).toBeTruthy();
  });

  it('renders nothing when closed', () => {
    render(<Dialog {...baseProps} open={false} />);
    expect(screen.queryByText('Delete item?')).toBeNull();
  });

  it('fires onConfirm / onCancel', () => {
    render(<Dialog {...baseProps} testID="d" />);
    fireEvent.press(screen.getByTestId('d-confirm'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByTestId('d-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  // NOTE: Escape-to-dismiss is a web-runtime behavior — the effect is guarded
  // out of the non-DOM jest-expo env (no `window.addEventListener`), so it's
  // verified via Playwright at Step E/K, not here.

  it('carries accessibilityRole="alert" + renders the destructive variant', () => {
    render(<Dialog {...baseProps} testID="d" confirmDestructive confirmText="Delete" />);
    expect(screen.getByTestId('d-overlay').props.accessibilityRole).toBe('alert');
    expect(screen.getByText('Delete')).toBeTruthy();
  });

  // ── Story 17.13: configurable `actions` button set ──

  it('renders a single OK button in actions mode (acknowledge-only)', () => {
    const onPress = jest.fn();
    render(
      <Dialog
        open
        title="No purchases found"
        message="There was nothing to restore."
        actions={[{ label: 'OK', onPress }]}
        onCancel={onCancel}
        testID="d"
      />
    );
    expect(screen.getByText('No purchases found')).toBeTruthy();
    // Single non-cancel action → '-action-0'; no legacy confirm/cancel buttons.
    fireEvent.press(screen.getByTestId('d-action-0'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('d-confirm')).toBeNull();
  });

  it('renders an N-action set and fires each onPress; cancel maps to -cancel', () => {
    const openSettings = jest.fn();
    const notNow = jest.fn();
    render(
      <Dialog
        open
        title="Enable notifications"
        message="Turn them on in Settings."
        actions={[
          { label: 'Open Settings', onPress: openSettings },
          { label: 'Not now', role: 'cancel', onPress: notNow },
        ]}
        onCancel={onCancel}
        testID="d"
      />
    );
    fireEvent.press(screen.getByTestId('d-action-0'));
    expect(openSettings).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByTestId('d-cancel'));
    expect(notNow).toHaveBeenCalledTimes(1);
  });

  it('backdrop tap fires onCancel (the dismissal handler) in actions mode', () => {
    render(
      <Dialog
        open
        title="Heads up"
        message="Done."
        actions={[{ label: 'OK' }]}
        onCancel={onCancel}
        testID="d"
      />
    );
    fireEvent.press(screen.getByLabelText('Dismiss dialog'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
