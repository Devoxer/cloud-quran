/**
 * The write outbox — coalescing, ordering, verdicts, the ceiling halt, eviction and DURABILITY.
 *
 * ⚠️ THE DURABILITY CASE IS WHY `createOutbox` TAKES A STORE. `jest.setup.js` mocks
 * `react-native-mmkv` with an in-memory backing keyed by store id, so "survives a process restart"
 * cannot be tested by restarting anything. What it CAN be is a SECOND outbox instance constructed
 * over the SAME store reading back the first one's queue — which is exactly what a relaunch does.
 * A module-scope singleton could not express that, which is why the factory exists at all.
 *
 * Nothing here touches the network: `drain(send)` takes its transport as an argument, so the four
 * verdicts are asserted as a pure policy. `sync.test.ts` covers the status → verdict mapping and
 * `sync.integration.test.ts` drives this same queue against a real worker.
 */

import { createAppMMKV } from './mmkv';
import {
  coalesce,
  coalesceKey,
  createOutbox,
  evict,
  MAX_OUTBOX_ENTRIES,
  OUTBOX_STORAGE_KEY,
  type Outbox,
  type OutboxEntry,
  type OutboxOperation,
  type OutboxVerdict,
} from './outbox';

const position = (updatedAt: number, verse = 1): OutboxOperation => ({
  kind: 'reading-position',
  body: { surah: 2, verse, page: 2, mode: 'reading', updatedAt },
});

const prefs = (updatedAt: number, fontSize = 24): OutboxOperation => ({
  kind: 'preferences',
  body: {
    theme: 'sepia',
    fontSize,
    reciterId: 'alafasy',
    readingMode: 'reading',
    translationId: null,
    speedRate: 1,
    transliteration: false,
    updatedAt,
  },
});

const bookmarkCreate = (id: string, verse = 1): OutboxOperation => ({
  kind: 'bookmark-create',
  body: { id, surah: 2, verse, label: null, createdAt: 1_700_000_000_000 },
});

const bookmarkDelete = (id: string): OutboxOperation => ({ kind: 'bookmark-delete', id });

/** A fresh store per test — the mock keys its backing by id, so a unique id is a clean slate. */
let storeSeq = 0;
function freshOutbox(): { outbox: Outbox; storeId: string } {
  storeSeq += 1;
  const storeId = `outbox-test-${storeSeq}`;
  return { outbox: createOutbox(createAppMMKV(storeId)), storeId };
}

/** A `send` that answers a scripted verdict per call and records what it was handed. */
function scriptedSend(verdicts: OutboxVerdict[]) {
  const seen: OutboxEntry[] = [];
  let i = 0;
  const send = jest.fn(async (entry: OutboxEntry) => {
    seen.push(entry);
    return verdicts[Math.min(i++, verdicts.length - 1)];
  });
  return { send, seen };
}

