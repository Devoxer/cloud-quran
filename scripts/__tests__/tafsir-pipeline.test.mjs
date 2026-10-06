/**
 * Self-test for the tafsir sources (story 8-5) — `scripts/qul.ts` and `scripts/quranenc-saadi.ts`.
 *
 * ⚠️ WHY THIS EXISTS. Every defect below builds a pack that installs, verifies and READS — a digest
 * minted from a wrong conversion agrees with itself forever. What a reader then sees is HTML tags in
 * Tabari, an editor's takhrij run into the classical text, Fi Zilal silent on 104:1–6 because its
 * passage started in 103, the French Mukhtasar one ayah out at 79:20, or Al-Kahf's 99–101 missing.
 * None of that is visible to the row count or the licence gate. The upstream SHAPES are restated
 * here as small fixtures taken from the real exports (cached under `build/`, which a clone lacks).
 */

import { deepStrictEqual, strictEqual, throws } from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, describe, it } from 'node:test';
import { crc32, deflateRawSync } from 'node:zlib';

import {
  assertDirection,
  assertNoMarkup,
  dominantDirection,
  PASSAGE_RANGE_SQL,
  writePack,
} from '../pack-writer.ts';
import { retryAfterMs } from '../polite-fetch.ts';
import {
  assertPassageSpans,
  convertTafsirHtml,
  countSourcePassages,
  decodeEntities,
  extractEditorNotes,
  htmlToParagraphs,
  qulRawTextLength,
  readQulPassages,
  splitBySurah,
  unzipSingleDatabase,
} from '../qul.ts';
import { parseSaadiPage } from '../quranenc-saadi.ts';

const workdirs = [];
after(() => {
  for (const dir of workdirs) rmSync(dir, { recursive: true, force: true });
});

describe('HTML to paragraphs', () => {
  it('ends a paragraph at block tags and keeps the text of inline ones', () => {
    deepStrictEqual(
      htmlToParagraphs(
        '<div class=ar lang=ar><p>قال: <span class="qpc-hafs">﴿اهْدِنَا﴾</span> .</p><p>ثانية</p></div>'
      ),
      ['قال: ﴿اهْدِنَا﴾ .', 'ثانية']
    );
  });

  it('gives a heading its own paragraph (Ibn Kathir in English uses h2)', () => {
    deepStrictEqual(
      htmlToParagraphs('<p>Before</p><div><h2>Explaining this Hadith</h2></div><p>After</p>'),
      ['Before', 'Explaining this Hadith', 'After']
    );
  });

  it('folds the exporter’s indentation inside markup, but keeps newlines in plain text', () => {
    deepStrictEqual(htmlToParagraphs('<p>\n        وهي مكية        </p>'), ['وهي مكية']);
    deepStrictEqual(htmlToParagraphs('First line.\nSecond line.'), ['First line.', 'Second line.']);
  });

  it('decodes entities AFTER the tags are gone, so an escaped tag stays text', () => {
    deepStrictEqual(htmlToParagraphs('<p>a &lt;b&gt; &amp; c&nbsp;d</p>'), ['a <b> & c d']);
  });

  it('drops a mistyped tag (`<b<`, Bengali Ibn Kathir) and leaves a stray `<<` text alone', () => {
    deepStrictEqual(htmlToParagraphs('<p><b< ৮-১৮ নং আয়াতের তাফসীর </b>আল্লাহ্</p>'), [
      '৮-১৮ নং আয়াতের তাফসীর আল্লাহ্',
    ]);
    deepStrictEqual(htmlToParagraphs('దాని <<అల్ఆలమూన>> ఆలమున్'), ['దాని <<అల్ఆలమూన>> ఆలమున్']);
  });
});

