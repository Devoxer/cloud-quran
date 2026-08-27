/**
 * The per-page font loader (story 6-2).
 *
 * The mutations this file exists to catch, all of which typecheck and render fine:
 *   1. the patched-font preference removed — pages 154/161/166/566 then fetch the upstream
 *      copies whose degenerate contours Safari/CoreText draw INVISIBLE;
 *   2. the CDN base pointed back at raw.githubusercontent.com — a per-page fetch would then
 *      disclose which pages a reader opens to a host that is not a named processor;
 *   3. the disk cache moved back to the OS-evictable cache directory — an evicted font is a
 *      broken offline promise;
 *   4. the ±2 preload losing its clamp or its never-throws contract.
 *
 * ⚠️ `expo-file-system` IS MOCKED LOCALLY: `jest.setup.js` mocks only the legacy API, and this
 * module uses the SDK-56 `File`/`Directory`/`Paths` classes. `expo-font` is re-mocked so
 * `isLoaded` is controllable (the global stub answers `true`, which would short-circuit every
 * case here).
 */

const mockLoadAsync = jest.fn<Promise<void>, unknown[]>(() => Promise.resolve());
const mockIsLoaded = jest.fn<boolean, [string]>(() => false);

jest.mock('expo-font', () => ({
  loadAsync: (...args: unknown[]) => mockLoadAsync(...args),
  isLoaded: (name: string) => mockIsLoaded(name),
}));

const mockDownload = jest.fn<Promise<void>, [string, { uri: string }, unknown]>(() =>
  Promise.resolve()
);
const mockFileExists = jest.fn<boolean, [string]>(() => false);
const mockDirExists = jest.fn<boolean, [string]>(() => false);
const mockCreateDir = jest.fn();

jest.mock('expo-file-system', () => {
  // ⚠️ NO TYPE ANNOTATIONS in the factory — Jest's hoisting guard rejects unknown identifiers.
  const uriOf = (part: any) => (typeof part === 'string' ? part : part.uri);
  class Directory {
    uri: string;
    constructor(...parts: any[]) {
      this.uri = parts.map(uriOf).join('/');
    }
    get exists() {
      return mockDirExists(this.uri);
    }
    create(options: any) {
      mockCreateDir(this.uri, options);
    }
  }
  class File {
    uri: string;
    constructor(...parts: any[]) {
      this.uri = parts.map(uriOf).join('/');
    }
    get exists() {
      return mockFileExists(this.uri);
    }
    static downloadFileAsync(url: string, file: any, options: any) {
      return mockDownload(url, file, options);
    }
  }
  const Paths = { document: 'file:///documents', cache: 'file:///caches' };
  return { __esModule: true, Directory, File, Paths };
});

import { Platform } from 'react-native';
import {
  getPageFontFamily,
  loadPageFont,
  MushafFontError,
  PATCHED_FONT_PAGES,
  preloadAdjacentPageFonts,
} from './mushafFonts';

beforeEach(() => {
  jest.clearAllMocks();
  mockIsLoaded.mockReturnValue(false);
  mockFileExists.mockReturnValue(false);
  mockDirExists.mockReturnValue(false);
});

/** Every URL handed to the downloader across the run. */
const downloadedUrls = () => mockDownload.mock.calls.map(([url]) => url);

describe('family names', () => {
  it('zero-pads to the QCF_P{NNN} spelling the fonts register under', () => {
    expect(getPageFontFamily(1)).toBe('QCF_P001');
    expect(getPageFontFamily(42)).toBe('QCF_P042');
    expect(getPageFontFamily(604)).toBe('QCF_P604');
  });
});

describe('the patched fonts', () => {
  it('covers exactly the four pages with degenerate upstream glyphs', () => {
    expect([...PATCHED_FONT_PAGES]).toEqual([154, 161, 166, 566]);
  });

  it.each([
    154, 161, 166, 566,
  ])('loads page %i from the BUNDLE, with no network fetch', async (page) => {
    const family = await loadPageFont(page);
    expect(family).toBe(getPageFontFamily(page));
    // The bundled module (the asset stub `1` under Jest), never a URL and never a download.
    expect(mockLoadAsync).toHaveBeenCalledWith({ [family]: 1 });
    expect(mockDownload).not.toHaveBeenCalled();
  });
});

