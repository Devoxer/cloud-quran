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

jest.mock('@expo/vector-icons/Ionicons', () => ({ __esModule: true, default: 'Ionicons' }));

jest.mock('@/components/AppText', () => ({
  AppText: 'AppText',
}));

const { VerseContextMenu } = require('./VerseContextMenu');

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

function findText(element: unknown, text: string): boolean {
  const elements = findElements(element, (el) => {
    const children = Array.isArray(el.props?.children) ? el.props.children : [el.props?.children];
    return children.includes(text);
  });
  return elements.length > 0;
}

describe('VerseContextMenu', () => {
  const mockOnPlayFromHere = jest.fn();
  const mockOnTafsir = jest.fn();
  const mockOnBookmark = jest.fn();
  const mockOnCopy = jest.fn();
  const mockOnDismiss = jest.fn();

  const defaultProps = {
    visible: true,
    surahNumber: 2,
    verseNumber: 255,
    position: { x: 100, y: 200 },
    isBookmarked: false,
    onPlayFromHere: mockOnPlayFromHere,
    onTafsir: mockOnTafsir,
    onBookmark: mockOnBookmark,
    onCopy: mockOnCopy,
    onDismiss: mockOnDismiss,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns null when not visible', () => {
    const element = VerseContextMenu({ ...defaultProps, visible: false });
    expect(element).toBeNull();
  });

  test('renders Modal when visible', () => {
    const element = VerseContextMenu(defaultProps) as unknown as MockElement;
    expect(element.type).toBe('Modal');
    expect(element.props.visible).toBe(true);
    expect(element.props.transparent).toBe(true);
  });

  test('renders 4 menu action items', () => {
    const element = VerseContextMenu(defaultProps) as unknown as MockElement;
    const menuItems = findElements(
      element,
      (el) => el.props?.accessibilityRole === 'menuitem',
    );
    expect(menuItems).toHaveLength(4);
  });

  test('renders correct labels: Play from here, Tafsir, Bookmark, Copy', () => {
    const element = VerseContextMenu(defaultProps) as unknown as MockElement;
    expect(findText(element, 'Play from here')).toBe(true);
    expect(findText(element, 'Tafsir')).toBe(true);
    expect(findText(element, 'Bookmark')).toBe(true);
    expect(findText(element, 'Copy')).toBe(true);
  });

  test('shows "Remove bookmark" when verse is bookmarked', () => {
    const element = VerseContextMenu({ ...defaultProps, isBookmarked: true }) as unknown as MockElement;
    expect(findText(element, 'Remove bookmark')).toBe(true);
    expect(findText(element, 'Bookmark')).toBe(false);
  });

  test('menu items call action handlers and dismiss on press', () => {
    const element = VerseContextMenu(defaultProps) as unknown as MockElement;
    const menuItems = findElements(
      element,
      (el) => el.props?.accessibilityRole === 'menuitem',
    );

    // Play from here
    const playItem = menuItems.find((el) => el.props.accessibilityLabel === 'Play from here');
    expect(playItem).toBeDefined();
    (playItem!.props.onPress as () => void)();
    expect(mockOnPlayFromHere).toHaveBeenCalledTimes(1);
    expect(mockOnDismiss).toHaveBeenCalledTimes(1);

    jest.clearAllMocks();

    // Tafsir
    const tafsirItem = menuItems.find((el) => el.props.accessibilityLabel === 'Tafsir');
    (tafsirItem!.props.onPress as () => void)();
    expect(mockOnTafsir).toHaveBeenCalledTimes(1);
    expect(mockOnDismiss).toHaveBeenCalledTimes(1);

    jest.clearAllMocks();

    // Bookmark
    const bookmarkItem = menuItems.find((el) => el.props.accessibilityLabel === 'Bookmark');
    (bookmarkItem!.props.onPress as () => void)();
    expect(mockOnBookmark).toHaveBeenCalledTimes(1);
    expect(mockOnDismiss).toHaveBeenCalledTimes(1);

    jest.clearAllMocks();

    // Copy
    const copyItem = menuItems.find((el) => el.props.accessibilityLabel === 'Copy');
    (copyItem!.props.onPress as () => void)();
    expect(mockOnCopy).toHaveBeenCalledTimes(1);
    expect(mockOnDismiss).toHaveBeenCalledTimes(1);
  });

  test('has accessibility label with verse reference', () => {
    const element = VerseContextMenu(defaultProps) as unknown as MockElement;
    const menu = findElements(
      element,
      (el) => el.props?.accessibilityRole === 'menu',
    );
    expect(menu).toHaveLength(1);
    expect(menu[0].props.accessibilityLabel).toBe('Context menu for verse 2:255');
  });

  test('renders icons for each action', () => {
    const element = VerseContextMenu(defaultProps) as unknown as MockElement;
    const icons = findElements(element, (el) => el.type === 'Ionicons');
    expect(icons).toHaveLength(4);

    const iconNames = icons.map((i) => i.props.name);
    expect(iconNames).toContain('play-circle-outline');
    expect(iconNames).toContain('book-outline');
    expect(iconNames).toContain('bookmark-outline');
    expect(iconNames).toContain('copy-outline');
  });

  test('shows filled bookmark icon when bookmarked', () => {
    const element = VerseContextMenu({ ...defaultProps, isBookmarked: true }) as unknown as MockElement;
    const icons = findElements(element, (el) => el.type === 'Ionicons');
    const bookmarkIcon = icons.find((i) => (i.props.name as string).includes('bookmark'));
    expect(bookmarkIcon?.props.name).toBe('bookmark');
  });
});
