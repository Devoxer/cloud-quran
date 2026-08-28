/**
 * THE QUERY MODULE — every worker read and every worker write goes through here (story 5-6).
 *
 * ⚠️ THIS IS THE ONLY MODULE ALLOWED TO IMPORT `@/lib/api`, and `lint:layers` RULE 7 enforces it
 * (fail-closed: if this file stops importing it, the gate reports a vacuous chokepoint rather than
 * passing). Rule 6 already stopped a SECOND `hc()` being minted, but its own self-test blessed a
 * feature calling `api.health.$get()` directly — so between 5-4 and this story, a component
 * reaching `api.sync[...]` raw, with no cache, no debounce and no outbox, was green on every gate.
 * That is the hole this module plus rule 7 close.
 *
 * ── The three rules this file exists to hold ─────────────────────────────────────────────────
 *
 * 1. **NOTHING GATES FIRST PAINT.** Reads are seeded SYNCHRONOUSLY from MMKV via `initialData`,
 *    so an offline cold launch paints last-known state on the FIRST render — no spinner, no
 *    `isRestoring`, no boolean derived from a remote answer. This is why there is no
 *    `@tanstack/react-query-persist-client`: its restore is asynchronous and hands you a gate
 *    wearing a different name. MMKV is synchronous, so `initialData` + `initialDataUpdatedAt`
 *    read straight out of it at render time and the query reconciles on its own schedule.
 *
 * 2. **EVERY MUTATION INVALIDATES EXPLICITLY.** That is the one thing the retired reactive
 *    database did for free. `INVALIDATED_BY` maps each queued write to the query it makes stale,
 *    and the drain invalidates on success — the moment the server actually has new state.
 *
 * 3. **WRITES NEVER CALL THE API.** They update the local cache and land in the durable outbox,
 *    which coalesces, debounces and drains. The worker's per-user ceiling is the line that cannot
 *    be broken from outside; the debounce below is the line that must not break.
 *
 * ── Keys carry the user id, so a session change needs no invalidation ────────────────────────
 *
 * Query keys are `['sync', entity, userId]` and MMKV keys are `${userId}:${entity}`. The previous
 * user's rows are simply a different key — they cannot be served to the next account by accident,
 * which is stronger than remembering to clear. Sign-out clears anyway, for privacy rather than
 * correctness (`lib/accountTeardown.ts`).
 *
 * ⚠️ THE USER ID IS MIRRORED INTO MMKV AND READ FROM THERE, NOT FROM `useSession()`, because
 * `useSession()` is PENDING on a cold offline launch and keying reads off it would make the
 * offline-launch guarantee depend on a network answer — the exact thing rule 1 forbids.
 * `app/_layout.tsx` owns the bridge that writes it; the mirror itself lives in `./syncCache`.
 *
 * ⚠️ THE CACHE HALF PHYSICALLY LIVES IN `./syncCache`, AND METRO IS WHY. `lib/auth.ts` →
 * `lib/accountTeardown.ts` is fixed (sign-out tears the device down) and the teardown must clear
 * the outbox and the query cache — so with those here the chain closed:
 * `auth → accountTeardown → sync → api → auth`, since `lib/api.ts` reads the session cookie from
 * `lib/auth.ts`. Metro warned on the first device launch of this story. The split is by
 * DEPENDENCY, not by taste, and this module re-exports the whole surface so a feature still has
 * exactly one thing to import.
 */

import NetInfo from '@react-native-community/netinfo';
import { focusManager, onlineManager, useQuery } from '@tanstack/react-query';
import { AppState } from 'react-native';
import { api } from './api';
import { addBreadcrumb, captureException } from './errors';
import type { DrainResult, OutboxEntry, OutboxKind, OutboxVerdict } from './outbox';
import { outbox } from './outbox';
import { isSyncEnabled, useSyncEnabled } from './privacyPrefs';
import type { DocumentDelivery } from './sharing';
import { saveDocument } from './sharing';
import type { SyncEntity } from './syncCache';
import {
  currentUserId,
  queryClient,
  readCache,
  syncKey,
  useSyncUserId,
  writeCache,
} from './syncCache';

export type { SyncEntity } from './syncCache';
/**
 * ⚠️ THE RE-EXPORT IS THE PUBLIC SURFACE, AND IT USED TO RE-OPEN THE DOOR RULE 7 HAD JUST CLOSED.
 * It forwarded everything `./syncCache` exports — `syncStore`, `readCache`, `writeCache`,
 * `LAST_USER_ID_KEY` — so a feature could import them from `@/lib/sync`, read and write server
 * state with no hook, no outbox entry and no invalidation, and be COMPLIANT BY CONSTRUCTION: the
 * gate forbids importing `@/lib/syncCache`, and this list handed the same functions out under a
 * blessed name.
 *
 * What a caller legitimately needs is here; the storage primitives are not. They stay reachable
 * only from `./syncCache`, whose importers rule 7 pins to this module and the account teardown.
 * `readCache`/`writeCache` are still used INSIDE this file — that is the point, they are how the
 * hooks seed and reconcile.
 */
export {
  clearSyncState,
  currentUserId,
  queryClient,
  setSyncUserId,
  syncKey,
  useSyncUserId,
} from './syncCache';

// ── reads ────────────────────────────────────────────────────────────────────────────────────

/** Unwrap the worker's `{ ok, ... }` envelope, or throw so the query retries. */
function unwrap<T extends { ok: boolean }>(body: T, entity: SyncEntity): Extract<T, { ok: true }> {
  if (!body.ok) {
    const error = (body as { error?: string }).error ?? 'unknown';
    throw new Error(`sync: ${entity} read refused (${error})`);
  }
  return body as Extract<T, { ok: true }>;
}

