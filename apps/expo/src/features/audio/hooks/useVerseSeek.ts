/**
 * useVerseSeek — "play from, or seek to, this ayah", as ONE rule (story 7-6).
 *
 * Story 7-1 wrote this branch inline in `read.tsx`; story 7-6 gives the mushaf the same press, so
 * it moves here rather than being copied. The branch is small and its `idle`/`error` guard is the
 * kind of thing two copies drift on: `seekToVerse` is documented as a NO-OP for any surah other
 * than the loaded track, and `error` is a state a track is still loaded in — so a caller that
 * seeks without checking both leaves the reader pressing an ayah and hearing nothing.
 *
 * It lives in `features/audio` because this feature owns the store's semantics, and both callers
 * are routes, so `routes → features` stays the legal direction.
 *
 * ⚠️ THE RETURNED CALLBACK IS IDENTITY-STABLE, and that is load-bearing rather than hygiene. It
 * is handed to every `VerseRow` (whose `memo` is what keeps an ayah change from re-rendering all
 * 286 rows of Al-Baqarah) and to `MushafPage` through a `useCallback`'d `renderPage` (whose
 * identity is what keeps FlashList from re-rendering every page per turn).
 *
 * ⚠️ SO IT READS THE STATUS IMPERATIVELY, AND SUBSCRIBES TO NOTHING. The volatile half — the
 * loaded surah and the playback state, which move several times per listen — is read from
 * `getState()` at PRESS time, which is the only moment it matters. Subscribing (`useRecitation
 * Status()`) would have re-rendered both reading surfaces on every status change for a hook that
 * renders nothing, and mirroring the value into a ref during render would be a render-phase side
 * effect. Only the two ACTIONS come through a hook, because the store publishes those as stable
 * references and a caller must not capture the inert pre-boot ones.
 */

import { useCallback } from 'react';
import { useAudioPlayerStore, usePlaybackControls } from '@/stores/audioPlayerStore';

/** `(surah, verse)` — always the pair the pressed thing RENDERS, never a screen's current-surah
 *  ref (6-4's review: a resync moves that ref while the old rows are still tappable). */
export type VerseSeek = (surah: number, verse: number) => void;

export function useVerseSeek(): VerseSeek {
  const { playSurah, seekToVerse } = usePlaybackControls();

  return useCallback(
    (surah: number, verse: number) => {
      // Read at press time — see the docblock for why this is not a subscription.
      const { surah: trackSurah, playbackState } = useAudioPlayerStore.getState();
      // Already the loaded track and genuinely loaded: MOVE inside it.
      if (trackSurah === surah && playbackState !== 'idle' && playbackState !== 'error') {
        void seekToVerse(verse);
        return;
      }
      // Another surah, nothing playing, or a failed track: start here.
      void playSurah(surah, verse);
    },
    [playSurah, seekToVerse]
  );
}
