/**
 * The reciter catalogue — the 40 voices this app publishes (story 3-8; reshaped by story 7-2).
 *
 * ⚠️ THIS LIST IS A CLAIM ABOUT THE CDN, NOT A WISH LIST. Every id here must have
 * `{id}/manifest.json` and `{id}/001.mp3`…`114.mp3` published under `AUDIO_CDN_BASE`; naming a
 * voice the pipeline does not publish gives the reader a row that loads forever and then errors.
 * `reciters.test.ts` writes the forty ids out as LITERALS for exactly that reason — a test that
 * derived them from this array could only ever agree with itself.
 *
 * ⚠️ `hasTimingData` IS DELETED (story 7-2), AND IT WAS NEVER A MEASUREMENT. It was `true` on all
 * forty rows and read by nothing. The 2026-09-02 audit found it false on two of them — `alafasy`
 * (1,088 windows missing, Ya-Sin 81 of 83) and `abdulkareem` (305) — so the honest options were to
 * correct the flag or to repair the data. **The data was repaired on 2026-09-08**: `alafasy` moved
 * to the `qdc` pipeline path (its manifest had been built from EveryAyah durations while its audio
 * was QuranicAudio's file — 1,125 null windows *and* a ~0.7% drift), and `abdulkareem`'s audio was
 * re-downloaded after the pipeline's concat gate was made to fail closed on a partial verse set.
 * Re-audited against the live CDN the same day: all 40 return `manifest.json` and `001.mp3` 200,
 * all 40 carry 6,236 usable windows, and every sampled surah's final `timestamp_to` lands within
 * ~60ms of the served file's real duration. A flag that is true by construction on every row
 * discriminates nothing, so it is gone rather than restated.
 *
 * The per-surah completeness question still has an owner at RUNTIME — `isSurahTimed` in
 * `lib/reciterManifest.ts`, which reads the manifest the device actually has rather than a
 * hand-maintained boolean.
 */

/** The three recitation styles, in the order the picker groups them. */
export const RECITER_STYLES = ['murattal', 'mujawwad', 'muallim'] as const;

export type ReciterStyle = (typeof RECITER_STYLES)[number];

export interface Reciter {
  id: string;
  nameArabic: string;
  nameEnglish: string;
  style: ReciterStyle;
}

/**
 * The voice a reader gets before they choose one.
 *
 * ⚠️ IT DUPLICATES `DEFAULT_PREFERENCES.reciterId` RATHER THAN IMPORTING IT, the same trade
 * `DEFAULT_PREFERENCES.fontSize` makes with `ARABIC_FONT_SIZE.default`: `lib/sync.ts` is the query
 * module, and pulling it into a pure data file (and therefore into the feature barrel) to read one
 * string would drag the API client behind it. `reciters.test.ts` asserts the two are the same
 * string, so the duplication cannot drift silently.
 */
export const DEFAULT_RECITER_ID = 'alafasy';

