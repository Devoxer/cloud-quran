/**
 * Tests for ListRow primitive (Story 23.4)
 *
 * RNTL render-smoke: title (+ `-title` testID), subtitle (+ `-subtitle`, absent
 * when omitted), leading/trailing ReactNodes, onPress + role=button,
 * accessibilityLabel default/override, titleNumberOfLines passthrough, the
 * internal showDivider hairline. Mocks useTheme with the FULL real dark palette
 * so the eager `useThemedStyles` factory never reads an undefined token
 * (STACK-CHEAT-SHEET § Theme).
 */

import { fireEvent, render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { ListRow } from './ListRow';

jest.mock('@/lib/theme', () => {
  const Colors = jest.requireActual('@/constants/Colors').default;
  return {
    setThemeMode: jest.fn(),
    useTheme: () => ({
      colorScheme: 'dark',
      isDark: true,
      themeMode: 'auto',
      setThemeMode: jest.fn(),
      colors: Colors.dark,
    }),
  };
});

const flatten = (style: unknown) =>
  Array.isArray(style)
    ? style.reduce((acc: Record<string, unknown>, s) => ({ ...acc, ...(s || {}) }), {})
    : ((style || {}) as Record<string, unknown>);

describe('ListRow', () => {
  it('renders the title with a `-title` testID', () => {
    const { getByText, getByTestId } = render(<ListRow title="My note" testID="row" />);
    expect(getByText('My note')).toBeTruthy();
    expect(getByTestId('row-title')).toBeTruthy();
  });

  it('renders the subtitle with a `-subtitle` testID', () => {
    const { getByText, getByTestId } = render(
      <ListRow title="My note" subtitle="2 hours ago" testID="row" />
    );
    expect(getByText('2 hours ago')).toBeTruthy();
    expect(getByTestId('row-subtitle')).toBeTruthy();
  });

  it('omits the subtitle node when subtitle is not provided', () => {
    const { queryByTestId } = render(<ListRow title="My note" testID="row" />);
    expect(queryByTestId('row-subtitle')).toBeNull();
  });

  it('renders leading and trailing ReactNodes', () => {
    const { getByTestId } = render(
      <ListRow
        title="My note"
        leading={<Text testID="lead">L</Text>}
        trailing={<Text testID="trail">T</Text>}
        testID="row"
      />
    );
    expect(getByTestId('lead')).toBeTruthy();
    expect(getByTestId('trail')).toBeTruthy();
  });

  it('fires onPress and exposes role=button when onPress is set', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(<ListRow title="My note" onPress={onPress} testID="row" />);
    const row = getByTestId('row');
    expect(row.props.accessibilityRole).toBe('button');
    fireEvent.press(row);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('has no role when not pressable', () => {
    const { getByTestId } = render(<ListRow title="My note" testID="row" />);
    expect(getByTestId('row').props.accessibilityRole).toBeUndefined();
  });

  it('defaults accessibilityLabel to the title, and honors an override', () => {
    const { getByTestId, rerender } = render(
      <ListRow title="My note" onPress={() => {}} testID="row" />
    );
    expect(getByTestId('row').props.accessibilityLabel).toBe('My note');

    rerender(
      <ListRow title="My note" onPress={() => {}} accessibilityLabel="Edit note" testID="row" />
    );
    expect(getByTestId('row').props.accessibilityLabel).toBe('Edit note');
  });

  it('applies the regular title weight when titleWeight="regular"', () => {
    const { getByTestId, rerender } = render(<ListRow title="My note" testID="row" />);
    const semiboldStyle = flatten(getByTestId('row-title').props.style);
    expect(semiboldStyle.fontWeight).toBe('600');

    rerender(<ListRow title="My note" titleWeight="regular" testID="row" />);
    const regularStyle = flatten(getByTestId('row-title').props.style);
    expect(regularStyle.fontWeight).toBe('400');
  });

  it('passes titleNumberOfLines through (default 1, override honored)', () => {
    const { getByTestId, rerender } = render(<ListRow title="My note" testID="row" />);
    expect(getByTestId('row-title').props.numberOfLines).toBe(1);

    rerender(<ListRow title="My note" titleNumberOfLines={2} testID="row" />);
    expect(getByTestId('row-title').props.numberOfLines).toBe(2);
  });

  describe('divider', () => {
    it('draws a 1px hairline (inset 16) above the row when showDivider is set', () => {
      const { getByTestId } = render(<ListRow title="My note" showDivider testID="row" />);
      const dividerStyle = flatten(getByTestId('row-divider').props.style);
      expect(dividerStyle.height).toBe(1);
      expect(dividerStyle.marginLeft).toBe(16);
    });

    it('omits the divider when showDivider is false', () => {
      const { queryByTestId } = render(<ListRow title="My note" testID="row" />);
      expect(queryByTestId('row-divider')).toBeNull();
    });
  });
});
