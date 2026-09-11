/**
 * `useRecitationEngine` — the imperative half of recitation playback (story 7-1).
 *
 * The manifest LOOKUP is unit-tested in `lib/reciterManifest.test.ts`; what is covered here is
 * everything the engine does around it — the surah-track queue, the status tick, the post-seek
 * guard, the track change, and the teardown seams. A fake `AudioPlaylist` stands in for the
 * native object so the listeners can be driven a tick at a time.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, render } from '@testing-library/react-native';
import { Asset } from 'expo-asset';
import { createAudioPlaylist } from 'expo-audio';
import { AppState } from 'react-native';

import { SPEED_PERSIST_DEBOUNCE_MS } from '@/constants/audio';
import { loadReciterManifest } from '@/lib/reciterManifest';
import { useAudioPlayerStore } from '@/stores/audioPlayerStore';
import { RecitationEngineHost } from '../components/RecitationEngineHost';

/**
 * The lock-screen artwork's asset lookup, spied at module scope so a test can count the calls and
 * make them FAIL. `jest.setup.js` already stands the class in for the native module; this wraps
 * it.
 */
let mockAssetFails = false;
const realFromModule = Asset.fromModule.bind(Asset);
const fromModuleSpy = jest.spyOn(Asset, 'fromModule').mockImplementation((mod) => {
  if (mockAssetFails) throw new Error('asset unavailable');
  return realFromModule(mod);
});

const mockSetAudioPosition = jest.fn();
/**
 * The reader's chosen reciter, MUTABLE — story 7-2's switch is driven by re-rendering the host
 * after moving this, which is exactly how the preference reaches the engine in production (a
 * picker write, or a background sync pull, re-renders `usePreferences()`'s subscriber).
 */
let mockReciterId = 'husary';
jest.mock('@/lib/sync', () => ({
  DEFAULT_PREFERENCES: { reciterId: 'alafasy' },
  usePreferences: () => ({ data: { reciterId: mockReciterId } }),
  setAudioPosition: (...args: unknown[]) => mockSetAudioPosition(...args),
}));

/**
 * Al-Fatihah (7 ayahs, so it is fully timed) plus a two-ayah stub for surah 2 that is NOT — the
 * partial-manifest case the `alafasy` data actually exhibits.
 */
const mockFixture = {
  '1': [
    { verse_key: '1:1', timestamp_from: 0, timestamp_to: 6031 },
    { verse_key: '1:2', timestamp_from: 6031, timestamp_to: 11565 },
    { verse_key: '1:3', timestamp_from: 11565, timestamp_to: 16137 },
    { verse_key: '1:4', timestamp_from: 16137, timestamp_to: 20738 },
    { verse_key: '1:5', timestamp_from: 20738, timestamp_to: 27390 },
    { verse_key: '1:6', timestamp_from: 27390, timestamp_to: 32934 },
    { verse_key: '1:7', timestamp_from: 32934, timestamp_to: 46121 },
  ],
  '2': [
    { verse_key: '2:1', timestamp_from: 0, timestamp_to: 7605 },
    { verse_key: '2:2', timestamp_from: 7605, timestamp_to: 16538 },
  ],
};

/**
 * The device's stored rate, MUTABLE — a "relaunch" in this suite is a remount of the host with a
 * different value here, which is exactly the channel a real relaunch uses (a synchronous MMKV
 * read inside the boot effect).
 */
let mockStoredSpeed = 1;
const mockWriteSpeed = jest.fn((speed: number) => {
  mockStoredSpeed = speed;
});
jest.mock('../lib/playbackPrefs', () => ({
  readStoredSpeed: () => mockStoredSpeed,
  writeStoredSpeed: (speed: number) => mockWriteSpeed(speed),
}));

/**
 * Which surahs this reciter has on disk, for story 7-5's local-first resolver.
 *
 * ⚠️ THE ENGINE IS WHERE THE STORY'S PROMISE IS ACTUALLY REMOVABLE. Every other assertion in
 * this file uses `toContain('/husary/112.mp3')`, which matches the CDN URL *and* a `file://`
 * path equally well — so reverting `buildSources` to `surahAudioUrl(...)` left the whole suite
 * green while every downloaded surah silently streamed again. The cases at the bottom of "the
 * queue is surahs" are the ones that redden for that edit. (Story 7-5 review, P2.)
 */
const mockLocalSurahs = new Map<string, string>();
jest.mock('../lib/audioDownloads', () => ({
  localSurahUri: (reciterId: string, surah: number) =>
    mockLocalSurahs.get(`${reciterId}:${surah}`) ?? null,
  downloadedSurahSet: (reciterId: string) => {
    const kept = new Set<number>();
    for (const key of mockLocalSurahs.keys()) {
      const [id, surah] = key.split(':');
      if (id === reciterId) kept.add(Number(surah));
    }
    return kept;
  },
}));

let mockManifestFails = false;
jest.mock('@/lib/reciterManifest', () => {
  const actual = jest.requireActual('@/lib/reciterManifest');
  return {
    ...actual,
    loadReciterManifest: jest.fn(async (id: string) => {
      if (mockManifestFails) throw new actual.ReciterManifestError(id, new Error('offline'));
      return actual.parseReciterManifest(mockFixture);
    }),
  };
});

interface FakePlaylist {
  currentTime: number;
  playing: boolean;
  /** The native playlist's rate is a PROPERTY, not a `setPlaybackRate(rate, pitch)` call. */
  playbackRate: number;
  listeners: Record<string, ((payload: never) => void)[]>;
  play: jest.Mock;
  pause: jest.Mock;
  seekTo: jest.Mock;
  destroy: jest.Mock;
  addListener: jest.Mock;
  setActiveForLockScreen: jest.Mock;
  updateLockScreenMetadata: jest.Mock;
  clearLockScreenControls: jest.Mock;
}

let playlist: FakePlaylist;
/** The mounted host, so a preference change can be delivered by re-rendering it. */
let view: ReturnType<typeof render>;
/** The engine's AppState subscriber, captured so backgrounding can be driven. */
let appStateListener: ((state: string) => void) | undefined;
let createdWith: {
  sources: { uri: string; name: string; artworkUrl?: string }[];
  updateInterval: number;
  loop: string;
};

function makePlaylist(): FakePlaylist {
  const listeners: Record<string, ((payload: never) => void)[]> = {};
  return {
    currentTime: 0,
    playing: false,
    playbackRate: 1,
    listeners,
    play: jest.fn(function (this: FakePlaylist) {
      playlist.playing = true;
    }),
    pause: jest.fn(() => {
      playlist.playing = false;
    }),
    seekTo: jest.fn(async () => {}),
    destroy: jest.fn(),
    addListener: jest.fn((event: string, fn: (payload: never) => void) => {
      (listeners[event] ??= []).push(fn);
      return { remove: jest.fn() };
    }),
    setActiveForLockScreen: jest.fn(),
    updateLockScreenMetadata: jest.fn(),
    clearLockScreenControls: jest.fn(),
  };
}

/**
 * Drive one status tick at `seconds` of media time.
 *
 * The payload mirrors `AudioPlaylistStatus`; `didJustFinish` and `isLoaded` are the two fields the
 * engine reads besides position, so they are parameters rather than constants.
 */
const tick = async (
  seconds: number,
  extra: {
    didJustFinish?: boolean;
    isLoaded?: boolean;
    playing?: boolean;
    index?: number;
    /** ⚠️ A REAL STATE, and it was hardcoded false until story 7-4's review: a mid-playback stall
     *  reports `playing: false, isBuffering: true`, which the engine turns into `buffering`. */
    isBuffering?: boolean;
    /**
     * ⚠️ ALSO A REAL STATE, and it was hardcoded to 60 until story 7-3's review: the stream
     * reports `duration: 0` until a track is prepared, and a track that NEVER reports one is the
     * only thing the end-of-surah pause at `onTrackChanged` exists for.
     */
    duration?: number;
  } = {}
) => {
  playlist.currentTime = seconds;
  const status = {
    id: 'test',
    currentIndex: extra.index ?? 0,
    trackCount: 3,
    currentTime: seconds,
    duration: extra.duration ?? 60,
    playing: extra.playing ?? playlist.playing,
    isBuffering: extra.isBuffering ?? false,
    isLoaded: extra.isLoaded ?? true,
    playbackRate: 1,
    muted: false,
    volume: 1,
    loop: 'none' as const,
    didJustFinish: extra.didJustFinish ?? false,
  };
  await act(async () => {
    for (const fn of playlist.listeners.playlistStatusUpdate ?? [])
      (fn as unknown as (s: typeof status) => void)(status);
  });
};

const changeTrack = async (currentIndex: number) => {
  await act(async () => {
    for (const fn of playlist.listeners.trackChanged ?? [])
      (fn as unknown as (p: { previousIndex: number; currentIndex: number }) => void)({
        previousIndex: currentIndex - 1,
        currentIndex,
      });
  });
};

