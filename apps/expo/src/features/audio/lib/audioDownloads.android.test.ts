/**
 * The Android transfer path — the ONE thing that differs from iOS, and the one nothing else sees.
 *
 * ⚠️ THE SUITE RUNS AS `ios`, so `BACKGROUND_TRANSFERS` is `true` everywhere else and the Android
 * branch is unexecuted by every other file — the same hole `audioDownloads.web.test.ts` exists
 * for, and the platform is likewise set before the module is first required (`import` hoists,
 * `require` does not; each Jest file gets its own registry).
 *
 * What it pins is a decision that looks like an omission: Android does NOT use
 * `File.createDownloadTask`, even though the option it exists for is accepted there. On Android
 * `sessionType` is documented as ignored and the Kotlin `DownloadTaskOptions` carries only
 * `headers` — so the task API buys nothing — while its read loop can return from the response
 * callback on a cancel WITHOUT resuming the coroutine, leaving the drain's `await` pending
 * forever and all 113 remaining rows frozen at `queued`. Ported to Android, the "upgrade" is a
 * pure loss. See `BACKGROUND_TRANSFERS`.
 */

import { Platform } from 'react-native';

(Platform as { OS: string }).OS = 'android';

const mockRequestDownload = jest.fn<
  Promise<void>,
  [string, { uri: string }, Record<string, unknown>]
>(() => Promise.resolve());
const mockTaskDownload = jest.fn();

jest.mock('expo-file-system', () => {
  const files = new Set<string>();
  class Directory {
    uri: string;
    constructor(...parts: any[]) {
      this.uri = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
    }
    get exists() {
      return true;
    }
    create() {}
    list() {
      return [];
    }
  }
  class File {
    uri: string;
    constructor(...parts: any[]) {
      this.uri = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
    }
    get exists() {
      return files.has(this.uri);
    }
    delete() {
      files.delete(this.uri);
    }
    moveSync(destination: any) {
      files.delete(this.uri);
      files.add(destination.uri);
    }
    static downloadFileAsync(url: string, destination: any, options: any) {
      files.add(destination.uri);
      return mockRequestDownload(url, destination, options);
    }
    static createDownloadTask(url: string, destination: any, options: any) {
      mockTaskDownload(url, destination, options);
      return { downloadAsync: () => Promise.resolve() };
    }
  }
  return { __esModule: true, Directory, File, Paths: { document: 'file:///documents' } };
});

const downloads = require('./audioDownloads') as typeof import('./audioDownloads');

describe('on Android', () => {
  it('does not claim a transfer survives being suspended', () => {
    expect(downloads.BACKGROUND_TRANSFERS).toBe(false);
  });

  it('transfers through the request API, never the cancel-racing task API', async () => {
    await downloads.downloadSurah('husary', 18);

    expect(mockRequestDownload).toHaveBeenCalledTimes(1);
    expect(mockTaskDownload).not.toHaveBeenCalled();
    // `idempotent` has no equivalent on the task API and is what makes a re-attempt overwrite.
    expect(mockRequestDownload.mock.calls[0][2]).toMatchObject({ idempotent: true });
  });

  it('still commits by renaming the `.part` file', async () => {
    await downloads.downloadSurah('husary', 18);
    expect(mockRequestDownload.mock.calls[0][1].uri).toBe(
      'file:///documents/audio/husary/018.mp3.part'
    );
    expect(downloads.isDownloaded('husary', 18)).toBe(true);
  });
});
