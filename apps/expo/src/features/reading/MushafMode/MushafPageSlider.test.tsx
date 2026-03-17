jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useCallback: (fn: unknown) => fn,
  useMemo: (fn: () => unknown) => (fn as () => unknown)(),
  useRef: (val: unknown) => ({ current: val ?? null }),
  useState: (initial: unknown) => [initial, () => {}],
  useEffect: () => {},
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
jest.mock('@react-native-community/slider', () => ({ __esModule: true, default: 'Slider' }));
jest.mock('@/components/AppText', () => ({ AppText: 'AppText' }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: jest.fn(), push: jest.fn(), back: jest.fn() }),
}));
jest.mock('@expo/vector-icons/Ionicons', () => ({ __esModule: true, default: 'Ionicons' }));

jest.mock('@/services/mushaf-fonts', () => ({
  loadPageFont: jest.fn(async () => 'QCF_P001'),
  preloadAdjacentFonts: jest.fn(async () => {}),
  isPageFontCached: jest.fn(() => false),
  getPageFontFamily: jest.fn(() => 'QCF_P001'),
}));

jest.mock('@/services/mushaf-layout', () => ({
  getPageLayout: jest.fn(async () => null),
  clearLayoutCache: jest.fn(() => {}),
}));

import { MushafPageSlider } from './MushafPageSlider';

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

describe('MushafPageSlider', () => {
  test('renders page number text', () => {
    mockUIState.isChromeVisible = true;
    const element = (MushafPageSlider as any)({
      currentPage: 42,
      onPageChange: () => {},
    }) as unknown as MockElement;
    const texts = findElements(element, (el) => el.type === 'AppText');
    expect(texts.length).toBeGreaterThan(0);
    const pageText = texts.find((t) => {
      const children = t.props.children;
      const text = Array.isArray(children) ? children.join('') : String(children);
      return text.includes('42') && text.includes('604');
    });
    expect(pageText).toBeDefined();
  });

  test('renders Slider with correct min/max/step/value', () => {
    mockUIState.isChromeVisible = true;
    const element = (MushafPageSlider as any)({
      currentPage: 100,
      onPageChange: () => {},
    }) as unknown as MockElement;
    const sliders = findElements(element, (el) => el.type === 'Slider');
    expect(sliders.length).toBe(1);
    expect(sliders[0].props.minimumValue).toBe(1);
    expect(sliders[0].props.maximumValue).toBe(604);
    expect(sliders[0].props.step).toBe(1);
    // Value is inverted for RTL: 604 + 1 - 100 = 505
    expect(sliders[0].props.value).toBe(505);
  });

  test('calls onPageChange callback on sliding complete with inverted value', () => {
    mockUIState.isChromeVisible = true;
    const mockOnPageChange = jest.fn();
    const element = (MushafPageSlider as any)({
      currentPage: 50,
      onPageChange: mockOnPageChange,
    }) as unknown as MockElement;
    const sliders = findElements(element, (el) => el.type === 'Slider');
    const onSlidingComplete = sliders[0].props.onSlidingComplete as (value: number) => void;
    // Sliding to value 200 -> page = 604 + 1 - 200 = 405
    onSlidingComplete(200);
    expect(mockOnPageChange).toHaveBeenCalledWith(405);
  });

  test('renders as Animated.View container', () => {
    mockUIState.isChromeVisible = true;
    const element = (MushafPageSlider as any)({
      currentPage: 1,
      onPageChange: () => {},
    }) as unknown as MockElement;
    expect(element.type).toBe('Animated.View');
  });

  test('has pointerEvents auto when chrome visible', () => {
    mockUIState.isChromeVisible = true;
    const element = (MushafPageSlider as any)({
      currentPage: 1,
      onPageChange: () => {},
    }) as unknown as MockElement;
    expect(element.props.pointerEvents).toBe('auto');
  });

  test('has pointerEvents none when chrome not visible', () => {
    mockUIState.isChromeVisible = false;
    const element = (MushafPageSlider as any)({
      currentPage: 1,
      onPageChange: () => {},
    }) as unknown as MockElement;
    expect(element.props.pointerEvents).toBe('none');
  });

  test('has correct accessibility label on slider', () => {
    mockUIState.isChromeVisible = true;
    const element = (MushafPageSlider as any)({
      currentPage: 42,
      onPageChange: () => {},
    }) as unknown as MockElement;
    const sliders = findElements(element, (el) => el.type === 'Slider');
    expect(sliders[0].props.accessibilityLabel).toBe('Page slider, page 42 of 604');
  });

  test('Slider uses inverted value math for RTL (page 1 = high slider value)', () => {
    mockUIState.isChromeVisible = true;
    const element = (MushafPageSlider as any)({
      currentPage: 42,
      onPageChange: () => {},
    }) as unknown as MockElement;
    const sliders = findElements(element, (el) => el.type === 'Slider');
    // Value should be inverted: TOTAL_PAGES + 1 - currentPage = 604 + 1 - 42 = 563
    expect(sliders[0].props.value).toBe(563);
  });

  test('Slider onSlidingComplete inverts value back to correct page', () => {
    mockUIState.isChromeVisible = true;
    const mockOnPageChange = jest.fn();
    const element = (MushafPageSlider as any)({
      currentPage: 50,
      onPageChange: mockOnPageChange,
    }) as unknown as MockElement;
    const sliders = findElements(element, (el) => el.type === 'Slider');
    const onSlidingComplete = sliders[0].props.onSlidingComplete as (value: number) => void;
    // Sliding to value 405 should map to page 604 + 1 - 405 = 200
    onSlidingComplete(405);
    expect(mockOnPageChange).toHaveBeenCalledWith(200);
  });

  test('positions at bottom of screen', () => {
    mockUIState.isChromeVisible = true;
    const element = (MushafPageSlider as any)({
      currentPage: 1,
      onPageChange: () => {},
    }) as unknown as MockElement;
    const style = element.props.style as unknown[];
    const flatStyle = Object.assign({}, ...(style as object[]));
    expect(flatStyle.position).toBe('absolute');
    expect(flatStyle.bottom).toBe(0);
  });
});
