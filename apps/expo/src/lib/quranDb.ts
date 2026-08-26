/**
 * THE READ PATH — the app's first and only door to the bundled Quran text (story 6-1).
 *
 * `apps/expo/src/data/quran.db` has shipped in every build since story 5-1 and, until this
 * module, **nothing had ever opened it**: `expo-sqlite` was a dependency with zero call sites,
 * `metro.config.js` put `db` in `assetExts` for a file nobody required, and `app.json`'s
 * `expo-asset` plugin bundled 4.2 MB that no code path could reach. So this module is not a
 * wrapper over a working thing — it is the thing.
 *
 * ── ⚠️ EVERY CALL IS ASYNC, AND ON WEB THE SYNC ONES RETURN TRUNCATED GARBAGE ────────────────
 *
 * `expo-sqlite@56.0.5`'s WEB backend runs SQLite in a worker and serves `*Sync` calls over a
 * `SharedArrayBuffer`, writing the result's byte length into a 4-byte header first. It writes that
 * header with `resultArray.set(new Uint32Array([length]), 0)` — and `Uint8Array.prototype.set`
 * converts ELEMENT-WISE, so a `Uint32Array` source writes ONE byte. The length arrives as
 * `length & 0xFF`. `web/WorkerChannel.ts:42` for the write, `:141` for the read.
 *
 * Measured in the browser during this story: `getAllSync` for Al-Fatiha produced ~1,800 bytes of
 * JSON, the header said 1800 & 0xFF = **8**, and `JSON.parse` died with "Unterminated string in
 * JSON at position 8". Any result whose length is not under 256 bytes is silently cut — so the
 * failure scales with how much text you ask for, which for a Quran reader is always.
 *
 * The ASYNC methods do not use that channel at all (they `postMessage` and structured-clone the
 * result), so `getAllAsync` / `getFirstAsync` / `execAsync` are the only safe spellings here.
 * ⚠️ **Do not "simplify" these to the sync ones.** They are correct on iOS and Android, they
 * type-check identically, and every test in this repo would stay green — the platform Electron
 * wraps is the one that breaks. Async is also the better shape on native: `getAllSync` for
 * Al-Baqarah's 286 rows blocks the JS thread, which is the frame-drop this story must avoid.
 *
 * ── Read-only, twice over ────────────────────────────────────────────────────────────────────
 *
 * ⚠️ `expo-sqlite` HAS NO `readOnly` OPEN FLAG. `SQLiteOpenOptions` is
 * `{ enableChangeListener, useNewConnection, finalizeUnusedStatementsBeforeClosing, libSQLOptions }`
 * and nothing else — so "open it read-only" cannot be expressed the way `scripts/verify-quran.ts`
 * expresses it to `node:sqlite`. (And that gate's own trap is worth remembering: `node:sqlite`
 * SILENTLY IGNORES unknown constructor options, so Bun's `{ readonly: true }` opened the shipped
 * database read-WRITE. An option that is merely absent here is the honest version of the same
 * situation.)
 *
 * Two things stand in for the flag:
 *   1. **`PRAGMA query_only = ON`** on the connection — SQLite itself then refuses every INSERT,
 *      UPDATE, DELETE and DDL statement on this handle, whatever calls it.
 *   2. **The module's surface.** Only `getAllAsync` / `getFirstAsync` with `SELECT` text leave
 *      this file, and the `SQLiteDatabase` handle is never exported. There is no `exec` door.
 *
 * That matters because `pnpm verify` covers `uthmani_text` ONLY — `simple_text`, `translations`
 * and the 8.2 MB mushaf layouts have no baseline at all, so a runtime mutation of any of them
 * would pass the integrity gate clean. The non-negotiable is enforced here by there being no way
 * to write, not downstream by a hash.
 *
 * ── snake_case in, camelCase out ─────────────────────────────────────────────────────────────
 *
 * The database columns are `surah_number` / `verse_number` / `uthmani_text` / `simple_text`;
 * `quran-data`'s `Verse` and `Surah` types are camelCase and were **produced by nothing** before
 * this module. The mapping is this file's job and exists in exactly one place, so a column rename
 * breaks one function rather than every screen.
 *
 * ── Why the asset is imported into the SQLite directory ──────────────────────────────────────
 *
 * A bundled `.db` lives in the app bundle (iOS) or inside the APK (Android), neither of which
 * SQLite can open for writing — and `openDatabaseSync` opens READWRITE|CREATE, so pointing it at
 * the asset path fails rather than degrading. `importDatabaseFromAssetAsync` is upstream's own
 * implementation of `<SQLiteProvider assetSource={…}>`: it resolves the asset, then asks the
 * native module to copy it into the SQLite directory once. We use the imperative form because the
 * provider is a React component and `lint:layers` rule 2 keeps `lib/` free of the view layer —
 * and because a screen that must render an error state for a corrupt database is better served by
 * a rejected promise than by a Suspense boundary.
 *
 * ⚠️ `forceOverwrite` IS LEFT AT ITS DEFAULT (`false`), WHICH MEANS THE COPY IS MADE ONCE PER
 * INSTALL. If a future story ships a corrected `quran.db`, the copy already on disk WINS and the
 * fix never reaches an existing reader — flip `forceOverwrite` (or version the database name) in
 * the story that changes the file. Nothing here can detect it: the integrity gate runs at build
 * time against the repo's copy, not against the device's.
 */

