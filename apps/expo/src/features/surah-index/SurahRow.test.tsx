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

jest.mock('@/features/audio/stores/useAudioStore', () => {
  const useAudioStore = Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({ selectedReciterId: 'alafasy' }),
    {
      getState: () => ({ selectedReciterId: 'alafasy' }),
      setState: () => {},
      subscribe: () => () => {},
    },
  );
  return { useAudioStore };
});

jest.mock('@/features/audio/components/DownloadButton', () => ({
  DownloadButton: () => 'DownloadButton',
}));

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

const imported = require('./SurahRow');
const SurahRow = imported.SurahRow;

const mockSurah = {
  number: 1,
  nameArabic: '\u0627\u0644\u0641\u0627\u062a\u062d\u0629',
  nameEnglish: 'The Opening',
  nameTransliteration: 'Al-Fatihah',
  verseCount: 7,
  revelationType: 'meccan' as const,
  order: 5,
};

interface MockElement {
  type: string | { type?: unknown };
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
    // Walk Pressable style function result children
    if (el.props?.style && typeof el.props.style === 'function') {
      // skip style functions
    }
  }
  walk(element);
  return results;
}

// Get the inner render function from React.memo
const SurahRowRender =
  (SurahRow as unknown as { type: (...args: unknown[]) => unknown }).type || SurahRow;

describe('SurahRow', () => {
  test('renders surah number badge', () => {
    const onPress = jest.fn();
    const element = (SurahRowRender as (...args: unknown[]) => unknown)({
      surah: mockSurah,
      onPress,
    }) as unknown as MockElement;
    const textElements = findElements(element, (el) => el.props?.variant === 'ui');
    const numberText = textElements.find((el) => el.props.children === 1);
    expect(numberText).toBeDefined();
  });

  test('renders Arabic name with surahTitleArabic variant', () => {
    const onPress = jest.fn();
    const element = (SurahRowRender as (...args: unknown[]) => unknown)({
      surah: mockSurah,
      onPress,
    }) as unknown as MockElement;
    const arabicElements = findElements(element, (el) => el.props?.variant === 'surahTitleArabic');
    expect(arabicElements.length).toBeGreaterThan(0);
    expect(arabicElements[0].props.children).toBe('\u0627\u0644\u0641\u0627\u062a\u062d\u0629');
  });

  test('renders English name with surahTitleEnglish variant', () => {
    const onPress = jest.fn();
    const element = (SurahRowRender as (...args: unknown[]) => unknown)({
      surah: mockSurah,
      onPress,
    }) as unknown as MockElement;
    const englishElements = findElements(
      element,
      (el) => el.props?.variant === 'surahTitleEnglish',
    );
    expect(englishElements.length).toBeGreaterThan(0);
    expect(englishElements[0].props.children).toBe('The Opening');
  });

  test('renders verse count and revelation type as caption', () => {
    const onPress = jest.fn();
    const element = (SurahRowRender as (...args: unknown[]) => unknown)({
      surah: mockSurah,
      onPress,
    }) as unknown as MockElement;
    const captionElements = findElements(element, (el) => el.props?.variant === 'uiCaption');
    expect(captionElements.length).toBeGreaterThan(0);
    const captionChildren = captionElements[0].props.children;
    // Children is an array: ['Meccan', ' · ', 7, ' verses']
    const captionText = Array.isArray(captionChildren) ? captionChildren.join('') : captionChildren;
    expect(captionText).toContain('Meccan');
    expect(captionText).toContain('7');
    expect(captionText).toContain('verses');
  });

  test('renders Medinan revelation type correctly', () => {
    const onPress = jest.fn();
    const medinanSurah = {
      ...mockSurah,
      number: 2,
      nameEnglish: 'The Cow',
      nameArabic: '\u0627\u0644\u0628\u0642\u0631\u0629',
      verseCount: 286,
      revelationType: 'medinan' as const,
    };
    const element = (SurahRowRender as (...args: unknown[]) => unknown)({
      surah: medinanSurah,
      onPress,
    }) as unknown as MockElement;
    const captionElements = findElements(element, (el) => el.props?.variant === 'uiCaption');
    const captionChildren = captionElements[0].props.children;
    const captionText = Array.isArray(captionChildren) ? captionChildren.join('') : captionChildren;
    expect(captionText).toContain('Medinan');
  });

  test('calls onPress with correct surah number when pressed', () => {
    const onPress = jest.fn();
    const element = (SurahRowRender as (...args: unknown[]) => unknown)({
      surah: mockSurah,
      onPress,
    }) as unknown as MockElement;
    // The root element is a Pressable with onPress
    const pressHandler = element.props.onPress as (...args: unknown[]) => void;
    expect(pressHandler).toBeDefined();
    pressHandler();
    expect(onPress).toHaveBeenCalledWith(1);
  });

  test('renders selection indicator when isSelected is true', () => {
    const onPress = jest.fn();
    const element = (SurahRowRender as (...args: unknown[]) => unknown)({
      surah: mockSurah,
      onPress,
      isSelected: true,
    }) as unknown as MockElement;
    // Should have a selected indicator View with bookmark color background
    const indicators = findElements(element, (el) => {
      if (el.type !== 'View') return false;
      const styleArr = el.props.style;
      if (!Array.isArray(styleArr)) return false;
      const flat = Object.assign({}, ...styleArr);
      return flat.position === 'absolute' && flat.width === 3;
    });
    expect(indicators.length).toBe(1);
  });

  test('does not render selection indicator when isSelected is false', () => {
    const onPress = jest.fn();
    const element = (SurahRowRender as (...args: unknown[]) => unknown)({
      surah: mockSurah,
      onPress,
      isSelected: false,
    }) as unknown as MockElement;
    const indicators = findElements(element, (el) => {
      if (el.type !== 'View') return false;
      const styleArr = el.props.style;
      if (!Array.isArray(styleArr)) return false;
      const flat = Object.assign({}, ...styleArr);
      return flat.position === 'absolute' && flat.width === 3;
    });
    expect(indicators.length).toBe(0);
  });
});
