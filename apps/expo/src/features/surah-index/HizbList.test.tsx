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

const mockNavigate = jest.fn();

jest.mock('quran-data', () => ({
  HIZB_METADATA: Array.from({ length: 60 }, (_, i) => ({
    number: i + 1,
    juz: Math.floor(i / 2) + 1,
    startSurah: 1,
    startVerse: 1,
    startPage: i * 10 + 1,
  })),
  SURAH_METADATA: [{ number: 1, nameArabic: '\u0627\u0644\u0641\u0627\u062a\u062d\u0629', nameEnglish: 'The Opening', nameTransliteration: 'Al-Fatihah', verseCount: 7, revelationType: 'meccan', order: 5 }],
  JUZ_METADATA: [{ number: 1, startSurah: 1, startVerse: 1, startPage: 1 }],
  TOTAL_PAGES: 604,
  getPageForVerse: jest.fn(() => 1), getFirstVerseForPage: jest.fn(() => ({ surah: 1, verse: 1 })),
  getJuzForPage: jest.fn(() => 1), getHizbForPage: jest.fn(() => 1),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: mockNavigate, push: jest.fn(), back: jest.fn() }),
}));

import { HizbList } from './HizbList';

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

describe('HizbList', () => {
  test('renders a FlatList with 60 hizb items', () => {
    const element = (HizbList as any)() as unknown as MockElement;
    expect(element.type).toBe('FlatList');
    const data = element.props.data as unknown[];
    expect(data.length).toBe(60);
  });

  test('has getItemLayout for O(1) scrolling', () => {
    const element = (HizbList as any)() as unknown as MockElement;
    const getItemLayout = element.props.getItemLayout as (...args: unknown[]) => unknown;
    expect(getItemLayout).toBeDefined();
    const layout = getItemLayout(null, 0) as { length: number; offset: number; index: number };
    expect(layout).toHaveProperty('length');
    expect(layout).toHaveProperty('offset');
    expect(layout).toHaveProperty('index');
  });

  test('getItemLayout accounts for separator height', () => {
    const element = (HizbList as any)() as unknown as MockElement;
    const getItemLayout = element.props.getItemLayout as (_: unknown, index: number) => { length: number; offset: number; index: number };
    const layout0 = getItemLayout(null, 0);
    const layout1 = getItemLayout(null, 1);
    expect(layout0.length).toBe(65); // ROW_HEIGHT (64) + hairlineWidth (1)
    expect(layout1.offset).toBe(65); // (ROW_HEIGHT + hairlineWidth) * 1
  });

  test('has contentContainerStyle for max-width', () => {
    const element = (HizbList as any)() as unknown as MockElement;
    const style = element.props.contentContainerStyle as Record<string, unknown>;
    expect(style.maxWidth).toBe(680);
    expect(style.alignSelf).toBe('center');
  });

  test('keyExtractor returns hizb-prefixed key', () => {
    const element = (HizbList as any)() as unknown as MockElement;
    const keyExtractor = element.props.keyExtractor as (item: { number: number }) => string;
    expect(keyExtractor({ number: 10 })).toBe('hizb-10');
  });

  test('renderItem shows hizb number, juz, and surah name', () => {
    const element = (HizbList as any)() as unknown as MockElement;
    const renderItem = element.props.renderItem as (info: { item: unknown }) => unknown;
    const rendered = renderItem({
      item: { number: 3, juz: 2, startSurah: 1, startVerse: 142, startPage: 22 },
    }) as unknown as MockElement;
    expect(rendered.type).toBe('Pressable');
    expect(rendered.props.accessibilityRole).toBe('button');
    expect(rendered.props.accessibilityLabel).toContain('Hizb 3');
    expect(rendered.props.accessibilityLabel).toContain('Juz 2');
  });

  test('calls navigateToVerse and navigates on press', () => {
    mockUIState.navigateToVerse.mockClear();
    mockNavigate.mockClear();
    const element = (HizbList as any)() as unknown as MockElement;
    const renderItem = element.props.renderItem as (info: { item: unknown }) => unknown;
    const rendered = renderItem({
      item: { number: 3, juz: 2, startSurah: 2, startVerse: 142, startPage: 22 },
    }) as unknown as MockElement;
    const onPress = rendered.props.onPress as () => void;
    onPress();
    expect(mockUIState.navigateToVerse).toHaveBeenCalledWith(2, 142);
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  test('highlights current hizb with selection indicator', () => {
    const element = (HizbList as any)() as unknown as MockElement;
    const renderItem = element.props.renderItem as (info: { item: unknown }) => unknown;
    // currentHizb is 1 (mocked getHizbForPage returns 1)
    const selected = renderItem({
      item: { number: 1, juz: 1, startSurah: 1, startVerse: 1, startPage: 1 },
    }) as unknown as MockElement;
    const indicators = findElements(selected, (el) => {
      if (el.type !== 'View') return false;
      const styleArr = el.props.style;
      if (!Array.isArray(styleArr)) return false;
      const flat = Object.assign({}, ...styleArr);
      return flat.position === 'absolute' && flat.width === 3;
    });
    expect(indicators.length).toBe(1);
  });

  test('does not highlight non-current hizb', () => {
    const element = (HizbList as any)() as unknown as MockElement;
    const renderItem = element.props.renderItem as (info: { item: unknown }) => unknown;
    const unselected = renderItem({
      item: { number: 10, juz: 5, startSurah: 4, startVerse: 88, startPage: 92 },
    }) as unknown as MockElement;
    const indicators = findElements(unselected, (el) => {
      if (el.type !== 'View') return false;
      const styleArr = el.props.style;
      if (!Array.isArray(styleArr)) return false;
      const flat = Object.assign({}, ...styleArr);
      return flat.position === 'absolute' && flat.width === 3;
    });
    expect(indicators.length).toBe(0);
  });
});
