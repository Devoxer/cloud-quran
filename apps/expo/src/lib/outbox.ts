/**
 * THE DURABLE WRITE OUTBOX (story 5-6).
 *
 * Every write Cloud Quran sends to the worker is queued here first. Nothing calls the API
 * directly and nothing retries in memory: `useMutation` holds its in-flight write in RAM, so an
 * app killed mid-write loses it silently — which for a reading position is invisible and for a
 * bookmark is a user telling you the feature is broken. So writes are plain functions, the queue
 * is MMKV, and durability is this module's entire job.
 *
 * ⚠️ TRANSPORT-AGNOSTIC ON PURPOSE, AND `lint:layers` RULE 7 DEPENDS ON IT. This module must
 * never import `@/lib/api` — `drain(send)` takes the transport as an argument, so `lib/sync.ts`
 * stays the ONE module that reaches the worker. It also keeps the queue testable without a
 * server: the four verdicts are the whole retry policy, expressible as a function of a status.
 *
 * ⚠️ `createOutbox(store)` TAKES ITS STORE, AND THAT IS WHAT MAKES DURABILITY PROVABLE.
 * `jest.setup.js` mocks `react-native-mmkv` with an in-memory backing, so "survives a process
 * restart" cannot be tested by restarting anything. What it CAN be is a second outbox instance
 * constructed over the same store reading back the first one's queue — which is exactly what a
 * relaunch does, and exactly what a factory pinned to a module-scope singleton could not express.
 *
 * ⚠️ COALESCING IS THE WRITE BUDGET. The worker's per-user ceiling
 * (`middleware/write-guard.ts`, 2,000 applied writes/user/day) is the line that cannot be broken
 * from outside; this is the line that must not break. The three last-write-wins entities hold AT
 * MOST ONE pending entry each — newest `updatedAt` wins — so fifty position ticks during a scroll
 * cost one request, not fifty. Read the epic context's write-budget bullet before widening this.
 */

import type { MMKV } from 'react-native-mmkv';
import { addBreadcrumb, captureException } from './errors';
import { createAppMMKV } from './mmkv';

/** The single MMKV key the whole queue is persisted under, as one JSON array. */
export const OUTBOX_STORAGE_KEY = 'queue';

/**
 * Hard cap on queued entries. Bounded storage beats unbounded truth: a device that has been
 * offline for a month with a runaway writer must not fill MMKV. Only bookmark entries can ever
 * accumulate — the three LWW entities coalesce to one entry each — so the cap is a bookmark cap
 * in practice, and 500 pending bookmarks is far past any real offline session.
 */
export const MAX_OUTBOX_ENTRIES = 500;

/**
 * What `drain`'s `send` answers, and the whole retry policy in four words.
 *
 * ⚠️ VERDICTS, NOT EXCEPTIONS — because an exception carries no policy and every call site
 * re-invents one. See `lib/sync.ts`'s `verdictForStatus` for the status → verdict mapping.
 *  • `sent`  — the server accepted it (including an LWW no-op: `{ ok: true, applied: false }`).
 *  • `drop`  — the server will NEVER accept this entry (409/422/413). Retrying wedges the queue
 *              forever behind an entry that cannot land.
 *  • `retry` — transient. Keep the entry, stop the drain, try again on the next trigger.
 *  • `halt`  — the per-user daily write ceiling. Stop everything and back off; nothing dropped.
 */
export type OutboxVerdict = 'sent' | 'drop' | 'retry' | 'halt';

/** Bodies mirror `apps/worker/src/lib/validate.ts`. A wrong shape fails `pnpm typecheck` where
 *  `lib/sync.ts` hands one to the RPC client, which infers its input from the worker's `AppType`. */
export type ReadingPositionBody = {
  surah: number;
  verse: number;
  page: number;
  mode: 'reading' | 'mushaf';
  updatedAt: number;
};

export type AudioPositionBody = {
  surah: number;
  verse: number;
  reciterId: string;
  updatedAt: number;
};

