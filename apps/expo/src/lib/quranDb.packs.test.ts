/**
 * The PACK read path, against a fixture built with the pipeline's own DDL (story 8-2 review, V2).
 *
 * ⚠️ WHY THIS FILE EXISTS. Nothing executed `openPack`, `closePack`, `getPackMeta`, `getPackSurah`
 * or `countPackRows`, and nothing compared their SQL to the schema `scripts/prepare-packs.ts`
 * actually writes. Rename `entries.text` on either side — or drop `pack_meta` — and tsc, Biome,
 * `lint:layers` and the entire suite stay green while every install on a device fails at the row
 * count and every installed pack reads as broken, with no diagnosis anywhere. The two ends of this
 * contract are a build script and a runtime module that never meet; this is where they meet.
 *
 * ⚠️ THE FIXTURE IS BUILT FROM THE PIPELINE'S DDL, COPIED HERE DELIBERATELY. `prepare-packs.ts`
 * runs under `node` with `node:sqlite` and cannot be imported into a jest-expo suite (it executes
 * `main()` and talks to the network on import). So the DDL is restated below, and `PACK_DDL` is
 * asserted against the script's own source text — a mutation on either side reddens this file
 * rather than shipping. That is the anti-vacuity guard: a fixture matching a copy of the schema
 * proves nothing if the copy can drift.
 *
 * ⚠️ `expo-sqlite` IS REPLACED BY `node:sqlite`, exactly as `quranDb.test.ts` does it, and for the
 * same reasons: the native module cannot load under Jest, but the SQL, the parameter binding, the
 * column names and the row shapes are all still the real ones. Only the driver differs. The mock
 * implements the ASYNC methods only — the sync ones truncate to `length & 0xFF` on web.
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/** Where the fixture files live for this run. One directory, cleaned up at the end. */
const mockDir = mkdtempSync(join(tmpdir(), 'cq-packs-'));
/** Statements each handle was sent — how the read-only PRAGMA is observed. */
const mockExeced: string[] = [];
/** How many handles are open right now, plus a counter for the scratch files the web opener writes. */
const mockOpen = { count: 0, deserialized: 0 };
/** Live driver handles, closed after each test. */
const mockHandles: DatabaseSync[] = [];

jest.mock('expo-sqlite', () => {
  // biome-ignore lint/style/noCommonJs: a Jest factory cannot reference a hoisted import.
  const { DatabaseSync: Driver } = require('node:sqlite');
  // biome-ignore lint/style/noCommonJs: same.
  const { join: joinPath } = require('node:path');
  // biome-ignore lint/style/noCommonJs: same.
  const { writeFileSync } = require('node:fs');

  /** The real driver behind the async surface `lib/quranDb.ts` is allowed to use. */
  const wrap = (path: string) => {
    const db = new Driver(path);
    mockHandles.push(db);
    mockOpen.count++;
    let closed = false;
    return {
      execAsync: async (sql: string) => {
        mockExeced.push(sql);
        db.exec(sql);
      },
      getAllAsync: async (sql: string, ...params: unknown[]) => db.prepare(sql).all(...params),
      getFirstAsync: async (sql: string, ...params: unknown[]) =>
        db.prepare(sql).get(...params) ?? null,
      closeAsync: async () => {
        if (closed) return;
        closed = true;
        mockOpen.count--;
        db.close();
      },
    };
  };

  return {
    // ⚠️ A GETTER, NOT A VALUE. Jest hoists this factory above the `const mockDir` below it, so a
    // plain property would capture `undefined` at require time — which is exactly how
    // `sqliteDirectoryUri()` answered `null` and the whole directory contract went unchecked.
    get defaultDatabaseDirectory() {
      return mockDir;
    },
    importDatabaseFromAssetAsync: jest.fn(async () => {}),
    openDatabaseAsync: async (name: string) => wrap(joinPath(mockDir, name)),
    /**
     * ⚠️ THE WEB OPENER, MODELLED RATHER THAN MOCKED AWAY (story 8-3 review, V2). `webPack.test.ts`
     * replaces `openPackFromBytes` wholesale, so nothing executed the `PRAGMA query_only = ON` it
     * runs, the `COUNT(*)` it verifies with, or the supersede ordering — delete the pragma and the
     * web pack connection ships WRITABLE, a second ungated write door onto SQLite in the one place
     * rule 8 exists to keep read-only, with the whole suite green. `node:sqlite` has no
     * deserializer, so the bytes go to a scratch file and are opened from there: the SQL, the
     * pragma and the row shapes are all still the real ones, which is the only thing this proves.
     */
    deserializeDatabaseAsync: async (bytes: Uint8Array) => {
      const path = joinPath(mockDir, `deserialized-${mockOpen.deserialized++}.db`);
      writeFileSync(path, bytes);
      return wrap(path);
    },
  };
});

