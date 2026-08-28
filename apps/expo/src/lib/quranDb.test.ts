/**
 * The read path, against the REAL bundled database (story 6-1).
 *
 * ⚠️ A FIXTURE WOULD PROVE NOTHING HERE. `apps/expo/src/data/quran.db` shipped in every build
 * since story 5-1 and no code had ever opened it — so the question this file has to answer is not
 * "does the mapping compile" but "do these column names, this schema and these 6,236 rows exist in
 * the file we ship". A hand-written fixture answers a question nobody was asking.
 *
 * ⚠️ THE MOCK IMPLEMENTS THE **ASYNC** METHODS ONLY, WHICH IS ALSO A CONTRACT. `expo-sqlite`'s web
 * backend truncates every `*Sync` result to `length & 0xFF` bytes — a real, measured upstream bug
 * (see `lib/quranDb.ts`'s header). Reintroducing `getAllSync` here would therefore fail loudly
 * rather than quietly matching a mock that accepts both spellings.
 *
 * ⚠️ SO `expo-sqlite` IS REPLACED BY `node:sqlite` OVER THE SHIPPED FILE, NOT BY A FAKE DATABASE.
 * The native module cannot load under Jest, but the SQL, the parameter binding, the column names
 * and the row shapes are all still the real ones — only the driver differs. `{ readOnly: true }`
 * is spelled in CAMELCASE deliberately: `node:sqlite` SILENTLY IGNORES unknown constructor
 * options, which is how Bun's `{ readonly: true }` handed `scripts/verify-quran.ts` a WRITABLE
 * handle on the shipped Quran database (story 5-3). The same trap, one directory away.
 *
 * The anti-vacuity cases matter as much as the happy ones: if the mock stopped opening the real
 * file, or if the mapping silently swallowed a missing column, everything below would still pass
 * with a plausible-looking empty result. So the counts are asserted against `quran-data`'s own
 * constants, and one verse's text is hashed against the integrity baseline `pnpm verify` uses.
 */

import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { SURAH_COUNT, SURAH_METADATA, TOTAL_VERSES, VERSE_HASHES } from 'quran-data';

/** The file the app actually bundles — resolved from this test's own location, never copied. */
const mockRealDb = join(__dirname, '..', 'data', 'quran.db');

/** How many times `importDatabaseFromAssetAsync` ran — the "imported once" assertion below. */
const mockImports = jest.fn();
/** Every statement the module sent through `execSync` — how the read-only PRAGMA is observed. */
const mockExeced: string[] = [];
/**
 * Set by a test to make one leg of the open fail.
 *   • `importFailure` — the asset never reaches the SQLite directory.
 *   • `pragmaFailure` — `openDatabaseSync` SUCCEEDS and the first statement does not, which is a
 *     locked file, a corrupt page, or a native module that answers the open and then fails.
 */
const mockState = { importFailure: null as Error | null, pragmaFailure: null as Error | null };
/** Handles the module asked to close. The half-open path must not leak one. */
const mockClosed: string[] = [];
/** Live driver handles, closed after each test so the shipped file is never left open. */
const mockOpened: DatabaseSync[] = [];

// ⚠️ EVERY NAME THIS FACTORY TOUCHES IS `mock`-PREFIXED, AND `node:sqlite` IS REQUIRED INSIDE IT.
// Jest hoists `jest.mock` above the imports, so a factory referencing a top-level binding reads an
// uninitialized variable; the `mock` prefix is the documented opt-out and the `require` keeps the
// driver out of the temporal dead zone entirely.
jest.mock('expo-sqlite', () => ({
  importDatabaseFromAssetAsync: jest.fn(async (name: string) => {
    mockImports(name);
    if (mockState.importFailure) throw mockState.importFailure;
  }),
  openDatabaseSync: () => {
    // ⚠️ CAMELCASE. See the header — the lowercase spelling is silently ignored and would open
    // the shipped Quran database read-WRITE from a test run.
    const { DatabaseSync: Driver } = require('node:sqlite');
    const db = new Driver(mockRealDb, { readOnly: true });
    mockOpened.push(db);
    return {
      execAsync: async (sql: string) => {
        mockExeced.push(sql);
        if (mockState.pragmaFailure) throw mockState.pragmaFailure;
        db.exec(sql);
      },
      getAllAsync: async (sql: string, ...params: unknown[]) => db.prepare(sql).all(...params),
      getFirstAsync: async (sql: string, ...params: unknown[]) =>
        db.prepare(sql).get(...params) ?? null,
      closeAsync: async () => {
        mockClosed.push('closed');
        db.close();
      },
    };
  },
}));

