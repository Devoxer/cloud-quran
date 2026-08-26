// Per-block TTS → PCM concat → single-MP3 encode (Story 22.9).
//
// Runtime-neutral (runs in Node `tools/` AND Cloudflare Workers): pure PCM/ArrayBuffer
// ops + a pure-JS MP3 encoder (@breezystack/lamejs), with the Kokoro URL passed as a
// PARAM — this module NEVER reads `process.env`/`env`. It owns the one model-specific
// concern (the Kokoro request shape + where each clip's bytes come from); everything
// downstream (offsets, encoding, the sidecar) is model-agnostic and duration-derived.
//
// Why PCM-concat-then-encode-ONCE (not per-block MP3 byte-concat): byte-concat bakes
// the MP3 encoder's delay+padding silence at EVERY seam (N gaps); concatenating raw PCM
// and encoding once carries that only at the section start/end → the inaudible-seam
// result the owner listen-tested. Per-block `endMs` comes from the PCM SAMPLE offset,
// exact and independent of the final MP3 encoding.

import { Mp3Encoder } from '@breezystack/lamejs';
import type { BlockRange, DisplayBlock } from './blocks.js';

// Kokoro native output: signed 16-bit little-endian PCM, 24 kHz, mono.
const SAMPLE_RATE = 24_000;
const CHANNELS = 1;
const BYTES_PER_SAMPLE = 2;
const BYTES_PER_SECOND = SAMPLE_RATE * BYTES_PER_SAMPLE * CHANNELS;
/** Speech, mono, 24 kHz — 64 kbps is transparent and ~⅓ the size of WAV. */
const MP3_KBPS = 64;
/** lamejs encodes frame-by-frame; 1152 samples is the canonical MP3 frame size. */
const MP3_FRAME_SAMPLES = 1152;

const DEFAULT_CONCURRENCY = 4;
/** Genuine failures (network error) retried with backoff before the clip gives up. */
const MAX_RETRIES = 4;
/** 429/503 throttle waits — NOT failures (don't spend the failure budget); bounded so a
 *  permanently-throttling server can't hang a clip forever. */
const MAX_THROTTLE_WAITS = 20;
const DEFAULT_RETRY_DELAY_MS = 2_000;
/** Clamp a server-supplied `Retry-After` so one absurd value can't stall a run for hours. */
const MAX_RETRY_AFTER_MS = 60_000;
/** Bounds a hung GPU request. ⚠️ This is QUEUE WAIT, not synthesis time — "a per-block clip is
 *  short" was the reasoning behind the old 5 min, and it measured the wrong thing. A block waits
 *  behind everything already queued, and with the batching shim holding 12-18 blocks that wait
 *  exceeds 5 min for SHORT blocks too: over the completed French catalog 2,422 clips timed out
 *  across every section type in proportion to count, including the two shortest ones, forcing 12.5%
 *  of the catalog to be re-synthesized on a later cycle after the GPU had usually already done the
 *  work. Must stay ABOVE the shim's `_ENQUEUE_TIMEOUT_S` (900s) so the shim fails first with a
 *  specific cause instead of this reporting a generic "no response". */
const PER_CLIP_TIMEOUT_MS = 1_200_000;