/**
 * ⚠️ EVERY FETCHER TAKES THE QUERY'S `AbortSignal`, AND IT IS NOT AN OPTIMISATION. TanStack hands
 * one to `queryFn`, and it is the only way `purgeMyData` can stop an in-flight read from writing
 * the rows it just destroyed back into MMKV: without a real abort, `cancelQueries` merely makes
 * TanStack IGNORE the answer, while the fetcher body — including its `writeCache` — still runs.
 */
async function fetchReadingPosition(userId: string | undefined, signal?: AbortSignal) {
  const res = await api.api.sync['reading-position'].$get(undefined, { init: { signal } });
  const value = unwrap(await res.json(), 'reading-position').position;
  writeCache(userId, 'reading-position', value);
  return value;
}

async function fetchPreferences(userId: string | undefined, signal?: AbortSignal) {
  const res = await api.api.sync.preferences.$get(undefined, { init: { signal } });
  const value = unwrap(await res.json(), 'preferences').preferences;
  writeCache(userId, 'preferences', value);
  return value;
}

async function fetchAudioPosition(userId: string | undefined, signal?: AbortSignal) {
  const res = await api.api.sync['audio-position'].$get(undefined, { init: { signal } });
  const value = unwrap(await res.json(), 'audio-position').audioPosition;
  writeCache(userId, 'audio-position', value);
  return value;
}

async function fetchBookmarks(userId: string | undefined, signal?: AbortSignal) {
  const res = await api.api.sync.bookmarks.$get(undefined, { init: { signal } });
  const value = unwrap(await res.json(), 'bookmarks').bookmarks;
  writeCache(userId, 'bookmarks', value);
  return value;
}

/**
 * ⚠️ THE `| null` IS ADDED BACK BY HAND, AND IT IS NOT COSMETIC. The worker's three single-row
 * getters are typed `Promise<Row | null>` — a user who has never written has no row — but Hono's
 * RPC response inference drops the `null` out of the union, so the client type claims a row is
 * always there. A reader with no saved position would then be a `undefined.surah` at runtime with
 * a green typecheck. Re-widen here, once, rather than at every call site.
 */
export type ReadingPosition = Awaited<ReturnType<typeof fetchReadingPosition>> | null;
export type Preferences = Awaited<ReturnType<typeof fetchPreferences>> | null;
export type AudioPosition = Awaited<ReturnType<typeof fetchAudioPosition>> | null;
export type Bookmarks = Awaited<ReturnType<typeof fetchBookmarks>>;
export type Bookmark = Bookmarks[number];

/**
 * The shared read shape. `initialData` comes out of MMKV synchronously, so the FIRST render of an
 * offline cold launch already has the rows — there is no loading state to gate on and none is
 * offered. `enabled` is off until an identity exists, because every synced route is user-scoped
 * and an anonymous call would only ever 401.
 */
function useSyncQuery<T>(
  entity: SyncEntity,
  fetcher: (userId: string | undefined, signal?: AbortSignal) => Promise<T>
) {
  const userId = useSyncUserId();
  // ⚠️ THE OPT-OUT IS A READ GATE TOO, NOT ONLY A WRITE ONE. A reader who turned sync off and
  // then opened a screen mounting one of these hooks would still send an authenticated GET for
  // their rows — which is the same false promise the deleted consent screen made. `initialData`
  // keeps working either way: a disabled query still paints the device cache, so turning sync off
  // changes what LEAVES the device and nothing about what the reader sees.
  const [syncEnabled] = useSyncEnabled();
  const cached = readCache<T>(userId, entity);
  return useQuery({
    queryKey: syncKey(entity, userId),
    queryFn: ({ signal }) => fetcher(userId, signal),
    enabled: Boolean(userId) && syncEnabled,
    initialData: cached?.data,
    initialDataUpdatedAt: cached?.cachedAt,
  });
}

export function useReadingPosition() {
  return useSyncQuery<ReadingPosition>('reading-position', fetchReadingPosition);
}

export function usePreferences() {
  return useSyncQuery<Preferences>('preferences', fetchPreferences);
}

export function useAudioPosition() {
  return useSyncQuery<AudioPosition>('audio-position', fetchAudioPosition);
}

export function useBookmarks() {
  return useSyncQuery<Bookmarks>('bookmarks', fetchBookmarks);
}

/**
 * Pull all four entities into the device cache once, as soon as an identity resolves.
 *
 * ⚠️ WITHOUT THIS, THE DEVICE CACHE ONLY CONVERGES WHERE A SCREEN HAPPENS TO BE OPEN. The query
 * cache lives for one process; MMKV is what survives. A reader who launches, reads offline and
 * never opens the surface that mounts `useBookmarks` would never learn about the bookmark their
 * other device made — the row is on the server and nothing on this device ever asks for it. A
 * launch-time refresh makes the local copy converge regardless of where the user navigates, which
 * is what "the server is a durable copy" has to mean for a local-first reader.
 *
 * ⚠️ FIRE-AND-FORGET, AND IT GATES NOTHING. Offline it simply pauses (`networkMode: 'online'`) and
 * resumes on reconnect; `prefetchQuery` never rejects. Four GETs per launch, rows READ not
 * written, so it costs nothing against the per-user write ceiling.
 */
