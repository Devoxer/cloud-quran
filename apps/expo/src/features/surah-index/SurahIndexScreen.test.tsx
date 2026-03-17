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
  SURAH_METADATA: Array.from({ length: 114 }, (_, i) => ({
    number: i + 1,
    nameArabic: '\u0633\u0648\u0631\u0629',
    nameEnglish: `Surah ${i + 1}`,
    nameTransliteration: `Surah-${i + 1}`,
    verseCount: 7,
    revelationType: i % 2 === 0 ? 'meccan' : 'medinan',
    order: i + 1,
  })),
  JUZ_METADATA: Array.from({ length: 30 }, (_, i) => ({
    number: i + 1, startSurah: 1, startVerse: 1, startPage: i * 20 + 1,
  })),
  HIZB_METADATA: Array.from({ length: 60 }, (_, i) => ({
    number: i + 1, juz: Math.floor(i / 2) + 1, startSurah: 1, startVerse: 1, startPage: i * 10 + 1,
  })),
  TOTAL_PAGES: 604,
  getPageForVerse: jest.fn(() => 1), getFirstVerseForPage: jest.fn(() => ({ surah: 1, verse: 1 })),
  getJuzForPage: jest.fn(() => 1), getHizbForPage: jest.fn(() => 1),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: mockNavigate, push: jest.fn(), back: jest.fn() }),
}));

jest.mock('@/features/audio/stores/useAudioStore', () => {
  const useAudioStore = Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({ selectedReciterId: 'alafasy' }),
    { getState: () => ({ selectedReciterId: 'alafasy' }), setState: () => {}, subscribe: () => () => {} },
  );
  return { useAudioStore };
});

jest.mock('@/features/audio/components/DownloadButton', () => ({
  DownloadButton: () => 'DownloadButton',
}));

import { SurahIndexScreen } from './SurahIndexScreen';

interface MockElement {
  type: string | { type?: unknown };
  props: Record<string, unknown>;
}

function findElements(element: unknown, predicate: (el: MockElement) => boolean): MockElement[] {
  const results: MockElement[] = [];
  function walk(node: unknown) {
    if (!node || typeof node !== 'object') return;
    const el = node as MockElement;
    // If this is a function component element, invoke it to get rendered output
    if (typeof el.type === 'function' && el.props) {
      try {
        const rendered = (el.type as (props: Record<string, unknown>) => unknown)(el.props);
        walk(rendered);
        return;
      } catch { /* fall through */ }
    }
    if (predicate(el)) results.push(el);
    if (el.props?.children) {
      const children = Array.isArray(el.props.children) ? el.props.children : [el.props.children];
      children.forEach(walk);
    }
  }
  walk(element);
  return results;
}