export const RECITERS: Reciter[] = [
  // Murattal (alphabetical by English name, localeCompare order)
  {
    id: 'abdulbasit',
    nameArabic: 'عبد الباسط عبد الصمد',
    nameEnglish: 'Abdul Basit Abdul Samad',
    style: 'murattal',
  },
  {
    id: 'sudais',
    nameArabic: 'عبد الرحمن السديس',
    nameEnglish: 'Abdul Rahman Al-Sudais',
    style: 'murattal',
  },
  {
    id: 'basfar',
    nameArabic: 'عبد الله بصفر',
    nameEnglish: 'Abdullah Basfar',
    style: 'murattal',
  },
  {
    id: 'matroud',
    nameArabic: 'عبد الله مطرود',
    nameEnglish: 'Abdullah Matroud',
    style: 'murattal',
  },
  {
    id: 'shatri',
    nameArabic: 'أبو بكر الشاطري',
    nameEnglish: 'Abu Bakr Al-Shatri',
    style: 'murattal',
  },
  {
    id: 'ajmi',
    nameArabic: 'أحمد العجمي',
    nameEnglish: 'Ahmed Al-Ajmi',
    style: 'murattal',
  },
  {
    id: 'neana',
    nameArabic: 'أحمد نعينع',
    nameEnglish: 'Ahmed Neana',
    style: 'murattal',
  },
  {
    id: 'alaqimy',
    nameArabic: 'أكرم العلاقمي',
    nameEnglish: 'Akram Al-Alaqimy',
    style: 'murattal',
  },
  {
    id: 'hudhaify',
    nameArabic: 'علي الحذيفي',
    nameEnglish: 'Ali Al-Hudhaify',
    style: 'murattal',
  },
  {
    id: 'suesy',
    nameArabic: 'علي حجاج السويسي',
    nameEnglish: 'Ali Hajjaj Al-Suesy',
    style: 'murattal',
  },
  {
    id: 'jaber',
    nameArabic: 'علي جابر',
    nameEnglish: 'Ali Jaber',
    style: 'murattal',
  },
  {
    id: 'sowaid',
    nameArabic: 'أيمن سويد',
    nameEnglish: 'Ayman Sowaid',
    style: 'murattal',
  },
  {
    id: 'alili',
    nameArabic: 'عزيز عليلي',
    nameEnglish: 'Aziz Alili',
    style: 'murattal',
  },
  {
    id: 'abbad',
    nameArabic: 'فارس عباد',
    nameEnglish: 'Fares Abbad',
    style: 'murattal',
  },
  {
    id: 'rifai',
    nameArabic: 'هاني الرفاعي',
    nameEnglish: 'Hani Ar-Rifai',
    style: 'murattal',
  },
  {
    id: 'akhdar',
    nameArabic: 'إبراهيم الأخضر',
    nameEnglish: 'Ibrahim Akhdar',
    style: 'murattal',
  },
  {
    id: 'mansoori',
    nameArabic: 'كريم منصوري',
    nameEnglish: 'Karim Mansoori',
    style: 'murattal',
  },
  {
    id: 'qahtanee',
    nameArabic: 'خالد القحطاني',
    nameEnglish: 'Khalid Al-Qahtanee',
    style: 'murattal',
  },
  {
    id: 'tunaiji',
    nameArabic: 'خليفة الطنيجي',
    nameEnglish: 'Khalifah Al-Tunaiji',
    style: 'murattal',
  },
  {
    id: 'banna',
    nameArabic: 'محمود علي البنا',
    nameEnglish: 'Mahmoud Ali Al-Banna',
    style: 'murattal',
  },
  {
    id: 'husary',
    nameArabic: 'محمود خليل الحصري',
    nameEnglish: 'Mahmoud Khalil Al-Husary',
    style: 'murattal',
  },
  {
    id: 'alafasy',
    nameArabic: 'مشاري راشد العفاسي',
    nameEnglish: 'Mishary Rashid Al-Afasy',
    style: 'murattal',
  },
  {
    id: 'minshawi',
    nameArabic: 'محمد صديق المنشاوي',
    nameEnglish: 'Mohamed Siddiq Al-Minshawi',
    style: 'murattal',
  },
  {
    id: 'tablawi',
    nameArabic: 'محمد الطبلاوي',
    nameEnglish: 'Mohammad Al-Tablawi',
    style: 'murattal',
  },
  {
    id: 'abdulkareem',
    nameArabic: 'محمد عبد الكريم',
    nameEnglish: 'Muhammad Abdul-Kareem',
    style: 'murattal',
  },
  {
    id: 'ayyoub',
    nameArabic: 'محمد أيوب',
    nameEnglish: 'Muhammad Ayyoub',
    style: 'murattal',
  },
  {
    id: 'jibreel',
    nameArabic: 'محمد جبريل',
    nameEnglish: 'Muhammad Jibreel',
    style: 'murattal',
  },
  {
    id: 'qasim',
    nameArabic: 'محسن القاسم',
    nameEnglish: 'Muhsin Al-Qasim',
    style: 'murattal',
  },
  {
    id: 'qatami',
    nameArabic: 'ناصر القطامي',
    nameEnglish: 'Nasser Al-Qatami',
    style: 'murattal',
  },
  {
    id: 'shuraym',
    nameArabic: 'سعود الشريم',
    nameEnglish: "Sa'ud Ash-Shuraym",
    style: 'murattal',
  },
  {
    id: 'ghamidi',
    nameArabic: 'سعد الغامدي',
    nameEnglish: 'Saad Al-Ghamidi',
    style: 'murattal',
  },
  {
    id: 'sahl',
    nameArabic: 'سهل ياسين',
    nameEnglish: 'Sahl Yassin',
    style: 'murattal',
  },
  {
    id: 'bukhatir',
    nameArabic: 'صلاح بخاطر',
    nameEnglish: 'Salaah Bukhatir',
    style: 'murattal',
  },
  {
    id: 'budair',
    nameArabic: 'صالح البدير',
    nameEnglish: 'Salah Al-Budair',
    style: 'murattal',
  },
  {
    id: 'salamah',
    nameArabic: 'ياسر سلامة',
    nameEnglish: 'Yaser Salamah',
    style: 'murattal',
  },
  {
    id: 'dussary',
    nameArabic: 'ياسر الدوسري',
    nameEnglish: 'Yasser Ad-Dussary',
    style: 'murattal',
  },
  // Mujawwad (alphabetical by English name)
  {
    id: 'abdulbasit-mujawwad',
    nameArabic: 'عبد الباسط عبد الصمد',
    nameEnglish: 'Abdul Basit Abdul Samad',
    style: 'mujawwad',
  },
  {
    id: 'husary-mujawwad',
    nameArabic: 'محمود خليل الحصري',
    nameEnglish: 'Mahmoud Khalil Al-Husary',
    style: 'mujawwad',
  },
  {
    id: 'minshawi-mujawwad',
    nameArabic: 'محمد صديق المنشاوي',
    nameEnglish: 'Mohamed Siddiq Al-Minshawi',
    style: 'mujawwad',
  },
  // Muallim (alphabetical by English name)
  {
    id: 'husary-muallim',
    nameArabic: 'محمود خليل الحصري',
    nameEnglish: 'Mahmoud Khalil Al-Husary',
    style: 'muallim',
  },
];

/** Membership, for `resolveReciterId`. Built once; the catalogue never changes at runtime. */
const RECITER_IDS: ReadonlySet<string> = new Set(RECITERS.map((reciter) => reciter.id));

/**
 * The reciter a stored preference actually means.
 *
 * ⚠️ AN UNKNOWN ID MUST NEVER REACH THE CDN. `preferences.reciterId` is a free-form 1–64 character
 * column on the worker (no enum, deliberately — the catalogue is the app's business, not the
 * database's), and the row can be written by another device, an older build, or a build that
 * shipped a voice this one has withdrawn. Left unresolved, that value becomes
 * `AUDIO_CDN_BASE/<whatever>/manifest.json` — a request for a reciter that does not exist, whose
 * only outcome is the load watchdog's error fifteen seconds later. Resolving to the default costs
 * nothing and is the difference between the wrong voice and no voice at all.
 */
export function resolveReciterId(id: string | null | undefined): string {
  return id && RECITER_IDS.has(id) ? id : DEFAULT_RECITER_ID;
}
