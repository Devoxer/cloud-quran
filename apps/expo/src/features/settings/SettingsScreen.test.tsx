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
  selectedTheme: 'system' as string, currentMode: 'reading' as string, fontSize: 28,
  currentSurah: 1, currentVerse: 1, lastReadTimestamp: Date.now(), isChromeVisible: false, scrollVersion: 0,
  setTheme: jest.fn(), setMode: jest.fn(), setFontSize: jest.fn(), setCurrentSurah: jest.fn(),
  setCurrentVerse: jest.fn(), navigateToVerse: jest.fn(), syncReadingPosition: jest.fn(),
  toggleChrome: jest.fn(), showChrome: jest.fn(), hideChrome: jest.fn(),
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
    translation: { fontFamily: 'serif', fontSize: 16, fontWeight: '400', lineHeightMultiplier: 1.6 },
    verseNumber: { fontFamily: 'System', fontSize: 12, fontWeight: '500', lineHeightMultiplier: 1.0 },
    surahTitleArabic: { fontFamily: 'KFGQPC', fontSize: 22, fontWeight: '700', lineHeightMultiplier: 1.4 },
    surahTitleEnglish: { fontFamily: 'System', fontSize: 14, fontWeight: '500', lineHeightMultiplier: 1.4 },
    ui: { fontFamily: 'System', fontSize: 14, fontWeight: '400', lineHeightMultiplier: 1.4 },
    uiCaption: { fontFamily: 'System', fontSize: 12, fontWeight: '400', lineHeightMultiplier: 1.3 },
  },
  animation: { fade: 250, slide: 300, highlight: 150, theme: 400 },
}));

jest.mock('quran-data', () => ({
  SURAH_METADATA: [{ number: 1, nameArabic: '\u0627\u0644\u0641\u0627\u062a\u062d\u0629', nameEnglish: 'The Opening', nameTransliteration: 'Al-Fatihah', verseCount: 7, revelationType: 'meccan', order: 5 }],
  JUZ_METADATA: [{ number: 1, startSurah: 1, startVerse: 1, startPage: 1 }],
  HIZB_METADATA: [{ number: 1, juz: 1, startSurah: 1, startVerse: 1, startPage: 1 }],
  TOTAL_PAGES: 604,
  getPageForVerse: jest.fn(() => 1), getFirstVerseForPage: jest.fn(() => ({ surah: 1, verse: 1 })),
  getJuzForPage: jest.fn(() => 1), getHizbForPage: jest.fn(() => 1),
}));

jest.mock('@react-native-community/slider', () => ({ __esModule: true, default: 'Slider' }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '1.0.0' } } }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
  SafeAreaProvider: 'SafeAreaProvider',
}));
jest.mock('react-native-gesture-handler', () => ({
  Swipeable: 'Swipeable', GestureHandlerRootView: 'GestureHandlerRootView',
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: jest.fn(), push: jest.fn(), back: jest.fn() }),
}));
jest.mock('@expo/vector-icons/Ionicons', () => ({ __esModule: true, default: 'Ionicons' }));

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

describe('SettingsScreen', () => {
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
});
