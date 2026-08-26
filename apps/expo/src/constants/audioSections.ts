/**
 * audioSections — shared section ordering for a single book's narration.
 *
 * Story 19.4: extracted from AudioPlayer.tsx so the lock-screen section-nav engine
 * actions (`nextSection`/`previousSection` in useAudioPlayerEngine) and the
 * on-screen player buttons resolve "what's the next/previous section" from the
 * SAME ordered list. A book exposes a subset of these (whichever `audioFiles`
 * exist); navigation filters this order down to the available sections.
 */

import i18n from '@/i18n';

/** Canonical order of section types for prev/next navigation within one book. */
export const SECTION_ORDER: readonly string[] = [
  'aboutBook',
  'summaryBrief',
  'summaryCore',
  'summaryInDepth',
  'keyTakeaways',
  'notableQuotes',
  'faq',
];

/**
 * Display label for a section type (Story 22.10; i18n Story 20.2).
 *
 * The lock-screen now-playing title for a playlist track is "{Book} · {Section}",
 * so the playlist engine needs the section's display name. Labels live in the
 * `player` i18n namespace (`player:sections.*`); this resolves them off the raw
 * section key and falls back to the raw key for any unmapped section. Uses the
 * default `i18n` instance (non-hook module) so it works from the engine / lock
 * screen where hooks aren't available.
 */
export function getSectionLabel(sectionType: string): string {
  return i18n.t(`player:sections.${sectionType}`, { defaultValue: sectionType });
}
