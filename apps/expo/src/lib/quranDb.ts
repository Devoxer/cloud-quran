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
 * SQLite can open for writing — and the open is READWRITE|CREATE, so pointing it at
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

import {
  defaultDatabaseDirectory,
  importDatabaseFromAssetAsync,
  openDatabaseAsync,
  type SQLiteDatabase,
} from 'expo-sqlite';
import type { Surah, Verse } from 'quran-data';
import { packFileName } from '@/constants/packs';

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
 *
 * ⚠️ AND A HALF-OPEN IS CLOSED RATHER THAN DROPPED. `openDatabaseAsync` can succeed and the PRAGMA
 * still reject — a locked file, a corrupt page, a native module that answers the open and then
 * fails the first statement. Without the `try`, that path throws away a LIVE connection with no
 * reference to it: the module has no handle to close, and the error state's retry opens another
 * one on the same file, every press. Story 6-1 review.
 */
async function openQuranDb(): Promise<SQLiteDatabase> {
  if (handle) return handle;
  if (!opening) {
    opening = (async () => {
      await importDatabaseFromAssetAsync(QURAN_DATABASE_NAME, {
        assetId: require('@/data/quran.db'),
      });
      // ⚠️ `openDatabaseAsync`, NEVER `openDatabaseSync` — AND THAT IS THE SAME WEB DEFECT THE
      // READS ABOVE ARE ASYNC FOR, caught one layer higher. Story 6-1 made every QUERY async
      // because `expo-sqlite@56`'s web backend serves `*Sync` calls over a `SharedArrayBuffer`
      // whose byte-length write truncates to `length & 0xFF`; it left the OPEN sync, which walks
      // into the identical channel. Measured 2026-09-10: `/` and `/read` rendered the "Quran text
      // could not be opened" surface with `Error: invokeWorkerSync`, so the web build has shown no
      // Quran text since 6-1 and every web smoke since has exercised chrome and transport only.
      const opened = await openDatabaseAsync(QURAN_DATABASE_NAME);
      try {
        // See the header: this is the closest thing to a read-only open flag that exists here.
        await opened.execAsync('PRAGMA query_only = ON;');
      } catch (error) {
        // The close is best-effort by design: the caller is already being handed the REAL
        // failure, and a close that also fails must not replace it with a less useful one.
        await opened.closeAsync().catch(() => {});
        throw error;
      }
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
 * The verses at the given `(surah, verse)` positions — the bookmarks list's preview join
 * (story 6-4).
 *
 * ONE query for the whole list, not a read per row: the bookmarks screen renders every row's
 * preview in a single pass, and N round-trips through the async bridge is the shape that makes a
 * list stutter. Row-value `IN` keeps the pair a PAIR in SQL exactly as `usePosition` keeps it one
 * in the app — `surah IN (…) AND verse IN (…)` would match the cross product.
 *
 * ⚠️ EMPTY INPUT ANSWERS `[]` WITHOUT OPENING THE DATABASE. An empty bookmarks list must not pay
 * the first-open asset import (or surface its failure) for a query that can only answer nothing.
 *
 * A position that is not in the book is simply ABSENT from the result — the caller keeps its row
 * and degrades the preview (never drops the row; the pre-fork list silently hid orphans forever,
 * decided against in 6-4). Order of the result is the database's, not the input's: callers join
 * by key, so input order carries no meaning here.
 */
/**
 * Two bound parameters per pair, so the input is CHUNKED against SQLite's host-parameter
 * ceiling — `SQLITE_MAX_VARIABLE_NUMBER` is a compile flag (999 historically, 32766 on modern
 * builds) and expo-sqlite does not document which one each platform ships. 400 pairs = 800
 * parameters clears the older floor with room; without the chunk, the heaviest bookmarkers are
 * exactly the readers whose whole preview column would vanish behind one thrown query.
 */
const POSITIONS_PER_QUERY = 400;

export async function getVersesForPositions(
  pairs: readonly { surah: number; verse: number }[]
): Promise<Verse[]> {
  if (pairs.length === 0) return [];
  const db = await openQuranDb();
  const rows: VerseRow[] = [];
  for (let i = 0; i < pairs.length; i += POSITIONS_PER_QUERY) {
    const chunk = pairs.slice(i, i + POSITIONS_PER_QUERY);
    const placeholders = chunk.map(() => '(?, ?)').join(', ');
    rows.push(
      ...(await db.getAllAsync<VerseRow>(
        `SELECT surah_number, verse_number, uthmani_text, simple_text FROM verses WHERE (surah_number, verse_number) IN (VALUES ${placeholders})`,
        ...chunk.flatMap((p) => [p.surah, p.verse])
      ))
    );
  }
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
 * The translation the search corpus reads.
 *
 * ⚠️ HARDCODED, AND HONESTLY SO: the `translations` table has a `language` column and exactly ONE
 * value in it — `'en'`, 6,236 rows, one per verse (`scripts/prepare-data.ts:208`). Threading the
 * UI language through would be a parameter whose only legal argument is this string, and the
 * first day a second translation ships it has to be a reader PREFERENCE anyway, not the interface
 * language. Named rather than inlined so that story has one place to look.
 */
const SEARCH_TRANSLATION_LANGUAGE = 'en';

/** A verse plus its translation — the search corpus's row. Never rendered as-is. */
export interface SearchableVerse extends Verse {
  /** The bundled translation, or `null` when the join found none for this verse. */
  translation: string | null;
}

/** The joined row, exactly as SQLite answers it. Never leaves this module. */
interface SearchRow extends VerseRow {
  translation: string | null;
}

/**
 * Every verse in the book with its translation — the whole corpus, in ONE query (story 6-7).
 *
 * ⚠️ THIS IS THE READER THAT MAKES A SEARCH POSSIBLE WITHOUT TOUCHING THE SCHEMA, AND THAT IS THE
 * point of it. FTS5 is not available here twice over: the connection runs `PRAGMA query_only = ON`
 * (see `openQuranDb`), so no virtual table can be created at runtime at all — and building one at
 * pipeline time instead walks into `forceOverwrite: false` (this file's header), where the copy
 * already on a reader's disk wins and a rebuilt database never reaches anybody who has opened the
 * app before. That defect is green on a fresh simulator and broken for every existing install. So
 * the corpus is normalised in memory by `features/search`, and this story ships to existing
 * installs on day one.
 *
 * ⚠️ IT IS A FULL TABLE SCAN AND IT IS PAID EXACTLY ONCE. 6,236 rows, ~2.2 M characters of source text (704 K Uthmani + 679 K simple + 855 K translation), ~680 KB
 * per Arabic column; `useSearchCorpus` memoises the result in module scope and nothing calls this
 * until the reader opens search. Do NOT move it to boot — an unopened search must cost nothing.
 *
 * ⚠️ `LEFT JOIN`, NOT `JOIN`. The translation is a decoration on a row whose Arabic is the point;
 * an inner join would silently drop a verse from the searchable Quran because its English was
 * missing. `null` is what a caller gets, and `features/search` treats that as "no translation to
 * match against", never as "no verse".
 */
export async function getAllVersesForSearch(): Promise<SearchableVerse[]> {
  const db = await openQuranDb();
  const rows = await db.getAllAsync<SearchRow>(
    'SELECT v.surah_number, v.verse_number, v.uthmani_text, v.simple_text, t.text AS translation ' +
      'FROM verses v LEFT JOIN translations t ON t.surah_number = v.surah_number ' +
      'AND t.verse_number = v.verse_number AND t.language = ? ' +
      'ORDER BY v.surah_number, v.verse_number',
    SEARCH_TRANSLATION_LANGUAGE
  );
  return rows.map((row) => ({ ...toVerse(row), translation: row.translation }));
}

// ─── Content packs (story 8-2) ───────────────────────────────────────────────────────────────
//
// ⚠️ PACK HANDLES LIVE HERE BECAUSE `lint:layers` RULE 8 SAYS THEY MUST. `expo-sqlite` may be
// imported, and a connection opened, in exactly ONE module — this one. A pack is not the Quran
// text, but it is opened by the same driver, and a second door onto that driver is a second door
// onto `quran.db`: nothing about `openDatabaseAsync('quran.db')` written in a feature would fail
// to typecheck, lint or render, and `pnpm verify` hashes the REPO's copy rather than the device's.
//
// Everything below is `*Async` for the header's reason (web truncates every `*Sync` result to
// `length & 0xFF`) and read-only for the same two reasons the Quran handle is: `PRAGMA query_only`
// on the connection, and no handle and no `exec` door leaving this file.

/**
 * The directory `expo-sqlite` opens databases by NAME from — `{document}/SQLite` on both native
 * platforms, as a `file://` uri the `expo-file-system` `Directory`/`File` classes accept.
 *
 * ⚠️ IT IS READ FROM `expo-sqlite`, NEVER SPELLED OUT. The pack installer has to put a file
 * exactly where the opener will look for it, and a hand-written `{document}/SQLite` would be a
 * second definition of the same path that the first upstream change splits silently. `null` on
 * web, where the constant does not exist and packs are unsupported anyway.
 *
 * ⚠️ A FUNCTION RATHER THAN A MODULE-SCOPE CONST, AND THAT IS NOT A STYLE CHOICE. As a const it
 * read a NATIVE constant at module-evaluation time — on the boot path, for a value only the
 * content screen ever wants — and it was therefore unobservable from a test, which is how the
 * pack read path ended up with no coverage at all. (Story 8-2 review, V2.)
 */
export function sqliteDirectoryUri(): string | null {
  const raw: unknown = defaultDatabaseDirectory;
  if (typeof raw !== 'string' || raw.length === 0) return null;
  return raw.startsWith('file://') ? raw : `file://${raw}`;
}

/** A pack row exactly as the `entries` table stores it. Never leaves this module. */
interface PackEntryRow {
  surah_number: number;
  verse_number: number;
  text: string;
  footnotes: string | null;
}

/** One pack row, in the app's shape. The `footnotes` column is part of the edition, never dropped. */
export interface PackEntry {
  surah: number;
  verse: number;
  text: string;
  footnotes: string | null;
}

function toPackEntry(row: PackEntryRow): PackEntry {
  return {
    surah: row.surah_number,
    verse: row.verse_number,
    text: row.text,
    footnotes: row.footnotes,
  };
}

/** A pack asked for before it was opened. A STATE the caller degrades on, not a crash. */
export class PackNotOpenError extends Error {
  readonly packId: string;
  constructor(packId: string) {
    super(`Pack ${packId} is not open`);
    this.name = 'PackNotOpenError';
    this.packId = packId;
  }
}

/** Open pack handles, by pack id. One per id: a pack has exactly one installed version. */
const packHandles = new Map<string, { version: number; db: SQLiteDatabase }>();
/**
 * In-flight opens, so concurrent callers share one connection (the Quran handle's discipline).
 *
 * ⚠️ KEYED BY `id@version`, NEVER BY id ALONE. Keyed by id, a concurrent `openPack(id, 1)` and
 * `openPack(id, 2)` share ONE pending open — and the second caller then files v1's handle under
 * `{version: 2}`, so every later read goes to the wrong edition while the map says otherwise.
 * That is the believable-wrong-value family this repo keeps paying for; the version is part of
 * the identity of the thing being opened, so it is part of the key. (Story 8-2 review, C3.)
 */
const packOpening = new Map<string, Promise<SQLiteDatabase>>();

/**
 * Opens this handle-map generation. Bumped by `closePack` and by the test reset.
 *
 * ⚠️ IT IS WHAT STOPS A DELETE LOSING A RACE WITH A HYDRATION. `closePack` can land while an
 * `openPack` is parked on its `await`; without a generation the resumed open registers a handle
 * onto a file the delete is about to remove, and the reader is told the pack is gone while a live
 * connection keeps answering from it. A resumed open whose generation has moved closes what it
 * opened and records nothing. (Story 8-2 review, C3.)
 */
let packGeneration = 0;

const openKey = (id: string, version: number): string => `${id}@${version}`;

/** Open one file by name, read-only, closing a half-open rather than dropping it. */
async function openReadOnly(fileName: string): Promise<SQLiteDatabase> {
  const opened = await openDatabaseAsync(fileName);
  try {
    await opened.execAsync('PRAGMA query_only = ON;');
  } catch (error) {
    // Best-effort, and for `openQuranDb`'s reason: the caller is being handed the REAL failure
    // and a close that also fails must not replace it with a less useful one.
    await opened.closeAsync().catch(() => {});
    throw error;
  }
  return opened;
}

/**
 * Open an installed pack. Idempotent; a different version of the same id replaces the handle.
 *
 * ⚠️ THE FAILED OPEN IS NOT CACHED, exactly as `openQuranDb` does not cache one: the content
 * screen's retry has to re-attempt rather than replay a stored failure forever.
 */
export async function openPack(id: string, version: number): Promise<void> {
  const existing = packHandles.get(id);
  if (existing) {
    if (existing.version === version) return;
    await closePack(id);
  }
  const key = openKey(id, version);
  let pending = packOpening.get(key);
  if (!pending) {
    pending = openReadOnly(packFileName(id, version)).catch((error: unknown) => {
      packOpening.delete(key);
      throw error;
    });
    packOpening.set(key, pending);
  }
  const startedAt = packGeneration;
  const db = await pending;
  packOpening.delete(key);
  // See `packGeneration`: a close or a delete landed while this open was parked, so the file this
  // handle points at is being removed. Close what we opened and register nothing.
  if (packGeneration !== startedAt) {
    await db.closeAsync().catch(() => {});
    return;
  }
  packHandles.set(id, { version, db });
}

/** Whether this pack has a live, readable handle right now. */
export function isPackReadable(id: string): boolean {
  return packHandles.has(id);
}

/**
 * Close a pack's handle and forget it.
 *
 * ⚠️ IT IS AWAITED BEFORE THE FILE IS DELETED OR REPLACED. Deleting a database SQLite still holds
 * open is how a removal becomes a phantom: the bytes go, the handle answers from its own page
 * cache, and the reader is told the pack is gone while it keeps rendering.
 *
 * ⚠️ IT ALSO DROPS ANY PENDING OPEN FOR THIS PACK. Clearing `packHandles` alone left the in-flight
 * promise in `packOpening`, so the next `openPack` awaited a connection onto the file this close
 * precedes the deletion of — and reused it forever. (Story 8-2 review, C3.)
 */
export async function closePack(id: string): Promise<void> {
  const entry = packHandles.get(id);
  packHandles.delete(id);
  packGeneration++;
  for (const key of [...packOpening.keys()]) {
    if (key.startsWith(`${id}@`)) packOpening.delete(key);
  }
  // A close that fails has already dropped the reference; there is nothing the caller can do
  // about it and the install/delete it precedes must still proceed.
  if (entry) await entry.db.closeAsync().catch(() => {});
}

/**
 * How many rows a pack FILE holds — the install-time truncation check, run on the `.part` file
 * before it is renamed into place.
 *
 * ⚠️ THIS IS THE HALF A DIGEST CANNOT DO. A short-but-well-formed build hashes to a perfectly
 * stable value and would agree with a baseline minted from it forever; the population is the only
 * thing that can say the pack is not all there. `verify-artifacts.ts:201-210` encodes the same
 * lesson for the bundled artifacts — a pack needs its own copy because it is verified on the
 * DEVICE, at install time.
 *
 * The handle is opened and closed here and never cached: this file is about to be renamed, and a
 * cached handle would be pointing at a path that no longer exists.
 */
export async function countPackRows(fileName: string): Promise<number> {
  const db = await openReadOnly(fileName);
  try {
    const row = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM entries');
    return row?.count ?? 0;
  } finally {
    await db.closeAsync().catch(() => {});
  }
}

/**
 * A pack's own description of itself — `id`, `title`, `source`, `sourceVersion`, `attribution`
 * and the rest, as `scripts/prepare-packs.ts` wrote them into `pack_meta`.
 *
 * ⚠️ IT IS WHAT MAKES AN INSTALLED PACK SELF-DESCRIBING OFFLINE. The catalogue is a NETWORK
 * document, and the frozen matrix says an installed pack must still list and still read with no
 * network at all. Caching the catalogue row in MMKV would be a second copy of the same facts that
 * can go stale against the file; the file carrying its own title cannot. It is also what the
 * QuranEnc grant needs: the attribution and the stated version travel WITH the bytes.
 */
export async function getPackMeta(id: string): Promise<Record<string, string>> {
  const entry = packHandles.get(id);
  if (!entry) throw new PackNotOpenError(id);
  const rows = await entry.db.getAllAsync<{ key: string; value: string }>(
    'SELECT key, value FROM pack_meta'
  );
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

/**
 * Every row of one surah from an installed pack, in order — the typed read (story 8-2).
 *
 * Rejects with `PackNotOpenError` when the pack is not open, which is a STATE the caller renders
 * ("not installed"), never an error surface. An out-of-range surah answers `[]`, the same answer
 * `getSurahVerses` gives for the same reason.
 */
export async function getPackSurah(id: string, surah: number): Promise<PackEntry[]> {
  const entry = packHandles.get(id);
  if (!entry) throw new PackNotOpenError(id);
  const rows = await entry.db.getAllAsync<PackEntryRow>(
    'SELECT surah_number, verse_number, text, footnotes FROM entries WHERE surah_number = ? ORDER BY verse_number',
    surah
  );
  return rows.map(toPackEntry);
}

/**
 * Drop the cached handle. **Tests only** — there is no runtime reason to close the database, and
 * closing it mid-session would turn the next verse read into a reopen.
 */
export function __resetQuranDbForTests(): void {
  handle = null;
  opening = null;
  packHandles.clear();
  packOpening.clear();
  packGeneration++;
}
