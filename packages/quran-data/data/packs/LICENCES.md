# Content pack licences

Every content pack Cloud Quran offers is listed here **before it ships**, and
`scripts/verify-licences.ts` (run by `pnpm verify`, and therefore by `pnpm test` and by CI) refuses
a build where `index.json` offers a pack this file does not cover.

⚠️ **This file is the record, not the reasoning.** The verification work behind the table lives in
`_bmad-output/planning-artifacts/sprint-change-proposal-2026-09-16.md` § Evidence (sources checked
live on 2026-09-15/16) and in the PRD's § Content Licensing. What belongs here is one entry per
shippable source: where it came from, which version, what the grant actually says, and — in plain
words — why we are allowed to redistribute it.

⚠️ **Content data never enters this repo.** Packs are built by `scripts/prepare-packs.ts` and
published to the app's own R2 CDN. The repo is mirrored publicly under GPL-3.0, and bundling
third-party text there would purport to grant downstream users redistribution rights we do not
hold. The catalogue (`index.json`) is metadata about a pack and IS committed, because this gate has
to be able to ask "is every offered pack covered?" without a network.

Each entry must carry all five fields below. A missing or empty one fails the gate — an entry that
names no licence and makes no argument is worse than no entry, because it looks like diligence.

---

### quranenc-republication

- **Upstream:** QuranEnc — https://quranenc.com (Rowwad Translation Center / islamhouse.com).
  Editions are listed at `https://quranenc.com/api/v1/translations/list`; the SQLite build for one
  edition is `https://quranenc.com/downloads/sqlite/{key}.sqlite`.
