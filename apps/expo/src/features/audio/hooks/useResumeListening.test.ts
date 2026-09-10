/**
 * `useResumeListening` — the cold press resumes the saved LISTENING position (story 7-7).
 *
 * ⚠️ THE `@/lib/sync` FACTORY CARRIES MORE THAN THIS HOOK CALLS, AND THAT IS NOT PADDING. The
 * clamp lives in `lib/usePosition.ts`, which imports `setReadingPosition` and `useReadingPosition`
 * from this same mocked module — so a factory naming only `useAudioPosition` is green purely
 * because nothing has invoked them yet, and becomes `undefined is not a function` the first time
 * the clamp's module touches one. A mock owes the import graph, not the call sites.
 *
 * ⚠️ THE STORE IS DRIVEN THROUGH ITS OWN API. See `useVerseSeek.test.ts`: poking `surah` and
 * `playbackState` in with `setState` pins the hook against a shape a TEST invented, so a change
 * to what `setTrack`/`setError`/`clearPlayback` actually write would sail through green. The
 * "no track" states below are the ones `useRecitationEngine` really produces — `setPlaybackState
 * ('loading')` runs BEFORE `setTrack`, and `startPlayback`'s catch calls `setError` from there.
 *
 * ⚠️ THE EXPECTED VALUES ARE LITERALS. `{2, 999}` is asserted to become `{2, 1}` rather than
 * `{2, SURAH_METADATA[1].verseCount}`-derived — computing the expectation from the tables the
 * clamp reads would restate the clamp instead of checking it.
 */

const mockAudioRow = {
  current: null as { surah: number; verse: number; reciterId: string } | null,
};

jest.mock('@/lib/sync', () => ({
  useAudioPosition: () => ({ data: mockAudioRow.current }),
  useReadingPosition: () => ({ data: null }),
  setReadingPosition: jest.fn(),
}));

import { act, renderHook } from '@testing-library/react-native';
import { useAudioPlayerStore } from '@/stores/audioPlayerStore';
import { useResumeListening } from './useResumeListening';

const store = () => useAudioPlayerStore.getState();

/** What the reader is looking at when they press — the fallback every case passes. */
const ON_SCREEN = { surah: 1, verse: 3 };

beforeEach(() => {
  mockAudioRow.current = null;
  act(() => store().clearPlayback());
});

afterEach(() => act(() => store().clearPlayback()));

describe('a cold press, with no track loaded', () => {
  it('resumes the saved listening pair rather than the verse on screen', () => {
    mockAudioRow.current = { surah: 18, verse: 23, reciterId: 'husary' };
    const { result } = renderHook(() => useResumeListening());
    expect(result.current(ON_SCREEN)).toEqual({ surah: 18, verse: 23 });
  });

  it('starts where the reader is when there is no saved row at all', () => {
    const { result } = renderHook(() => useResumeListening());
    expect(result.current(ON_SCREEN)).toEqual(ON_SCREEN);
  });

  /**
   * ⚠️ THE ROW'S RECITER IS NOT CONSULTED, and this is the case that says so. 7-2 settled it: the
   * ayah is the position, the voice is a preference — so a row written under another reciter is
   * still a true statement about where the listening got to.
   */
  it('ignores the reciter the row was written under — the ayah is the position', () => {
    mockAudioRow.current = { surah: 18, verse: 23, reciterId: 'sudais' };
    const { result } = renderHook(() => useResumeListening());
    expect(result.current(ON_SCREEN)).toEqual({ surah: 18, verse: 23 });
  });
});

describe('the row is untrusted input', () => {
  it('falls back to the on-screen position for a surah outside the book', () => {
    mockAudioRow.current = { surah: 200, verse: 1, reciterId: 'husary' };
    const { result } = renderHook(() => useResumeListening());
    // Not `{200, 1}` and not `{1, 1}` — nothing out of range may reach the engine, and a verse
    // from a surah that does not exist names nowhere to fall back to.
    expect(result.current(ON_SCREEN)).toEqual(ON_SCREEN);
  });

  it('clamps a verse the surah does not have to that surah’s first ayah', () => {
    mockAudioRow.current = { surah: 2, verse: 999, reciterId: 'husary' };
    const { result } = renderHook(() => useResumeListening());
    expect(result.current(ON_SCREEN)).toEqual({ surah: 2, verse: 1 });
  });

  it('rejects a non-integer surah rather than passing it through', () => {
    mockAudioRow.current = { surah: 2.5, verse: 1, reciterId: 'husary' };
    const { result } = renderHook(() => useResumeListening());
    expect(result.current(ON_SCREEN)).toEqual(ON_SCREEN);
  });
});

/**
 * ⚠️ "COLD" IS `surah === null` AND NOTHING ELSE — the gate, both directions. The first cut also
 * demanded `playbackState === 'idle'`, and the two no-track cases below are what that cost: an
 * offline press leaves `error` with no track, nothing but `clearPlayback` ever returns the store
 * to `idle`, and the chrome has no stop control — so the reader who reconnects and presses Retry
 * silently starts from the verse on screen, for the rest of the process.
 */
