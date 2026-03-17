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

import { SurahHeader } from './SurahHeader';

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

describe('SurahHeader', () => {
  const defaultProps = {
    surahNumber: 2,
    nameArabic: '\u0627\u0644\u0628\u0642\u0631\u0629',
    nameEnglish: 'The Cow',
    verseCount: 286,
    revelationType: 'medinan' as const,
  };

  test('renders surah name in Arabic with surahTitleArabic variant', () => {
    const element = SurahHeader(defaultProps) as unknown as MockElement;
    const arabicTitle = findElements(element, (el) => el.props?.variant === 'surahTitleArabic');
    expect(arabicTitle.length).toBeGreaterThan(0);
    expect(arabicTitle[0].props.children).toBe('\u0627\u0644\u0628\u0642\u0631\u0629');
  });

  test('renders surah name in English with surahTitleEnglish variant', () => {
    const element = SurahHeader(defaultProps) as unknown as MockElement;
    const englishTitle = findElements(element, (el) => el.props?.variant === 'surahTitleEnglish');
    expect(englishTitle.length).toBeGreaterThan(0);
    expect(englishTitle[0].props.children).toBe('The Cow');
  });

  test('shows verse count and revelation type', () => {
    const element = SurahHeader(defaultProps) as unknown as MockElement;
    const captionElements = findElements(element, (el) => el.props?.variant === 'uiCaption');
    expect(captionElements.length).toBeGreaterThan(0);
    const children = captionElements[0].props.children;
    const text = Array.isArray(children) ? children.join('') : String(children);
    expect(text).toContain('286');
    expect(text).toContain('medinan');
  });

  test('shows Bismillah for surahs other than 1 and 9', () => {
    const element = SurahHeader(defaultProps) as unknown as MockElement;
    const quranElements = findElements(element, (el) => el.props?.variant === 'quran');
    const bismillah = quranElements.find(
      (el) => el.props.children === 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ',
    );
    expect(bismillah).toBeDefined();
  });

  test('does NOT show Bismillah for surah 9 (At-Tawbah)', () => {
    const element = SurahHeader({
      ...defaultProps, surahNumber: 9, nameArabic: '\u0627\u0644\u062a\u0648\u0628\u0629', nameEnglish: 'The Repentance',
    }) as unknown as MockElement;
    const quranElements = findElements(element, (el) => el.props?.variant === 'quran');
    const bismillah = quranElements.find(
      (el) => el.props.children === 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ',
    );
    expect(bismillah).toBeUndefined();
  });

  test('does NOT show duplicate Bismillah for surah 1 (Al-Fatiha)', () => {
    const element = SurahHeader({
      ...defaultProps, surahNumber: 1, nameArabic: '\u0627\u0644\u0641\u0627\u062a\u062d\u0629', nameEnglish: 'The Opening', verseCount: 7, revelationType: 'meccan',
    }) as unknown as MockElement;
    const quranElements = findElements(element, (el) => el.props?.variant === 'quran');
    const bismillah = quranElements.find(
      (el) => el.props.children === 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ',
    );
    expect(bismillah).toBeUndefined();
  });
});
