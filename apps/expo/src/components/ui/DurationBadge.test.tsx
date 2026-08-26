/**
 * Tests for DurationBadge component
 * Story 4.2: Build DurationBadge Component
 *
 * Verifies DurationBadge rendering with duration text, lock icon,
 * selected state, size variants, and accessibility.
 */

import { render } from '@testing-library/react-native';
import { DurationBadge } from './DurationBadge';

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

describe('DurationBadge', () => {
  describe('Default State', () => {
    it('renders duration text correctly for 1min', () => {
      const { getByText } = render(<DurationBadge duration="1min" />);
      expect(getByText('1 min')).toBeTruthy();
    });

    it('renders duration text correctly for 5min', () => {
      const { getByText } = render(<DurationBadge duration="5min" />);
      expect(getByText('5 min')).toBeTruthy();
    });

    it('renders duration text correctly for 15min', () => {
      const { getByText } = render(<DurationBadge duration="15min" />);
      expect(getByText('15 min')).toBeTruthy();
    });

    it('applies pill-shaped border radius', () => {
      const { getByTestId } = render(<DurationBadge duration="1min" testID="duration-badge" />);

      const badge = getByTestId('duration-badge');
      const badgeStyle = badge.props.style;
      const flatStyle = Array.isArray(badgeStyle)
        ? badgeStyle.reduce((acc, style) => ({ ...acc, ...style }), {})
        : badgeStyle;
      expect(flatStyle.borderRadius).toBe(999); // RADII.pill (re-scaled 9999→999, story 23.2)
    });

    it('uses correct default background color', () => {
      const { getByTestId } = render(<DurationBadge duration="1min" testID="duration-badge" />);

      const badge = getByTestId('duration-badge');
      const badgeStyle = badge.props.style;
      const flatStyle = Array.isArray(badgeStyle)
        ? badgeStyle.reduce((acc, style) => ({ ...acc, ...style }), {})
        : badgeStyle;
      expect(flatStyle.backgroundColor).toBe('#EBE3DA'); // tertiary background
    });
  });

  describe('Locked State', () => {
    it('shows lock icon when isLocked is true', () => {
      const { getByTestId } = render(
        <DurationBadge duration="5min" isLocked testID="duration-badge" />
      );

      expect(getByTestId('duration-badge-lock-icon')).toBeTruthy();
    });

    it('hides lock icon when isLocked is false', () => {
      const { queryByTestId } = render(
        <DurationBadge duration="5min" isLocked={false} testID="duration-badge" />
      );

      expect(queryByTestId('duration-badge-lock-icon')).toBeNull();
    });

    it('hides lock icon when isLocked is not provided', () => {
      const { queryByTestId } = render(<DurationBadge duration="5min" testID="duration-badge" />);

      expect(queryByTestId('duration-badge-lock-icon')).toBeNull();
    });

    it('positions lock icon after text with correct gap', () => {
      const { getByTestId } = render(
        <DurationBadge duration="5min" isLocked testID="duration-badge" />
      );

      const icon = getByTestId('duration-badge-lock-icon');
      const iconStyle = icon.props.style;
      const flatStyle = Array.isArray(iconStyle)
        ? iconStyle.reduce((acc, style) => ({ ...acc, ...style }), {})
        : iconStyle;
      expect(flatStyle.marginLeft).toBe(4); // SPACING.xs
    });
  });

  describe('Selected State', () => {
    it('applies accent background when selected', () => {
      const { getByTestId } = render(
        <DurationBadge duration="1min" isSelected testID="duration-badge" />
      );

      const badge = getByTestId('duration-badge');
      const badgeStyle = badge.props.style;
      const flatStyle = Array.isArray(badgeStyle)
        ? badgeStyle.reduce((acc, style) => ({ ...acc, ...style }), {})
        : badgeStyle;
      expect(flatStyle.backgroundColor).toBe('#C65D3B'); // accent.primary
    });

    it('applies onAccent text color when selected', () => {
      const { getByTestId } = render(
        <DurationBadge duration="1min" isSelected testID="duration-badge" />
      );

      const text = getByTestId('duration-badge-text');
      const textStyle = text.props.style;
      const flatStyle = Array.isArray(textStyle)
        ? textStyle.reduce((acc, style) => ({ ...acc, ...style }), {})
        : textStyle;
      expect(flatStyle.color).toBe('#FFFFFF'); // text.onAccent
    });

    it('maintains pill shape when selected', () => {
      const { getByTestId } = render(
        <DurationBadge duration="1min" isSelected testID="duration-badge" />
      );

      const badge = getByTestId('duration-badge');
      const badgeStyle = badge.props.style;
      const flatStyle = Array.isArray(badgeStyle)
        ? badgeStyle.reduce((acc, style) => ({ ...acc, ...style }), {})
        : badgeStyle;
      expect(flatStyle.borderRadius).toBe(999); // RADII.pill (re-scaled 9999→999, story 23.2)
    });
  });

  describe('Size Variants', () => {
    it('renders small variant with correct padding', () => {
      const { getByTestId } = render(
        <DurationBadge duration="1min" size="small" testID="duration-badge" />
      );

      const badge = getByTestId('duration-badge');
      const badgeStyle = badge.props.style;
      const flatStyle = Array.isArray(badgeStyle)
        ? badgeStyle.reduce((acc, style) => ({ ...acc, ...style }), {})
        : badgeStyle;
      expect(flatStyle.paddingHorizontal).toBe(8); // SPACING.sm
      expect(flatStyle.paddingVertical).toBe(4); // SPACING.xs
    });

    it('renders medium variant with correct padding', () => {
      const { getByTestId } = render(
        <DurationBadge duration="1min" size="medium" testID="duration-badge" />
      );

      const badge = getByTestId('duration-badge');
      const badgeStyle = badge.props.style;
      const flatStyle = Array.isArray(badgeStyle)
        ? badgeStyle.reduce((acc, style) => ({ ...acc, ...style }), {})
        : badgeStyle;
      expect(flatStyle.paddingHorizontal).toBe(12); // SPACING.md
      expect(flatStyle.paddingVertical).toBe(6); // Custom 6px
    });

    it('defaults to small when size not specified', () => {
      const { getByTestId } = render(<DurationBadge duration="1min" testID="duration-badge" />);

      const badge = getByTestId('duration-badge');
      const badgeStyle = badge.props.style;
      const flatStyle = Array.isArray(badgeStyle)
        ? badgeStyle.reduce((acc, style) => ({ ...acc, ...style }), {})
        : badgeStyle;
      expect(flatStyle.paddingHorizontal).toBe(8); // SPACING.sm
      expect(flatStyle.paddingVertical).toBe(4); // SPACING.xs
    });

    it('uses correct font size for small variant', () => {
      const { getByTestId } = render(
        <DurationBadge duration="1min" size="small" testID="duration-badge" />
      );

      const text = getByTestId('duration-badge-text');
      const textStyle = text.props.style;
      const flatStyle = Array.isArray(textStyle)
        ? textStyle.reduce((acc, style) => ({ ...acc, ...style }), {})
        : textStyle;
      expect(flatStyle.fontSize).toBe(11); // FONT_SIZE.caption
    });

    it('uses correct font size for medium variant', () => {
      const { getByTestId } = render(
        <DurationBadge duration="1min" size="medium" testID="duration-badge" />
      );

      const text = getByTestId('duration-badge-text');
      const textStyle = text.props.style;
      const flatStyle = Array.isArray(textStyle)
        ? textStyle.reduce((acc, style) => ({ ...acc, ...style }), {})
        : textStyle;
      expect(flatStyle.fontSize).toBe(13); // FONT_SIZE.bodySmall
    });
  });

  describe('Accessibility', () => {
    it('has accessible label describing duration', () => {
      const { getByTestId } = render(<DurationBadge duration="5min" testID="duration-badge" />);

      const badge = getByTestId('duration-badge');
      expect(badge.props.accessibilityLabel).toBe('5 min summary');
    });

    it('includes locked status in accessible label when locked', () => {
      const { getByTestId } = render(
        <DurationBadge duration="5min" isLocked testID="duration-badge" />
      );

      const badge = getByTestId('duration-badge');
      expect(badge.props.accessibilityLabel).toBe('5 min summary, premium content');
    });

    it('has accessible role of text', () => {
      const { getByTestId } = render(<DurationBadge duration="1min" testID="duration-badge" />);

      const badge = getByTestId('duration-badge');
      expect(badge.props.accessibilityRole).toBe('text');
    });
  });

  describe('Custom Styling', () => {
    it('applies custom style prop', () => {
      const customStyle = { marginTop: 10 };
      const { getByTestId } = render(
        <DurationBadge duration="1min" style={customStyle} testID="duration-badge" />
      );

      const badge = getByTestId('duration-badge');
      const styles = badge.props.style;
      const flatStyle = Array.isArray(styles)
        ? styles.reduce((acc, style) => ({ ...acc, ...style }), {})
        : styles;
      expect(flatStyle.marginTop).toBe(10);
    });
  });
});
