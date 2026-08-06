function mockFullLightTheme() {
  return {
    surface: { primary: '#FAF8F5', secondary: '#F0EDE8' },
    text: { quran: '#1A1A1A', translation: '#4A4A4A', ui: '#6B6B6B' },
    accent: { highlight: '#FFF3CD', audio: '#2E7D5A', bookmark: '#C9956B' },
    border: '#E8E4DF',
    status: { error: '#C0392B', errorText: '#FFFFFF' },
  };
}

jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useCallback: (fn: unknown) => fn,
  useMemo: (fn: () => unknown) => (fn as () => unknown)(),
  useRef: (val: unknown) => ({ current: val ?? null }),
  useEffect: () => {},
  useState: (initial: unknown) => [
    typeof initial === 'function' ? (initial as () => unknown)() : initial,
    jest.fn(),
  ],
}));

jest.mock('@/theme/ThemeProvider', () => ({
  useTheme: () => ({ tokens: mockFullLightTheme(), themeName: 'light' as const }),
}));

const mockUIState = {
  fontSize: 28,
  autoFollowAudio: false,
  toggleAutoFollowAudio: jest.fn(),
  tapToSeek: false,
  toggleTapToSeek: jest.fn(),
};

jest.mock('@/theme/useUIStore', () => ({
  useUIStore: Object.assign(
    (selector: (s: typeof mockUIState) => unknown) => selector(mockUIState),
    { getState: () => mockUIState, setState: () => {}, subscribe: () => () => {} },
  ),
}));

jest.mock('@/theme/tokens', () => ({
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, '2xl': 32, '3xl': 48, '4xl': 64, '5xl': 96 },
  typography: {
    quran: { fontFamily: 'KFGQPC', fontSize: 28, fontWeight: '400', lineHeightMultiplier: 2.0 },
    translation: { fontFamily: 'serif', fontSize: 16, fontWeight: '400', lineHeightMultiplier: 1.6 },
    verseNumber: { fontFamily: 'System', fontSize: 12, fontWeight: '500', lineHeightMultiplier: 1.0 },
    surahTitleArabic: { fontFamily: 'KFGQPC', fontSize: 22, fontWeight: '700', lineHeightMultiplier: 1.4 },
    surahTitleEnglish: { fontFamily: 'System', fontSize: 14, fontWeight: '500', lineHeightMultiplier: 1.4 },
    ui: { fontFamily: 'System', fontSize: 14, fontWeight: '400', lineHeightMultiplier: 1.4 },
    uiCaption: { fontFamily: 'System', fontSize: 12, fontWeight: '400', lineHeightMultiplier: 1.3 },
  },
  KFGQPC_FONT_FAMILY: 'KFGQPC HAFS Uthmanic Script',
  animation: { fade: 250, slide: 300, highlight: 150, theme: 400 },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@expo/vector-icons/Ionicons', () => ({ __esModule: true, default: 'Ionicons' }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '1.0.0' } } }));
jest.mock('../components/FontSizeSlider', () => ({ FontSizeSlider: 'FontSizeSlider' }));
jest.mock('../components/ThemePicker', () => ({ ThemePicker: 'ThemePicker' }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) }),
}));

import { db } from '@/services/instantdb';

import { SettingsScreen } from '../SettingsScreen';

interface MockElement {
  type: string | ((...args: unknown[]) => unknown);
  props: Record<string, unknown>;
}

function findElements(element: unknown, predicate: (el: MockElement) => boolean): MockElement[] {
  const results: MockElement[] = [];
  function walk(node: unknown) {
    if (!node || typeof node !== 'object') return;
    const el = node as MockElement;
    if (predicate(el)) results.push(el);
    if (el.props?.children) {
      const children = Array.isArray(el.props.children) ? el.props.children : [el.props.children];
      children.forEach(walk);
    }
  }
  walk(element);
  return results;
}

describe('SettingsScreen - signed-in state', () => {
  it('shows email and "Syncing enabled" when user is authenticated', () => {
    (db.useAuth as jest.Mock).mockReturnValue({
      isLoading: false,
      user: { id: 'user-1', email: 'test@example.com', isGuest: false },
      error: null,
    });

    const element = (SettingsScreen as any)() as unknown as MockElement;
    const emailTexts = findElements(element, (el) => el.props?.children === 'test@example.com');
    const syncTexts = findElements(element, (el) => el.props?.children === 'Syncing enabled');

    expect(emailTexts.length).toBe(1);
    expect(syncTexts.length).toBe(1);
  });

  it('shows Sign out button when authenticated', () => {
    (db.useAuth as jest.Mock).mockReturnValue({
      isLoading: false,
      user: { id: 'user-1', email: 'test@example.com', isGuest: false },
      error: null,
    });

    const element = (SettingsScreen as any)() as unknown as MockElement;
    const signOutButtons = findElements(element, (el) => el.props?.accessibilityLabel === 'Sign out');
    expect(signOutButtons.length).toBe(1);
  });

  it('shows "Sign in to sync" when user is a guest', () => {
    (db.useAuth as jest.Mock).mockReturnValue({
      isLoading: false,
      user: { id: 'guest-1', isGuest: true },
      error: null,
    });

    const element = (SettingsScreen as any)() as unknown as MockElement;
    const syncTexts = findElements(
      element,
      (el) => el.props?.children === 'Sign in to sync across devices',
    );
    expect(syncTexts.length).toBeGreaterThan(0);
  });

  it('calls signOut and re-triggers guest auth on sign-out press', async () => {
    (db.useAuth as jest.Mock).mockReturnValue({
      isLoading: false,
      user: { id: 'user-1', email: 'test@example.com', isGuest: false },
      error: null,
    });

    const element = (SettingsScreen as any)() as unknown as MockElement;
    const [signOutButton] = findElements(element, (el) => el.props?.accessibilityLabel === 'Sign out');
    await (signOutButton.props.onPress as () => Promise<void>)();

    expect(db.auth.signOut).toHaveBeenCalled();
    expect(db.auth.signInAsGuest).toHaveBeenCalled();
  });
});
