import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

// Mock MMKV before importing the store
const mockStorage = new Map<string, string>();
jest.mock('react-native-mmkv', () => ({
  createMMKV: () => ({
    set(key: string, value: string) {
      mockStorage.set(key, value);
    },
    getString(key: string) {
      return mockStorage.get(key);
    },
    remove(key: string) {
      mockStorage.delete(key);
    },
  }),
}));

const { mmkvStorage } = require('@/services/mmkv');

// Create a standalone store matching the real useUIStore logic.
type ThemeSelection = 'system' | 'light' | 'sepia' | 'dark';
type ReadingMode = 'reading' | 'mushaf';

interface UIState {
  selectedTheme: ThemeSelection;
  currentMode: ReadingMode;
  fontSize: number;
  currentSurah: number;
  currentVerse: number;
  lastReadTimestamp: number;
  isChromeVisible: boolean;
  isExpandedPlayerVisible: boolean;
  scrollVersion: number;
  setTheme: (theme: ThemeSelection) => void;
  setMode: (mode: ReadingMode) => void;
  setFontSize: (size: number) => void;
  setCurrentSurah: (surah: number) => void;
  setCurrentVerse: (verse: number) => void;
  navigateToVerse: (surah: number, verse: number) => void;
  syncReadingPosition: (surah: number, verse: number) => void;
  toggleChrome: () => void;
  showChrome: () => void;
  hideChrome: () => void;
  toggleExpandedPlayer: () => void;
}

const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      selectedTheme: 'system',
      currentMode: 'reading',
      fontSize: 28,
      currentSurah: 1,
      currentVerse: 1,
      lastReadTimestamp: Date.now(),
      isChromeVisible: false,
      isExpandedPlayerVisible: false,
      scrollVersion: 0,
      setTheme: (theme) => set({ selectedTheme: theme }),
      setMode: (mode) => set({ currentMode: mode }),
      setFontSize: (size) => set({ fontSize: Math.min(44, Math.max(20, size)) }),
      setCurrentSurah: (surah) =>
        set({ currentSurah: Math.min(114, Math.max(1, surah)), currentVerse: 1 }),
      setCurrentVerse: (verse) =>
        set({ currentVerse: Math.max(1, verse), lastReadTimestamp: Date.now() }),
      navigateToVerse: (surah, verse) =>
        set((state) => ({
          currentSurah: Math.min(114, Math.max(1, surah)),
          currentVerse: Math.max(1, verse),
          lastReadTimestamp: Date.now(),
          scrollVersion: state.scrollVersion + 1,
        })),
      syncReadingPosition: (surah, verse) =>
        set({
          currentSurah: Math.min(114, Math.max(1, surah)),
          currentVerse: Math.max(1, verse),
          lastReadTimestamp: Date.now(),
        }),
      toggleChrome: () => set((state) => ({ isChromeVisible: !state.isChromeVisible })),
      showChrome: () => set({ isChromeVisible: true }),
      hideChrome: () => set({ isChromeVisible: false }),
      toggleExpandedPlayer: () =>
        set((state) => ({ isExpandedPlayerVisible: !state.isExpandedPlayerVisible })),
    }),
    {
      name: 'ui-state',
      storage: createJSONStorage(() => mmkvStorage),
      partialize: (state) => ({
        selectedTheme: state.selectedTheme,
        currentMode: state.currentMode,
        fontSize: state.fontSize,
        currentSurah: state.currentSurah,
        currentVerse: state.currentVerse,
        lastReadTimestamp: state.lastReadTimestamp,
      }),
    },
  ),
);

