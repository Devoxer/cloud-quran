/**
 * The device cache, the query client and the user-id mirror — the half of the query module that
 * does NOT touch the network (story 5-6).
 *
 * ⚠️ THIS FILE EXISTS TO BREAK A REQUIRE CYCLE, AND METRO FOUND IT AT THE FIRST DEVICE LAUNCH.
 * `lib/auth.ts` → `lib/accountTeardown.ts` (sign-out tears the device down) is a fixed chain, and
 * the teardown has to clear the outbox and the query cache. If those lived in `lib/sync.ts`, the
 * chain closed: `auth → accountTeardown → sync → api → auth`, because `lib/api.ts` reads the
 * session cookie from `lib/auth.ts`. It ran — every reference across the cycle is inside a
 * closure — but Metro warned on every bundle, and a cycle that works today is a partially-
 * initialised module away from a failure with no useful stack.
 *
 * So the split is by DEPENDENCY, not by taste: everything here reaches MMKV and
 * `@tanstack/react-query` and nothing else, so `accountTeardown` can import it without pulling
 * the worker client in behind it. `lib/sync.ts` sits on top and re-exports this surface, so a
 * feature still has exactly one module to import.
 *
 * ⚠️ THE USER ID IS MIRRORED HERE AND READ FROM HERE, NOT FROM `useSession()`. `useSession()` is
 * PENDING on a cold offline launch, so keying reads off it would make the offline-launch
 * guarantee depend on a network answer — the first-frame rule the architecture forbids breaking.
 * `app/_layout.tsx` owns the bridge that writes it.
 */

import { QueryClient } from '@tanstack/react-query';
import { useMMKVString } from 'react-native-mmkv';
import { captureException } from './errors';
import { createAppMMKV } from './mmkv';
import { outbox } from './outbox';

// ── entities, keys and the synchronous cache ─────────────────────────────────────────────────

/** The four synced entities. Sync scope is exactly this, by product decision — not a starting set. */
export type SyncEntity = 'reading-position' | 'preferences' | 'audio-position' | 'bookmarks';

/** Device-local mirror of the worker's rows. Read SYNCHRONOUSLY at render time — nothing waits. */
export const syncStore = createAppMMKV('sync-cache');

/** Where the last RESOLVED user id is mirrored. See the header for why this is not `useSession`. */
export const LAST_USER_ID_KEY = 'lastUserId';

/** `['sync', entity, userId]` — the user id is part of the key, so a session change re-keys. */
export function syncKey(entity: SyncEntity, userId: string | undefined) {
  return ['sync', entity, userId ?? null] as const;
}

type CacheEnvelope<T> = { data: T; cachedAt: number };

function cacheKey(userId: string, entity: SyncEntity): string {
  return `${userId}:${entity}`;
}

/** Read the device cache for one user+entity. Synchronous, and safe before React mounts. */
export function readCache<T>(
  userId: string | undefined,
  entity: SyncEntity
): CacheEnvelope<T> | undefined {
  if (!userId) return undefined;
  try {
    const raw = syncStore.getString(cacheKey(userId, entity));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<CacheEnvelope<T>>;
    // ⚠️ `cachedAt` IS VALIDATED, BECAUSE IT BECOMES `initialDataUpdatedAt`. A missing or
    // non-numeric one reaches TanStack as `undefined`/`NaN`, which makes the seeded data look
    // infinitely old (or infinitely fresh, depending on the comparison) and the query's staleness
    // arithmetic meaningless. An envelope we cannot date is an envelope we cannot use.
    if (!parsed || typeof parsed !== 'object' || !Number.isFinite(parsed.cachedAt))
      return undefined;
    return parsed as CacheEnvelope<T>;
  } catch (error) {
    // Tier 3: a corrupt cache entry — or a store that cannot be read at all — must never break a
    // render. The network answer replaces it. ⚠️ THE `getString` IS INSIDE THE TRY: MMKV throws on
    // an unreadable store, and this runs during render, where an exception is a redbox.
    captureException(error, { context: 'sync.readCache', entity });
    return undefined;
  }
}

/**
 * Write the device cache for one user+entity.
 *
 * ⚠️ `undefined` IS REFUSED, AND IT COULD ERASE THE ONE THING THIS MODULE EXISTS TO PROTECT.
 * `JSON.stringify({ data: undefined })` yields `{"cachedAt":…}` with no `data` key, so a fetcher
 * that somehow resolved `undefined` would replace the last-known rows with an envelope carrying
 * nothing — and the next offline cold launch would paint an empty screen where the whole point is
 * that it paints the last-known one. Refusing is strictly better than storing a hole.
 *
 * ⚠️ AND IT IS GUARDED. MMKV throws on a full or unwritable store, and every caller here is
 * either a render-path fetcher or a mutation invoked straight from a UI handler — neither has
 * anywhere to put an exception. A cache write that fails costs a refetch; an exception costs the
 * user's action.
 */
