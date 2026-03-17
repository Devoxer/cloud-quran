const mockDownloadSurah = jest.fn();
const mockDeleteSurah = jest.fn();
const mockDeleteReciter = jest.fn();
const mockIsDownloaded = jest.fn();
const mockGetStorageUsage = jest.fn();

jest.mock('@/services/audio-download', () => ({
  audioDownloadService: {
    downloadSurah: (...args: unknown[]) => mockDownloadSurah(...args),
    deleteSurah: (...args: unknown[]) => mockDeleteSurah(...args),
    deleteReciter: (...args: unknown[]) => mockDeleteReciter(...args),
    isDownloaded: (...args: unknown[]) => mockIsDownloaded(...args),
    cacheStreamedAudio: jest.fn().mockResolvedValue(undefined),
    getLocalAudioUri: jest.fn().mockResolvedValue(null),
    ensureDirectoryExists: jest.fn().mockResolvedValue(undefined),
    getStorageUsage: (...args: unknown[]) => mockGetStorageUsage(...args),
  },
}));

jest.mock('@/services/mmkv', () => ({
  mmkvStorage: {
    setItem: jest.fn(),
    getItem: jest.fn(() => null),
    removeItem: jest.fn(),
  },
}));

import { useDownloadStore } from './useDownloadStore';

function resetStore() {
  useDownloadStore.setState({
    downloads: {},
    downloadProgress: {},
    activeDownloads: [],
    storageUsageBytes: {},
  });
}

