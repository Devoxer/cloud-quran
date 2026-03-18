const mockNavigateToVerse = jest.fn();

jest.mock('@/theme/useUIStore', () => {
  const useUIStore = Object.assign(
    () => ({}),
    { getState: () => ({ navigateToVerse: mockNavigateToVerse }), setState: () => {}, subscribe: () => () => {} },
  );
  return { useUIStore };
});

jest.mock('quran-data', () => ({
  SURAH_METADATA: [
    { number: 1, nameArabic: 'الفاتحة', nameEnglish: 'The Opening', verseCount: 7 },
    { number: 2, nameArabic: 'البقرة', nameEnglish: 'The Cow', verseCount: 286 },
    { number: 114, nameArabic: 'الناس', nameEnglish: 'Mankind', verseCount: 6 },
  ],
}));

let mockParams = { surah: '1', verse: '1' };
const MockRedirect = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  Redirect: MockRedirect,
}));

const DeepLinkVerse = require('@/app/quran/[surah]/[verse]').default;

describe('DeepLinkVerse', () => {
  beforeEach(() => {
    mockNavigateToVerse.mockClear();
    mockParams = { surah: '1', verse: '1' };
  });

  test('navigates to valid surah/verse and redirects to tabs', () => {
    mockParams = { surah: '2', verse: '255' };
    const result = DeepLinkVerse();
    expect(mockNavigateToVerse).toHaveBeenCalledWith(2, 255);
    expect(result.type).toBe(MockRedirect);
    expect(result.props.href).toBe('/(tabs)');
  });

  test('navigates to first verse of first surah', () => {
    mockParams = { surah: '1', verse: '1' };
    DeepLinkVerse();
    expect(mockNavigateToVerse).toHaveBeenCalledWith(1, 1);
  });

  test('navigates to last verse of surah', () => {
    mockParams = { surah: '1', verse: '7' };
    DeepLinkVerse();
    expect(mockNavigateToVerse).toHaveBeenCalledWith(1, 7);
  });

  test('does not navigate for invalid surah number (0)', () => {
    mockParams = { surah: '0', verse: '1' };
    DeepLinkVerse();
    expect(mockNavigateToVerse).not.toHaveBeenCalled();
  });

  test('does not navigate for surah exceeding 114', () => {
    mockParams = { surah: '115', verse: '1' };
    DeepLinkVerse();
    expect(mockNavigateToVerse).not.toHaveBeenCalled();
  });

  test('does not navigate for verse 0', () => {
    mockParams = { surah: '1', verse: '0' };
    DeepLinkVerse();
    expect(mockNavigateToVerse).not.toHaveBeenCalled();
  });

  test('does not navigate for verse exceeding surah verse count', () => {
    mockParams = { surah: '1', verse: '8' };
    DeepLinkVerse();
    expect(mockNavigateToVerse).not.toHaveBeenCalled();
  });

  test('does not navigate for non-numeric surah', () => {
    mockParams = { surah: 'abc', verse: '1' };
    DeepLinkVerse();
    expect(mockNavigateToVerse).not.toHaveBeenCalled();
  });

  test('does not navigate for non-numeric verse', () => {
    mockParams = { surah: '1', verse: 'abc' };
    DeepLinkVerse();
    expect(mockNavigateToVerse).not.toHaveBeenCalled();
  });

  test('does not navigate for decimal surah', () => {
    mockParams = { surah: '1.5', verse: '1' };
    DeepLinkVerse();
    expect(mockNavigateToVerse).not.toHaveBeenCalled();
  });

  test('does not navigate for negative verse', () => {
    mockParams = { surah: '1', verse: '-1' };
    DeepLinkVerse();
    expect(mockNavigateToVerse).not.toHaveBeenCalled();
  });

  test('always redirects to tabs even for invalid params', () => {
    mockParams = { surah: '999', verse: '999' };
    const result = DeepLinkVerse();
    expect(result.type).toBe(MockRedirect);
    expect(result.props.href).toBe('/(tabs)');
  });
});
