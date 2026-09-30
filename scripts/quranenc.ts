/**
 * QuranEnc — the one upstream every translation and narration this app republishes comes from
 * (story 8-4). Shared by `prepare-packs.ts`, `prepare-data.ts` and `prepare-audio.ts` so that the
 * three pipelines ask the same questions of the same endpoints and read the same ledger pins.
 *
 * ⚠️ THE LIST API IS THE CATALOGUE'S SOURCE, AND IT IS READ, NEVER TRANSCRIBED. Story 8-2
 * hand-wrote one edition; QuranEnc grants 75 across 56 languages, and a hand-maintained array of
 * 75 is 75 chances to publish a stale version under a correct-looking label. The editions, their
 * keys, their live versions and their `direction` all come from
 * `https://quranenc.com/api/v1/translations/list`. What is COMMITTED is the decision to publish a
 * version — the per-edition pin in `packages/quran-data/data/packs/LICENCES.md` — and the build
 * refuses any edition whose live version is not the pinned one.
 *
 * ⚠️ `direction` COMES FROM HERE, NOT FROM A LANGUAGE LIST. The API's RTL set (`fa ku nqo ps ug ur`)
 * includes N'Ko, which no hand-written list in this repo had. The catalogue carries the field and
 * the app renders from it.
 */

import { writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { type LedgerEntry, parseLedger, pinnedEditions } from './verify-licences.ts';

export const QURANENC_LIST_URL = 'https://quranenc.com/api/v1/translations/list';
export const quranEncDbUrl = (key: string): string =>
  `https://quranenc.com/downloads/sqlite/${key}.sqlite`;

/** One edition, as the list endpoint describes it. Only the fields a pipeline reads. */
export interface QuranEncEdition {
  key: string;
  version: string;
  title: string;
  /** ISO 639 code of the edition's language — `nqo`, `mdh` and `ceb` are three-letter. */
  language_iso_code: string;
  direction: 'ltr' | 'rtl';
}

/**
 * The live edition list, in QuranEnc's order.
 *
 * `localization` asks QuranEnc for its own titles in that language; for a language it does not
 * localize into it answers the English titles, which is still the publisher's text.
 */
export async function fetchQuranEncEditions(localization?: string): Promise<QuranEncEdition[]> {
  const url = localization
    ? `${QURANENC_LIST_URL}?localization=${encodeURIComponent(localization)}`
    : QURANENC_LIST_URL;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`QuranEnc list returned HTTP ${response.status} for ${url}`);
  const body = (await response.json()) as { translations?: unknown };
  if (!Array.isArray(body.translations) || body.translations.length === 0) {
    throw new Error(`QuranEnc list returned no translations for ${url}`);
  }
  return body.translations.map((raw) => {
    const entry = raw as Record<string, unknown>;
    const { key, version, title, language_iso_code: language, direction } = entry;
    if (
      typeof key !== 'string' ||
      typeof version !== 'string' ||
      typeof title !== 'string' ||
      typeof language !== 'string' ||
      (direction !== 'ltr' && direction !== 'rtl')
    ) {
      // ⚠️ REFUSED, NOT DEFAULTED. An edition with no `direction` would otherwise ship as `ltr`,
      // which for an Urdu edition is a paragraph ranged the wrong way on every device.
      throw new Error(`QuranEnc list entry is malformed: ${JSON.stringify(raw).slice(0, 200)}`);
    }
    return { key, version, title: title.trim(), language_iso_code: language, direction };
  });
}

/**
 * Every language's name IN THAT LANGUAGE, for the 56 codes QuranEnc publishes.
 *
 * ⚠️ A COMMITTED TABLE, NOT `Intl.DisplayNames`, AND THE REASON IS THE DIGEST. The name is written
 * into every pack's `pack_meta`, so it is part of the bytes the catalogue digests. ICU's answer
 * moves with the Node version (and ICU has no name at all for `mdh`), so deriving it would let a
 * runtime upgrade change 75 packs' bytes with no upstream change — a new `packVersion` for every
 * reader, for nothing. A code not in this table stops the build: a new language is a decision,
 * and its endonym is part of it.
 *
 * Capitalised as a standalone label (a heading on the shelf), which is how ICU does NOT give most
 * of them. `ku` is the Sorani edition (Arabic script, `rtl` in the API), hence کوردی.
 */
