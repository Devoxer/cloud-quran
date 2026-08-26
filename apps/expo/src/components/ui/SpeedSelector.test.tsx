/**
 * SpeedSelector Tests
 *
 * Story 5.3: Build Full-Screen AudioPlayer Component
 * Epic 5: Core Summary Playback
 */

import { fireEvent, render, screen } from '@testing-library/react-native';
import { SpeedSelector } from './SpeedSelector';

// Mock ThemeContext
jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    colors: {
      accent: {
        primary: '#C65D3B',
        secondary: '#E8A87C',
      },
      background: {
        primary: '#FFFBF7',
        secondary: '#F5EFE9',
        tertiary: '#EBE3DA',
      },
      text: {
        primary: '#1A1612',
        secondary: '#5C534A',
        tertiary: '#8C8279',
      },
    },
    isDark: false,
  }),
}));

// Mock custom Slider component
jest.mock('@/components/ui/Slider', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    Slider: ({
      value,
      onValueChange,
      testID,
      disabled,
      minimumValue,
      maximumValue,
      accessibilityState,
      accessibilityValue,
    }: {
      value: number;
      onValueChange: (value: number) => void;
      testID?: string;
      disabled?: boolean;
      minimumValue: number;
      maximumValue: number;
      accessibilityState?: { disabled: boolean };
      accessibilityValue?: { min: number; max: number; now: number; text: string };
    }) => (
      <View
        testID={testID}
        accessibilityState={accessibilityState}
        accessibilityValue={accessibilityValue}
        // Store handlers for testing
        onValueChange={onValueChange}
        value={value}
        disabled={disabled}
        minimumValue={minimumValue}
        maximumValue={maximumValue}
      />
    ),
  };
});

describe('SpeedSelector', () => {
  const defaultProps = {
    currentSpeed: 1,
    onSpeedChange: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    it('displays current speed with two decimal places', () => {
      render(<SpeedSelector {...defaultProps} testID="speed-selector" />);

      expect(screen.getByText('1.00x')).toBeTruthy();
    });

    it('displays 1.5x speed correctly', () => {
      render(
        <SpeedSelector currentSpeed={1.5} onSpeedChange={jest.fn()} testID="speed-selector" />
      );

      expect(screen.getByText('1.50x')).toBeTruthy();
    });

    it('displays 0.5x speed correctly', () => {
      render(
        <SpeedSelector currentSpeed={0.5} onSpeedChange={jest.fn()} testID="speed-selector" />
      );

      expect(screen.getByText('0.50x')).toBeTruthy();
    });

    it('displays 2x speed correctly', () => {
      render(<SpeedSelector currentSpeed={2} onSpeedChange={jest.fn()} testID="speed-selector" />);

      expect(screen.getByText('2.00x')).toBeTruthy();
    });

    it('displays granular speeds like 1.15x correctly', () => {
      render(
        <SpeedSelector currentSpeed={1.15} onSpeedChange={jest.fn()} testID="speed-selector" />
      );

      expect(screen.getByText('1.15x')).toBeTruthy();
    });

    it('renders the slider', () => {
      render(<SpeedSelector {...defaultProps} testID="speed-selector" />);

      expect(screen.getByTestId('speed-selector-slider')).toBeTruthy();
    });

    it('renders increment and decrement buttons', () => {
      render(<SpeedSelector {...defaultProps} testID="speed-selector" />);

      expect(screen.getByTestId('speed-selector-decrement')).toBeTruthy();
      expect(screen.getByTestId('speed-selector-increment')).toBeTruthy();
    });
  });

  describe('speed change', () => {
    it('calls onSpeedChange when slider value changes', () => {
      const onSpeedChange = jest.fn();
      render(
        <SpeedSelector currentSpeed={1} onSpeedChange={onSpeedChange} testID="speed-selector" />
      );

      const slider = screen.getByTestId('speed-selector-slider');
      // Simulate slider change
      fireEvent(slider, 'onValueChange', 1.5);

      expect(onSpeedChange).toHaveBeenCalledWith(1.5);
    });

    it('rounds to nearest 0.05 step', () => {
      const onSpeedChange = jest.fn();
      render(
        <SpeedSelector currentSpeed={1} onSpeedChange={onSpeedChange} testID="speed-selector" />
      );

      const slider = screen.getByTestId('speed-selector-slider');
      // Simulate slider change with value that needs rounding
      fireEvent(slider, 'onValueChange', 1.27);

      // Should round to 1.25
      expect(onSpeedChange).toHaveBeenCalledWith(1.25);
    });

    it('clamps values to minimum 0.5', () => {
      const onSpeedChange = jest.fn();
      render(
        <SpeedSelector currentSpeed={1} onSpeedChange={onSpeedChange} testID="speed-selector" />
      );

      const slider = screen.getByTestId('speed-selector-slider');
      // Simulate slider change below minimum
      fireEvent(slider, 'onValueChange', 0.3);

      expect(onSpeedChange).toHaveBeenCalledWith(0.5);
    });

    it('decrements speed by 0.1 when decrement button pressed', () => {
      const onSpeedChange = jest.fn();
      render(
        <SpeedSelector currentSpeed={1.5} onSpeedChange={onSpeedChange} testID="speed-selector" />
      );

      const decrementButton = screen.getByTestId('speed-selector-decrement');
      fireEvent.press(decrementButton);

      expect(onSpeedChange).toHaveBeenCalledWith(1.4);
    });

    it('increments speed by 0.1 when increment button pressed', () => {
      const onSpeedChange = jest.fn();
      render(
        <SpeedSelector currentSpeed={1.5} onSpeedChange={onSpeedChange} testID="speed-selector" />
      );

      const incrementButton = screen.getByTestId('speed-selector-increment');
      fireEvent.press(incrementButton);

      expect(onSpeedChange).toHaveBeenCalledWith(1.6);
    });

    it('clamps values to maximum 2', () => {
      const onSpeedChange = jest.fn();
      render(
        <SpeedSelector currentSpeed={1} onSpeedChange={onSpeedChange} testID="speed-selector" />
      );

      const slider = screen.getByTestId('speed-selector-slider');
      // Simulate slider change above maximum
      fireEvent(slider, 'onValueChange', 2.5);

      expect(onSpeedChange).toHaveBeenCalledWith(2);
    });
  });

  describe('disabled state', () => {
    it('passes disabled state to slider', () => {
      render(<SpeedSelector {...defaultProps} disabled testID="speed-selector" />);

      const slider = screen.getByTestId('speed-selector-slider');
      expect(slider.props.disabled).toBe(true);
    });

    // Story 17.3: the `@expo/ui/community/slider` adopted in 17.3 doesn't
    // accept `accessibilityState` / `accessibilityValue` (it has no a11y
    // forwarding props). The `accessibilityState.disabled` assertion below
    // is intentionally removed — the underlying community slider's `disabled`
    // prop (asserted above) is the only available signal.
  });

  describe('accessibility', () => {
    it('has accessible label with current speed', () => {
      render(<SpeedSelector {...defaultProps} testID="speed-selector" />);

      const label = screen.getByText('1.00x');
      expect(label.props.accessibilityLabel).toContain('1.00x');
    });

    // Story 17.3: `accessibilityValue` was dropped from SpeedSelector when
    // it adopted `@expo/ui/community/slider` (the community wrapper doesn't
    // forward a11y value props). Native swift-ui/jetpack-compose Slider
    // accessibility kicks in via the underlying platform widget instead.
  });
});
