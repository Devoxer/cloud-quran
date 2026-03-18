// MushafPage has 4 state reads: activeVerseKey (from store), fontFamily, layout, error
let mockFontFamily: string | null = null;
let mockLayout: unknown = null;
let mockError: string | null = null;
let mockStateCallIndex = 0;
let mockFontError = false;
let mockActiveVerseKey: string | null = null;

jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useCallback: (fn: unknown) => fn,
  useMemo: (fn: () => unknown) => (fn as () => unknown)(),
  useRef: (val: unknown) => ({ current: val ?? null }),
  useState: (initial: unknown) => {
    const idx = mockStateCallIndex++;
    if (idx === 0) return [mockFontFamily, () => {}];
    if (idx === 1) return [mockLayout, () => {}];
    if (idx === 2) return [mockError, () => {}];
    return [initial, () => {}];
  },
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
  currentSurah: 1,
  currentVerse: 1,
  lastReadTimestamp: Date.now(),
  isChromeVisible: false,
  scrollVersion: 0,
  tapToSeek: false,
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
      nameArabic: 'الفاتحة',
      nameEnglish: 'The Opening',
      nameTransliteration: 'Al-Fatihah',
      verseCount: 7,
      revelationType: 'meccan',
      order: 5,
    },
    {
      number: 2,
      nameArabic: 'البقرة',
      nameEnglish: 'The Cow',
      nameTransliteration: 'Al-Baqarah',
      verseCount: 286,
      revelationType: 'medinan',
      order: 87,
    },
  ],
  JUZ_METADATA: [
    { number: 1, startSurah: 1, startVerse: 1, startPage: 1 },
    { number: 2, startSurah: 2, startVerse: 142, startPage: 22 },
  ],
  HIZB_METADATA: [
    { number: 1, juz: 1, startSurah: 1, startVerse: 1, startPage: 1 },
    { number: 2, juz: 1, startSurah: 2, startVerse: 75, startPage: 12 },
  ],
  TOTAL_PAGES: 604,
  getPageForVerse: jest.fn(() => 1),
  getFirstVerseForPage: jest.fn(() => ({ surah: 1, verse: 1 })),
  getJuzForPage: jest.fn((page: number) => (page >= 22 ? 2 : 1)),
  getHizbForPage: jest.fn((page: number) => (page >= 12 ? 2 : 1)),
}));

let mockIsAudioPlaying = false;
const mockSeekToVerse = jest.fn();
jest.mock('@/features/audio/stores/useAudioStore', () => {
  const useAudioStore = Object.assign(
    (
      selector: (s: {
        activeVerseKey: string | null;
        isPlaying: boolean;
        seekToVerse: jest.Mock;
      }) => unknown,
    ) =>
      selector({
        activeVerseKey: mockActiveVerseKey,
        isPlaying: mockIsAudioPlaying,
        seekToVerse: mockSeekToVerse,
      }),
    {
      getState: () => ({
        activeVerseKey: mockActiveVerseKey,
        isPlaying: mockIsAudioPlaying,
        seekToVerse: mockSeekToVerse,
      }),
      setState: () => {},
      subscribe: () => () => {},
    },
  );
  return { useAudioStore };
});

jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
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
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

jest.mock('@/services/mushaf-fonts', () => ({
  loadPageFont: jest.fn(async () => {
    if (mockFontError) throw new Error('Font load failed');
    return 'QCF_P001';
  }),
  preloadAdjacentFonts: jest.fn(async () => {}),
  isPageFontCached: jest.fn(() => false),
  getPageFontFamily: jest.fn(() => 'QCF_P001'),
}));

jest.mock('@/services/mushaf-layout', () => ({
  getPageLayout: jest.fn(async () => null),
  clearLayoutCache: jest.fn(() => {}),
}));

import { MushafPage } from './MushafPage';

