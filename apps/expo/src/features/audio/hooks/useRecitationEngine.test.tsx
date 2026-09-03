/**
 * `useRecitationEngine` — the imperative half of recitation playback (story 7-1).
 *
 * The manifest LOOKUP is unit-tested in `lib/reciterManifest.test.ts`; what is covered here is
 * everything the engine does around it — the surah-track queue, the status tick, the post-seek
 * guard, the track change, and the teardown seams. A fake `AudioPlaylist` stands in for the
 * native object so the listeners can be driven a tick at a time.
 */

import { act, render } from '@testing-library/react-native';
import { createAudioPlaylist } from 'expo-audio';
import { AppState } from 'react-native';

import { useAudioPlayerStore } from '@/stores/audioPlayerStore';
import { RecitationEngineHost } from '../components/RecitationEngineHost';

const mockSetAudioPosition = jest.fn();
jest.mock('@/lib/sync', () => ({
  DEFAULT_PREFERENCES: { reciterId: 'alafasy' },
  usePreferences: () => ({ data: { reciterId: 'husary' } }),
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
/** The engine's AppState subscriber, captured so backgrounding can be driven. */
let appStateListener: ((state: string) => void) | undefined;
let createdWith: { sources: { uri: string; name: string }[]; updateInterval: number; loop: string };

function makePlaylist(): FakePlaylist {
  const listeners: Record<string, ((payload: never) => void)[]> = {};
  return {
    currentTime: 0,
    playing: false,
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
  extra: { didJustFinish?: boolean; isLoaded?: boolean; playing?: boolean; index?: number } = {}
) => {
  playlist.currentTime = seconds;
  const status = {
    id: 'test',
    currentIndex: extra.index ?? 0,
    trackCount: 3,
    currentTime: seconds,
    duration: 60,
    playing: extra.playing ?? playlist.playing,
    isBuffering: false,
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
  mockSetAudioPosition.mockClear();
  playlist = makePlaylist();
  (createAudioPlaylist as jest.Mock).mockImplementation((options: typeof createdWith) => {
    createdWith = options;
    return playlist;
  });
  act(() => {
    useAudioPlayerStore.getState().clearPlayback();
  });
  render(<RecitationEngineHost />);
});

const engine = () => useAudioPlayerStore.getState();

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
    expect(playlist.setActiveForLockScreen).toHaveBeenCalledWith(true);
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
    expect(playlist.updateLockScreenMetadata).toHaveBeenCalledTimes(2);
    expect(playlist.updateLockScreenMetadata).toHaveBeenLastCalledWith({
      title: 'Al-Fatihah · 3',
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
