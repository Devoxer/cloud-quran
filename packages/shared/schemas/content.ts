import { z } from 'zod';

// =============================================================================
// JSON Schemas for Structured Content Storage
// =============================================================================
// NOTE (Story 17.1): This file holds only the boundary *schemas* (shared by the
// worker, the pre-gen scripts, and the app). Worker-internal helpers that operate
// on these shapes (word counting, plain-text conversion, format validation, quiz
// normalization) live in `apps/worker/src/schemas/content.ts` and import the
// types/schemas from here.

/**
 * Paragraphs-based content (aboutBook, summaryBrief)
 * Stored as: { paragraphs: ["...", "..."] }
 */
export const ParagraphsSchema = z.object({
  paragraphs: z.array(z.string().min(50)).min(2).max(5),
});

export type Paragraphs = z.infer<typeof ParagraphsSchema>;

/**
 * Sections-based content (summaryCore, summaryInDepth)
 * Stored as: { sections: [{ title: "...", paragraphs: ["...", "..."] }] }
 */
export const SectionsSchema = z.object({
  sections: z
    .array(
      z.object({
        title: z.string().min(3).max(100),
        paragraphs: z.array(z.string().min(30)).min(2).max(5),
      })
    )
    .min(3)
    .max(12),
});

export type Sections = z.infer<typeof SectionsSchema>;

// KeyTakeaway item schema
const KeyTakeawayItemSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(20).max(500),
});

// KeyTakeaways schema - 5-10 actionable insights
export const KeyTakeawaysSchema = z.object({
  takeaways: z.array(KeyTakeawayItemSchema).min(5).max(10),
});

export type KeyTakeaways = z.infer<typeof KeyTakeawaysSchema>;

// NotableQuote item schema
// Transform strips leading/trailing quotation marks (AI sometimes includes them)
// UI adds quotes on display, so we store clean text to avoid double quotes
export const NotableQuoteItemSchema = z.object({
  quote: z
    .string()
    .transform((s) => s.replace(/^["'"'"]+|["'"'"]+$/g, '').trim())
    .pipe(z.string().min(10).max(500)),
  explanation: z.string().min(20).max(400),
});

// NotableQuotes schema - 5-8 memorable quotes with explanations
export const NotableQuotesSchema = z.object({
  quotes: z.array(NotableQuoteItemSchema).min(5).max(8),
});

export type NotableQuotes = z.infer<typeof NotableQuotesSchema>;

// FAQ item schema
const FAQItemSchema = z.object({
  question: z.string().min(10).max(300),
  answer: z.string().min(20).max(600),
});

// FAQ schema - 5-10 question/answer pairs
export const FAQSchema = z.object({
  questions: z.array(FAQItemSchema).min(5).max(10),
});

export type FAQ = z.infer<typeof FAQSchema>;

// QuizQuestion item schema (exported for the quiz route + QuizRunner — Story 25.1)
export const QuizQuestionItemSchema = z.object({
  question: z.string().min(10).max(400),
  options: z
    .array(z.string().min(1).max(400))
    .length(4)
    .refine((opts) => new Set(opts).size === 4, {
      message: 'All 4 options must be unique',
    }),
  correctAnswer: z.number().int().min(0).max(3),
});

export type QuizQuestionItem = z.infer<typeof QuizQuestionItemSchema>;

// QuizQuestions schema - 15-25 multiple choice questions
export const QuizQuestionsSchema = z.object({
  questions: z.array(QuizQuestionItemSchema).min(15).max(25),
});

export type QuizQuestions = z.infer<typeof QuizQuestionsSchema>;

// =============================================================================
// Cross-book quiz ROUND shapes (Story 25.4; live-assembled in Story 24.30)
// =============================================================================
// A cross-book round is assembled ON THE CLIENT, on demand, from the per-book
// `quizQuestions` banks (`useQuizRound`). Story 24.30 deleted the pre-built pool
// — the paged `kind:'pool'` R2 blobs, their manifest and the `--build-pools`
// pipeline — so `QuizPoolSchema` / `PoolIndexSchema` / `PoolIndexEntrySchema`
// went with it. What survives is the RENDERED shape: a question carrying its
// source book, which is what `QuizRunner` draws and what the live assembler
// produces.