import {
  __resetQuranDbForTests,
  getSurahMetadata,
  getSurahVerses,
  getVersesForPositions,
} from './quranDb';

beforeEach(() => {
  __resetQuranDbForTests();
  mockImports.mockClear();
  mockExeced.length = 0;
  mockClosed.length = 0;
  mockState.importFailure = null;
  mockState.pragmaFailure = null;
});

afterEach(() => {
  // ⚠️ TOLERANT OF AN ALREADY-CLOSED HANDLE, because one case's whole point is that the module
  // closes its own connection when the read-only PRAGMA rejects — `node:sqlite` throws
  // "database is not open" on a second close, which would fail that case from the teardown.
  for (const db of mockOpened.splice(0)) {
    try {
      db.close();
    } catch {
      /* already closed by the module under test */
    }
  }
});

describe('the bundled database is real, and this is the file we ship', () => {
  it('reads Al-Fatiha — 7 verses, in order, in the Uthmani face', async () => {
    const verses = await getSurahVerses(1);
    expect(verses).toHaveLength(7);
    expect(verses.map((v) => v.verse)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(verses.every((v) => v.surah === 1)).toBe(true);
    // Arabic, not an empty string and not a placeholder.
    expect(verses[0].textUthmani).toMatch(/\p{Script=Arabic}/u);
  });

  it('reads Al-Baqarah — all 286 verses, the longest surah in the book', async () => {
    const verses = await getSurahVerses(2);
    expect(verses).toHaveLength(286);
    expect(verses[285].verse).toBe(286);
  });

  it('returns the text the INTEGRITY BASELINE covers, byte for byte', async () => {
    // ⚠️ THIS IS THE ONE ASSERTION THAT TIES THE READ PATH TO THE NON-NEGOTIABLE. `pnpm verify`
    // hashes `sha256(surah:verse:uthmani_text)` per ayah against `VERSE_HASHES`; re-deriving the
    // same hash from what `getSurahVerses` RETURNS proves the read path hands the app the exact
    // bytes the gate signed off — not merely "some rows from some table". A mapping that read
    // `simple_text` into `textUthmani` would pass every other case in this file and fail here,
    // which matters because `simple_text` has no baseline of its own.
    const verses = await getSurahVerses(1);
    for (const v of verses) {
      const digest = createHash('sha256')
        .update(`${v.surah}:${v.verse}:${v.textUthmani}`)
        .digest('hex');
      expect(digest).toBe(VERSE_HASHES[`${v.surah}:${v.verse}`]);
    }
  });

  it('maps snake_case columns onto the camelCase quran-data types', async () => {
    const [first] = await getSurahVerses(1);
    // The row shape, not just the values: an extra `surah_number` leaking through would mean the
    // mapping is a spread rather than a projection.
    expect(Object.keys(first).sort()).toEqual(['surah', 'textSimple', 'textUthmani', 'verse']);
    expect(first.textSimple).not.toBe(first.textUthmani);
  });

  it('answers empty for a surah number that is not a surah', async () => {
    expect(await getSurahVerses(0)).toEqual([]);
    expect(await getSurahVerses(SURAH_COUNT + 1)).toEqual([]);
  });
});

describe('surah metadata', () => {
  it('reads a row and maps it', async () => {
    const meta = await getSurahMetadata(2);
    expect(meta).toEqual({
      number: 2,
      nameArabic: 'البقرة',
      nameEnglish: 'The Cow',
      nameTransliteration: 'Al-Baqarah',
      verseCount: 286,
      revelationType: 'medinan',
      order: 87,
    });
  });

  it('answers null for a number that is not a surah', async () => {
    expect(await getSurahMetadata(115)).toBeNull();
  });

  it('agrees with quran-data for all 114 — which is what lets the UI read either', async () => {
    // `read.tsx` takes the CURRENT surah's title from the database (it describes the rows on
    // screen) and the NEXT surah's name from `SURAH_METADATA` (nothing has loaded it yet). That
    // split is only honest while the two sources agree, so this is the assertion that keeps it so.
    for (const expected of SURAH_METADATA) {
      expect(await getSurahMetadata(expected.number)).toEqual(expected);
    }
  });

  it('covers every verse in the book across the 114 surahs', async () => {
    let total = 0;
    for (const meta of SURAH_METADATA) total += (await getSurahVerses(meta.number)).length;
    expect(total).toBe(TOTAL_VERSES);
  });
});

describe('verses by position — the bookmarks preview join (story 6-4)', () => {
  it('answers [] for empty input WITHOUT opening the database', async () => {
    // An empty bookmarks list must not pay the first-open asset import — or surface its failure —
    // for a query that can only answer nothing.
    expect(await getVersesForPositions([])).toEqual([]);
    expect(mockImports).not.toHaveBeenCalled();
  });

  it('reads a single position', async () => {
    const verses = await getVersesForPositions([{ surah: 2, verse: 255 }]);
    expect(verses).toHaveLength(1);
    expect(verses[0]).toMatchObject({ surah: 2, verse: 255 });
    expect(verses[0].textUthmani).toMatch(/\p{Script=Arabic}/u);
  });

  it('reads many positions across surahs in ONE query, pairs kept as PAIRS', async () => {
    const verses = await getVersesForPositions([
      { surah: 1, verse: 1 },
      { surah: 2, verse: 255 },
      { surah: 114, verse: 6 },
    ]);
    const keys = verses.map((v) => `${v.surah}:${v.verse}`).sort();
    // Lexicographic sort, so '114:6' orders before '1:1' (':' > '1').
    expect(keys).toEqual(['114:6', '1:1', '2:255']);
    // ⚠️ The cross-product trap: `surah IN (1,2) AND verse IN (1,255)` would also answer 1:255
    // (Al-Fatihah has 7 verses, so a wrong match needs surahs that share the verse numbers) —
    // here 2:1 and 1:255 must both be absent even though their halves each appear.
    expect(keys).not.toContain('2:1');
  });

  it('omits a pair that is not in the book — the caller keeps its row and degrades', async () => {
    const verses = await getVersesForPositions([
      { surah: 1, verse: 1 },
      { surah: 200, verse: 1 },
      { surah: 1, verse: 999 },
    ]);
    expect(verses.map((v) => `${v.surah}:${v.verse}`)).toEqual(['1:1']);
  });

  it('is usable whatever the input order — callers join by key, not by index', async () => {
    const forward = await getVersesForPositions([
      { surah: 1, verse: 1 },
      { surah: 3, verse: 3 },
    ]);
    const reversed = await getVersesForPositions([
      { surah: 3, verse: 3 },
      { surah: 1, verse: 1 },
    ]);
    const byKey = (rows: typeof forward) =>
      new Map(rows.map((v) => [`${v.surah}:${v.verse}`, v.textUthmani]));
    expect(byKey(reversed)).toEqual(byKey(forward));
    expect(byKey(forward).size).toBe(2);
  });

  it('serves an input LARGER than one query chunk — the parameter-ceiling guard', async () => {
    // ⚠️ Two bound params per pair against SQLite's compile-flag `SQLITE_MAX_VARIABLE_NUMBER`
    // (999 historically): an unchunked 486-pair query is 972 params and lives one bookmark from
    // the cliff, and the throw would land in the preview join's silent catch — every preview
    // gone for exactly the heaviest bookmarkers. 486 spans two chunks of 400.
    const pairs = [
      ...Array.from({ length: 286 }, (_, i) => ({ surah: 2, verse: i + 1 })),
      ...Array.from({ length: 200 }, (_, i) => ({ surah: 3, verse: i + 1 })),
    ];
    const verses = await getVersesForPositions(pairs);
    expect(verses).toHaveLength(486);
    const keys = new Set(verses.map((v) => `${v.surah}:${v.verse}`));
    expect(keys.has('2:1')).toBe(true);
    expect(keys.has('2:286')).toBe(true); // the last pair of chunk one's surah
    expect(keys.has('3:200')).toBe(true); // deep inside the SECOND chunk
  });

  it('returns the same bytes the per-surah read path returns', async () => {
    // The two accessors must agree — a preview that differs from the reading surface would be a
    // second rendering of the Quran text.
    const [viaPosition] = await getVersesForPositions([{ surah: 1, verse: 1 }]);
    const viaSurah = (await getSurahVerses(1))[0];
    expect(viaPosition).toEqual(viaSurah);
  });
});

describe('opening', () => {
  it('imports the asset ONCE and reuses the connection', async () => {
    await getSurahVerses(1);
    await getSurahVerses(2);
    await getSurahMetadata(3);
    expect(mockImports).toHaveBeenCalledTimes(1);
  });

  it('shares one import across concurrent first calls', async () => {
    await Promise.all([getSurahVerses(1), getSurahVerses(2), getSurahMetadata(1)]);
    expect(mockImports).toHaveBeenCalledTimes(1);
  });

  it('does NOT cache a failed open, so the error state’s retry actually retries', async () => {
    // ⚠️ THE REGRESSION THIS GUARDS: caching the in-flight promise unconditionally. The reading
    // screen's error state offers a retry; if the rejected open were remembered, that button
    // would replay the stored failure forever and the reader could never recover from a transient
    // asset-import failure without relaunching.
    mockState.importFailure = new Error('asset missing');
    await expect(getSurahVerses(1)).rejects.toThrow('asset missing');
    mockState.importFailure = null;
    const verses = await getSurahVerses(1);
    expect(verses).toHaveLength(7);
    expect(mockImports).toHaveBeenCalledTimes(2);
  });

  it('CLOSES the connection when the read-only PRAGMA rejects, rather than leaking it', async () => {
    // ⚠️ `openDatabaseSync` CAN SUCCEED AND THE FIRST STATEMENT STILL FAIL — a locked file, a
    // corrupt page, a native module that answers the open and then does not. Without the `try`,
    // that path threw away a LIVE connection with no reference to it: the module had no handle to
    // close, and the reading screen's error state offers a RETRY, so every press opened another
    // one on the same file. Story 6-1 review.
    mockState.pragmaFailure = new Error('database is locked');
    await expect(getSurahVerses(1)).rejects.toThrow('database is locked');
    expect(mockClosed).toHaveLength(1);

    // …and the REAL failure is what the caller gets — not a close error wearing its clothes — and
    // the retry still works, because a failed open is not cached.
    mockState.pragmaFailure = null;
    expect(await getSurahVerses(1)).toHaveLength(7);
  });

  it('asks SQLite itself to refuse writes on the connection', async () => {
    // ⚠️ WHAT IS ASSERTED IS THAT THE PRAGMA IS ISSUED, AND THE HONEST REASON IS THAT THE DRIVER
    // HERE IS ALREADY READ-ONLY. `expo-sqlite` has NO `readOnly` open option — `SQLiteOpenOptions`
    // is `{ enableChangeListener, useNewConnection, finalizeUnusedStatementsBeforeClosing,
    // libSQLOptions }` — so `PRAGMA query_only = ON` is the whole runtime guarantee, and dropping
    // that line is the regression. Proving a write throws would need a WRITABLE handle on the
    // shipped Quran database inside a test run, which is not a trade worth making for a stronger
    // assertion: the non-negotiable is that no runtime path mutates the text, and a test that
    // opens the file for writing to demonstrate it is the same risk wearing a proof.
    await getSurahVerses(1);
    expect(mockExeced).toContain('PRAGMA query_only = ON;');
    // Anti-vacuity: the module sends nothing else through the exec door — no DDL, no migration,
    // no `PRAGMA journal_mode`. One statement is the entire write-capable surface.
    expect(mockExeced).toHaveLength(1);
  });
});