import { packFileName, packPartFileName } from '@/constants/packs';
import {
  __resetQuranDbForTests,
  closePack,
  countPackRows,
  getPackMeta,
  getPackRange,
  getPackSurah,
  isPackReadable,
  openPack,
  openPackFromBytes,
  PackNotOpenError,
  sqliteDirectoryUri,
} from './quranDb';

/**
 * The pack schema, verbatim from `scripts/prepare-packs.ts`.
 *
 * ⚠️ IT IS ASSERTED AGAINST THAT SCRIPT'S SOURCE BELOW. A copy of a schema that can drift from the
 * schema is worse than no fixture at all — it makes the suite agree with itself while the device
 * disagrees with both.
 */
const PACK_DDL = `
    CREATE TABLE pack_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE entries (
      surah_number INTEGER NOT NULL,
      verse_number INTEGER NOT NULL,
      text TEXT NOT NULL,
      footnotes TEXT,
      PRIMARY KEY (surah_number, verse_number)
    );
  `;

const PACK_ID = 'translation-fr-rashid';
const ATTRIBUTION = 'Traduction française : Rachid Maach. Source : QuranEnc.com (v1.0.3).';
const FIRST_AYAH = 'Au nom d’Allah, le Tout Miséricordieux, le Très Miséricordieux[1].';

/** Build a pack file the way the pipeline does: same DDL, same meta keys, ordered inserts. */
function buildFixturePack(fileName: string, rows: { surah: number; verse: number }[]): void {
  // Each case builds its own fixture from scratch; a leftover from the previous one would make
  // the DDL throw and, worse, let a case read rows it did not write.
  rmSync(join(mockDir, fileName), { force: true });
  const db = new DatabaseSync(join(mockDir, fileName));
  db.exec('PRAGMA journal_mode = DELETE');
  db.exec(PACK_DDL);
  const meta = db.prepare('INSERT INTO pack_meta (key, value) VALUES (?, ?)');
  for (const [key, value] of [
    ['id', PACK_ID],
    ['packVersion', '1'],
    ['type', 'translation'],
    ['language', 'fr'],
    ['languageName', 'Français'],
    ['title', 'Le Noble Coran — Rachid Maach'],
    ['source', 'QuranEnc'],
    ['sourceVersion', '1.0.3'],
    ['licenceId', 'quranenc-republication'],
    ['attribution', ATTRIBUTION],
  ]) {
    meta.run(key, value);
  }
  const entry = db.prepare(
    'INSERT INTO entries (surah_number, verse_number, text, footnotes) VALUES (?, ?, ?, ?)'
  );
  for (const row of rows) {
    entry.run(
      row.surah,
      row.verse,
      row.surah === 1 && row.verse === 1 ? FIRST_AYAH : `${row.surah}:${row.verse}`,
      row.surah === 1 && row.verse === 1 ? '[1] Une note.' : null
    );
  }
  db.close();
}

const ALL_ROWS = [
  { surah: 1, verse: 1 },
  { surah: 1, verse: 2 },
  { surah: 1, verse: 3 },
  { surah: 2, verse: 1 },
];

beforeEach(() => {
  __resetQuranDbForTests();
  mockExeced.length = 0;
  mockOpen.count = 0;
  buildFixturePack(packFileName(PACK_ID, 1), ALL_ROWS);
});

afterEach(() => {
  for (const db of mockHandles.splice(0)) {
    try {
      db.close();
    } catch {
      // Already closed by the module under test, which is the point of most of these cases.
    }
  }
});

afterAll(() => rmSync(mockDir, { recursive: true, force: true }));

describe('the schema this module reads', () => {
  it('is the schema the pipeline writes — asserted against its source, not assumed', () => {
    // ⚠️ THE ANTI-VACUITY GUARD. Without it, renaming a column in BOTH places keeps this file
    // green while every published pack becomes unreadable by every shipped build.
    const script = readFileSync(
      resolve(__dirname, '..', '..', '..', '..', 'scripts', 'prepare-packs.ts'),
      'utf8'
    );
    expect(script).toContain(PACK_DDL);
  });

  it('installs packs where expo-sqlite opens them BY NAME', () => {
    // The `directory` argument is unsupported on web, so the pack has to land in the default
    // database directory and be opened by name. `SQLITE_DIRECTORY_URI` is what the installer uses.
    expect(sqliteDirectoryUri()).toBe(`file://${mockDir}`);
    expect(packFileName(PACK_ID, 1)).toBe('translation-fr-rashid-v1.db');
    expect(packPartFileName(PACK_ID, 1)).toBe('translation-fr-rashid-v1.db.part');
  });
});

