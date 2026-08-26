/**
 * SectionHeader Component Tests
 *
 * Story 8.2: Implement Library Tab Screen
 * Epic 8: User Library & Collections
 */

import { fireEvent, render, screen } from '@testing-library/react-native';
import { SectionHeader } from './SectionHeader';

// Mock ThemeContext
jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    colors: {
      text: {
        primary: '#000000',
        secondary: '#666666',
        tertiary: '#999999',
      },
      accent: {
        primary: '#007AFF',
      },
    },
  }),
}));

describe('SectionHeader', () => {
  it('renders title text', () => {
    render(<SectionHeader title="Continue Reading" />);
    expect(screen.getByText('Continue Reading')).toBeTruthy();
  });

  it('renders See All link when onSeeAll is provided', () => {
    const onSeeAll = jest.fn();
    render(<SectionHeader title="History" onSeeAll={onSeeAll} />);
    expect(screen.getByText('See All')).toBeTruthy();
  });

  it('does not render See All link when onSeeAll is not provided', () => {
    render(<SectionHeader title="Continue Reading" />);
    expect(screen.queryByText('See All')).toBeNull();
  });

  it('calls onSeeAll when See All is pressed', () => {
    const onSeeAll = jest.fn();
    render(<SectionHeader title="History" onSeeAll={onSeeAll} />);
    fireEvent.press(screen.getByText('See All'));
    expect(onSeeAll).toHaveBeenCalledTimes(1);
  });

  it('renders right action when provided', () => {
    const rightAction = <></>;
    render(<SectionHeader title="Collections" rightAction={rightAction} />);
    expect(screen.getByTestId('section-header-right-action')).toBeTruthy();
  });

  it('renders both See All and right action when both are provided (AC #4)', () => {
    const onSeeAll = jest.fn();
    const rightAction = <></>;
    render(<SectionHeader title="Collections" onSeeAll={onSeeAll} rightAction={rightAction} />);
    expect(screen.getByText('See All')).toBeTruthy();
    expect(screen.getByTestId('section-header-right-action')).toBeTruthy();
  });

  it('applies testID correctly', () => {
    render(<SectionHeader title="Test" testID="my-section" />);
    expect(screen.getByTestId('my-section')).toBeTruthy();
  });

  // Story 23.15: optional count subtitle under the title.
  it('renders the subtitle when provided', () => {
    render(<SectionHeader title="My Notes" subtitle="6 notes · 5 books" />);
    expect(screen.getByText('6 notes · 5 books')).toBeTruthy();
  });

  it('does not render a subtitle when omitted', () => {
    render(<SectionHeader title="My Notes" />);
    expect(screen.queryByText('6 notes · 5 books')).toBeNull();
  });
});
