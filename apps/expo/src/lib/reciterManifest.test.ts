/**
 * `lib/reciterManifest.ts` — the lookup that drives every highlight (story 7-1).
 *
 * ⚠️ EVERY EXPECTED VALUE HERE IS A LITERAL, and the fixture is REAL published data (Al-Fatihah
 * and the head of Al-Baqarah, fetched from the CDN on 2026-09-02). The house rule this obeys: a
 * test whose expectation is computed from the thing under test proves nothing. So the boundary
 * cases below name the ayah by hand — `verseAtMs(…, 6031)` is asserted to be `2` because 6031 is
 * where 1:2 starts, not because the function says so.
 */

import { SURAH_METADATA } from 'quran-data';

let mockFileExists = false;
const mockDownload = jest.fn(async () => {});
const mockJson = jest.fn(async () => ({}));
jest.mock('expo-file-system', () => ({
  Paths: { document: 'file:///documents/' },
  Directory: class {
    exists = true;
    create() {}
  },
  File: class {
    static downloadFileAsync: (...args: unknown[]) => Promise<void> = (...args) =>
      mockDownload(...(args as []));
    get exists() {
      return mockFileExists;
    }
    json() {
      return mockJson();
    }
  },
}));

import {
  __resetManifestCache,
  isSurahTimed,
  lastVerseOf,
  loadReciterManifest,
  offsetOfVerse,
  parseReciterManifest,
  ReciterManifestError,
  verseAtMs,
} from './reciterManifest';

/** Al-Fatihah, verbatim from `cdn.nobleachievements.com/audio/husary/manifest.json`-shaped data. */
const AL_FATIHAH = [
  { verse_key: '1:1', timestamp_from: 0, timestamp_to: 6031 },
  { verse_key: '1:2', timestamp_from: 6031, timestamp_to: 11565 },
  { verse_key: '1:3', timestamp_from: 11565, timestamp_to: 16137 },
  { verse_key: '1:4', timestamp_from: 16137, timestamp_to: 20738 },
  { verse_key: '1:5', timestamp_from: 20738, timestamp_to: 27390 },
  { verse_key: '1:6', timestamp_from: 27390, timestamp_to: 32934 },
  { verse_key: '1:7', timestamp_from: 32934, timestamp_to: 46121 },
];

const AL_BAQARAH_HEAD = [
  { verse_key: '2:1', timestamp_from: 0, timestamp_to: 7605 },
  { verse_key: '2:2', timestamp_from: 7605, timestamp_to: 16538 },
  { verse_key: '2:3', timestamp_from: 16538, timestamp_to: 27906 },
];

const manifest = parseReciterManifest({ '1': AL_FATIHAH, '2': AL_BAQARAH_HEAD });

