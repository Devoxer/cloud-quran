// Canonical content section enums — the boundary contract between the worker,
// the pre-generation scripts, and the app. Single source of truth (Story 17.1):
// `apps/worker/src/constants.ts` re-exports these so worker code keeps importing
// from `../constants`, while the shared zod schemas (generate-content) build
// their enums from the SAME arrays — no drift.

// Every content section the worker can generate.
export const SECTION_TYPES = [
  'aboutBook',
  'summaryBrief',
  'summaryCore',
  'summaryInDepth',
  'keyTakeaways',
  'notableQuotes',
  'faq',
  'quizQuestions',
] as const;

export type SectionType = (typeof SECTION_TYPES)[number];

/**
 * Book-detail preview length per PROSE section — the number of body lines the section shows before
 * "Read more" (Story 26.12 graduated hierarchy: About 2 · Brief 3 · Core 4 · In-Depth 6). Single
 * source of truth so the CLIENT (`numberOfLines`) and the CONTENT PIPELINE (Story 32.6 — the excerpt
 * preview slice is sized to fill exactly these lines, then the client clips) can't drift. The
 * structured sections (keyTakeaways/notableQuotes/faq) show ONE item, not lines, so they're not here.
 */
export const SECTION_PREVIEW_LINES: Record<string, number> = {
  aboutBook: 2,
  summaryBrief: 3,
  summaryCore: 4,
  summaryInDepth: 6,
};

// Audio-enabled section types (excludes quizQuestions — no audio for quiz).
export const AUDIO_SECTION_TYPES = [
  'aboutBook',
  'summaryBrief',
  'summaryCore',
  'summaryInDepth',
  'keyTakeaways',
  'notableQuotes',
  'faq',
] as const;

export type AudioSectionType = (typeof AUDIO_SECTION_TYPES)[number];
