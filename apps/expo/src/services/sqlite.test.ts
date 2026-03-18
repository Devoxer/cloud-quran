// Mock data for tests
const mockVerseRows = [
  {
    surah_number: 1,
    verse_number: 1,
    uthmani_text:
      '\u0628\u0650\u0633\u0652\u0645\u0650 \u0671\u0644\u0644\u0651\u064e\u0647\u0650 \u0671\u0644\u0631\u0651\u064e\u062d\u0652\u0645\u064e\u0670\u0646\u0650 \u0671\u0644\u0631\u0651\u064e\u062d\u0650\u064a\u0645\u0650',
    translation_text: 'In the name of Allah, the Entirely Merciful, the Especially Merciful.',
    transliteration_text: 'Bismi Allahi arrahmani arraheem',
  },
  {
    surah_number: 1,
    verse_number: 2,
    uthmani_text:
      '\u0671\u0644\u0652\u062d\u064e\u0645\u0652\u062f\u064f \u0644\u0650\u0644\u0651\u064e\u0647\u0650 \u0631\u064e\u0628\u0651\u0650 \u0671\u0644\u0652\u0639\u064e\u0670\u0644\u064e\u0645\u0650\u064a\u0646\u064e',
    translation_text: 'All praise is due to Allah, Lord of the worlds,',
    transliteration_text: 'Alhamdu lillahi rabbi alAAalameen',
  },
  {
    surah_number: 1,
    verse_number: 3,
    uthmani_text:
      '\u0671\u0644\u0631\u0651\u064e\u062d\u0652\u0645\u064e\u0670\u0646\u0650 \u0671\u0644\u0631\u0651\u064e\u062d\u0650\u064a\u0645\u0650',
    translation_text: 'The Entirely Merciful, the Especially Merciful,',
    transliteration_text: 'Arrahmani arraheem',
  },
  {
    surah_number: 1,
    verse_number: 4,
    uthmani_text:
      '\u0645\u064e\u0670\u0644\u0650\u0643\u0650 \u064a\u064e\u0648\u0652\u0645\u0650 \u0671\u0644\u062f\u0651\u0650\u064a\u0646\u0650',
    translation_text: 'Sovereign of the Day of Recompense.',
    transliteration_text: 'Maliki yawmi addeen',
  },
  {
    surah_number: 1,
    verse_number: 5,
    uthmani_text:
      '\u0625\u0650\u064a\u0651\u064e\u0627\u0643\u064e \u0646\u064e\u0639\u0652\u0628\u064f\u062f\u064f \u0648\u064e\u0625\u0650\u064a\u0651\u064e\u0627\u0643\u064e \u0646\u064e\u0633\u0652\u062a\u064e\u0639\u0650\u064a\u0646\u064f',
    translation_text: 'It is You we worship and You we ask for help.',
    transliteration_text: 'Iyyaka naAAbudu wa-iyyaka nastaAAeen',
  },
  {
    surah_number: 1,
    verse_number: 6,
    uthmani_text:
      '\u0671\u0647\u0652\u062f\u0650\u0646\u064e\u0627 \u0671\u0644\u0635\u0651\u0650\u0631\u064e\u0670\u0637\u064e \u0671\u0644\u0652\u0645\u064f\u0633\u0652\u062a\u064e\u0642\u0650\u064a\u0645\u064e',
    translation_text: 'Guide us to the straight path -',
    transliteration_text: 'Ihdina assirata almustaqeem',
  },
  {
    surah_number: 1,
    verse_number: 7,
    uthmani_text:
      '\u0635\u0650\u0631\u064e\u0670\u0637\u064e \u0671\u0644\u0651\u064e\u0630\u0650\u064a\u0646\u064e \u0623\u064e\u0646\u0652\u0639\u064e\u0645\u0652\u062a\u064e \u0639\u064e\u0644\u064e\u064a\u0652\u0647\u0650\u0645\u0652 \u063a\u064e\u064a\u0652\u0631\u0650 \u0671\u0644\u0652\u0645\u064e\u063a\u0652\u0636\u064f\u0648\u0628\u0650 \u0639\u064e\u0644\u064e\u064a\u0652\u0647\u0650\u0645\u0652 \u0648\u064e\u0644\u064e\u0627 \u0671\u0644\u0636\u0651\u064e\u0622\u0644\u0651\u0650\u064a\u0646\u064e',
    translation_text:
      'The path of those upon whom You have bestowed favor, not of those who have earned [Your] anger or of those who are astray.',
    transliteration_text: 'Sirata allatheena anAAamta AAalayhim ghayri almaghdoobi AAalayhim wala addalleen',
  },
];

