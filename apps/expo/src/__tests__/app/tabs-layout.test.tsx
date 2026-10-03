/**
 * The tab shell renders its tabs (story 5-9, SDK 58).
 *
 * ⚠️ EXPO-ROUTER 58 STOPPED SHOWING UNDECLARED ROUTES. A `<Tabs>` with no `Tabs.Screen` children
 * rendered every tab as an empty screen — mushaf, read, bookmarks and settings all blank on web,
 * with only a dev-mode console warning. Every screen test passed, because they render the screen
 * component directly and never the navigator. This mounts the REAL `(tabs)/_layout` in a router
 * with stub screens, so a layout that declares nothing renders nothing and this reddens.
 */
// The navigator's tab view reads `SafeAreaInsetsContext`, which the global setup's slim mock does
// not carry; the package's own Jest mock does.
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default
);

import { act } from '@testing-library/react-native';
import { router, Stack } from 'expo-router';
import { renderRouter, screen } from 'expo-router/testing-library';
import { BackHandler, Text } from 'react-native';

import TabLayout from '@/app/(tabs)/_layout';

const stub = (label: string) => () => <Text>{label}</Text>;

const routes = {
  '(tabs)/_layout': TabLayout,
  '(tabs)/index': stub('mushaf tab'),
  '(tabs)/read': stub('read tab'),
  '(tabs)/bookmarks': stub('bookmarks tab'),
  '(tabs)/(profile)/_layout': () => <Stack screenOptions={{ headerShown: false }} />,
  '(tabs)/(profile)/account': stub('settings tab'),
  '(tabs)/(profile)/recitation': stub('recitation screen'),
};

it.each([
  ['/', 'mushaf tab'],
  ['/read', 'read tab'],
  ['/bookmarks', 'bookmarks tab'],
])('renders the tab at %s', async (path, label) => {
  renderRouter(routes, { initialUrl: path });
  expect(await screen.findByText(label)).toBeTruthy();
});

/**
 * Android hardware back at a tab root goes home, not out of the app (`useBackToHome`).
 * The handler is captured from `BackHandler.addEventListener`, the call the layout makes.
 */
describe('hardware back', () => {
  function captureBack() {
    const handlers: (() => boolean)[] = [];
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
      handlers.push(handler as () => boolean);
      return { remove: () => handlers.splice(handlers.indexOf(handler as () => boolean), 1) };
    });
    // As the real BackHandler does: newest listener first, until one handles the press.
    return () => [...handlers].reverse().some((handler) => handler());
  }

  afterEach(() => jest.restoreAllMocks());

  it('takes the reader from a tab root back to the mushaf, and keeps the app open', async () => {
    const pressBack = captureBack();
    renderRouter(routes, { initialUrl: '/read' });
    expect(await screen.findByText('read tab')).toBeTruthy();

    let handled: boolean | undefined;
    act(() => {
      handled = pressBack();
    });
    expect(handled).toBe(true);
    expect(await screen.findByText('mushaf tab')).toBeTruthy();
  });

  it('declines on the mushaf itself, so back leaves the app as Android expects', async () => {
    const pressBack = captureBack();
    renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByText('mushaf tab')).toBeTruthy();
    expect(pressBack()).toBe(false);
  });

  it('leaves a pushed screen to navigation, which pops it — it does not jump home', async () => {
    const pressBack = captureBack();
    renderRouter(routes, { initialUrl: '/account' });
    expect(await screen.findByText('settings tab')).toBeTruthy();
    act(() => router.push('/recitation'));
    expect(await screen.findByText('recitation screen')).toBeTruthy();

    act(() => {
      pressBack();
    });
    expect(await screen.findByText('settings tab')).toBeTruthy();
    expect(screen.queryByText('mushaf tab')).toBeNull();
  });
});
