/**
 * QUL (qul.tarteel.ai) — the upstream every QUL tafsir pack comes from (story 8-5).
 *
 * ⚠️ QUL IS A LIBRARY, NOT A RIGHTS HOLDER, AND THE LEDGER SAYS SO. The owner's decision of
 * 2026-10-05 is that Cloud Quran, being non-commercial, uses any source its publisher does not
 * explicitly forbid; QUL forbids nothing, and the owner explicitly accepts Al-Mukhtasar. The
 * argument and the provenance are recorded in `packages/quran-data/data/packs/LICENCES.md`
 * (`qul-tafsir`), with one pin per resource.
 *
 * ── What QUL serves ──────────────────────────────────────────────────────────────────────────
 *
 * One resource per tafsir at `/resources/tafsir/{id}`. The SQLite download (a link that appears
 * only to a signed-in account) is a ZIP holding one `.db` with
 * `tafsir(ayah_key, group_ayah_key, from_ayah, to_ayah, ayah_keys, text)` — 6,236 rows, one per
 * ayah, where `text` is non-empty only on a passage's HEAD row and the other ayat of the passage
 * point at that head through `group_ayah_key`. The text is light HTML (`div p span h3 br`).
 *
 * ⚠️ THE ZIP ENTRY'S MODIFICATION DATE IS THE VERSION. QUL states no version per resource, so the
 * export date is the only fact that moves when the text does. It is written as a dotted pin
 * (`2025.6.16`), which the ledger's pin syntax already accepts, and a re-export with a new date is
 * a build failure until somebody bumps the pin on purpose.
 *
 * ⚠️ EVERYTHING IS CACHED UNDER `build/qul-cache/`, AND THE CACHE IS USED BEFORE THE NETWORK. All
 * 106 resources were downloaded on 2026-10-05; a build reads the cached ZIPs and only fetches what
 * is missing, throttled, after signing in with `~/.config/qul/credentials` (never committed, never
 * logged).
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { crc32, inflateRawSync } from 'node:zlib';
import { SURAH_METADATA } from '../packages/quran-data/src/surah-metadata.ts';
import { politeFetch } from './polite-fetch.ts';

export const QUL_BASE = 'https://qul.tarteel.ai';
const ROOT = resolve(import.meta.dirname, '..');
/** Where every QUL download lands. Gitignored with the rest of `build/`. */
export const QUL_CACHE_DIR = resolve(ROOT, 'build/qul-cache/tafsir');
const META_PATH = resolve(QUL_CACHE_DIR, 'meta.json');
/** `KEY=value` lines; the keys containing EMAIL and PASSWORD are read. Mode 600, outside the repo. */
const CREDENTIALS_PATH = resolve(homedir(), '.config/qul/credentials');

// ─── The resources this app publishes, and the ones it does not ──────────────────────────────

/**
 * The pack types a QUL resource can be published as. QUL files them all under "tafsir"; the owner
 * (2026-10-05) moved the i'rab works and the word-meaning works to the study sheet's own rows.
 */
export type QulPackType = 'tafsir' | 'irab' | 'meanings';

/** A QUL resource published as a pack. */
export interface QulWork {
  /** The pack id is `{type}-{language}-{slug}`. One slug per WORK, so duplicates collide on purpose. */
  slug: string;
  /** The study row it belongs to. Absent means `tafsir`. */
  type?: Exclude<QulPackType, 'tafsir'>;
  /** ISO 639-1 code of the TEXT. */
  language: string;
  /** The work's title: in Arabic for an Arabic work, otherwise in English. */
  title: string;
}

/** A QUL resource deliberately not published, and why. */
export interface QulSkip {
  skip: string;
}

/**
 * Every tafsir resource QUL lists (106, measured 2026-10-05), by QUL id.
 *
 * ⚠️ A COMMITTED TABLE, NOT QUL'S PAGE TITLES, FOR THE SAME REASON `LANGUAGE_NAMES` IS ONE: the
 * title is written into every pack's `pack_meta`, so it is part of the digest, and QUL's titles are
 * not fit to print as they stand ("Indoniesua Al-Mukhtasar…", two different works both titled
 * "Tafsir Al-Tha'alibi", and "Asseraj fi Bayan Gharib AlQuran" whose file is byte-identical to
 * As-Saadi). A resource not in this table stops the build: a new one is a decision.
 *
 * ⚠️ TWO RESOURCES WITH ONE (type, language, slug) ARE THE SAME WORK, and the build keeps the one
 * with the most text (the spec's rule): As-Saadi in Arabic is listed three times and in Russian
 * twice.
 *
 * ⚠️ NOT EVERYTHING QUL CALLS A TAFSIR IS ONE (owner, 2026-10-05). The five i'rab works are type
 * `irab` and the two word-meaning works type `meanings`, so the study sheet's I'rab and Meanings
 * rows offer them; the qira'at works (521, 522) stay tafsir.
 */
