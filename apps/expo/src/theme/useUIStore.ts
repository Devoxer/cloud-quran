import { useEffect } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { db, id, usePreferences, useReadingPosition } from '@/services/instantdb';
import { mmkvStorage } from '@/services/mmkv';
import { getDefaultMode } from '@/theme/getDefaultMode';

type ThemeSelection = 'system' | 'light' | 'sepia' | 'dark';
type ReadingMode = 'reading' | 'mushaf';

// ── Transient-only UI state (never synced) ──────────────────────────
interface UIState {
  isChromeVisible: boolean;
  isExpandedPlayerVisible: boolean;
  scrollVersion: number;
  firstVisibleVerse: string | null;
  autoFollowAudio: boolean;
  tapToSeek: boolean;
  toggleChrome: () => void;
  showChrome: () => void;
  hideChrome: () => void;
  setFirstVisibleVerse: (verseKey: string | null) => void;
  toggleExpandedPlayer: () => void;
  toggleAutoFollowAudio: () => void;
  toggleTapToSeek: () => void;
  // Synced field setters — write to InstantDB
  setTheme: (theme: ThemeSelection) => void;
  setMode: (mode: ReadingMode) => void;
  setFontSize: (size: number) => void;
  setCurrentSurah: (surah: number) => void;
  setCurrentVerse: (verse: number) => void;
  navigateToVerse: (surah: number, verse: number) => void;
  syncReadingPosition: (surah: number, verse: number) => void;
  // Local cache of synced values for non-hook access (getState)
  selectedTheme: ThemeSelection;
  currentMode: ReadingMode;
  fontSize: number;
  currentSurah: number;
  currentVerse: number;
  lastReadTimestamp: number;
  // Internal: ID of the single preferences and readingPosition entity
  _preferencesId: string | null;
  _readingPositionId: string | null;
  _setPreferencesId: (id: string) => void;
  _setReadingPositionId: (id: string) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      // Transient state
      isChromeVisible: false,
      isExpandedPlayerVisible: false,
      scrollVersion: 0,
      firstVisibleVerse: null,
      autoFollowAudio: true,
      tapToSeek: false,

      // Local cache of synced values (used for getState() access & initial values)
      selectedTheme: 'system',
      currentMode: getDefaultMode(),
      fontSize: 28,
      currentSurah: 1,
      currentVerse: 1,
      lastReadTimestamp: Date.now(),
      _preferencesId: null,
      _readingPositionId: null,

      _setPreferencesId: (prefId) => set({ _preferencesId: prefId }),
      _setReadingPositionId: (rpId) => set({ _readingPositionId: rpId }),

      // ── Synced setters → InstantDB transactions ───────────────
      setTheme: (theme) => {
        set({ selectedTheme: theme });
        const prefId = get()._preferencesId;
        if (prefId) {
          db.transact(db.tx.preferences[prefId].update({ theme }));
        }
      },
      setMode: (mode) => {
        set({ currentMode: mode });
        const prefId = get()._preferencesId;
        if (prefId) {
          db.transact(db.tx.preferences[prefId].update({ readingMode: mode }));
        }
      },
      setFontSize: (size) => {
        const clamped = Math.min(44, Math.max(20, size));
        set({ fontSize: clamped });
        const prefId = get()._preferencesId;
        if (prefId) {
          db.transact(db.tx.preferences[prefId].update({ fontSize: clamped }));
        }
      },
      setCurrentSurah: (surah) => {
        const clamped = Math.min(114, Math.max(1, surah));
        set({ currentSurah: clamped, currentVerse: 1, lastReadTimestamp: Date.now() });
        const rpId = get()._readingPositionId;
        if (rpId) {
          db.transact(
            db.tx.readingPosition[rpId].update({
              surah: clamped,
              verse: 1,
              updatedAt: Date.now(),
            }),
          );
        }
      },
      setCurrentVerse: (verse) => {
        const clamped = Math.max(1, verse);
        set({ currentVerse: clamped, lastReadTimestamp: Date.now() });
        const rpId = get()._readingPositionId;
        if (rpId) {
          db.transact(
            db.tx.readingPosition[rpId].update({
              verse: clamped,
              updatedAt: Date.now(),
            }),
          );
        }
      },
      navigateToVerse: (surah, verse) => {
        const clampedSurah = Math.min(114, Math.max(1, surah));
        const clampedVerse = Math.max(1, verse);
        set((state) => ({
          currentSurah: clampedSurah,
          currentVerse: clampedVerse,
          lastReadTimestamp: Date.now(),
          scrollVersion: state.scrollVersion + 1,
        }));
        const rpId = get()._readingPositionId;
        if (rpId) {
          db.transact(
            db.tx.readingPosition[rpId].update({
              surah: clampedSurah,
              verse: clampedVerse,
              updatedAt: Date.now(),
            }),
          );
        }
      },
      syncReadingPosition: (surah, verse) => {
        const clampedSurah = Math.min(114, Math.max(1, surah));
        const clampedVerse = Math.max(1, verse);
        set({
          currentSurah: clampedSurah,
          currentVerse: clampedVerse,
          lastReadTimestamp: Date.now(),
        });
        const rpId = get()._readingPositionId;
        if (rpId) {
          db.transact(
            db.tx.readingPosition[rpId].update({
              surah: clampedSurah,
              verse: clampedVerse,
              updatedAt: Date.now(),
            }),
          );
        }
      },