export function prefetchSyncReads(): void {
  // ⚠️ THE OPT-OUT IS CHECKED HERE, NOT IN THE SCREEN THAT DRAWS THE SWITCH, BECAUSE THIS IS WHERE
  // SYNC ACTUALLY HAPPENS. `SyncIdentityBridge` calls this for ANY resolved session, including the
  // anonymous guest minted at boot — so this call is the first thing that ever leaves the device,
  // and a control that did not stop it would be a label rather than a setting. (That is precisely
  // what the deleted consent screen was: it gated a NAVIGATION while these four GETs went out for
  // every guest, unasked.)
  if (!isSyncEnabled()) return;
  const userId = currentUserId();
  if (!userId) return;
  const pull = <T>(
    entity: SyncEntity,
    fetcher: (id: string | undefined, signal?: AbortSignal) => Promise<T>
  ) => {
    void queryClient
      .prefetchQuery({
        queryKey: syncKey(entity, userId),
        queryFn: ({ signal }) => fetcher(userId, signal),
      })
      // `prefetchQuery` swallows its own failures, but the call site is what survives a refactor
      // of the callee — and a rejected boot promise is a redbox on a cold, offline start.
      .catch(() => {});
  };
  // Unrolled rather than looped over a table: the four fetchers return four different shapes, and
  // a table of them widens every one of them to `unknown` at the call site.
  pull('reading-position', fetchReadingPosition);
  pull('preferences', fetchPreferences);
  pull('audio-position', fetchAudioPosition);
  pull('bookmarks', fetchBookmarks);
}

// ── the drain: entry → request → verdict ─────────────────────────────────────────────────────

/**
 * Status → verdict. The whole retry policy, in one readable place.
 *
 * ⚠️ `{ ok: true, applied: false }` IS A SUCCESS. An LWW no-op and a clock skew are
 * indistinguishable from here, so retrying one spins forever. The worker already tells us it
 * changed nothing and charged nothing.
 *
 * ⚠️ **EVERY 4xx DROPS, NOT JUST THE THREE THIS APP EXPECTS.** This listed `409/422/413` and let
 * everything else fall through to `retry` — which meant the worker's own `notFound` handler
 * (a plain 404 on any path this client gets wrong, or any route a later deploy removes) produced
 * an entry that could never succeed and was never dropped. `drain` stops on the FIRST `retry`, so
 * one such entry blocks every later write on that device permanently, reporting nothing but a
 * breadcrumb. A 4xx is the server saying "this request is wrong"; repeating it verbatim cannot
 * make it right. The two exceptions are the ones where the request is fine and the CONTEXT is not:
 *   • `401` — no session yet. Anonymous-first means this is normal on a cold start, not an error.
 *   • `408` — the server timed out reading the request; the same body may well land next time.
 * `429` is neither: it is the per-user daily ceiling, and it stops the WHOLE drain rather than
 * dropping one entry (the next entry would be refused too). `createBookmark`'s untargeted
 * `onConflictDoNothing()` 409 (see `deferred-work.md`) is the concrete case that made the drop
 * rule necessary in the first place.
 */
export function verdictForStatus(status: number): OutboxVerdict {
  // ⚠️ AN ABSENT OR NON-FINITE STATUS IS A DEFECT, NOT A NETWORK BLIP. Every comparison below is
  // false for `NaN`/`undefined`, so the old fall-through answered `retry` — and since `drain`
  // stops on the first `retry`, a single such entry blocked the queue permanently. Nothing here
  // can send it, so it goes; the tier-1 capture at the drop site is what makes it visible.
  if (!Number.isFinite(status)) return 'drop';
  if (status >= 200 && status < 300) return 'sent';
  // ⚠️ 3xx TOO. A redirect this client does not follow is not a transient failure — repeating the
  // same request gets the same redirect, forever. It falls in the same bucket as a 4xx.
  if (status >= 300 && status < 400) return 'drop';
  if (status === 429) return 'halt';
  if (status === 401 || status === 408) return 'retry';
  if (status >= 400 && status < 500) return 'drop';
  // 5xx and anything else: the server broke, not the request. Keep it and try again later.
  return 'retry';
}

/**
 * Which query each queued write makes stale. ⚠️ THIS MAP IS THE EXPLICIT INVALIDATION the
 * architecture requires — deleting an entry from it means a successful write leaves the reader
 * looking at pre-write state until the next refetch, and `sync.test.ts` reddens for each one.
 */
const INVALIDATED_BY: Record<OutboxKind, SyncEntity> = {
  'reading-position': 'reading-position',
  preferences: 'preferences',
  'audio-position': 'audio-position',
  'bookmark-create': 'bookmarks',
  'bookmark-delete': 'bookmarks',
};

