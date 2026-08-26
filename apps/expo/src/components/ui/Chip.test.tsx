/**
 * Tests for Chip component
 * Story 4.3: Implement Discover Tab with Categories and Topics
 *
 * Verifies Chip rendering with default/selected states, size variants,
 * press interactions, and accessibility.
 */

import { fireEvent, render } from '@testing-library/react-native';
import { Chip } from './Chip';

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

describe('Chip', () => {
  describe('Default State', () => {
    it('renders label text correctly', () => {
      const { getByText } = render(<Chip label="Self-Help" />);
      expect(getByText('Self-Help')).toBeTruthy();
    });

    it('applies pill-shaped border radius', () => {
      const { getByTestId } = render(<Chip label="Test" testID="chip" />);
      const chip = getByTestId('chip');
      const style = chip.props.style;
      const flatStyle = Array.isArray(style)
        ? style.reduce((acc, s) => ({ ...acc, ...s }), {})
        : style;
      expect(flatStyle.borderRadius).toBe(999); // RADII.pill (re-scaled 9999→999, story 23.2)
    });

    it('uses default background color', () => {
      const { getByTestId } = render(<Chip label="Test" testID="chip" />);
      const chip = getByTestId('chip');
      const style = chip.props.style;
      const flatStyle = Array.isArray(style)
        ? style.reduce((acc, s) => ({ ...acc, ...s }), {})
        : style;
      expect(flatStyle.backgroundColor).toBe('#F5EFE9'); // secondary background
    });

    it('uses primary text color', () => {
      const { getByTestId } = render(<Chip label="Test" testID="chip" />);
      const text = getByTestId('chip-text');
      const style = text.props.style;
      const flatStyle = Array.isArray(style)
        ? style.reduce((acc, s) => ({ ...acc, ...s }), {})
        : style;
      expect(flatStyle.color).toBe('#1A1612'); // text.primary
    });
  });

  describe('Selected State', () => {
    it('applies accent background when selected', () => {
      const { getByTestId } = render(<Chip label="Test" isSelected testID="chip" />);
      const chip = getByTestId('chip');
      const style = chip.props.style;
      const flatStyle = Array.isArray(style)
        ? style.reduce((acc, s) => ({ ...acc, ...s }), {})
        : style;
      expect(flatStyle.backgroundColor).toBe('#C65D3B'); // accent.primary
    });

    it('applies onAccent text color when selected', () => {
      const { getByTestId } = render(<Chip label="Test" isSelected testID="chip" />);
      const text = getByTestId('chip-text');
      const style = text.props.style;
      const flatStyle = Array.isArray(style)
        ? style.reduce((acc, s) => ({ ...acc, ...s }), {})
        : style;
      expect(flatStyle.color).toBe('#FFFFFF'); // text.onAccent
    });

    it('maintains pill shape when selected', () => {
      const { getByTestId } = render(<Chip label="Test" isSelected testID="chip" />);
      const chip = getByTestId('chip');
      const style = chip.props.style;
      const flatStyle = Array.isArray(style)
        ? style.reduce((acc, s) => ({ ...acc, ...s }), {})
        : style;
      expect(flatStyle.borderRadius).toBe(999); // RADII.pill (re-scaled 9999→999, story 23.2)
    });
  });

  describe('Interaction', () => {
    it('calls onPress when pressed', () => {
      const onPress = jest.fn();
      const { getByTestId } = render(<Chip label="Test" onPress={onPress} testID="chip" />);
      fireEvent.press(getByTestId('chip'));
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('does not crash when pressed without onPress handler', () => {
      const { getByTestId } = render(<Chip label="Test" testID="chip" />);
      expect(() => fireEvent.press(getByTestId('chip'))).not.toThrow();
    });
  });

  describe('Size Variants', () => {
    it('renders small variant with correct padding', () => {
      const { getByTestId } = render(<Chip label="Test" size="small" testID="chip" />);
      const chip = getByTestId('chip');
      const style = chip.props.style;
      const flatStyle = Array.isArray(style)
        ? style.reduce((acc, s) => ({ ...acc, ...s }), {})
        : style;
      expect(flatStyle.paddingHorizontal).toBe(8); // SPACING.sm
      expect(flatStyle.paddingVertical).toBe(4); // SPACING.xs
    });

    it('renders medium variant with correct padding', () => {
      const { getByTestId } = render(<Chip label="Test" size="medium" testID="chip" />);
      const chip = getByTestId('chip');
      const style = chip.props.style;
      const flatStyle = Array.isArray(style)
        ? style.reduce((acc, s) => ({ ...acc, ...s }), {})
        : style;
      expect(flatStyle.paddingHorizontal).toBe(12); // SPACING.md
      expect(flatStyle.paddingVertical).toBe(8); // SPACING.sm
    });

    it('defaults to small when size not specified', () => {
      const { getByTestId } = render(<Chip label="Test" testID="chip" />);
      const chip = getByTestId('chip');
      const style = chip.props.style;
      const flatStyle = Array.isArray(style)
        ? style.reduce((acc, s) => ({ ...acc, ...s }), {})
        : style;
      expect(flatStyle.paddingHorizontal).toBe(8); // SPACING.sm
      expect(flatStyle.paddingVertical).toBe(4); // SPACING.xs
    });
  });

  describe('Accessibility', () => {
    it('has accessible role button', () => {
      const { getByTestId } = render(<Chip label="Test" testID="chip" />);
      const chip = getByTestId('chip');
      expect(chip.props.accessibilityRole).toBe('button');
    });

    it('has accessible label with chip text', () => {
      const { getByTestId } = render(<Chip label="Self-Help" testID="chip" />);
      const chip = getByTestId('chip');
      expect(chip.props.accessibilityLabel).toBe('Self-Help');
    });

    it('indicates selected state', () => {
      const { getByTestId } = render(<Chip label="Test" isSelected testID="chip" />);
      const chip = getByTestId('chip');
      expect(chip.props.accessibilityState).toEqual({ selected: true });
    });

    it('indicates unselected state', () => {
      const { getByTestId } = render(<Chip label="Test" isSelected={false} testID="chip" />);
      const chip = getByTestId('chip');
      expect(chip.props.accessibilityState).toEqual({ selected: false });
    });
  });

  describe('Custom Styling', () => {
    it('applies custom style prop', () => {
      const customStyle = { marginTop: 10 };
      const { getByTestId } = render(<Chip label="Test" style={customStyle} testID="chip" />);
      const chip = getByTestId('chip');
      const styles = chip.props.style;
      const flatStyle = Array.isArray(styles)
        ? styles.reduce((acc, s) => ({ ...acc, ...s }), {})
        : styles;
      expect(flatStyle.marginTop).toBe(10);
    });
  });
});
