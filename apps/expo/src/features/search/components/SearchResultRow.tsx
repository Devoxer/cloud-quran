/**
 * SearchResultRow — one matching ayah (story 6-7).
 *
 * A FEATURE row rather than `ListRow`, for `BookmarkRow`'s reason and one more of its own: the
 * Arabic line is a STYLED second line (Uthmani face, RTL, its own size) which `ListRow`'s
 * string-only `subtitle` cannot carry, and this row additionally splits that line into per-word
 * spans, which a string cannot express at all.
 *
 * ⚠️ NO `trailing` CONTROL, AND NOT BY OVERSIGHT. `ListRow`'s trailing slot sits inside the row's
 * own `Pressable`, and react-native-web renders both as `<button>` — a nested button is invalid
 * HTML and a React hydration error, measured in Safari 2026-09-11 (story 7-5). A result row has
 * one action: open the ayah. Anything else belongs on the ayah once the reader is there.
 *
 * ⚠️ THE MATCH IS EMPHASISED BY WHOLE WORDS, NEVER BY CHARACTERS — see `matchedWordRange`'s
 * docblock for the Arabic-shaping reason. The emphasis itself is a COLOUR PAIR that is already
 * gated (`text.primary` for the matched words against `text.secondary` for the rest, both held
 * against `background.primary` in `palettes.contrast.test.ts`), never a background or a border:
 * a nested `<Text>` takes no border on iOS at all, and a second fill under Quran text is the
 * thing story 7-8 ruled out for the selection outline.
 *
 * ⚠️ AND THE LINE IS A WINDOW, NOT A HEAD SNIPPET. 2:282 is multi-KB; a match at character 2,000
 * inside it is invisible in a first-80-characters preview, so the reader would be shown a result
 * row whose text does not contain what they typed. {@link windowAround} centres the line on the
 * match and marks each clipped end with an ellipsis.
 *
 * ⚠️ MEMOIZED like `BookmarkRow` and `VerseRow`: the list re-renders on every keystroke, and a
 * row whose props did not change must not re-shape a line of Arabic.
 */

import { SURAH_METADATA } from 'quran-data';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { ARABIC_LINE_HEIGHT, stripDisplayMarks, UTHMANI_FONT_FAMILY } from '@/constants/arabic';
import { SPACING } from '@/constants/spacing';
import { FONT_SIZE, FONT_WEIGHT, LINE_HEIGHT } from '@/constants/typography';
import { useQuranNumerals } from '@/lib/format';
import { TEXT_ALIGN_START } from '@/lib/rtl';
import { surahDisplayName } from '@/lib/surahName';
import { useThemedStyles } from '@/lib/useThemedStyles';
import { type MatchSide, matchedWordRange, type SearchVerse, splitWords } from '../lib/search';

/**
 * How many words of each line the window holds.
 *
 * Arabic is set at `FONT_SIZE.h3` here (a list row, never the reader's 20–44pt reading
 * preference — `BookmarkRow`'s rule) and words are long, so it gets fewer; the English line is
 * smaller and its words are shorter. Both are "about two lines on a phone", which is what a
 * scannable result list wants — the full ayah is one tap away and is the point of the tap.
 */
const WINDOW_WORDS = { arabic: 14, translation: 22 } as const;

/** Fixed row sizes — a list row, never the reader's reading-size preference. */
const ARABIC_FONT_SIZE = FONT_SIZE.h3;

/** What {@link windowAround} hands the row: the slice, where it starts, and which ends it cut. */
interface TextWindow {
  words: string[];
  /** Index of `words[0]` in the original array — the offset the emphasis test needs. */
  offset: number;
  clippedStart: boolean;
  clippedEnd: boolean;
}

/**
 * The slice of `words` to draw: `max` words centred on `range`, or the head of the line when
 * there is no range to centre on (a hit that came from the other orthography — see
 * `matchedWordRange`).
 *
 * Exported for its own test: centring is arithmetic with three edges (line shorter than the
 * window, match at the very start, match at the very end) and every one of them is a silent
 * wrong-slice rather than a crash.
 */
export function windowAround(
  words: string[],
  range: { start: number; end: number } | null,
  max: number
): TextWindow {
  if (words.length <= max) {
    return { words, offset: 0, clippedStart: false, clippedEnd: false };
  }
  if (range === null) {
    return { words: words.slice(0, max), offset: 0, clippedStart: false, clippedEnd: true };
  }
  const span = range.end - range.start;
  // Clamped into the line, so a match near either edge spends its whole budget on the side that
  // still has words rather than running off the end and drawing a short line.
  const start = Math.max(
    0,
    Math.min(words.length - max, range.start - Math.floor((max - span) / 2))
  );
  return {
    words: words.slice(start, start + max),
    offset: start,
    clippedStart: start > 0,
    clippedEnd: start + max < words.length,
  };
}

export interface SearchResultRowProps {
  entry: SearchVerse;
  /** Which half matched — drawn as a word in the meta line, per the story's I/O matrix. */
  side: MatchSide;
  /** What the reader typed, so the row can find its own words to emphasise. */
  query: string;
  /** Open this ayah. Stable identity expected (memo). */
  onPress: (surah: number, verse: number) => void;
  testID?: string;
}

