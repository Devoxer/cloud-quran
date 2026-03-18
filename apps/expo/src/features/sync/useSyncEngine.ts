import { useEffect, useRef } from 'react';
import { useAudioStore } from '@/features/audio/stores/useAudioStore';
import { useAuthStore } from '@/features/auth/useAuthStore';
import { useBookmarkStore } from '@/features/bookmarks/useBookmarkStore';
import { api } from '@/services/api';
import { useUIStore } from '@/theme/useUIStore';

// Guard to prevent push during pull merge (avoids feedback loop)
let isMerging = false;
export function setMerging(value: boolean) {
  isMerging = value;
}

// Tracks when the last successful push completed (for client-side LWW)
let lastPushAt = 0;
export function getLastPushAt() {
  return lastPushAt;
}

function collectPayload() {
  const ui = useUIStore.getState();
  const bookmarks = useBookmarkStore.getState().bookmarks;
  const audio = useAudioStore.getState();

  return {
    position: {
      currentSurah: ui.currentSurah,
      currentVerse: ui.currentVerse,
      currentMode: ui.currentMode,
      lastReadTimestamp: ui.lastReadTimestamp,
    },
    bookmarks,
    preferences: {
      fontSize: ui.fontSize,
      autoFollowAudio: ui.autoFollowAudio,
      tapToSeek: ui.tapToSeek,
    },
    audio: {
      selectedReciterId: audio.selectedReciterId,
      playbackSpeed: audio.playbackSpeed,
      continuousPlayback: audio.continuousPlayback,
    },
  };
}

async function syncToCloud() {
  if (!useAuthStore.getState().isAuthenticated) return;

  try {
    const payload = collectPayload();
    await api.api.sync.push.$post({ json: payload as never });
    lastPushAt = Date.now();
  } catch {
    // Fire-and-forget — never block the UI on sync failure
  }
}

let syncTimer: ReturnType<typeof setTimeout> | null = null;

function debouncedSync() {
  if (!useAuthStore.getState().isAuthenticated) return;
  if (isMerging) return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => syncToCloud(), 2000);
}

/**
 * Core sync orchestration hook.
 * Subscribes to store changes and debounces push calls.
 * Mount once in the root layout.
 */
export function useSyncEngine() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const unsubscribesRef = useRef<(() => void)[]>([]);

  useEffect(() => {
    if (!isAuthenticated) {
      // Clean up subscriptions if user logs out
      for (const unsub of unsubscribesRef.current) unsub();
      unsubscribesRef.current = [];
      lastPushAt = 0;
      return;
    }

    // Subscribe to store changes for background sync
    const unsubUI = useUIStore.subscribe(debouncedSync);
    const unsubBookmarks = useBookmarkStore.subscribe(debouncedSync);
    const unsubAudio = useAudioStore.subscribe(debouncedSync);

    unsubscribesRef.current = [unsubUI, unsubBookmarks, unsubAudio];

    return () => {
      for (const unsub of unsubscribesRef.current) unsub();
      unsubscribesRef.current = [];
      if (syncTimer) {
        clearTimeout(syncTimer);
        syncTimer = null;
      }
    };
  }, [isAuthenticated]);
}

// Exported for testing
export { collectPayload, syncToCloud, debouncedSync };