export const QUL_TAFSIRS: Readonly<Record<number, QulWork | QulSkip>> = {
  // ── Arabic ──
  22: { slug: 'ibn-kathir', language: 'ar', title: 'تفسير ابن كثير' },
  23: { slug: 'qurtubi', language: 'ar', title: 'تفسير القرطبي' },
  24: { slug: 'saadi', language: 'ar', title: 'تفسير السعدي' },
  25: { slug: 'ibn-ashur', language: 'ar', title: 'التحرير والتنوير لابن عاشور' },
  26: { slug: 'wasit', language: 'ar', title: 'التفسير الوسيط لطنطاوي' },
  27: { slug: 'baghawi', language: 'ar', title: 'تفسير البغوي' },
  37: { slug: 'tabari', language: 'ar', title: 'تفسير الطبري' },
  38: { slug: 'muyassar', language: 'ar', title: 'التفسير الميسر' },
  // QUL titles this "Asseraj fi Bayan Gharib AlQuran"; the file is byte-identical to 308.
  250: { slug: 'saadi', language: 'ar', title: 'تفسير السعدي' },
  251: { slug: 'mukhtasar', language: 'ar', title: 'المختصر في تفسير القرآن الكريم' },
  308: { slug: 'saadi', language: 'ar', title: 'تفسير السعدي' },
  486: { slug: 'ibn-uthaymeen', language: 'ar', title: 'تفسير ابن عثيمين' },
  487: { slug: 'tahlil-kalimat', type: 'meanings', language: 'ar', title: 'تحليل كلمات القرآن' },
  488: { slug: 'razi', language: 'ar', title: 'تفسير الرازي' },
  489: { slug: 'wajiz-wahidi', language: 'ar', title: 'الوجيز للواحدي' },
  490: { slug: 'makki', language: 'ar', title: 'تفسير مكي بن أبي طالب' },
  491: { slug: 'ibn-juzayy', language: 'ar', title: 'تفسير ابن جزي' },
  492: { slug: 'mawsuat-mathur', language: 'ar', title: 'موسوعة التفسير المأثور' },
  493: { slug: 'durr-manthur', language: 'ar', title: 'الدر المنثور للسيوطي' },
  494: { slug: 'fath-al-qadir', language: 'ar', title: 'فتح القدير للشوكاني' },
  495: { slug: 'fath-al-bayan', language: 'ar', title: 'فتح البيان للقنوجي' },
  496: { slug: 'ibn-al-jawzi', language: 'ar', title: 'زاد المسير لابن الجوزي' },
  497: { slug: 'abi-al-suud', language: 'ar', title: 'تفسير أبي السعود' },
  498: { slug: 'biqai', language: 'ar', title: 'نظم الدرر للبقاعي' },
  499: { slug: 'ibn-abi-zamanin', language: 'ar', title: 'تفسير ابن أبي زمنين' },
  500: { slug: 'ibn-al-qayyim', language: 'ar', title: 'تفسير ابن القيم' },
  501: { slug: 'alusi', language: 'ar', title: 'تفسير الألوسي' },
  502: { slug: 'ibn-abi-hatim', language: 'ar', title: 'تفسير ابن أبي حاتم' },
  504: { slug: 'muyassar', type: 'irab', language: 'ar', title: 'الإعراب الميسر' },
  505: { slug: 'durr-masun', type: 'irab', language: 'ar', title: 'الدر المصون للسمين الحلبي' },
  506: { slug: 'darwish', type: 'irab', language: 'ar', title: 'إعراب القرآن لدرويش' },
  507: { slug: 'jazairi', language: 'ar', title: 'أيسر التفاسير للجزائري' },
  508: { slug: 'iji', language: 'ar', title: 'جامع البيان للإيجي' },
  509: { slug: 'ibn-atiyyah', language: 'ar', title: 'المحرر الوجيز لابن عطية' },
  510: { slug: 'kashshaf', language: 'ar', title: 'الكشاف للزمخشري' },
  511: { slug: 'basit', language: 'ar', title: 'البسيط للواحدي' },
  512: { slug: 'mawardi', language: 'ar', title: 'تفسير الماوردي' },
  513: { slug: 'samarqandi', language: 'ar', title: 'تفسير السمرقندي' },
  514: { slug: 'nasafi', language: 'ar', title: 'تفسير النسفي' },
  515: { slug: 'daas', type: 'irab', language: 'ar', title: 'إعراب القرآن للدعاس' },
  516: { slug: 'lubab', language: 'ar', title: 'اللباب في علوم الكتاب' },
  517: { slug: 'tadabbur', language: 'ar', title: 'تدبر وعمل' },
  518: { slug: 'baydawi', language: 'ar', title: 'تفسير البيضاوي' },
  519: {
    slug: 'muyassar-gharib',
    type: 'meanings',
    language: 'ar',
    title: 'الميسر في غريب القرآن',
  },
  520: { slug: 'jadwal', type: 'irab', language: 'ar', title: 'الجدول في إعراب القرآن' },
  521: { slug: 'qiraat', language: 'ar', title: 'القراءات - الموسوعة القرآنية' },
  522: { slug: 'nashr', language: 'ar', title: 'النشر في القراءات العشر لابن الجزري' },
  523: { slug: 'jalalayn', language: 'ar', title: 'تفسير الجلالين' },
  524: { slug: 'qasimi', language: 'ar', title: 'محاسن التأويل للقاسمي' },
  525: { slug: 'adwa-al-bayan', language: 'ar', title: 'أضواء البيان للشنقيطي' },
  526: { slug: 'bahr-muhit', language: 'ar', title: 'البحر المحيط لأبي حيان' },
  527: { slug: 'thaalibi', language: 'ar', title: 'الجواهر الحسان للثعالبي' },
  // QUL titles this "Tafsir Al-Tha'alibi" too; its isnads ("أخبرنا عبد الله بن حامد") are
  // al-Tha'labi's al-Kashf wa al-Bayan — a different author and a different work.
  528: { slug: 'thalabi', language: 'ar', title: 'الكشف والبيان للثعلبي' },
  529: { slug: 'samani', language: 'ar', title: 'تفسير السمعاني' },
  563: {
    skip:
      'SVG syntax-dependency graphs, not text: every row is a drawing, and the app renders no ' +
      'HTML or SVG (story 8-5 "Never").',
  },
  // ── Other languages ──
  28: { slug: 'fi-zilal', language: 'ur', title: 'Fi Zilal al-Quran' },
  29: { slug: 'bayan-ul-quran', language: 'ur', title: 'Bayan ul Quran' },
  30: { slug: 'ibn-kathir', language: 'ur', title: 'Tafsir Ibn Kathir' },
  31: { slug: 'ibn-kathir', language: 'bn', title: 'Tafsir Ibn Kathir' },
  32: { slug: 'ahsanul-bayaan', language: 'bn', title: 'Tafsir Ahsanul Bayaan' },
  33: { slug: 'abu-bakr-zakaria', language: 'bn', title: 'Tafsir Abu Bakr Zakaria' },
  34: { slug: 'maarif-ul-quran', language: 'en', title: "Ma'arif al-Qur'an" },
  35: { slug: 'ibn-kathir', language: 'en', title: 'Tafsir Ibn Kathir' },
  36: { slug: 'saadi', language: 'ru', title: 'Tafsir As-Saadi' },
  39: { slug: 'fathul-majid', language: 'bn', title: 'Tafsir Fathul Majid' },
  40: { slug: 'rebar', language: 'ku', title: 'Rebar Kurdish Tafsir' },
  42: { slug: 'tazkirul-quran', language: 'en', title: 'Tazkirul Quran' },
  43: { slug: 'tazkirul-quran', language: 'ur', title: 'Tazkirul Quran' },
  252: { slug: 'mukhtasar', language: 'bs', title: 'Al-Mukhtasar' },
  253: { slug: 'mukhtasar', language: 'it', title: 'Al-Mukhtasar' },
  254: { slug: 'mukhtasar', language: 'tl', title: 'Al-Mukhtasar' },
  255: { slug: 'mukhtasar', language: 'as', title: 'Al-Mukhtasar' },
  256: { slug: 'mukhtasar', language: 'ml', title: 'Al-Mukhtasar' },
  257: { slug: 'mukhtasar', language: 'km', title: 'Al-Mukhtasar' },
  258: { slug: 'mukhtasar', language: 'tr', title: 'Al-Mukhtasar' },
  259: { slug: 'mukhtasar', language: 'fr', title: 'Al-Mukhtasar' },
  260: { slug: 'mukhtasar', language: 'id', title: 'Al-Mukhtasar' },
  261: { slug: 'mukhtasar', language: 'vi', title: 'Al-Mukhtasar' },
  262: { slug: 'mukhtasar', language: 'ru', title: 'Al-Mukhtasar' },
  263: { slug: 'mukhtasar', language: 'fa', title: 'Al-Mukhtasar' },
  264: { slug: 'mukhtasar', language: 'zh', title: 'Al-Mukhtasar' },
  265: { slug: 'mukhtasar', language: 'ja', title: 'Al-Mukhtasar' },
  266: { slug: 'mukhtasar', language: 'en', title: 'Al-Mukhtasar' },
  267: { slug: 'mukhtasar', language: 'bn', title: 'Al-Mukhtasar' },
  268: { slug: 'mukhtasar', language: 'es', title: 'Al-Mukhtasar' },
  283: { slug: 'saadi', language: 'sq', title: 'Tafsir As-Saadi' },
  306: { slug: 'ibn-kathir', language: 'tr', title: 'Tafsir Ibn Kathir' },
  307: { slug: 'ibn-kathir', language: 'ru', title: 'Tafsir Ibn Kathir' },
  309: { slug: 'saadi', language: 'ur', title: 'Tafsir As-Saadi' },
  310: { slug: 'saadi', language: 'ru', title: 'Tafsir As-Saadi' },
  453: { slug: 'mukhtasar', language: 'si', title: 'Al-Mukhtasar' },
  484: { slug: 'saadi', language: 'tr', title: 'Tafsir As-Saadi' },
  485: { slug: 'saadi', language: 'fa', title: 'Tafsir As-Saadi' },
  503: { slug: 'saadi', language: 'id', title: 'Tafsir As-Saadi' },
  533: { slug: 'mukhtasar', language: 'ps', title: 'Al-Mukhtasar' },
  534: { slug: 'mukhtasar', language: 'ff', title: 'Al-Mukhtasar' },
  535: { slug: 'mukhtasar', language: 'hi', title: 'Al-Mukhtasar' },
  536: { slug: 'mukhtasar', language: 'ky', title: 'Al-Mukhtasar' },
  537: { slug: 'mukhtasar', language: 'az', title: 'Al-Mukhtasar' },
  538: { slug: 'mukhtasar', language: 'uz', title: 'Al-Mukhtasar' },
  539: { slug: 'mukhtasar', language: 'ug', title: 'Al-Mukhtasar' },
  540: { slug: 'mukhtasar', language: 'te', title: 'Al-Mukhtasar' },
  541: { slug: 'mukhtasar', language: 'th', title: 'Al-Mukhtasar' },
  542: { slug: 'mukhtasar', language: 'ku', title: 'Al-Mukhtasar' },
  543: { slug: 'mukhtasar', language: 'sr', title: 'Al-Mukhtasar' },
  554: { slug: 'mukhtasar', language: 'ta', title: 'Al-Mukhtasar' },
};