export type PreferencesBody = {
  theme: 'light' | 'sepia' | 'dark';
  fontSize: number;
  reciterId: string;
  readingMode: 'reading' | 'mushaf';
  translationId: string | null;
  speedRate: number;
  transliteration: boolean;
  updatedAt: number;
};

export type BookmarkBody = {
  /** Client-minted, so an offline create keeps its identity through the drain. */
  id: string;
  surah: number;
  verse: number;
  label: string | null;
  createdAt: number;
};

/** One queued write. `kind` decides both the coalescing key and the request `lib/sync.ts` makes. */
export type OutboxOperation =
  | { kind: 'reading-position'; body: ReadingPositionBody }
  | { kind: 'preferences'; body: PreferencesBody }
  | { kind: 'audio-position'; body: AudioPositionBody }
  | { kind: 'bookmark-create'; body: BookmarkBody }
  | { kind: 'bookmark-delete'; id: string };

export type OutboxKind = OutboxOperation['kind'];

export type OutboxEntry = OutboxOperation & {
  /** Coalescing identity — at most one pending entry per key. See `coalesceKey`. */
  key: string;
  /** Monotonic within a queue. Drain order is oldest-first, so a create precedes its delete. */
  seq: number;
  /**
   * Bumped on EVERY write to this slot — the first enqueue and every coalesce after it.
   *
   * ⚠️ THIS EXISTS BECAUSE `seq` ALONE MADE THE DRAIN DELETE WRITES IT NEVER SENT, and it was
   * silent data loss with a reverting UI on top. `coalesce` keeps `seq` stable on purpose (a hot
   * key must not jump to the back of the queue and starve older entries), and `drain` removed the
   * entry AFTER its await by matching `seq`. So: position A is picked up and its PUT is in flight;
   * position B coalesces into the same slot, keeping seq; A returns `sent`; the filter deletes
   * that seq and B is gone, never sent. The invalidation then refetched A and `writeCache`
   * overwrote the device cache with it — the reader's newest position actively reverted.
   *
   * `seq` answers "which slot"; `rev` answers "is it still the thing I sent". The drain removes
   * only when both match, so a slot that changed underneath stays queued and goes out next pass.
   */
  rev: number;
  /** When this key first became pending. Used for age reporting, never for ordering. */
  queuedAt: number;
};

/** Every kind this build knows how to send. Also the durability filter — see `createOutbox`. */
const KNOWN_KINDS = new Set<string>([
  'reading-position',
  'preferences',
  'audio-position',
  'bookmark-create',
  'bookmark-delete',
]);

/** The three single-row entities the worker resolves last-write-wins. */
const LWW_KINDS = new Set<OutboxKind>(['reading-position', 'preferences', 'audio-position']);

/** Whether an entry is one of the coalescing singletons (never evicted — see `evict`). */
export function isLwwKind(kind: OutboxKind): boolean {
  return LWW_KINDS.has(kind);
}

/**
 * The coalescing key for an operation.
 *
 * The three LWW entities key on the entity itself, so a second write REPLACES the pending one.
 * Bookmarks key on the row: one pending entry per bookmark id, whichever operation it is — which
 * is what lets a create-then-delete of an id the server has never seen cancel out entirely.
 */
export function coalesceKey(op: OutboxOperation): string {
  switch (op.kind) {
    case 'bookmark-create':
      return `bookmark:${op.body.id}`;
    case 'bookmark-delete':
      return `bookmark:${op.id}`;
    default:
      return op.kind;
  }
}

/** The `updatedAt` an LWW operation carries, or null for anything else. */
function lwwTimestamp(op: OutboxOperation): number | null {
  return isLwwKind(op.kind) && 'body' in op && 'updatedAt' in op.body ? op.body.updatedAt : null;
}

/**
 * Fold `op` into `entries`, applying the coalescing rules. Pure — the whole reason the durability
 * and budget behaviour can be asserted without a store or a server.
 *
 * @param nextSeq sequence to assign if a NEW entry is appended.
 * @param now     epoch ms stamped on a new entry.
 */