describe('parseReciterManifest', () => {
  it('keys by surah NUMBER, not the wire string', () => {
    expect(manifest.get(1)).toHaveLength(7);
    expect(manifest.get(2)).toHaveLength(3);
    // The wire key is `"1"`; a Map keyed by the raw string would answer undefined here.
    expect(manifest.get(114)).toBeUndefined();
  });

  it('takes the ayah number out of the verse key and drops the surah half', () => {
    expect(manifest.get(1)?.[0]).toEqual({ verse: 1, fromMs: 0, toMs: 6031 });
    expect(manifest.get(1)?.[6]).toEqual({ verse: 7, fromMs: 32934, toMs: 46121 });
  });

  /**
   * ⚠️ REAL DATA, NOT A HYPOTHETICAL. 1,088 of `alafasy`'s 6,236 rows are published with null
   * timestamps. A parse that let those through would put `null` into a numeric comparison, where
   * `null <= ms` is `true` — so the binary search would happily select an untimed window.
   */
  it('drops rows the pipeline published without timings', () => {
    const withNulls = parseReciterManifest({
      '36': [
        { verse_key: '36:1', timestamp_from: 0, timestamp_to: 4000 },
        { verse_key: '36:2', timestamp_from: null, timestamp_to: null },
        { verse_key: '36:3', timestamp_from: null, timestamp_to: null },
      ],
    });
    expect(withNulls.get(36)).toEqual([{ verse: 1, fromMs: 0, toMs: 4000 }]);
  });

  it('drops a zero-length or inverted window rather than trusting it', () => {
    const bad = parseReciterManifest({
      '1': [
        { verse_key: '1:1', timestamp_from: 500, timestamp_to: 500 },
        { verse_key: '1:2', timestamp_from: 900, timestamp_to: 400 },
        { verse_key: '1:3', timestamp_from: 1000, timestamp_to: 2000 },
      ],
    });
    expect(bad.get(1)).toEqual([{ verse: 3, fromMs: 1000, toMs: 2000 }]);
  });

  it('sorts windows ascending — the binary search is only correct on ordered input', () => {
    const shuffled = parseReciterManifest({
      '1': [
        { verse_key: '1:3', timestamp_from: 11565, timestamp_to: 16137 },
        { verse_key: '1:1', timestamp_from: 0, timestamp_to: 6031 },
        { verse_key: '1:2', timestamp_from: 6031, timestamp_to: 11565 },
      ],
    });
    expect(shuffled.get(1)?.map((w) => w.verse)).toEqual([1, 2, 3]);
  });

  it('survives a wire object that is not one', () => {
    expect(parseReciterManifest(null).size).toBe(0);
    expect(parseReciterManifest('nope').size).toBe(0);
    expect(parseReciterManifest({ '1': 'not-an-array' }).size).toBe(0);
  });
});

describe('verseAtMs', () => {
  // Literal expectations: each ms is chosen by reading the fixture above by eye.
  it.each([
    [0, 1],
    [3000, 1],
    [6030, 1],
    [6031, 2], // exact boundary belongs to the ayah STARTING there — windows are half-open
    [11564, 2],
    [11565, 3],
    [20737, 4],
    [20738, 5],
    [32934, 7],
    [46120, 7],
  ])('surah 1 at %ims is ayah %i', (ms, expected) => {
    expect(verseAtMs(manifest, 1, ms)).toBe(expected);
  });

  it('clamps a position past the final window to the last ayah', () => {
    // 46121 is the end of 1:7 and there is nothing after it — the tail of the recording.
    expect(verseAtMs(manifest, 1, 46121)).toBe(7);
    expect(verseAtMs(manifest, 1, 999_999)).toBe(7);
  });

  it('clamps a position before the first window to the first ayah', () => {
    const withLeadIn = parseReciterManifest({
      '2': [{ verse_key: '2:1', timestamp_from: 2500, timestamp_to: 9000 }],
    });
    expect(verseAtMs(withLeadIn, 2, 0)).toBe(1);
  });

  it('answers null for a surah the manifest does not cover', () => {
    expect(verseAtMs(manifest, 114, 1000)).toBeNull();
  });

  it('finds the right ayah in a long surah — a scan and a search must agree', () => {
    // 300 contiguous 1,000ms windows. The expectation is arithmetic on the FIXTURE
    // (`ms / 1000 + 1`), never a second call to `verseAtMs`.
    const long = parseReciterManifest({
      '2': Array.from({ length: 300 }, (_, i) => ({
        verse_key: `2:${i + 1}`,
        timestamp_from: i * 1000,
        timestamp_to: (i + 1) * 1000,
      })),
    });
    for (const ms of [0, 999, 1000, 149_500, 250_000, 299_999]) {
      expect(verseAtMs(long, 2, ms)).toBe(Math.floor(ms / 1000) + 1);
    }
  });
});

