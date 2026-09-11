/**
 * useRecitationEngine — the single boot-level recitation engine (story 7-1).
 *
 * Owns everything imperative about playback: the native `AudioPlaylist`, both of its listeners,
 * the post-seek guard, the lock-screen metadata, and the listening-position writes. It registers
 * its async actions into `audioPlayerStore` once at boot, so every consumer selects a stable
 * function reference and nothing re-renders on a status tick.
 *
 * ── The queue is surahs, and that is what buys three acceptance criteria ─────────────────────
 *
 * `playSurah(n)` builds the playlist as surahs **n…114** — one MP3 per track, at most 114 of
 * them. Three behaviours then fall out of the native player rather than out of code here:
 * auto-advance at the end of a surah, an accurate scrubber, and — because the loop mode is
 * `'none'` and 114 is the last entry — **stopping at the end of An-Nas instead of wrapping round
 * to Al-Fatihah**. Advancing an AYAH is never a track change; it is a `seekTo` inside the
 * current track.
 *
 * ⚠️ THE PLAYLIST IS REBUILT ON EVERY `playSurah`, deliberately. The alternative — one 114-track
 * playlist built once and `skipTo`'d — sounds tidier and is worse: `skipTo` across dozens of
 * tracks makes the native player tear down and re-prepare anyway, and it leaves `currentIndex`
 * meaning something different from "how far past the surah we asked for", which is the mapping
 * every other line here depends on. Sources are URLs; building 114 of them is string work.
 *
 * ── The status tick is where highlighting happens ────────────────────────────────────────────
 *
 * ⚠️ `updateInterval` IS PASSED EXPLICITLY. It defaults to 500ms and the criterion is 100ms — at
 * the default a short ayah could be missed almost entirely. The cost is bounded because the tick
 * publishes the verse key only when it CHANGES (`audioPlayerStore`'s note), so ten ticks a second
 * are ten integer comparisons, not ten re-renders of Al-Baqarah.
 *
 * ⚠️ THE PLAYER SPEAKS SECONDS AND THE MANIFEST SPEAKS MILLISECONDS. The conversion happens on
 * the two lines below that touch `currentTime` and `seekTo`, and nowhere else in the app.
 *
 * ── Speed and the sleep timer are BOTH answered here (story 7-4) ─────────────────────────────
 *
 * The rate is applied to the native playlist and persisted to device-local MMKV from ONE store
 * subscription, and asserted again on every playlist build. The sleep timer is an absolute
 * wall-clock deadline answered by two clocks — this file's 100ms status stream, which is the one
 * that survives backgrounding, and a 1s interval that exists for the states the status stream
 * does not reach (armed while paused, and a countdown label that has to move). "End of surah" is
 * a third thing again: it pauses BEFORE the boundary, because the playlist advances by itself.
 *
 * ⚠️ `savePosition` ALREADY RUNS ON PAUSE, so a sleep-timer pause writes the listening position
 * for free. There is no second write here, and adding one would double the store's busiest path.
 *
 * ── The lock screen is a full card, not a play/pause stub (story 7-3) ────────────────────────
 *
 * `setActiveForLockScreen` is given `LOCK_SCREEN_OPTIONS`, which is what puts previous/next on
 * the card at all — every flag in the native record defaults to `false`, so 7-1's bare `true`
 * left a play/pause button and nothing else. Next and previous move by SURAH, because a queue
 * entry is a surah; the fixed-time seek buttons stay off.
 *
 * ⚠️ EVERY PUSH IS THE WHOLE PAYLOAD — title and artist. Native replaces the record rather
 * than merging, so a partial push strips a card that already had the other. The artist is the
 * LOADED track's voice read from the store, never the preference, which is what the NEXT track
 * will use. The artwork is `assets/audio-artwork.png` resolved once per process and carried on
 * every `AudioSource` — and deliberately NOT on the metadata, for which `lockScreenMetadata` is
 * the argument. Pushes are deduped against the card the native side is already showing.
 *
 * ⚠️ NONE OF IT EXISTS ON WEB — the patched module's web playlist implements all three
 * lock-screen calls as empty bodies. See `LOCK_SCREEN_OPTIONS`.
 *
 * ── Why no `useState` anywhere in here ───────────────────────────────────────────────────────
 *
 * Every mutable value is a ref, and the host renders `null`. A hook that re-rendered on playback
 * would re-render whatever mounts it — and this mounts at the app root.
 */

import { Asset } from 'expo-asset';
import {
  type AudioLockScreenOptions,
  type AudioMetadata,
  type AudioPlaylist,
  type AudioPlaylistStatus,
  type AudioSource,
  createAudioPlaylist,
  setAudioModeAsync,
} from 'expo-audio';
import { SURAH_COUNT, SURAH_METADATA } from 'quran-data';
import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus, Platform } from 'react-native';

import {
  ARTWORK_TIMEOUT_MS,
  LOAD_TIMEOUT_MS,
  PLAYLIST_TICK_MS,
  SEEK_GUARD_TIMEOUT_MS,
  SLEEP_TICK_MS,
  SPEED_PERSIST_DEBOUNCE_MS,
  sleepEndLeadMs,
} from '@/constants/audio';
import { addBreadcrumb, captureException } from '@/lib/errors';
import {
  isSurahTimed,
  loadReciterManifest,
  offsetOfVerse,
  type ReciterManifest,
  verseAtMs,
} from '@/lib/reciterManifest';
import { setAudioPosition } from '@/lib/sync';
import { type PlaybackState, useAudioPlayerStore } from '@/stores/audioPlayerStore';
import { RECITERS } from '../data/reciters';
import { resolveSurahUris } from '../lib/audioSource';
import { readStoredSpeed, writeStoredSpeed } from '../lib/playbackPrefs';

/**
 * The lock-screen transport (story 7-3).
 *
 * ⚠️ THIS OBJECT IS THE WHOLE DEFECT 7-3 EXISTS TO FIX. `setActiveForLockScreen(true)` was called
 * with NO options, and every flag in the native record defaults to `false` — so iOS set
 * `nextTrackCommand.isEnabled = false` and the lock screen carried a play/pause button and
 * nothing else.
 *
 * ⚠️ NEXT/PREVIOUS MOVE BY **SURAH**, AND THE SEEK BUTTONS STAY OFF. A queue entry is a surah
 * (see this file's header), so a track button moves a track — which is what the reader means by
 * "next" on a Quran player. The ±10s `showSeek*` buttons are the fixed-time skip story 3-3's AC3
 * forbids outright: a reader who wants to move within a surah moves by AYAH, and nothing on a
 * lock screen can express that.
 *
 * ⚠️ `isLiveStream: false` IS LOAD-BEARING, NOT A RESTATED DEFAULT. It is what keeps the duration
 * and the scrub bar on the card (`true` hides both and disables seeking), and the criterion asks
 * for a scrubber by name. The native record's `isLiveStream` is nullable and falls back to the
 * player's own `isLive` probe when omitted — so saying it is cheaper than trusting that probe.
 *
 * ⚠️ AND ALL OF IT IS A NO-OP ON WEB, WHICH IS A SHIPPED PLATFORM HERE. The patched module's web
 * `AudioPlaylist` implements `setActiveForLockScreen`, `updateLockScreenMetadata` and
 * `clearLockScreenControls` as EMPTY BODIES — there is no Media Session bridge — so a browser
 * gets no now-playing card, no transport and no artwork, and the asset resolve below buys nothing
 * there. Stated rather than discovered: a web smoke of this story can only ever show that nothing
 * crashed.
 */