- **Pinned version:** one pin PER EDITION, written `` `{key}` v{version} ``. The pin is enforced
  twice. `prepare-packs.ts` reads each edition's live version from the list endpoint and refuses
  to build an edition that is unpinned or has moved, because a stated version that is not the
  version in the bytes is not a stated version. `verify-licences.ts` then checks every catalogue
  entry against the pin for ITS OWN key (story 8-4) — one shared list of 75 version strings would
  otherwise let one edition's version satisfy another's pack. Every edition QuranEnc grants
  (76, in 56 languages; measured 2026-09-29, `oromo_rwwad` added 2026-10-05):
  - `english_rwwad` v1.0.19 — English Translation - Rowwad Translation Center
  - `english_saheeh` v1.1.2 — English Translation - Noor International Center
  - `english_hilali_khan` v1.1.2 — English Translation - Hilali and Khan
  - `french_rashid` v1.0.3 — French Translation - Rachid Maach
  - `french_montada` v1.0.0 — French translation - Noor International Center
  - `spanish_garcia` v1.0.2 — Spanish Translation - Isa Garcia
  - `spanish_montada_eu` v1.0.1 — Spanish Translation - Noor International Center
  - `spanish_montada_latin` v1.0.1 — Spanish Translation (Latin American) - issued by Noor International
  - `portuguese_nasr` v1.4.1 — Portuguese Translation - Helmi Nasr
  - `german_rwwad` v1.0.15 — German Translation - Rowwad Translation Center
  - `german_bubenheim` v1.1.4 — German Translation - Frank Bubenheim
  - `romanian_project` v1.0.4 — Romanian Translation - Islam4ro.com
  - `dutch_center` v2.0.10 — Dutch Translation - Rowwad Translation Center
  - `swedish_rwwad` v1.0.2 — Swedish Translation - Rowad Translation
  - `turkish_rwwad` v1.0.4 — Turkish Translation - Rowwad Translation Center
  - `turkish_shaban` v1.1.0 — Turkish Translation - Shaaban British
  - `turkish_shahin` v1.0.0 — Turkish Translation - Dr. Ali Ozek and others
  - `azeri_musayev` v1.0.4 — Azerbaijani Translation - Ali Khan Musayev
  - `macedonian_group` v1.0.1 — Macedonian Translation - a group of Macedonian scholars
  - `albanian_rwwad` v1.0.5 — Albanian Translation - Rowwad Translation Center
  - `albanian_nahi` v1.1.0 — Albanian Translation - Hassan Nahi
  - `bosnian_rwwad` v2.0.4 — Bosnian Translation - Rowwad Translation Centre
  - `bosnian_mihanovich` v1.1.0 — Bosnian Translation - Muhammad Mahanovic
  - `serbian_rwwad` v1.0.4 — Serbian Translation - Rowwad Translation Center
  - `croatian_rwwad` v1.0.1 — Croatian Translation - Rowwad Translation Center
  - `lithuanian_rwwad` v1.0.8 — Lithuanian Translation - Rowwad Translation Center
  - `uzbek_rwwad` v1.0.4 — Uzbek Translation - Rowwad Translation Center
  - `uzbek_mansour` v1.0.0 — Uzbek Translation - Alaauddin Mansour
  - `tajik_arifi` v1.0.2 — Tajiki Translation - Rowwad Translation Center
  - `kyrgyz_hakimov` v1.0.2 — Kyrgyz Translation - Shamsuddin Hakimov
  - `indonesian_sabiq` v1.1.3 — Indonesian Translation - Sabiq Company
  - `indonesian_affairs` v1.0.1 — Indonesian Translation - Ministry of Religious Affairs
  - `indonesian_complex` v1.0.1 — Indonesian Translation - The Complex
  - `tagalog_rwwad` v1.1.4 — Filipino Translation (Tagalog) - Rowwad Translation Center
  - `bisayan_rwwad` v1.1.3 — Filipino Translation (Bisayan) - Rowwad Translation Center
  - `maguindanao_rwwad` v1.0.4 — Filipino Translation (Maguindanaon) - Rowwad Translation Center
  - `chinese_suliman` v1.0.8 — Chinese Translation - Muhammad Suleiman
  - `chinese_makin` v1.0.2 — Chinese Translation - Muhammad Makeen
  - `uyghur_saleh` v1.0.2 — Uyghur Translation - Muhammad Saleh (rtl)
  - `japanese_saeedsato` v1.0.13 — Japanese Translation - Saeed Sato
  - `vietnamese_rwwad` v1.0.9 — Vietnamese Translation - Rowwad Translation Center
  - `thai_rwwad` v1.0.1 — Thai Translation - Rowwad Translation Center
  - `khmer_rwwad` v1.0.4 — Khmer Translation - Rowwad Translation Center
  - `khmer_cambodia` v1.0.2 — Khmer Translation - Islamic Community Development Association
  - `persian_ih` v1.1.3 — Persian Translation - Rowwad Translation Center (rtl)
  - `kurdish_bamoki` v1.1.1 — Kurdish Translation - Muhammad Salih Bamoki (rtl)
  - `pashto_rwwad` v1.0.1 — Pashto Translation - Rowwad Translation Center (rtl)
  - `urdu_junagarhi` v1.1.3 — Urdu Translation - Muhammad Junagarhi (rtl)
  - `hindi_omari` v1.1.5 — Hindi Translation - Azizul Haq Al-Omari
  - `telugu_muhammad` v1.0.7 — Telugu Translation - Abdurrahim ibn Muhammad
  - `gujarati_omari` v1.1.3 — Gujarati Translation - Rabella Al-Omari
  - `malayalam_kunhi` v1.0.3 — Malayalam Translation - Abdul Hamid Haidar and Kunhi Muhammad
  - `kannada_hamza` v1.0.3 — Kannada Translation - Hamza Butur
  - `assamese_rafeeq` v1.0.5 — Assamese Translation - Rafiqul Islam Habibur-Rahman
  - `punjabi_arif` v1.0.1 — Punjabi Translation - Arif Haleem
  - `tamil_omar_brief` v1.0.2 — Tamil Translation - Omar Sharif - Abridged Version
  - `tamil_omar` v1.0.3 — Tamil Translation - Omar Sharif
  - `tamil_baqavi` v1.0.1 — Tamil Translation - Abdulhamid Baqawi
  - `sinhalese_mahir` v1.0.6 — Sinhalese Translation - Rowwad Translation Center
  - `swahili_rwwad` v1.0.5 — Swahili Translation - Rowad Translation Center
  - `swahili_barawani` v1.0.1 — Swahili Translation - Ali Mohsin Al-Barwani
  - `somali_yacob` v1.0.26 — Somali Translation - Abdullah Hasan Yaqoub
  - `amharic_zain` v1.0.1 — Amharic Translation - Africa Academy
  - `amharic_sadiq` v1.1.2 — Amharic Translation - Muhammad Sadiq
  - `yoruba_mikail` v1.0.9 — Yoruba Translation - Abu Rahimah Mikael
  - `hausa_gummi` v1.2.2 — Hausa Translation - Abu Bakr Jumi
  - `oromo_ababor` v1.0.3 — Oromo Translation - Gali Ababor
  - `oromo_rwwad` v1.0.0 — Oromo Translation - Rowwad Translation Center
  - `afar_hamza` v1.0.1 — Afar Translation - Mahmoud Abdulqader Hamza
  - `ankobambara_dayyan` v1.0.5 — N'ko Translation - Baba Mamadi (rtl)
  - `kinyarwanda_assoc` v1.0.5 — Kinyarwanda Translation - Rwanda Muslim Association
  - `ikirundi_gehiti` v1.0.4 — Kirundi Translation - Yusuf Gahiti
  - `moore_rwwad` v1.0.2 — Moore Translation - Rowwad Translation Center
  - `asante_harun` v1.0.3 — Akan Translation (Asante) - Harun Ismail
  - `fulani_rwwad` v1.0.2 — Fulani Translation - Rowwad Translation Center
  - `lingala_zakaria` v1.0.2 — Lingala Translation - Mohammed Balangogo
