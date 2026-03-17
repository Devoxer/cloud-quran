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
const mockStop = jest.fn();
const mockAudioState = {
  currentSurah: 1 as number | null,
  currentVerseKey: '1:3' as string | null,
  isPlaying: true,
  positionMs: 30000,
  durationMs: 120000,
  selectedReciterId: 'alafasy',
  playbackSpeed: 1.0,
  sleepTimerEndTime: null as number | null,
  pause: mockPause,
  resume: mockResume,
  resumePlayback: mockResumePlayback,
  stop: mockStop,
};

jest.mock('@/features/audio/stores/useAudioStore', () => {
  const useAudioStore = Object.assign(
    (selector: (s: typeof mockAudioState) => unknown) => selector(mockAudioState),
    { getState: () => mockAudioState, setState: () => {}, subscribe: () => () => {} },
  );
  return { useAudioStore };
});

const mockToggleExpandedPlayer = jest.fn();
const mockUIState = {
  selectedTheme: 'system' as string, currentMode: 'reading' as string, fontSize: 28,
  currentSurah: 1, currentVerse: 1, lastReadTimestamp: Date.now(), isChromeVisible: true,
  isExpandedPlayerVisible: false, scrollVersion: 0,
  setTheme: jest.fn(), setMode: jest.fn(), setFontSize: jest.fn(), setCurrentSurah: jest.fn(),
  setCurrentVerse: jest.fn(), navigateToVerse: jest.fn(), syncReadingPosition: jest.fn(),
  toggleChrome: jest.fn(), showChrome: jest.fn(), hideChrome: jest.fn(),
  toggleExpandedPlayer: mockToggleExpandedPlayer,
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
    { number: 1, nameArabic: 'الفاتحة', nameEnglish: 'The Opening', nameTransliteration: 'Al-Fatihah', verseCount: 7, revelationType: 'meccan', order: 5 },
  ],
}));

jest.mock('@expo/vector-icons/Ionicons', () => ({ __esModule: true, default: 'Ionicons' }));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import { MiniPlayerBar, MINI_PLAYER_HEIGHT } from './MiniPlayerBar';

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