export function writeCache<T>(userId: string | undefined, entity: SyncEntity, data: T): void {
  if (!userId || data === undefined) return;
  try {
    syncStore.set(cacheKey(userId, entity), JSON.stringify({ data, cachedAt: Date.now() }));
  } catch (error) {
    captureException(error, { context: 'sync.writeCache', entity });
  }
}

/** The current user id, synchronously. `undefined` before any session has ever resolved. */
export function currentUserId(): string | undefined {
  try {
    return syncStore.getString(LAST_USER_ID_KEY) || undefined;
  } catch {
    // An unreadable store means no identity, which every caller already handles: reads stay
    // disabled and writes queue under the null key. Never a throw — this runs inside mutations.
    return undefined;
  }
}

/**
 * Mirror a RESOLVED session id. Called from the root layout's identity bridge.
 *
 * A falsy id is ignored on purpose: `useSession()` answers `null` while pending and while signed
 * out, and neither is a reason to throw away the seed an offline launch depends on. Sign-out
 * clears the whole store through `teardownAccountScopedState()` instead, which is a deliberate
 * act rather than an absence.
 */
export function setSyncUserId(userId: string | null | undefined): void {
  if (!userId) return;
  try {
    if (syncStore.getString(LAST_USER_ID_KEY) === userId) return;
    syncStore.set(LAST_USER_ID_KEY, userId);
  } catch (error) {
    // Called from a render effect in the root layout: a throw here is a redbox on boot.
    captureException(error, { context: 'sync.setSyncUserId' });
  }
}

/** Reactive read of the mirrored user id. Seeded synchronously from MMKV on the first render. */
export function useSyncUserId(): string | undefined {
  const [userId] = useMMKVString(LAST_USER_ID_KEY, syncStore);
  return userId || undefined;
}

// ── the query client ─────────────────────────────────────────────────────────────────────────

/**
 * ⚠️ `networkMode: 'online'` IS THE OFFLINE GUARANTEE, not a limitation. Offline, the query is
 * PAUSED rather than failed: `data` stays whatever `initialData` seeded from MMKV, `isError` never
 * turns true, and nothing renders an error for a state that is normal. Switching this to
 * `'always'` would make a cold offline launch produce a failed query and an error path where the
 * architecture promises cached rows.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: 'online',
      // The device cache is authoritative for the first paint; the network reconciles after. A
      // minute of staleness on a reading position is invisible, and it keeps a tab switch from
      // becoming a request.
      staleTime: 60_000,
      // `gcTime` is DELIBERATELY LEFT AT THE DEFAULT. A long one would be pure ceremony here:
      // MMKV is the cache of record, so a query garbage-collected out of memory is re-seeded
      // synchronously from `initialData` the moment something observes it again.
      retry: 2,
      refetchOnWindowFocus: true,
    },
  },
});

/**
 * Drop every trace of the current account's server state from this device.
 *
 * ⚠️ REACHED FROM `lib/accountTeardown.ts`, WHICH IS WHY IT LIVES HERE AND NOT IN `lib/sync.ts` —
 * see the cycle note at the top of this file.
 *
 * Cache keys already carry the user id, so clearing the CACHE is privacy rather than correctness.
 * The OUTBOX is the opposite: a queued entry carries no identity at all and is drained against
 * whatever session is current, which after a sign-out is the next account on this device.
 *
 * The drain's debounce and backoff timers are deliberately NOT cancelled here. They live with the
 * scheduler in `lib/sync.ts` (which cannot be imported from here), and cancelling them buys
 * nothing: a drain that fires after this finds an empty queue and makes no request.
 */
export function clearSyncState(): void {
  // Each step guarded independently, for the reason `accountTeardown` states about its own: the
  // user is LEAVING, and a failure in one clear must never strand the ones after it.
  try {
    outbox.clear();
  } catch (error) {
    captureException(error, { context: 'sync.clearSyncState.outbox' });
  }
  queryClient.clear();
  // ⚠️ THE EXPLICIT `remove` COMES FIRST, AND `clearAll()` ALONE DOES NOT REPLACE IT.
  // `useSyncUserId` is a `useMMKVString` subscriber, and MMKV notifies listeners per CHANGED KEY.
  // `clearAll()` wipes the backing store without naming any key — the repo's own mock implements
  // it with no notification at all — so a component mounted across a sign-out would keep
  // rendering with the DEPARTED user's id, and its queries would stay keyed to that account until
  // something else forced a re-render. `remove` notifies, so the mirror going away is observable.
  // No test in this repo can catch the difference (the mock is silent either way), which is
  // exactly why the ordering is written down rather than remembered.
  try {
    syncStore.remove(LAST_USER_ID_KEY);
    syncStore.clearAll();
  } catch (error) {
    captureException(error, { context: 'sync.clearSyncState.store' });
  }
}