/**
 * The languages whose text runs right to left, among those QUL publishes.
 *
 * ⚠️ QUL DOES NOT STATE A DIRECTION, so for these packs the pipeline decides it and WRITES it into
 * the pack (`pack_meta.direction`) and the catalogue — the app still reads the pack's own field and
 * never a list. `ku` is Sorani (Arabic script), as both Kurdish resources are; `ug` is the
 * Arabic-script Uyghur QUL serves. It is QuranEnc's RTL set plus Arabic.
 */
const RTL_LANGUAGES: ReadonlySet<string> = new Set(['ar', 'fa', 'ku', 'ps', 'ug', 'ur']);

export function directionOf(language: string): 'ltr' | 'rtl' {
  return RTL_LANGUAGES.has(language) ? 'rtl' : 'ltr';
}

/** The pack type a QUL work is published as. */
export const qulTypeOf = (work: QulWork): QulPackType => work.type ?? 'tafsir';

/** The pack id a QUL work is published under: `{type}-{language}-{slug}`. */
export const qulPackIdOf = (work: QulWork): string =>
  `${qulTypeOf(work)}-${work.language}-${work.slug}`;

/** The upstream key a QUL resource is pinned under in the ledger: `qul_{id}`. */
export const qulKeyOf = (id: number): string => `qul_${id}`;

