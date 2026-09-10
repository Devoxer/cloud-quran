/**
 * useResumeListening — the first press of a listening session resumes where the LISTENING
 * stopped (story 7-7).
 *
 * The write half of this has existed since story 7-1: the engine calls `setAudioPosition` at a
 * pause, a stop, a track change and at backgrounding, the outbox drains it, the worker stores it,
 * and another device pulls it. Nothing ever read it back — `useAudioPosition()` had zero
 * consumers — so a relaunch showed the READING position with playback idle, and the epic's
 * criterion that "where you are listening is not where you are reading" survived in one direction
 * only. This hook is the other direction, and nothing else.
 *
 * ⚠️ IT IS A RESOLVER, NOT AN EFFECT, AND THAT IS THE WHOLE DESIGN. The obvious shape — "on
 * mount, if there is a row, load it" — starts audio nobody asked for, and reading a row on mount
 * to decide what to load is a boot gate wearing a feature's clothes. The reader's PRESS is the
 * event; the row only decides WHERE that press lands. So the entire story collapses into a pure
 * function of `(row, fallback, whether a track is loaded)`, which is why the edge-case matrix is
 * testable without the engine anywhere near it.
 *
 * ⚠️ "COLD" IS `surah === null`, AND IT DELIBERATELY DOES NOT ASK ABOUT `playbackState`. The
 * first cut also required `playbackState === 'idle'`, which is wrong in both directions and the
 * wrong one is unrecoverable: `startPlayback` sets `loading` BEFORE `setTrack` and its `catch`
 * calls `setError`, so an offline cold press lands on `error` with NO track — and nothing but
 * `clearPlayback` ever returns the store to `idle`, while the chrome offers no stop control. The
 * gate would then answer the fallback for the rest of the process, so the reader who reconnects
 * and presses the error surface's Retry (`ReadingChrome` wires it straight to `onTogglePlay`)
 * silently starts at the verse on screen instead of where they stopped, for good. A store with no
 * track has nothing to continue, whatever state it is reporting, so it is cold.
 *
 * ⚠️ THE ROW'S `reciterId` IS IGNORED, DELIBERATELY. Story 7-2 settled the equivalent question
 * for a live switch: the ayah is what the reader cares about, the voice is a preference. A row
 * written under `sudais` is still a true statement about where the listening got to, so it
 * resumes in whatever voice the reader has chosen NOW. The stored reciter stays useful as
 * provenance, and a later story could offer "resume in the voice you were using" — this one does
 * not, and a caller must not reach past this hook to do it.
 *
 * ⚠️ THE ROW IS UNTRUSTED AND IS CLAMPED AS A PAIR, through `clampPosition` — the SAME clamp the
 * reading surfaces open with, not a copy. It carries three recorded half-trust defects on it (see
 * `lib/usePosition.ts`); a second copy here would be a second place for them to come back. An
 * out-of-range surah answers `null` and the press falls back to what the reader is looking at,
 * which is the honest answer: a verse number from a surah that does not exist names nowhere.
 *
 * ⚠️ IT ALSO RECORDS ONE FACT ABOUT THE SESSION IT STARTS — `sessionRelocated` on the playback
 * store, documented there. This resolver is the only place that sees both the fallback and the
 * answer, so it is the only place that can tell whether the press moved the reader.
 */

import { useCallback } from 'react';
import { useAudioPosition } from '@/lib/sync';
import { clampPosition, type VersePair } from '@/lib/usePosition';
import { useAudioPlayerStore } from '@/stores/audioPlayerStore';

/**
 * Answer where a press should start: the saved listening pair when there is a usable one and no
 * track is loaded, otherwise the `fallback` the surface offers (the on-screen verse, or the
 * settled page's first verse).
 */
type ResolveListeningStart = (fallback: VersePair) => VersePair;

export function useResumeListening(): ResolveListeningStart {
  const { data } = useAudioPosition();

  /**
   * ⚠️ THE STATUS IS READ IMPERATIVELY AND SUBSCRIBED TO BY NOTHING — `useVerseSeek`'s rule. The
   * loaded track moves several times per listen and matters only at the moment of a press, so
   * `getState()` at press time is the read; subscribing would re-render a hook that renders
   * nothing on every status change of every listen. The ROW comes through the deps rather than a
   * ref mirrored during render (which that same docblock rejects as a render-phase side effect):
   * TanStack hands back a new `data` identity only when the row actually changes, which is a
   * handful of times a session, not per tick.
   */
  return useCallback(
    (fallback: VersePair) => {
      const { surah, setSessionRelocated } = useAudioPlayerStore.getState();
      // A track is loaded, so this press continues a session rather than starting one — and the
      // session's own relocation verdict must not be overwritten by it.
      if (surah !== null) return fallback;
      const saved = clampPosition(data ? { surah: data.surah, verse: data.verse } : null);
      const start = saved ?? fallback;
      // ⚠️ RECORDED ON THE SESSION, NOT RETURNED. Both reading surfaces need to know whether this
      // recitation started where the reader was, to decide whether their stop-write would move
      // them somewhere they never went (7-7's frozen boundary). The store is where a session's
      // facts live, and `clearPlayback` resets this one with the rest of them.
      setSessionRelocated(start.surah !== fallback.surah || start.verse !== fallback.verse);
      return start;
    },
    [data]
  );
}
