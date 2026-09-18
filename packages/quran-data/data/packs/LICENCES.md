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
- **Pinned version:** `french_rashid` v1.0.3 (Rachid Maach, French). The pin is enforced:
  `prepare-packs.ts` reads the live version from the list endpoint and refuses to build if it has
  moved, because a stated version that is not the version in the bytes is not a stated version.
- **Grant:** QuranEnc permits republication of its translations. The conditions are: publish the
  text **without modification**; **credit QuranEnc**; **state the version** published; **carry
  corrections** upstream issues; and do not surround it with **unseemly advertising**.
- **Conditions we meet, and how:**
  - *No modification* — `prepare-packs.ts` copies `translation` and `footnotes` verbatim into the
    pack's `entries` table. It re-containers rows; it changes no character of them. The footnote
    column is carried rather than dropped, because dropping it would be modification by
    subtraction.
  - *Credit and version* — every pack's `pack_meta` carries `source`, `sourceVersion` and
    `attribution`, the catalogue repeats them, and the app RENDERS the attribution line on the
    content screen beside the pack it belongs to. It is UI, not a buried credit.
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
