import { Platform } from 'react-native';

const mockGetInfoAsync = jest.fn();
const mockMakeDirectoryAsync = jest.fn();
const mockDeleteAsync = jest.fn();
const mockReadDirectoryAsync = jest.fn();
const mockDownloadAsync = jest.fn();
const mockPauseAsync = jest.fn();
const mockCreateDownloadResumable = jest.fn();

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///mock-docs/',
  getInfoAsync: (...args: unknown[]) => mockGetInfoAsync(...args),
  makeDirectoryAsync: (...args: unknown[]) => mockMakeDirectoryAsync(...args),
  deleteAsync: (...args: unknown[]) => mockDeleteAsync(...args),
  readDirectoryAsync: (...args: unknown[]) => mockReadDirectoryAsync(...args),
  createDownloadResumable: (...args: unknown[]) => mockCreateDownloadResumable(...args),
}));

// Must import after mock setup
import { audioDownloadService } from './audio-download';

describe('AudioDownloadService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMakeDirectoryAsync.mockResolvedValue(undefined);
  });

  describe('ensureDirectoryExists', () => {
    it('creates reciter directory with intermediates', async () => {
      await audioDownloadService.ensureDirectoryExists('alafasy');
      expect(mockMakeDirectoryAsync).toHaveBeenCalledWith('file:///mock-docs/audio/alafasy/', {
        intermediates: true,
      });
    });
  });

  describe('isDownloaded', () => {
    it('returns true when file exists', async () => {
      mockGetInfoAsync.mockResolvedValue({ exists: true, size: 1024 });
      const result = await audioDownloadService.isDownloaded('alafasy', 1);
      expect(result).toBe(true);
      expect(mockGetInfoAsync).toHaveBeenCalledWith('file:///mock-docs/audio/alafasy/001.mp3');
    });

    it('returns false when file does not exist', async () => {
      mockGetInfoAsync.mockResolvedValue({ exists: false });
      const result = await audioDownloadService.isDownloaded('alafasy', 1);
      expect(result).toBe(false);
    });

    it('returns false on web platform', async () => {
      const origPlatform = Platform.OS;
      (Platform as any).OS = 'web';
      try {
        const result = await audioDownloadService.isDownloaded('alafasy', 1);
        expect(result).toBe(false);
        expect(mockGetInfoAsync).not.toHaveBeenCalled();
      } finally {
        (Platform as any).OS = origPlatform;
      }
    });
  });

  describe('getLocalAudioUri', () => {
    it('returns local URI when file exists', async () => {
      mockGetInfoAsync.mockResolvedValue({ exists: true });
      const uri = await audioDownloadService.getLocalAudioUri('alafasy', 1);
      expect(uri).toBe('file:///mock-docs/audio/alafasy/001.mp3');
    });

    it('returns null when file does not exist', async () => {
      mockGetInfoAsync.mockResolvedValue({ exists: false });
      const uri = await audioDownloadService.getLocalAudioUri('alafasy', 1);
      expect(uri).toBeNull();
    });

    it('returns null on web platform', async () => {
      const origPlatform = Platform.OS;
      (Platform as any).OS = 'web';
      try {
        const uri = await audioDownloadService.getLocalAudioUri('alafasy', 1);
        expect(uri).toBeNull();
      } finally {
        (Platform as any).OS = origPlatform;
      }
    });
  });

  describe('downloadSurah', () => {
    it('downloads file to correct path with progress callback', async () => {
      const onProgress = jest.fn();
      const mockResumable = {
        downloadAsync: mockDownloadAsync.mockResolvedValue({
          uri: 'file:///mock-docs/audio/alafasy/001.mp3',
        }),
        pauseAsync: mockPauseAsync,
      };
      mockCreateDownloadResumable.mockReturnValue(mockResumable);

      const handle = await audioDownloadService.downloadSurah('alafasy', 1, onProgress);
      await handle!.downloadPromise;

      expect(mockMakeDirectoryAsync).toHaveBeenCalled();
      expect(mockCreateDownloadResumable).toHaveBeenCalledWith(
        'https://cdn.nobleachievements.com/audio/alafasy/001.mp3',
        'file:///mock-docs/audio/alafasy/001.mp3',
        {},
        expect.any(Function),
      );
      expect(mockDownloadAsync).toHaveBeenCalled();
    });

    it('calls onProgress callback during download', async () => {
      const onProgress = jest.fn();
      let capturedCallback: (p: {
        totalBytesWritten: number;
        totalBytesExpectedToWrite: number;
      }) => void;
      mockCreateDownloadResumable.mockImplementation(
        (
          _url: string,
          _path: string,
          _opts: object,
          cb: (p: { totalBytesWritten: number; totalBytesExpectedToWrite: number }) => void,
        ) => {
          capturedCallback = cb;
          return {
            downloadAsync: jest.fn().mockImplementation(async () => {
              capturedCallback({ totalBytesWritten: 50, totalBytesExpectedToWrite: 100 });
              return { uri: 'file:///mock-docs/audio/alafasy/001.mp3' };
            }),
            pauseAsync: jest.fn(),
          };
        },
      );

      const handle = await audioDownloadService.downloadSurah('alafasy', 1, onProgress);
      await handle!.downloadPromise;
      expect(onProgress).toHaveBeenCalledWith(0.5);
    });

    it('returns handle with downloadPromise and pauseAsync for cancel support', async () => {
      const mockResumable = {
        downloadAsync: mockDownloadAsync.mockResolvedValue({ uri: 'test' }),
        pauseAsync: mockPauseAsync,
      };
      mockCreateDownloadResumable.mockReturnValue(mockResumable);

      const handle = await audioDownloadService.downloadSurah('alafasy', 1);
      expect(handle).toBeDefined();
      expect(handle!.downloadPromise).toBeDefined();
      expect(handle!.pauseAsync).toBeDefined();
      // pauseAsync can be called before download completes
      await handle!.pauseAsync();
      expect(mockPauseAsync).toHaveBeenCalled();
    });

    it('is no-op on web platform', async () => {
      const origPlatform = Platform.OS;
      (Platform as any).OS = 'web';
      try {
        const result = await audioDownloadService.downloadSurah('alafasy', 1);
        expect(result).toBeNull();
        expect(mockCreateDownloadResumable).not.toHaveBeenCalled();
      } finally {
        (Platform as any).OS = origPlatform;
      }
    });
  });

  describe('deleteSurah', () => {
    it('deletes the local audio file', async () => {
      await audioDownloadService.deleteSurah('alafasy', 1);
      expect(mockDeleteAsync).toHaveBeenCalledWith('file:///mock-docs/audio/alafasy/001.mp3', {
        idempotent: true,
      });
    });

    it('is no-op on web platform', async () => {
      const origPlatform = Platform.OS;
      (Platform as any).OS = 'web';
      try {
        await audioDownloadService.deleteSurah('alafasy', 1);
        expect(mockDeleteAsync).not.toHaveBeenCalled();
      } finally {
        (Platform as any).OS = origPlatform;
      }
    });
  });

  describe('deleteReciter', () => {
    it('deletes the entire reciter directory', async () => {
      await audioDownloadService.deleteReciter('alafasy');
      expect(mockDeleteAsync).toHaveBeenCalledWith('file:///mock-docs/audio/alafasy/', {
        idempotent: true,
      });
    });
  });

  describe('getStorageUsage', () => {
    it('calculates total size for a specific reciter', async () => {
      mockGetInfoAsync
        .mockResolvedValueOnce({ exists: true, isDirectory: true }) // dir check
        .mockResolvedValueOnce({ exists: true, size: 1000 })
        .mockResolvedValueOnce({ exists: true, size: 2000 });
      mockReadDirectoryAsync.mockResolvedValue(['001.mp3', '002.mp3']);

      const size = await audioDownloadService.getStorageUsage('alafasy');
      expect(size).toBe(3000);
    });

    it('returns 0 when directory does not exist', async () => {
      mockGetInfoAsync.mockResolvedValue({ exists: false });
      const size = await audioDownloadService.getStorageUsage('alafasy');
      expect(size).toBe(0);
    });

    it('returns 0 on web platform', async () => {
      const origPlatform = Platform.OS;
      (Platform as any).OS = 'web';
      try {
        const size = await audioDownloadService.getStorageUsage('alafasy');
        expect(size).toBe(0);
      } finally {
        (Platform as any).OS = origPlatform;
      }
    });

    it('calculates global storage by recursing into reciter subdirectories', async () => {
      // Global audio dir exists and contains two reciter subdirectories
      mockGetInfoAsync
        .mockResolvedValueOnce({ exists: true, isDirectory: true }) // AUDIO_DIR check
        .mockResolvedValueOnce({ exists: true, isDirectory: true }) // alafasy dir check
        .mockResolvedValueOnce({ exists: true, size: 1000 }) // alafasy/001.mp3
        .mockResolvedValueOnce({ exists: true, isDirectory: true }) // sudais dir check
        .mockResolvedValueOnce({ exists: true, size: 2000 }); // sudais/001.mp3

      mockReadDirectoryAsync
        .mockResolvedValueOnce(['alafasy', 'sudais']) // AUDIO_DIR contents
        .mockResolvedValueOnce(['001.mp3']) // alafasy contents
        .mockResolvedValueOnce(['001.mp3']); // sudais contents

      const size = await audioDownloadService.getStorageUsage();
      expect(size).toBe(3000);
    });
  });

  describe('cacheStreamedAudio', () => {
    it('downloads the file to persistent storage for caching', async () => {
      mockGetInfoAsync.mockResolvedValue({ exists: false });
      const mockResumable = {
        downloadAsync: mockDownloadAsync.mockResolvedValue({
          uri: 'file:///mock-docs/audio/alafasy/001.mp3',
        }),
        pauseAsync: mockPauseAsync,
      };
      mockCreateDownloadResumable.mockReturnValue(mockResumable);

      await audioDownloadService.cacheStreamedAudio('alafasy', 1);

      expect(mockCreateDownloadResumable).toHaveBeenCalled();
    });

    it('skips caching if file already exists', async () => {
      mockGetInfoAsync.mockResolvedValue({ exists: true });
      await audioDownloadService.cacheStreamedAudio('alafasy', 1);
      expect(mockCreateDownloadResumable).not.toHaveBeenCalled();
    });

    it('is no-op on web platform', async () => {
      const origPlatform = Platform.OS;
      (Platform as any).OS = 'web';
      try {
        await audioDownloadService.cacheStreamedAudio('alafasy', 1);
        expect(mockCreateDownloadResumable).not.toHaveBeenCalled();
      } finally {
        (Platform as any).OS = origPlatform;
      }
    });
  });

  describe('path construction', () => {
    it('pads surah numbers correctly', async () => {
      mockGetInfoAsync.mockResolvedValue({ exists: false });
      await audioDownloadService.getLocalAudioUri('alafasy', 7);
      expect(mockGetInfoAsync).toHaveBeenCalledWith('file:///mock-docs/audio/alafasy/007.mp3');
    });

    it('handles three-digit surah numbers', async () => {
      mockGetInfoAsync.mockResolvedValue({ exists: false });
      await audioDownloadService.getLocalAudioUri('alafasy', 114);
      expect(mockGetInfoAsync).toHaveBeenCalledWith('file:///mock-docs/audio/alafasy/114.mp3');
    });
  });
});
