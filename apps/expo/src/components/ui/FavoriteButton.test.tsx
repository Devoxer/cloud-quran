/**
 * FavoriteButton tests (Story 30.1) — renders the correct heart icon, toggles + haptic on press,
 * and exposes the right a11y label per state.
 */
import { fireEvent, render } from '@testing-library/react-native';
import { FavoriteButton } from './FavoriteButton';

const mockedImpact = jest.fn();
jest.mock('@/lib/haptics', () => ({
  haptics: { impact: (...a: unknown[]) => mockedImpact(...a) },
}));

jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    colors: {
      accent: { primary: '#C65D3B' },
      text: { primary: '#111', secondary: '#555' },
    },
  }),
}));

// Icon renders its `name` as text so we can assert fill vs outline without SF/Material.
jest.mock('./Icon', () => ({
  Icon: ({ name }: { name: string }) => {
    const { Text } = require('react-native');
    return <Text>{name}</Text>;
  },
}));

describe('FavoriteButton', () => {
  beforeEach(() => mockedImpact.mockClear());

  it('renders the outline heart when not favorited', () => {
    const { getByText } = render(<FavoriteButton favorited={false} onToggle={jest.fn()} />);
    expect(getByText('heart-outline')).toBeTruthy();
  });

  it('renders the filled heart when favorited', () => {
    const { getByText } = render(<FavoriteButton favorited onToggle={jest.fn()} />);
    expect(getByText('heart')).toBeTruthy();
  });

  it('fires the haptic and onToggle on press', () => {
    const onToggle = jest.fn();
    const { getByTestId } = render(
      <FavoriteButton favorited={false} onToggle={onToggle} testID="fav" />
    );
    fireEvent.press(getByTestId('fav'));
    expect(mockedImpact).toHaveBeenCalledWith('light');
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('exposes an add/remove a11y label per state', () => {
    const { getByTestId, rerender } = render(
      <FavoriteButton favorited={false} onToggle={jest.fn()} testID="fav" />
    );
    expect(getByTestId('fav').props.accessibilityLabel).toBe('Add to favorites');
    rerender(<FavoriteButton favorited onToggle={jest.fn()} testID="fav" />);
    expect(getByTestId('fav').props.accessibilityLabel).toBe('Remove from favorites');
  });
});
