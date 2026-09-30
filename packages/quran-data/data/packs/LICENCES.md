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
  (75, in 56 languages; measured 2026-09-29):
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

## Sources deliberately NOT here

Recorded so they are not re-litigated. A source moves out of this list only with a NEW licence, not
with a new opinion.

- **Al-Mukhtasar and every modern copyrighted tafsir** — the Tafsir Center's own site states
  `جميع الحقوق محفوظة`.
- **The Quran.com / Quran Foundation API** — its terms forbid caching beyond seven days and forbid
  redistribution.
- **Tanzil `en.transliteration`** — non-commercial use only, which a GPL-3.0 project cannot honour
  downstream.
- **Anything derived from altafsir.com** (Royal Aal al-Bayt, all rights reserved) — which taints
  the seven `en-*` editions circulating under an MIT repo badge.
- **QUL / Tarteel** — a library, not a rights holder. Discovery only; never cite it as a licence.
