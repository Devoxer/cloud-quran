/**
 * AppHeader — the history-conditional back, the slots, and the picker-entry title (story 6-6).
 * The cross-platform parity of the control set is `__tests__/app/chrome-parity.test.tsx`'s; the
 * resolved colours are `tab-chrome.test.tsx`'s and the contrast gate's. This file drives the
 * component's own behaviour.
 */

import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

const mockBack = jest.fn();
const mockCanGoBack = jest.fn<boolean, []>(() => true);

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    canGoBack: () => mockCanGoBack(),
    navigate: jest.fn(),
    replace: jest.fn(),
    push: jest.fn(),
  }),
  useSegments: () => ['(tabs)', '(profile)', 'sign-in'],
}));

import { AppHeader } from './AppHeader';

beforeEach(() => {
  jest.clearAllMocks();
  mockCanGoBack.mockReturnValue(true);
});

describe('the back control is history-conditional', () => {
  it('is present with history, and pops', () => {
    render(<AppHeader title="Sign In" />);
    fireEvent.press(screen.getByTestId('chrome-back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('is ABSENT with no history — not inert', () => {
    mockCanGoBack.mockReturnValue(false);
    render(<AppHeader title="Settings" />);
    expect(screen.queryByTestId('chrome-back')).toBeNull();
  });

  it('a shell that knows its own stack overrides the global answer — both directions', () => {
    // ⚠️ `router.canGoBack()` is computed over the FOCUSED path and was measured one commit
    // stale on a push (the chevron missed its first frame in the settings shell). `showBack`
    // lets a layout derive the answer from the same segments as its title.
    mockCanGoBack.mockReturnValue(false);
    render(<AppHeader title="Sign In" showBack />);
    expect(screen.getByTestId('chrome-back')).toBeTruthy();
    screen.unmount();
    mockCanGoBack.mockReturnValue(true);
    render(<AppHeader title="Settings" showBack={false} />);
    expect(screen.queryByTestId('chrome-back')).toBeNull();
  });
});

describe('the slots and the title', () => {
  it('renders the title, and leading/trailing content around it', () => {
    render(
      <AppHeader
        title="Al-Baqarah"
        leading={<Text testID="slot-leading">L</Text>}
        trailing={<Text testID="slot-trailing">T</Text>}
      />
    );
    expect(screen.getByText('Al-Baqarah')).toBeTruthy();
    expect(screen.getByTestId('slot-leading')).toBeTruthy();
    expect(screen.getByTestId('slot-trailing')).toBeTruthy();
  });

  it('the title is PLAIN TEXT without a handler — the picker entry is inert-by-absence', () => {
    // 6.3's surah/page picker arrives as `onTitlePress`; until then there must be no dead
    // control pretending to be one.
    render(<AppHeader title="Al-Baqarah" />);
    expect(screen.queryByTestId('chrome-title-entry')).toBeNull();
  });

  it('…and becomes the pressable jump affordance when 6.3 passes the handler', () => {
    const onTitlePress = jest.fn();
    render(<AppHeader title="Al-Baqarah" onTitlePress={onTitlePress} />);
    fireEvent.press(screen.getByTestId('chrome-title-entry'));
    expect(onTitlePress).toHaveBeenCalledTimes(1);
  });

  it('passes touches through everywhere except its controls (box-none)', () => {
    // The bar overlays a scrolling surface on the reading routes; an `auto` band swallows drags.
    render(<AppHeader title="Al-Baqarah" />);
    expect(screen.getByTestId('app-header').props.pointerEvents).toBe('box-none');
  });
});
