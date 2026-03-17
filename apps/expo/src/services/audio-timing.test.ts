import { findActiveVerse, audioTimingService, VerseTiming } from './audio-timing';

// Mock the URL builder
jest.mock('@/features/audio/utils/audioUrlBuilder', () => ({
  buildManifestUrl: jest.fn(
    (reciterId: string) =>
      `https://cdn.nobleachievements.com/audio/${reciterId}/manifest.json`,
  ),
}));

// Mock global fetch
const mockFetch = jest.fn() as jest.Mock;
(global as any).fetch = mockFetch;

const sampleTimings: VerseTiming[] = [
  { verseKey: '1:1', timestampFrom: 0, timestampTo: 5000 },
  { verseKey: '1:2', timestampFrom: 5000, timestampTo: 12000 },
  { verseKey: '1:3', timestampFrom: 12000, timestampTo: 16000 },
  { verseKey: '1:4', timestampFrom: 16000, timestampTo: 22000 },
  { verseKey: '1:5', timestampFrom: 22000, timestampTo: 30000 },
  { verseKey: '1:6', timestampFrom: 30000, timestampTo: 45000 },
  { verseKey: '1:7', timestampFrom: 45000, timestampTo: 52300 },
];

const sampleManifest = {
  '1': [
    { verse_key: '1:1', timestamp_from: 0, timestamp_to: 5000 },
    { verse_key: '1:2', timestamp_from: 5000, timestamp_to: 12000 },
    { verse_key: '1:3', timestamp_from: 12000, timestamp_to: 16000 },
  ],
  '2': [
    {
      verse_key: '2:1',
      timestamp_from: 0,
      timestamp_to: 8000,
      segments: [
        [0, 0, 2100],
        [1, 2100, 4500],
      ],
    },
  ],
};

describe('findActiveVerse', () => {
  it('returns null for empty timings', () => {
    expect(findActiveVerse([], 1000)).toBeNull();
  });

  it('finds the first verse at position 0', () => {
    expect(findActiveVerse(sampleTimings, 0)).toBe('1:1');
  });

  it('finds a verse in the middle', () => {
    expect(findActiveVerse(sampleTimings, 13000)).toBe('1:3');
  });

  it('finds the last verse', () => {
    expect(findActiveVerse(sampleTimings, 50000)).toBe('1:7');
  });

  it('returns correct verse at exact boundary (start of verse)', () => {
    expect(findActiveVerse(sampleTimings, 5000)).toBe('1:2');
  });

  it('returns null past the end of all timings', () => {
    expect(findActiveVerse(sampleTimings, 60000)).toBeNull();
  });

  it('returns the verse just before timestampTo boundary', () => {
    expect(findActiveVerse(sampleTimings, 4999)).toBe('1:1');
  });

  it('handles single-verse timings', () => {
    const single: VerseTiming[] = [
      { verseKey: '114:1', timestampFrom: 0, timestampTo: 3000 },
    ];
    expect(findActiveVerse(single, 1500)).toBe('114:1');
  });

  it('returns null for position before first verse (negative)', () => {
    const timings: VerseTiming[] = [
      { verseKey: '2:1', timestampFrom: 100, timestampTo: 5000 },
    ];
    expect(findActiveVerse(timings, 50)).toBeNull();
  });
});

describe('audioTimingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear internal manifest cache
    (audioTimingService as any).manifestCache = new Map();
  });

  it('fetches and parses manifest, returns timings for requested surah', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => sampleManifest,
    });

    const result = await audioTimingService.getVerseTimings(1, 'alafasy');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://cdn.nobleachievements.com/audio/alafasy/manifest.json',
    );
    expect(result).toEqual([
      { verseKey: '1:1', timestampFrom: 0, timestampTo: 5000 },
      { verseKey: '1:2', timestampFrom: 5000, timestampTo: 12000 },
      { verseKey: '1:3', timestampFrom: 12000, timestampTo: 16000 },
    ]);
  });

  it('preserves segments in parsed timings', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => sampleManifest,
    });

    const result = await audioTimingService.getVerseTimings(2, 'alafasy');

    expect(result[0].segments).toEqual([
      [0, 0, 2100],
      [1, 2100, 4500],
    ]);
  });

  it('returns cached timings on second call (no re-fetch)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => sampleManifest,
    });

    await audioTimingService.getVerseTimings(1, 'alafasy');
    const result = await audioTimingService.getVerseTimings(1, 'alafasy');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(3);
  });

  it('caches manifest per reciter — different surahs share one fetch', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => sampleManifest,
    });

    const s1 = await audioTimingService.getVerseTimings(1, 'alafasy');
    const s2 = await audioTimingService.getVerseTimings(2, 'alafasy');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(s1).toHaveLength(3);
    expect(s2).toHaveLength(1);
  });

  it('fetches separately for different reciters', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => sampleManifest,
    });

    await audioTimingService.getVerseTimings(1, 'alafasy');
    await audioTimingService.getVerseTimings(1, 'sudais');

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('returns empty array on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const result = await audioTimingService.getVerseTimings(1, 'alafasy');

    expect(result).toEqual([]);
  });

  it('returns empty array on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

    const result = await audioTimingService.getVerseTimings(1, 'alafasy');

    expect(result).toEqual([]);
  });

  it('returns empty array when surah not in manifest', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ '1': sampleManifest['1'] }),
    });

    const result = await audioTimingService.getVerseTimings(99, 'alafasy');

    expect(result).toEqual([]);
  });
});
