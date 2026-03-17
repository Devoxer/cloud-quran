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

jest.mock('quran-data', () => ({
  SURAH_METADATA: [{ number: 1, nameArabic: '\u0627\u0644\u0641\u0627\u062a\u062d\u0629', nameEnglish: 'The Opening', nameTransliteration: 'Al-Fatihah', verseCount: 7, revelationType: 'meccan', order: 5 }],
  JUZ_METADATA: [{ number: 1, startSurah: 1, startVerse: 1, startPage: 1 }],
  HIZB_METADATA: [{ number: 1, juz: 1, startSurah: 1, startVerse: 1, startPage: 1 }],
  TOTAL_PAGES: 604,
  getPageForVerse: jest.fn(() => 1), getFirstVerseForPage: jest.fn(() => ({ surah: 1, verse: 1 })),
  getJuzForPage: jest.fn(() => 1), getHizbForPage: jest.fn(() => 1),
}));

// Mutable mock state
let mockBookmarkedVerses: Array<{ surahNumber: number; verseNumber: number; createdAt: number; uthmaniText: string; translationText: string }> = [];
let mockIsLoading = false;
const mockNavigate = jest.fn();
const mockRemoveBookmark = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: mockNavigate, push: jest.fn(), back: jest.fn() }),
}));
jest.mock('react-native-gesture-handler', () => ({
  Swipeable: 'Swipeable', GestureHandlerRootView: 'GestureHandlerRootView',
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));
jest.mock('@expo/vector-icons/Ionicons', () => ({ default: 'Ionicons' }));
jest.mock('@/features/bookmarks/useBookmarkStore', () => {
  const useBookmarkStore = Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({ bookmarks: [], addBookmark: () => {}, removeBookmark: mockRemoveBookmark, toggleBookmark: () => {} }),
    { getState: () => ({ bookmarks: [] }), setState: () => {}, subscribe: () => () => {} },
  );
  return { useBookmarkStore };
});
jest.mock('./hooks/useBookmarkedVerses', () => ({
  useBookmarkedVerses: () => ({ verses: mockBookmarkedVerses, isLoading: mockIsLoading, error: null }),
}));
jest.mock('@/services/sqlite', () => ({
  getVersesForSurah: jest.fn(async () => []),
  getVersesByPositions: jest.fn(async () => []),
}));

import { BookmarksScreen } from './BookmarksScreen';

interface MockElement { type: string; props: Record<string, unknown> }

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

describe('BookmarksScreen', () => {
  test('renders empty state when no bookmarks', () => {
    mockBookmarkedVerses = []; mockIsLoading = false;
    const element = (BookmarksScreen as any)() as unknown as MockElement;
    const uiElements = findElements(element, (el) => el.props?.variant === 'ui');
    const emptyText = uiElements.find((el) => el.props.children === 'No bookmarks yet');
    expect(emptyText).toBeDefined();
    const captionElements = findElements(element, (el) => el.props?.variant === 'uiCaption');
    expect(captionElements.length).toBeGreaterThan(0);
    const flatLists = findElements(element, (el) => el.type === 'FlatList');
    expect(flatLists.length).toBe(0);
  });

  test('renders FlatList with bookmark data', () => {
    mockBookmarkedVerses = [
      { surahNumber: 1, verseNumber: 1, createdAt: 1000, uthmaniText: 'text1', translationText: 'trans1' },
      { surahNumber: 2, verseNumber: 255, createdAt: 2000, uthmaniText: 'text2', translationText: 'trans2' },
    ];
    mockIsLoading = false;
    const element = (BookmarksScreen as any)() as unknown as MockElement;
    const flatLists = findElements(element, (el) => el.type === 'FlatList');
    expect(flatLists.length).toBe(1);
    expect(flatLists[0].props.data).toEqual(mockBookmarkedVerses);
  });

  test('FlatList has performance props configured', () => {
    mockBookmarkedVerses = [{ surahNumber: 1, verseNumber: 1, createdAt: 1000, uthmaniText: 'text', translationText: 'translation' }];
    mockIsLoading = false;
    const element = (BookmarksScreen as any)() as unknown as MockElement;
    const flatLists = findElements(element, (el) => el.type === 'FlatList');
    expect(flatLists[0].props.initialNumToRender).toBe(20);
    expect(flatLists[0].props.windowSize).toBe(5);
  });

  test('bookmark press calls navigateToVerse and router.navigate (AC #4)', () => {
    mockUIState.navigateToVerse.mockClear(); mockNavigate.mockClear();
    mockBookmarkedVerses = [{ surahNumber: 2, verseNumber: 255, createdAt: 1000, uthmaniText: 'text', translationText: 'trans' }];
    mockIsLoading = false;
    const element = (BookmarksScreen as any)() as unknown as MockElement;
    const flatLists = findElements(element, (el) => el.type === 'FlatList');
    const renderItem = flatLists[0].props.renderItem as (info: { item: (typeof mockBookmarkedVerses)[0] }) => unknown;
    const rendered = renderItem({ item: mockBookmarkedVerses[0] }) as unknown as MockElement;
    expect(rendered.props.onPress).toBeDefined();
    (rendered.props.onPress as () => void)();
    expect(mockUIState.navigateToVerse).toHaveBeenCalledWith(2, 255);
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  test('bookmark delete calls removeBookmark (AC #5)', () => {
    mockRemoveBookmark.mockClear();
    mockBookmarkedVerses = [{ surahNumber: 1, verseNumber: 1, createdAt: 1000, uthmaniText: 'text', translationText: 'trans' }];
    mockIsLoading = false;
    const element = (BookmarksScreen as any)() as unknown as MockElement;
    const flatLists = findElements(element, (el) => el.type === 'FlatList');
    const renderItem = flatLists[0].props.renderItem as (info: { item: (typeof mockBookmarkedVerses)[0] }) => unknown;
    const rendered = renderItem({ item: mockBookmarkedVerses[0] }) as unknown as MockElement;
    expect(rendered.props.onDelete).toBeDefined();
    (rendered.props.onDelete as () => void)();
    expect(mockRemoveBookmark).toHaveBeenCalledWith(1, 1);
  });

  test('FlatList keyExtractor produces surah:verse format', () => {
    mockBookmarkedVerses = [{ surahNumber: 2, verseNumber: 255, createdAt: 1000, uthmaniText: 'text', translationText: 'trans' }];
    mockIsLoading = false;
    const element = (BookmarksScreen as any)() as unknown as MockElement;
    const flatLists = findElements(element, (el) => el.type === 'FlatList');
    const keyExtractor = flatLists[0].props.keyExtractor as (item: { surahNumber: number; verseNumber: number }) => string;
    expect(keyExtractor({ surahNumber: 2, verseNumber: 255 })).toBe('2:255');
  });
});