/** The credit line: the work, the library it came from, and the export it was built from. */
export function qulAttributionOf(title: string, version: string): string {
  return `${title} · QUL (qul.tarteel.ai) · v${version}`;
}

// ─── The listing and the downloads ───────────────────────────────────────────────────────────

/** What the listing records per resource: its page title, its `/docs/{tag}` tags, its links. */
export interface QulResourceMeta {
  title: string;
  tags: string[];
  links: Record<string, string>;
}

/** A tiny cookie jar — the Devise session is the only state the download needs. */
class CookieJar {
  private readonly cookies = new Map<string, string>();
  absorb(response: Response): void {
    for (const line of response.headers.getSetCookie()) {
      const pair = line.split(';')[0] ?? '';
      const at = pair.indexOf('=');
      if (at > 0) this.cookies.set(pair.slice(0, at).trim(), pair.slice(at + 1).trim());
    }
  }
  header(): string {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  }
}

function readCredentials(): { email: string; password: string } {
  if (!existsSync(CREDENTIALS_PATH)) {
    throw new Error(`QUL credentials are not at ${CREDENTIALS_PATH} (KEY=value lines).`);
  }
  let email = '';
  let password = '';
  for (const line of readFileSync(CREDENTIALS_PATH, 'utf-8').split('\n')) {
    const at = line.indexOf('=');
    if (at <= 0) continue;
    const key = line.slice(0, at).trim().toUpperCase();
    const value = line.slice(at + 1).trim();
    if (key.includes('EMAIL')) email = value;
    else if (key.includes('PASSWORD')) password = value;
  }
  // ⚠️ NEITHER VALUE IS EVER PRINTED — not here, not in an error message.
  if (!email || !password) throw new Error(`${CREDENTIALS_PATH} has no EMAIL and PASSWORD lines.`);
  return { email, password };
}

/** Sign in (Devise form). A 302 is success; anything else is refused without echoing a value. */
async function signIn(): Promise<CookieJar> {
  const jar = new CookieJar();
  const form = await politeFetch(`${QUL_BASE}/users/sign_in`);
  jar.absorb(form);
  const token = /name="authenticity_token" value="([^"]+)"/.exec(await form.text())?.[1];
  if (!token) throw new Error('QUL sign-in page carried no authenticity_token.');
  const { email, password } = readCredentials();
  const response = await politeFetch(`${QUL_BASE}/users/sign_in`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: jar.header() },
    body: new URLSearchParams({
      authenticity_token: token,
      'user[email]': email,
      'user[password]': password,
    }).toString(),
  });
  jar.absorb(response);
  if (response.status !== 302) throw new Error(`QUL sign-in answered HTTP ${response.status}.`);
  return jar;
}

let session: Promise<CookieJar> | null = null;
const signedIn = (): Promise<CookieJar> => {
  session ??= signIn();
  return session;
};

/** The named entities the exports use, or might — every one a build would otherwise print raw. */
const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  nbsp: ' ',
  quot: '"',
  apos: "'",
  lt: '<',
  gt: '>',
  laquo: '«',
  raquo: '»',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  rsquo: '\u2019',
  lsquo: '\u2018',
  ldquo: '\u201C',
  rdquo: '\u201D',
  zwnj: '\u200C',
  zwj: '\u200D',
  shy: '\u00AD',
};

/** A numeric reference as text, or the reference itself when it names no code point. */
function codePoint(code: number, raw: string): string {
  return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : raw;
}

/**
 * HTML entities to text, `&amp;` last so `&amp;lt;` stays the four characters `&lt;`.
 * An unknown name is left as written — the pack writer refuses a text that still holds one.
 */
