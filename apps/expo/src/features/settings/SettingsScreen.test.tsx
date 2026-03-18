// Full theme data as function declarations (hoisted, unlike const/let) to avoid TDZ in jest.mock factories
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function mockFullLightTheme() {
  return {
    surface: { primary: '#FAF8F5', secondary: '#F0EDE8' },
    text: { quran: '#1A1A1A', translation: '#4A4A4A', ui: '#6B6B6B' },
    accent: { highlight: '#FFF3CD', audio: '#2E7D5A', bookmark: '#C9956B' },
    border: '#E8E4DF',
    status: { error: '#C0392B', errorText: '#FFFFFF' },
  };
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function mockFullSepiaTheme() {
  return {
    surface: { primary: '#F5E6D3', secondary: '#EBD9C4' },
    text: { quran: '#2C1810', translation: '#5C3D2E', ui: '#7A5C4A' },
    accent: { highlight: '#FFE8B0', audio: '#2E7D5A', bookmark: '#A67B5B' },
    border: '#D4C4B0',
    status: { error: '#C0392B', errorText: '#FFFFFF' },
  };
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function mockFullDarkTheme() {
  return {
    surface: { primary: '#1C1C1E', secondary: '#2C2C2E' },
    text: { quran: '#E8E0D8', translation: '#A89B8E', ui: '#8A7D70' },
    accent: { highlight: '#3D3520', audio: '#4CAF7A', bookmark: '#C9956B' },
    border: '#3A3A3C',
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
  selectedTheme: 'system' as string,
  currentMode: 'reading' as string,
  fontSize: 28,
  currentSurah: 1,
  currentVerse: 1,
  lastReadTimestamp: Date.now(),
  isChromeVisible: false,
  scrollVersion: 0,
  setTheme: jest.fn(),
  setMode: jest.fn(),
  setFontSize: jest.fn(),
  setCurrentSurah: jest.fn(),
  setCurrentVerse: jest.fn(),
  navigateToVerse: jest.fn(),
  syncReadingPosition: jest.fn(),
  toggleChrome: jest.fn(),
  showChrome: jest.fn(),
  hideChrome: jest.fn(),
  showTransliteration: false,
  toggleTransliteration: jest.fn(),
};

jest.mock('@/theme/useUIStore', () => {
  const useUIStore = Object.assign(
    (selector: (s: typeof mockUIState) => unknown) => selector(mockUIState),
    { getState: () => mockUIState, setState: () => {}, subscribe: () => () => {} },
  );
  return { useUIStore };
});

jest.mock('@/theme/tokens', () => ({
  themes: { light: mockFullLightTheme(), sepia: mockFullSepiaTheme(), dark: mockFullDarkTheme() },
  KFGQPC_FONT_FAMILY: 'KFGQPC HAFS Uthmanic Script',
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, '2xl': 32, '3xl': 48, '4xl': 64, '5xl': 96 },
  typography: {
    quran: { fontFamily: 'KFGQPC', fontSize: 28, fontWeight: '400', lineHeightMultiplier: 2.0 },
    translation: {
      fontFamily: 'serif',
      fontSize: 16,
      fontWeight: '400',
      lineHeightMultiplier: 1.6,
    },
    verseNumber: {
      fontFamily: 'System',
      fontSize: 12,
      fontWeight: '500',
      lineHeightMultiplier: 1.0,
    },
    surahTitleArabic: {
      fontFamily: 'KFGQPC',
      fontSize: 22,
      fontWeight: '700',
      lineHeightMultiplier: 1.4,
    },
    surahTitleEnglish: {
      fontFamily: 'System',
      fontSize: 14,
      fontWeight: '500',
      lineHeightMultiplier: 1.4,
    },
    ui: { fontFamily: 'System', fontSize: 14, fontWeight: '400', lineHeightMultiplier: 1.4 },
    uiCaption: { fontFamily: 'System', fontSize: 12, fontWeight: '400', lineHeightMultiplier: 1.3 },
    transliteration: { fontFamily: 'System', fontSize: 14, fontWeight: '400', fontStyle: 'italic', lineHeightMultiplier: 1.5 },
  },
  animation: { fade: 250, slide: 300, highlight: 150, theme: 400 },
}));

jest.mock('quran-data', () => ({
  SURAH_METADATA: [
    {
      number: 1,
      nameArabic: '\u0627\u0644\u0641\u0627\u062a\u062d\u0629',
      nameEnglish: 'The Opening',
      nameTransliteration: 'Al-Fatihah',
      verseCount: 7,
      revelationType: 'meccan',
      order: 5,
    },
  ],
  JUZ_METADATA: [{ number: 1, startSurah: 1, startVerse: 1, startPage: 1 }],
  HIZB_METADATA: [{ number: 1, juz: 1, startSurah: 1, startVerse: 1, startPage: 1 }],
  TOTAL_PAGES: 604,
  getPageForVerse: jest.fn(() => 1),
  getFirstVerseForPage: jest.fn(() => ({ surah: 1, verse: 1 })),
  getJuzForPage: jest.fn(() => 1),
  getHizbForPage: jest.fn(() => 1),
}));

jest.mock('@react-native-community/slider', () => ({ __esModule: true, default: 'Slider' }));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '1.0.0' } },
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
  SafeAreaProvider: 'SafeAreaProvider',
}));
jest.mock('react-native-gesture-handler', () => ({
  Swipeable: 'Swipeable',
  GestureHandlerRootView: 'GestureHandlerRootView',
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), navigate: jest.fn() },
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), navigate: jest.fn() }),
}));
const mockRouter = require('expo-router').router;
jest.mock('@expo/vector-icons/Ionicons', () => ({ __esModule: true, default: 'Ionicons' }));

