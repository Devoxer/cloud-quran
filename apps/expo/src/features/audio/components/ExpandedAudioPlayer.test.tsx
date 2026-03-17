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

const mockPause = jest.fn();
const mockResume = jest.fn();
const mockResumePlayback = jest.fn();
const mockSetSpeed = jest.fn();
const mockSeekToVerse = jest.fn();
const mockStop = jest.fn();
const mockAudioState = {
  currentSurah: 2 as number | null,
  currentVerseKey: '2:5' as string | null,
  activeVerseKey: '2:5' as string | null,
  isPlaying: true,
  selectedReciterId: 'alafasy',
  playbackSpeed: 1.0,
  positionMs: 15000,
  durationMs: 120000,
  verseTimings: [
    { verseKey: '2:1', timestampFrom: 0, timestampTo: 5000 },
    { verseKey: '2:5', timestampFrom: 12000, timestampTo: 20000 },
    { verseKey: '2:6', timestampFrom: 20000, timestampTo: 28000 },
  ],
  pause: mockPause,
  resume: mockResume,
  resumePlayback: mockResumePlayback,
  stop: mockStop,
  setSpeed: mockSetSpeed,
  seekToVerse: mockSeekToVerse,
  sleepTimerMinutes: null as number | 'end-of-surah' | null,
  sleepTimerEndTime: null as number | null,
  sleepTimerRemainingMs: null as number | null,
  setSleepTimer: jest.fn(),
  clearSleepTimer: jest.fn(),
};

jest.mock('@/features/audio/stores/useAudioStore', () => {
  const useAudioStore = Object.assign(
    (selector: (s: typeof mockAudioState) => unknown) => selector(mockAudioState),
    { getState: () => mockAudioState, setState: () => {}, subscribe: () => () => {} },
  );
  return { useAudioStore, getNextVerseKey: jest.fn(), getPreviousVerseKey: jest.fn() };
});

const mockUIState = {
  isExpandedPlayerVisible: true,
  toggleExpandedPlayer: jest.fn(),
};

jest.mock('@/theme/useUIStore', () => {
  const useUIStore = Object.assign(
    (selector: (s: typeof mockUIState) => unknown) => selector(mockUIState),
    { getState: () => mockUIState, setState: () => {}, subscribe: () => () => {} },
  );
  return { useUIStore };
});

jest.mock('quran-data', () => ({
  SURAH_METADATA: Array.from({ length: 114 }, (_, i) => ({
    number: i + 1,
    nameArabic: `سورة ${i + 1}`,
    nameEnglish: i === 0 ? 'The Opening' : i === 1 ? 'The Cow' : `Surah ${i + 1}`,
    nameTransliteration: i === 0 ? 'Al-Fatihah' : i === 1 ? 'Al-Baqarah' : `Surah-${i + 1}`,
    verseCount: i === 0 ? 7 : i === 1 ? 286 : 10,
    revelationType: 'meccan',
    order: i + 1,
  })),
}));

jest.mock('@expo/vector-icons/Ionicons', () => ({ __esModule: true, default: 'Ionicons' }));

const mockDownloadAll = jest.fn();
const mockDeleteReciter = jest.fn();
const mockRefreshStorageUsage = jest.fn();
const mockDownloadStoreState = {
  downloadCount: 0,
  storageUsageBytes: {} as Record<string, number>,
};
jest.mock('@/features/audio/stores/useDownloadStore', () => {
  const useDownloadStore = Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({
        getReciterDownloadCount: () => mockDownloadStoreState.downloadCount,
        downloadAllForReciter: mockDownloadAll,
        deleteReciter: mockDeleteReciter,
        storageUsageBytes: mockDownloadStoreState.storageUsageBytes,
        refreshStorageUsage: mockRefreshStorageUsage,
      }),
    { getState: () => ({}), setState: () => {}, subscribe: () => () => {} },
  );
  return { useDownloadStore };
});

jest.mock('@/features/audio/components/DownloadButton', () => ({
  DownloadButton: () => 'DownloadButton',
}));