export const decodeEntities = (value: string): string =>
  value
    .replace(/&#(\d+);/g, (raw, code: string) => codePoint(Number(code), raw))
    .replace(/&#x([0-9a-f]+);/gi, (raw, code: string) => codePoint(Number.parseInt(code, 16), raw))
    .replace(/&([a-z]+);/gi, (raw, name: string) =>
      name.toLowerCase() === 'amp' ? raw : (NAMED_ENTITIES[name.toLowerCase()] ?? raw)
    )
    .replace(/&amp;/gi, '&');

/**
 * Every tafsir resource QUL lists, by id — from the cached `meta.json` when there is one.
 *
 * ⚠️ THE CACHE WINS UNLESS ASKED. Re-listing means 107 signed-in page loads, so it happens only
 * with `refresh` (`prepare-packs.ts --refresh-qul`) or when `meta.json` is missing.
 */
export async function loadQulListing(
  options: { refresh?: boolean } = {}
): Promise<Map<number, QulResourceMeta>> {
  if (!options.refresh && existsSync(META_PATH)) {
    const raw = JSON.parse(readFileSync(META_PATH, 'utf-8')) as Record<string, QulResourceMeta>;
    return new Map(Object.entries(raw).map(([id, meta]) => [Number(id), meta]));
  }
  mkdirSync(QUL_CACHE_DIR, { recursive: true });
  const jar = await signedIn();
  const get = async (path: string) => {
    const response = await politeFetch(`${QUL_BASE}${path}`, { headers: { cookie: jar.header() } });
    if (!response.ok) throw new Error(`QUL ${path} answered HTTP ${response.status}`);
    return response.text();
  };
  const ids = [
    ...new Set(
      [...(await get('/resources/tafsir')).matchAll(/href="\/resources\/tafsir\/(\d+)"/g)].map(
        (m) => m[1]
      )
    ),
  ];
  const listing: Record<string, QulResourceMeta> = {};
  for (const id of ids) {
    const page = await get(`/resources/tafsir/${id}`);
    const title = decodeEntities(/<title>([\s\S]*?)<\/title>/.exec(page)?.[1] ?? '').trim();
    const tags = [...page.matchAll(/href="\/docs\/([a-z_-]+)"/g)].map((m) => m[1]);
    const links: Record<string, string> = {};
    for (const m of page.matchAll(
      /href="(\/resources\/tafsir\/[0-9a-f]{32}\/download)">\s*([^<]*)/g
    )) {
      const format = m[2].trim().split(/\s+/).pop();
      if (format) links[format] = m[1];
    }
    listing[id] = { title, tags, links };
  }
  writeFileSync(META_PATH, `${JSON.stringify(listing, null, 1)}\n`, 'utf-8');
  return new Map(Object.entries(listing).map(([id, meta]) => [Number(id), meta]));
}

/** The cached download for a resource: the ZIP as QUL serves it (named `.sqlite` by the prototype). */
const zipPathOf = (id: number): string => resolve(QUL_CACHE_DIR, `${id}.sqlite`);
/** The `.db` unzipped out of it, beside it. */
const dbPathOf = (id: number): string => resolve(QUL_CACHE_DIR, `${id}.db`);

/**
 * The resource's database on disk and its pinned-format version, downloading only if not cached.
 */
export async function ensureQulDatabase(
  id: number,
  meta: QulResourceMeta | undefined
): Promise<{ path: string; version: string }> {
  const zipPath = zipPathOf(id);
  if (!existsSync(zipPath)) {
    const link = meta?.links.sqlite;
    if (!link) throw new Error(`QUL resource ${id} has no SQLite download link in the listing.`);
    const jar = await signedIn();
    const response = await politeFetch(`${QUL_BASE}${link}`, { headers: { cookie: jar.header() } });
    if (!response.ok) throw new Error(`QUL download for ${id} answered HTTP ${response.status}`);
    const body = Buffer.from(await response.arrayBuffer());
    // ⚠️ VALIDATED BEFORE IT IS CACHED. An expired session answers 200 with the sign-in page;
    // renamed into place, that HTML would be "the download" for every later build. Only a ZIP
    // that unzips to exactly one `.db` is ever written under the real name.
    unzipSingleDatabase(body);
    mkdirSync(QUL_CACHE_DIR, { recursive: true });
    writeFileSync(`${zipPath}.part`, body);
    renameSync(`${zipPath}.part`, zipPath);
  }
  const { bytes, modified } = unzipSingleDatabase(readFileSync(zipPath));
  const dbPath = dbPathOf(id);
  // Compared byte for byte, never by size: a re-export of equal length is still a re-export.
  if (!existsSync(dbPath) || !readFileSync(dbPath).equals(bytes)) writeFileSync(dbPath, bytes);
  return { path: dbPath, version: `${modified.year}.${modified.month}.${modified.day}` };
}

/**
 * The one `.db` inside a QUL ZIP, and the entry's modification date.
 *
 * ⚠️ A ZIP READER IN FORTY LINES RATHER THAN A DEPENDENCY. The format needed here is the plain one
 * every QUL export uses — a central directory, deflate or stored entries, no ZIP64 — and Node ships
 * both the inflater and the CRC. A directory entry (resource 486 nests its file in one) is skipped;
 * anything but exactly one non-empty `.db` is refused.
 */
export function unzipSingleDatabase(zip: Buffer): {
  bytes: Buffer;
  modified: { year: number; month: number; day: number };
} {
  let end = -1;
  for (let at = zip.length - 22; at >= Math.max(0, zip.length - 65_557); at--) {
    if (zip.readUInt32LE(at) === 0x06054b50) {
      end = at;
      break;
    }
  }
  if (end < 0) throw new Error('Not a ZIP file: no end-of-central-directory record.');
  const count = zip.readUInt16LE(end + 10);
  let at = zip.readUInt32LE(end + 16);
  const found: { bytes: Buffer; modified: { year: number; month: number; day: number } }[] = [];
  for (let i = 0; i < count; i++) {
    if (zip.readUInt32LE(at) !== 0x02014b50) throw new Error('Corrupt ZIP central directory.');
    const method = zip.readUInt16LE(at + 10);
    const dosDate = zip.readUInt16LE(at + 14);
    const crc = zip.readUInt32LE(at + 16);
    const compressedSize = zip.readUInt32LE(at + 20);
    const size = zip.readUInt32LE(at + 24);
    const nameLength = zip.readUInt16LE(at + 28);
    const extraLength = zip.readUInt16LE(at + 30);
    const commentLength = zip.readUInt16LE(at + 32);
    const localOffset = zip.readUInt32LE(at + 42);
    const name = zip.toString('utf-8', at + 46, at + 46 + nameLength);
    at += 46 + nameLength + extraLength + commentLength;
    if (size === 0 || !name.endsWith('.db')) continue;
    const dataStart =
      localOffset + 30 + zip.readUInt16LE(localOffset + 26) + zip.readUInt16LE(localOffset + 28);
    const raw = zip.subarray(dataStart, dataStart + compressedSize);
    const bytes = method === 8 ? inflateRawSync(raw) : method === 0 ? Buffer.from(raw) : null;
    if (bytes === null) throw new Error(`ZIP entry ${name} uses compression method ${method}.`);
    if (bytes.length !== size || crc32(bytes) !== crc)
      throw new Error(`ZIP entry ${name} fails its CRC.`);
    found.push({
      bytes,
      modified: {
        year: ((dosDate >> 9) & 0x7f) + 1980,
        month: (dosDate >> 5) & 0xf,
        day: dosDate & 0x1f,
      },
    });
  }
  if (found.length !== 1) throw new Error(`Expected one .db in the ZIP, found ${found.length}.`);
  return found[0];
}

// ─── Reading passages ────────────────────────────────────────────────────────────────────────

/** One passage as a tafsir pack stores it: a span inside one surah, its text, its notes. */
export interface Passage {
  surah: number;
  verse: number;
  lastVerse: number;
  text: string;
  footnotes: string | null;
}

const verseCountOf = (surah: number): number => SURAH_METADATA[surah - 1]?.verseCount ?? 0;

function parseKey(key: string): { surah: number; verse: number } {
  const match = /^(\d+):(\d+)$/.exec(key.trim());
  const surah = Number(match?.[1]);
  const verse = Number(match?.[2]);
  if (!match || verse < 1 || verse > verseCountOf(surah)) throw new Error(`Bad ayah key "${key}"`);
  return { surah, verse };
}

/**
 * Split a span into one span per surah it touches.
 *
 * ⚠️ A FEW PASSAGES CROSS A SURAH BOUNDARY (Fi Zilal comments on 103:1–104:6 as one text), and
 * the pack schema is `(surah, verse, last_verse)`. Each surah gets its own row carrying the SAME
 * text, so a reader on 104:3 finds the commentary rather than "nothing for this ayah".
 */
export function splitBySurah(
  from: { surah: number; verse: number },
  to: { surah: number; verse: number }
): { surah: number; verse: number; lastVerse: number }[] {
  if (to.surah < from.surah || (to.surah === from.surah && to.verse < from.verse)) {
    throw new Error(`Span ${from.surah}:${from.verse}–${to.surah}:${to.verse} runs backwards`);
  }
  const spans: { surah: number; verse: number; lastVerse: number }[] = [];
  for (let surah = from.surah; surah <= to.surah; surah++) {
    spans.push({
      surah,
      verse: surah === from.surah ? from.verse : 1,
      lastVerse: surah === to.surah ? to.verse : verseCountOf(surah),
    });
  }
  return spans;
}

/** One head row's span after the surah split, and the raw text it carries. */
interface Segment {
  surah: number;
  verse: number;
  lastVerse: number;
  html: string[];
}

/**
 * The rows that count, as QUL stores them: the LAST row per `ayah_key`.
 *
 * ⚠️ A REPEATED `ayah_key` TAKES THE LATER ROW. Four exports (the French Mukhtasar among them)
 * carry all 6,236 rows twice; in the French one the two copies disagree at 79:20–21, where the
 * first copy is shifted by one ayah and the second is right.
 */
function readHeadRows(
  dbPath: string
): { ayah_key: string; from_ayah: string; to_ayah: string; text: string | null }[] {
  // ⚠️ camelCase `readOnly` — `node:sqlite` silently ignores `readonly`.
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    return db
      .prepare(
        'SELECT ayah_key, from_ayah, to_ayah, text FROM tafsir ' +
          'WHERE rowid IN (SELECT MAX(rowid) FROM tafsir GROUP BY ayah_key) ORDER BY rowid'
      )
      .all() as unknown as {
      ayah_key: string;
      from_ayah: string;
      to_ayah: string;
      text: string | null;
    }[];
  } finally {
    db.close();
  }
}

/**
 * Refuse a passage list a pack cannot store: out of book order, a span that runs backwards or past
 * its surah's last ayah, or two passages covering one ayah. Shared with the Swahili reader.
 */
export function assertPassageSpans(
  passages: readonly { surah: number; verse: number; lastVerse: number }[],
  source: string
): void {
  let previous: { surah: number; verse: number; lastVerse: number } | null = null;
  for (const passage of passages) {
    const count = verseCountOf(passage.surah);
    if (
      count === 0 ||
      passage.verse < 1 ||
      passage.lastVerse < passage.verse ||
      passage.lastVerse > count
    ) {
      throw new Error(
        `${source}: passage ${passage.surah}:${passage.verse}–${passage.lastVerse} is outside its surah`
      );
    }
    if (
      previous &&
      (passage.surah < previous.surah ||
        (passage.surah === previous.surah && passage.verse <= previous.lastVerse))
    ) {
      throw new Error(
        `${source}: passage ${passage.surah}:${passage.verse}–${passage.lastVerse} overlaps or ` +
          `precedes ${previous.surah}:${previous.verse}–${previous.lastVerse}`
      );
    }
    previous = passage;
  }
}

/**
 * Every passage of a QUL tafsir database, in book order, no two covering one ayah.
 *
 * ⚠️ OVERLAPPING PASSAGES ARE MERGED, NOT DROPPED. As-Saadi heads 38:48–49 and then 38:49–54;
 * al-Suyuti nests 26:11 inside 26:10–20. A pack stores each ayah under one passage, so an overlap
 * becomes ONE passage over the union of the spans, with the texts in book order — before the HTML
 * is converted, so editor-note numbering runs once across the merged text. A head whose text
 * converts to nothing is not a passage: its ayat stay uncovered, and the app says "nothing for
 * this ayah".
 */
export function readQulPassages(dbPath: string): Passage[] {
  const segments: Segment[] = [];
  for (const row of readHeadRows(dbPath)) {
    if (!row.text || row.text.trim().length === 0) continue;
    if (row.ayah_key !== row.from_ayah) {
      throw new Error(
        `Passage head ${row.ayah_key} does not start its own span (${row.from_ayah})`
      );
    }
    for (const span of splitBySurah(parseKey(row.from_ayah), parseKey(row.to_ayah))) {
      segments.push({ ...span, html: [row.text] });
    }
  }
  segments.sort((a, b) => a.surah - b.surah || a.verse - b.verse || a.lastVerse - b.lastVerse);
  const merged: Segment[] = [];
  for (const segment of segments) {
    const previous = merged[merged.length - 1];
    if (previous && previous.surah === segment.surah && segment.verse <= previous.lastVerse) {
      previous.lastVerse = Math.max(previous.lastVerse, segment.lastVerse);
      previous.html.push(...segment.html);
      continue;
    }
    merged.push({ ...segment, html: [...segment.html] });
  }
  const passages: Passage[] = [];
  for (const { html, ...span } of merged) {
    // Each head's HTML is converted on its own (one may be marked up and the next plain text),
    // then the editor's notes are numbered once across the merged passage.
    const converted = convertTafsirHtml(html);
    if (converted.text.length > 0) passages.push({ ...span, ...converted });
  }
  assertPassageSpans(passages, dbPath);
  return passages;
}

/**
 * How many passages the SOURCE holds, counted independently of {@link readQulPassages} — the
 * truncation check for a built pack (`prepare-packs.ts`).
 *
 * ⚠️ A SECOND, DELIBERATELY SIMPLER READING. Raw SQL for the last row per ayah, a tag-strip for
 * "non-empty", the surah split, and overlapping heads counted as one: the number a complete pack
 * must hold. A reader defect that loses passages (a bad merge, a skipped surah, a conversion that
 * empties a text) disagrees with it; a digest minted from the short pack never would.
 */
export function countSourcePassages(dbPath: string): number {
  const spans: { surah: number; verse: number; lastVerse: number }[] = [];
  for (const row of readHeadRows(dbPath)) {
    const visible = (row.text ?? '')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .trim();
    if (visible.length === 0) continue;
    spans.push(...splitBySurah(parseKey(row.from_ayah), parseKey(row.to_ayah)));
  }
  spans.sort((a, b) => a.surah - b.surah || a.verse - b.verse);
  let count = 0;
  let end: { surah: number; lastVerse: number } | null = null;
  for (const span of spans) {
    if (end && end.surah === span.surah && span.verse <= end.lastVerse) {
      end.lastVerse = Math.max(end.lastVerse, span.lastVerse);
      continue;
    }
    count++;
    end = { surah: span.surah, lastVerse: span.lastVerse };
  }
  return count;
}

/**
 * How much text a QUL export holds — the measure "the largest text" is taken by when two
 * resources are the same work (`prepare-packs.ts`). Over the rows that COUNT, one per `ayah_key`:
 * an export that repeats every row would otherwise measure twice its size.
 */
export function qulRawTextLength(dbPath: string): number {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const row = db
      .prepare(
        'SELECT SUM(LENGTH(text)) AS chars FROM tafsir ' +
          'WHERE rowid IN (SELECT MAX(rowid) FROM tafsir GROUP BY ayah_key)'
      )
      .get() as unknown as { chars: number | null };
    return row.chars ?? 0;
  } finally {
    db.close();
  }
}