describe('coalescing — the write budget, expressed as a pure function', () => {
  it('holds ONE pending entry per LWW entity, newest updatedAt winning', () => {
    // The scroll-storm case from the epic's write-budget bullet: fifty ticks, one request.
    let entries: OutboxEntry[] = [];
    for (let i = 0; i < 50; i++) {
      entries = coalesce(entries, position(1_000 + i, i + 1), entries.length + 1, 1_000 + i);
    }
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe('reading-position');
    expect((entries[0] as Extract<OutboxEntry, { kind: 'reading-position' }>).body.updatedAt).toBe(
      1_049
    );
  });

  it('DISCARDS an out-of-order write rather than queueing it behind the fresh one', () => {
    // The worker's `setWhere: lt(updatedAt, incoming)` would answer applied:false anyway, so
    // sending it is a round trip that changes nothing. Without this branch the stale value would
    // REPLACE the fresh one in the queue and the device would push itself backwards.
    const first = coalesce([], position(2_000), 1, 2_000);
    const second = coalesce(first, position(1_000), 2, 2_001);
    expect(second).toHaveLength(1);
    expect((second[0] as Extract<OutboxEntry, { kind: 'reading-position' }>).body.updatedAt).toBe(
      2_000
    );
  });

  it('keeps the three LWW entities on SEPARATE keys', () => {
    let entries = coalesce([], position(1), 1, 1);
    entries = coalesce(entries, prefs(1), 2, 1);
    entries = coalesce(
      entries,
      { kind: 'audio-position', body: { surah: 1, verse: 1, reciterId: 'a', updatedAt: 1 } },
      3,
      1
    );
    expect(entries.map((e) => e.key).sort()).toEqual([
      'audio-position',
      'preferences',
      'reading-position',
    ]);
  });

  it('keys bookmarks per row, so two ayahs are two entries', () => {
    let entries = coalesce([], bookmarkCreate('a', 1), 1, 1);
    entries = coalesce(entries, bookmarkCreate('b', 2), 2, 1);
    expect(entries).toHaveLength(2);
    expect(coalesceKey(bookmarkCreate('a'))).toBe('bookmark:a');
    expect(coalesceKey(bookmarkDelete('a'))).toBe('bookmark:a');
  });

  it('CANCELS a create followed by a delete of an id the server has never seen', () => {
    // Two writes of the daily budget spent to arrive back where we started, on the one table with
    // unbounded cardinality. The id is client-minted, so a pending create means no row exists.
    const created = coalesce([], bookmarkCreate('a'), 1, 1);
    const cancelled = coalesce(created, bookmarkDelete('a'), 2, 2);
    expect(cancelled).toEqual([]);
  });

  it('lets a re-create REPLACE a pending delete for the same id', () => {
    const deleted = coalesce([], bookmarkDelete('a'), 1, 1);
    const recreated = coalesce(deleted, bookmarkCreate('a'), 2, 2);
    expect(recreated).toHaveLength(1);
    expect(recreated[0].kind).toBe('bookmark-create');
  });

  it('a coalesced entry keeps its ORIGINAL position, so a hot key cannot starve older ones', () => {
    let entries = coalesce([], position(1_000), 1, 1_000);
    entries = coalesce(entries, bookmarkCreate('a'), 2, 1_001);
    entries = coalesce(entries, position(3_000), 3, 3_000);
    // The re-written position keeps seq 1 — the bookmark queued after it still drains after it.
    expect(entries.map((e) => e.seq)).toEqual([1, 2]);
    expect(entries[0].kind).toBe('reading-position');
  });
});

