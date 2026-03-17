jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useCallback: (fn: unknown) => fn,
  useMemo: (fn: () => unknown) => (fn as () => unknown)(),
  useRef: (val: unknown) => ({ current: val ?? null }),
  useEffect: () => {},
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
  firstVisibleVerse: null as string | null,
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

const mockAudioState = {
  currentSurah: null as number | null,
  play: jest.fn(),
};
jest.mock('@/features/audio/stores/useAudioStore', () => {
  const useAudioStore = Object.assign(
    (selector: (s: typeof mockAudioState) => unknown) => selector(mockAudioState),
    { getState: () => mockAudioState, setState: () => {}, subscribe: () => () => {} },
  );
  return { useAudioStore };
});

const mockNavigate = jest.fn();
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));
jest.mock('@expo/vector-icons/Ionicons', () => ({ __esModule: true, default: 'Ionicons' }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: mockNavigate, push: jest.fn(), back: jest.fn() }),
}));

import { ReadingChromeOverlay } from './ReadingChromeOverlay';

interface MockElement {
  type: string | symbol | object;
  props: Record<string, unknown>;
}

function findElements(element: unknown, predicate: (el: MockElement) => boolean): MockElement[] {
  const results: MockElement[] = [];
  function walk(node: unknown) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
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

function renderOverlay(props?: Record<string, unknown>): MockElement {
  const result = (ReadingChromeOverlay as any)(props ?? {}) as unknown;
  return result as MockElement;
}

describe('ReadingChromeOverlay', () => {
  beforeEach(() => {
    mockUIState.isChromeVisible = true;
    mockUIState.currentMode = 'reading';
  });

  test('renders surah name in Arabic and English when visible in reading mode', () => {
    const element = renderOverlay();
    const arabicTitle = findElements(element, (el) => el.props?.variant === 'surahTitleArabic');
    expect(arabicTitle.length).toBeGreaterThan(0);
    const englishTitle = findElements(element, (el) => el.props?.variant === 'surahTitleEnglish');
    expect(englishTitle.length).toBeGreaterThan(0);
  });

  test('renders settings gear icon when visible', () => {
    const element = renderOverlay();
    const icons = findElements(element, (el) => el.type === 'Ionicons');
    const settingsIcon = icons.find((i) => i.props.name === 'settings-outline');
    expect(settingsIcon).toBeDefined();
  });

  test('renders with pointerEvents none when not visible', () => {
    mockUIState.isChromeVisible = false;
    const element = renderOverlay();
    const animatedViews = findElements(element, (el) => el.type === 'Animated.View');
    animatedViews.forEach((v) => {
      expect(v.props.pointerEvents).toBe('none');
    });
  });

  test('renders with pointerEvents auto when visible', () => {
    mockUIState.isChromeVisible = true;
    const element = renderOverlay();
    const animatedViews = findElements(element, (el) => el.type === 'Animated.View');
    animatedViews.forEach((v) => {
      expect(v.props.pointerEvents).toBe('auto');
    });
  });

  test('uses safe area insets for top padding', () => {
    const element = renderOverlay();
    const animatedViews = findElements(element, (el) => el.type === 'Animated.View');
    const topBar = animatedViews[0];
    const style = topBar.props.style as unknown[];
    const flatStyle = Object.assign({}, ...(style as object[]));
    expect(flatStyle.paddingTop).toBeGreaterThanOrEqual(44);
  });

  test('settings gear press navigates to settings', () => {
    const element = renderOverlay();
    const settingsButton = findElements(
      element,
      (el) => el.type === 'Pressable' && el.props?.accessibilityLabel === 'Settings',
    );
    expect(settingsButton.length).toBe(1);
    (settingsButton[0].props.onPress as () => void)();
    expect(mockNavigate).toHaveBeenCalledWith('/settings');
  });

  test('renders verse indicator text', () => {
    const element = renderOverlay();
    const captions = findElements(element, (el) => el.props?.variant === 'uiCaption');
    const verseCaption = captions.find((el) => {
      const children = el.props.children;
      const text = Array.isArray(children) ? children.join('') : String(children);
      return text.includes('Verse') && text.includes('of') && text.includes('7');
    });
    expect(verseCaption).toBeDefined();
  });

  test('verse indicator has onPress handler', () => {
    const mockOnVerseJumpPress = jest.fn();
    const element = renderOverlay({ onVerseJumpPress: mockOnVerseJumpPress });
    const verseJumpButton = findElements(
      element,
      (el) => el.type === 'Pressable' && el.props?.accessibilityLabel === 'Go to verse',
    );
    expect(verseJumpButton.length).toBe(1);
    (verseJumpButton[0].props.onPress as () => void)();
    expect(mockOnVerseJumpPress).toHaveBeenCalled();
  });

  test('renders mode toggle button', () => {
    const element = renderOverlay();
    const modeToggle = findElements(
      element,
      (el) => el.type === 'Pressable' && el.props?.accessibilityLabel === 'Switch to Mushaf Mode',
    );
    expect(modeToggle.length).toBe(1);
  });

  test('shows albums-outline icon when in reading mode', () => {
    const element = renderOverlay();
    const icons = findElements(element, (el) => el.type === 'Ionicons');
    const modeIcon = icons.find((i) => i.props.name === 'albums-outline');
    expect(modeIcon).toBeDefined();
  });

  test('shows list-outline icon when in mushaf mode', () => {
    mockUIState.currentMode = 'mushaf';
    const element = renderOverlay();
    const icons = findElements(element, (el) => el.type === 'Ionicons');
    const modeIcon = icons.find((i) => i.props.name === 'list-outline');
    expect(modeIcon).toBeDefined();
  });

  test('calls setMode with opposite mode on toggle press', () => {
    mockUIState.setMode.mockClear();
    const element = renderOverlay();
    const modeToggle = findElements(
      element,
      (el) => el.type === 'Pressable' && el.props?.accessibilityLabel === 'Switch to Mushaf Mode',
    );
    (modeToggle[0].props.onPress as () => void)();
    expect(mockUIState.setMode).toHaveBeenCalledWith('mushaf');
  });

  test('has correct accessibility label for mushaf mode toggle', () => {
    mockUIState.currentMode = 'mushaf';
    const element = renderOverlay();
    const modeToggle = findElements(
      element,
      (el) => el.type === 'Pressable' && el.props?.accessibilityLabel === 'Switch to Reading Mode',
    );
    expect(modeToggle.length).toBe(1);
  });

  test('shows play button when no audio is loaded', () => {
    mockAudioState.currentSurah = null;
    const element = renderOverlay();
    const playBtn = findElements(
      element,
      (el) => el.type === 'Pressable' && el.props?.accessibilityLabel === 'Play surah',
    );
    expect(playBtn.length).toBe(1);
  });

  test('hides play button when audio is loaded', () => {
    mockAudioState.currentSurah = 1;
    const element = renderOverlay();
    const playBtn = findElements(
      element,
      (el) => el.type === 'Pressable' && el.props?.accessibilityLabel === 'Play surah',
    );
    expect(playBtn.length).toBe(0);
  });

  test('play button calls audioPlay with currentSurah and firstVisibleVerse', () => {
    mockAudioState.currentSurah = null;
    mockAudioState.play.mockClear();
    mockUIState.firstVisibleVerse = '1:3';
    const element = renderOverlay();
    const playBtn = findElements(
      element,
      (el) => el.type === 'Pressable' && el.props?.accessibilityLabel === 'Play surah',
    );
    (playBtn[0].props.onPress as () => void)();
    expect(mockAudioState.play).toHaveBeenCalledWith(1, undefined, '1:3');
  });

  test('play button passes undefined when firstVisibleVerse is null', () => {
    mockAudioState.currentSurah = null;
    mockAudioState.play.mockClear();
    mockUIState.firstVisibleVerse = null;
    const element = renderOverlay();
    const playBtn = findElements(
      element,
      (el) => el.type === 'Pressable' && el.props?.accessibilityLabel === 'Play surah',
    );
    (playBtn[0].props.onPress as () => void)();
    expect(mockAudioState.play).toHaveBeenCalledWith(1, undefined, undefined);
  });

  test('hides English name and verse count in mushaf mode', () => {
    mockUIState.currentMode = 'mushaf';
    const element = renderOverlay();
    const arabicTitle = findElements(element, (el) => el.props?.variant === 'surahTitleArabic');
    expect(arabicTitle.length).toBeGreaterThan(0);
    const englishTitle = findElements(element, (el) => el.props?.variant === 'surahTitleEnglish');
    expect(englishTitle.length).toBe(0);
    const captions = findElements(element, (el) => el.props?.variant === 'uiCaption');
    const verseCaption = captions.find((el) => {
      const children = el.props.children;
      const text = Array.isArray(children) ? children.join('') : String(children);
      return text.includes('Verse');
    });
    expect(verseCaption).toBeUndefined();
  });

  test('shows English name and verse count in reading mode', () => {
    const element = renderOverlay();
    const englishTitle = findElements(element, (el) => el.props?.variant === 'surahTitleEnglish');
    expect(englishTitle.length).toBeGreaterThan(0);
    const captions = findElements(element, (el) => el.props?.variant === 'uiCaption');
    const verseCaption = captions.find((el) => {
      const children = el.props.children;
      const text = Array.isArray(children) ? children.join('') : String(children);
      return text.includes('Verse');
    });
    expect(verseCaption).toBeDefined();
  });
});