// ─── HTML to text ────────────────────────────────────────────────────────────────────────────

/** The tags that end a paragraph. Everything else (`span`, `b`, `i`, `quran`, `root`…) is inline. */
const BLOCK_TAG = /<\/?(?:p|div|h[1-6]|li|ul|ol|body|blockquote|table|tr|br)\b[^<>]*>/gi;
const ANY_TAG = /<\/?[a-zA-Z][^<>]*>/g;
/** `<b<` — a tag the upstream mistyped (`<` for `>`), seen in the Bengali Ibn Kathir. */
const UNCLOSED_TAG = /<\/?[a-zA-Z][a-zA-Z0-9]*<(?![/a-zA-Z])/g;

/**
 * Light HTML to paragraphs separated by a blank line.
 *
 * ⚠️ THE APP RENDERS NO HTML (story 8-5 "Never"), so the conversion happens here, once. Block
 * tags and `<br>` end a paragraph — a heading (`h2`, `h3`) therefore gets a paragraph of its own;
 * inline tags are dropped and their text kept. In a text WITH block markup, raw newlines are the
 * exporter's indentation and fold to a space; in a text with none (the Mukhtasar exports), a
 * newline IS the paragraph break.
 */
export function htmlToParagraphs(html: string): string[] {
  let text = html.replace(/<(style|script)\b[\s\S]*?<\/\1>/gi, '');
  const hasBlocks = /<\/?(?:p|div|br|h[1-6])\b/i.test(text);
  text = hasBlocks ? text.replace(/\s+/g, ' ') : text.replace(/\r\n?/g, '\n');
  text = text.replace(BLOCK_TAG, '\n').replace(UNCLOSED_TAG, '').replace(ANY_TAG, '');
  return decodeEntities(text)
    .split('\n')
    .map((paragraph) => paragraph.replace(/[ \t ]+/g, ' ').trim())
    .filter((paragraph) => paragraph.length > 0);
}

