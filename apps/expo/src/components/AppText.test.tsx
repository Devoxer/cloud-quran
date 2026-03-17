// Mock React hooks to synchronous stubs
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

// Mock useTheme
jest.mock('@/theme/ThemeProvider', () => {
  const { themes } = jest.requireActual('@/theme/tokens');
  return {
    useTheme: () => ({ tokens: themes.light, themeName: 'light' as const }),
  };
});

// Mock useUIStore
const mockUIState = {
  selectedTheme: 'system' as string,
  currentMode: 'reading' as string,
  fontSize: 28,
  currentSurah: 1,
  currentVerse: 1,
  lastReadTimestamp: Date.now(),
  isChromeVisible: true,
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
};

jest.mock('@/theme/useUIStore', () => {
  const useUIStore = Object.assign(
    (selector: (s: typeof mockUIState) => unknown) => selector(mockUIState),
    {
      getState: () => mockUIState,
      setState: (partial: Partial<typeof mockUIState> | ((s: typeof mockUIState) => Partial<typeof mockUIState>)) => {
        Object.assign(mockUIState, typeof partial === 'function' ? partial(mockUIState) : partial);
      },
      subscribe: () => () => {},
    },
  );
  return { useUIStore };
});

// Mock quran-data
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
  getPageForVerse: jest.fn((_surah: number, _verse: number) => 1),
  getFirstVerseForPage: jest.fn((_page: number) => ({ surah: 1, verse: 1 })),
  getJuzForPage: jest.fn((_page: number) => 1),
  getHizbForPage: jest.fn((_page: number) => 1),
}));

import { KFGQPC_FONT_FAMILY, themes, typography } from '@/theme/tokens';
import { AppText } from './AppText';

interface MockElement {
  props: { style: (Record<string, unknown> | false | undefined)[] };
}

function getStyles(element: MockElement): Record<string, unknown>[] {
  return element.props.style.flat().filter(Boolean) as Record<string, unknown>[];
}

describe('AppText', () => {
  test('quran variant uses KFGQPC font family and RTL writing direction', () => {
    const element = AppText({ variant: 'quran' }) as unknown as MockElement;
    const styleArray = getStyles(element);
    const fontStyle = styleArray.find((s) => 'fontFamily' in s);
    expect(fontStyle!.fontFamily).toBe(KFGQPC_FONT_FAMILY);

    const rtlStyle = styleArray.find((s) => 'writingDirection' in s);
    expect(rtlStyle!.writingDirection).toBe('rtl');
  });

  test('quran variant uses adjustable fontSize from store and correct lineHeight', () => {
    const element = AppText({ variant: 'quran' }) as unknown as MockElement;
    const styleArray = getStyles(element);
    const fontStyle = styleArray.find((s) => 'fontSize' in s);
    expect(fontStyle!.fontSize).toBe(28);
    expect(fontStyle!.lineHeight).toBe(Math.round(28 * typography.quran.lineHeightMultiplier));
  });

  test('translation variant uses correct sizing without KFGQPC font', () => {
    const element = AppText({ variant: 'translation' }) as unknown as MockElement;
    const styleArray = getStyles(element);
    const fontStyle = styleArray.find((s) => 'fontSize' in s);
    expect(fontStyle!.fontSize).toBe(16);
    expect(fontStyle!.lineHeight).toBe(
      Math.round(16 * typography.translation.lineHeightMultiplier),
    );
    expect(fontStyle!.fontFamily).toBeUndefined();
  });

  test('ui variant applies theme text.ui color', () => {
    const element = AppText({ variant: 'ui' }) as unknown as MockElement;
    const styleArray = getStyles(element);
    const colorStyle = styleArray.find((s) => 'color' in s);
    expect(colorStyle!.color).toBe(themes.light.text.ui);
  });

  test('quran variant applies theme text.quran color', () => {
    const element = AppText({ variant: 'quran' }) as unknown as MockElement;
    const styleArray = getStyles(element);
    const colorStyle = styleArray.find((s) => 'color' in s);
    expect(colorStyle!.color).toBe(themes.light.text.quran);
  });

  test('translation variant applies theme text.translation color', () => {
    const element = AppText({ variant: 'translation' }) as unknown as MockElement;
    const styleArray = getStyles(element);
    const colorStyle = styleArray.find((s) => 'color' in s);
    expect(colorStyle!.color).toBe(themes.light.text.translation);
  });

  test('surahTitleArabic variant uses KFGQPC font and RTL', () => {
    const element = AppText({ variant: 'surahTitleArabic' }) as unknown as MockElement;
    const styleArray = getStyles(element);
    const fontStyle = styleArray.find((s) => 'fontFamily' in s);
    expect(fontStyle!.fontFamily).toBe(KFGQPC_FONT_FAMILY);

    const rtlStyle = styleArray.find((s) => 'writingDirection' in s);
    expect(rtlStyle!.writingDirection).toBe('rtl');
  });

  test('non-Arabic variants do not apply RTL writing direction', () => {
    const element = AppText({ variant: 'ui' }) as unknown as MockElement;
    const styleArray = getStyles(element);
    const rtlStyle = styleArray.find((s) => 'writingDirection' in s);
    expect(rtlStyle).toBeUndefined();
  });
});