describe('eviction — bounded storage beats unbounded truth', () => {
  it('drops the OLDEST evictable entries once past the cap', () => {
    const entries: OutboxEntry[] = Array.from({ length: 6 }, (_, i) => ({
      ...(bookmarkCreate(`b${i}`, i + 1) as Extract<OutboxOperation, { kind: 'bookmark-create' }>),
      key: `bookmark:b${i}`,
      seq: i + 1,
      rev: 1,
      queuedAt: 1_000 + i,
    }));
    const kept = evict(entries, 4);
    expect(kept).toHaveLength(4);
    expect(kept.map((e) => e.seq)).toEqual([3, 4, 5, 6]);
  });

  it('NEVER evicts an LWW entity, even when it is the oldest', () => {
    // There are at most three of them and each is the user's CURRENT state, not an event —
    // dropping one silently reverts a preference on the next device.
    const lww: OutboxEntry = {
      kind: 'reading-position',
      body: { surah: 2, verse: 1, page: 2, mode: 'reading', updatedAt: 1 },
      key: 'reading-position',
      seq: 1,
      rev: 1,
      queuedAt: 1,
    };
    const bookmarks: OutboxEntry[] = Array.from({ length: 4 }, (_, i) => ({
      ...(bookmarkCreate(`b${i}`, i + 1) as Extract<OutboxOperation, { kind: 'bookmark-create' }>),
      key: `bookmark:b${i}`,
      seq: i + 2,
      rev: 1,
      queuedAt: 1_000 + i,
    }));
    const kept = evict([lww, ...bookmarks], 3);
    expect(kept).toHaveLength(3);
    expect(kept.some((e) => e.kind === 'reading-position')).toBe(true);
    expect(kept.map((e) => e.seq)).toEqual([1, 4, 5]);
  });

  it('HONOURS the cap even when the overflow is all LWW — a cap that does not cap is not a cap', () => {
    // Pass one prefers evictable entries and would return three here; the postcondition
    // `length <= cap` has to hold for every input, or a caller reasoning from it is reasoning
    // about a promise the code does not keep.
    const lww: OutboxEntry[] = (['reading-position', 'preferences', 'audio-position'] as const).map(
      (kind, i) => ({ kind, body: {} as never, key: kind, seq: i + 1, rev: 1, queuedAt: 1 })
    );
    expect(evict(lww, 2)).toHaveLength(2);
    expect(evict(lww, 0)).toHaveLength(0);
    // …and the survivors are the NEWEST, matching the oldest-first preference of pass one.
    expect(evict(lww, 2).map((e) => e.seq)).toEqual([2, 3]);
  });

  it('trims a RESTORED queue that is already over the cap', () => {
    // `evict` ran on the enqueue path only, so a queue persisted by a build with a larger cap
    // (or edited by hand) stayed over it forever — the bound was a property of one code path
    // rather than of the queue.
    const { storeId } = freshOutbox();
    const store = createAppMMKV(storeId);
    store.set(
      OUTBOX_STORAGE_KEY,
      JSON.stringify(
        Array.from({ length: MAX_OUTBOX_ENTRIES + 12 }, (_, i) => ({
          ...bookmarkCreate(`b${i}`, 1 + (i % 200)),
          key: `bookmark:b${i}`,
          seq: i + 1,
          rev: 1,
          queuedAt: 1_000 + i,
        }))
      )
    );

    const restored = createOutbox(createAppMMKV(storeId));

    expect(restored.size()).toBe(MAX_OUTBOX_ENTRIES);
    // …and the trim is PERSISTED, not recomputed on every read.
    expect(JSON.parse(createAppMMKV(storeId).getString(OUTBOX_STORAGE_KEY) ?? '[]')).toHaveLength(
      MAX_OUTBOX_ENTRIES
    );
  });

  it('repairs a persisted entry written before revisions existed, rather than dropping it', () => {
    // The one upgrade that introduced `rev`. Rejecting these would throw away a real reader's
    // queued write for the sake of a field the old build could not have written.
    const { outbox, storeId } = freshOutbox();
    createAppMMKV(storeId).set(
      OUTBOX_STORAGE_KEY,
      JSON.stringify([{ ...bookmarkCreate('old', 4), key: 'bookmark:old', seq: 1, queuedAt: 1 }])
    );

    expect(outbox.list()).toEqual([expect.objectContaining({ key: 'bookmark:old', rev: 1 })]);
  });

  it('the live outbox evicts at MAX_OUTBOX_ENTRIES and leaves exactly the cap', () => {
    const { outbox } = freshOutbox();
    for (let i = 0; i < MAX_OUTBOX_ENTRIES + 5; i++) outbox.enqueue(bookmarkCreate(`b${i}`, 1 + i));
    expect(outbox.size()).toBe(MAX_OUTBOX_ENTRIES);
    // The five oldest went; the newest survive.
    const ids = outbox.list().map((e) => e.key);
    expect(ids).not.toContain('bookmark:b0');
    expect(ids).toContain(`bookmark:b${MAX_OUTBOX_ENTRIES + 4}`);
  });
});

describe('durability — a second instance over the same store IS the relaunch', () => {
  it('recovers the persisted queue, in order, and drains it', async () => {
    const { outbox: first, storeId } = freshOutbox();
    first.enqueue(position(1_000));
    first.enqueue(bookmarkCreate('a', 5));
    first.enqueue(bookmarkCreate('b', 6));
    expect(first.size()).toBe(3);

    // ⚠️ A SECOND OUTBOX OVER THE SAME STORE. Nothing is shared in memory between these two
    // objects; everything below comes off MMKV. Delete the persistence in `createOutbox` and this
    // is the case that reddens.
    const second = createOutbox(createAppMMKV(storeId));
    expect(second.size()).toBe(3);
    expect(second.list().map((e) => e.key)).toEqual([
      'reading-position',
      'bookmark:a',
      'bookmark:b',
    ]);

    const { send, seen } = scriptedSend(['sent']);
    const result = await second.drain(send);
    expect(result).toEqual({ sent: 3, dropped: 0, halted: false, remaining: 0 });
    expect(seen.map((e) => e.key)).toEqual(['reading-position', 'bookmark:a', 'bookmark:b']);
    // …and the FIRST instance sees the drained queue too — one store, one truth.
    expect(first.size()).toBe(0);
  });

  it('a write queued by one instance is coalesced by the other', () => {
    const { outbox: first, storeId } = freshOutbox();
    first.enqueue(position(1_000));
    const second = createOutbox(createAppMMKV(storeId));
    second.enqueue(position(2_000));
    expect(first.size()).toBe(1);
    expect(
      (first.list()[0] as Extract<OutboxEntry, { kind: 'reading-position' }>).body.updatedAt
    ).toBe(2_000);
  });
});