describe('SurahIndexScreen', () => {
  test('renders tab bar with Surahs, Juz, and Hizb tabs', () => {
    const element = (SurahIndexScreen as any)() as unknown as MockElement;
    const tabs = findElements(
      element,
      (el) => el.type === 'Pressable' && el.props?.accessibilityRole === 'tab',
    );
    expect(tabs.length).toBe(3);
    // Check tab labels
    const labels = tabs.map((t) => t.props.accessibilityLabel);
    expect(labels).toContain('Surahs');
    expect(labels).toContain("Juz'");
    expect(labels).toContain('Hizb');
  });

  test('renders FlatList with 114 surah items (default surahs tab)', () => {
    const element = (SurahIndexScreen as any)() as unknown as MockElement;
    const flatLists = findElements(element, (el) => el.type === 'FlatList');
    expect(flatLists.length).toBeGreaterThan(0);
    const data = flatLists[0].props.data as unknown[];
    expect(data.length).toBe(114);
  });

  test('uses correct keyExtractor format (surah number string)', () => {
    const element = (SurahIndexScreen as any)() as unknown as MockElement;
    const flatLists = findElements(element, (el) => el.type === 'FlatList');
    const keyExtractor = flatLists[0].props.keyExtractor as (item: { number: number }) => string;
    expect(keyExtractor({ number: 1 })).toBe('1');
    expect(keyExtractor({ number: 114 })).toBe('114');
  });

  test('has FlatList performance props configured', () => {
    const element = (SurahIndexScreen as any)() as unknown as MockElement;
    const flatLists = findElements(element, (el) => el.type === 'FlatList');
    expect(flatLists[0].props.initialNumToRender).toBe(20);
    expect(flatLists[0].props.maxToRenderPerBatch).toBe(20);
    expect(flatLists[0].props.windowSize).toBe(5);
  });

  test('has getItemLayout for fixed-height rows', () => {
    const element = (SurahIndexScreen as any)() as unknown as MockElement;
    const flatLists = findElements(element, (el) => el.type === 'FlatList');
    const getItemLayout = flatLists[0].props.getItemLayout as (...args: unknown[]) => unknown;
    expect(getItemLayout).toBeDefined();
    const layout = getItemLayout(null, 0);
    expect(layout).toHaveProperty('length');
    expect(layout).toHaveProperty('offset');
    expect(layout).toHaveProperty('index');
  });

  test('calls navigateToVerse and navigates on surah press', () => {
    mockUIState.navigateToVerse.mockClear();
    mockNavigate.mockClear();
    const element = (SurahIndexScreen as any)() as unknown as MockElement;
    const flatLists = findElements(element, (el) => el.type === 'FlatList');
    const renderItem = flatLists[0].props.renderItem as (...args: unknown[]) => unknown;
    const renderedItem = renderItem({
      item: {
        number: 42,
        nameArabic: '\u0627\u0644\u0634\u0648\u0631\u0649',
        nameEnglish: 'The Consultation',
        verseCount: 53,
        revelationType: 'meccan',
        nameTransliteration: 'Ash-Shuraa',
        order: 62,
      },
    }) as unknown as MockElement;

    const onPress = renderedItem.props.onPress as (...args: unknown[]) => unknown;
    onPress(42);

    expect(mockUIState.navigateToVerse).toHaveBeenCalledWith(42, 1);
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  test('passes isSelected=true to current surah row', () => {
    const element = (SurahIndexScreen as any)() as unknown as MockElement;
    const flatLists = findElements(element, (el) => el.type === 'FlatList');
    const renderItem = flatLists[0].props.renderItem as (...args: unknown[]) => unknown;

    const selectedItem = renderItem({
      item: { number: 1, nameArabic: '\u0627\u0644\u0641\u0627\u062a\u062d\u0629', nameEnglish: 'The Opening', verseCount: 7, revelationType: 'meccan', nameTransliteration: 'Al-Fatihah', order: 5 },
    }) as unknown as MockElement;
    expect(selectedItem.props.isSelected).toBe(true);

    const unselectedItem = renderItem({
      item: { number: 2, nameArabic: '\u0627\u0644\u0628\u0642\u0631\u0629', nameEnglish: 'The Cow', verseCount: 286, revelationType: 'medinan', nameTransliteration: 'Al-Baqarah', order: 87 },
    }) as unknown as MockElement;
    expect(unselectedItem.props.isSelected).toBe(false);
  });

  test('FlatList has ref for scroll-to-current', () => {
    const element = (SurahIndexScreen as any)() as unknown as MockElement;
    const flatLists = findElements(element, (el) => el.type === 'FlatList');
    expect(flatLists[0].props.ref).toBeDefined();
  });

  test('Surahs tab is selected by default', () => {
    const element = (SurahIndexScreen as any)() as unknown as MockElement;
    const tabs = findElements(
      element,
      (el) => el.type === 'Pressable' && el.props?.accessibilityRole === 'tab',
    );
    const surahsTab = tabs.find((t) => t.props.accessibilityLabel === 'Surahs');
    expect(surahsTab?.props.accessibilityState).toEqual({ selected: true });
  });
});
