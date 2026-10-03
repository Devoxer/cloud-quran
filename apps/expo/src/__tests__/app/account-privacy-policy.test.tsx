/**
 * Settings links the published privacy policy (2026-10-03). The stores require a policy URL, and
 * the reader should reach the same statement from inside the app. The URL is written out here as a
 * literal, so a constant that drifts to a page that does not exist reddens this.
 */
const mockOpenBrowser = jest.fn(async () => ({ type: 'opened' }));
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: (...args: unknown[]) => mockOpenBrowser(...(args as [])),
}));

jest.mock('@/lib/sync', () => ({
  patchPreferences: jest.fn(),
  usePreferences: () => ({ data: null }),
}));

jest.mock('expo-router', () => {
  const Stack = Object.assign(() => null, { Screen: () => null });
  return {
    Stack,
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
    useSegments: () => ['(tabs)', '(profile)', 'account'],
  };
});

import { fireEvent, render, screen } from '@testing-library/react-native';

import AccountScreen from '@/app/(tabs)/(profile)/account';

it('opens the published privacy policy in the browser', () => {
  render(<AccountScreen />);
  fireEvent.press(screen.getByTestId('privacy-policy-row'));
  expect(mockOpenBrowser).toHaveBeenCalledWith('https://cloudquran.nobleachievements.com/privacy');
});
