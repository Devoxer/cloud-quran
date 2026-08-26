// Block-level audio-sync contract (Story 22.9) — the isomorphic layer shared by the
// app (synced/read highlighting + tap-to-seek), the worker, and the
// tools/content-pipeline pre-generation writer.
//
// Each *displayed block* (a section title, a paragraph, an FAQ question/answer, …)
// is TTS'd as its own audio clip at generation time and concatenated; its
// `[startMs,endMs]` is therefore its REAL clip duration, not a character-proportion
// estimate. The block sidecar stores one `{startMs,endMs}` per displayed block in
// render order, 1:1 with what `splitIntoBlocks` produces — so the app maps
// `displayedBlock[i] ↔ blocks[i]` by index, with zero alignment heuristics and no
// dependency on any TTS model emitting word timestamps.
//
// The single source of truth for "what the displayed blocks are" is `splitIntoBlocks`
// here: BOTH the writer (to know what to TTS, in order) and the app renderer (to know
// what to display + which block to highlight) call it, so the index contract holds by
// construction. `parseContent` (DB content → `ParsedContent`) also lives here so both
// sides parse identically.

import { z } from 'zod';

// ─── Range + sidecar contract ──────────────────────────────────────────────────

/** A single displayed block's audio time span (exact, from the concatenation offset). */
export const BlockRangeSchema = z.object({
  startMs: z.number(),
  endMs: z.number(),
});

export type BlockRange = z.infer<typeof BlockRangeSchema>;

/**
 * The R2 content sidecar at `content/{bookId}/{sectionType}.json`.
 *
 * - `content` (Story 22.4): the section's raw stored value — the home-of-record for the
 *   text now that the `summaries` entity is dropped. Permissively typed (`z.unknown()`)
 *   because the stored shape VARIES by section (a JSON string, a native object, or a
 *   native array — exactly what `parseContent` infers from). `parseContent(content)`
 *   feeds BOTH the app renderer and the writer's `splitIntoBlocks`, so the
 *   `displayedBlock[i] ↔ blocks[i]` index contract holds by construction. Absent for a
 *   not-yet-migrated object (read falls back to the offline cache).
 * - `blocks` (Story 22.9): one `{startMs,endMs}` per DISPLAYED block, in render order;
 *   the spoken preamble is excluded (its duration is the offset before
 *   `blocks[0].startMs`). Defaults to `[]` for a non-audio section (e.g. `quizQuestions`)
 *   or a content-only write made before audio generation.
 */
export const ContentSidecarSchema = z.object({
  content: z.unknown().optional(),
  blocks: z.array(BlockRangeSchema).default([]),
});

export type ContentSidecar = z.infer<typeof ContentSidecarSchema>;

/**
 * Index of the block active at a given playback time — the last block whose `startMs`
 * is at or before `timeMs`. Returns `-1` when there are no blocks OR when `timeMs`
 * precedes `blocks[0].startMs` (the un-displayed preamble is playing → highlight
 * nothing). Exact, model-agnostic: there is nothing to drift.
 */
export function findBlockAtTime(blocks: BlockRange[], timeMs: number): number {
  if (!blocks || blocks.length === 0) return -1;
  if (timeMs < blocks[0].startMs) return -1;
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (timeMs >= blocks[i].startMs) return i;
  }
  return -1;
}

// ─── Parsed content model (DB content → renderable shape) ────────────────────────

export interface ContentSection {
  title: string;
  paragraphs: string[];
}

export interface TakeawayItem {
  title: string;
  description: string;
}

export interface QuoteItem {
  quote: string;
  explanation: string;
}

export interface FAQItem {
  question: string;
  answer: string;
}

/**
 * The renderable shape of a section's content, inferred from the stored JSON's SHAPE
 * (not the DB sectionType) by `parseContent`. The app renders from this; the writer
 * derives its per-block TTS units from the SAME parsed value, so both agree.
 */
export interface ParsedContent {
  type: 'paragraphs' | 'sections' | 'text' | 'takeaways' | 'quotes' | 'faq';
  paragraphs?: string[];
  sections?: ContentSection[];
  text?: string;
  takeaways?: TakeawayItem[];
  quotes?: QuoteItem[];
  faq?: FAQItem[];
}

/**
 * Parse stored summary content (JSON string, native object, or native array) into a
 * `ParsedContent`. Inference is by shape so the app (reads `summaries.content`) and the
 * writer (TTSes the same value) produce the identical structure. Returns `null` for
 * unrecognized input (the caller renders plain text / no blocks).
 */
