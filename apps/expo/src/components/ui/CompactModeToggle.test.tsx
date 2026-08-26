/**
 * CompactModeToggle Tests
 *
 * Story CHANGE-008-B: Player UI — Floating Side Panel + Mode Switcher
 */

import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { CompactModeToggle } from './CompactModeToggle';

// Mock ThemeContext
jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    colors: {
      background: {
        primary: '#FFFBF7',
        secondary: '#F5EFE9',
        tertiary: '#EBE3DA',
      },
      text: {
        primary: '#1A1612',
        secondary: '#5C534A',
        tertiary: '#8C8279',
        onAccent: '#FFFFFF',
      },
      accent: {
        primary: '#C65D3B',
        secondary: '#E8A87C',
      },
    },
    isDark: false,
  }),
}));

const defaultProps = {
  mode: 'synced' as const,
  onModeChange: jest.fn(),
  testID: 'compact-mode',
};

describe('CompactModeToggle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the toggle button', () => {
    render(<CompactModeToggle {...defaultProps} />);

    expect(screen.getByTestId('compact-mode')).toBeTruthy();
  });

  it('renders container with testID', () => {
    render(<CompactModeToggle {...defaultProps} />);
    expect(screen.getByTestId('compact-mode')).toBeTruthy();
  });

  it('calls onModeChange with next mode when pressed (synced -> listen)', () => {
    render(<CompactModeToggle {...defaultProps} />);

    fireEvent.press(screen.getByTestId('compact-mode'));
    expect(defaultProps.onModeChange).toHaveBeenCalledWith('listen');
  });

  it('calls onModeChange with next mode when pressed (listen -> read)', () => {
    render(<CompactModeToggle {...defaultProps} mode="listen" />);

    fireEvent.press(screen.getByTestId('compact-mode'));
    expect(defaultProps.onModeChange).toHaveBeenCalledWith('read');
  });

  it('calls onModeChange with next mode when pressed (read -> synced)', () => {
    render(<CompactModeToggle {...defaultProps} mode="read" />);

    fireEvent.press(screen.getByTestId('compact-mode'));
    expect(defaultProps.onModeChange).toHaveBeenCalledWith('synced');
  });

  it('does not call onModeChange when disabled', () => {
    render(<CompactModeToggle {...defaultProps} disabled />);

    fireEvent.press(screen.getByTestId('compact-mode'));
    expect(defaultProps.onModeChange).not.toHaveBeenCalled();
  });

  it('has correct accessibility label for synced mode', () => {
    render(<CompactModeToggle {...defaultProps} mode="synced" />);

    const button = screen.getByTestId('compact-mode');
    expect(button.props.accessibilityLabel).toBe('Synced mode. Tap to switch to Listen mode');
  });

  it('has correct accessibility label for listen mode', () => {
    render(<CompactModeToggle {...defaultProps} mode="listen" />);

    const button = screen.getByTestId('compact-mode');
    expect(button.props.accessibilityLabel).toBe('Listen mode. Tap to switch to Read mode');
  });

  it('has correct accessibility label for read mode', () => {
    render(<CompactModeToggle {...defaultProps} mode="read" />);

    const button = screen.getByTestId('compact-mode');
    expect(button.props.accessibilityLabel).toBe('Read mode. Tap to switch to Synced mode');
  });

  it('has disabled accessibility state when disabled', () => {
    render(<CompactModeToggle {...defaultProps} disabled />);

    const button = screen.getByTestId('compact-mode');
    expect(button.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
  });

  // Story 26.14 (Part A2): the toggle reads as the player's primary state control, so it
  // gets an accent-filled circle — the documented exception to the 23.13 "neutral header
  // chrome" rule. Its neighbour, the `⋯` overflow, stays neutral.
  describe('accent fill', () => {
    it('fills the circular button with the theme accent', () => {
      render(<CompactModeToggle {...defaultProps} />);

      const style = StyleSheet.flatten(screen.getByTestId('compact-mode').props.style);
      expect(style.backgroundColor).toBe('#C65D3B'); // accent.primary
      expect(style.borderRadius).toBe(style.width / 2); // still a circle
    });

    it('renders the mode glyph in text.onAccent so it stays legible on the fill', () => {
      render(<CompactModeToggle {...defaultProps} />);

      // The glyph's colour lands on the underlying SymbolView's `tintColor`. Regressing it
      // to `text.primary` would ship a near-invisible icon on the accent circle — a class
      // the palette contrast suite gates but only for the onAccent/accent PAIR.
      expect(screen.UNSAFE_getByProps({ tintColor: '#FFFFFF' })).toBeTruthy();
    });

    it('keeps the disabled and pressed dimming on top of the fill', () => {
      render(<CompactModeToggle {...defaultProps} disabled />);

      const style = StyleSheet.flatten(screen.getByTestId('compact-mode').props.style);
      expect(style.backgroundColor).toBe('#C65D3B');
      expect(style.opacity).toBe(0.5);
    });
  });
});