- **Grant:** QuranEnc permits republication of its translations. The conditions are: publish the
  text **without modification**; **credit QuranEnc**; **state the version** published; **carry
  corrections** upstream issues; and do not surround it with **unseemly advertising**.
- **Conditions we meet, and how:**
  - *No modification* — `prepare-packs.ts` copies `translation` and `footnotes` verbatim into the
    pack's `entries` table. It re-containers rows; it changes no character of them. The footnote
    column is carried rather than dropped, because dropping it would be modification by
    subtraction.
  - *Credit and version* — every pack's `pack_meta` carries `source`, `sourceKey`,
    `sourceVersion` and `attribution`, the catalogue repeats them, and the app RENDERS the
    attribution line on the content screen and in the study sheet beside the text it belongs to.
    It is UI, not a buried credit. The attribution is QuranEnc's own title for the edition, then
    `QuranEnc.com`, then the version — built from the pin, never typed.
  - *No modification, including the parts that look like ours to tidy* — `english_saheeh` (the
    Noor International edition) prefixes every one of its 6,236 rows with its ayah number, `(1) `,
    `(2) `, which our interface also draws. It ships with the prefix, because removing it is
    modification; a reader who wants an unprefixed English has `english_rwwad`.
  - *Carry corrections* — a corrected upstream edition is a version bump, which the pin turns into
    a build failure rather than a thing anybody has to remember. A new `packVersion` is a new file
    name, so an installed pack updates atomically.
  - *No unseemly advertising* — Cloud Quran has no monetization surface at all. There are no ads,
    no tracking and no purchases anywhere in the app, by a project non-negotiable.
- **Redistribution argument:** QuranEnc publishes these translations expressly so that others may
  republish them, and states the conditions for doing so. We meet every stated condition, and the
  text ships from our own CDN rather than from the GPL-3.0 repo — so nothing in this project
  purports to re-license the translation or to grant anyone rights QuranEnc has not granted. The
  pack's own metadata names QuranEnc and the version, so a copy of the file is self-describing.

---

### quranenc-bundled-english

- **Upstream:** QuranEnc `english_rwwad` — the Rowwad Translation Center's English translation,
  from `https://quranenc.com/downloads/sqlite/english_rwwad.sqlite`. It is the English the app
  BUNDLES in `apps/expo/src/data/quran.db` (the `translations` table), which search matches
  against with no pack installed. It replaced the Tanzil `en.sahih` text in story 8-4: that copy
  had no written grant we could point to, and it sat in a GPL-3.0 public mirror.
- **Pinned version:** `english_rwwad` v1.0.19. `scripts/prepare-data.ts` refuses to build
  `quran.db` if the live version has moved, and writes the version it built from into
  `packages/quran-data/src/bundled-translation.ts`; `verify-licences.ts` checks that record
  against this pin on every `pnpm verify`.
- **Grant:** the same QuranEnc republication grant as `quranenc-republication` above: publish
  **without modification**, **credit QuranEnc**, **state the version**, **carry corrections**, no
  **unseemly advertising**.
- **Conditions we meet, and how:**
  - *No modification* — `prepare-data.ts` copies `translation` and `footnotes` verbatim into
    `translations.text` and `translations.footnotes`. The inline footnote markers (`[1]`, `[2]`)
    stay in the text; the footnote column is carried, not dropped.
  - *Credit and version* — `bundled-translation.ts` carries the attribution (title, QuranEnc.com,
    version) and the app renders it on the Content screen under "Included with the app".
  - *Carry corrections* — a new upstream version fails the `prepare-data.ts` pin; a deliberate
    bump rebuilds `quran.db`, and the versioned database name in `lib/quranDb.ts` is what makes
    the corrected file reach existing installs rather than only fresh ones.
  - *No unseemly advertising* — as above: the app has no monetization surface at all.
