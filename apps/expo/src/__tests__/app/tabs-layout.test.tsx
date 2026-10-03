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

import { renderRouter, screen } from 'expo-router/testing-library';
import { Text } from 'react-native';

import TabLayout from '@/app/(tabs)/_layout';

const stub = (label: string) => () => <Text>{label}</Text>;

const routes = {
  '(tabs)/_layout': TabLayout,
  '(tabs)/index': stub('mushaf tab'),
  '(tabs)/read': stub('read tab'),
  '(tabs)/bookmarks': stub('bookmarks tab'),
  '(tabs)/(profile)/index': stub('settings tab'),
};

it.each([
  ['/', 'mushaf tab'],
  ['/read', 'read tab'],
  ['/bookmarks', 'bookmarks tab'],
])('renders the tab at %s', async (path, label) => {
  renderRouter(routes, { initialUrl: path });
  expect(await screen.findByText(label)).toBeTruthy();
});
