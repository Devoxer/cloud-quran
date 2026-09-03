/**
 * Recitation audio constants (story 7-1) — the measured numbers in one place, mirroring
 * `constants/mushaf.ts`.
 *
 * ⚠️ AUDIO COMES FROM THE APP'S OWN CDN AND NOWHERE ELSE, for the same reason the mushaf fonts
 * do. A per-surah fetch is a record of what a reader listens to, which is religious practice and
 * therefore special-category data (GDPR Art. 9). Cloudflare is the only processor the privacy
 * disclosure names; EveryAyah and QuranicAudio are the pipeline's SOURCES, resolved at build time
 * by `scripts/prepare-audio.ts` and republished to R2 — the app never talks to them.
 *
 * ⚠️ THE CDN IS HARDCODED, NOT READ FROM `EXPO_PUBLIC_R2_URL`. That key exists in the env
 * skeleton and is EMPTY, and an empty base would silently build `/audio/alafasy/001.mp3` — a
 * relative URL that fails differently on each platform instead of failing loudly. The host is
 * public, carries no credential, and is already hardcoded for fonts.
 */

/** Where the surah MP3s and per-reciter timing manifests live. */
export const AUDIO_CDN_BASE = 'https://cdn.nobleachievements.com/audio';

/**
 * How often the native playlist reports its position, in milliseconds.
 *
 * ⚠️ THE DEFAULT IS 500ms AND THE CRITERION IS 100ms, so this MUST be passed explicitly —
 * `createAudioPlaylist` does not take the app's word for it otherwise. At 500ms a verse boundary
 * could be missed by half a second, which on a short ayah is most of the ayah.
 *
 * ⚠️ It is a TICK rate, not a render rate. The engine derives the verse key on every tick and
 * publishes it only when it CHANGES (`lib/usePosition.ts`'s discipline, same reason), so ten
 * ticks a second cost ten comparisons — not ten re-renders of the reading list.
 */
export const PLAYLIST_TICK_MS = 100;

/**
 * How long the post-seek guard waits for a tick at or after its target before releasing.
 *
 * The guard drops ticks carrying a pre-seek position so the highlight cannot snap backwards. If
 * the native side silently refuses a seek, no such tick ever arrives — without a release the
 * highlight would freeze for the rest of the session, which is worse than the snap.
 */
export const SEEK_GUARD_TIMEOUT_MS = 2000;

/**
 * How long a track may sit unloaded before playback is called failed.
 *
 * ⚠️ `AudioPlaylistStatus` CARRIES NO ERROR FIELD. A 404, an unplayable file and a slow network
 * are the same event to the status stream — all three are "not loaded yet" — so the only way to
 * tell them apart is how long they last. Without a watchdog the store sat at `loading` forever:
 * no error surface, no retry, and a play button that had visibly done nothing.
 */
export const LOAD_TIMEOUT_MS = 15_000;

/**
 * Subdirectory of the DOCUMENT directory the reciter manifests are cached in.
 *
 * ⚠️ DOCUMENT, NOT `Paths.cache` — `lib/mushafFonts.ts` made this call first and the reasoning is
 * identical: the cache directory is OS-evictable, and an evicted manifest is a reciter that
 * cannot highlight on a plane. A manifest is ~400 KB per reciter and never changes.
 */
export const MANIFEST_CACHE_DIR = 'reciter-manifests';

/** Surah numbers are zero-padded to three digits in the CDN key (`001.mp3`, `114.mp3`). */
export function surahAudioUrl(reciterId: string, surah: number): string {
  return `${AUDIO_CDN_BASE}/${reciterId}/${String(surah).padStart(3, '0')}.mp3`;
}

/** The per-reciter timing manifest: every surah's verse offsets, in one file. */
export function reciterManifestUrl(reciterId: string): string {
  return `${AUDIO_CDN_BASE}/${reciterId}/manifest.json`;
}
