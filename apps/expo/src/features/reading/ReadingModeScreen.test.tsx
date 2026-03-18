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
  firstVisibleVerse: null as string | null,
  setFirstVisibleVerse: jest.fn(),
  showTransliteration: false,
  toggleTransliteration: jest.fn(),
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
  getPageForVerse: jest.fn(() => 1),
  getFirstVerseForPage: jest.fn(() => ({ surah: 1, verse: 1 })),
  getJuzForPage: jest.fn(() => 1),
  getHizbForPage: jest.fn(() => 1),
}));

const mockVerses = [
  {
    surahNumber: 1,
    verseNumber: 1,
    uthmaniText: 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ',
    translationText: 'In the name of Allah, the Entirely Merciful, the Especially Merciful.',
    transliterationText: 'Bismi Allahi arrahmani arraheem',
  },
  {
    surahNumber: 1,
    verseNumber: 2,
    uthmaniText: 'ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَٰلَمِينَ',
    translationText: 'All praise is due to Allah, Lord of the worlds,',
    transliterationText: 'Alhamdu lillahi rabbi alAAalameen',
  },
];
const mockRetry = jest.fn();
let mockUseVersesState = {
  verses: mockVerses,
  isLoading: false,
  error: null as Error | null,
  retry: mockRetry,
};

let mockActiveVerseKey: string | null = null;
let mockIsAudioPlaying = false;

jest.mock('@/features/audio/stores/useAudioStore', () => {
  const getMockState = () => ({
    isPlaying: mockIsAudioPlaying,
    play: jest.fn(),
    pause: jest.fn(),
    activeVerseKey: mockActiveVerseKey,
  });
  const useAudioStore = Object.assign(
    (selector: (s: ReturnType<typeof getMockState>) => unknown) => selector(getMockState()),
    { getState: () => getMockState(), setState: () => {}, subscribe: () => () => {} },
  );
  return { useAudioStore };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));
jest.mock('@expo/vector-icons/Ionicons', () => ({ __esModule: true, default: 'Ionicons' }));
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
jest.mock('./VerseContextMenu', () => ({ VerseContextMenu: () => null }));
jest.mock('./TafsirSheet', () => ({ TafsirSheet: () => null }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: jest.fn(), push: jest.fn(), back: jest.fn() }),
}));
jest.mock('@/features/bookmarks/useBookmarkStore', () => {
  const useBookmarkStore = Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({
        bookmarks: [],
        addBookmark: () => {},
        removeBookmark: () => {},
        toggleBookmark: () => {},
      }),
    { getState: () => ({ bookmarks: [] }), setState: () => {}, subscribe: () => () => {} },
  );
  return { useBookmarkStore };
});
jest.mock('./hooks/useVerses', () => ({
  useVerses: () => mockUseVersesState,
}));
jest.mock('@react-navigation/bottom-tabs', () => ({
  useBottomTabBarHeight: () => 49,
}));
jest.mock('@/features/sync/components/OfflineIndicator', () => ({
  OfflineIndicator: () => null,
}));

import { ReadingModeScreen } from './ReadingModeScreen';

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

