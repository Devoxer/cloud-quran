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

import { DEFAULT_PREFERENCES, usePreferences } from '@/lib/sync';
import { useRecitationEngine } from '../hooks/useRecitationEngine';

export function RecitationEngineHost(): null {
  const { data } = usePreferences();
  // ⚠️ `||`, not `??` — the worker's column is a 1–64 character string, so an empty one is a 422
  // the outbox drops, and it must never reach the CDN as `/audio//001.mp3` either.
  useRecitationEngine(data?.reciterId || DEFAULT_PREFERENCES.reciterId);
  return null;
}
