// CRITICAL: Custom useState with stateCallCount tracking for VerseJumpModal
// which has two useState calls (value, error)
let mockStateValue = '';
let mockErrorValue = '';
const mockSetValue = jest.fn((v: string) => {
  mockStateValue = v;
});
const mockSetError = jest.fn((v: string) => {
  mockErrorValue = v;
});
let mockStateCallCount = 0;

jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useCallback: (fn: unknown) => fn,
  useMemo: (fn: () => unknown) => (fn as () => unknown)(),
  useRef: (val: unknown) => ({ current: val ?? null }),
  useEffect: () => {},
  useState: (initial: unknown) => {
    mockStateCallCount++;
    // First useState is value, second is error
    if (mockStateCallCount % 2 === 1) {
      return [mockStateValue || initial, mockSetValue];
    }
    return [mockErrorValue || initial, mockSetError];
  },
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

import { VerseJumpModal } from './VerseJumpModal';

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

describe('VerseJumpModal', () => {
  test('renders Modal when visible is true', () => {
    mockStateValue = '';
    mockErrorValue = '';
    mockStateCallCount = 0;
    const mockOnJump = jest.fn();
    const mockOnClose = jest.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const element = (VerseJumpModal as any)({
      visible: true,
      verseCount: 286,
      onJump: mockOnJump,
      onClose: mockOnClose,
    }) as unknown as MockElement;
    expect(element).toBeDefined();
    expect(element.type).toBe('Modal');
    expect(element.props.visible).toBe(true);
  });

  test('does not render content when visible is false', () => {
    mockStateValue = '';
    mockErrorValue = '';
    mockStateCallCount = 0;
    const mockOnJump = jest.fn();
    const mockOnClose = jest.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const element = (VerseJumpModal as any)({
      visible: false,
      verseCount: 286,
      onJump: mockOnJump,
      onClose: mockOnClose,
    }) as unknown as MockElement;
    expect(element.props.visible).toBe(false);
  });

  test('shows verse count range hint text', () => {
    mockStateValue = '';
    mockErrorValue = '';
    mockStateCallCount = 0;
    const mockOnJump = jest.fn();
    const mockOnClose = jest.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const element = (VerseJumpModal as any)({
      visible: true,
      verseCount: 286,
      onJump: mockOnJump,
      onClose: mockOnClose,
    }) as unknown as MockElement;
    // Find caption with range hint
    const captions = findElements(element, (el) => el.props?.variant === 'uiCaption');
    const rangeHint = captions.find((el) => {
      const children = el.props.children;
      const text = Array.isArray(children) ? children.join('') : String(children);
      return text.includes('286');
    });
    expect(rangeHint).toBeDefined();
  });

  test('calls onJump with valid verse number on submit', () => {
    mockStateValue = '42';
    mockErrorValue = '';
    mockStateCallCount = 0;
    const mockOnJump = jest.fn();
    const mockOnClose = jest.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const element = (VerseJumpModal as any)({
      visible: true,
      verseCount: 286,
      onJump: mockOnJump,
      onClose: mockOnClose,
    }) as unknown as MockElement;
    // Find the Go button (submit)
    const pressables = findElements(
      element,
      (el) => el.type === 'Pressable' && el.props?.accessibilityLabel === 'Go to verse',
    );
    expect(pressables.length).toBe(1);
    const onPress = pressables[0].props.onPress as () => void;
    onPress();
    expect(mockOnJump).toHaveBeenCalledWith(42);
  });

  test('does not call onJump with invalid input (0)', () => {
    mockStateValue = '0';
    mockErrorValue = '';
    mockStateCallCount = 0;
    const mockOnJump = jest.fn();
    const mockOnClose = jest.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const element = (VerseJumpModal as any)({
      visible: true,
      verseCount: 286,
      onJump: mockOnJump,
      onClose: mockOnClose,
    }) as unknown as MockElement;
    const pressables = findElements(
      element,
      (el) => el.type === 'Pressable' && el.props?.accessibilityLabel === 'Go to verse',
    );
    const onPress = pressables[0].props.onPress as () => void;
    onPress();
    expect(mockOnJump).not.toHaveBeenCalled();
    expect(mockSetError).toHaveBeenCalled();
  });

  test('does not call onJump with verse exceeding verseCount', () => {
    mockStateValue = '300';
    mockErrorValue = '';
    mockStateCallCount = 0;
    const mockOnJump = jest.fn();
    const mockOnClose = jest.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const element = (VerseJumpModal as any)({
      visible: true,
      verseCount: 286,
      onJump: mockOnJump,
      onClose: mockOnClose,
    }) as unknown as MockElement;
    const pressables = findElements(
      element,
      (el) => el.type === 'Pressable' && el.props?.accessibilityLabel === 'Go to verse',
    );
    const onPress = pressables[0].props.onPress as () => void;
    onPress();
    expect(mockOnJump).not.toHaveBeenCalled();
  });

  test('calls onClose on cancel press', () => {
    mockStateValue = '';
    mockErrorValue = '';
    mockStateCallCount = 0;
    const mockOnJump = jest.fn();
    const mockOnClose = jest.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const element = (VerseJumpModal as any)({
      visible: true,
      verseCount: 286,
      onJump: mockOnJump,
      onClose: mockOnClose,
    }) as unknown as MockElement;
    const cancelButton = findElements(
      element,
      (el) => el.type === 'Pressable' && el.props?.accessibilityLabel === 'Cancel',
    );
    expect(cancelButton.length).toBe(1);
    const onPress = cancelButton[0].props.onPress as () => void;
    onPress();
    expect(mockOnClose).toHaveBeenCalled();
  });
});
