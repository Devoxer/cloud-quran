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
 * Whether this platform can install a pack at all — the ONE fact every surface branches on.
 *
 * ⚠️ WEB HAS NO PACKS IN THIS STORY, AND THAT IS A DECISION RATHER THAN AN OVERSIGHT.
 * `expo-file-system`'s directory model has nowhere to put a downloaded database on web, and
 * `openDatabaseAsync`'s `directory` argument — the thing that would let us point at one — is
 * explicitly unsupported there (`SQLiteDatabase.d.ts:346`). `features/audio/lib/audioDownloads.ts`
 * answers the same question the same way with `DOWNLOADS_SUPPORTED`; this mirrors it exactly. The
 * content screen SAYS SO rather than offering a control that would take a reader's press and do
 * nothing. What web needs instead is an open question for 8-3/8-4.
 */
export const PACKS_SUPPORTED = Platform.OS !== 'web';

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
 * The largest pack this app will install, because it is the largest it can VERIFY.
 *
 * ⚠️ THIS IS A MEMORY CEILING, NOT A POLICY ONE, AND IT EXISTS BECAUSE THE DIGEST CANNOT BE
 * STREAMED HERE. `expo-crypto` exposes `digest(algorithm, data)` and no incremental form, so
 * verifying a pack means holding all of its bytes in the JS heap at once — and the next pack
 * types architecture §17 names are tafsir editions in the tens of megabytes (Ibn Kathir is 23.6 MB
 * deduped). An unbounded `file.bytes()` on a low-memory Android device is an OOM during the one
 * step whose entire job is to be trustworthy.
 *
 * 32 MB clears every source the epic names with room, and a pack above it is REFUSED with a typed
 * reason rather than attempted and crashed. ⚠️ RAISING THIS NUMBER IS NOT THE FIX — the fix is an
 * incremental digest (a chunked `File.open()` read into a streaming hash), which needs a hashing
 * dependency and is therefore an owner call under the story's "Ask First". Until then the ceiling
 * is the honest answer. (Story 8-2 review, C5.)
 */
export const PACK_MAX_VERIFIABLE_BYTES = 32 * 1024 * 1024;

/**
 * How long a transfer may deliver NO bytes before it is called stalled.
 *
 * Same number and same reasoning as `audioDownloads.ts`'s: a captive portal or a dead socket
 * produces a request that neither delivers nor rejects, and without a watchdog the install sits
 * there forever with no way to tell that anything is wrong. The timer is re-armed on every
 * progress event, so a slow connection is never mistaken for a stalled one.
 */
export const PACK_STALL_TIMEOUT_MS = 30_000;
