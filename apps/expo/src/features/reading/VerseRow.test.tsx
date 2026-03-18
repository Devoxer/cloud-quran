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
  selectedTheme: 'system',
  currentMode: 'reading',
  fontSize: 28,
  currentSurah: 1,
  currentVerse: 1,
  lastReadTimestamp: Date.now(),
  isChromeVisible: true,
  scrollVersion: 0,
  tapToSeek: false,
  showTransliteration: false,
  toggleTransliteration: jest.fn(),
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
  getPageForVerse: jest.fn(() => 1),
  getFirstVerseForPage: jest.fn(() => ({ surah: 1, verse: 1 })),
  getJuzForPage: jest.fn(() => 1),
  getHizbForPage: jest.fn(() => 1),
}));

jest.mock('@expo/vector-icons/Ionicons', () => ({ __esModule: true, default: 'Ionicons' }));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'LIGHT' },
}));

jest.mock('react-native-gesture-handler', () => ({
  Gesture: {
    LongPress: () => ({
      minDuration: () => ({ onStart: () => ({}) }),
    }),
  },
  GestureDetector: ({ children }: { children: unknown }) => children,
}));

jest.mock('react-native-reanimated', () => ({
  runOnJS: (fn: unknown) => fn,
}));

// Mock useAudioStore — mutable state for per-test control
let mockCurrentSurah: number | null = null;
const mockSeekToVerse = jest.fn();
const mockAudioPlay = jest.fn();

jest.mock('@/features/audio/stores/useAudioStore', () => {
  const useAudioStore = Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({
        currentSurah: mockCurrentSurah,
        seekToVerse: mockSeekToVerse,
        play: mockAudioPlay,
      }),
    {
      getState: () => ({
        currentSurah: mockCurrentSurah,
        seekToVerse: mockSeekToVerse,
        play: mockAudioPlay,
      }),
      setState: () => {},
      subscribe: () => () => {},
    },
  );
  return { useAudioStore };
});

// Mock useBookmarkStore — mutable state for per-test control
let mockBookmarks: Array<{ surahNumber: number; verseNumber: number; createdAt: number }> = [];
const mockToggleBookmark = jest.fn();

jest.mock('@/features/bookmarks/useBookmarkStore', () => {
  const useBookmarkStore = Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({
        bookmarks: mockBookmarks,
        addBookmark: () => {},
        removeBookmark: () => {},
        toggleBookmark: mockToggleBookmark,
      }),
    {
      getState: () => ({ bookmarks: mockBookmarks }),
      setState: () => {},
      subscribe: () => () => {},
    },
  );
  return { useBookmarkStore };
});

const imported = require('./VerseRow');
// React.memo wraps the component — extract the inner render function
const VerseRow =
  typeof imported.VerseRow === 'function'
    ? imported.VerseRow
    : (imported.VerseRow as { type: (props: Record<string, unknown>) => unknown }).type;

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

