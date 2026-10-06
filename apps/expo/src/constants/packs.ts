/**
 * Content-pack tokens — where packs come from, what they are called on disk, and whether this
 * platform can keep one at all (story 8-2).
 *
 * A pack is one source in one language: a versioned read-only SQLite file plus a line in a
 * catalogue, both served from the app's OWN CDN. Content data never enters this repo — the repo is
 * mirrored publicly under GPL-3.0 and bundling somebody else's translation there would purport to
 * grant redistribution rights we do not hold (architecture §17).
 *
 * ⚠️ NEVER A THIRD-PARTY HOST, for `constants/mushaf.ts`'s reason and more strongly. A per-pack
 * fetch discloses which SOURCE a reader studies; Cloudflare is the only processor the privacy
 * disclosure names. jsDelivr is specifically forbidden: above its package limit it answers HTTP
 * 200 with a plain-text error body, so a naive fetcher stores garbage under a correct name.
 */

import { Platform } from 'react-native';

/** Where packs and the catalogue live — R2 bucket `gp-cdn`, prefix `packs/`. */
export const PACK_CDN_BASE = 'https://cdn.nobleachievements.com/packs';

/** The catalogue of everything on offer. Written and uploaded by `scripts/prepare-packs.ts`. */
export const PACK_CATALOGUE_URL = `${PACK_CDN_BASE}/index.json`;

/**
 * Whether this platform can INSTALL a pack — that is, keep one on disk across launches.
 *
 * ⚠️ IT NO LONGER MEANS "WEB HAS NO CONTENT", AND STORY 8-3 IS WHERE THAT CHANGED. 8-2 set this
 * false on web because `expo-file-system` has nowhere to put a downloaded database and
 * `openDatabaseAsync`'s `directory` argument is explicitly unsupported there
 * (`SQLiteDatabase.d.ts:346`) — both still true, and both facts about the FILESYSTEM rather than
 * about reading. Measured 2026-09-19 in WebKit against the live CDN pack,
 * `deserializeDatabaseAsync` opens a fetched pack in memory and answers 6,236 rows with correct
 * text and footnotes. So web's model is fetch-and-hold (see `PACKS_SESSION_ONLY`), and the name
 * this constant keeps is the narrow question it actually answers: can a pack be kept.
 */
export const PACKS_SUPPORTED = Platform.OS !== 'web';

/**
 * Whether a pack this platform holds lives only for the SESSION — web, and nothing else.
 *
 * ⚠️ IT IS THE EXACT COMPLEMENT OF `PACKS_SUPPORTED` TODAY, AND IT IS STILL NOT THE SAME FACT.
 * One asks "can this be kept on disk"; this one asks "will it survive a reload". A reader is owed
 * different copy for each — a native install is a promise about being offline tomorrow, a web
 * fetch is a promise about the next few minutes — and collapsing them into one boolean is how a
 * surface ends up telling a browser reader their content is permanent. The browser's HTTP cache
 * does what the document directory does on native, exactly as `lib/mushafFonts.ts` handles fonts.
 */
export const PACKS_SESSION_ONLY = Platform.OS === 'web';

/**
 * The directory packs are installed into: `expo-sqlite`'s own default database directory, which is
 * `{document}/SQLite` on both native platforms.
 *
 * ⚠️ THE NAME IS THE PORTABLE HALF OF THE `expo-sqlite` API AND THE DIRECTORY ARGUMENT IS NOT.
 * A pack that lands here opens with `openDatabaseAsync(fileName)` and nothing else, on every
 * platform the app runs on. The `.part` file lives beside it and is renamed in.
 *
 * It is also under the DOCUMENT directory rather than `Paths.cache`, which is the rule
 * `lib/mushafFonts.ts` set and `audioDownloads.ts` strengthened: the OS may evict the cache
 * directory under disk pressure, and an evicted pack is a broken offline promise for something the
 * reader deliberately kept.
 *
 * ⚠️ IT IS NOT SPELLED OUT HERE. `lib/quranDb.ts` exports the authoritative value, read from
 * `expo-sqlite`'s `defaultDatabaseDirectory` — guessing `{document}/SQLite` would be a second
 * definition of the same path, and the first upstream change would split them silently.
 */
export const PACK_DIRECTORY_LABEL = 'SQLite';

