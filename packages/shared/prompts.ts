// Prompt contract — the content-generation prompts, extracted from the worker's
// ai-config.ts in Story 17.8 because they were then shared with it: no runtime logic,
// no node:/fetch/admin deps, a boundary CONTRACT rather than an implementation.
//
// The worker half is gone (Story 34.2 deleted the orphaned AI service tree, and with
// it the model/TTS config this note used to point at). The sole consumer today is
// tools/content-pipeline's `lib/local-batch.ts`, which composes these into the two
// per-book calls it makes against Workers AI (Story 24.9). The file stays here rather
// than moving into the pipeline: it is the prompt CONTRACT, and it is what a clone of
// this template reads first to see what the app generates.

import type { SectionType } from './schemas/section-types.js';

// =============================================================================
// Book Context shape (input to AI generation)
// =============================================================================

// Matches the InstantDB bookReferences entity. Story 22.4 dropped the Blinkist `bn*`
// generation-scratch columns — generation context now comes from the cached PDF (the
// dominant home-GPU path; strictly richer than the bn* snippets). Story 32.8: the field
// is `pdfKey` — an object key in the private source bucket (was `pdfUrl`, a public URL).
export interface BookReferenceContext {
  pdfKey?: string; // R2 object key (private source bucket) for AI context (Story 32.8)
}

// Full context for AI generation (book + reference).
export interface BookContext {
  // From books entity
  title: string;
  author: string;
  // From bookReferences (pdfKey → cached-PDF context; null when no reference)
  reference: BookReferenceContext | null;
}

// =============================================================================
// System Prompt
// =============================================================================

/**
 * System prompt establishing AI as expert book summarizer.
 * Used across all content generation requests (Workers and local batch).
 * Includes TTS formatting rules and English-only requirement.
 */
export const SYSTEM_PROMPT = `You are an expert book summarizer creating content for a book summary app.

CRITICAL - ENGLISH ONLY:
- ALL output MUST be in English, regardless of the source book's language
- If the book is in French, Dutch, German, Spanish, or any other language, TRANSLATE and summarize in English
- Do NOT copy any non-English text from the source material
- Do NOT include foreign language quotes - translate them to English

CONTENT GUIDELINES:
- Create ORIGINAL content inspired by the source material, never copy directly
- Write in clear, accessible language suitable for busy professionals
- Focus on actionable insights readers can apply immediately
- Maintain the author's key messages while making content concise

TTS FORMATTING (content will be converted to audio):
- Use simple punctuation: periods, commas, question marks
- NO special characters, markdown, bullets, or symbols
- NO numbering like "Key Takeaway 1" or "Quote #2" - just give the content directly
- Write in flowing paragraphs, not lists
- Spell out numbers under 100

The output must be valid JSON matching the specified schema.`;

// =============================================================================
// Book Context Builder
// =============================================================================

/**
 * Build formatted book context from reference data.
 * Formats inspiration data for inclusion in prompts.
 *
 * @param bookContext - Book title, author, and reference data
 * @returns Formatted string with book context
 */
export function buildBookContext(bookContext: BookContext): string {
  const { title, author } = bookContext;

  // Story 22.4 dropped the bn* inspiration snippets. Story 24.9 replaced the Gemini context cache
  // that succeeded them: the book's full text is now converted from `reference.pdfKey` and sent
  // INLINE in the prompt (`lib/book-text.ts` → `lib/local-batch.ts`), because Workers AI has no
  // cached-input tier for this model. Either way the prompt header carries only the book identity.
  const parts: string[] = [`Book Title: ${title}`, `Author: ${author}`];

  return parts.join('\n');
}

// =============================================================================
// Section Prompts (single source of truth for Workers + local batch)
// =============================================================================

/**
 * Section-specific prompts for content generation — the single source of truth for the pipeline.
 *
 * ⚠️ THE MODEL EMITS THE MINIMUM OF EVERY RANGE (Story 24.9 AC-12, measured across 5 real books). A
 * "5-10" ask returns 5, every time. So each range's LOW end is the setting; widening the top does
 * nothing. Raise a floor only where more is genuinely better — forcing more FAQ or quiz items buys
 * filler, not substance.
 *
 * ⚠️ Do NOT add "name the specific people and places from the book". It was considered and rejected
 * by the owner: these sections are NARRATED, so proper nouns are a TTS hazard, and a book's own
 * literary chapter titles usually serve a listener worse than thematic ones.
 */
