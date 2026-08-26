import { afterEach, describe, expect, it, vi } from 'vitest';
import { computeBlockGaps, DEFAULT_GAP_POLICY, synthesizeBlocks } from './blockAudio.js';

// 24kHz s16le mono → 48000 bytes/sec. A clip of N*48000 bytes is exactly N seconds.
const BYTES_PER_SECOND = 48_000;

/** Base64 of `bytes` zero-filled PCM bytes (Kokoro's `response_format:pcm` payload). */
function zeroPcmBase64(bytes: number): string {
  return Buffer.from(new Uint8Array(bytes)).toString('base64');
}

/**
 * Mock Kokoro: return a PCM clip whose duration is encoded by the input text — `PRE`=1s,
 * `B0`=2s, `B1`=1s — so block offsets are deterministic regardless of fetch order.
 */
function mockKokoro(sizes: Record<string, number>) {
  return vi.fn(async (_url: string, init?: { body?: string }) => {
    const input = JSON.parse(init?.body ?? '{}').input as string;
    const seconds = sizes[input] ?? 1;
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ audio: zeroPcmBase64(seconds * BYTES_PER_SECOND) }),
    } as unknown as Response;
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('synthesizeBlocks', () => {
  it('derives exact per-block offsets from PCM durations and excludes the preamble', async () => {
    vi.stubGlobal('fetch', mockKokoro({ PRE: 1, B0: 2, B1: 1 }));

    const result = await synthesizeBlocks({
      kokoroUrl: 'http://kokoro.test',
      voiceId: 'af_test',
      speed: 1,
      preambleText: 'PRE',
      blockTexts: ['B0', 'B1'],
    });

    // Preamble (1s) shifts block 0 to start at 1000ms but gets NO entry.
    expect(result.blocks).toEqual([
      { startMs: 1000, endMs: 3000 }, // B0: 2s
      { startMs: 3000, endMs: 4000 }, // B1: 1s
    ]);
    expect(result.durationMs).toBe(4000);
    expect(result.mp3.byteLength).toBeGreaterThan(0);
  });

  it('starts block 0 at 0 when there is no preamble', async () => {
    vi.stubGlobal('fetch', mockKokoro({ B0: 2, B1: 1 }));

    const result = await synthesizeBlocks({
      kokoroUrl: 'http://kokoro.test',
      voiceId: 'af_test',
      speed: 1,
      preambleText: null,
      blockTexts: ['B0', 'B1'],
    });

    expect(result.blocks).toEqual([
      { startMs: 0, endMs: 2000 },
      { startMs: 2000, endMs: 3000 },
    ]);
  });

  it('retries on 429 honoring Retry-After, then succeeds', async () => {
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls++;
      if (calls === 1) {
        return {
          ok: false,
          status: 429,
          headers: { get: (h: string) => (h === 'Retry-After' ? '0' : null) },
          text: async () => 'rate limited',
        } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({ audio: zeroPcmBase64(BYTES_PER_SECOND) }),
      } as unknown as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await synthesizeBlocks({
      kokoroUrl: 'http://kokoro.test',
      voiceId: 'af_test',
      speed: 1,
      blockTexts: ['only'],
    });

    expect(calls).toBe(2);
    expect(result.blocks).toEqual([{ startMs: 0, endMs: 1000 }]);
  });

  it('survives more consecutive throttles than the failure budget (a throttle is not a skip)', async () => {
    // MAX_RETRIES (failure budget) is 4 — a throttle must NOT count against it, or a
    // per-block bulk run dies on sustained 429s. Throttle 7× (> 4), then succeed.
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls++;
      if (calls <= 7) {
        return {
          ok: false,
          status: 429,
          headers: { get: (h: string) => (h === 'Retry-After' ? '0' : null) },
          text: async () => 'rate limited',
        } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({ audio: zeroPcmBase64(BYTES_PER_SECOND) }),
      } as unknown as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await synthesizeBlocks({
      kokoroUrl: 'http://kokoro.test',
      voiceId: 'af_test',
      speed: 1,
      blockTexts: ['only'],
    });

    expect(calls).toBe(8); // 7 throttles waited through, then the success
    expect(result.blocks).toEqual([{ startMs: 0, endMs: 1000 }]);
  });

  it('throws when given no text to synthesize', async () => {
    vi.stubGlobal('fetch', mockKokoro({}));
    await expect(
      synthesizeBlocks({
        kokoroUrl: 'http://kokoro.test',
        voiceId: 'af_test',
        speed: 1,
        blockTexts: [],
      })
    ).rejects.toThrow(/no text/i);
  });

  // ─── Story 22.12: proportional silences shift the offsets, outside the block ranges ──
  it('inserts lead-in + per-block gaps + trailing silence; blocks bound only the speech', async () => {
    vi.stubGlobal('fetch', mockKokoro({ PRE: 1, B0: 2, B1: 1 }));

    const result = await synthesizeBlocks({
      kokoroUrl: 'http://kokoro.test',
      voiceId: 'af_test',
      speed: 1,
      preambleText: 'PRE',
      blockTexts: ['B0', 'B1'],
      gaps: { leadInMs: 100, beforeBlockMs: [500, 250], trailingMs: 300 },
    });

    // Timeline: 100ms lead-in → PRE (1000) → 500ms gap → B0 (2000) → 250ms gap → B1 (1000)
    //           → 300ms trailing. Block ranges cover ONLY the spoken audio (gaps excluded).
    expect(result.blocks).toEqual([
      { startMs: 1600, endMs: 3600 }, // 100 + 1000 + 500 = 1600
      { startMs: 3850, endMs: 4850 }, // 3600 + 250 = 3850
    ]);
    expect(result.durationMs).toBe(5150); // 4850 + 300 trailing
  });
});