/** The suffix an in-flight transfer writes under. The rename onto the real name IS the commit. */
export const PACK_PART_SUFFIX = '.part';

/**
 * A pack's file name. ⚠️ THE VERSION IS IN THE NAME, AND THAT IS WHAT MAKES AN UPDATE ATOMIC:
 * a new version is a DIFFERENT FILE, so it downloads beside the old one, verifies, and only then
 * is the old handle closed and the old file deleted. A same-name overwrite would have to close a
 * live handle before knowing the replacement is good — the shape `importDatabaseFromAssetAsync`'s
 * `forceOverwrite` gets wrong for the bundled Quran database.
 */
export function packFileName(id: string, version: number): string {
  return `${id}-v${version}.db`;
}

/** Where a transfer writes until it has finished. Never read by anything but its own attempt. */
export function packPartFileName(id: string, version: number): string {
  return `${packFileName(id, version)}${PACK_PART_SUFFIX}`;
}

/**
 * Read a pack file name back into `(id, version)`, or `null` when the name is not a pack's.
 *
 * The regex wants the exact `-v{n}.db` tail, so `quran.db` — which shares this directory — and any
 * `.part` residue are both invisible to every listing by construction.
 */
export function parsePackFileName(name: string): { id: string; version: number } | null {
  const match = /^(.+)-v(\d+)\.db$/.exec(name);
  if (!match) return null;
  const version = Number.parseInt(match[2], 10);
  return Number.isInteger(version) && version > 0 ? { id: match[1], version } : null;
}

/** The CDN URL for one pack. Mirrors the key `scripts/prepare-packs.ts` uploads to. */
export function packUrl(id: string, version: number): string {
  return `${PACK_CDN_BASE}/${packFileName(id, version)}`;
}

/**
 * The largest pack WEB will hold (story 8-5).
 *
 * ⚠️ NATIVE NEEDS NO VERIFICATION CEILING ANY MORE, AND THAT IS WHAT LETS TABARI INSTALL. Story 8-2
 * capped every pack at 32 MB because the digest could not be streamed: `expo-crypto` hashes one
 * buffer, so verifying meant holding the whole file in the JS heap. The large classical tafsirs
 * run from 32 to 54 MB. `expo-file-system` 58 hashes a FILE natively in 64 KB chunks
 * (`File.digest('SHA-256')`), so the native install verifies a pack of any size without the file
 * ever entering JS (`features/packs/lib/packStore.ts`); it keeps only the sanity cap below.
 *
 * ⚠️ WEB KEEPS ONE, BECAUSE ON WEB THE BYTES ARE THE PACK. A web pack is fetched into memory,
 * hashed there and then HELD there for the session (`features/packs/lib/webPack.ts`), so its size
 * is a heap cost for as long as it is open. 128 MB clears the largest published pack — al-Alusi's
 * tafsir, 54.1 MB measured 2026-10-05 — with room; anything above it is refused with `tooLarge`
 * before a byte is fetched. `catalogue.test.ts` holds every published pack under it.
 */
export const PACK_WEB_MAX_BYTES = 128 * 1024 * 1024;

/**
 * How long a transfer may deliver NO bytes before it is called stalled.
 *
 * Same number and same reasoning as `audioDownloads.ts`'s: a captive portal or a dead socket
 * produces a request that neither delivers nor rejects, and without a watchdog the install sits
 * there forever with no way to tell that anything is wrong. The timer is re-armed on every
 * progress event, so a slow connection is never mistaken for a stalled one.
 */
export const PACK_STALL_TIMEOUT_MS = 30_000;

/**
 * Everything web holds at once, across packs (story 8-5 review). Holding a pack that would push
 * the session past it first releases the least recently used held packs — three classical tafsirs
 * at ~50 MB each are otherwise ~150 MB of heap a reader never asked to keep.
 */
export const PACK_WEB_SESSION_BYTES = 192 * 1024 * 1024;

/**
 * A SANITY cap on one native install — not a verification limit (the digest streams) but a
 * refusal of a catalogue whose `bytes` is nonsense. The largest published pack is 54 MB; a
 * corrupt entry claiming gigabytes must not start an unbounded download onto a reader's phone.
 */
export const PACK_NATIVE_MAX_BYTES = 512 * 1024 * 1024;
