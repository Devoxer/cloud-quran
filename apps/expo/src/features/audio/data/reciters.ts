/**
 * The reciter catalogue — the 50 voices this app publishes: 39 reciters of the Arabic (story 3-8;
 * reshaped by story 7-2) and 11 narrated translations (story 8-4).
 *
 * ⚠️ A NARRATION IS A VOICE, NOT A SECOND KIND OF PLAYBACK (story 8-4). QuranEnc publishes its
 * narrated translations one MP3 per ayah; `scripts/prepare-audio.ts` measures each ayah and
 * concatenates them into 114 surah tracks with a manifest built from the measurements — exactly
 * what the `everyayah` path does for recitation. So a narration id is published under
 * `AUDIO_CDN_BASE` in the same shape as a reciter's, `preferences.reciterId` carries it unchanged,
 * and the engine, the lock screen, the sleep timer and offline downloads never ask which it is.
 * What DOES differ is how the picker groups it, which is why the two are told apart by `kind` —
 * a narration is not a fourth recitation STYLE, and adding one to `RECITER_STYLES` would put a
 * French translation under a heading glossed "measured, unadorned recitation".
 *
 * ⚠️ THIS LIST IS A CLAIM ABOUT THE CDN, NOT A WISH LIST. Every id here must have
 * `{id}/manifest.json` and `{id}/001.mp3`…`114.mp3` published under `AUDIO_CDN_BASE`; naming a
 * voice the pipeline does not publish gives the reader a row that loads forever and then errors.
 * `reciters.test.ts` writes every id out as a LITERAL for exactly that reason — a test that
 * derived them from this array could only ever agree with itself.
 *
 * ⚠️ `hasTimingData` IS DELETED (story 7-2), AND IT WAS NEVER A MEASUREMENT. It was `true` on all
 * every row and read by nothing. The 2026-09-02 audit found it false on two of them — `alafasy`
 * (1,088 windows missing, Ya-Sin 81 of 83) and `abdulkareem` (305) — so the honest options were to
 * correct the flag or to repair the data. `alafasy` WAS repaired on 2026-09-08 and is complete:
 * it moved to the `qdc` pipeline path, its manifest having been built from EveryAyah per-verse
 * durations while its published audio was QuranicAudio's file — 1,125 null windows *and* a ~0.7%
 * drift, so the highlight ran progressively ahead of the recitation.
 *
 * ⚠️ `abdulkareem` COULD NOT BE REPAIRED AND IS DELETED (owner call, 2026-09-08). Its published
 * audio was TRUNCATED, not merely untimed — Al-Baqarah ended at verse 55 (14.3 minutes), Ar-Rum at
 * verse 11, Ash-Shu'ara at 199 — because the pipeline skipped failed verse downloads and
 * concatenated anyway. That gate now fails closed, and the rebuild then refused those three
 * surahs: EveryAyah's own `002056`, `026200` and `030012` are served with an ID3 header and no
 * decodable audio, so there is no source to rebuild them from. A reciter who cannot recite three
 * surahs does not ship. Restoring it means finding those verses elsewhere, not re-running.
 *
 * So the shipped catalogue is 39, every one of them measured complete: all return `manifest.json`
 * and `001.mp3` 200 and carry 6,236 usable windows, and every sampled surah's final `timestamp_to`
 * lands within ~60ms of the served file's real duration. A flag that is true by construction on
 * every row discriminates nothing, so it is gone rather than restated.
 *
 * The per-surah completeness question still has an owner at RUNTIME — `isSurahTimed` in
 * `lib/reciterManifest.ts`, which reads the manifest the device actually has rather than a
 * hand-maintained boolean.
 */

import { isArabicUi } from '@/lib/rtl';

/** The three recitation styles, in the order the picker groups them. Recitation only — see the header. */
export const RECITER_STYLES = ['murattal', 'mujawwad', 'muallim'] as const;

export type ReciterStyle = (typeof RECITER_STYLES)[number];

/** The two kinds of voice, in the order the picker groups them. */
export const VOICE_KINDS = ['recitation', 'narration'] as const;

export type VoiceKind = (typeof VOICE_KINDS)[number];

interface VoiceBase {
  id: string;
  nameArabic: string;
  nameEnglish: string;
}

/** A reciter of the Arabic Quran. */
export interface RecitationVoice extends VoiceBase {
  kind: 'recitation';
  style: ReciterStyle;
}

/**
 * A narrated translation (story 8-4). Its two names are QuranEnc's own titles for the edition,
 * in English and in Arabic, because the picker shows both on every row.
 *
 * ⚠️ IT IS NOT COUPLED TO AN INSTALLED TRANSLATION PACK. The voice stands alone: a reader can
 * listen to the French narration with no French pack installed, and vice versa.
 */
