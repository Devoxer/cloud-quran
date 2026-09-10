/**
 * useVerseSeek — "play from, or seek to, this ayah", as ONE rule (story 7-6).
 *
 * Story 7-1 wrote this branch inline in `read.tsx`; story 7-6 gives the mushaf the same press, so
 * it moves here rather than being copied. The branch is small and its `idle`/`error` guard is the
 * kind of thing two copies drift on: `seekToVerse` is documented as a NO-OP for any surah other
 * than the loaded track, and `error` is a state a track is still loaded in — so a caller that
 * seeks without checking both leaves the reader pressing an ayah and hearing nothing.
 *
 * ⚠️ ITS BEHAVIOUR IS UNCHANGED AND ITS CALLERS ARE NOT — READ THIS BEFORE WIRING IT TO A PRESS.
 * Until story 7-8 both reading surfaces called it directly from a verse press and from a mushaf
 * word press, which is exactly how "any tap on the Quran is one tap from sound" happened: the
 * branch below STARTS playback for anything that is not the loaded track, and `error`/`idle` are
 * two of the states it starts from. Its only caller now is the chrome's `ChromeVerseRow` play
 * control, where the reader has deliberately asked for audio. A verse press SELECTS; it must
 * never reach this hook again.
 *
 * It lives in `features/audio` because this feature owns the store's semantics, and its caller
 * is `features/reading` through that feature's public barrel.
 *
 * ⚠️ THE RETURNED CALLBACK IS IDENTITY-STABLE. It was load-bearing when every `VerseRow` and
 * every `MushafPage` held one (the memo that keeps an ayah change from re-rendering all 286 rows
 * of Al-Baqarah); with a single caller it is now merely correct, and cheap to keep.
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
