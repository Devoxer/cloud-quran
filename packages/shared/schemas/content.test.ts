import { describe, expect, it } from 'vitest';
import {
  DailyQuoteBundleSchema,
  DailyQuoteSchema,
  ParagraphsSchema,
  QuizQuestionsSchema,
  SHORT_QUOTE_MAX_LEN,
} from './content.js';

// Representative boundary-schema coverage for the shared package (Story 17.5):
// proves the Vitest-in-shared setup runs and guards two load-bearing zod shapes
// that cross the worker ↔ scripts ↔ app boundary.

describe('ParagraphsSchema', () => {
  it('accepts 2–5 paragraphs of ≥50 chars', () => {
    const valid = { paragraphs: [`a`.repeat(60), `b`.repeat(60)] };
    expect(ParagraphsSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a single paragraph (min 2)', () => {
    const invalid = { paragraphs: [`a`.repeat(60)] };
    expect(ParagraphsSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects a paragraph below the 50-char floor', () => {
    const invalid = { paragraphs: ['too short', `b`.repeat(60)] };
    expect(ParagraphsSchema.safeParse(invalid).success).toBe(false);
  });
});

describe('QuizQuestionsSchema', () => {
  const q = (i: number) => ({
    question: `Question number ${i} that is sufficiently long?`,
    options: ['Option A', 'Option B', 'Option C', 'Option D'],
    correctAnswer: 0,
  });

  it('accepts 15 well-formed questions (lower bound)', () => {
    const valid = { questions: Array.from({ length: 15 }, (_, i) => q(i)) };
    expect(QuizQuestionsSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects 14 questions (below min 15)', () => {
    const invalid = { questions: Array.from({ length: 14 }, (_, i) => q(i)) };
    expect(QuizQuestionsSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects non-unique options', () => {
    const invalid = {
      questions: Array.from({ length: 15 }, (_, i) => ({
        ...q(i),
        options: ['Same', 'Same', 'Option C', 'Option D'],
      })),
    };
    expect(QuizQuestionsSchema.safeParse(invalid).success).toBe(false);
  });
});

describe('DailyQuoteSchema (Story 28.1)', () => {
  const valid = {
    bookId: 'b1',
    title: 'Atomic Habits',
    author: 'James Clear',
    coverUrl: 'https://cdn/x.jpg',
    quote: 'You fall to the level of your systems.',
  };

  it('accepts a well-formed bundled quote', () => {
    expect(DailyQuoteSchema.safeParse(valid).success).toBe(true);
  });

  it('enforces the short-quote length ceiling', () => {
    expect(SHORT_QUOTE_MAX_LEN).toBe(120);
    expect(
      DailyQuoteSchema.safeParse({ ...valid, quote: 'x'.repeat(SHORT_QUOTE_MAX_LEN + 1) }).success
    ).toBe(false);
    expect(
      DailyQuoteSchema.safeParse({ ...valid, quote: 'x'.repeat(SHORT_QUOTE_MAX_LEN) }).success
    ).toBe(true);
    expect(DailyQuoteSchema.safeParse({ ...valid, quote: 'short' }).success).toBe(false); // < min 10
  });

  it('rejects an empty display field (guards the per-book build skip)', () => {
    for (const field of ['bookId', 'title', 'author', 'coverUrl'] as const) {
      expect(DailyQuoteSchema.safeParse({ ...valid, [field]: '' }).success).toBe(false);
    }
  });
});

describe('DailyQuoteBundleSchema (Story 28.1)', () => {
  const q = {
    bookId: 'b1',
    title: 'T',
    author: 'A',
    coverUrl: 'c',
    quote: 'A sufficiently long quote.',
  };

  it('accepts a header + at least one quote', () => {
    const bundle = { generatedAt: '2026-07-11T00:00:00.000Z', version: 'abc', quotes: [q] };
    expect(DailyQuoteBundleSchema.safeParse(bundle).success).toBe(true);
  });

  it('rejects an empty quotes array and a missing version', () => {
    expect(
      DailyQuoteBundleSchema.safeParse({ generatedAt: 'x', version: 'v', quotes: [] }).success
    ).toBe(false);
    expect(DailyQuoteBundleSchema.safeParse({ generatedAt: 'x', quotes: [q] }).success).toBe(false);
  });
});
