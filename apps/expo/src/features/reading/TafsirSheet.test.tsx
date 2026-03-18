let mockStateIdx = 0;
let mockActiveSource = 'ibn-kathir';
let mockTafsirText: string | null = 'Tafsir commentary text...';
let mockIsLoading = false;

jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useCallback: (fn: unknown) => fn,
  useMemo: (fn: () => unknown) => (fn as () => unknown)(),
  useRef: (val: unknown) => ({ current: val ?? null }),
  useEffect: () => {},
  useState: (initial: unknown) => {
    const idx = mockStateIdx++;
    // useState call order: activeSource, tafsirText, isLoading
    if (idx === 0) return [mockActiveSource, jest.fn((v: string) => { mockActiveSource = v; })];
    if (idx === 1) return [mockTafsirText, jest.fn()];
    if (idx === 2) return [mockIsLoading, jest.fn()];
    return [initial, jest.fn()];
  },
}));

jest.mock('@/theme/ThemeProvider', () => {
  const { themes } = jest.requireActual('@/theme/tokens');
  return { useTheme: () => ({ tokens: themes.light, themeName: 'light' as const }) };
});

const mockUIState = {
  preferredTafsirSource: 'ibn-kathir',
  setPreferredTafsirSource: jest.fn(),
};
jest.mock('@/theme/useUIStore', () => {
  const useUIStore = Object.assign(
    (selector: (s: typeof mockUIState) => unknown) => selector(mockUIState),
    { getState: () => mockUIState, setState: () => {}, subscribe: () => () => {} },
  );
  return { useUIStore };
});

jest.mock('@/services/sqlite', () => ({
  getTafsirForVerse: jest.fn(() =>
    Promise.resolve({ surahNumber: 2, verseNumber: 255, source: 'ibn-kathir', text: 'Tafsir text' }),
  ),
}));

jest.mock('react-native-gesture-handler', () => ({
  Gesture: {
    Pan: () => ({
      onUpdate: () => ({ onEnd: () => ({}) }),
    }),
  },
  GestureDetector: ({ children }: { children: unknown }) => children,
}));

jest.mock('react-native-reanimated', () => ({
  default: {
    View: 'Animated.View',
  },
  Easing: { inOut: () => ({}), ease: {} },
  useSharedValue: () => ({ value: 0 }),
  useAnimatedStyle: () => ({}),
  withTiming: (v: number) => v,
  runOnJS: (fn: unknown) => fn,
}));

jest.mock('@/components/AppText', () => ({
  AppText: 'AppText',
}));

const { TafsirSheet } = require('./TafsirSheet');

interface MockElement {
  type: string;
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

function findText(element: unknown, text: string): boolean {
  const elements = findElements(element, (el) => {
    const children = Array.isArray(el.props?.children) ? el.props.children : [el.props?.children];
    return children.includes(text);
  });
  return elements.length > 0;
}

describe('TafsirSheet', () => {
  const defaultProps = {
    visible: true,
    surahNumber: 2,
    verseNumber: 255,
    uthmaniText: 'ٱللَّهُ لَآ إِلَٰهَ إِلَّا هُوَ',
    onDismiss: jest.fn(),
  };

  beforeEach(() => {
    mockStateIdx = 0;
    mockActiveSource = 'ibn-kathir';
    mockTafsirText = 'Tafsir commentary text...';
    mockIsLoading = false;
    jest.clearAllMocks();
  });

  test('returns null when not visible', () => {
    mockStateIdx = 0;
    const element = TafsirSheet({ ...defaultProps, visible: false });
    expect(element).toBeNull();
  });

  test('renders sheet with dialog role when visible', () => {
    mockStateIdx = 0;
    const element = TafsirSheet(defaultProps);
    // element is a fragment with backdrop + GestureDetector(Animated.View)
    expect(element).toBeDefined();
    const dialogs = findElements(element, (el) => el.props?.accessibilityRole === 'summary');
    expect(dialogs.length).toBe(1);
  });

  test('renders verse reference section', () => {
    mockStateIdx = 0;
    const element = TafsirSheet(defaultProps);
    // The verse ref is an AppText with "Verse {surah}:{verse}" which fragments into children
    const verseRefs = findElements(element, (el) => {
      const children = Array.isArray(el.props?.children) ? el.props.children : [el.props?.children];
      return children.some((c: unknown) => typeof c === 'string' && (c as string).includes('Verse'));
    });
    expect(verseRefs.length).toBeGreaterThan(0);
  });

  test('renders Arabic verse text', () => {
    mockStateIdx = 0;
    const element = TafsirSheet(defaultProps);
    expect(findText(element, defaultProps.uthmaniText)).toBe(true);
  });

  test('renders 3 tafsir source tabs', () => {
    mockStateIdx = 0;
    const element = TafsirSheet(defaultProps);
    const tabs = findElements(element, (el) => el.props?.accessibilityRole === 'tab');
    expect(tabs).toHaveLength(3);
  });

  test('tab labels are Ibn Kathir, Al-Jalalayn, Al-Sa\'di', () => {
    mockStateIdx = 0;
    const element = TafsirSheet(defaultProps);
    expect(findText(element, 'Ibn Kathir')).toBe(true);
    expect(findText(element, 'Al-Jalalayn')).toBe(true);
    expect(findText(element, "Al-Sa'di")).toBe(true);
  });

  test('renders tafsir text content', () => {
    mockStateIdx = 0;
    const element = TafsirSheet(defaultProps);
    expect(findText(element, 'Tafsir commentary text...')).toBe(true);
  });

  test('shows loading indicator when loading', () => {
    mockIsLoading = true;
    mockTafsirText = null;
    mockStateIdx = 0;
    const element = TafsirSheet(defaultProps);
    const loaders = findElements(element, (el) => el.type === 'ActivityIndicator');
    expect(loaders.length).toBe(1);
  });

  test('shows no-data message when tafsir is null and not loading', () => {
    mockTafsirText = null;
    mockIsLoading = false;
    mockStateIdx = 0;
    const element = TafsirSheet(defaultProps);
    expect(findText(element, 'No tafsir available for this verse.')).toBe(true);
  });

  test('has backdrop for dismissal', () => {
    mockStateIdx = 0;
    const element = TafsirSheet(defaultProps);
    const backdrops = findElements(
      element,
      (el) => el.props?.accessibilityLabel === 'Dismiss tafsir',
    );
    expect(backdrops.length).toBe(1);
  });

  test('has drag handle for swipe-down', () => {
    mockStateIdx = 0;
    const element = TafsirSheet(defaultProps);
    // The handle is a small View inside handleContainer
    const handles = findElements(element, (el) => {
      if (el.type !== 'View') return false;
      const style = el.props?.style;
      if (!style) return false;
      const styles = Array.isArray(style) ? style : [style];
      return styles.some((s: Record<string, unknown>) => s && typeof s === 'object' && s.width === 36 && s.height === 4);
    });
    expect(handles.length).toBe(1);
  });
});