/** Send one queued entry. The ONLY place an outbox entry becomes an HTTP request. */
export async function send(entry: OutboxEntry): Promise<OutboxVerdict> {
  try {
    let status: number;
    switch (entry.kind) {
      case 'reading-position':
        status = (await api.api.sync['reading-position'].$put({ json: entry.body })).status;
        break;
      case 'preferences':
        status = (await api.api.sync.preferences.$put({ json: entry.body })).status;
        break;
      case 'audio-position':
        status = (await api.api.sync['audio-position'].$put({ json: entry.body })).status;
        break;
      case 'bookmark-create':
        status = (await api.api.sync.bookmarks.$post({ json: entry.body })).status;
        break;
      case 'bookmark-delete':
        status = (await api.api.sync.bookmarks[':id'].$delete({ param: { id: entry.id } })).status;
        break;
      default:
        // ⚠️ THE QUEUE OUTLIVES THE BUILD THAT WROTE IT. This switch is exhaustive over TODAY'S
        // union, so TypeScript is satisfied — but MMKV is durable across app updates, and an
        // entry whose `kind` a later build no longer knows fell out of the switch with `status`
        // unassigned. That reached `verdictForStatus(undefined)` → `retry`, and since `drain`
        // stops on the first `retry`, one stale entry wedged every later write forever. There is
        // nothing to send it to, so it goes.
        captureException(new Error('sync: dropped an outbox entry of an unknown kind'), {
          operation: 'sync.send',
          kind: String((entry as { kind?: unknown }).kind),
        });
        return 'drop';
    }
    const verdict = verdictForStatus(status);
    if (verdict === 'drop') {
      // ⚠️ LOSING A USER'S WRITE IS AN ACTIONABLE DEFECT, AND A BREADCRUMB DOES NOT REPORT IT.
      // Sentry is opt-IN and off by default, and a breadcrumb only ships attached to a LATER
      // captured exception — so a discarded bookmark was invisible to the reader (the row is
      // still on screen) and to us (nothing is ever sent). Tier 1: the server permanently refused
      // something the user asked for, which is exactly the class this policy exists to surface.
      captureException(new Error(`sync: dropped a ${entry.kind} the worker refused`), {
        operation: 'sync.send',
        kind: entry.kind,
        key: entry.key,
        status,
      });
    }
    // ⚠️ INVALIDATE ON `drop` AS WELL AS ON `sent`, and the reason is the optimistic row. A
    // dropped write leaves the local cache holding state the server has permanently refused —
    // and because that cache is MMKV, it survives cold launches, so the reader keeps seeing a
    // bookmark that does not exist until something else happens to refetch. The invalidation is
    // what replaces it with the truth.
    if (verdict === 'sent' || verdict === 'drop') {
      // At the only honest moment: the server's state and the cache's have diverged, either
      // because the write landed or because it never will. Invalidating at enqueue time would
      // invalidate against the pre-write server.
      queryClient.invalidateQueries({
        queryKey: syncKey(INVALIDATED_BY[entry.kind], currentUserId()),
      });
    }
    return verdict;
  } catch (error) {
    // Tier 2: a transport failure while offline is device state, not a defect. A breadcrumb only —
    // the entry stays queued and the next trigger retries it.
    addBreadcrumb('http', 'sync: drain request failed, entry kept', {
      kind: entry.kind,
      message: error instanceof Error ? error.message : String(error),
    });
    return 'retry';
  }
}

// ── drain scheduling ─────────────────────────────────────────────────────────────────────────

/**
 * ⚠️ THE DEBOUNCE IS THE WRITE BUDGET'S FIRST LINE. Trailing-only, deliberately: while writes keep
 * arriving the outbox coalesces them into ONE entry, so a burst of fifty position ticks costs a
 * single request once the burst ends. The worker's ceiling is 2,000 applied writes/user/day and a
 * render-storm defect in a sibling app once produced a write per scroll tick — read the epic
 * context's write-budget bullet before shortening this.
 */
export const DRAIN_DEBOUNCE_MS = 2_000;

/**
 * ⚠️ THE CEILING ON THE DEBOUNCE, AND WITHOUT IT THE DEBOUNCE NEVER FIRES FOR THE APP'S MAIN
 * WRITE PATTERN. A trailing window restarts on every write, so a reader moving through verses —
 * a position write every few hundred milliseconds, which is exactly what this app does — pushes
 * the drain out indefinitely and the whole session lives only in MMKV until they stop reading. A
 * crash or a force-quit then loses it. This bounds how long a queued write can sit behind an
 * unbroken burst; coalescing still means the burst costs ONE request when it does drain.
 *
 * ⚠️ AND IT IS THIS CONSTANT, NOT THE DEBOUNCE, THAT BOUNDS THE SUSTAINED WRITE RATE — so it owes
 * the reader the same arithmetic `DRAIN_DEBOUNCE_MS` demands. Under an unbroken burst the debounce
 * never fires, so the ceiling is the only thing that does: **one request per 15s per entity**, or
 * 240/hour. Against the worker's 2,000 applied writes/user/day that is ~8.3 hours of continuous
 * writing before one entity alone exhausts the ceiling — and a real reader is nowhere near
 * continuous, because a position write needs a verse change. Halving this doubles the worst-case
 * rate; read the epic context's write-budget bullet, which is where the 2,000 came from, before
 * doing that. Raising it instead trades budget for how much a crash can lose.
 */
export const DRAIN_MAX_WAIT_MS = 15_000;

/**
 * How long to wait after the per-user daily ceiling refuses a write.
 *
 * ⚠️ THIS IS A RE-CHECK CADENCE, NOT A WAIT-OUT — the earlier comment here argued that the
 * ceiling is a UTC-day bucket "so there is nothing to gain from retrying sooner" and then set
 * fifteen minutes, which is neither a day nor an argument for fifteen minutes. The device does
 * not know how close the UTC day is to rolling over, and the ceiling is a COST guard whose
 * counter is deliberately approximate (`write-guard.ts` accepts undercounting), so the honest
 * design is to re-check periodically and cheaply rather than sleep until an imagined midnight.
 * Fifteen minutes is one wasted request per quarter hour in the worst case, against a queue that
 * resumes within a quarter hour of the day rolling over.
 */
export const CEILING_BACKOFF_MS = 15 * 60 * 1_000;

/**
 * How long to wait after a drain that left work behind for any reason other than the ceiling — a
 * `retry` verdict, or the mid-drain enqueue the outbox deliberately defers to the next pass.
 *
 * ⚠️ WITHOUT THIS RE-ARM A PARTIAL DRAIN SCHEDULES NOTHING. `drainNow` only re-armed on `halted`,
 * so a single 401 on a cold start — the ordinary case, since the session arrives after the first
 * write can — left the queue sitting until the network flipped or the user backgrounded the app.
 * The queue is durable, so nothing is lost; it just never leaves.
 */
export const RETRY_BACKOFF_MS = 30 * 1_000;

let debounceTimer: ReturnType<typeof setTimeout> | undefined;
let backoffTimer: ReturnType<typeof setTimeout> | undefined;
/** When the current debounce window opened — the `DRAIN_MAX_WAIT_MS` ceiling measures from here. */
let windowOpenedAt: number | undefined;

