import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { SURAH_COUNT } from 'quran-data';

import { mmkvStorage } from '@/services/mmkv';
import { audioDownloadService } from '@/services/audio-download';

type DownloadStatus = 'none' | 'downloading' | 'downloaded';

interface DownloadState {
  // Persisted state
  downloads: Record<string, DownloadStatus>;
  // Transient state
  downloadProgress: Record<string, number>;
  activeDownloads: string[];
  storageUsageBytes: Record<string, number>;
  // Actions
  startDownload: (
    reciterId: string,
    surahNumber: number,
  ) => Promise<void>;
  downloadAllForReciter: (reciterId: string) => Promise<void>;
  cancelDownload: (reciterId: string, surahNumber: number) => Promise<void>;
  cancelBatchDownload: () => void;
  deleteSurah: (reciterId: string, surahNumber: number) => Promise<void>;
  deleteReciter: (reciterId: string) => Promise<void>;
  markAsCached: (reciterId: string, surahNumber: number) => void;
  refreshStorageUsage: (reciterId: string) => Promise<void>;
  // Selectors
  isDownloaded: (reciterId: string, surahNumber: number) => boolean;
  getProgress: (reciterId: string, surahNumber: number) => number;
  getReciterDownloadCount: (reciterId: string) => number;
}

function makeKey(reciterId: string, surahNumber: number): string {
  return `${reciterId}/${surahNumber}`;
}

// Track active download resumables for cancel support
const activeResumables = new Map<
  string,
  { pauseAsync: () => Promise<void> }
>();

// Flag to cancel batch download-all operations
let batchCancelled = false;

// Throttle progress updates to avoid render thrashing (~10 updates/sec)
const PROGRESS_THROTTLE_MS = 100;
const lastProgressUpdate = new Map<string, number>();

export const useDownloadStore = create<DownloadState>()(
  persist(
    (set, get) => ({
      downloads: {},
      downloadProgress: {},
      activeDownloads: [],
      storageUsageBytes: {},

      startDownload: async (reciterId, surahNumber) => {
        const key = makeKey(reciterId, surahNumber);

        set((state) => ({
          downloads: { ...state.downloads, [key]: 'downloading' as const },
          activeDownloads: [...state.activeDownloads, key],
          downloadProgress: { ...state.downloadProgress, [key]: 0 },
        }));

        try {
          const handle = await audioDownloadService.downloadSurah(
            reciterId,
            surahNumber,
            (progress) => {
              const now = Date.now();
              const last = lastProgressUpdate.get(key) ?? 0;
              if (now - last < PROGRESS_THROTTLE_MS && progress < 1) return;
              lastProgressUpdate.set(key, now);
              set((state) => ({
                downloadProgress: {
                  ...state.downloadProgress,
                  [key]: progress,
                },
              }));
            },
          );

          if (handle) {
            // Store resumable BEFORE awaiting so cancelDownload can pause it
            activeResumables.set(key, handle);
            await handle.downloadPromise;
            activeResumables.delete(key);
          }

          lastProgressUpdate.delete(key);
          set((state) => {
            const { [key]: _, ...restProgress } = state.downloadProgress;
            return {
              downloads: { ...state.downloads, [key]: 'downloaded' as const },
              activeDownloads: state.activeDownloads.filter((k) => k !== key),
              downloadProgress: restProgress,
            };
          });
        } catch {
          activeResumables.delete(key);
          lastProgressUpdate.delete(key);
          set((state) => {
            const { [key]: _, ...restProgress } = state.downloadProgress;
            return {
              downloads: { ...state.downloads, [key]: 'none' as const },
              activeDownloads: state.activeDownloads.filter((k) => k !== key),
              downloadProgress: restProgress,
            };
          });
        }
      },

      downloadAllForReciter: async (reciterId) => {
        const CONCURRENCY = 3;
        const surahs = Array.from({ length: SURAH_COUNT }, (_, i) => i + 1);

        const toDownload = surahs.filter(
          (s) => get().downloads[makeKey(reciterId, s)] !== 'downloaded',
        );

        batchCancelled = false;

        for (let i = 0; i < toDownload.length; i += CONCURRENCY) {
          if (batchCancelled) break;
          const batch = toDownload.slice(i, i + CONCURRENCY);
          await Promise.all(
            batch.map((surah) => get().startDownload(reciterId, surah)),
          );
        }
      },

      cancelDownload: async (reciterId, surahNumber) => {
        const key = makeKey(reciterId, surahNumber);
        const resumable = activeResumables.get(key);
        if (resumable) {
          await resumable.pauseAsync();
          activeResumables.delete(key);
        }
        // Clean up partial file left by paused download
        await audioDownloadService.deleteSurah(reciterId, surahNumber);

        set((state) => {
          const { [key]: _, ...restProgress } = state.downloadProgress;
          return {
            downloads: { ...state.downloads, [key]: 'none' as const },
            activeDownloads: state.activeDownloads.filter((k) => k !== key),
            downloadProgress: restProgress,
          };
        });
      },

      cancelBatchDownload: () => {
        batchCancelled = true;
        // Cancel all currently in-flight downloads
        for (const key of [...get().activeDownloads]) {
          const [rid, sNum] = key.split('/');
          get().cancelDownload(rid, Number(sNum));
        }
      },

      deleteSurah: async (reciterId, surahNumber) => {
        const key = makeKey(reciterId, surahNumber);
        await audioDownloadService.deleteSurah(reciterId, surahNumber);
        set((state) => ({
          downloads: { ...state.downloads, [key]: 'none' as const },
        }));
      },

      deleteReciter: async (reciterId) => {
        await audioDownloadService.deleteReciter(reciterId);
        set((state) => {
          const downloads = { ...state.downloads };
          for (const key of Object.keys(downloads)) {
            if (key.startsWith(`${reciterId}/`)) {
              delete downloads[key];
            }
          }
          const { [reciterId]: _, ...restStorage } = state.storageUsageBytes;
          return { downloads, storageUsageBytes: restStorage };
        });
      },

      markAsCached: (reciterId, surahNumber) => {
        const key = makeKey(reciterId, surahNumber);
        set((state) => ({
          downloads: { ...state.downloads, [key]: 'downloaded' as const },
        }));
      },

      refreshStorageUsage: async (reciterId) => {
        const bytes = await audioDownloadService.getStorageUsage(reciterId);
        set((state) => ({
          storageUsageBytes: { ...state.storageUsageBytes, [reciterId]: bytes },
        }));
      },

      isDownloaded: (reciterId, surahNumber) => {
        return (
          get().downloads[makeKey(reciterId, surahNumber)] === 'downloaded'
        );
      },

      getProgress: (reciterId, surahNumber) => {
        return get().downloadProgress[makeKey(reciterId, surahNumber)] ?? 0;
      },

      getReciterDownloadCount: (reciterId) => {
        return Object.entries(get().downloads).filter(
          ([key, status]) =>
            key.startsWith(`${reciterId}/`) && status === 'downloaded',
        ).length;
      },
    }),
    {
      name: 'download-state',
      storage: createJSONStorage(() => mmkvStorage),
      partialize: (state) => ({
        downloads: state.downloads,
      }),
    },
  ),
);