describe('computeBlockGaps', () => {
  const P = DEFAULT_GAP_POLICY;

  it('sizes each gap by the kind transition (with a spoken preamble)', () => {
    const blocks = [
      { kind: 'title' as const },
      { kind: 'paragraph' as const }, // body after a title
      { kind: 'paragraph' as const }, // para after a para
      { kind: 'title' as const }, // new section
      { kind: 'paragraph' as const }, // body after a title
    ];
    const gaps = computeBlockGaps(blocks, true);
    expect(gaps.leadInMs).toBe(P.leadInMs);
    expect(gaps.trailingMs).toBe(P.trailingMs);
    expect(gaps.beforeBlockMs).toEqual([
      P.afterIntroMs, // block 0, has preamble
      P.titleToBodyMs, // paragraph after title
      P.paraToParaMs, // paragraph after paragraph
      P.newSectionMs, // title
      P.titleToBodyMs, // paragraph after title
    ]);
  });

  it('uses a zero gap before block 0 when there is no preamble (no double lead-in)', () => {
    const gaps = computeBlockGaps([{ kind: 'paragraph' }, { kind: 'paragraph' }], false);
    expect(gaps.beforeBlockMs[0]).toBe(0);
    expect(gaps.beforeBlockMs[1]).toBe(P.paraToParaMs);
  });

  it('honors a policy override', () => {
    const gaps = computeBlockGaps([{ kind: 'title' }], true, { afterIntroMs: 1234, leadInMs: 5 });
    expect(gaps.leadInMs).toBe(5);
    expect(gaps.beforeBlockMs[0]).toBe(1234);
  });
});

// Story 24.3: the PCM→MP3 encoder is INJECTABLE (Mac path → native ffmpeg). The default stays
// the lamejs encoder (unchanged for the worker/box path).
describe('synthesizeBlocks — injectable encoder (Story 24.3)', () => {
  it('uses the injected encodePcm over the default lamejs encoder', async () => {
    vi.stubGlobal('fetch', mockKokoro({ B0: 1 }));
    const sentinel = new Uint8Array([1, 2, 3, 4]);
    const encodePcm = vi.fn(async (pcm: Uint8Array) => {
      // The encoder receives the full concatenated section PCM (1s = 48000 bytes here).
      expect(pcm.byteLength).toBe(BYTES_PER_SECOND);
      return sentinel;
    });

    const result = await synthesizeBlocks({
      kokoroUrl: 'http://kokoro.test',
      voiceId: 'af_test',
      speed: 1,
      preambleText: null,
      blockTexts: ['B0'],
      encodePcm,
    });

    expect(encodePcm).toHaveBeenCalledOnce();
    expect(result.mp3).toBe(sentinel); // the injected encoder's bytes, verbatim
    // Timings/duration are PCM-derived → independent of which encoder ran.
    expect(result.blocks).toEqual([{ startMs: 0, endMs: 1000 }]);
    expect(result.durationMs).toBe(1000);
  });

  it('falls back to the lamejs encoder when no encodePcm is passed', async () => {
    vi.stubGlobal('fetch', mockKokoro({ B0: 1 }));
    const result = await synthesizeBlocks({
      kokoroUrl: 'http://kokoro.test',
      voiceId: 'af_test',
      speed: 1,
      preambleText: null,
      blockTexts: ['B0'],
    });
    // A real MP3 came out of the default encoder (non-empty, and not our sentinel).
    expect(result.mp3.byteLength).toBeGreaterThan(0);
  });
});