let mockIsAuthenticated = false;
let mockEmail: string | null = null;
let mockDisplayName: string | null = null;
const mockClearUser = jest.fn();
const mockAuthStoreState = {
  isAuthenticated: false,
  email: null as string | null,
  displayName: null as string | null,
  userId: null,
  clearUser: mockClearUser,
  setUser: jest.fn(),
};

jest.mock('@/features/auth', () => ({
  useIsAuthenticated: () => mockIsAuthenticated,
  useAuthStore: Object.assign(
    (selector: (s: typeof mockAuthStoreState) => unknown) => {
      mockAuthStoreState.isAuthenticated = mockIsAuthenticated;
      mockAuthStoreState.email = mockEmail;
      mockAuthStoreState.displayName = mockDisplayName;
      return selector(mockAuthStoreState);
    },
    { getState: () => mockAuthStoreState, setState: () => {}, subscribe: () => () => {} },
  ),
}));

jest.mock('@/features/auth/components/ConsentScreen', () => ({
  hasGdprConsent: () => false,
}));

jest.mock('@/services/auth-client', () => ({
  authClient: { signOut: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock('@/services/secure-store', () => ({
  clearAuthToken: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/services/query-client', () => ({
  queryClient: { clear: jest.fn() },
}));

const mockApiDelete = jest.fn().mockResolvedValue({ ok: true });
const mockApiExportGet = jest.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({ exportedAt: '2026-03-17', user: null, data: {} }),
});
jest.mock('@/services/api', () => ({
  api: {
    api: {
      user: {
        data: { $delete: (...args: unknown[]) => mockApiDelete(...args) },
        export: { $get: (...args: unknown[]) => mockApiExportGet(...args) },
      },
    },
  },
}));

jest.mock('expo-file-system', () => ({
  Paths: { cache: '/tmp/' },
  File: jest.fn().mockImplementation(() => ({
    uri: '/tmp/cloud-quran-export.json',
    write: jest.fn(),
  })),
}));

jest.mock('expo-sharing', () => ({
  shareAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('react-native-mmkv', () => ({
  createMMKV: () => ({
    set: jest.fn(),
    getString: jest.fn(),
    getBoolean: jest.fn(() => false),
    remove: jest.fn(),
  }),
}));

jest.mock('@/services/notifications', () => ({
  requestNotificationPermission: jest.fn().mockResolvedValue(true),
  scheduleReadingReminder: jest.fn().mockResolvedValue(undefined),
  cancelAllReminders: jest.fn().mockResolvedValue(undefined),
}));

const mockReminderState = {
  reminderEnabled: false,
  reminderHour: 8,
  reminderMinute: 0,
  reminderDays: [1, 2, 3, 4, 5, 6, 7],
  toggleReminder: jest.fn(),
  setReminderTime: jest.fn(),
  setReminderDays: jest.fn(),
};

jest.mock('@/features/reminders/useReminderStore', () => {
  const useReminderStore = Object.assign(
    (selector: (s: typeof mockReminderState) => unknown) => selector(mockReminderState),
    {
      getState: () => mockReminderState,
      setState: () => {},
      subscribe: () => () => {},
    },
  );
  return { useReminderStore };
});

import { SettingsScreen } from './SettingsScreen';

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

function getTypeName(el: MockElement): string {
  if (typeof el.type === 'string') return el.type;
  if (typeof el.type === 'function') return el.type.name || '';
  return '';
}

function findTextContent(element: unknown): string[] {
  const texts: string[] = [];
  function walk(node: unknown) {
    if (!node || typeof node !== 'object') return;
    if (typeof node === 'string') {
      texts.push(node);
      return;
    }
    const el = node as MockElement;
    if (typeof el.props?.children === 'string') texts.push(el.props.children);
    if (el.props?.children) {
      const children = Array.isArray(el.props.children) ? el.props.children : [el.props.children];
      children.forEach(walk);
    }
  }
  walk(element);
  return texts;
}

describe('SettingsScreen', () => {
  beforeEach(() => {
    mockIsAuthenticated = false;
    mockEmail = null;
    mockDisplayName = null;
    jest.clearAllMocks();
  });

  test('renders Appearance section header', () => {
    const element = (SettingsScreen as any)() as unknown as MockElement;
    const headers = findElements(element, (el) => el.props?.title === 'Appearance');
    expect(headers.length).toBeGreaterThan(0);
  });

  test('contains ThemePicker component', () => {
    const element = (SettingsScreen as any)() as unknown as MockElement;
    const pickers = findElements(element, (el) => getTypeName(el) === 'ThemePicker');
    expect(pickers.length).toBe(1);
  });

  test('contains FontSizeSlider component', () => {
    const element = (SettingsScreen as any)() as unknown as MockElement;
    const sliders = findElements(element, (el) => getTypeName(el) === 'FontSizeSlider');
    expect(sliders.length).toBe(1);
  });

  test('renders About section header', () => {
    const element = (SettingsScreen as any)() as unknown as MockElement;
    const headers = findElements(element, (el) => el.props?.title === 'About');
    expect(headers.length).toBeGreaterThan(0);
  });

  test('renders version text', () => {
    const element = (SettingsScreen as any)() as unknown as MockElement;
    const versionTexts = findElements(element, (el) => el.props?.children === 'Cloud Quran v1.0.0');
    expect(versionTexts.length).toBeGreaterThan(0);
  });

  test('uses Surface as container', () => {
    const element = (SettingsScreen as any)() as unknown as MockElement;
    expect(getTypeName(element)).toBe('Surface');
  });

  test('renders "Sign in to sync" row when anonymous', () => {
    mockIsAuthenticated = false;
    const element = (SettingsScreen as any)() as unknown as MockElement;
    const texts = findTextContent(element);
    expect(texts).toContain('Sign in to sync across devices');
    const accountHeaders = findElements(element, (el) => el.props?.title === 'Account');
    expect(accountHeaders.length).toBeGreaterThan(0);
  });

  test('renders Account section with signed-in state when authenticated', () => {
    mockIsAuthenticated = true;
    mockEmail = 'user@example.com';
    mockDisplayName = 'Test User';
    const element = (SettingsScreen as any)() as unknown as MockElement;
    const texts = findTextContent(element);
    expect(texts).not.toContain('Sign in to sync across devices');
    expect(texts).toContain('Test User');
    expect(texts).toContain('user@example.com');
    const accountHeaders = findElements(element, (el) => el.props?.title === 'Account');
    expect(accountHeaders.length).toBeGreaterThan(0);
  });

  test('renders Sign Out button in Privacy & Data section when authenticated', () => {
    mockIsAuthenticated = true;
    mockEmail = 'user@example.com';
    const element = (SettingsScreen as any)() as unknown as MockElement;
    const signOutButtons = findElements(
      element,
      (el) => el.props?.accessibilityLabel === 'Sign out',
    );
    expect(signOutButtons.length).toBe(1);
  });

  test('sign-in button navigates to consent when no GDPR consent', () => {
    mockIsAuthenticated = false;
    const element = (SettingsScreen as any)() as unknown as MockElement;
    const signInButton = findElements(
      element,
      (el) => el.props?.accessibilityLabel === 'Sign in to sync across devices',
    )[0];
    const handler = signInButton.props.onPress as () => void;
    handler();
    expect(mockRouter.push).toHaveBeenCalledWith('/(auth)/consent');
  });

  test('renders Privacy & Data section header', () => {
    const element = (SettingsScreen as any)() as unknown as MockElement;
    const headers = findElements(element, (el) => el.props?.title === 'Privacy & Data');
    expect(headers.length).toBeGreaterThan(0);
  });

  test('renders Privacy Policy and Source Code links always', () => {
    mockIsAuthenticated = false;
    const element = (SettingsScreen as any)() as unknown as MockElement;
    const texts = findTextContent(element);
    expect(texts).toContain('Privacy Policy');
    expect(texts).toContain('Source Code');
  });

  test('renders Export and Delete buttons when authenticated', () => {
    mockIsAuthenticated = true;
    mockEmail = 'user@example.com';
    const element = (SettingsScreen as any)() as unknown as MockElement;
    const exportBtn = findElements(
      element,
      (el) => el.props?.accessibilityLabel === 'Export my data',
    );
    expect(exportBtn.length).toBe(1);
    const deleteBtn = findElements(
      element,
      (el) => el.props?.accessibilityLabel === 'Delete all synced data',
    );
    expect(deleteBtn.length).toBe(1);
  });

  test('does NOT render Export and Delete buttons when anonymous', () => {
    mockIsAuthenticated = false;
    const element = (SettingsScreen as any)() as unknown as MockElement;
    const exportBtn = findElements(
      element,
      (el) => el.props?.accessibilityLabel === 'Export my data',
    );
    expect(exportBtn.length).toBe(0);
    const deleteBtn = findElements(
      element,
      (el) => el.props?.accessibilityLabel === 'Delete all synced data',
    );
    expect(deleteBtn.length).toBe(0);
  });

  test('delete data button triggers confirmation dialog', () => {
    mockIsAuthenticated = true;
    mockEmail = 'user@example.com';
    const alertSpy = jest.spyOn(require('react-native').Alert, 'alert');
    const element = (SettingsScreen as any)() as unknown as MockElement;
    const deleteBtn = findElements(
      element,
      (el) => el.props?.accessibilityLabel === 'Delete all synced data',
    )[0];
    const handler = deleteBtn.props.onPress as () => void;
    handler();
    expect(alertSpy).toHaveBeenCalledWith(
      'Delete All Synced Data',
      expect.any(String),
      expect.arrayContaining([
        expect.objectContaining({ text: 'Cancel', style: 'cancel' }),
        expect.objectContaining({ text: 'Delete', style: 'destructive' }),
      ]),
    );
    alertSpy.mockRestore();
  });

  test('export data button calls API', async () => {
    mockIsAuthenticated = true;
    mockEmail = 'user@example.com';
    const element = (SettingsScreen as any)() as unknown as MockElement;
    const exportBtn = findElements(
      element,
      (el) => el.props?.accessibilityLabel === 'Export my data',
    )[0];
    const handler = exportBtn.props.onPress as () => Promise<void>;
    await handler();
    expect(mockApiExportGet).toHaveBeenCalled();
  });

  test('delete confirmation calls API and clears auth on success', async () => {
    mockIsAuthenticated = true;
    mockEmail = 'user@example.com';
    const alertSpy = jest.spyOn(require('react-native').Alert, 'alert');
    const element = (SettingsScreen as any)() as unknown as MockElement;
    const deleteBtn = findElements(
      element,
      (el) => el.props?.accessibilityLabel === 'Delete all synced data',
    )[0];
    const handler = deleteBtn.props.onPress as () => void;
    handler();
    // Extract the onPress handler from the "Delete" button in the Alert
    const alertArgs = alertSpy.mock.calls[0];
    const buttons = alertArgs[2] as Array<{ text: string; onPress?: () => void }>;
    const deleteButton = buttons.find((b) => b.text === 'Delete');
    await deleteButton!.onPress!();
    expect(mockApiDelete).toHaveBeenCalled();
    expect(require('@/services/auth-client').authClient.signOut).toHaveBeenCalled();
    expect(require('@/services/secure-store').clearAuthToken).toHaveBeenCalled();
    expect(mockClearUser).toHaveBeenCalled();
    expect(require('@/services/query-client').queryClient.clear).toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  test('delete shows error alert when API fails', async () => {
    mockIsAuthenticated = true;
    mockEmail = 'user@example.com';
    mockApiDelete.mockResolvedValueOnce({ ok: false, status: 500 });
    const alertSpy = jest.spyOn(require('react-native').Alert, 'alert');
    const element = (SettingsScreen as any)() as unknown as MockElement;
    const deleteBtn = findElements(
      element,
      (el) => el.props?.accessibilityLabel === 'Delete all synced data',
    )[0];
    const handler = deleteBtn.props.onPress as () => void;
    handler();
    const alertArgs = alertSpy.mock.calls[0];
    const buttons = alertArgs[2] as Array<{ text: string; onPress?: () => void }>;
    const deleteButton = buttons.find((b) => b.text === 'Delete');
    await deleteButton!.onPress!();
    // Should show error alert, not success
    const errorCall = alertSpy.mock.calls.find((c) => c[0] === 'Error');
    expect(errorCall).toBeDefined();
    // Auth should NOT have been cleared
    expect(require('@/services/auth-client').authClient.signOut).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  test('export shows error alert when API fails', async () => {
    mockIsAuthenticated = true;
    mockEmail = 'user@example.com';
    mockApiExportGet.mockResolvedValueOnce({ ok: false, status: 500 });
    const alertSpy = jest.spyOn(require('react-native').Alert, 'alert');
    const element = (SettingsScreen as any)() as unknown as MockElement;
    const exportBtn = findElements(
      element,
      (el) => el.props?.accessibilityLabel === 'Export my data',
    )[0];
    const handler = exportBtn.props.onPress as () => Promise<void>;
    await handler();
    const errorCall = alertSpy.mock.calls.find((c) => c[0] === 'Error');
    expect(errorCall).toBeDefined();
    alertSpy.mockRestore();
  });

  test('shows sync status in Privacy & Data section', () => {
    mockIsAuthenticated = true;
    mockEmail = 'user@example.com';
    const element = (SettingsScreen as any)() as unknown as MockElement;
    const texts = findTextContent(element);
    expect(texts.some((t) => t.includes('Sync active'))).toBe(true);
  });

  test('shows sync off status when anonymous', () => {
    mockIsAuthenticated = false;
    const element = (SettingsScreen as any)() as unknown as MockElement;
    const texts = findTextContent(element);
    expect(texts.some((t) => t.includes('Sync off'))).toBe(true);
  });

  test('renders transliteration toggle in Appearance section', () => {
    const element = (SettingsScreen as any)() as unknown as MockElement;
    const texts = findTextContent(element);
    expect(texts).toContain('Show transliteration');
    expect(texts).toContain('Display Latin-script pronunciation below Arabic text');
  });

  test('transliteration toggle row is pressable and fires toggleTransliteration', () => {
    mockUIState.toggleTransliteration.mockClear();
    const element = (SettingsScreen as any)() as unknown as MockElement;
    // Find a Pressable row that contains "Show transliteration" text
    const pressables = findElements(element, (el) => {
      if (el.type !== 'Pressable') return false;
      const texts = findTextContent(el);
      return texts.some((t) => t.includes('Show transliteration'));
    });
    expect(pressables.length).toBe(1);
    (pressables[0].props.onPress as () => void)();
    expect(mockUIState.toggleTransliteration).toHaveBeenCalled();
  });

  test('renders Reading Reminders section header', () => {
    const element = (SettingsScreen as any)() as unknown as MockElement;
    const headers = findElements(element, (el) => el.props?.title === 'Reading Reminders');
    expect(headers.length).toBeGreaterThan(0);
  });

  test('renders ReminderSettings component', () => {
    const element = (SettingsScreen as any)() as unknown as MockElement;
    const reminders = findElements(element, (el) => getTypeName(el) === 'ReminderSettings');
    expect(reminders.length).toBe(1);
  });

  test('renders Feedback section header', () => {
    const element = (SettingsScreen as any)() as unknown as MockElement;
    const headers = findElements(element, (el) => el.props?.title === 'Feedback');
    expect(headers.length).toBeGreaterThan(0);
  });

  test('renders Email Us feedback link', () => {
    const element = (SettingsScreen as any)() as unknown as MockElement;
    const texts = findTextContent(element);
    expect(texts).toContain('Email Us');
    expect(texts).toContain('Send feedback, suggestions, or bug reports');
  });

  test('renders Report on GitHub feedback link', () => {
    const element = (SettingsScreen as any)() as unknown as MockElement;
    const texts = findTextContent(element);
    expect(texts).toContain('Report on GitHub');
    expect(texts).toContain('File a bug report or feature request');
  });

  test('Email Us link is pressable with correct accessibility', () => {
    const element = (SettingsScreen as any)() as unknown as MockElement;
    const emailBtn = findElements(
      element,
      (el) => el.props?.accessibilityLabel === 'Email us',
    );
    expect(emailBtn.length).toBe(1);
    expect(emailBtn[0].props.accessibilityRole).toBe('link');
    expect(typeof emailBtn[0].props.onPress).toBe('function');
  });

  test('Report on GitHub link is pressable with correct accessibility', () => {
    const element = (SettingsScreen as any)() as unknown as MockElement;
    const githubBtn = findElements(
      element,
      (el) => el.props?.accessibilityLabel === 'Report on GitHub',
    );
    expect(githubBtn.length).toBe(1);
    expect(githubBtn[0].props.accessibilityRole).toBe('link');
    expect(typeof githubBtn[0].props.onPress).toBe('function');
  });

});