// Helper to render component and get element tree
function render(props: { pageNumber: number; onTap?: () => void }) {
  mockStateCallIndex = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (MushafPage as any)(props);
}

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

function findAllText(element: unknown): string[] {
  const texts: string[] = [];
  function walk(node: unknown) {
    if (typeof node === 'string') {
      texts.push(node);
      return;
    }
    if (typeof node === 'number') {
      texts.push(String(node));
      return;
    }
    if (!node || typeof node !== 'object') return;
    const el = node as MockElement;
    if (el.props?.children) {
      const children = Array.isArray(el.props.children) ? el.props.children : [el.props.children];
      children.forEach(walk);
    }
  }
  walk(element);
  return texts;
}

// Sample layout data for loaded state tests
const sampleLayout = {
  page: 1,
  lines: [
    { line: 1, type: 'surah-header', text: 'سُورَةُ ٱلْفَاتِحَةِ', surah: '001' },
    {
      line: 2,
      type: 'text',
      text: 'بِسْمِ ٱللَّهِ',
      verseRange: '1:1-1:1',
      words: [
        { location: '1:1:1', word: 'بِسْمِ', qpcV1: '\uFC41', qpcV2: '\uFC41' },
        { location: '1:1:2', word: 'ٱللَّهِ', qpcV1: '\uFC42', qpcV2: '\uFC42' },
      ],
    },
  ],
};

describe('MushafPage — loading state', () => {
  beforeEach(() => {
    mockFontFamily = null;
    mockLayout = null;
    mockError = null;
    mockFontError = false;
    mockActiveVerseKey = null;
  });

  test('renders loading skeleton when font/layout not loaded', () => {
    const element = render({ pageNumber: 1 });
    expect(element).toBeDefined();
    expect(element.type).toBe('View');
    expect(element.props.accessibilityLabel).toContain('loading');
    // Should have skeleton line elements (15 placeholder lines)
    const skeletonLines = findElements(
      element,
      (el) =>
        el.type === 'View' &&
        typeof el.props.style === 'object' &&
        Array.isArray(el.props.style) &&
        el.props.style.some?.(
          (s: Record<string, unknown>) => typeof s === 'object' && s !== null && 'opacity' in s,
        ),
    );
    expect(skeletonLines.length).toBe(15);
  });

  test('uses theme surface.primary for background in loading state', () => {
    const element = render({ pageNumber: 1 });
    const style = element.props.style;
    const flatStyle = Array.isArray(style) ? Object.assign({}, ...style) : style;
    const { themes } = require('@/theme/tokens');
    expect(flatStyle.backgroundColor).toBe(themes.light.surface.primary);
  });

  test('accessibility label contains page number in loading state', () => {
    const element = render({ pageNumber: 42 });
    expect(element.props.accessibilityLabel).toContain('42');
  });
});

describe('MushafPage — error state', () => {
  beforeEach(() => {
    mockFontFamily = null;
    mockLayout = null;
    mockError = null;
    mockFontError = false;
    mockActiveVerseKey = null;
  });

  test('renders error message and retry button on error', () => {
    mockError = 'Network error';
    const element = render({ pageNumber: 1 });
    expect(element.props.accessibilityLabel).toContain('error');
    const texts = findAllText(element);
    expect(texts).toContain('Network error');
    expect(texts).toContain('Retry');
  });

  test('retry button has accessibility label', () => {
    mockError = 'Failed to load';
    const element = render({ pageNumber: 1 });
    const retryButtons = findElements(
      element,
      (el) => el.type === 'Pressable' && el.props.accessibilityLabel === 'Retry loading page',
    );
    expect(retryButtons.length).toBe(1);
  });
});

