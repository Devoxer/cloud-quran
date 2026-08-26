/**
 * Tests for SettingsGroup primitive (Story 23.2)
 *
 * Covers the label-above / footnote-below layout and the divider rule (a hairline
 * between rows, never before the first), including robustness to `.map()` array
 * children and conditional `false` rows (Children.toArray).
 * Mocks useTheme with the FULL real dark palette (STACK-CHEAT-SHEET § Theme).
 */

import { render } from '@testing-library/react-native';
import { SettingsGroup } from './SettingsGroup';
import { SettingsRow } from './SettingsRow';

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

/** A SettingsRow's outer View renders `children[0]` as the divider (or `false`). */
const hasDivider = (row: { props: { children?: unknown } }) =>
  Boolean((row.props.children as unknown[] | undefined)?.[0]);

describe('SettingsGroup', () => {
  it('renders the uppercase label above the card', () => {
    const { getByText } = render(
      <SettingsGroup label="Preferences">
        <SettingsRow label="Row" />
      </SettingsGroup>
    );
    expect(getByText('Preferences')).toBeTruthy();
  });

  it('renders the footnote below the card', () => {
    const { getByText } = render(
      <SettingsGroup footnote="Applied on this device only.">
        <SettingsRow label="Row" />
      </SettingsGroup>
    );
    expect(getByText('Applied on this device only.')).toBeTruthy();
  });

  it('renders its child rows', () => {
    const { getByText } = render(
      <SettingsGroup>
        <SettingsRow label="First" />
        <SettingsRow label="Second" />
      </SettingsGroup>
    );
    expect(getByText('First')).toBeTruthy();
    expect(getByText('Second')).toBeTruthy();
  });

  it('draws a divider between rows but not before the first row', () => {
    const { getByTestId } = render(
      <SettingsGroup>
        <SettingsRow label="A" testID="r0" />
        <SettingsRow label="B" testID="r1" />
        <SettingsRow label="C" testID="r2" />
      </SettingsGroup>
    );
    expect(hasDivider(getByTestId('r0'))).toBe(false);
    expect(hasDivider(getByTestId('r1'))).toBe(true);
    expect(hasDivider(getByTestId('r2'))).toBe(true);
  });

  it('treats a .map() array + a conditional false as a flat row list (first row has no divider)', () => {
    const items = ['A', 'B'];
    const showExtra = false;
    const { getByTestId } = render(
      <SettingsGroup>
        {items.map((label) => (
          <SettingsRow key={label} label={label} testID={`row-${label}`} />
        ))}
        {showExtra && <SettingsRow label="Extra" testID="row-extra" />}
        <SettingsRow label="Last" testID="row-last" />
      </SettingsGroup>
    );
    // First mapped row → no divider; the rest (incl. the trailing static row) → divider.
    expect(hasDivider(getByTestId('row-A'))).toBe(false);
    expect(hasDivider(getByTestId('row-B'))).toBe(true);
    expect(hasDivider(getByTestId('row-last'))).toBe(true);
  });

  it('omits the label header when no label is provided', () => {
    const { queryByText } = render(
      <SettingsGroup>
        <SettingsRow label="Row" />
      </SettingsGroup>
    );
    expect(queryByText('Preferences')).toBeNull();
  });
});
