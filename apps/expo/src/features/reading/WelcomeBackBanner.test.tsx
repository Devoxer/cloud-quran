// Custom React mock for WelcomeBackBanner's useState tracking
let mockVisible = false;
const mockSetVisible = jest.fn((v: boolean | (() => boolean)) => {
  mockVisible = typeof v === 'function' ? v() : v;
});

jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useCallback: (fn: unknown) => fn,
  useMemo: (fn: () => unknown) => (fn as () => unknown)(),
  useRef: (val: unknown) => ({ current: val ?? null }),
  useEffect: () => {},
  useState: (initial: unknown) => {
    // Evaluate initializer function if provided
    const value = typeof initial === 'function' ? initial() : initial;
    mockVisible = value;
    return [mockVisible, mockSetVisible];
  },
}));

jest.mock('@/theme/ThemeProvider', () => {
  const { themes } = jest.requireActual('@/theme/tokens');
  return { useTheme: () => ({ tokens: themes.light, themeName: 'light' as const }) };
});

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

jest.mock('quran-data', () => ({
  SURAH_METADATA: [{ number: 1, nameArabic: '\u0627\u0644\u0641\u0627\u062a\u062d\u0629', nameEnglish: 'The Opening', nameTransliteration: 'Al-Fatihah', verseCount: 7, revelationType: 'meccan', order: 5 }],
  JUZ_METADATA: [{ number: 1, startSurah: 1, startVerse: 1, startPage: 1 }],
  HIZB_METADATA: [{ number: 1, juz: 1, startSurah: 1, startVerse: 1, startPage: 1 }],
  TOTAL_PAGES: 604,
  getPageForVerse: jest.fn(() => 1), getFirstVerseForPage: jest.fn(() => ({ surah: 1, verse: 1 })),
  getJuzForPage: jest.fn(() => 1), getHizbForPage: jest.fn(() => 1),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: jest.fn(), push: jest.fn(), back: jest.fn() }),
}));
jest.mock('@expo/vector-icons/Ionicons', () => ({ __esModule: true, default: 'Ionicons' }));

import { WelcomeBackBanner } from './WelcomeBackBanner';

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

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

describe('WelcomeBackBanner', () => {
  test('renders welcome message with surah name when lastReadTimestamp is > 7 days ago', () => {
    mockUIState.lastReadTimestamp = Date.now() - SEVEN_DAYS_MS - 1000; // 7 days + 1 second ago
    const mockOnDismiss = jest.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const element = (WelcomeBackBanner as any)({
      onDismiss: mockOnDismiss,
    }) as unknown as MockElement;
    // Should render (not null) since timestamp > 7 days
    expect(element).toBeDefined();
    expect(element).not.toBeNull();
    // Should contain welcome text
    const textElements = findElements(element, (el) => el.props?.variant === 'ui');
    const welcomeText = textElements.find((el) => {
      const children = el.props.children;
      const text = Array.isArray(children) ? children.join('') : String(children);
      return text.includes('Welcome back') && text.includes('The Opening');
    });
    expect(welcomeText).toBeDefined();
  });

  test('does not render when lastReadTimestamp is recent (< 7 days)', () => {
    mockUIState.lastReadTimestamp = Date.now() - 1000; // 1 second ago
    const mockOnDismiss = jest.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const element = (WelcomeBackBanner as any)({ onDismiss: mockOnDismiss });
    // Should return null since timestamp < 7 days
    expect(element).toBeNull();
  });

  test('renders as Animated.View container when visible', () => {
    mockUIState.lastReadTimestamp = Date.now() - SEVEN_DAYS_MS - 1000;
    const mockOnDismiss = jest.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const element = (WelcomeBackBanner as any)({
      onDismiss: mockOnDismiss,
    }) as unknown as MockElement;
    expect(element).toBeDefined();
    expect(element.type).toBe('Animated.View');
  });

  test('does not render when dismissed prop is true even if timestamp > 7 days', () => {
    mockUIState.lastReadTimestamp = Date.now() - SEVEN_DAYS_MS - 1000;
    const mockOnDismiss = jest.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const element = (WelcomeBackBanner as any)({
      onDismiss: mockOnDismiss,
      dismissed: true,
    });
    expect(element).toBeNull();
  });
});
