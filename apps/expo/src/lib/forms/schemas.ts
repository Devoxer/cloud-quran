/**
 * Form validation schemas (Story 17.6)
 *
 * App-local zod schemas for the in-app forms. These values are CLIENT-ONLY
 * (feedback writes straight to InstantDB; names/codes/email are local inputs),
 * so they do NOT live in `packages/shared/` — that package is reserved for
 * schemas that cross the app/worker boundary. The app is on zod 4, so these use
 * the v4 top-level format validators (`z.email()`).
 *
 * Layering note (AC-5): `MIN_MESSAGE_LENGTH` and `MAX_DISPLAY_NAME_LENGTH` were
 * previously file-local in upper layers (the feedback screen / EditProfileModal).
 * They live HERE now so the screen/component import them DOWNWARD from `lib/`,
 * never the reverse (a `lib/ → app/components` upward import is a HIGH finding).
 * `MAX_COLLECTION_NAME_LENGTH` already lives in `constants/` — import it from there.
 */

import { z } from 'zod';
import { MAX_COLLECTION_NAME_LENGTH } from '@/constants/collections';

/** Minimum feedback message length (after trim). */
export const MIN_MESSAGE_LENGTH = 10;

/** Maximum profile display name length (characters). */
export const MAX_DISPLAY_NAME_LENGTH = 50;

/**
 * Feedback message — non-empty, at least {@link MIN_MESSAGE_LENGTH} chars after trim.
 * Two ordered `.min()` checks preserve the screen's distinct empty-vs-too-short
 * messages: `safeParse(...).error.issues[0].message` is the first failing check,
 * so an empty string reports "Please enter a message." and a 1–9 char string
 * reports the min-length message. `.data` is the trimmed value on success.
 */
export const feedbackMessageSchema = z
  .string()
  .trim()
  .min(1, 'Please enter a message.')
  .min(MIN_MESSAGE_LENGTH, `Message must be at least ${MIN_MESSAGE_LENGTH} characters.`);

/** Profile display name — 1..{@link MAX_DISPLAY_NAME_LENGTH} chars after trim. */
export const displayNameSchema = z.string().trim().min(1).max(MAX_DISPLAY_NAME_LENGTH);

/** Collection name — 1..{@link MAX_COLLECTION_NAME_LENGTH} chars after trim. */
export const collectionNameSchema = z.string().trim().min(1).max(MAX_COLLECTION_NAME_LENGTH);

/** Note content — non-empty after trim. */
export const noteContentSchema = z.string().trim().min(1);

/** Magic code — exactly 6 digits. */
export const magicCodeSchema = z.string().regex(/^\d{6}$/, 'Enter the 6-digit code');

/** Email entry on the welcome screen. */
export const emailSchema = z.email();

export type FeedbackMessage = z.infer<typeof feedbackMessageSchema>;
export type DisplayName = z.infer<typeof displayNameSchema>;
export type CollectionName = z.infer<typeof collectionNameSchema>;