describe('opening a pack', () => {
  it('opens read-only, and says so', async () => {
    await openPack(PACK_ID, 1);
    expect(isPackReadable(PACK_ID)).toBe(true);
    expect(mockExeced).toContain('PRAGMA query_only = ON;');
  });

  it('refuses every write on the connection it hands out', async () => {
    await openPack(PACK_ID, 1);
    // The PRAGMA is not decoration: SQLite itself refuses the statement, whoever calls it.
    const handle = mockHandles[mockHandles.length - 1];
    expect(() => handle.exec("UPDATE entries SET text = 'x'")).toThrow();
  });

  it('opens once for repeated calls at the same version', async () => {
    await openPack(PACK_ID, 1);
    await openPack(PACK_ID, 1);
    expect(mockOpen.count).toBe(1);
  });

  it('does not share one pending open between two VERSIONS of the same pack', async () => {
    // ⚠️ THE C3 CASE. Keyed by id alone, these two share one in-flight promise and the second
    // caller files v1's handle under `{version: 2}` — every later read then comes from the wrong
    // edition while the map says otherwise.
    buildFixturePack(packFileName(PACK_ID, 2), [{ surah: 1, verse: 1 }]);
    await Promise.all([openPack(PACK_ID, 1), openPack(PACK_ID, 2)]);

    // Whichever landed last owns the handle, and it must be a handle onto THAT version's file.
    const rows = await getPackSurah(PACK_ID, 1);
    const meta = await getPackMeta(PACK_ID);
    expect(meta.id).toBe(PACK_ID);
    // v2's fixture holds one row; v1's holds three for surah 1. Either is fine — what is NOT
    // fine is a mix, which is what a shared promise produces.
    expect([1, 3]).toContain(rows.length);
    expect(await countPackRows(packFileName(PACK_ID, rows.length === 1 ? 2 : 1))).toBe(
      rows.length === 1 ? 1 : 4
    );
  });

  it('drops a pending open when the pack is closed underneath it', async () => {
    const opening = openPack(PACK_ID, 1);
    await closePack(PACK_ID);
    await opening;
    // ⚠️ THE DELETE-RACES-HYDRATION CASE. A resumed open whose generation has moved must register
    // nothing: a live handle onto a file being removed is a pack that keeps answering after the
    // reader was told it was gone.
    expect(isPackReadable(PACK_ID)).toBe(false);
    expect(mockOpen.count).toBe(0);
  });
});

describe('reading a pack', () => {
  it('maps snake_case columns onto the app shape, footnotes included', async () => {
    await openPack(PACK_ID, 1);
    const rows = await getPackSurah(PACK_ID, 1);

    expect(rows).toEqual([
      { surah: 1, verse: 1, text: FIRST_AYAH, footnotes: '[1] Une note.' },
      { surah: 1, verse: 2, text: '1:2', footnotes: null },
      { surah: 1, verse: 3, text: '1:3', footnotes: null },
    ]);
  });

  it('answers an empty array for a surah the pack does not cover', async () => {
    await openPack(PACK_ID, 1);
    expect(await getPackSurah(PACK_ID, 114)).toEqual([]);
  });

  it('reads the pack’s own metadata, which is what makes it self-describing offline', async () => {
    await openPack(PACK_ID, 1);
    const meta = await getPackMeta(PACK_ID);

    expect(meta.title).toBe('Le Noble Coran — Rachid Maach');
    expect(meta.languageName).toBe('Français');
    expect(meta.sourceVersion).toBe('1.0.3');
    // The grant's condition, carried WITH the bytes rather than in a catalogue a reader may not
    // be able to reach.
    expect(meta.attribution).toBe(ATTRIBUTION);
  });

  it('reports a pack that is not open as a STATE, not a crash', async () => {
    await expect(getPackSurah(PACK_ID, 1)).rejects.toBeInstanceOf(PackNotOpenError);
    await expect(getPackMeta(PACK_ID)).rejects.toBeInstanceOf(PackNotOpenError);
  });
});