export interface SynthesizeBlocksOptions {
  /** Base URL of the Kokoro server (e.g. `process.env.KOKORO_API_URL`) — passed in. */
  kokoroUrl: string;
  /** The ONE voice id for the whole section (per-block re-pick = audible voice changes). */
  voiceId: string;
  /** Voice speed (Kokoro `speed`). */
  speed: number;
  /** Spoken preamble ("This is a … summary of …") — clip 0, NO sidecar entry. `null`/empty to omit. */
  preambleText?: string | null;
  /** The displayed blocks' TTS text, in render order (1:1 with the returned `blocks`). */
  blockTexts: string[];
  /** Max concurrent Kokoro calls (home GPU — keep modest). Default 4. */
  concurrency?: number;
  /**
   * Proportional silences to insert (Story 22.12) — lead-in, a gap before each block
   * (aligned 1:1 with `blockTexts`), and a trailing pad. Omit for back-to-back clips (the
   * pre-22.12 behavior). Build via {@link computeBlockGaps}. The silence sits OUTSIDE every
   * block's [startMs,endMs], so highlighting tracks only the spoken audio.
   */
  gaps?: BlockGaps;
  /**
   * Story 24.3: the s16le/24k/mono PCM → MP3 encoder, INJECTED. Default = the pure-JS
   * lamejs {@link encodePcmToMp3} (~1× realtime) — unchanged for the worker/box path and
   * every existing test. The Mac/MLX pipeline passes a native-`ffmpeg`-subprocess encoder
   * (~50–100× realtime) from the Node tooling. It is a PARAM (never an import here) so the
   * heavy/Node-only ffmpeg dep can NEVER reach the app/web bundle through `packages/shared`
   * — this module stays runtime-neutral (STACK-CHEAT-SHEET § build-tool dep). May be async
   * (a subprocess); the result is awaited.
   */
  encodePcm?: (pcm: Uint8Array) => Uint8Array | Promise<Uint8Array>;
}

export interface SynthesizeBlocksResult {
  /** The single concatenated section MP3. */
  mp3: Uint8Array;
  /** One `{startMs,endMs}` per displayed block, in order — the block sidecar payload. */
  blocks: BlockRange[];
  /** Total audio duration (ms), from the final PCM sample offset. */
  durationMs: number;
}

export class KokoroSynthesisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KokoroSynthesisError';
  }
}

// ─── Proportional silences (Story 22.12) ─────────────────────────────────────────
//
// The per-block clips used to be concatenated back-to-back (zero gap), so a heading ran
// straight into its first sentence and paragraphs blurred together. We now insert a
// silence gap BEFORE each block, sized by the block-type transition, plus a lead-in and a
// trailing pad. The gap is silence OUTSIDE every block's [startMs,endMs] range, so the app
// highlights a block only while it's spoken, then nothing during the gap — natural pacing,
// correct highlighting. Tunable by ear on the pilot regen.

/** Default per-transition gap durations (ms). Tunable; override via `BlockGapPolicy`. */
export const DEFAULT_GAP_POLICY = {
  /** Silence before the very first clip (preamble or first block) — avoids an abrupt start. */
  leadInMs: 150,
  /** After the spoken preamble, before the first content block. */
  afterIntroMs: 550,
  /** Before a `title` block — a new section / FAQ question / takeaway / quote. */
  newSectionMs: 550,
  /** A `title`/question → its body/answer (`paragraph` right after a `title`). */
  titleToBodyMs: 300,
  /** Between consecutive `paragraph`s — a gentle breath. */
  paraToParaMs: 250,
  /** Silence after the last clip — a clean section tail. */
  trailingMs: 300,
} as const;

export type BlockGapPolicy = Partial<Record<keyof typeof DEFAULT_GAP_POLICY, number>>;

/** The resolved silences for one section: lead-in, a gap before each block, and a tail. */
export interface BlockGaps {
  leadInMs: number;
  /** Aligned 1:1 with the section's blocks (index i = gap before block i). */
  beforeBlockMs: number[];
  trailingMs: number;
}

/**
 * Compute the proportional silence (ms) to insert before each block, from the block KINDS
 * (not `groupIndex` — a `title` reliably marks a new logical unit, while a 'paragraphs'
 * section makes every paragraph its own group, which would over-gap a flowing summary).
 * Policy:
 * - block 0: the after-preamble gap when a preamble is spoken, else 0 (the lead-in covers the
 *   start — no double gap).
 * - a `title`: the big new-section gap.
 * - a `paragraph` right after a `title` (section body / FAQ answer / takeaway): a medium beat.
 * - a `paragraph` after a `paragraph`: a gentle breath.
 */
