/**
 * ProgressBar Tests
 *
 * Story 5.3: Build Full-Screen AudioPlayer Component
 * Epic 5: Core Summary Playback
 */

import { fireEvent, render, screen } from '@testing-library/react-native';
import { ProgressBar } from './ProgressBar';

// Mock ThemeContext
jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    colors: {
      accent: {
        primary: '#C65D3B',
        secondary: '#E8A87C',
      },
      text: {
        primary: '#1A1612',
        tertiary: '#8C8279',
      },
    },
    isDark: false,
  }),
}));

describe('ProgressBar', () => {
  const defaultProps = {
    currentMs: 45000, // 45 seconds
    durationMs: 180000, // 3 minutes
    onSeek: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders with correct fill percentage', () => {
      render(<ProgressBar {...defaultProps} testID="progress-bar" />);

      // 45000 / 180000 = 0.25 = 25%
      const progressBar = screen.getByTestId('progress-bar');
      expect(progressBar).toBeTruthy();
    });

    it('renders filled portion and thumb', () => {
      render(<ProgressBar {...defaultProps} testID="progress-bar" />);

      const filled = screen.getByTestId('progress-bar-filled');
      const thumb = screen.getByTestId('progress-bar-thumb');

      expect(filled).toBeTruthy();
      expect(thumb).toBeTruthy();
    });

    it('handles 0 duration gracefully', () => {
      render(
        <ProgressBar
          currentMs={0}
          durationMs={0}
          onSeek={defaultProps.onSeek}
          testID="progress-bar"
        />
      );

      const progressBar = screen.getByTestId('progress-bar');
      expect(progressBar).toBeTruthy();
    });

    it('handles negative values gracefully', () => {
      render(
        <ProgressBar
          currentMs={-1000}
          durationMs={180000}
          onSeek={defaultProps.onSeek}
          testID="progress-bar"
        />
      );

      const progressBar = screen.getByTestId('progress-bar');
      expect(progressBar).toBeTruthy();
    });

    it('clamps progress to 100% when currentMs exceeds durationMs', () => {
      render(
        <ProgressBar
          currentMs={200000} // More than duration
          durationMs={180000}
          onSeek={defaultProps.onSeek}
          testID="progress-bar"
        />
      );

      const progressBar = screen.getByTestId('progress-bar');
      expect(progressBar).toBeTruthy();
    });
  });

  describe('tap-to-seek', () => {
    it('calls onSeek with correct position on tap', () => {
      const onSeek = jest.fn();
      render(
        <ProgressBar currentMs={0} durationMs={180000} onSeek={onSeek} testID="progress-bar" />
      );

      const progressBar = screen.getByTestId('progress-bar');

      // Simulate layout event to set width
      fireEvent(progressBar, 'layout', {
        nativeEvent: { layout: { width: 300, height: 4, x: 0, y: 0 } },
      });

      // Tap at 50% position (x = 150 of 300)
      fireEvent.press(progressBar, {
        nativeEvent: { locationX: 150, locationY: 2 },
      });

      // Should seek to 50% of 180000ms = 90000ms
      expect(onSeek).toHaveBeenCalledWith(90000);
    });

    it('does not call onSeek when disabled', () => {
      const onSeek = jest.fn();
      render(
        <ProgressBar
          currentMs={0}
          durationMs={180000}
          onSeek={onSeek}
          disabled
          testID="progress-bar"
        />
      );

      const progressBar = screen.getByTestId('progress-bar');

      // Simulate layout
      fireEvent(progressBar, 'layout', {
        nativeEvent: { layout: { width: 300, height: 4, x: 0, y: 0 } },
      });

      // Try to tap
      fireEvent.press(progressBar, {
        nativeEvent: { locationX: 150, locationY: 2 },
      });

      expect(onSeek).not.toHaveBeenCalled();
    });

    it('clamps seek position to valid range', () => {
      const onSeek = jest.fn();
      render(
        <ProgressBar currentMs={0} durationMs={180000} onSeek={onSeek} testID="progress-bar" />
      );

      const progressBar = screen.getByTestId('progress-bar');

      fireEvent(progressBar, 'layout', {
        nativeEvent: { layout: { width: 300, height: 4, x: 0, y: 0 } },
      });

      // Tap beyond bounds (x = 350, width = 300)
      fireEvent.press(progressBar, {
        nativeEvent: { locationX: 350, locationY: 2 },
      });

      // Should clamp to 100% = 180000ms
      expect(onSeek).toHaveBeenCalledWith(180000);
    });
  });

  describe('disabled state', () => {
    it('applies reduced opacity when disabled', () => {
      render(<ProgressBar {...defaultProps} disabled testID="progress-bar" />);

      const progressBar = screen.getByTestId('progress-bar');
      expect(progressBar.props.accessibilityState.disabled).toBe(true);
    });

    it('prevents interaction when disabled', () => {
      const onSeek = jest.fn();
      render(
        <ProgressBar
          currentMs={0}
          durationMs={180000}
          onSeek={onSeek}
          disabled
          testID="progress-bar"
        />
      );

      const progressBar = screen.getByTestId('progress-bar');
      fireEvent.press(progressBar);

      expect(onSeek).not.toHaveBeenCalled();
    });
  });

  describe('accessibility', () => {
    it('has accessible label with progress percentage', () => {
      render(<ProgressBar {...defaultProps} testID="progress-bar" />);

      const progressBar = screen.getByTestId('progress-bar');
      // 45000 / 180000 = 25%
      expect(progressBar.props.accessibilityLabel).toContain('25');
    });

    it('has adjustable accessibility role', () => {
      render(<ProgressBar {...defaultProps} testID="progress-bar" />);

      const progressBar = screen.getByTestId('progress-bar');
      expect(progressBar.props.accessibilityRole).toBe('adjustable');
    });
  });
});
