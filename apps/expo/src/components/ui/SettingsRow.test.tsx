/**
 * Tests for SettingsRow primitive (Story 23.2)
 *
 * Covers each icon variant, every trailing variant (switch/chevron/external/spinner/
 * value-text/ReactNode), onPress, disabled, destructive, and the divider.
 * Mocks useTheme with the FULL real dark palette so the eager `useThemedStyles`
 * factory never reads an undefined token (STACK-CHEAT-SHEET § Theme).
 */

import { fireEvent, render } from '@testing-library/react-native';
import { Text } from 'react-native';
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

const flatten = (style: unknown) =>
  Array.isArray(style)
    ? style.reduce((acc: Record<string, unknown>, s) => ({ ...acc, ...(s || {}) }), {})
    : ((style || {}) as Record<string, unknown>);

describe('SettingsRow', () => {
  it('renders the label and description', () => {
    const { getByText } = render(<SettingsRow label="Appearance" description="Theme + colors" />);
    expect(getByText('Appearance')).toBeTruthy();
    expect(getByText('Theme + colors')).toBeTruthy();
  });

  it('renders an inline icon variant', () => {
    const { getByTestId } = render(
      <SettingsRow icon="color-palette-outline" label="Appearance" testID="row" />
    );
    expect(getByTestId('row')).toBeTruthy();
  });

  it('renders a badge icon variant', () => {
    const { getByTestId } = render(
      <SettingsRow icon="notifications-outline" iconVariant="badge" label="All" testID="row" />
    );
    expect(getByTestId('row')).toBeTruthy();
  });

  it('badge uses the tinted accent.faint fill + accent.soft glyph (Story 23.8)', () => {
    const Colors = jest.requireActual('@/constants/Colors').default;
    const { getByTestId } = render(
      <SettingsRow icon="notifications-outline" iconVariant="badge" label="All" testID="row" />
    );
    // static row (no onPress): children = [divider(false), content]; content = [badge, text, …].
    const content = getByTestId('row').props.children[1];
    const badge = content.props.children[0];
    expect(flatten(badge.props.style).backgroundColor).toBe(Colors.dark.accent.faint);
    // The glyph color flows to the inner Icon element.
    expect(badge.props.children.props.color).toBe(Colors.dark.accent.soft);
  });

  describe('trailing variants', () => {
    it('switch: renders and fires onValueChange', () => {
      const onValueChange = jest.fn();
      const { getByTestId } = render(
        <SettingsRow
          label="Pause audio"
          trailing="switch"
          value={false}
          onValueChange={onValueChange}
          trailingTestID="row-switch"
        />
      );
      fireEvent(getByTestId('row-switch'), 'valueChange', true);
      expect(onValueChange).toHaveBeenCalledWith(true);
    });

    it('spinner: renders an ActivityIndicator with the trailing testID', () => {
      const { getByTestId } = render(
        <SettingsRow label="Restore" trailing="spinner" trailingTestID="row-loading" />
      );
      expect(getByTestId('row-loading')).toBeTruthy();
    });

    it('chevron: renders a pressable button row', () => {
      const onPress = jest.fn();
      const { getByRole } = render(
        <SettingsRow label="Privacy" trailing="chevron" onPress={onPress} />
      );
      expect(getByRole('button')).toBeTruthy();
    });

    it('external: a pressable row uses the link role', () => {
      const onPress = jest.fn();
      const { getByRole } = render(
        <SettingsRow label="Privacy Policy" trailing="external" onPress={onPress} />
      );
      expect(getByRole('link')).toBeTruthy();
    });

    it('value text: a non-token string renders as text', () => {
      const { getByText } = render(<SettingsRow label="Version" trailing="1.0.6" />);
      expect(getByText('1.0.6')).toBeTruthy();
    });

    it('ReactNode: renders an arbitrary trailing node', () => {
      const { getByTestId } = render(
        <SettingsRow label="Reminder time" trailing={<Text testID="custom-trailing">9:00</Text>} />
      );
      expect(getByTestId('custom-trailing')).toBeTruthy();
    });
  });

  describe('press', () => {
    it('fires onPress when the row is pressed', () => {
      const onPress = jest.fn();
      const { getByRole } = render(
        <SettingsRow label="Privacy" trailing="chevron" onPress={onPress} />
      );
      fireEvent.press(getByRole('button'));
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('renders a static row (no role) when onPress is absent', () => {
      const { queryByRole } = render(<SettingsRow label="Static" trailing="1.0.6" />);
      expect(queryByRole('button')).toBeNull();
    });

    it('disabled: blocks press and marks the row disabled', () => {
      const onPress = jest.fn();
      const { getByRole } = render(
        <SettingsRow label="Privacy" trailing="chevron" onPress={onPress} disabled testID="row" />
      );
      const row = getByRole('button');
      fireEvent.press(row);
      expect(onPress).not.toHaveBeenCalled();
      expect(row.props.accessibilityState?.disabled).toBe(true);
    });

    // Story 20.3: `selected` merges into accessibilityState alongside `disabled`. A checkmark
    // list without it is inaccessible — the checkmark glyph carries no semantics for VoiceOver.
    it('selected: surfaces accessibilityState.selected without clobbering disabled', () => {
      const { getByRole } = render(
        <SettingsRow label="English" onPress={() => {}} selected testID="row" />
      );
      const row = getByRole('button');
      expect(row.props.accessibilityState?.selected).toBe(true);
      expect(row.props.accessibilityState?.disabled).toBe(false);
    });

    it('selected={false}: reports an UNselected option (not merely absent)', () => {
      const { getByRole } = render(
        <SettingsRow label="Français" onPress={() => {}} selected={false} testID="row" />
      );
      expect(getByRole('button').props.accessibilityState?.selected).toBe(false);
    });

    it('omitting `selected` leaves it undefined — every existing consumer is unchanged', () => {
      const { getByRole } = render(
        <SettingsRow label="Privacy" trailing="chevron" onPress={() => {}} testID="row" />
      );
      expect(getByRole('button').props.accessibilityState?.selected).toBeUndefined();
    });

    it('disabled (static row): dims via the disabled style', () => {
      const { getByTestId } = render(
        <SettingsRow label="X" trailing="1.0" disabled testID="row" />
      );
      expect(flatten(getByTestId('row').props.style).opacity).toBe(0.5);
    });
  });

  it('destructive: renders without crashing', () => {
    const { getByText } = render(
      <SettingsRow icon="trash-outline" label="Delete" destructive onPress={jest.fn()} />
    );
    expect(getByText('Delete')).toBeTruthy();
  });

  describe('divider', () => {
    it('renders a between-rows hairline when showDivider is set (inset 64 when iconed)', () => {
      const { getByTestId } = render(
        <SettingsRow
          icon="notifications-outline"
          iconVariant="badge"
          label="A"
          showDivider
          testID="row"
        />
      );
      const outer = getByTestId('row');
      // The first child is the divider View (separator color, 64 inset for an iconed row).
      const dividerStyle = flatten(outer.props.children[0].props.style);
      expect(dividerStyle.height).toBe(1);
      expect(dividerStyle.marginLeft).toBe(64);
    });

    it('insets the divider to 16 when the row has no icon', () => {
      const { getByTestId } = render(<SettingsRow label="A" showDivider testID="row" />);
      const dividerStyle = flatten(getByTestId('row').props.children[0].props.style);
      expect(dividerStyle.marginLeft).toBe(16);
    });

    it('omits the divider when showDivider is false (no hairline before the first row)', () => {
      const { getByTestId } = render(<SettingsRow label="A" testID="row" />);
      // children[0] is `false` (the unrendered divider), not a View.
      expect(getByTestId('row').props.children[0]).toBeFalsy();
    });
  });

  // Story 20.4 — the appearance row hosts a 3-segment picker that needs more width than a small
  // trailing affordance. The prop hands row chrome back to it, and the load-bearing constraint is
  // WHICH chrome: the leading inset and the icon→label gap are the grouped list's left ALIGNMENT
  // RAIL, shared with every sibling row and with the fixed divider insets asserted above.
  describe('wideTrailing', () => {
    /** The row's content wrapper (static row: children = [divider(false), content]). */
    const contentOf = (testID: string, tree: ReturnType<typeof render>) =>
      tree.getByTestId(testID).props.children[1];

    it('reclaims chrome from the TRAILING side only — the leading inset is untouched', () => {
      const tree = render(
        <SettingsRow icon="color-palette-outline" label="Appearance" wideTrailing testID="row" />
      );
      const body = flatten(contentOf('row', tree).props.style);
      // The first cut of this prop set `paddingHorizontal: 12`, pulling this one row's icon 4pt left
      // of the five rows below it in the same group while the hairline stayed at its fixed inset.
      expect(body.paddingLeft ?? body.paddingHorizontal).toBe(16);
      expect(body.paddingRight).toBe(12);
    });

    it('keeps the LABEL rail identical to a standard row (16 + icon 20 + 14 = 50)', () => {
      const wide = render(
        <SettingsRow icon="color-palette-outline" label="Appearance" wideTrailing testID="wide" />
      );
      const plain = render(
        <SettingsRow icon="color-palette-outline" label="Colour" testID="plain" />
      );
      const railOf = (tree: ReturnType<typeof render>, testID: string) => {
        const content = contentOf(testID, tree);
        const body = flatten(content.props.style);
        const iconStyle = flatten(content.props.children[0].props.style);
        // gap sits between icon and label; the wide variant narrows it and adds the difference back
        // as the icon's own marginRight, so the sum — the label's x — must not move.
        return (
          (body.paddingLeft ?? body.paddingHorizontal) +
          iconStyle.width +
          (iconStyle.marginRight ?? 0) +
          body.gap
        );
      };
      expect(railOf(wide, 'wide')).toBe(railOf(plain, 'plain'));
      expect(railOf(plain, 'plain')).toBe(50);
    });

    it('omitting it leaves every existing row exactly as it was', () => {
      const tree = render(<SettingsRow icon="color-palette-outline" label="Colour" testID="row" />);
      const content = contentOf('row', tree);
      const body = flatten(content.props.style);
      expect(body.paddingHorizontal).toBe(16);
      expect(body.paddingRight).toBeUndefined();
      expect(body.gap).toBe(14);
      expect(flatten(content.props.children[0].props.style).marginRight).toBeUndefined();
    });
  });
});