beforeEach(() => {
  appStateListener = undefined;
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_event: string, handler: (s: never) => void) => {
      appStateListener = handler as unknown as (state: string) => void;
      return { remove: jest.fn() } as never;
    });
  mockManifestFails = false;
  mockLocalSurahs.clear();
  mockReciterId = 'husary';
  // Before the render below: the boot effect reads this synchronously.
  mockStoredSpeed = 1;
  mockWriteSpeed.mockClear();
  mockSetAudioPosition.mockClear();
  (loadReciterManifest as jest.Mock).mockClear();
  playlist = makePlaylist();
  (createAudioPlaylist as jest.Mock).mockImplementation((options: typeof createdWith) => {
    createdWith = options;
    return playlist;
  });
  act(() => {
    useAudioPlayerStore.getState().clearPlayback();
  });
  view = render(<RecitationEngineHost />);
});

/**
 * Move the reader's reciter preference and let the engine see it.
 *
 * The host re-renders with the new value, which is the only channel the switch has — the engine's
 * boot effect never re-runs, deliberately (re-running it would rebuild the playlist and
 * re-register every action mid-listen).
 */
const switchReciter = async (id: string) => {
  mockReciterId = id;
  await act(async () => {
    view.rerender(<RecitationEngineHost />);
  });
};

const engine = () => useAudioPlayerStore.getState();

/**
 * The artwork's failure path (story 7-3 review, P3).
 *
 * ⚠️ THIS DESCRIBE IS FIRST IN THE FILE ON PURPOSE, AND MOVING IT BREAKS IT. `lockScreenArtworkUri`
 * memoizes its answer at MODULE scope, so once any earlier case has resolved the asset the
 * resolver is never entered again and a failing `Asset.fromModule` would be unobservable. Running
 * first means this is the very first `playSurah` of the file. The `expect(fromModuleSpy)` line
 * below is the guard on that: if the memo is ever warm by the time this runs, the resolver was
 * not entered and the case fails loudly rather than passing vacuously.
 *
 * The resolver clears the memo on failure, which is what lets every later case resolve normally.
 */
describe('the lock-screen artwork, when the asset system fails', () => {
  /**
   * ⚠️ `beforeAll`, NOT `beforeEach`, AND THAT IS THE WHOLE TRICK. The engine warms the memo from
   * its BOOT effect, which runs in the file-level `beforeEach`'s `render` — i.e. before any hook
   * this describe could use to arm the failure. A describe's `beforeAll` is the one hook that
   * runs earlier, so this makes the very first resolve of the process fail; the resolver clears
   * the memo on failure, so the case's own `playSurah` fails again and is observable.
   */
  beforeAll(() => {
    mockAssetFails = true;
  });
  afterAll(() => {
    mockAssetFails = false;
  });

  it('is a cosmetic loss — playback still starts, and nothing is an error', async () => {
    mockAssetFails = true;
    const before = fromModuleSpy.mock.calls.length;

    await act(async () => {
      await engine().playSurah(1);
    });

    // Anti-vacuity: the resolver really was entered, i.e. the memo was cold and the throw landed.
    expect(fromModuleSpy.mock.calls.length).toBeGreaterThan(before);
    // The whole point: a decorative image cannot stop the Quran playing.
    expect(createdWith.sources).toHaveLength(114);
    expect(playlist.play).toHaveBeenCalled();
    expect(playlist.setActiveForLockScreen).toHaveBeenCalled();
    expect(engine().errorKey).toBeNull();
    expect(engine().surah).toBe(1);

    // The card still names the surah and the reciter; only the artwork is missing.
    expect(playlist.setActiveForLockScreen.mock.calls[0][1]).toEqual({
      title: 'Al-Fatihah',
      artist: 'Mahmoud Khalil Al-Husary',
    });
    // And no track carries a broken path, rather than carrying one.
    expect(createdWith.sources[0].artworkUrl).toBeUndefined();
  });

  /**
   * ⚠️ THE MEMO IS CLEARED ON FAILURE, SO THE NEXT PRESS RETRIES. Memoizing a bad outcome would
   * mean no artwork until the process restarts — and a memoized REJECTION would make every later
   * `playSurah` die on the `Promise.all` with `player:errors.playFailed`.
   *
   * MUTATION: drop `artworkPromise = null` from the `catch`; this reddens.
   */
  it('retries on the next press rather than memoizing the failure', async () => {
    mockAssetFails = true;
    await act(async () => {
      await engine().playSurah(1);
    });
    // Off `loading`, or the second press is bounced by `playSurah`'s own press guard.
    await tick(1);
    mockAssetFails = false;

    await act(async () => {
      await engine().playSurah(2);
    });

    expect(engine().errorKey).toBeNull();
    expect(createdWith.sources[0].artworkUrl).toBe('file:///mock/asset');
  });
});

describe('the queue is surahs', () => {
  it('builds tracks from the requested surah to the end of the book', async () => {
    await act(async () => {
      await engine().playSurah(112);
    });
    // 112, 113, 114 — three tracks, in order, named for the lock screen.
    expect(createdWith.sources).toHaveLength(3);
    expect(createdWith.sources[0].uri).toContain('/husary/112.mp3');
    expect(createdWith.sources[2].uri).toContain('/husary/114.mp3');
    expect(createdWith.sources[0].name).toBe('Al-Ikhlas');
  });

  /** ⚠️ The criterion "the end of Surah 114 does not loop to Surah 1" is this one option. */
  it('never loops, and ticks fast enough for the 100ms criterion', async () => {
    await act(async () => {
      await engine().playSurah(1);
    });
    expect(createdWith.loop).toBe('none');
    expect(createdWith.updateInterval).toBe(100);
  });

  /**
   * ⚠️ THE ZERO-NETWORK-CALLS CRITERION, AS A TEST. A downloaded surah's track must BE the file
   * path — not merely "contain the surah number", which the CDN URL does too. The neighbour is
   * asserted in the same case so the rule is "local when local, remote otherwise" rather than
   * "everything went one way".
   */
  it('gives a downloaded surah the FILE as its uri, and its neighbour the CDN', async () => {
    mockLocalSurahs.set('husary:112', 'file:///documents/audio/husary/112.mp3');
    await act(async () => {
      await engine().playSurah(112);
    });

    expect(createdWith.sources[0].uri).toBe('file:///documents/audio/husary/112.mp3');
    expect(createdWith.sources[0].uri).not.toContain('http');
    // 113 is not kept, so it is still streamed — byte for byte the pre-7-5 URL.
    expect(createdWith.sources[1].uri).toBe(
      'https://cdn.nobleachievements.com/audio/husary/113.mp3'
    );
  });

  it('streams every track when nothing is on disk', async () => {
    await act(async () => {
      await engine().playSurah(112);
    });
    expect(createdWith.sources.map((source) => source.uri)).toEqual([
      'https://cdn.nobleachievements.com/audio/husary/112.mp3',
      'https://cdn.nobleachievements.com/audio/husary/113.mp3',
      'https://cdn.nobleachievements.com/audio/husary/114.mp3',
    ]);
  });

  it('starting An-Nas queues exactly one track, so the book ends there', async () => {
    await act(async () => {
      await engine().playSurah(114);
    });
    expect(createdWith.sources).toHaveLength(1);
  });

  it('plays, and takes the lock screen', async () => {
    await act(async () => {
      await engine().playSurah(1);
    });
    expect(playlist.play).toHaveBeenCalled();
    /**
     * ⚠️ THE OPTIONS ARE THE STORY (7-3). Called with `true` alone — which is what shipped with
     * 7-1 — every flag in the native record defaults to `false`, so the lock screen carried a
     * play/pause button and NOTHING else: no next, no previous. Written out as literals rather
     * than compared against the constant, which would agree with itself whatever it said.
     *
     * `showSeek*` stay false on purpose: a fixed-time skip is what story 3-3's AC3 forbids.
     * `isLiveStream: false` is what keeps the duration and the scrubber on the card.
     */
    expect(playlist.setActiveForLockScreen).toHaveBeenCalledWith(
      true,
      { title: 'Al-Fatihah', artist: 'Mahmoud Khalil Al-Husary' },
      {
        showNextTrack: true,
        showPreviousTrack: true,
        showSeekForward: false,
        showSeekBackward: false,
        isLiveStream: false,
      }
    );
    expect(engine().surah).toBe(1);
  });

  it('seeks to the requested ayah before playing when one is named', async () => {
    await act(async () => {
      await engine().playSurah(1, 5);
    });
    // 1:5 starts at 20,738ms — the player speaks SECONDS.
    expect(playlist.seekTo).toHaveBeenCalledWith(20.738);
  });
});

