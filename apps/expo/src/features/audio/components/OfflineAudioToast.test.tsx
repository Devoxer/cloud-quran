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

jest.mock('@/services/mmkv', () => ({
  mmkvStorage: {
    setItem: jest.fn(),
    getItem: jest.fn(() => null),
    removeItem: jest.fn(),
  },
}));

const mockStartDownload = jest.fn();
const mockSetState = jest.fn();
const mockAudioState = {
  error: null as string | null,
  currentSurah: 1 as number | null,
  selectedReciterId: 'alafasy',
};

jest.mock('@/features/audio/stores/useAudioStore', () => {
  const useAudioStore = Object.assign(
    (selector: (s: typeof mockAudioState) => unknown) => selector(mockAudioState),
    {
      getState: () => mockAudioState,
      setState: (...args: unknown[]) => mockSetState(...args),
      subscribe: () => () => {},
    },
  );
  return { useAudioStore };
});

jest.mock('@/features/audio/stores/useDownloadStore', () => {
  const useDownloadStore = Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({ startDownload: mockStartDownload }),
    {
      getState: () => ({ startDownload: mockStartDownload }),
      setState: () => {},
      subscribe: () => () => {},
    },
  );
  return { useDownloadStore };
});

import { OfflineAudioToast } from './OfflineAudioToast';

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

function flattenText(node: unknown): string {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join('');
  if (typeof node === 'object' && (node as MockElement).props?.children) {
    return flattenText((node as MockElement).props.children);
  }
  return '';
}

describe('OfflineAudioToast', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAudioState.error = 'offline-no-audio';
    mockAudioState.currentSurah = 1;
    mockAudioState.selectedReciterId = 'alafasy';
  });

  it('renders toast when error is offline-no-audio', () => {
    const element = (OfflineAudioToast as any)() as unknown as MockElement;
    expect(element).not.toBeNull();
    expect(element.props.testID).toBe('offline-audio-toast');
  });

  it('shows "Download surah for offline?" message', () => {
    const element = (OfflineAudioToast as any)() as unknown as MockElement;
    const text = flattenText(element);
    expect(text).toContain('Download surah for offline?');
  });

  it('returns null when error is not offline-no-audio', () => {
    mockAudioState.error = null;
    const element = (OfflineAudioToast as any)();
    expect(element).toBeNull();
  });

  it('returns null when currentSurah is null', () => {
    mockAudioState.currentSurah = null;
    const element = (OfflineAudioToast as any)();
    expect(element).toBeNull();
  });

  it('renders toast on web platform without download button', () => {
    const origPlatform = Platform.OS;
    (Platform as any).OS = 'web';
    try {
      const element = (OfflineAudioToast as any)() as unknown as MockElement;
      expect(element).not.toBeNull();
      expect(element.props.testID).toBe('offline-audio-toast');

      // Should show web-specific message
      const text = flattenText(element);
      expect(text).toContain('Audio unavailable offline');

      // Should NOT have a Download button
      const downloadBtn = findElements(
        element,
        (el) => el.type === 'Pressable' && el.props?.accessibilityLabel === 'Download',
      );
      expect(downloadBtn.length).toBe(0);

      // Should still have Dismiss button
      const dismissBtn = findElements(
        element,
        (el) => el.type === 'Pressable' && el.props?.accessibilityLabel === 'Dismiss',
      );
      expect(dismissBtn.length).toBe(1);
    } finally {
      (Platform as any).OS = origPlatform;
    }
  });

  it('download button calls startDownload and clears error', () => {
    const element = (OfflineAudioToast as any)() as unknown as MockElement;
    const downloadBtn = findElements(
      element,
      (el) => el.type === 'Pressable' && el.props?.accessibilityLabel === 'Download',
    );
    expect(downloadBtn.length).toBe(1);
    (downloadBtn[0].props.onPress as () => void)();
    expect(mockStartDownload).toHaveBeenCalledWith('alafasy', 1);
    expect(mockSetState).toHaveBeenCalledWith({ error: null });
  });

  it('dismiss button clears error but preserves track context', () => {
    const element = (OfflineAudioToast as any)() as unknown as MockElement;
    const dismissBtn = findElements(
      element,
      (el) => el.type === 'Pressable' && el.props?.accessibilityLabel === 'Dismiss',
    );
    expect(dismissBtn.length).toBe(1);
    (dismissBtn[0].props.onPress as () => void)();
    expect(mockSetState).toHaveBeenCalledWith({ error: null });
  });
});
