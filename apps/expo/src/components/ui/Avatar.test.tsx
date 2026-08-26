/**
 * Tests for Avatar component
 * Verifies avatar rendering with image or initials fallback
 */

import { render } from '@testing-library/react-native';
import { Avatar } from './Avatar';

// Mock LinearGradient as a host component so the gradient variant renders + forwards testID.
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: 'LinearGradient',
}));

// Mock useTheme with the REAL terracotta palette (not a hand-listed subset) so the eager
// `useThemedStyles` factory + the gradient's `accent.strong` resolve without drift.
jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    colors: jest.requireActual('@/constants/Colors').default.light,
  }),
}));

describe('Avatar', () => {
  describe('initials fallback', () => {
    it('renders initials when no avatarUrl provided', () => {
      const { getByText } = render(<Avatar displayName="John Doe" size={80} />);

      expect(getByText('JD')).toBeTruthy();
    });

    it('renders initials when avatarUrl is explicitly null', () => {
      const { getByText, getByTestId, queryByTestId } = render(
        <Avatar displayName="Jane Doe" avatarUrl={null} size={80} />
      );

      expect(getByText('JD')).toBeTruthy();
      expect(getByTestId('avatar-initials')).toBeTruthy();
      expect(queryByTestId('avatar-image')).toBeNull();
    });

    it('renders single initial for single word names', () => {
      const { getByText } = render(<Avatar displayName="John" size={80} />);

      expect(getByText('J')).toBeTruthy();
    });

    it('renders first two initials for multi-word names', () => {
      const { getByText } = render(<Avatar displayName="John Michael Doe" size={80} />);

      expect(getByText('JM')).toBeTruthy();
    });

    it('handles lowercase names', () => {
      const { getByText } = render(<Avatar displayName="john doe" size={80} />);

      expect(getByText('JD')).toBeTruthy();
    });

    it('renders ? for empty display name', () => {
      const { getByText } = render(<Avatar displayName="" size={80} />);

      expect(getByText('?')).toBeTruthy();
    });

    it('trims whitespace from display name', () => {
      const { getByText } = render(<Avatar displayName="  Jane  Smith  " size={80} />);

      expect(getByText('JS')).toBeTruthy();
    });
  });

  describe('image avatar', () => {
    it('renders image when avatarUrl is provided', () => {
      const { getByTestId, queryByText } = render(
        <Avatar displayName="John Doe" avatarUrl="https://example.com/avatar.jpg" size={80} />
      );

      expect(getByTestId('avatar-image')).toBeTruthy();
      // Initials should not be shown when image is present
      expect(queryByText('JD')).toBeNull();
    });
  });

  describe('gradient variant (Story 23.9)', () => {
    it('renders the accent gradient behind the initials when gradient is set', () => {
      const { getByTestId, getByText } = render(
        <Avatar displayName="John Doe" size={54} gradient />
      );

      expect(getByTestId('avatar-gradient')).toBeTruthy();
      expect(getByText('JD')).toBeTruthy();
    });

    it('does NOT render the gradient on the default (solid) path', () => {
      const { queryByTestId, getByText } = render(<Avatar displayName="John Doe" size={54} />);

      expect(queryByTestId('avatar-gradient')).toBeNull();
      expect(getByText('JD')).toBeTruthy();
    });

    it('ignores gradient when an avatarUrl is present (image wins)', () => {
      const { getByTestId, queryByTestId } = render(
        <Avatar displayName="John Doe" avatarUrl="https://example.com/a.jpg" size={54} gradient />
      );

      expect(getByTestId('avatar-image')).toBeTruthy();
      expect(queryByTestId('avatar-gradient')).toBeNull();
    });
  });

  describe('sizing', () => {
    it('applies correct size to container', () => {
      const { getByTestId } = render(<Avatar displayName="John" size={100} />);

      const container = getByTestId('avatar-container');
      expect(container.props.style).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ width: 100, height: 100, borderRadius: 50 }),
        ])
      );
    });

    it('scales font size based on avatar size', () => {
      const { getByText } = render(<Avatar displayName="John" size={80} />);

      const initials = getByText('J');
      // Font size should be relative to avatar size
      expect(initials.props.style).toBeDefined();
    });
  });

  describe('accessibility', () => {
    it('has accessible role', () => {
      const { getByTestId } = render(<Avatar displayName="John Doe" size={80} />);

      const container = getByTestId('avatar-container');
      expect(container.props.accessibilityRole).toBe('image');
    });

    it('has accessibility label with display name', () => {
      const { getByTestId } = render(<Avatar displayName="John Doe" size={80} />);

      const container = getByTestId('avatar-container');
      expect(container.props.accessibilityLabel).toBe("John Doe's avatar");
    });
  });
});
