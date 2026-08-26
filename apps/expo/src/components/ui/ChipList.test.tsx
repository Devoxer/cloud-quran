/**
 * Tests for ChipList component
 * Story 4.3: Implement Discover Tab with Categories and Topics
 *
 * Verifies ChipList rendering with title, chips, selection state,
 * See All button, loading skeleton, and maxVisible limiting.
 */

import { fireEvent, render } from '@testing-library/react-native';
import { ChipList } from './ChipList';

// Mock ThemeContext
jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    colors: {
      background: {
        primary: '#FFFBF7',
        secondary: '#F5EFE9',
        tertiary: '#EBE3DA',
      },
      text: {
        primary: '#1A1612',
        secondary: '#5C534A',
        tertiary: '#8C8279',
        onAccent: '#FFFFFF',
      },
      accent: {
        primary: '#C65D3B',
        secondary: '#E8A87C',
      },
    },
    isDark: false,
  }),
}));

// Mock Animated API for Skeleton
jest.mock('react-native', () => {
  const RN = jest.requireActual('react-native');
  RN.Animated.loop = jest.fn((animation) => ({
    start: jest.fn(),
    stop: jest.fn(),
    reset: jest.fn(),
  }));
  RN.Animated.timing = jest.fn(() => ({
    start: jest.fn(),
    stop: jest.fn(),
    reset: jest.fn(),
  }));
  return RN;
});

const mockItems = ['Self-Help', 'Psychology', 'Business', 'Health', 'Productivity'];

describe('ChipList', () => {
  describe('Title Rendering', () => {
    it('renders title correctly', () => {
      const { getByText } = render(<ChipList title="Categories" items={mockItems} />);
      expect(getByText('Categories')).toBeTruthy();
    });

    it('renders Topics title correctly', () => {
      const { getByText } = render(<ChipList title="Topics" items={mockItems} />);
      expect(getByText('Topics')).toBeTruthy();
    });
  });

  describe('Chip Rendering', () => {
    it('renders chips for items', () => {
      const { getByText } = render(<ChipList title="Categories" items={mockItems} />);
      expect(getByText('Self-Help')).toBeTruthy();
      expect(getByText('Psychology')).toBeTruthy();
      expect(getByText('Business')).toBeTruthy();
    });

    it('renders all items when no maxVisible specified', () => {
      const { getByText } = render(<ChipList title="Categories" items={mockItems} />);
      mockItems.forEach((item) => {
        expect(getByText(item)).toBeTruthy();
      });
    });

    it('limits visible items with maxVisible prop in wrapped layout', () => {
      const { queryByText } = render(
        <ChipList title="Categories" items={mockItems} maxVisible={3} layout="wrapped" />
      );
      expect(queryByText('Self-Help')).toBeTruthy();
      expect(queryByText('Psychology')).toBeTruthy();
      expect(queryByText('Business')).toBeTruthy();
      expect(queryByText('Health')).toBeNull();
      expect(queryByText('Productivity')).toBeNull();
    });
  });

  describe('Selection State', () => {
    it('highlights selected chip', () => {
      const { getByTestId } = render(
        <ChipList
          title="Categories"
          items={mockItems}
          selectedItem="Psychology"
          testID="chip-list"
        />
      );
      const selectedChip = getByTestId('chip-list-chip-1');
      const style = selectedChip.props.style;
      const flatStyle = Array.isArray(style)
        ? style.reduce((acc, s) => ({ ...acc, ...s }), {})
        : style;
      expect(flatStyle.backgroundColor).toBe('#C65D3B'); // accent.primary
    });

    it('calls onSelectItem when chip is pressed', () => {
      const onSelectItem = jest.fn();
      const { getByText } = render(
        <ChipList title="Categories" items={mockItems} onSelectItem={onSelectItem} />
      );
      fireEvent.press(getByText('Psychology'));
      expect(onSelectItem).toHaveBeenCalledWith('Psychology');
    });

    it('passes null when selected item is pressed again (toggle off)', () => {
      const onSelectItem = jest.fn();
      const { getByText } = render(
        <ChipList
          title="Categories"
          items={mockItems}
          selectedItem="Psychology"
          onSelectItem={onSelectItem}
        />
      );
      fireEvent.press(getByText('Psychology'));
      expect(onSelectItem).toHaveBeenCalledWith(null);
    });
  });

  describe('See All Chip', () => {
    it('shows +X more chip when items are hidden and onSeeAll is provided', () => {
      const onSeeAll = jest.fn();
      const { getByText } = render(
        <ChipList
          title="Categories"
          items={mockItems}
          maxVisible={3}
          onSeeAll={onSeeAll}
          layout="wrapped"
        />
      );
      // 5 items, 3 visible = 2 hidden
      expect(getByText('+2 more')).toBeTruthy();
    });

    it('hides +X more chip when all items are visible', () => {
      const onSeeAll = jest.fn();
      const { queryByText } = render(
        <ChipList title="Categories" items={mockItems} onSeeAll={onSeeAll} layout="wrapped" />
      );
      expect(queryByText(/\+\d+ more/)).toBeNull();
    });

    it('hides +X more chip when onSeeAll is not provided', () => {
      const { queryByText } = render(
        <ChipList title="Categories" items={mockItems} maxVisible={3} layout="wrapped" />
      );
      expect(queryByText(/\+\d+ more/)).toBeNull();
    });

    it('calls onSeeAll when +X more chip is pressed', () => {
      const onSeeAll = jest.fn();
      const { getByText } = render(
        <ChipList
          title="Categories"
          items={mockItems}
          maxVisible={3}
          onSeeAll={onSeeAll}
          layout="wrapped"
        />
      );
      fireEvent.press(getByText('+2 more'));
      expect(onSeeAll).toHaveBeenCalledTimes(1);
    });
  });

  describe('Loading State', () => {
    it('shows a loading spinner when isLoading is true', () => {
      // Story 17.13: a single LoadingView spinner replaced the chip skeletons.
      const { getByTestId } = render(
        <ChipList title="Categories" items={[]} isLoading testID="chip-list" />
      );
      expect(getByTestId('chip-list-loading')).toBeTruthy();
    });

    it('hides chips when loading', () => {
      const { queryByText } = render(<ChipList title="Categories" items={mockItems} isLoading />);
      expect(queryByText('Self-Help')).toBeNull();
    });
  });

  describe('Empty State', () => {
    it('renders nothing for chips when items is empty and not loading', () => {
      const { queryByTestId } = render(
        <ChipList title="Categories" items={[]} testID="chip-list" />
      );
      expect(queryByTestId('chip-list-chip-0')).toBeNull();
    });
  });

  describe('Custom Styling', () => {
    it('applies custom style prop', () => {
      const customStyle = { marginTop: 20 };
      const { getByTestId } = render(
        <ChipList title="Categories" items={mockItems} style={customStyle} testID="chip-list" />
      );
      const container = getByTestId('chip-list');
      const styles = container.props.style;
      const flatStyle = Array.isArray(styles)
        ? styles.reduce((acc, s) => ({ ...acc, ...s }), {})
        : styles;
      expect(flatStyle.marginTop).toBe(20);
    });
  });
});
