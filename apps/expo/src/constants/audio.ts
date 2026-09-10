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

/**
 * ── Speed (story 7-4) ────────────────────────────────────────────────────────────────────────
 *
 * The bounds live HERE rather than in the feature because THREE layers need them and they may not
 * import each other: `stores/audioPlayerStore.ts` clamps at the store's door,
 * `features/audio/lib/playbackPrefs.ts` clamps what it reads back off the device, and
 * `components/ui/SpeedSelector.tsx` is the control the reader actually moves. `constants/` is the
 * one home all three are allowed to reach (`lint:layers` rule 5).
 *
 * ⚠️ THE SELECTOR IS INCLUDED BECAUSE IT IS THE ONLY UI THAT SETS A RATE, and it used to hold its
 * own copy of the bounds. "Clamped at the store's door" was true and useless on its own: moving
 * `SPEED_MAX` would have left the slider's track and both steppers' disable points on the old
 * value, so the control would offer a rate the store silently refused. (Story 7-4 review, P10.)
 */

/** Slowest rate offered. Below this the recitation is not comprehensible as recitation. */
export const SPEED_MIN = 0.5;

/**
 * Fastest rate offered — and the platform ceiling, not merely a taste one. iOS clamps the
 * playlist rate to `max(0.1, min(rate, 2.0))` and Android to `coerceIn(0.1f, 2.0f)`, so a larger
 * number here would be silently ignored by the native side and the UI would show a rate nobody
 * is hearing.
 */
export const SPEED_MAX = 2;

/** Normal speed — what an unset, unreadable or corrupt stored value resolves to. */
export const SPEED_DEFAULT = 1;

/**
 * How long the rate must hold still before it is written to the device.
 *
 * ⚠️ THE SLIDER HAS NO RELEASE EVENT. `components/ui/Slider` documents it (story 17.3's accepted
 * regression: the community wrapper does not bridge `onValueChangeFinished`), so `SpeedSelector`
 * commits LIVE — roughly thirty values per drag. Applying each to the native player is right, and
 * cheap; writing each to MMKV is thirty synchronous disk writes for one gesture, and unlike 6-5's
 * font-size slider there is no outbox here to coalesce them. So the audible half stays live and
 * the durable half waits for the drag to end. (Story 7-4 review, P7.)
 */
export const SPEED_PERSIST_DEBOUNCE_MS = 500;

/**
 * The ONE door every rate passes through, at the store and again at the MMKV read.
 *
 * ⚠️ IT TAKES `unknown` ON PURPOSE. Its two callers are a UI control and a value read back off
 * the device, and the second can be anything at all — a string written by an older build, a
 * `NaN`, a key some other feature happened to use. A clamp that assumed `number` would let
 * `NaN` through both comparisons (`NaN < min` and `NaN > max` are both false) and hand the native
 * player a rate it answers by going silent.
 */
export function clampSpeed(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return SPEED_DEFAULT;
  const bounded = Math.min(SPEED_MAX, Math.max(SPEED_MIN, value));
  // Two decimals: the selector's step is 0.05, and floating-point drift on 0.1 increments would
  // otherwise store `1.7999999999999998` and render it as `1.80x` — a value that never round-trips.
  return Math.round(bounded * 100) / 100;
}

/**
 * ── Sleep timer (story 7-4) ──────────────────────────────────────────────────────────────────
 */

/**
 * How often the armed sleep timer is answered when the status stream is NOT running.
 *
 * ⚠️ IT IS A CLOCK, NOT THE TIMER. The deadline is an absolute wall-clock instant, so this
 * interval decides only how promptly a lapsed deadline is NOTICED and how often the countdown
 * label moves — never how much time has passed. That is the whole reason a backgrounded app,
 * whose JS timers are throttled or suspended outright, still pauses on time: playback keeps the
 * 100ms status stream alive in the background, and either clock compares against the same
 * absolute instant.
 */
export const SLEEP_TICK_MS = 1000;

/**
 * How far before the end of a surah an armed "end of surah" timer pauses.
 *
 * ⚠️ IT MUST BEAT THE NATIVE AUTO-ADVANCE, WHICH IS THE WHOLE POINT OF THE OPTION. The playlist
 * rolls into surah *n+1* by itself (story 7-1's queue), so a timer that reacted to the track
 * CHANGE would already be a second into the next surah — the frozen matrix's "pauses at the END
 * of the current surah, not the next track change". Half a second at a 100ms tick leaves five
 * chances to catch the boundary, and what it costs is the tail of the closing file, which is
 * silence.
 */
export const SLEEP_END_LEAD_MS = 500;

/**
 * That lead, in the media time a tick actually covers at the reader's rate.
 *
 * ⚠️ THE LEAD IS MEASURED IN MEDIA TIME AND THE TICK IS MEASURED IN WALL TIME, so the number of
 * chances the check gets is not a constant — it is `lead / (tick × rate)`. At 1.0x a 500ms lead
 * is five ticks; at 2.0x the media advances 200ms per tick and it is two and a half, which one
 * dropped tick turns into a miss. Since this story ships a 2.0x control, the lead scales with the
 * rate so the number of chances does not. `onTrackChanged`'s pause stays the floor beneath it.
 * (Story 7-4 review, P18.)
 */
export function sleepEndLeadMs(rate: number): number {
  return SLEEP_END_LEAD_MS * Math.max(1, rate);
}