const LOCK_SCREEN_OPTIONS: AudioLockScreenOptions = {
  showNextTrack: true,
  showPreviousTrack: true,
  showSeekForward: false,
  showSeekBackward: false,
  isLiveStream: false,
};

/**
 * The now-playing card's artwork, resolved ONCE for the life of the process.
 *
 * ⚠️ `artworkUrl` IS A URL STRING, NOT AN IMAGE. Native fetches and caches it per URL — remote
 * `http(s)` or a local `file://` path — so a bundled PNG has to be turned into a real on-disk
 * path first, which is what `expo-asset` does. A base64 payload or a `data:` URI is not accepted
 * by either platform.
 *
 * ⚠️ AND IT IS MEMOIZED AT MODULE SCOPE ON PURPOSE. The per-ayah refresh runs up to ten times a
 * second; resolving the asset there would put a filesystem round-trip on the busiest path in the
 * app. The asset never changes, so one resolution outlives every remount.
 *
 * Best-effort: a card with no artwork is a cosmetic loss, and there is no reader-facing surface
 * that could report the failure — so a breadcrumb, and `undefined`, which the metadata builder
 * simply omits.
 *
 * ⚠️ AND IT IS BOUNDED BY A TIMEOUT, WHICH IS THE HALF THAT MATTERS. `startPlayback` has to hold
 * a real path before it can build the playlist, so this sits on the press path — and the failure
 * a `catch` cannot see is the one that never settles at all. A hung asset copy would mean the
 * play button does nothing, forever, with no error state and no watchdog to notice, because a
 * decorative image had stalled. `ARTWORK_TIMEOUT_MS` makes that impossible; the memo is kicked
 * off at boot, so in the normal case the await is already settled and costs nothing.
 *
 * ⚠️ THE MEMO IS CLEARED ON FAILURE **AND** ON TIMEOUT, so the next press retries. Memoizing a
 * bad outcome would mean no artwork until the process restarts — and if the `catch` is ever
 * weakened, a memoized REJECTION would make every later `playSurah` die on `Promise.all` with
 * `player:errors.playFailed`. Clearing is what keeps a cosmetic failure cosmetic.
 */
let artworkPromise: Promise<string | undefined> | null = null;
function lockScreenArtworkUri(): Promise<string | undefined> {
  artworkPromise ??= (async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const resolved = await Promise.race([
        (async () => {
          const asset = Asset.fromModule(require('@/assets/audio-artwork.png'));
          await asset.downloadAsync();
          // `localUri` is the `file://` path; `uri` is the dev-server/web URL, which is still a
          // URL native can fetch — so it is a real fallback rather than a shrug.
          return asset.localUri ?? asset.uri ?? undefined;
        })(),
        new Promise<undefined>((resolve) => {
          timer = setTimeout(() => resolve(undefined), ARTWORK_TIMEOUT_MS);
        }),
      ]);
      // Whatever produced `undefined` — a timeout, or an asset with neither uri — is worth one
      // more attempt on the next press. A resolved path never changes, so it is kept.
      if (resolved === undefined) artworkPromise = null;
      return resolved;
    } catch (error) {
      artworkPromise = null;
      addBreadcrumb('ui', 'lock-screen artwork unavailable', {
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    } finally {
      if (timer) clearTimeout(timer);
    }
  })();
  return artworkPromise;
}

/** The surah name the lock screen prints — the same string `buildSources` gives each track. */
function surahName(surah: number): string {
  return SURAH_METADATA[surah - 1]?.nameTransliteration ?? String(surah);
}

/**
 * The reciter's display name, or `undefined` for an id this build does not publish.
 *
 * ⚠️ DELIBERATELY NOT `reciterDisplayName`, WHICH RESOLVES AN UNKNOWN ID TO THE DEFAULT VOICE'S
 * NAME. That is right for a picker row — the reader is about to hear the default — and wrong on
 * a now-playing card, where it would name Al-Afasy over audio that is not his. The frozen
 * matrix's answer is to omit the artist, never to guess it.
 *
 * ⚠️ IT IS DEFENCE IN DEPTH AT A BOUNDARY SOMETHING ELSE CURRENTLY CLOSES, not a live case.
 * `preferences.reciterId` IS a free-form 1–64 character column another device or an older build
 * can write — but `RecitationEngineHost` runs it through `resolveReciterId` before the engine
 * ever sees it, so today an unpublished id cannot reach here in production and the suite only
 * gets to this branch by calling `setTrack` directly. The branch stays because the guard it
 * duplicates lives in a different file and could be dropped there without anything failing here.
 */
function loadedReciterName(id: string | null): string | undefined {
  return RECITERS.find((reciter) => reciter.id === id)?.nameEnglish;
}

/**
 * Background playback and lock-screen transport. Best-effort: the OSStatus failures here happen
 * during app-state transitions when the audio session is momentarily unavailable, and the app
 * still plays without it — so a breadcrumb, not a captured error.
 */