export function coalesce(
  entries: readonly OutboxEntry[],
  op: OutboxOperation,
  nextSeq: number,
  now: number,
  inFlightSeq?: number
): OutboxEntry[] {
  const key = coalesceKey(op);
  const existing = entries.find((e) => e.key === key);

  if (!existing) return [...entries, { ...op, key, seq: nextSeq, rev: 1, queuedAt: now }];

  const inFlight = inFlightSeq !== undefined && existing.seq === inFlightSeq;

  // ⚠️ A CREATE THE SERVER HAS NEVER SEEN, THEN A DELETE — BOTH VANISH. Sending the pair would
  // spend two writes of the user's daily budget to arrive back where it started, and on the one
  // table with unbounded cardinality. The bookmark id is client-minted, so a still-pending create
  // means the row does not exist anywhere yet and there is nothing for the delete to remove.
  //
  // ⚠️ UNLESS THE CREATE IS ALREADY ON THE WIRE — and this is the worse half of the `rev` bug
  // above, because it loses a row rather than a field. Cancelling a create the server is in the
  // middle of accepting swallows the delete too: the row lands, nothing is left to remove it, and
  // it resurrects on the next read for the life of the account. So an in-flight create is NOT
  // cancellable; the delete replaces it in the slot, the in-flight send finds a changed `rev` and
  // leaves it alone, and the delete goes out on the next pass. Two writes, and a correct answer.
  if (existing.kind === 'bookmark-create' && op.kind === 'bookmark-delete' && !inFlight) {
    return entries.filter((e) => e.key !== key);
  }

  const incomingAt = lwwTimestamp(op);
  const existingAt = lwwTimestamp(existing);
  // NEWEST `updatedAt` WINS, and a stale write is discarded rather than queued behind the fresh
  // one. This mirrors the worker's `setWhere: lt(table.updatedAt, incoming)` guard: sending the
  // older value would be an applied:false no-op, so not sending it is the same answer for free.
  if (incomingAt !== null && existingAt !== null && incomingAt < existingAt) return [...entries];

  // Replace in place: the entry keeps the position (`seq`) and age (`queuedAt`) it already had,
  // so a hot key cannot starve older entries by repeatedly jumping to the back of the queue —
  // and bumps `rev`, which is what tells an in-flight send that this slot is no longer what it
  // picked up.
  return entries.map((e) =>
    e.key === key
      ? { ...op, key, seq: existing.seq, rev: existing.rev + 1, queuedAt: existing.queuedAt }
      : e
  );
}

/**
 * Drop the oldest evictable entries until the queue fits `cap`. Pure.
 *
 * ⚠️ THE LWW SINGLETONS ARE NEVER EVICTED. There are at most three of them, they each represent
 * the user's CURRENT state rather than an event, and losing one silently reverts a preference on
 * the next device. Only bookmark entries are evictable, and they are the only ones that can
 * accumulate — so "evict the oldest" and "evict a bookmark" are the same rule here.
 */
export function evict(entries: readonly OutboxEntry[], cap: number): OutboxEntry[] {
  const ordered = [...entries].sort((a, b) => a.seq - b.seq);
  if (ordered.length <= cap) return ordered;
  // Pass one: drop the oldest EVICTABLE entries. This is the only pass that ever runs in practice
  // — there are at most three LWW entries and the cap is in the hundreds.
  const kept: OutboxEntry[] = [];
  let toDrop = ordered.length - cap;
  for (const entry of ordered) {
    if (toDrop > 0 && !isLwwKind(entry.kind)) {
      toDrop -= 1;
      continue;
    }
    kept.push(entry);
  }
  // ⚠️ PASS TWO EXISTS BECAUSE A CAP THAT DOES NOT CAP IS NOT A CAP. Pass one alone returns MORE
  // than `cap` whenever the overflow is all LWW entries (a cap below three, or a queue of nothing
  // else), so the function's one postcondition did not hold for every input — and a caller
  // reasoning "after evict, length <= cap" was reasoning about a promise the code did not keep.
  // Preferring evictables is still the design; honouring the bound is the contract.
  return kept.length <= cap ? kept : kept.slice(kept.length - Math.max(cap, 0));
}

