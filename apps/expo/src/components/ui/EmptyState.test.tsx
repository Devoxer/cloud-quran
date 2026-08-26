/**
 * EmptyState Component Tests
 *
 * Story 8.2: Implement Library Tab Screen
 * Epic 8: User Library & Collections
 */

import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { EmptyState } from './EmptyState';

// Mock ThemeContext
jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    colors: {
      text: {
        primary: '#000000',
        secondary: '#666666',
        onAccent: '#FFFFFF',
      },
      accent: {
        primary: '#007AFF',
      },
      // Story 26.8: the `card` variant styles reference these (computed eagerly by the
      // useThemedStyles factory regardless of the active variant).
      background: {
        secondary: '#F5EFE9',
      },
      border: '#E5DED6',
    },
  }),
}));

describe('EmptyState', () => {
  it('renders title text', () => {
    render(<EmptyState title="No books found" />);
    expect(screen.getByText('No books found')).toBeTruthy();
  });

  it('renders description when provided', () => {
    render(
      <EmptyState title="No collections" description="Create a collection to organize your books" />
    );
    expect(screen.getByText('Create a collection to organize your books')).toBeTruthy();
  });

  it('does not render description when not provided', () => {
    render(<EmptyState title="No books found" />);
    expect(screen.queryByTestId('empty-state-description')).toBeNull();
  });

  it('renders CTA button when ctaLabel and onCtaPress are provided', () => {
    const onCtaPress = jest.fn();
    render(<EmptyState title="No books" ctaLabel="Discover Books" onCtaPress={onCtaPress} />);
    expect(screen.getByText('Discover Books')).toBeTruthy();
  });

  it('does not render CTA button when ctaLabel is not provided', () => {
    render(<EmptyState title="No books found" />);
    expect(screen.queryByTestId('empty-state-cta')).toBeNull();
  });

  it('calls onCtaPress when CTA button is pressed', () => {
    const onCtaPress = jest.fn();
    render(<EmptyState title="No books" ctaLabel="Discover Books" onCtaPress={onCtaPress} />);
    fireEvent.press(screen.getByText('Discover Books'));
    expect(onCtaPress).toHaveBeenCalledTimes(1);
  });

  it('renders icon when provided', () => {
    render(<EmptyState title="No history" icon="time-outline" />);
    expect(screen.getByTestId('empty-state-icon')).toBeTruthy();
  });

  it('renders a supplied illustration instead of the icon (future-mascot swap point)', () => {
    render(
      <EmptyState
        title="Empty"
        icon="time-outline"
        illustration={<Text testID="custom-illustration">mascot</Text>}
      />
    );
    expect(screen.getByTestId('custom-illustration')).toBeTruthy();
    expect(screen.queryByTestId('empty-state-icon')).toBeNull();
  });

  it('adds flex:1 in fullScreen mode', () => {
    const flatten = (style: unknown) =>
      Array.isArray(style)
        ? style.reduce((acc: Record<string, unknown>, s) => ({ ...acc, ...s }), {})
        : (style as Record<string, unknown>);
    render(<EmptyState title="Empty" fullScreen testID="es-full" />);
    expect(flatten(screen.getByTestId('es-full').props.style).flex).toBe(1);
  });

  it('applies testID correctly', () => {
    render(<EmptyState title="Test" testID="my-empty-state" />);
    expect(screen.getByTestId('my-empty-state')).toBeTruthy();
  });
});