- **Redistribution argument:** unlike a pack, this text IS in the repository and its public
  mirror, inside `quran.db`, because offline search must work on a fresh install with no network.
  QuranEnc's grant permits republication of the unmodified text with credit and version, which is
  exactly what the file carries; the GPL-3.0 licence of this project's CODE does not and cannot
  re-license it, and nothing here claims to. Anyone redistributing the database redistributes
  QuranEnc's text under QuranEnc's conditions.

---

### quranenc-narration

- **Upstream:** QuranEnc's narrated translations — one MP3 per ayah at
  `https://d.quranenc.com/data/audio/{key}/{SSS}{VVV}.mp3`. 13 of the 75 editions publish them
  (measured 2026-09-20, re-measured 2026-09-29); 11 are complete and mirrored. `english_rwwad`
  (17:69 missing) and `azeri_musayev` (served only through 51:47) are NOT mirrored: a narration
  with a hole in it is not published, see `scripts/prepare-audio.ts`.
- **Pinned version:** QuranEnc states no version for the audio itself, so the pin is the
  edition each narration belongs to, at the version current when it was mirrored:
  - `french_rashid` v1.0.3
  - `portuguese_nasr` v1.4.1
  - `dutch_center` v2.0.10
  - `tagalog_rwwad` v1.1.4
  - `chinese_suliman` v1.0.8
  - `vietnamese_rwwad` v1.0.9
  - `persian_ih` v1.1.3
  - `assamese_rafeeq` v1.0.5
  - `tamil_omar_brief` v1.0.2
  - `sinhalese_mahir` v1.0.6
  - `somali_yacob` v1.0.26
- **Grant:** the same QuranEnc republication grant as `quranenc-republication` above.
- **Conditions we meet, and how:**
  - *No modification* — `scripts/prepare-audio.ts` concatenates the 6,236 per-ayah files into 114
    surah files with `ffmpeg -f concat -map 0:a -c copy`: the audio stream is COPIED, not
    re-encoded, so every recited byte is the publisher's. What `-map 0:a` drops is the ~750 KB
    PNG cover art embedded in every file (`english_rwwad` measured 5.59 GB with it, 0.90 GB
    without) — a duplicated picture, not the narration, and not shown by this app, which draws
    its own lock-screen artwork. Transcoding to a lower bitrate would be modification and is not
    done.
  - *Completeness* — a narration is published only when all 6,236 source files fetch and decode;
    the pipeline refuses the edition and names the missing ayat otherwise.
  - *Credit and version* — the voice is named after its edition in the reciter list, and this
    entry records which edition and version each narration was mirrored from.
  - *No unseemly advertising* — as above.
- **Redistribution argument:** the files are republished unmodified (see above) from our own R2
  CDN — mirrored rather than hot-linked, because a per-ayah fetch from `d.quranenc.com` would
  disclose a reader's listening to a third party, and Cloudflare is the only processor the privacy
  disclosure names. No audio enters this repository.

---

### qul-tafsir

- **Upstream:** QUL — the Quranic Universal Library, https://qul.tarteel.ai (Tarteel). One resource
  per tafsir at `/resources/tafsir/{id}`; the SQLite export (a ZIP holding one `.db`, downloadable
  by a signed-in account) is what `scripts/qul.ts` reads. QUL is a LIBRARY: each work's author or
  publisher is the rights holder, and the pack names the work in its title and attribution.