describe('MiniPlayerBar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAudioState.currentSurah = 1;
    mockAudioState.currentVerseKey = '1:3';
    mockAudioState.isPlaying = true;
    mockAudioState.positionMs = 30000;
    mockAudioState.durationMs = 120000;
    mockAudioState.selectedReciterId = 'alafasy';
    mockAudioState.playbackSpeed = 1.0;
    mockAudioState.sleepTimerEndTime = null;
  });

  test('renders when currentSurah is set', () => {
    const element = (MiniPlayerBar as any)() as unknown as MockElement;
    expect(element).toBeDefined();
    expect(element.type).toBe('Animated.View');
  });

  test('returns null when currentSurah is null', () => {
    mockAudioState.currentSurah = null;
    const element = (MiniPlayerBar as any)();
    expect(element).toBeNull();
  });

  test('displays surah name, verse number, and reciter', () => {
    const element = (MiniPlayerBar as any)() as unknown as MockElement;
    const captions = findElements(element, (el) => el.props?.variant === 'uiCaption');
    expect(captions.length).toBeGreaterThan(0);
    const children = captions[0].props.children;
    const text = Array.isArray(children) ? children.join('') : String(children);
    expect(text).toContain('The Opening');
    expect(text).toContain('3');
    expect(text).toContain('Mishary Rashid Al-Afasy');
  });

  test('shows pause icon when playing', () => {
    mockAudioState.isPlaying = true;
    const element = (MiniPlayerBar as any)() as unknown as MockElement;
    const icons = findElements(element, (el) => el.type === 'Ionicons');
    const pauseIcon = icons.find((i) => i.props.name === 'pause');
    expect(pauseIcon).toBeDefined();
  });

  test('shows play icon when paused', () => {
    mockAudioState.isPlaying = false;
    const element = (MiniPlayerBar as any)() as unknown as MockElement;
    const icons = findElements(element, (el) => el.type === 'Ionicons');
    const playIcon = icons.find((i) => i.props.name === 'play');
    expect(playIcon).toBeDefined();
  });

  test('calls pause when play button pressed during playback', () => {
    mockAudioState.isPlaying = true;
    const element = (MiniPlayerBar as any)() as unknown as MockElement;
    const playBtn = findElements(element, (el) =>
      el.type === 'Pressable' && el.props?.accessibilityLabel === 'Pause',
    );
    expect(playBtn.length).toBe(1);
    (playBtn[0].props.onPress as () => void)();
    expect(mockPause).toHaveBeenCalled();
  });

  test('calls resume when play button pressed while paused with track loaded', () => {
    mockAudioState.isPlaying = false;
    mockAudioState.durationMs = 120000;
    const element = (MiniPlayerBar as any)() as unknown as MockElement;
    const playBtn = findElements(element, (el) =>
      el.type === 'Pressable' && el.props?.accessibilityLabel === 'Play',
    );
    expect(playBtn.length).toBe(1);
    (playBtn[0].props.onPress as () => void)();
    expect(mockResume).toHaveBeenCalled();
    expect(mockResumePlayback).not.toHaveBeenCalled();
  });

  test('calls resumePlayback when play button pressed with no track loaded (cold start)', () => {
    mockAudioState.isPlaying = false;
    mockAudioState.durationMs = 0;
    const element = (MiniPlayerBar as any)() as unknown as MockElement;
    const playBtn = findElements(element, (el) =>
      el.type === 'Pressable' && el.props?.accessibilityLabel === 'Play',
    );
    expect(playBtn.length).toBe(1);
    (playBtn[0].props.onPress as () => void)();
    expect(mockResumePlayback).toHaveBeenCalled();
    expect(mockResume).not.toHaveBeenCalled();
  });

  test('has correct height', () => {
    expect(MINI_PLAYER_HEIGHT).toBe(56);
  });

  test('tapping info area calls toggleExpandedPlayer', () => {
    const element = (MiniPlayerBar as any)() as unknown as MockElement;
    const infoBtn = findElements(element, (el) =>
      el.type === 'Pressable' && el.props?.accessibilityLabel === 'Open audio player',
    );
    expect(infoBtn.length).toBe(1);
    (infoBtn[0].props.onPress as () => void)();
    expect(mockToggleExpandedPlayer).toHaveBeenCalled();
  });

  test('renders progress bar at top', () => {
    mockAudioState.positionMs = 60000;
    mockAudioState.durationMs = 120000;
    const element = (MiniPlayerBar as any)() as unknown as MockElement;
    const progressBar = findElements(element, (el) => el.props?.testID === 'mini-progress-bar');
    expect(progressBar.length).toBe(1);
    // Progress fill should exist as a child
    const children = Array.isArray(progressBar[0].props.children) ? progressBar[0].props.children : [progressBar[0].props.children];
    expect(children.length).toBeGreaterThan(0);
  });

  test('does not show speed badge when speed is 1.0x', () => {
    mockAudioState.playbackSpeed = 1.0;
    const element = (MiniPlayerBar as any)() as unknown as MockElement;
    const badge = findElements(element, (el) => el.props?.testID === 'speed-badge');
    expect(badge.length).toBe(0);
  });

  test('shows speed badge when speed is not 1.0x', () => {
    mockAudioState.playbackSpeed = 1.5;
    const element = (MiniPlayerBar as any)() as unknown as MockElement;
    const badge = findElements(element, (el) => el.props?.testID === 'speed-badge');
    expect(badge.length).toBe(1);
  });

  test('does not show moon icon when no sleep timer is active', () => {
    mockAudioState.sleepTimerEndTime = null;
    const element = (MiniPlayerBar as any)() as unknown as MockElement;
    const moon = findElements(element, (el) => el.props?.testID === 'sleep-icon');
    expect(moon.length).toBe(0);
  });

  test('shows moon icon when timed sleep timer is active', () => {
    mockAudioState.sleepTimerEndTime = Date.now() + 60000;
    const element = (MiniPlayerBar as any)() as unknown as MockElement;
    const moon = findElements(element, (el) => el.props?.testID === 'sleep-icon');
    expect(moon.length).toBe(1);
  });

  test('shows moon icon when end-of-surah sleep timer is active', () => {
    mockAudioState.sleepTimerEndTime = -1; // sentinel for end-of-surah
    const element = (MiniPlayerBar as any)() as unknown as MockElement;
    const moon = findElements(element, (el) => el.props?.testID === 'sleep-icon');
    expect(moon.length).toBe(1);
  });
});
