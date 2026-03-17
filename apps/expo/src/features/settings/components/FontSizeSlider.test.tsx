// Full theme data for settings tests
const mockFullLightTheme = {
  surface: { primary: '#FAF8F5', secondary: '#F0EDE8' },
  text: { quran: '#1A1A1A', translation: '#4A4A4A', ui: '#6B6B6B' },
  accent: { highlight: '#FFF3CD', audio: '#2E7D5A', bookmark: '#C9956B' },
  border: '#E8E4DF',
  status: { error: '#C0392B', errorText: '#FFFFFF' },
};
const mockFullSepiaTheme = {
  surface: { primary: '#F5E6D3', secondary: '#EBD9C4' },
  text: { quran: '#2C1810', translation: '#5C3D2E', ui: '#7A5C4A' },
  accent: { highlight: '#FFE8B0', audio: '#2E7D5A', bookmark: '#A67B5B' },
  border: '#D4C4B0',
  status: { error: '#C0392B', errorText: '#FFFFFF' },
};
const mockFullDarkTheme = {
  surface: { primary: '#1C1C1E', secondary: '#2C2C2E' },
  text: { quran: '#E8E0D8', translation: '#A89B8E', ui: '#8A7D70' },
  accent: { highlight: '#3D3520', audio: '#4CAF7A', bookmark: '#C9956B' },
  border: '#3A3A3C',
  status: { error: '#C0392B', errorText: '#FFFFFF' },
};

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
  useTheme: () => ({ tokens: mockFullLightTheme, themeName: 'light' as const }),
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
  themes: { light: mockFullLightTheme, sepia: mockFullSepiaTheme, dark: mockFullDarkTheme },
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
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: 'SafeAreaProvider',
}));
jest.mock('react-native-gesture-handler', () => ({
  Swipeable: 'Swipeable', GestureHandlerRootView: 'GestureHandlerRootView',
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: jest.fn(), push: jest.fn(), back: jest.fn() }),
}));
jest.mock('@expo/vector-icons/Ionicons', () => ({ __esModule: true, default: 'Ionicons' }));

import { FontSizeSlider } from './FontSizeSlider';

interface MockElement {
  type: string;
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

describe('FontSizeSlider', () => {
  test('renders Slider component with correct min/max', () => {
    const element = (FontSizeSlider as any)() as unknown as MockElement;
    const sliders = findElements(element, (el) => el.type === 'Slider');
    expect(sliders.length).toBe(1);
    expect(sliders[0].props.minimumValue).toBe(20);
    expect(sliders[0].props.maximumValue).toBe(44);
    expect(sliders[0].props.step).toBe(2);
  });

  test('displays current fontSize value label', () => {
    const element = (FontSizeSlider as any)() as unknown as MockElement;
    const textElements = findElements(element, (el) => el.props?.children === 28);
    expect(textElements.length).toBeGreaterThan(0);
  });

  test('renders Arabic preview text', () => {
    const element = (FontSizeSlider as any)() as unknown as MockElement;
    const previewElements = findElements(element, (el) => {
      const children = el.props?.children;
      return (
        typeof children === 'string' && children.includes('\u0628\u0650\u0633\u0652\u0645\u0650')
      );
    });
    expect(previewElements.length).toBeGreaterThan(0);
  });

  test('Slider has accessibilityLabel', () => {
    const element = (FontSizeSlider as any)() as unknown as MockElement;
    const sliders = findElements(element, (el) => el.type === 'Slider');
    expect(sliders[0].props.accessibilityLabel).toBe('Font size');
  });

  test('calls setFontSize when slider value changes', () => {
    mockUIState.setFontSize.mockClear();
    const element = (FontSizeSlider as any)() as unknown as MockElement;
    const sliders = findElements(element, (el) => el.type === 'Slider');
    const onValueChange = sliders[0].props.onValueChange as (value: number) => void;
    onValueChange(32);
    expect(mockUIState.setFontSize).toHaveBeenCalledWith(32);
  });
});
