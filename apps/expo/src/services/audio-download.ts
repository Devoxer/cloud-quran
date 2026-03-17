import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

import { buildAudioUrl } from '@/features/audio/utils/audioUrlBuilder';

const AUDIO_DIR = `${FileSystem.documentDirectory}audio/`;

function getReciterDir(reciterId: string): string {
  return `${AUDIO_DIR}${reciterId}/`;
}

function getAudioPath(reciterId: string, surahNumber: number): string {
  const padded = String(surahNumber).padStart(3, '0');
  return `${AUDIO_DIR}${reciterId}/${padded}.mp3`;
}

class AudioDownloadService {
  async ensureDirectoryExists(reciterId: string): Promise<void> {
    if (Platform.OS === 'web') return;
    await FileSystem.makeDirectoryAsync(getReciterDir(reciterId), {
      intermediates: true,
    });
  }

  async isDownloaded(reciterId: string, surahNumber: number): Promise<boolean> {
    if (Platform.OS === 'web') return false;
    const info = await FileSystem.getInfoAsync(getAudioPath(reciterId, surahNumber));
    return info.exists;
  }

  async getLocalAudioUri(reciterId: string, surahNumber: number): Promise<string | null> {
    if (Platform.OS === 'web') return null;
    const path = getAudioPath(reciterId, surahNumber);
    const info = await FileSystem.getInfoAsync(path);
    return info.exists ? path : null;
  }

  async downloadSurah(
    reciterId: string,
    surahNumber: number,
    onProgress?: (progress: number) => void,
  ): Promise<{
    downloadPromise: Promise<void>;
    pauseAsync: () => Promise<void>;
  } | null> {
    if (Platform.OS === 'web') return null;

    await this.ensureDirectoryExists(reciterId);

    const remoteUrl = buildAudioUrl(reciterId, surahNumber);
    const localPath = getAudioPath(reciterId, surahNumber);

    const resumable = FileSystem.createDownloadResumable(remoteUrl, localPath, {}, (progress) => {
      if (onProgress && progress.totalBytesExpectedToWrite > 0) {
        onProgress(progress.totalBytesWritten / progress.totalBytesExpectedToWrite);
      }
    });

    // Return handle immediately so caller can track/cancel before download completes
    const downloadPromise = resumable.downloadAsync().then(() => {});

    return {
      downloadPromise,
      pauseAsync: async () => {
        await resumable.pauseAsync();
      },
    };
  }

  async deleteSurah(reciterId: string, surahNumber: number): Promise<void> {
    if (Platform.OS === 'web') return;
    await FileSystem.deleteAsync(getAudioPath(reciterId, surahNumber), {
      idempotent: true,
    });
  }

  async deleteReciter(reciterId: string): Promise<void> {
    if (Platform.OS === 'web') return;
    await FileSystem.deleteAsync(getReciterDir(reciterId), {
      idempotent: true,
    });
  }

  async getStorageUsage(reciterId?: string): Promise<number> {
    if (Platform.OS === 'web') return 0;

    if (reciterId) {
      // Single reciter: read files directly
      const dir = getReciterDir(reciterId);
      const dirInfo = await FileSystem.getInfoAsync(dir);
      if (!dirInfo.exists) return 0;

      const files = await FileSystem.readDirectoryAsync(dir);
      let total = 0;
      for (const file of files) {
        const info = await FileSystem.getInfoAsync(`${dir}${file}`);
        if (info.exists && 'size' in info) {
          total += info.size as number;
        }
      }
      return total;
    }

    // Global usage: recurse into each reciter subdirectory
    const dirInfo = await FileSystem.getInfoAsync(AUDIO_DIR);
    if (!dirInfo.exists) return 0;

    const reciters = await FileSystem.readDirectoryAsync(AUDIO_DIR);
    let total = 0;
    for (const rid of reciters) {
      total += await this.getStorageUsage(rid);
    }
    return total;
  }

  async cacheStreamedAudio(reciterId: string, surahNumber: number): Promise<void> {
    if (Platform.OS === 'web') return;

    // Skip if already cached/downloaded
    const exists = await this.isDownloaded(reciterId, surahNumber);
    if (exists) return;

    // Re-download from CDN edge (likely cached) to persistent storage
    const handle = await this.downloadSurah(reciterId, surahNumber);
    if (handle) {
      await handle.downloadPromise;
    }
  }
}

export const audioDownloadService = new AudioDownloadService();
