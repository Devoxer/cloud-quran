/**
 * As-Saadi in Swahili, from QuranEnc's browse pages (story 8-5).
 *
 * ⚠️ WHY A SCRAPER. QuranEnc's API and SQLite downloads serve only `persian_saadi`; the other
 * As-Saadi editions render in full on `quranenc.com/en/browse/{key}/{sura}` and nowhere else.
 * Six of the seven languages QUL also serves (and the pipeline takes them from QUL); Swahili is the
 * one only QuranEnc has, so it is the one read from here — 114 pages, throttled, cached under
 * `build/quranenc-cache/swahili_saadi/`, and fetched only when a page is not cached.
 *
 * ── The page ─────────────────────────────────────────────────────────────────────────────────
 *
 * A surah is a run of `<article class="saadi-block">`. One with `saadi-passage` and a label
 * `Verse: 1 - 7` STARTS a passage; its own `saadi-text` is the verse translation, which is not
 * the tafsir and is not taken. Every following plain block is that passage's commentary, up to
 * the next passage. Blocks before the first passage are the surah's introduction ("Nayo
 * iliteremka Makka") and are prepended to the first passage.
 *
 * ⚠️ THE VERSION IS THE MIRROR DATE. The browse pages state no version; the date the pages were
 * mirrored is recorded beside the cache and pinned in the ledger like any other edition, so a
 * re-mirror on another day is a deliberate bump rather than a silent one.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SURAH_COUNT } from '../packages/quran-data/src/constants.ts';
import { SURAH_METADATA } from '../packages/quran-data/src/surah-metadata.ts';
import { politeFetch } from './polite-fetch.ts';
import { assertPassageSpans, htmlToParagraphs, joinParagraphs, type Passage } from './qul.ts';

export const SWAHILI_SAADI_KEY = 'swahili_saadi';
const ROOT = resolve(import.meta.dirname, '..');
const CACHE_DIR = resolve(ROOT, 'build/quranenc-cache', SWAHILI_SAADI_KEY);
/**
 * `{ "mirrored": "2026.10.5" }` — written once ALL 114 pages are cached, never before: a mirror
 * interrupted at page 60 and finished a day later is dated by the day it became complete.
 */
const MIRROR_RECORD = resolve(CACHE_DIR, 'mirror.json');

const browseUrl = (surah: number): string =>
  `https://quranenc.com/en/browse/${SWAHILI_SAADI_KEY}/${surah}`;

/** Fetch every page not cached yet. Returns the mirror date, which is the edition's version. */
export async function mirrorSwahiliSaadi(): Promise<string> {
  mkdirSync(CACHE_DIR, { recursive: true });
  for (let surah = 1; surah <= SURAH_COUNT; surah++) {
    const path = resolve(CACHE_DIR, `${surah}.html`);
    if (existsSync(path)) continue;
    const response = await politeFetch(browseUrl(surah));
    if (!response.ok) throw new Error(`${browseUrl(surah)} answered HTTP ${response.status}`);
    const html = await response.text();
    // A page with no passage at all is an error page that answered 200; never cache one.
    if (!html.includes('saadi-passage')) throw new Error(`${browseUrl(surah)} holds no passage`);
    writeFileSync(`${path}.part`, html, 'utf-8');
    renameSync(`${path}.part`, path);
    console.log(`    ↓ ${SWAHILI_SAADI_KEY}/${surah}`);
  }
  if (!existsSync(MIRROR_RECORD)) {
    const today = new Date();
    const mirrored = `${today.getUTCFullYear()}.${today.getUTCMonth() + 1}.${today.getUTCDate()}`;
    writeFileSync(MIRROR_RECORD, `${JSON.stringify({ mirrored })}\n`, 'utf-8');
  }
  const record = JSON.parse(readFileSync(MIRROR_RECORD, 'utf-8')) as { mirrored?: unknown };
  if (typeof record.mirrored !== 'string') throw new Error(`${MIRROR_RECORD} has no mirror date`);
  return record.mirrored;
}

