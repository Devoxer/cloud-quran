// Mock patched font assets (woff2 files can't be imported by Jest)
jest.mock('@/assets/fonts/qpc-patched/QCF_P154.woff2', () => ({ default: 'patched-154' }));
jest.mock('@/assets/fonts/qpc-patched/QCF_P161.woff2', () => ({ default: 'patched-161' }));
jest.mock('@/assets/fonts/qpc-patched/QCF_P166.woff2', () => ({ default: 'patched-166' }));
jest.mock('@/assets/fonts/qpc-patched/QCF_P566.woff2', () => ({ default: 'patched-566' }));

// Track mock file system state
let mockFileExists = false;
let mockDirExists = false;
const mockDirCreate = jest.fn();
const mockDownloadFileAsync = jest.fn(() => Promise.resolve({ uri: 'file:///mock/font.woff2' }));

// Mock expo-file-system with new SDK 55 API
jest.mock('expo-file-system', () => {
  class MockFile {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = parts
        .map((p) => (typeof p === 'string' ? p : (p as { uri: string })?.uri || ''))
        .join('/');
    }
    get exists() {
      return mockFileExists;
    }
    static downloadFileAsync = mockDownloadFileAsync;
  }

  class MockDirectory {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = parts
        .map((p) => (typeof p === 'string' ? p : (p as { uri: string })?.uri || ''))
        .join('/');
    }
    get exists() {
      return mockDirExists;
    }
    create = mockDirCreate;
  }

  return {
    File: MockFile,
    Directory: MockDirectory,
    Paths: {
      cache: new MockDirectory('file:///mock-cache'),
    },
  };
});

let mockIsLoaded = false;
const mockLoadAsync = jest.fn(() => Promise.resolve());

jest.mock('expo-font', () => ({
  isLoaded: () => mockIsLoaded,
  loadAsync: mockLoadAsync,
}));

const {
  getPageFontFamily,
  isPageFontCached,
  loadPageFont,
  preloadAdjacentFonts,
} = require('./mushaf-fonts');

describe('getPageFontFamily', () => {
  test('returns zero-padded font family name', () => {
    expect(getPageFontFamily(1)).toBe('QCF_P001');
    expect(getPageFontFamily(42)).toBe('QCF_P042');
    expect(getPageFontFamily(604)).toBe('QCF_P604');
  });
});

describe('isPageFontCached', () => {
  beforeEach(() => {
    mockFileExists = false;
  });

  test('returns false when file does not exist', () => {
    mockFileExists = false;
    const result = isPageFontCached(1);
    expect(result).toBe(false);
  });

  test('returns true when file exists', () => {
    mockFileExists = true;
    const result = isPageFontCached(1);
    expect(result).toBe(true);
  });
});

describe('loadPageFont', () => {
  beforeEach(() => {
    mockIsLoaded = false;
    mockFileExists = false;
    mockDirExists = false;
    mockLoadAsync.mockClear();
    mockDirCreate.mockClear();
    mockDownloadFileAsync.mockClear();
    mockDownloadFileAsync.mockImplementation(() =>
      Promise.resolve({ uri: 'file:///mock/font.woff2' }),
    );
  });

  test('returns font name when already loaded in memory', async () => {
    mockIsLoaded = true;
    const result = await loadPageFont(1);
    expect(result).toBe('QCF_P001');
    expect(mockLoadAsync).not.toHaveBeenCalled();
  });

  test('downloads font when not cached on native', async () => {
    mockFileExists = false;
    mockDirExists = false;
    const result = await loadPageFont(2);
    expect(result).toBe('QCF_P002');
    expect(mockDirCreate).toHaveBeenCalled();
    expect(mockDownloadFileAsync).toHaveBeenCalled();
    expect(mockLoadAsync).toHaveBeenCalled();
  });

  test('skips download when font is cached on disk', async () => {
    mockFileExists = true;
    const result = await loadPageFont(3);
    expect(result).toBe('QCF_P003');
    expect(mockDownloadFileAsync).not.toHaveBeenCalled();
    expect(mockLoadAsync).toHaveBeenCalled();
  });

  test('creates cache directory if it does not exist', async () => {
    mockFileExists = false;
    mockDirExists = false;
    await loadPageFont(10);
    expect(mockDirCreate).toHaveBeenCalled();
  });

  test('skips directory creation if it already exists', async () => {
    mockFileExists = false;
    mockDirExists = true;
    await loadPageFont(10);
    expect(mockDirCreate).not.toHaveBeenCalled();
  });

  test('registers font via Font.loadAsync', async () => {
    mockFileExists = true;
    await loadPageFont(50);
    expect(mockLoadAsync).toHaveBeenCalled();
    const call = mockLoadAsync.mock.calls[0] as unknown[];
    const arg = call[0] as Record<string, string>;
    expect(arg).toHaveProperty('QCF_P050');
  });
});

describe('preloadAdjacentFonts', () => {
  beforeEach(() => {
    mockIsLoaded = false;
    mockFileExists = false;
    mockDirExists = true;
    mockLoadAsync.mockClear();
    mockDownloadFileAsync.mockClear();
    mockDownloadFileAsync.mockImplementation(() =>
      Promise.resolve({ uri: 'file:///mock/font.woff2' }),
    );
  });

  test('preloads pages around current page', async () => {
    await preloadAdjacentFonts(100);
    // Should load pages 98, 99, 101, 102 (not 100 itself)
    expect(mockLoadAsync.mock.calls.length).toBe(4);
  });

  test('clamps to valid page range at start', async () => {
    await preloadAdjacentFonts(1);
    // Should load pages 2, 3 only (page -1 and 0 are invalid)
    expect(mockLoadAsync.mock.calls.length).toBe(2);
  });

  test('clamps to valid page range at end', async () => {
    await preloadAdjacentFonts(604);
    // Should load pages 602, 603 only (605, 606 are invalid)
    expect(mockLoadAsync.mock.calls.length).toBe(2);
  });

  test('does not throw on individual font load failure', async () => {
    mockLoadAsync.mockRejectedValueOnce(new Error('Network error'));
    // Should not throw
    await preloadAdjacentFonts(100);
  });
});