describe('drain — the four verdicts are the whole retry policy', () => {
  it("'sent' removes the entry and continues", async () => {
    const { outbox } = freshOutbox();
    outbox.enqueue(position(1));
    outbox.enqueue(prefs(1));
    const { send } = scriptedSend(['sent']);
    const result = await outbox.drain(send);
    expect(send).toHaveBeenCalledTimes(2);
    expect(result.sent).toBe(2);
    expect(outbox.size()).toBe(0);
  });

  it("'drop' removes the entry and KEEPS DRAINING — a refused entry must not wedge the queue", async () => {
    // `createBookmark`'s untargeted onConflictDoNothing answers 409 for an id already in use
    // (deferred-work.md). Retrying it blocks every later write behind a row that can never land.
    const { outbox } = freshOutbox();
    outbox.enqueue(bookmarkCreate('doomed', 1));
    outbox.enqueue(bookmarkCreate('fine', 2));
    const { send, seen } = scriptedSend(['drop', 'sent']);
    const result = await outbox.drain(send);
    expect(seen.map((e) => e.key)).toEqual(['bookmark:doomed', 'bookmark:fine']);
    expect(result).toEqual({ sent: 1, dropped: 1, halted: false, remaining: 0 });
  });

  it("'retry' KEEPS the entry and stops the drain — the rest stay queued", async () => {
    const { outbox } = freshOutbox();
    outbox.enqueue(position(1));
    outbox.enqueue(bookmarkCreate('a', 1));
    const { send } = scriptedSend(['retry']);
    const result = await outbox.drain(send);
    expect(send).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ sent: 0, dropped: 0, halted: false, remaining: 2 });
    expect(outbox.size()).toBe(2);
  });

  it("'halt' stops IMMEDIATELY with the whole queue intact, and reports it", async () => {
    // The per-user daily ceiling: the next entry would be refused too, so there is nothing to
    // gain from trying it and a bill to be had from trying all of them.
    const { outbox } = freshOutbox();
    outbox.enqueue(position(1));
    outbox.enqueue(prefs(1));
    outbox.enqueue(bookmarkCreate('a', 1));
    const { send } = scriptedSend(['halt']);
    const result = await outbox.drain(send);
    expect(send).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ sent: 0, dropped: 0, halted: true, remaining: 3 });
  });

  it('a PARTIAL drain keeps exactly the remainder', async () => {
    const { outbox } = freshOutbox();
    outbox.enqueue(bookmarkCreate('a', 1));
    outbox.enqueue(bookmarkCreate('b', 2));
    outbox.enqueue(bookmarkCreate('c', 3));
    const { send } = scriptedSend(['sent', 'retry']);
    const result = await outbox.drain(send);
    expect(result).toEqual({ sent: 1, dropped: 0, halted: false, remaining: 2 });
    expect(outbox.list().map((e) => e.key)).toEqual(['bookmark:b', 'bookmark:c']);
  });

  it('drains OLDEST-FIRST, so a create precedes the delete of the same row', async () => {
    const { outbox } = freshOutbox();
    outbox.enqueue(bookmarkCreate('a', 1));
    // Drain the create, then queue the delete — the pair no longer cancels, because the server
    // has seen the create.
    // ⚠️ ONE `scriptedSend` PER DRAIN, AND THE ASSERTION IS ON THE ONE THAT RAN. This built a
    // SECOND recorder that was never passed to `drain` and then asserted `expect(seen).toEqual([])`
    // on it — true no matter what the queue did, and green with the ordering deleted.
    const create = scriptedSend(['sent']);
    await outbox.drain(create.send);
    expect(create.seen.map((e) => e.kind)).toEqual(['bookmark-create']);

    outbox.enqueue(bookmarkDelete('a'));
    const remove = scriptedSend(['sent']);
    await outbox.drain(remove.send);
    expect(remove.seen.map((e) => e.kind)).toEqual(['bookmark-delete']);
    expect(outbox.size()).toBe(0);
  });

  it('sends strictly in `seq` order within ONE drain, whatever order MMKV hands them back', async () => {
    const { outbox } = freshOutbox();
    outbox.enqueue(bookmarkCreate('first', 1));
    outbox.enqueue(position(1_000));
    outbox.enqueue(bookmarkCreate('third', 3));
    const { send, seen } = scriptedSend(['sent']);

    await outbox.drain(send);

    expect(seen.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(seen.map((e) => e.key)).toEqual([
      'bookmark:first',
      'reading-position',
      'bookmark:third',
    ]);
  });

  it('re-entrant drains are a no-op — the same entry is never sent twice', async () => {
    const { outbox } = freshOutbox();
    outbox.enqueue(position(1));
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const send = jest.fn(async () => {
      await gate;
      return 'sent' as const;
    });
    const first = outbox.drain(send);
    const second = await outbox.drain(send); // returns straight away, sends nothing
    expect(second).toEqual({ sent: 0, dropped: 0, halted: false, remaining: 1 });
    release();
    await first;
    expect(send).toHaveBeenCalledTimes(1);
    expect(outbox.size()).toBe(0);
  });

  // ⚠️ THE SAME-KEY COLLISION — SILENT DATA LOSS, AND EVERY EXISTING CASE MISSED IT. The
  // mid-drain case below uses two DIFFERENT bookmark ids, so it never coalesces into the slot the
  // drain is holding. These do, which is the only shape where `seq` alone was not enough.
  it('a write that COALESCES INTO AN IN-FLIGHT ENTRY is not deleted with it', async () => {
    const { outbox } = freshOutbox();
    outbox.enqueue(position(1_000));
    let coalescedDuringFlight = false;
    const send = jest.fn(async () => {
      if (!coalescedDuringFlight) {
        coalescedDuringFlight = true;
        outbox.enqueue(position(2_000)); // same key, same slot, bumped revision
      }
      return 'sent' as const;
    });

    const result = await outbox.drain(send);

    // The newer write SURVIVED the older one's removal. Before `rev` it was deleted here, never
    // sent, and the invalidation then refetched the OLD value over the top of it.
    expect(send).toHaveBeenCalledTimes(1);
    expect(result.remaining).toBe(1);
    expect(
      (outbox.list()[0] as Extract<OutboxEntry, { kind: 'reading-position' }>).body.updatedAt
    ).toBe(2_000);

    // …and it goes out on the next pass — which the mutation's own debounce already scheduled.
    const next = scriptedSend(['sent']);
    await outbox.drain(next.send);
    expect(
      (next.seen[0] as Extract<OutboxEntry, { kind: 'reading-position' }>).body.updatedAt
    ).toBe(2_000);
    expect(outbox.size()).toBe(0);
  });

  it('a DELETE queued while its CREATE is in flight is not cancelled away', async () => {
    // The worse half: cancelling an in-flight create swallows the delete too, so the row lands on
    // the server with nothing left to remove it — and resurrects on every read, forever.
    const { outbox } = freshOutbox();
    outbox.enqueue(bookmarkCreate('a', 1));
    let queued = false;
    const seen: OutboxEntry[] = [];
    const send = jest.fn(async (entry: OutboxEntry) => {
      seen.push(entry);
      if (!queued) {
        queued = true;
        outbox.enqueue(bookmarkDelete('a'));
      }
      return 'sent' as const;
    });

    const result = await outbox.drain(send);

    expect(seen.map((e) => e.kind)).toEqual(['bookmark-create']);
    // The delete is STILL QUEUED — it was not cancelled against a create the server had already
    // accepted, which would have left the row on the server with nothing able to remove it.
    expect(result.remaining).toBe(1);
    expect(outbox.list()[0].kind).toBe('bookmark-delete');

    const next = scriptedSend(['sent']);
    await outbox.drain(next.send);
    expect(next.seen.map((e) => e.kind)).toEqual(['bookmark-delete']);
  });

  it('a create/delete pair that is NOT in flight still cancels — the budget rule survives', () => {
    // Anti-regression for the fix above: the cancel branch must not be disabled outright, or
    // every offline add-then-remove costs two writes on the one unbounded table.
    const { outbox } = freshOutbox();
    outbox.enqueue(bookmarkCreate('a', 1));
    outbox.enqueue(bookmarkDelete('a'));
    expect(outbox.size()).toBe(0);
  });

  it('a DROPPED entry that changed underneath is kept, not discarded', async () => {
    // The same guard on the other verdict: a 4xx drops the entry the server refused, and must not
    // take a newer write to the same key with it.
    const { outbox } = freshOutbox();
    outbox.enqueue(position(1_000));
    let replaced = false;
    const send = jest.fn(async () => {
      if (!replaced) {
        replaced = true;
        outbox.enqueue(position(2_000));
        return 'drop' as const;
      }
      return 'sent' as const;
    });

    const result = await outbox.drain(send);

    expect(send).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ sent: 0, dropped: 0, halted: false, remaining: 1 });
    expect(
      (outbox.list()[0] as Extract<OutboxEntry, { kind: 'reading-position' }>).body.updatedAt
    ).toBe(2_000);
  });

  it('an enqueue that lands MID-DRAIN is neither lost nor sent twice', async () => {
    const { outbox } = freshOutbox();
    outbox.enqueue(bookmarkCreate('a', 1));
    let queuedDuringDrain = false;
    const send = jest.fn(async () => {
      if (!queuedDuringDrain) {
        queuedDuringDrain = true;
        outbox.enqueue(bookmarkCreate('b', 2));
      }
      return 'sent' as const;
    });
    const result = await outbox.drain(send);
    // The initial snapshot bounded this pass at one entry, so `b` survives for the next trigger.
    expect(send).toHaveBeenCalledTimes(1);
    expect(result.remaining).toBe(1);
    expect(outbox.list().map((e) => e.key)).toEqual(['bookmark:b']);
  });

  it('DROPS a persisted entry with a malformed `seq` instead of re-sending it forever', async () => {
    // ⚠️ THE ONE THAT NEVER ENDS. `seq` feeds `Math.max(max, e.seq)` — one `NaN` and every later
    // sequence is `NaN` — and the removal predicate `e.seq !== entry.seq`, which `NaN !== NaN`
    // makes ALWAYS true. So a drained entry is never removed and is re-sent on every drain, for
    // the life of the install. MMKV outlives the build that wrote it, so this is reachable.
    const { outbox, storeId } = freshOutbox();
    const store = createAppMMKV(storeId);
    store.set(
      OUTBOX_STORAGE_KEY,
      JSON.stringify([
        { kind: 'reading-position', body: {}, key: 'reading-position', queuedAt: 1 }, // no seq
        { kind: 'bookmark-create', body: {}, key: 'bookmark:a', seq: 'two', queuedAt: 1 },
        { ...bookmarkCreate('good', 1), key: 'bookmark:good', seq: 3, queuedAt: 1 },
      ])
    );

    expect(outbox.list().map((e) => e.key)).toEqual(['bookmark:good']);
    const { send } = scriptedSend(['sent']);
    await outbox.drain(send);
    expect(outbox.size()).toBe(0);
  });

  it('DROPS a persisted entry whose `kind` this build does not know', async () => {
    // A queue written by a later build, read by an older one (or the reverse after a rollback).
    // Nothing here can send it, so it must not sit at the head of the queue blocking the rest.
    const { outbox, storeId } = freshOutbox();
    createAppMMKV(storeId).set(
      OUTBOX_STORAGE_KEY,
      JSON.stringify([
        { kind: 'highlight-create', body: {}, key: 'highlight:a', seq: 1, queuedAt: 1 },
        { ...bookmarkCreate('good', 1), key: 'bookmark:good', seq: 2, queuedAt: 1 },
      ])
    );

    expect(outbox.list().map((e) => e.key)).toEqual(['bookmark:good']);
  });

  it('clear() empties the queue — the teardown seam', async () => {
    const { outbox } = freshOutbox();
    outbox.enqueue(position(1));
    outbox.enqueue(bookmarkCreate('a', 1));
    outbox.clear();
    expect(outbox.size()).toBe(0);
    const { send } = scriptedSend(['sent']);
    await outbox.drain(send);
    expect(send).not.toHaveBeenCalled();
  });
});
