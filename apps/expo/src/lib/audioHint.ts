/**
 * Picking the `audioFiles` row that describes the narration a reader would actually hear
 * (Story 24.35) — the ONE implementation of a rule that had drifted into existing on the
 * download path and nowhere else.
 *
 * `audioFiles` holds one row per `(book, sectionType, language, voiceId)`, so a book published
 * in two languages with two English voices has three rows for the same section. Any reader that
 * takes "the first row for this book+section" is showing a number picked by the server's row
 * order: an English reader can be told the length of the French narration.
 *
 * Callers: the Feed's up-next durations (`app/(tabs)/(feed)/feed.tsx`) and the download path's
 * metadata hints (`features/library/lib/downloadBook.ts` — Story 20.6 AC-9/AC-18, where the chain
 * was first written).
 *
 * `lib/` is the right home: a route and a feature both consume it, and it imports only downward
 * (`@cloudquran/shared`, `@/constants/language`).
 */

import { getDefaultVoiceForLanguage } from '@cloudquran/shared';
import { BASE_LANGUAGE } from '@/constants/language';

/** The axis fields the pick reads. Callers pass their own richer row type through unchanged. */
export interface AudioHintRow {
  /** Absent on legacy rows written before Story 32.2 backfilled the column — those are `en`. */
  language?: string;
  voiceId?: string;
}

/**
 * A row's language, base-defaulted. `||` not `??`: the column is `.optional()` in the schema, so
 * `''` is representable, and an empty string matches no language — a row carrying one would be
 * invisible to every reader rather than treated as the base-language row it is.
 *
 * Exported because the Feed keys its accumulator by this same value; two copies of the rule is
 * how the pick itself came to disagree with the download path in the first place.
 */
export function audioRowLanguage(row: AudioHintRow): string {
  return row.language || BASE_LANGUAGE;
}

/**
 * The candidate row for one book+section, resolved against the reader's language and voice.
 *
 * The chain, in order: rows OF THAT LANGUAGE → the preferred voice → that language's default
 * voice → any row of the language. Crossing languages is never a fallback — a duration from
 * another language's narration is wrong in a way "some voice of the right language" is not, so
 * a language with no row returns `undefined` and the caller renders whatever it renders for an
 * unknown duration.
 *
 * ⚠️ ACCEPTED DIVERGENCE from playback, surfaced by two review layers at 24.35 Step G: online
 * reads have a whole-section fallback to base `en` (`lib/contentRead.ts` § `resolveSectionSources`),
 * so a section with `en` rows but no row in the reader's language shows NO duration here while
 * tapping it plays the English recording. Kept deliberately — the owner's Step-A decision is that
 * crossing languages is never a fallback, and "no number" is a better wrong answer than "a number
 * describing a recording you did not ask for". The state is also near-unreachable: a book only
 * enters a language's pool once `publish-language.ts` finds it COMPLETE in that language, so this
 * needs a section generated after publish, in one language only.
 *
 * `undefined` rows are accepted so a caller with nothing loaded yet for a key needs no guard.
 */
export function pickAudioHintRow<T extends AudioHintRow>(
  rows: readonly T[] | undefined,
  language: string,
  voiceId: string
): T | undefined {
  if (!rows?.length) return undefined;
  const inLanguage = rows.filter((r) => audioRowLanguage(r) === language);
  // Hoisted out of the `find` predicate: `renderRow` runs per visible cell and the Feed
  // re-renders ~10x/sec during playback, and each call re-filters the voice registry.
  const defaultVoice = getDefaultVoiceForLanguage(language);
  return (
    inLanguage.find((r) => r.voiceId === voiceId) ??
    inLanguage.find((r) => r.voiceId === defaultVoice) ??
    inLanguage[0]
  );
}