/**
 * Cancel a pending debounced drain and any ceiling backoff.
 *
 * ⚠️ `clearSyncState()` DELIBERATELY DOES NOT CALL THIS — it lives in `./syncCache`, which cannot
 * reach the scheduler (see the cycle note in this file's header), and it does not need to: a
 * drain that fires over an emptied queue makes no request. What DOES need it is the root layout's
 * unmount, below — leaving a timer holding a drain past the tree that scheduled it is the shape
 * that makes a test suite flaky and a fast-refresh cycle send a write twice.
 */
export function cancelScheduledDrains(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  if (backoffTimer) clearTimeout(backoffTimer);
  debounceTimer = undefined;
  backoffTimer = undefined;
  windowOpenedAt = undefined;
  ceilingBackoffUntil = 0;
}

/** Arm the single backoff timer, replacing whatever was pending. */
function armBackoff(delayMs: number): void {
  if (backoffTimer) clearTimeout(backoffTimer);
  backoffTimer = setTimeout(() => {
    backoffTimer = undefined;
    ceilingBackoffUntil = 0;
    void drainNow();
  }, delayMs);
}

/**
 * ⚠️ THE WRITE PATH HAD NO EQUIVALENT OF `networkMode: 'online'`, AND IT COST A REQUEST EVERY
 * THIRTY SECONDS FOREVER. Reads pause themselves when the device is offline; the drain simply
 * fired — at startup, and then on every `RETRY_BACKOFF_MS` re-arm, because a doomed request
 * leaves `remaining > 0` and re-arms again. On a device in a tunnel that is a failing request
 * twice a minute for the life of the process, with a Sentry breadcrumb each time. The online
 * subscription in `startSyncManagers` is what resumes the drain; nothing else needs to poll.
 *
 * ⚠️ UNKNOWN IS NOT OFFLINE. `onlineManager` starts optimistic and `isInternetReachable` is
 * `null` until its probe finishes, so this asks only whether we are DEFINITELY offline.
 */
function canDrain(): boolean {
  return onlineManager.isOnline();
}

/**
 * When the daily-write-ceiling backoff expires, as an epoch ms. `0` when none is armed.
 *
 * ⚠️ A WRITE DURING THE BACKOFF USED TO DEFEAT IT. `scheduleDrain` did not consult the armed 429
 * timer, so the reader's next position change fired a drain straight back into the ceiling and
 * collected another 429 — the backoff bounded nothing at all while the user kept reading, which
 * is exactly when the ceiling gets hit.
 */
let ceilingBackoffUntil = 0;

/**
 * Drain now, and re-arm rather than go quiet if anything is left behind.
 *
 * ⚠️ A DRAIN THAT LEAVES WORK BEHIND MUST SCHEDULE ITS OWN NEXT ATTEMPT. This re-armed only on
 * `halted`, so every other reason for a non-empty queue — a `retry` verdict, or the entry the
 * outbox defers when an enqueue lands mid-drain — waited on an unrelated event (a network flip,
 * a foreground) that might never come in that session.
 */
export async function drainNow(): Promise<void> {
  // ⚠️ THE OPT-OUT, ON THE WRITE HALF. Every path to the network from the outbox goes through this
  // one function — the debounce, the backoff timers, the reconnect and foreground subscriptions,
  // and the startup drain — so this single check is what makes "stop syncing" true rather than
  // decorative. Entries are NOT discarded: the queue is durable and capped, and it drains if the
  // reader turns sync back on. Writes still land in the local cache; they simply stay there.
  if (!isSyncEnabled()) return;
  // Offline, or serving out a ceiling backoff: there is nothing this call could achieve, and the
  // events that CAN change that (a reconnect, the backoff timer) already trigger a drain.
  if (!canDrain() || Date.now() < ceilingBackoffUntil) return;
  let result: DrainResult;
  try {
    result = await outbox.drain(send);
  } catch (error) {
    // ⚠️ THE DRAIN IS CALLED FROM TIMERS AND FROM MANAGER CALLBACKS, WHERE A REJECTION HAS NO
    // OWNER. `outbox.drain` reads and writes MMKV, which can throw on a full or unwritable store,
    // and an unhandled rejection on a boot path is a redbox on a cold start. Tier 1: a queue we
    // cannot read is a real defect, and the entries are still on disk for the next attempt.
    captureException(error, { operation: 'sync.drainNow' });
    return;
  }
  if (result.halted) {
    addBreadcrumb('http', 'sync: drain halted on the daily write ceiling', {
      remaining: result.remaining,
    });
    ceilingBackoffUntil = Date.now() + CEILING_BACKOFF_MS;
    armBackoff(CEILING_BACKOFF_MS);
    return;
  }
  if (result.remaining > 0) armBackoff(RETRY_BACKOFF_MS);
}

/**
 * Queue a drain after the debounce window, restarting the window on each new write — but never
 * past `DRAIN_MAX_WAIT_MS` from when the window first opened. See that constant for why the
 * ceiling is load-bearing rather than defensive.
 */
export function scheduleDrain(): void {
  const now = Date.now();
  // A write made during the ceiling backoff must not re-fire a drain into it. The armed timer is
  // what resumes; the write is durable until then.
  if (now < ceilingBackoffUntil) return;
  if (windowOpenedAt === undefined) windowOpenedAt = now;
  if (now - windowOpenedAt >= DRAIN_MAX_WAIT_MS) {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = undefined;
    windowOpenedAt = undefined;
    void drainNow();
    return;
  }
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = undefined;
    windowOpenedAt = undefined;
    void drainNow();
  }, DRAIN_DEBOUNCE_MS);
}