function SearchResultRowInner({ entry, side, query, onPress, testID }: SearchResultRowProps) {
  const { t } = useTranslation();
  // The numeral system is a live device preference, so a surface that DRAWS a structure number
  // subscribes to it rather than reading it once at module scope (`lib/format.ts`).
  const formatQuranNumber = useQuranNumerals();
  const styles = useThemedStyles((theme) => ({
    row: {
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.lg,
      gap: SPACING.xs,
    },
    meta: {
      textAlign: TEXT_ALIGN_START,
      color: theme.colors.text.tertiary,
      fontSize: FONT_SIZE.bodySmall,
      fontWeight: FONT_WEIGHT.medium,
      lineHeight: FONT_SIZE.bodySmall * LINE_HEIGHT.body,
    },
    // The unmatched words. The matched ones step UP to `text.primary` rather than the accent
    // stepping in — one fewer colour, and both pairings are already gated against this surface.
    arabic: {
      color: theme.colors.text.secondary,
      fontFamily: UTHMANI_FONT_FAMILY,
      fontSize: ARABIC_FONT_SIZE,
      lineHeight: ARABIC_FONT_SIZE * ARABIC_LINE_HEIGHT,
      textAlign: 'right',
      writingDirection: 'rtl',
    },
    translation: {
      textAlign: TEXT_ALIGN_START,
      color: theme.colors.text.secondary,
      fontSize: FONT_SIZE.bodySmall,
      lineHeight: FONT_SIZE.bodySmall * LINE_HEIGHT.body,
    },
    hit: {
      color: theme.colors.text.primary,
      fontWeight: FONT_WEIGHT.semibold,
    },
  }));

  // The name falls back rather than trusting the row — the `BookmarkRow` doctrine; a corrupt
  // surah number still renders and still navigates (the reading surfaces clamp on their side).
  const name =
    surahDisplayName(SURAH_METADATA[entry.surah - 1]) ??
    t('common:bookmarks.surahFallback', { number: formatQuranNumber(entry.surah) });

  // Strip FIRST, then split — the measured KFGQPC U+06DF defect (`constants/arabic.ts`), and the
  // same order `BookmarkRow` uses so the two previews never disagree about a verse.
  const arabicWords = splitWords(stripDisplayMarks(entry.textUthmani));
  const arabicRange = matchedWordRange(arabicWords, query);
  const arabicWindow = windowAround(arabicWords, arabicRange, WINDOW_WORDS.arabic);

  // The translation line is drawn only when it is what matched — otherwise the row would carry
  // an English line the reader did not ask about, on every Arabic hit in the book.
  const translationWords =
    side === 'translation' && entry.translation !== null ? splitWords(entry.translation) : [];
  const translationRange =
    translationWords.length === 0 ? null : matchedWordRange(translationWords, query);
  const translationWindow =
    translationWords.length === 0
      ? null
      : windowAround(translationWords, translationRange, WINDOW_WORDS.translation);

  const renderWindow = (win: TextWindow, range: { start: number; end: number } | null) => (
    <>
      {win.clippedStart ? '… ' : ''}
      {win.words.map((word, i) => {
        const at = win.offset + i;
        const matched = range !== null && at >= range.start && at < range.end;
        return (
          // Keyed by POSITION-plus-word, not by the word alone: an ayah repeats words
          // (`الرحمن الرحيم` twice in Al-Fatihah), and a duplicate React key silently drops a
          // word out of the line. The position is what makes each span unique.
          <Text key={`${at}-${word}`} style={matched ? styles.hit : undefined}>
            {word}
            {i === win.words.length - 1 ? '' : ' '}
          </Text>
        );
      })}
      {win.clippedEnd ? ' …' : ''}
    </>
  );

  return (
    <View style={styles.row} testID={testID}>
      <Pressable
        onPress={() => onPress(entry.surah, entry.verse)}
        accessibilityRole="button"
        accessibilityLabel={t('common:search.rowA11y', {
          name,
          verse: formatQuranNumber(entry.verse),
        })}
        testID={testID ? `${testID}-open` : undefined}
      >
        <Text style={styles.meta} numberOfLines={1}>
          {t('common:search.rowMeta', {
            name,
            surah: formatQuranNumber(entry.surah),
            verse: formatQuranNumber(entry.verse),
            side:
              side === 'arabic'
                ? t('common:search.sideArabic')
                : t('common:search.sideTranslation'),
          })}
        </Text>
        {/* ⚠️ The face and the size sit on the PARENT, not only on each word: the ' ' separators
            below are raw children that inherit from here, and without it they would be
            system-font spaces at RN's default size inside a line of Uthmani (the `MushafPage`
            lesson). */}
        <Text
          style={styles.arabic}
          numberOfLines={2}
          testID={testID ? `${testID}-arabic` : undefined}
        >
          {renderWindow(arabicWindow, arabicRange)}
        </Text>
        {translationWindow === null ? null : (
          <Text
            style={styles.translation}
            numberOfLines={2}
            testID={testID ? `${testID}-translation` : undefined}
          >
            {renderWindow(translationWindow, translationRange)}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

export const SearchResultRow = memo(SearchResultRowInner);