describe('the status tick drives the highlight', () => {
  beforeEach(async () => {
    await act(async () => {
      await engine().playSurah(1);
    });
  });

  it('publishes the ayah the manifest says owns this position', async () => {
    await tick(12); // 12,000ms is inside 1:3 [11565, 16137)
    expect(engine().activeVerseKey).toBe('1:3');
  });

  it('publishes nothing new while the ayah has not changed', async () => {
    await tick(12);
    const before = engine().activeVerseKey;
    await tick(12.5); // still inside 1:3
    expect(engine().activeVerseKey).toBe(before);
  });

  it('refreshes the lock screen MID-TRACK, as the ayah changes', async () => {
    await tick(1);
    await tick(12);
    // Two ayahs, two refreshes — a conventional engine would have refreshed on track change only.
    // ⚠️ COUNTED BY THE CALLS THAT NAME AN AYAH. Story 7-4 made a rate change refresh the
    // now-playing info too, and 7-3 made the track's own adoption push the bare surah name — so
    // a raw call count moves for reasons that have nothing to do with the ayah.
    const withAyah = (
      playlist.updateLockScreenMetadata.mock.calls as [{ title?: string } | undefined][]
    ).filter(([m]) => / · \d+$/.test(m?.title ?? ''));
    expect(withAyah).toHaveLength(2);
    // ⚠️ THE WHOLE PAYLOAD, because native stores what arrives as the card's ENTIRE metadata.
    // A `{title}`-only push — which is what 7-1 and 7-4 sent — strips the reciter and the
    // artwork off a card that already had them. There is no merge on either platform.
    expect(playlist.updateLockScreenMetadata).toHaveBeenLastCalledWith({
      title: 'Al-Fatihah · 3',
      artist: 'Mahmoud Khalil Al-Husary',
    });
  });

  it('publishes no key at all for a surah whose timings are incomplete', async () => {
    // Leave `loading` first — a press during the load window is deliberately bounced (below).
    await tick(1);
    // Surah 2 has 286 ayahs and the fixture holds 2 — the shape `alafasy` really ships.
    await act(async () => {
      await engine().playSurah(2);
    });
    expect(engine().highlightAvailable).toBe(false);
    await tick(1);
    expect(engine().activeVerseKey).toBeNull();
  });
});

/**
 * The lock-screen card (story 7-3).
 *
 * What 7-1 shipped was `setActiveForLockScreen(true)` and a `{title}`-only refresh: no transport
 * buttons at all, and a card with no reciter and no artwork. These cases are the frozen matrix's
 * rows, each with a literal expected value rather than one derived from the engine's own inputs.
 */
