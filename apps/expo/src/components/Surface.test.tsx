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

jest.mock('@/theme/ThemeProvider', () => {
  const { themes } = jest.requireActual('@/theme/tokens');
  return { useTheme: () => ({ tokens: themes.light, themeName: 'light' as const }) };
});

jest.mock('@/theme/useUIStore', () => {
  const mockState = {
    selectedTheme: 'system', currentMode: 'reading', fontSize: 28, currentSurah: 1,
    currentVerse: 1, lastReadTimestamp: Date.now(), isChromeVisible: true, scrollVersion: 0,
    setTheme: jest.fn(), setMode: jest.fn(), setFontSize: jest.fn(), setCurrentSurah: jest.fn(),
    setCurrentVerse: jest.fn(), navigateToVerse: jest.fn(), syncReadingPosition: jest.fn(),
    toggleChrome: jest.fn(), showChrome: jest.fn(), hideChrome: jest.fn(),
  };
  const useUIStore = Object.assign(
    (selector: (s: typeof mockState) => unknown) => selector(mockState),
    { getState: () => mockState, setState: () => {}, subscribe: () => () => {} },
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

import { themes } from '@/theme/tokens';
import { Surface } from './Surface';

interface MockElement {
  props: { style: Record<string, unknown>[]; testID?: string };
}

describe('Surface', () => {
  test('renders with primary surface background by default', () => {
    const element = Surface({}) as unknown as MockElement;
    expect(element.props.style).toContainEqual({ backgroundColor: themes.light.surface.primary });
  });

  test('renders with secondary surface background when variant is secondary', () => {
    const element = Surface({ variant: 'secondary' }) as unknown as MockElement;
    expect(element.props.style).toContainEqual({
      backgroundColor: themes.light.surface.secondary,
    });
  });

  test('passes through custom style and extra props', () => {
    const element = Surface({
      style: { padding: 16 },
      testID: 'my-surface',
    }) as unknown as MockElement;
    expect(element.props.style).toContainEqual({ padding: 16 });
    expect(element.props.testID).toBe('my-surface');
  });

  test('includes flex: 1 container style', () => {
    const element = Surface({}) as unknown as MockElement;
    expect(element.props.style).toContainEqual({ flex: 1 });
  });
});