describe('counting rows before the commit', () => {
  it('counts the `.part` file the installer is about to rename', async () => {
    buildFixturePack(packPartFileName(PACK_ID, 3), ALL_ROWS);
    expect(await countPackRows(packPartFileName(PACK_ID, 3))).toBe(4);
  });

  it('sees a TRUNCATED pack as short — the case a digest cannot catch', async () => {
    buildFixturePack(packPartFileName(PACK_ID, 4), [{ surah: 1, verse: 1 }]);
    expect(await countPackRows(packPartFileName(PACK_ID, 4))).toBe(1);
  });

  it('closes the handle it opened, so the file can be renamed', async () => {
    buildFixturePack(packPartFileName(PACK_ID, 5), ALL_ROWS);
    await countPackRows(packPartFileName(PACK_ID, 5));
    expect(mockOpen.count).toBe(0);
  });
});

describe('closing a pack', () => {
  it('closes the handle and forgets it', async () => {
    await openPack(PACK_ID, 1);
    await closePack(PACK_ID);

    expect(isPackReadable(PACK_ID)).toBe(false);
    expect(mockOpen.count).toBe(0);
    await expect(getPackSurah(PACK_ID, 1)).rejects.toBeInstanceOf(PackNotOpenError);
  });
});

/**
 * THE RANGE READ, AGAINST REAL SQL (story 8-3 review, V1).
 *
 * ⚠️ BOTH STUDY SUITES MOCK `getPackRange` AND ASSERT ONLY ITS ARGUMENTS, so its predicate was
 * executed by nothing. Rewrite it to the two-column `BETWEEN` form its own docblock warns against
 * and page 106 — 4:176 → 5:2, the page that turns An-Nisa over into Al-Ma'idah — matches the CROSS
 * PRODUCT instead: every ayah numbered 176…2 in both surahs, which is nothing. The sheet then
 * draws "Nothing for this ayah" under every line of every page that turns a surah over, which is a
 * statement about the installed PACK and is false. Shipped green on 3,012 tests.
 */
describe('reading a RANGE from a pack', () => {
  const ACROSS = [
    { surah: 1, verse: 1 },
    { surah: 1, verse: 2 },
    { surah: 1, verse: 3 },
    { surah: 2, verse: 1 },
    { surah: 2, verse: 2 },
    { surah: 2, verse: 3 },
  ];

  beforeEach(() => buildFixturePack(packFileName(PACK_ID, 1), ACROSS));

  it('spans a SURAH BOUNDARY — the case the two-column form cannot express', async () => {
    await openPack(PACK_ID, 1);
    const rows = await getPackRange(PACK_ID, { surah: 1, verse: 2 }, { surah: 2, verse: 2 });
    // MUTATION: `surah_number BETWEEN ? AND ? AND verse_number BETWEEN ? AND ?` answers
    // [1:2, 2:2] here and [] for a real mushaf page. The literal list is what separates them.
    expect(rows.map((row) => `${row.surah}:${row.verse}`)).toEqual(['1:2', '1:3', '2:1', '2:2']);
  });

  it('is INCLUSIVE at both ends, and ordered by the book', async () => {
    await openPack(PACK_ID, 1);
    const rows = await getPackRange(PACK_ID, { surah: 1, verse: 1 }, { surah: 2, verse: 3 });
    expect(rows.map((row) => `${row.surah}:${row.verse}`)).toEqual([
      '1:1',
      '1:2',
      '1:3',
      '2:1',
      '2:2',
      '2:3',
    ]);
    expect(rows[0].text).toBe(FIRST_AYAH);
    expect(rows[0].footnotes).toBe('[1] Une note.');
  });

  it('reads a single ayah as a range of one', async () => {
    await openPack(PACK_ID, 1);
    const rows = await getPackRange(PACK_ID, { surah: 2, verse: 2 }, { surah: 2, verse: 2 });
    expect(rows).toEqual([{ surah: 2, verse: 2, text: '2:2', footnotes: null }]);
  });

  it('answers [] for a range this edition has nothing in — not an error', async () => {
    await openPack(PACK_ID, 1);
    expect(await getPackRange(PACK_ID, { surah: 9, verse: 1 }, { surah: 9, verse: 9 })).toEqual([]);
  });

  it('rejects with PackNotOpenError when the pack is not open — a STATE, not a crash', async () => {
    await expect(
      getPackRange(PACK_ID, { surah: 1, verse: 1 }, { surah: 1, verse: 1 })
    ).rejects.toBeInstanceOf(PackNotOpenError);
  });
});

/**
 * THE WEB OPEN, AGAINST A REAL CONNECTION (story 8-3 review, V1/V2 + C1).
 *
 * Three things nothing executed: the read-only pragma on a deserialized handle, the row count that
 * refuses a truncated edition, and — the one that matters most — the ORDER in which a superseding
 * open touches the handle already registered under that id.
 */