export function parseContent(input?: unknown): ParsedContent | null {
  if (input === null || input === undefined) return null;

  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
      return { type: 'text', text: input };
    }
    try {
      return parseContent(JSON.parse(input));
    } catch {
      return { type: 'text', text: input };
    }
  }

  // Direct arrays (InstantDB may return JSON arrays for json fields)
  if (Array.isArray(input)) {
    if (input.length > 0) {
      const first = input[0];
      if (typeof first === 'object' && first !== null) {
        if ('title' in first && 'description' in first) {
          return { type: 'takeaways', takeaways: input as TakeawayItem[] };
        }
        if ('quote' in first && 'explanation' in first) {
          return { type: 'quotes', quotes: input as QuoteItem[] };
        }
        if ('question' in first && 'answer' in first) {
          return { type: 'faq', faq: input as FAQItem[] };
        }
      }
    }
    return null;
  }

  if (typeof input === 'object') {
    const obj = input as Record<string, unknown>;

    if ('paragraphs' in obj && Array.isArray(obj.paragraphs)) {
      return { type: 'paragraphs', paragraphs: obj.paragraphs as string[] };
    }
    if ('sections' in obj && Array.isArray(obj.sections)) {
      return { type: 'sections', sections: obj.sections as ContentSection[] };
    }
    if ('takeaways' in obj && Array.isArray(obj.takeaways)) {
      return { type: 'takeaways', takeaways: obj.takeaways as TakeawayItem[] };
    }
    if ('quotes' in obj && Array.isArray(obj.quotes)) {
      return { type: 'quotes', quotes: obj.quotes as QuoteItem[] };
    }
    if ('questions' in obj && Array.isArray(obj.questions)) {
      return { type: 'faq', faq: obj.questions as FAQItem[] };
    }
  }

  return null;
}

// ─── Block splitter (the 1:1 index hinge) ────────────────────────────────────────

/**
 * A single displayed block. `text` is what the APP renders (index-aligned to the
 * sidecar); `ttsText` is what the WRITER speaks for it (prosody decoration — quotes
 * around titles/quotes, a trailing period for clean standalone-clip pacing). `kind`
 * drives the app's title-vs-body styling; `groupIndex` groups a title with the
 * paragraphs that follow it (a "section" visually).
 */
export interface DisplayBlock {
  kind: 'title' | 'paragraph';
  text: string;
  ttsText: string;
  groupIndex: number;
}

/** Ensure text ends with sentence-ending punctuation, for clean standalone TTS pacing. */
export function ensurePeriod(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  if (/[.!?]$/.test(trimmed)) return trimmed;
  return `${trimmed}.`;
}

/**
 * Split parsed content into the ordered displayed blocks — the SINGLE source of truth
 * the app renderer and the writer both consume, so `displayedBlock[i] ↔ sidecar.blocks[i]`
 * holds by construction. Empty input (no parsed content) → `[]` (caller renders plain
 * text / nothing). The spoken preamble ("This is a … summary of …") is NOT a
 * block here — it is TTS'd separately by the writer with no sidecar entry.
 */
export function splitIntoBlocks(parsed: ParsedContent | null | undefined): DisplayBlock[] {
  if (!parsed) return [];

  const blocks: DisplayBlock[] = [];
  let groupIndex = 0;
  const push = (kind: 'title' | 'paragraph', text: string, ttsText: string) => {
    // Skip a block with no speakable content (a blank/whitespace-only source — e.g. an
    // empty paragraph in generated content). Both the writer and the app call this same
    // splitter, so filtering here keeps `displayedBlock[i] ↔ blocks[i]` 1:1 by
    // construction AND stops the writer issuing an empty Kokoro request, which returns no
    // audio and would fail the WHOLE section's synthesis over one stray empty unit.
    if (!/[\p{L}\p{N}]/u.test(ttsText)) return;
    blocks.push({ kind, text, ttsText, groupIndex });
  };

  switch (parsed.type) {
    case 'sections': {
      for (const section of parsed.sections ?? []) {
        push('title', section.title, `"${ensurePeriod(section.title)}"`);
        for (const para of section.paragraphs ?? []) {
          push('paragraph', para, ensurePeriod(para));
        }
        groupIndex++;
      }
      break;
    }
    case 'faq':
      for (const item of parsed.faq ?? []) {
        push('title', item.question, ensurePeriod(item.question));
        push('paragraph', item.answer, ensurePeriod(item.answer));
        groupIndex++;
      }
      break;
    case 'takeaways':
      for (const item of parsed.takeaways ?? []) {
        push('title', item.title, `"${ensurePeriod(item.title)}"`);
        push('paragraph', item.description, ensurePeriod(item.description));
        groupIndex++;
      }
      break;
    case 'quotes':
      for (const item of parsed.quotes ?? []) {
        push('title', `"${item.quote}"`, `"${ensurePeriod(item.quote)}"`);
        push('paragraph', item.explanation, ensurePeriod(item.explanation));
        groupIndex++;
      }
      break;
    case 'paragraphs':
      for (const para of parsed.paragraphs ?? []) {
        push('paragraph', para, ensurePeriod(para));
        groupIndex++;
      }
      break;
    case 'text':
      push('paragraph', parsed.text || '', ensurePeriod(parsed.text || ''));
      break;
  }

  return blocks;
}
