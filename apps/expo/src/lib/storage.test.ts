/**
 * Storage Helper Tests
 *
 * Story 11.1: Create Offline Books Schema and Storage Helpers
 * Epic 11: Offline Access
 *
 * Tests for expo-file-system storage helpers.
 * All file system operations are mocked.
 */

import * as FileSystem from 'expo-file-system/legacy';
import {
  audioExtFromUrl,
  deleteOfflineBook,
  deleteOfflineBookLanguage,
  ensureOfflineDir,
  findOfflineAudioPath,
  findOfflineCoverPath,
  getDownloadedBookIds,
  getOfflineAudioPath,
  getOfflineCoverPath,
  getOfflineDir,
  getOfflineMetaPath,
  getOfflineTextPath,
  getOfflineVoiceDataPath,
  imageExtFromUrl,
  isBookDownloaded,
  isSectionDownloaded,
  loadBookMeta,
  loadOfflineText,
  loadOfflineVoiceData,
  OFFLINE_DIR,
  resolveOfflineBookMeta,
  saveBookMeta,
  saveCoverImage,
} from './storage';

// Mock expo-file-system/legacy
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: '/mock/documents/',
  getInfoAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
  readDirectoryAsync: jest.fn(),
  deleteAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
  createDownloadResumable: jest.fn(),
}));

// Mock react-native Platform (default: native)
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

