/**
 * The web short-circuit (story 7-5 review, P23).
 *
 * ⚠️ THE SUITE RUNS AS `ios`, SO `DOWNLOADS_SUPPORTED` IS `true` IN EVERY OTHER FILE and the web
 * branch — the one that decides whether a browser gets a control that cannot possibly work — was
 * never executed by anything.
 *
 * ⚠️ THE PLATFORM IS SET BEFORE THE MODULE IS EVER LOADED, AND THAT IS WHY THIS IS ITS OWN FILE.
 * `DOWNLOADS_SUPPORTED` is computed once at module scope, deliberately — one fact, read
 * everywhere — so unlike `mushafFonts.test.ts`, which flips `Platform.OS` between cases because
 * its module reads it inside the function, the only way to observe the other value is to have the
 * platform already changed when the module first evaluates. `import` is hoisted and `require` is
 * not, which is the whole trick: the assignment below runs first, and each Jest file gets its own
 * module registry, so nothing else in the suite is affected.
 *
 * What it pins is one rule in three places: on web nothing is on disk, nothing is written, and a
 * confirmed "download all" cannot silently do nothing, because it queues nothing to begin with.
 */

import { Platform } from 'react-native';

(Platform as { OS: string }).OS = 'web';

const downloads = require('./audioDownloads') as typeof import('./audioDownloads');
const source = require('./audioSource') as typeof import('./audioSource');
const store =
  require('@/stores/downloadQueueStore') as typeof import('@/stores/downloadQueueStore');

describe('on web', () => {
  it('reports that downloads are not supported', () => {
    expect(downloads.DOWNLOADS_SUPPORTED).toBe(false);
  });

  it('never claims a surah is local, so every track streams', () => {
    expect(downloads.localSurahUri('husary', 112)).toBeNull();
    expect(downloads.isDownloaded('husary', 112)).toBe(false);
  });

  it('resolves every uri to the CDN', () => {
    expect(source.resolveSurahUri('husary', 112)).toBe(
      'https://cdn.nobleachievements.com/audio/husary/112.mp3'
    );
    expect(source.resolveSurahUris('husary', 113, 114)).toEqual([
      'https://cdn.nobleachievements.com/audio/husary/113.mp3',
      'https://cdn.nobleachievements.com/audio/husary/114.mp3',
    ]);
  });

  it('refuses a download outright rather than pretending to start one', async () => {
    await expect(downloads.downloadSurah('husary', 112)).rejects.toThrow(/not available on web/);
  });

  it('queues nothing, so a confirmed "download all" cannot silently do nothing', () => {
    store.useDownloadQueueStore.setState({ entries: {} });
    downloads.queueReciterDownloads('husary');
    downloads.startSurahDownload('husary', 1);
    expect(store.useDownloadQueueStore.getState().entries).toEqual({});
  });

  it('reports nothing kept and no bytes used', () => {
    expect(downloads.downloadedSurahs('husary')).toEqual([]);
    expect(downloads.reciterBytesOnDisk('husary')).toBe(0);
    expect(downloads.recitersWithDownloads()).toEqual([]);
    expect(downloads.orphanedDownloadBytes(['husary'])).toBe(0);
  });
});
