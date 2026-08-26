/**
 * Tests for SearchBar component
 * Story 4.4: Implement Book Search
 *
 * Verifies SearchBar rendering, interactions, and accessibility.
 */

import { fireEvent, render } from '@testing-library/react-native';
import { SearchBar } from './SearchBar';

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

// Mock Themed components
jest.mock('@/components/ui/Themed', () => ({
  Text: ({ children, style, ...props }: { children: React.ReactNode; style?: object }) => {
    const { Text } = require('react-native');
    return (
      <Text style={style} {...props}>
        {children}
      </Text>
    );
  },
  View: ({ children, style, ...props }: { children: React.ReactNode; style?: object }) => {
    const { View } = require('react-native');
    return (
      <View style={style} {...props}>
        {children}
      </View>
    );
  },
}));

describe('SearchBar', () => {
  const defaultProps = {
    value: '',
    onChangeText: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders without crashing', () => {
      const { getByTestId } = render(<SearchBar {...defaultProps} testID="search-bar" />);
      expect(getByTestId('search-bar')).toBeTruthy();
    });

    it('renders text input with placeholder', () => {
      const { getByTestId } = render(
        <SearchBar {...defaultProps} testID="search-bar" placeholder="Find books..." />
      );
      const input = getByTestId('search-bar-input');
      expect(input.props.placeholder).toBe('Find books...');
    });

    it('renders default placeholder when not provided', () => {
      const { getByTestId } = render(<SearchBar {...defaultProps} testID="search-bar" />);
      const input = getByTestId('search-bar-input');
      expect(input.props.placeholder).toBe('Search books...');
    });

    it('renders cancel button when onCancel is provided', () => {
      const { getByTestId } = render(
        <SearchBar {...defaultProps} onCancel={jest.fn()} testID="search-bar" />
      );
      expect(getByTestId('search-bar-cancel-button')).toBeTruthy();
    });

    it('hides the cancel button when onCancel is omitted (Story 23.18 sticky fields)', () => {
      // Sticky search fields (/search, /filters search-within, notes) dismiss via
      // the native back chevron / clear ✕, not a Cancel button — so they pass no
      // onCancel and the Cancel affordance must not render.
      const { queryByTestId } = render(<SearchBar {...defaultProps} testID="search-bar" />);
      expect(queryByTestId('search-bar-cancel-button')).toBeNull();
    });

    it('hides clear button when empty', () => {
      const { queryByTestId } = render(
        <SearchBar {...defaultProps} value="" testID="search-bar" />
      );
      expect(queryByTestId('search-bar-clear-button')).toBeNull();
    });

    it('shows clear button when has text', () => {
      const { getByTestId } = render(
        <SearchBar {...defaultProps} value="atomic" testID="search-bar" />
      );
      expect(getByTestId('search-bar-clear-button')).toBeTruthy();
    });

    it('displays current value in input', () => {
      const { getByTestId } = render(
        <SearchBar {...defaultProps} value="atomic habits" testID="search-bar" />
      );
      const input = getByTestId('search-bar-input');
      expect(input.props.value).toBe('atomic habits');
    });
  });

  describe('Interaction', () => {
    it('calls onChangeText when typing', () => {
      const onChangeText = jest.fn();
      const { getByTestId } = render(
        <SearchBar {...defaultProps} onChangeText={onChangeText} testID="search-bar" />
      );

      fireEvent.changeText(getByTestId('search-bar-input'), 'atomic');
      expect(onChangeText).toHaveBeenCalledWith('atomic');
    });

    it('calls onClear when clear pressed', () => {
      const onClear = jest.fn();
      const onChangeText = jest.fn();
      const { getByTestId } = render(
        <SearchBar
          {...defaultProps}
          value="atomic"
          onChangeText={onChangeText}
          onClear={onClear}
          testID="search-bar"
        />
      );

      fireEvent.press(getByTestId('search-bar-clear-button'));
      expect(onChangeText).toHaveBeenCalledWith('');
      expect(onClear).toHaveBeenCalledTimes(1);
    });

    it('calls onCancel when cancel pressed', () => {
      const onCancel = jest.fn();
      const { getByTestId } = render(
        <SearchBar {...defaultProps} onCancel={onCancel} testID="search-bar" />
      );

      fireEvent.press(getByTestId('search-bar-cancel-button'));
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('calls onSubmit on keyboard submit', () => {
      const onSubmit = jest.fn();
      const { getByTestId } = render(
        <SearchBar {...defaultProps} onSubmit={onSubmit} testID="search-bar" />
      );

      fireEvent(getByTestId('search-bar-input'), 'submitEditing');
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it('does not crash when onClear not provided', () => {
      const onChangeText = jest.fn();
      const { getByTestId } = render(
        <SearchBar
          {...defaultProps}
          value="atomic"
          onChangeText={onChangeText}
          testID="search-bar"
        />
      );

      expect(() => {
        fireEvent.press(getByTestId('search-bar-clear-button'));
      }).not.toThrow();
    });

    it('does not render the cancel button when onCancel not provided', () => {
      const { queryByTestId } = render(<SearchBar {...defaultProps} testID="search-bar" />);
      expect(queryByTestId('search-bar-cancel-button')).toBeNull();
    });

    it('does not crash when onSubmit not provided', () => {
      const { getByTestId } = render(<SearchBar {...defaultProps} testID="search-bar" />);

      expect(() => {
        fireEvent(getByTestId('search-bar-input'), 'submitEditing');
      }).not.toThrow();
    });
  });

  describe('Input Configuration', () => {
    it('has search return key type', () => {
      const { getByTestId } = render(<SearchBar {...defaultProps} testID="search-bar" />);
      const input = getByTestId('search-bar-input');
      expect(input.props.returnKeyType).toBe('search');
    });

    it('has autocapitalize none', () => {
      const { getByTestId } = render(<SearchBar {...defaultProps} testID="search-bar" />);
      const input = getByTestId('search-bar-input');
      expect(input.props.autoCapitalize).toBe('none');
    });

    it('has autocorrect disabled', () => {
      const { getByTestId } = render(<SearchBar {...defaultProps} testID="search-bar" />);
      const input = getByTestId('search-bar-input');
      expect(input.props.autoCorrect).toBe(false);
    });
  });

  describe('Accessibility', () => {
    it('has accessible search input role', () => {
      const { getByTestId } = render(<SearchBar {...defaultProps} testID="search-bar" />);
      const input = getByTestId('search-bar-input');
      expect(input.props.accessibilityRole).toBe('search');
    });

    it('has accessible label for search input', () => {
      const { getByTestId } = render(<SearchBar {...defaultProps} testID="search-bar" />);
      const input = getByTestId('search-bar-input');
      expect(input.props.accessibilityLabel).toBe('Search input');
    });

    it('has accessible label for clear button', () => {
      const { getByTestId } = render(
        <SearchBar {...defaultProps} value="test" testID="search-bar" />
      );
      const clearButton = getByTestId('search-bar-clear-button');
      expect(clearButton.props.accessibilityLabel).toBe('Clear search');
    });

    it('has accessible label for cancel button', () => {
      const { getByTestId } = render(
        <SearchBar {...defaultProps} onCancel={jest.fn()} testID="search-bar" />
      );
      const cancelButton = getByTestId('search-bar-cancel-button');
      expect(cancelButton.props.accessibilityLabel).toBe('Cancel search');
    });

    it('has button role for clear button', () => {
      const { getByTestId } = render(
        <SearchBar {...defaultProps} value="test" testID="search-bar" />
      );
      const clearButton = getByTestId('search-bar-clear-button');
      expect(clearButton.props.accessibilityRole).toBe('button');
    });

    it('has button role for cancel button', () => {
      const { getByTestId } = render(
        <SearchBar {...defaultProps} onCancel={jest.fn()} testID="search-bar" />
      );
      const cancelButton = getByTestId('search-bar-cancel-button');
      expect(cancelButton.props.accessibilityRole).toBe('button');
    });
  });

  describe('Styling', () => {
    it('applies custom style prop', () => {
      const customStyle = { marginTop: 20 };
      const { getByTestId } = render(
        <SearchBar {...defaultProps} style={customStyle} testID="search-bar" />
      );
      const container = getByTestId('search-bar');
      const styles = container.props.style;
      const flatStyle = Array.isArray(styles)
        ? styles.reduce((acc: object, s: object) => ({ ...acc, ...s }), {})
        : styles;
      expect(flatStyle.marginTop).toBe(20);
    });
  });
});