const mockGetFirstAsync = jest.fn((): Promise<Record<string, unknown> | null> => Promise.resolve(null));
const mockGetAllAsync = jest.fn(() => Promise.resolve(mockVerseRows));
const mockOpenDatabaseAsync = jest.fn(() =>
  Promise.resolve({ getAllAsync: mockGetAllAsync, getFirstAsync: mockGetFirstAsync }),
);
const mockImportDatabaseFromAssetAsync = jest.fn(() => Promise.resolve());

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: mockOpenDatabaseAsync,
  importDatabaseFromAssetAsync: mockImportDatabaseFromAssetAsync,
}));

jest.mock('@/data/quran.db', () => ({}));

// Use require() instead of import — the expo-sqlite ESM re-export chain
// causes mock resolution issues with babel-transformed import statements.
const { getVersesForSurah, getVersesByPositions, getTafsirForVerse } =
  require('./sqlite') as typeof import('./sqlite');

describe('SQLite Service', () => {
  test('getVersesForSurah(1) returns 7 verses for Al-Fatiha', async () => {
    const verses = await getVersesForSurah(1);
    expect(verses).toHaveLength(7);
  });

  test('results have correct shape with camelCase properties', async () => {
    const verses = await getVersesForSurah(1);
    const first = verses[0];
    expect(first).toHaveProperty('surahNumber');
    expect(first).toHaveProperty('verseNumber');
    expect(first).toHaveProperty('uthmaniText');
    expect(first).toHaveProperty('translationText');
  });

  test('verse data is correctly mapped from snake_case to camelCase', async () => {
    const verses = await getVersesForSurah(1);
    expect(verses[0].surahNumber).toBe(1);
    expect(verses[0].verseNumber).toBe(1);
    expect(verses[0].uthmaniText).toBe(
      '\u0628\u0650\u0633\u0652\u0645\u0650 \u0671\u0644\u0644\u0651\u064e\u0647\u0650 \u0671\u0644\u0631\u0651\u064e\u062d\u0652\u0645\u064e\u0670\u0646\u0650 \u0671\u0644\u0631\u0651\u064e\u062d\u0650\u064a\u0645\u0650',
    );
    expect(verses[0].translationText).toBe(
      'In the name of Allah, the Entirely Merciful, the Especially Merciful.',
    );
  });

  test('verses are ordered by verse number', async () => {
    const verses = await getVersesForSurah(1);
    for (let i = 0; i < verses.length; i++) {
      expect(verses[i].verseNumber).toBe(i + 1);
    }
  });

  test('getDatabase uses singleton pattern (reuses cached instance)', async () => {
    await getVersesForSurah(1);
    await getVersesForSurah(1);
    expect(mockOpenDatabaseAsync).toHaveBeenCalledTimes(1);
  });

  test('getVersesByPositions returns empty array for empty input', async () => {
    const verses = await getVersesByPositions([]);
    expect(verses).toEqual([]);
  });

  test('getVersesByPositions returns verses for given positions', async () => {
    mockGetAllAsync.mockImplementationOnce(() =>
      Promise.resolve([
        {
          surah_number: 1,
          verse_number: 1,
          uthmani_text:
            '\u0628\u0650\u0633\u0652\u0645\u0650 \u0671\u0644\u0644\u0651\u064e\u0647\u0650 \u0671\u0644\u0631\u0651\u064e\u062d\u0652\u0645\u064e\u0670\u0646\u0650 \u0671\u0644\u0631\u0651\u064e\u062d\u0650\u064a\u0645\u0650',
          translation_text: 'In the name of Allah, the Entirely Merciful, the Especially Merciful.',
          transliteration_text: 'Bismi Allahi arrahmani arraheem',
        },
        {
          surah_number: 2,
          verse_number: 255,
          uthmani_text:
            '\u0671\u0644\u0644\u0651\u064e\u0647\u064f \u0644\u064e\u0627 \u0625\u0650\u0644\u064e\u0670\u0647\u064e \u0625\u0650\u0644\u0651\u064e\u0627 \u0647\u064f\u0648\u064e',
          translation_text: 'Allah - there is no deity except Him',
          transliteration_text: 'Allahu la ilaha illa huwa',
        },
      ]),
    );
    const verses = await getVersesByPositions([
      { surahNumber: 1, verseNumber: 1 },
      { surahNumber: 2, verseNumber: 255 },
    ]);
    expect(verses).toHaveLength(2);
    expect(verses[0].surahNumber).toBe(1);
    expect(verses[0].verseNumber).toBe(1);
    expect(verses[1].surahNumber).toBe(2);
    expect(verses[1].verseNumber).toBe(255);
  });

  test('getVersesByPositions maps snake_case to camelCase', async () => {
    mockGetAllAsync.mockImplementationOnce(() =>
      Promise.resolve([
        {
          surah_number: 1,
          verse_number: 3,
          uthmani_text:
            '\u0671\u0644\u0631\u0651\u064e\u062d\u0652\u0645\u064e\u0670\u0646\u0650 \u0671\u0644\u0631\u0651\u064e\u062d\u0650\u064a\u0645\u0650',
          translation_text: 'The Entirely Merciful, the Especially Merciful,',
          transliteration_text: 'Arrahmani arraheem',
        },
      ]),
    );
    const verses = await getVersesByPositions([{ surahNumber: 1, verseNumber: 3 }]);
    expect(verses[0]).toHaveProperty('surahNumber');
    expect(verses[0]).toHaveProperty('verseNumber');
    expect(verses[0]).toHaveProperty('uthmaniText');
    expect(verses[0]).toHaveProperty('translationText');
  });

  // NOTE: The SHA-256 integrity test is Bun-specific (uses bun:sqlite and Bun.CryptoHasher).
  // It is skipped in the Jest migration since it requires Bun runtime APIs.
  // The build-time verify script (`bun run verify`) covers this integrity check.

  test('getTafsirForVerse returns tafsir entry when found', async () => {
    mockGetFirstAsync.mockImplementationOnce(() =>
      Promise.resolve({
        surah_number: 2,
        verse_number: 255,
        source: 'ibn-kathir',
        text: 'This is the greatest verse of the Quran...',
      }),
    );
    const result = await getTafsirForVerse(2, 255, 'ibn-kathir');
    expect(result).not.toBeNull();
    expect(result!.surahNumber).toBe(2);
    expect(result!.verseNumber).toBe(255);
    expect(result!.source).toBe('ibn-kathir');
    expect(result!.text).toBe('This is the greatest verse of the Quran...');
  });

  test('getTafsirForVerse returns null when not found', async () => {
    mockGetFirstAsync.mockImplementationOnce(() => Promise.resolve(null));
    const result = await getTafsirForVerse(999, 999, 'al-jalalayn');
    expect(result).toBeNull();
  });

  test('getTafsirForVerse maps snake_case to camelCase', async () => {
    mockGetFirstAsync.mockImplementationOnce(() =>
      Promise.resolve({
        surah_number: 1,
        verse_number: 1,
        source: 'al-sadi',
        text: 'Tafsir text',
      }),
    );
    const result = await getTafsirForVerse(1, 1, 'al-sadi');
    expect(result).toHaveProperty('surahNumber');
    expect(result).toHaveProperty('verseNumber');
    expect(result).toHaveProperty('source');
    expect(result).toHaveProperty('text');
  });

  test('getVersesForSurah returns transliterationText from LEFT JOIN', async () => {
    const verses = await getVersesForSurah(1);
    expect(verses[0]).toHaveProperty('transliterationText');
    expect(verses[0].transliterationText).toBe('Bismi Allahi arrahmani arraheem');
  });

  test('getVersesByPositions returns transliterationText', async () => {
    mockGetAllAsync.mockImplementationOnce(() =>
      Promise.resolve([
        {
          surah_number: 1,
          verse_number: 1,
          uthmani_text: 'بسم',
          translation_text: 'In the name of Allah',
          transliteration_text: 'Bismi Allahi arrahmani arraheem',
        },
      ]),
    );
    const verses = await getVersesByPositions([{ surahNumber: 1, verseNumber: 1 }]);
    expect(verses[0].transliterationText).toBe('Bismi Allahi arrahmani arraheem');
  });

  test('transliterationText is undefined when null in database', async () => {
    mockGetAllAsync.mockImplementationOnce(() =>
      Promise.resolve([
        {
          surah_number: 1,
          verse_number: 1,
          uthmani_text: 'بسم',
          translation_text: 'In the name',
          transliteration_text: null as unknown as string,
        },
      ]),
    );
    const verses = await getVersesByPositions([{ surahNumber: 1, verseNumber: 1 }]);
    expect(verses[0].transliterationText).toBeUndefined();
  });
});