- **Pinned version:** one pin PER RESOURCE, written `` `qul_{id}` v{year}.{month}.{day} `` — the
  modification date of the `.db` inside QUL's ZIP, because QUL states no version and the export date
  is the one fact that moves when the text does. `prepare-packs.ts` refuses a resource that is
  unpinned or whose export date has moved; `verify-licences.ts` checks every catalogue entry
  against the pin for its own key. Every resource published (102 of the 106 QUL listed on
  2026-10-05 — 95 tafsir, 5 i'rab, 2 meanings; the other four are recorded at the end of this
  entry):
  - `qul_22` v2025.5.26 — تفسير ابن كثير (ar; tafsir-ar-ibn-kathir)
  - `qul_23` v2025.5.26 — تفسير القرطبي (ar; tafsir-ar-qurtubi)
  - `qul_25` v2025.7.15 — التحرير والتنوير لابن عاشور (ar; tafsir-ar-ibn-ashur)
  - `qul_26` v2025.5.26 — التفسير الوسيط لطنطاوي (ar; tafsir-ar-wasit)
  - `qul_27` v2025.5.26 — تفسير البغوي (ar; tafsir-ar-baghawi)
  - `qul_28` v2025.5.26 — Fi Zilal al-Quran (ur; tafsir-ur-fi-zilal)
  - `qul_29` v2025.5.26 — Bayan ul Quran (ur; tafsir-ur-bayan-ul-quran)
  - `qul_30` v2025.5.26 — Tafsir Ibn Kathir (ur; tafsir-ur-ibn-kathir)
  - `qul_31` v2025.5.26 — Tafsir Ibn Kathir (bn; tafsir-bn-ibn-kathir)
  - `qul_32` v2025.5.26 — Tafsir Ahsanul Bayaan (bn; tafsir-bn-ahsanul-bayaan)
  - `qul_33` v2025.5.26 — Tafsir Abu Bakr Zakaria (bn; tafsir-bn-abu-bakr-zakaria)
  - `qul_34` v2025.5.26 — Ma'arif al-Qur'an (en; tafsir-en-maarif-ul-quran)
  - `qul_35` v2026.9.24 — Tafsir Ibn Kathir (en; tafsir-en-ibn-kathir)
  - `qul_37` v2025.6.16 — تفسير الطبري (ar; tafsir-ar-tabari)
  - `qul_38` v2025.5.26 — التفسير الميسر (ar; tafsir-ar-muyassar)
  - `qul_39` v2025.5.26 — Tafsir Fathul Majid (bn; tafsir-bn-fathul-majid)
  - `qul_40` v2025.5.27 — Rebar Kurdish Tafsir (ku; tafsir-ku-rebar)
  - `qul_42` v2025.5.26 — Tazkirul Quran (en; tafsir-en-tazkirul-quran)
  - `qul_43` v2025.5.26 — Tazkirul Quran (ur; tafsir-ur-tazkirul-quran)
  - `qul_251` v2025.5.27 — المختصر في تفسير القرآن الكريم (ar; tafsir-ar-mukhtasar)
  - `qul_252` v2025.5.27 — Al-Mukhtasar (bs; tafsir-bs-mukhtasar)
  - `qul_253` v2025.5.27 — Al-Mukhtasar (it; tafsir-it-mukhtasar)
  - `qul_254` v2025.5.27 — Al-Mukhtasar (tl; tafsir-tl-mukhtasar)
  - `qul_255` v2025.5.27 — Al-Mukhtasar (as; tafsir-as-mukhtasar)
  - `qul_256` v2025.5.27 — Al-Mukhtasar (ml; tafsir-ml-mukhtasar)
  - `qul_257` v2025.5.27 — Al-Mukhtasar (km; tafsir-km-mukhtasar)
  - `qul_258` v2025.5.27 — Al-Mukhtasar (tr; tafsir-tr-mukhtasar)
  - `qul_259` v2026.9.30 — Al-Mukhtasar (fr; tafsir-fr-mukhtasar)
  - `qul_260` v2025.5.27 — Al-Mukhtasar (id; tafsir-id-mukhtasar)
  - `qul_261` v2025.5.27 — Al-Mukhtasar (vi; tafsir-vi-mukhtasar)
  - `qul_262` v2025.5.27 — Al-Mukhtasar (ru; tafsir-ru-mukhtasar)
  - `qul_263` v2025.5.27 — Al-Mukhtasar (fa; tafsir-fa-mukhtasar)
  - `qul_264` v2025.5.27 — Al-Mukhtasar (zh; tafsir-zh-mukhtasar)
  - `qul_265` v2025.5.27 — Al-Mukhtasar (ja; tafsir-ja-mukhtasar)
  - `qul_266` v2025.6.23 — Al-Mukhtasar (en; tafsir-en-mukhtasar)
  - `qul_267` v2025.5.27 — Al-Mukhtasar (bn; tafsir-bn-mukhtasar)
  - `qul_268` v2025.5.27 — Al-Mukhtasar (es; tafsir-es-mukhtasar)
  - `qul_283` v2025.5.27 — Tafsir As-Saadi (sq; tafsir-sq-saadi)
  - `qul_306` v2025.5.28 — Tafsir Ibn Kathir (tr; tafsir-tr-ibn-kathir)
  - `qul_307` v2025.5.26 — Tafsir Ibn Kathir (ru; tafsir-ru-ibn-kathir)
  - `qul_308` v2025.5.27 — تفسير السعدي (ar; tafsir-ar-saadi)
  - `qul_309` v2026.4.22 — Tafsir As-Saadi (ur; tafsir-ur-saadi)
  - `qul_310` v2025.5.27 — Tafsir As-Saadi (ru; tafsir-ru-saadi)
  - `qul_453` v2025.5.27 — Al-Mukhtasar (si; tafsir-si-mukhtasar)
  - `qul_484` v2025.7.9 — Tafsir As-Saadi (tr; tafsir-tr-saadi)
  - `qul_485` v2025.7.9 — Tafsir As-Saadi (fa; tafsir-fa-saadi)
  - `qul_486` v2025.12.9 — تفسير ابن عثيمين (ar; tafsir-ar-ibn-uthaymeen)
  - `qul_487` v2025.7.9 — تحليل كلمات القرآن (ar; meanings-ar-tahlil-kalimat)
  - `qul_488` v2025.7.13 — تفسير الرازي (ar; tafsir-ar-razi)
  - `qul_489` v2025.7.9 — الوجيز للواحدي (ar; tafsir-ar-wajiz-wahidi)
  - `qul_490` v2025.7.9 — تفسير مكي بن أبي طالب (ar; tafsir-ar-makki)
  - `qul_491` v2025.7.9 — تفسير ابن جزي (ar; tafsir-ar-ibn-juzayy)
  - `qul_492` v2025.7.9 — موسوعة التفسير المأثور (ar; tafsir-ar-mawsuat-mathur)
  - `qul_493` v2025.7.11 — الدر المنثور للسيوطي (ar; tafsir-ar-durr-manthur)
  - `qul_494` v2025.7.11 — فتح القدير للشوكاني (ar; tafsir-ar-fath-al-qadir)
  - `qul_495` v2025.7.11 — فتح البيان للقنوجي (ar; tafsir-ar-fath-al-bayan)
  - `qul_496` v2025.7.11 — زاد المسير لابن الجوزي (ar; tafsir-ar-ibn-al-jawzi)
  - `qul_497` v2025.7.11 — تفسير أبي السعود (ar; tafsir-ar-abi-al-suud)
  - `qul_498` v2025.7.11 — نظم الدرر للبقاعي (ar; tafsir-ar-biqai)
  - `qul_499` v2025.7.11 — تفسير ابن أبي زمنين (ar; tafsir-ar-ibn-abi-zamanin)
  - `qul_500` v2025.7.11 — تفسير ابن القيم (ar; tafsir-ar-ibn-al-qayyim)
  - `qul_501` v2025.7.11 — تفسير الألوسي (ar; tafsir-ar-alusi)
  - `qul_502` v2025.7.11 — تفسير ابن أبي حاتم (ar; tafsir-ar-ibn-abi-hatim)
  - `qul_503` v2025.7.11 — Tafsir As-Saadi (id; tafsir-id-saadi)
  - `qul_504` v2025.7.11 — الإعراب الميسر (ar; irab-ar-muyassar)
  - `qul_505` v2025.7.11 — الدر المصون للسمين الحلبي (ar; irab-ar-durr-masun)
  - `qul_506` v2025.7.11 — إعراب القرآن لدرويش (ar; irab-ar-darwish)
  - `qul_507` v2025.7.11 — أيسر التفاسير للجزائري (ar; tafsir-ar-jazairi)
  - `qul_508` v2025.7.11 — جامع البيان للإيجي (ar; tafsir-ar-iji)
  - `qul_509` v2025.7.11 — المحرر الوجيز لابن عطية (ar; tafsir-ar-ibn-atiyyah)
  - `qul_510` v2025.7.11 — الكشاف للزمخشري (ar; tafsir-ar-kashshaf)
  - `qul_511` v2025.7.11 — البسيط للواحدي (ar; tafsir-ar-basit)
  - `qul_512` v2025.7.11 — تفسير الماوردي (ar; tafsir-ar-mawardi)
  - `qul_513` v2025.7.11 — تفسير السمرقندي (ar; tafsir-ar-samarqandi)
  - `qul_514` v2025.7.11 — تفسير النسفي (ar; tafsir-ar-nasafi)
  - `qul_515` v2025.7.11 — إعراب القرآن للدعاس (ar; irab-ar-daas)
  - `qul_516` v2025.7.11 — اللباب في علوم الكتاب (ar; tafsir-ar-lubab)
  - `qul_517` v2025.7.11 — تدبر وعمل (ar; tafsir-ar-tadabbur)
  - `qul_518` v2025.7.11 — تفسير البيضاوي (ar; tafsir-ar-baydawi)
  - `qul_519` v2025.7.11 — الميسر في غريب القرآن (ar; meanings-ar-muyassar-gharib)
  - `qul_520` v2025.7.11 — الجدول في إعراب القرآن (ar; irab-ar-jadwal)
  - `qul_521` v2025.7.11 — القراءات - الموسوعة القرآنية (ar; tafsir-ar-qiraat)
  - `qul_522` v2025.7.11 — النشر في القراءات العشر لابن الجزري (ar; tafsir-ar-nashr)
  - `qul_523` v2025.7.11 — تفسير الجلالين (ar; tafsir-ar-jalalayn)
  - `qul_524` v2025.7.11 — محاسن التأويل للقاسمي (ar; tafsir-ar-qasimi)
  - `qul_525` v2025.7.11 — أضواء البيان للشنقيطي (ar; tafsir-ar-adwa-al-bayan)
  - `qul_526` v2025.7.11 — البحر المحيط لأبي حيان (ar; tafsir-ar-bahr-muhit)
  - `qul_527` v2025.7.11 — الجواهر الحسان للثعالبي (ar; tafsir-ar-thaalibi)
  - `qul_528` v2025.7.11 — الكشف والبيان للثعلبي (ar; tafsir-ar-thalabi)
  - `qul_529` v2025.7.11 — تفسير السمعاني (ar; tafsir-ar-samani)
  - `qul_533` v2025.7.11 — Al-Mukhtasar (ps; tafsir-ps-mukhtasar)
  - `qul_534` v2025.7.11 — Al-Mukhtasar (ff; tafsir-ff-mukhtasar)
  - `qul_535` v2025.7.11 — Al-Mukhtasar (hi; tafsir-hi-mukhtasar)
  - `qul_536` v2025.7.11 — Al-Mukhtasar (ky; tafsir-ky-mukhtasar)
  - `qul_537` v2025.7.11 — Al-Mukhtasar (az; tafsir-az-mukhtasar)
  - `qul_538` v2025.7.13 — Al-Mukhtasar (uz; tafsir-uz-mukhtasar)
  - `qul_539` v2025.7.11 — Al-Mukhtasar (ug; tafsir-ug-mukhtasar)
  - `qul_540` v2025.7.11 — Al-Mukhtasar (te; tafsir-te-mukhtasar)
  - `qul_541` v2025.7.11 — Al-Mukhtasar (th; tafsir-th-mukhtasar)
  - `qul_542` v2025.7.11 — Al-Mukhtasar (ku; tafsir-ku-mukhtasar)
  - `qul_543` v2025.7.11 — Al-Mukhtasar (sr; tafsir-sr-mukhtasar)
  - `qul_554` v2025.7.11 — Al-Mukhtasar (ta; tafsir-ta-mukhtasar)