/**
 * A modern editor's notes — `[[…]]` in the QUL exports (the takhrij of Tabari, Baghawi, Ibn
 * Kathir…) — moved out of the text into the footnotes column, each replaced by a marker.
 *
 * ⚠️ MOVED, NOT DELETED. The epic asks for the apparatus to be kept out of the classical text;
 * the footnote column is where a pack already carries an edition's notes (QuranEnc's are rendered
 * under the text in a smaller face), so the reader still has them and the text reads as the author
 * wrote it. An unbalanced `[[` or `]]` is left as it is.
 *
 * ⚠️ THE MARKER NEVER COLLIDES AND NEVER STANDS ALONE. It is `[n]` — unless the text already
 * holds a bracketed number of its own (al-Tha'labi numbers his hadith `[185]`), in which case it
 * is `⁽n⁾`, so a reader can never confuse the author's reference with the editor's. A note that
 * filled a whole paragraph (al-Tha'alibi opens surahs inside one) leaves its marker on the text
 * before it — or, at the very start, on the text after it — never on a line by itself.
 */
export function extractEditorNotes(text: string): { text: string; footnotes: string | null } {
  const outside = text.replace(/\[\[[\s\S]*?\]\]/g, '');
  const superscript = /\[\d+\]/.test(outside);
  const marker = (n: number) =>
    superscript ? `⁽${String(n).replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(d)])}⁾` : `[${n}]`;
  const notes: string[] = [];
  const stripped = text.replace(/\s*\[\[([\s\S]*?)\]\]/g, (_, note: string) => {
    const clean = note.replace(/\s+/g, ' ').trim();
    if (clean.length === 0) return '';
    notes.push(clean);
    return marker(notes.length);
  });
  // A passage that is NOTHING but an editor's note (Qurtubi at 17:30) keeps the note as its text:
  // a passage reading "[1]" with the words underneath would be the apparatus with no text at all.
  if (notes.length > 0 && stripped.replace(/\[\d+\]|⁽[⁰¹²³⁴⁵⁶⁷⁸⁹]+⁾|\s/g, '').length === 0) {
    return { text: notes.join('\n'), footnotes: null };
  }
  return {
    text: attachLoneMarkers(stripped, superscript),
    footnotes:
      notes.length === 0 ? null : notes.map((note, i) => `${marker(i + 1)} ${note}`).join('\n'),
  };
}