describe('the lock-screen card', () => {
  /**
   * The metadata the native side was handed LAST, by whichever call carried it — what the card
   * would actually be showing.
   *
   * ⚠️ IT HAS TO READ BOTH CALLS. `setActiveForLockScreen` carries a full payload of its own, and
   * since the push is deduped against the card already shown (7-3 review, P4/P9) a track whose
   * title never moves — an untimed surah — is announced by that call and by nothing else.
   * Reading `updateLockScreenMetadata` alone would report `undefined` there. `invocationCallOrder`
   * is the only thing that orders two separate mocks against each other.
   */
  type Card = { title?: string; artist?: string; artworkUrl?: string } | undefined;
  const lastCard = (): Card => {
    const seen: { order: number; card: Card }[] = [];
    const push = playlist.updateLockScreenMetadata.mock;
    const activate = playlist.setActiveForLockScreen.mock;
    (push.calls as [Card][]).forEach((call, i) => {
      seen.push({ order: push.invocationCallOrder[i], card: call[0] });
    });
    (activate.calls as [boolean, Card][]).forEach((call, i) => {
      seen.push({ order: activate.invocationCallOrder[i], card: call[1] });
    });
    seen.sort((a, b) => a.order - b.order);
    return seen[seen.length - 1]?.card;
  };

  /**
   * ⚠️ THE ARTIST IS THE **LOADED** TRACK'S VOICE. `mockReciterId` — the reader's PREFERENCE —
   * stays 'husary' throughout; only the store's loaded track moves. A card built from the
   * preference would name a reciter the listener has not heard a syllable of, because the
   * preference is what the NEXT track will use.
   *
   * MUTATION: read `selectedReciterId` / the preference instead of `store.reciterId`.
   */
  it('names the loaded track’s reciter, not the reader’s preference', async () => {
    await act(async () => {
      await engine().playSurah(1);
    });
    await tick(1);
    expect(lastCard()?.artist).toBe('Mahmoud Khalil Al-Husary');

    act(() => {
      useAudioPlayerStore.getState().setTrack(1, 'alafasy', true);
    });
    await tick(12); // 1:3 — a new ayah, so a new push
    expect(mockReciterId).toBe('husary');
    expect(lastCard()).toEqual({
      title: 'Al-Fatihah · 3',
      artist: 'Mishary Rashid Al-Afasy',
    });
  });

  /**
   * ⚠️ OMITTED, NEVER GUESSED AND NEVER THE RAW ID. `preferences.reciterId` is a free-form column
   * another device or an older build can write, so an id this build does not publish can reach
   * the engine. `reciterDisplayName` resolves such an id to the DEFAULT voice's name — right for
   * a picker row, wrong on a card that would then name Al-Afasy over audio that is not his.
   */
  it('omits the artist for a reciter this build does not publish', async () => {
    await act(async () => {
      await engine().playSurah(1);
    });
    act(() => {
      useAudioPlayerStore.getState().setTrack(1, 'not-a-reciter', true);
    });
    await tick(12);
    expect(lastCard()?.artist).toBeUndefined();
    expect(JSON.stringify(lastCard())).not.toContain('not-a-reciter');
  });

  /**
   * ⚠️ THE FROZEN MATRIX'S "never a stale ayah number from the previous surah". `onStatus`
   * returns early when a surah has no usable window, so nothing would overwrite the last ayah
   * title — the card sat naming an ayah of a surah that had finished, and the rate refresh kept
   * re-sending it.
   */
  it('drops the ayah the moment the track changes', async () => {
    await act(async () => {
      await engine().playSurah(1);
    });
    await tick(40); // 1:7
    expect(lastCard()?.title).toBe('Al-Fatihah · 7');

    await changeTrack(1); // → Al-Baqarah, which the fixture times for 2 of 286 ayahs
    expect(lastCard()?.title).toBe('Al-Baqarah');
  });

  /**
   * ⚠️ AND A PARTLY-TIMED SURAH NEVER REGAINS ONE. `verseAtMs` answers truthfully over the
   * windows it has — for the `alafasy` shape that is one early ayah for the rest of the file —
   * so the gate is `highlightAvailable`, the same one the on-screen highlight uses.
   */
  it('names the surah alone while the surah is not fully timed', async () => {
    await act(async () => {
      await engine().playSurah(2);
    });
    expect(engine().highlightAvailable).toBe(false);
    await tick(20); // past 2:2's window — the lookup would confidently answer "2"
    expect(lastCard()).toEqual({
      title: 'Al-Baqarah',
      artist: 'Mahmoud Khalil Al-Husary',
    });
  });

  /**
   * ⚠️ WHAT THIS PINS IS THE MEMO, NOT THE CALL SITE — and the distinction matters because the
   * obvious mutation cannot redden it. The artwork resolve is memoized at module scope, so
   * `Asset.fromModule` is entered once per process wherever it is written; moving the resolve
   * into `pushLockScreen` would still show one call. What a per-ayah resolve WOULD cost is the
   * memo's `await` on the busiest line in the app, and this is the assertion that the memo exists
   * and holds across a whole surah of ayah changes.
   *
   * MUTATION that reddens it: drop the `??=` so every call re-resolves.
   */
  it('resolves the artwork once, not once per ayah', async () => {
    await act(async () => {
      await engine().playSurah(1);
    });
    // A DELTA, not an absolute — earlier describes have already warmed the memo, and an absolute
    // count would be pinning how many suites ran before this one.
    const before = fromModuleSpy.mock.calls.length;
    for (const seconds of [1, 7, 12, 17, 21, 28, 34]) await tick(seconds);
    // Seven ayah boundaries crossed, seven cards pushed, zero further asset lookups.
    expect(fromModuleSpy.mock.calls.length).toBe(before);
  });

  /**
   * ⚠️ WHICH FILE THE ARTWORK COMES FROM CAN ONLY BE ASSERTED AGAINST THE SOURCE (7-3 review, P6).
   * jest-expo transforms EVERY asset to `module.exports = 1`, so `require('audio-artwork.png')`
   * and `require('icon.png')` are the same value and the `expo-asset` stub cannot tell them
   * apart however it is written — which means all five `artworkUrl` expectations in this describe
   * stay green if the require is re-pointed at another file. Reading the source is the only thing
   * that reddens for that edit.
   */
  it('resolves the artwork from `assets/audio-artwork.png`, and no other file', () => {
    const source = readFileSync(join(__dirname, 'useRecitationEngine.tsx'), 'utf8');
    expect(source).toContain("require('@/assets/audio-artwork.png')");
    // One require in the whole engine, so there is no second asset quietly in play.
    expect(source.match(/require\('@\/assets\//g)).toHaveLength(1);
  });

  /**
   * ⚠️ THE TRANSPORT IS RE-APPLIED ON EVERY PLAYLIST, NOT ONLY THE FIRST (7-3 review, P8). The
   * playlist is REBUILT on every `playSurah` and on every voice switch, and each rebuild is a new
   * native object with its own default-`false` options record — so asserting the first call alone
   * would leave a lock screen that lost its next/previous buttons the moment the reader changed
   * surah, with the whole suite green.
   */
  it('re-applies the transport flags to every rebuilt playlist', async () => {
    await act(async () => {
      await engine().playSurah(1);
    });
    await tick(1); // off `loading`, so the second press is not bounced
    await act(async () => {
      await engine().playSurah(2);
    });
    await switchReciter('alafasy');

    // Three playlists: two presses and a voice switch.
    expect(playlist.setActiveForLockScreen.mock.calls.length).toBeGreaterThanOrEqual(3);
    for (const call of playlist.setActiveForLockScreen.mock.calls) {
      expect(call[0]).toBe(true);
      expect(call[2]).toEqual({
        showNextTrack: true,
        showPreviousTrack: true,
        showSeekForward: false,
        showSeekBackward: false,
        isLiveStream: false,
      });
    }
  });

  /**
   * ⚠️ AND THE CARD IS TAKEN DOWN WITH THE PLAYLIST. Without this the now-playing card outlives
   * the player it describes — a transport whose buttons reach a destroyed object.
   */
  it('clears the lock-screen controls when the playlist goes away', async () => {
    await act(async () => {
      await engine().playSurah(1);
    });
    expect(playlist.clearLockScreenControls).not.toHaveBeenCalled();

    await act(async () => {
      await engine().stop();
    });
    expect(playlist.clearLockScreenControls).toHaveBeenCalled();
  });

  /**
   * ⚠️ THE TRACKS ARE THE **ONLY** PLACE THE ARTWORK IS SENT, and that is the shape two separate
   * measurements on a Pixel 9 Pro forced. Android's notification cover loader skips a url equal
   * to the one it holds and has no `else` branch, so with one constant artwork url (a) the
   * metadata route dressed only the FIRST playlist of a session and left `largeIcon=null` for
   * every rebuild after it, and (b) — worse — the notification stopped being re-posted at all,
   * freezing its title and artist on the previous surah. The per-source url reaches the system
   * media card by a different road entirely (the MediaItem's `artworkUri`, which is what the lock
   * screen renders), and iOS prefers it over the metadata anyway.
   *
   * MUTATION: drop `artworkUrl` from the object `buildSources` pushes.
   */
  it('sends the artwork on every track, and never on the metadata', async () => {
    await act(async () => {
      await engine().playSurah(112);
    });
    expect(createdWith.sources).toHaveLength(3);
    for (const source of createdWith.sources) {
      expect(source.artworkUrl).toBe('file:///mock/asset');
    }
    // ⚠️ AND NOT ON THE CARD — putting it there froze Android's notification (see the docblock).
    for (const [, card] of playlist.setActiveForLockScreen.mock.calls as [boolean, object][]) {
      expect(card).not.toHaveProperty('artworkUrl');
    }
    for (const [card] of playlist.updateLockScreenMetadata.mock.calls as [object][]) {
      expect(card).not.toHaveProperty('artworkUrl');
    }
  });
});

describe('the post-seek guard', () => {
  beforeEach(async () => {
    await act(async () => {
      await engine().playSurah(1);
    });
    await tick(1); // settle on 1:1
  });

  it('moves the highlight immediately, without waiting for a tick', async () => {
    await act(async () => {
      await engine().seekToVerse(5);
    });
    expect(engine().activeVerseKey).toBe('1:5');
    expect(playlist.seekTo).toHaveBeenCalledWith(20.738);
  });

  /** ⚠️ THE CRITERION: the highlight must not snap backwards on a pre-seek tick. */
  it('ignores a tick still carrying the pre-seek position', async () => {
    await act(async () => {
      await engine().seekToVerse(5);
    });
    await tick(1); // the stale tick — 1,000ms, back in 1:1
    expect(engine().activeVerseKey).toBe('1:5');
  });

  /**
   * ⚠️ THE CARD MOVES WITH THE SEEK, NOT WITH THE NEXT BOUNDARY (7-3 review, P7). `seekToVerse`
   * sets `currentVerse.current` itself, which is exactly the condition `onStatus` early-returns
   * on — so without a push here the lock screen kept naming the PRE-seek ayah until that verse
   * ended, tens of seconds on a long one, against the frozen matrix's "refreshes on every ayah
   * change".
   *
   * MUTATION: drop the `announceVerse` call from `seekToVerse`; this reddens.
   */
  it('moves the lock-screen card too, not just the on-screen highlight', async () => {
    await act(async () => {
      await engine().seekToVerse(5);
    });
    const calls = playlist.updateLockScreenMetadata.mock.calls as [{ title?: string }][];
    expect(calls[calls.length - 1][0].title).toBe('Al-Fatihah · 5');

    // And the tick that follows changes nothing, which is the shape that used to hide the bug.
    await tick(21);
    const after = playlist.updateLockScreenMetadata.mock.calls as [{ title?: string }][];
    expect(after[after.length - 1][0].title).toBe('Al-Fatihah · 5');
  });

  it('releases once a tick arrives at or after the seek target', async () => {
    await act(async () => {
      await engine().seekToVerse(5);
    });
    await tick(1);
    await tick(21); // 21,000ms — past 1:5's start, so the guard releases
    expect(engine().activeVerseKey).toBe('1:5');
    await tick(28); // 28,000ms is inside 1:6 — proof the stream is live again
    expect(engine().activeVerseKey).toBe('1:6');
  });

  /**
   * ⚠️ NOT BELT-AND-BRACES: if the native side silently refuses the seek, no qualifying tick ever
   * arrives, and an un-released guard would freeze highlighting for the rest of the session.
   */
  it('releases on the timeout when no qualifying tick ever arrives', async () => {
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    await act(async () => {
      await engine().seekToVerse(5);
    });
    await tick(1);
    expect(engine().activeVerseKey).toBe('1:5');

    jest.spyOn(Date, 'now').mockReturnValue(now + 2100);
    await tick(1); // same stale position, but the guard has expired
    expect(engine().activeVerseKey).toBe('1:1');
    jest.spyOn(Date, 'now').mockRestore();
  });

  it('does not seek at all for an ayah with no window', async () => {
    playlist.seekTo.mockClear();
    await act(async () => {
      await engine().seekToVerse(99); // Al-Fatihah has 7
    });
    expect(playlist.seekTo).not.toHaveBeenCalled();
    expect(engine().activeVerseKey).toBe('1:1');
  });
});

describe('a track change', () => {
  beforeEach(async () => {
    await act(async () => {
      await engine().playSurah(1);
    });
    await tick(40); // 1:7
  });

  it('adopts the next surah and clears the previous ayah', async () => {
    await changeTrack(1);
    expect(engine().surah).toBe(2);
    // ⚠️ Cleared: the old surah's ayah must never linger over the new surah's text.
    expect(engine().activeVerseKey).toBeNull();
  });

  it('saves where the finished surah got to', async () => {
    await changeTrack(1);
    expect(mockSetAudioPosition).toHaveBeenCalledWith({
      surah: 1,
      verse: 7,
      reciterId: 'husary',
    });
  });
});

describe('listening position is written at events, never per tick', () => {
  it('writes nothing while a whole surah plays through', async () => {
    await act(async () => {
      await engine().playSurah(1);
    });
    for (const s of [1, 7, 12, 18, 22, 28, 34, 40, 45]) await tick(s);
    expect(mockSetAudioPosition).not.toHaveBeenCalled();
  });

  it('writes once on pause', async () => {
    await act(async () => {
      await engine().playSurah(1);
    });
    await tick(12);
    await act(async () => {
      await engine().pause();
    });
    expect(mockSetAudioPosition).toHaveBeenCalledTimes(1);
    expect(mockSetAudioPosition).toHaveBeenCalledWith({
      surah: 1,
      verse: 3,
      reciterId: 'husary',
    });
  });

  it('writes once on stop, and releases the track', async () => {
    await act(async () => {
      await engine().playSurah(1);
    });
    await tick(28);
    await act(async () => {
      await engine().stop();
    });
    expect(mockSetAudioPosition).toHaveBeenCalledWith({
      surah: 1,
      verse: 6,
      reciterId: 'husary',
    });
    expect(playlist.destroy).toHaveBeenCalled();
    expect(engine().playbackState).toBe('idle');
  });
});

describe('the end of the book, and a track that will not load', () => {
  /** ⚠️ No `trackChanged` ever announces the end — `didJustFinish` on the last index is all there is. */
  it('saves the position and stops when the final track finishes', async () => {
    await act(async () => {
      await engine().playSurah(112);
    });
    await tick(1);
    await tick(30);
    mockSetAudioPosition.mockClear();

    // Index 2 of 3 is An-Nas when the queue starts at Al-Ikhlas.
    await tick(45, { didJustFinish: true, index: 2, playing: false });
    expect(mockSetAudioPosition).toHaveBeenCalledTimes(1);
    expect(engine().playbackState).toBe('paused');
  });

  it('does NOT treat a mid-queue track ending as the end of the book', async () => {
    await act(async () => {
      await engine().playSurah(112);
    });
    await tick(1);
    // Index 0 finishing is Al-Ikhlas handing over to Al-Falaq — `trackChanged` owns that.
    await tick(45, { didJustFinish: true, index: 0, playing: false });
    expect(engine().playbackState).not.toBe('paused');
  });

  /**
   * ⚠️ `AudioPlaylistStatus` HAS NO ERROR FIELD, so a 404 and a slow network are the same event.
   * Without the watchdog the store sat at `loading` forever and the play button had visibly done
   * nothing at all.
   */
  it('errors out when a track never loads, rather than sitting at loading forever', async () => {
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    await act(async () => {
      await engine().playSurah(1);
    });
    await tick(0, { isLoaded: false, playing: false });
    expect(engine().playbackState).toBe('loading');

    jest.spyOn(Date, 'now').mockReturnValue(now + 16_000);
    await tick(0, { isLoaded: false, playing: false });
    expect(engine().playbackState).toBe('error');
    expect(engine().errorKey).toBe('player:errors.playFailed');
    jest.spyOn(Date, 'now').mockRestore();
  });

  it('bounces a second play press while the first is still loading', async () => {
    await act(async () => {
      await engine().playSurah(1);
    });
    const built = (createAudioPlaylist as jest.Mock).mock.calls.length;
    // A rebuild here would tear the playlist down and audibly restart the surah.
    await act(async () => {
      await engine().playSurah(1);
    });
    expect((createAudioPlaylist as jest.Mock).mock.calls.length).toBe(built);
  });
});

describe('backgrounding — the fourth write moment', () => {
  it('saves the position when the app leaves the foreground', async () => {
    await act(async () => {
      await engine().playSurah(1);
    });
    await tick(12);
    mockSetAudioPosition.mockClear();

    await act(async () => {
      appStateListener?.('background');
    });
    expect(mockSetAudioPosition).toHaveBeenCalledWith({
      surah: 1,
      verse: 3,
      reciterId: 'husary',
    });
  });

  it('writes nothing on the way BACK to the foreground', async () => {
    await act(async () => {
      await engine().playSurah(1);
    });
    await tick(12);
    mockSetAudioPosition.mockClear();

    await act(async () => {
      appStateListener?.('active');
    });
    expect(mockSetAudioPosition).not.toHaveBeenCalled();
  });
});

describe('an untimed surah saves ayah 1, not the lookup answer', () => {
  it('does not store the two-window answer for a partly-timed surah', async () => {
    await act(async () => {
      await engine().playSurah(2); // 286 ayahs, 2 windows in the fixture
    });
    await tick(20); // inside 2:2's window
    mockSetAudioPosition.mockClear();
    await act(async () => {
      await engine().pause();
    });
    // ⚠️ Ya-Sin under `alafasy` would otherwise store "36:2" after fifteen minutes of audio, and
    // a resume would land there.
    expect(mockSetAudioPosition).toHaveBeenCalledWith({
      surah: 2,
      verse: 1,
      reciterId: 'husary',
    });
  });
});

describe('failure and teardown', () => {
  it('an unavailable manifest is a retryable error state, not a crash', async () => {
    mockManifestFails = true;
    await act(async () => {
      await engine().playSurah(1);
    });
    expect(engine().playbackState).toBe('error');
    expect(engine().errorKey).toBe('player:errors.playFailed');
  });

  /** `lib/accountTeardown.ts` calls this on sign-out — see the store's note on why. */
  it('abandonPlayback destroys the playlist and clears the lock screen', async () => {
    await act(async () => {
      await engine().playSurah(1);
    });
    await act(async () => {
      await engine().abandonPlayback();
    });
    expect(playlist.clearLockScreenControls).toHaveBeenCalled();
    expect(playlist.destroy).toHaveBeenCalled();
    expect(engine().surah).toBeNull();
    expect(engine().activeVerseKey).toBeNull();
  });

  /**
   * ⚠️ THE ENGINE IS REUSABLE, NOT ONE-SHOT. `abandonPlayback` used to null the reciter ref, whose
   * only writer is the preference effect — and that early-returns unless the preference VALUE
   * moves. With one shipped default it never does, so every play after a sign-out returned
   * silently and recitation was dead until the app relaunched.
   */
  it('still plays after a sign-out teardown', async () => {
    await act(async () => {
      await engine().playSurah(1);
    });
    await act(async () => {
      await engine().abandonPlayback();
    });
    playlist = makePlaylist();

    await act(async () => {
      await engine().playSurah(1);
    });
    expect(playlist.play).toHaveBeenCalled();
    expect(engine().surah).toBe(1);
  });
});

describe('tap-to-seek resumes, it does not just move the marker', () => {
  it('starts playing again when the reader taps an ayah while paused', async () => {
    await act(async () => {
      await engine().playSurah(1);
    });
    await tick(1);
    await act(async () => {
      await engine().pause();
    });
    playlist.play.mockClear();

    await act(async () => {
      await engine().seekToVerse(5);
    });
    // The criterion is "playback RESUMES at that verse's offset" — a moved highlight over silence
    // is a tap that looks like it half-worked.
    expect(playlist.seekTo).toHaveBeenCalledWith(20.738);
    expect(playlist.play).toHaveBeenCalled();
    expect(engine().playbackState).toBe('playing');
  });

  it('does not re-issue play when it is already playing', async () => {
    await act(async () => {
      await engine().playSurah(1);
    });
    await tick(1);
    playlist.play.mockClear();
    await act(async () => {
      await engine().seekToVerse(5);
    });
    expect(playlist.play).not.toHaveBeenCalled();
  });
});

/**
 * ⚠️ 7-1 STOPPED PLAYBACK HERE, AND THAT WAS A PLACEHOLDER RATHER THAN A BEHAVIOUR. Story 7-2's
 * switch keeps the ayah and the play/pause state: the reader hears the same words in a different
 * voice, which is the entire feature.
 */
describe('changing the reciter mid-listen', () => {
  it('re-plays the SAME ayah in the new voice, still playing', async () => {
    await act(async () => {
      await engine().playSurah(1);
    });
    await tick(12); // settles on 1:3
    playlist = makePlaylist();

    await switchReciter('ghamidi');

    // The new voice's URLs, not the old one's — the ref moves before anything is built.
    expect(createdWith.sources[0].uri).toContain('/ghamidi/001.mp3');
    expect(loadReciterManifest).toHaveBeenLastCalledWith('ghamidi');
    // 1:3 starts at 11,565ms; the player speaks SECONDS.
    expect(playlist.seekTo).toHaveBeenCalledWith(11.565);
    expect(playlist.play).toHaveBeenCalled();
    expect(playlist.pause).not.toHaveBeenCalled();
    expect(engine().reciterId).toBe('ghamidi');
    // The state settles on the new voice's first status tick, exactly as a fresh press does.
    await tick(12);
    expect(engine().playbackState).toBe('playing');
    expect(engine().activeVerseKey).toBe('1:3');
  });

  it('leaves a PAUSED listener paused — a preference change is not a play request', async () => {
    await act(async () => {
      await engine().playSurah(1);
    });
    await tick(12);
    await act(async () => {
      await engine().pause();
    });
    playlist = makePlaylist();

    await switchReciter('ghamidi');

    expect(createdWith.sources[0].uri).toContain('/ghamidi/001.mp3');
    expect(playlist.seekTo).toHaveBeenCalledWith(11.565);
    expect(playlist.pause).toHaveBeenCalled();
    expect(engine().playbackState).toBe('paused');
  });

  it('starts nothing when nothing was loaded', async () => {
    const built = (createAudioPlaylist as jest.Mock).mock.calls.length;
    await switchReciter('ghamidi');
    expect((createAudioPlaylist as jest.Mock).mock.calls.length).toBe(built);
    expect(engine().playbackState).toBe('idle');
    expect(engine().surah).toBeNull();
  });

  it('the new voice is the one that plays on the NEXT press, with no track loaded', async () => {
    // The ref is the whole change in the idle case, and this is what proves it took.
    await switchReciter('ghamidi');
    await act(async () => {
      await engine().playSurah(1);
    });
    expect(createdWith.sources[0].uri).toContain('/ghamidi/001.mp3');
  });

  it('saves where the OLD voice got to before the swap', async () => {
    await act(async () => {
      await engine().playSurah(1);
    });
    await tick(12);
    mockSetAudioPosition.mockClear();

    await switchReciter('ghamidi');

    // Recorded against `husary`, the voice the reader was actually listening to.
    expect(mockSetAudioPosition).toHaveBeenCalledWith({
      surah: 1,
      verse: 3,
      reciterId: 'husary',
    });
  });

  /**
   * ⚠️ A PARTLY-TIMED SURAH RESUMES AT AYAH 1, the same rule `savePosition` follows. The tick
   * writes `currentVerse` even when highlighting is off, so for surah 2 (286 ayahs, 2 windows in
   * the fixture) the ref holds a confidently wrong ayah — seeking the NEW reciter there would
   * move the reader somewhere they never were.
   */
  it('does not carry an untimed surah`s wrong ayah into the new voice', async () => {
    await act(async () => {
      await engine().playSurah(2);
    });
    await tick(12);
    playlist = makePlaylist();

    await switchReciter('ghamidi');

    expect(playlist.seekTo).not.toHaveBeenCalled();
    expect(playlist.play).toHaveBeenCalled();
  });

  /**
   * ⚠️ `playSurah` BOUNCES OFF `loading`, so a second choice arriving inside the first switch's
   * manifest fetch would silently do nothing — leaving the app playing a voice the settings
   * screen showed as unselected. The switch re-reads the ref after each attempt.
   */
  it('lands on the LAST choice when two arrive in quick succession', async () => {
    await act(async () => {
      await engine().playSurah(1);
    });
    await tick(12);

    // Both preference values delivered before the first switch's async work can settle.
    mockReciterId = 'ghamidi';
    view.rerender(<RecitationEngineHost />);
    mockReciterId = 'qatami';
    await act(async () => {
      view.rerender(<RecitationEngineHost />);
    });

    expect(createdWith.sources[0].uri).toContain('/qatami/001.mp3');
    expect(engine().reciterId).toBe('qatami');
  });

  it('an unusable manifest for the new voice is an error state, not silence', async () => {
    await act(async () => {
      await engine().playSurah(1);
    });
    await tick(12);
    await act(async () => {
      await engine().pause();
    });
    mockManifestFails = true;

    await switchReciter('ghamidi');

    // ⚠️ The pause that follows a paused switch must NOT overwrite the error the retry needs.
    expect(engine().playbackState).toBe('error');
    expect(engine().errorKey).toBe('player:errors.playFailed');
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════
// story 7-4 — speed and the sleep timer
// ════════════════════════════════════════════════════════════════════════════════════════════

describe('speed', () => {
  it('applies to the native playlist the moment it changes, while playing', async () => {
    await act(async () => {
      await engine().playSurah(1);
    });
    await tick(3);
    expect(playlist.playing).toBe(true);

    act(() => engine().setSpeed(1.5));

    expect(playlist.playbackRate).toBe(1.5);
  });

  /**
   * ⚠️ THE DEFECT THE EPIC NAMES, AS ONE CASE. The pre-fork build applied the rate only while
   * playing, so a listener who paused, chose 2.0x and resumed heard 1.0x. MUTATION: gate
   * `applyRate` on `playbackState === 'playing'`; this reddens and the case above stays green.
   */
  it('applies while PAUSED, and resuming does not undo it', async () => {
    await act(async () => {
      await engine().playSurah(1);
    });
    await tick(3);
    await act(async () => {
      await engine().pause();
    });
    expect(engine().playbackState).toBe('paused');

    act(() => engine().setSpeed(2));

    expect(playlist.playbackRate).toBe(2);
    // Setting a rate is not a transport command: it must not start anything.
    expect(playlist.play).toHaveBeenCalledTimes(1);

    await act(async () => {
      await engine().resume();
    });
    expect(playlist.playbackRate).toBe(2);
  });

  it('survives a relaunch, and is in place BEFORE the first press', async () => {
    // The reader's last session left 1.5 on the device; the app is started again.
    mockStoredSpeed = 1.5;
    view.unmount();
    view = render(<RecitationEngineHost />);

    // Not "after the first play" — the store already says so with nothing loaded at all.
    expect(engine().speed).toBe(1.5);

    await act(async () => {
      await engine().playSurah(1);
    });
    expect(playlist.playbackRate).toBe(1.5);
  });

  /**
   * ⚠️ EVERY PLAYLIST IS BORN AT THE RATE, which is not the same claim as "a change is applied".
   * `playSurah` tears the playlist down and builds a new one, so a rate applied only on change
   * would be silently lost by the next surah and by every voice switch. MUTATION: delete the
   * `applyRate` call in `startPlayback`; the first case stays green and this reddens.
   */
  it('a rebuilt playlist starts at the reader’s rate, not at 1.0', async () => {
    await act(async () => {
      await engine().playSurah(1);
    });
    // A tick, so the state leaves `loading` — a press that lands there is deliberately bounced.
    await tick(3);
    act(() => engine().setSpeed(0.75));

    // A different surah — a whole new native playlist.
    playlist = makePlaylist();
    await act(async () => {
      await engine().playSurah(36);
    });
    expect(playlist.playbackRate).toBe(0.75);
  });

  it('is persisted once the drag STOPS, not on every frame of it', async () => {
    await act(async () => {
      await engine().playSurah(1);
    });
    /**
     * ⚠️ THE SLIDER HAS NO RELEASE EVENT (17.3's accepted regression), so a drag commits ~30
     * values live. Each must be HEARD immediately and only the last needs to reach the disk;
     * writing all thirty is thirty synchronous MMKV writes for one gesture, with no outbox to
     * coalesce them the way 6-5's font-size slider has. MUTATION: call `writeStoredSpeed`
     * straight from the subscription; the first assertion reddens.
     */
    jest.useFakeTimers();
    try {
      for (const rate of [1.05, 1.1, 1.15, 1.2, 1.25]) act(() => engine().setSpeed(rate));
      expect(mockWriteSpeed).not.toHaveBeenCalled();
      // …and the audible half is NOT debounced: the player already has the latest value.
      expect(playlist.playbackRate).toBe(1.25);

      act(() => {
        jest.advanceTimersByTime(SPEED_PERSIST_DEBOUNCE_MS + 10);
      });
      expect(mockWriteSpeed).toHaveBeenCalledTimes(1);
      expect(mockWriteSpeed).toHaveBeenCalledWith(1.25);
    } finally {
      jest.useRealTimers();
    }
  });

  it('a rate chosen mid-drag survives a teardown — the debounce is flushed, not dropped', () => {
    jest.useFakeTimers();
    try {
      act(() => engine().setSpeed(1.75));
      expect(mockWriteSpeed).not.toHaveBeenCalled();
      view.unmount();
      expect(mockWriteSpeed).toHaveBeenCalledWith(1.75);
    } finally {
      jest.useRealTimers();
    }
  });

  it('tells the LOCK SCREEN about the rate, which setting the property alone does not', async () => {
    await act(async () => {
      await engine().playSurah(1);
    });
    playlist.updateLockScreenMetadata.mockClear();
    /**
     * ⚠️ THE PATCH PUBLISHES `MPNowPlayingInfoPropertyPlaybackRate` ONLY WHEN THE NOW-PLAYING
     * INFO IS REBUILT — an item change or an explicit refresh — and assigning `playbackRate` is
     * neither. On a fully timed surah the per-ayah refresh hides it; on an UNTIMED one nothing
     * pushes metadata at all and the lock-screen scrubber ran at the old rate until the next
     * track. MUTATION: drop the `updateLockScreenMetadata` call from `applyRate`.
     */
    act(() => engine().setSpeed(1.5));
    expect(playlist.updateLockScreenMetadata).toHaveBeenCalled();
  });

  it.each([
    ['above the ceiling', 4, 2],
    ['below the floor', 0.1, 0.5],
    ['a NaN', Number.NaN, 1],
  ])('clamps %s at the store’s door', (_label, requested, expected) => {
    act(() => engine().setSpeed(requested));
    expect(engine().speed).toBe(expected);
  });

  /**
   * ⚠️ THE DOCBLOCK CLAIMS THE RATE WOULD BE "lost by the rebuild that starts every surah AND
   * every voice switch", and only the surah half was covered (story 7-4 review, P19). 7-2's
   * picker re-plays the current ayah on selection, so a reader who chooses a different reciter
   * mid-listen gets a whole new playlist — and would have got it at 1.0x.
   */
  it('survives a VOICE SWITCH, which rebuilds the playlist just as a new surah does', async () => {
    await act(async () => {
      await engine().playSurah(1);
    });
    await tick(3);
    act(() => engine().setSpeed(1.5));

    playlist = makePlaylist();
    await switchReciter('qatami');

    expect(engine().reciterId).toBe('qatami');
    expect(playlist.playbackRate).toBe(1.5);
  });

  it('does not disturb the highlight — position is MEDIA time, so the lookup is unchanged', async () => {
    await act(async () => {
      await engine().playSurah(1);
    });
    act(() => engine().setSpeed(1.5));
    // 1:3 runs 11,565–16,137ms of the file. At 1.5x the reader reaches it sooner in wall-clock
    // terms, but the manifest is keyed on the file's own clock, which is what `currentTime` is.
    await tick(12);
    expect(engine().activeVerseKey).toBe('1:3');
  });
});

describe('the sleep timer', () => {
  const MINUTE = 60_000;

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    act(() => engine().clearSleepTimer());
    jest.useRealTimers();
  });

  /** Move the WALL CLOCK without running any timer — what backgrounding looks like from here. */
  const advanceWallClock = (ms: number) => {
    jest.setSystemTime(Date.now() + ms);
  };

  const play = async () => {
    await act(async () => {
      await engine().playSurah(1);
    });
    await tick(3);
  };

  it('pauses when a duration elapses, and clears itself', async () => {
    await play();
    act(() => engine().setSleepTimer(30 * MINUTE));
    expect(engine().sleepRemainingMs).toBe(30 * MINUTE);

    advanceWallClock(30 * MINUTE + 1000);
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    expect(playlist.pause).toHaveBeenCalled();
    expect(engine().playbackState).toBe('paused');
    expect(engine().sleepDeadline).toBeNull();
    expect(engine().sleepRemainingMs).toBe(0);
  });

  /**
   * ⚠️ THE WHOLE REASON THE DEADLINE IS ABSOLUTE. A countdown ticked by the app stops counting
   * when the app is backgrounded — which is exactly when a sleep timer matters. Here NO clock
   * runs at all: only the wall clock moves, and the timer still fires on the first thing that
   * asks. MUTATION: store a remaining-ms value decremented per tick; this reddens.
   */
  it('fires on wall-clock time, not on foreground ticks', async () => {
    await play();
    act(() => engine().setSleepTimer(30 * MINUTE));

    // Twenty minutes of a backgrounded app: no intervals, no status ticks, just elapsed time.
    advanceWallClock(20 * MINUTE);
    await act(async () => {
      appStateListener?.('background');
    });
    expect(engine().playbackState).toBe('playing');

    // Eleven more, then the app comes back — past the deadline with zero ticks in between.
    advanceWallClock(11 * MINUTE);
    await act(async () => {
      appStateListener?.('active');
    });

    expect(playlist.pause).toHaveBeenCalled();
    expect(engine().sleepDeadline).toBeNull();
  });

  it('the status stream answers it too, which is what fires it under background PLAYBACK', async () => {
    // Playing in the background is the case where JS intervals are throttled but the native
    // status stream keeps arriving. No interval is run here — only a tick.
    await play();
    act(() => engine().setSleepTimer(5 * MINUTE));
    advanceWallClock(5 * MINUTE + 1);

    await tick(4);

    expect(playlist.pause).toHaveBeenCalled();
  });

  it('expiring over an ALREADY PAUSED player is a no-op that still clears the timer', async () => {
    await play();
    await act(async () => {
      await engine().pause();
    });
    const pausesBefore = playlist.pause.mock.calls.length;
    mockSetAudioPosition.mockClear();

    act(() => engine().setSleepTimer(MINUTE));
    advanceWallClock(MINUTE + 1000);
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    expect(engine().sleepDeadline).toBeNull();
    // ⚠️ NOT MERELY "no crash": `pause()` writes the listening position, so firing over a paused
    // reader would overwrite where they actually stopped with wherever the last tick landed.
    expect(playlist.pause).toHaveBeenCalledTimes(pausesBefore);
    expect(mockSetAudioPosition).not.toHaveBeenCalled();
  });

  it('cancelling clears the timer and leaves playback alone', async () => {
    await play();
    act(() => engine().setSleepTimer(30 * MINUTE));
    act(() => engine().clearSleepTimer());

    advanceWallClock(31 * MINUTE);
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });

    expect(playlist.pause).not.toHaveBeenCalled();
    expect(engine().playbackState).toBe('playing');
  });

  it('publishes the countdown once per SECOND, not once per status tick', async () => {
    await play();
    act(() => engine().setSleepTimer(2 * MINUTE));

    // Ten status ticks inside the same second: the label must not move ten times.
    const before = engine().sleepRemainingMs;
    for (let i = 0; i < 10; i++) await tick(3 + i / 100);
    expect(engine().sleepRemainingMs).toBe(before);

    advanceWallClock(1500);
    await tick(4);
    expect(engine().sleepRemainingMs).toBeLessThan(before);
  });

  /**
   * ⚠️ AT THE BOUNDARY, NOT AFTER IT. The playlist auto-advances by itself (7-1's queue), so a
   * timer that reacted to `trackChanged` would already be inside the next surah. MUTATION: move
   * the check into `onTrackChanged` alone; this reddens.
   */
  it('“end of surah” pauses BEFORE the track changes', async () => {
    await play();
    act(() => engine().setSleepTimer('surah'));
    expect(engine().sleepEndOfSurah).toBe(true);

    // The tick helper reports a 60s track; 59.6s is inside the half-second lead.
    await tick(59.6);

    expect(playlist.pause).toHaveBeenCalled();
    expect(engine().playbackState).toBe('paused');
    expect(engine().sleepEndOfSurah).toBe(false);
    // Still surah 1 — nothing advanced.
    expect(engine().surah).toBe(1);
  });

  it('“end of surah” does not fire in the middle of one', async () => {
    await play();
    act(() => engine().setSleepTimer('surah'));
    await tick(30);
    expect(playlist.pause).not.toHaveBeenCalled();
    expect(engine().sleepEndOfSurah).toBe(true);
  });

  /**
   * ⚠️ AND THE FALLBACK IS ONLY FOR A TRACK WHOSE DURATION NEVER ARRIVED (story 7-3 review, P1).
   * Every tick here reports `duration: 0`, which is what the stream does for a track that is
   * never prepared — so `onStatus` can never see the boundary coming and the track change is the
   * only thing left. The companion case below proves the OTHER half: with a duration known, a
   * track change is a deliberate move and must not pause.
   */
  it('…and still stops if the boundary is crossed anyway', async () => {
    await act(async () => {
      await engine().playSurah(1);
    });
    await tick(3, { duration: 0 });
    act(() => engine().setSleepTimer('surah'));
    await changeTrack(1);

    expect(playlist.pause).toHaveBeenCalled();
    expect(engine().sleepEndOfSurah).toBe(false);
  });

  /**
   * ⚠️ THE SKIP THIS STORY PUT ONE TAP AWAY (story 7-3 review, P1). `onStatus` already stops
   * before the boundary whenever it knows the duration, and when it has stopped there is no track
   * change to react to — so a track change that arrives with the duration KNOWN is the reader
   * moving on purpose, which since 7-3 includes the lock screen's next button. Firing the
   * fallback there paused the recitation the instant they skipped.
   *
   * MUTATION: drop the `!durationSeen` guard in `onTrackChanged`; this reddens and the case above
   * stays green.
   */
  it('a deliberate skip does NOT trip the end-of-surah timer', async () => {
    await play(); // every tick in `play` reports a 60s duration
    act(() => engine().setSleepTimer('surah'));
    playlist.pause.mockClear();

    await changeTrack(1);

    expect(playlist.pause).not.toHaveBeenCalled();
    // Still armed: the reader asked to stop at the end of a surah, and has not reached one.
    expect(engine().sleepEndOfSurah).toBe(true);
    expect(engine().surah).toBe(2);
  });

  /**
   * ⚠️ AND THE CARD STAYS ON THE SURAH THAT ACTUALLY PLAYED (story 7-3 review, P5). The fallback
   * pause leaves the native player sitting on *n+1*, and the listening position was written for
   * *n* — so announcing *n+1* would name a surah the reader explicitly asked not to enter and
   * will not resume into. The store still adopts the index; only the card does not move.
   *
   * MUTATION: drop the `announce` argument so `adoptTrack` always pushes.
   */
  it('the fallback does not advertise the surah it refused to enter', async () => {
    await act(async () => {
      await engine().playSurah(1);
    });
    await tick(12, { duration: 0 }); // 1:3
    act(() => engine().setSleepTimer('surah'));

    await changeTrack(1);

    const calls = playlist.updateLockScreenMetadata.mock.calls as [{ title?: string }][];
    expect(calls[calls.length - 1][0].title).toBe('Al-Fatihah · 3');
    // The store still follows the native player, which really is on Al-Baqarah now.
    expect(engine().surah).toBe(2);
  });

  /**
   * ⚠️ THE FINDING ALL THREE REVIEW LAYERS REPORTED (story 7-4, P1). Both sleep paths used to
   * clear the timer FIRST and then bail unless the state was exactly `playing`. `buffering` is a
   * state this very engine MANUFACTURES from any mid-playback stall — so a thirty-minute timer
   * expiring during a rebuffer was discarded in silence, the recitation played on all night, and
   * the indicator that would have said so had already been cleared. MUTATION: put the
   * `clearSleepTimer()` back above the state check; this reddens and nothing else does.
   */
  it('fires through a REBUFFER, rather than cancelling itself in silence', async () => {
    await play();
    // Into the stall, still short of the deadline.
    act(() => engine().setSleepTimer(30 * MINUTE));
    await tick(4, { playing: false, isBuffering: true });
    expect(engine().playbackState).toBe('buffering');

    advanceWallClock(30 * MINUTE + 1000);
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    expect(playlist.pause).toHaveBeenCalled();
    expect(engine().sleepDeadline).toBeNull();
  });

  /**
   * The same finding on the other path. `onStatus` runs the end-of-surah check BEFORE the block
   * that promotes the store to `playing`, so on the first ticks of a track the near-end condition
   * is routinely met while the state still reads `loading` — where the old `!== 'playing'` bail
   * dropped the timer and let the playlist roll into the next surah.
   */
  it('“end of surah” fires while the store still reads `loading`', async () => {
    // No tick yet, so `playSurah` has left the state at `loading` by design.
    await act(async () => {
      await engine().playSurah(1);
    });
    expect(engine().playbackState).toBe('loading');
    act(() => engine().setSleepTimer('surah'));

    // A first tick that is already inside the lead — a short track, or a resumed one.
    await tick(59.6, { playing: true });

    expect(playlist.pause).toHaveBeenCalled();
    expect(engine().sleepEndOfSurah).toBe(false);
  });

  /**
   * ⚠️ THE POSITION THE READER RESUMES AT (story 7-4 review, P2). `pause()` writes the listening
   * position, and `adoptTrack` has already moved the refs to surah *n+1* with no verse — so a
   * pause AFTER it saved *(n+1, 1)*: the start of the surah the reader explicitly asked not to
   * enter, and exactly where 7-7's resume drops them next launch. MUTATION: move `adoptTrack`
   * back above `fireEndOfSurah`; the "still stops" case stays green and this reddens.
   */
  it('the end-of-surah fallback saves the FINISHED surah, not the one it refused to enter', async () => {
    await act(async () => {
      await engine().playSurah(1);
    });
    // `duration: 0` throughout — the only state in which the fallback fires at all (7-3 P1).
    await tick(1, { duration: 0 });
    await tick(30, { duration: 0 });
    act(() => engine().setSleepTimer('surah'));
    mockSetAudioPosition.mockClear();

    await changeTrack(1);

    expect(playlist.pause).toHaveBeenCalled();
    const saved = mockSetAudioPosition.mock.calls.map(([row]) => row);
    expect(saved.length).toBeGreaterThan(0);
    for (const row of saved) expect(row).toMatchObject({ surah: 1 });
    // 1:6 is the ayah the last tick resolved (it runs 27,390-32,934ms) — not "surah 2, ayah 1".
    expect(saved.at(-1)).toMatchObject({ surah: 1, verse: 6 });
  });

  /**
   * ⚠️ THE COUNTDOWN'S GUARD, COUNTED (story 7-4 review, P3). The first cut asserted that
   * `sleepRemainingMs` did not MOVE across ten sub-second ticks — which is true with or without
   * the guard, because an ungated setter writes the same value. Counting the CALLS is what makes
   * the guard the subject. MUTATION: delete `if (shown !== state.sleepRemainingMs)`; this
   * reddens on the first assertion.
   */
  it('publishes the countdown ONCE per second, however many ticks land inside one', async () => {
    await play();
    const real = engine().setSleepRemaining;
    const spy = jest.fn(real);
    act(() => {
      useAudioPlayerStore.setState({ setSleepRemaining: spy });
    });
    try {
      act(() => engine().setSleepTimer(2 * MINUTE));
      spy.mockClear();

      // Ten status ticks, wall clock frozen: the displayed second cannot have moved.
      for (let i = 0; i < 10; i++) await tick(3 + i / 100);
      expect(spy).not.toHaveBeenCalled();

      // One second later, exactly one publish.
      advanceWallClock(1200);
      await tick(4);
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      act(() => {
        useAudioPlayerStore.setState({ setSleepRemaining: real });
      });
    }
  });

  /**
   * ⚠️ AN ENGINE THAT COMES UP WITH A TIMER ALREADY ARMED HAS NO CLOCK (story 7-4 review, P4).
   * The interval was started only where a deadline CHANGES, which assumed the engine outlives
   * every timer — a remount, a Fast Refresh or a re-registered effect each disprove it, and a
   * timer armed over a PAUSED recitation is exactly the case the status stream cannot cover.
   * MUTATION: start the clock only from the subscription; this reddens.
   */
  it('picks up a timer that was already armed when it mounted', async () => {
    await play();
    act(() => engine().setSleepTimer(10 * MINUTE));
    view.unmount();

    view = render(<RecitationEngineHost />);
    expect(engine().sleepDeadline).not.toBeNull();

    advanceWallClock(11 * MINUTE);
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(engine().sleepDeadline).toBeNull();
  });

  /**
   * ⚠️ AN ARMED "END OF SURAH" BELONGS TO THE SURAH IT WAS ARMED ON (story 7-4 review, P5).
   * Starting another surah silently re-pointed it at a surah the reader had just OPENED.
   */
  it('an end-of-surah timer does not follow the reader into another surah', async () => {
    await play();
    act(() => engine().setSleepTimer('surah'));

    await act(async () => {
      await engine().playSurah(36);
    });

    expect(engine().sleepEndOfSurah).toBe(false);
  });

  it('…but a TIMED timer does, because it is a promise about the clock', async () => {
    // Anti-vacuity for the case above, and the rule itself: only the surah-shaped timer is
    // surah-scoped. MUTATION: clear both kinds; this reddens.
    await play();
    act(() => engine().setSleepTimer(20 * MINUTE));
    await act(async () => {
      await engine().playSurah(36);
    });
    expect(engine().sleepDeadline).not.toBeNull();
  });

  it('a stop takes the armed timer with it', async () => {
    // ⚠️ A TIMER ARMED AGAINST A SESSION THAT NO LONGER EXISTS WOULD FIRE INTO THE NEXT ONE —
    // the inherited engine's recorded 24.20 defect. `clearPlayback` resets the sleep block; it
    // does NOT reset the speed, which is a device preference rather than session state.
    await play();
    act(() => engine().setSpeed(1.5));
    act(() => engine().setSleepTimer(30 * MINUTE));

    await act(async () => {
      await engine().stop();
    });

    expect(engine().sleepDeadline).toBeNull();
    expect(engine().sleepEndOfSurah).toBe(false);
    expect(engine().speed).toBe(1.5);
  });
});

/**
 * ⚠️ VERIFICATION, NOT CONSTRUCTION (story 7-4's last task). Continuous playback across a surah
 * boundary and the stop at An-Nas are 7-1's playlist shape — `loop: 'none'` over surahs *n…114* —
 * and this story adds nothing to them. These two cases exist so that "verified" is a thing the
 * suite says rather than a thing a story report claims.
 */
describe('continuous playback (verified, not built)', () => {
  it('rolls into the next surah with no timer armed', async () => {
    await act(async () => {
      await engine().playSurah(1);
    });
    await tick(3);
    expect(engine().sleepEndOfSurah).toBe(false);

    await changeTrack(1);

    expect(engine().surah).toBe(2);
    expect(playlist.pause).not.toHaveBeenCalled();
  });

  it('stops at the end of An-Nas instead of wrapping to Al-Fatihah', async () => {
    // 112…114, so index 2 finishing IS the end of the book. What the existing end-of-book case
    // does not say, and this one does: where the store is left. Wrapping would leave surah 1.
    await act(async () => {
      await engine().playSurah(112);
    });
    await tick(1);
    expect(createdWith.loop).toBe('none');

    await tick(46, { didJustFinish: true, index: 2, playing: false });

    expect(engine().playbackState).toBe('paused');
    expect(engine().surah).not.toBe(1);
  });
});