      // ── Transient setters ─────────────────────────────────────
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
      // v1 strips the two entity ids from blobs written before they were
      // removed from partialize. Dropping them from partialize only stops
      // future WRITES — an existing blob still rehydrates them, so installs
      // carrying a stale id would keep failing every transact without this.
      version: 1,
      migrate: (persisted, fromVersion) => {
        if (fromVersion < 1 && persisted && typeof persisted === 'object') {
          const { _preferencesId, _readingPositionId, ...rest } = persisted as Record<
            string,
            unknown
          >;
          return rest;
        }
        return persisted;
      },
      partialize: (state) => ({
        // Only persist transient prefs and local cache of synced values
        autoFollowAudio: state.autoFollowAudio,
        tapToSeek: state.tapToSeek,
        selectedTheme: state.selectedTheme,
        currentMode: state.currentMode,
        fontSize: state.fontSize,
        currentSurah: state.currentSurah,
        currentVerse: state.currentVerse,
        lastReadTimestamp: state.lastReadTimestamp,
        // _preferencesId / _readingPositionId are deliberately NOT persisted.
        // A persisted id outlives the entity it names (Instant app reset, a new
        // guest identity, server-side deletion). InstantDB treats `.update()` on
        // an unknown id as a CREATE, so the partial payloads below would then
        // create a row missing schema-required attributes and every write would
        // fail `validation-failed` forever. The ids are re-derived from the
        // server on each launch by useInstantDBSync instead.
      }),
    },
  ),
);

/**
 * One creation attempt per app session, per entity.
 *
 * These MUST be latched before the transact, not after it resolves. InstantDB
 * applies a transact optimistically, so a rejected create goes: local entity
 * appears -> effect settles -> server rejects -> optimistic write rolls back ->
 * the query reads null again -> the effect re-fires. Without a latch that is an
 * unbounded create loop against a server that is refusing every write (observed
 * on device: 245+ transacts in ~30s while perms were denying creates).
 *
 * Retrying cannot help here: a create that fails perms or validation will fail
 * identically every time. Attempt once, let the error surface, stop.
 */
let _preferencesCreateAttempted = false;
let _readingPositionCreateAttempted = false;

/**
 * Hook to sync InstantDB data into the Zustand store.
 * Uses useEffect to avoid calling setState during render.
 * Call this once in the root layout (inside AuthGate).
 */
export function useInstantDBSync(isAuthed: boolean) {
  const { preferences, isLoading: prefsLoading } = usePreferences();
  const { position, isLoading: positionLoading } = useReadingPosition();

  // Create the singleton entities only once the server has actually answered
  // "you have none". Creating them earlier (on auth, before the query settles)
  // would mint a duplicate on every cold start now that the ids aren't persisted.
  useEffect(() => {
    if (!isAuthed || prefsLoading || preferences || _preferencesCreateAttempted) return;
    _preferencesCreateAttempted = true;
    const store = useUIStore.getState();
    const prefId = id();
    db.transact(
      db.tx.preferences[prefId].update({
        theme: store.selectedTheme === 'system' ? 'light' : store.selectedTheme,
        fontSize: store.fontSize,
        reciterId: 'ar.alafasy',
        readingMode: store.currentMode,
        speedRate: 1.0,
        transliteration: false,
      }),
    );
    useUIStore.setState({ _preferencesId: prefId });
  }, [isAuthed, prefsLoading, preferences]);

  useEffect(() => {
    if (!isAuthed || positionLoading || position || _readingPositionCreateAttempted) return;
    _readingPositionCreateAttempted = true;
    const store = useUIStore.getState();
    const rpId = id();
    db.transact(
      db.tx.readingPosition[rpId].update({
        surah: store.currentSurah,
        verse: store.currentVerse,
        page: 1,
        mode: store.currentMode,
        updatedAt: Date.now(),
      }),
    );
    useUIStore.setState({ _readingPositionId: rpId });
  }, [isAuthed, positionLoading, position]);

  // Sync preferences from InstantDB → Zustand local cache
  useEffect(() => {
    if (!preferences) return;
    const store = useUIStore.getState();
    if (store._preferencesId !== preferences.id) {
      useUIStore.setState({ _preferencesId: preferences.id });
    }
    if (preferences.theme && preferences.theme !== store.selectedTheme) {
      useUIStore.setState({ selectedTheme: preferences.theme as ThemeSelection });
    }
    if (preferences.fontSize && preferences.fontSize !== store.fontSize) {
      useUIStore.setState({ fontSize: preferences.fontSize });
    }
    if (preferences.readingMode && preferences.readingMode !== store.currentMode) {
      useUIStore.setState({ currentMode: preferences.readingMode as ReadingMode });
    }
  }, [preferences]);

  // Sync reading position from InstantDB → Zustand local cache
  useEffect(() => {
    if (!position) return;
    const store = useUIStore.getState();
    if (store._readingPositionId !== position.id) {
      useUIStore.setState({ _readingPositionId: position.id });
    }
  }, [position]);

  return { preferences, position };
}
