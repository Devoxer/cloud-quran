/**
 * RowSeparator — a themed 1px inter-row hairline (Story 23.4).
 *
 * The shared between-rows separator for the bare `BookCard` `row` lists (Story
 * 23.3 removed their card fill, so they need a hairline to carry the rhythm).
 * Unifies the 5 lists' divergent separation (gap-based or hand-rolled — e.g.
 * OfflineSection's local `ListSeparator`) behind one primitive. Used as a list
 * `ItemSeparatorComponent`, or rendered between mapped rows.
 *
 * `inset` is the left margin so the line aligns under the row's TITLE start.
 * Default `BOOK_ROW_INSET` (66 = cover 52 + gap 14, the locked BookCard-`row`
 * title inset). Lists whose rows self-inset horizontally pass a larger value
 * (e.g. `BOOK_ROW_INSET + SPACING.lg` for History's `paddingHorizontal` rows).
 *
 * @example
 * <FlashList ... ItemSeparatorComponent={() => <RowSeparator />} />
 * <RowSeparator inset={BOOK_ROW_INSET + SPACING.lg} />   // self-insetting rows
 */

import { View } from 'react-native';
import { useThemedStyles } from '@/lib/useThemedStyles';

/** Locked BookCard-`row` title inset: cover width 52 + gap 14 (Story 23.3). */
export const BOOK_ROW_INSET = 66;

export interface RowSeparatorProps {
  /** Left margin so the hairline aligns under the title start. Default 66. */
  inset?: number;
}

export function RowSeparator({ inset = BOOK_ROW_INSET }: RowSeparatorProps) {
  const styles = useStyles();
  return <View style={[styles.separator, { marginLeft: inset }]} />;
}

const useStyles = () =>
  useThemedStyles((t) => ({
    separator: {
      height: 1,
      backgroundColor: t.colors.separator,
    },
  }));
