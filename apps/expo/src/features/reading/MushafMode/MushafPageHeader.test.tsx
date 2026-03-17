jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useCallback: (fn: unknown) => fn,
  useMemo: (fn: () => unknown) => (fn as () => unknown)(),
  useRef: (val: unknown) => ({ current: val ?? null }),
  useEffect: () => {},
  useState: (initial: unknown) => [typeof initial === 'function' ? (initial as () => unknown)() : initial, jest.fn()],
}));

jest.mock('@/theme/ThemeProvider', () => {
  const { themes } = jest.requireActual('@/theme/tokens');
  return { useTheme: () => ({ tokens: themes.light, themeName: 'light' as const }) };
});

const mockUIState = {
  selectedTheme: 'system' as string, currentMode: 'mushaf' as string, fontSize: 28,
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
  SURAH_METADATA: [
    { number: 1, nameArabic: 'الفاتحة', nameEnglish: 'The Opening', nameTransliteration: 'Al-Fatihah', verseCount: 7, revelationType: 'meccan', order: 5 },
  ],
  JUZ_METADATA: [{ number: 1, startSurah: 1, startVerse: 1, startPage: 1 }],
  HIZB_METADATA: [{ number: 1, juz: 1, startSurah: 1, startVerse: 1, startPage: 1 }],
  TOTAL_PAGES: 604,
  getPageForVerse: jest.fn(() => 1),
  getFirstVerseForPage: jest.fn(() => ({ surah: 1, verse: 1 })),
  getJuzForPage: jest.fn((page: number) => (page >= 22 ? 2 : 1)),
  getHizbForPage: jest.fn((page: number) => (page >= 12 ? 2 : 1)),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

const imported = require('./MushafPageHeader');
const MushafPageHeader = imported.MushafPageHeader;

interface MockElement {
  type: string;
  props: Record<string, unknown>;
}

function findAllText(element: unknown): string[] {
  const texts: string[] = [];
  function walk(node: unknown) {
    if (typeof node === 'string') { texts.push(node); return; }
    if (typeof node === 'number') { texts.push(String(node)); return; }
    if (!node || typeof node !== 'object') return;
    const el = node as MockElement;
    if (el.props?.children) {
      const children = Array.isArray(el.props.children) ? el.props.children : [el.props.children];
      children.forEach(walk);
    }
  }
  walk(element);
  return texts;
}

// Get the inner render function from React.memo
const HeaderRender =
  (MushafPageHeader as unknown as { type: (...args: unknown[]) => unknown }).type || MushafPageHeader;

describe('MushafPageHeader', () => {
  test('renders juz and hizb info', () => {
    const element = (HeaderRender as any)({ pageNumber: 1, surahNumber: 1 });
    const texts = findAllText(element);
    const combined = texts.join(' ');
    expect(combined).toContain("Juz'");
    expect(combined).toContain('Hizb');
  });

  test('renders surah Arabic name and transliteration', () => {
    const element = (HeaderRender as any)({ pageNumber: 1, surahNumber: 1 });
    const texts = findAllText(element);
    const combined = texts.join(' ');
    expect(combined).toContain('الفاتحة');
    expect(combined).toContain('Al-Fatihah');
  });

  test('uses uiCaption variant for text', () => {
    const element = (HeaderRender as any)({ pageNumber: 1, surahNumber: 1 }) as MockElement;
    function findElements(el: unknown, pred: (e: MockElement) => boolean): MockElement[] {
      const results: MockElement[] = [];
      function walk(node: unknown) {
        if (!node || typeof node !== 'object') return;
        const e = node as MockElement;
        if (pred(e)) results.push(e);
        if (e.props?.children) {
          const children = Array.isArray(e.props.children) ? e.props.children : [e.props.children];
          children.forEach(walk);
        }
      }
      walk(el);
      return results;
    }
    const captions = findElements(element, (e) => e.props?.variant === 'uiCaption');
    expect(captions.length).toBe(2); // juz/hizb and surah name
  });

  test('has no bottom border separator', () => {
    const element = (HeaderRender as any)({ pageNumber: 1, surahNumber: 1 }) as MockElement;
    const style = element.props.style;
    const flatStyle = Array.isArray(style) ? Object.assign({}, ...style) : style as Record<string, unknown>;
    expect(flatStyle.borderBottomWidth).toBeUndefined();
  });
});