export const LANGUAGE_NAMES: Readonly<Record<string, string>> = {
  aa: 'Qafaraf',
  ak: 'Akan',
  am: 'አማርኛ',
  as: 'অসমীয়া',
  az: 'Azərbaycan',
  bs: 'Bosanski',
  ceb: 'Binisaya',
  de: 'Deutsch',
  en: 'English',
  es: 'Español',
  fa: 'فارسی',
  ff: 'Pulaar',
  fr: 'Français',
  gu: 'ગુજરાતી',
  ha: 'Hausa',
  hi: 'हिन्दी',
  hr: 'Hrvatski',
  id: 'Bahasa Indonesia',
  ja: '日本語',
  km: 'ខ្មែរ',
  kn: 'ಕನ್ನಡ',
  ku: 'کوردی',
  ky: 'Кыргызча',
  ln: 'Lingála',
  lt: 'Lietuvių',
  mdh: 'Maguindanaon',
  mk: 'Македонски',
  ml: 'മലയാളം',
  mos: 'Mooré',
  nl: 'Nederlands',
  nqo: 'ߒߞߏ',
  om: 'Oromoo',
  pa: 'ਪੰਜਾਬੀ',
  ps: 'پښتو',
  pt: 'Português',
  rn: 'Ikirundi',
  ro: 'Română',
  rw: 'Ikinyarwanda',
  si: 'සිංහල',
  so: 'Soomaali',
  sq: 'Shqip',
  sr: 'Српски',
  sv: 'Svenska',
  sw: 'Kiswahili',
  ta: 'தமிழ்',
  te: 'తెలుగు',
  tg: 'Тоҷикӣ',
  th: 'ไทย',
  tl: 'Tagalog',
  tr: 'Türkçe',
  ug: 'ئۇيغۇرچە',
  ur: 'اردو',
  uz: 'Oʻzbek',
  vi: 'Tiếng Việt',
  yo: 'Yorùbá',
  zh: '中文',
};

/**
 * The same languages' names in ENGLISH — a search alias, never a heading.
 *
 * ⚠️ IT EXISTS BECAUSE AN ENDONYM IS UNTYPEABLE FOR MOST READERS WHO NEED TO FIND IT. A reader in
 * the English interface looking for the Urdu edition types "urdu", not اردو; Hermes ships no
 * `Intl.DisplayNames` to derive it on the device (`lib/format.ts` records what it does ship).
 */
export const LANGUAGE_NAMES_ENGLISH: Readonly<Record<string, string>> = {
  aa: 'Afar',
  ak: 'Akan',
  am: 'Amharic',
  as: 'Assamese',
  az: 'Azerbaijani',
  bs: 'Bosnian',
  ceb: 'Cebuano',
  de: 'German',
  en: 'English',
  es: 'Spanish',
  fa: 'Persian',
  ff: 'Fula',
  fr: 'French',
  gu: 'Gujarati',
  ha: 'Hausa',
  hi: 'Hindi',
  hr: 'Croatian',
  id: 'Indonesian',
  ja: 'Japanese',
  km: 'Khmer',
  kn: 'Kannada',
  ku: 'Kurdish',
  ky: 'Kyrgyz',
  ln: 'Lingala',
  lt: 'Lithuanian',
  mdh: 'Maguindanao',
  mk: 'Macedonian',
  ml: 'Malayalam',
  mos: 'Mossi',
  nl: 'Dutch',
  nqo: "N'Ko",
  om: 'Oromo',
  pa: 'Punjabi',
  ps: 'Pashto',
  pt: 'Portuguese',
  rn: 'Kirundi',
  ro: 'Romanian',
  rw: 'Kinyarwanda',
  si: 'Sinhala',
  so: 'Somali',
  sq: 'Albanian',
  sr: 'Serbian',
  sv: 'Swedish',
  sw: 'Swahili',
  ta: 'Tamil',
  te: 'Telugu',
  tg: 'Tajik',
  th: 'Thai',
  tl: 'Tagalog',
  tr: 'Turkish',
  ug: 'Uyghur',
  ur: 'Urdu',
  uz: 'Uzbek',
  vi: 'Vietnamese',
  yo: 'Yoruba',
  zh: 'Chinese',
};

export function languageNameOf(code: string): { native: string; english: string } {
  const native = LANGUAGE_NAMES[code];
  const english = LANGUAGE_NAMES_ENGLISH[code];
  if (!native || !english) {
    throw new Error(
      `No language name recorded for "${code}". Add it to LANGUAGE_NAMES and ` +
        'LANGUAGE_NAMES_ENGLISH in scripts/quranenc.ts — a new language is a decision, not a default.'
    );
  }
  return { native, english };
}

