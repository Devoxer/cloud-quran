/**
 * Narration voice preference (Story 22.12; language-scoped in Story 20.6) — a device-local
 * playback preference, exactly like playback speed (`usePlaybackSpeed`). Persisted to the shared
 * synchronous MMKV instance `'playback-prefs'` (key `voice_preference`); NOT InstantDB (speed
 * isn't synced cross-device either, and this avoids a schema/perms change for one local setting).
 *
 * Two surfaces:
 * - `useVoicePreference()` — reactive hook for the picker UI (re-renders on change).
 * - `getVoicePreference()` — synchronous getter for NON-hook contexts (the playback +
 *   download resolution paths, which read the current voice at resolution time). Lives in
 *   `lib/` so those `lib/` resolvers import it downward, never up into a feature.
 *
 * ⚠️ THE VOICE AXIS IS PER-LANGUAGE (Story 20.6). There is no global flagship set and no global
 * default: a stored voice is valid only within the language it belongs to, so normalization is
 * against `getVoicesForLanguage(language)` and the fallback is `getDefaultVoiceForLanguage` —
 * that language's own default, never another language's voice. ONE MMKV key still holds the
 * choice, deliberately: the voice is a per-listener *preference*, and a per-language voice memory
 * would be state nobody asked for. A voice from the previous language simply normalizes to the new
 * language's default on the next read — which is the whole mechanism, and it holds whether or not
 * anything else survives the switch (`lib/language.ts` restarts the app on one, Story 24.27).
 *
 * The language defaults to the COMMITTED language (`getLanguage()`), read at call time — same
 * contract as the voice itself, so a language change applies to the next play/download with no
 * invalidation dance. ⚠️ Committed, NOT the stored preference: Story 24.18 moved every runtime
 * reader onto `i18n.language`, so the voice can no longer resolve against a language the app has
 * not actually switched to (`lib/language.ts`'s header).
 */

import { getDefaultVoiceForLanguage, getVoicesForLanguage } from '@cloudquran/shared';
import { useMMKVString } from 'react-native-mmkv';
import { getLanguage, useLanguage } from './language';
import { createAppMMKV } from './mmkv';

/** Shared device-local playback-preferences store (same instance as usePlaybackSpeed). */
const storage = createAppMMKV('playback-prefs');

/** MMKV key for the narration voice preference. */
export const VOICE_PREFERENCE_KEY = 'voice_preference';

/** Coerce a stored value to a voice THIS LANGUAGE offers, else that language's default. */
function normalize(stored: string | undefined, language: string): string {
  const ids = getVoicesForLanguage(language).map((v) => v.id);
  return stored && ids.includes(stored) ? stored : getDefaultVoiceForLanguage(language);
}

/**
 * The listener's selected narration voice for a language (synchronous). Safe in non-hook
 * contexts — the playback/download resolvers call this at resolution time, so a voice or language
 * change applies to the NEXT play/download (matches `usePlaybackSpeed`'s once-on-apply behavior).
 */
export function getVoicePreference(language: string = getLanguage()): string {
  return normalize(storage.getString(VOICE_PREFERENCE_KEY), language);
}

/** Persist the narration voice (fire-and-forget; applies to the next play/resolution). */
export function setVoicePreference(voiceId: string): void {
  storage.set(VOICE_PREFERENCE_KEY, voiceId);
}

/**
 * Reactive narration-voice preference for the picker UI. Returns the current voice — normalized
 * against the CURRENT language, so a language switch re-renders the picker onto the new
 * language's default — and a setter.
 */
export function useVoicePreference(): { voiceId: string; setVoiceId: (id: string) => void } {
  const [stored, setStored] = useMMKVString(VOICE_PREFERENCE_KEY, storage);
  const { language } = useLanguage();
  return { voiceId: normalize(stored, language), setVoiceId: (id: string) => setStored(id) };
}