export type DrainResult = {
  sent: number;
  dropped: number;
  /** True when the drain stopped on the write ceiling — the caller backs off rather than retries. */
  halted: boolean;
  /** Entries still queued after the drain. */
  remaining: number;
};

export type Outbox = {
  /** Queue a write, coalescing it into whatever is already pending for its key. */
  enqueue: (op: OutboxOperation) => void;
  /** The persisted queue, oldest-first. */
  list: () => OutboxEntry[];
  size: () => number;
  /**
   * Send queued entries oldest-first, serially, stopping on the first `retry` or `halt`.
   * Re-entrant calls are a no-op — two drains racing would send the same entry twice.
   */
  drain: (send: (entry: OutboxEntry) => Promise<OutboxVerdict>) => Promise<DrainResult>;
  /** Discard everything. Used by the account teardown — a departing user's writes never replay. */
  clear: () => void;
};

/**
 * Build an outbox over `store`.
 *
 * Reads and writes go through the store on EVERY operation rather than through an in-memory
 * mirror. MMKV is synchronous and this queue is tens of entries, so the cost is nothing — and it
 * means a second instance over the same store (a relaunch; the durability test) sees the truth,
 * and that a drain in progress cannot clobber an enqueue that happened between two sends.
 */
export function createOutbox(store: MMKV): Outbox {
  let draining = false;
  /**
   * The `seq` currently on the wire, if any. `coalesce` needs it for exactly one decision: an
   * in-flight `bookmark-create` must not be cancelled by a delete (see the note in `coalesce`).
   */
  let inFlightSeq: number | undefined;

  function read(): OutboxEntry[] {
    const raw = store.getString(OUTBOX_STORAGE_KEY);
    if (!raw) return [];
    let valid: OutboxEntry[];
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      // ⚠️ VALIDATE `seq` AND `kind`, NOT JUST `key` — A MALFORMED ENTRY IS PERMANENT OTHERWISE.
      // This checked `key` alone, and the two fields it skipped are the ones the queue's
      // machinery depends on:
      //   • `seq` feeds `Math.max(max, e.seq)` (a missing or non-numeric one makes the next
      //     sequence `NaN`, and every later comparison false) and the removal predicate
      //     `e.seq !== entry.seq` (which `NaN !== NaN` makes ALWAYS true) — so a drained entry
      //     is never removed and is re-sent on every drain, forever.
      //   • `kind` decides the request. An entry written by a build that had a kind this one does
      //     not is unsendable here; `lib/sync.ts` drops it at the switch, but dropping it at the
      //     door costs one request less and keeps the reason in one place.
      // MMKV outlives the build that wrote it, so "this cannot happen" is not available.
      valid = parsed.flatMap((e): OutboxEntry[] => {
        if (typeof e !== 'object' || e === null) return [];
        const entry = e as Partial<OutboxEntry>;
        if (
          typeof entry.key !== 'string' ||
          typeof entry.seq !== 'number' ||
          !Number.isFinite(entry.seq) ||
          typeof entry.kind !== 'string' ||
          !KNOWN_KINDS.has(entry.kind)
        ) {
          return [];
        }
        // ⚠️ `rev` IS REPAIRED, NOT REJECTED. An entry persisted by the build BEFORE revisions
        // existed is perfectly sendable, and refusing it would throw away a real reader's queued
        // write on the single upgrade that introduced the field. Seeding it at 1 is safe: any
        // coalesce bumps it, so an in-flight send still sees a mismatch.
        const rev = typeof entry.rev === 'number' && Number.isFinite(entry.rev) ? entry.rev : 1;
        return [{ ...(entry as OutboxEntry), rev }];
      });
    } catch (error) {
      // Tier 3 (best-effort cache read): an unparseable queue is not an actionable defect and the
      // user is not waiting on it. Losing the queue is the cost of not wedging the app.
      captureException(error, { context: 'outbox.read' });
      return [];
    }
    // ⚠️ THE CAP IS ENFORCED ON THE WAY OUT, NOT ONLY AT `enqueue`. A queue restored from MMKV
    // that is already over the cap — written by a build with a larger one, or by a store somebody
    // edited — was never trimmed, because `evict` ran on the enqueue path alone. Trimming here
    // makes the bound a property of the queue rather than of one code path, and the write below
    // is what stops it being re-computed on every read.
    const trimmed = evict(valid, MAX_OUTBOX_ENTRIES);
    if (trimmed.length < valid.length) {
      addBreadcrumb('http', 'outbox: trimmed a restored queue to the cap', {
        evicted: valid.length - trimmed.length,
        cap: MAX_OUTBOX_ENTRIES,
      });
      persist(trimmed);
    }
    return trimmed;
  }

  function persist(entries: readonly OutboxEntry[]): void {
    store.set(OUTBOX_STORAGE_KEY, JSON.stringify([...entries].sort((a, b) => a.seq - b.seq)));
  }

  function enqueue(op: OutboxOperation): void {
    const entries = read();
    const nextSeq = entries.reduce((max, e) => Math.max(max, e.seq), 0) + 1;
    const coalesced = coalesce(entries, op, nextSeq, Date.now(), inFlightSeq);
    const kept = evict(coalesced, MAX_OUTBOX_ENTRIES);
    if (kept.length < coalesced.length) {
      // ONE breadcrumb, not one per evicted entry — this fires exactly when the device is already
      // in trouble, and a per-entry log is how a breadcrumb trail becomes useless.
      addBreadcrumb('http', 'outbox: evicted oldest entries at the cap', {
        evicted: coalesced.length - kept.length,
        cap: MAX_OUTBOX_ENTRIES,
      });
    }
    persist(kept);
  }

  async function drain(send: (entry: OutboxEntry) => Promise<OutboxVerdict>): Promise<DrainResult> {
    if (draining) return { sent: 0, dropped: 0, halted: false, remaining: read().length };
    draining = true;
    let sent = 0;
    let dropped = 0;
    let halted = false;
    try {
      // Oldest-first, and the queue is RE-READ after each send so an enqueue that lands mid-drain
      // is neither lost nor sent twice. The loop is bounded by the initial snapshot's length so a
      // writer faster than the network cannot keep it running forever.
      const budget = read().length;
      for (let i = 0; i < budget; i++) {
        const pending = read().sort((a, b) => a.seq - b.seq);
        const entry = pending[0];
        if (!entry) break;
        inFlightSeq = entry.seq;
        let verdict: OutboxVerdict;
        try {
          verdict = await send(entry);
        } finally {
          inFlightSeq = undefined;
        }
        if (verdict === 'halt') {
          halted = true;
          break;
        }
        if (verdict === 'retry') break;
        // ⚠️ REMOVE ONLY WHAT WAS ACTUALLY SENT. Matching on `seq` alone deleted a write that had
        // COALESCED INTO THIS SLOT while the request was in flight — see the note on `rev`. A
        // changed `rev` means the slot holds something newer that nobody has sent, so it stays and
        // the next iteration picks it up. Silently deleting it was invisible in every test,
        // because no test wrote to the same key mid-drain.
        const after = read();
        const current = after.find((e) => e.seq === entry.seq);
        if (current && current.rev !== entry.rev) continue;
        if (verdict === 'drop') {
          dropped += 1;
          addBreadcrumb('http', 'outbox: dropped a permanently-refused entry', {
            kind: entry.kind,
            key: entry.key,
          });
        } else {
          sent += 1;
        }
        persist(after.filter((e) => e.seq !== entry.seq));
      }
    } finally {
      draining = false;
    }
    return { sent, dropped, halted, remaining: read().length };
  }

  return {
    enqueue,
    list: () => read().sort((a, b) => a.seq - b.seq),
    size: () => read().length,
    drain,
    clear: () => store.remove(OUTBOX_STORAGE_KEY),
  };
}

/** The app's outbox. One store, one queue, shared by every write path. */
export const outbox: Outbox = createOutbox(createAppMMKV('outbox'));