/**
 * A pack id from an edition key: `translation-{language}-{rest of the key}`.
 *
 * ⚠️ IT REPRODUCES STORY 8-2's `translation-fr-rashid` FROM `french_rashid`, AND THAT IS WHY IT HAS
 * THIS SHAPE. A pack id is the file-name stem on every device that installed it; an id scheme that
 * renamed the one pack already in readers' hands would orphan it.
 */
export function packIdOf(edition: Pick<QuranEncEdition, 'key' | 'language_iso_code'>): string {
  const rest = edition.key.split('_').slice(1).join('-');
  if (rest.length === 0) throw new Error(`QuranEnc key "${edition.key}" has no edition suffix`);
  return `translation-${edition.language_iso_code}-${rest}`;
}

/**
 * The credit line, in one shape for every edition: the publisher's own title, QuranEnc, and the
 * version. All three are what the grant asks to be stated; none of them is our copy, so the line
 * reads the same in any interface language.
 */
export function attributionOf(title: string, version: string): string {
  return `${title} · QuranEnc.com · v${version}`;
}

/** The ledger entry named `id`, with its per-edition pins. Throws when it is absent. */
export function ledgerPins(ledgerMarkdown: string, id: string): Map<string, string> {
  const entry: LedgerEntry | undefined = parseLedger(ledgerMarkdown).find((e) => e.id === id);
  if (!entry) throw new Error(`LICENCES.md declares no "${id}" entry above its "##" terminator`);
  const { pins, twice } = pinnedEditions(entry);
  if (twice.length > 0) throw new Error(`LICENCES.md "${id}" pins ${twice.join(', ')} twice`);
  return pins;
}

/**
 * Refuse an edition whose live version is not the one the ledger pins.
 *
 * ⚠️ THE GRANT REQUIRES THE VERSION TO BE STATED, which is only meaningful if the bytes shipped and
 * the version printed are the same thing. A drift is a deliberate bump: update the pin in
 * `LICENCES.md` (the build then re-versions the pack on its own, because its digest moves).
 */
export function assertPinned(
  edition: Pick<QuranEncEdition, 'key' | 'version'>,
  pins: ReadonlyMap<string, string>,
  ledgerId: string
): void {
  const pinned = pins.get(edition.key);
  if (pinned === undefined) {
    throw new Error(
      `${edition.key} v${edition.version} is not pinned in LICENCES.md "${ledgerId}". An edition ` +
        'is recorded in the ledger BEFORE it ships — add `' +
        `\`${edition.key}\` v${edition.version}` +
        '` to that entry\'s "Pinned version" list if it is meant to.'
    );
  }
  if (pinned !== edition.version) {
    throw new Error(
      `${edition.key}: upstream is now v${edition.version}, the ledger pins v${pinned}. The grant ` +
        'requires the version to be STATED — bump the pin in LICENCES.md deliberately and re-run.'
    );
  }
}

/** One upstream row, exactly as QuranEnc's SQLite stores it. */
export interface UpstreamRow {
  sura: number;
  aya: number;
  translation: string;
  footnotes: string | null;
}

/** Download an edition's SQLite build to `target`, refusing anything that is not SQLite. */
export async function fetchUpstreamDatabase(key: string, target: string): Promise<void> {
  const response = await fetch(quranEncDbUrl(key));
  if (!response.ok)
    throw new Error(`Upstream database for ${key} returned HTTP ${response.status}`);
  // ⚠️ NOT jsDelivr, and not any mirror: above its package limit jsDelivr answers HTTP 200 with a
  // plain-text error body, so a naive fetcher stores garbage under a correct name. QuranEnc serves
  // its own downloads; the row assertions downstream are the second half of the check.
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 1024 || bytes.subarray(0, 15).toString('latin1') !== 'SQLite format 3') {
    throw new Error(
      `Upstream download for ${key} is not a SQLite file (${bytes.length} bytes). A 200 with an ` +
        'error body is the failure this check exists for.'
    );
  }
  writeFileSync(target, bytes);
}

/** Every row of a downloaded edition, in book order. */
export function readUpstreamRows(path: string): UpstreamRow[] {
  // ⚠️ camelCase `readOnly`. `node:sqlite` SILENTLY IGNORES an unknown constructor option, so
  // Bun's `{ readonly: true }` opens read-WRITE — the trap story 5-3's port recorded.
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    return db
      .prepare('SELECT sura, aya, translation, footnotes FROM translations ORDER BY sura, aya')
      .all() as unknown as UpstreamRow[];
  } finally {
    db.close();
  }
}