/**
 * Wire TanStack's online/focus managers to the platform and drain on either signal.
 *
 * ⚠️ CALLED FROM AN EFFECT IN `app/_layout.tsx`, NOT AT MODULE SCOPE. A network listener created
 * at import time leaks a live handle into every Jest suite that requires this module — the runner
 * force-exits and warns — and an effect nobody mounts is inert. Returns its own teardown.
 */
export function startSyncManagers(): () => void {
  onlineManager.setEventListener((setOnline) => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      // ⚠️ REACHABILITY, NOT JUST ATTACHMENT — and `lib/connectivity.ts`'s docblock says so in
      // this same change. This read `Boolean(state.isConnected)` alone, which reports a
      // captive-portal wifi as online: every queued write is then sent into a portal that answers
      // the login page, and the query layer un-pauses for a network that cannot reach the worker.
      // ⚠️ `null` IS UNKNOWN, NOT OFFLINE. `isInternetReachable` is `null` until the probe
      // finishes, and treating that as offline would pause every query for the first seconds of
      // every launch. Only an explicit `false` on either flag means offline.
      setOnline(state.isConnected !== false && state.isInternetReachable !== false);
    });
    return unsubscribe;
  });
  focusManager.setEventListener((handleFocus) => {
    const subscription = AppState.addEventListener('change', (status) => {
      handleFocus(status === 'active');
    });
    return () => subscription.remove();
  });

  // Reconnect and foreground are the two moments a queued write can suddenly land. Both drain
  // IMMEDIATELY rather than through the debounce: the writes are already old.
  const unsubscribeOnline = onlineManager.subscribe((online) => {
    if (online) void drainNow();
  });
  const unsubscribeFocus = focusManager.subscribe((focused) => {
    if (focused) void drainNow();
  });

  // ⚠️ DRAIN ONCE AT STARTUP, BECAUSE BOTH SUBSCRIPTIONS ABOVE FIRE ONLY ON *CHANGE*. NetInfo's
  // first emit on a device that is already online is not a change, and `AppState` emits nothing
  // when you subscribe while the app is already active — so a queue persisted across an app kill
  // sat untouched until the network happened to flip or the user backgrounded and returned. On a
  // device that never loses signal, that is "until the next time they leave the app". This is the
  // only trigger that fires on the ordinary path: launch, with work already queued.
  void drainNow();

  return () => {
    unsubscribeOnline();
    unsubscribeFocus();
    cancelScheduledDrains();
  };
}

// ── writes ───────────────────────────────────────────────────────────────────────────────────
//
// Plain functions, not `useMutation`. A `useMutation` keeps its in-flight write in memory, so an
// app killed mid-write loses it with no trace; durability is the outbox's whole job. Each of
// these does the same three things in the same order: update the device cache and the query cache
// so the UI is correct instantly, queue the write, and schedule the debounced drain.

function applyLocal<T>(entity: SyncEntity, next: T): void {
  const userId = currentUserId();
  writeCache(userId, entity, next);
  queryClient.setQueryData(syncKey(entity, userId), next);
}

/**
 * The rows a list mutation must build on: what the READER can currently see.
 *
 * ⚠️ THE QUERY CACHE COMES FIRST, AND READING ONLY MMKV WIPED THE VISIBLE LIST. Both bookmark
 * mutations built their `current` from `readCache(...)?.data ?? []`. Those two sources are not
 * always in step — a fetch populates the query cache before anything re-reads MMKV, a
 * `setQueryData` from a previous mutation in the same tick has not been re-read, and a fresh
 * install has query data and no cache entry at all. Whenever MMKV was the emptier of the two, the
 * optimistic update replaced the reader's whole list with `[]` (a delete) or with one row (an
 * add), and the rows only came back on the next successful refetch.
 */
function visibleRows<T>(entity: SyncEntity, userId: string | undefined): T | undefined {
  return queryClient.getQueryData<T>(syncKey(entity, userId)) ?? readCache<T>(userId, entity)?.data;
}

export function setReadingPosition(input: Omit<ReadingPositionInput, 'updatedAt'>): void {
  const body = { ...input, updatedAt: Date.now() };
  applyLocal('reading-position', body);
  outbox.enqueue({ kind: 'reading-position', body });
  scheduleDrain();
}

export function setPreferences(input: Omit<PreferencesInput, 'updatedAt'>): void {
  const body = { ...input, updatedAt: Date.now() };
  applyLocal('preferences', body);
  outbox.enqueue({ kind: 'preferences', body });
  scheduleDrain();
}

/**
 * The preferences body a reader who has NEVER written one starts from.
 *
 * ⚠️ EVERY FIELD IS REQUIRED BY THE WORKER, WHICH IS THE WHOLE REASON THIS EXISTS. The wire
 * format has no partial update: `parsePreferences` validates all seven fields on every PUT and
 * refuses the request if one is missing. So a UI that only knows about `fontSize` still has to
 * send a complete, valid body — and the first-ever write is the case with nothing to merge onto.
 *
 * ⚠️ `reciterId` IS `'alafasy'` AND MUST NOT BE `''`. The worker's `shortString(reciterId, 64)`
 * accepts 1–64 characters, so an empty string is a 422 the client would retry-then-drop, silently
 * losing the reader's first theme change. `'alafasy'` is the established default across the
 * worker suite and `sync.integration.test.ts`.
 *
 * ⚠️ `theme: 'light'` rather than an `'auto'` sentinel: the column is one of three literals and
 * `auto` is not one of them (it is inherently per-device — see the picker, which mirrors the
 * RESOLVED scheme). `fontSize: 28` is `ARABIC_FONT_SIZE.default`, duplicated here rather than
 * imported because `constants/` may not be reached from a module this file's layer rules pin —
 * they are the same number and `sync.test.ts` asserts it.
 */