async function configureAudioMode(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
    });
  } catch (error) {
    addBreadcrumb('ui', 'configureAudioMode failed; background audio unavailable', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * The tracks for "play from surah n to the end of the book".
 *
 * ⚠️ THE URIS COME THROUGH `resolveSurahUris`, WHICH IS THE WHOLE OF STORY 7-5'S PLAYBACK SEAM
 * (and the only line of this file that story changed). A downloaded surah resolves to its
 * `file://` path and the network is never consulted for it; everything else resolves to the CDN
 * URL, byte for byte what it was before. The range form answers all of them from one directory
 * listing rather than up to 114 stats on the press path. The queue shape, the loop mode and the
 * lock-screen name are untouched.
 *
 * ⚠️ THE RESOLUTION HAPPENS ONCE PER `playSurah`, AND THAT IS THE SHAPE OF ONE ACCEPTED LIMIT.
 * Deleting the surah that is CURRENTLY LOADED does not move it back to the CDN mid-track — the
 * player is already holding a handle to the file, and the frozen matrix's "delete → playback
 * falls back to streaming" is therefore met on the next press rather than instantly. Fixing it
 * would mean rebuilding the playlist from a delete, which is exactly the queue shape this story
 * is forbidden to touch. Stated rather than hidden. (Story 7-5 review, P11.)
 *
 * ⚠️ EVERY TRACK CARRIES THE ARTWORK, AND THIS IS THE ONLY PLACE IT IS SENT (story 7-3, measured
 * twice on a Pixel 9 Pro). Android's notification cover comes from `loadArtworkFromUrl`, which
 * SKIPS the load when the url matches the one it already holds and has no `else` branch, so its
 * callback never fires. Our artwork is one constant url for every surah, and that broke the
 * metadata route twice over: the first playlist of a session got a cover and every rebuild after
 * it got `largeIcon=null` (`setActivePlaylist` clears the bitmap first), and — the worse half —
 * the notification is RE-POSTED only from that callback, so its title and artist froze on the
 * previous surah. The per-source `artworkUrl` reaches the lock screen by a different road
 * entirely: Android sets it as the MediaItem's `MediaMetadata.artworkUri` and the SYSTEM media
 * card is built from the session, while iOS prefers it over the JS-pushed metadata and pre-warms
 * the next track's — which is exactly what the native patch added it for. Fixing the skip itself
 * would be a change to `patches/expo-audio@56.0.11.patch`, which this story may not make.
 */
function buildSources(
  reciterId: string,
  startSurah: number,
  artworkUrl: string | undefined
): AudioSource[] {
  const uris = resolveSurahUris(reciterId, startSurah, SURAH_COUNT);
  const sources: AudioSource[] = [];
  for (let surah = startSurah; surah <= SURAH_COUNT; surah++) {
    sources.push({
      uri: uris[surah - startSurah],
      // The lock screen reads this per track; the ayah is refreshed separately, mid-track.
      name: surahName(surah),
      artworkUrl,
    });
  }
  return sources;
}

/**
 * The post-seek guard.
 *
 * `seekTo` resolves before the native status stream catches up, so the very next tick can still
 * carry the PRE-seek position — which would drag the highlight backwards for one frame, exactly
 * the snap the criterion forbids. Hold the target and drop earlier ticks until one lands at or
 * after it.
 *
 * ⚠️ IT RELEASES ON A TIMER TOO, AND THAT IS NOT BELT-AND-BRACES. If the native side refuses a
 * seek (a track still preparing, a file that never loaded), no qualifying tick ever arrives and
 * an un-released guard would freeze highlighting for the rest of the session — a worse failure
 * than the snap it exists to prevent.
 */
class SeekGuard {
  private targetMs: number | null = null;
  private armedAt = 0;

  arm(targetMs: number, now: number): void {
    this.targetMs = targetMs;
    this.armedAt = now;
  }

  clear(): void {
    this.targetMs = null;
  }

  /** True when this tick is stale and must be ignored. */
  blocks(ms: number, now: number): boolean {
    if (this.targetMs === null) return false;
    if (now - this.armedAt >= SEEK_GUARD_TIMEOUT_MS) {
      this.targetMs = null;
      return false;
    }
    // A small tolerance: the player lands NEAR the requested offset, not exactly on it.
    if (ms + PLAYLIST_TICK_MS >= this.targetMs) {
      this.targetMs = null;
      return false;
    }
    return true;
  }
}

/**
 * @param selectedReciterId The reader's chosen reciter, from their synced preferences. It arrives
 *   as a PARAMETER and is mirrored into a ref rather than into the effect's deps: re-running the
 *   effect on a preference change would rebuild the playlist and re-register the engine actions
 *   in the middle of a listen. Story 7-2's voice switch drives the change through `playSurah`
 *   from a SECOND effect (the last one in this file), never through a remount.
 */
export function useRecitationEngine(selectedReciterId: string): void {
  const playlist = useRef<AudioPlaylist | null>(null);
  const manifest = useRef<ReciterManifest | null>(null);
  /**
   * ⚠️ WHICH RECITER `manifest.current` ACTUALLY BELONGS TO — and it is not decoration.
   * `ensureManifest` used to validate its cache with `reciterId.current === reciter`, two values
   * that are equal by construction at every call site, so the guard could never say no. With two
   * quick switches the first reciter's load is still in flight when the second is chosen; it then
   * assigns `manifest.current` after its await, and the second call returns that manifest for the
   * new voice. Measured: voice B's audio playing against voice A's windows — a confidently wrong
   * highlight on the Quran, which is the one thing `isSurahTimed` exists to prevent. The manifest
   * has to carry its own identity; the ref that requested it cannot vouch for it.
   */
  const manifestReciter = useRef<string | null>(null);
  const reciterId = useRef<string | null>(selectedReciterId);
  /** The surah at playlist index 0 — `currentIndex + startSurah` is the surah being played. */
  const startSurah = useRef(1);
  const currentSurah = useRef<number | null>(null);
  /** The last ayah the tick derived — what a position write records. */
  const currentVerse = useRef<number | null>(null);
  const guard = useRef(new SeekGuard());
  /** When the playlist last reported progress — the load watchdog's clock. */
  const lastLoadedAt = useRef(0);
  /**
   * `savePosition`, published out of the boot effect so the voice switch below can call it.
   *
   * The function closes over the refs above and over the store, so it cannot be hoisted out of
   * that effect without dragging half of it along; a ref is the smallest honest seam. Inert until
   * the boot effect runs, which is the same window in which every engine action is inert.
   */
  const savePositionRef = useRef<() => void>(() => {});
  /**
   * `startPlayback`, published for the same reason and with one difference that matters: it does
   * NOT carry `playSurah`'s bounce-off-`loading` press guard. See its own docblock.
   */
  const startPlaybackRef = useRef<(surah: number, verse?: number) => Promise<void>>(async () => {});
  /** True while a voice switch is mid-flight — see the switch effect for what it prevents. */
  const switching = useRef(false);

  useEffect(() => {
    // SSR / web prerender: `createAudioPlaylist` reaches for `Audio`, which does not exist in
    // Node. Nothing here may run at module scope for the same reason.
    if (typeof window === 'undefined') return;

    const store = useAudioPlayerStore;

    /**
     * Write where the listener got to. NEVER per tick — see this function's callers.
     *
     * ⚠️ AN UNTIMED SURAH SAVES AYAH 1, NOT THE LOOKUP'S ANSWER. `verseAtMs` answers truthfully
     * over whatever windows a partial manifest holds — with 81 of Ya-Sin's 83 rows missing, that
     * is "ayah 2" for fifteen minutes. (That was `alafasy`'s published state until story 7-2
     * repaired the data; the shape survives its cause, because a truncated download produces it
     * too.) Storing it would make a RESUME land in the wrong place, so the same rule the
     * highlight follows applies here: no confident wrong answer. The surah is known, so "this
     * surah, from the top" is the honest claim.
     */
    const savePosition = () => {
      const surah = currentSurah.current;
      const reciter = reciterId.current;
      if (surah === null || reciter === null) return;
      const timed = store.getState().highlightAvailable;
      const verse = timed ? currentVerse.current : 1;
      if (verse === null) return;
      setAudioPosition({ surah, verse, reciterId: reciter });
    };
    savePositionRef.current = savePosition;

    /**
     * The last now-playing title pushed to the lock screen, so a refresh can re-send it rather
     * than falling back to the track's source name. Written by the tick, read by `applyRate`.
     *
     * ⚠️ IT IS RESET TO THE BARE SURAH NAME ON EVERY TRACK, which is what keeps an UNTIMED surah
     * off the previous one's ayah. `onStatus` returns early when the manifest has no window for
     * the position, so nothing would overwrite "Al-Fatihah · 7" when the queue moved on — the
     * card would sit there naming an ayah of a surah that finished minutes ago, and `applyRate`
     * would keep re-sending it. The frozen matrix's "never a stale ayah number" is this line.
     */
    let lockScreenTitle: string | null = null;

    /**
     * The now-playing payload — ONE builder, because both call sites need all three fields.
     *
     * ⚠️ A PARTIAL PUSH IS A DESTRUCTIVE PUSH. Native stores whatever arrives as the playlist's
     * whole metadata record and rebuilds the card from it, so `updateLockScreenMetadata({title})`
     * — which is what story 7-4's rate refresh sent — would strip the artist and the artwork off
     * a card that already had them. There is no merge on either platform.
     *
     * The reciter is read from the STORE, which holds the LOADED track's voice. A preference is
     * what the NEXT track will use: a reader who switches voices mid-surah has not yet heard the
     * new one, and naming it over the old one's audio is the same confident-wrong-answer the
     * highlight rules exist to prevent.
     *
     * ⚠️ THERE IS NO `artworkUrl` HERE, AND ITS ABSENCE IS LOAD-BEARING — MEASURED ON A PIXEL 9
     * PRO. The artwork reaches the lock screen through every `AudioSource` instead (see
     * `buildSources`), which is the path that actually renders: Android sets it as the MediaItem's
     * `MediaMetadata.artworkUri` and the SYSTEM media card — the thing on the lock screen — is
     * built from the session, not from this app's notification. Putting it here as well looked
     * free and was not: Android's `setPlaylistMetadata` re-posts the notification only from
     * `loadArtworkFromUrl`'s CALLBACK, and that loader skips a url equal to the one it already
     * holds and has **no `else` branch** — so with one constant artwork url the callback never
     * fired again and the notification's title and artist FROZE on whatever was posted last.
     * Measured: after a lock-screen skip the app, the store and the system card all read
     * "Ali-Imran" while the shade notification still said "Al-Baqarah · 1", twenty-four seconds
     * in. Dropping the field puts `setPlaylistMetadata` back on its `?: run { … }` branch, which
     * posts unconditionally. The only thing lost is the notification's large icon; the card keeps
     * its full-res cover, and iOS prefers the per-source url anyway.
     */
    const lockScreenMetadata = (): AudioMetadata => ({
      title: lockScreenTitle ?? undefined,
      artist: loadedReciterName(store.getState().reciterId),
    });

    /** The card the native side is currently showing — what a push is compared against. */
    let shownCard: AudioMetadata | null = null;

    /**
     * Push the card, remembering the title so a bare refresh can re-send it.
     *
     * ⚠️ ONLY WHEN THE CARD ACTUALLY MOVES — `activeVerseKey`'s discipline, one layer out. On an
     * UNTIMED surah every ayah change resolves to the same bare surah name, so an unguarded push
     * would cross the bridge a few hundred times per surah to redraw an identical card.
     *
     * ⚠️ THE COMPARISON IS THE WHOLE PAYLOAD, NOT THE TITLE. Deduping on the title alone while
     * sending three fields silently drops every artist or artwork change that does not move the
     * title — and on an untimed surah the title is constant for the entire file, so a voice
     * switch that does not rebuild the playlist would never reach the card at all.
     */
    const pushLockScreen = (title: string) => {
      lockScreenTitle = title;
      const next = lockScreenMetadata();
      if (
        shownCard &&
        shownCard.title === next.title &&
        shownCard.artist === next.artist &&
        shownCard.artworkUrl === next.artworkUrl
      ) {
        return;
      }
      shownCard = next;
      playlist.current?.updateLockScreenMetadata(next);
    };

    /**
     * The card for an ayah of a surah — the ONE place the "· ayah" suffix is decided.
     *
     * ⚠️ THE AYAH IS NAMED ONLY WHEN THE SURAH IS FULLY TIMED — the same gate `setActiveVerse`
     * applies to the on-screen highlight, for the same reason. `verseAtMs` answers truthfully
     * over whatever windows a PARTIAL manifest holds, which for a surah missing most of its rows
     * is one early ayah for the rest of the file; putting that on the lock screen would park a
     * confidently wrong ayah of the Quran on the reader's phone for fifteen minutes. The surah is
     * known, so the surah alone is the honest card.
     */
    const announceVerse = (surah: number, verse: number) => {
      pushLockScreen(
        store.getState().highlightAvailable ? `${surahName(surah)} · ${verse}` : surahName(surah)
      );
    };

    /**
     * Tell the native player the rate (story 7-4).
     *
     * ⚠️ IT IS A PROPERTY, NOT `setPlaybackRate(rate, pitchCorrection)`. That two-argument call is
     * `AudioPlayer`'s; `AudioPlaylist` — which is what this engine drives — exposes only a
     * `playbackRate` property and no `shouldCorrectPitch` at all. PITCH CORRECTION IS ON ANYWAY,
     * on all three platforms, because each one's default is to preserve it: Android goes through
     * ExoPlayer's `setPlaybackSpeed` (`PlaybackParameters(speed, pitch = 1f)`), iOS through
     * `AVPlayerItem`'s spectral time-pitch algorithm, and web through `HTMLMediaElement`'s
     * `preservesPitch`, which defaults to true. There is no knob to turn on, and no knob that
     * could be left off.
     *
     * ⚠️ AND IT APPLIES WHETHER OR NOT PLAYBACK IS RUNNING — the defect the epic names. iOS's
     * playlist stores the value as `currentRate` and starts the next `play()` at it even when the
     * assignment lands while paused; Android and web apply it to a paused element directly. So
     * the rate does not need playback to exist, and this is never gated on `playing`.
     *
     * Best-effort by design: the only failure the API can produce is a throw from a player that
     * has just been torn down, and every new playlist is given the rate at build time, so a
     * transient failure heals on the next track rather than needing to be reported.
     */
    const applyRate = (rate: number, refreshCard = true) => {
      const player = playlist.current;
      if (!player) return;
      try {
        player.playbackRate = rate;
        // ⚠️ `refreshCard: false` IS FOR `startPlayback` ALONE, where the very next statement is
        // `setActiveForLockScreen` — which builds the now-playing info from scratch and is
        // therefore the rebuild this refresh exists to force. Left on, every `playSurah` pushed
        // the identical card twice, and on Android each push re-enters the artwork loader and
        // re-posts the foreground notification. (Story 7-3 review, P9.)
        if (!refreshCard) return;
        /**
         * ⚠️ AND TELL THE LOCK SCREEN, WHICH OTHERWISE KEEPS SCRUBBING AT THE OLD RATE. The
         * native patch publishes `MPNowPlayingInfoPropertyPlaybackRate` only when the now-playing
         * info is REBUILT — an item change, or an explicit refresh — and setting the property is
         * neither. On a fully timed surah the per-ayah `updateLockScreenMetadata` below hides
         * this, which is why it looked fine; on an UNTIMED surah nothing pushes metadata at all
         * and the lock-screen elapsed time ran at the old speed until the next track. The story's
         * Code Map claim that the lock screen follows the rate for free is corrected in its Spec
         * Change Log. (Story 7-4 review, P8.)
         *
         * The last title is re-sent rather than omitted: a bare refresh rebuilds from the track's
         * source name and would drop the "· ayah" suffix until the next verse change. Story 7-3
         * made that a FULL payload — see `lockScreenMetadata`, which is also why this no longer
         * passes `undefined` (Android's `updateLockScreenMetadata` takes a non-optional record).
         */
        player.updateLockScreenMetadata(lockScreenMetadata());
      } catch (error) {
        addBreadcrumb('ui', 'playback rate not applied', {
          rate,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };

    /**
     * The rate's durable half, held back until the drag stops (`SPEED_PERSIST_DEBOUNCE_MS`).
     *
     * ⚠️ THE AUDIBLE HALF IS NOT DEBOUNCED, and the split is the whole point: the slider has no
     * release event, so a drag is ~30 values, and each must be heard immediately while only the
     * last needs to reach the disk. Flushed on teardown so a drag interrupted by a sign-out or a
     * reload is not lost.
     */
    let persistTimer: ReturnType<typeof setTimeout> | null = null;
    let pendingSpeed: number | null = null;
    const persistRateSoon = (rate: number) => {
      pendingSpeed = rate;
      if (persistTimer) clearTimeout(persistTimer);
      persistTimer = setTimeout(() => {
        persistTimer = null;
        if (pendingSpeed !== null) writeStoredSpeed(pendingSpeed);
        pendingSpeed = null;
      }, SPEED_PERSIST_DEBOUNCE_MS);
    };
    const flushRate = () => {
      if (persistTimer) clearTimeout(persistTimer);
      persistTimer = null;
      if (pendingSpeed !== null) writeStoredSpeed(pendingSpeed);
      pendingSpeed = null;
    };

    /**
     * The 1s clock, live only while a timed sleep is armed.
     *
     * ⚠️ IT IS THE SECOND CLOCK, NOT THE ONLY ONE. The 100ms status stream answers the deadline
     * too (see `onStatus`), and that is the one that fires on time while the app is backgrounded
     * — a JS interval there is throttled or suspended outright. This one exists for the states
     * the status stream does not cover: a timer armed while PAUSED still has to expire, and a
     * countdown label still has to move.
     */
    let sleepClock: ReturnType<typeof setInterval> | null = null;
    const stopSleepClock = () => {
      if (sleepClock) clearInterval(sleepClock);
      sleepClock = null;
    };
    /**
     * Start or stop the clock to match whether a deadline exists.
     *
     * ⚠️ CALLED ON MOUNT AS WELL AS ON CHANGE (story 7-4 review, P4). Starting it only where a
     * timer is ARMED assumed the engine outlives every timer, which a Fast Refresh, a remount or
     * a re-registered effect all disprove: an engine that came up with a deadline already in the
     * store got no clock at all, so a timer armed over a PAUSED recitation — the one case the
     * status stream cannot cover — would never expire, and its countdown would sit frozen in the
     * chrome forever.
     */
    const syncSleepClock = () => {
      const armed = store.getState().sleepDeadline !== null;
      if (!armed) {
        stopSleepClock();
        return;
      }
      if (sleepClock) return;
      sleepClock = setInterval(evaluateSleep, SLEEP_TICK_MS);
    };

    /**
     * Answer the armed sleep timer against the WALL CLOCK. Called from both clocks and on
     * foregrounding; safe to call at any time, including with nothing armed.
     */
    const evaluateSleep = () => {
      const state = store.getState();
      const deadline = state.sleepDeadline;
      if (deadline === null) return;
      const left = deadline - Date.now();
      if (left > 0) {
        // ⚠️ ONLY WHEN THE DISPLAYED SECOND MOVES. This runs ten times a second under playback,
        // and the label it feeds is rendered inside the chrome row; publishing per tick would
        // re-render that row ten times a second to show the same "12m". `usePosition`'s rule.
        const shown = Math.ceil(left / 1000) * 1000;
        if (shown !== state.sleepRemainingMs) state.setSleepRemaining(shown);
        return;
      }
      pauseForSleep(state.playbackState);
    };

    /**
     * The one place a sleep timer stops the recitation — BOTH kinds go through it.
     *
     * ⚠️ THE STATE IS READ BEFORE THE TIMER IS CLEARED, AND THAT ORDERING IS THE FIX (story 7-4
     * review, P1). Both callers used to clear first and then bail on `playbackState !== 'playing'`
     * — justified for `paused`, where pausing again would overwrite the reader's real stopping
     * point with wherever the last tick landed. But `buffering`, `loading` and `error` take the
     * same branch, and `onStatus` MANUFACTURES `buffering` from any mid-playback stall: a
     * thirty-minute timer expiring during a rebuffer was discarded in silence and the recitation
     * played on all night, with no indicator left to say a timer had ever been armed.
     *
     * So the question is not "is it playing" but "is the reader still being played to":
     * `buffering` and `loading` both mean sound is coming and must be stopped. `paused`, `idle`
     * and `error` mean it is not, and there the timer simply clears — which is the frozen
     * matrix's "fires while paused → no-op; the timer clears".
     */
    const pauseForSleep = (playbackState: PlaybackState) => {
      const sounding =
        playbackState === 'playing' || playbackState === 'buffering' || playbackState === 'loading';
      store.getState().clearSleepTimer();
      if (!sounding) return;
      // ⚠️ CAUGHT. A rejection from a playlist torn down mid-pause has no error surface to reach
      // from here, and an unhandled rejection is a crash on some runtimes (7-4 review, P13).
      void store
        .getState()
        .pause()
        .catch((error: unknown) => {
          addBreadcrumb('ui', 'sleep-timer pause failed', {
            error: error instanceof Error ? error.message : String(error),
          });
        });
    };

    /**
     * Pause at the end of the current surah, which is what "end of surah" means (story 7-4).
     *
     * The playlist advances by itself, so this has to happen BEFORE the boundary rather than in
     * reaction to it — `SLEEP_END_LEAD_MS` is that margin, and `onTrackChanged` carries the
     * defensive copy for the ONE case the lead cannot cover: a surah whose duration the status
     * stream never reported (`durationSeen`).
     */
    const fireEndOfSurah = () => {
      // ⚠️ THE SAME DOOR AS THE TIMED KIND, for the reason in `pauseForSleep`'s docblock — and
      // this path needed it MORE: `onStatus` runs the end-of-surah check before the block that
      // promotes the store to `playing`, so the near-end condition is routinely met while the
      // state still reads `loading`, and the old `!== 'playing'` bail dropped the timer there.
      pauseForSleep(store.getState().playbackState);
    };

    /**
     * Whether the CURRENT track ever reported a real duration.
     *
     * ⚠️ IT IS WHAT MAKES `onTrackChanged`'S END-OF-SURAH PAUSE A FALLBACK RATHER THAN A SECOND
     * OWNER (story 7-3 review, P1). `onStatus` stops before the boundary whenever it knows the
     * duration; the copy at the track change exists only for the surah whose duration never
     * arrived. Firing it on EVERY track change makes a deliberate skip — lock-screen next, which
     * this story just enabled — pause instantly while a sleep timer is armed.
     */
    let durationSeen = false;

    /**
     * Point the store, and optionally the lock screen, at the track the playlist just moved to.
     *
     * ⚠️ `announce: false` IS THE END-OF-SURAH FALLBACK'S CALL (story 7-3 review, P5). There the
     * player has crossed into *n+1* and been paused again, and the listening position was written
     * for *n* — so advertising *n+1* on the card would name a surah the reader explicitly asked
     * not to enter, and one they will not resume into. The store still adopts the new index,
     * because the store has to agree with the native player about which track is loaded; only the
     * card stays on the surah that actually played.
     */
    const adoptTrack = (index: number, announce = true) => {
      const surah = startSurah.current + index;
      const reciter = reciterId.current;
      if (!reciter || surah < 1 || surah > SURAH_COUNT) return;
      currentSurah.current = surah;
      currentVerse.current = null;
      durationSeen = false;
      guard.current.clear();
      store
        .getState()
        .setTrack(surah, reciter, manifest.current ? isSurahTimed(manifest.current, surah) : false);
      // ⚠️ AFTER `setTrack`, because the artist is read from the store's LOADED reciter — and the
      // bare surah name, because this track has not reported a position yet. The first status
      // tick adds the "· ayah"; an untimed surah simply keeps the name (see `lockScreenTitle`).
      if (announce) pushLockScreen(surahName(surah));
    };

    const onStatus = (status: AudioPlaylistStatus) => {
      const player = playlist.current;
      if (!player) return;

      /**
       * ⚠️ THE SLEEP TIMER IS ANSWERED FROM THIS TICK FIRST, WHICH IS WHAT MAKES THE
       * BACKGROUNDED CRITERION TRUE. Under background playback this stream keeps arriving every
       * 100ms while the app's own interval is throttled or suspended, so this — not the 1s clock
       * — is what pauses a 30-minute timer on time with the phone in a pocket. Both compare
       * against the same absolute deadline, so it does not matter which one gets there first.
       */
      evaluateSleep();

      // ⚠️ BEFORE ANY BRANCH THAT RETURNS. `onTrackChanged`'s end-of-surah pause is a fallback for
      // a track whose duration the status stream never reported; this is how it tells.
      if (status.duration > 0) durationSeen = true;

      /**
       * ⚠️ BEFORE THE BOUNDARY, NOT AT IT. `loop: 'none'` still auto-advances mid-queue, so a
       * timer that waited for `trackChanged` would already be a second into the next surah. The
       * `didJustFinish` half covers the last track in the queue (An-Nas), which produces no
       * track change at all.
       */
      if (
        store.getState().sleepEndOfSurah &&
        (status.didJustFinish ||
          (status.playing &&
            status.duration > 0 &&
            status.currentTime * 1000 >=
              status.duration * 1000 - sleepEndLeadMs(store.getState().speed)))
      ) {
        fireEndOfSurah();
        return;
      }

      const state = store.getState();

      /**
       * ⚠️ THE END OF THE BOOK, WHICH NO `trackChanged` EVER ANNOUNCES. `loop` is `'none'` and
       * An-Nas is the last entry, so the final track finishing produces a `didJustFinish` and
       * then silence — no track change, no further ticks worth reading. Without this branch the
       * criterion "playback stops and the position is saved — it does not loop to Surah 1" was
       * only half true: it did stop, and it saved nothing.
       */
      if (status.didJustFinish) {
        if (status.currentIndex >= status.trackCount - 1) {
          savePosition();
          state.setPlaybackState('paused');
        }
        /**
         * ⚠️ MID-QUEUE, THE STATE IS LEFT ALONE. A finished track reports `playing: false` for the
         * tick or two before the native player auto-advances and `trackChanged` fires — letting
         * that fall through to the pause branch below flashed a pause glyph on the transport at
         * every single surah boundary.
         */
        return;
      }

      if (status.playing) {
        lastLoadedAt.current = Date.now();
        if (state.playbackState !== 'playing') state.setPlaybackState('playing');
      } else if (state.playbackState === 'playing') {
        state.setPlaybackState(status.isBuffering ? 'buffering' : 'paused');
      } else if (state.playbackState === 'loading' || state.playbackState === 'buffering') {
        /**
         * ⚠️ A TRACK THAT NEVER LOADS HAS NO EVENT OF ITS OWN. `AudioPlaylistStatus` carries no
         * error field, so a 404 or an unplayable file is indistinguishable from a slow network
         * except by how long it lasts. Without this watchdog the store sat at `loading` forever:
         * no error, no retry, and a play button that had visibly done nothing.
         */
        if (status.isLoaded) lastLoadedAt.current = Date.now();
        else if (Date.now() - lastLoadedAt.current > LOAD_TIMEOUT_MS) {
          state.setError('player:errors.playFailed');
          return;
        }
      }

      const surah = currentSurah.current;
      const timings = manifest.current;
      if (surah === null || !timings) return;

      // ⚠️ SECONDS → MILLISECONDS. The only other place this conversion happens is `seekToVerse`.
      const ms = status.currentTime * 1000;
      if (guard.current.blocks(ms, Date.now())) return;

      const verse = verseAtMs(timings, surah, ms);
      if (verse === null || verse === currentVerse.current) return;
      currentVerse.current = verse;
      // THE comparison above is why a 100ms tick is affordable. Below it, once per ayah:
      store.getState().setActiveVerse(verse);
      // ⚠️ MID-TRACK, WHICH IS THE ADAPTATION THE FORKED ENGINE DID NOT HAVE. A conventional
      // player refreshes the lock screen on track change; here the ayah changes many times
      // inside one surah, so the refresh is driven by the timing lookup instead.
      announceVerse(surah, verse);
    };

    const onTrackChanged = ({ currentIndex }: { previousIndex: number; currentIndex: number }) => {
      /**
       * ⚠️ THE DEFENSIVE HALF OF "END OF SURAH", for the boundary the lead never saw. The status
       * stream reports `duration: 0` until a track is prepared, so a surah whose duration never
       * arrived would sail past the check in `onStatus` — and the frozen matrix's answer for
       * "surah end unknown" is a FALLBACK, not a shrug. Pausing here is one boundary late by a
       * fraction of a second, which is where the reader asked to stop; a duration fallback would
       * pause somewhere that is not a boundary at all.
       *
       * ⚠️ AND IT IS GATED ON `!durationSeen`, WHICH IS WHAT MAKES IT A FALLBACK RATHER THAN A
       * SECOND OWNER OF THE SAME DECISION (story 7-3 review, P1). When the duration WAS known,
       * `onStatus` already stopped playback with its lead and no track change follows — so a
       * track change that arrives anyway is a DELIBERATE MOVE, and firing here paused it
       * instantly. Story 7-3 enabled the lock screen's next button, so that is now one tap away:
       * with a sleep timer armed, skipping a surah would have stopped the recitation on the spot.
       *
       * ⚠️ AND IT RUNS BEFORE `adoptTrack`, WHICH IS NOT A TIDINESS PREFERENCE (story 7-4 review,
       * P2). `pause()` writes the listening position, and `adoptTrack` moves `currentSurah` to
       * *n+1* and nulls `currentVerse` — so pausing afterwards saved *(n+1, 1)*: the start of the
       * very surah the reader asked not to enter, and exactly where 7-7's resume would drop them
       * next launch. Pausing first means the write is the finished surah's last ayah, and it is
       * the ONLY write on this path (`pause()` performs it), so the track change does not save
       * twice. `adoptTrack` still runs after, so the store and the native player agree about
       * which track is loaded.
       */
      if (store.getState().sleepEndOfSurah && !durationSeen) {
        fireEndOfSurah();
        adoptTrack(currentIndex, false);
        return;
      }
      // Save where the FINISHED track got to before adopting the new one — this is one of the
      // four moments a listening position is written.
      savePosition();
      adoptTrack(currentIndex);
    };

    const teardown = () => {
      const player = playlist.current;
      playlist.current = null;
      if (!player) return;
      try {
        player.pause();
        player.clearLockScreenControls();
        player.destroy();
      } catch (error) {
        // The user is leaving or the track is already gone; never let this throw upward.
        addBreadcrumb('ui', 'recitation teardown failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };

    const ensureManifest = async (reciter: string): Promise<ReciterManifest> => {
      if (manifest.current && manifestReciter.current === reciter) return manifest.current;
      const loaded = await loadReciterManifest(reciter);
      // ⚠️ ONLY IF THIS IS STILL THE VOICE WE WANT. A load that resolves after the reader has
      // chosen again belongs to nobody: publishing it would hand the new reciter the old one's
      // windows. The caller still gets `loaded` — it is the right answer to the question IT
      // asked — but the shared ref keeps whatever the current choice put there.
      if (reciterId.current === reciter) {
        manifest.current = loaded;
        manifestReciter.current = reciter;
      }
      return loaded;
    };

    /**
     * Build the playlist for surahs `surah`…114 and start it, optionally at an ayah.
     *
     * ⚠️ THE PRESS GUARD IS DELIBERATELY NOT HERE — it lives on `actions.playSurah`, one level
     * up (story 7-2). The two callers want opposite things from a rebuild already in flight: a
     * reader jabbing play must NOT restart the surah, while a reader who has just chosen a
     * different reciter must get that reciter even if the previous choice is still loading. With
     * the guard inside this function the voice switch could only ever re-enter it after a status
     * tick had moved the state off `loading`, which is never true immediately after a rebuild —
     * so the second of two quick choices silently did nothing and the app played a voice its own
     * settings screen showed as unselected. The switch serializes itself instead (`switching`).
     */
    const startPlayback = async (surah: number, verse?: number) => {
      const reciter = reciterId.current;
      if (!reciter) return;
      // A surah outside the book would build an EMPTY source list and hand the store a track
      // that does not exist. This is reached from a row press and a page lookup, both of which
      // can be wrong before their own guards run.
      if (!Number.isInteger(surah) || surah < 1 || surah > SURAH_COUNT) return;
      /**
       * ⚠️ AN ARMED "END OF SURAH" BELONGS TO THE SURAH IT WAS ARMED ON (story 7-4 review, P5).
       * A reader who presses a verse in another surah while it is armed was silently re-targeting
       * the timer at a surah they had just STARTED — "stop at the end of this one" turned into
       * "stop at the end of the one you just opened", which is not a thing anybody asked for.
       * Only a genuine surah change disarms it: the reciter switch re-enters here with the SAME
       * surah, and a voice change is not a reason to forget a sleep timer. A TIMED timer is left
       * alone on purpose — it is a promise about the wall clock, not about the track.
       */
      if (
        store.getState().sleepEndOfSurah &&
        currentSurah.current !== null &&
        surah !== currentSurah.current
      ) {
        store.getState().clearSleepTimer();
      }
      store.getState().setPlaybackState('loading');
      lastLoadedAt.current = Date.now();
      /**
       * ⚠️ TORN DOWN BEFORE THE AWAIT, NOT AFTER IT. The frozen matrix says a failed switch leaves
       * "previous voice already stopped", and with `teardown()` below the fetch neither half was
       * true: a manifest that 404s or times out reached the `catch` with the OLD playlist still
       * audible, and even on the happy path the previous voice kept sounding for the whole fetch
       * while the picker already showed the new one selected.
       */
      teardown();
      try {
        /**
         * ⚠️ THE ARTWORK IS RESOLVED HERE, IN THE ONE PLACE THAT ALREADY AWAITS, because every
         * TRACK carries it and `buildSources` below needs it synchronously. It is memoized for
         * the process and kicked off at boot, so by the first press it is already settled;
         * resolving it lazily in the background instead would leave the FIRST card artwork-less,
         * and on an untimed surah — which never pushes another update — permanently so.
         * `lockScreenArtworkUri` cannot reject and cannot hang for longer than
         * `ARTWORK_TIMEOUT_MS`, which is what keeps it off the critical path in the bad cases.
         */
        const [timings, artwork] = await Promise.all([
          ensureManifest(reciter),
          lockScreenArtworkUri(),
        ]);
        startSurah.current = surah;
        const player = createAudioPlaylist({
          sources: buildSources(reciter, surah, artwork),
          updateInterval: PLAYLIST_TICK_MS,
          loop: 'none',
        });
        playlist.current = player;
        player.addListener('playlistStatusUpdate', onStatus);
        player.addListener('trackChanged', onTrackChanged);

        /**
         * ⚠️ THE STORE IS TOLD WHICH TRACK IS LOADED **BEFORE** THE LOCK SCREEN IS TAKEN, and the
         * order is the whole of AC2's reciter. `lockScreenMetadata` reads the loaded voice out of
         * the store; with `setTrack` still below the card would be built from the PREVIOUS
         * track's reciter and stay wrong until the next ayah tick — and on an untimed surah,
         * forever. Nothing can interleave: there is no await between the listeners and here.
         */
        currentSurah.current = surah;
        currentVerse.current = null;
        durationSeen = false;
        store.getState().setTrack(surah, reciter, isSurahTimed(timings, surah));

        lockScreenTitle = surahName(surah);
        // ⚠️ AND `shownCard` IS SEEDED WITH IT, so the first `pushLockScreen` of the track — which
        // carries the same bare surah name until an ayah lands — is recognised as a repeat rather
        // than sent again.
        shownCard = lockScreenMetadata();
        player.setActiveForLockScreen(true, shownCard, LOCK_SCREEN_OPTIONS);
        /**
         * ⚠️ EVERY NEW PLAYLIST IS BORN AT THE READER'S RATE. A rate applied only on CHANGE
         * would be lost by the rebuild that starts every surah and every voice switch, so a
         * reader who chose 1.5x would hear 1.0x again the moment they pressed play on anything.
         * Before `play()`, so the first frame of audio is already at the right speed.
         */
        applyRate(store.getState().speed, false);

        if (verse !== undefined && verse > 1) {
          const offset = offsetOfVerse(timings, surah, verse);
          if (offset !== null) {
            guard.current.arm(offset, Date.now());
            await player.seekTo(offset / 1000);
          }
        }
        player.play();
      } catch (error) {
        captureException(error, { context: 'recitation.playSurah', surah });
        store.getState().setError('player:errors.playFailed');
      }
    };
    startPlaybackRef.current = startPlayback;

    const actions = {
      playSurah: async (surah: number, verse?: number) => {
        // ⚠️ A SECOND PRESS WHILE THE FIRST IS STILL LOADING WOULD TEAR THE PLAYLIST DOWN AND
        // REBUILD IT — the surah audibly restarts, and the reader's own impatience is what
        // caused it. `loading` is a state a PRESS must bounce off, not one it can re-enter; the
        // voice switch reaches `startPlayback` directly and is serialized by its own flag.
        if (store.getState().playbackState === 'loading') return;
        await startPlayback(surah, verse);
      },

      pause: async () => {
        playlist.current?.pause();
        store.getState().setPlaybackState('paused');
        savePosition();
      },

      resume: async () => {
        // No track means nothing to resume — reporting `playing` would draw a pause button over
        // silence, which is the one state a transport must never show.
        if (!playlist.current) return;
        playlist.current.play();
        store.getState().setPlaybackState('playing');
      },

      seekToVerse: async (verse: number) => {
        const player = playlist.current;
        const timings = manifest.current;
        const surah = currentSurah.current;
        if (!player || !timings || surah === null) return;
        const offset = offsetOfVerse(timings, surah, verse);
        // An ayah with no window in this reciter's manifest: no seek, playback continues. A seek
        // to 0 "because we could not find it" would restart the surah under the reader.
        if (offset === null) return;
        guard.current.arm(offset, Date.now());
        // The highlight moves NOW rather than on the next qualifying tick — a tap that takes
        // 300ms to show anything reads as a tap that did not register.
        currentVerse.current = verse;
        store.getState().setActiveVerse(verse);
        // ⚠️ AND THE CARD MOVES WITH IT (story 7-3 review, P7). `onStatus` returns early on
        // `verse === currentVerse.current`, which the line above has just satisfied — so without
        // this the lock screen kept naming the PRE-seek ayah until the next boundary, tens of
        // seconds on a long verse, against the frozen matrix's "refreshes on every ayah change".
        announceVerse(surah, verse);
        try {
          await player.seekTo(offset / 1000);
          // ⚠️ AND PLAY, WHICH THE FIRST CUT DID NOT. The criterion is "playback RESUMES at that
          // verse's offset"; a reader who pauses, then taps a different ayah, was getting a moved
          // highlight and silence — a tap that looks like it half-worked.
          if (store.getState().playbackState !== 'playing') {
            player.play();
            store.getState().setPlaybackState('playing');
          }
        } catch (error) {
          guard.current.clear();
          captureException(error, { context: 'recitation.seekToVerse', surah, verse });
        }
      },

      stop: async () => {
        savePosition();
        teardown();
        currentSurah.current = null;
        currentVerse.current = null;
        store.getState().clearPlayback();
      },

      abandonPlayback: async () => {
        teardown();
        currentSurah.current = null;
        currentVerse.current = null;
        /**
         * ⚠️ THE RECITER AND ITS MANIFEST SURVIVE, AND THE FIRST CUT KILLED BOTH. Nulling
         * `reciterId` here made recitation permanently dead after a sign-out: the only writer is
         * the preference effect below, which early-returns unless the preference VALUE moves — and
         * with one shipped default it never does — so every later `playSurah` hit `if (!reciter)`
         * and returned silently until the app was relaunched. Neither is account-scoped anyway: a
         * manifest is public immutable data, and the reciter is re-supplied by the host on the
         * next render.
         */
        store.getState().clearPlayback();
      },
    };

    store.getState().registerEngineActions(actions);
    void configureAudioMode();
    // ⚠️ WARM THE ARTWORK NOW, SO THE FIRST PRESS NEVER WAITS FOR IT. It is memoized for the
    // process, so this is the only call that can cost anything; `startPlayback` awaits the same
    // promise and by then it is settled. A failure here is already answered inside the resolver.
    void lockScreenArtworkUri();

    /**
     * ⚠️ THE SAVED RATE IS SEEDED BEFORE THE SUBSCRIPTION, NOT THROUGH IT. MMKV is synchronous,
     * so this puts the reader's rate in the store during the boot effect — before any press can
     * reach `playSurah` — and seeding first means the write-back below never fires for a value
     * that came off the device in the first place.
     */
    store.getState().setSpeed(readStoredSpeed());

    /**
     * The engine's one store subscription (story 7-4).
     *
     * ⚠️ IMPERATIVE, NOT A SELECTOR HOOK. `useAudioPlayerStore(s => s.speed)` in this hook would
     * re-render `RecitationEngineHost` — which mounts at the app root — on every rate change and
     * on every arm of a sleep timer. This file's standing rule is that it holds refs and renders
     * nothing; a subscription keeps that true.
     *
     * ⚠️ AND PERSISTENCE LIVES HERE, WHICH IS WHY THERE IS ONLY ONE WRITER. A control that wrote
     * MMKV itself and then set the store could succeed at one and not the other; going through
     * the store means "what is stored", "what the store says" and "what the player was told" are
     * the same event.
     */
    const unsubscribe = store.subscribe((next, previous) => {
      if (next.speed !== previous.speed) {
        applyRate(next.speed);
        persistRateSoon(next.speed);
      }
      if (next.sleepDeadline !== previous.sleepDeadline) syncSleepClock();
    });

    /**
     * ⚠️ AND ANSWER THE STORE AS IT STANDS RIGHT NOW, not only as it changes. Everything above
     * reacts to a transition; a deadline that was already set when this effect ran has no
     * transition to react to. See `syncSleepClock`.
     */
    evaluateSleep();
    syncSleepClock();

    // Backgrounding is the fourth moment a position is written: a listener who swipes the app
    // away never presses pause, and the process can be killed without another event.
    const onAppState = (next: AppStateStatus) => {
      if (next !== 'active') {
        savePosition();
        return;
      }
      // ⚠️ AND COMING BACK IS WHEN A SUSPENDED CLOCK HAS TO SETTLE UP. With playback stopped the
      // OS can freeze this app's timers entirely; the deadline is absolute, so the first thing
      // to do on return is ask whether it has passed — not to resume counting from where the
      // interval left off, which would be twenty minutes ago.
      evaluateSleep();
    };
    const subscription = AppState.addEventListener('change', onAppState);

    return () => {
      subscription.remove();
      unsubscribe();
      stopSleepClock();
      // A rate the reader chose mid-drag is still a rate they chose — see `persistRateSoon`.
      flushRate();
      teardown();
    };
  }, []);

  /**
   * THE VOICE SWITCH (story 7-2) — the reciter moved, so the same ayah is re-played in the new
   * voice and the play/pause state is preserved.
   *
   * ⚠️ IT REPLACED A `stop()`, WHICH WAS 7-1's HONEST PLACEHOLDER AND IS NOT THE FEATURE. The
   * preference arrives from `usePreferences()`, so a background sync pull can move it mid-listen
   * as easily as the picker can; dropping the manifest alone left the OLD reciter's audio playing
   * with highlighting silently dead (the tick returns early on `!timings`). Stopping was the
   * truthful answer while nothing could switch. Now the picker exists, and stopping the
   * recitation because the reader chose a different reciter would be absurd.
   *
   * ⚠️ THE REF IS UPDATED BEFORE ANY AWAIT, AND `playSurah` READS IT. Everything imperative in
   * this file resolves the reciter through `reciterId.current` — `buildSources`, `ensureManifest`,
   * `setTrack`, `savePosition`. Assigning it first is therefore the whole switch for a session
   * with nothing loaded, and it is also what makes the re-play below build the NEW voice's URLs.
   * `manifest.current` is nulled with it: a manifest belongs to one reciter.
   *
   * ⚠️ THE VERSE COMES FROM THE SAME RULE `savePosition` FOLLOWS — the tick's answer only when the
   * surah is fully timed, ayah 1 otherwise. `currentVerse.current` is written on every tick even
   * when `highlightAvailable` is false, so for a partly-timed surah it holds a confidently wrong
   * ayah (the "parked on 36:2 for fifteen minutes" shape), and seeking the NEW reciter there would
   * move the reader somewhere they never were.
   *
   * ⚠️ AND A SECOND SWITCH ARRIVING MID-FLIGHT IS SERIALIZED RATHER THAN DROPPED. `playSurah`
   * deliberately bounces off `playbackState === 'loading'` (a second press must not audibly
   * restart the surah) — so a reader tapping two reciters inside one manifest fetch would have
   * had the second tap silently do nothing, leaving the app playing a voice its own settings
   * screen showed as unselected. The loop re-reads `reciterId.current` after each attempt and
   * runs again if it moved, so the LAST choice is the one that ends up playing.
   */
  useEffect(() => {
    if (reciterId.current === selectedReciterId) return;
    const state = useAudioPlayerStore.getState();
    const surah = state.surah;
    const wasPlaying = state.playbackState === 'playing';
    const verse = (state.highlightAvailable ? currentVerse.current : 1) ?? 1;
    // Before the ref moves: this write belongs to the voice the reader was listening to.
    savePositionRef.current();
    reciterId.current = selectedReciterId;
    manifest.current = null;
    manifestReciter.current = null;
    // Nothing loaded — the ref is the whole change, and the next `playSurah` uses it.
    if (surah === null) return;
    if (switching.current) return;

    void (async () => {
      switching.current = true;
      try {
        let target = reciterId.current;
        for (;;) {
          await startPlaybackRef.current(surah, verse);
          // Loaded, not started: the reader was paused, and a preference change must not become
          // an unrequested sound. `playSurah` always plays, so the pause is applied after it —
          // but NEVER over a failure, because `pause()` sets `playbackState` and would overwrite
          // the error the retry surface is waiting to render.
          if (!wasPlaying && useAudioPlayerStore.getState().playbackState !== 'error') {
            await useAudioPlayerStore.getState().pause();
          }
          if (reciterId.current === target) break;
          target = reciterId.current;
        }
      } finally {
        switching.current = false;
      }
    })();
  }, [selectedReciterId]);
}