jest.mock('@/features/audio/components/ReciterSelector', () => ({
  ReciterSelector: 'ReciterSelector',
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import { Alert } from 'react-native';
import { ExpandedAudioPlayer } from './ExpandedAudioPlayer';
import { getNextVerseKey, getPreviousVerseKey } from '@/features/audio/stores/useAudioStore';

const mockedGetNext = getNextVerseKey as jest.MockedFunction<typeof getNextVerseKey>;
const mockedGetPrev = getPreviousVerseKey as jest.MockedFunction<typeof getPreviousVerseKey>;

interface MockElement { type: string; props: Record<string, unknown> }

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

describe('ExpandedAudioPlayer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAudioState.currentSurah = 2;
    mockAudioState.currentVerseKey = '2:5';
    mockAudioState.activeVerseKey = '2:5';
    mockAudioState.isPlaying = true;
    mockAudioState.playbackSpeed = 1.0;
    mockAudioState.positionMs = 15000;
    mockAudioState.durationMs = 120000;
    mockAudioState.selectedReciterId = 'alafasy';
    mockUIState.isExpandedPlayerVisible = true;
    mockDownloadStoreState.downloadCount = 0;
    mockDownloadStoreState.storageUsageBytes = {};
  });

  test('renders when visible and currentSurah is set', () => {
    const element = (ExpandedAudioPlayer as any)() as unknown as MockElement;
    expect(element).toBeDefined();
    expect(element).not.toBeNull();
  });

  test('returns null when not visible', () => {
    mockUIState.isExpandedPlayerVisible = false;
    const element = (ExpandedAudioPlayer as any)();
    expect(element).toBeNull();
  });

  test('returns null when currentSurah is null', () => {
    mockAudioState.currentSurah = null;
    const element = (ExpandedAudioPlayer as any)();
    expect(element).toBeNull();
  });

  test('displays surah name, verse number, and reciter', () => {
    const element = (ExpandedAudioPlayer as any)() as unknown as MockElement;
    const text = flattenText(element);
    expect(text).toContain('Al-Baqarah');
    expect(text).toContain('5');
    expect(text).toContain('Mishary Rashid Al-Afasy');
  });

  test('renders all 7 speed preset buttons', () => {
    const element = (ExpandedAudioPlayer as any)() as unknown as MockElement;
    const text = flattenText(element);
    const expectedSpeeds = ['0.5x', '0.7x', '0.8x', '1x', '1.2x', '1.5x', '2x'];
    for (const speed of expectedSpeeds) {
      expect(text).toContain(speed);
    }
  });

  test('highlights the currently selected speed (1.0x)', () => {
    mockAudioState.playbackSpeed = 1.0;
    const element = (ExpandedAudioPlayer as any)() as unknown as MockElement;
    // Find pressable elements that are speed buttons
    const speedButtons = findElements(element, (el) =>
      el.type === 'Pressable' && el.props?.accessibilityRole === 'button' &&
      typeof el.props?.testID === 'string' && (el.props.testID as string).startsWith('speed-'),
    );
    expect(speedButtons.length).toBe(7);
    // The 1.0x button should have active style
    const activeButton = speedButtons.find((el) => el.props.testID === 'speed-1');
    expect(activeButton).toBeDefined();
  });

  test('calls setSpeed when a speed button is pressed', () => {
    const element = (ExpandedAudioPlayer as any)() as unknown as MockElement;
    const speedButtons = findElements(element, (el) =>
      el.type === 'Pressable' && el.props?.testID === 'speed-1.5',
    );
    expect(speedButtons.length).toBe(1);
    (speedButtons[0].props.onPress as () => void)();
    expect(mockSetSpeed).toHaveBeenCalledWith(1.5);
  });

  test('shows pause icon when playing', () => {
    mockAudioState.isPlaying = true;
    const element = (ExpandedAudioPlayer as any)() as unknown as MockElement;
    const icons = findElements(element, (el) => el.type === 'Ionicons' && el.props?.name === 'pause-circle');
    expect(icons.length).toBeGreaterThan(0);
  });

  test('shows play icon when paused', () => {
    mockAudioState.isPlaying = false;
    const element = (ExpandedAudioPlayer as any)() as unknown as MockElement;
    const icons = findElements(element, (el) => el.type === 'Ionicons' && el.props?.name === 'play-circle');
    expect(icons.length).toBeGreaterThan(0);
  });

  test('calls pause on play/pause button press when playing', () => {
    mockAudioState.isPlaying = true;
    const element = (ExpandedAudioPlayer as any)() as unknown as MockElement;
    const btn = findElements(element, (el) =>
      el.type === 'Pressable' && el.props?.accessibilityLabel === 'Pause',
    );
    expect(btn.length).toBe(1);
    (btn[0].props.onPress as () => void)();
    expect(mockPause).toHaveBeenCalled();
  });

  test('calls resume on play/pause button press when paused with track loaded', () => {
    mockAudioState.isPlaying = false;
    mockAudioState.durationMs = 120000;
    const element = (ExpandedAudioPlayer as any)() as unknown as MockElement;
    const btn = findElements(element, (el) =>
      el.type === 'Pressable' && el.props?.accessibilityLabel === 'Play',
    );
    expect(btn.length).toBe(1);
    (btn[0].props.onPress as () => void)();
    expect(mockResume).toHaveBeenCalled();
    expect(mockResumePlayback).not.toHaveBeenCalled();
  });

  test('calls resumePlayback on play/pause button press with no track loaded (cold start)', () => {
    mockAudioState.isPlaying = false;
    mockAudioState.durationMs = 0;
    const element = (ExpandedAudioPlayer as any)() as unknown as MockElement;
    const btn = findElements(element, (el) =>
      el.type === 'Pressable' && el.props?.accessibilityLabel === 'Play',
    );
    expect(btn.length).toBe(1);
    (btn[0].props.onPress as () => void)();
    expect(mockResumePlayback).toHaveBeenCalled();
    expect(mockResume).not.toHaveBeenCalled();
  });

  test('next verse button calls seekToVerse with next key', () => {
    mockedGetNext.mockReturnValueOnce('2:6');
    const element = (ExpandedAudioPlayer as any)() as unknown as MockElement;
    const btn = findElements(element, (el) =>
      el.type === 'Pressable' && el.props?.accessibilityLabel === 'Next verse',
    );
    expect(btn.length).toBe(1);
    (btn[0].props.onPress as () => void)();
    expect(mockSeekToVerse).toHaveBeenCalledWith('2:6');
  });

  test('previous verse button calls seekToVerse with previous key', () => {
    mockedGetPrev.mockReturnValueOnce('2:4');
    const element = (ExpandedAudioPlayer as any)() as unknown as MockElement;
    const btn = findElements(element, (el) =>
      el.type === 'Pressable' && el.props?.accessibilityLabel === 'Previous verse',
    );
    expect(btn.length).toBe(1);
    (btn[0].props.onPress as () => void)();
    expect(mockSeekToVerse).toHaveBeenCalledWith('2:4');
  });

  test('renders progress bar', () => {
    const element = (ExpandedAudioPlayer as any)() as unknown as MockElement;
    const progressBar = findElements(element, (el) => el.props?.testID === 'progress-bar');
    expect(progressBar.length).toBe(1);
  });

  test('close button calls toggleExpandedPlayer', () => {
    const element = (ExpandedAudioPlayer as any)() as unknown as MockElement;
    const closeBtn = findElements(element, (el) =>
      el.type === 'Pressable' && el.props?.accessibilityLabel === 'Close player',
    );
    expect(closeBtn.length).toBe(1);
    (closeBtn[0].props.onPress as () => void)();
    expect(mockUIState.toggleExpandedPlayer).toHaveBeenCalled();
  });

  test('shows Download All button when downloadCount < 114', () => {
    mockDownloadStoreState.downloadCount = 5;
    const element = (ExpandedAudioPlayer as any)() as unknown as MockElement;
    const btn = findElements(element, (el) =>
      el.type === 'Pressable' && el.props?.testID === 'download-all-button',
    );
    expect(btn.length).toBe(1);
  });

  test('Download All button shows size confirmation dialog with proportional estimate', () => {
    mockDownloadStoreState.downloadCount = 10;
    const alertSpy = jest.spyOn(Alert, 'alert');
    const element = (ExpandedAudioPlayer as any)() as unknown as MockElement;
    const btn = findElements(element, (el) =>
      el.type === 'Pressable' && el.props?.testID === 'download-all-button',
    );
    (btn[0].props.onPress as () => void)();
    // 104 remaining out of 114 total → ~1.4 GB estimate
    expect(alertSpy).toHaveBeenCalledWith(
      'Download All Surahs',
      expect.stringContaining('104'),
      expect.arrayContaining([
        expect.objectContaining({ text: 'Cancel' }),
        expect.objectContaining({ text: 'Download' }),
      ]),
    );
    const message = alertSpy.mock.calls[0][1] as string;
    expect(message).toContain('~1.4 GB');
    alertSpy.mockRestore();
  });

  test('Download All confirmation calls downloadAllForReciter', () => {
    mockDownloadStoreState.downloadCount = 10;
    const alertSpy = jest.spyOn(Alert, 'alert');
    const element = (ExpandedAudioPlayer as any)() as unknown as MockElement;
    const btn = findElements(element, (el) =>
      el.type === 'Pressable' && el.props?.testID === 'download-all-button',
    );
    (btn[0].props.onPress as () => void)();
    const buttons = alertSpy.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    const downloadButton = buttons.find((b) => b.text === 'Download');
    downloadButton?.onPress?.();
    expect(mockDownloadAll).toHaveBeenCalledWith('alafasy');
    alertSpy.mockRestore();
  });

  test('hides Download All button when all 114 downloaded', () => {
    mockDownloadStoreState.downloadCount = 114;
    const element = (ExpandedAudioPlayer as any)() as unknown as MockElement;
    const btn = findElements(element, (el) =>
      el.type === 'Pressable' && el.props?.testID === 'download-all-button',
    );
    expect(btn.length).toBe(0);
  });

  test('shows Delete All button when downloadCount > 0', () => {
    mockDownloadStoreState.downloadCount = 10;
    const element = (ExpandedAudioPlayer as any)() as unknown as MockElement;
    const btn = findElements(element, (el) =>
      el.type === 'Pressable' && el.props?.testID === 'delete-all-button',
    );
    expect(btn.length).toBe(1);
  });

  test('hides Delete All button when downloadCount is 0', () => {
    mockDownloadStoreState.downloadCount = 0;
    const element = (ExpandedAudioPlayer as any)() as unknown as MockElement;
    const btn = findElements(element, (el) =>
      el.type === 'Pressable' && el.props?.testID === 'delete-all-button',
    );
    expect(btn.length).toBe(0);
  });

  test('Delete All button shows confirmation dialog via Alert.alert', () => {
    mockDownloadStoreState.downloadCount = 10;
    const alertSpy = jest.spyOn(Alert, 'alert');
    const element = (ExpandedAudioPlayer as any)() as unknown as MockElement;
    const btn = findElements(element, (el) =>
      el.type === 'Pressable' && el.props?.testID === 'delete-all-button',
    );
    (btn[0].props.onPress as () => void)();
    expect(alertSpy).toHaveBeenCalledWith(
      'Delete All Downloads',
      expect.stringContaining('10'),
      expect.arrayContaining([
        expect.objectContaining({ text: 'Cancel' }),
        expect.objectContaining({ text: 'Delete All', style: 'destructive' }),
      ]),
    );
    alertSpy.mockRestore();
  });

  test('Delete All confirmation calls deleteReciter', () => {
    mockDownloadStoreState.downloadCount = 10;
    const alertSpy = jest.spyOn(Alert, 'alert');
    const element = (ExpandedAudioPlayer as any)() as unknown as MockElement;
    const btn = findElements(element, (el) =>
      el.type === 'Pressable' && el.props?.testID === 'delete-all-button',
    );
    (btn[0].props.onPress as () => void)();
    // Simulate pressing "Delete All" in the alert
    const buttons = alertSpy.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    const deleteButton = buttons.find((b) => b.text === 'Delete All');
    deleteButton?.onPress?.();
    expect(mockDeleteReciter).toHaveBeenCalledWith('alafasy');
    alertSpy.mockRestore();
  });

  test('displays storage usage when storageBytes > 0', () => {
    mockDownloadStoreState.downloadCount = 10;
    mockDownloadStoreState.storageUsageBytes = { alafasy: 52_428_800 };
    const element = (ExpandedAudioPlayer as any)() as unknown as MockElement;
    const storageEl = findElements(element, (el) => el.props?.testID === 'storage-usage');
    expect(storageEl.length).toBe(1);
    const text = flattenText(storageEl[0]);
    expect(text).toContain('50.0 MB');
  });

  test('hides storage usage when storageBytes is 0', () => {
    mockDownloadStoreState.downloadCount = 0;
    mockDownloadStoreState.storageUsageBytes = {};
    const element = (ExpandedAudioPlayer as any)() as unknown as MockElement;
    const storageEl = findElements(element, (el) => el.props?.testID === 'storage-usage');
    expect(storageEl.length).toBe(0);
  });

  test('renders tappable reciter row with chevron', () => {
    const element = (ExpandedAudioPlayer as any)() as unknown as MockElement;
    const reciterBtn = findElements(element, (el) =>
      el.type === 'Pressable' && el.props?.accessibilityLabel === 'Select reciter',
    );
    expect(reciterBtn.length).toBe(1);
    const text = flattenText(reciterBtn[0]);
    expect(text).toContain('Mishary Rashid Al-Afasy');
    // Should have a chevron icon
    const chevron = findElements(reciterBtn[0], (el) =>
      el.type === 'Ionicons' && el.props?.name === 'chevron-forward',
    );
    expect(chevron.length).toBe(1);
  });

  test('renders ReciterSelector component', () => {
    const element = (ExpandedAudioPlayer as any)() as unknown as MockElement;
    const selector = findElements(element, (el) => el.type === 'ReciterSelector');
    expect(selector.length).toBe(1);
    expect(selector[0].props.visible).toBe(false);
  });

  test('stop button calls stop() and toggleExpandedPlayer', () => {
    const element = (ExpandedAudioPlayer as any)() as unknown as MockElement;
    const stopBtn = findElements(element, (el) =>
      el.type === 'Pressable' && el.props?.testID === 'stop-button',
    );
    expect(stopBtn.length).toBe(1);
    (stopBtn[0].props.onPress as () => void)();
    expect(mockStop).toHaveBeenCalled();
    expect(mockUIState.toggleExpandedPlayer).toHaveBeenCalled();
  });
});
