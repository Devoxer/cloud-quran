/**
 * SearchEntryButton render-smoke (Story 23.18, AC-18).
 *
 * The fake-search-bar trigger on Discover home: looks like the SearchBar input
 * but is a button that pushes the `/search` route. Guards the presentational
 * primitive directly (renders placeholder, fires onPress, exposes a11y).
 */
import { fireEvent, render } from '@testing-library/react-native';
import { SearchEntryButton } from './SearchEntryButton';

jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    colors: jest.requireActual('@/constants/Colors').default.light,
    isDark: false,
  }),
}));

jest.mock('@/components/ui/Themed', () => ({
  Text: jest.requireActual('react-native').Text,
  View: jest.requireActual('react-native').View,
}));

describe('SearchEntryButton', () => {
  it('renders the placeholder and exposes button role + label', () => {
    const { getByTestId, getByText, getByLabelText } = render(
      <SearchEntryButton
        placeholder="Search books, authors"
        onPress={() => {}}
        testID="search-entry"
      />
    );
    const button = getByTestId('search-entry');
    expect(button).toBeTruthy();
    expect(button.props.accessibilityRole).toBe('button');
    expect(getByText('Search books, authors')).toBeTruthy();
    expect(getByLabelText('Search')).toBeTruthy();
  });

  it('fires onPress when tapped', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(
      <SearchEntryButton placeholder="Search" onPress={onPress} testID="search-entry" />
    );
    fireEvent.press(getByTestId('search-entry'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
