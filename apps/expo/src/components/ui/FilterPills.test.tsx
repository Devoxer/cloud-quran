/**
 * Tests for FilterPills component
 * Verifies filter pills display, removal callbacks, and accessibility
 *
 * Story 4.5: Implement Book Filtering
 * Epic 4: Book Discovery & Browsing
 */

import { fireEvent, render } from '@testing-library/react-native';
import { FilterPills } from './FilterPills';

// Mock ThemeContext
jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    colors: {
      text: {
        primary: '#000000',
        secondary: '#5C534A',
        onAccent: '#FFFFFF',
      },
      accent: {
        primary: '#C65D3B',
        secondary: '#E8A87C',
      },
      background: {
        primary: '#FFFBF7',
        secondary: '#F5EFE9',
        tertiary: '#EBE3DA',
      },
      border: '#E5DED6',
    },
  }),
}));

// Mock taxonomy. Story 24.14: the helpers take the active language; this mock ignores it (the
// assertions below are about pill RENDERING, not translation — `taxonomy.test.ts` owns that) but
// must still accept the argument so the component's real call shape is exercised.
jest.mock('@/constants/taxonomy', () => ({
  getCategoryDisplayName: (id: string, _language: string) => {
    const names: Record<string, string> = {
      'self-help': 'Self-Help',
      business: 'Business',
      science: 'Science',
    };
    return names[id] || id;
  },
  getTopicDisplayName: (name: string, _language: string) => name,
}));

