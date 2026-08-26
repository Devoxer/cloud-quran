import { z } from 'zod';
import { SECTION_TYPES } from './section-types.js';

// Request schema for POST /api/generate-content
export const GenerateContentRequestSchema = z.object({
  bookId: z.uuid('bookId must be a valid UUID'),
  contentType: z.enum(SECTION_TYPES),
});

export type GenerateContentRequest = z.infer<typeof GenerateContentRequestSchema>;

// Response schema for successfully generated content
export const GenerateContentResponseSchema = z.object({
  contentType: z.string(),
  content: z.string(),
  generatedAt: z.string(), // ISO 8601 timestamp
});

export type GenerateContentResponse = z.infer<typeof GenerateContentResponseSchema>;