describe('the native download path', () => {
  it('fetches from the app’s OWN CDN — never GitHub', async () => {
    await loadPageFont(5);
    expect(downloadedUrls()).toEqual([
      'https://cdn.nobleachievements.com/fonts/qpc-v1/QCF_P005.woff2',
    ]);
    for (const url of downloadedUrls()) expect(url).not.toContain('githubusercontent');
  });

  it('caches under the DOCUMENT directory — the cache directory is OS-evictable', async () => {
    await loadPageFont(5);
    const [, file] = mockDownload.mock.calls[0];
    expect(file.uri).toBe('file:///documents/qpc-fonts/QCF_P005.woff2');
    expect(mockCreateDir).toHaveBeenCalledWith('file:///documents/qpc-fonts', {
      intermediates: true,
    });
    // …and the face is then loaded from that file, not from the network URL.
    expect(mockLoadAsync).toHaveBeenCalledWith({ QCF_P005: file.uri });
  });

  it('skips the download when the file is already on disk', async () => {
    mockFileExists.mockReturnValue(true);
    await loadPageFont(5);
    expect(mockDownload).not.toHaveBeenCalled();
    expect(mockLoadAsync).toHaveBeenCalledWith({
      QCF_P005: 'file:///documents/qpc-fonts/QCF_P005.woff2',
    });
  });

  it('skips everything when the face is already registered', async () => {
    mockIsLoaded.mockReturnValue(true);
    await expect(loadPageFont(5)).resolves.toBe('QCF_P005');
    expect(mockLoadAsync).not.toHaveBeenCalled();
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it('rejects with a TYPED error naming the page — the hook turns it into a value', async () => {
    mockDownload.mockRejectedValue(new Error('offline'));
    const failure = await loadPageFont(7).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(MushafFontError);
    expect((failure as MushafFontError).page).toBe(7);
  });
});

describe('the web path', () => {
  // MUTATION: delete the `Platform.OS === 'web'` branch. Every case above is a NATIVE case, so
  // the whole suite stays green — and web (and therefore the Electron desktop shell) falls into
  // the `Directory`/`File` path, whose web backend cannot download or hold a font at all.
  const platform = Platform as { OS: string };
  const nativeOS = platform.OS;
  afterEach(() => {
    platform.OS = nativeOS;
  });

  it('loads the face straight from the CDN URL — the browser cache IS the disk cache', async () => {
    platform.OS = 'web';
    await expect(loadPageFont(5)).resolves.toBe('QCF_P005');
    expect(mockLoadAsync).toHaveBeenCalledWith({
      QCF_P005: 'https://cdn.nobleachievements.com/fonts/qpc-v1/QCF_P005.woff2',
    });
    expect(mockDownload).not.toHaveBeenCalled();
    expect(mockCreateDir).not.toHaveBeenCalled();
  });

  it('still prefers the BUNDLED patched face on web — Safari is where the glyphs vanish', async () => {
    platform.OS = 'web';
    await loadPageFont(154);
    expect(mockLoadAsync).toHaveBeenCalledWith({ QCF_P154: 1 });
  });
});

describe('the ±2 preload', () => {
  it('aims at the four neighbours and never the current page', async () => {
    await preloadAdjacentPageFonts(300);
    expect(downloadedUrls().map((u) => u.slice(-14))).toEqual([
      'QCF_P298.woff2',
      'QCF_P299.woff2',
      'QCF_P301.woff2',
      'QCF_P302.woff2',
    ]);
  });

  it('clamps at page 1', async () => {
    await preloadAdjacentPageFonts(1);
    expect(downloadedUrls().map((u) => u.slice(-14))).toEqual(['QCF_P002.woff2', 'QCF_P003.woff2']);
  });

  it('clamps at page 604', async () => {
    await preloadAdjacentPageFonts(604);
    expect(downloadedUrls().map((u) => u.slice(-14))).toEqual(['QCF_P602.woff2', 'QCF_P603.woff2']);
  });

  it('never throws — a failed neighbour becomes that page’s own retry surface later', async () => {
    mockDownload.mockRejectedValue(new Error('offline'));
    await expect(preloadAdjacentPageFonts(300)).resolves.toBeUndefined();
  });
});
