/**
 * BookmarkRow — one kept verse in the bookmarks list (story 6-4).
 *
 * A FEATURE row rather than `ListRow`, because the Arabic preview is a STYLED second line —
 * Uthmani face, RTL, its own size — and `ListRow`'s `subtitle` is string-only. Composed from the
 * same primitives (`RowDeleteButton`, the spacing/typography tokens) so it still looks like the
 * app's one row language.
 *
 * ⚠️ THE DELETE IS THE OWNED `RowDeleteButton`, NOT SWIPE. The pre-fork row shipped RNGH
 * `Swipeable` + a red Delete; the repo has since standardized every in-row delete on the neutral
 * `×` (story 23.13 — red belongs on confirmations), and these removes are trivially reversible
 * (re-tap the verse's control). The supersession is recorded in story 6-4 and
 * `_reference/README.md` — do not "find" the swipe again.
 *
 * ⚠️ THE PREVIEW IS A DISPLAY of `uthmani_text`: sliced BEFORE render (2:282 is multi-KB and
 * one-line shaping should not pay for it), then `stripDisplayMarks` (the measured KFGQPC U+06DF
 * defect — `constants/arabic.ts`). Direction is set locally (`writingDirection` + `textAlign`),
 * the `VerseRow` precedent — no app-wide RTL. The size is FIXED, not the reader's `fontSize`
 * preference: this is a list row, not the reading surface. No `createdAt` rendered — it sorts,
 * it is not content (pre-fork precedent). No `label` UI — the column exists, nothing sets it.
 *
 * ⚠️ MEMOIZED like `VerseRow`, and for the same reason: the list re-renders on every cache
 * change, and a row whose props did not change must not re-shape a line of Arabic.
 */

import { SURAH_METADATA } from 'quran-data';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { RowDeleteButton } from '@/components/ui';
import { ARABIC_LINE_HEIGHT, stripDisplayMarks, UTHMANI_FONT_FAMILY } from '@/constants/arabic';
import { SPACING } from '@/constants/spacing';
import { FONT_SIZE, FONT_WEIGHT, LINE_HEIGHT } from '@/constants/typography';
import { useThemedStyles } from '@/lib/useThemedStyles';

/** The pre-fork's measured slice: one shaped line's worth of the longest ayat. */
const TEXT_PREVIEW_LENGTH = 80;

/** Fixed preview size — a list row, never the reader's 20–44pt reading preference. */
const PREVIEW_FONT_SIZE = FONT_SIZE.h3;

export interface BookmarkRowProps {
  /** The bookmark's id — what `onDelete` receives, so the callback can stay identity-stable. */
  id: string;
  surah: number;
  verse: number;
  /** `uthmani_text`, or `null` when the preview join could not answer — the row renders anyway. */
  preview: string | null;
  /** Open the reading surface at this verse. Stable identity expected (memo). */
  onPress: (surah: number, verse: number) => void;
  /** Remove this bookmark. Stable identity expected (memo). */
  onDelete: (id: string) => void;
  testID?: string;
}

function BookmarkRowInner({
  id,
  surah,
  verse,
  preview,
  onPress,
  onDelete,
  testID,
}: BookmarkRowProps) {
  const { t } = useTranslation();
  const styles = useThemedStyles((theme) => ({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.lg,
      gap: SPACING.md,
    },
    info: {
      flex: 1,
      gap: SPACING.xs,
    },
    title: {
      color: theme.colors.text.primary,
      fontSize: FONT_SIZE.body,
      fontWeight: FONT_WEIGHT.medium,
      lineHeight: FONT_SIZE.body * LINE_HEIGHT.body,
    },
    preview: {
      color: theme.colors.text.secondary,
      fontFamily: UTHMANI_FONT_FAMILY,
      fontSize: PREVIEW_FONT_SIZE,
      lineHeight: PREVIEW_FONT_SIZE * ARABIC_LINE_HEIGHT,
      textAlign: 'right',
      writingDirection: 'rtl',
    },
  }));

  // The name falls back rather than trusting the cache row — a corrupt surah number still
  // renders, still navigates (read.tsx clamps on its side), and can still be deleted.
  const name =
    SURAH_METADATA[surah - 1]?.nameTransliteration ??
    t('common:bookmarks.surahFallback', { number: surah });
  // Strip FIRST, so marks the strip removes never spend preview budget; then slice. The slice
  // cuts UTF-16 code units, which can sever a final combining mark right at the ellipsis —
  // accepted: it is the last glyph of a one-line truncated preview, and the grapheme-safe
  // alternative (Intl.Segmenter) does not ship in Hermes. The raw text never renders.
  const stripped = preview === null ? null : stripDisplayMarks(preview);
  const previewText =
    stripped === null
      ? null
      : stripped.length > TEXT_PREVIEW_LENGTH
        ? `${stripped.slice(0, TEXT_PREVIEW_LENGTH)}…`
        : stripped;

  return (
    <View style={styles.row} testID={testID}>
      <Pressable
        style={styles.info}
        onPress={() => onPress(surah, verse)}
        accessibilityRole="button"
        accessibilityLabel={t('common:bookmarks.rowA11y', { name, verse })}
        testID={testID ? `${testID}-open` : undefined}
      >
        <Text style={styles.title} numberOfLines={1}>
          {t('common:bookmarks.rowTitle', { name, surah, verse })}
        </Text>
        {previewText === null ? null : (
          <Text
            style={styles.preview}
            numberOfLines={1}
            testID={testID ? `${testID}-preview` : undefined}
          >
            {previewText}
          </Text>
        )}
      </Pressable>
      <RowDeleteButton
        onPress={() => onDelete(id)}
        accessibilityLabel={t('common:bookmarks.deleteA11y', { name, surah, verse })}
        testID={testID ? `${testID}-delete` : undefined}
      />
    </View>
  );
}

export const BookmarkRow = memo(BookmarkRowInner);