describe('ReadingModeScreen', () => {
  test('renders FlashList with verse data when loaded', () => {
    mockUseVersesState = { verses: mockVerses, isLoading: false, error: null, retry: mockRetry };
    const element = (ReadingModeScreen as any)() as unknown as MockElement;
    const flatLists = findElements(element, (el) => el.type === 'FlashList');
    expect(flatLists.length).toBeGreaterThan(0);
    expect(flatLists[0].props.data).toEqual(mockVerses);
  });

  test('FlashList keyExtractor produces surah:verse format', () => {
    mockUseVersesState = { verses: mockVerses, isLoading: false, error: null, retry: mockRetry };
    const element = (ReadingModeScreen as any)() as unknown as MockElement;
    const flatLists = findElements(element, (el) => el.type === 'FlashList');
    const keyExtractor = flatLists[0].props.keyExtractor as (item: {
      surahNumber: number;
      verseNumber: number;
    }) => string;
    expect(keyExtractor({ surahNumber: 1, verseNumber: 1 })).toBe('1:1');
    expect(keyExtractor({ surahNumber: 2, verseNumber: 255 })).toBe('2:255');
  });

  test('FlashList has scrollEventThrottle configured', () => {
    mockUseVersesState = { verses: mockVerses, isLoading: false, error: null, retry: mockRetry };
    const element = (ReadingModeScreen as any)() as unknown as MockElement;
    const flatLists = findElements(element, (el) => el.type === 'FlashList');
    expect(flatLists[0].props.scrollEventThrottle).toBe(16);
  });

  test('renders loading state with ActivityIndicator', () => {
    mockUseVersesState = { verses: [], isLoading: true, error: null, retry: mockRetry };
    const element = (ReadingModeScreen as any)() as unknown as MockElement;
    const indicators = findElements(element, (el) => el.type === 'ActivityIndicator');
    expect(indicators.length).toBeGreaterThan(0);
    expect(indicators[0].props.size).toBe('large');
    const flatLists = findElements(element, (el) => el.type === 'FlashList');
    expect(flatLists.length).toBe(0);
  });

  test('renders SurahNavigator as ListFooterComponent wrapped with touch guard', () => {
    mockUseVersesState = { verses: mockVerses, isLoading: false, error: null, retry: mockRetry };
    const element = (ReadingModeScreen as any)() as unknown as MockElement;
    const flatLists = findElements(element, (el) => el.type === 'FlashList');
    expect(flatLists[0].props.ListFooterComponent).toBeDefined();
    const footer = (
      flatLists[0].props.ListFooterComponent as (...args: unknown[]) => unknown
    )() as unknown as MockElement;
    expect(footer).toBeDefined();
    expect(footer.type).toBe('View');
    expect(footer.props.onTouchEnd).toBeDefined();
    const navigators = findElements(footer, (el) => el.props?.currentSurah !== undefined);
    expect(navigators.length).toBe(1);
    expect(navigators[0].props.currentSurah).toBe(1);
    expect(navigators[0].props.onNavigate).toBeDefined();
  });

  test('uses surah number from store (dynamic surah)', () => {
    mockUseVersesState = { verses: mockVerses, isLoading: false, error: null, retry: mockRetry };
    const element = (ReadingModeScreen as any)() as unknown as MockElement;
    const flatLists = findElements(element, (el) => el.type === 'FlashList');
    const header = (
      flatLists[0].props.ListHeaderComponent as (...args: unknown[]) => unknown
    )() as unknown as MockElement;
    expect(header).toBeDefined();
    expect(header.props.surahNumber).toBe(1);
  });

  test('renders ReadingChromeOverlay as part of the screen', () => {
    mockUseVersesState = { verses: mockVerses, isLoading: false, error: null, retry: mockRetry };
    const element = (ReadingModeScreen as any)() as unknown as MockElement;
    const overlays = findElements(
      element,
      (el) =>
        typeof el.type === 'function' &&
        (el.type as { name?: string }).name === 'ReadingChromeOverlay',
    );
    expect(overlays.length).toBe(1);
  });

  test('onScrollBeginDrag calls hideChrome when chrome is visible', () => {
    mockUIState.isChromeVisible = true;
    mockUIState.hideChrome.mockClear();
    mockUseVersesState = { verses: mockVerses, isLoading: false, error: null, retry: mockRetry };
    const element = (ReadingModeScreen as any)() as unknown as MockElement;
    const flatLists = findElements(element, (el) => el.type === 'FlashList');
    (flatLists[0].props.onScrollBeginDrag as () => void)();
    expect(mockUIState.hideChrome).toHaveBeenCalled();
  });

  test('onScrollBeginDrag does not call hideChrome when chrome is hidden', () => {
    mockUIState.isChromeVisible = false;
    mockUIState.hideChrome.mockClear();
    mockUseVersesState = { verses: mockVerses, isLoading: false, error: null, retry: mockRetry };
    const element = (ReadingModeScreen as any)() as unknown as MockElement;
    const flatLists = findElements(element, (el) => el.type === 'FlashList');
    (flatLists[0].props.onScrollBeginDrag as () => void)();
    expect(mockUIState.hideChrome).not.toHaveBeenCalled();
  });

  test('onTouchEnd calls toggleChrome on tap (not scroll)', () => {
    mockUIState.isChromeVisible = false;
    mockUIState.toggleChrome.mockClear();
    mockUseVersesState = { verses: mockVerses, isLoading: false, error: null, retry: mockRetry };
    const element = (ReadingModeScreen as any)() as unknown as MockElement;
    const views = findElements(element, (el) => el.type === 'View' && !!el.props?.onTouchEnd);
    const wrapperView = views.find(
      (el) => findElements(el, (c) => c.type === 'FlashList').length > 0,
    );
    expect(wrapperView).toBeDefined();
    (wrapperView!.props.onTouchEnd as () => void)();
    expect(mockUIState.toggleChrome).toHaveBeenCalled();
  });

  test('FlashList has viewabilityConfig prop defined', () => {
    mockUseVersesState = { verses: mockVerses, isLoading: false, error: null, retry: mockRetry };
    const element = (ReadingModeScreen as any)() as unknown as MockElement;
    const flatLists = findElements(element, (el) => el.type === 'FlashList');
    expect(flatLists[0].props.viewabilityConfig).toBeDefined();
    const config = flatLists[0].props.viewabilityConfig as {
      itemVisiblePercentThreshold: number;
      minimumViewTime: number;
    };
    expect(config.itemVisiblePercentThreshold).toBe(50);
    expect(config.minimumViewTime).toBe(500);
  });

  test('FlashList has onViewableItemsChanged prop defined', () => {
    mockUseVersesState = { verses: mockVerses, isLoading: false, error: null, retry: mockRetry };
    const element = (ReadingModeScreen as any)() as unknown as MockElement;
    const flatLists = findElements(element, (el) => el.type === 'FlashList');
    expect(flatLists[0].props.onViewableItemsChanged).toBeDefined();
    expect(typeof flatLists[0].props.onViewableItemsChanged).toBe('function');
  });

  test('onViewableItemsChanged calls setCurrentVerse with first visible verse', () => {
    mockUIState.setCurrentVerse.mockClear();
    mockUseVersesState = { verses: mockVerses, isLoading: false, error: null, retry: mockRetry };
    const element = (ReadingModeScreen as any)() as unknown as MockElement;
    const flatLists = findElements(element, (el) => el.type === 'FlashList');
    const onViewableItemsChanged = flatLists[0].props.onViewableItemsChanged as (info: {
      viewableItems: Array<{ item: { verseNumber: number } }>;
    }) => void;
    onViewableItemsChanged({
      viewableItems: [{ item: { verseNumber: 5 } }, { item: { verseNumber: 6 } }],
    });
    expect(mockUIState.setCurrentVerse).toHaveBeenCalledWith(5);
  });

  test('FlashList does NOT have getItemLayout prop', () => {
    mockUseVersesState = { verses: mockVerses, isLoading: false, error: null, retry: mockRetry };
    const element = (ReadingModeScreen as any)() as unknown as MockElement;
    const flatLists = findElements(element, (el) => el.type === 'FlashList');
    expect(flatLists[0].props.getItemLayout).toBeUndefined();
  });

  test('FlashList does NOT have initialScrollIndex prop', () => {
    mockUseVersesState = { verses: mockVerses, isLoading: false, error: null, retry: mockRetry };
    const element = (ReadingModeScreen as any)() as unknown as MockElement;
    const flatLists = findElements(element, (el) => el.type === 'FlashList');
    expect(flatLists[0].props.initialScrollIndex).toBeUndefined();
  });

  test('FlashList does NOT have onScrollToIndexFailed (v2 uses Promise)', () => {
    mockUseVersesState = { verses: mockVerses, isLoading: false, error: null, retry: mockRetry };
    const element = (ReadingModeScreen as any)() as unknown as MockElement;
    const flatLists = findElements(element, (el) => el.type === 'FlashList');
    expect(flatLists[0].props.onScrollToIndexFailed).toBeUndefined();
  });

  test('renders error state with retry option', () => {
    mockUseVersesState = {
      verses: [],
      isLoading: false,
      error: new Error('DB failed'),
      retry: mockRetry,
    };
    const element = (ReadingModeScreen as any)() as unknown as MockElement;
    const textElements = findElements(element, (el) => el.props?.variant === 'ui');
    const errorText = textElements.find((el) => el.props.children === 'Failed to load verses');
    expect(errorText).toBeDefined();
    const captionElements = findElements(element, (el) => el.props?.variant === 'uiCaption');
    const errorDetail = captionElements.find((el) => el.props.children === 'DB failed');
    expect(errorDetail).toBeDefined();
    const retryText = textElements.find((el) => el.props.onPress === mockRetry);
    expect(retryText).toBeDefined();
  });
});

