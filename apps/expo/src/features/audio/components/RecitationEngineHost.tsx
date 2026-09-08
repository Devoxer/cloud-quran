/**
 * RecitationEngineHost — mounts the recitation engine, renders nothing (story 7-1).
 *
 * ⚠️ A NULL-RENDERING SIBLING, NOT A PROVIDER WRAPPED AROUND THE APP. The engine's effect
 * subscribes to a 100ms status stream; hosting it in a component that renders children would put
 * that stream upstream of the whole navigation tree. Rendering `null` keeps every re-render this
 * host could ever have to itself — and it has none, because the engine holds only refs.
 *
 * ⚠️ AND IT MUST NEVER GATE THE FIRST FRAME. It reads the reader's reciter preference, which is
 * seeded synchronously from MMKV and falls back to the shipped default, so there is no await and
 * nothing to wait for. `root-layout-boot.test.tsx` scans the root layout for exactly this shape.
 */

import { usePreferences } from '@/lib/sync';
import { resolveReciterId } from '../data/reciters';
import { useRecitationEngine } from '../hooks/useRecitationEngine';

export function RecitationEngineHost(): null {
  const { data } = usePreferences();
  /**
   * ⚠️ RESOLVED, NOT MERELY DEFAULTED (story 7-2). This used to be
   * `data?.reciterId || DEFAULT_PREFERENCES.reciterId`, which covers the empty string and nothing
   * else — so a row holding `'nope'` (another device, an older build, a withdrawn voice) went
   * straight to the CDN as `/audio/nope/manifest.json` and the reader got fifteen seconds of
   * loading followed by an error, on every press, for as long as the row said so.
   * `resolveReciterId` answers membership of the catalogue instead of truthiness.
   */
  useRecitationEngine(resolveReciterId(data?.reciterId));
  return null;
}
