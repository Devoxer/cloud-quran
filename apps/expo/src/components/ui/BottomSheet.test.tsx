/**
 * Render-smoke for the BottomSheet wrapper (Story 17.4 §A, AC 9).
 *
 * Backed by `@expo/ui/community/bottom-sheet` (native sheet on iOS/Android, vaul
 * on web). jest-expo resolves the iOS variant, which hosts RN children via
 * `RNHostView` — so the children ARE queryable. We assert the wrapper renders
 * its content when `open`, renders nothing meaningful when closed, and forwards
 * the close handler. The native sheet chrome (drag handle, scrim, detents) is
 * OS-owned and verified in the iOS/Android visual smoke (Step E/K).
 */

// Story 23.22: the wrapper renders a themed `SheetHeader` when `title` is set,
// which reads `useTheme().colors` — provide it so the header path renders.
// Story 25.1 lint:style fix: the wrapper's own themed factory now reads
// `overlay.dark` + `background.primary` — the partial mock must carry them too.
jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    colors: {
      text: { primary: '#000', secondary: '#666', tertiary: '#999' },
      separator: '#ECE5DD',
      overlay: { dark: 'rgba(0,0,0,0.5)' },
      background: { primary: '#FFF' },
    },
  }),
}));

import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text, View } from 'react-native';
import { BottomSheet } from './BottomSheet';

describe('BottomSheet wrapper', () => {
  it('renders children without throwing when open', () => {
    render(
      <BottomSheet open onClose={jest.fn()} testID="smoke-sheet">
        <View>
          <Text>Sheet body</Text>
        </View>
      </BottomSheet>
    );
    expect(screen.getByText('Sheet body')).toBeTruthy();
    expect(screen.getByTestId('smoke-sheet')).toBeTruthy();
  });

  it('renders without throwing when closed', () => {
    expect(() =>
      render(
        <BottomSheet open={false} onClose={jest.fn()}>
          <Text>Hidden body</Text>
        </BottomSheet>
      )
    ).not.toThrow();
  });

  it('accepts snapPoints + backdropDismissable opt-out without throwing', () => {
    expect(() =>
      render(
        <BottomSheet open onClose={jest.fn()} snapPoints={['90%']} backdropDismissable={false}>
          <Text>Full sheet</Text>
        </BottomSheet>
      )
    ).not.toThrow();
  });

  // Story 23.22: opt-in unified header via `title`.
  describe('header (title prop)', () => {
    it('renders the SheetHeader title + close × when title is set', () => {
      const onClose = jest.fn();
      render(
        <BottomSheet open onClose={onClose} title="Add to Collection" closeTestID="sheet-close">
          <Text>Body</Text>
        </BottomSheet>
      );

      const title = screen.getByText('Add to Collection');
      expect(title.props.accessibilityRole).toBe('header');
      fireEvent.press(screen.getByTestId('sheet-close'));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('renders the header trailing action when title is set', () => {
      render(
        <BottomSheet
          open
          onClose={jest.fn()}
          title="With Action"
          headerTrailingAction={<Text testID="header-trailing">+</Text>}
        >
          <Text>Body</Text>
        </BottomSheet>
      );

      expect(screen.getByTestId('header-trailing')).toBeTruthy();
    });

    it('renders headerless (no header role) when title is omitted', () => {
      render(
        <BottomSheet open onClose={jest.fn()} testID="headerless">
          <Text>Body</Text>
        </BottomSheet>
      );

      expect(screen.queryByRole('header')).toBeNull();
      expect(screen.queryByLabelText('Close')).toBeNull();
    });
  });
});