describe('a modern editor’s notes', () => {
  it('move to the footnotes, numbered, with a marker where they stood', () => {
    deepStrictEqual(
      extractEditorNotes('ألهمنا الطريق الهادي [[يأتي بتمامه برقم ١٧٩.]] . ثم [[ثانية]]'),
      {
        text: 'ألهمنا الطريق الهادي[1] . ثم[2]',
        footnotes: '[1] يأتي بتمامه برقم ١٧٩.\n[2] ثانية',
      }
    );
  });

  it('leave a text with none, or an unbalanced bracket, as it is', () => {
    deepStrictEqual(extractEditorNotes('plain'), { text: 'plain', footnotes: null });
    deepStrictEqual(extractEditorNotes('a [[ never closed'), {
      text: 'a [[ never closed',
      footnotes: null,
    });
  });

  it('survive a note that spans paragraphs (al-Tha’alibi opens a surah inside one) — the marker joins the text after it', () => {
    deepStrictEqual(convertTafsirHtml('<p>[[intro one</p><p>intro two]]</p><p>text</p>'), {
      text: '[1] text',
      footnotes: '[1] intro one intro two',
    });
  });

  it('never leave a paragraph that is only a marker — it joins the text before it', () => {
    deepStrictEqual(
      convertTafsirHtml('<p>first</p><p>[[a whole paragraph of takhrij]]</p><p>last</p>'),
      {
        text: 'first[1]\n\nlast',
        footnotes: '[1] a whole paragraph of takhrij',
      }
    );
  });

  it('use ⁽n⁾ when the author already numbers in brackets (al-Tha’labi’s [185])', () => {
    deepStrictEqual(extractEditorNotes('عن أبي [185] [[تفسير القرطبي ٣/٢٦٨]] .'), {
      text: 'عن أبي [185]⁽¹⁾ .',
      footnotes: '⁽¹⁾ تفسير القرطبي ٣/٢٦٨',
    });
  });

  it('keep a passage that is NOTHING but a note as text, not as a bare marker (Qurtubi 17:30)', () => {
    deepStrictEqual(extractEditorNotes('[[only the editor speaks here]]'), {
      text: 'only the editor speaks here',
      footnotes: null,
    });
  });
});

describe('entities', () => {
  it('decodes the named entities the exports use, and leaves an impossible code point as written', () => {
    strictEqual(
      decodeEntities(
        '&laquo;a&raquo; &hellip; &mdash; &ndash; &rsquo;&lsquo;&ldquo;&rdquo; &amp;lt;'
      ),
      '«a» … — – \u2019\u2018\u201C\u201D &lt;'
    );
    strictEqual(decodeEntities('x&zwnj;y&zwj;z&shy;'), 'x\u200Cy\u200Dz\u00AD');
    strictEqual(decodeEntities('&#1114112; &#x110000;'), '&#1114112; &#x110000;');
  });
});

describe('Retry-After', () => {
  it('reads seconds and HTTP dates, caps them, and ignores what it cannot read', () => {
    strictEqual(retryAfterMs('7'), 7000);
    strictEqual(retryAfterMs(new Date(60_000).toUTCString(), 0), 60_000);
    strictEqual(retryAfterMs('999999'), 5 * 60_000);
    strictEqual(retryAfterMs(null), null);
    strictEqual(retryAfterMs('soon'), null);
  });
});

describe('passage spans', () => {
  it('refuse a span past its surah’s last ayah, one that runs backwards, and an overlap', () => {
    throws(
      () => assertPassageSpans([{ surah: 1, verse: 1, lastVerse: 8 }], 't'),
      /outside its surah/
    );
    throws(
      () => assertPassageSpans([{ surah: 2, verse: 5, lastVerse: 4 }], 't'),
      /outside its surah/
    );
    throws(
      () =>
        assertPassageSpans(
          [
            { surah: 2, verse: 1, lastVerse: 5 },
            { surah: 2, verse: 5, lastVerse: 7 },
          ],
          't'
        ),
      /overlaps/
    );
    assertPassageSpans(
      [
        { surah: 2, verse: 1, lastVerse: 5 },
        { surah: 2, verse: 6, lastVerse: 7 },
        { surah: 3, verse: 1, lastVerse: 1 },
      ],
      't'
    );
  });

  it('splits a passage that crosses a surah into one span per surah (Fi Zilal 103:1–104:6)', () => {
    deepStrictEqual(splitBySurah({ surah: 103, verse: 1 }, { surah: 104, verse: 6 }), [
      { surah: 103, verse: 1, lastVerse: 3 },
      { surah: 104, verse: 1, lastVerse: 6 },
    ]);
  });

  it('refuses a span that runs backwards', () => {
    throws(() => splitBySurah({ surah: 2, verse: 5 }, { surah: 2, verse: 1 }), /backwards/);
  });
});