describe('ReadingModeScreen — verse highlighting', () => {
  beforeEach(() => {
    mockActiveVerseKey = null;
    mockIsAudioPlaying = false;
    mockUseVersesState = { verses: mockVerses, isLoading: false, error: null, retry: mockRetry };
  });

  test('renderItem passes isHighlighted=true for matching activeVerseKey', () => {
    mockActiveVerseKey = '1:2';
    const element = (ReadingModeScreen as any)() as unknown as MockElement;
    const flatLists = findElements(element, (el) => el.type === 'FlashList');
    const renderItem = flatLists[0].props.renderItem as (info: {
      item: (typeof mockVerses)[0];
    }) => any;
    const verse2 = renderItem({ item: mockVerses[1] });
    expect(verse2.props.isHighlighted).toBe(true);
  });

  test('renderItem passes isHighlighted=false for non-matching activeVerseKey', () => {
    mockActiveVerseKey = '1:2';
    const element = (ReadingModeScreen as any)() as unknown as MockElement;
    const flatLists = findElements(element, (el) => el.type === 'FlashList');
    const renderItem = flatLists[0].props.renderItem as (info: {
      item: (typeof mockVerses)[0];
    }) => any;
    const verse1 = renderItem({ item: mockVerses[0] });
    expect(verse1.props.isHighlighted).toBe(false);
  });

  test('renderItem passes isHighlighted=false when no active verse', () => {
    mockActiveVerseKey = null;
    const element = (ReadingModeScreen as any)() as unknown as MockElement;
    const flatLists = findElements(element, (el) => el.type === 'FlashList');
    const renderItem = flatLists[0].props.renderItem as (info: {
      item: (typeof mockVerses)[0];
    }) => any;
    const verse1 = renderItem({ item: mockVerses[0] });
    expect(verse1.props.isHighlighted).toBe(false);
  });

  test('FlashList has extraData set to activeVerseKey and showTransliteration for re-render trigger', () => {
    mockActiveVerseKey = '1:3';
    const element = (ReadingModeScreen as any)() as unknown as MockElement;
    const flatLists = findElements(element, (el) => el.type === 'FlashList');
    expect(flatLists[0].props.extraData).toBe('1:3-false');
  });

  test('FlashList has onScrollEndDrag and onMomentumScrollEnd for scroll cooldown', () => {
    const element = (ReadingModeScreen as any)() as unknown as MockElement;
    const flatLists = findElements(element, (el) => el.type === 'FlashList');
    expect(flatLists[0].props.onScrollEndDrag).toBeDefined();
    expect(flatLists[0].props.onMomentumScrollEnd).toBeDefined();
  });

  test('renderItem passes transliterationText to VerseRow', () => {
    mockUseVersesState = { verses: mockVerses, isLoading: false, error: null, retry: mockRetry };
    const element = (ReadingModeScreen as any)() as unknown as MockElement;
    const flatLists = findElements(element, (el) => el.type === 'FlashList');
    const renderItem = flatLists[0].props.renderItem as (info: {
      item: (typeof mockVerses)[0];
    }) => any;
    const verse1 = renderItem({ item: mockVerses[0] });
    expect(verse1.props.transliterationText).toBe('Bismi Allahi arrahmani arraheem');
  });

  test('FlashList extraData includes showTransliteration state', () => {
    mockActiveVerseKey = '1:1';
    mockUIState.showTransliteration = true;
    const element = (ReadingModeScreen as any)() as unknown as MockElement;
    const flatLists = findElements(element, (el) => el.type === 'FlashList');
    expect(flatLists[0].props.extraData).toBe('1:1-true');
    mockUIState.showTransliteration = false;
  });
});