export interface NarrationVoice extends VoiceBase {
  kind: 'narration';
  /** The narration's language code, as QuranEnc gives it. */
  language: string;
  /** That language's own name — what a search for "Français" or "فارسی" should find. */
  languageName: string;
}

export type Reciter = RecitationVoice | NarrationVoice;

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
    kind: 'recitation',
    style: 'murattal',
  },
  {
    id: 'sudais',
    nameArabic: 'عبد الرحمن السديس',
    nameEnglish: 'Abdul Rahman Al-Sudais',
    kind: 'recitation',
    style: 'murattal',
  },
  {
    id: 'basfar',
    nameArabic: 'عبد الله بصفر',
    nameEnglish: 'Abdullah Basfar',
    kind: 'recitation',
    style: 'murattal',
  },
  {
    id: 'matroud',
    nameArabic: 'عبد الله مطرود',
    nameEnglish: 'Abdullah Matroud',
    kind: 'recitation',
    style: 'murattal',
  },
  {
    id: 'shatri',
    nameArabic: 'أبو بكر الشاطري',
    nameEnglish: 'Abu Bakr Al-Shatri',
    kind: 'recitation',
    style: 'murattal',
  },
  {
    id: 'ajmi',
    nameArabic: 'أحمد العجمي',
    nameEnglish: 'Ahmed Al-Ajmi',
    kind: 'recitation',
    style: 'murattal',
  },
  {
    id: 'neana',
    nameArabic: 'أحمد نعينع',
    nameEnglish: 'Ahmed Neana',
    kind: 'recitation',
    style: 'murattal',
  },
  {
    id: 'alaqimy',
    nameArabic: 'أكرم العلاقمي',
    nameEnglish: 'Akram Al-Alaqimy',
    kind: 'recitation',
    style: 'murattal',
  },
  {
    id: 'hudhaify',
    nameArabic: 'علي الحذيفي',
    nameEnglish: 'Ali Al-Hudhaify',
    kind: 'recitation',
    style: 'murattal',
  },
  {
    id: 'suesy',
    nameArabic: 'علي حجاج السويسي',
    nameEnglish: 'Ali Hajjaj Al-Suesy',
    kind: 'recitation',
    style: 'murattal',
  },
  {
    id: 'jaber',
    nameArabic: 'علي جابر',
    nameEnglish: 'Ali Jaber',
    kind: 'recitation',
    style: 'murattal',
  },
  {
    id: 'sowaid',
    nameArabic: 'أيمن سويد',
    nameEnglish: 'Ayman Sowaid',
    kind: 'recitation',
    style: 'murattal',
  },
  {
    id: 'alili',
    nameArabic: 'عزيز عليلي',
    nameEnglish: 'Aziz Alili',
    kind: 'recitation',
    style: 'murattal',
  },
  {
    id: 'abbad',
    nameArabic: 'فارس عباد',
    nameEnglish: 'Fares Abbad',
    kind: 'recitation',
    style: 'murattal',
  },
  {
    id: 'rifai',
    nameArabic: 'هاني الرفاعي',
    nameEnglish: 'Hani Ar-Rifai',
    kind: 'recitation',
    style: 'murattal',
  },
  {
    id: 'akhdar',
    nameArabic: 'إبراهيم الأخضر',
    nameEnglish: 'Ibrahim Akhdar',
    kind: 'recitation',
    style: 'murattal',
  },
  {
    id: 'mansoori',
    nameArabic: 'كريم منصوري',
    nameEnglish: 'Karim Mansoori',
    kind: 'recitation',
    style: 'murattal',
  },
  {
    id: 'qahtanee',
    nameArabic: 'خالد القحطاني',
    nameEnglish: 'Khalid Al-Qahtanee',
    kind: 'recitation',
    style: 'murattal',
  },
  {
    id: 'tunaiji',
    nameArabic: 'خليفة الطنيجي',
    nameEnglish: 'Khalifah Al-Tunaiji',
    kind: 'recitation',
    style: 'murattal',
  },
  {
    id: 'banna',
    nameArabic: 'محمود علي البنا',
    nameEnglish: 'Mahmoud Ali Al-Banna',
    kind: 'recitation',
    style: 'murattal',
  },
  {
    id: 'husary',
    nameArabic: 'محمود خليل الحصري',
    nameEnglish: 'Mahmoud Khalil Al-Husary',
    kind: 'recitation',
    style: 'murattal',
  },
  {
    id: 'alafasy',
    nameArabic: 'مشاري راشد العفاسي',
    nameEnglish: 'Mishary Rashid Al-Afasy',
    kind: 'recitation',
    style: 'murattal',
  },
  {
    id: 'minshawi',
    nameArabic: 'محمد صديق المنشاوي',
    nameEnglish: 'Mohamed Siddiq Al-Minshawi',
    kind: 'recitation',
    style: 'murattal',
  },
  {
    id: 'tablawi',
    nameArabic: 'محمد الطبلاوي',
    nameEnglish: 'Mohammad Al-Tablawi',
    kind: 'recitation',
    style: 'murattal',
  },
  {
    id: 'ayyoub',
    nameArabic: 'محمد أيوب',
    nameEnglish: 'Muhammad Ayyoub',
    kind: 'recitation',
    style: 'murattal',
  },
  {
    id: 'jibreel',
    nameArabic: 'محمد جبريل',
    nameEnglish: 'Muhammad Jibreel',
    kind: 'recitation',
    style: 'murattal',
  },
  {
    id: 'qasim',
    nameArabic: 'محسن القاسم',
    nameEnglish: 'Muhsin Al-Qasim',
    kind: 'recitation',
    style: 'murattal',
  },
  {
    id: 'qatami',
    nameArabic: 'ناصر القطامي',
    nameEnglish: 'Nasser Al-Qatami',
    kind: 'recitation',
    style: 'murattal',
  },
  {
    id: 'shuraym',
    nameArabic: 'سعود الشريم',
    nameEnglish: "Sa'ud Ash-Shuraym",
    kind: 'recitation',
    style: 'murattal',
  },
  {
    id: 'ghamidi',
    nameArabic: 'سعد الغامدي',
    nameEnglish: 'Saad Al-Ghamidi',
    kind: 'recitation',
    style: 'murattal',
  },
  {
    id: 'sahl',
    nameArabic: 'سهل ياسين',
    nameEnglish: 'Sahl Yassin',
    kind: 'recitation',
    style: 'murattal',
  },
  {
    id: 'bukhatir',
    nameArabic: 'صلاح بخاطر',
    nameEnglish: 'Salaah Bukhatir',
    kind: 'recitation',
    style: 'murattal',
  },
  {
    id: 'budair',
    nameArabic: 'صالح البدير',
    nameEnglish: 'Salah Al-Budair',
    kind: 'recitation',
    style: 'murattal',
  },
  {
    id: 'salamah',
    nameArabic: 'ياسر سلامة',
    nameEnglish: 'Yaser Salamah',
    kind: 'recitation',
    style: 'murattal',
  },
  {
    id: 'dussary',
    nameArabic: 'ياسر الدوسري',
    nameEnglish: 'Yasser Ad-Dussary',
    kind: 'recitation',
    style: 'murattal',
  },
  // Mujawwad (alphabetical by English name)
  {
    id: 'abdulbasit-mujawwad',
    nameArabic: 'عبد الباسط عبد الصمد',
    nameEnglish: 'Abdul Basit Abdul Samad',
    kind: 'recitation',
    style: 'mujawwad',
  },
  {
    id: 'husary-mujawwad',
    nameArabic: 'محمود خليل الحصري',
    nameEnglish: 'Mahmoud Khalil Al-Husary',
    kind: 'recitation',
    style: 'mujawwad',
  },
  {
    id: 'minshawi-mujawwad',
    nameArabic: 'محمد صديق المنشاوي',
    nameEnglish: 'Mohamed Siddiq Al-Minshawi',
    kind: 'recitation',
    style: 'mujawwad',
  },
  // Muallim (alphabetical by English name)
  {
    id: 'husary-muallim',
    nameArabic: 'محمود خليل الحصري',
    nameEnglish: 'Mahmoud Khalil Al-Husary',
    kind: 'recitation',
    style: 'muallim',
  },
  // Narrated translations (story 8-4) — alphabetical by English title. QuranEnc's own titles for
  // the edition each voice narrates; the 11 editions whose per-ayah audio QuranEnc publishes whole.
  {
    id: 'narration-as-rafeeq',
    nameArabic: 'الترجمة الآسامية - رفيق الإسلام حبيب الرحمن',
    nameEnglish: 'Assamese Translation - Rafiqul Islam Habibur-Rahman',
    kind: 'narration',
    language: 'as',
    languageName: 'অসমীয়া',
  },
  // ⚠️ No Azerbaijani narration: QuranEnc serves `azeri_musayev` only through 51:47, so the
  // pipeline's completeness gate refuses it (2026-09-29). See `scripts/prepare-audio.ts`.
  {
    id: 'narration-zh-suliman',
    nameArabic: 'الترجمة الصينية - محمد سليمان',
    nameEnglish: 'Chinese Translation - Muhammad Suleiman',
    kind: 'narration',
    language: 'zh',
    languageName: '中文',
  },
  {
    id: 'narration-nl-center',
    nameArabic: 'الترجمة الهولندية - مركز رواد الترجمة',
    nameEnglish: 'Dutch Translation - Rowwad Translation Center',
    kind: 'narration',
    language: 'nl',
    languageName: 'Nederlands',
  },
  // ⚠️ No English narration: `english_rwwad`'s 17:69 is missing upstream, so the pipeline's
  // completeness gate refused it (2026-09-29). See `scripts/prepare-audio.ts`.
  {
    id: 'narration-tl-rwwad',
    nameArabic: 'الترجمة الفلبينية (تجالوج) - مركز رواد الترجمة',
    nameEnglish: 'Filipino Translation (Tagalog) - Rowwad Translation Center',
    kind: 'narration',
    language: 'tl',
    languageName: 'Tagalog',
  },
  {
    id: 'narration-fr-rashid',
    nameArabic: 'الترجمة الفرنسية - رشيد معاش',
    nameEnglish: 'French Translation - Rachid Maach',
    kind: 'narration',
    language: 'fr',
    languageName: 'Français',
  },
  {
    id: 'narration-fa-ih',
    nameArabic: 'الترجمة الفارسية - مركز رواد الترجمة',
    nameEnglish: 'Persian Translation - Rowwad Translation Center',
    kind: 'narration',
    language: 'fa',
    languageName: 'فارسی',
  },
  {
    id: 'narration-pt-nasr',
    nameArabic: 'الترجمة البرتغالية - حلمي نصر',
    nameEnglish: 'Portuguese Translation - Helmi Nasr',
    kind: 'narration',
    language: 'pt',
    languageName: 'Português',
  },
  {
    id: 'narration-si-mahir',
    nameArabic: 'الترجمة السنهالية - مركز رواد الترجمة',
    nameEnglish: 'Sinhalese Translation - Rowwad Translation Center',
    kind: 'narration',
    language: 'si',
    languageName: 'සිංහල',
  },
  {
    id: 'narration-so-yacob',
    nameArabic: 'الترجمة الصومالية - عبدالله حسن يعقوب',
    nameEnglish: 'Somali Translation - Abdullah Hasan Yaqoub',
    kind: 'narration',
    language: 'so',
    languageName: 'Soomaali',
  },
  {
    id: 'narration-ta-omar-brief',
    nameArabic: 'الترجمة التاميلية - عمر شريف - نسخة مختصرة',
    nameEnglish: 'Tamil Translation - Omar Sharif - Abridged Version',
    kind: 'narration',
    language: 'ta',
    languageName: 'தமிழ்',
  },
  {
    id: 'narration-vi-rwwad',
    nameArabic: 'الترجمة الفيتنامية - مركز رواد الترجمة',
    nameEnglish: 'Vietnamese Translation - Rowwad Translation Center',
    kind: 'narration',
    language: 'vi',
    languageName: 'Tiếng Việt',
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

/**
 * The name a surface should print for ONE reciter row, in the UI LANGUAGE (story 8-1 follow-up).
 *
 * ⚠️ THE CATALOGUE CARRIES BOTH NAMES AND EVERY SURFACE PRINTED THE ENGLISH ONE until 2026-09-13,
 * so an Arabic interface said `إدارة تنزيلات Mishary Rashid Al-Afasy` and the mini player named
 * the voice in Latin over Arabic recitation — the same mixed-script defect the surah names had
 * (`lib/surahName.ts`). Script, not direction: `isArabicUi()`, never `isRTL()`, because a web
 * reader gets Arabic copy in an LTR layout.
 *
 * ⚠️ THE PICKER IS NOT A CALLER, ON PURPOSE. `ReciterPicker` draws both names on every row (label
 * + description) in both languages and folds both into its search, because choosing among 39
 * voices is a cross-script lookup — the same exception the surah index gets. This function is for
 * the places that print ONE name, usually inside a translated sentence.
 *
 * `undefined` in, `undefined` out, so a caller that did not find a row keeps its own fallback.
 */
export function reciterNameOf(reciter: Reciter | undefined): string | undefined {
  if (!reciter) return undefined;
  return isArabicUi() ? reciter.nameArabic : reciter.nameEnglish;
}

/**
 * The name a surface should print for an id — RESOLVED first, so it can never print a withdrawn
 * one back at the reader.
 *
 * ⚠️ IT EXISTS FOR THE `(profile)` HEADER, which resolves a route's title from the focused
 * segment and had nowhere to look up a param. The reciter-downloads screen's title IS the voice
 * (owner, 2026-09-11), so the name has to be readable from outside this feature's components;
 * every one of them already had `RECITERS.find` inline, which is the same lookup written three
 * times.
 */
export function reciterDisplayName(id: string | null | undefined): string {
  const resolved = resolveReciterId(id);
  return reciterNameOf(RECITERS.find((reciter) => reciter.id === resolved)) ?? resolved;
}
