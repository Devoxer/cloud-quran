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

jest.mock('react-native-gesture-handler', () => ({
  Swipeable: 'Swipeable',
  GestureHandlerRootView: 'GestureHandlerRootView',
}));

jest.mock('@/features/bookmarks/useBookmarkStore', () => {
  const useBookmarkStore = Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({ bookmarks: [], addBookmark: () => {}, removeBookmark: () => {}, toggleBookmark: () => {} }),
    { getState: () => ({ bookmarks: [] }), setState: () => {}, subscribe: () => () => {} },
  );
  return { useBookmarkStore };
});

const imported = require('./BookmarkRow');
const BookmarkRow =
  typeof imported.BookmarkRow === 'function'
    ? imported.BookmarkRow
    : (imported.BookmarkRow as { type: (props: Record<string, unknown>) => unknown }).type;

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

describe('BookmarkRow', () => {
  const mockOnPress = jest.fn();
  const mockOnDelete = jest.fn();
  const defaultProps = {
    surahNumber: 1, verseNumber: 1,
    uthmaniText: 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ',
    onPress: mockOnPress, onDelete: mockOnDelete,
  };

  test('renders surah name and verse number', () => {
    const element = BookmarkRow(defaultProps) as unknown as MockElement;
    const surahNameElements = findElements(element,
      (el) => el.props?.variant === 'surahTitleEnglish' && el.props?.children === 'The Opening',
    );
    expect(surahNameElements.length).toBeGreaterThanOrEqual(1);
    const verseNumElements = findElements(element, (el) => {
      if (el.props?.variant !== 'uiCaption') return false;
      const children = el.props.children;
      if (Array.isArray(children)) return children.includes('Verse ') && children.includes(1);
      return false;
    });
    expect(verseNumElements.length).toBeGreaterThanOrEqual(1);
  });

  test('renders Arabic text preview', () => {
    const element = BookmarkRow(defaultProps) as unknown as MockElement;
    const textElements = findElements(element, (el) => el.props?.children === defaultProps.uthmaniText);
    expect(textElements.length).toBeGreaterThanOrEqual(1);
  });

  test('calls onPress when row is pressed', () => {
    const element = BookmarkRow(defaultProps) as unknown as MockElement;
    const pressables = findElements(element,
      (el) => el.type === 'Pressable' && typeof el.props?.onPress === 'function',
    );
    expect(pressables.length).toBeGreaterThanOrEqual(1);
    const rowPressable = pressables.find((el) => el.props.onPress === mockOnPress);
    expect(rowPressable).toBeDefined();
  });

  test('renders Swipeable wrapper for swipe-to-delete', () => {
    const element = BookmarkRow(defaultProps) as unknown as MockElement;
    expect(element.type).toBe('Swipeable');
    expect(element.props.renderRightActions).toBeDefined();
  });

  test('renderRightActions provides a delete button', () => {
    const element = BookmarkRow(defaultProps) as unknown as MockElement;
    const renderRightActions = element.props.renderRightActions as () => unknown;
    const actions = renderRightActions() as MockElement;
    expect(actions.type).toBe('Pressable');
    expect(actions.props.accessibilityLabel).toBe('Delete bookmark');
  });

  test('has correct accessibility label on row', () => {
    const element = BookmarkRow(defaultProps) as unknown as MockElement;
    const pressables = findElements(element,
      (el) => el.type === 'Pressable' && el.props?.accessibilityRole === 'button',
    );
    const rowPressable = pressables.find(
      (el) => el.props.accessibilityLabel === 'The Opening, verse 1',
    );
    expect(rowPressable).toBeDefined();
  });
});