/** Move a line that is only markers onto the previous line (or, first, onto the next). */
function attachLoneMarkers(text: string, superscript: boolean): string {
  const lone = superscript ? /^(?:⁽[⁰¹²³⁴⁵⁶⁷⁸⁹]+⁾\s*)+$/ : /^(?:\[\d+\]\s*)+$/;
  const lines = text.split('\n');
  const out: string[] = [];
  let carry = '';
  for (const raw of lines) {
    const line = raw.trim();
    if (line.length > 0 && lone.test(line)) {
      const last = out.length - 1;
      if (last >= 0) out[last] = `${out[last]}${line.replace(/\s+/g, '')}`;
      else carry += line.replace(/\s+/g, '');
      continue;
    }
    if (line.length === 0) continue;
    out.push(carry ? `${carry} ${line}` : line);
    carry = '';
  }
  if (carry) out.push(carry);
  return out.join('\n');
}

/** Paragraphs joined by a blank line — the one shape every tafsir pack's `text` has. */
export const joinParagraphs = (paragraphs: readonly string[]): string =>
  paragraphs
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)
    .join('\n\n');

/** A QUL passage's HTML (one or several heads) as the pack stores it: paragraphs, notes apart. */
export function convertTafsirHtml(html: string | readonly string[]): {
  text: string;
  footnotes: string | null;
} {
  const paragraphs = (typeof html === 'string' ? [html] : html).flatMap(htmlToParagraphs);
  const { text, footnotes } = extractEditorNotes(paragraphs.join('\n'));
  return { text: joinParagraphs(text.split('\n')), footnotes };
}