import { importDatabaseFromAssetAsync, openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';
import type { Surah, Verse } from 'quran-data';

/**
 * The name the bundled database is copied to inside the SQLite directory.
 *
 * ⚠️ CHANGING IT ORPHANS THE OLD COPY rather than replacing it — see the `forceOverwrite` warning
 * in the header. That is the sanctioned way to ship a corrected database, and it costs the old
 * file's disk until the app is reinstalled.
 */
export const QURAN_DATABASE_NAME = 'quran.db';

/** Rows exactly as the `verses` table stores them. Never leaves this module. */
interface VerseRow {
  surah_number: number;
  verse_number: number;
  uthmani_text: string;
  simple_text: string;
}

/** Rows exactly as the `surah_metadata` table stores them. Never leaves this module. */
interface SurahRow {
  surah_number: number;
  name_arabic: string;
  name_english: string;
  name_transliteration: string;
  verse_count: number;
  revelation_type: string;
  revelation_order: number;
}

function toVerse(row: VerseRow): Verse {
  return {
    surah: row.surah_number,
    verse: row.verse_number,
    textUthmani: row.uthmani_text,
    textSimple: row.simple_text,
  };
}

function toSurah(row: SurahRow): Surah {
  return {
    number: row.surah_number,
    nameArabic: row.name_arabic,
    nameEnglish: row.name_english,
    nameTransliteration: row.name_transliteration,
    verseCount: row.verse_count,
    // The column carries a CHECK constraint limiting it to these two values, so the cast is a
    // restatement of a database invariant rather than a guess. A row that violated it could not
    // have been inserted by the pipeline.
    revelationType: row.revelation_type as Surah['revelationType'],
    order: row.revelation_order,
  };
}

/** The opened handle, once. Never exported — see the header's second read-only guarantee. */
let handle: SQLiteDatabase | null = null;
/** The in-flight open, so concurrent callers share one import + one connection. */
let opening: Promise<SQLiteDatabase> | null = null;

/**
 * Open the bundled database, importing the asset on first use.
 *
 * ⚠️ THE FAILED OPEN IS NOT CACHED. `opening` is cleared on rejection so a retry — which is what
 * the reading screen's error state offers — actually re-attempts rather than replaying the stored
 * failure forever. A successful open is cached for the process.
 */
async function openQuranDb(): Promise<SQLiteDatabase> {
  if (handle) return handle;
  if (!opening) {
    opening = (async () => {
      await importDatabaseFromAssetAsync(QURAN_DATABASE_NAME, {
        assetId: require('@/data/quran.db'),
      });
      const opened = openDatabaseSync(QURAN_DATABASE_NAME);
      // See the header: this is the closest thing to a read-only open flag that exists here.
      await opened.execAsync('PRAGMA query_only = ON;');
      handle = opened;
      return opened;
    })().catch((error: unknown) => {
      opening = null;
      throw error;
    });
  }
  return opening;
}

/**
 * Every verse of one surah, in order.
 *
 * Returns an empty array for a surah number outside 1–114 rather than throwing: an out-of-range
 * request is a caller bug the screen renders as "no verses", not a corrupt database.
 */
export async function getSurahVerses(surah: number): Promise<Verse[]> {
  const db = await openQuranDb();
  const rows = await db.getAllAsync<VerseRow>(
    'SELECT surah_number, verse_number, uthmani_text, simple_text FROM verses WHERE surah_number = ? ORDER BY verse_number',
    surah
  );
  return rows.map(toVerse);
}

/**
 * One surah's metadata, or `null` if the number is not a surah.
 *
 * ⚠️ READ FROM THE DATABASE, NOT FROM `quran-data`'s `SURAH_METADATA`, and the duplication is
 * deliberate. The two are generated from the same pipeline, so they agree today — but the reading
 * surface's title has to describe the rows it is actually showing. Sourcing the name from a
 * compile-time table while the verses come from the shipped file is how a title and its content
 * drift apart with nothing to notice; `quranDb.test.ts` asserts the two agree for all 114.
 */
export async function getSurahMetadata(surah: number): Promise<Surah | null> {
  const db = await openQuranDb();
  const row = await db.getFirstAsync<SurahRow>(
    'SELECT surah_number, name_arabic, name_english, name_transliteration, verse_count, revelation_type, revelation_order FROM surah_metadata WHERE surah_number = ?',
    surah
  );
  return row ? toSurah(row) : null;
}

/**
 * Drop the cached handle. **Tests only** — there is no runtime reason to close the database, and
 * closing it mid-session would turn the next verse read into a reopen.
 */
export function __resetQuranDbForTests(): void {
  handle = null;
  opening = null;
}