/** A minimal ZIP writer: one directory entry and one deflated file, dated `year-month-day`. */
function zipOf(name, bytes, { year, month, day }, { breakCrc = false } = {}) {
  const dosDate = ((year - 1980) << 9) | (month << 5) | day;
  const entries = [
    { name: `${name}/`, data: Buffer.alloc(0), raw: Buffer.alloc(0), method: 0 },
    { name: `${name}/${name}`, data: bytes, raw: deflateRawSync(bytes), method: 8 },
  ];
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const entry of entries) {
    const fileName = Buffer.from(entry.name);
    const crc = entry.data.length === 0 ? 0 : (crc32(entry.data) ^ (breakCrc ? 1 : 0)) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(entry.method, 8);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(entry.raw.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(fileName.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(entry.method, 10);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(entry.raw.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(fileName.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, fileName, entry.raw);
    centrals.push(central, fileName);
    offset += 30 + fileName.length + entry.raw.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

describe('the QUL ZIP', () => {
  const db = Buffer.from('SQLite format 3\0 and the rest of a database');

  it('yields its one .db and the export date that pins it, past a directory entry (resource 486)', () => {
    const { bytes, modified } = unzipSingleDatabase(
      zipOf('tafsir-ibn-uthaymeen.db', db, { year: 2025, month: 6, day: 16 })
    );
    deepStrictEqual(bytes, db);
    deepStrictEqual(modified, { year: 2025, month: 6, day: 16 });
  });

  it('refuses an entry whose CRC does not match — a truncated download is not a tafsir', () => {
    throws(
      () =>
        unzipSingleDatabase(
          zipOf('x.db', db, { year: 2025, month: 1, day: 1 }, { breakCrc: true })
        ),
      /CRC/
    );
  });

  it('refuses something that is not a ZIP at all', () => {
    throws(
      () => unzipSingleDatabase(Buffer.from('<html>Sign in</html>'.padEnd(64, ' '))),
      /Not a ZIP/
    );
  });
});

describe('reading a QUL tafsir database', () => {
  /** A QUL-shaped `.db`: rows are `[ayah_key, from, to, text]`, in rowid order. */
  function qulDb(rows) {
    const dir = mkdtempSync(join(tmpdir(), 'cq-qul-'));
    workdirs.push(dir);
    const path = join(dir, 'tafsir.db');
    const db = new DatabaseSync(path);
    db.exec(
      'CREATE TABLE tafsir (ayah_key TEXT, group_ayah_key TEXT, from_ayah TEXT, to_ayah TEXT, ayah_keys TEXT, text TEXT)'
    );
    const insert = db.prepare('INSERT INTO tafsir VALUES (?, ?, ?, ?, ?, ?)');
    for (const [key, from, to, text] of rows) insert.run(key, from, from, to, '', text);
    db.close();
    return path;
  }

  it('stores a passage once, at its head, with its span — members carry no text', () => {
    const path = qulDb([
      ['1:1', '1:1', '1:7', '<p>الفاتحة</p>'],
      ['1:2', '1:1', '1:7', ''],
    ]);
    deepStrictEqual(readQulPassages(path), [
      { surah: 1, verse: 1, lastVerse: 7, text: 'الفاتحة', footnotes: null },
    ]);
  });

  it('takes the LATER row of a repeated ayah — the French Mukhtasar’s copies disagree at 79:20', () => {
    const path = qulDb([
      ['79:20', '79:20', '79:20', 'shifted by one'],
      ['79:20', '79:20', '79:20', '<p>Moïse lui montra le signe majeur</p>'],
    ]);
    strictEqual(readQulPassages(path)[0].text, 'Moïse lui montra le signe majeur');
  });

  it('stores a cross-surah passage once per surah, and leaves an empty head as a gap', () => {
    const path = qulDb([
      ['2:7', '2:7', '2:7', '<p> </p>'],
      ['103:1', '103:1', '104:6', '<p>Al-Asr and Al-Humazah</p>'],
    ]);
    deepStrictEqual(
      readQulPassages(path).map((p) => `${p.surah}:${p.verse}-${p.lastVerse} ${p.text}`),
      ['103:1-3 Al-Asr and Al-Humazah', '104:1-6 Al-Asr and Al-Humazah']
    );
  });

  it('MERGES overlapping heads (As-Saadi 38:48–49 then 38:49–54; al-Suyuti nests 26:11 in 26:10–20)', () => {
    const path = qulDb([
      ['38:48', '38:48', '38:49', '<p>first [[n1]]</p>'],
      ['38:49', '38:49', '38:54', '<p>second [[n2]]</p>'],
      ['26:10', '26:10', '26:20', '<p>outer</p>'],
      ['26:11', '26:11', '26:11', '<p>inner</p>'],
    ]);
    deepStrictEqual(readQulPassages(path), [
      { surah: 26, verse: 10, lastVerse: 20, text: 'outer\n\ninner', footnotes: null },
      {
        surah: 38,
        verse: 48,
        lastVerse: 54,
        text: 'first[1]\n\nsecond[2]',
        footnotes: '[1] n1\n[2] n2',
      },
    ]);
    // The independent count agrees: four heads, two overlap clusters.
    strictEqual(countSourcePassages(path), 2);
  });

  it('counts the source independently — a blank head and the surah split included', () => {
    const path = qulDb([
      ['2:7', '2:7', '2:7', '<p> </p>'],
      ['103:1', '103:1', '104:6', '<p>Al-Asr</p>'],
      ['105:1', '105:1', '105:5', '<p>Al-Fil</p>'],
    ]);
    strictEqual(countSourcePassages(path), 3);
    strictEqual(readQulPassages(path).length, 3);
  });

  it('measures a doubled export by its rows deduplicated by ayah', () => {
    const once = qulDb([['1:1', '1:1', '1:7', 'abcd']]);
    const twice = qulDb([
      ['1:1', '1:1', '1:7', 'abcd'],
      ['1:1', '1:1', '1:7', 'abcd'],
    ]);
    strictEqual(qulRawTextLength(twice), qulRawTextLength(once));
  });

  it('refuses a head that does not start its own span', () => {
    // A head at 2:3 whose span starts at 2:1 — a defect upstream that would store the passage
    // at the wrong ayah.
    const path = qulDb([['2:3', '2:1', '2:5', 'text']]);
    throws(() => readQulPassages(path), /does not start its own span/);
  });
});

describe('As-Saadi in Swahili, from the browse page', () => {
  const block = (text) =>
    `<article\n class="saadi-block">\n<div class="saadi-text">${text}</div>\n</article>`;
  const passage = (label, translation) =>
    `<article id="g" class="saadi-block saadi-passage"><div><span class="saadi-block-label">Verse: ${label}</span></div>` +
    `<div class="saadi-text">${translation}</div>\n</article>`;

  it('prepends the surah intro, skips the verse translation, and joins the commentary', () => {
    const html = [
      block('Nayo iliteremka Makka'),
      passage('1 - 7', '1. Kwa Jina la Mwenyezi Mungu…'),
      block('<span class="saadi-color-2">(1)</span> Yaani, ninaanza'),
      block('Licha ya ufupi wake'),
    ].join('\n');
    deepStrictEqual(parseSaadiPage(html, 1), [
      {
        surah: 1,
        verse: 1,
        lastVerse: 7,
        text: 'Nayo iliteremka Makka\n\n(1) Yaani, ninaanza\n\nLicha ya ufupi wake',
        footnotes: null,
      },
    ]);
  });

  it('joins an OVERLAPPING passage to the one before it (Al-Kahf "99" then "99 - 101")', () => {
    const html = [
      passage('99', 't'),
      block('first'),
      passage('99 - 101', 't'),
      block('second'),
      passage('102', 't'),
      block('third'),
    ].join('\n');
    deepStrictEqual(
      parseSaadiPage(html, 18).map(
        (p) => `${p.verse}-${p.lastVerse} ${p.text.replace('\n\n', ' | ')}`
      ),
      ['99-101 first | second', '102-102 third']
    );
  });

  it('refuses a passage that runs backwards', () => {
    throws(() => parseSaadiPage(passage('5 - 3', 't'), 1), /out of order or range/);
  });

  it('refuses a passage beyond the surah’s last ayah', () => {
    throws(() => parseSaadiPage(passage('8', 't'), 1), /out of order or range/);
  });
});

/**
 * THE WRITER, AGAINST A REAL FILE (story 8-5 review). The device reads passages with
 * `PASSAGE_RANGE_SQL`; if the schema or the query drifted so the primary key no longer serves it,
 * every study-sheet read becomes a full scan of a 50 MB pack — and nothing else would notice.
 */
describe('the pack writer', () => {
  const META = {
    id: 'tafsir-ar-test',
    type: 'tafsir',
    language: 'ar',
    direction: 'rtl',
    languageName: 'العربية',
    languageNameEnglish: 'Arabic',
    title: 'اختبار',
    source: 'QUL',
    sourceKey: 'qul_1',
    sourceVersion: '2025.1.1',
    licenceId: 'qul-tafsir',
    attribution: 'اختبار · QUL (qul.tarteel.ai) · v2025.1.1',
  };
  const ROWS = [
    { surah: 1, verse: 1, lastVerse: 7, text: 'الفاتحة', footnotes: null },
    { surah: 2, verse: 1, lastVerse: 5, text: 'البقرة', footnotes: '[1] حاشية' },
    { surah: 2, verse: 6, lastVerse: 7, text: 'الكافرون', footnotes: null },
  ];
  function built() {
    const dir = mkdtempSync(join(tmpdir(), 'cq-writer-'));
    workdirs.push(dir);
    const path = join(dir, 'pack.db');
    writePack(path, META, 1, { shape: 'passage', rows: ROWS });
    return new DatabaseSync(path, { readOnly: true });
  }

  it('writes one row per passage with its (surah_number, verse_number, last_verse), and its meta', () => {
    const db = built();
    deepStrictEqual(
      db
        .prepare('SELECT surah_number, verse_number, last_verse, footnotes FROM entries')
        .all()
        .map((r) => ({ ...r })),
      [
        { surah_number: 1, verse_number: 1, last_verse: 7, footnotes: null },
        { surah_number: 2, verse_number: 1, last_verse: 5, footnotes: '[1] حاشية' },
        { surah_number: 2, verse_number: 6, last_verse: 7, footnotes: null },
      ]
    );
    strictEqual(
      db.prepare("SELECT value FROM pack_meta WHERE key = 'direction'").get().value,
      'rtl'
    );
    strictEqual(
      db.prepare("SELECT value FROM pack_meta WHERE key = 'packVersion'").get().value,
      '1'
    );
    db.close();
  });

  it('answers the device’s passage read through the PRIMARY KEY — an index range, never a scan', () => {
    const db = built();
    const plan = db
      .prepare(`EXPLAIN QUERY PLAN ${PASSAGE_RANGE_SQL}`)
      .all(2, 2, 3, 2, 3)
      .map((row) => row.detail)
      .join(' | ');
    strictEqual(
      /SEARCH entries USING (INDEX sqlite_autoindex_entries_1|PRIMARY KEY)/.test(plan),
      true,
      plan
    );
    strictEqual(/SCAN entries/.test(plan), false, plan);
    deepStrictEqual(
      db
        .prepare(PASSAGE_RANGE_SQL)
        .all(2, 2, 3, 2, 3)
        .map((row) => row.verse_number),
      [1]
    );
    db.close();
  });

  it('is the read the app makes — `lib/quranDb.ts` carries the same predicate', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(
      join(import.meta.dirname, '..', '..', 'apps', 'expo', 'src', 'lib', 'quranDb.ts'),
      'utf8'
    );
    for (const clause of [
      '(surah_number, verse_number) >= (?, 1)',
      '(surah_number, verse_number) <= (?, ?)',
      '(surah_number, last_verse) >= (?, ?)',
    ]) {
      strictEqual(source.includes(clause) && PASSAGE_RANGE_SQL.includes(clause), true, clause);
    }
  });

  it('refuses a converted text that still holds an entity or a tag', () => {
    throws(
      () => assertNoMarkup('t', { shape: 'passage', rows: [{ ...ROWS[0], text: 'a &laquo; b' }] }),
      /still holds markup/
    );
    throws(
      () =>
        assertNoMarkup('t', { shape: 'passage', rows: [{ ...ROWS[0], text: 'a <span>b</span>' }] }),
      /still holds markup/
    );
    assertNoMarkup('t', { shape: 'passage', rows: [{ ...ROWS[0], text: 'దాని <<అల్ఆలమూన>> a < b' }] });
  });

  it('refuses a declared direction its own letters contradict', () => {
    const arabic = 'هذا نص عربي طويل بما يكفي ليحكم عليه بأنه من اليمين إلى اليسار في كل الأحوال';
    const english =
      'This is an English passage long enough to be judged left to right in every way';
    strictEqual(dominantDirection([arabic]), 'rtl');
    strictEqual(dominantDirection([english]), 'ltr');
    strictEqual(dominantDirection(['short']), null);
    throws(
      () => assertDirection('t', 'ltr', { shape: 'passage', rows: [{ ...ROWS[0], text: arabic }] }),
      /declared ltr/
    );
    assertDirection('t', 'rtl', { shape: 'passage', rows: [{ ...ROWS[0], text: arabic }] });
  });
});