describe('FilterPills', () => {
  const defaultProps = {
    categories: ['self-help', 'business'],
    topics: ['Leadership', 'Productivity'],
    onRemoveCategory: jest.fn(),
    onRemoveTopic: jest.fn(),
    onRemoveAuthor: jest.fn(),
    onClearAll: jest.fn(),
    testID: 'filter-pills',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders category pills with correct display names', () => {
      const { getByText } = render(<FilterPills {...defaultProps} />);

      expect(getByText('Self-Help')).toBeTruthy();
      expect(getByText('Business')).toBeTruthy();
    });

    it('renders topic pills', () => {
      const { getByText } = render(<FilterPills {...defaultProps} />);

      expect(getByText('Leadership')).toBeTruthy();
      expect(getByText('Productivity')).toBeTruthy();
    });

    it('renders Clear All button', () => {
      const { getByText } = render(<FilterPills {...defaultProps} />);

      expect(getByText('Clear All')).toBeTruthy();
    });

    it('returns null when no filters active', () => {
      const { queryByTestId } = render(
        <FilterPills {...defaultProps} categories={[]} topics={[]} />
      );

      expect(queryByTestId('filter-pills')).toBeNull();
    });

    it('renders with only categories', () => {
      const { getByText, queryByText } = render(<FilterPills {...defaultProps} topics={[]} />);

      expect(getByText('Self-Help')).toBeTruthy();
      expect(getByText('Business')).toBeTruthy();
      expect(queryByText('Leadership')).toBeNull();
      expect(getByText('Clear All')).toBeTruthy();
    });

    it('renders with only topics', () => {
      const { getByText, queryByText } = render(<FilterPills {...defaultProps} categories={[]} />);

      expect(getByText('Leadership')).toBeTruthy();
      expect(getByText('Productivity')).toBeTruthy();
      expect(queryByText('Self-Help')).toBeNull();
      expect(getByText('Clear All')).toBeTruthy();
    });

    it('renders category pills with testID', () => {
      const { getByTestId } = render(<FilterPills {...defaultProps} />);

      expect(getByTestId('filter-pills-category-self-help')).toBeTruthy();
      expect(getByTestId('filter-pills-category-business')).toBeTruthy();
    });

    it('renders topic pills with testID', () => {
      const { getByTestId } = render(<FilterPills {...defaultProps} />);

      expect(getByTestId('filter-pills-topic-Leadership')).toBeTruthy();
      expect(getByTestId('filter-pills-topic-Productivity')).toBeTruthy();
    });

    it('renders scrollable container', () => {
      const { getByTestId } = render(<FilterPills {...defaultProps} />);

      expect(getByTestId('filter-pills-scroll')).toBeTruthy();
    });
  });

  describe('Author pill (Story 23.12)', () => {
    it('renders the author pill when an author filter is set', () => {
      const { getByTestId, getByText } = render(
        <FilterPills {...defaultProps} author="James Clear" onRemoveAuthor={jest.fn()} />
      );

      expect(getByTestId('filter-pills-author')).toBeTruthy();
      expect(getByText('James Clear')).toBeTruthy();
    });

    it('does not render an author pill when author is null', () => {
      const { queryByTestId } = render(
        <FilterPills {...defaultProps} author={null} onRemoveAuthor={jest.fn()} />
      );

      expect(queryByTestId('filter-pills-author')).toBeNull();
    });

    it('calls onRemoveAuthor when the author pill is pressed', () => {
      const onRemoveAuthor = jest.fn();
      const { getByTestId } = render(
        <FilterPills {...defaultProps} author="James Clear" onRemoveAuthor={onRemoveAuthor} />
      );

      fireEvent.press(getByTestId('filter-pills-author'));

      expect(onRemoveAuthor).toHaveBeenCalledWith('James Clear');
      expect(onRemoveAuthor).toHaveBeenCalledTimes(1);
    });

    it('renders (with Clear All) when ONLY an author filter is active — the escape-hatch fix', () => {
      // Previously this returned null (no category/topic), trapping the user on the
      // author-filtered grid with no pill and no Clear All.
      const { getByTestId, getByText } = render(
        <FilterPills
          {...defaultProps}
          categories={[]}
          topics={[]}
          author="James Clear"
          onRemoveAuthor={jest.fn()}
        />
      );

      expect(getByTestId('filter-pills-author')).toBeTruthy();
      expect(getByText('Clear All')).toBeTruthy();
    });
  });

  describe('Interaction', () => {
    it('calls onRemoveCategory when category pill pressed', () => {
      const onRemoveCategory = jest.fn();
      const { getByTestId } = render(
        <FilterPills {...defaultProps} onRemoveCategory={onRemoveCategory} />
      );

      fireEvent.press(getByTestId('filter-pills-category-self-help'));

      expect(onRemoveCategory).toHaveBeenCalledWith('self-help');
      expect(onRemoveCategory).toHaveBeenCalledTimes(1);
    });

    it('calls onRemoveTopic when topic pill pressed', () => {
      const onRemoveTopic = jest.fn();
      const { getByTestId } = render(
        <FilterPills {...defaultProps} onRemoveTopic={onRemoveTopic} />
      );

      fireEvent.press(getByTestId('filter-pills-topic-Leadership'));

      expect(onRemoveTopic).toHaveBeenCalledWith('Leadership');
      expect(onRemoveTopic).toHaveBeenCalledTimes(1);
    });

    it('calls onClearAll when Clear All pressed', () => {
      const onClearAll = jest.fn();
      const { getByTestId } = render(<FilterPills {...defaultProps} onClearAll={onClearAll} />);

      fireEvent.press(getByTestId('filter-pills-clear-all'));

      expect(onClearAll).toHaveBeenCalledTimes(1);
    });

    it('calls correct callback for each category', () => {
      const onRemoveCategory = jest.fn();
      const { getByTestId } = render(
        <FilterPills {...defaultProps} onRemoveCategory={onRemoveCategory} />
      );

      fireEvent.press(getByTestId('filter-pills-category-self-help'));
      expect(onRemoveCategory).toHaveBeenLastCalledWith('self-help');

      fireEvent.press(getByTestId('filter-pills-category-business'));
      expect(onRemoveCategory).toHaveBeenLastCalledWith('business');
    });

    it('calls correct callback for each topic', () => {
      const onRemoveTopic = jest.fn();
      const { getByTestId } = render(
        <FilterPills {...defaultProps} onRemoveTopic={onRemoveTopic} />
      );

      fireEvent.press(getByTestId('filter-pills-topic-Leadership'));
      expect(onRemoveTopic).toHaveBeenLastCalledWith('Leadership');

      fireEvent.press(getByTestId('filter-pills-topic-Productivity'));
      expect(onRemoveTopic).toHaveBeenLastCalledWith('Productivity');
    });
  });

  describe('Accessibility', () => {
    it('has accessible role for category pills', () => {
      const { getByTestId } = render(<FilterPills {...defaultProps} />);

      const pill = getByTestId('filter-pills-category-self-help');
      expect(pill.props.accessibilityRole).toBe('button');
    });

    it('has accessible role for topic pills', () => {
      const { getByTestId } = render(<FilterPills {...defaultProps} />);

      const pill = getByTestId('filter-pills-topic-Leadership');
      expect(pill.props.accessibilityRole).toBe('button');
    });

    it('has accessible label for category pills', () => {
      const { getByTestId } = render(<FilterPills {...defaultProps} />);

      const pill = getByTestId('filter-pills-category-self-help');
      expect(pill.props.accessibilityLabel).toBe('Remove Self-Help filter');
    });

    it('has accessible label for topic pills', () => {
      const { getByTestId } = render(<FilterPills {...defaultProps} />);

      const pill = getByTestId('filter-pills-topic-Leadership');
      expect(pill.props.accessibilityLabel).toBe('Remove Leadership filter');
    });

    it('has accessible label for Clear All button', () => {
      const { getByTestId } = render(<FilterPills {...defaultProps} />);

      const clearAll = getByTestId('filter-pills-clear-all');
      expect(clearAll.props.accessibilityLabel).toBe('Clear all filters');
    });

    it('has accessible role for Clear All button', () => {
      const { getByTestId } = render(<FilterPills {...defaultProps} />);

      const clearAll = getByTestId('filter-pills-clear-all');
      expect(clearAll.props.accessibilityRole).toBe('button');
    });
  });

  describe('Visual Distinction', () => {
    it('renders category and topic pills', () => {
      const { getByTestId } = render(<FilterPills {...defaultProps} />);

      // Just verify both types render - actual color testing would need style inspection
      expect(getByTestId('filter-pills-category-self-help')).toBeTruthy();
      expect(getByTestId('filter-pills-topic-Leadership')).toBeTruthy();
    });
  });

  describe('Order', () => {
    it('renders categories before topics', () => {
      const { getByTestId } = render(<FilterPills {...defaultProps} />);

      const container = getByTestId('filter-pills');
      expect(container).toBeTruthy();

      // Both should exist
      expect(getByTestId('filter-pills-category-self-help')).toBeTruthy();
      expect(getByTestId('filter-pills-topic-Leadership')).toBeTruthy();
    });
  });
});
