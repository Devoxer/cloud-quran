/**
 * createAppMMKV — the canonical per-domain MMKV factory for device-local storage.
 *
 * Wraps `createMMKV({ id })` with the web-SSR no-op stub every consumer needs: on the
 * static-render server (expo web `output: "static"`) there is no localStorage and
 * MMKV-web throws "Tried to access storage on the server" on any access. Detect that
 * environment and substitute an in-memory no-op store so module-init reads + `useMMKV*`
 * hooks return defaults instead of crashing.
 *
 * This is the same pattern `lib/theme.ts` and `hooks/player/usePlaybackPreferences.ts`
 * spell out inline; Story 18.1 extracts it so the AsyncStorage→MMKV migrations don't
 * each re-implement the stub. (The two pre-existing inline sites are left as-is — folding
 * them in is a no-behavior-change cleanup for a later story, not part of this migration.)
 *
 * MMKV is SYNCHRONOUS — reads return immediately (no loading state), writes are
 * fire-and-forget (`storage.set`), and `useMMKVString/Boolean/Number(key, instance)`
 * give a reactive read that re-renders on change.
 */

import { Platform } from 'react-native';
import { createMMKV, type MMKV } from 'react-native-mmkv';

// No localStorage on the web static-render server — any MMKV-web access throws there.
const isServerWeb = Platform.OS === 'web' && typeof window === 'undefined';

/** In-memory no-op MMKV used during web SSR so init + useMMKV* return defaults. */
function createServerStub(): MMKV {
  return {
    getString: () => undefined,
    getBoolean: () => undefined,
    getNumber: () => undefined,
    contains: () => false,
    getAllKeys: () => [],
    set: () => {},
    delete: () => {},
    remove: () => {}, // real MMKV uses `remove`; useMMKV*'s clear path calls it
    clearAll: () => {},
    addOnValueChangedListener: () => ({ remove: () => {} }),
  } as unknown as MMKV;
}

/**
 * A dedicated MMKV instance for the given domain `id`. Synchronous on native and the web
 * client (localStorage-backed); a no-op stub during web SSR. Instances sharing an `id`
 * back the same store, so folding related prefs under one `id` (e.g. `'playback-prefs'`)
 * is intentional.
 */
export function createAppMMKV(id: string): MMKV {
  return isServerWeb ? createServerStub() : createMMKV({ id });
}
