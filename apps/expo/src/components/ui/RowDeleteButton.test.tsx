/**
 * RowDeleteButton tests (Story 23.13) — the shared neutral in-row delete `×`.
 *
 * Verifies the affordance renders the plain `close` glyph in the neutral
 * text.secondary color (NOT red, NOT the filled close-circle / trash), fires
 * onPress, and exposes the required a11y label + button role + testID.
 */

import { fireEvent, render, screen } from '@testing-library/react-native';
import { Icon } from '@/components/ui/Icon';
import { RowDeleteButton } from './RowDeleteButton';

// Real dark palette so the color assertions can't drift from the token source.
const darkColors = jest.requireActual('@/constants/Colors').default.dark;

jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    colors: jest.requireActual('@/constants/Colors').default.dark,
    isDark: true,
  }),
}));

// Query the central <Icon> by its semantic name prop (same pattern as the screen tests).
const iconsNamed = (name: string) =>
  screen.UNSAFE_queryAllByType(Icon).filter((n) => n.props.name === name);

describe('RowDeleteButton', () => {
  it('renders the plain `close` glyph (not the filled close-circle or a trash can)', () => {
    render(
      <RowDeleteButton onPress={jest.fn()} accessibilityLabel="Remove X" testID="row-delete" />
    );

    expect(iconsNamed('close')).toHaveLength(1);
    expect(iconsNamed('close-circle')).toHaveLength(0);
    expect(iconsNamed('trash-outline')).toHaveLength(0);
  });

  it('renders the glyph in the neutral text.secondary color (no red)', () => {
    render(
      <RowDeleteButton onPress={jest.fn()} accessibilityLabel="Remove X" testID="row-delete" />
    );

    const icon = iconsNamed('close')[0];
    expect(icon.props.color).toBe(darkColors.text.secondary);
    expect(icon.props.color).not.toBe(darkColors.semantic.error);
  });

  it('fires onPress when tapped', () => {
    const onPress = jest.fn();
    render(<RowDeleteButton onPress={onPress} accessibilityLabel="Remove X" testID="row-delete" />);

    fireEvent.press(screen.getByTestId('row-delete'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('exposes the required a11y label + button role and forwards testID', () => {
    render(
      <RowDeleteButton
        onPress={jest.fn()}
        accessibilityLabel="Remove Atomic Habits from history"
        testID="row-delete"
      />
    );

    const button = screen.getByTestId('row-delete');
    expect(button.props.accessibilityLabel).toBe('Remove Atomic Habits from history');
    expect(button.props.accessibilityRole).toBe('button');
  });

  it('defaults the glyph size to 18 and honors a custom size', () => {
    const { rerender } = render(
      <RowDeleteButton onPress={jest.fn()} accessibilityLabel="Remove X" testID="row-delete" />
    );
    expect(iconsNamed('close')[0].props.size).toBe(18);

    rerender(
      <RowDeleteButton
        onPress={jest.fn()}
        accessibilityLabel="Remove X"
        size={30}
        testID="row-delete"
      />
    );
    expect(iconsNamed('close')[0].props.size).toBe(30);
  });
});
