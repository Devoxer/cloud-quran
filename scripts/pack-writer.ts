/**
 * The pack writer — the SQLite file a content pack IS, and the checks run on what goes into it
 * (stories 8-2, 8-5). `prepare-packs.ts` is the CLI around it; this module is importable, so the
 * write path is tested directly (`scripts/__tests__/tafsir-pipeline.test.mjs`).
 *
 * ⚠️ THE TWO SCHEMAS ARE VERBATIM, BECAUSE THE STATEMENT TEXT IS IN THE FILE. SQLite stores each
 * `CREATE TABLE` in `sqlite_master` exactly as written, so even the whitespace below is part of
 * every pack's digest — reformatting it would re-version every published pack for nothing.
 * `apps/expo/src/lib/quranDb.packs.test.ts` asserts both against this source.
 */

import { createHash } from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import type { Passage } from './qul.ts';
import type { UpstreamRow } from './quranenc.ts';

/**
 * The pack schema for one row per ayah — story 8-2's, unchanged. Every translation.
 */
export const TRANSLATION_DDL = `
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

/**
 * The pack schema for one row per PASSAGE (story 8-5) — tafsir, i'rab, meanings.
 *
 * ⚠️ THE SAME TABLE NAME, PLUS `last_verse`. A passage is stored ONCE, at its first ayah, with the
 * last ayah it covers in the same surah; the device reads "every passage that overlaps this range"
 * with {@link PASSAGE_RANGE_SQL}. Keeping `entries` means the row-count check is `COUNT(*) FROM
 * entries` for every pack type, and a handle learns which shape it holds from
 * `pragma_table_info('entries')`. A passage never crosses a surah and never overlaps another: the
 * readers split the first and merge the second (`scripts/qul.ts` § `assertPassageSpans`).
 */
export const PASSAGE_DDL = `
    CREATE TABLE pack_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE entries (
      surah_number INTEGER NOT NULL,
      verse_number INTEGER NOT NULL,
      last_verse INTEGER NOT NULL,
      text TEXT NOT NULL,
      footnotes TEXT,
      PRIMARY KEY (surah_number, verse_number)
    );
  `;

/**
 * The device's passage read (`apps/expo/src/lib/quranDb.ts` § `getPackRange`), restated so its
 * query plan can be tested against a real pack file: bound below by `(from.surah, 1)` so it is an
 * index RANGE on the primary key, never a scan from 1:1. Parameters: from.surah, to.surah,
 * to.verse, from.surah, from.verse.
 */
export const PASSAGE_RANGE_SQL =
  'SELECT surah_number, verse_number, last_verse, text, footnotes FROM entries ' +
  'WHERE (surah_number, verse_number) >= (?, 1) AND (surah_number, verse_number) <= (?, ?) ' +
  'AND (surah_number, last_verse) >= (?, ?) ' +
  'ORDER BY surah_number, verse_number';

/** The rows a pack is built from — one per ayah, or one per passage. */
export type PackInput =
  | { shape: 'ayah'; rows: UpstreamRow[] }
  | { shape: 'passage'; rows: Passage[] };

/** What a pack says about itself in `pack_meta`, in the order it is written. */
export interface PackMeta {
  id: string;
  type: string;
  language: string;
  direction: 'ltr' | 'rtl';
  languageName: string;
  languageNameEnglish: string;
  title: string;
  source: string;
  sourceKey: string;
  sourceVersion: string;
  licenceId: string;
  attribution: string;
}

/**
 * Write `outPath` from the rows.
 *
 * ⚠️ A TRANSLATION'S TEXT IS COPIED VERBATIM. QuranEnc's grant permits republication WITHOUT
 * modification, so this re-containers the rows and changes not one character of them. The footnote
 * column is carried too: it is part of the edition, and dropping it would be a modification by
 * subtraction. A passage arrives already converted from the upstream's HTML to plain paragraphs
 * (`scripts/qul.ts` § `convertTafsirHtml`) — the app renders no HTML.
 */
export function writePack(
  outPath: string,
  meta: PackMeta,
  packVersion: number,
  input: PackInput
): void {
  rmSync(outPath, { force: true });
  const db = new DatabaseSync(outPath);
  // ⚠️ NEVER WAL FOR A DISTRIBUTED FILE. A WAL database is not one file, and a reader opening it
  // has to be able to create `-wal`/`-shm` beside it. `DELETE` keeps the pack a single artifact.
  db.exec('PRAGMA journal_mode = DELETE');
  // Zero freed page space, the determinism pragma `prepare-data.ts:127-132` records: without it
  // stale bytes sit in the free list and the same inputs produce a different digest.
  db.exec('PRAGMA secure_delete = FAST');
  db.exec(input.shape === 'ayah' ? TRANSLATION_DDL : PASSAGE_DDL);

  const insertMeta = db.prepare('INSERT INTO pack_meta (key, value) VALUES (?, ?)');
  db.exec('BEGIN TRANSACTION');
  for (const [key, value] of [
    ['id', meta.id],
    ['packVersion', String(packVersion)],
    ['type', meta.type],
    ['language', meta.language],
    // ⚠️ THE DIRECTION TRAVELS WITH THE BYTES (story 8-4). Offline the catalogue is unreachable
    // and an installed pack describes itself from here — without it an Urdu pack read on a plane
    // would fall back to `ltr` and range every paragraph the wrong way.
    ['direction', meta.direction],
    // ⚠️ THE LANGUAGE'S OWN NAME, NOT JUST ITS CODE. Offline the catalogue is unreachable and a
    // pack describes itself from `pack_meta`; without this the shelf falls back to rendering the
    // BCP-47 code at a reader ("fr · 1.4 MB"), which is a machine value in a sentence of copy.
    // Measured on the emulator, 2026-09-18.
    ['languageName', meta.languageName],
    ['languageNameEnglish', meta.languageNameEnglish],
    ['title', meta.title],
    ['source', meta.source],
    ['sourceKey', meta.sourceKey],
    ['sourceVersion', meta.sourceVersion],
    ['licenceId', meta.licenceId],
    ['attribution', meta.attribution],
  ]) {
    insertMeta.run(key, value);
  }
  // Ordered inserts — the rows arrive ordered and are written in that order, so the file's
  // physical layout is a function of the data rather than of insertion whim.
  if (input.shape === 'ayah') {
    const insertEntry = db.prepare(
      'INSERT INTO entries (surah_number, verse_number, text, footnotes) VALUES (?, ?, ?, ?)'
    );
    for (const row of input.rows) {
      insertEntry.run(row.sura, row.aya, row.translation, row.footnotes ?? null);
    }
  } else {
    const insertPassage = db.prepare(
      'INSERT INTO entries (surah_number, verse_number, last_verse, text, footnotes) VALUES (?, ?, ?, ?, ?)'
    );
    for (const row of input.rows) {
      insertPassage.run(row.surah, row.verse, row.lastVerse, row.text, row.footnotes);
    }
  }
  db.exec('COMMIT');
  // Compacts the file and rewrites its pages in key order. Deterministic, and it is what keeps a
  // rebuilt pack byte-comparable to the one that shipped.
  db.exec('VACUUM');
  db.close();
}

/** The pack's own row count, read back from the built file — never from the input array. */
export function countPackRows(path: string): number {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const row = db.prepare('SELECT COUNT(*) AS count FROM entries').get() as unknown as {
      count: number;
    };
    return row.count;
  } finally {
    db.close();
  }
}

export const sha256OfFile = (path: string): string =>
  createHash('sha256').update(readFileSync(path)).digest('hex');

// ─── What goes in ────────────────────────────────────────────────────────────────────────────

/** An HTML entity or tag that survived conversion. Arabic-script `<<…>>` quotes are not tags. */
const LEFTOVER_MARKUP = /&[a-z][a-z0-9]*;|&#x?[0-9a-f]+;|<\/?[a-z][a-z0-9]*(?:\s[^<>]*)?>/i;

/**
 * Refuse a converted (passage) text that still holds markup. The app renders no HTML, so a
 * `&laquo;` or a `<span>` that slipped through would be printed at a reader verbatim.
 * Translations are not checked: their text is QuranEnc's, copied without modification.
 */
export function assertNoMarkup(id: string, input: PackInput): void {
  if (input.shape !== 'passage') return;
  for (const row of input.rows) {
    for (const text of [row.text, row.footnotes ?? '']) {
      const hit = LEFTOVER_MARKUP.exec(text);
      if (hit) {
        throw new Error(
          `${id}: ${row.surah}:${row.verse} still holds markup "${hit[0]}" — the HTML conversion ` +
            'missed it, and the app would print it as text.'
        );
      }
    }
  }
}

/** Letters of the scripts written right to left. */
const RTL_LETTER =
  /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Nko}\p{Script=Syriac}\p{Script=Thaana}]/u;
const LETTER = /\p{L}/u;

/**
 * The direction a text's letters say it runs in, from a sample of its rows — or `null` with too
 * few letters to say.
 */
export function dominantDirection(texts: readonly string[]): 'ltr' | 'rtl' | null {
  let rtl = 0;
  let total = 0;
  for (const text of texts) {
    for (const char of text) {
      if (!LETTER.test(char)) continue;
      total++;
      if (RTL_LETTER.test(char)) rtl++;
    }
  }
  if (total < 50) return null;
  return rtl * 2 > total ? 'rtl' : 'ltr';
}

/**
 * Refuse a pack whose stated `direction` disagrees with its own letters.
 *
 * ⚠️ THE DIRECTION IS DECLARED BY A TABLE FOR QUL (`scripts/qul.ts` § `directionOf`), AND A TABLE
 * CAN BE WRONG. A Sorani pack declared `ltr` ranges every paragraph the wrong way on every device,
 * and nothing else in the pipeline reads the text to notice. A sample of up to 200 rows, spread
 * over the book, is enough: a translation or tafsir quotes the Quran, but its own language
 * dominates. (Story 8-5 review.)
 */
export function assertDirection(id: string, declared: 'ltr' | 'rtl', input: PackInput): void {
  const texts: string[] =
    input.shape === 'ayah'
      ? input.rows.map((row) => row.translation)
      : input.rows.map((row) => row.text);
  const step = Math.max(1, Math.floor(texts.length / 200));
  const sample = texts.filter((_, i) => i % step === 0);
  const found = dominantDirection(sample);
  if (found !== null && found !== declared) {
    throw new Error(
      `${id}: declared ${declared}, but its text is mostly ${found === 'rtl' ? 'right-to-left' : 'left-to-right'} script.`
    );
  }
}
