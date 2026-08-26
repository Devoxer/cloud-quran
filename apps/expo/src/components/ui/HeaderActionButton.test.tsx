/**
 * HeaderActionButton render-smoke (Story 17.4.2 Thread A, AC-3).
 *
 * HeaderActionButton is the single source of truth for every native Stack
 * header action (Discover search, book-detail, collection, player overflow,
 * filters route, History clear-all). AC-3 requires the header actions still
 * render with their testIDs and preserve their handlers; this guards the
 * centralized primitive directly so a regression in it can't silently break
 * every header at once.
 */
import { fireEvent, render } from '@testing-library/react-native';
import { HeaderActionButton } from './HeaderActionButton';

describe('HeaderActionButton', () => {
  it('renders, forwards testID, and exposes its accessibility label + role', () => {
    const { getByTestId, getByLabelText } = render(
      <HeaderActionButton
        name="search"
        onPress={() => {}}
        accessibilityLabel="Search"
        testID="header-search"
      />
    );
    const button = getByTestId('header-search');
    expect(button).toBeTruthy();
    expect(getByLabelText('Search')).toBeTruthy();
    expect(button.props.accessibilityRole).toBe('button');
  });

  it('fires onPress when tapped', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(
      <HeaderActionButton
        name="filter"
        onPress={onPress}
        accessibilityLabel="Filter"
        testID="header-filter"
      />
    );
    fireEvent.press(getByTestId('header-filter'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire onPress and marks itself disabled when disabled', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(
      <HeaderActionButton
        name="trash-outline"
        onPress={onPress}
        disabled
        accessibilityLabel="Clear all"
        testID="header-clear"
      />
    );
    const button = getByTestId('header-clear');
    fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
    expect(button.props.accessibilityState).toEqual({ disabled: true });
  });
});