export const DEFAULT_PREFERENCES: Omit<PreferencesInput, 'updatedAt'> = {
  theme: 'light',
  fontSize: 28,
  reciterId: 'alafasy',
  readingMode: 'mushaf',
  translationId: null,
  speedRate: 1,
  transliteration: false,
};

/**
 * Change SOME preferences without knowing the rest — the writer every settings control uses.
 *
 * ⚠️ THE MERGE BASE IS THE QUERY CACHE FIRST, MMKV SECOND, DEFAULTS LAST — the same doctrine
 * `visibleRows` was written for, and for the same defect. Reading only MMKV would take a base
 * that a `setQueryData` in the current tick has already superseded, so two changes in quick
 * succession (drag the font slider, then tap Sepia) would send the second one with the FIRST
 * one's value still in it — silently reverting a change the reader watched happen.
 *
 * ⚠️ THE SERVER ROW CARRIES FIELDS THE REQUEST BODY MUST NOT: `userId` is the row's primary key
 * and `updatedAt` is stamped by `setPreferences` on every write. Spreading the row wholesale
 * would send both, and `parsePreferences` ignores unknown keys — so the bug would be invisible
 * on the wire and only show up as a stale `updatedAt` losing an LWW comparison it should win.
 * The seven fields are therefore named one at a time rather than spread.
 */
export function patchPreferences(partial: Partial<Omit<PreferencesInput, 'updatedAt'>>): void {
  const current = visibleRows<Preferences>('preferences', currentUserId());
  const base: Omit<PreferencesInput, 'updatedAt'> = current
    ? {
        theme: current.theme as PreferencesInput['theme'],
        fontSize: current.fontSize,
        reciterId: current.reciterId,
        readingMode: current.readingMode as PreferencesInput['readingMode'],
        translationId: current.translationId,
        speedRate: current.speedRate,
        transliteration: current.transliteration,
      }
    : DEFAULT_PREFERENCES;
  setPreferences({ ...base, ...partial });
}

export function setAudioPosition(input: Omit<AudioPositionInput, 'updatedAt'>): void {
  const body = { ...input, updatedAt: Date.now() };
  applyLocal('audio-position', body);
  outbox.enqueue({ kind: 'audio-position', body });
  scheduleDrain();
}

/**
 * Add a bookmark. `id` is CLIENT-MINTED so an offline create keeps its identity through the
 * drain — the same row the user sees now is the row that lands, and a retry is idempotent
 * (`createBookmark` answers `exists` rather than creating a duplicate).
 */
export function addBookmark(input: {
  id: string;
  surah: number;
  verse: number;
  label?: string | null;
}): void {
  const userId = currentUserId();
  const body = {
    id: input.id,
    surah: input.surah,
    verse: input.verse,
    label: input.label ?? null,
    createdAt: Date.now(),
  };
  const current = visibleRows<Bookmarks>('bookmarks', userId) ?? [];
  // Union-merge locally too: the same (surah, verse) twice is the same bookmark, which is exactly
  // what the worker's unique index says. The CLIENT does not re-implement the merge — it just
  // does not create a row the server would collapse anyway.
  const alreadyThere = current.some((b) => b.surah === body.surah && b.verse === body.verse);
  // `userId ?? ''` fills the one field the server row has and the request body does not. A write
  // before the session arrives is legitimate (anonymous-first), and the row is replaced wholesale
  // by the server's copy at the next read.
  if (!alreadyThere)
    applyLocal<Bookmarks>('bookmarks', [...current, { ...body, userId: userId ?? '' }]);
  // ⚠️ ENQUEUED EVEN WHEN THE LOCAL COPY ALREADY HAS IT. The device cache can be stale, and
  // `createBookmark` is idempotent — it answers `exists` and spends no write budget. The client
  // sends; the worker decides. Skipping the send here would be the client re-implementing the
  // union-merge against a copy it cannot trust.
  outbox.enqueue({ kind: 'bookmark-create', body });
  scheduleDrain();
}

export function removeBookmark(id: string): void {
  const userId = currentUserId();
  const current = visibleRows<Bookmarks>('bookmarks', userId) ?? [];
  applyLocal<Bookmarks>(
    'bookmarks',
    current.filter((b) => b.id !== id)
  );
  outbox.enqueue({ kind: 'bookmark-delete', id });
  scheduleDrain();
}

// ── the data lifecycle: export and purge (story 5-7) ─────────────────────────────────────────
//
// Both live here for the same reason every other worker call does: `lint:layers` rule 7 makes this
// the ONE module allowed to import `@/lib/api`. A screen calls these and owns only the confirming
// and the reporting.

/** What the reader ends up holding — see `lib/sharing.ts`'s `DocumentDelivery`. */
export type { DocumentDelivery } from './sharing';

/**
 * Everything the worker holds about this reader, handed to the platform's share/save sheet (FR29).
 *
 * ⚠️ THE DOCUMENT IS THE SERVER'S, VERBATIM. The envelope — `format`, `version`, `exportedAt`, the
 * account block — is built in `apps/worker/src/db/queries.ts` and re-serialized here without
 * additions, so the file says what it is without the app that produced it, and so a later shape
 * change has exactly one place to happen. Pretty-printed because the reader is the audience: an
 * export nobody can read in a text editor answers the letter of Art. 20 and not its point.
 *
 * ⚠️ NEVER A HALF FILE. The fetch, the envelope check and the serialization all complete before
 * anything is written to disk, so a network failure throws with nothing created — which is what
 * the I/O matrix means by "a typed, retryable message, never a half file".
 */
