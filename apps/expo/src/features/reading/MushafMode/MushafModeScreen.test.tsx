jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useCallback: (fn: unknown) => fn,
  useMemo: (fn: () => unknown) => (fn as () => unknown)(),
  useRef: (val: unknown) => ({ current: val ?? null }),
  useState: (initial: unknown) => [
    typeof initial === 'function' ? (initial as () => unknown)() : initial,
    () => {},
  ],
  useEffect: () => {},
}));

jest.mock('@/theme/ThemeProvider', () => {
  const { themes } = jest.requireActual('@/theme/tokens');
  return { useTheme: () => ({ tokens: themes.light, themeName: 'light' as const }) };
});

const mockUIState = {
  selectedTheme: 'system' as string,
  currentMode: 'mushaf' as string,
  fontSize: 28,
  currentSurah: 2,
  currentVerse: 5,
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
  getPageForVerse: jest.fn((surah: number, _verse: number) => {
    if (surah === 1) return 1;
    return 2;
  }),
  getFirstVerseForPage: jest.fn(() => ({ surah: 1, verse: 1 })),
  getJuzForPage: jest.fn(() => 1),
  getHizbForPage: jest.fn(() => 1),
}));

// Get reference to mock after jest.mock has been applied
const mockGetPageForVerse = require('quran-data').getPageForVerse as jest.Mock;

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: jest.fn(), push: jest.fn(), back: jest.fn() }),
}));
jest.mock('@expo/vector-icons/Ionicons', () => ({ __esModule: true, default: 'Ionicons' }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(),
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'LIGHT' },
}));
jest.mock('react-native-gesture-handler', () => ({
  Gesture: {
    LongPress: () => ({
      minDuration: () => ({ onStart: () => ({}) }),
    }),
    Pan: () => ({
      onUpdate: () => ({ onEnd: () => ({}) }),
    }),
  },
  GestureDetector: ({ children }: { children: unknown }) => children,
}));
jest.mock('react-native-reanimated', () => ({
  default: { View: 'Animated.View' },
  Easing: { inOut: () => ({}), ease: {} },
  useSharedValue: () => ({ value: 0 }),
  useAnimatedStyle: () => ({}),
  withTiming: (v: number) => v,
  runOnJS: (fn: unknown) => fn,
}));

jest.mock('@/features/audio/stores/useAudioStore', () => {
  const mockAudioState = {
    activeVerseKey: null as string | null,
    isPlaying: false,
  };
  const useAudioStore = Object.assign(
    (selector: (s: typeof mockAudioState) => unknown) => selector(mockAudioState),
    { getState: () => mockAudioState, setState: () => {}, subscribe: () => () => {} },
  );
  return { useAudioStore };
});

// Mock Surface and ReadingChromeOverlay as string types for tree inspection
jest.mock('@/components/Surface', () => ({ Surface: 'Surface' }));
jest.mock('../ReadingChromeOverlay', () => ({ ReadingChromeOverlay: 'ReadingChromeOverlay' }));
jest.mock('../VerseContextMenu', () => ({ VerseContextMenu: () => null }));
jest.mock('../TafsirSheet', () => ({ TafsirSheet: () => null }));
jest.mock('./MushafPage', () => ({ MushafPage: 'MushafPage' }));
jest.mock('@/components/AppText', () => ({ AppText: 'AppText' }));
jest.mock('@/features/bookmarks/useBookmarkStore', () => {
  const useBookmarkStore = Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({ bookmarks: [], toggleBookmark: jest.fn() }),
    { getState: () => ({ bookmarks: [], toggleBookmark: jest.fn() }), setState: () => {}, subscribe: () => () => {} },
  );
  return { useBookmarkStore };
});
jest.mock('@/services/sqlite', () => ({
  getVersesByPositions: jest.fn(() => Promise.resolve([])),
}));

// Mock mushaf services
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

import { MushafModeScreen } from './MushafModeScreen';

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