describe('opening a pack from bytes', () => {
  /** The fixture file's bytes, which is what a web fetch would have in hand. */
  const bytesOf = (fileName: string) => new Uint8Array(readFileSync(join(mockDir, fileName)));

  it('opens READ-ONLY, and SQLite itself refuses a write on that handle', async () => {
    // MUTATION: delete the `PRAGMA query_only = ON`. Everything else in this file stays green and
    // the web pack connection ships writable — a second ungated write door onto SQLite.
    const result = await openPackFromBytes(PACK_ID, 1, bytesOf(packFileName(PACK_ID, 1)), 4);
    expect(result).toEqual({ ok: true });
    expect(isPackReadable(PACK_ID)).toBe(true);
    expect(mockExeced).toContain('PRAGMA query_only = ON;');
    // The pragma is not decoration: the driver enforces it, whatever the module's surface allows.
    const opened = mockHandles[mockHandles.length - 1];
    expect(() => opened.exec("UPDATE entries SET text = 'tampered'")).toThrow();
  });

  it('reads back through the SAME surface a native install uses', async () => {
    await openPackFromBytes(PACK_ID, 1, bytesOf(packFileName(PACK_ID, 1)), 4);
    expect((await getPackMeta(PACK_ID)).attribution).toBe(ATTRIBUTION);
    expect((await getPackSurah(PACK_ID, 1))[0].text).toBe(FIRST_AYAH);
  });

  it('REFUSES a short edition, and opens nothing', async () => {
    // The truncation check a digest structurally cannot do. `ALL_ROWS` is four; claim five.
    const result = await openPackFromBytes(PACK_ID, 1, bytesOf(packFileName(PACK_ID, 1)), 5);
    expect(result).toEqual({ ok: false, reason: 'rows', rows: 4 });
    expect(isPackReadable(PACK_ID)).toBe(false);
    expect(mockOpen.count).toBe(0);
  });

  it('⚠️ LEAVES A WORKING EDITION WORKING WHEN ITS REPLACEMENT IS REFUSED', async () => {
    // ⚠️ THIS IS STORY 8-2's REVIEW C1, ONE STORY LATER (8-3 review, C1). The first cut closed the
    // handle already open under this id and THEN opened and verified the new bytes — so a short v2
    // destroyed a working v1 on its way to failing, the session map still said v1 was held, and
    // every read threw `PackNotOpenError` for a source the reader had been using a second earlier,
    // with no control anywhere on web to clear it. MUTATION: move the close back above the open.
    await openPackFromBytes(PACK_ID, 1, bytesOf(packFileName(PACK_ID, 1)), 4);
    buildFixturePack(packFileName(PACK_ID, 2), [{ surah: 1, verse: 1 }]);

    const result = await openPackFromBytes(PACK_ID, 2, bytesOf(packFileName(PACK_ID, 2)), 4);
    expect(result).toEqual({ ok: false, reason: 'rows', rows: 1 });

    // v1 is still open and still answering — that is the whole case.
    expect(isPackReadable(PACK_ID)).toBe(true);
    expect((await getPackSurah(PACK_ID, 1)).map((row) => row.verse)).toEqual([1, 2, 3]);
  });

  it('supersedes on SUCCESS, and closes the edition it replaced', async () => {
    await openPackFromBytes(PACK_ID, 1, bytesOf(packFileName(PACK_ID, 1)), 4);
    expect(mockOpen.count).toBe(1);
    buildFixturePack(packFileName(PACK_ID, 2), [
      { surah: 1, verse: 1 },
      { surah: 1, verse: 2 },
    ]);

    expect(await openPackFromBytes(PACK_ID, 2, bytesOf(packFileName(PACK_ID, 2)), 2)).toEqual({
      ok: true,
    });
    expect((await getPackSurah(PACK_ID, 1)).map((row) => row.verse)).toEqual([1, 2]);
    // One handle, not two: the superseded connection is closed after the swap, never leaked.
    expect(mockOpen.count).toBe(1);
  });

  it('is a no-op at the SAME version — the bytes can only be the same verified build', async () => {
    await openPackFromBytes(PACK_ID, 1, bytesOf(packFileName(PACK_ID, 1)), 4);
    const before = mockOpen.deserialized;
    expect(await openPackFromBytes(PACK_ID, 1, bytesOf(packFileName(PACK_ID, 1)), 4)).toEqual({
      ok: true,
    });
    expect(mockOpen.deserialized).toBe(before);
  });
});