- **Grant:** QUL publishes no licence per resource. Its FAQ (checked 2026-10-05) says the data may
  be used even in commercial projects, asks users to review each resource's own terms, and names no
  resource that forbids reuse. The owner decided on 2026-10-05 that Cloud Quran, being
  non-commercial (free, no ads, waqf-funded), uses any source unless its publisher explicitly
  forbids it, and explicitly accepts **Al-Mukhtasar** (the Tafsir Center's abridged tafsir) despite
  its "all rights reserved" notice. That acceptance covers the Mukhtasar only; it does not extend
  to other "all rights reserved" publishers.
- **Conditions we meet, and how:**
  - *Attribution* — every pack's `pack_meta` and catalogue line carry the work's title, the source
    (`QUL`) and the pinned export date, and the app renders the attribution beside the text in the
    study sheet and on the content screen.
  - *Faithful text* — the passages are copied as QUL groups them (one text over the ayat it
    covers). The only transformations are of FORM: the light HTML becomes plain paragraphs (the app
    renders no HTML), a passage QUL spans across two surahs is stored once per surah, passages
    QUL lets overlap (As-Saadi 38:48–49 and 38:49–54) are merged into one over the union of their
    ayat, and a modern editor's notes (`[[…]]`, the takhrij of Tabari, Ibn Kathir, Baghawi…) move
    to the footnote column, each replaced by `[n]` (`⁽n⁾` where the author already numbers in
    brackets), so the classical text reads as written and the notes stay available.
  - *Type* — five i'rab works (504, 505, 506, 515, 520) are published as `irab` packs and two
    word-meaning works (487, 519) as `meanings` packs (owner, 2026-10-05), so the study sheet offers
    each under its own row; the rest, qira'at included, are `tafsir`.
  - *Non-commercial* — Cloud Quran has no monetization surface at all: no ads, no tracking, no
    purchases.
  - *Not published:* resource 563 ("Ayah Dependency Graphs") is SVG drawings, not text; resource
    250, titled "Asseraj fi Bayan Gharib AlQuran", is byte-identical to As-Saadi (308); 24 and 36
    are smaller exports of As-Saadi in Arabic and Russian than 308 and 310.
- **Redistribution argument:** the classical works are public domain by their authors' deaths;
  the modern ones (the Mukhtasar, the As-Saadi and Ibn Kathir translations, Tazkirul Quran and the
  rest) are used under the owner's decision above, on the ground that their publishers do not
  forbid reuse, with the Mukhtasar accepted by name. Packs ship from our own CDN, never from the
  GPL-3.0 repository, so nothing here purports to re-license a text, and each pack's own metadata
  names the work, QUL and the export it came from.

---

### quranenc-saadi

- **Upstream:** QuranEnc's browse pages for As-Saadi in Swahili,
  `https://quranenc.com/en/browse/swahili_saadi/{sura}` (114 pages, mirrored by
  `scripts/quranenc-saadi.ts`, throttled). QuranEnc's API and SQLite downloads serve only
  `persian_saadi`; the other editions exist only on these pages. The seven QUL also serves (Arabic,
  Albanian, Indonesian, Persian, Russian, Turkish, Urdu) are taken from QUL (`qul-tafsir`).
- **Pinned version:** QuranEnc states no version on the browse pages, so the pin is the date the
  pages were mirrored, recorded beside the cache:
  - `swahili_saadi` v2026.10.5 — Tafsir As-Saadi (sw; tafsir-sw-saadi)
- **Grant:** the browse pages carry QuranEnc's republication conditions (publish without
  modification, credit QuranEnc, state the version, carry corrections, no unseemly advertising),
  the same grant as `quranenc-republication`.
