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
  currentSurah: 1, currentVerse: 1, lastReadTimestamp: Date.now(), isChromeVisible: true, scrollVersion: 0,
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

// Use full SURAH_METADATA for SurahNavigator which indexes all 114 surahs
jest.mock('quran-data', () => {
  const { SURAH_METADATA } = jest.requireActual('quran-data/src/surah-metadata');
  return {
    SURAH_METADATA,
    JUZ_METADATA: [{ number: 1, startSurah: 1, startVerse: 1, startPage: 1 }],
    HIZB_METADATA: [{ number: 1, juz: 1, startSurah: 1, startVerse: 1, startPage: 1 }],
    TOTAL_PAGES: 604,
    getPageForVerse: jest.fn(() => 1),
    getFirstVerseForPage: jest.fn(() => ({ surah: 1, verse: 1 })),
    getJuzForPage: jest.fn(() => 1),
    getHizbForPage: jest.fn(() => 1),
  };
});

const imported = require('./SurahNavigator');
const SurahNavigator =
  typeof imported.SurahNavigator === 'function'
    ? imported.SurahNavigator
    : (imported.SurahNavigator as unknown as { type: (...args: unknown[]) => unknown }).type;

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
  }
  walk(element);
  return results;
}

describe('SurahNavigator', () => {
  test('shows previous and next surah names', () => {
    const onNavigate = jest.fn();
    const element = (SurahNavigator as (...args: unknown[]) => unknown)({
      currentSurah: 2, onNavigate,
    }) as unknown as MockElement;
    const englishNames = findElements(element, (el) => el.props?.variant === 'surahTitleEnglish');
    expect(englishNames.length).toBe(2);
    expect(englishNames[0].props.children).toBe('The Opening');
    expect(englishNames[1].props.children).toBe('Family of Imran');
  });

  test('wraps correctly: Surah 1 prev -> Surah 114', () => {
    const onNavigate = jest.fn();
    const element = (SurahNavigator as (...args: unknown[]) => unknown)({
      currentSurah: 1, onNavigate,
    }) as unknown as MockElement;
    const englishNames = findElements(element, (el) => el.props?.variant === 'surahTitleEnglish');
    expect(englishNames[0].props.children).toBe('Mankind');
    const pressables = findElements(element, (el) => el.type === 'Pressable');
    expect(pressables.length).toBe(2);
    const prevHandler = pressables[0].props.onPress as (...args: unknown[]) => void;
    prevHandler();
    expect(onNavigate).toHaveBeenCalledWith(114);
  });

  test('wraps correctly: Surah 114 next -> Surah 1', () => {
    const onNavigate = jest.fn();
    const element = (SurahNavigator as (...args: unknown[]) => unknown)({
      currentSurah: 114, onNavigate,
    }) as unknown as MockElement;
    const englishNames = findElements(element, (el) => el.props?.variant === 'surahTitleEnglish');
    expect(englishNames[1].props.children).toBe('The Opening');
    const pressables = findElements(element, (el) => el.type === 'Pressable');
    const nextHandler = pressables[1].props.onPress as (...args: unknown[]) => void;
    nextHandler();
    expect(onNavigate).toHaveBeenCalledWith(1);
  });

  test('calls onNavigate with correct surah number', () => {
    const onNavigate = jest.fn();
    const element = (SurahNavigator as (...args: unknown[]) => unknown)({
      currentSurah: 50, onNavigate,
    }) as unknown as MockElement;
    const pressables = findElements(element, (el) => el.type === 'Pressable');
    (pressables[0].props.onPress as (...args: unknown[]) => unknown)();
    expect(onNavigate).toHaveBeenCalledWith(49);
    (pressables[1].props.onPress as (...args: unknown[]) => unknown)();
    expect(onNavigate).toHaveBeenCalledWith(51);
  });
});