/**
 * A minimal source-book reference attached to each cross-book question (Story 25.4), so the
 * runner can show WHICH book a question came from. `coverUrl` is optional (a book may lack a
 * cover → the client falls back to a placeholder).
 */
export const QuizBookRefSchema = z.object({
  // Book id — enables tap-to-book-detail from the runner (Story 25.5). Optional because the type
  // is also the shape `QuizRunner` narrows an arbitrary dealt question to; the live assembler
  // always sets it.
  id: z.string().optional(),
  title: z.string(),
  author: z.string(),
  coverUrl: z.string().optional(),
});

export type QuizBookRef = z.infer<typeof QuizBookRefSchema>;

/**
 * A cross-book quiz question = a `QuizQuestionItem` + its source `book`. `book` is optional
 * because the PER-BOOK quiz deals plain `QuizQuestionItem`s through the same `QuizDealer` surface
 * and gets its book from a prop instead — `QuizRunner` narrows to this type and falls back.
 */
export const PooledQuizQuestionSchema = QuizQuestionItemSchema.extend({
  book: QuizBookRefSchema.optional(),
});

export type PooledQuizQuestion = z.infer<typeof PooledQuizQuestionSchema>;

// =============================================================================
// Daily-quote bundle schemas (Story 28.1)
// =============================================================================
// A build-time pipeline step (`tools/content-pipeline`, `--build-quote-bundle`) selects
// ONE short quote per book from each book's `notableQuotes` content, attaches the source
// book's display fields, freezes them in a seeded-shuffle "rotation" order, and writes a
// STATIC asset shipped INSIDE the app, ONE PER LANGUAGE since Story 24.25
// (apps/expo/src/features/quotes/data/daily-quotes.{language}.json).
// The Discover daily card picks `quotes[dayIndex % length]`; the free `/quotes` route pages
// over the same array. No R2, no worker route, no gating — the bundle is local + free for all.

/** Max length of a "short" quote eligible for the daily bundle (chars). Shared by the pipeline
 *  selector, this schema, and the app so the length contract has ONE source of truth. Set so a
 *  quote fits the `/quotes` row WITHOUT truncation at the row's font (Story 28.1 owner feedback:
 *  smaller row text + no truncation → exclude anything that wouldn't fit). Tunable: higher → more
 *  books qualify but risk truncation; lower → punchier but fewer books. */
export const SHORT_QUOTE_MAX_LEN = 120;

/** One bundled quote = a short quote + its source book's display fields.
 *  `bookId` is the STABLE favorite key (exactly one quote per book) — favorites store bookIds,
 *  NOT positional indexes, so a future bundle rebuild that reshuffles order never mismatches a
 *  user's saved favorites. `coverUrl` is required (every `books` row carries one). */
export const DailyQuoteSchema = z.object({
  bookId: z.string().min(1),
  title: z.string().min(1),
  author: z.string().min(1),
  coverUrl: z.string().min(1),
  quote: z.string().min(10).max(SHORT_QUOTE_MAX_LEN),
});

export type DailyQuote = z.infer<typeof DailyQuoteSchema>;

/** The bundled daily-quote asset: a small header (for debugging + cache-bust) + the frozen
 *  rotation-ordered quotes. `version` is a content hash over the canonical pre-shuffle universe. */
export const DailyQuoteBundleSchema = z.object({
  /** ISO timestamp the bundle was generated. */
  generatedAt: z.string().min(1),
  /** Content hash over the pre-shuffle universe — changes when any bundled quote changes. */
  version: z.string().min(1),
  /** The short quotes, one per book, in frozen rotation (seeded-shuffle) order. */
  quotes: z.array(DailyQuoteSchema).min(1),
});

export type DailyQuoteBundle = z.infer<typeof DailyQuoteBundleSchema>;

// Union type for all content schemas
export const ContentSchemas = {
  aboutBook: ParagraphsSchema,
  summaryBrief: ParagraphsSchema,
  summaryCore: SectionsSchema,
  summaryInDepth: SectionsSchema,
  keyTakeaways: KeyTakeawaysSchema,
  notableQuotes: NotableQuotesSchema,
  faq: FAQSchema,
  quizQuestions: QuizQuestionsSchema,
} as const;