export const PROMPTS = {
  // ⚠️ THE FLOOR IS STATED EMPHATICALLY, AND IT SITS ABOVE WHAT WE ACTUALLY WANT — deliberately.
  //
  // Both of these are short prose sections generated inside call A alongside `summaryInDepth`, and the
  // model returns the MINIMUM of whatever range it is given (Story 24.9 AC-12). A soft "(150-250
  // words)" therefore lands ON the acceptance gate's own floor — measured live at 119 words against a
  // 120-word threshold — and one word under costs a full re-ask that re-sends the whole book. The
  // long-form sections below never had this problem because they already state their floor as
  // "MINIMUM N WORDS REQUIRED"; these two did not, so they got the same treatment.
  //
  // Raising the ASK rather than lowering the GATE is the deliberate half of this. Lowering the gate
  // would reduce re-asks by accepting thinner sections, which is gaming the measure; the gate is
  // AC-9's and stays untouched. 170 still ships the shorter "About This Book" the owner asked for
  // (the superseded ask was 200-350, and Gemini's stored corpus runs 233-335). For summaryBrief, 220
  // also closes a real regression: the new pipeline was landing 129-158 words against a stored
  // 176-219, so the old ask was under-serving readers as well as the gate.
  aboutBook:
    (): string => `Write "About This Book" in 2-3 paragraphs. MINIMUM 170 WORDS REQUIRED. MAXIMUM 250 WORDS. Third person present tense. TTS-optimized: simple punctuation, no special characters.
Return JSON: {"paragraphs": ["First paragraph (5-7 sentences)...", "Second paragraph (5-7 sentences)...", "Optional third paragraph..."]}`,

  summaryBrief:
    (): string => `Write a brief summary in 2 paragraphs. MINIMUM 220 WORDS REQUIRED. MAXIMUM 280 WORDS. Focus on ONE main message. TTS-optimized: simple punctuation, no special characters.
Return JSON: {"paragraphs": ["First paragraph with core concept (5-6 sentences)...", "Second paragraph with key insight (5-6 sentences)..."]}`,

  summaryCore:
    (): string => `Write a detailed core summary. MINIMUM 900 WORDS REQUIRED. MAXIMUM 1100 WORDS.

STRUCTURE:
- 4-5 sections, each with: title + 3 paragraphs
- Each paragraph: 4-5 sentences (60-80 words each)
- Total: 900-1100 words

CONTENT: Cover 4-5 main concepts with specific examples from the book.

TTS FORMAT: Simple punctuation only. NO special characters, NO markdown, NO colons in section titles. Spell out numbers.

Return JSON: {"sections": [{"title": "Section Title", "paragraphs": ["Paragraph 1 (60+ words)...", "Paragraph 2 (60+ words)...", "Paragraph 3 (60+ words)..."]}, ...more sections]}

CRITICAL: If your output is under 900 words, add more detail to each paragraph.`,

  summaryInDepth:
    (): string => `Write a comprehensive in-depth summary. MINIMUM 2500 WORDS REQUIRED. MAXIMUM 3000 WORDS.

STRUCTURE:
- 7-9 sections, each with: title + 3-5 paragraphs
- Each paragraph: 5-7 sentences (80-100 words each)
- Total: 2500-3000 words

CONTENT: Cover ALL major concepts, frameworks, and key stories from the book. Include specific examples, research findings, and case studies.

TTS FORMAT: Simple punctuation only. NO special characters, asterisks, or markdown, NO colons in section titles. Spell out numbers under 100.

Return JSON: {"sections": [{"title": "Section Title Here", "paragraphs": ["Paragraph 1 (80+ words with specific details)...", "Paragraph 2 (80+ words)...", "Paragraph 3 (80+ words)...", "Paragraph 4 (80+ words)..."]}, ...more sections]}

CRITICAL: Count your words. If under 2500, expand EVERY section with more examples and detail.`,

  keyTakeaways: (): string =>
    `Generate 7-10 key takeaways. Each has a title (action phrase) and description (2-3 sentences, 40-60 words). Return JSON: {"takeaways": [{"title": "...", "description": "..."}]}`,

  // ⚠️ EMPHATIC ON PURPOSE — a plain "7-8" gets 5 or 6 here, and the difference is a whole extra
  // book-send. `notableQuotes` is generated inside the six-section structured call, which runs in
  // LOOSE json mode — not because this section is unconstrainable, but because `shouldConstrain`
  // (local-batch.ts) only constrains a call carrying ONE section, and this call carries six. The
  // by-name exclusion in `UNCONSTRAINABLE_SECTIONS` is `quizQuestions` alone, so pointing here at
  // that set was wrong; `shouldConstrain` is the predicate that decides this. With no schema
  // enforcing `minItems`, a
  // range instruction competing with the five other sections in that call is simply under-served:
  // measured on the same book, "Select 7-8" returned 6 and the wording below returned 7, and before
  // this change EVERY book in the proving run needed a paid re-ask for this one section (100%, the
  // rate AC-4 calls a stop-and-escalate signal). The single-section re-ask DOES carry a schema,
  // which is why it always succeeded — the floor was real, it just cost a second book-send to reach.
  // 7-8 rather than 5-8 because quotes also feed the daily-quote bundle, so their volume pays twice.
  notableQuotes: (): string =>
    `Select EXACTLY 7 notable quotes — you MUST return 7, no fewer. Count them before returning. Each has the quote and an explanation (2-3 sentences). Return JSON: {"quotes": [{"quote": "...", "explanation": "..."}]}`,

  faq: (): string =>
    `Generate 5-10 FAQ pairs. Each answer should be 2-3 sentences. Return JSON: {"questions": [{"question": "...", "answer": "..."}]}`,

  // ⚠️ THE EXAMPLE'S OPTIONS MUST NEVER BE "A", "B", "C", "D" — the model copies them verbatim.
  // This example previously showed `"options": ["A", "B", "C", "D"]`. An example placeholder is not
  // decoration; it is the strongest instruction in a prompt.
  //
  // ⚠️ WHAT IT ACTUALLY PRODUCED IS A PREFIX, NOT A LETTERS-ONLY OPTION — corrected 2026-08-10
  // against the live corpus. This comment used to assert that the corpus held banks "whose options
  // are those literal single letters: a question with four meaningless answers". Both halves are
  // false: what is there is a real, substantive answer wearing an enumeration label
  // (`"A) To achieve personal happiness."`), and `correctAnswer` points at the right one. Those
  // banks were repaired in place rather than regenerated, precisely because the content was never
  // meaningless. Recorded here because this comment's wrong framing is what sent `epics.md` and
  // Story 24.39's own first pass after the wrong shape.
  //
  // The measured figures deliberately do NOT live here. They were wrong twice before they were
  // right, they have exactly one home — `_bmad-output/implementation-artifacts/
  // 24-39-quiz-letter-options-purge.md` — and a census copied into a docblock is a number nothing
  // maintains (`stack/gates-scanners.md`).
  //
  // ⚠️ AND THE SENTENCE BELOW DOES NOT COVER THE PREFIX, which is why it is not the only guard.
  // "never a letter, a number, or a placeholder" is satisfied by `"A) To achieve…"` — that IS a real,
  // substantive answer in the book's own terms; it is a good answer wearing a label. The explicit
  // "never prefix an option with its position" instruction below closes the wording gap, and
  // `normalizeQuizBankForStorage` (tools/content-pipeline) DROPS a question whose options carry
  // their own position, because a prompt line alone is not a gate. ⚠️ Keep the spellings named below
  // and the detector's alphabet in step: teaching the model against a form the gate cannot see is
  // how this defect got its second life (Step G round 1 found exactly that, for `"d -"`).
  quizQuestions: (): string =>
    `Generate 20 multiple choice questions testing comprehension. Each has exactly 4 options and correctAnswer (0-3), where correctAnswer is the ZERO-BASED INDEX of the right option. Every option must be a real, substantive answer in the book's own terms — never a letter, a number, or a placeholder. NEVER prefix an option with its position: no "A)", "B.", "c:" or "d -" at the start of an option. The option text must begin with the answer itself. Return JSON: {"questions": [{"question": "What does the author identify as the root cause of...?", "options": ["A full sentence stating one plausible answer", "A second plausible answer", "A third plausible answer", "A fourth plausible answer"], "correctAnswer": 0}]}`,
} as const;

/**
 * Get section-specific instructions by type.
 * Convenience function for getting prompts dynamically.
 */
export function getSectionPrompt(sectionType: SectionType): string {
  return PROMPTS[sectionType]();
}
