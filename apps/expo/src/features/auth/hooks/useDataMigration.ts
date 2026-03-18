import { useCallback, useState } from 'react';
import { useAudioStore } from '@/features/audio/stores/useAudioStore';
import { useBookmarkStore } from '@/features/bookmarks/useBookmarkStore';
import { api } from '@/services/api';
import { useUIStore } from '@/theme/useUIStore';

export function useDataMigration() {
  const [isMigrating, setIsMigrating] = useState(false);

  const migrateData = useCallback(async () => {
    setIsMigrating(true);
    try {
      const uiState = useUIStore.getState();
      const bookmarks = useBookmarkStore.getState().bookmarks;
      const audioState = useAudioStore.getState();

      const payload = {
        position: {
          currentSurah: uiState.currentSurah,
          currentVerse: uiState.currentVerse,
          currentMode: uiState.currentMode,
          lastReadTimestamp: uiState.lastReadTimestamp,
        },
        bookmarks,
        preferences: {
          fontSize: uiState.fontSize,
          autoFollowAudio: uiState.autoFollowAudio,
          tapToSeek: uiState.tapToSeek,
        },
        audio: {
          selectedReciterId: audioState.selectedReciterId,
          playbackSpeed: audioState.playbackSpeed,
          continuousPlayback: audioState.continuousPlayback,
        },
      };

      const res = await api.api.sync.push.$post({
        json: payload as never,
      });
      if (!res.ok) {
        throw new Error(`Migration failed: ${res.status}`);
      }
    } catch {
      // Gracefully handle — migration is best-effort until sync is implemented.
    } finally {
      setIsMigrating(false);
    }
  }, []);

  return { migrateData, isMigrating };
}
