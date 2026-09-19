/**
 * The five content types the study sheet offers, and the pack `type` each one reads (story 8-3).
 *
 * ⚠️ THE ROW IS IDENTICAL AT EVERY SCOPE, AND THIS FILE IS WHY THAT IS STRUCTURAL RATHER THAN A
 * PROMISE. There is one list, it takes no scope argument, and no entry carries a capability flag —
 * so there is nothing for a scope to filter. A `scopes: [...]` field on an entry is the shape that
 * would quietly re-introduce "this type only makes sense per ayah"; the owner's correction
 * (2026-09-16) is that no scope is specialised to one type.
 *
 * ⚠️ FOUR OF THE FIVE HAVE NO PACK ON OFFER TODAY, AND THE SHEET SAYS SO RATHER THAN HIDING THEM.
 * Story 8-2 shipped exactly one French translation; 8-4 and 8-5 bring translations and tafsir, and
 * 8-6 the word-level data behind meanings and i'rab. A type with nothing installed renders the
 * empty-with-download panel, which IS the shipped behaviour on a fresh install — not a gap to
 * paper over, and never a stubbed sample to make the sheet look full.
 *
 * ⚠️ THE PACK STRING IS THE CATALOGUE'S, NOT OURS TO INVENT AT THE CALL SITE.
 * `features/packs/lib/catalogue.ts` types `type` as a free string because a catalogue is a remote
 * document, and this map is the ONE place a study row names the string it reads. The map is
 * deliberately one-directional: the sheet asks "which packs belong to the row I am drawing", never
 * "which row does this pack belong to".
 *
 * ⚠️ AND IT IS AN IDENTITY MAP TODAY, WHICH IS WORTH SAYING PLAINLY (story 8-3 review, S7). It
 * does NOT protect anything on its own — what keeps a pack out of a heading that does not describe
 * it is `useStudySources`' `row.type === packType` filter, which drops every unknown string by
 * construction. What this map buys is a NAME for the coupling: the day a published pack's type
 * string and this app's row disagree — a pipeline that writes `tafsir-ar` for the tafsir row, say
 * — the fix is one line here rather than a string literal hunted through the feature. An earlier
 * version of this docblock also named a `studyTypeOfPack` inverse that does not exist, three
 * paragraphs after arguing that an inverse with no caller must not exist.
 *
 * `lint:layers` rule 2: a feature `lib/` — pure data, no UI, no routes.
 */

/** What the reader wants to read ABOUT the range. Fixed here — a sixth entry is an owner call. */
export type StudyType = 'meanings' | 'tafsir' | 'translation' | 'irab' | 'asbab';

/**
 * Every type, in the order the row draws them — the epic's own order (meanings, tafsir,
 * translation, i'rab, asbab al-nuzul). Declaration order IS on-screen order.
 */
export const STUDY_TYPES = [
  'meanings',
  'tafsir',
  'translation',
  'irab',
  'asbab',
] as const satisfies readonly StudyType[];

/** The pack `type` string each row reads. One direction only — see the header. */
export const PACK_TYPE_OF_STUDY_TYPE: Record<StudyType, string> = {
  meanings: 'meanings',
  tafsir: 'tafsir',
  translation: 'translation',
  irab: 'irab',
  asbab: 'asbab',
};

/** The i18n key for a type's label. Built here so a rename moves one file, not five call sites. */
export function studyTypeLabelKey(type: StudyType): `common:study.types.${StudyType}` {
  return `common:study.types.${type}`;
}