describe('offsetOfVerse', () => {
  it('returns the ayah start in milliseconds', () => {
    expect(offsetOfVerse(manifest, 1, 1)).toBe(0);
    expect(offsetOfVerse(manifest, 1, 5)).toBe(20738);
    expect(offsetOfVerse(manifest, 2, 3)).toBe(16538);
  });

  it('answers null for an ayah with no window, so no seek is issued', () => {
    expect(offsetOfVerse(manifest, 1, 8)).toBeNull();
    expect(offsetOfVerse(manifest, 114, 1)).toBeNull();
  });

  it('finds an ayah whose index shifted because an earlier row was dropped', () => {
    const gapped = parseReciterManifest({
      '1': [
        { verse_key: '1:1', timestamp_from: null, timestamp_to: null },
        { verse_key: '1:2', timestamp_from: 6031, timestamp_to: 11565 },
      ],
    });
    // 1:2 is at index 0 now — the direct-index fast path must not answer for the wrong ayah.
    expect(offsetOfVerse(gapped, 1, 2)).toBe(6031);
    expect(offsetOfVerse(gapped, 1, 1)).toBeNull();
  });
});

describe('lastVerseOf', () => {
  it('names the final timed ayah', () => {
    expect(lastVerseOf(manifest, 1)).toBe(7);
    expect(lastVerseOf(manifest, 2)).toBe(3);
    expect(lastVerseOf(manifest, 114)).toBeNull();
  });
});

describe('isSurahTimed', () => {
  it('is true only when every ayah of the surah has a window', () => {
    // Al-Fatihah has 7 ayahs and the fixture has all 7.
    expect(SURAH_METADATA[0].verseCount).toBe(7);
    expect(isSurahTimed(manifest, 1)).toBe(true);
  });

  it('is false for a surah the fixture only partly covers', () => {
    // Al-Baqarah has 286 ayahs; the fixture holds 3.
    expect(SURAH_METADATA[1].verseCount).toBe(286);
    expect(isSurahTimed(manifest, 2)).toBe(false);
  });

  it('is false for a surah with no timings and for a surah number out of range', () => {
    expect(isSurahTimed(manifest, 114)).toBe(false);
    expect(isSurahTimed(manifest, 0)).toBe(false);
    expect(isSurahTimed(manifest, 200)).toBe(false);
  });
});

/**
 * The matrix row "a cached copy is used first and never re-fetched".
 *
 * The NATIVE branch is the one under test — it is the primary surface, and it is the branch with
 * a disk cache to get wrong. `expo-file-system`'s `File`/`Directory` are not in the global setup
 * mock (which predates the new API), so they are stubbed here.
 */
describe('loadReciterManifest — one fetch per reciter, ever', () => {
  beforeEach(() => {
    __resetManifestCache();
    mockFileExists = false;
    mockDownload.mockClear();
    mockJson.mockReset();
    mockJson.mockResolvedValue({ '1': AL_FATIHAH });
  });

  it('downloads once, then serves every later caller from memory', async () => {
    const first = await loadReciterManifest('husary');
    const second = await loadReciterManifest('husary');
    expect(mockDownload).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
  });

  it('shares ONE download between two callers racing at boot', async () => {
    const [a, b] = await Promise.all([
      loadReciterManifest('husary'),
      loadReciterManifest('husary'),
    ]);
    expect(mockDownload).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it('reads an already-cached file instead of downloading it again', async () => {
    mockFileExists = true;
    await loadReciterManifest('husary');
    // The offline promise: a manifest on disk is never re-fetched.
    expect(mockDownload).not.toHaveBeenCalled();
    expect(mockJson).toHaveBeenCalled();
  });

  it('caches per VOICE — a different reciter is a different manifest', async () => {
    await loadReciterManifest('husary');
    await loadReciterManifest('sudais');
    expect(mockDownload).toHaveBeenCalledTimes(2);
  });

  it('raises a named error a retry surface can act on, and remembers no failure', async () => {
    mockDownload.mockRejectedValueOnce(new Error('offline'));
    await expect(loadReciterManifest('husary')).rejects.toThrow(ReciterManifestError);
    // ⚠️ A remembered failure would keep serving the offline error for the rest of the session,
    // long after the reader was back in signal.
    await expect(loadReciterManifest('husary')).resolves.toBeDefined();
  });

  it('treats a fetched-but-EMPTY manifest as a failure, not as silent no-highlighting', async () => {
    mockJson.mockResolvedValue({});
    await expect(loadReciterManifest('husary')).rejects.toThrow(ReciterManifestError);
  });
});
