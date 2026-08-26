/**
 * Tests for RowSeparator primitive (Story 23.4)
 *
 * RNTL render-smoke: a themed 1px hairline; the `inset` prop drives `marginLeft`
 * (default `BOOK_ROW_INSET` = 66). Mocks useTheme with the FULL real dark palette
 * so the eager `useThemedStyles` factory never reads an undefined token.
 */

import { render } from '@testing-library/react-native';
import { BOOK_ROW_INSET, RowSeparator } from './RowSeparator';

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

/** RowSeparator renders a single View → toJSON() is one node (not an array). */
const rootStyle = (node: ReturnType<ReturnType<typeof render>['toJSON']>) =>
  flatten((Array.isArray(node) ? node[0] : node)?.props.style);

describe('RowSeparator', () => {
  it('exports the locked BookCard-row title inset', () => {
    expect(BOOK_ROW_INSET).toBe(66);
  });

  it('renders a 1px hairline inset to the default BOOK_ROW_INSET', () => {
    const style = rootStyle(render(<RowSeparator />).toJSON());
    expect(style.height).toBe(1);
    expect(style.marginLeft).toBe(66);
    expect(style.backgroundColor).toBeDefined();
  });

  it('honors a custom inset', () => {
    const style = rootStyle(render(<RowSeparator inset={82} />).toJSON());
    expect(style.marginLeft).toBe(82);
  });
});
