import { Platform } from 'react-native';

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
  return {
    useTheme: () => ({ tokens: themes.light, themeName: 'light' as const }),
  };
});

jest.mock('@expo/vector-icons/Ionicons', () => ({
  __esModule: true,
  default: 'Ionicons',
}));

const mockStartDownload = jest.fn();
const mockDeleteSurah = jest.fn();
const mockDownloadState = {
  downloads: {} as Record<string, string>,
  downloadProgress: {} as Record<string, number>,
  startDownload: mockStartDownload,
  deleteSurah: mockDeleteSurah,
  getProgress: (rid: string, s: number): number =>
    mockDownloadState.downloadProgress[`${rid}/${s}`] ?? 0,
};

jest.mock('@/features/audio/stores/useDownloadStore', () => {
  const useDownloadStore = Object.assign(
    (selector: (s: typeof mockDownloadState) => unknown) =>
      selector(mockDownloadState),
    {
      getState: () => mockDownloadState,
      setState: () => {},
      subscribe: () => () => {},
    },
  );
  return { useDownloadStore };
});

import { DownloadButton } from './DownloadButton';

interface MockElement {
  type: string;
  props: Record<string, unknown>;
}

function findElements(
  element: unknown,
  predicate: (el: MockElement) => boolean,
): MockElement[] {
  const results: MockElement[] = [];
  function walk(node: unknown) {
    if (!node || typeof node !== 'object') return;
    const el = node as MockElement;
    if (predicate(el)) results.push(el);
    if (el.props?.children) {
      const children = Array.isArray(el.props.children)
        ? el.props.children
        : [el.props.children];
      children.forEach(walk);
    }
  }
  walk(element);
  return results;
}

describe('DownloadButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDownloadState.downloads = {};
    mockDownloadState.downloadProgress = {};
  });

  it('renders download button with download-outline icon when not downloaded', () => {
    const element = (DownloadButton as any)({
      reciterId: 'alafasy',
      surahNumber: 1,
    }) as unknown as MockElement;
    expect(element).toBeDefined();
    const icons = findElements(element, (el) => el.type === 'Ionicons');
    expect(icons.some((i) => i.props.name === 'download-outline')).toBe(true);
  });

  it('renders checkmark icon when downloaded', () => {
    mockDownloadState.downloads = { 'alafasy/1': 'downloaded' };
    const element = (DownloadButton as any)({
      reciterId: 'alafasy',
      surahNumber: 1,
    }) as unknown as MockElement;
    const icons = findElements(element, (el) => el.type === 'Ionicons');
    expect(icons.some((i) => i.props.name === 'checkmark-circle')).toBe(true);
  });

  it('renders cloud-download icon when downloading', () => {
    mockDownloadState.downloads = { 'alafasy/1': 'downloading' };
    const element = (DownloadButton as any)({
      reciterId: 'alafasy',
      surahNumber: 1,
    }) as unknown as MockElement;
    const icons = findElements(element, (el) => el.type === 'Ionicons');
    expect(
      icons.some((i) => i.props.name === 'cloud-download-outline'),
    ).toBe(true);
  });

  it('calls startDownload on press when not downloaded', () => {
    const element = (DownloadButton as any)({
      reciterId: 'alafasy',
      surahNumber: 1,
    }) as unknown as MockElement;
    // The root Pressable has an onPress handler
    const pressable = element;
    expect(pressable.props.onPress).toBeDefined();
    (pressable.props.onPress as () => void)();
    expect(mockStartDownload).toHaveBeenCalledWith('alafasy', 1);
  });

  it('calls deleteSurah on press when downloaded', () => {
    mockDownloadState.downloads = { 'alafasy/1': 'downloaded' };
    const element = (DownloadButton as any)({
      reciterId: 'alafasy',
      surahNumber: 1,
    }) as unknown as MockElement;
    (element.props.onPress as () => void)();
    expect(mockDeleteSurah).toHaveBeenCalledWith('alafasy', 1);
  });

  it('has correct accessibility label for download state', () => {
    const element = (DownloadButton as any)({
      reciterId: 'alafasy',
      surahNumber: 1,
    }) as unknown as MockElement;
    expect(element.props.accessibilityLabel).toBe(
      'Download audio for offline',
    );
  });

  it('has correct accessibility label for downloaded state', () => {
    mockDownloadState.downloads = { 'alafasy/1': 'downloaded' };
    const element = (DownloadButton as any)({
      reciterId: 'alafasy',
      surahNumber: 1,
    }) as unknown as MockElement;
    expect(element.props.accessibilityLabel).toBe('Delete downloaded audio');
  });

  it('has correct accessibility label for downloading state with progress', () => {
    mockDownloadState.downloads = { 'alafasy/1': 'downloading' };
    mockDownloadState.downloadProgress = { 'alafasy/1': 0.75 };
    const element = (DownloadButton as any)({
      reciterId: 'alafasy',
      surahNumber: 1,
    }) as unknown as MockElement;
    expect(element.props.accessibilityLabel).toBe('Downloading 75%');
  });

  it('returns null on web platform', () => {
    const origPlatform = Platform.OS;
    (Platform as any).OS = 'web';
    const element = (DownloadButton as any)({
      reciterId: 'alafasy',
      surahNumber: 1,
    });
    expect(element).toBeNull();
    (Platform as any).OS = origPlatform;
  });
});
