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
export { RECITERS, type Reciter } from './data/reciters';