/** Every passage of the mirrored edition, in book order. */
export function readSwahiliSaadiPassages(): Passage[] {
  const passages: Passage[] = [];
  for (let surah = 1; surah <= SURAH_COUNT; surah++) {
    passages.push(
      ...parseSaadiPage(readFileSync(resolve(CACHE_DIR, `${surah}.html`), 'utf-8'), surah)
    );
  }
  assertPassageSpans(passages, SWAHILI_SAADI_KEY);
  return passages;
}

/**
 * How many passages the mirrored pages hold, counted independently of {@link parseSaadiPage} —
 * the truncation check for the built pack. Labels only, overlapping labels counted once.
 */
export function countSwahiliSaadiPassages(): number {
  let count = 0;
  for (let surah = 1; surah <= SURAH_COUNT; surah++) {
    const html = readFileSync(resolve(CACHE_DIR, `${surah}.html`), 'utf-8');
    let end = 0;
    for (const m of html.matchAll(/saadi-block-label">\s*Verse:\s*(\d+)(?:\s*-\s*(\d+))?/g)) {
      const from = Number(m[1]);
      const to = Number(m[2] ?? m[1]);
      if (from > end) count++;
      end = Math.max(end, to);
    }
  }
  return count;
}

/** One browse page's passages. Exported for its test. */
export function parseSaadiPage(html: string, surah: number): Passage[] {
  const verseCount = SURAH_METADATA[surah - 1]?.verseCount ?? 0;
  const passages: { surah: number; verse: number; lastVerse: number; paragraphs: string[] }[] = [];
  const intro: string[] = [];
  for (const match of html.matchAll(/<article\b([^>]*)>([\s\S]*?)<\/article>/g)) {
    const [, attributes, body] = match;
    if (!/class="saadi-block/.test(attributes)) continue;
    const text = /<div class="saadi-text">([\s\S]*)<\/div>\s*$/.exec(body)?.[1] ?? '';
    if (/saadi-passage/.test(attributes)) {
      const label = /Verse:\s*(\d+)(?:\s*-\s*(\d+))?/.exec(body.replace(/<[^>]*>/g, ' '));
      if (!label) throw new Error(`Surah ${surah}: a passage with no "Verse:" label`);
      const verse = Number(label[1]);
      const lastVerse = Number(label[2] ?? label[1]);
      const previous = passages[passages.length - 1];
      if (
        verse < 1 ||
        lastVerse < verse ||
        lastVerse > verseCount ||
        (previous && verse < previous.verse)
      ) {
        throw new Error(`Surah ${surah}: passage ${verse}–${lastVerse} is out of order or range`);
      }
      // ⚠️ AN OVERLAPPING PASSAGE JOINS THE ONE BEFORE IT. Al-Kahf labels "99" and then "99 - 101";
      // a pack stores one row per starting ayah, so the second continues the first (its span
      // widened, its commentary appended) rather than colliding with it — nothing is dropped.
      if (previous && verse <= previous.lastVerse) {
        previous.lastVerse = Math.max(previous.lastVerse, lastVerse);
        continue;
      }
      passages.push({
        surah,
        verse,
        lastVerse,
        paragraphs: passages.length === 0 ? [...intro] : [],
      });
      continue;
    }
    const paragraphs = htmlToParagraphs(text);
    const current = passages[passages.length - 1];
    if (current) current.paragraphs.push(...paragraphs);
    else intro.push(...paragraphs);
  }
  if (passages.length === 0) throw new Error(`Surah ${surah}: no passages on the page`);
  const built = passages
    .map(({ paragraphs, ...span }) => ({
      ...span,
      text: joinParagraphs(paragraphs),
      footnotes: null,
    }))
    .filter((passage) => passage.text.length > 0);
  assertPassageSpans(built, `${SWAHILI_SAADI_KEY}/${surah}`);
  return built;
}
