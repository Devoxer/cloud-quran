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

const mockSetReciter = jest.fn();
const mockAudioState = {
  selectedReciterId: 'alafasy',
  setReciter: mockSetReciter,
};

jest.mock('@/features/audio/stores/useAudioStore', () => {
  const useAudioStore = Object.assign(
    (selector: (s: typeof mockAudioState) => unknown) => selector(mockAudioState),
    { getState: () => mockAudioState, setState: () => {}, subscribe: () => () => {} },
  );
  return { useAudioStore };
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

jest.mock('@expo/vector-icons/Ionicons', () => ({ __esModule: true, default: 'Ionicons' }));

import { RECITERS } from '@/features/audio/data/reciters';
import { ReciterSelector } from './ReciterSelector';

interface MockElement { type: unknown; props: Record<string, unknown> }

/** Find a SectionList element by checking for the `sections` prop */
function isSectionList(el: MockElement): boolean {
  return Array.isArray(el.props?.sections) && typeof el.props?.renderItem === 'function';
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
    // Walk renderItem for SectionList
    if (isSectionList(el)) {
      const sections = el.props.sections as Array<{ title: string; data: Array<{ id: string }> }>;
      for (const section of sections) {
        // Render section header
        if (typeof el.props.renderSectionHeader === 'function') {
          const headerResult = (el.props.renderSectionHeader as (info: { section: typeof section }) => unknown)({ section });
          walk(headerResult);
        }
        // Render items
        section.data.forEach((item, index) => {
          const rendered = (el.props.renderItem as (info: { item: typeof item; index: number; section: typeof section }) => unknown)({ item, index, section });
          if (rendered && typeof rendered === 'object') {
            const renderedEl = rendered as MockElement;
            const componentType = renderedEl.type as unknown;
            if (typeof componentType === 'object' && componentType !== null && 'type' in (componentType as Record<string, unknown>)) {
              const innerFn = (componentType as { type: (...args: unknown[]) => unknown }).type;
              if (typeof innerFn === 'function') {
                walk(innerFn(renderedEl.props));
              }
            } else if (typeof componentType === 'function') {
              walk((componentType as (props: unknown) => unknown)(renderedEl.props));
            } else {
              walk(rendered);
            }
          }
        });
      }
    }
  }
  walk(element);
  return results;
}

function findText(element: unknown, text: string): boolean {
  const found: string[] = [];
  function walk(node: unknown) {
    if (typeof node === 'string') { found.push(node); return; }
    if (!node || typeof node !== 'object') return;
    const el = node as MockElement;
    if (el.props?.children) {
      const children = Array.isArray(el.props.children) ? el.props.children : [el.props.children];
      children.forEach(walk);
    }
  }
  walk(element);
  return found.some((r) => r.includes(text));
}

describe('ReciterSelector', () => {
  const mockOnClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockAudioState.selectedReciterId = 'alafasy';
  });

  test('renders modal with reciter list when visible', () => {
    const element = (ReciterSelector as any)({ visible: true, onClose: mockOnClose }) as unknown as MockElement;
    expect(element).toBeDefined();
    expect(element.type).toBe('Modal');
    expect(element.props.visible).toBe(true);
  });

  test('renders SectionList with all 40 reciters', () => {
    const element = (ReciterSelector as any)({ visible: true, onClose: mockOnClose }) as unknown as MockElement;
    const sectionLists = findElements(element, isSectionList);
    expect(sectionLists.length).toBe(1);
    const sections = sectionLists[0].props.sections as Array<{ data: unknown[] }>;
    const totalItems = sections.reduce((acc, s) => acc + s.data.length, 0);
    expect(totalItems).toBe(40);
  });

  test('renders Murattal, Mujawwad, and Muallim section headers', () => {
    const element = (ReciterSelector as any)({ visible: true, onClose: mockOnClose }) as unknown as MockElement;
    const sectionLists = findElements(element, isSectionList);
    const sections = sectionLists[0].props.sections as Array<{ title: string }>;
    expect(sections.map((s) => s.title)).toEqual(['Murattal', 'Mujawwad', 'Muallim']);
  });

  test('murattal has 36, mujawwad has 3, muallim has 1', () => {
    const element = (ReciterSelector as any)({ visible: true, onClose: mockOnClose }) as unknown as MockElement;
    const sectionLists = findElements(element, isSectionList);
    const sections = sectionLists[0].props.sections as Array<{ title: string; data: unknown[] }>;
    const murattal = sections.find((s) => s.title === 'Murattal');
    const mujawwad = sections.find((s) => s.title === 'Mujawwad');
    const muallim = sections.find((s) => s.title === 'Muallim');
    expect(murattal!.data.length).toBe(36);
    expect(mujawwad!.data.length).toBe(3);
    expect(muallim!.data.length).toBe(1);
  });

  test('shows checkmark for selected reciter', () => {
    mockAudioState.selectedReciterId = 'alafasy';
    const element = (ReciterSelector as any)({ visible: true, onClose: mockOnClose }) as unknown as MockElement;
    const rows = findElements(element, (el) =>
      el.type === 'Pressable' && typeof el.props?.accessibilityLabel === 'string' &&
      (el.props.accessibilityLabel as string).startsWith('Select '),
    );
    const selectedRow = rows.find((r) => (r.props.accessibilityState as { selected: boolean })?.selected === true);
    expect(selectedRow).toBeDefined();
    expect((selectedRow!.props.accessibilityLabel as string)).toContain('Al-Afasy');
  });

  test('calls setReciter and onClose when a reciter is selected', () => {
    const element = (ReciterSelector as any)({ visible: true, onClose: mockOnClose }) as unknown as MockElement;
    const rows = findElements(element, (el) =>
      el.type === 'Pressable' && typeof el.props?.accessibilityLabel === 'string' &&
      (el.props.accessibilityLabel as string).includes('Al-Sudais'),
    );
    expect(rows.length).toBe(1);
    (rows[0].props.onPress as () => void)();
    expect(mockSetReciter).toHaveBeenCalledWith('sudais');
    expect(mockOnClose).toHaveBeenCalled();
  });

  test('has close button that calls onClose', () => {
    const element = (ReciterSelector as any)({ visible: true, onClose: mockOnClose }) as unknown as MockElement;
    const closeBtn = findElements(element, (el) =>
      el.type === 'Pressable' && el.props?.accessibilityLabel === 'Close reciter selector',
    );
    expect(closeBtn.length).toBe(1);
    (closeBtn[0].props.onPress as () => void)();
    expect(mockOnClose).toHaveBeenCalled();
  });

  test('renders header text', () => {
    const element = (ReciterSelector as any)({ visible: true, onClose: mockOnClose }) as unknown as MockElement;
    const headerTexts = findElements(element, (el) =>
      el.props?.variant === 'ui' && el.props?.children === 'Select Reciter',
    );
    expect(headerTexts.length).toBe(1);
  });

  test('renders search input', () => {
    const element = (ReciterSelector as any)({ visible: true, onClose: mockOnClose }) as unknown as MockElement;
    const searchInput = findElements(element, (el) =>
      el.type === 'TextInput' && el.props?.accessibilityLabel === 'Search reciters',
    );
    expect(searchInput.length).toBe(1);
    expect(searchInput[0].props.placeholder).toBe('Search reciters...');
  });

  test('section headers render with correct titles', () => {
    const element = (ReciterSelector as any)({ visible: true, onClose: mockOnClose }) as unknown as MockElement;
    const sectionLists = findElements(element, isSectionList);
    const renderSectionHeader = sectionLists[0].props.renderSectionHeader as (info: { section: { title: string } }) => unknown;

    const murattalHeader = renderSectionHeader({ section: { title: 'Murattal' } }) as MockElement;
    expect(findText(murattalHeader, 'Murattal')).toBe(true);

    const mujawwadHeader = renderSectionHeader({ section: { title: 'Mujawwad' } }) as MockElement;
    expect(findText(mujawwadHeader, 'Mujawwad')).toBe(true);

    const muallimHeader = renderSectionHeader({ section: { title: 'Muallim' } }) as MockElement;
    expect(findText(muallimHeader, 'Muallim')).toBe(true);
  });
});
