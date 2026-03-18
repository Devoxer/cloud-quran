import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useAudioStore } from '@/features/audio/stores/useAudioStore';
import { useAuthStore } from '@/features/auth/useAuthStore';
import { useBookmarkStore } from '@/features/bookmarks/useBookmarkStore';
import { api } from '@/services/api';
import { useUIStore } from '@/theme/useUIStore';
import { getLastPushAt, setMerging } from './useSyncEngine';

interface SyncPullData {
  position: {
    currentSurah: number;
    currentVerse: number;
    currentMode: string;
    lastReadTimestamp: number;
  } | null;
  bookmarks: Array<{
    surahNumber: number;
    verseNumber: number;
    createdAt: number;
  }>;
  preferences: {
    fontSize: number;
    updatedAt: number;
  } | null;
  audio: {
    selectedReciterId: string;
    playbackSpeed: number;
    updatedAt: number;
  } | null;
}

let lastEtag: string | null = null;

async function fetchSyncData(): Promise<SyncPullData | null> {
  const headers: Record<string, string> = {};
  if (lastEtag) {
    headers['If-None-Match'] = lastEtag;
  }

  const res = await api.api.sync.pull.$get(undefined as never, { headers });

  // 304 Not Modified — data hasn't changed
  if (res.status === 304) return null;

  const etag = res.headers.get('ETag');
  if (etag) lastEtag = etag;

  return (await res.json()) as SyncPullData;
}

function mergeServerData(data: SyncPullData) {
  setMerging(true);
  try {
    // Reading position: LWW — only apply if server is newer than local
    if (data.position) {
      const localTimestamp = useUIStore.getState().lastReadTimestamp;
      if (data.position.lastReadTimestamp > localTimestamp) {
        useUIStore.getState().syncReadingPosition(data.position.currentSurah, data.position.currentVerse);
      }
    }

    // Bookmarks: union-merge — add missing, never remove
    if (data.bookmarks.length > 0) {
      const localBookmarks = useBookmarkStore.getState().bookmarks;
      for (const sb of data.bookmarks) {
        const exists = localBookmarks.some(
          (lb) => lb.surahNumber === sb.surahNumber && lb.verseNumber === sb.verseNumber,
        );
        if (!exists) {
          useBookmarkStore.getState().addBookmark(sb.surahNumber, sb.verseNumber);
        }
      }
    }

    // Preferences: LWW — only apply if server data is newer than our last push
    const pushAt = getLastPushAt();
    if (data.preferences) {
      if (data.preferences.updatedAt > pushAt) {
        useUIStore.getState().setFontSize(data.preferences.fontSize);
      }
    }

    // Audio: LWW — only apply if server data is newer than our last push
    if (data.audio) {
      if (data.audio.updatedAt > pushAt) {
        useAudioStore.getState().setReciter(data.audio.selectedReciterId);
        useAudioStore.getState().setSpeed(data.audio.playbackSpeed);
      }
    }
  } finally {
    setMerging(false);
  }
}

/**
 * React Query hook for pulling sync data from server.
 * Enabled only when authenticated.
 * Triggers on app foreground (refetchOnWindowFocus) and network reconnect (refetchOnReconnect).
 */
export function useSyncPull() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const prevAuthRef = useRef(isAuthenticated);

  // Reset ETag when auth state changes (different user = different data)
  useEffect(() => {
    if (prevAuthRef.current !== isAuthenticated) {
      lastEtag = null;
      prevAuthRef.current = isAuthenticated;
    }
  }, [isAuthenticated]);

  return useQuery({
    queryKey: ['sync'],
    queryFn: async () => {
      const data = await fetchSyncData();
      if (data) {
        mergeServerData(data);
      }
      return data;
    },
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Exported for testing
export { fetchSyncData, mergeServerData };
export type { SyncPullData };
