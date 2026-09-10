/**
 * Recitation audio — the public surface of the feature (story 7-1).
 *
 * `lint:layers` rule 4: files inside this feature import each other DIRECTLY (`../hooks/…`);
 * only the outside world comes through here.
 *
 * ⚠️ THE PLAYBACK STORE IS NOT EXPORTED FROM HERE. It lives in `@/stores/audioPlayerStore`
 * because `lib/accountTeardown.ts` must reach playback to stop it on sign-out, and `lib/ →
 * features/` is a layering violation. Surfaces read the store directly, as they do for every
 * other global store.
 */

export { RecitationEngineHost } from './components/RecitationEngineHost';
// ── story 7-2: the voice surface, plus the catalogue helpers a settings row needs ──
export { buildReciterRows, ReciterPicker, type ReciterRow } from './components/ReciterPicker';
// ── story 7-8: the same picker, embedded in a sheet the chrome's player row opens ──
export { ReciterSheet, type ReciterSheetProps } from './components/ReciterSheet';
export {
  DEFAULT_RECITER_ID,
  RECITER_STYLES,
  RECITERS,
  type Reciter,
  type ReciterStyle,
  resolveReciterId,
} from './data/reciters';
// ── story 7-7: where a COLD press starts — the saved listening position, read back at last ──
export { useResumeListening } from './hooks/useResumeListening';
// ── story 7-6: the one seek-or-start rule, shared by both reading surfaces ──
export { useVerseSeek, type VerseSeek } from './hooks/useVerseSeek';