export function computeBlockGaps(
  blocks: readonly Pick<DisplayBlock, 'kind'>[],
  hasPreamble: boolean,
  policy?: BlockGapPolicy
): BlockGaps {
  const p = { ...DEFAULT_GAP_POLICY, ...policy };
  const beforeBlockMs = blocks.map((block, i) => {
    if (i === 0) return hasPreamble ? p.afterIntroMs : 0;
    if (block.kind === 'title') return p.newSectionMs;
    return blocks[i - 1].kind === 'title' ? p.titleToBodyMs : p.paraToParaMs;
  });
  return { leadInMs: p.leadInMs, beforeBlockMs, trailingMs: p.trailingMs };
}

// ─── base64 → bytes (runtime-neutral; `atob` exists in Node 16+ and Workers) ─────
function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function pcmBytesToMs(byteOffset: number): number {
  return Math.round((byteOffset / BYTES_PER_SECOND) * 1000);
}

/** A silence duration (ms) → a sample-aligned byte count (s16le → even). 0 for ms ≤ 0. */
function msToSilenceBytes(ms: number): number {
  if (ms <= 0) return 0;
  const bytes = Math.round((ms / 1000) * BYTES_PER_SECOND);
  return bytes - (bytes % BYTES_PER_SAMPLE);
}

/** Parse a Retry-After header (delta-seconds; HTTP-date unsupported → default), clamped. */
function retryAfterMs(header: string | null): number {
  if (!header) return DEFAULT_RETRY_DELAY_MS;
  const seconds = Number(header);
  if (!Number.isFinite(seconds) || seconds < 0) return DEFAULT_RETRY_DELAY_MS;
  return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch one clip's raw s16le PCM bytes from Kokoro. Honors 429/503 with `Retry-After`
 * (a throttle wait is NOT a failure — retry the same clip). `return_timestamps` is
 * intentionally omitted (Story 22.9 — timings come from durations, not word tokens).
 */
async function fetchClipPcm(
  text: string,
  opts: { kokoroUrl: string; voiceId: string; speed: number }
): Promise<Uint8Array> {
  const url = `${opts.kokoroUrl.replace(/\/$/, '')}/dev/captioned_speech`;

  // Two independent budgets: genuine failures (network errors) spend `failures`; a
  // 429/503 throttle is NOT a failure (per-block multiplies calls 10–30×/section, so a
  // sustained throttle must WAIT the server's window and retry the SAME clip) and spends
  // the separate, bounded `throttleWaits` instead.
  let failures = 0;
  let throttleWaits = 0;
  for (;;) {
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: text,
          voice: opts.voiceId,
          model: 'kokoro',
          response_format: 'pcm',
          speed: opts.speed,
          stream: false,
        }),
        signal: AbortSignal.timeout(PER_CLIP_TIMEOUT_MS),
      });
    } catch (err) {
      if (failures < MAX_RETRIES) {
        await delay(DEFAULT_RETRY_DELAY_MS * 2 ** failures);
        failures++;
        continue;
      }
      throw new KokoroSynthesisError(
        `Kokoro request failed after ${MAX_RETRIES + 1} attempts: ${(err as Error).message}`
      );
    }

    if (response.status === 429 || response.status === 503) {
      if (throttleWaits < MAX_THROTTLE_WAITS) {
        await delay(retryAfterMs(response.headers.get('Retry-After')));
        throttleWaits++;
        continue;
      }
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new KokoroSynthesisError(`Kokoro API ${response.status}: ${detail.slice(0, 200)}`);
    }

    const json = (await response.json()) as { audio?: string };
    if (!json.audio) {
      throw new KokoroSynthesisError('Kokoro response missing audio data');
    }
    return base64ToBytes(json.audio);
  }
}