export async function exportMyData(): Promise<DocumentDelivery> {
  const res = await api.api.account.export.$get();
  const body = await res.json();
  if (!body.ok) {
    throw new Error(`sync: export refused (${(body as { error?: string }).error ?? 'unknown'})`);
  }
  const document = JSON.stringify(body.export, null, 2);
  // Date-stamped rather than timestamped: a reader exporting twice in a day overwrites their own
  // file instead of collecting `…-1756100000000.json` siblings they cannot tell apart.
  const day = new Date().toISOString().slice(0, 10);
  return saveDocument(`cloud-quran-data-${day}.json`, document, 'application/json');
}

/**
 * The value each entity has once the server holds nothing — the shape a purge leaves behind.
 *
 * ⚠️ WRITTEN, NOT REMOVED. Deleting the cache entries would leave the next offline cold launch
 * with no seed at all, so it would paint whatever a disabled query paints until the network
 * answers. Writing the EMPTY value means the device already knows the truth: there is nothing.
 */
const EMPTY_AFTER_PURGE = {
  'reading-position': null,
  preferences: null,
  'audio-position': null,
  bookmarks: [],
} satisfies Record<SyncEntity, ReadingPosition | Preferences | AudioPosition | Bookmarks>;

/**
 * Destroy every synced row on the server, then every trace of it on this device (FR28).
 *
 * The account, the session and sign-in all survive — this is "delete my data", not "delete my
 * account", and the difference is the reader's.
 *
 * ⚠️ THE ORDER OF THE FOUR LOCAL STEPS IS THE WHOLE REASON THIS FUNCTION IS NOT TWO LINES, AND IT
 * IS: in-flight reads, then the QUEUE, then the caches, then the invalidation. Two of those three
 * gaps can undo the erasure on their own.
 *   • Reads before everything: a GET started before the purge resolves a moment later and its
 *     fetcher writes the destroyed rows into BOTH the query cache and MMKV, where they survive a
 *     cold launch. `cancelQueries` aborts it through the `AbortSignal` every fetcher takes, so the
 *     fetcher body — including its `writeCache` — never runs.
 *   • **The queue before the caches**: a queued write drained a moment after a purge re-creates
 *     precisely the rows the reader just destroyed, under their own session, with no error
 *     anywhere — and the caches would then be refreshed FROM those rows. Clearing the caches
 *     without clearing the queue is a purge that undoes itself.
 * (An earlier version of this docblock said the outbox went "first", full stop, and `CLAUDE.md`
 * repeated it; the code has always cancelled the reads before the queue. What is load-bearing is
 * the queue being ahead of the CACHES, which is what the sentence now says.)
 *
 * ⚠️ SERVER FIRST, DEVICE SECOND, and that is deliberate rather than incidental. A failed purge
 * must leave the reader exactly as they were — including their pending writes — so nothing local
 * is touched until the worker has confirmed. The residual race is one request wide: a drain
 * already ON THE WIRE when the purge lands can still deliver one write. There is no lock to close
 * that with (the queue is durable storage, not a transaction), and the reader can purge again.
 *
 * ⚠️ AND THE LOCAL HALF SWALLOWS ITS OWN FAILURES, BECAUSE THE IRREVERSIBLE HALF IS ALREADY DONE.
 * Every step below touches MMKV or the query cache, both of which can throw — and a throw here
 * escapes into `data.tsx`'s catch, which paints "Nothing was deleted" about rows the worker has
 * already destroyed. That is the one message that is unrecoverably wrong: it tells the reader to
 * try again for an erasure that happened. A stale local cache is the smaller failure by a
 * distance, and the next read reconciles it.
 */
export async function purgeMyData(): Promise<void> {
  const res = await api.api.account.data.$post();
  const body = await res.json();
  if (!body.ok) {
    throw new Error(`sync: purge refused (${(body as { error?: string }).error ?? 'unknown'})`);
  }
  try {
    // 1. THE IN-FLIGHT READS — see the header.
    await queryClient.cancelQueries({ queryKey: ['sync'] });
    // 2. THE QUEUE, before the caches, always.
    outbox.clear();
    cancelScheduledDrains();
    // 3. The caches, set to the state the server is now in rather than emptied.
    for (const [entity, empty] of Object.entries(EMPTY_AFTER_PURGE) as [
      SyncEntity,
      (typeof EMPTY_AFTER_PURGE)[SyncEntity],
    ][]) {
      applyLocal(entity, empty);
    }
    // 4. AND INVALIDATE — the project's rule is that a mutation invalidates explicitly, and this
    //    is the one mutation where skipping it can undo the user's erasure. Steps 1-3 make the
    //    local copy correct; this makes anything mounted reconcile against the server rather than
    //    trust a value this function wrote.
    queryClient.invalidateQueries({ queryKey: ['sync'] });
  } catch (error) {
    // Tier 1: the rows are gone from the server and this device did not finish catching up. Worth
    // reporting, never worth failing the call over.
    captureException(error, { operation: 'sync.purgeMyData.local' });
  }
}

// ── input shapes ─────────────────────────────────────────────────────────────────────────────
//
// Named aliases over the outbox's body types, so a write call site says what it is writing. The
// bodies themselves are validated by `pnpm typecheck` where `send` hands them to the RPC client,
// whose input types come from the worker's own `AppType`.

type ReadingPositionInput = Extract<
  Parameters<typeof outbox.enqueue>[0],
  { kind: 'reading-position' }
>['body'];
type PreferencesInput = Extract<
  Parameters<typeof outbox.enqueue>[0],
  { kind: 'preferences' }
>['body'];
type AudioPositionInput = Extract<
  Parameters<typeof outbox.enqueue>[0],
  { kind: 'audio-position' }
>['body'];
