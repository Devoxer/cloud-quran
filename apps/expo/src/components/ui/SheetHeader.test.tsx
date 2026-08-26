/**
 * SheetHeader tests (Story 23.22) — the unified bottom-sheet header unit.
 *
 * Covers: title renders with `accessibilityRole="header"`; the close × renders +
 * fires `onClose` (and respects `showClose={false}`); the trailing slot renders.
 */

jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    colors: {
      text: { primary: '#000', secondary: '#666', tertiary: '#999' },
      separator: '#ECE5DD',
    },
  }),
}));

import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { SheetHeader } from './SheetHeader';

describe('SheetHeader', () => {
  it('renders the title with header accessibility role', () => {
    render(<SheetHeader title="Add to Collection" onClose={jest.fn()} />);

    const title = screen.getByText('Add to Collection');
    expect(title).toBeTruthy();
    expect(title.props.accessibilityRole).toBe('header');
  });

  it('renders the close × and fires onClose when pressed', () => {
    const onClose = jest.fn();
    render(<SheetHeader title="Section Picker" onClose={onClose} closeTestID="sp-close" />);

    const close = screen.getByTestId('sp-close');
    expect(close.props.accessibilityLabel).toBe('Close');
    fireEvent.press(close);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('hides the close × when showClose is false', () => {
    render(
      <SheetHeader title="No Close" onClose={jest.fn()} showClose={false} closeTestID="nc-close" />
    );

    expect(screen.queryByTestId('nc-close')).toBeNull();
    expect(screen.queryByLabelText('Close')).toBeNull();
  });

  it('renders the trailing action slot', () => {
    render(
      <SheetHeader
        title="With Action"
        onClose={jest.fn()}
        trailingAction={<Text testID="trailing-node">+</Text>}
      />
    );

    expect(screen.getByTestId('trailing-node')).toBeTruthy();
  });
});
