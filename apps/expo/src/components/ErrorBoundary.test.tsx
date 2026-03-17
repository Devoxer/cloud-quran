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
    selectedTheme: 'system',
    currentMode: 'reading',
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
  };
  const useUIStore = Object.assign(
    (selector: (s: typeof mockState) => unknown) => selector(mockState),
    { getState: () => mockState, setState: () => {}, subscribe: () => () => {} },
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

import { ErrorBoundary } from './ErrorBoundary';

describe('ErrorBoundary', () => {
  test('renders children when no error occurs', () => {
    const boundary = new ErrorBoundary({ screenName: 'Test', children: 'child content' });
    boundary.state = { hasError: false, error: null };
    const result = boundary.render();
    expect(result).toBe('child content');
  });

  test('renders fallback UI with screen name when error occurs', () => {
    const boundary = new ErrorBoundary({ screenName: 'Reading', children: 'child' });
    boundary.state = { hasError: true, error: new Error('Test error') };
    const result = boundary.render() as { props: { children: { props: { children: unknown[] } } } };
    expect(result).not.toBe('child');
    expect(result).toBeDefined();
  });

  test('getDerivedStateFromError returns hasError true', () => {
    const state = ErrorBoundary.getDerivedStateFromError(new Error('fail'));
    expect(state.hasError).toBe(true);
    expect(state.error).toBeInstanceOf(Error);
    expect(state.error!.message).toBe('fail');
  });

  test('handleRetry calls setState to reset error state', () => {
    const boundary = new ErrorBoundary({ screenName: 'Test', children: 'child' });
    boundary.state = { hasError: true, error: new Error('fail') };
    let capturedState: { hasError: boolean; error: Error | null } | null = null;
    boundary.setState = ((state: { hasError: boolean; error: Error | null }) => {
      capturedState = state;
    }) as typeof boundary.setState;
    boundary.handleRetry();
    expect(capturedState!.hasError).toBe(false);
    expect(capturedState!.error).toBeNull();
  });
});
