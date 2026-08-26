/**
 * Tests for SectionSkeleton (Story 23.11)
 *
 * The shared per-variant faux-shape body used by both the gated preview and the section
 * cold-load. Verifies each variant renders without crashing, the paragraph line count is
 * honored, and no real text is ever emitted.
 */

import { render, screen } from '@testing-library/react-native';
import { SectionSkeleton, type SectionSkeletonVariant } from './SectionSkeleton';

jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    colors: jest.requireActual('@/constants/Colors').default.light,
  }),
}));

describe('SectionSkeleton', () => {
  const variants: SectionSkeletonVariant[] = ['paragraph', 'bullets', 'quote', 'faq'];

  it.each(variants)('renders the "%s" variant without crashing', (variant) => {
    render(<SectionSkeleton variant={variant} testID={`sk-${variant}`} />);
    expect(screen.getByTestId(`sk-${variant}`)).toBeTruthy();
  });

  it('renders the requested number of paragraph lines', () => {
    const { UNSAFE_root } = render(<SectionSkeleton variant="paragraph" lines={6} testID="sk" />);
    const container = screen.getByTestId('sk');
    // The paragraph container holds exactly `lines` faux bars.
    expect(container.children.length).toBe(6);
    expect(UNSAFE_root).toBeTruthy();
  });

  it('clamps paragraph lines to a minimum of 2', () => {
    render(<SectionSkeleton variant="paragraph" lines={1} testID="sk" />);
    expect(screen.getByTestId('sk').children.length).toBe(2);
  });

  it('renders no real text (purely synthetic shapes)', () => {
    render(<SectionSkeleton variant="quote" />);
    // A faux preview must never surface copy.
    expect(screen.queryByText(/\w/)).toBeNull();
  });
});