- **Conditions we meet, and how:**
  - *The commentary's words are not changed* — each passage's commentary blocks are copied in order,
    their HTML made plain paragraphs. What the pipeline does change, exactly: it DROPS the verse
    translation that heads each passage (the study sheet shows the Arabic, and translations are
    their own packs); it PREPENDS each surah's introduction blocks to that surah's first passage;
    and where QuranEnc labels two passages that overlap (Al-Kahf "99" then "99 - 101") it MERGES
    them into one passage over the union of their ayat, both commentaries in order.
  - *Credit and version* — `pack_meta` and the catalogue carry `QuranEnc`, the key and the mirror
    date, and the app renders the attribution with the text.
  - *Carry corrections* — a re-mirror is a new pin and, through the digest, a new pack version.
  - *No unseemly advertising* — as above: no monetization surface at all.
- **Redistribution argument:** QuranEnc publishes As-Saadi's translations so that they may be
  republished under its stated conditions, which we meet; the pack ships from our own CDN and its
  metadata names QuranEnc and the version.

---

## Sources deliberately NOT here

Recorded so they are not re-litigated. A source moves out of this list only with a NEW licence or
a recorded owner decision, not with a new opinion.

⚠️ **The owner's decision of 2026-10-05 changed the rule.** Cloud Quran is non-commercial, so a
non-commercial licence no longer disqualifies a source, and a source is used unless its publisher
explicitly forbids it. Al-Mukhtasar (accepted by name) and QUL (now a source, see `qul-tafsir`) left
this list on that date.

- **The Quran.com / Quran Foundation API** — its terms forbid caching beyond seven days and forbid
  redistribution.
- **Anything derived from altafsir.com** (Royal Aal al-Bayt, all rights reserved) — which taints
  the seven `en-*` editions circulating under an MIT repo badge. The Mukhtasar exception does not
  extend to it; using it is an owner question.
- **Tanzil `en.transliteration`** — excluded until now only as non-commercial, which no longer
  disqualifies it. It is not shipped and is not recorded above; story 8-7 re-checks it.