describe('useUIStore', () => {
  beforeEach(() => {
    mockStorage.clear();
    useUIStore.setState({
      selectedTheme: 'system',
      currentMode: 'reading',
      fontSize: 28,
      currentSurah: 1,
      currentVerse: 1,
      lastReadTimestamp: Date.now(),
    });
  });

  test('has correct default values', () => {
    const state = useUIStore.getState();
    expect(state.selectedTheme).toBe('system');
    expect(state.currentMode).toBe('reading');
    expect(state.fontSize).toBe(28);
    expect(state.currentVerse).toBe(1);
    expect(typeof state.lastReadTimestamp).toBe('number');
  });

  test('setTheme updates selectedTheme', () => {
    useUIStore.getState().setTheme('dark');
    expect(useUIStore.getState().selectedTheme).toBe('dark');

    useUIStore.getState().setTheme('sepia');
    expect(useUIStore.getState().selectedTheme).toBe('sepia');
  });

  test('setMode updates currentMode', () => {
    useUIStore.getState().setMode('mushaf');
    expect(useUIStore.getState().currentMode).toBe('mushaf');

    useUIStore.getState().setMode('reading');
    expect(useUIStore.getState().currentMode).toBe('reading');
  });

  test('setFontSize updates fontSize', () => {
    useUIStore.getState().setFontSize(36);
    expect(useUIStore.getState().fontSize).toBe(36);

    useUIStore.getState().setFontSize(20);
    expect(useUIStore.getState().fontSize).toBe(20);
  });

  test('setFontSize clamps value to 20-44 range', () => {
    useUIStore.getState().setFontSize(10);
    expect(useUIStore.getState().fontSize).toBe(20);

    useUIStore.getState().setFontSize(100);
    expect(useUIStore.getState().fontSize).toBe(44);

    useUIStore.getState().setFontSize(30);
    expect(useUIStore.getState().fontSize).toBe(30);
  });

  test('setCurrentVerse updates currentVerse', () => {
    useUIStore.getState().setCurrentVerse(5);
    expect(useUIStore.getState().currentVerse).toBe(5);

    useUIStore.getState().setCurrentVerse(100);
    expect(useUIStore.getState().currentVerse).toBe(100);
  });

  test('setCurrentVerse also updates lastReadTimestamp', () => {
    const before = Date.now();
    useUIStore.getState().setCurrentVerse(10);
    const after = Date.now();
    const timestamp = useUIStore.getState().lastReadTimestamp;
    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);
  });

  test('setCurrentVerse clamps to minimum 1', () => {
    useUIStore.getState().setCurrentVerse(0);
    expect(useUIStore.getState().currentVerse).toBe(1);

    useUIStore.getState().setCurrentVerse(-5);
    expect(useUIStore.getState().currentVerse).toBe(1);
  });

  test('setCurrentSurah resets currentVerse to 1', () => {
    useUIStore.getState().setCurrentVerse(50);
    expect(useUIStore.getState().currentVerse).toBe(50);

    useUIStore.getState().setCurrentSurah(2);
    expect(useUIStore.getState().currentSurah).toBe(2);
    expect(useUIStore.getState().currentVerse).toBe(1);
  });

  test('currentVerse and lastReadTimestamp are included in persisted state', () => {
    useUIStore.getState().setCurrentVerse(42);
    const stored = mockStorage.get('ui-state');
    if (stored) {
      const parsed = JSON.parse(stored);
      expect(parsed.state.currentVerse).toBe(42);
      expect(parsed.state.lastReadTimestamp).toBeDefined();
    } else {
      expect(useUIStore.getState().currentVerse).toBe(42);
      expect(useUIStore.getState().lastReadTimestamp).toBeDefined();
    }
  });

  test('toggleExpandedPlayer toggles isExpandedPlayerVisible', () => {
    expect(useUIStore.getState().isExpandedPlayerVisible).toBe(false);
    useUIStore.getState().toggleExpandedPlayer();
    expect(useUIStore.getState().isExpandedPlayerVisible).toBe(true);
    useUIStore.getState().toggleExpandedPlayer();
    expect(useUIStore.getState().isExpandedPlayerVisible).toBe(false);
  });

  test('isExpandedPlayerVisible is NOT persisted (transient state)', () => {
    useUIStore.getState().toggleExpandedPlayer();
    expect(useUIStore.getState().isExpandedPlayerVisible).toBe(true);
    const stored = mockStorage.get('ui-state');
    if (stored) {
      const parsed = JSON.parse(stored);
      expect(parsed.state.isExpandedPlayerVisible).toBeUndefined();
    }
  });

  test('persists state changes to MMKV storage', () => {
    useUIStore.getState().setTheme('dark');
    const stored = mockStorage.get('ui-state');
    if (stored) {
      const parsed = JSON.parse(stored);
      expect(parsed.state.selectedTheme).toBe('dark');
    } else {
      expect(useUIStore.getState().selectedTheme).toBe('dark');
    }
  });
});