describe('storage helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('OFFLINE_DIR constant', () => {
    it('uses documentDirectory as base', () => {
      expect(OFFLINE_DIR).toBe('/mock/documents/offline/');
    });
  });

  describe('getOfflineDir', () => {
    it('returns correct path for book', () => {
      const result = getOfflineDir('book-123');
      expect(result).toBe('/mock/documents/offline/book-123/');
    });

    it('handles special characters in book ID', () => {
      const result = getOfflineDir('book-with-dashes-123');
      expect(result).toBe('/mock/documents/offline/book-with-dashes-123/');
    });
  });

  describe('getOfflineAudioPath (per-voice — Story 22.12)', () => {
    it('returns a per-voice path for an audio file', () => {
      expect(getOfflineAudioPath('book-123', 'summaryBrief', 'en', 'en_f')).toBe(
        '/mock/documents/offline/book-123/summaryBrief_en_en_f.mp3'
      );
    });

    it('handles different section types + voices', () => {
      expect(getOfflineAudioPath('book-123', 'aboutBook', 'en', 'en_m')).toBe(
        '/mock/documents/offline/book-123/aboutBook_en_en_m.mp3'
      );
      expect(getOfflineAudioPath('book-123', 'keyTakeaways', 'en', 'en_f', 'wav')).toBe(
        '/mock/documents/offline/book-123/keyTakeaways_en_en_f.wav'
      );
    });
  });

  describe('getOfflineTextPath / getOfflineVoiceDataPath (Story 22.12 split)', () => {
    it('text path is voice-independent', () => {
      expect(getOfflineTextPath('book-123', 'summaryBrief', 'en')).toBe(
        '/mock/documents/offline/book-123/summaryBrief_en.json'
      );
    });

    it('voice-data path is per-voice', () => {
      expect(getOfflineVoiceDataPath('book-123', 'summaryBrief', 'en', 'en_f')).toBe(
        '/mock/documents/offline/book-123/summaryBrief_en_en_f.blocks.json'
      );
    });
  });

  describe('ensureOfflineDir', () => {
    it('creates directory if not exists', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: false });

      await ensureOfflineDir('book-123');

      expect(FileSystem.makeDirectoryAsync).toHaveBeenCalledWith(
        '/mock/documents/offline/book-123/',
        { intermediates: true }
      );
    });

    it('skips creation if directory exists', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });

      await ensureOfflineDir('book-123');

      expect(FileSystem.makeDirectoryAsync).not.toHaveBeenCalled();
    });
  });

  describe('isBookDownloaded', () => {
    it('returns true if audio files exist', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
      (FileSystem.readDirectoryAsync as jest.Mock).mockResolvedValue([
        'summaryBrief_en_en_f.mp3',
        'summaryBrief_en.json',
      ]);

      const result = await isBookDownloaded('book-123', 'en');
      expect(result).toBe(true);
    });

    it('returns false if directory does not exist', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: false });

      const result = await isBookDownloaded('book-123', 'en');
      expect(result).toBe(false);
    });

    it('returns false if no audio files exist', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
      (FileSystem.readDirectoryAsync as jest.Mock).mockResolvedValue([
        'summaryBrief_en.json', // Only JSON, no MP3
      ]);

      const result = await isBookDownloaded('book-123', 'en');
      expect(result).toBe(false);
    });

    it('returns false for empty directory', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
      (FileSystem.readDirectoryAsync as jest.Mock).mockResolvedValue([]);

      const result = await isBookDownloaded('book-123', 'en');
      expect(result).toBe(false);
    });
  });

  describe('audioExtFromUrl', () => {
    it('extracts the extension from a signed URL (strips query/fragment)', () => {
      expect(audioExtFromUrl('https://r2.example.com/audio/book/summaryBrief.wav?sig=abc')).toBe(
        'wav'
      );
      expect(audioExtFromUrl('https://r2.example.com/x/aboutBook.mp3#frag')).toBe('mp3');
    });

    it('defaults to mp3 for an unknown / extension-less URL', () => {
      expect(audioExtFromUrl('https://r2.example.com/audio/no-extension')).toBe('mp3');
      expect(audioExtFromUrl('not a url')).toBe('mp3');
    });
  });

  describe('findOfflineAudioPath (per-voice — Story 22.12)', () => {
    it('resolves a .wav file for the (section, voice), not just .mp3', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
      (FileSystem.readDirectoryAsync as jest.Mock).mockResolvedValue([
        'summaryBrief_en_en_f.wav',
        'summaryBrief_en.json',
      ]);

      const result = await findOfflineAudioPath('book-123', 'summaryBrief', 'en', 'en_f');
      expect(result).toBe('/mock/documents/offline/book-123/summaryBrief_en_en_f.wav');
    });

    it("does NOT return a DIFFERENT voice's audio", async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
      (FileSystem.readDirectoryAsync as jest.Mock).mockResolvedValue([
        'summaryBrief_en_en_m.wav', // only Miles downloaded
      ]);
      expect(await findOfflineAudioPath('book-123', 'summaryBrief', 'en', 'en_f')).toBeNull();
    });
  });

  describe('isSectionDownloaded (per-voice — Story 22.12)', () => {
    it('returns true when the voice audio AND its blocks data both exist', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
      (FileSystem.readDirectoryAsync as jest.Mock).mockResolvedValue([
        'summaryBrief_en_en_f.wav',
        'summaryBrief_en_en_f.blocks.json',
      ]);

      expect(await isSectionDownloaded('book-123', 'summaryBrief', 'en', 'en_f')).toBe(true);
    });

    it("returns false if the requested voice's audio is missing", async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
      (FileSystem.readDirectoryAsync as jest.Mock).mockResolvedValue(['summaryBrief_en_en_m.wav']);

      expect(await isSectionDownloaded('book-123', 'summaryBrief', 'en', 'en_f')).toBe(false);
    });

    it('returns false for a half-written download (voice audio present, blocks data missing)', async () => {
      (FileSystem.readDirectoryAsync as jest.Mock).mockResolvedValue(['summaryBrief_en_en_f.wav']);
      // dir exists + audio resolves, but the per-voice blocks data does not
      (FileSystem.getInfoAsync as jest.Mock).mockImplementation((path: string) =>
        Promise.resolve({ exists: !path.endsWith('.blocks.json') })
      );

      expect(await isSectionDownloaded('book-123', 'summaryBrief', 'en', 'en_f')).toBe(false);
    });
  });

  describe('language dimension (Story 20.6 AC-12 / § D4)', () => {
    // ⚠️ THE GUARD EVERYTHING ELSE RESTS ON. Two languages' files routinely share a book
    // directory (Story 24.27 — a switch deletes nothing; and "Delete all" is best-effort, so it
    // can fail partway). That is only tolerable because another language's file is UNRESOLVABLE,
    // not merely unlikely: every read builds the current language's exact filename and simply
    // doesn't find the other one.
    const BOTH_LANGUAGES_ON_DISK = [
      'summaryBrief_en_en_f.mp3',
      'summaryBrief_en_en_f.blocks.json',
      'summaryBrief_en.json',
      'meta_en.json',
      'summaryBrief_fr_fr_f.mp3',
      'summaryBrief_fr_fr_f.blocks.json',
      'summaryBrief_fr.json',
      'meta_fr.json',
    ];

    beforeEach(() => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
      (FileSystem.readDirectoryAsync as jest.Mock).mockResolvedValue(BOTH_LANGUAGES_ON_DISK);
    });

    it('every path builder puts the language in the name', () => {
      expect(getOfflineAudioPath('b', 'summaryBrief', 'fr', 'fr_f')).toBe(
        '/mock/documents/offline/b/summaryBrief_fr_fr_f.mp3'
      );
      expect(getOfflineVoiceDataPath('b', 'summaryBrief', 'fr', 'fr_f')).toBe(
        '/mock/documents/offline/b/summaryBrief_fr_fr_f.blocks.json'
      );
      expect(getOfflineTextPath('b', 'summaryBrief', 'fr')).toBe(
        '/mock/documents/offline/b/summaryBrief_fr.json'
      );
      expect(getOfflineMetaPath('b', 'fr')).toBe('/mock/documents/offline/b/meta_fr.json');
    });

    it('a file written under one language is NEVER resolvable under another', async () => {
      // Both languages are on disk, so this is the strongest form of the claim: the resolver must
      // pick by NAME, not "the only audio present".
      expect(await findOfflineAudioPath('b', 'summaryBrief', 'en', 'en_f')).toBe(
        '/mock/documents/offline/b/summaryBrief_en_en_f.mp3'
      );
      expect(await findOfflineAudioPath('b', 'summaryBrief', 'fr', 'fr_f')).toBe(
        '/mock/documents/offline/b/summaryBrief_fr_fr_f.mp3'
      );
      // Cross products resolve to NOTHING — neither language's file answers for the other, even
      // though a matching voice id exists on disk under the other language.
      expect(await findOfflineAudioPath('b', 'summaryBrief', 'fr', 'en_f')).toBeNull();
      expect(await findOfflineAudioPath('b', 'summaryBrief', 'en', 'fr_f')).toBeNull();
    });

    it('a leftover file from a FAILED sweep cannot be served to the new language', async () => {
      // The exact partial-teardown state: `en` survived the delete, the user is now on `fr`, and
      // `fr` was never downloaded. Nothing must resolve.
      (FileSystem.readDirectoryAsync as jest.Mock).mockResolvedValue([
        'summaryBrief_en_en_f.mp3',
        'summaryBrief_en_en_f.blocks.json',
      ]);

      expect(await findOfflineAudioPath('b', 'summaryBrief', 'fr', 'fr_f')).toBeNull();
      expect(await isSectionDownloaded('b', 'summaryBrief', 'fr', 'fr_f')).toBe(false);
      // AC-24: and the book is not COUNTED as downloaded in the new language either, so no
      // phantom entry reaches the offline list or the storage total.
      expect(await isBookDownloaded('b', 'fr')).toBe(false);
      expect(await isBookDownloaded('b', 'en')).toBe(true);
    });

    it('isSectionDownloaded requires the audio AND blocks of THAT language', async () => {
      expect(await isSectionDownloaded('b', 'summaryBrief', 'fr', 'fr_f')).toBe(true);
      expect(await isSectionDownloaded('b', 'summaryBrief', 'en', 'en_f')).toBe(true);
    });
  });

  describe('deleteOfflineBook', () => {
    it('deletes directory if it exists', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });

      await deleteOfflineBook('book-123');

      expect(FileSystem.deleteAsync).toHaveBeenCalledWith('/mock/documents/offline/book-123/', {
        idempotent: true,
      });
    });

    it('does nothing if directory does not exist', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: false });

      await deleteOfflineBook('book-123');

      expect(FileSystem.deleteAsync).not.toHaveBeenCalled();
    });
  });

  /**
   * ⚠️ Story 24.27 Step I — the delete a FAILED DOWNLOAD performs, as opposed to the one the user
   * asks for. Since AC-9 a switch keeps every language's downloads, so the two must differ: the
   * user's `deleteOfflineBook` is language-blind on purpose, while an automatic cleanup that took
   * the whole directory with it destroyed a completed download in another language, silently.
   */
  describe('deleteOfflineBookLanguage', () => {
    const dir = '/mock/documents/offline/book-123/';

    it('deletes ONLY that language’s files and keeps the other language’s intact', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
      (FileSystem.readDirectoryAsync as jest.Mock).mockResolvedValue([
        'summaryBrief_fr_fr_f.mp3',
        'summaryBrief_fr_fr_f.blocks.json',
        'summaryBrief_fr.json',
        'meta_fr.json',
        'summaryBrief_en_en_f.mp3', // ← the completed English download
        'meta_en.json',
        'cover.jpg', // ← language-blind, shared
      ]);

      await deleteOfflineBookLanguage('book-123', 'fr');

      const deleted = (FileSystem.deleteAsync as jest.Mock).mock.calls.map((c) => c[0]);
      expect(deleted).toEqual([
        `${dir}summaryBrief_fr_fr_f.mp3`,
        `${dir}summaryBrief_fr_fr_f.blocks.json`,
        `${dir}summaryBrief_fr.json`,
        `${dir}meta_fr.json`,
      ]);
      // The negative case is the whole point: neither the English files nor the directory itself.
      expect(deleted).not.toContain(`${dir}summaryBrief_en_en_f.mp3`);
      expect(deleted).not.toContain(`${dir}meta_en.json`);
      expect(deleted).not.toContain(dir);
    });

    it('removes the directory when no other language’s files remain', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
      (FileSystem.readDirectoryAsync as jest.Mock)
        .mockResolvedValueOnce(['summaryBrief_fr_fr_f.mp3', 'cover.jpg'])
        .mockResolvedValueOnce(['cover.jpg']); // after the language delete: only the shared cover

      await deleteOfflineBookLanguage('book-123', 'fr');

      expect((FileSystem.deleteAsync as jest.Mock).mock.calls.at(-1)?.[0]).toBe(dir);
    });

    it('does nothing if the directory does not exist', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: false });

      await deleteOfflineBookLanguage('book-123', 'fr');

      expect(FileSystem.deleteAsync).not.toHaveBeenCalled();
    });
  });

  describe('loadOfflineText / loadOfflineVoiceData (Story 22.12 split)', () => {
    it('loadOfflineText returns the parsed voice-independent text', async () => {
      const text = { text: 'Test content', generatedAt: 1704067200000, version: 1 };
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(JSON.stringify(text));

      expect(await loadOfflineText('book-123', 'summaryBrief', 'en')).toEqual(text);
    });

    it('loadOfflineVoiceData returns the parsed per-voice blocks + duration', async () => {
      const data = { blocks: [{ startMs: 0, endMs: 500 }], durationMs: 60000, version: 1 };
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(JSON.stringify(data));

      expect(await loadOfflineVoiceData('book-123', 'summaryBrief', 'en', 'en_f')).toEqual(data);
    });

    it('both return null if the file does not exist', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: false });
      expect(await loadOfflineText('book-123', 'summaryBrief', 'en')).toBeNull();
      expect(await loadOfflineVoiceData('book-123', 'summaryBrief', 'en', 'en_f')).toBeNull();
    });

    it('both return null if JSON parse fails', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue('invalid json');
      expect(await loadOfflineText('book-123', 'summaryBrief', 'en')).toBeNull();
      expect(await loadOfflineVoiceData('book-123', 'summaryBrief', 'en', 'en_f')).toBeNull();
    });
  });

  describe('getDownloadedBookIds', () => {
    it('returns list of book IDs', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
      (FileSystem.readDirectoryAsync as jest.Mock).mockResolvedValue([
        'book-1',
        'book-2',
        'book-3',
      ]);

      // Story 20.6 AC-24: language-scoped — a directory only counts as downloaded IN a language
      // when it actually holds that language's audio. Each dir listing below is the book's own.
      (FileSystem.readDirectoryAsync as jest.Mock)
        .mockResolvedValueOnce(['book-1', 'book-2', 'book-3']) // the offline root
        .mockResolvedValue(['summaryBrief_en_en_f.mp3']);

      const result = await getDownloadedBookIds('en');
      expect(result).toEqual(['book-1', 'book-2', 'book-3']);
    });

    it('returns empty array if offline directory does not exist', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: false });

      const result = await getDownloadedBookIds('en');
      expect(result).toEqual([]);
    });
  });

  // ─── Story 22.19 §A: offline cover + book metadata ───

  describe('imageExtFromUrl', () => {
    it('extracts the image extension (strips query/fragment)', () => {
      expect(imageExtFromUrl('https://cdn.example.com/covers/book.webp?v=2')).toBe('webp');
      expect(imageExtFromUrl('https://cdn.example.com/x/cover.PNG#frag')).toBe('png');
    });

    it('defaults to jpg for an unknown / extension-less URL', () => {
      expect(imageExtFromUrl('https://cdn.example.com/covers/no-extension')).toBe('jpg');
      expect(imageExtFromUrl('not a url')).toBe('jpg');
    });
  });

  describe('getOfflineCoverPath / getOfflineMetaPath', () => {
    it('builds the cover + meta paths under the book dir', () => {
      expect(getOfflineCoverPath('book-123', 'png')).toBe(
        '/mock/documents/offline/book-123/cover.png'
      );
      expect(getOfflineMetaPath('book-123', 'en')).toBe(
        '/mock/documents/offline/book-123/meta_en.json'
      );
    });
  });

  describe('findOfflineCoverPath', () => {
    it('resolves a cover under whatever extension is on disk', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
      (FileSystem.readDirectoryAsync as jest.Mock).mockResolvedValue([
        'summaryBrief_en_en_f.mp3',
        'cover.webp',
        'meta.json',
      ]);
      expect(await findOfflineCoverPath('book-123')).toBe(
        '/mock/documents/offline/book-123/cover.webp'
      );
    });

    it('returns null when no cover image exists', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
      (FileSystem.readDirectoryAsync as jest.Mock).mockResolvedValue(['summaryBrief_en_en_f.mp3']);
      expect(await findOfflineCoverPath('book-123')).toBeNull();
    });
  });

  describe('saveCoverImage', () => {
    it('downloads the cover at its real extension and returns the path', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
      (FileSystem.readDirectoryAsync as jest.Mock).mockResolvedValue([]);
      (FileSystem.createDownloadResumable as jest.Mock).mockReturnValue({
        downloadAsync: jest.fn().mockResolvedValue({ uri: 'x' }),
      });

      const result = await saveCoverImage('book-123', 'https://cdn.example.com/c/cover.png?sig=a');
      expect(result).toBe('/mock/documents/offline/book-123/cover.png');
      expect(FileSystem.createDownloadResumable).toHaveBeenCalledWith(
        'https://cdn.example.com/c/cover.png?sig=a',
        '/mock/documents/offline/book-123/cover.png',
        {}
      );
    });

    it('returns null (best-effort) when there is no cover URL', async () => {
      expect(await saveCoverImage('book-123', undefined)).toBeNull();
      expect(FileSystem.createDownloadResumable).not.toHaveBeenCalled();
    });

    it('returns null instead of throwing when the download fails (must not fail the book)', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
      (FileSystem.readDirectoryAsync as jest.Mock).mockResolvedValue([]);
      (FileSystem.createDownloadResumable as jest.Mock).mockReturnValue({
        downloadAsync: jest.fn().mockRejectedValue(new Error('network')),
      });
      expect(await saveCoverImage('book-123', 'https://cdn.example.com/c/cover.jpg')).toBeNull();
    });
  });

  describe('saveBookMeta / loadBookMeta', () => {
    const meta = {
      title: 'Test Book',
      author: 'Test Author',
      coverFile: 'cover.jpg',
      sectionTypes: ['summaryBrief', 'aboutBook'],
      downloadedAt: 1704067200000,
    };

    it('writes the metadata JSON under the book dir', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
      await saveBookMeta('book-123', 'en', meta);
      expect(FileSystem.writeAsStringAsync).toHaveBeenCalledWith(
        '/mock/documents/offline/book-123/meta_en.json',
        JSON.stringify(meta)
      );
    });

    it('round-trips the metadata back via loadBookMeta', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(JSON.stringify(meta));
      expect(await loadBookMeta('book-123', 'en')).toEqual(meta);
    });

    it('returns null when no meta.json exists', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: false });
      expect(await loadBookMeta('book-123', 'en')).toBeNull();
    });

    it('returns null when meta.json is corrupt', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue('not json');
      expect(await loadBookMeta('book-123', 'en')).toBeNull();
    });
  });

  describe('resolveOfflineBookMeta', () => {
    it('resolves meta + a file:// cover URI from local disk only', async () => {
      const meta = {
        title: 'Test Book',
        author: 'Test Author',
        sectionTypes: ['summaryBrief'],
        downloadedAt: 1,
      };
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(JSON.stringify(meta));
      (FileSystem.readDirectoryAsync as jest.Mock).mockResolvedValue(['cover.jpg', 'meta.json']);

      expect(await resolveOfflineBookMeta('book-123', 'en')).toEqual({
        title: 'Test Book',
        author: 'Test Author',
        coverUri: 'file:///mock/documents/offline/book-123/cover.jpg',
        sectionTypes: ['summaryBrief'],
      });
    });

    it('returns coverUri undefined when no cover was downloaded', async () => {
      const meta = { title: 'T', author: 'A', sectionTypes: [], downloadedAt: 1 };
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(JSON.stringify(meta));
      (FileSystem.readDirectoryAsync as jest.Mock).mockResolvedValue(['meta.json']);

      const result = await resolveOfflineBookMeta('book-123', 'en');
      expect(result?.coverUri).toBeUndefined();
      expect(result?.title).toBe('T');
    });

    it('returns null when the book is not downloaded (no meta.json)', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: false });
      expect(await resolveOfflineBookMeta('book-123', 'en')).toBeNull();
    });
  });
});

