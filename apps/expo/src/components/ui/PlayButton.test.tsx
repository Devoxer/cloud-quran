/**
 * Tests for PlayButton component
 *
 * Story 5.2: Implement Basic Audio Playback
 * Epic 5: Core Summary Playback
 *
 * Verifies PlayButton rendering states, interactions, and accessibility.
 */

import { fireEvent, render } from '@testing-library/react-native';
import { PlayButton } from './PlayButton';

// Mock ThemeContext
jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    colors: {
      accent: {
        primary: '#D97706',
        secondary: '#92400E',
      },
      semantic: {
        error: '#EF4444',
      },
      text: {
        primary: '#1A1612',
        tertiary: '#8C8279',
        onAccent: '#FFFFFF',
      },
      background: {
        primary: '#FFFFFF',
        secondary: '#F5F5F4',
      },
    },
  }),
}));

describe('PlayButton', () => {
  const defaultProps = {
    onPress: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('default state', () => {
    it('renders play icon in default state', () => {
      const { getByTestId } = render(<PlayButton {...defaultProps} testID="play-button" />);

      const button = getByTestId('play-button');
      expect(button).toBeTruthy();
    });

    it('calls onPress when pressed in default state', () => {
      const onPress = jest.fn();
      const { getByTestId } = render(<PlayButton onPress={onPress} testID="play-button" />);

      fireEvent.press(getByTestId('play-button'));
      expect(onPress).toHaveBeenCalledTimes(1);
    });
  });

  describe('loading state', () => {
    it('renders ActivityIndicator when isLoading is true', () => {
      const { getByTestId } = render(
        <PlayButton {...defaultProps} isLoading testID="play-button" />
      );

      expect(getByTestId('play-button-loading')).toBeTruthy();
    });

    it('does not call onPress when isLoading', () => {
      const onPress = jest.fn();
      const { getByTestId } = render(
        <PlayButton onPress={onPress} isLoading testID="play-button" />
      );

      fireEvent.press(getByTestId('play-button'));
      expect(onPress).not.toHaveBeenCalled();
    });
  });

  describe('error state', () => {
    it('renders error icon when error is set', () => {
      const { getByTestId } = render(
        <PlayButton {...defaultProps} error="Failed to load" testID="play-button" />
      );

      expect(getByTestId('play-button-error')).toBeTruthy();
    });

    it('calls onRetry when pressed in error state with onRetry', () => {
      const onPress = jest.fn();
      const onRetry = jest.fn();
      const { getByTestId } = render(
        <PlayButton
          onPress={onPress}
          onRetry={onRetry}
          error="Failed to load"
          testID="play-button"
        />
      );

      fireEvent.press(getByTestId('play-button'));
      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onPress).not.toHaveBeenCalled();
    });

    it('calls onPress when pressed in error state without onRetry', () => {
      const onPress = jest.fn();
      const { getByTestId } = render(
        <PlayButton onPress={onPress} error="Failed to load" testID="play-button" />
      );

      fireEvent.press(getByTestId('play-button'));
      expect(onPress).toHaveBeenCalledTimes(1);
    });
  });

  describe('size prop', () => {
    it('renders with small size (32px)', () => {
      const { getByTestId } = render(
        <PlayButton {...defaultProps} size="sm" testID="play-button" />
      );

      const button = getByTestId('play-button');
      const style = button.props.style;
      // Style may be flattened array, check for size properties
      const flatStyle = Array.isArray(style)
        ? style.reduce((acc, s) => ({ ...acc, ...s }), {})
        : style;
      expect(flatStyle.width).toBe(32);
      expect(flatStyle.height).toBe(32);
    });

    it('renders with medium size (40px)', () => {
      const { getByTestId } = render(
        <PlayButton {...defaultProps} size="md" testID="play-button" />
      );

      const button = getByTestId('play-button');
      const style = button.props.style;
      const flatStyle = Array.isArray(style)
        ? style.reduce((acc, s) => ({ ...acc, ...s }), {})
        : style;
      expect(flatStyle.width).toBe(40);
      expect(flatStyle.height).toBe(40);
    });

    it('renders with large size (48px)', () => {
      const { getByTestId } = render(
        <PlayButton {...defaultProps} size="lg" testID="play-button" />
      );

      const button = getByTestId('play-button');
      const style = button.props.style;
      const flatStyle = Array.isArray(style)
        ? style.reduce((acc, s) => ({ ...acc, ...s }), {})
        : style;
      expect(flatStyle.width).toBe(48);
      expect(flatStyle.height).toBe(48);
    });
  });

  describe('disabled prop', () => {
    it('does not call onPress when disabled', () => {
      const onPress = jest.fn();
      const { getByTestId } = render(
        <PlayButton onPress={onPress} disabled testID="play-button" />
      );

      fireEvent.press(getByTestId('play-button'));
      expect(onPress).not.toHaveBeenCalled();
    });
  });

  describe('playing state', () => {
    it('renders pause icon when isPlaying is true', () => {
      const { getByTestId } = render(
        <PlayButton {...defaultProps} isPlaying testID="play-button" />
      );

      expect(getByTestId('play-button-pause')).toBeTruthy();
    });
  });

  describe('accessibility', () => {
    it('has correct accessibility label for play', () => {
      const { getByLabelText } = render(<PlayButton {...defaultProps} testID="play-button" />);

      expect(getByLabelText('Play audio')).toBeTruthy();
    });

    it('has correct accessibility label for retry', () => {
      const { getByLabelText } = render(
        <PlayButton {...defaultProps} error="Failed" testID="play-button" />
      );

      expect(getByLabelText('Retry playback')).toBeTruthy();
    });

    it('has correct accessibility label for pause', () => {
      const { getByLabelText } = render(
        <PlayButton {...defaultProps} isPlaying testID="play-button" />
      );

      expect(getByLabelText('Pause audio')).toBeTruthy();
    });

    it('has button accessibility role', () => {
      const { getByRole } = render(<PlayButton {...defaultProps} testID="play-button" />);

      expect(getByRole('button')).toBeTruthy();
    });
  });
});
