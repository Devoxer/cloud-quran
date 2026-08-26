/**
 * Tests for LoadingView — the single go-forward loading primitive (Story 17.13).
 *
 * Verifies the centered spinner renders, the fullScreen variant adds flex:1,
 * custom style merges, and the progressbar accessibility surface.
 */

import { render } from '@testing-library/react-native';
import { LoadingView } from './LoadingView';

jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    colors: {
      accent: { primary: '#C65D3B' },
    },
    isDark: false,
  }),
}));

function flatten(style: unknown) {
  return Array.isArray(style)
    ? style.reduce((acc: Record<string, unknown>, s) => ({ ...acc, ...s }), {})
    : (style as Record<string, unknown>);
}

describe('LoadingView', () => {
  it('renders a centered spinner by default', () => {
    const { getByTestId } = render(<LoadingView />);
    const view = getByTestId('loading-view');
    const style = flatten(view.props.style);
    expect(style.alignItems).toBe('center');
    expect(style.justifyContent).toBe('center');
    // Not full-screen by default
    expect(style.flex).toBeUndefined();
  });

  it('adds flex:1 in fullScreen mode', () => {
    const { getByTestId } = render(<LoadingView fullScreen />);
    const style = flatten(getByTestId('loading-view').props.style);
    expect(style.flex).toBe(1);
  });

  it('merges a custom style', () => {
    const { getByTestId } = render(<LoadingView style={{ marginTop: 24 }} />);
    const style = flatten(getByTestId('loading-view').props.style);
    expect(style.marginTop).toBe(24);
  });

  it('accepts a custom testID', () => {
    const { getByTestId } = render(<LoadingView testID="discover-loading" />);
    expect(getByTestId('discover-loading')).toBeTruthy();
  });

  it('exposes a progressbar accessibility role + label', () => {
    const { getByTestId } = render(<LoadingView />);
    const view = getByTestId('loading-view');
    expect(view.props.accessibilityRole).toBe('progressbar');
    expect(view.props.accessibilityLabel).toBe('Loading');
  });

  it('accepts a custom accessibility label', () => {
    const { getByTestId } = render(<LoadingView accessibilityLabel="Loading books" />);
    expect(getByTestId('loading-view').props.accessibilityLabel).toBe('Loading books');
  });
});