/**
 * CHANGE-015-B: Web platform guard tests
 *
 * Uses jest.resetModules + jest.doMock to re-import storage with Platform.OS = 'web'.
 * The `isWeb` constant is evaluated at module load time, so we must reset modules.
 */
describe('storage helpers (web platform guards)', () => {
  let webStorage: any;
  let mockFileSystem: any;
  let originalPlatformOS: string;

  beforeAll(() => {
    jest.resetModules();
    // jest-expo 56 handles `react-native` specially, so a wholesale jest.doMock('react-native')
    // no longer overrides Platform (it worked under jest-expo 54). Instead mutate Platform.OS on
    // the SAME (preset-mocked) react-native instance that storage.ts will import — storage.ts
    // captures isWeb at module load, so set it before requiring. Story 16.9 (SDK 54→56).
    const RN = require('react-native');
    originalPlatformOS = RN.Platform.OS;
    RN.Platform.OS = 'web';
    mockFileSystem = {
      documentDirectory: null,
      getInfoAsync: jest.fn(),
      makeDirectoryAsync: jest.fn(),
      readDirectoryAsync: jest.fn(),
      deleteAsync: jest.fn(),
      readAsStringAsync: jest.fn(),
      writeAsStringAsync: jest.fn(),
      createDownloadResumable: jest.fn(),
    };
    jest.doMock('expo-file-system/legacy', () => mockFileSystem);
    webStorage = require('./storage');
  });

  afterAll(() => {
    require('react-native').Platform.OS = originalPlatformOS;
    jest.resetModules();
  });

  it('getOfflineDir returns empty string on web', () => {
    expect(webStorage.getOfflineDir('book-123')).toBe('');
  });

  it('getOfflineAudioPath returns empty string on web', () => {
    expect(webStorage.getOfflineAudioPath('book-123', 'summaryBrief', 'en', 'en_f')).toBe('');
  });

  it('ensureOfflineDir is a no-op on web', async () => {
    await webStorage.ensureOfflineDir('book-123');
    expect(mockFileSystem.makeDirectoryAsync).not.toHaveBeenCalled();
  });

  it('saveAudioFile throws on web', async () => {
    await expect(
      webStorage.saveAudioFile('book-123', 'summaryBrief', 'en_f', 'https://example.com/a.mp3')
    ).rejects.toThrow('Offline downloads are not available on web');
  });

  it('saveOfflineText / saveOfflineVoiceData throw on web', async () => {
    await expect(
      webStorage.saveOfflineText('book-123', 'summaryBrief', { text: 'test', generatedAt: 0 })
    ).rejects.toThrow('Offline downloads are not available on web');
    await expect(
      webStorage.saveOfflineVoiceData('book-123', 'summaryBrief', 'en_f', {
        blocks: [],
        durationMs: 0,
      })
    ).rejects.toThrow('Offline downloads are not available on web');
  });

  it('deleteOfflineBook is a no-op on web', async () => {
    await webStorage.deleteOfflineBook('book-123');
    expect(mockFileSystem.deleteAsync).not.toHaveBeenCalled();
  });

  it('isBookDownloaded returns false on web', async () => {
    const result = await webStorage.isBookDownloaded('book-123', 'en');
    expect(result).toBe(false);
  });

  it('isSectionDownloaded returns false on web', async () => {
    const result = await webStorage.isSectionDownloaded('book-123', 'summaryBrief', 'en', 'en_f');
    expect(result).toBe(false);
  });

  it('loadOfflineText / loadOfflineVoiceData return null on web', async () => {
    expect(await webStorage.loadOfflineText('book-123', 'summaryBrief', 'en')).toBeNull();
    expect(
      await webStorage.loadOfflineVoiceData('book-123', 'summaryBrief', 'en', 'en_f')
    ).toBeNull();
  });

  it('getDownloadedBookIds returns empty array on web', async () => {
    const result = await webStorage.getDownloadedBookIds('en');
    expect(result).toEqual([]);
  });

  it('saveCoverImage returns null on web (offline downloads native-only)', async () => {
    expect(await webStorage.saveCoverImage('book-123', 'https://cdn.example.com/c.jpg')).toBeNull();
    expect(mockFileSystem.createDownloadResumable).not.toHaveBeenCalled();
  });

  it('saveBookMeta is a no-op on web', async () => {
    await webStorage.saveBookMeta('book-123', {
      title: 'T',
      author: 'A',
      sectionTypes: [],
      downloadedAt: 0,
    });
    expect(mockFileSystem.writeAsStringAsync).not.toHaveBeenCalled();
  });

  it('resolveOfflineBookMeta returns null on web', async () => {
    expect(await webStorage.resolveOfflineBookMeta('book-123', 'en')).toBeNull();
  });
});
