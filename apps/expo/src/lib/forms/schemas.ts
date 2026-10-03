/**
 * Form validation schemas.
 *
 * App-local zod schemas for the in-app forms — today only the feedback message. They are
 * CLIENT-ONLY, so they do not live in `packages/shared/`, which is reserved for schemas that cross
 * the app/worker boundary. `MIN_MESSAGE_LENGTH` lives here rather than in the feedback screen so
 * the screen imports it downward from `lib/`, never the reverse.
 *
 * (Wisdom Fruits' display-name, collection, note, magic-code and email schemas were removed on
 * 2026-10-03: nothing in Cloud Quran used them.)
 */
import { z } from 'zod';

export const MIN_MESSAGE_LENGTH = 10;

export const feedbackMessageSchema = z
  .string()
  .trim()
  .min(1, 'Please enter a message.')
  .min(MIN_MESSAGE_LENGTH, `Message must be at least ${MIN_MESSAGE_LENGTH} characters.`);

export type FeedbackMessage = z.infer<typeof feedbackMessageSchema>;