/** Run `task` over `items` with at most `limit` in flight, preserving result order. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await task(items[i], i);
    }
  };
  const workers = Array.from({ length: Math.min(Math.max(1, limit), items.length || 1) }, worker);
  await Promise.all(workers);
  return results;
}

function encodePcmToMp3(pcm: Uint8Array): Uint8Array {
  // Fresh 0-offset buffer → the Int16Array view is 2-byte aligned (subarray of an
  // offset Uint8Array would not be). Drop a dangling odd byte (never expected on s16le).
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 2));
  const encoder = new Mp3Encoder(CHANNELS, SAMPLE_RATE, MP3_KBPS);
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < samples.length; i += MP3_FRAME_SAMPLES) {
    const frame = samples.subarray(i, i + MP3_FRAME_SAMPLES);
    const encoded = encoder.encodeBuffer(frame);
    if (encoded.length > 0) chunks.push(encoded);
  }
  const tail = encoder.flush();
  if (tail.length > 0) chunks.push(tail);

  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const mp3 = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    mp3.set(c, offset);
    offset += c.length;
  }
  return mp3;
}

/**
 * TTS each displayed block (plus the optional preamble) as its own Kokoro PCM clip,
 * concatenate the raw PCM sample-accurately, and encode ONE section MP3. Block timings
 * are the cumulative concatenation offsets in samples (exact ms) — the preamble shifts
 * `blocks[0].startMs` but gets no entry. One fixed voice for the whole section.
 */
export async function synthesizeBlocks(
  opts: SynthesizeBlocksOptions
): Promise<SynthesizeBlocksResult> {
  const { kokoroUrl, voiceId, speed, preambleText, blockTexts, gaps } = opts;
  const concurrency = opts.concurrency ?? DEFAULT_CONCURRENCY;
  // Story 24.3: encoder injected; default = the pure-JS lamejs encoder (worker/box path).
  const encode = opts.encodePcm ?? encodePcmToMp3;

  const hasPreamble = !!preambleText && preambleText.trim().length > 0;
  // Clip order: [preamble?, ...blocks]. The preamble is index 0 with no sidecar entry.
  const clipTexts = hasPreamble ? [preambleText as string, ...blockTexts] : [...blockTexts];
  if (clipTexts.length === 0) {
    throw new KokoroSynthesisError('synthesizeBlocks called with no text to synthesize');
  }

  const clipPcms = await mapWithConcurrency(clipTexts, concurrency, (text) =>
    fetchClipPcm(text, { kokoroUrl, voiceId, speed })
  );

  // Story 22.12: proportional silences. A silence region is just un-written (zero) bytes in
  // the zero-initialized output buffer — we ADVANCE the offset past it without writing, so a
  // gap costs no separate buffer and lands OUTSIDE every block's [startMs,endMs] range.
  const leadInBytes = msToSilenceBytes(gaps?.leadInMs ?? 0);
  const trailingBytes = msToSilenceBytes(gaps?.trailingMs ?? 0);
  const beforeBlockBytes = (blockIndex: number) =>
    msToSilenceBytes(gaps?.beforeBlockMs?.[blockIndex] ?? 0);

  let gapTotal = leadInBytes + trailingBytes;
  for (let i = 0; i < clipPcms.length; i++) {
    if (!(hasPreamble && i === 0)) gapTotal += beforeBlockBytes(hasPreamble ? i - 1 : i);
  }
  const totalBytes = clipPcms.reduce((sum, c) => sum + c.byteLength, gapTotal);

  // Concatenate PCM in order with the silence gaps; record each block's [start,end] → ms.
  const concatenated = new Uint8Array(totalBytes);
  const blocks: BlockRange[] = [];
  let byteOffset = leadInBytes; // skip the lead-in silence (already zeros)
  for (let i = 0; i < clipPcms.length; i++) {
    const isPreamble = hasPreamble && i === 0;
    // The preamble has no preceding gap (only the lead-in). Every block gets its gap first.
    if (!isPreamble) byteOffset += beforeBlockBytes(hasPreamble ? i - 1 : i);
    const startMs = pcmBytesToMs(byteOffset);
    concatenated.set(clipPcms[i], byteOffset);
    byteOffset += clipPcms[i].byteLength;
    const endMs = pcmBytesToMs(byteOffset);
    if (!isPreamble) {
      blocks.push({ startMs, endMs });
    }
  }
  // The trailing silence is the remaining zeros up to `totalBytes`.

  const mp3 = await encode(concatenated);
  return { mp3, blocks, durationMs: pcmBytesToMs(totalBytes) };
}
