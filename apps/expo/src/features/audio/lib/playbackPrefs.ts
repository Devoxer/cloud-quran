/**
 * playbackPrefs — the listening choices that belong to a DEVICE, not to an account (story 7-4).
 *
 * ⚠️ SPEED IS DEVICE-LOCAL, AND THAT IS THE SAME CALL `lib/theme.ts` MADE FOR THE PALETTE. The
 * worker's preferences row holds three theme literals and a reciter id; adding a speed column is
 * a migration, and what it would buy is syncing a value that is a per-device listening habit —
 * a phone in a car and a laptop at a desk want different rates from the same reader. There is no
 * server copy, so there is nothing for `lib/sync.ts` to own here.
 *
 * ⚠️ READ SYNCHRONOUSLY, ONCE, AT ENGINE BOOT. MMKV is synchronous on native and on the web
 * client, which is what lets the saved rate be in place BEFORE the first press rather than
 * arriving after it — the acceptance criterion is "still 1.5, before the first press". An async
 * read would be a boot gate in the one place this app refuses to have one.
 *
 * ⚠️ EVERY READ IS CLAMPED, BECAUSE STORAGE IS NOT A TYPE SYSTEM. What comes back may have been
 * written by an older build, by a different key shape, or by nothing at all. `clampSpeed` takes
 * `unknown` for exactly that reason (see its docblock) — the dangerous failure here is not a
 * throw, it is a plausible-looking rate the native player answers with silence.
 */

import { clampSpeed, SPEED_DEFAULT } from '@/constants/audio';
import { createAppMMKV } from '@/lib/mmkv';

/**
 * The device's playback preferences. A dedicated instance, like `theme`'s — and `createAppMMKV`
 * is what supplies the web-SSR no-op stub, so a module-scope instance here cannot crash the
 * static render.
 */
const storage = createAppMMKV('playback-prefs');

/** MMKV key for the playback rate. */
export const SPEED_KEY = '@cloudquran/playbackSpeed';

/**
 * The saved rate, or 1.0 when there is none — clamped to 0.5–2.0 either way.
 *
 * The `try` is not decoration: `getNumber` on a key some other build left holding a string is a
 * throw on some MMKV backends and an `undefined` on others, and a reader whose speed preference
 * cannot be read still wants their Quran to play.
 */
export function readStoredSpeed(): number {
  try {
    return clampSpeed(storage.getNumber(SPEED_KEY));
  } catch {
    return SPEED_DEFAULT;
  }
}

/**
 * Persist the rate. Fire-and-forget, and clamped on the way IN as well as on the way out — the
 * cheapest way to guarantee a value this module wrote is a value it can read back.
 *
 * ⚠️ THE ENGINE IS THE ONLY CALLER, and that is deliberate rather than incidental: it persists
 * from the store subscription, so "what is stored" and "what the player was told" cannot drift.
 * A second writer would be a way to change the saved rate without changing the audible one.
 */
export function writeStoredSpeed(speed: number): void {
  try {
    storage.set(SPEED_KEY, clampSpeed(speed));
  } catch {
    // A device that cannot persist a rate still plays at it for this session.
  }
}