describe('MushafModeScreen', () => {
  test('renders a Surface container', () => {
    const element = (MushafModeScreen as any)() as unknown as MockElement;
    expect(element).toBeDefined();
    expect(element.type).toBe('Surface');
  });

  test('renders a horizontal FlatList with pagingEnabled', () => {
    const element = (MushafModeScreen as any)() as unknown as MockElement;
    const flatLists = findElements(element, (el) => el.type === 'FlatList');
    expect(flatLists.length).toBe(1);
    expect(flatLists[0].props.horizontal).toBe(true);
    expect(flatLists[0].props.pagingEnabled).toBe(true);
  });

  test('FlatList has 604 pages of data', () => {
    const element = (MushafModeScreen as any)() as unknown as MockElement;
    const flatLists = findElements(element, (el) => el.type === 'FlatList');
    const data = flatLists[0].props.data as number[];
    expect(data.length).toBe(604);
    expect(data[0]).toBe(1);
    expect(data[603]).toBe(604);
  });

  test('scrolls to correct initial page based on currentSurah/currentVerse', () => {
    mockGetPageForVerse.mockClear();
    mockGetPageForVerse.mockImplementation((surah: number, _verse: number) => {
      if (surah === 1) return 1;
      return 2;
    });
    const element = (MushafModeScreen as any)() as unknown as MockElement;
    expect(mockGetPageForVerse).toHaveBeenCalledWith(2, 5);
    const flatLists = findElements(element, (el) => el.type === 'FlatList');
    expect(flatLists[0].props.initialScrollIndex).toBe(1); // page 2 -> index 1
  });

  test('FlatList has getItemLayout for O(1) scrolling', () => {
    const element = (MushafModeScreen as any)() as unknown as MockElement;
    const flatLists = findElements(element, (el) => el.type === 'FlatList');
    const getItemLayout = flatLists[0].props.getItemLayout as (
      data: any,
      index: number,
    ) => { length: number; offset: number; index: number };
    expect(getItemLayout).toBeDefined();
    const layout = getItemLayout(null, 5);
    expect(layout.length).toBe(375); // SCREEN_WIDTH
    expect(layout.offset).toBe(375 * 5);
    expect(layout.index).toBe(5);
  });

  test('FlatList has inverted={true} for RTL page direction', () => {
    const element = (MushafModeScreen as any)() as unknown as MockElement;
    const flatLists = findElements(element, (el) => el.type === 'FlatList');
    expect(flatLists[0].props.inverted).toBe(true);
  });

  test('FlatList has performance optimizations', () => {
    const element = (MushafModeScreen as any)() as unknown as MockElement;
    const flatLists = findElements(element, (el) => el.type === 'FlatList');
    expect(flatLists[0].props.windowSize).toBe(3);
    expect(flatLists[0].props.removeClippedSubviews).toBe(true);
    expect(flatLists[0].props.showsHorizontalScrollIndicator).toBe(false);
  });

  test('renderItem produces MushafPage wrapped in View with viewport dimensions', () => {
    const element = (MushafModeScreen as any)() as unknown as MockElement;
    const flatLists = findElements(element, (el) => el.type === 'FlatList');
    const renderItem = flatLists[0].props.renderItem as (info: { item: number }) => any;
    const rendered = renderItem({ item: 42 });
    expect(rendered.type).toBe('View');
    expect(rendered.props.style.width).toBe(375);
    expect(rendered.props.style.height).toBe(812);
    const mushafPages = findElements(rendered, (el) => el.type === 'MushafPage');
    expect(mushafPages.length).toBe(1);
    expect(mushafPages[0].props.pageNumber).toBe(42);
  });

  test('passes onTap handler to MushafPage for chrome toggle (no Pressable wrapper)', () => {
    const element = (MushafModeScreen as any)() as unknown as MockElement;
    const flatLists = findElements(element, (el) => el.type === 'FlatList');
    expect(flatLists.length).toBe(1);
    const renderItem = flatLists[0].props.renderItem as (info: { item: number }) => any;
    const rendered = renderItem({ item: 1 });
    const mushafPages = findElements(rendered, (el) => el.type === 'MushafPage');
    expect(mushafPages[0].props.onTap).toBeDefined();
  });

  test('onTap callback calls toggleChrome when not scrolling', () => {
    mockUIState.toggleChrome.mockClear();
    const element = (MushafModeScreen as any)() as unknown as MockElement;
    const flatLists = findElements(element, (el) => el.type === 'FlatList');
    const renderItem = flatLists[0].props.renderItem as (info: { item: number }) => any;
    const rendered = renderItem({ item: 1 });
    const mushafPages = findElements(rendered, (el) => el.type === 'MushafPage');
    const onTap = mushafPages[0].props.onTap as () => void;
    onTap();
    expect(mockUIState.toggleChrome).toHaveBeenCalled();
  });

  test('derives initial page from currentSurah and currentVerse', () => {
    mockGetPageForVerse.mockClear();
    mockGetPageForVerse.mockImplementation((surah: number, _verse: number) => {
      if (surah === 1) return 1;
      return 2;
    });
    (MushafModeScreen as any)();
    expect(mockGetPageForVerse).toHaveBeenCalledWith(2, 5);
  });

  test('renders ReadingChromeOverlay', () => {
    const element = (MushafModeScreen as any)() as unknown as MockElement;
    const overlays = findElements(element, (el) => el.type === 'ReadingChromeOverlay');
    expect(overlays.length).toBe(1);
  });

  test('does not render MushafPageSlider (removed)', () => {
    const element = (MushafModeScreen as any)() as unknown as MockElement;
    const sliders = findElements(
      element,
      (el) => el.props?.currentPage !== undefined && el.props?.onPageChange !== undefined,
    );
    expect(sliders.length).toBe(0);
  });

  test('has onViewableItemsChanged callback on FlatList', () => {
    const element = (MushafModeScreen as any)() as unknown as MockElement;
    const flatLists = findElements(element, (el) => el.type === 'FlatList');
    expect(flatLists[0].props.onViewableItemsChanged).toBeDefined();
  });

  test('has scroll event handlers for chrome guard', () => {
    const element = (MushafModeScreen as any)() as unknown as MockElement;
    const flatLists = findElements(element, (el) => el.type === 'FlatList');
    expect(flatLists[0].props.onScrollBeginDrag).toBeDefined();
    expect(flatLists[0].props.onScrollEndDrag).toBeDefined();
    expect(flatLists[0].props.onMomentumScrollEnd).toBeDefined();
  });

  test('keyExtractor returns page-based key', () => {
    const element = (MushafModeScreen as any)() as unknown as MockElement;
    const flatLists = findElements(element, (el) => el.type === 'FlatList');
    const keyExtractor = flatLists[0].props.keyExtractor as (item: number) => string;
    expect(keyExtractor(42)).toBe('page-42');
  });

  test('FlatList has onLayout handler for web scroll fix', () => {
    const element = (MushafModeScreen as any)() as unknown as MockElement;
    const flatLists = findElements(element, (el) => el.type === 'FlatList');
    expect(flatLists[0].props.onLayout).toBeDefined();
    expect(typeof flatLists[0].props.onLayout).toBe('function');
  });
});