describe('what counts as a session already under way', () => {
  beforeEach(() => {
    mockAudioRow.current = { surah: 18, verse: 23, reciterId: 'husary' };
  });

  it('a FAILED press that never loaded a track is still cold — the Retry lands on the row', () => {
    const { result } = renderHook(() => useResumeListening());
    // Exactly what an offline `startPlayback` does: loading, then the catch, with no `setTrack`.
    act(() => {
      store().setPlaybackState('loading');
      store().setError('player:errors.playFailed');
    });
    expect(store().surah).toBeNull();
    expect(result.current(ON_SCREEN)).toEqual({ surah: 18, verse: 23 });
  });

  it('a press still LOADING its first track is cold too', () => {
    const { result } = renderHook(() => useResumeListening());
    act(() => store().setPlaybackState('loading'));
    expect(result.current(ON_SCREEN)).toEqual({ surah: 18, verse: 23 });
  });

  it('answers the fallback while a track is PAUSED — that is this session’s position', () => {
    const { result } = renderHook(() => useResumeListening());
    act(() => {
      store().setTrack(2, 'husary', true);
      store().setPlaybackState('paused');
    });
    // The caller's `resume()` branch owns this press; a re-read would rewind a live session to
    // wherever the LAST one stopped.
    expect(result.current(ON_SCREEN)).toEqual(ON_SCREEN);
  });

  it('answers the fallback while a track is PLAYING', () => {
    const { result } = renderHook(() => useResumeListening());
    act(() => {
      store().setTrack(2, 'husary', true);
      store().setPlaybackState('playing');
    });
    expect(result.current(ON_SCREEN)).toEqual(ON_SCREEN);
  });

  it('answers the fallback for a track that LOADED and then failed — it is still loaded', () => {
    const { result } = renderHook(() => useResumeListening());
    act(() => {
      store().setTrack(2, 'husary', true);
      store().setError('player:errors.playFailed');
    });
    expect(result.current(ON_SCREEN)).toEqual(ON_SCREEN);
  });

  /**
   * `stop()` releases the track and `clearPlayback` returns the store to its documented cold
   * state, so the next press is genuinely a cold one — and the row the stop just wrote is exactly
   * where it should land.
   */
  it('reads the row again after a STOP has released the track', () => {
    const { result } = renderHook(() => useResumeListening());
    act(() => {
      store().setTrack(2, 'husary', true);
      store().setPlaybackState('playing');
    });
    expect(result.current(ON_SCREEN)).toEqual(ON_SCREEN);
    act(() => store().clearPlayback());
    expect(result.current(ON_SCREEN)).toEqual({ surah: 18, verse: 23 });
  });
});

/**
 * The session's own verdict, which both reading surfaces read to decide whether their stop-write
 * would move the reader somewhere they never went (7-7's frozen boundary). It lives on the STORE
 * so `clearPlayback` resets it with the rest of the session — a module-level flag would have
 * outlived the session that set it and leaked into the next test, and into the next listen.
 */
describe('whether the session relocated the reader', () => {
  it('is TRUE when the saved row sent playback somewhere else', () => {
    mockAudioRow.current = { surah: 18, verse: 23, reciterId: 'husary' };
    const { result } = renderHook(() => useResumeListening());
    result.current(ON_SCREEN);
    expect(store().sessionRelocated).toBe(true);
  });

  it('is FALSE when there was no row and the press started where the reader was', () => {
    const { result } = renderHook(() => useResumeListening());
    result.current(ON_SCREEN);
    expect(store().sessionRelocated).toBe(false);
  });

  it('is FALSE when the row names the pair the reader is already on', () => {
    mockAudioRow.current = { surah: 1, verse: 3, reciterId: 'husary' };
    const { result } = renderHook(() => useResumeListening());
    result.current(ON_SCREEN);
    expect(store().sessionRelocated).toBe(false);
  });

  /** A press that continues a loaded session decides nothing, so it must not re-decide this. */
  it('survives a press made while a track is loaded', () => {
    mockAudioRow.current = { surah: 18, verse: 23, reciterId: 'husary' };
    const { result } = renderHook(() => useResumeListening());
    result.current(ON_SCREEN);
    expect(store().sessionRelocated).toBe(true);
    act(() => {
      store().setTrack(18, 'husary', true);
      store().setPlaybackState('paused');
    });
    result.current({ surah: 18, verse: 23 });
    expect(store().sessionRelocated).toBe(true);
  });
});

describe('the callback’s identity', () => {
  /**
   * ⚠️ LOAD-BEARING, NOT HYGIENE. It feeds both surfaces' `togglePlay`, which is a `useCallback`
   * handed to the chrome — a fresh identity on every playback tick would churn it. A change to
   * the ROW is a different matter: TanStack hands back a new `data` identity only when the row
   * really moves, a handful of times a session, and taking it through the deps is what keeps the
   * hook from mirroring a value into a ref during render.
   */
  it('survives a playback status change', () => {
    const { result, rerender } = renderHook(() => useResumeListening());
    const before = result.current;
    act(() => {
      store().setTrack(2, 'husary', true);
      store().setPlaybackState('playing');
    });
    rerender(undefined);
    expect(result.current).toBe(before);
  });

  it('answers the NEW row when one arrives late', () => {
    const { result, rerender } = renderHook(() => useResumeListening());
    expect(result.current(ON_SCREEN)).toEqual(ON_SCREEN);
    // A first-ever launch that then syncs from another device.
    mockAudioRow.current = { surah: 36, verse: 1, reciterId: 'husary' };
    rerender(undefined);
    expect(result.current(ON_SCREEN)).toEqual({ surah: 36, verse: 1 });
  });
});