describe('useDownloadStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStore();
  });

  describe('initial state', () => {
    it('has correct defaults', () => {
      const state = useDownloadStore.getState();
      expect(state.downloads).toEqual({});
      expect(state.downloadProgress).toEqual({});
      expect(state.activeDownloads).toEqual([]);
      expect(state.storageUsageBytes).toEqual({});
    });
  });

  describe('startDownload', () => {
    it('downloads surah and updates state to downloaded on success', async () => {
      mockDownloadSurah.mockImplementation(
        (_rid: string, _s: number, onProgress?: (p: number) => void) => {
          onProgress?.(0.5);
          onProgress?.(1.0);
          return Promise.resolve({
            downloadPromise: Promise.resolve(),
            pauseAsync: jest.fn(),
          });
        },
      );

      await useDownloadStore.getState().startDownload('alafasy', 1);

      const state = useDownloadStore.getState();
      expect(state.downloads['alafasy/1']).toBe('downloaded');
      expect(state.activeDownloads).not.toContain('alafasy/1');
    });

    it('sets downloading state during download', async () => {
      let resolveDownloadPromise: () => void;
      mockDownloadSurah.mockImplementation(() => {
        const downloadPromise = new Promise<void>((resolve) => {
          resolveDownloadPromise = resolve;
        });
        return Promise.resolve({
          downloadPromise,
          pauseAsync: jest.fn(),
        });
      });

      const downloadPromise = useDownloadStore.getState().startDownload('alafasy', 1);

      // Wait for downloadSurah to resolve (returns handle)
      await Promise.resolve();
      await Promise.resolve();

      // Check intermediate state — handle returned but downloadPromise pending
      const midState = useDownloadStore.getState();
      expect(midState.downloads['alafasy/1']).toBe('downloading');
      expect(midState.activeDownloads).toContain('alafasy/1');

      resolveDownloadPromise!();
      await downloadPromise;

      const finalState = useDownloadStore.getState();
      expect(finalState.downloads['alafasy/1']).toBe('downloaded');
    });

    it('updates progress during download', async () => {
      let capturedOnProgress: (p: number) => void;
      mockDownloadSurah.mockImplementation(
        (_rid: string, _s: number, onProgress?: (p: number) => void) => {
          capturedOnProgress = onProgress!;
          return Promise.resolve({
            downloadPromise: Promise.resolve(),
            pauseAsync: jest.fn(),
          });
        },
      );

      const promise = useDownloadStore.getState().startDownload('alafasy', 1);
      capturedOnProgress!(0.5);
      expect(useDownloadStore.getState().downloadProgress['alafasy/1']).toBe(0.5);
      await promise;
    });

    it('reverts to none and cleans up progress on download failure', async () => {
      mockDownloadSurah.mockRejectedValue(new Error('Network error'));

      await useDownloadStore.getState().startDownload('alafasy', 1);

      const state = useDownloadStore.getState();
      expect(state.downloads['alafasy/1']).toBe('none');
      expect(state.activeDownloads).not.toContain('alafasy/1');
      expect(state.downloadProgress['alafasy/1']).toBeUndefined();
    });
  });

  describe('downloadAllForReciter', () => {
    it('downloads all 114 surahs sequentially in batches', async () => {
      mockDownloadSurah.mockResolvedValue({
        downloadPromise: Promise.resolve(),
        pauseAsync: jest.fn(),
      });

      await useDownloadStore.getState().downloadAllForReciter('alafasy');

      // All 114 surahs should have been requested
      expect(mockDownloadSurah).toHaveBeenCalledTimes(114);
    });

    it('skips already downloaded surahs', async () => {
      mockDownloadSurah.mockResolvedValue({
        downloadPromise: Promise.resolve(),
        pauseAsync: jest.fn(),
      });

      useDownloadStore.setState({
        downloads: { 'alafasy/1': 'downloaded', 'alafasy/2': 'downloaded' },
      });

      await useDownloadStore.getState().downloadAllForReciter('alafasy');

      // 114 - 2 already downloaded = 112 downloads
      expect(mockDownloadSurah).toHaveBeenCalledTimes(112);
    });
  });

  describe('cancelDownload', () => {
    it('cancels active download, cleans up partial file, and resets state', async () => {
      const mockPause = jest.fn().mockResolvedValue(undefined);
      mockDeleteSurah.mockResolvedValue(undefined);
      let resolveDownload: () => void;
      mockDownloadSurah.mockImplementation(() => {
        const downloadPromise = new Promise<void>((resolve) => {
          resolveDownload = resolve;
        });
        return Promise.resolve({ downloadPromise, pauseAsync: mockPause });
      });

      // Start a download — handle is stored before download completes
      const downloadPromise = useDownloadStore.getState().startDownload('alafasy', 1);

      // Wait for downloadSurah to resolve (returns handle)
      await Promise.resolve();
      await Promise.resolve();

      // Cancel while download is still in progress
      await useDownloadStore.getState().cancelDownload('alafasy', 1);
      expect(mockPause).toHaveBeenCalled();
      expect(mockDeleteSurah).toHaveBeenCalledWith('alafasy', 1);

      const state = useDownloadStore.getState();
      expect(state.downloads['alafasy/1']).toBe('none');
      expect(state.activeDownloads).not.toContain('alafasy/1');

      // Clean up the pending promise
      resolveDownload!();
      await downloadPromise.catch(() => {});
    });
  });

  describe('deleteSurah', () => {
    it('deletes file and updates state', async () => {
      mockDeleteSurah.mockResolvedValue(undefined);
      useDownloadStore.setState({
        downloads: { 'alafasy/1': 'downloaded' },
      });

      await useDownloadStore.getState().deleteSurah('alafasy', 1);

      expect(mockDeleteSurah).toHaveBeenCalledWith('alafasy', 1);
      expect(useDownloadStore.getState().downloads['alafasy/1']).toBe('none');
    });
  });

  describe('deleteReciter', () => {
    it('deletes all files and clears state for reciter', async () => {
      mockDeleteReciter.mockResolvedValue(undefined);
      useDownloadStore.setState({
        downloads: {
          'alafasy/1': 'downloaded',
          'alafasy/2': 'downloaded',
          'sudais/1': 'downloaded',
        },
        storageUsageBytes: { alafasy: 50_000_000, sudais: 30_000_000 },
      });

      await useDownloadStore.getState().deleteReciter('alafasy');

      expect(mockDeleteReciter).toHaveBeenCalledWith('alafasy');
      const state = useDownloadStore.getState();
      expect(state.downloads['alafasy/1']).toBeUndefined();
      expect(state.downloads['alafasy/2']).toBeUndefined();
      expect(state.downloads['sudais/1']).toBe('downloaded');
      expect(state.storageUsageBytes['alafasy']).toBeUndefined();
      expect(state.storageUsageBytes['sudais']).toBe(30_000_000);
    });
  });

  describe('markAsCached', () => {
    it('marks surah as downloaded', () => {
      useDownloadStore.getState().markAsCached('alafasy', 1);
      expect(useDownloadStore.getState().downloads['alafasy/1']).toBe('downloaded');
    });
  });

  describe('refreshStorageUsage', () => {
    it('fetches and stores storage usage for a reciter', async () => {
      mockGetStorageUsage.mockResolvedValue(52_428_800); // 50 MB

      await useDownloadStore.getState().refreshStorageUsage('alafasy');

      expect(mockGetStorageUsage).toHaveBeenCalledWith('alafasy');
      expect(useDownloadStore.getState().storageUsageBytes['alafasy']).toBe(52_428_800);
    });

    it('updates storage for different reciters independently', async () => {
      mockGetStorageUsage.mockResolvedValueOnce(50_000_000).mockResolvedValueOnce(30_000_000);

      await useDownloadStore.getState().refreshStorageUsage('alafasy');
      await useDownloadStore.getState().refreshStorageUsage('sudais');

      const state = useDownloadStore.getState();
      expect(state.storageUsageBytes['alafasy']).toBe(50_000_000);
      expect(state.storageUsageBytes['sudais']).toBe(30_000_000);
    });
  });

  describe('selectors', () => {
    it('isDownloaded returns true for downloaded surah', () => {
      useDownloadStore.setState({
        downloads: { 'alafasy/1': 'downloaded' },
      });
      expect(useDownloadStore.getState().isDownloaded('alafasy', 1)).toBe(true);
    });

    it('isDownloaded returns false for non-downloaded surah', () => {
      expect(useDownloadStore.getState().isDownloaded('alafasy', 1)).toBe(false);
    });

    it('getProgress returns progress value', () => {
      useDownloadStore.setState({
        downloadProgress: { 'alafasy/1': 0.75 },
      });
      expect(useDownloadStore.getState().getProgress('alafasy', 1)).toBe(0.75);
    });

    it('getProgress returns 0 when no progress tracked', () => {
      expect(useDownloadStore.getState().getProgress('alafasy', 1)).toBe(0);
    });

    it('getReciterDownloadCount returns count of downloaded surahs', () => {
      useDownloadStore.setState({
        downloads: {
          'alafasy/1': 'downloaded',
          'alafasy/2': 'downloaded',
          'alafasy/3': 'downloading',
          'sudais/1': 'downloaded',
        },
      });
      expect(useDownloadStore.getState().getReciterDownloadCount('alafasy')).toBe(2);
    });
  });
});
