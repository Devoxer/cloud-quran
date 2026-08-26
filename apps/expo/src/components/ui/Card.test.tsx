/**
 * Tests for Card primitive (Story 23.2)
 *
 * Render-smoke + the padding contract + the surface styling (radius/bg/border).
 * Mocks useTheme with the FULL real dark palette so the eager `useThemedStyles`
 * factory never reads an undefined token (STACK-CHEAT-SHEET § Theme).
 */

import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { RADII } from '@/constants/radii';
import { SPACING } from '@/constants/spacing';
import { Card } from './Card';

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

describe('Card', () => {
  it('renders its children', () => {
    const { getByText } = render(
      <Card>
        <Text>Inside</Text>
      </Card>
    );
    expect(getByText('Inside')).toBeTruthy();
  });

  it('applies the grouped-surface styling (radius lg, secondary bg, 1px border)', () => {
    const Colors = jest.requireActual('@/constants/Colors').default;
    const { getByTestId } = render(
      <Card testID="card">
        <Text>x</Text>
      </Card>
    );
    const style = flatten(getByTestId('card').props.style);
    expect(style.borderRadius).toBe(RADII.lg);
    expect(style.backgroundColor).toBe(Colors.dark.background.secondary);
    expect(style.borderWidth).toBe(1);
    expect(style.borderColor).toBe(Colors.dark.border);
  });

  it('defaults to SPACING.lg padding', () => {
    const { getByTestId } = render(
      <Card testID="card">
        <Text>x</Text>
      </Card>
    );
    expect(flatten(getByTestId('card').props.style).padding).toBe(SPACING.lg);
  });

  it('padded={false} removes padding (rows manage their own)', () => {
    const { getByTestId } = render(
      <Card testID="card" padded={false}>
        <Text>x</Text>
      </Card>
    );
    expect(flatten(getByTestId('card').props.style).padding).toBe(0);
  });

  it('padded="md" uses that spacing key', () => {
    const { getByTestId } = render(
      <Card testID="card" padded="md">
        <Text>x</Text>
      </Card>
    );
    expect(flatten(getByTestId('card').props.style).padding).toBe(SPACING.md);
  });

  it('merges a custom style override', () => {
    const { getByTestId } = render(
      <Card testID="card" style={{ marginTop: 10 }}>
        <Text>x</Text>
      </Card>
    );
    expect(flatten(getByTestId('card').props.style).marginTop).toBe(10);
  });
});