describe('MushafPage — loaded state', () => {
  beforeEach(() => {
    mockFontFamily = 'QCF_P001';
    mockLayout = sampleLayout;
    mockError = null;
    mockFontError = false;
    mockActiveVerseKey = null;
  });

  test('renders page content when font and layout are loaded', () => {
    const element = render({ pageNumber: 1 });
    expect(element.props.accessibilityLabel).toContain('Surah The Opening');
    expect(element.props.accessibilityRole).toBe('text');
  });

  test('loaded page wraps in Pressable with onTap handler for chrome toggle', () => {
    const mockTap = jest.fn();
    const element = render({ pageNumber: 1, onTap: mockTap });
    expect(element.type).toBe('Pressable');
    expect(element.props.onPress).toBe(mockTap);
  });

  test('renders surah header with Arabic name', () => {
    const element = render({ pageNumber: 1 });
    const surahHeaders = findElements(element, (el) => {
      if (!('line' in el.props)) return false;
      const line = el.props.line as { type: string };
      return line?.type === 'surah-header';
    });
    expect(surahHeaders.length).toBe(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rendered = (surahHeaders[0] as any).type(surahHeaders[0].props);
    const texts = findAllText(rendered);
    expect(texts).toContain('الفاتحة');
  });

  test('passes QPC font family to line renderers', () => {
    const element = render({ pageNumber: 1 });
    const lineViews = findElements(
      element,
      (el) => 'fontFamily' in el.props && el.props.fontFamily === 'QCF_P001',
    );
    expect(lineViews.length).toBeGreaterThan(0);
  });

  test('passes theme text.quran color to line renderers', () => {
    const element = render({ pageNumber: 1 });
    const { themes } = require('@/theme/tokens');
    const lineViews = findElements(
      element,
      (el) => 'quranColor' in el.props && el.props.quranColor === themes.light.text.quran,
    );
    expect(lineViews.length).toBeGreaterThan(0);
  });

  test('uses surface.primary background in loaded state', () => {
    const element = render({ pageNumber: 1 });
    const style = element.props.style;
    const flatStyle = Array.isArray(style) ? Object.assign({}, ...style) : style;
    const { themes } = require('@/theme/tokens');
    expect(flatStyle.backgroundColor).toBe(themes.light.surface.primary);
  });

  test('shows page number at bottom', () => {
    const element = render({ pageNumber: 1 });
    const texts = findAllText(element);
    expect(texts).toContain('1');
  });

  test('renders persistent MushafPageHeader', () => {
    const element = render({ pageNumber: 1 });
    const headers = findElements(
      element,
      (el) => el.props?.pageNumber !== undefined && el.props?.surahNumber !== undefined,
    );
    expect(headers.length).toBe(1);
    expect(headers[0].props.pageNumber).toBe(1);
    expect(headers[0].props.surahNumber).toBe(1);
  });

  test('text line renders as RTL Text with nested word spans', () => {
    const element = render({ pageNumber: 1 });
    const textLineViews = findElements(element, (el) => {
      if (!('line' in el.props)) return false;
      const line = el.props.line as { type: string };
      return line?.type === 'text';
    });
    expect(textLineViews.length).toBeGreaterThan(0);
    const lineEl = textLineViews[0];
    const rendered = (lineEl as any).type(lineEl.props);
    expect(rendered.type).toBe('Text');
    const style = rendered.props.style;
    const flatStyle = Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : style;
    expect(flatStyle.writingDirection).toBe('rtl');
    expect(flatStyle.textAlign).toBe('center');
  });

  test('basmala line keeps centered justification', () => {
    mockLayout = {
      page: 2,
      lines: [{ line: 1, type: 'basmala', text: 'بِسْمِ ٱللَّهِ', qpcV1: '#"!' }],
    };
    const element = render({ pageNumber: 2 });
    const basmalaViews = findElements(element, (el) => {
      if (!('line' in el.props)) return false;
      const line = el.props.line as { type: string };
      return line?.type === 'basmala';
    });
    expect(basmalaViews.length).toBe(1);
    const rendered = (basmalaViews[0] as any).type(basmalaViews[0].props);
    expect(rendered.props.style.justifyContent).toBe('center');
  });

  test('surah header has decorative bordered frame', () => {
    const element = render({ pageNumber: 1 });
    const surahHeaders = findElements(element, (el) => {
      if (!('line' in el.props)) return false;
      const line = el.props.line as { type: string };
      return line?.type === 'surah-header';
    });
    expect(surahHeaders.length).toBe(1);
    const rendered = (surahHeaders[0] as any).type(surahHeaders[0].props);
    const style = rendered.props.style;
    const flatStyle = Array.isArray(style) ? Object.assign({}, ...style) : style;
    const { themes } = require('@/theme/tokens');
    expect(flatStyle.alignItems).toBe('center');
    expect(flatStyle.borderWidth).toBe(2);
    expect(flatStyle.borderRadius).toBe(24);
    expect(flatStyle.borderColor).toBe(themes.light.border);
    expect(flatStyle.backgroundColor).toBe(themes.light.surface.secondary);
  });

  test('basmala renders with Uthmani font and actual Arabic text (not QPC glyphs)', () => {
    mockLayout = {
      page: 2,
      lines: [{ line: 1, type: 'basmala', text: 'بِسْمِ ٱللَّهِ', qpcV1: '#"!' }],
    };
    const element = render({ pageNumber: 2 });
    const basmalaViews = findElements(element, (el) => {
      if (!('line' in el.props)) return false;
      const line = el.props.line as { type: string };
      return line?.type === 'basmala';
    });
    expect(basmalaViews.length).toBe(1);
    const rendered = (basmalaViews[0] as any).type(basmalaViews[0].props);
    const textElements = findElements(rendered, (el) => el.type === 'Text');
    expect(textElements.length).toBeGreaterThan(0);
    const textStyle = textElements[0].props.style;
    const flatStyle = Array.isArray(textStyle) ? Object.assign({}, ...textStyle) : textStyle;
    expect(flatStyle.fontFamily).toBe('KFGQPC HAFS Uthmanic Script');
    const texts = findAllText(rendered);
    expect(texts.some((t) => t.includes('بِسْمِ'))).toBe(true);
    expect(texts.some((t) => t.includes('#"!'))).toBe(false);
  });
});

describe('MushafPage — verse highlighting', () => {
  beforeEach(() => {
    mockFontFamily = 'QCF_P001';
    mockLayout = sampleLayout;
    mockError = null;
    mockFontError = false;
    mockActiveVerseKey = null;
  });

  test('passes activeVerseKey to line views when active verse set', () => {
    mockActiveVerseKey = '1:1';
    const element = render({ pageNumber: 1 });
    const lineViews = findElements(
      element,
      (el) => 'activeVerseKey' in el.props && el.props.activeVerseKey === '1:1',
    );
    expect(lineViews.length).toBeGreaterThan(0);
  });

  test('passes null activeVerseKey when no active verse', () => {
    mockActiveVerseKey = null;
    const element = render({ pageNumber: 1 });
    const lineViews = findElements(
      element,
      (el) => 'activeVerseKey' in el.props && el.props.activeVerseKey === null,
    );
    expect(lineViews.length).toBeGreaterThan(0);
  });

  test('passes highlightColor from accent.highlight token', () => {
    mockActiveVerseKey = '1:1';
    const element = render({ pageNumber: 1 });
    const { themes } = require('@/theme/tokens');
    const highlighted = findElements(
      element,
      (el) =>
        'highlightColor' in el.props && el.props.highlightColor === themes.light.accent.highlight,
    );
    expect(highlighted.length).toBeGreaterThan(0);
  });

  test('highlights active verse words with backgroundColor', () => {
    mockActiveVerseKey = '1:1';
    const element = render({ pageNumber: 1 });
    const textLineViews = findElements(element, (el) => {
      if (!('line' in el.props)) return false;
      const line = el.props.line as { type: string };
      return line?.type === 'text';
    });
    expect(textLineViews.length).toBeGreaterThan(0);
    const lineEl = textLineViews[0];
    const rendered = (lineEl as any).type(lineEl.props);
    expect(rendered.type).toBe('Text');
    const children = Array.isArray(rendered.props.children)
      ? rendered.props.children
      : [rendered.props.children];
    const wordTexts = findElements({ type: 'Fragment', props: { children } }, (el) => {
      if (el.type !== 'Text') return false;
      const style = el.props.style;
      if (!Array.isArray(style)) return false;
      return style.some(
        (s: Record<string, unknown>) => s && typeof s === 'object' && 'backgroundColor' in s,
      );
    });
    expect(wordTexts.length).toBe(2);
  });

  test('does not highlight words when active verse is on a different page', () => {
    mockActiveVerseKey = '2:255';
    const element = render({ pageNumber: 1 });
    const textLineViews = findElements(element, (el) => {
      if (!('line' in el.props)) return false;
      const line = el.props.line as { type: string };
      return line?.type === 'text';
    });
    expect(textLineViews.length).toBeGreaterThan(0);
    const lineEl = textLineViews[0];
    const rendered = (lineEl as any).type(lineEl.props);
    const children = Array.isArray(rendered.props.children)
      ? rendered.props.children
      : [rendered.props.children];
    const wordTexts = findElements({ type: 'Fragment', props: { children } }, (el) => {
      if (el.type !== 'Text') return false;
      const style = el.props.style;
      if (!Array.isArray(style)) return false;
      return style.some(
        (s: Record<string, unknown>) => s && typeof s === 'object' && 'backgroundColor' in s,
      );
    });
    expect(wordTexts.length).toBe(0);
  });
});

describe('MushafPage — tap-to-seek', () => {
  beforeEach(() => {
    mockFontFamily = 'QCF_P001';
    mockLayout = sampleLayout;
    mockError = null;
    mockFontError = false;
    mockActiveVerseKey = '1:1';
    mockIsAudioPlaying = true;
    mockUIState.tapToSeek = true;
    mockSeekToVerse.mockClear();
  });

  test('passes onWordTap handler to line views', () => {
    const element = render({ pageNumber: 1 });
    const lineViews = findElements(
      element,
      (el) => 'onWordTap' in el.props && typeof el.props.onWordTap === 'function',
    );
    expect(lineViews.length).toBeGreaterThan(0);
  });

  test('onWordTap calls seekToVerse when tapToSeek is on and audio is playing', () => {
    const element = render({ pageNumber: 1 });
    const lineViews = findElements(
      element,
      (el) => 'onWordTap' in el.props && typeof el.props.onWordTap === 'function',
    );
    const handler = lineViews[0].props.onWordTap as (verseKey: string) => void;
    handler('1:1');
    expect(mockSeekToVerse).toHaveBeenCalledWith('1:1');
  });

  test('onWordTap does NOT call seekToVerse when tapToSeek is off', () => {
    mockUIState.tapToSeek = false;
    const element = render({ pageNumber: 1 });
    const lineViews = findElements(
      element,
      (el) => 'onWordTap' in el.props && typeof el.props.onWordTap === 'function',
    );
    const handler = lineViews[0].props.onWordTap as (verseKey: string) => void;
    handler('1:1');
    expect(mockSeekToVerse).not.toHaveBeenCalled();
  });

  test('onWordTap does NOT call seekToVerse when audio is not playing', () => {
    mockIsAudioPlaying = false;
    const element = render({ pageNumber: 1 });
    const lineViews = findElements(
      element,
      (el) => 'onWordTap' in el.props && typeof el.props.onWordTap === 'function',
    );
    const handler = lineViews[0].props.onWordTap as (verseKey: string) => void;
    handler('1:1');
    expect(mockSeekToVerse).not.toHaveBeenCalled();
  });
});