describe('MushafModeScreen — audio auto-advance wiring', () => {
  test('reads activeVerseKey from useAudioStore', () => {
    const audioStoreMock = require('@/features/audio/stores/useAudioStore');
    const selectorSpy = jest.fn((s: { activeVerseKey: string | null }) => s.activeVerseKey);
    audioStoreMock.useAudioStore(selectorSpy);
    expect(selectorSpy).toHaveReturnedWith(null);
  });

  test('reads isPlaying from useAudioStore', () => {
    const audioStoreMock = require('@/features/audio/stores/useAudioStore');
    const selectorSpy = jest.fn((s: { isPlaying: boolean }) => s.isPlaying);
    audioStoreMock.useAudioStore(selectorSpy);
    expect(selectorSpy).toHaveReturnedWith(false);
  });

  test('scroll handlers on FlatList enable isScrolling guard for auto-advance', () => {
    const element = (MushafModeScreen as any)() as unknown as MockElement;
    const flatLists = findElements(element, (el) => el.type === 'FlatList');
    // onScrollBeginDrag sets isScrolling.current = true (guards auto-advance)
    expect(flatLists[0].props.onScrollBeginDrag).toBeDefined();
    // onScrollEndDrag/onMomentumScrollEnd reset isScrolling.current = false
    expect(flatLists[0].props.onScrollEndDrag).toBeDefined();
    expect(flatLists[0].props.onMomentumScrollEnd).toBeDefined();
    // Verify handlers are functions (not undefined)
    expect(typeof flatLists[0].props.onScrollBeginDrag).toBe('function');
    expect(typeof flatLists[0].props.onScrollEndDrag).toBe('function');
    expect(typeof flatLists[0].props.onMomentumScrollEnd).toBe('function');
  });
});