describe('VerseRow', () => {
  beforeEach(() => {
    mockCurrentSurah = null;
    mockUIState.tapToSeek = false;
    mockBookmarks = [];
  });

  const defaultProps = {
    surahNumber: 1,
    verseNumber: 1,
    uthmaniText: 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ',
    translationText: 'In the name of Allah, the Entirely Merciful, the Especially Merciful.',
  };

  test('renders Arabic text', () => {
    mockBookmarks = [];
    const element = VerseRow(defaultProps) as unknown as MockElement;
    const textElements = findElements(element, (el) => el.type === 'Text');
    expect(textElements.length).toBeGreaterThanOrEqual(3);
    const arabicText = textElements.find((el) => el.props.children === defaultProps.uthmaniText);
    expect(arabicText).toBeDefined();
  });

  test('renders translation text', () => {
    mockBookmarks = [];
    const element = VerseRow(defaultProps) as unknown as MockElement;
    const textElements = findElements(element, (el) => el.type === 'Text');
    const translationText = textElements.find(
      (el) => el.props?.children === defaultProps.translationText,
    );
    expect(translationText).toBeDefined();
  });

  test('renders ayah badge with verse number', () => {
    mockBookmarks = [];
    const element = VerseRow(defaultProps) as unknown as MockElement;
    const badgeTexts = findElements(element, (el) => {
      if (el.type !== 'Text') return false;
      const children = Array.isArray(el.props?.children) ? el.props.children : [el.props?.children];
      return children.includes(1);
    });
    expect(badgeTexts.length).toBe(1);
  });

  test('is memoized (React.memo wraps the component)', () => {
    expect(imported.VerseRow).toBeDefined();
    expect(typeof imported.VerseRow).toBe('object');
    expect((imported.VerseRow as unknown as { type: unknown }).type).toBe(VerseRow);
  });

  test('renders bookmark icon (Ionicons)', () => {
    mockBookmarks = [];
    const element = VerseRow(defaultProps) as unknown as MockElement;
    const icons = findElements(element, (el) => el.type === 'Ionicons');
    expect(icons.length).toBe(1);
  });

  test('bookmark icon shows bookmark-outline for unbookmarked verse', () => {
    mockBookmarks = [];
    const element = VerseRow(defaultProps) as unknown as MockElement;
    const icons = findElements(element, (el) => el.type === 'Ionicons');
    expect(icons[0].props.name).toBe('bookmark-outline');
    const { themes } = require('@/theme/tokens');
    expect(icons[0].props.color).toBe(themes.light.text.ui);
  });

  test('bookmark icon shows bookmark (filled) for bookmarked verse', () => {
    mockBookmarks = [{ surahNumber: 1, verseNumber: 1, createdAt: Date.now() }];
    const element = VerseRow(defaultProps) as unknown as MockElement;
    const icons = findElements(element, (el) => el.type === 'Ionicons');
    expect(icons[0].props.name).toBe('bookmark');
    const { themes } = require('@/theme/tokens');
    expect(icons[0].props.color).toBe(themes.light.accent.bookmark);
  });

  test('bookmark icon has accessibility label', () => {
    mockBookmarks = [];
    const element = VerseRow(defaultProps) as unknown as MockElement;
    const pressables = findElements(
      element,
      (el) => el.type === 'Pressable' && el.props?.accessibilityRole === 'button',
    );
    expect(pressables.length).toBeGreaterThanOrEqual(1);
    const bookmarkButton = pressables.find(
      (el) =>
        typeof el.props.accessibilityLabel === 'string' &&
        (el.props.accessibilityLabel as string).toLowerCase().includes('bookmark'),
    );
    expect(bookmarkButton).toBeDefined();
  });

  test('renders without highlight by default', () => {
    mockBookmarks = [];
    const element = VerseRow(defaultProps) as unknown as MockElement;
    expect(element.props.testID).toBeUndefined();
  });

  test('renders with highlight testID when isHighlighted is true', () => {
    mockBookmarks = [];
    const element = VerseRow({ ...defaultProps, isHighlighted: true }) as unknown as MockElement;
    expect(element.props.testID).toBe('verse-row-highlighted');
  });

  test('uses accent.audio color for badge when highlighted', () => {
    mockBookmarks = [];
    const element = VerseRow({ ...defaultProps, isHighlighted: true }) as unknown as MockElement;
    const { themes } = require('@/theme/tokens');
    // Find the badge View with borderColor
    const badges = findElements(element, (el) => {
      if (el.type !== 'View') return false;
      const style = el.props?.style;
      if (!style) return false;
      const styles = Array.isArray(style) ? style : [style];
      return styles.some(
        (s: Record<string, unknown>) => s && typeof s === 'object' && 'borderColor' in s,
      );
    });
    expect(badges.length).toBeGreaterThanOrEqual(1);
    const badgeStyle = (
      Array.isArray(badges[0].props.style) ? badges[0].props.style : [badges[0].props.style]
    ).find((s: Record<string, unknown>) => s && 'borderColor' in s);
    expect(badgeStyle.borderColor).toBe(themes.light.accent.audio);
  });

  test('uses text.ui color for badge when not highlighted', () => {
    mockBookmarks = [];
    const element = VerseRow({ ...defaultProps, isHighlighted: false }) as unknown as MockElement;
    const { themes } = require('@/theme/tokens');
    const badges = findElements(element, (el) => {
      if (el.type !== 'View') return false;
      const style = el.props?.style;
      if (!style) return false;
      const styles = Array.isArray(style) ? style : [style];
      return styles.some(
        (s: Record<string, unknown>) => s && typeof s === 'object' && 'borderColor' in s,
      );
    });
    expect(badges.length).toBeGreaterThanOrEqual(1);
    const badgeStyle = (
      Array.isArray(badges[0].props.style) ? badges[0].props.style : [badges[0].props.style]
    ).find((s: Record<string, unknown>) => s && 'borderColor' in s);
    expect(badgeStyle.borderColor).toBe(themes.light.text.ui);
  });

  test('verse container is a View (not Pressable) when tapToSeek is off', () => {
    mockBookmarks = [];
    mockUIState.tapToSeek = false;
    const element = VerseRow(defaultProps) as unknown as MockElement;
    expect(element.type).toBe('View');
  });

  test('verse container is a View when tapToSeek is on but no audio loaded', () => {
    mockBookmarks = [];
    mockUIState.tapToSeek = true;
    mockCurrentSurah = null;
    const element = VerseRow(defaultProps) as unknown as MockElement;
    expect(element.type).toBe('View');
  });

  test('verse container is Pressable when tapToSeek is on and audio is loaded', () => {
    mockBookmarks = [];
    mockUIState.tapToSeek = true;
    mockCurrentSurah = 1;
    const element = VerseRow(defaultProps) as unknown as MockElement;
    expect(element.type).toBe('Pressable');
  });

  test('tap-to-seek calls seekToVerse with correct verse key', () => {
    mockBookmarks = [];
    mockUIState.tapToSeek = true;
    mockCurrentSurah = 1;
    mockSeekToVerse.mockClear();
    const element = VerseRow({ ...defaultProps, verseNumber: 3 }) as unknown as MockElement;
    expect(element.props.onPress).toBeDefined();
    (element.props.onPress as () => void)();
    expect(mockSeekToVerse).toHaveBeenCalledWith('1:3');
  });

  test('Pressable has accessibilityRole button when tap-to-seek is active', () => {
    mockBookmarks = [];
    mockUIState.tapToSeek = true;
    mockCurrentSurah = 1;
    const element = VerseRow(defaultProps) as unknown as MockElement;
    expect(element.props.accessibilityRole).toBe('button');
  });

  test('accepts onLongPress callback prop', () => {
    mockBookmarks = [];
    const mockLongPress = jest.fn();
    const element = VerseRow({ ...defaultProps, onLongPress: mockLongPress }) as unknown as MockElement;
    // On web (test environment), onContextMenu should be set
    expect(element).toBeDefined();
  });

  test('renders without onLongPress (backwards compatible)', () => {
    mockBookmarks = [];
    const element = VerseRow(defaultProps) as unknown as MockElement;
    expect(element).toBeDefined();
    expect(element.type).toBe('View');
  });

  test('does not render transliteration when showTransliteration is false', () => {
    mockBookmarks = [];
    mockUIState.showTransliteration = false;
    const element = VerseRow({
      ...defaultProps,
      transliterationText: 'Bismi Allahi arrahmani arraheem',
    }) as unknown as MockElement;
    const textElements = findElements(element, (el) => el.type === 'Text');
    const transliteration = textElements.find(
      (el) => el.props.children === 'Bismi Allahi arrahmani arraheem',
    );
    expect(transliteration).toBeUndefined();
  });

  test('renders transliteration when showTransliteration is true', () => {
    mockBookmarks = [];
    mockUIState.showTransliteration = true;
    const element = VerseRow({
      ...defaultProps,
      transliterationText: 'Bismi Allahi arrahmani arraheem',
    }) as unknown as MockElement;
    const textElements = findElements(element, (el) => el.type === 'Text');
    const transliteration = textElements.find(
      (el) => el.props.children === 'Bismi Allahi arrahmani arraheem',
    );
    expect(transliteration).toBeDefined();
    mockUIState.showTransliteration = false;
  });

  test('transliteration text has italic fontStyle', () => {
    mockBookmarks = [];
    mockUIState.showTransliteration = true;
    const element = VerseRow({
      ...defaultProps,
      transliterationText: 'Bismi Allahi arrahmani arraheem',
    }) as unknown as MockElement;
    const textElements = findElements(element, (el) => el.type === 'Text');
    const transliteration = textElements.find(
      (el) => el.props.children === 'Bismi Allahi arrahmani arraheem',
    );
    expect(transliteration).toBeDefined();
    const style = transliteration!.props.style;
    const styles = Array.isArray(style) ? style : [style];
    const fontStyle = styles.find((s: Record<string, unknown>) => s && 'fontStyle' in s);
    expect(fontStyle?.fontStyle).toBe('italic');
    mockUIState.showTransliteration = false;
  });

  test('does not render transliteration when transliterationText is undefined', () => {
    mockBookmarks = [];
    mockUIState.showTransliteration = true;
    const element = VerseRow(defaultProps) as unknown as MockElement;
    const textElements = findElements(element, (el) => el.type === 'Text');
    // Should only have Arabic + translation + badge = 3 Text elements
    expect(textElements.length).toBe(3);
    mockUIState.showTransliteration = false;
  });

  test('renders three-layer layout when transliteration is enabled', () => {
    mockBookmarks = [];
    mockUIState.showTransliteration = true;
    const element = VerseRow({
      ...defaultProps,
      transliterationText: 'Bismi Allahi arrahmani arraheem',
    }) as unknown as MockElement;
    const textElements = findElements(element, (el) => el.type === 'Text');
    // Badge + Arabic + transliteration + translation = 4 Text elements
    expect(textElements.length).toBe(4);
    mockUIState.showTransliteration = false;
  });
});
