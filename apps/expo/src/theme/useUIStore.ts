import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { mmkvStorage } from '@/services/mmkv';
import { getDefaultMode } from '@/theme/getDefaultMode';

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
  firstVisibleVerse: string | null;
  autoFollowAudio: boolean;
  tapToSeek: boolean;
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
  setFirstVisibleVerse: (verseKey: string | null) => void;
  toggleExpandedPlayer: () => void;
  toggleAutoFollowAudio: () => void;
  toggleTapToSeek: () => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      selectedTheme: 'system',
      currentMode: getDefaultMode(),
      fontSize: 28,
      currentSurah: 1,
      currentVerse: 1,
      lastReadTimestamp: Date.now(),
      isChromeVisible: false,
      isExpandedPlayerVisible: false,
      scrollVersion: 0,
      firstVisibleVerse: null,
      autoFollowAudio: true,
      tapToSeek: false,
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
      setFirstVisibleVerse: (verseKey) => set({ firstVisibleVerse: verseKey }),
      toggleExpandedPlayer: () =>
        set((state) => ({ isExpandedPlayerVisible: !state.isExpandedPlayerVisible })),
      toggleAutoFollowAudio: () => set((state) => ({ autoFollowAudio: !state.autoFollowAudio })),
      toggleTapToSeek: () => set((state) => ({ tapToSeek: !state.tapToSeek })),
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
        autoFollowAudio: state.autoFollowAudio,
        tapToSeek: state.tapToSeek,
      }),
    },
  ),
);
